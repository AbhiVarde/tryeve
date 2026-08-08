type FileBlock = { filename: string; content: string };

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "that",
  "which",
  "with",
  "for",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "is",
  "it",
  "this",
  "agent",
  "agents",
]);

export function slugify(prompt: string) {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));
  return `${words.slice(0, 4).join("-") || "generated"}-agent`;
}

export function parseFiles(raw: string): FileBlock[] {
  const regex = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  const blocks: FileBlock[] = [];
  let match;
  let i = 0;

  while ((match = regex.exec(raw)) !== null) {
    i++;
    const body = match[1];
    const firstLine = body.split("\n")[0];
    const filenameMatch = firstLine.match(/(?:\/\/|#)\s*filename:\s*(.+)/i);
    const filename = filenameMatch
      ? filenameMatch[1].trim()
      : i === 1
        ? "agent/instructions.md"
        : `agent/tools/tool-${i}.ts`;
    const content = filenameMatch
      ? body.split("\n").slice(1).join("\n").trim()
      : body.trim();
    blocks.push({ filename, content });
  }

  return blocks;
}

const LAYOUT = `export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#0a0a0a",
          color: "#e5e5e5",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        }}
      >
        {children}
      </body>
    </html>
  );
}
`;

const NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`;

// fully self-contained: no local component imports, so the scaffolded
// project has zero dependency on tryeve's own component tree. auto-connects
// on mount, same behavior as tryeve's own AgentViewer, minus the files panel.
const CHAT_PAGE = `"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const MAX_INPUT_LENGTH = 500;

type Session = {
  url: string;
  sandboxName: string;
  sessionId: string | null;
  continuationToken: string | null;
  turnCount: number;
};

function getText(parts: { type: string }[]) {
  const part = parts.find(
    (p): p is { type: "text"; text: string } => p.type === "text",
  );
  return part?.text ?? "";
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    let cancelled = false;

    fetch("/api/run-agent", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) {
          setConnectError(data.error ?? "couldn't start this agent, try reloading");
          return;
        }
        setSession({
          url: data.url,
          sandboxName: data.sandboxName,
          sessionId: null,
          continuationToken: null,
          turnCount: 0,
        });
      })
      .catch(() => {
        if (!cancelled) setConnectError("couldn't reach the agent runtime");
      })
      .finally(() => {
        if (!cancelled) setConnecting(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/agent-chat",
    prepareSendMessagesRequest({ messages }) {
      const last = messages[messages.length - 1];
      const text = last ? getText(last.parts as any) : "";
      const s = sessionRef.current;
      return {
        body: {
          url: s?.url,
          message: text,
          sessionId: s?.sessionId ?? null,
          continuationToken: s?.continuationToken ?? null,
          turnCount: s?.turnCount ?? 0,
        },
      };
    },
  }), []);

  const { messages, sendMessage, status } = useChat({
    transport,
    onData: (part: any) => {
      if (part.type === "data-session") {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                sessionId: part.data.sessionId,
                continuationToken: part.data.continuationToken,
                turnCount: prev.turnCount + 1,
              }
            : prev,
        );
      }
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !session) return;
    setInput("");
    sendMessage({ text: trimmed });
  }

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "48px 24px 24px",
      }}
    >
      <p style={{ fontSize: 12, color: "#737373", marginBottom: 24, textAlign: "center" }}>
        built with tryeve
      </p>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
        {connecting && (
          <p style={{ fontSize: 13, color: "#737373", textAlign: "center" }}>
            waking up your agent...
          </p>
        )}
        {connectError && (
          <p style={{ fontSize: 13, color: "#f87171", textAlign: "center" }}>{connectError}</p>
        )}
        {messages.map((m) => {
          const text = getText(m.parts as any);
          if (!text) return null;
          return (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                padding: m.role === "user" ? "7px 12px" : "0",
                borderRadius: 8,
                background: m.role === "user" ? "#000" : "transparent",
                color: m.role === "user" ? "#fff" : "#e5e5e5",
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {text}
            </div>
          );
        })}
        {status === "submitted" && (
          <p style={{ fontSize: 13, color: "#737373" }}>thinking...</p>
        )}
      </div>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, opacity: session ? 1 : 0.5 }}>
        <input
          placeholder="message this agent..."
          value={input}
          maxLength={MAX_INPUT_LENGTH}
          disabled={!session}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
          style={{
            flex: 1,
            background: "#141414",
            border: "1px solid #262626",
            borderRadius: 8,
            padding: "10px 12px",
            color: "#e5e5e5",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!session || status === "streaming" || !input.trim()}
          style={{
            background: "#fff",
            color: "#000",
            border: "none",
            borderRadius: 8,
            padding: "0 18px",
            fontSize: 14,
            fontFamily: "inherit",
            cursor: !session || status === "streaming" ? "default" : "pointer",
            opacity: !session || status === "streaming" ? 0.6 : 1,
          }}
        >
          send
        </button>
      </form>
    </main>
  );
}
`;

// the deployed run-agent route: files are embedded as a constant at deploy
// time rather than read off disk, avoids next.js file-tracing dropping
// non-imported files from the function bundle
function buildRunAgentRoute(agentFiles: FileBlock[]) {
  const filesLiteral = JSON.stringify(
    agentFiles.map((f) => ({ filename: f.filename, content: f.content })),
  );

  return `import { Sandbox } from "@vercel/sandbox";
