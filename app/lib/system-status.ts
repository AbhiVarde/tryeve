import { head, put } from "@vercel/blob";

const KEY = "system/status.json";

type Status = { paused: boolean; reason?: string; since?: string };

export async function readStatus(): Promise<Status> {
  try {
    const blob = await head(KEY, { token: process.env.BLOB_READ_WRITE_TOKEN });
    const res = await fetch(blob.url, { cache: "no-store" });
    return await res.json();
  } catch {
    return { paused: false };
  }
}

export async function markPaused(reason: string) {
  try {
    await put(
      KEY,
      JSON.stringify({ paused: true, reason, since: new Date().toISOString() }),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      },
    );
  } catch {
    // best effort, a missed status write isn't worth failing the request over
  }
}

export async function markResumed() {
  try {
    await put(KEY, JSON.stringify({ paused: false }), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch {
    // best effort
  }
}
