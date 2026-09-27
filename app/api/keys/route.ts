import { checkRateLimit } from "@vercel/firewall";
import { getOrCreateCookieIdentity } from "@/app/lib/identity";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from "@/app/lib/auth/api-key";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");
  if (rateLimited) {
    return Response.json(
      { error: "too many requests, try again in a minute" },
      { status: 429 },
    );
  }

  // only a real web session (existing cookie) can mint a key —
  // this is the one place identity is trusted enough to hand out new credentials
  const identity = await getOrCreateCookieIdentity();

  const body = await req.json().catch(() => ({}));
  const label =
    typeof body?.label === "string" ? body.label.slice(0, 40) : "cli";

  const result = await createApiKey(identity.id, label);

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({
    key: result.rawKey,
    keyId: result.keyId,
    warning: "save this now, it will not be shown again",
  });
}

export async function GET() {
  const identity = await getOrCreateCookieIdentity();
  const keys = await listApiKeys(identity.id);
  return Response.json({ keys });
}

export async function DELETE(req: Request) {
  const identity = await getOrCreateCookieIdentity();
  const { keyId } = await req.json().catch(() => ({}));

  if (!keyId || typeof keyId !== "string") {
    return Response.json({ error: "keyId is required" }, { status: 400 });
  }

  const ok = await revokeApiKey(identity.id, keyId);
  return ok
    ? Response.json({ ok: true })
    : Response.json({ error: "key not found" }, { status: 404 });
}
