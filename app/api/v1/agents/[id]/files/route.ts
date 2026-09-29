import { requireApiKey, unauthorized } from "@/app/lib/api-auth";
import { readAgent } from "@/app/lib/agent-store";

export const runtime = "nodejs";

export async function GET(
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

  return Response.json({ id, prompt: agent.prompt, code: agent.code });
}
