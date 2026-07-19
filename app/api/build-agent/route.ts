import { start } from "workflow/api";
import { put } from "@vercel/blob";
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

  return Response.json({ ...result, id });
}
