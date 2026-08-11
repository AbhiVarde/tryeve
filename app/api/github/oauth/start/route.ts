import { cookies } from "next/headers";
import { nanoid } from "nanoid";

export const runtime = "nodejs";

export async function GET() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;

  if (!clientId) {
    return new Response(
      `<!DOCTYPE html><html><body style="background:#000;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <p>oauth not configured for this environment, close this window and try on the live site</p>
      </body></html>`,
      { status: 500, headers: { "Content-Type": "text/html" } },
    );
  }

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
    client_id: clientId,
    redirect_uri: "https://tryeve.abhivarde.in/api/github/oauth/callback",
    scope: "repo",
    state,
  });

  return Response.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
    302,
  );
}
