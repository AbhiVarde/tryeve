"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  FileTextIcon,
  type FileTextIconHandle,
} from "@/components/ui/file-text";
import {
  ArrowRightIcon,
  type ArrowRightIconHandle,
} from "@/components/ui/arrow-right";
import {
  ChevronLeftIcon,
  type ChevronLeftIconHandle,
} from "@/components/ui/chevron-left";
import {
  ChevronRightIcon,
  type ChevronRightIconHandle,
} from "@/components/ui/chevron-right";
import { XIcon, type XIconHandle } from "@/components/ui/x";
import { TopBar } from "@/components/topbar";
import { PanelGlow } from "@/components/panel-glow";
import {
  useAgentChat,
  useTranscriptSync,
  AgentConversation,
  type AgentSession,
  type StoredMessage,
} from "@/components/agent-chat-panel";
import { AppShell } from "@/components/app-shell";

type FileBlock = { filename: string; content: string };

const MAX_INPUT_LENGTH = 500;

export function AgentViewer({
  shareId,
  prompt,
  files,
}: {
  shareId: string;
  prompt: string;
  files: FileBlock[];
}) {
  const fileChipIconRefs = useRef<Map<string, FileTextIconHandle>>(new Map());
  const arrowIconRef = useRef<ArrowRightIconHandle>(null);
  const filesTriggerIconRef = useRef<FileTextIconHandle>(null);
  const chevronLeftIconRef = useRef<ChevronLeftIconHandle>(null);
  const chevronRightIconRef = useRef<ChevronRightIconHandle>(null);
  const xIconRef = useRef<XIconHandle>(null);

  const [session, setSession] = useState<AgentSession | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [reviving, setReviving] = useState(false);
  const [initialMessages, setInitialMessages] = useState<
    StoredMessage[] | null
  >(null);
  const [input, setInput] = useState("");

  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function pingAlive(url: string) {
      return fetch("/api/ping-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
        .then((r) => r.json())
        .then((d) => d.alive)
        .catch(() => false);
    }

    async function connect() {
      try {
        const transcriptRes = await fetch(`/agent/${shareId}/raw?transcript=1`);
        const transcript: StoredMessage[] = transcriptRes.ok
          ? await transcriptRes.json()
          : [];
        if (!cancelled) setInitialMessages(transcript);

        const sessionRes = await fetch(`/agent/${shareId}/raw?session=1`);
        let alive = false;
        let sessionData: { sandboxName: string; url: string } | null = null;

        if (sessionRes.ok) {
          const parsed = (await sessionRes.json()) as {
            sandboxName: string;
            url: string;
          };
          sessionData = parsed;
          alive = await pingAlive(parsed.url);
        }

        if (!alive) {
          if (!cancelled) setReviving(true);
          const reviveRes = await fetch("/api/revive-agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shareId }),
          });
          const revived = await reviveRes.json().catch(() => null);
          if (cancelled) return;
          setReviving(false);
          if (!revived?.ok) return;
          sessionData = { sandboxName: revived.sandboxName, url: revived.url };
        }

        if (cancelled || !sessionData) return;
        const finalSession = sessionData;

        setSession({
          url: finalSession.url,
          sandboxName: finalSession.sandboxName,
          sessionId: null,
          continuationToken: null,
          turnCount: 0,
        });
      } finally {
        if (!cancelled) setConnecting(false);
      }
    }

    connect();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const {
    messages: agentMessages,
    sendMessage,
    status,
  } = useAgentChat(
    session,
    (patch) => setSession((prev) => (prev ? { ...prev, ...patch } : prev)),
    session?.sandboxName ?? `viewer-${shareId}`,
    initialMessages,
  );

  useTranscriptSync(shareId, agentMessages, status);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !session) return;
    setInput("");
    sendMessage({ text: trimmed });
  }

  function openFilesPanel() {
    setSelectedFileIndex(null);
    setFilesPanelOpen(true);
  }

  function closeFilesPanel() {
    setFilesPanelOpen(false);
    setSelectedFileIndex(null);
  }

  const selectedFile =
    selectedFileIndex !== null ? files[selectedFileIndex] : null;

  return (
    <AppShell>
      <TopBar
        hideOnMobile={filesPanelOpen}
        rightSlot={
          files.length > 0 ? (
            <button
              onClick={openFilesPanel}
              onMouseEnter={() => filesTriggerIconRef.current?.startAnimation()}
              onMouseLeave={() => filesTriggerIconRef.current?.stopAnimation()}
              aria-label="view generated files"
              className="flex cursor-pointer items-center gap-1.5 text-muted-foreground opacity-90 transition-opacity hover:opacity-100 hover:text-foreground"
            >
              <FileTextIcon ref={filesTriggerIconRef} size={16} />
              <span className="font-mono text-xs">
                {files.length} file{files.length !== 1 ? "s" : ""}
              </span>
            </button>
          ) : undefined
        }
      />

      <div
        className={`flex h-full flex-col overflow-y-auto transition-[width] duration-300 ease-in-out ${
          filesPanelOpen ? "w-full md:w-1/2" : "w-full"
        }`}
      >
        <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pt-24 pb-16">
          <div>
            <p className="mb-2 font-mono text-xs text-muted-foreground">
              shared agent
            </p>
            <div className="w-full bg-black! px-3 py-1.5 font-mono text-sm text-white rounded-lg! shadow-sm">
              {prompt}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-mono text-xs text-muted-foreground">
              {reviving
                ? "waking this agent back up..."
                : connecting
                  ? "connecting to this agent..."
                  : session
                    ? "chat with this agent"
                    : "couldn't reconnect right now, files are still viewable below"}
            </p>

            {session && (
              <div className="flex flex-col gap-4 rounded-lg border border-border/60 p-4">
                <div className="flex max-h-96 flex-col gap-4 overflow-auto">
                  <AgentConversation messages={agentMessages} status={status} />
                </div>
                <form onSubmit={onSubmit} className="flex flex-col gap-2">
                  <Textarea
                    placeholder="message this agent..."
                    value={input}
                    maxLength={MAX_INPUT_LENGTH}
                    onChange={(e) =>
                      setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                    className="min-h-20 resize-none rounded-md border-0 bg-black/20 px-3 py-2.5 font-mono text-sm shadow-none focus-visible:ring-1"
                  />
                  <Button
                    type="submit"
                    disabled={
                      status === "streaming" || input.trim().length === 0
                    }
                    className="w-full cursor-pointer"
                  >
                    {status === "streaming" ? (
                      <Spinner className="size-4" />
                    ) : (
                      "send"
                    )}
                  </Button>
                </form>
              </div>
            )}
          </div>

          <Link
            href="/"
            onMouseEnter={() => arrowIconRef.current?.startAnimation()}
            onMouseLeave={() => arrowIconRef.current?.stopAnimation()}
            className="group mx-auto mt-4 flex cursor-pointer items-center gap-1.5 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            build your own agent
            <ArrowRightIcon
              ref={arrowIconRef}
              size={14}
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </Link>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-20 flex h-full flex-col bg-background transition-transform duration-300 ease-in-out will-change-transform ${
          filesPanelOpen ? "translate-x-0" : "translate-x-full"
        } md:relative md:inset-auto md:z-auto md:transition-[width] md:duration-300 md:ease-in-out md:border-l md:border-border/60 ${
          filesPanelOpen ? "md:w-1/2" : "md:w-0"
        }`}
      >
        {filesPanelOpen && (
          <button
            onClick={closeFilesPanel}
            onMouseEnter={() => chevronRightIconRef.current?.startAnimation()}
            onMouseLeave={() => chevronRightIconRef.current?.stopAnimation()}
            aria-label="collapse panel"
            className="absolute top-1/2 -left-3 z-40 hidden h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground md:flex"
          >
            <ChevronRightIcon ref={chevronRightIconRef} size={12} />
          </button>
        )}

        <div className="h-full w-full overflow-hidden">
          {filesPanelOpen && (
            <div className="relative flex h-full min-w-0 flex-col opacity-100 transition-opacity duration-200 ease-in-out delay-100">
              <PanelGlow />

              <div className="relative z-10 flex items-center justify-between border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      selectedFile
                        ? setSelectedFileIndex(null)
                        : closeFilesPanel()
                    }
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
                    {selectedFile ? selectedFile.filename : "agent/files"}
                  </span>
                </div>
                <button
                  onClick={closeFilesPanel}
                  onMouseEnter={() => xIconRef.current?.startAnimation()}
                  onMouseLeave={() => xIconRef.current?.stopAnimation()}
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                  aria-label="close"
                >
                  <XIcon ref={xIconRef} size={16} />
                </button>
              </div>

              {selectedFile ? (
                <div className="relative z-10 flex-1 overflow-auto px-6 py-4">
                  <Streamdown plugins={{ code }} className="text-xs">
                    {`\`\`\`${selectedFile.filename.endsWith(".md") ? "markdown" : "ts"}\n${selectedFile.content}\n\`\`\``}
                  </Streamdown>
                </div>
              ) : (
                <div className="relative z-10 flex-1 overflow-auto px-6 py-8">
                  <div className="mx-auto flex w-full max-w-xl flex-wrap gap-2">
                    {files.map((file, idx) => (
                      <button
                        key={file.filename}
                        onClick={() => setSelectedFileIndex(idx)}
                        onMouseEnter={() =>
                          fileChipIconRefs.current
                            .get(file.filename)
                            ?.startAnimation()
                        }
                        onMouseLeave={() =>
                          fileChipIconRefs.current
                            .get(file.filename)
                            ?.stopAnimation()
                        }
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/40 bg-background px-2.5 py-1.5 font-mono text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <FileTextIcon
                          ref={(el) => {
                            if (el)
                              fileChipIconRefs.current.set(file.filename, el);
                            else fileChipIconRefs.current.delete(file.filename);
                          }}
                          size={13}
                        />
                        {file.filename}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
