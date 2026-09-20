type FileBlock = { filename: string; content: string };

const CONNECTION_FILE_RE = /^agent\/(?:subagents\/[^/]+\/)?connections\//;
const ENV_VAR_RE = /process\.env\.([A-Z0-9_]+)/g;

export function getConnectionEnvVars(files: FileBlock[]): string[] {
  const vars = new Set<string>();
  for (const f of files) {
    if (!CONNECTION_FILE_RE.test(f.filename)) continue;
    const matches = f.content.matchAll(ENV_VAR_RE);
    for (const m of matches) vars.add(m[1]);
  }
  return [...vars];
}

export function getMissingConnectionEnvVars(files: FileBlock[]): string[] {
  return getConnectionEnvVars(files).filter((v) => !process.env[v]);
}
