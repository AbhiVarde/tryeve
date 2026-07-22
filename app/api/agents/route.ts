import { head, put, del } from "@vercel/blob";
import { Sandbox } from "@vercel/sandbox";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const visitorId = cookieStore.get("tryeve_vid")?.value;

  if (!visitorId) return Response.json([]);

  try {
    const blob = await head(`agents/history/${visitorId}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(blob.url, { cache: "no-store" });
    const history = await res.json();
    return Response.json(history);
  } catch (err) {
    console.error("agents history fetch failed:", err);
    return Response.json([]);
  }
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
    try {
      const blob = await head(key, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      }).catch(() => null);

      if (blob) {
        const history: { id: string }[] = await (
          await fetch(blob.url, { cache: "no-store" })
        ).json();
        await Promise.all(history.map((entry) => stopAgentBlobs(entry.id)));
      }

      await del(key, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch {
      // already empty, nothing to clean up
    }
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

    const blob = await head(key, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }).catch(() => null);
    if (!blob) return Response.json({ ok: true });

    const history: { id: string; prompt: string; createdAt: string }[] = await (
      await fetch(blob.url, { cache: "no-store" })
    ).json();

    const filtered = history.filter((entry) => entry.id !== id);

    await put(key, JSON.stringify(filtered), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("delete history entry failed:", err);
    return Response.json(
      { ok: false, error: "couldn't remove that entry" },
      { status: 500 },
    );
  }
}
