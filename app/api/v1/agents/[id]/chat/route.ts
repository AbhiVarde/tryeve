import { requireApiKey, unauthorized } from "@/app/lib/api-auth";
import { readAgent } from "@/app/lib/agent-store";
import { head } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await requireApiKey(req);
  if (!identity) return unauthorized();

  const { id } = await params;
  const agent = await readAgent(id);

  if (!agent || agent.ownerId !== identity.id) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const sessionId =
    typeof body?.sessionId === "string" ? body.sessionId : undefined;

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  let sandboxUrl: string;
  try {
    const sessionBlob = await head(`agents/${id}-session.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const session: { url: string } = await (
      await fetch(sessionBlob.url, { cache: "no-store" })
    ).json();
    sandboxUrl = session.url;
  } catch {
    // no live session yet — same recovery path the web app uses,
    // spin one up via run-agent instead of reimplementing sandbox boot here
    const origin = new URL(req.url).origin;
    const runRes = await fetch(`${origin}/api/run-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `tryeve_vid=${identity.id}`,
      },
      body: JSON.stringify({ code: agent.code, shareId: id }),
    });
    const runData = await runRes.json().catch(() => null);
    if (!runData?.ok) {
      return Response.json(
        { error: runData?.error ?? "couldn't start the agent" },
        { status: 502 },
      );
    }
    sandboxUrl = runData.url;
  }

  const internalRes = await fetch(`${new URL(req.url).origin}/api/agent-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sandboxUrl, message, sessionId, shareId: id }),
  });

  if (!internalRes.body) {
    return Response.json({ error: "chat stream unavailable" }, { status: 502 });
  }

  return new Response(internalRes.body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
