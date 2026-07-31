import { BlobNotFoundError, head, put, del } from "@vercel/blob";
import { Sandbox } from "@vercel/sandbox";
import { cookies } from "next/headers";

type HistoryEntry = { id: string; prompt: string; createdAt: string };

async function readHistory(key: string): Promise<HistoryEntry[]> {
  try {
    const blob = await head(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
    const res = await fetch(blob.url, { cache: "no-store" });
    return res.ok ? await res.json() : [];
  } catch (err) {
    if (!(err instanceof BlobNotFoundError)) {
      console.error("history read failed:", err);
    }
    return [];
  }
}

async function writeHistory(key: string, history: HistoryEntry[]) {
  await put(key, JSON.stringify(history), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function GET() {
  const cookieStore = await cookies();
  const visitorId = cookieStore.get("tryeve_vid")?.value;
  if (!visitorId) return Response.json([]);

  const history = await readHistory(`agents/history/${visitorId}.json`);
  return Response.json(history);
}

async function stopAgentBlobs(id: string) {
  try {
    const sessionBlob = await head(`agents/${id}-session.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const session: { sandboxName: string } = await (
      await fetch(sessionBlob.url, { cache: "no-store" })
    ).json();
    const sandbox = await Sandbox.get({
      name: session.sandboxName,
      resume: false,
    });
    await sandbox.stop();
  } catch {
    // no live session, or sandbox already gone, nothing to stop
  }

  await Promise.all([
    del(`agents/${id}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }).catch(() => {}),
    del(`agents/${id}-session.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }).catch(() => {}),
  ]);
}

export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const visitorId = cookieStore.get("tryeve_vid")?.value;

  if (!visitorId) {
    return Response.json({ ok: false, error: "no session" }, { status: 401 });
  }

  const { id, all } = await req.json();
  const key = `agents/history/${visitorId}.json`;

  if (all) {
    const history = await readHistory(key);
    await Promise.all(history.map((entry) => stopAgentBlobs(entry.id)));
    await del(key, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(
      () => {},
    );
    return Response.json({ ok: true });
  }

  if (!id || typeof id !== "string") {
    return Response.json(
      { ok: false, error: "id is required" },
      { status: 400 },
    );
  }

  try {
    await stopAgentBlobs(id);
    const history = await readHistory(key);
    const filtered = history.filter((entry) => entry.id !== id);
    await writeHistory(key, filtered);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("delete history entry failed:", err);
    return Response.json(
      { ok: false, error: "couldn't remove that entry" },
      { status: 500 },
    );
  }
}
