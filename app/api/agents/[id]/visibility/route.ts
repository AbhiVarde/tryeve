import { head, put } from "@vercel/blob";
import { cookies } from "next/headers";
import { checkRateLimit } from "@vercel/firewall";

export const runtime = "nodejs";

type AgentRecord = {
  prompt: string;
  code: string;
  ownerId?: string;
  public?: boolean;
};

type PublicEntry = { id: string; prompt: string; createdAt: string };

async function readAgent(id: string): Promise<AgentRecord | null> {
  try {
    const blob = await head(`agents/${id}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(`${blob.url}?v=${blob.uploadedAt.getTime()}`, {
      cache: "no-store",
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function readPublicIndex(): Promise<PublicEntry[]> {
  try {
    const blob = await head("agents/public/index.json", {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(`${blob.url}?v=${blob.uploadedAt.getTime()}`, {
      cache: "no-store",
    });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

async function writePublicIndex(entries: PublicEntry[]) {
  await put("agents/public/index.json", JSON.stringify(entries), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");
  if (rateLimited) {
    return Response.json(
      { ok: false, error: "too many requests, try again in a minute" },
      { status: 429 },
    );
  }

  const { id } = await params;
  const cookieStore = await cookies();
  const visitorId = cookieStore.get("tryeve_vid")?.value;

  if (!visitorId) {
    return Response.json({ ok: false, error: "no session" }, { status: 401 });
  }

  const { makePublic } = await req.json().catch(() => ({}));

  if (typeof makePublic !== "boolean") {
    return Response.json(
      { ok: false, error: "makePublic must be a boolean" },
      { status: 400 },
    );
  }

  const agent = await readAgent(id);

  if (!agent) {
    return Response.json(
      { ok: false, error: "agent not found" },
      { status: 404 },
    );
  }

  if (agent.ownerId && agent.ownerId !== visitorId) {
    return Response.json(
      { ok: false, error: "only the creator can change visibility" },
      { status: 403 },
    );
  }

  await put(
    `agents/${id}.json`,
    JSON.stringify({ ...agent, public: makePublic }),
    {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    },
  );

  const index = await readPublicIndex();
  const withoutThis = index.filter((e) => e.id !== id);

  if (makePublic) {
    withoutThis.unshift({
      id,
      prompt: agent.prompt,
      createdAt: new Date().toISOString(),
    });
  }

  await writePublicIndex(withoutThis.slice(0, 500));

  return Response.json({ ok: true, public: makePublic });
}
