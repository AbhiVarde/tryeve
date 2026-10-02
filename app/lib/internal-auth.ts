import { createHash, timingSafeEqual } from "crypto";

const sha = (v: string) => createHash("sha256").update(v).digest();

export function isInternalRequest(req: Request): boolean {
  const secret = process.env.TRYEVE_INTERNAL_SECRET;
  if (!secret) return false;
  const got = req.headers.get("x-tryeve-internal") ?? "";
  return timingSafeEqual(sha(secret), sha(got));
}
