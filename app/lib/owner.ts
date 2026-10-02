import { createHash, timingSafeEqual } from "crypto";
import { BlobNotFoundError, head } from "@vercel/blob";

type OwnedRecord = { ownerId?: string; ownerHash?: string };

const sha = (v: string) => createHash("sha256").update(v).digest();

export function hashOwner(visitorId: string): string {
  return sha(`tryeve-owner:${visitorId}`).toString("hex");
}

function same(a: string, b: string): boolean {
  return timingSafeEqual(sha(a), sha(b));
}

export function isOwner(
  record: OwnedRecord,
  visitorId: string | undefined,
): boolean {
  if (record.ownerHash) {
    return !!visitorId && same(record.ownerHash, hashOwner(visitorId));
  }
  if (record.ownerId) {
    return !!visitorId && same(record.ownerId, visitorId);
  }
  return true;
}

export async function checkOwner(
  shareId: string,
  visitorId: string | undefined,
): Promise<"ok" | "forbidden" | "unavailable"> {
  let record: OwnedRecord;

  try {
    const blob = await head(`agents/${shareId}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return "unavailable";
    record = await res.json();
  } catch (err) {
    if (err instanceof BlobNotFoundError) return "ok";
    console.error("checkOwner: couldn't load agent record", err);
    return "unavailable";
  }

  return isOwner(record, visitorId) ? "ok" : "forbidden";
}
