import { createHash, timingSafeEqual } from "crypto";

const sha = (v: string) => createHash("sha256").update(v).digest();

export function getApiKeyVisitor(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key) return null;

  const valid = (process.env.TRYEVE_API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!valid.some((k) => timingSafeEqual(sha(k), sha(key)))) return null;

  return `key_${sha(key).toString("hex").slice(0, 16)}`;
}
