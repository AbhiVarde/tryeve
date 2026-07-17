import { start } from "workflow/api";
import { buildAgentWorkflow } from "@/app/workflows/build-agent";

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const run = await start(buildAgentWorkflow, [prompt]);
  const result = await run.returnValue;
  return Response.json(result);
}
