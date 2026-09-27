import { nanoid } from "nanoid";
import { put, head, del } from "@vercel/blob";

const KEY_PREFIX = "tryeve_";
const MAX_KEYS_PER_VISITOR = 5;

async function hashKey(key: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return Buffer.from(digest).toString("hex");
}

type IndexEntry = {
  keyId: string;
  hash: string;
  label: string;
  createdAt: string;
};

async function readIndex(visitorId: string): Promise<IndexEntry[]> {
  try {
    const blob = await head(`auth/visitor-keys/${visitorId}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return await (await fetch(blob.url, { cache: "no-store" })).json();
  } catch {
    return [];
  }
}

async function writeIndex(visitorId: string, index: IndexEntry[]) {
  await put(`auth/visitor-keys/${visitorId}.json`, JSON.stringify(index), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function createApiKey(visitorId: string, label = "cli") {
  const index = await readIndex(visitorId);

  if (index.length >= MAX_KEYS_PER_VISITOR) {
    return {
      error:
        `max ${MAX_KEYS_PER_VISITOR} active keys, revoke one first` as const,
    };
  }

  const rawKey = `${KEY_PREFIX}${nanoid(32)}`;
  const hash = await hashKey(rawKey);
  const keyId = nanoid(12);
  const createdAt = new Date().toISOString();

  await put(
    `auth/keys/${hash}.json`,
    JSON.stringify({ visitorId, keyId, createdAt }),
    {
      access: "public",
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    },
  );

  await writeIndex(visitorId, [...index, { keyId, hash, label, createdAt }]);

  // rawKey returned exactly once — nothing else in the system ever holds it again
  return { rawKey, keyId };
}

export async function validateApiKey(
  rawKey: string,
): Promise<{ visitorId: string } | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) return null;

  try {
    const hash = await hashKey(rawKey);
    const blob = await head(`auth/keys/${hash}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const data: { visitorId: string } = await (
      await fetch(blob.url, { cache: "no-store" })
    ).json();
    return { visitorId: data.visitorId };
  } catch {
    return null;
  }
}

export async function listApiKeys(visitorId: string) {
  const index = await readIndex(visitorId);
  // hash never leaves this module — listing only ever returns safe metadata
  return index.map(({ keyId, label, createdAt }) => ({
    keyId,
    label,
    createdAt,
  }));
}

export async function revokeApiKey(visitorId: string, keyId: string) {
  const index = await readIndex(visitorId);
  const entry = index.find((e) => e.keyId === keyId);

  // a visitor can only revoke a key present in their OWN index —
  // this is what stops visitor A from revoking visitor B's key by guessing an id
  if (!entry) return false;

  await del(`auth/keys/${entry.hash}.json`, {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  }).catch(() => {});
  await writeIndex(
    visitorId,
    index.filter((e) => e.keyId !== keyId),
  );
  return true;
}
