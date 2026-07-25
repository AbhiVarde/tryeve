import { head, put } from "@vercel/blob";

const MAX_CONCURRENT_SANDBOXES = 2;
const STALE_MS = 15 * 60 * 1000;

type ActiveEntry = { sandboxName: string; createdAt: string };

function key(visitorId: string) {
  return `agents/active/${visitorId}.json`;
}

async function readActive(visitorId: string): Promise<ActiveEntry[]> {
  try {
    const blob = await head(key(visitorId), {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(blob.url, { cache: "no-store" });
    return await res.json();
  } catch {
    return [];
  }
}

async function writeActive(visitorId: string, entries: ActiveEntry[]) {
  await put(key(visitorId), JSON.stringify(entries), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function canCreateSandbox(visitorId?: string) {
  if (!visitorId) return true;
  const active = await readActive(visitorId);
  const cutoff = Date.now() - STALE_MS;
  const fresh = active.filter((e) => new Date(e.createdAt).getTime() > cutoff);
  return fresh.length < MAX_CONCURRENT_SANDBOXES;
}

export async function trackSandbox(
  visitorId: string | undefined,
  sandboxName: string,
) {
  if (!visitorId) return;
  const active = await readActive(visitorId);
  active.push({ sandboxName, createdAt: new Date().toISOString() });
  await writeActive(visitorId, active).catch(() => {});
}

export async function untrackSandbox(
  visitorId: string | undefined,
  sandboxName: string,
) {
  if (!visitorId) return;
  const active = await readActive(visitorId);
  const filtered = active.filter((e) => e.sandboxName !== sandboxName);
  await writeActive(visitorId, filtered).catch(() => {});
}
