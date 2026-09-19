import { list, put, del, head } from "@vercel/blob";

const MAX_CONCURRENT_SANDBOXES = 3;
const STALE_MS = 3 * 60 * 1000;
const FREE_TIER_CAP_SECONDS = 5 * 60 * 60; // 5 cpu hours/month, hobby plan

function prefix(visitorId: string) {
  return `agents/active/${visitorId}/`;
}

function key(visitorId: string, sandboxName: string) {
  return `${prefix(visitorId)}${sandboxName}.json`;
}

function usageKey(visitorId: string) {
  const month = new Date().toISOString().slice(0, 7); // "2026-09"
  return `agents/usage/${visitorId}/${month}.json`;
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

  try {
    const blob = await head(key(visitorId, sandboxName), {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const data: { createdAt: string } = await (
      await fetch(blob.url, { cache: "no-store" })
    ).json();
    const durationSeconds = Math.max(
      0,
      (Date.now() - new Date(data.createdAt).getTime()) / 1000,
    );
    await recordUsage(visitorId, durationSeconds);
  } catch {
    // no active record found, or usage recording failed, don't block cleanup over it
  }

  await del(key(visitorId, sandboxName), {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  }).catch((err) => console.error("untrackSandbox failed:", err));
}

async function recordUsage(visitorId: string, additionalSeconds: number) {
  try {
    let current = 0;
    try {
      const blob = await head(usageKey(visitorId), {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const data: { seconds: number } = await (
        await fetch(blob.url, { cache: "no-store" })
      ).json();
      current = data.seconds ?? 0;
    } catch {
      // no usage record yet this month, start from 0
    }

    await put(
      usageKey(visitorId),
      JSON.stringify({ seconds: current + additionalSeconds }),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      },
    );
  } catch (err) {
    console.error("recordUsage failed:", err);
  }
}

export async function getMonthlyUsage(visitorId?: string) {
  if (!visitorId) {
    return {
      seconds: 0,
      hours: 0,
      capHours: FREE_TIER_CAP_SECONDS / 3600,
      percentUsed: 0,
    };
  }

  let seconds = 0;
  try {
    const blob = await head(usageKey(visitorId), {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const data: { seconds: number } = await (
      await fetch(blob.url, { cache: "no-store" })
    ).json();
    seconds = data.seconds ?? 0;
  } catch {
    // no usage this month yet
  }

  return {
    seconds,
    hours: seconds / 3600,
    capHours: FREE_TIER_CAP_SECONDS / 3600,
    percentUsed: Math.min(100, (seconds / FREE_TIER_CAP_SECONDS) * 100),
  };
}
