"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  id: string;
  label: string;
  command: string;
  steps: { label: string; time: string }[];
  done: string;
};

const TABS: Tab[] = [
  {
    id: "cli",
    label: "cli",
    command: 'npx @abhivarde/tryeve "agent that roasts my startup idea"',
    steps: [
      { label: "prompt looks buildable", time: "5s" },
      { label: "agent written", time: "4s" },
      { label: "live eve test finished", time: "57s" },
    ],
    done: "passed a live eve test",
  },
  {
    id: "skill",
    label: "skill",
    command: "npx skills add AbhiVarde/tryeve --skill tryeve",
    steps: [
      { label: "coding agent runs the cli with --json", time: "" },
      { label: "reads the result and test status", time: "" },
    ],
    done: "eve agent written to your project",
  },
];

export function InstallCard() {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = TABS[index];
  const lines = [
    ...active.steps.map((s) => ({ ...s, final: false })),
    { label: active.done, time: "", final: true },
  ];

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShownFor(active.id));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [active.id]);

  const shown = shownFor === active.id;

  async function copy() {
    try {
      await navigator.clipboard.writeText(active.command);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="w-full rounded-xl border border-border/30 bg-black/20 p-1.5 text-left font-mono text-[11px]">
      <div
        role="group"
        aria-label="install method"
        className="relative grid w-fit grid-cols-2 rounded-md bg-white/5 p-px"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-px left-px w-[calc(50%-1px)] rounded-md bg-white/5 transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={index === i}
            onClick={() => {
              setIndex(i);
              setCopied(false);
            }}
            className={cn(
              "relative z-10 h-5 w-11 cursor-pointer touch-manipulation rounded-md text-center text-[10px] leading-none outline-none transition-colors duration-200 focus-visible:ring-1 focus-visible:ring-border",
              index === i
                ? "text-foreground"
                : "text-muted-foreground/60 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={copy}
        aria-label={`copy ${active.label} command`}
        className="group mt-1.5 flex w-full cursor-pointer touch-manipulation items-center gap-2 rounded-lg bg-white/2 px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-white/3 active:bg-white/3 focus-visible:ring-0 focus-visible:ring-border"
      >
        <span aria-hidden="true" className="text-muted-foreground/40">
          $
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground transition-colors group-hover:text-foreground">
          {active.command}
        </span>
        {copied ? (
          <Check className="size-3.5 shrink-0 text-emerald-500" />
        ) : (
          <Copy className="size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
        )}
      </button>

      <ul
        key={active.id}
        aria-hidden="true"
        className="mt-1.5 hidden h-18 overflow-hidden px-2.5 sm:block"
      >
        {lines.map((l, i) => (
          <li
            key={l.label}
            style={{ transitionDelay: shown ? `${120 + i * 220}ms` : "0ms" }}
            className={cn(
              "flex h-4.5 items-center justify-between gap-3 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
              shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            <span className="truncate">
              <span className="text-emerald-500">✓</span>{" "}
              <span
                className={
                  l.final ? "text-foreground" : "text-muted-foreground"
                }
              >
                {l.label}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground/50">
              {l.time}
            </span>
          </li>
        ))}
      </ul>

      <span className="sr-only" aria-live="polite">
        {copied ? "copied" : ""}
      </span>
    </div>
  );
}