import { nanoid } from "nanoid";

export const runtime = "nodejs";
export const maxDuration = 120;

const AGENT_FILES: { filename: string; content: string }[] = ${filesLiteral};

const OPEN_CHANNEL_AUTH = \`import { eveChannel } from "eve/channels/eve";
import { none } from "eve/channels/auth";

export default eveChannel({ auth: [none()] });
\`;

async function waitForServer(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status < 500) return true;
    } catch {
      // sandbox not accepting connections yet, keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function getModelEnv() {
  const env: Record<string, string> = {};
  if (process.env.AI_GATEWAY_API_KEY) env.AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
  if (process.env.VERCEL_OIDC_TOKEN) env.VERCEL_OIDC_TOKEN = process.env.VERCEL_OIDC_TOKEN;
  if (process.env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (process.env.OPENAI_API_KEY) env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  return env;
}

function getDirectories(files: { filename: string }[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.filename.split("/");
    parts.pop();
    if (parts.length > 0) dirs.add(parts.join("/"));
  }
  return [...dirs];
}

export async function POST() {
  const modelEnv = getModelEnv();

  const sandboxName = \`eve-agent-\${nanoid(8)}\`;
  let sandbox;

  try {
    sandbox = await Sandbox.create({
      name: sandboxName,
      runtime: "node24",
      timeout: 600_000,
      ports: [3000],
      env: modelEnv,
      persistent: false,
    });
  } catch (err) {
    console.error("sandbox create failed:", err);
    return Response.json({
      ok: false,
      error: "couldn't start your agent right now, try again in a moment",
    });
  }

  await Promise.all(
    [...getDirectories(AGENT_FILES), "agent/channels"].map((dir) =>
      sandbox.fs.mkdir(dir, { recursive: true }),
    ),
  );

  await sandbox.writeFiles([
    ...AGENT_FILES.map((f) => ({
      path: f.filename,
      content: Buffer.from(f.content),
    })),
    {
      path: "package.json",
      content: Buffer.from(
        JSON.stringify(
          { name: "deployed-eve-agent", private: true, type: "module", dependencies: { eve: "latest" } },
          null,
          2,
        ),
      ),
    },
    { path: "agent/channels/eve.ts", content: Buffer.from(OPEN_CHANNEL_AUTH) },
  ]);

  const install = await sandbox.runCommand({
    cmd: "npm",
    args: ["install", "--no-audit", "--no-fund"],
  });

  if (install.exitCode !== 0) {
    const err = await install.stderr();
    await sandbox.stop();
    return Response.json({ ok: false, error: \`install failed: \${err}\` });
  }

  await sandbox.runCommand({
    cmd: "npx",
    args: ["eve", "dev", "--no-ui", "--port", "3000"],
    detached: true,
  });

  const url = sandbox.domain(3000);
  const ready = await waitForServer(url, 45_000);

  if (!ready) {
    await sandbox.stop();
    return Response.json({ ok: false, error: "agent didn't start in time" });
  }

  return Response.json({ ok: true, sandboxName, url });
}
`;
}

