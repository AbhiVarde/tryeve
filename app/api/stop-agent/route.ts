import { Sandbox } from "@vercel/sandbox";
import { del, head } from "@vercel/blob";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { sandboxName, shareId } = await req.json();

  if (!sandboxName || typeof sandboxName !== "string") {
    return Response.json(
      { ok: false, error: "sandboxName is required" },
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
