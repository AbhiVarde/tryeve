import { start } from "workflow/api";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@vercel/firewall";
import { buildAgentWorkflow } from "@/app/workflows/build-agent";
import { generationEnabled } from "@/flags";
import { MAX_INPUT_LENGTH, MIN_PROMPT_LENGTH } from "@/lib/constants";
import { requireApiKey, unauthorized } from "@/app/lib/api-auth";
import { readHistory, writeJob } from "@/app/lib/agent-store";

export const runtime = "nodejs";

const MAX_PREVIOUS_CODE_LENGTH = 200_000;

export async function POST(req: Request) {
  const identity = await requireApiKey(req);
  if (!identity) return unauthorized();

  if (!(await generationEnabled())) {
    return Response.json(
      { error: "generation is temporarily disabled, check back shortly" },
      { status: 503 },
    );
  }

  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");
  if (rateLimited) {
    return Response.json(
      { error: "too many requests, try again in a minute" },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const previousCode =
    typeof body?.previousCode === "string" ? body.previousCode : undefined;

  if (prompt.length < MIN_PROMPT_LENGTH || prompt.length > MAX_INPUT_LENGTH) {
    return Response.json({ error: "invalid prompt" }, { status: 400 });
  }

  if (previousCode && previousCode.length > MAX_PREVIOUS_CODE_LENGTH) {
    return Response.json(
      { error: "previousCode is too large" },
      { status: 400 },
    );
  }

  const id = nanoid(8);

  try {
    const run = await start(buildAgentWorkflow, [
      prompt,
      identity.id,
      previousCode,
      id,
    ]);

    await writeJob(id, {
      runId: run.runId,
      visitorId: identity.id,
      prompt,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("v1 build start failed:", err);
    return Response.json(
      { error: "couldn't start your build, please try again" },
      { status: 500 },
    );
  }

  return Response.json({ id, status: "running" }, { status: 202 });
}

export async function GET(req: Request) {
  const identity = await requireApiKey(req);
  if (!identity) return unauthorized();

  return Response.json({ agents: await readHistory(identity.id) });
}
