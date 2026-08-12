import { checkRateLimit } from "@vercel/firewall";
import { cookies } from "next/headers";
import { put } from "@vercel/blob";
import { getGithubToken, getGithubUserToken } from "@/app/lib/github-connect";
import {
  parseFiles,
  slugify,
  buildVercelDeployFiles,
} from "@/app/lib/vercel-deploy-files";

export const runtime = "nodejs";

async function githubFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  return res;
}

export async function POST(req: Request) {
  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");
  if (rateLimited) {
    return Response.json(
      { ok: false, error: "too many requests, try again in a minute" },
      { status: 429 },
    );
  }

  const cookieStore = await cookies();
  const visitorId = cookieStore.get("tryeve_vid")?.value;

  if (!visitorId) {
    return Response.json(
      { ok: false, error: "no session found, reload and try again" },
      { status: 401 },
    );
  }

  const { prompt, code, shareId } = await req.json();

  if (!prompt || !code || typeof code !== "string") {
    return Response.json(
      { ok: false, error: "prompt and code are required" },
      { status: 400 },
    );
  }

  let appAuth;
  try {
    appAuth = await getGithubToken(visitorId);
  } catch (err) {
    console.error("github app token request failed:", err);
    return Response.json({
      ok: false,
      error: "couldn't reach GitHub right now, try again in a moment",
    });
  }

  if (appAuth.needsAuth) {
    return Response.json({
      ok: false,
      needsAuth: true,
      authorizeUrl: appAuth.authorizeUrl,
    });
  }

  let userAuth;
  try {
    userAuth = await getGithubUserToken(visitorId);
  } catch (err) {
    console.error("github user token request failed:", err);
    return Response.json({
      ok: false,
      error: "couldn't reach GitHub right now, try again in a moment",
    });
  }

  if (userAuth.needsAuth) {
    return Response.json({
      ok: false,
      needsAuth: true,
      authorizeUrl: userAuth.authorizeUrl,
    });
  }

  const oauthToken = userAuth.token!;

  const generatedFiles = parseFiles(code);
  const repoName = slugify(prompt);

  const userRes = await githubFetch(appAuth.token!, "/user");
  if (!userRes.ok) {
    return Response.json({
      ok: false,
      error: "GitHub rejected the request, try reconnecting",
    });
  }
  const user = await userRes.json();

  const createRes = await githubFetch(oauthToken, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: repoName,
      description: prompt.length > 100 ? `${prompt.slice(0, 97)}...` : prompt,
      private: false,
      auto_init: false,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => null);
    return Response.json({
      ok: false,
      error: err?.message ?? "couldn't create the repository",
    });
  }

  const repo = await createRes.json();

  // pushes the full next.js scaffold + ui, not just the raw agent/ files,
  // so github and vercel always deploy the exact same thing
  const allFiles = buildVercelDeployFiles(prompt, generatedFiles);

  const failedFiles: string[] = [];

  for (const file of allFiles) {
    const res = await githubFetch(
      appAuth.token!,
      `/repos/${user.login}/${repoName}/contents/${file.filename}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `add ${file.filename}`,
          content: Buffer.from(file.content).toString("base64"),
        }),
      },
    );

    if (!res.ok) failedFiles.push(file.filename);
  }

  if (failedFiles.length > 0) {
    return Response.json({
      ok: false,
      error: `repo created, but ${failedFiles.length} file(s) failed to upload: ${failedFiles.join(", ")}`,
      repoUrl: repo.html_url,
    });
  }

  try {
    await put(
      `agents/${shareId}-repo.json`,
      JSON.stringify({ repoUrl: repo.html_url }),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      },
    );
  } catch (err) {
    console.error("deploy: repo status write failed", err);
  }

  return Response.json({ ok: true, repoUrl: repo.html_url });
}
