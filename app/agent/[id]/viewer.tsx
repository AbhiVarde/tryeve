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
import { TopBar } from "@/components/topbar";
import {
  useAgentChat,
  useTranscriptSync,
  AgentConversation,
  type AgentSession,
  type StoredMessage,
} from "@/components/agent-chat-panel";

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
  const fileIconRefs = useRef<Map<string, FileTextIconHandle>>(new Map());
  const arrowIconRef = useRef<ArrowRightIconHandle>(null);

  const [session, setSession] = useState<AgentSession | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [initialMessages, setInitialMessages] = useState<
    StoredMessage[] | null
  >(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const [sessionRes, transcriptRes] = await Promise.all([
          fetch(`/agent/${shareId}/raw?session=1`),
          fetch(`/agent/${shareId}/raw?transcript=1`),
        ]);

        const transcript: StoredMessage[] = transcriptRes.ok
          ? await transcriptRes.json()
          : [];
        if (!cancelled) setInitialMessages(transcript);

        if (!sessionRes.ok) return;

        const sessionData: { sandboxName: string; url: string } =
          await sessionRes.json();
        const alive = await fetch(sessionData.url, { method: "GET" })
          .then((r) => r.ok)
          .catch(() => false);

        if (cancelled || !alive) return;

        setSession({
          url: sessionData.url,
          sandboxName: sessionData.sandboxName,
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

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <TopBar />

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
            {connecting
              ? "connecting to this agent..."
              : session
                ? "chat with this agent"
                : "this agent's live session has ended, files are still viewable below"}
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
                  disabled={status === "streaming" || input.trim().length === 0}
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

        <div className="flex flex-col gap-4">
          {files.map((file) => (
            <div
              key={file.filename}
              className="overflow-hidden rounded-lg border border-border/60"
            >
              <div
                onMouseEnter={() =>
                  fileIconRefs.current.get(file.filename)?.startAnimation()
                }
                onMouseLeave={() =>
                  fileIconRefs.current.get(file.filename)?.stopAnimation()
                }
                className="flex items-center gap-1.5 border-b border-border/60 px-4 py-2.5 font-mono text-xs text-muted-foreground"
              >
                <FileTextIcon
                  ref={(el) => {
                    if (el) fileIconRefs.current.set(file.filename, el);
                    else fileIconRefs.current.delete(file.filename);
                  }}
                  size={13}
                />
                {file.filename}
              </div>
              <div className="px-2 py-2">
                <Streamdown plugins={{ code }} className="text-xs">
                  {`\`\`\`${file.filename.endsWith(".md") ? "markdown" : "ts"}\n${file.content}\n\`\`\``}
                </Streamdown>
              </div>
            </div>
          ))}
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
  );
}
