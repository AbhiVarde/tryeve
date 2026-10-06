import { start } from "workflow/api";
import { put, head } from "@vercel/blob";
import { trace } from "@opentelemetry/api";
import { nanoid } from "nanoid";
import { checkRateLimit } from "@vercel/firewall";
import { cookies } from "next/headers";
import { buildAgentWorkflow } from "@/app/workflows/build-agent";
import { checkBotId } from "botid/server";
import { generationEnabled } from "@/flags";
import { MAX_INPUT_LENGTH, MIN_PROMPT_LENGTH } from "@/lib/constants";
import { getApiKeyVisitor } from "@/app/lib/api-key";
import { hashOwner } from "@/app/lib/owner";
import { toBuildEvent } from "@/lib/build-events";

const tracer = trace.getTracer("tryeve");
export const maxDuration = 300;

const STREAM_DRAIN_MS = 1500;
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function POST(req: Request) {
  const keyVisitor = getApiKeyVisitor(req);
  if (req.headers.get("authorization") && !keyVisitor) {
    return Response.json({ error: "invalid api key" }, { status: 401 });
  }

  if (!keyVisitor) {
    const botCheck = await checkBotId();
    if (botCheck.isBot) {
      return Response.json({ error: "request blocked" }, { status: 403 });
    }
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

  let visitorId: string | undefined = keyVisitor ?? undefined;
  if (!visitorId) {
    const cookieStore = await cookies();
    visitorId = cookieStore.get("tryeve_vid")?.value;
    if (!visitorId) {
      visitorId = nanoid(16);
      cookieStore.set("tryeve_vid", visitorId, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const previousCode =
    typeof body?.previousCode === "string" ? body.previousCode : undefined;

  if (prompt.length < MIN_PROMPT_LENGTH || prompt.length > MAX_INPUT_LENGTH) {
    return Response.json({ error: "invalid prompt" }, { status: 400 });
  }

  const id = nanoid(8);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let clientGone = false;

      const write = (payload: unknown) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          clientGone = true;
        }
      };

      try {
        const result = await tracer.startActiveSpan(
          "build-agent.workflow",
          async (span) => {
            try {
              const run = await start(buildAgentWorkflow, [
                prompt,
                visitorId,
                previousCode,
                id,
              ]);

              const reader = run.readable.getReader();
              const pump = (async () => {
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) return;
                    const event = toBuildEvent(value);
                    if (event) write(event);
                  }
                } catch (err) {
                  console.error("build-agent stream read failed:", err);
                }
              })();

              const value = await (async () => {
                try {
                  return await run.returnValue;
                } finally {
                  await Promise.race([pump, sleep(STREAM_DRAIN_MS)]);
                  reader.cancel().catch(() => undefined);
                }
              })();

              span.setAttribute("agent.passed", !!value.passed);
              return value;
            } finally {
              span.end();
            }
          },
        );

        if (!result.code || (!result.passed && !result.skipped)) {
          write({ type: "result", result });
          return;
        }

        await put(
          `agents/${id}.json`,
          JSON.stringify({
            prompt,
            code: result.code,
            ownerHash: hashOwner(visitorId!),
            public: false,
          }),
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
              JSON.stringify({
                sandboxName: result.sandboxName,
                url: result.url,
              }),
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

        write({ type: "result", result: { ...result, id } });
      } catch (err) {
        console.error("build-agent workflow failed:", err);
        write({
          type: "result",
          result: { error: "couldn't build your agent, please try again" },
        });
      } finally {
        try {
          controller.close();
        } catch {
          clientGone = true;
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
