import { Sandbox } from "@vercel/sandbox";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { sandboxName } = await req.json();

  if (!sandboxName || typeof sandboxName !== "string") {
    return Response.json(
      { ok: false, error: "sandboxName is required" },
      { status: 400 },
    );
  }

  try {
    const sandbox = await Sandbox.get({ name: sandboxName, resume: false });
    await sandbox.stop();
  } catch {
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true });
}
