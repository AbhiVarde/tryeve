import { head } from "@vercel/blob";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const visitorId = cookieStore.get("tryeve_vid")?.value;

  if (!visitorId) return Response.json([]);

  try {
    const blob = await head(`agents/history/${visitorId}.json`, {
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
