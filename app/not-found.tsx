"use client";

import { useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRightIcon,
  type ArrowRightIconHandle,
} from "@/components/ui/arrow-right";
import { TopBar } from "@/components/topbar";
import { AppShell } from "@/components/app-shell";

export default function NotFound() {
  const arrowRef = useRef<ArrowRightIconHandle>(null);

  return (
    <AppShell as="main" variant="column">
      <TopBar />

      <section className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="relative z-10 font-mono text-sm text-muted-foreground">
          404
        </p>

        <h1 className="relative z-10 mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          this page doesn&apos;t exist.
        </h1>

        <p className="relative z-10 mt-4 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
          the page or agent you&apos;re looking for couldn&apos;t be found. it
          may have been moved, removed, or the link is no longer valid.
        </p>

        <Button
          variant="outline"
          className="relative z-10 mt-8 h-8 rounded-md px-4 font-mono"
          onMouseEnter={() => arrowRef.current?.startAnimation()}
          onMouseLeave={() => arrowRef.current?.stopAnimation()}
        >
          <Link href="/" className="flex items-center gap-2">
            build your own agent
            <ArrowRightIcon ref={arrowRef} size={14} />
          </Link>
        </Button>
      </section>
    </AppShell>
  );
}
