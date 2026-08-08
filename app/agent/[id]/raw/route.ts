import { head } from "@vercel/blob";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const search = new URL(req.url).searchParams;
  const isSession = search.get("session") === "1";
  const isTranscript = search.get("transcript") === "1";
  const isRepo = search.get("repo") === "1";
  const isVercel = search.get("vercel") === "1";
  const key = isRepo
    ? `agents/${id}-repo.json`
    : isVercel
      ? `agents/${id}-vercel.json`
      : isTranscript
        ? `agents/${id}-transcript.json`
        : isSession
          ? `agents/${id}-session.json`
          : `agents/${id}.json`;

  try {
    const blob = await head(key, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(blob.url, { cache: "no-store" });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return isTranscript
      ? Response.json([])
      : Response.json({ error: "not found" }, { status: 404 });
  }
}