// identical proxy logic to tryeve's own agent-chat route, no changes needed,
// it's already generic over any sandbox url
const AGENT_CHAT_ROUTE = `import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

export const runtime = "nodejs";
export const maxDuration = 60;

type StreamEvent = { type?: string; data?: any };

const DASH_RE = /[\\u2014\\u2013]/g;

function clean(text: string) {
  return text.replace(DASH_RE, ", ").replace(/[ \\t]{2,}/g, " ");
}

export async function POST(req: Request) {
  const { url, message, sessionId, continuationToken, turnCount } = await req.json();

  if (!url || !message) {
    return Response.json({ error: "url and message are required" }, { status: 400 });
  }

  const target = sessionId ? \`\${url}/eve/v1/session/\${sessionId}\` : \`\${url}/eve/v1/session\`;
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
    return Response.json({ error: "couldn't reach the agent sandbox" }, { status: 502 });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return Response.json({ error: errText || "the agent session is unavailable" }, { status: res.status || 502 });
  }

  const data = await res.json().catch(() => null);
  const newSessionId = res.headers.get("x-eve-session-id") ?? sessionId;
  const newContinuationToken = data?.continuationToken ?? continuationToken;

  if (!newSessionId) {
    return Response.json({ error: "missing session id from agent" }, { status: 502 });
  }

  let streamRes: Response;
  try {
    streamRes = await fetch(\`\${url}/eve/v1/session/\${newSessionId}/stream\`);
  } catch {
    return Response.json({ error: "couldn't stream the agent session" }, { status: 502 });
  }

  if (!streamRes.ok || !streamRes.body) {
    return Response.json({ error: "the agent stream is unavailable" }, { status: 502 });
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
        writer.write({ type: "text-delta", id: textId!, delta: full.slice(lastLength) });
        lastLength = full.length;
      };

      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\\n");
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
              if (event.type === "turn.completed" || event.type === "turn.failed" || event.type === "session.completed") {
                completedTurns++;
              }
              continue;
            }

            if (event.type === "message.appended") {
              if (typeof event.data?.delta === "string") {
                startText();
                writer.write({ type: "text-delta", id: textId!, delta: clean(event.data.delta) });
                lastLength += event.data.delta.length;
              } else if (typeof event.data?.message === "string") {
                emit(event.data.message);
              }
            }

            if (event.type === "message.completed") {
              if (typeof event.data?.message === "string") emit(event.data.message);
              endText();
            }

            if (event.type === "turn.failed") {
              console.error("eve turn.failed", JSON.stringify(event.data));
              if (lastLength === 0) emit("the agent turn failed, try again");
              endText();
              finished = true;
              break;
            }

            if (event.type === "turn.completed" || event.type === "session.completed") {
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
        data: { sessionId: newSessionId, continuationToken: newContinuationToken },
      });
    },
  });

  return createUIMessageStreamResponse({ stream: uiStream });
}
`;

export function buildVercelDeployFiles(
  prompt: string,
  generated: FileBlock[],
): FileBlock[] {
  return [
    {
      filename: "package.json",
      content: JSON.stringify(
        {
          name: slugify(prompt),
          private: true,
          version: "0.1.0",
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
          },
          dependencies: {
            next: "latest",
            react: "latest",
            "react-dom": "latest",
            "@vercel/sandbox": "latest",
            "@ai-sdk/react": "latest",
            ai: "latest",
            nanoid: "latest",
          },
          devDependencies: {
            typescript: "latest",
            "@types/node": "latest",
            "@types/react": "latest",
            "@types/react-dom": "latest",
          },
        },
        null,
        2,
      ),
    },
    {
      filename: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2017",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./*"] },
          },
          include: [
            "next-env.d.ts",
            "**/*.ts",
            "**/*.tsx",
            ".next/types/**/*.ts",
          ],
          exclude: ["node_modules"],
        },
        null,
        2,
      ),
    },
    { filename: "next.config.ts", content: NEXT_CONFIG },
    {
      filename: "next-env.d.ts",
      content: `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n`,
    },
    { filename: "app/layout.tsx", content: LAYOUT },
    { filename: "app/page.tsx", content: CHAT_PAGE },
    {
      filename: "app/api/run-agent/route.ts",
      content: buildRunAgentRoute(generated),
    },
    { filename: "app/api/agent-chat/route.ts", content: AGENT_CHAT_ROUTE },
    {
      filename: "README.md",
      content: `# ${slugify(prompt)}

${prompt}

built and deployed with [tryeve](https://tryeve.abhivarde.in), an agent runtime for [eve](https://eve.dev).

## works out of the box

this agent runs through the Vercel AI Gateway, authenticated automatically via \`VERCEL_OIDC_TOKEN\` once deployed. nothing to configure, no key needed.

## using a different model or provider

by default this uses eve's default model. to pick a specific one, add \`agent/agent.ts\`:

\`\`\`ts
import { defineAgent } from "eve";

export default defineAgent({
  model: "google/gemini-2.5-flash", // any AI Gateway model id: openai/gpt-5.4-mini, groq/llama-3.3-70b, etc.
});
\`\`\`

gateway ids still authenticate via OIDC, no key needed. to call a provider directly instead (bypassing the gateway), install that provider's AI SDK package and pass it to \`model\`, then set that provider's own API key as an env var on this project. see [eve's agent config docs](https://eve.dev/docs/agent-config).
`,
    },
  ];
}
