import { getIdentity } from "@/app/lib/identity"; // but file is at app\lib\api-auth.ts, one level different

export async function requireApiKey(req: Request) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const identity = await getIdentity(req);
  if (!identity || identity.source !== "apikey") return null;

  return identity;
}

export function unauthorized() {
  return Response.json(
    { error: "missing or invalid api key" },
    { status: 401 },
  );
}
