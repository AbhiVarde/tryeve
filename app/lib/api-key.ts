import { createHash, timingSafeEqual } from "crypto";
import { head } from "@vercel/blob";

const sha = (v: string) => createHash("sha256").update(v).digest();

export async function getApiKeyVisitor(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key) return null;

  const hash = sha(key).toString("hex");
  const visitor = `key_${hash.slice(0, 16)}`;

  const valid = (process.env.TRYEVE_API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (valid.some((k) => timingSafeEqual(sha(k), sha(key)))) return visitor;

  if (!/^tv_[a-f0-9]{48}$/.test(key)) return null;

  const found = await head(`keys/${hash}.json`, {
    token: process.env.BLOB_READ_WRITE_TOKEN,
  }).catch(() => null);

  return found ? visitor : null;
}
