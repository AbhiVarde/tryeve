import { head } from "@vercel/blob";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AgentViewer } from "./viewer";
import { getMissingConnectionEnvVars } from "@/app/lib/eve-connections";

type FileBlock = { filename: string; content: string };

function parseFiles(raw: string): FileBlock[] {
  const regex = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  const blocks: FileBlock[] = [];
  let match;
  let i = 0;

  while ((match = regex.exec(raw)) !== null) {
    i++;
    const body = match[1];
    const firstLine = body.split("\n")[0];
    const filenameMatch = firstLine.match(/(?:\/\/|#)\s*filename:\s*(.+)/i);
    const filename = filenameMatch
      ? filenameMatch[1].trim()
      : i === 1
        ? "agent/instructions.md"
        : `agent/tools/tool-${i}.ts`;
    const content = filenameMatch
      ? body.split("\n").slice(1).join("\n").trim()
      : body.trim();
    blocks.push({ filename, content });
  }

  return blocks;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const blob = await head(`agents/${id}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(blob.url);
    const data: { prompt: string } = await res.json();

    return {
      title: data.prompt,
      description: `an eve agent built with tryeve: ${data.prompt}`,
      openGraph: {
        title: data.prompt,
        description: `an eve agent built with tryeve: ${data.prompt}`,
      },
    };
  } catch {
    return { title: "shared agent" };
  }
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: { prompt: string; code: string };

  try {
    const blob = await head(`agents/${id}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(blob.url);
    data = await res.json();
  } catch {
    notFound();
  }

  const files = parseFiles(data.code);
  const missingConnectionEnv = getMissingConnectionEnvVars(files);

  return (
    <AgentViewer
      shareId={id}
      prompt={data.prompt}
      files={files}
      missingConnectionEnv={missingConnectionEnv}
    />
  );
}
