import { Sandbox } from "@vercel/sandbox";
import { nanoid } from "nanoid";
import {
  canCreateSandbox,
  trackSandbox,
  untrackSandbox,
} from "@/app/lib/sandbox-quota";

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

  const sandboxName = `eve-agent-test-${nanoid(8)}`;
  let sandbox: Awaited<ReturnType<typeof Sandbox.create>>;

  try {
    sandbox = await Sandbox.create({
      name: sandboxName,
      runtime: "node24",
      timeout: 600_000,
      ports: [3000],
      env: sandboxEnv,
    });
  } catch (err) {
    console.error("sandbox create failed:", err);
    return Response.json({
      passed: false,
      error: "high demand right now, please try again in a moment",
    });
  }

  await trackSandbox(visitorId, sandboxName);

  try {
    await Promise.all([
      sandbox.fs.mkdir("agent/tools", { recursive: true }),
      sandbox.fs.mkdir("agent/channels", { recursive: true }),
    ]);

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

    const install = await sandbox.runCommand({
      cmd: "npm",
      args: ["install", "--no-audit", "--no-fund"],
    });

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
    const ready = await waitForServer(url, 45_000);

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
