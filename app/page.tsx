"use client";

import { useEffect, useRef, useState } from "react";
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
import { XIcon, type XIconHandle } from "@/components/ui/x";
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

type FileBlock = { filename: string; content: string };
type TestState = "testing" | "passed" | "failed" | null;
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  shareId?: string;
};

const MAX_INPUT_LENGTH = 500;

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

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "eve-agent.zip";
  a.click();
  URL.revokeObjectURL(url);
}

function VercelMark() {
  return (
    <svg
      viewBox="0 0 76 65"
      width={14}
      height={14}
      fill="currentColor"
      aria-hidden="true"
      className="text-foreground"
    >
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

function TopBar({
  hideOnMobile,
  onReset,
}: {
  hideOnMobile: boolean;
  onReset: () => void;
}) {
  return (
    <button
      onClick={onReset}
      aria-label="start over"
      className={`fixed top-0 left-0 z-30 items-center gap-2 px-6 py-4 opacity-90 transition-opacity hover:opacity-100 ${
        hideOnMobile ? "hidden md:flex" : "flex"
      }`}
    >
      <VercelMark />
      <span className="text-sm font-medium text-muted-foreground">/</span>
      <span className="font-mono text-sm font-medium tracking-tight">
        tryeve
      </span>
    </button>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    messageId: string;
    index: number;
  } | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, TestState>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const [panelFile, setPanelFile] = useState<FileBlock | null>(null);
  const lastFileKey = useRef<string | null>(null);

  // per-message refs so multiple generated agents in the thread don't share animation state
  const downloadIconRefs = useRef<Map<string, DownloadIconHandle>>(new Map());
  const linkIconRefs = useRef<Map<string, LinkIconHandle>>(new Map());
  const checkIconRefs = useRef<Map<string, CheckIconHandle>>(new Map());
  const chevronLeftIconRef = useRef<ChevronLeftIconHandle>(null);
  const xIconRef = useRef<XIconHandle>(null);

  const [phase, setPhase] = useState<"generating" | "testing" | null>(null);

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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function resetSession() {
    if (busy) return;
    setMessages([]);
    setSelectedFile(null);
    setPanelFile(null);
    setTestStatus({});
    setInput("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      toast.error("describe your agent first");
      return;
    }
    if (trimmed.length > MAX_INPUT_LENGTH) {
      toast.error(`keep it under ${MAX_INPUT_LENGTH} characters`);
      return;
    }

    setSelectedFile(null);
    setInput("");

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
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
          shareId: result.id,
        },
      ]);

      setTestStatus((prev) => ({
        ...prev,
        [assistantId]: result.passed ? "passed" : "failed",
      }));
    } catch {
      toast.error("something went wrong, try again");
    } finally {
      setBusy(false);
      setPhase(null);
    }
  }

  const remaining = MAX_INPUT_LENGTH - input.length;
  const nearLimit = remaining <= 40;

  const inputBar = (
    <form onSubmit={onSubmit} className="w-full space-y-2">
      <div className="relative">
        <Textarea
          placeholder="an agent that summarizes github issues..."
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
        disabled={busy || input.trim().length === 0}
        className="w-full"
      >
        {busy && <Spinner className="size-4" />}
        <span className="animate-in fade-in duration-300">
          {busy ? "generating agent" : "generate agent"}
        </span>
      </Button>
    </form>
  );

  return (
    <div className="relative flex h-screen w-full overflow-hidden">
      <TopBar hideOnMobile={!!selectedFile} onReset={resetSession} />

      <div
        className={`flex h-full flex-col transition-[width] duration-300 ease-in-out ${
          selectedFile ? "w-full md:w-1/2" : "w-full"
        }`}
      >
        {messages.length === 0 ? (
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-16 sm:px-6">
            <div className="pointer-events-none absolute top-0 left-1/2 h-125 w-175 -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/10 blur-3xl" />

            <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
              <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                describe an agent. get a working one.
              </h1>
              <p className="mt-3 max-w-sm text-sm text-muted-foreground">
                no install, no terminal. built and tested right here.
              </p>

              <div className="mt-10 w-full">{inputBar}</div>
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              className="flex-1 overflow-auto px-6 pt-16 pb-8"
            >
              <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
                {messages.map((message) => {
                  if (message.role === "user") {
                    return (
                      <div key={message.id} className="flex justify-end">
                        <div className="max-w-[85%] rounded-md bg-primary/10 px-3.5 py-2.5 font-mono text-sm">
                          {message.text}
                        </div>
                      </div>
                    );
                  }

                  const files = parseFiles(message.text);
                  const state = testStatus[message.id];
                  const finishedTesting =
                    state === "passed" || state === "failed";

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
                              className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
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
                                toast.success("link copied");
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
                              className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
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
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {files.map((file, idx) => {
                          const key = `${message.id}-${idx}`;
                          return (
                            <button
                              key={file.filename}
                              onClick={() =>
                                setSelectedFile({
                                  messageId: message.id,
                                  index: idx,
                                })
                              }
                              onMouseEnter={() =>
                                checkIconRefs.current.get(key)?.startAnimation()
                              }
                              onMouseLeave={() =>
                                checkIconRefs.current.get(key)?.stopAnimation()
                              }
                              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-black/30 px-2.5 py-1 font-mono text-xs transition-colors hover:bg-accent/50"
                            >
                              {file.filename}
                              <CheckIcon
                                ref={(el) => {
                                  if (el) checkIconRefs.current.set(key, el);
                                  else checkIconRefs.current.delete(key);
                                }}
                                size={16}
                                className="text-muted-foreground"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
              </div>
            </div>

            <div className="border-t border-border/60 px-6 py-4">
              <div className="mx-auto w-full max-w-xl">{inputBar}</div>
            </div>
          </>
        )}
      </div>

      <div
        className={`fixed inset-0 z-20 flex h-full flex-col bg-background transition-transform duration-300 ease-in-out will-change-transform ${
          selectedFile ? "translate-x-0" : "translate-x-full"
        } md:static md:inset-auto md:z-auto md:translate-x-0 md:overflow-hidden md:border-l md:border-border/60 md:transition-[width] md:duration-300 md:ease-in-out ${
          selectedFile ? "md:w-1/2" : "md:w-0"
        }`}
      >
        {panelFile && (
          <div
            className={`flex h-full min-w-0 flex-col transition-opacity duration-200 ease-in-out ${
              selectedFile
                ? "opacity-100 delay-100"
                : "opacity-0 md:opacity-100"
            }`}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedFile(null)}
                  onMouseEnter={() =>
                    chevronLeftIconRef.current?.startAnimation()
                  }
                  onMouseLeave={() =>
                    chevronLeftIconRef.current?.stopAnimation()
                  }
                  className="text-muted-foreground hover:text-foreground md:hidden"
                  aria-label="back"
                >
                  <ChevronLeftIcon ref={chevronLeftIconRef} size={16} />
                </button>
                <span className="truncate font-mono text-sm font-medium">
                  {panelFile.filename}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedFile(null)}
                  onMouseEnter={() => xIconRef.current?.startAnimation()}
                  onMouseLeave={() => xIconRef.current?.stopAnimation()}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="close"
                >
                  <XIcon ref={xIconRef} size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4">
              <Streamdown plugins={{ code }} className="text-xs">
                {`\`\`\`${panelFile.filename.endsWith(".md") ? "markdown" : "ts"}\n${panelFile.content}\n\`\`\``}
              </Streamdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
