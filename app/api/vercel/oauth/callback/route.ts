import { cookies } from "next/headers";
import { exchangeVercelCode } from "@/app/lib/vercel-connect";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response(
      `<!DOCTYPE html><html><body style="background:#000;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <p>something went wrong, you can close this window and try again</p>
        <script>window.close();</script>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }

  const data = await exchangeVercelCode(code);

  if (!data?.access_token) {
    return Response.redirect(
      "https://tryeve.abhivarde.in/?vercelOauthError=1",
      302,
    );
  }

  const cookieStore = await cookies();
  cookieStore.set("tryeve_vercel_token", data.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  if (data.team_id) {
    cookieStore.set("tryeve_vercel_team", data.team_id, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }

  return new Response(
    `<!DOCTYPE html><html><body style="background:#000;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
      <p>connected, you can close this window</p>
      <script>window.close();</script>
    </body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}
