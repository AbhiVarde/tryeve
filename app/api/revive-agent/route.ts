import { Sandbox } from "@vercel/sandbox";
import { head, put } from "@vercel/blob";
import { checkRateLimit } from "@vercel/firewall";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { canCreateSandbox, trackSandbox } from "@/app/lib/sandbox-quota";
import { markPaused, markResumed } from "@/app/lib/system-status";

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
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function getSandboxEnv() {
  const env: Record<string, string> = {};
  if (process.env.AI_GATEWAY_API_KEY)
    env.AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
  if (process.env.VERCEL_OIDC_TOKEN)
    env.VERCEL_OIDC_TOKEN = process.env.VERCEL_OIDC_TOKEN;
  if (process.env.ANTHROPIC_API_KEY)
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (process.env.OPENAI_API_KEY)
    env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  return env;
}

export async function POST(req: Request) {
  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");
  if (rateLimited) {
    return Response.json(
      { ok: false, error: "too many requests, try again in a minute" },
      { status: 429 },
    );
  }

  const { shareId } = await req.json();

  if (!shareId || typeof shareId !== "string") {
    return Response.json(
      { ok: false, error: "shareId is required" },
      { status: 400 },
    );
  }

  let code: string;
  try {
    const agentBlob = await head(`agents/${shareId}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const agentData = await (
      await fetch(agentBlob.url, { cache: "no-store" })
    ).json();
    code = agentData.code;
    if (!code) throw new Error("no code found");
  } catch {
    return Response.json(
      { ok: false, error: "this agent no longer exists" },
      { status: 404 },
    );
  }

  const cookieStore = await cookies();
  const visitorId = cookieStore.get("tryeve_vid")?.value;

  if (!(await canCreateSandbox(visitorId))) {
    return Response.json({
      ok: false,
      error: "too many active agents right now, try again shortly",
    });
  }

  const files = parseFiles(code);
  const sandboxName = `eve-agent-${nanoid(8)}`;
  const sandboxEnv = getSandboxEnv();

  if (Object.keys(sandboxEnv).length === 0) {
    return Response.json({
      ok: false,
      error: "no model credentials configured",
    });
  }

  let sandbox: Awaited<ReturnType<typeof Sandbox.create>>;
  try {
    sandbox = await Sandbox.create({
      name: sandboxName,
      runtime: "node24",
      timeout: 600_000,
      ports: [3000],
      env: sandboxEnv,
      persistent: false,
    });
  } catch (err) {
    console.error("revive-agent: sandbox create failed", err);
    const apiMessage = (err as any)?.json?.error?.message;
    if (apiMessage) {
      await markPaused(apiMessage);
      return Response.json({ ok: false, error: apiMessage });
    }
    return Response.json({
      ok: false,
      error: "couldn't start a sandbox right now, please try again in a moment",
    });
  }

  await markResumed();
  await trackSandbox(visitorId, sandboxName);

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
          name: "eve-agent-live",
          private: true,
          type: "module",
          dependencies: { eve: "latest" },
        }),
      ),
    },
    { path: "agent/channels/eve.ts", content: Buffer.from(OPEN_CHANNEL_AUTH) },
  ]);

  const install = await sandbox.runCommand({
    cmd: "npm",
    args: ["install", "--no-audit", "--no-fund"],
  });
  if (install.exitCode !== 0) {
    await sandbox.stop();
    return Response.json({
      ok: false,
      error: "couldn't restart this agent, try again",
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
    return Response.json({ ok: false, error: "agent didn't start in time" });
  }

  try {
    await put(
      `agents/${shareId}-session.json`,
      JSON.stringify({ sandboxName, url }),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      },
    );
  } catch (err) {
    console.error("revive-agent: session blob write failed", err);
  }

  return Response.json({ ok: true, sandboxName, url });
}
