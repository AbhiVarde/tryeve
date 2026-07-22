"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";

export type AgentSession = {
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

export function useAgentChat(
  session: AgentSession | null,
  onSessionUpdate: (patch: Partial<AgentSession>) => void,
  chatId: string,
) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent-chat",
        prepareSendMessagesRequest({ messages }) {
          const last = messages[messages.length - 1];
          const text = last ? getText(last.parts) : "";
          return {
            body: {
              url: session?.url,
              message: text,
              sessionId: session?.sessionId ?? null,
              continuationToken: session?.continuationToken ?? null,
              turnCount: session?.turnCount ?? 0,
            },
          };
        },
      }),
    [session],
  );

  return useChat({
    id: chatId,
    transport,
    experimental_throttle: 40,
    onData: (part: any) => {
      if (part.type === "data-session") {
        onSessionUpdate({
          sessionId: part.data.sessionId,
          continuationToken: part.data.continuationToken,
          turnCount: (session?.turnCount ?? 0) + 1,
        });
      }
    },
  });
}

const THINKING_WORDS = [
  "thinking...",
  "reasoning...",
  "checking your data...",
  "putting it together...",
];

function ThinkingIndicator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setIndex((i) => (i + 1) % THINKING_WORDS.length),
      1600,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={THINKING_WORDS[index]}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.25 }}
        className="inline-block"
      >
        <Shimmer duration={1.2} className="font-mono text-sm">
          {THINKING_WORDS[index]}
        </Shimmer>
      </motion.span>
    </AnimatePresence>
  );
}

type AgentMessage = {
  id: string;
  role: string;
  parts: { type: string }[];
};

export function AgentConversation({
  messages,
  status,
}: {
  messages: AgentMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
}) {
  const lastMessage = messages[messages.length - 1];
  const lastAssistantText =
    lastMessage?.role === "assistant" ? getText(lastMessage.parts) : "";

  const showThinking =
    status === "submitted" ||
    (status === "streaming" &&
      lastMessage?.role === "assistant" &&
      !lastAssistantText.trim());

  return (
    <>
      {messages.map((m) => {
        const text = getText(m.parts);
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
              {m.role === "assistant" ? (
                <MessageResponse>{text}</MessageResponse>
              ) : (
                text
              )}
            </MessageContent>
          </Message>
        );
      })}
      {showThinking && (
        <Message from="assistant">
          <MessageContent className="bg-transparent p-0 font-mono text-xs text-muted-foreground">
            <ThinkingIndicator />
          </MessageContent>
        </Message>
      )}
    </>
  );
}
