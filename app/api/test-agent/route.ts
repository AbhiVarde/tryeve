import { Sandbox } from "@vercel/sandbox";
import { nanoid } from "nanoid";
import { trace } from "@opentelemetry/api";
import {
  canCreateSandbox,
  trackSandbox,
  untrackSandbox,
} from "@/app/lib/sandbox-quota";
import { markPaused, markResumed } from "@/app/lib/system-status";

const tracer = trace.getTracer("tryeve");
export const runtime = "nodejs";
export const maxDuration = 60;

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

function getMissingConnectionEnvVars(files: FileBlock[]): string[] {
  const missing = new Set<string>();
  for (const f of files) {
    if (!f.filename.startsWith("agent/connections/")) continue;
    const matches = f.content.matchAll(/process\.env\.([A-Z0-9_]+)/g);
    for (const m of matches) {
      if (!process.env[m[1]]) missing.add(m[1]);
    }
  }
  return [...missing];
}

const OPEN_CHANNEL_AUTH = `import { eveChannel } from "eve/channels/eve";
import { none } from "eve/channels/auth";

export default eveChannel({ auth: [none()] });
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

export async function POST(req: Request) {
  const { code, visitorId } = await req.json();

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
      error: `this agent connects to a real service and needs ${missingConnectionEnv.join(", ")} configured before testing can run`,
    });
  }

  const sandboxName = `eve-agent-test-${nanoid(8)}`;
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>>;

  try {
    sandbox = await tracer.startActiveSpan("sandbox.create", async (span) => {
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
        });
      } finally {
        span.end();
      }
    });
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

  try {
    await Promise.all(
      [...getDirectories(files), "agent/channels"].map((dir) =>
        sandbox.fs.mkdir(dir, { recursive: true }),
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
    ]);

    const install = await tracer.startActiveSpan(
      "sandbox.install",
      async (span) => {
        try {
          return await sandbox.runCommand({
            cmd: "npm",
            args: ["install", "--no-audit", "--no-fund"],
          });
        } finally {
          span.end();
        }
      },
    );

    if (install.exitCode !== 0) {
      const err = await install.stderr();
      await sandbox.stop();
      await untrackSandbox(visitorId, sandboxName);
      return Response.json({
        passed: false,
        error: `install failed: ${err.trim().split("\n")[0]}`,
      });
    }

    await sandbox.runCommand({
      cmd: "npx",
      args: ["eve", "dev", "--no-ui", "--port", "3000"],
      detached: true,
    });

    const url = sandbox.domain(3000);
    const ready = await tracer.startActiveSpan("sandbox.boot", async (span) => {
      try {
        return await waitForServer(url, 45_000);
      } finally {
        span.end();
      }
    });

    if (!ready) {
      await sandbox.stop();
      return Response.json({
        passed: false,
        error:
          "agent didn't start in time, check your instructions and tool syntax",
      });
    }

    let res: Response;
    try {
      res = await fetch(`${url}/eve/v1/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hello, are you working?" }),
      });
    } catch {
      await sandbox.stop();
      return Response.json({
        passed: false,
        error: "agent started but didn't respond to a test message",
      });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      await sandbox.stop();
      return Response.json({
        passed: false,
        error: errText || "agent rejected the test message",
      });
    }

    return Response.json({
      passed: true,
      output: `${files.length} file(s) validated, agent responded to a live test message`,
      sandboxName,
      url,
    });
  } catch (err) {
    await sandbox.stop().catch(() => {});
    throw err;
  }
}
