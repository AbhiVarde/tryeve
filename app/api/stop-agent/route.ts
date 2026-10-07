import { Sandbox } from "@vercel/sandbox";
import { del, head } from "@vercel/blob";
import { checkOwner } from "@/app/lib/owner";
import { cookies } from "next/headers";
import { isSandboxTracked, untrackSandbox } from "@/app/lib/sandbox-quota";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { sandboxName, shareId } = await req.json();

  if (!sandboxName || typeof sandboxName !== "string") {
    return Response.json(
      { ok: false, error: "sandboxName is required" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const visitorId = cookieStore.get("tryeve_vid")?.value;
  const hasShareId = typeof shareId === "string" && shareId.length > 0;

  let sessionMatches = false;
  if (hasShareId) {
    const session: { sandboxName?: string } | null = await head(
      `agents/${shareId}-session.json`,
      { token: process.env.BLOB_READ_WRITE_TOKEN },
    )
      .then((b) => fetch(b.url, { cache: "no-store" }))
      .then((r) => r.json())
      .catch(() => null);
    sessionMatches = session?.sandboxName === sandboxName;
  }

  let allowed = await isSandboxTracked(visitorId, sandboxName);

  if (!allowed && hasShareId && sessionMatches) {
    const owner = await checkOwner(shareId, visitorId);
    if (owner === "unavailable") {
      return Response.json(
        { ok: false, error: "couldn't verify ownership, try again" },
        { status: 503 },
      );
    }
    allowed = owner === "ok";
  }

  if (!allowed) {
    return Response.json(
      { ok: false, error: "you can only stop agents you started" },
      { status: 403 },
    );
  }

  try {
    const sandbox = await Sandbox.get({ name: sandboxName, resume: false });
    await sandbox.stop();
  } catch {
    // sandbox already gone, nothing to stop
  }

  await untrackSandbox(visitorId, sandboxName);

  if (sessionMatches) {
    await del(`agents/${shareId}-session.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }).catch(() => {});
  }

  return Response.json({ ok: true });
}
