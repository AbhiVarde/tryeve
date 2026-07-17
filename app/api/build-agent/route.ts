import { start } from "workflow/api";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { buildAgentWorkflow } from "@/app/workflows/build-agent";

export async function POST(req: Request) {
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
