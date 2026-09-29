import { getRun } from "workflow/api";
import { requireApiKey, unauthorized } from "@/app/lib/api-auth";
import {
  persistBuild,
  readAgent,
  readJob,
  type BuildResult,
} from "@/app/lib/agent-store";

export const runtime = "nodejs";

function toPublic(id: string, r: BuildResult) {
  if (r.needsClarification) {
    return { id, status: "needs_clarification", error: r.error };
  }
  if (r.passed) return { id, status: "passed" };
  if (r.skipped) {
    return {
      id,
      status: "skipped",
      missingConnectionEnv: r.missingConnectionEnv,
      error: r.error,
    };
  }
  return { id, status: "failed", error: r.error };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await requireApiKey(req);
  if (!identity) return unauthorized();

  const { id } = await params;
  const notFound = () => Response.json({ error: "not found" }, { status: 404 });

  const job = await readJob(id);

  // agents built on the web have no job record, fall back to the agent record
  if (!job) {
    const agent = await readAgent(id);
    if (agent?.ownerId === identity.id) {
      return Response.json({ id, status: "ready" });
    }
    return notFound();
  }

  if (job.visitorId !== identity.id) return notFound();

  let status: string;
  let result: BuildResult | null = null;

  try {
    const run = getRun(job.runId);
    status = await run.status;
    if (status === "completed") {
      result = (await run.returnValue) as BuildResult;
    }
  } catch (err) {
    console.error("v1 status: run lookup failed", err);
    const agent = await readAgent(id);
    if (agent?.ownerId === identity.id) {
      return Response.json({ id, status: "ready" });
    }
    return Response.json(
      { error: "couldn't read build status, try again" },
      { status: 502 },
    );
  }

  if (status === "completed" && result) {
    try {
      await persistBuild({ id, job, result });
    } catch (err) {
      // keep the client polling, the next poll retries the save
      console.error("v1 status: persist failed", err);
      return Response.json({ id, status: "running" });
    }
    return Response.json(toPublic(id, result));
  }

  if (status === "failed" || status === "cancelled") {
    return Response.json({
      id,
      status: "failed",
      error: "the build did not finish, please try again",
    });
  }

  return Response.json({ id, status: "running" });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await requireApiKey(req);
  if (!identity) return unauthorized();

  const { id } = await params;
  const agent = await readAgent(id);

  if (!agent || agent.ownerId !== identity.id) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  try {
    const internalRes = await fetch(`${new URL(req.url).origin}/api/agents`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        cookie: `tryeve_vid=${identity.id}`,
      },
      body: JSON.stringify({ id }),
    });

    if (!internalRes.ok) {
      return Response.json(
        { error: "couldn't delete this agent" },
        { status: 500 },
      );
    }
  } catch (err) {
    console.error("v1 delete: internal call failed", err);
    return Response.json(
      { error: "couldn't delete this agent" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
