import { checkRateLimit } from "@vercel/firewall";
import { cookies } from "next/headers";
import { put } from "@vercel/blob";
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
  const token = cookieStore.get("tryeve_gh_token")?.value;

  if (!token) {
    return Response.json({
      ok: false,
      needsAuth: true,
      authorizeUrl: "/api/github/oauth/start",
    });
  }

  const { prompt, code, shareId } = await req.json();

  if (!prompt || !code || typeof code !== "string") {
    return Response.json(
      { ok: false, error: "prompt and code are required" },
      { status: 400 },
    );
  }

  const userRes = await githubFetch(token, "/user");

  if (userRes.status === 401) {
    cookieStore.delete("tryeve_gh_token");
    return Response.json({
      ok: false,
      needsAuth: true,
      authorizeUrl: "/api/github/oauth/start",
    });
  }

  if (!userRes.ok) {
    return Response.json({
      ok: false,
      error: "GitHub rejected the request, try reconnecting",
    });
  }
  const user = await userRes.json();

  const generatedFiles = parseFiles(code);
  const repoName = slugify(prompt);

  const createRes = await githubFetch(token, "/user/repos", {
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
      token,
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
