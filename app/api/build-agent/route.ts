import { start } from "workflow/api";
import { put, head } from "@vercel/blob";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@vercel/firewall";
import { cookies } from "next/headers";
import { buildAgentWorkflow } from "@/app/workflows/build-agent";

export async function POST(req: Request) {
  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");

  if (rateLimited) {
    return Response.json(
      { error: "too many requests, try again in a minute" },
      { status: 429 },
    );
  }

  const cookieStore = await cookies();
  let visitorId = cookieStore.get("tryeve_vid")?.value;
  if (!visitorId) {
    visitorId = nanoid(16);
    cookieStore.set("tryeve_vid", visitorId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const { prompt } = await req.json();

  let result;
  try {
    const run = await start(buildAgentWorkflow, [prompt]);
    result = await run.returnValue;
  } catch (err) {
    console.error("build-agent workflow failed:", err);
    return Response.json(
      { error: "couldn't build your agent, please try again" },
      { status: 500 },
    );
  }

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
    const existing = await head(`agents/history/${visitorId}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }).catch(() => null);

    const history: { id: string; prompt: string; createdAt: string }[] =
      existing ? await (await fetch(existing.url)).json() : [];

    history.unshift({ id, prompt, createdAt: new Date().toISOString() });

    await put(
      `agents/history/${visitorId}.json`,
      JSON.stringify(history.slice(0, 200)),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      },
    );
  } catch (err) {
    console.error("history index write failed:", err);
  }

  return Response.json({ ...result, id });
}
