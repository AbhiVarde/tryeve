"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  ArrowRightIcon,
  type ArrowRightIconHandle,
} from "@/components/ui/arrow-right";

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

export function GalleryCard({
  id,
  prompt,
  createdAt,
}: {
  id: string;
  prompt: string;
  createdAt: string;
}) {
  const arrowIconRef = useRef<ArrowRightIconHandle>(null);

  return (
    <Link
      href={`/agent/${id}`}
      onMouseEnter={() => arrowIconRef.current?.startAnimation()}
      onMouseLeave={() => arrowIconRef.current?.stopAnimation()}
      className="group flex flex-col justify-between gap-4 rounded-lg border border-border/40 bg-background px-4 py-3.5 transition-colors hover:bg-accent"
    >
      <p className="font-mono text-sm leading-relaxed text-foreground/90">
        {prompt}
      </p>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-muted-foreground">
          {formatRelativeTime(createdAt)}
        </span>
        <ArrowRightIcon
          ref={arrowIconRef}
          size={14}
          className="text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-foreground"
        />
      </div>
    </Link>
  );
}
