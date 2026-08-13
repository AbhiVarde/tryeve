import { Sandbox } from "@vercel/sandbox";
import { nanoid } from "nanoid";
import { trace } from "@opentelemetry/api";
import { checkRateLimit } from "@vercel/firewall";
import { head, put } from "@vercel/blob";
import { cookies } from "next/headers";
import { canCreateSandbox, trackSandbox } from "@/app/lib/sandbox-quota";
import { markPaused, markResumed } from "@/app/lib/system-status";
import { getMissingConnectionEnvVars } from "@/app/lib/eve-connections";

const tracer = trace.getTracer("tryeve");
export const runtime = "nodejs";
export const maxDuration = 120;

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
  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");

  if (rateLimited) {
    return Response.json(
      { ok: false, error: "too many requests, try again in a minute" },
      { status: 429 },
    );
  }

  const { code, shareId } = await req.json();

  if (!code || typeof code !== "string") {
    return Response.json(
      { ok: false, error: "code is required" },
      { status: 400 },
    );
  }

  if (shareId && typeof shareId === "string") {
    const cookieStore = await cookies();
    const visitorId = cookieStore.get("tryeve_vid")?.value;

    try {
      const agentBlob = await head(`agents/${shareId}.json`, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const agentData: { ownerId?: string } = await (
        await fetch(agentBlob.url, { cache: "no-store" })
      ).json();

      if (agentData.ownerId && agentData.ownerId !== visitorId) {
        return Response.json(
          { ok: false, error: "only the creator can connect this agent" },
          { status: 403 },
        );
      }
    } catch {
      // no agent record found, nothing to check ownership against
    }
  }

  if (shareId && typeof shareId === "string") {
    try {
      const existing = await head(`agents/${shareId}-session.json`, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const session: { sandboxName: string; url: string } = await (
        await fetch(existing.url, { cache: "no-store" })
      ).json();

      const alive = await fetch(session.url, { method: "GET" })
        .then((r) => r.ok)
        .catch(() => false);

      if (alive) {
        return Response.json({
          ok: true,
          sandboxName: session.sandboxName,
          url: session.url,
        });
      }
    } catch {
      // no existing session found, continue to create a new one below
    }
  }

  const cookieStore2 = await cookies();
  const runVisitorId = cookieStore2.get("tryeve_vid")?.value;

  if (!(await canCreateSandbox(runVisitorId))) {
    return Response.json({
      ok: false,
      error:
        "too many active agents right now, stop one before connecting another",
    });
  }

  const files = parseFiles(code);
  const sandboxName = `eve-agent-${nanoid(8)}`;
  const sandboxEnv = getSandboxEnv();

  if (Object.keys(sandboxEnv).length === 0) {
    return Response.json({
      ok: false,
      error:
        "no model credentials found in the environment (AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN, ANTHROPIC_API_KEY, or OPENAI_API_KEY)",
    });
  }

  const missingConnectionEnv = getMissingConnectionEnvVars(files);
  if (missingConnectionEnv.length > 0) {
    return Response.json({
      ok: false,
      needsConnectionCredentials: true,
      missingConnectionEnv,
      error: `this agent connects to a real service and needs ${missingConnectionEnv.join(", ")} configured, deploy it to add credentials and chat with it there`,
    });
  }

  let sandbox: Awaited<ReturnType<typeof Sandbox.create>>;

  try {
    sandbox = await tracer.startActiveSpan("sandbox.create", async (span) => {
      try {
        return await Sandbox.create({
          name: sandboxName,
          runtime: "node24",
          timeout: 600_000,
          ports: [3000],
          env: sandboxEnv,
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
      return Response.json({ ok: false, error: apiMessage });
    }

    return Response.json({
      ok: false,
      error: "couldn't start a sandbox right now, please try again in a moment",
    });
  }

  await markResumed();
  await trackSandbox(runVisitorId, sandboxName);

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
          name: "eve-agent-live",
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
    return Response.json({ ok: false, error: `install failed: ${err}` });
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
      ok: false,
      error: "agent sandbox didn't start in time",
    });
  }

  if (shareId && typeof shareId === "string") {
    try {
      await put(
        `agents/${shareId}-session.json`,
        JSON.stringify({ sandboxName, url }),
        {
          access: "public",
          addRandomSuffix: false,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        },
      );
    } catch {
      // session persistence is best-effort, chat still works without it
    }
  }

  return Response.json({ ok: true, sandboxName, url });
}
