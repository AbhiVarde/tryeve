import { checkRateLimit } from "@vercel/firewall";
import { cookies } from "next/headers";
import { put, head } from "@vercel/blob";
import { getGithubToken } from "@/app/lib/github-connect";
import {
  parseFiles,
  buildVercelDeployFiles,
  slugify,
} from "@/app/lib/vercel-deploy-files";
import { getVercelToken } from "@/app/lib/vercel-connect";

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

  const vercelAuth = await getVercelToken();

  if (vercelAuth.needsAuth) {
    return Response.json({
      ok: false,
      needsAuth: true,
      authorizeUrl: vercelAuth.authorizeUrl,
    });
  }

  const vercelToken = vercelAuth.token!;
  const vercelTeamId = vercelAuth.teamId;

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

  // same repo name github/deploy already uses, so this always lands in the
  // one repo for this agent instead of a separate copy
  const repoName = slugify(prompt);
  const generatedFiles = parseFiles(code);
  const allFiles = buildVercelDeployFiles(prompt, generatedFiles);

  const userRes = await githubFetch(appAuth.token!, "/user");
  if (!userRes.ok) {
    return Response.json({
      ok: false,
      error: "GitHub rejected the request, try reconnecting",
    });
  }
  const user = await userRes.json();

  const existingRepoRes = await githubFetch(
    appAuth.token!,
    `/repos/${user.login}/${repoName}`,
  );
  let repoUrl: string;

  if (existingRepoRes.status === 404) {
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
    repoUrl = repo.html_url;
  } else if (existingRepoRes.ok) {
    const repo = await existingRepoRes.json();
    repoUrl = repo.html_url;
  } else {
    return Response.json({
      ok: false,
      error: "couldn't check for an existing repository",
    });
  }

  // push (or update) every scaffold file into that same repo, alongside
  // whatever raw agent/ files already live there from a prior github deploy
  const failedFiles: string[] = [];

  for (const file of allFiles) {
    const path = `/repos/${user.login}/${repoName}/contents/${file.filename}`;
    let sha: string | undefined;

    const existingFileRes = await githubFetch(appAuth.token!, path);
    if (existingFileRes.ok) {
      const existing = await existingFileRes.json();
      sha = existing.sha;
    }

    const res = await githubFetch(appAuth.token!, path, {
      method: "PUT",
      body: JSON.stringify({
        message: sha ? `update ${file.filename}` : `add ${file.filename}`,
        content: Buffer.from(file.content).toString("base64"),
        ...(sha ? { sha } : {}),
      }),
    });

    if (!res.ok) failedFiles.push(file.filename);
  }

  if (failedFiles.length > 0) {
    return Response.json({
      ok: false,
      error: `repo updated, but ${failedFiles.length} file(s) failed to push: ${failedFiles.join(", ")}`,
      repoUrl,
    });
  }

  // deploy that exact content directly, no clone, no separate repo, no
  // manual picker on vercel's side
  const deployRes = await fetch(
    `https://api.vercel.com/v13/deployments${vercelTeamId ? `?teamId=${vercelTeamId}` : ""}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: repoName,
        target: "production",
        files: allFiles.map((f) => ({ file: f.filename, data: f.content })),
        projectSettings: { framework: "nextjs" },
      }),
    },
  );

  const deployData = await deployRes.json();

  if (!deployRes.ok) {
    return Response.json({
      ok: false,
      error: deployData?.error?.message ?? "couldn't deploy to vercel",
      repoUrl,
    });
  }

  const liveUrl = `https://${deployData.url}`;

  if (shareId && typeof shareId === "string") {
    try {
      await put(`agents/${shareId}-repo.json`, JSON.stringify({ repoUrl }), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
    } catch (err) {
      console.error("vercel deploy: repo status write failed", err);
    }

    try {
      await put(
        `agents/${shareId}-vercel.json`,
        JSON.stringify({ repoUrl, liveUrl, deploymentId: deployData.id }),
        {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: 0,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        },
      );
    } catch (err) {
      console.error("vercel deploy: status write failed", err);
    }
  }

  return Response.json({ ok: true, repoUrl, liveUrl });
}
