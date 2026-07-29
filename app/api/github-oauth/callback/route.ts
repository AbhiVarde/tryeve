import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("tryeve_gh_oauth_state")?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return Response.redirect(
      "https://tryeve.abhivarde.in/?ghOauthError=1",
      302,
    );
  }

  cookieStore.delete("tryeve_gh_oauth_state");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: "https://tryeve.abhivarde.in/api/github-oauth/callback",
    }),
  });

  const tokenData = await tokenRes.json().catch(() => null);

  if (!tokenData?.access_token) {
    return Response.redirect(
      "https://tryeve.abhivarde.in/?ghOauthError=1",
      302,
    );
  }

  cookieStore.set("tryeve_gh_token", tokenData.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  return Response.redirect(
    "https://tryeve.abhivarde.in/?ghOauthConnected=1",
    302,
  );
}
