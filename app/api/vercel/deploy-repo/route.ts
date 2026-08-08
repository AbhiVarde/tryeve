import { checkRateLimit } from "@vercel/firewall";
import { cookies } from "next/headers";
import { put, head } from "@vercel/blob";
import { getGithubToken } from "@/app/lib/github-connect";
import {
  parseFiles,
  buildVercelDeployFiles,
  slugify,
} from "@/app/lib/vercel-deploy-files";

export const runtime = "nodejs";

async function githubFetch(token: string, path: string, init?: RequestInit) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

function buildVercelDeployLink(repoUrl: string, projectName: string) {
  const url = new URL("https://vercel.com/new/clone");
  url.searchParams.set("repository-url", repoUrl);
  url.searchParams.set("project-name", projectName);
  url.searchParams.set("repository-name", projectName);
  return url.toString();
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

  if (shareId && typeof shareId === "string") {
    try {
      const agentBlob = await head(`agents/${shareId}.json`, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      const agentData: { ownerId?: string } = await (
        await fetch(agentBlob.url, { cache: "no-store" })
      ).json();
      if (agentData.ownerId && agentData.ownerId !== visitorId) {
        return Response.json(
          { ok: false, error: "only the creator can deploy this agent" },
          { status: 403 },
        );
      }
    } catch {
      // no agent record found, nothing to check ownership against
    }
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

  const oauthToken = cookieStore.get("tryeve_gh_token")?.value;
  if (!oauthToken) {
    return Response.json({
      ok: false,
      needsAuth: true,
      authorizeUrl: "https://tryeve.abhivarde.in/api/github/oauth/start",
    });
  }

  const generatedFiles = parseFiles(code);
  const repoName = `${slugify(prompt)}-live`;
  const allFiles = buildVercelDeployFiles(prompt, generatedFiles);

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
      description: `live, working version of: ${prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt}`,
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

  const deployUrl = buildVercelDeployLink(repo.html_url, repoName);

  if (shareId && typeof shareId === "string") {
    try {
      await put(
        `agents/${shareId}-vercel-repo.json`,
        JSON.stringify({ repoUrl: repo.html_url, deployUrl }),
        {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 0,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        },
      );
    } catch (err) {
      console.error("vercel deploy-repo: status write failed", err);
    }
  }

  return Response.json({ ok: true, repoUrl: repo.html_url, deployUrl });
}
