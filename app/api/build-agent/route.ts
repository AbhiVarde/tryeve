import { start } from "workflow/api";
import { put, head } from "@vercel/blob";
import { trace } from "@opentelemetry/api";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@vercel/firewall";
import { cookies } from "next/headers";
import { buildAgentWorkflow } from "@/app/workflows/build-agent";
import { checkBotId } from "botid/server";
import { generationEnabled } from "@/flags";

const tracer = trace.getTracer("tryeve");

export async function POST(req: Request) {
  const botCheck = await checkBotId();
  if (botCheck.isBot) {
    return Response.json({ error: "request blocked" }, { status: 403 });
  }

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

  const { prompt, previousCode } = await req.json();

  let result;
  try {
    result = await tracer.startActiveSpan(
      "build-agent.workflow",
      async (span) => {
        try {
          const run = await start(buildAgentWorkflow, [
            prompt,
            visitorId,
            previousCode,
          ]);
          const value = await run.returnValue;
          span.setAttribute("agent.passed", !!value.passed);
          return value;
        } finally {
          span.end();
        }
      },
    );
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
    JSON.stringify({ prompt, code: result.code, ownerId: visitorId }),
    {
      access: "public",
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    },
  );

  if (result.passed && result.sandboxName && result.url) {
    try {
      await put(
        `agents/${id}-session.json`,
        JSON.stringify({ sandboxName: result.sandboxName, url: result.url }),
        {
          access: "public",
          addRandomSuffix: false,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        },
      );
    } catch (err) {
      console.error("session blob write failed:", err);
    }
  }

  try {
    const existing = await head(`agents/history/${visitorId}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }).catch(() => null);

    const history: { id: string; prompt: string; createdAt: string }[] =
      existing
        ? await (await fetch(existing.url, { cache: "no-store" })).json()
        : [];

    history.unshift({ id, prompt, createdAt: new Date().toISOString() });

    await put(
      `agents/history/${visitorId}.json`,
      JSON.stringify(history.slice(0, 200)),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      },
    );
  } catch (err) {
    console.error("history index write failed:", err);
  }

  return Response.json({ ...result, id });
}
