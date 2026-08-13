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

export function getConnectionEnvVars(files: FileBlock[]): string[] {
  const vars = new Set<string>();
  for (const f of files) {
    if (!f.filename.startsWith("agent/connections/")) continue;
    const matches = f.content.matchAll(/process\.env\.([A-Z0-9_]+)/g);
    for (const m of matches) vars.add(m[1]);
  }
  return [...vars];
}

function escapeForJsTemplate(str: string) {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

// ---------- static files, identical every deploy ----------

const GLOBALS_CSS = `@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@source "../node_modules/streamdown/dist/*.js";
@source "../node_modules/@streamdown/code/dist/*.js";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}

html {
  scroll-behavior: smooth;
}

html,
body,
* {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar,
*::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
`;

const POSTCSS_CONFIG = `const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
`;

const LIB_UTILS = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

const UI_BUTTON = `import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        ghost: "hover:bg-muted hover:text-foreground dark:hover:bg-muted/50",
      },
      size: {
        default: "h-8 gap-1.5 px-2.5",
        icon: "size-8",
        "icon-sm": "size-7 rounded-[min(var(--radius-md),12px)]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
`;

const UI_TEXTAREA = `import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
`;

const UI_SPINNER = `import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
`;

const VERCEL_MARK = `export function VercelMark({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 76 65"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className ?? "text-foreground"}
    >
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}
`;

const AI_ELEMENTS_SHIMMER = `"use client";

import { cn } from "@/lib/utils";
import type { MotionProps } from "motion/react";
import { motion } from "motion/react";
import type { CSSProperties, ElementType, JSX } from "react";
import { memo, useMemo } from "react";

type MotionHTMLProps = MotionProps & Record<string, unknown>;

const motionComponentCache = new Map<
  keyof JSX.IntrinsicElements,
  React.ComponentType<MotionHTMLProps>
>();

const getMotionComponent = (element: keyof JSX.IntrinsicElements) => {
  let component = motionComponentCache.get(element);
  if (!component) {
    component = motion.create(element);
    motionComponentCache.set(element, component);
  }
  return component;
};

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  const MotionComponent = getMotionComponent(Component as keyof JSX.IntrinsicElements);
  const dynamicSpread = useMemo(() => (children?.length ?? 0) * spread, [children, spread]);

  return (
    <MotionComponent
      animate={{ backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-size-[250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className,
      )}
      initial={{ backgroundPosition: "100% center" }}
      style={
        {
          "--spread": \`\${dynamicSpread}px\`,
          backgroundImage:
            "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
        } as CSSProperties
      }
      transition={{ duration, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
    >
      {children}
    </MotionComponent>
  );
};

export const Shimmer = memo(ShimmerComponent);
`;

// trimmed from your real message.tsx: only Message/MessageContent/MessageResponse
// kept, since branch/action toolbar isn't used in a single-agent chat. plugin set
// reduced to `code` only to avoid pulling in cjk/math/mermaid for a small deploy.
const AI_ELEMENTS_MESSAGE = `"use client";

import { cn } from "@/lib/utils";
import { code } from "@streamdown/code";
import type { UIMessage } from "ai";
import type { ComponentProps, HTMLAttributes } from "react";
import { memo } from "react";
import { Streamdown } from "streamdown";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className,
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({ children, className, ...props }: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

const streamdownPlugins = { code };

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

MessageResponse.displayName = "MessageResponse";
`;

// your actual ai-elements conversation.tsx, trimmed to Conversation/
// ConversationContent/ConversationScrollButton — ConversationEmptyState and
// ConversationDownload aren't used by the deployed single-agent page
const AI_ELEMENTS_CONVERSATION = `"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

export const ConversationContent = ({ className, ...props }: ConversationContentProps) => (
  <StickToBottom.Content className={cn("flex flex-col gap-8 p-4", className)} {...props} />
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted",
          className,
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};
`;

function buildLayout(prompt: string) {
  const safePrompt = escapeForJsTemplate(prompt);
  return `import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: \`${safePrompt}\`,
  description: "an eve agent, built and deployed with tryeve",
  icons: {
    icon: "https://tryeve.abhivarde.in/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={\`dark \${geistSans.variable} \${geistMono.variable} h-full antialiased\`}
    >
      <body
        className="min-h-full bg-background text-foreground"
        style={{ fontFamily: "var(--font-geist-sans)" }}
      >
        {children}
      </body>
    </html>
  );
}
`;
}

function buildChatPage(prompt: string) {
  const safePrompt = escapeForJsTemplate(prompt);
  return `"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { VercelMark } from "@/components/vercel-mark";

const MAX_INPUT_LENGTH = 500;
const AGENT_NAME = \`${safePrompt}\`;

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

  async function reviveAndRetry(input: RequestInfo | URL, init?: RequestInit) {
    const res = await fetch(input, init);
    if (res.status !== 409) return res;

    const reviveRes = await fetch("/api/run-agent", { method: "POST" });
    const revived = await reviveRes.json().catch(() => null);
    if (!revived?.ok) return res;

    const freshSession: Session = {
      url: revived.url,
      sandboxName: revived.sandboxName,
      sessionId: null,
      continuationToken: null,
      turnCount: 0,
    };
    sessionRef.current = freshSession;
    setSession(freshSession);

    if (!init?.body) return res;
    const body = JSON.parse(init.body as string);
    const retryBody = JSON.stringify({
      ...body,
      url: freshSession.url,
      sessionId: null,
      continuationToken: null,
      turnCount: 0,
    });
    return fetch(input, { ...init, body: retryBody });
  }

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent-chat",
        fetch: reviveAndRetry,
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
      }),
    [],
  );

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

  const submitting = status === "streaming" || status === "submitted";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !session || submitting) return;
    setInput("");
    sendMessage({ text: trimmed });
  }

  const lastMessage = messages[messages.length - 1];
  const lastAssistantText =
    lastMessage?.role === "assistant" ? getText(lastMessage.parts as any) : "";
  const showThinking =
    status === "submitted" ||
    (status === "streaming" && lastMessage?.role === "assistant" && !lastAssistantText.trim());

  return (
    <div className="flex h-full min-h-screen flex-col">
      <header className="fixed top-0 left-0 z-30 w-full px-6 py-4">
        <span className="flex items-center gap-2">
          <VercelMark />
          <span className="text-sm font-medium text-muted-foreground">/</span>
          <span className="truncate font-mono text-sm font-medium tracking-tight">
            {AGENT_NAME}
          </span>
        </span>
      </header>

      <Conversation className="flex-1 pt-16">
        <ConversationContent className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pb-4">
          {connecting && (
            <p className="font-mono text-xs text-muted-foreground">waking up your agent...</p>
          )}
          {connectError && (
            <p className="font-mono text-xs text-red-400/80">{connectError}</p>
          )}

          {messages.map((m) => {
            const text = getText(m.parts as any);
            if (!text && m.role === "assistant") return null;
            return (
              <Message from={m.role as "user" | "assistant"} key={m.id}>
                <MessageContent
                  className={
                    m.role === "user"
                      ? "bg-black! px-3! py-1.5! font-mono text-sm text-white rounded-lg! shadow-sm"
                      : "bg-transparent p-0 text-sm"
                  }
                >
                  {m.role === "assistant" ? <MessageResponse>{text}</MessageResponse> : text}
                </MessageContent>
              </Message>
            );
          })}

          {showThinking && (
            <Message from="assistant">
              <MessageContent className="bg-transparent p-0 font-mono text-xs text-muted-foreground">
                <Shimmer duration={1.2} className="font-mono text-sm">
                  thinking...
                </Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-2xl p-4">
        <form onSubmit={onSubmit} className="w-full space-y-2">
          <div className="relative">
            <Textarea
              placeholder={connecting ? "connecting..." : "message this agent..."}
              value={input}
              maxLength={MAX_INPUT_LENGTH}
              disabled={!session}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              className="min-h-28 resize-none rounded-md border-0 bg-black/20 px-3 py-2.5 pr-14 font-mono text-sm shadow-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="pointer-events-none absolute right-3 bottom-2.5 font-mono text-[11px] tabular-nums text-muted-foreground/60">
              {input.length}/{MAX_INPUT_LENGTH}
            </span>
          </div>
          <Button
            type="submit"
            disabled={!session || submitting || !input.trim()}
            className="w-full cursor-pointer"
          >
            {submitting && <Spinner className="size-4" />}
            <span className="animate-in fade-in duration-300">
              {submitting ? "sending..." : "send"}
            </span>
          </Button>
        </form>
        <a
          href="https://tryeve.abhivarde.in"
          target="_blank"
          rel="noopener noreferrer"
          className="mx-auto mt-4 block w-fit cursor-pointer font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          built with tryeve
        </a>
      </div>
    </div>
  );
}
`;
}

function buildRunAgentRoute(agentFiles: FileBlock[]) {
  const filesLiteral = JSON.stringify(
    agentFiles.map((f) => ({ filename: f.filename, content: f.content })),
  );

  return `import { Sandbox } from "@vercel/sandbox";
import { nanoid } from "nanoid";

export const runtime = "nodejs";
export const maxDuration = 120;

type FileBlock = { filename: string; content: string };

const AGENT_FILES: FileBlock[] = ${filesLiteral};

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

function getConnectionEnvVars(files: FileBlock[]): string[] {
  const vars = new Set<string>();
  for (const f of files) {
    if (!f.filename.startsWith("agent/connections/")) continue;
    const matches = f.content.matchAll(/process\.env\.([A-Z0-9_]+)/g);
    for (const m of matches) vars.add(m[1]);
  }
  return [...vars];
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
  const connectionVars = getConnectionEnvVars(AGENT_FILES);
  const missingConnectionEnv = connectionVars.filter((v) => !process.env[v]);
  const missingModelEnv = Object.keys(modelEnv).length === 0;

  if (missingModelEnv || missingConnectionEnv.length > 0) {
    const parts: string[] = [];
    if (missingModelEnv) {
      parts.push(
        "a model credential (AI_GATEWAY_API_KEY, or ANTHROPIC_API_KEY / OPENAI_API_KEY)",
      );
    }
    if (missingConnectionEnv.length > 0) {
      parts.push(
        \`this agent's connection needs \${missingConnectionEnv.join(", ")}\`,
      );
    }

    return Response.json({
      ok: false,
      needsCredentials: true,
      error: \`add \${parts.join(" and ")} in this project's vercel settings, then redeploy\`,
    });
  }

  const connectionEnv = Object.fromEntries(
    connectionVars
      .filter((v) => process.env[v])
      .map((v) => [v, process.env[v]!]),
  );

  const sandboxName = \`eve-agent-\${nanoid(8)}\`;
  let sandbox;

  try {
    sandbox = await Sandbox.create({
      name: sandboxName,
      runtime: "node24",
      timeout: 600_000,
      ports: [3000],
      env: { ...modelEnv, ...connectionEnv },
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
    return Response.json({ error: "couldn't reach the agent sandbox", needsRevive: true }, { status: 409 });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("eve session request failed", res.status, errText);
    return Response.json({ error: errText || "the agent session is unavailable", needsRevive: true }, { status: 409 });
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
    ...generated,
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
            "@base-ui/react": "latest",
            motion: "latest",
            clsx: "latest",
            "tailwind-merge": "latest",
            "class-variance-authority": "latest",
            "lucide-react": "latest",
            streamdown: "latest",
            "@streamdown/code": "latest",
            "use-stick-to-bottom": "latest",
            shadcn: "latest",
            "tw-animate-css": "latest",
          },
          devDependencies: {
            typescript: "latest",
            "@types/node": "latest",
            "@types/react": "latest",
            "@types/react-dom": "latest",
            "@tailwindcss/postcss": "latest",
            tailwindcss: "latest",
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
          exclude: ["node_modules", "agent"],
        },
        null,
        2,
      ),
    },
    { filename: "postcss.config.mjs", content: POSTCSS_CONFIG },
    {
      filename: "next-env.d.ts",
      content: `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n`,
    },
    { filename: "app/globals.css", content: GLOBALS_CSS },
    { filename: "app/layout.tsx", content: buildLayout(prompt) },
    { filename: "app/page.tsx", content: buildChatPage(prompt) },
    {
      filename: "app/api/run-agent/route.ts",
      content: buildRunAgentRoute(generated),
    },
    { filename: "app/api/agent-chat/route.ts", content: AGENT_CHAT_ROUTE },
    { filename: "lib/utils.ts", content: LIB_UTILS },
    { filename: "components/ui/button.tsx", content: UI_BUTTON },
    { filename: "components/ui/textarea.tsx", content: UI_TEXTAREA },
    { filename: "components/ui/spinner.tsx", content: UI_SPINNER },
    { filename: "components/vercel-mark.tsx", content: VERCEL_MARK },
    {
      filename: "components/ai-elements/shimmer.tsx",
      content: AI_ELEMENTS_SHIMMER,
    },
    {
      filename: "components/ai-elements/message.tsx",
      content: AI_ELEMENTS_MESSAGE,
    },
    {
      filename: "components/ai-elements/conversation.tsx",
      content: AI_ELEMENTS_CONVERSATION,
    },
    {
      filename: "README.md",
      content: `# ${slugify(prompt)}

${prompt}

built and deployed with [tryeve](https://tryeve.abhivarde.in), an agent runtime for [eve](https://eve.dev).

## before this works

add a model credential in this project's vercel settings, then redeploy:

\`\`\`
AI_GATEWAY_API_KEY=
\`\`\`

or \`ANTHROPIC_API_KEY\` / \`OPENAI_API_KEY\`. one AI Gateway key covers anthropic, openai, gemini, groq, and more.
${
  getConnectionEnvVars(generated).length > 0
    ? `
this agent also connects to a real external service, so it needs these too:

\`\`\`
${getConnectionEnvVars(generated)
  .map((v) => `${v}=`)
  .join("\n")}
\`\`\`
`
    : ""
}`,
    },
  ];
}
