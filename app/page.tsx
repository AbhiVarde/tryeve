"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { CheckIcon, type CheckIconHandle } from "@/components/ui/check";
import {
  DownloadIcon,
  type DownloadIconHandle,
} from "@/components/ui/download";
import { LinkIcon, type LinkIconHandle } from "@/components/ui/link";
import {
  ChevronLeftIcon,
  type ChevronLeftIconHandle,
} from "@/components/ui/chevron-left";
import {
  ChevronRightIcon,
  type ChevronRightIconHandle,
} from "@/components/ui/chevron-right";
import { XIcon, type XIconHandle } from "@/components/ui/x";
import {
  CircleHelpIcon,
  type CircleHelpIconHandle,
} from "@/components/ui/circle-help";
import {
  BotMessageSquareIcon,
  type BotMessageSquareHandle,
} from "@/components/ui/bot-message-square";
import { LogoutIcon, type LogoutIconHandle } from "@/components/ui/logout";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { TopBar } from "@/components/topbar";
import { PanelGlow } from "@/components/panel-glow";
import { VercelMark } from "@/components/vercel-mark";
import {
  useAgentChat,
  AgentConversation,
  type AgentSession,
} from "@/components/agent-chat-panel";

type FileBlock = { filename: string; content: string };
type TestState = "testing" | "passed" | "failed" | null;
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  kind: "generate" | "chat";
  shareId?: string;
};
type ChatSession = AgentSession & { agentMessageId: string };

const MAX_INPUT_LENGTH = 500;

const FEATURES: string[] = [
  "describe an agent in plain english",
  "generates real, working eve files",
  "every agent is tested against a live eve runtime before you see it",
  "generation and testing run as one durable step, survives crashes",
  "inspect every file with syntax highlighting",
  "export the full agent as a zip",
  "share a live link to any agent you build",
  "connect to your agent right after it's built, no install needed",
  "chat with it live, with markdown-formatted replies",
  "auto-scrolling chat with a jump-to-latest button",
  "reload the page anytime, your agent and chat pick up right where you left off",
  "idle or closed sandboxes shut down automatically, nothing left running",
  "dark, minimal, vercel-inspired interface",
];

const VERCEL_PRODUCTS: { name: string; description: string }[] = [
  { name: "next.js", description: "the app itself" },
  {
    name: "ai gateway",
    description: "routes the generation request to a model",
  },
  { name: "ai sdk", description: "streams the model's response" },
  {
    name: "sandbox",
    description:
      "tests every agent against a real eve runtime, then runs it live so you can talk to it",
  },
  {
    name: "workflow sdk",
    description: "runs generate and test as one durable step, survives crashes",
  },
  {
    name: "blob",
    description:
      "stores each generated agent and its live chat session, so shared links and reloads stay in sync",
  },
  {
    name: "firewall",
    description:
      "rate limits generation and connect requests to keep usage fair",
  },
  {
    name: "ai elements",
    description: "the chat interface, task progress ui, shimmer loading text",
  },
  { name: "streamdown", description: "renders code and markdown cleanly" },
  { name: "shadcn/ui", description: "every ui component" },
  { name: "vercel", description: "hosts and deploys the app" },
  {
    name: "analytics",
    description: "tracks real usage without slowing anything down",
  },
];

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

