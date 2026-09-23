import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { checkRateLimit } from "@vercel/firewall";
import { trace } from "@opentelemetry/api";
import { MAX_INPUT_LENGTH } from "@/lib/constants";

const tracer = trace.getTracer("tryeve");
export const runtime = "nodejs";
export const maxDuration = 120;

type StreamEvent = { type?: string; data?: any };

const DASH_RE = /[\u2014\u2013]/g;

function clean(text: string) {
  return text.replace(DASH_RE, ", ").replace(/[ \t]{2,}/g, " ");
}

function isSafeAgentUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    return !(
      h === "localhost" ||
      h === "[::1]" ||
      h.endsWith(".local") ||
      h.endsWith(".internal") ||
      /^(0|10|127)\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^169\.254\./.test(h)
    );
  } catch {
    return false;
  }
}

function getBaseUrl() {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function isDeadSandboxResponse(res: Response | null) {
  if (!res) return true;
  return res.status === 404 || res.status === 410 || res.status >= 500;
}

async function reviveSandbox(shareId: string, req: Request) {
  try {
    const res = await fetch(`${getBaseUrl()}/api/revive-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ shareId }),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) return null;
    return {
      url: data.url as string,
      sandboxName: data.sandboxName as string,
    };
  } catch (err) {
    console.error("agent-chat: revive failed", err);
    return null;
  }
}

export async function POST(req: Request) {
  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");

  if (rateLimited) {
    return Response.json(
      { error: "too many messages, slow down a moment" },
      { status: 429 },
    );
  }

  const { url, message, sessionId, continuationToken, turnCount, shareId } =
    await req.json();

  if (
    typeof url !== "string" ||
    typeof message !== "string" ||
    !message.trim() ||
    message.length > MAX_INPUT_LENGTH
  ) {
    return Response.json(
      { error: "a valid url and message are required" },
      { status: 400 },
    );
  }

  if (!isSafeAgentUrl(url)) {
    return Response.json({ error: "invalid agent url" }, { status: 400 });
  }

  let agentUrl = url;
  let target = sessionId
    ? `${agentUrl}/eve/v1/session/${sessionId}`
    : `${agentUrl}/eve/v1/session`;

  const body = { message };

  async function trySend(t: string) {
    try {
      return await fetch(t, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return null;
    }
  }

  let res = await trySend(target);
  let revived: { url: string; sandboxName: string } | null = null;

  if (isDeadSandboxResponse(res) && typeof shareId === "string" && shareId) {
    revived = await reviveSandbox(shareId, req);

    if (revived) {
      agentUrl = revived.url;
      target = `${agentUrl}/eve/v1/session`; // fresh sandbox, fresh session
      res = await trySend(target);
    }
  }

  if (!res) {
    return Response.json(
      { error: "couldn't reach the agent sandbox" },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return Response.json(
      { error: errText || "the agent session is unavailable" },
      { status: res.status || 502 },
    );
  }

  const data = await res.json().catch(() => null);
  const newSessionId =
    res.headers.get("x-eve-session-id") ?? (revived ? null : sessionId);
  const newContinuationToken = data?.continuationToken ?? continuationToken;

  if (!newSessionId) {
    return Response.json(
      { error: "missing session id from agent" },
      { status: 502 },
    );
  }

  const skipTurns = revived ? 0 : typeof turnCount === "number" ? turnCount : 0;

  let streamRes: Response;
  try {
    streamRes = await fetch(
      `${agentUrl}/eve/v1/session/${newSessionId}/stream`,
    );
  } catch {
    return Response.json(
      { error: "couldn't stream the agent session" },
      { status: 502 },
    );
  }

  if (!streamRes.ok || !streamRes.body) {
    return Response.json(
      { error: "the agent stream is unavailable" },
      { status: 502 },
    );
  }

  const uiStream = createUIMessageStream({
    execute: async ({ writer }) => {
      const span = tracer.startSpan("agent-chat.stream");
      const reader = streamRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completedTurns = 0;
      let textId: string | null = null;
      let lastLength = 0;
      let finished = false;

      const startText = () => {
        if (textId) return;
        textId = crypto.randomUUID();
        writer.write({ type: "text-start", id: textId });
      };

      const endText = () => {
        if (!textId) return;
        writer.write({ type: "text-end", id: textId });
        textId = null;
      };

      const emit = (raw: string) => {
        const full = clean(raw);
        if (full.length <= lastLength) return;
        startText();
        writer.write({
          type: "text-delta",
          id: textId!,
          delta: full.slice(lastLength),
        });
        lastLength = full.length;
      };

      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let event: StreamEvent;
            try {
              event = JSON.parse(trimmed);
            } catch {
              continue;
            }

            const isCurrentTurn = completedTurns === skipTurns;

            if (!isCurrentTurn) {
              if (
                event.type === "turn.completed" ||
                event.type === "turn.failed" ||
                event.type === "session.completed"
              ) {
                completedTurns++;
              }
              continue;
            }

            if (event.type === "message.appended") {
              if (typeof event.data?.delta === "string") {
                startText();
                writer.write({
                  type: "text-delta",
                  id: textId!,
                  delta: clean(event.data.delta),
                });
                lastLength += event.data.delta.length;
              } else if (typeof event.data?.message === "string") {
                emit(event.data.message);
              }
            }

            if (event.type === "message.completed") {
              if (typeof event.data?.message === "string")
                emit(event.data.message);
              endText();
            }

            if (event.type === "turn.failed") {
              console.error("eve turn.failed", JSON.stringify(event.data));
              if (lastLength === 0) {
                const reason =
                  typeof event.data?.message === "string"
                    ? event.data.message
                    : typeof event.data?.error === "string"
                      ? event.data.error
                      : "the agent turn failed, try again";
                emit(reason);
              }
              endText();
              finished = true;
              break;
            }

            if (
              event.type === "turn.completed" ||
              event.type === "session.completed"
            ) {
              endText();
              finished = true;
              break;
            }
          }
        }
      } finally {
        reader.cancel().catch(() => {});
        span.end();
      }

      writer.write({
        type: "data-session",
        data: {
          sessionId: newSessionId,
          continuationToken: newContinuationToken,
          ...(revived
            ? {
                url: revived.url,
                sandboxName: revived.sandboxName,
                turnCount: 1,
              }
            : {}),
        },
      });
    },
  });

  return createUIMessageStreamResponse({ stream: uiStream });
}
