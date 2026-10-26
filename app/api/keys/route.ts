import { createHash, randomBytes } from "crypto";
import { checkRateLimit } from "@vercel/firewall";
import { del, head, put } from "@vercel/blob";

export const runtime = "nodejs";

const MIN_ACCOUNT_AGE_DAYS = 7;
const token = process.env.BLOB_READ_WRITE_TOKEN;

export async function GET() {
  return Response.json({
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? null,
  });
}

export async function POST(req: Request) {
  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");
  if (rateLimited) {
    return Response.json(
      { error: "too many requests, try again in a minute" },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const githubToken =
    typeof body?.githubToken === "string" ? body.githubToken : "";
  if (!githubToken) {
    return Response.json({ error: "missing github token" }, { status: 400 });
  }

  const gh = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "tryeve",
    },
    cache: "no-store",
  }).catch(() => null);

  if (!gh?.ok) {
    return Response.json(
      { error: "couldn't verify your github account" },
      { status: 401 },
    );
  }

  const user = (await gh.json()) as {
    id: number;
    login: string;
    created_at: string;
  };

  const ageDays =
    (Date.now() - new Date(user.created_at).getTime()) / 86_400_000;
  if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
    return Response.json(
      {
        error: `github accounts need to be ${MIN_ACCOUNT_AGE_DAYS} days old to get a key`,
      },
      { status: 403 },
    );
  }

  const accountPath = `keys/github/${user.id}.json`;
  const previous = await head(accountPath, { token }).catch(() => null);

  if (previous) {
    const old = await fetch(`${previous.url}?t=${Date.now()}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .catch(() => null);

    if (typeof old?.hash === "string") {
      const oldKey = await head(`keys/${old.hash}.json`, { token }).catch(
        () => null,
      );
      if (oldKey) await del(oldKey.url, { token }).catch(() => {});
    }
  }

  const key = `tv_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(key).digest("hex");

  await put(
    `keys/${hash}.json`,
    JSON.stringify({ createdAt: new Date().toISOString() }),
    { access: "public", addRandomSuffix: false, token },
  );

  await put(accountPath, JSON.stringify({ hash }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    token,
  });

  return Response.json({ key, login: user.login });
}
