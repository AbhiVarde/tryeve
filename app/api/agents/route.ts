import { head, put, del } from "@vercel/blob";
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
