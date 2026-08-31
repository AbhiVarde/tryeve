"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { CheckIcon, type CheckIconHandle } from "@/components/ui/check";
import {
  FileTextIcon,
  type FileTextIconHandle,
} from "@/components/ui/file-text";
import {
  DownloadIcon,
  type DownloadIconHandle,
} from "@/components/ui/download";
import { LinkIcon, type LinkIconHandle } from "@/components/ui/link";
import {
  RefreshCWIcon,
  type RefreshCCWIconWIcon,
} from "@/components/ui/refresh-cw";
import {
  ChevronLeftIcon,
  type ChevronLeftIconHandle,
} from "@/components/ui/chevron-left";
import {
  ChevronRightIcon,
  type ChevronRightIconHandle,
} from "@/components/ui/chevron-right";
import { HistoryIcon, type HistoryIconHandle } from "@/components/ui/history";
import {
  LayoutGridIcon,
  type LayoutGridIconHandle,
} from "@/components/ui/layout-grid";
import { LayersIcon, type LayersIconHandle } from "@/components/ui/layers";
import {
  BotMessageSquareIcon,
  type BotMessageSquareHandle,
} from "@/components/ui/bot-message-square";
import { LogoutIcon, type LogoutIconHandle } from "@/components/ui/logout";
import { GithubIcon, type GithubIconHandle } from "@/components/ui/github";
import {
  CornerDownRightIcon,
  type CornerDownRightIconHandle,
} from "@/components/ui/corner-down-right";
import { DeleteIcon, type DeleteIconHandle } from "@/components/ui/delete";
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
  useTranscriptSync,
  AgentConversation,
  type AgentSession,
  type StoredMessage,
} from "@/components/agent-chat-panel";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClockIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getConnectionEnvVars } from "@/app/lib/eve-connections";
import { ArrowUpIcon } from "@/components/ui/arrow-up";

type FileBlock = { filename: string; content: string };
type TestState = "testing" | "passed" | "failed" | "skipped" | null;
type TestResult = {
  state: TestState;
  error?: string;
  missingConnectionEnv?: string[];
};
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  kind: "generate" | "chat";
  shareId?: string;
  sandboxName?: string;
  url?: string;
  repoUrl?: string;
};
type ChatSession = AgentSession & { agentMessageId: string };
type HistoryEntry = { id: string; prompt: string; createdAt: string };

const MAX_INPUT_LENGTH = 500;
const MIN_PROMPT_LENGTH = 12;

const GENERATE_MESSAGES = [
  "generating agent files...",
  "writing instructions...",
  "shaping tool schemas...",
  "almost done generating...",
];

const FEATURE_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "build & test",
    items: [
      "describe an agent in plain english",
      "generates real, working eve files",
      "connects to real services over mcp when you name one, like linear or notion",
      "adds a skills file and an eval file when the request calls for it",
      "tested live against your actual request before you see it",
      "generation and testing run as one durable step, survives crashes",
      "if a build fails, the reason is shown and you can retry with one click",
      "refine an existing agent with a follow-up instead of starting over",
    ],
  },
  {
    label: "deploy & own it",
    items: [
      "inspect every file with syntax highlighting",
      "export the full agent as a zip",
      "deploy any agent straight to your own GitHub, one-time authorization",
      "deploy that same agent to your own vercel account too, live in seconds",
    ],
  },
  {
    label: "chat & share",
    items: [
      "connect to your agent right after it's built, no install needed",
      "chat with it live, with markdown-formatted replies",
      "share a live link, anyone with it can chat with your agent directly",
      "your chat history is saved, reopening an agent restores the real conversation",
    ],
  },
  {
    label: "reliability & privacy",
    items: [
      "generated code runs sandboxed, network access locked to only what it needs",
      "reload the page anytime, your agent and chat pick up right where you left off",
      "switching tabs never disconnects your agent, only real exits do",
      "dead share links reconnect automatically, no dead ends",
      "warned before disconnect, never cut off without notice",
      "idle or closed sandboxes shut down automatically, nothing left running",
      "only you can overwrite or stop your own agent, others can still chat with it",
      "concurrent sandboxes are capped per visitor to keep usage fair for everyone",
      "your history is private, delete any entry or clear it all",
    ],
  },
];

