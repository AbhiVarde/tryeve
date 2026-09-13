import { Sandbox } from "@vercel/sandbox";
import { nanoid } from "nanoid";
import { trace } from "@opentelemetry/api";
import {
  canCreateSandbox,
  trackSandbox,
  untrackSandbox,
} from "@/app/lib/sandbox-quota";
import { markPaused, markResumed } from "@/app/lib/system-status";
import { getMissingConnectionEnvVars } from "@/app/lib/eve-connections";

const tracer = trace.getTracer("tryeve");
export const runtime = "nodejs";
export const maxDuration = 180;

const DEADLINE_MS = 150_000;
const EVAL_TIMEOUT_MS = 60_000;
const MAX_ERROR_MSG_LEN = 200;

type FileBlock = { filename: string; content: string };

function parseFiles(raw: string): FileBlock[] {
  const regex = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  const blocks: FileBlock[] = [];
  let match;
  let i = 0;

  while ((match = regex.exec(raw)) !== null) {
    i++;
    const body = match[1];
    const firstLine = body.split("\n")[0];
    const filenameMatch = firstLine.match(/(?:\/\/|#)\s*filename:\s*(.+)/i);
    const filename = filenameMatch
      ? filenameMatch[1].trim()
      : i === 1
        ? "agent/instructions.md"
        : `agent/tools/tool-${i}.ts`;
    const content = filenameMatch
      ? body.split("\n").slice(1).join("\n").trim()
      : body.trim();
    blocks.push({ filename, content });
  }

  if (blocks.length > 0) return blocks;

  const markerRegex = /(?:\/\/|#)\s*filename:\s*(.+)/g;
  const markers: { filename: string; index: number }[] = [];
  let m;
  while ((m = markerRegex.exec(raw)) !== null) {
    markers.push({ filename: m[1].trim(), index: m.index });
  }

  for (let j = 0; j < markers.length; j++) {
    const start = raw.indexOf("\n", markers[j].index) + 1;
    const end = j + 1 < markers.length ? markers[j + 1].index : raw.length;
    blocks.push({
      filename: markers[j].filename,
      content: raw.slice(start, end).trim(),
    });
  }

  return blocks;
}

function getDirectories(files: FileBlock[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.filename.split("/");
    parts.pop();
    if (parts.length > 0) dirs.add(parts.join("/"));
  }
  return [...dirs];
}

function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return raw;
  return raw.slice(start, end + 1);
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

const OPEN_CHANNEL_AUTH = `import { eveChannel } from "eve/channels/eve";
import { none } from "eve/channels/auth";

export default eveChannel({ auth: [none()] });
`;

const EVAL_CONFIG = `import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({});
`;

async function waitForServer(url: string, timeoutMs: number) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status < 500) return true;
    } catch {
      // server not accepting connections yet, keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return false;
}

function getSandboxEnv() {
  const env: Record<string, string> = {};

  if (process.env.AI_GATEWAY_API_KEY) {
    env.AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
  }
  if (process.env.VERCEL_OIDC_TOKEN) {
    env.VERCEL_OIDC_TOKEN = process.env.VERCEL_OIDC_TOKEN;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }

  return env;
}

type EvalReport = {
  summary?: { total: number; passed: number; failed: number; skipped: number };
  results?: {
    id: string;
    status: "passed" | "failed" | "skipped";
    assertions?: { message?: string }[];
  }[];
};

export async function POST(req: Request) {
  const startedAt = Date.now();
  const remaining = () => DEADLINE_MS - (Date.now() - startedAt);

  const { code, prompt, visitorId } = await req.json();

  if (!code || typeof code !== "string") {
    return Response.json(
      { passed: false, error: "code is required" },
      { status: 400 },
    );
  }

  const files = parseFiles(code);

  if (files.length === 0) {
    return Response.json({
      passed: false,
      error: "no tool or agent files found to test",
    });
  }

  if (!(await canCreateSandbox(visitorId))) {
    return Response.json({
      passed: false,
      error:
        "too many active agents right now, stop one before generating another",
    });
  }

  const sandboxEnv = getSandboxEnv();

  if (Object.keys(sandboxEnv).length === 0) {
    return Response.json({
      passed: false,
      error:
        "no model credentials found in the environment (AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN, ANTHROPIC_API_KEY, or OPENAI_API_KEY)",
    });
  }

  const missingConnectionEnv = getMissingConnectionEnvVars(files);
  if (missingConnectionEnv.length > 0) {
    return Response.json({
      passed: false,
      skipped: true,
      missingConnectionEnv,
      output: `${files.length} file(s) generated, connects to a real service and needs ${missingConnectionEnv.join(", ")} to test or chat here, deploy to add it`,
    });
  }

  const sandboxName = `eve-agent-test-${nanoid(8)}`;
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>> | null = null;
  let tracked = false;

  async function cleanupOnFailure() {
    if (sandbox) {
      await withTimeout(sandbox.stop(), 10_000, "sandbox stop").catch((err) =>
        console.error("sandbox stop failed:", err),
      );
    }
    if (tracked) {
      await untrackSandbox(visitorId, sandboxName).catch(() => {});
      tracked = false;
    }
  }

  try {
    sandbox = await withTimeout(
      tracer.startActiveSpan("sandbox.create", async (span) => {
        try {
          return await Sandbox.create({
            name: sandboxName,
            runtime: "node24",
            timeout: 600_000,
            ports: [3000],
            env: {
              ...sandboxEnv,
              ...Object.fromEntries(
                getMissingConnectionEnvVars(files)
                  .filter((k) => process.env[k])
                  .map((k) => [k, process.env[k]!]),
              ),
            },
            persistent: false,
            networkPolicy: {
              allow: [
                "registry.npmjs.org",
                ...(sandboxEnv.AI_GATEWAY_API_KEY ||
                sandboxEnv.VERCEL_OIDC_TOKEN
                  ? ["ai-gateway.vercel.sh"]
                  : []),
              ],
            },
          });
        } finally {
          span.end();
        }
      }),
      30_000,
      "sandbox create",
    );
  } catch (err) {
    console.error("sandbox create failed:", err);
    const apiMessage = (err as any)?.json?.error?.message;

    if (apiMessage) {
      await markPaused(apiMessage);
      return Response.json({ passed: false, error: apiMessage });
    }

    return Response.json({
      passed: false,
      error: "couldn't start a sandbox right now, please try again in a moment",
    });
  }

  await markResumed();
  await trackSandbox(visitorId, sandboxName);
  tracked = true;

  try {
    if (remaining() < 20_000) {
      await cleanupOnFailure();
      return Response.json({
        passed: false,
        error: "ran out of time preparing the sandbox, please try again",
      });
    }

    await Promise.all(
      [...getDirectories(files), "agent/channels"].map((dir) =>
        sandbox!.fs.mkdir(dir, { recursive: true }),
      ),
    );

    await sandbox.writeFiles([
      ...files.map((f) => ({
        path: f.filename,
        content: Buffer.from(f.content),
      })),
      {
        path: "package.json",
        content: Buffer.from(
          JSON.stringify({
            name: "eve-agent-test",
            private: true,
            type: "module",
            dependencies: { eve: "latest" },
          }),
        ),
      },
      {
        path: "agent/channels/eve.ts",
        content: Buffer.from(OPEN_CHANNEL_AUTH),
      },
      {
        path: "evals/evals.config.ts",
        content: Buffer.from(EVAL_CONFIG),
      },
    ]);

    let install: Awaited<ReturnType<typeof sandbox.runCommand>>;
    try {
      const installBudget = Math.max(
        Math.min(remaining() - 20_000, 90_000),
        10_000,
      );
      install = await withTimeout(
        tracer.startActiveSpan("sandbox.install", async (span) => {
          try {
            return await sandbox!.runCommand({
              cmd: "npm",
              args: ["install", "--no-audit", "--no-fund"],
            });
          } finally {
            span.end();
          }
        }),
        installBudget,
        "install",
      );
    } catch (err) {
      console.error("install failed or timed out:", err);
      await cleanupOnFailure();
      return Response.json({
        passed: false,
        error: "dependency install took too long, please try again",
      });
    }

    if (install.exitCode !== 0) {
      const errOut = await install.stderr();
      await cleanupOnFailure();
      return Response.json({
        passed: false,
        error: `install failed: ${errOut.trim().split("\n")[0]}`,
      });
    }

    if (remaining() < 15_000) {
      await cleanupOnFailure();
      return Response.json({
        passed: false,
        error: "ran out of time after install, please try again",
      });
    }

    const eveProcess = await sandbox.runCommand({
      cmd: "npx",
      args: ["eve", "dev", "--no-ui", "--port", "3000", "--host", "0.0.0.0"],
      detached: true,
    });

    const url = sandbox.domain(3000);
    const evalUrl = "http://localhost:3000";
    const bootBudget = Math.max(Math.min(remaining() - 15_000, 45_000), 5_000);
    const ready = await tracer.startActiveSpan("sandbox.boot", async (span) => {
      try {
        return await waitForServer(url, bootBudget);
      } finally {
        span.end();
      }
    });

    if (!ready) {
      const bootLog = await eveProcess.output("both").catch(() => "");
      console.error("eve dev never became reachable:", bootLog.slice(-4000));
      await cleanupOnFailure();
      return Response.json({
        passed: false,
        error:
          "agent didn't start in time, check your instructions and tool syntax",
      });
    }

    let evalRun: Awaited<ReturnType<typeof sandbox.runCommand>>;
    try {
      const evalBudget = Math.max(
        Math.min(remaining() - 10_000, EVAL_TIMEOUT_MS),
        5_000,
      );
      evalRun = await withTimeout(
        tracer.startActiveSpan("sandbox.eval", async (span) => {
          try {
            return await sandbox!.runCommand({
              cmd: "npx",
              args: ["eve", "eval", "--url", evalUrl, "--json"],
            });
          } finally {
            span.end();
          }
        }),
        evalBudget,
        "eval run",
      );
    } catch (err) {
      console.error("eval run failed or timed out:", err);
      await cleanupOnFailure();
      return Response.json({
        passed: false,
        error:
          "agent's eval didn't complete in time, check for slow or hanging tool calls",
      });
    }

    const evalStdout = await evalRun.stdout();
    const evalStderr = await evalRun.stderr().catch(() => "");
    let evalReport: EvalReport | null = null;

    try {
      evalReport = JSON.parse(extractJson(evalStdout));
    } catch {
      try {
        evalReport = JSON.parse(extractJson(evalStderr));
      } catch {
        evalReport = null;
      }
    }

    if (!evalReport) {
      console.error("eval output unparseable, exit code:", evalRun.exitCode);
      console.error("stdout:", evalStdout.slice(0, 2000));
      console.error("stderr:", evalStderr.slice(0, 2000));

      await cleanupOnFailure();
      return Response.json({
        passed: false,
        error: "couldn't read the eval results, please try again",
      });
    }

    if (evalRun.exitCode !== 0 || (evalReport.summary?.failed ?? 0) > 0) {
      const failedIds =
        evalReport.results
          ?.filter((r) => r.status === "failed")
          .map((r) => r.id)
          .join(", ") || "unknown";
      const rawAssertion = evalReport.results
        ?.find((r) => r.status === "failed")
        ?.assertions?.find((a) => a.message)?.message;
      const firstAssertion = rawAssertion?.slice(0, MAX_ERROR_MSG_LEN);

      await cleanupOnFailure();
      return Response.json({
        passed: false,
        error: firstAssertion
          ? `eval failed (${failedIds}): ${firstAssertion}`
          : `agent failed its eval (${failedIds}), check your instructions and tool logic`,
      });
    }

    const { total = 0, passed = 0 } = evalReport.summary ?? {};

    return Response.json({
      passed: true,
      output: `${files.length} file(s) validated, ${passed}/${total} eval check(s) passed against a live eve runtime`,
      sandboxName,
      url,
    });
  } catch (err) {
    await cleanupOnFailure();
    throw err;
  }
}
