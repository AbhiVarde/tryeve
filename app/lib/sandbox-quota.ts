import { list, put, del } from "@vercel/blob";

const MAX_CONCURRENT_SANDBOXES = 3;
const STALE_MS = 3 * 60 * 1000;

function prefix(visitorId: string) {
  return `agents/active/${visitorId}/`;
}

function key(visitorId: string, sandboxName: string) {
  return `${prefix(visitorId)}${sandboxName}.json`;
}

async function listFresh(visitorId: string) {
  const { blobs } = await list({
    prefix: prefix(visitorId),
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  const cutoff = Date.now() - STALE_MS;
  return blobs.filter((b) => new Date(b.uploadedAt).getTime() > cutoff);
}

export async function canCreateSandbox(visitorId?: string) {
  if (!visitorId) return true;
  try {
    const fresh = await listFresh(visitorId);
    return fresh.length < MAX_CONCURRENT_SANDBOXES;
  } catch (err) {
    // if the quota store itself is down, don't block real users over it
    console.error("canCreateSandbox: quota check failed, failing open", err);
    return true;
  }
}

export async function trackSandbox(
  visitorId: string | undefined,
  sandboxName: string,
) {
  if (!visitorId) return;
  await put(
    key(visitorId, sandboxName),
    JSON.stringify({ createdAt: new Date().toISOString() }),
    {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    },
  ).catch((err) => console.error("trackSandbox failed:", err));
}

export async function untrackSandbox(
  visitorId: string | undefined,
  sandboxName: string,
) {
  if (!visitorId) return;
  await del(key(visitorId, sandboxName), {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  }).catch((err) => console.error("untrackSandbox failed:", err));
}
