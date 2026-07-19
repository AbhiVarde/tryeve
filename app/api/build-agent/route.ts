import { start } from "workflow/api";
import { put, head } from "@vercel/blob";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@vercel/firewall";
import { buildAgentWorkflow } from "@/app/workflows/build-agent";

export async function POST(req: Request) {
  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");

  if (rateLimited) {
    return Response.json(
      { error: "too many requests, try again in a minute" },
      { status: 429 },
    );
  }

  const { prompt } = await req.json();
  const run = await start(buildAgentWorkflow, [prompt]);
  const result = await run.returnValue;

  const id = nanoid(8);

  await put(
    `agents/${id}.json`,
    JSON.stringify({ prompt, code: result.code }),
    {
      access: "public",
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    },
  );

  try {
    const existing = await head("agents/index.json", {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }).catch(() => null);

    const history: { id: string; prompt: string; createdAt: string }[] =
      existing ? await (await fetch(existing.url)).json() : [];

    history.unshift({ id, prompt, createdAt: new Date().toISOString() });

    await put("agents/index.json", JSON.stringify(history.slice(0, 200)), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (err) {
    console.error("history index write failed:", err);
    // best-effort, generation still succeeds without it
  }

  return Response.json({ ...result, id });
}
