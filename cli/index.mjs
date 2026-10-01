#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

const DEFAULT_URL = "https://tryeve.abhivarde.in";
const FILE_RE =
  /```[a-zA-Z]*\n(?:\/\/|#)\s*filename:\s*(\S+)[^\n]*\n([\s\S]*?)```/g;

const opts = {
  json: false,
  out: null,
  url: process.env.TRYEVE_URL || DEFAULT_URL,
  help: false,
  words: [],
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--json") opts.json = true;
  else if (a === "--out" || a === "-o") opts.out = argv[++i];
  else if (a === "--url") opts.url = argv[++i];
  else if (a === "--help" || a === "-h") opts.help = true;
  else opts.words.push(a);
}

function fail(message, code = 1) {
  if (opts.json) console.log(JSON.stringify({ ok: false, error: message }));
  else console.error(`error: ${message}`);
  process.exit(code);
}

const prompt = opts.words.join(" ").trim();
if (opts.help || !prompt) {
  console.error(
    'usage: tryeve "describe your agent" [--out dir] [--json] [--url base]',
  );
  console.error("env: TRYEVE_API_KEY (required), TRYEVE_URL");
  process.exit(opts.help ? 0 : 1);
}

const key = process.env.TRYEVE_API_KEY;
if (!key) fail("set TRYEVE_API_KEY");

process.stderr.write("building and testing against a live eve runtime...\n");

let res;
try {
  res = await fetch(`${opts.url}/api/build-agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ prompt }),
    signal: AbortSignal.timeout(310_000),
  });
} catch {
  fail("couldn't reach tryeve, or the build timed out");
}

const data = await res.json().catch(() => null);
if (!data) fail(`unexpected response (${res.status})`);
if (!res.ok) fail(data.error ?? `request failed (${res.status})`);
if (data.needsClarification)
  fail(data.error ?? "prompt is too vague to build", 2);
if (!data.code || (!data.passed && !data.skipped))
  fail(data.error ?? "build failed");

const files = [...data.code.matchAll(FILE_RE)].map((m) => ({
  path: m[1].trim(),
  content: `${m[2].trim()}\n`,
}));
if (files.length === 0) fail("no files in the response");

const slug =
  prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 32)
    .replace(/^-|-$/g, "") || "agent";
const dir = resolve(opts.out ?? slug);

for (const f of files) {
  const target = resolve(dir, f.path);
  if (!target.startsWith(dir + sep)) continue;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, f.content);
}

await writeFile(
  resolve(dir, "package.json"),
  `${JSON.stringify(
    {
      name: slug,
      private: true,
      type: "module",
      scripts: { dev: "eve dev" },
      dependencies: { eve: "latest" },
    },
    null,
    2,
  )}\n`,
);

const tested = !!data.passed;
const missing = data.missingConnectionEnv ?? [];

if (opts.json) {
  console.log(
    JSON.stringify({
      ok: true,
      id: data.id ?? null,
      tested,
      missingConnectionEnv: missing,
      dir,
      files: files.map((f) => f.path),
    }),
  );
} else {
  console.log(
    tested
      ? "passed a live eve test"
      : `generated, not tested: needs ${missing.join(", ")}`,
  );
  console.log(`wrote ${files.length} files to ${dir}`);
  console.log(`next: cd ${dir} && npm install && npm run dev`);
}
