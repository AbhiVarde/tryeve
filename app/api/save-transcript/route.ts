import { put } from "@vercel/blob";
import { checkRateLimit } from "@vercel/firewall";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");
  if (rateLimited) {
    return Response.json({ ok: false }, { status: 429 });
  }

  const { shareId, messages } = await req.json();

  if (!shareId || typeof shareId !== "string" || !Array.isArray(messages)) {
    return Response.json(
      { ok: false, error: "shareId and messages are required" },
      { status: 400 },
    );
  }

  const trimmed = messages
    .filter((m) => m && typeof m.text === "string" && m.text.trim())
    .slice(-100)
    .map((m) => ({ id: m.id, role: m.role, text: m.text }));

  try {
    await put(`agents/${shareId}-transcript.json`, JSON.stringify(trimmed), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("save-transcript failed:", err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
