import { head } from "@vercel/blob";

export async function GET() {
  try {
    const blob = await head("agents/index.json", {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(blob.url);
    const history = await res.json();
    return Response.json(history);
  } catch (err) {
    console.error("agents history fetch failed:", err);
    return Response.json([]);
  }
}
