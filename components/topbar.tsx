"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { GithubIcon, type GithubIconHandle } from "@/components/ui/github";
import { VercelMark } from "@/components/vercel-mark";

const GITHUB_URL = "https://github.com/AbhiVarde/tryeve";

export function TopBar({
  hideOnMobile = false,
  onLogoClick,
  rightSlot,
}: {
  hideOnMobile?: boolean;
  onLogoClick?: () => void;
  rightSlot?: ReactNode;
}) {
  const githubIconRef = useRef<GithubIconHandle>(null);

  const logo = (
    <span className="flex items-center gap-2">
      <VercelMark />
      <span className="text-sm font-medium text-muted-foreground">/</span>
      <span className="font-mono text-sm font-medium tracking-tight">
        tryeve
      </span>
    </span>
  );

  const logoClassName = `fixed top-0 left-0 z-30 items-center px-6 py-4 opacity-90 transition-opacity hover:opacity-100 ${
    hideOnMobile ? "hidden md:flex" : "flex"
  }`;

  return (
    <>
      {onLogoClick ? (
        <button
          onClick={onLogoClick}
          aria-label="start over"
          className={logoClassName}
        >
          {logo}
        </button>
      ) : (
        <Link href="/" aria-label="tryeve home" className={logoClassName}>
          {logo}
        </Link>
      )}

      <div
        className={`fixed top-0 right-0 z-30 items-center gap-4 px-6 py-4 ${
          hideOnMobile ? "hidden md:flex" : "flex"
        }`}
      >
        {rightSlot}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => githubIconRef.current?.startAnimation()}
          onMouseLeave={() => githubIconRef.current?.stopAnimation()}
          aria-label="view on github"
          className="text-muted-foreground opacity-90 transition-opacity hover:opacity-100 hover:text-foreground"
        >
          <GithubIcon ref={githubIconRef} size={16} />
        </a>
      </div>
    </>
  );
}
