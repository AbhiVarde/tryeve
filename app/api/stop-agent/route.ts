import { Sandbox } from "@vercel/sandbox";
import { del } from "@vercel/blob";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { sandboxName, shareId } = await req.json();

  if (!sandboxName || typeof sandboxName !== "string") {
    return Response.json(
      { ok: false, error: "sandboxName is required" },
      { status: 400 },
    );
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
