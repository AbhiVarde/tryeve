import { head, put } from "@vercel/blob";

export async function takeDailySlot(visitor: string, limit: number) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const day = new Date().toISOString().slice(0, 10);
  const path = `keys/usage/${visitor}-${day}.json`;

  const existing = await head(path, { token }).catch(() => null);
  let count = 0;

  if (existing) {
    const data = await fetch(`${existing.url}?t=${Date.now()}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .catch(() => null);
    count = typeof data?.count === "number" ? data.count : 0;
  }

  if (count >= limit) return false;

  await put(path, JSON.stringify({ count: count + 1 }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    token,
  }).catch(() => {});

  return true;
}
