import { checkRateLimit } from "@vercel/firewall";
import { cookies } from "next/headers";
import { put } from "@vercel/blob";
import { getGithubToken } from "@/app/lib/github-connect";

export const runtime = "nodejs";

type FileBlock = { filename: string; content: string };

function parseFiles(raw: string): FileBlock[] {
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

function slugify(prompt: string) {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));

  const base = words.slice(0, 4).join("-") || "generated";
  return `${base}-agent`;
}

async function githubFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  return res;
}

export async function POST(req: Request) {
  const { rateLimited } = await checkRateLimit("rate-limit-ai-routes");
  if (rateLimited) {
    return Response.json(
      { ok: false, error: "too many requests, try again in a minute" },
      { status: 429 },
    );
  }

  const cookieStore = await cookies();
  const visitorId = cookieStore.get("tryeve_vid")?.value;

  if (!visitorId) {
    return Response.json(
      { ok: false, error: "no session found, reload and try again" },
      { status: 401 },
    );
  }

  const { prompt, code, shareId } = await req.json();

  if (!prompt || !code || typeof code !== "string") {
    return Response.json(
      { ok: false, error: "prompt and code are required" },
      { status: 400 },
    );
  }

  let appAuth;
  try {
    appAuth = await getGithubToken(visitorId);
  } catch (err) {
    console.error("github app token request failed:", err);
    return Response.json({
      ok: false,
      error: "couldn't reach GitHub right now, try again in a moment",
    });
  }

  if (appAuth.needsAuth) {
    return Response.json({
      ok: false,
      needsAuth: true,
      authorizeUrl: appAuth.authorizeUrl,
    });
  }

  const oauthToken = cookieStore.get("tryeve_gh_token")?.value;

  if (!oauthToken) {
    return Response.json({
      ok: false,
      needsAuth: true,
      authorizeUrl: "https://tryeve.abhivarde.in/api/github/oauth/start",
    });
  }

  const files = parseFiles(code);
  const repoName = slugify(prompt);

  const userRes = await githubFetch(appAuth.token!, "/user");
  if (!userRes.ok) {
    return Response.json({
      ok: false,
      error: "GitHub rejected the request, try reconnecting",
    });
  }
  const user = await userRes.json();

  const createRes = await githubFetch(oauthToken, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: repoName,
      description: prompt.length > 100 ? `${prompt.slice(0, 97)}...` : prompt,
      private: false,
      auto_init: false,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => null);
    return Response.json({
      ok: false,
      error: err?.message ?? "couldn't create the repository",
    });
  }

  const repo = await createRes.json();

  const openChannelAuth = `import { eveChannel } from "eve/channels/eve";
import { none } from "eve/channels/auth";

export default eveChannel({ auth: [none()] });
`;

  const nextConfig = `import { withEve } from "eve/next";

const nextConfig = {};

export default withEve(nextConfig);
`;

  const layout = `export default function RootLayout({
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

  const chatPage = `"use client";

import { useState } from "react";

type ChatMessage = { role: "user" | "assistant"; text: string };

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [continuationToken, setContinuationToken] = useState<string | null>(
    null,
  );
  const [sending, setSending] = useState(false);

  async function readReply(id: string) {
    const res = await fetch(\`/eve/v1/session/\${id}/stream\`);
    if (!res.body) return "";

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let reply = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "message.completed") {
            reply = event.message?.text ?? event.text ?? reply;
          }
          if (event.type === "session.completed") {
            reader.cancel();
            return reply;
          }
        } catch {
          continue;
        }
      }
    }

    return reply;
  }

  async function send(text: string) {
    setMessages((prev) => [...prev, { role: "user", text }]);
    setSending(true);

    try {
      const url = sessionId
        ? \`/eve/v1/session/\${sessionId}\`
        : "/eve/v1/session";

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sessionId
            ? { continuationToken, message: text }
            : { message: text },
        ),
      });

      const data = await res.json().catch(() => ({}));
      const id = sessionId ?? res.headers.get("x-eve-session-id");
      if (id) setSessionId(id);
      if (data.continuationToken) setContinuationToken(data.continuationToken);

      const reply = id ? await readReply(id) : "";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply || "no reply received" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "something went wrong, try again" },
      ]);
    } finally {
      setSending(false);
    }
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
      <p
        style={{
          fontSize: 12,
          color: "#737373",
          marginBottom: 24,
          textAlign: "center",
        }}
      >
        built with tryeve
      </p>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          marginBottom: 16,
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
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
            {m.text}
          </div>
        ))}
        {sending && (
          <div style={{ fontSize: 13, color: "#737373" }}>thinking...</div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem(
            "message",
          ) as HTMLInputElement;
          if (!input.value.trim() || sending) return;
          const text = input.value;
          input.value = "";
          send(text);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          name="message"
          placeholder="message this agent..."
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
          disabled={sending}
          style={{
            background: "#fff",
            color: "#000",
            border: "none",
            borderRadius: 8,
            padding: "0 18px",
            fontSize: 14,
            fontFamily: "inherit",
            cursor: sending ? "default" : "pointer",
            opacity: sending ? 0.6 : 1,
          }}
        >
          send
        </button>
      </form>
    </main>
  );
}
`;

  const allFiles: FileBlock[] = [
    ...files,
    {
      filename: "package.json",
      content: JSON.stringify(
        {
          name: repoName,
          private: true,
          version: "0.1.0",
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
          },
          dependencies: {
            eve: "latest",
            next: "latest",
            react: "latest",
            "react-dom": "latest",
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
    {
      filename: "next-env.d.ts",
      content: `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`,
    },
    { filename: "next.config.mjs", content: nextConfig },
    { filename: "app/layout.tsx", content: layout },
    { filename: "app/page.tsx", content: chatPage },
    { filename: "agent/channels/eve.ts", content: openChannelAuth },
    {
      filename: "README.md",
      content: `# ${repoName}

${prompt}

built and tested with [tryeve](https://tryeve.abhivarde.in), an agent runtime for [eve](https://eve.dev).

## run it

\`\`\`
npm install
npm run dev
\`\`\`

## deploy

[![deploy with vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=${repo.html_url})

## structure

- \`agent/instructions.md\` defines what this agent does
- \`agent/tools/\` contains the typed tools it can call
- \`app/\` is the chat frontend, built with eve's Next.js integration

eve reads everything under \`agent/\` automatically, no registration needed.
`,
    },
  ];

  const failedFiles: string[] = [];

  for (const file of allFiles) {
    const res = await githubFetch(
      appAuth.token!,
      `/repos/${user.login}/${repoName}/contents/${file.filename}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `add ${file.filename}`,
          content: Buffer.from(file.content).toString("base64"),
        }),
      },
    );

    if (!res.ok) failedFiles.push(file.filename);
  }

  if (failedFiles.length > 0) {
    return Response.json({
      ok: false,
      error: `repo created, but ${failedFiles.length} file(s) failed to upload: ${failedFiles.join(", ")}`,
      repoUrl: repo.html_url,
    });
  }

  try {
    await put(
      `agents/${shareId}-repo.json`,
      JSON.stringify({ repoUrl: repo.html_url }),
      {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      },
    );
  } catch (err) {
    console.error("deploy: repo status write failed", err);
  }

  return Response.json({ ok: true, repoUrl: repo.html_url });
}
