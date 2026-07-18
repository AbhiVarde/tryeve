import { head } from "@vercel/blob";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const blob = await head(`agents/${id}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(blob.url);
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }
}