async function downloadZip(files: FileBlock[]) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  files.forEach((file) => {
    zip.file(file.filename, file.content);
  });

  zip.file(
    "package.json",
    JSON.stringify(
      {
        name: "my-eve-agent",
        private: true,
        type: "module",
        scripts: { dev: "eve dev" },
        dependencies: { eve: "latest" },
      },
      null,
      2,
    ),
  );

  zip.file(
    "README.md",
    `# your eve agent

built with tryeve.

## run it

npm install
npm run dev

eve reads everything under agent/ automatically. no registration, no extra config.

## structure

agent/instructions.md defines what your agent does
agent/agent.ts sets the model, only present if your agent needs a specific one
agent/tools/ contains typed tools the agent can call, the filename is the tool name

## docs

https://eve.dev/docs/introduction
`,
  );

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "eve-agent.zip";
  a.click();
  URL.revokeObjectURL(url);
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [selectedFile, setSelectedFile] = useState<{
    messageId: string;
    index: number;
  } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, TestState>>({});

  const [panelFile, setPanelFile] = useState<FileBlock | null>(null);
  const lastFileKey = useRef<string | null>(null);

  const downloadIconRefs = useRef<Map<string, DownloadIconHandle>>(new Map());
  const linkIconRefs = useRef<Map<string, LinkIconHandle>>(new Map());
  const checkIconRefs = useRef<Map<string, CheckIconHandle>>(new Map());
  const botIconRefs = useRef<Map<string, BotMessageSquareHandle>>(new Map());
  const chevronLeftIconRef = useRef<ChevronLeftIconHandle>(null);
  const chevronRightIconRef = useRef<ChevronRightIconHandle>(null);
  const xIconRef = useRef<XIconHandle>(null);
  const circleHelpIconRef = useRef<CircleHelpIconHandle>(null);
  const logoutIconRef = useRef<LogoutIconHandle>(null);

  const [phase, setPhase] = useState<"generating" | "testing" | null>(null);

  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);

  const {
    messages: agentMessages,
    sendMessage,
    status,
  } = useAgentChat(chatSession, (patch) =>
    setChatSession((prev) => (prev ? { ...prev, ...patch } : prev)),
  );

  const panelOpen = !!selectedFile || showInfo;

  const chatSessionRef = useRef<ChatSession | null>(null);
  useEffect(() => {
    chatSessionRef.current = chatSession;
  }, [chatSession]);

  useEffect(() => {
    function stopActiveSandbox() {
      const session = chatSessionRef.current;
      if (!session) return;
      navigator.sendBeacon(
        "/api/stop-agent",
        new Blob([JSON.stringify({ sandboxName: session.sandboxName })], {
          type: "application/json",
        }),
      );
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") stopActiveSandbox();
    }

    window.addEventListener("beforeunload", stopActiveSandbox);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", stopActiveSandbox);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!chatSession) return;

    const timer = setTimeout(
      () => {
        fetch("/api/stop-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxName: chatSession.sandboxName }),
        });
        setChatSession(null);
        toast.info("agent disconnected after 5 minutes of inactivity");
      },
      5 * 60 * 1000,
    );

    return () => clearTimeout(timer);
  }, [chatSession, agentMessages.length]);

  const activeMessage = selectedFile
    ? messages.find((m) => m.id === selectedFile.messageId)
    : null;
  const activeFiles = activeMessage ? parseFiles(activeMessage.text) : [];
  const activeFile = selectedFile ? activeFiles[selectedFile.index] : null;

  const fileKey = selectedFile
    ? `${selectedFile.messageId}-${selectedFile.index}`
    : null;

  if (fileKey !== lastFileKey.current) {
    lastFileKey.current = fileKey;
    if (activeFile) setPanelFile(activeFile);
  }

  useEffect(() => {
    const shareId = searchParams.get("a");
    if (!shareId) {
      setRestoring(false);
      return;
    }

    let cancelled = false;

    fetch(`/agent/${shareId}/raw`)
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data: { prompt: string; code: string } | null) => {
        if (cancelled || !data) return;
        const assistantId = crypto.randomUUID();
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "user",
            text: data.prompt,
            kind: "generate",
          },
          {
            id: assistantId,
            role: "assistant",
            text: data.code,
            kind: "generate",
            shareId,
          },
        ]);
        setTestStatus((prev) => ({ ...prev, [assistantId]: "passed" }));

        try {
          const sessionRes = await fetch(`/agent/${shareId}/raw?session=1`);
          if (!sessionRes.ok) return;
          const session: { sandboxName: string; url: string } =
            await sessionRes.json();
          const pingRes = await fetch(session.url, { method: "GET" });
          if (cancelled || !pingRes.ok) return;
          setChatSession({
            agentMessageId: assistantId,
            url: session.url,
            sandboxName: session.sandboxName,
            sessionId: null,
            continuationToken: null,
            turnCount: 0,
          });
        } catch {
          // sandbox no longer reachable, stay disconnected
        }
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  function resetSession() {
    if (busy) return;
    setMessages([]);
    setSelectedFile(null);
    setPanelFile(null);
    setShowInfo(false);
    setChatSession(null);
    setTestStatus({});
    setInput("");
    router.replace("/");
  }

  function openFile(messageId: string, index: number) {
    setShowInfo(false);
    setSelectedFile({ messageId, index });
  }

  function openInfo() {
    setSelectedFile(null);
    setShowInfo((prev) => !prev);
  }

  function closePanel() {
    setSelectedFile(null);
    setShowInfo(false);
  }

  function endChat() {
    if (chatSession) {
      const agentMessage = messages.find(
        (m) => m.id === chatSession.agentMessageId,
      );
      fetch("/api/stop-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sandboxName: chatSession.sandboxName,
          shareId: agentMessage?.shareId,
        }),
      });
    }
    setChatSession(null);
  }

  async function startChat(message: Message) {
    setChatLoadingId(message.id);

    try {
      const res = await fetch("/api/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: message.text, shareId: message.shareId }),
      });
      const data = await res.json();

      if (!data.ok) {
        toast.error(
          data.error ??
            "unable to reach your agent. check the connection and try again.",
        );
        return;
      }

      setChatSession({
        agentMessageId: message.id,
        url: data.url,
        sandboxName: data.sandboxName,
        sessionId: null,
        continuationToken: null,
        turnCount: 0,
      });
    } catch {
      toast.error("failed to connect to your agent. please try again.");
    } finally {
      setChatLoadingId(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      toast.error(
        chatSession
          ? "enter a message before sending"
          : "enter a prompt to build your agent",
      );
      return;
    }
    if (trimmed.length > MAX_INPUT_LENGTH) {
      toast.error(`keep your prompt under ${MAX_INPUT_LENGTH} characters`);
      return;
    }

    setInput("");

    if (chatSession) {
      sendMessage({ text: trimmed });
      return;
    }

    setSelectedFile(null);
    setShowInfo(false);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      kind: "generate",
    };
    setMessages((prev) => [...prev, userMessage]);
    setBusy(true);
    setPhase("generating");
    setTimeout(() => setPhase("testing"), 16000);

    const assistantId = crypto.randomUUID();

    try {
      const res = await fetch("/api/build-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const result = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          text: result.code ?? "",
          kind: "generate",
          shareId: result.id,
        },
      ]);

      setTestStatus((prev) => ({
        ...prev,
        [assistantId]: result.passed ? "passed" : "failed",
      }));

      if (result.id) router.replace(`/?a=${result.id}`);
    } catch {
      toast.error(
        "something went wrong building your agent. please try again.",
      );
    } finally {
      setBusy(false);
      setPhase(null);
    }
  }

  const remaining = MAX_INPUT_LENGTH - input.length;
  const nearLimit = remaining <= 40;
  const submitting = chatSession ? status === "streaming" : busy;

  const inputBar = (
    <form onSubmit={onSubmit} className="w-full space-y-2">
      {chatSession && (
        <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2 font-mono text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            agent connected
          </span>
          <button
            type="button"
            onClick={endChat}
            onMouseEnter={() => logoutIconRef.current?.startAnimation()}
            onMouseLeave={() => logoutIconRef.current?.stopAnimation()}
            className="flex cursor-pointer items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogoutIcon ref={logoutIconRef} size={13} />
            disconnect
          </button>
        </div>
      )}
      <div className="relative">
        <Textarea
          placeholder={
            chatSession
              ? "message your agent..."
              : "an agent that summarizes github issues..."
          }
          value={input}
          maxLength={MAX_INPUT_LENGTH}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
          className="min-h-28 resize-none rounded-md border-0 bg-black/20 px-3 py-2.5 pr-14 font-mono text-sm shadow-none focus-visible:ring-1"
        />
        <span
          className={`pointer-events-none absolute right-3 bottom-2.5 font-mono text-[11px] tabular-nums transition-colors ${
            nearLimit ? "text-red-400" : "text-muted-foreground/60"
          }`}
        >
          {input.length}/{MAX_INPUT_LENGTH}
        </span>
      </div>
      <Button
        type="submit"
        disabled={submitting || input.trim().length === 0}
        className="w-full cursor-pointer"
      >
        {submitting && <Spinner className="size-4" />}
        <span className="animate-in fade-in duration-300">
          {chatSession
            ? status === "streaming"
              ? "sending"
              : "send"
            : busy
              ? "generating agent"
              : "generate agent"}
        </span>
      </Button>
    </form>
  );

  return (
    <div className="relative flex h-screen w-full overflow-hidden">
      <TopBar
        hideOnMobile={panelOpen}
        onLogoClick={resetSession}
        rightSlot={
          <button
            onClick={openInfo}
            onMouseEnter={() => circleHelpIconRef.current?.startAnimation()}
            onMouseLeave={() => circleHelpIconRef.current?.stopAnimation()}
            aria-label="about tryeve"
            className="cursor-pointer text-muted-foreground opacity-90 transition-opacity hover:opacity-100 hover:text-foreground"
          >
            <CircleHelpIcon ref={circleHelpIconRef} size={16} />
          </button>
        }
      />

      <div
        className={`flex h-full flex-col transition-[width] duration-300 ease-in-out ${
          panelOpen ? "w-full md:w-1/2" : "w-full"
        }`}
      >
        {restoring ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-16 sm:px-6">
            <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
              <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                describe an agent. get a working one.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                no install, no terminal. built, tested, and ready to talk to,
                right here.
              </p>

              <div className="mt-10 w-full">{inputBar}</div>
            </div>
          </div>
        ) : (
          <>
            <Conversation className="flex-1 pt-12">
              <ConversationContent className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6">
                {messages.map((message) => {
                  if (message.role === "user") {
                    return (
                      <div key={message.id} className="flex justify-end">
                        <div className="max-w-[85%] bg-black! px-3 py-1.5 font-mono text-sm text-white rounded-lg! shadow-sm">
                          {message.text}
                        </div>
                      </div>
                    );
                  }

                  const files = parseFiles(message.text);
                  const state = testStatus[message.id];
                  const finishedTesting =
                    state === "passed" || state === "failed";
                  const isThisChat = chatSession?.agentMessageId === message.id;

                  return (
                    <div key={message.id} className="flex flex-col gap-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                          {`${files.length} file${files.length !== 1 ? "s" : ""} generated`}
                          {finishedTesting && (
                            <span
                              className={
                                state === "passed"
                                  ? "text-emerald-500"
                                  : "text-red-400"
                              }
                            >
                              ·{" "}
                              {state === "passed"
                                ? "tests passed"
                                : "tests failed"}
                            </span>
                          )}
                        </p>

                        {finishedTesting && (
                          <div className="flex items-center gap-4 sm:gap-3.5">
                            <button
                              onClick={() => downloadZip(files)}
                              onMouseEnter={() =>
                                downloadIconRefs.current
                                  .get(message.id)
                                  ?.startAnimation()
                              }
                              onMouseLeave={() =>
                                downloadIconRefs.current
                                  .get(message.id)
                                  ?.stopAnimation()
                              }
                              className="flex cursor-pointer items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <DownloadIcon
                                ref={(el) => {
                                  if (el)
                                    downloadIconRefs.current.set(
                                      message.id,
                                      el,
                                    );
                                  else
                                    downloadIconRefs.current.delete(message.id);
                                }}
                                size={14}
                              />
                              download
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `${window.location.origin}/agent/${message.shareId}`,
                                );
                                toast.success("link copied to your clipboard");
                              }}
                              onMouseEnter={() =>
                                linkIconRefs.current
                                  .get(message.id)
                                  ?.startAnimation()
                              }
                              onMouseLeave={() =>
                                linkIconRefs.current
                                  .get(message.id)
                                  ?.stopAnimation()
                              }
                              className="flex cursor-pointer items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <LinkIcon
                                ref={(el) => {
                                  if (el)
                                    linkIconRefs.current.set(message.id, el);
                                  else linkIconRefs.current.delete(message.id);
                                }}
                                size={14}
                              />
                              share
                            </button>
                            <button
                              onClick={() => startChat(message)}
                              disabled={
                                chatLoadingId === message.id || isThisChat
                              }
                              onMouseEnter={() =>
                                botIconRefs.current
                                  .get(message.id)
                                  ?.startAnimation()
                              }
                              onMouseLeave={() =>
                                botIconRefs.current
                                  .get(message.id)
                                  ?.stopAnimation()
                              }
                              className="flex cursor-pointer items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            >
                              {chatLoadingId === message.id ? (
                                <Spinner className="size-3.5" />
                              ) : isThisChat ? (
                                <CheckIcon
                                  size={14}
                                  className="text-emerald-500"
                                />
                              ) : (
                                <BotMessageSquareIcon
                                  ref={(el) => {
                                    if (el)
                                      botIconRefs.current.set(message.id, el);
                                    else botIconRefs.current.delete(message.id);
                                  }}
                                  size={14}
                                />
                              )}
                              {chatLoadingId === message.id
                                ? "connecting"
                                : isThisChat
                                  ? "connected"
                                  : "connect"}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {files.map((file, idx) => {
                          const key = `${message.id}-${idx}`;
                          return (
                            <button
                              key={file.filename}
                              onClick={() => openFile(message.id, idx)}
                              onMouseEnter={() =>
                                checkIconRefs.current.get(key)?.startAnimation()
                              }
                              onMouseLeave={() =>
                                checkIconRefs.current.get(key)?.stopAnimation()
                              }
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/40 bg-background px-2.5 py-1 font-mono text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              {file.filename}
                              <CheckIcon
                                ref={(el) => {
                                  if (el) checkIconRefs.current.set(key, el);
                                  else checkIconRefs.current.delete(key);
                                }}
                                size={16}
                                className="text-muted-foreground/70"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <AgentConversation messages={agentMessages} status={status} />
                {busy && (
                  <Task defaultOpen className="font-mono text-sm">
                    <TaskTrigger title="building your agent" />
                    <TaskContent>
                      <TaskItem>
                        <span className="flex items-center gap-2">
                          {phase === "generating" ? (
                            <Spinner className="size-3" />
                          ) : (
                            <CheckIcon
                              size={12}
                              className="text-muted-foreground"
                            />
                          )}
                          {phase === "generating" ? (
                            <Shimmer duration={1.5}>
                              generating agent files
                            </Shimmer>
                          ) : (
                            "generating agent files"
                          )}
                        </span>
                      </TaskItem>
                      <TaskItem>
                        <span className="flex items-center gap-2">
                          {phase === "testing" ? (
                            <Spinner className="size-3" />
                          ) : (
                            <div className="size-2 rounded-full border border-muted-foreground/30" />
                          )}
                          {phase === "testing" ? (
                            <Shimmer duration={1.5}>
                              running sandbox test
                            </Shimmer>
                          ) : (
                            <span className="text-muted-foreground/50">
                              running sandbox test
                            </span>
                          )}
                        </span>
                      </TaskItem>
                    </TaskContent>
                  </Task>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className="bg-transparent! mx-auto w-full max-w-2xl p-4">
              {inputBar}
            </div>
          </>
        )}
      </div>

      <div
        className={`fixed inset-0 z-20 flex h-full flex-col bg-background transition-transform duration-300 ease-in-out will-change-transform ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        } md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-[width] md:duration-300 md:ease-in-out md:border-l md:border-border/60 ${
          panelOpen ? "md:w-1/2" : "md:w-0"
        }`}
      >
        {panelOpen && (
          <button
            onClick={closePanel}
            onMouseEnter={() => chevronRightIconRef.current?.startAnimation()}
            onMouseLeave={() => chevronRightIconRef.current?.stopAnimation()}
            aria-label="collapse panel"
            className="absolute top-1/2 -left-3 z-40 hidden h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground md:flex"
          >
            <ChevronRightIcon ref={chevronRightIconRef} size={12} />
          </button>
        )}

        <div className="h-full w-full overflow-hidden">
          {(panelFile && selectedFile) || showInfo ? (
            <div
              className={`relative flex h-full min-w-0 flex-col transition-opacity duration-200 ease-in-out ${
                panelOpen ? "opacity-100 delay-100" : "opacity-0 md:opacity-100"
              }`}
            >
              <PanelGlow />

              <div className="relative z-10 flex items-center justify-between border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={closePanel}
                    onMouseEnter={() =>
                      chevronLeftIconRef.current?.startAnimation()
                    }
                    onMouseLeave={() =>
                      chevronLeftIconRef.current?.stopAnimation()
                    }
                    className="cursor-pointer text-muted-foreground hover:text-foreground md:hidden"
                    aria-label="back"
                  >
                    <ChevronLeftIcon ref={chevronLeftIconRef} size={16} />
                  </button>
                  <span className="truncate font-mono text-sm font-medium">
                    {showInfo ? "tryeve/about.md" : panelFile?.filename}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={closePanel}
                    onMouseEnter={() => xIconRef.current?.startAnimation()}
                    onMouseLeave={() => xIconRef.current?.stopAnimation()}
                    className="cursor-pointer text-muted-foreground hover:text-foreground"
                    aria-label="close"
                  >
                    <XIcon ref={xIconRef} size={16} />
                  </button>
                </div>
              </div>

              {showInfo ? (
                <div className="relative z-10 flex-1 overflow-auto px-6 py-8">
                  <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
                    <div>
                      <p className="font-mono text-sm font-medium">tryeve</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        ↳ a free, browser-based tool that builds, tests, and
                        runs a real eve agent from a plain description, no
                        install, no terminal.
                      </p>
                    </div>

                    <div>
                      <p className="mb-4 font-mono text-xs tracking-wide text-muted-foreground">
                        features
                      </p>
                      <ul className="flex flex-col gap-2.5">
                        {FEATURES.map((feature) => (
                          <li
                            key={feature}
                            className="font-mono text-xs leading-relaxed text-foreground/80"
                          >
                            ↳ {feature}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="mb-3 flex items-center gap-1.5">
                        <p className="font-mono text-xs tracking-wide text-muted-foreground">
                          built with
                        </p>
                        <VercelMark
                          size={10}
                          className="translate-y-px opacity-70"
                        />
                        <p className="font-mono text-xs tracking-wide text-muted-foreground">
                          products
                        </p>
                      </div>
                      <div className="flex flex-col gap-2.5">
                        {VERCEL_PRODUCTS.map((p) => (
                          <p
                            key={p.name}
                            className="font-mono text-xs leading-relaxed text-foreground/80"
                          >
                            ↳{" "}
                            <span className="font-medium text-foreground/90">
                              {p.name}
                            </span>
                            <span className="text-muted-foreground">
                              : {p.description}
                            </span>
                          </p>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2">
                      <div className="h-px bg-linear-to-r from-transparent via-border to-transparent" />
                      <p className="mt-4 text-xs text-muted-foreground">
                        icons animated by{" "}
                        <a
                          href="https://lucide-animated.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-border underline-offset-2 transition-colors hover:text-foreground"
                        >
                          lucide-animated
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative z-10 flex-1 overflow-auto px-6 py-4">
                  <Streamdown plugins={{ code }} className="text-xs">
                    {`\`\`\`${panelFile?.filename.endsWith(".md") ? "markdown" : "ts"}\n${panelFile?.content}\n\`\`\``}
                  </Streamdown>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
