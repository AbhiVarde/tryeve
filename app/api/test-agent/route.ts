import { Sandbox } from "@vercel/sandbox";

export const runtime = "nodejs";
export const maxDuration = 60;

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

const EVE_STUB = `export function defineAgent(config) { return config; }`;

const EVE_TOOLS_STUB = `export function defineTool(config) {
  if (!config.description) throw new Error("tool missing description");
  if (!config.inputSchema) throw new Error("tool missing inputSchema");
  if (typeof config.execute !== "function") throw new Error("tool missing execute");
  return config;
}`;

export async function POST(req: Request) {
  const { code } = await req.json();

  if (!code || typeof code !== "string") {
    return new Response("code is required", { status: 400 });
  }

  const files = parseFiles(code).filter((f) => f.filename.endsWith(".ts"));

  if (files.length === 0) {
    return Response.json({
      passed: false,
      error: "no tool or agent files found to test",
    });
  }

  const sandbox = await Sandbox.create({ runtime: "node24", timeout: 45_000 });

  try {
    await sandbox.writeFiles([
      {
        path: "package.json",
        content: Buffer.from(
          JSON.stringify({ type: "module", dependencies: { zod: "^3.23.8" } }),
        ),
      },
      { path: "eve.js", content: Buffer.from(EVE_STUB) },
      { path: "eve-tools.js", content: Buffer.from(EVE_TOOLS_STUB) },
    ]);

    const install = await sandbox.runCommand("npm", [
      "install",
      "--no-audit",
      "--no-fund",
    ]);

    if (install.exitCode !== 0) {
      const err = await install.stderr();
      return Response.json({
        passed: false,
        error: `dependency install failed: ${err}`,
      });
    }

    const errors: string[] = [];

    for (const file of files) {
      const runnable = file.content
        .replace(/from ["']eve\/tools["']/g, 'from "./eve-tools.js"')
        .replace(/from ["']eve["']/g, 'from "./eve.js"');

      const testPath = `check-${file.filename.split("/").pop()}`;
      await sandbox.writeFiles([
        { path: testPath, content: Buffer.from(runnable) },
      ]);

      const result = await sandbox.runCommand("node", [testPath]);
      if (result.exitCode !== 0) {
        const err = await result.stderr();
        errors.push(`${file.filename}: ${err.trim().split("\n")[0]}`);
      }
    }

    if (errors.length > 0) {
      return Response.json({ passed: false, error: errors.join("\n") });
    }

    return Response.json({
      passed: true,
      output: `${files.length} file(s) validated`,
    });
  } finally {
    await sandbox.stop();
  }
}
