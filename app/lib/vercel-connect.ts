import { cookies } from "next/headers";

const CLIENT_ID = process.env.VERCEL_OAUTH_CLIENT_ID!;
const CLIENT_SECRET = process.env.VERCEL_OAUTH_CLIENT_SECRET!;
const INTEGRATION_SLUG = process.env.VERCEL_INTEGRATION_SLUG!;
const REDIRECT_URI = "https://tryeve.abhivarde.in/api/vercel/oauth/callback";

export async function getVercelToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get("tryeve_vercel_token")?.value;
  const teamId = cookieStore.get("tryeve_vercel_team")?.value ?? null;

  if (!token) {
    return {
      token: null,
      teamId: null,
      needsAuth: true as const,
      authorizeUrl: `https://vercel.com/integrations/${INTEGRATION_SLUG}/new`,
    };
  }

  return { token, teamId, needsAuth: false as const };
}

export async function exchangeVercelCode(code: string) {
  const res = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!res.ok) return null;
  return res.json() as Promise<{
    access_token: string;
    team_id: string | null;
  }>;
}
