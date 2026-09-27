import { cookies } from "next/headers";
import { validateApiKey } from "./auth/api-key";

export type Identity = {
  id: string;
  source: "cookie" | "apikey";
};

export async function getIdentity(req: Request): Promise<Identity | null> {
  const authHeader = req.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const key = authHeader.slice("Bearer ".length).trim();
    const result = await validateApiKey(key);
    if (result) {
      return { id: result.visitorId, source: "apikey" };
    }
    // invalid key present, don't silently fall back to cookie,
    // caller should get a clear 401 instead of a confusing anonymous session
    return null;
  }

  const cookieStore = await cookies();
  const cookieId = cookieStore.get("tryeve_vid")?.value;

  if (cookieId) {
    return { id: cookieId, source: "cookie" };
  }

  return null;
}

// only web routes should create a new anonymous visitor cookie,
// CLI/API callers must authenticate with a real key instead
export async function getOrCreateCookieIdentity(): Promise<Identity> {
  const { nanoid } = await import("nanoid");
  const cookieStore = await cookies();
  let id = cookieStore.get("tryeve_vid")?.value;

  if (!id) {
    id = nanoid(16);
    cookieStore.set("tryeve_vid", id, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return { id, source: "cookie" };
}
