import { Sandbox } from "@vercel/sandbox";
import { del, head } from "@vercel/blob";
import { untrackSandbox } from "@/app/lib/sandbox-quota";
import { getIdentity } from "@/app/lib/identity";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { sandboxName, shareId } = await req.json();

  if (!sandboxName || typeof sandboxName !== "string") {
    return Response.json(
      { ok: false, error: "sandboxName is required" },
      { status: 400 },
    );
  }

  const authHeader = req.headers.get("authorization");
  const identity = await getIdentity(req);

  if (authHeader && !identity) {
    return Response.json(
      { ok: false, error: "invalid api key" },
      { status: 401 },
    );
  }

  const visitorId = identity?.id;

  if (shareId && typeof shareId === "string") {
    try {
      const agentBlob = await head(`agents/${shareId}.json`, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const agentData: { ownerId?: string } = await (
        await fetch(agentBlob.url, { cache: "no-store" })
      ).json();

      if (agentData.ownerId && agentData.ownerId !== visitorId) {
        return Response.json(
          { ok: false, error: "only the creator can stop this agent" },
          { status: 403 },
        );
      }
    } catch {
      // no agent record found, nothing to check ownership against
    }
  }

  try {
    const sandbox = await Sandbox.get({ name: sandboxName, resume: false });
    await sandbox.stop();
  } catch {
    // sandbox already gone, nothing to stop
  }

  await untrackSandbox(visitorId, sandboxName);

  if (shareId && typeof shareId === "string") {
    try {
      await del(`agents/${shareId}-session.json`, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
    } catch {
      // best-effort cleanup
    }
  }

  return Response.json({ ok: true });
}
