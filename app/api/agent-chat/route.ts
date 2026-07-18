import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

export const runtime = "nodejs";
export const maxDuration = 60;

type StreamEvent = { type?: string; data?: any };

const DASH_RE = /[\u2014\u2013]/g;

function clean(text: string) {
  return text.replace(DASH_RE, ", ").replace(/[ \t]{2,}/g, " ");
}

export async function POST(req: Request) {
  const { url, message, sessionId, continuationToken, turnCount } =
    await req.json();

  if (!url || !message) {
    return Response.json(
      { error: "url and message are required" },
      { status: 400 },
    );
  }

  const target = sessionId
    ? `${url}/eve/v1/session/${sessionId}`
    : `${url}/eve/v1/session`;

  const body = sessionId ? { continuationToken, message } : { message };
  const skipTurns = typeof turnCount === "number" ? turnCount : 0;

  let res: Response;
  try {
    res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
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
  const newSessionId = res.headers.get("x-eve-session-id") ?? sessionId;
  const newContinuationToken = data?.continuationToken ?? continuationToken;

  if (!newSessionId) {
    return Response.json(
      { error: "missing session id from agent" },
      { status: 502 },
    );
  }

  let streamRes: Response;
  try {
    streamRes = await fetch(`${url}/eve/v1/session/${newSessionId}/stream`);
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
              if (lastLength === 0) emit("the agent turn failed, try again");
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
      }

      writer.write({
        type: "data-session",
        data: {
          sessionId: newSessionId,
          continuationToken: newContinuationToken,
        },
      });
    },
  });

  return createUIMessageStreamResponse({ stream: uiStream });
}
