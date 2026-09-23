"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { GithubIcon, type GithubIconHandle } from "@/components/ui/github";
import {
  GalleryVerticalEndIcon,
  type GalleryVerticalEndIconHandle,
} from "@/components/ui/gallery-vertical-end";
import {
  HeartHandshakeIcon,
  type HeartHandshakeIconHandle,
} from "@/components/ui/heart-handshake";
import { VercelMark } from "@/components/vercel-mark";
import { SPONSORS_URL } from "@/lib/constants";

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
  const galleryIconRef = useRef<GalleryVerticalEndIconHandle>(null);
  const sponsorsIconRef = useRef<HeartHandshakeIconHandle>(null);

  const logo = (
    <span className="flex items-center gap-2">
      <VercelMark />
      <span className="text-sm font-medium text-muted-foreground">/</span>
      <span className="font-mono text-sm font-medium tracking-tight">
        tryeve
      </span>
    </span>
  );

  return (
    <div
      className={`fixed top-0 left-0 z-30 w-full px-6 py-4 ${
        hideOnMobile ? "hidden md:flex" : "flex"
      }`}
    >
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between">
        {onLogoClick ? (
          <button
            onClick={onLogoClick}
            aria-label="start over"
            className="flex items-center opacity-90 transition-opacity hover:opacity-100"
          >
            {logo}
          </button>
        ) : (
          <Link
            href="/"
            aria-label="tryeve home"
            className="flex items-center opacity-90 transition-opacity hover:opacity-100"
          >
            {logo}
          </Link>
        )}
        <div className="flex items-center gap-4">
          {rightSlot}
          <Link
            href="/gallery"
            onMouseEnter={() => galleryIconRef.current?.startAnimation()}
            onMouseLeave={() => galleryIconRef.current?.stopAnimation()}
            aria-label="gallery"
            className="text-muted-foreground opacity-90 transition-opacity hover:opacity-100 hover:text-foreground"
          >
            <GalleryVerticalEndIcon ref={galleryIconRef} size={16} />
          </Link>
          <a
            href={SPONSORS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => sponsorsIconRef.current?.startAnimation()}
            onMouseLeave={() => sponsorsIconRef.current?.stopAnimation()}
            aria-label="sponsor this project"
            className="text-muted-foreground opacity-90 transition-opacity hover:opacity-100 hover:text-foreground"
          >
            <HeartHandshakeIcon ref={sponsorsIconRef} size={16} />
          </a>
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
      </div>
    </div>
  );
}
