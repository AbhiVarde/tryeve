import { list, del } from "@vercel/blob";

export const maxDuration = 30;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const { blobs } = await list({
    prefix: "agents/",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  const staleCutoff = Date.now() - 15 * 60 * 1000;
  const stale = blobs.filter(
    (b) =>
      b.pathname.endsWith("-session.json") &&
      new Date(b.uploadedAt).getTime() < staleCutoff,
  );

  const staleActiveIndexes = blobs.filter(
    (b) =>
      b.pathname.startsWith("agents/active/") &&
      new Date(b.uploadedAt).getTime() < staleCutoff,
  );

  await Promise.all([
    ...stale.map((b) =>
      del(b.url, { token: process.env.BLOB_READ_WRITE_TOKEN }),
    ),
    ...staleActiveIndexes.map((b) =>
      del(b.url, { token: process.env.BLOB_READ_WRITE_TOKEN }),
    ),
  ]);

  return Response.json({
    ok: true,
    removed: stale.length + staleActiveIndexes.length,
  });
}