const VERCEL_PRODUCTS: { name: string; description: string }[] = [
  {
    name: "eve",
    description: "the agent framework every generated agent runs on",
  },
  { name: "next.js", description: "the app itself" },
  { name: "ai gateway", description: "routes generation to a model" },
  { name: "ai sdk", description: "streams the model's response" },
  {
    name: "sandbox",
    description:
      "tests and runs each agent live, network-locked to only what it needs",
  },
  {
    name: "workflow sdk",
    description: "runs generate + test as one durable step",
  },
  { name: "blob", description: "stores agents, sessions, and chat history" },
  { name: "cron", description: "sweeps stale sandbox sessions" },
  {
    name: "observability",
    description: "traces the sandbox pipeline for failures",
  },
  {
    name: "firewall",
    description: "rate limits generation, connect, and chat",
  },
  {
    name: "connect",
    description: "issues scoped GitHub tokens to push generated files",
  },
  {
    name: "vercel oauth",
    description:
      "deploys agents straight to a user's own vercel account, no token of mine involved",
  },
  {
    name: "botid",
    description: "blocks bot traffic on generation, invisible to real users",
  },
  {
    name: "flags sdk",
    description: "flips the model or pauses generation live, no redeploy",
  },
  { name: "ai elements", description: "chat ui, progress, and loading states" },
  { name: "streamdown", description: "renders code and markdown cleanly" },
  { name: "shadcn/ui", description: "every ui component" },
  { name: "vercel", description: "hosts and deploys the app" },
  {
    name: "analytics",
    description: "tracks usage without slowing things down",
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

  if (blocks.length > 0) return blocks;

  const markerRegex = /(?:\/\/|#)\s*filename:\s*(.+)/g;
  const markers: { filename: string; index: number }[] = [];
  let m;
  while ((m = markerRegex.exec(raw)) !== null) {
    markers.push({ filename: m[1].trim(), index: m.index });
  }

  for (let j = 0; j < markers.length; j++) {
    const start = raw.indexOf("\n", markers[j].index) + 1;
    const end = j + 1 < markers.length ? markers[j + 1].index : raw.length;
    blocks.push({
      filename: markers[j].filename,
      content: raw.slice(start, end).trim(),
    });
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

  const connectionEnvVars = getConnectionEnvVars(files);

  zip.file(
    "README.md",
    `# your eve agent

built and tested with [tryeve](https://tryeve.abhivarde.in), an agent runtime for [eve](https://eve.dev).

## run it

\`\`\`
npm install
npm run dev
\`\`\`
${
  connectionEnvVars.length > 0
    ? `
## before this works

this agent connects to a real external service, set these first:

\`\`\`
${connectionEnvVars.map((v) => `${v}=`).join("\n")}
\`\`\`
`
    : ""
}
## structure

- \`agent/instructions.md\` defines what this agent does
- \`agent/agent.ts\` sets the model, only present if the agent needs a specific one
- \`agent/tools/\` contains typed tools the agent can call, the filename is the tool name

eve reads everything under \`agent/\` automatically, no registration needed.
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

function formatRelativeTime(dateString: string) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatPauseMessage(reason: string | null) {
  if (!reason) return "generation is temporarily unavailable, check back soon";

  const match = reason.match(/(\d{4}-\d{2}-\d{2})T/);
  if (match) {
    const date = new Date(match[1]);
    const formatted = date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
    });
    return `generation is paused while usage resets, back on ${formatted}`;
  }

  return "generation is temporarily unavailable, check back soon";
}

function groupHistory(entries: HistoryEntry[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const buckets: Record<string, HistoryEntry[]> = {
    today: [],
    yesterday: [],
    "this week": [],
    earlier: [],
  };

  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    if (d >= startOfToday) buckets.today.push(entry);
    else if (d >= startOfYesterday) buckets.yesterday.push(entry);
    else if (d >= startOfWeek) buckets["this week"].push(entry);
    else buckets.earlier.push(entry);
  }

  return Object.entries(buckets).filter(([, v]) => v.length > 0);
}

function useIconRefs<
  T extends { startAnimation: () => void; stopAnimation: () => void },
>() {
  const refs = useRef<Map<string, T>>(new Map());

  function setRef(key: string) {
    return (el: T | null) => {
      if (el) refs.current.set(key, el);
      else refs.current.delete(key);
    };
  }

  function onEnter(key: string) {
    return () => refs.current.get(key)?.startAnimation();
  }

  function onLeave(key: string) {
    return () => refs.current.get(key)?.stopAnimation();
  }

  return { setRef, onEnter, onLeave };
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
  const [showFeatures, setShowFeatures] = useState(false);
  const [showBuiltWith, setShowBuiltWith] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hoveredHistoryId, setHoveredHistoryId] = useState<string | null>(null);

  const [refineInput, setRefineInput] = useState("");
  const [testStatus, setTestStatus] = useState<Record<string, TestResult>>({});

  const [panelFile, setPanelFile] = useState<FileBlock | null>(null);
  const lastFileKey = useRef<string | null>(null);

  const downloadIcons = useIconRefs<DownloadIconHandle>();
  const linkIcons = useIconRefs<LinkIconHandle>();
  const fileChipIcons = useIconRefs<FileTextIconHandle>();
  const historyRowIcons = useIconRefs<CornerDownRightIconHandle>();
  const retryIcons = useIconRefs<RefreshCCWIconWIcon>();
  const deleteIcons = useIconRefs<DeleteIconHandle>();

  const connectPromptIconRef = useRef<BotMessageSquareHandle>(null);
  const deployIconRef = useRef<GithubIconHandle>(null);
  const chevronLeftIconRef = useRef<ChevronLeftIconHandle>(null);
  const chevronRightIconRef = useRef<ChevronRightIconHandle>(null);
  const featuresIconRef = useRef<LayoutGridIconHandle>(null);
  const builtWithIconRef = useRef<LayersIconHandle>(null);
  const historyIconRef = useRef<HistoryIconHandle>(null);
  const logoutIconRef = useRef<LogoutIconHandle>(null);

  const [phase, setPhase] = useState<"generating" | "testing" | null>(null);
  const [systemPaused, setSystemPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<string | null>(null);
  const [genMsgIndex, setGenMsgIndex] = useState(0);

  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);
  const [deployingId, setDeployingId] = useState<string | null>(null);
  const [vercelDeployingId, setVercelDeployingId] = useState<string | null>(
    null,
  );
  const [vercelLinks, setVercelLinks] = useState<Record<string, string>>({});
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [chatKey, setChatKey] = useState(() => crypto.randomUUID());
  const [initialMessages, setInitialMessages] = useState<
    StoredMessage[] | null
  >(null);

  const {
    messages: agentMessages,
    sendMessage,
    status,
  } = useAgentChat(
    chatSession,
    (patch) => setChatSession((prev) => (prev ? { ...prev, ...patch } : prev)),
    chatSession?.sandboxName ?? chatKey,
    initialMessages,
  );

  const activeShareId = chatSession
    ? messages.find((m) => m.id === chatSession.agentMessageId)?.shareId
    : undefined;
  useTranscriptSync(activeShareId, agentMessages, status);

  const panelOpen =
    !!selectedFile || showFeatures || showBuiltWith || showHistory;

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

    window.addEventListener("beforeunload", stopActiveSandbox);

    return () => {
      window.removeEventListener("beforeunload", stopActiveSandbox);
    };
  }, []);

  useEffect(() => {
    if (!chatSession) return;

    const warnTimer = setTimeout(
      () => {
        toast.warning("disconnecting in 1 minute due to inactivity", {
          duration: 10000,
        });
      },
      4 * 60 * 1000,
    );

    const disconnectTimer = setTimeout(
      () => {
        fetch("/api/stop-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxName: chatSession.sandboxName }),
        });
        setChatSession(null);
        toast.info("disconnected after 5 minutes of inactivity");
      },
      5 * 60 * 1000,
    );

    return () => {
      clearTimeout(warnTimer);
      clearTimeout(disconnectTimer);
    };
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
    fetch("/api/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.paused) {
          setSystemPaused(true);
          setPauseReason(data.reason ?? null);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const shareId = searchParams.get("a");
    if (!shareId) {
      setRestoring(false);
      return;
    }

    let cancelled = false;

    fetch(`/agent/${shareId}/raw`)
      .then((res) => (res.ok ? res.json() : null))
      .then(
        async (
          data: {
            prompt: string;
            code: string;
            missingConnectionEnv?: string[];
          } | null,
        ) => {
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
          const missingConnectionEnv = data.missingConnectionEnv ?? [];
          setTestStatus((prev) => ({
            ...prev,
            [assistantId]:
              missingConnectionEnv.length > 0
                ? { state: "skipped", missingConnectionEnv }
                : { state: "passed" },
          }));

          fetch(`/agent/${shareId}/raw?repo=1`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data: { repoUrl?: string } | null) => {
              if (cancelled || !data?.repoUrl) return;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, repoUrl: data.repoUrl } : m,
                ),
              );
            })
            .catch(() => {});

          fetch(`/agent/${shareId}/raw?vercel=1`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data: { liveUrl?: string } | null) => {
              if (cancelled || !data?.liveUrl) return;
              setVercelLinks((prev) => ({
                ...prev,
                [assistantId]: data.liveUrl!,
              }));
            })
            .catch(() => {});

          try {
            const transcriptRes = await fetch(
              `/agent/${shareId}/raw?transcript=1`,
            );
            const transcript: StoredMessage[] = transcriptRes.ok
              ? await transcriptRes.json()
              : [];
            if (!cancelled) setInitialMessages(transcript);

            const sessionRes = await fetch(`/agent/${shareId}/raw?session=1`);
            let session: { sandboxName: string; url: string } | null = null;
            let alive = false;

            if (sessionRes.ok) {
              const parsed = (await sessionRes.json()) as {
                sandboxName: string;
                url: string;
              };
              session = parsed;
              alive = await fetch("/api/ping-agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: parsed.url }),
              })
                .then((r) => r.json())
                .then((d) => d.alive)
                .catch(() => false);
            }

            if (!alive) {
              const reviveRes = await fetch("/api/revive-agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ shareId }),
              });
              const revived = await reviveRes.json().catch(() => null);
              if (!revived?.ok) return;
              session = { sandboxName: revived.sandboxName, url: revived.url };
            }

            if (cancelled || !session) return;
            const finalSession = session;
            setChatSession({
              agentMessageId: assistantId,
              url: finalSession.url,
              sandboxName: finalSession.sandboxName,
              sessionId: null,
              continuationToken: null,
              turnCount: 0,
            });
          } catch {
            setChatSession((prev) => prev);
          }
        },
      )
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  function resetSession() {
    if (busy) return;
    if (chatSession) {
      endChat();
    }
    setMessages([]);
    setSelectedFile(null);
    setPanelFile(null);
    setShowFeatures(false);
    setShowBuiltWith(false);
    setChatSession(null);
    setChatKey(crypto.randomUUID());
    setInitialMessages(null);
    setTestStatus({});
    setInput("");
    setShowGenerateForm(false);
    router.replace("/");
  }

  function startNewAgent() {
    if (busy) return;
    if (chatSession) {
      endChat();
    }
    setMessages([]);
    setSelectedFile(null);
    setPanelFile(null);
    setShowFeatures(false);
    setShowBuiltWith(false);
    setShowHistory(false);
    setTestStatus({});
    setInput("");
    setShowGenerateForm(true);
    setChatKey(crypto.randomUUID());
    router.replace("/");
  }

  function openFile(messageId: string, index: number) {
    setShowFeatures(false);
    setShowBuiltWith(false);
    setShowHistory(false);
    setSelectedFile({ messageId, index });
  }

  function openFeatures() {
    setSelectedFile(null);
    setShowHistory(false);
    setShowBuiltWith(false);
    setShowFeatures((prev) => !prev);
  }

  function openBuiltWith() {
    setSelectedFile(null);
    setShowHistory(false);
    setShowFeatures(false);
    setShowBuiltWith((prev) => !prev);
  }

  function openHistory() {
    setSelectedFile(null);
    setShowFeatures(false);
    setShowBuiltWith(false);
    const next = !showHistory;
    setShowHistory(next);

    if (next && !historyLoading) {
      setHistoryLoading(true);
      fetch("/api/agents")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => setHistory(Array.isArray(data) ? data : []))
        .catch(() => toast.error("couldn't load history, try again"))
        .finally(() => setHistoryLoading(false));
    }
  }

  function clearViewedAgent() {
    setMessages([]);
    setSelectedFile(null);
    setPanelFile(null);
    setTestStatus({});
    setInitialMessages(null);
    router.replace("/");
  }

  async function deleteHistoryEntry(id: string) {
    setHistory((prev) => prev.filter((entry) => entry.id !== id));

    const isCurrentlyViewed = searchParams.get("a") === id;

    if (isCurrentlyViewed) {
      if (chatSession) {
        endChat();
        setChatKey(crypto.randomUUID());
      }
      clearViewedAgent();
    }

    try {
      await fetch("/api/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      toast.error("couldn't remove that entry");
    }
  }

  async function clearAllHistory() {
    setHistory([]);

    if (searchParams.get("a")) {
      if (chatSession) {
        endChat();
        setChatKey(crypto.randomUUID());
      }
      clearViewedAgent();
    }

    try {
      await fetch("/api/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      toast.success("history cleared");
    } catch {
      toast.error("couldn't clear history, try again.");
    }
  }

  function closePanel() {
    setSelectedFile(null);
    setShowFeatures(false);
    setShowBuiltWith(false);
    setShowHistory(false);
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

  function openAuthPopupAndRetry(
    url: string,
    windowName: string,
    onDone: () => void,
  ) {
    const width = 520;
    const height = 680;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

    const popupRef = window.open(
      url,
      windowName,
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (!popupRef) {
      toast.error("popup blocked, allow popups and try again");
      setDeployingId(null);
      setVercelDeployingId(null);
      return;
    }

    const popup: Window = popupRef;

    toast.info("authorize in the popup, we'll continue automatically");

    let fired = false;
    const finish = () => {
      if (fired) return;
      fired = true;
      clearInterval(closeTimer);
      window.removeEventListener("focus", onFocus);
      onDone();
    };

    const closeTimer = setInterval(() => {
      if (popup.closed) finish();
    }, 500);

    function onFocus() {
      setTimeout(() => {
        if (popup.closed || fired) finish();
      }, 400);
    }
    window.addEventListener("focus", onFocus);
  }

  async function deployToGithub(message: Message) {
    setDeployingId(message.id);
    try {
      const promptMsg = messages.find(
        (m) =>
          m.role === "user" &&
          messages[messages.indexOf(m) + 1]?.id === message.id,
      );

      const res = await fetch("/api/github/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptMsg?.text ?? "generated agent",
          code: message.text,
          shareId: message.shareId,
        }),
      });
      const data = await res.json();

      if (data.needsAuth && data.authorizeUrl) {
        openAuthPopupAndRetry(data.authorizeUrl, "tryeve-github-auth", () =>
          deployToGithub(message),
        );
        return;
      }

      if (!data.ok) {
        toast.error(data.error ?? "deploy failed, please try again");
        return;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, repoUrl: data.repoUrl } : m,
        ),
      );

      toast.success("deployed to GitHub");
    } catch {
      toast.error("couldn't reach GitHub, check your connection");
    } finally {
      setDeployingId(null);
    }
  }

  async function deployToVercel(message: Message) {
    if (vercelLinks[message.id]) {
      window.open(vercelLinks[message.id], "_blank");
      return;
    }

    if (!message.repoUrl) {
      toast.error("deploy to github first", {
        description: "vercel deploy pushes from your github repo",
      });
      return;
    }

    setVercelDeployingId(message.id);
    try {
      const promptMsg = messages.find(
        (m) =>
          m.role === "user" &&
          messages[messages.indexOf(m) + 1]?.id === message.id,
      );

      const res = await fetch("/api/vercel/deploy-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptMsg?.text ?? "generated agent",
          code: message.text,
          shareId: message.shareId,
        }),
      });
      const data = await res.json();

      if (data.needsAuth && data.authorizeUrl) {
        openAuthPopupAndRetry(data.authorizeUrl, "tryeve-vercel-auth", () =>
          deployToVercel(message),
        );
        return;
      }

      if (!data.ok) {
        toast.error(data.error ?? "couldn't deploy to vercel");
        return;
      }

      setVercelLinks((prev) => ({ ...prev, [message.id]: data.liveUrl }));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, repoUrl: data.repoUrl } : m,
        ),
      );
      window.open(data.liveUrl, "_blank");
      toast.success("deployed, your agent is live");
    } catch {
      toast.error("couldn't reach vercel, check your connection");
    } finally {
      setVercelDeployingId(null);
    }
  }

  async function startChat(message: Message) {
    setChatLoadingId(message.id);

    try {
      if (message.sandboxName && message.url) {
        const alive = await fetch("/api/ping-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: message.url }),
        })
          .then((r) => r.json())
          .then((d) => d.alive)
          .catch(() => false);

        if (alive) {
          setChatSession({
            agentMessageId: message.id,
            url: message.url,
            sandboxName: message.sandboxName,
            sessionId: null,
            continuationToken: null,
            turnCount: 0,
          });
          setShowGenerateForm(false);
          return;
        }
      }

      const res = await fetch("/api/run-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: message.text, shareId: message.shareId }),
      });
      const data = await res.json();

      if (!data.ok) {
        toast.error(data.error ?? "couldn't reach your agent, try again");
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
      setShowGenerateForm(false);
    } catch {
      toast.error("connection failed, please try again");
    } finally {
      setChatLoadingId(null);
    }
  }

  async function generateAgent(prompt: string, previousCode?: string) {
    setBusy(true);
    setPhase("generating");
    setGenMsgIndex(0);

    const genMsgTimer = setInterval(() => {
      setGenMsgIndex((i) => Math.min(i + 1, GENERATE_MESSAGES.length - 1));
    }, 4000);
    const phaseTimer = setTimeout(() => setPhase("testing"), 16000);

    const assistantId = crypto.randomUUID();

    const fail = (error: string) => {
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", text: "", kind: "generate" },
      ]);
      setTestStatus((prev) => ({
        ...prev,
        [assistantId]: { state: "failed", error },
      }));

      fetch("/api/status")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.paused) {
            setSystemPaused(true);
            setPauseReason(data.reason ?? null);
          }
        })
        .catch(() => {});
    };

    try {
      const res = await fetch("/api/build-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, previousCode }),
      });

      const result = await res.json().catch(() => null);

      if (!res.ok || !result || result.error) {
        fail(result?.error ?? "couldn't build your agent, please try again");
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          text: result.code ?? "",
          kind: "generate",
          shareId: result.id,
          sandboxName: result.sandboxName ?? undefined,
          url: result.url ?? undefined,
        },
      ]);

      setTestStatus((prev) => ({
        ...prev,
        [assistantId]: {
          state: result.skipped
            ? "skipped"
            : result.passed
              ? "passed"
              : "failed",
          error: result.error,
          missingConnectionEnv: result.missingConnectionEnv ?? undefined,
        },
      }));

      if (result.id) {
        setHistory((prev) => [
          { id: result.id, prompt, createdAt: new Date().toISOString() },
          ...prev,
        ]);
      }

      setShowGenerateForm(false);
      if (result.id) router.replace(`/?a=${result.id}`);
    } catch {
      fail("network error, check your connection and try again");
    } finally {
      clearInterval(genMsgTimer);
      clearTimeout(phaseTimer);
      setBusy(false);
      setPhase(null);
      setGenMsgIndex(0);
    }
  }

  async function retryGenerate(prompt: string, messageId: string) {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    setTestStatus((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
    await generateAgent(prompt);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (systemPaused && !chatSession) {
      toast.error(
        pauseReason ?? "generation is temporarily paused, try again shortly",
      );
      return;
    }

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

    if (!chatSession && trimmed.length < MIN_PROMPT_LENGTH) {
      toast.error("describe what the agent should actually do");
      return;
    }

    setInput("");

    if (chatSession) {
      sendMessage({ text: trimmed });
      return;
    }

    setSelectedFile(null);
    setShowFeatures(false);
    setShowBuiltWith(false);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      kind: "generate",
    };

    setMessages((prev) => [...prev, userMessage]);
    await generateAgent(trimmed);
  }

  const remaining = MAX_INPUT_LENGTH - input.length;
  const nearLimit = remaining <= 40;
  const submitting = chatSession
    ? status === "streaming" || status === "submitted"
    : busy;

  const latestAssistantMessage =
    [...messages].reverse().find((m) => m.role === "assistant") ?? null;
  const latestState = latestAssistantMessage
    ? testStatus[latestAssistantMessage.id]?.state
    : null;
  const latestPassed = latestState === "passed";
  const latestSkipped = latestState === "skipped";
  const showConnectPrompt =
    latestPassed && !chatSession && !showGenerateForm && !busy;
  const showDeployOnlyPrompt =
    latestSkipped && !chatSession && !showGenerateForm && !busy;

  const inputBar =
    showConnectPrompt || showDeployOnlyPrompt ? (
      <div className="w-full space-y-2">
        {showDeployOnlyPrompt && (
          <p className="rounded-md bg-primary/5 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
            connects to a real service, needs{" "}
            {testStatus[
              latestAssistantMessage?.id ?? ""
            ]?.missingConnectionEnv?.join(", ")}{" "}
            to chat here, deploy it below to add credentials and talk to it live
          </p>
        )}
        {showConnectPrompt && (
          <Button
            type="button"
            onClick={() =>
              latestAssistantMessage && startChat(latestAssistantMessage)
            }
            disabled={chatLoadingId === latestAssistantMessage?.id}
            onMouseEnter={() => connectPromptIconRef.current?.startAnimation()}
            onMouseLeave={() => connectPromptIconRef.current?.stopAnimation()}
            className="w-full cursor-pointer"
          >
            {chatLoadingId === latestAssistantMessage?.id ? (
              <Spinner className="size-4" />
            ) : (
              <BotMessageSquareIcon ref={connectPromptIconRef} size={15} />
            )}
            <span className="animate-in fade-in duration-300">
              {chatLoadingId === latestAssistantMessage?.id
                ? "connecting..."
                : "connect to your agent"}
            </span>
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (latestAssistantMessage?.repoUrl) {
              window.open(latestAssistantMessage.repoUrl, "_blank");
            } else if (latestAssistantMessage) {
              deployToGithub(latestAssistantMessage);
            }
          }}
          disabled={deployingId === latestAssistantMessage?.id}
          onMouseEnter={() => deployIconRef.current?.startAnimation()}
          onMouseLeave={() => deployIconRef.current?.stopAnimation()}
          className="w-full cursor-pointer"
        >
          {deployingId === latestAssistantMessage?.id ? (
            <Spinner className="size-4" />
          ) : (
            <GithubIcon ref={deployIconRef} size={15} />
          )}
          <span className="animate-in fade-in duration-300">
            {deployingId === latestAssistantMessage?.id
              ? "deploying..."
              : latestAssistantMessage?.repoUrl
                ? "view on github"
                : "deploy to github"}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            latestAssistantMessage && deployToVercel(latestAssistantMessage)
          }
          disabled={vercelDeployingId === latestAssistantMessage?.id}
          className="w-full cursor-pointer"
        >
          {vercelDeployingId === latestAssistantMessage?.id ? (
            <Spinner className="size-4" />
          ) : (
            <VercelMark size={14} />
          )}
          <span className="animate-in fade-in duration-300">
            {vercelDeployingId === latestAssistantMessage?.id
              ? "deploying..."
              : latestAssistantMessage && vercelLinks[latestAssistantMessage.id]
                ? "try live version"
                : "deploy to vercel"}
          </span>
        </Button>
        <div className="relative">
          <Textarea
            placeholder="add a slack notification tool..."
            value={refineInput}
            maxLength={MAX_INPUT_LENGTH}
            onChange={(e) => setRefineInput(e.target.value)}
            className="min-h-11 resize-none rounded-full border-0 bg-black/20 py-2.5 pl-4 pr-11 font-mono text-sm shadow-none focus-visible:ring-1"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={busy || refineInput.trim().length === 0}
            onClick={() => {
              const trimmed = refineInput.trim();
              if (!trimmed || !latestAssistantMessage) return;
              setRefineInput("");
              setMessages((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  role: "user",
                  text: trimmed,
                  kind: "generate",
                },
              ]);
              generateAgent(trimmed, latestAssistantMessage.text);
            }}
            className="absolute right-1.5 top-1/2 size-8 -translate-y-1/2 cursor-pointer rounded-full hover:bg-white/10 disabled:opacity-40"
          >
            <ArrowUpIcon className="size-4" />
          </Button>
        </div>
        <button
          type="button"
          onClick={startNewAgent}
          className="mx-auto block cursor-pointer font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          or describe a new agent
        </button>
      </div>
    ) : (
      <form onSubmit={onSubmit} className="w-full space-y-2">
        {systemPaused && !chatSession && (
          <Alert className="border-border/60 bg-black/20 py-2.5">
            <ClockIcon className="size-3.5 text-muted-foreground" />
            <AlertDescription className="font-mono text-xs leading-relaxed text-muted-foreground">
              {formatPauseMessage(pauseReason)}
            </AlertDescription>
          </Alert>
        )}
        {chatSession && (
          <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2 font-mono text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              agent connected
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const agentMessage = messages.find(
                    (m) => m.id === chatSession.agentMessageId,
                  );
                  if (!agentMessage) return;
                  if (agentMessage.repoUrl) {
                    window.open(agentMessage.repoUrl, "_blank");
                  } else {
                    deployToGithub(agentMessage);
                  }
                }}
                disabled={deployingId === chatSession.agentMessageId}
                onMouseEnter={() => deployIconRef.current?.startAnimation()}
                onMouseLeave={() => deployIconRef.current?.stopAnimation()}
                className="flex cursor-pointer items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {deployingId === chatSession.agentMessageId ? (
                  <Spinner className="size-3" />
                ) : (
                  <GithubIcon ref={deployIconRef} size={13} />
                )}
                {deployingId === chatSession.agentMessageId
                  ? "deploying..."
                  : messages.find((m) => m.id === chatSession.agentMessageId)
                        ?.repoUrl
                    ? "view on github"
                    : "deploy"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const agentMessage = messages.find(
                    (m) => m.id === chatSession.agentMessageId,
                  );
                  if (agentMessage) deployToVercel(agentMessage);
                }}
                disabled={vercelDeployingId === chatSession.agentMessageId}
                className="flex cursor-pointer items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {vercelDeployingId === chatSession.agentMessageId ? (
                  <Spinner className="size-3" />
                ) : (
                  <VercelMark size={13} />
                )}
                {vercelDeployingId === chatSession.agentMessageId
                  ? "deploying..."
                  : vercelLinks[chatSession.agentMessageId]
                    ? "live"
                    : "vercel"}
              </button>
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
          </div>
        )}
        <div className="relative">
          <Textarea
            placeholder={
              systemPaused && !chatSession
                ? "generation is temporarily unavailable..."
                : chatSession
                  ? "message your agent..."
                  : "an agent that summarizes github issues..."
            }
            value={input}
            maxLength={MAX_INPUT_LENGTH}
            disabled={systemPaused && !chatSession}
            onChange={(e) =>
              setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className="min-h-28 resize-none rounded-md border-0 bg-black/20 px-3 py-2.5 pr-14 font-mono text-sm shadow-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
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
          disabled={
            submitting ||
            input.trim().length === 0 ||
            (systemPaused && !chatSession)
          }
          className="w-full cursor-pointer"
        >
          {submitting && <Spinner className="size-4" />}
          <span className="animate-in fade-in duration-300">
            {chatSession
              ? status === "streaming"
                ? "sending..."
                : "send"
              : busy
                ? "generating agent..."
                : "generate agent"}
          </span>
        </Button>
      </form>
    );

  return (
    <AppShell>
      <TopBar
        hideOnMobile={panelOpen}
        onLogoClick={resetSession}
        rightSlot={
          <div className="flex items-center gap-4">
            <button
              onClick={openHistory}
              onMouseEnter={() => historyIconRef.current?.startAnimation()}
              onMouseLeave={() => historyIconRef.current?.stopAnimation()}
              aria-label="past agents"
              className="cursor-pointer text-muted-foreground opacity-90 transition-opacity hover:opacity-100 hover:text-foreground"
            >
              <HistoryIcon ref={historyIconRef} size={16} />
            </button>
            <button
              onClick={openFeatures}
              onMouseEnter={() => featuresIconRef.current?.startAnimation()}
              onMouseLeave={() => featuresIconRef.current?.stopAnimation()}
              aria-label="features"
              className="cursor-pointer text-muted-foreground opacity-90 transition-opacity hover:opacity-100 hover:text-foreground"
            >
              <LayoutGridIcon ref={featuresIconRef} size={16} />
            </button>
            <button
              onClick={openBuiltWith}
              onMouseEnter={() => builtWithIconRef.current?.startAnimation()}
              onMouseLeave={() => builtWithIconRef.current?.stopAnimation()}
              aria-label="built with"
              className="cursor-pointer text-muted-foreground opacity-90 transition-opacity hover:opacity-100 hover:text-foreground"
            >
              <LayersIcon ref={builtWithIconRef} size={16} />
            </button>
          </div>
        }
      />

      <div
        className={`flex h-full flex-col transition-[width] duration-300 ease-in-out ${
          panelOpen ? "w-full md:w-1/2" : "w-full"
        }`}
      >
        {restoring || messages.length === 0 ? (
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-14 sm:px-6 sm:py-20">
            <div className="relative z-10 flex w-full max-w-xl flex-col items-center gap-5 text-center sm:gap-6">
              <Badge
                variant="outline"
                className="rounded-full px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
              >
                Agent Runtime
              </Badge>
              <div className="flex flex-col gap-2.5 sm:gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                  describe an agent. get a working one.
                </h1>
                <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                  tested against a live eve runtime, then deployed to your own
                  github and vercel.
                </p>
              </div>
              <div className="mt-3 w-full sm:mt-4">
                {restoring ? (
                  <div className="font-mono text-sm text-muted-foreground">
                    <Shimmer duration={1.5}>loading your agent...</Shimmer>
                  </div>
                ) : (
                  inputBar
                )}
              </div>
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
                  const result = testStatus[message.id];
                  const state = result?.state;
                  const finishedTesting =
                    state === "passed" ||
                    state === "failed" ||
                    state === "skipped";

                  return (
                    <div key={message.id} className="flex flex-col gap-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-1">
                          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                            {files.length === 0 && state === "failed"
                              ? "generation failed"
                              : `${files.length} file${files.length !== 1 ? "s" : ""} generated`}
                            {finishedTesting && files.length > 0 && (
                              <span
                                className={
                                  state === "passed"
                                    ? "text-emerald-500"
                                    : state === "skipped"
                                      ? "text-amber-400"
                                      : "text-red-400"
                                }
                              >
                                ·{" "}
                                {state === "passed"
                                  ? "tests passed"
                                  : state === "skipped"
                                    ? "connects to a real service"
                                    : "tests failed"}
                              </span>
                            )}
                          </p>
                          {state === "failed" && result?.error && (
                            <div className="flex flex-col gap-2">
                              <p className="font-mono text-xs text-red-400/80">
                                {result.error}
                              </p>
                              <button
                                onClick={() => {
                                  const messageIndex = messages.findIndex(
                                    (m) => m.id === message.id,
                                  );
                                  const userMsg = messages[messageIndex - 1];
                                  if (userMsg?.role === "user")
                                    retryGenerate(userMsg.text, message.id);
                                }}
                                disabled={busy}
                                onMouseEnter={retryIcons.onEnter(message.id)}
                                onMouseLeave={retryIcons.onLeave(message.id)}
                                className="flex w-fit cursor-pointer items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                              >
                                <RefreshCWIcon
                                  ref={retryIcons.setRef(message.id)}
                                  size={12}
                                />
                                retry
                              </button>
                            </div>
                          )}
                        </div>

                        {finishedTesting && files.length > 0 && (
                          <div className="flex items-center gap-4 sm:gap-3.5">
                            <button
                              onClick={() => downloadZip(files)}
                              onMouseEnter={downloadIcons.onEnter(message.id)}
                              onMouseLeave={downloadIcons.onLeave(message.id)}
                              className="flex cursor-pointer items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <DownloadIcon
                                ref={downloadIcons.setRef(message.id)}
                                size={14}
                              />
                              download
                            </button>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `${window.location.origin}/agent/${message.shareId}`,
                                );
                                toast.success("link copied", {
                                  description:
                                    "anyone with it can chat with your agent",
                                });
                              }}
                              onMouseEnter={linkIcons.onEnter(message.id)}
                              onMouseLeave={linkIcons.onLeave(message.id)}
                              className="flex cursor-pointer items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <LinkIcon
                                ref={linkIcons.setRef(message.id)}
                                size={14}
                              />
                              share
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
                              onMouseEnter={fileChipIcons.onEnter(key)}
                              onMouseLeave={fileChipIcons.onLeave(key)}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/40 bg-background px-2.5 py-1 font-mono text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <FileTextIcon
                                ref={fileChipIcons.setRef(key)}
                                size={13}
                                className="text-muted-foreground/70"
                              />
                              {file.filename}
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
                              {GENERATE_MESSAGES[genMsgIndex]}
                            </Shimmer>
                          ) : (
                            "generating agent files..."
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
                              running sandbox test...
                            </Shimmer>
                          ) : (
                            <span className="text-muted-foreground/50">
                              running sandbox test...
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
        } md:relative md:inset-auto md:z-auto md:transition-[width] md:duration-300 md:ease-in-out md:border-l md:border-border/60 ${
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
          {(panelFile && selectedFile) ||
          showFeatures ||
          showBuiltWith ||
          showHistory ? (
            <div
              className={`relative flex h-full min-w-0 flex-col transition-opacity duration-200 ease-in-out ${
                panelOpen ? "opacity-100 delay-100" : "opacity-0 md:opacity-100"
              }`}
            >
              <PanelGlow />

              <div className="relative z-10 flex items-center border-b border-border/60 px-6 py-4">
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
                    {showFeatures
                      ? "tryeve/features.md"
                      : showBuiltWith
                        ? "tryeve/stack.md"
                        : showHistory
                          ? "tryeve/history.md"
                          : panelFile?.filename}
                  </span>
                </div>
              </div>

              {showHistory ? (
                <div className="relative z-10 flex-1 overflow-auto px-6 py-8">
                  {!historyLoading && history.length > 0 && (
                    <div className="mx-auto mb-4 flex w-full max-w-xl justify-end">
                      <button
                        onClick={clearAllHistory}
                        className="cursor-pointer font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        clear all
                      </button>
                    </div>
                  )}
                  {historyLoading ? (
                    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
                      {Array.from({ length: 2 }).map((_, groupIdx) => (
                        <div key={groupIdx}>
                          <div className="mb-2 h-2.5 w-12 animate-pulse rounded bg-accent/40" />
                          <div className="flex flex-col gap-2.5 py-1">
                            {Array.from({ length: groupIdx === 0 ? 3 : 2 }).map(
                              (_, rowIdx) => (
                                <div
                                  key={rowIdx}
                                  className="flex items-baseline justify-between gap-4"
                                >
                                  <div
                                    className="h-3 animate-pulse rounded bg-accent/40"
                                    style={{ width: `${60 - rowIdx * 8}%` }}
                                  />
                                  <div className="h-2.5 w-10 shrink-0 animate-pulse rounded bg-accent/30" />
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                      <HistoryIcon
                        size={22}
                        className="text-muted-foreground/40"
                      />
                      <div>
                        <p className="font-mono text-sm text-foreground/80">
                          no agents yet
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          agents you build will show up here
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="mx-auto flex w-full max-w-xl flex-col gap-5"
                      onMouseLeave={() => setHoveredHistoryId(null)}
                    >
                      {groupHistory(history).map(([label, entries]) => (
                        <div key={label}>
                          <p className="mb-2 font-mono text-[11px] tracking-wide text-muted-foreground/70">
                            {label}
                          </p>
                          <ul className="flex flex-col">
                            {entries.map((entry) => {
                              const dimmed =
                                hoveredHistoryId !== null &&
                                hoveredHistoryId !== entry.id;

                              return (
                                <li
                                  key={entry.id}
                                  onMouseEnter={() =>
                                    setHoveredHistoryId(entry.id)
                                  }
                                  className={`group flex items-center gap-2 py-1.5 transition-opacity duration-200 ${
                                    dimmed ? "opacity-40" : "opacity-100"
                                  }`}
                                >
                                  <a
                                    href={`/?a=${entry.id}`}
                                    onMouseEnter={historyRowIcons.onEnter(
                                      entry.id,
                                    )}
                                    onMouseLeave={historyRowIcons.onLeave(
                                      entry.id,
                                    )}
                                    className="flex min-w-0 flex-1 items-baseline justify-between gap-4 font-mono text-xs leading-relaxed"
                                  >
                                    <span className="flex min-w-0 items-baseline gap-1.5 truncate text-foreground/80 group-hover:text-foreground">
                                      <CornerDownRightIcon
                                        ref={historyRowIcons.setRef(entry.id)}
                                        size={12}
                                        className="shrink-0 translate-y-px text-muted-foreground/60"
                                      />
                                      <span className="truncate">
                                        {entry.prompt}
                                      </span>
                                    </span>
                                    <span className="shrink-0 text-[11px] text-muted-foreground">
                                      {formatRelativeTime(entry.createdAt)}
                                    </span>
                                  </a>
                                  <button
                                    onClick={() => deleteHistoryEntry(entry.id)}
                                    onMouseEnter={deleteIcons.onEnter(entry.id)}
                                    onMouseLeave={deleteIcons.onLeave(entry.id)}
                                    className="shrink-0 cursor-pointer text-muted-foreground/50 transition-colors hover:text-foreground"
                                    aria-label="remove from history"
                                  >
                                    <DeleteIcon
                                      ref={deleteIcons.setRef(entry.id)}
                                      size={12}
                                    />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : showFeatures ? (
                <div className="relative z-10 flex-1 overflow-auto px-6 py-8">
                  <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
                    <div>
                      <p className="font-mono text-sm font-medium">
                        tryeve{" "}
                        <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
                          · Agent Runtime
                        </span>
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        ↳ tested against a live eve runtime, ready to talk
                        before you ever see it.
                      </p>
                    </div>

                    <div className="flex flex-col gap-4">
                      {FEATURE_GROUPS.map((group) => (
                        <div key={group.label}>
                          <p className="mb-2 font-mono text-[11px] text-muted-foreground/70">
                            {group.label}
                          </p>
                          <ul className="flex flex-col gap-1.5">
                            {group.items.map((feature) => (
                              <li
                                key={feature}
                                className="font-mono text-xs leading-relaxed text-foreground/80"
                              >
                                ↳ {feature}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : showBuiltWith ? (
                <div className="relative z-10 flex-1 overflow-auto px-6 py-8">
                  <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-6">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-mono text-sm font-medium">
                          built with
                        </p>
                        <VercelMark
                          size={11}
                          className="translate-y-px opacity-70"
                        />
                        <p className="font-mono text-sm font-medium">
                          products
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
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

                    <div className="mt-auto pt-6">
                      <div className="h-px bg-linear-to-r from-transparent via-border to-transparent" />
                      <div className="mt-4 flex flex-col items-center gap-2 text-xs text-muted-foreground sm:flex-row sm:justify-between">
                        <span>
                          icons animated by{" "}
                          <a
                            href="https://lucide-animated.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-border underline-offset-2 transition-colors hover:text-foreground"
                          >
                            lucide-animated
                          </a>
                        </span>
                        <span>
                          brought to you by{" "}
                          <a
                            href="https://abhivarde.in"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-border underline-offset-2 transition-colors hover:text-foreground"
                          >
                            abhivarde.in
                          </a>
                        </span>
                      </div>
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
    </AppShell>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
