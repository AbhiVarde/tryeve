import { head } from "@vercel/blob";
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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const search = new URL(req.url).searchParams;
  const isSession = search.get("session") === "1";
  const isTranscript = search.get("transcript") === "1";
  const isRepo = search.get("repo") === "1";
  const isVercel = search.get("vercel") === "1";
  const key = isRepo
    ? `agents/${id}-repo.json`
    : isVercel
      ? `agents/${id}-vercel.json`
      : isTranscript
        ? `agents/${id}-transcript.json`
        : isSession
          ? `agents/${id}-session.json`
          : `agents/${id}.json`;

  try {
    const blob = await head(key, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(blob.url, { cache: "no-store" });
    const data = await res.json();

    if (!isSession && !isTranscript && !isRepo && !isVercel && data.code) {
      const files = parseFiles(data.code);
      data.missingConnectionEnv = getMissingConnectionEnvVars(files);
    }

    return Response.json(data);
  } catch {
    return isTranscript
      ? Response.json([])
      : Response.json({ error: "not found" }, { status: 404 });
  }
}
