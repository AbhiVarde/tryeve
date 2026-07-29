import { cookies } from "next/headers";
import { nanoid } from "nanoid";

export const runtime = "nodejs";

export async function GET() {
  const state = nanoid(24);
  const cookieStore = await cookies();

  cookieStore.set("tryeve_gh_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_OAUTH_CLIENT_ID!,
    redirect_uri: "https://tryeve.abhivarde.in/api/github/oauth/callback",
    scope: "repo",
    state,
  });

  return Response.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
    302,
  );
}
