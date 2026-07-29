import { checkRateLimit } from "@vercel/firewall";
import { cookies } from "next/headers";
import { getGithubToken, getGithubOAuthToken } from "@/app/lib/github-connect";

export const runtime = "nodejs";

type FileBlock = { filename: string; content: string };

function parseFiles(raw: string): FileBlock[] {
  const regex = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  const blocks: FileBlock[] = [];
  let match;
  let i = 0;

  while ((match = regex.exec(raw)) !== null) {
    i++;
    const body = match[1];
    const firstLine = body.split("\n")[0];
    const filenameMatch = firstLine.match(/(?:\/\/|#)\s*filename:\s*(.+)/i);
    const filename = filenameMatch
      ? filenameMatch[1].trim()
      : i === 1
        ? "agent/instructions.md"
        : `agent/tools/tool-${i}.ts`;
    const content = filenameMatch
      ? body.split("\n").slice(1).join("\n").trim()
      : body.trim();
    blocks.push({ filename, content });
  }

  return blocks;
}

function slugify(prompt: string) {
  const base = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `eve-agent-${base || "generated"}`;
}

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

  const { prompt, code } = await req.json();

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

  let oauthAuth;
  try {
    oauthAuth = await getGithubOAuthToken(visitorId);
  } catch (err) {
    console.error("github oauth token request failed:", err);
    return Response.json({
      ok: false,
      error: "couldn't reach GitHub right now, try again in a moment",
    });
  }

  if (oauthAuth.needsAuth) {
    return Response.json({
      ok: false,
      needsAuth: true,
      authorizeUrl: oauthAuth.authorizeUrl,
    });
  }

  const files = parseFiles(code);
  const repoName = slugify(prompt);

  const userRes = await githubFetch(appAuth.token!, "/user");
  if (!userRes.ok) {
    return Response.json({
      ok: false,
      error: "GitHub rejected the request, try reconnecting",
    });
  }
  const user = await userRes.json();

  const createRes = await githubFetch(oauthAuth.token!, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: repoName,
      description: `an eve agent built with tryeve: ${prompt}`,
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

  const allFiles: FileBlock[] = [
    ...files,
    {
      filename: "package.json",
      content: JSON.stringify(
        {
          name: repoName,
          private: true,
          type: "module",
          scripts: { dev: "eve dev" },
          dependencies: { eve: "latest" },
        },
        null,
        2,
      ),
    },
    {
      filename: "README.md",
      content: `# ${repoName}\n\nbuilt with tryeve.\n\n## run it\n\nnpm install\nnpm run dev\n`,
    },
  ];

  const pushResults = await Promise.all(
    allFiles.map((file) =>
      githubFetch(
        appAuth.token!,
        `/repos/${user.login}/${repoName}/contents/${file.filename}`,
        {
          method: "PUT",
          body: JSON.stringify({
            message: `add ${file.filename}`,
            content: Buffer.from(file.content).toString("base64"),
          }),
        },
      ),
    ),
  );

  const failed = pushResults.some((r) => !r.ok);
  if (failed) {
    return Response.json({
      ok: false,
      error: "repository created, but some files failed to upload",
      repoUrl: repo.html_url,
    });
  }

  return Response.json({ ok: true, repoUrl: repo.html_url });
}
