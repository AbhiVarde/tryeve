"use client";

import Link from "next/link";

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
  return (
    <Link
      href={`/agent/${id}`}
      className="flex flex-col justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4 transition-colors hover:bg-white/[0.05]"
    >
      <p className="line-clamp-2 font-mono text-sm leading-relaxed text-foreground/90">
        {prompt}
      </p>
      <span className="font-mono text-[11px] text-muted-foreground">
        {formatRelativeTime(createdAt)}
      </span>
    </Link>
  );
}
