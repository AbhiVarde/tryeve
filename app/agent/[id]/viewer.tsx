"use client";

import { useRef } from "react";
import Link from "next/link";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  FileTextIcon,
  type FileTextIconHandle,
} from "@/components/ui/file-text";
import {
  ArrowRightIcon,
  type ArrowRightIconHandle,
} from "@/components/ui/arrow-right";
import { TopBar } from "@/components/topbar";

type FileBlock = { filename: string; content: string };

export function AgentViewer({
  prompt,
  files,
}: {
  prompt: string;
  files: FileBlock[];
}) {
  const fileIconRefs = useRef<Map<string, FileTextIconHandle>>(new Map());
  const arrowIconRef = useRef<ArrowRightIconHandle>(null);

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
