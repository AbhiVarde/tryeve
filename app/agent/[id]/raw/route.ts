import { head } from "@vercel/blob";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const isSession = new URL(req.url).searchParams.get("session") === "1";
  const key = isSession ? `agents/${id}-session.json` : `agents/${id}.json`;

  try {
    const blob = await head(key, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(blob.url, { cache: "no-store" });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }
}
