#!/usr/bin/env node
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const DEFAULT_URL = "https://tryeve.abhivarde.in";
const CONFIG_PATH = join(homedir(), ".config", "tryeve", "config.json");
const FILE_RE =
  /```[a-zA-Z]*\n(?:\/\/|#)\s*filename:\s*(\S+)[^\n]*\n([\s\S]*?)```/g;
const IS_WIN = process.platform === "win32";
const UNICODE =
  !IS_WIN || !!process.env.WT_SESSION || !!process.env.TERM_PROGRAM;
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "that",
  "which",
  "with",
  "for",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "is",
  "it",
  "this",
  "agent",
  "agents",
]);

const pkg = JSON.parse(
  await readFile(new URL("./package.json", import.meta.url), "utf8"),
);

const ansi = (on) => {
  const w = (open, close) => (s) =>
    on ? `\x1b[${open}m${s}\x1b[${close}m` : s;
  return {
    dim: w(2, 22),
    bold: w(1, 22),
    red: w(31, 39),
    green: w(32, 39),
    cyan: w(36, 39),
  };
};
const colorOn = (stream) =>
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb" &&
  (!!process.env.FORCE_COLOR || !!stream.isTTY);
const err = ansi(colorOn(process.stderr));
const out = ansi(colorOn(process.stdout));

const SYM = UNICODE
  ? {
      ok: "✓",
      warn: "!",
      frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    }
  : { ok: "+", warn: "!", frames: ["-", "\\", "|", "/"] };

const opts = {
  json: false,
  out: null,
  force: false,
  url: process.env.TRYEVE_URL || DEFAULT_URL,
  help: false,
  version: false,
  words: [],
};

const HELP = `
  tryeve ${pkg.version}

  build an eve agent from a sentence, tested on a live eve runtime

  usage
    tryeve "describe your agent" [options]
    tryeve login

  options
    -o, --out <dir>   output folder (default: name from the prompt)
        --force       write into a folder that isn't empty
        --json        machine-readable output
        --url <base>  api base (env: TRYEVE_URL)
    -h, --help        show this help
    -v, --version     show the version

  auth
    run \`tryeve login\`, or set TRYEVE_API_KEY

  exit codes
    0 done, 1 error, 2 prompt too vague
`;

function fail(message, hint, code = 1) {
  if (opts.json) {
    console.log(
      JSON.stringify({ ok: false, error: message, ...(hint ? { hint } : {}) }),
    );
  } else {
    console.error(`${err.red("error:")} ${message}`);
    if (hint) console.error(`${err.dim("hint: ")} ${hint}`);
  }
  process.exit(code);
}

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const eq = a.startsWith("--") ? a.indexOf("=") : -1;
  const flag = eq === -1 ? a : a.slice(0, eq);
  const inline = eq === -1 ? undefined : a.slice(eq + 1);
  const value = () => {
    const v = inline ?? argv[++i];
    if (v === undefined || v === "") fail(`${flag} needs a value`);
    return v;
  };

  switch (flag) {
    case "--json":
      opts.json = true;
      break;
    case "--force":
      opts.force = true;
      break;
    case "--out":
    case "-o":
      opts.out = value();
      break;
    case "--url":
      opts.url = value().replace(/\/+$/, "");
      break;
    case "--help":
    case "-h":
      opts.help = true;
      break;
    case "--version":
    case "-v":
      opts.version = true;
      break;
    default:
      if (a.startsWith("-") && a.length > 1) {
        fail(`unknown option ${a}`, "run `tryeve --help` to see the options");
      }
      opts.words.push(a);
  }
}

const fmt = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60
    ? `${s}s`
    : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

let cursorHidden = false;
process.on("exit", () => {
  if (cursorHidden) process.stderr.write("\x1b[?25h");
});
process.on("SIGINT", () => process.exit(130));

function createSpinner(text) {
  const live = !!process.stderr.isTTY && !opts.json;
  const t0 = Date.now();
  let timer = null;
  let i = 0;

  const draw = () => {
    const frame = SYM.frames[i++ % SYM.frames.length];
    process.stderr.write(
      `\r\x1b[2K  ${err.cyan(frame)} ${text} ${err.dim(fmt(Date.now() - t0))}`,
    );
  };

  return {
    start() {
      if (opts.json) return;
      if (!live) {
        console.error(`  ${text}...`);
        return;
      }
      process.stderr.write("\x1b[?25l");
      cursorHidden = true;
      draw();
      timer = setInterval(draw, 80);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      process.stderr.write("\r\x1b[2K\x1b[?25h");
      cursorHidden = false;
    },
  };
}

function readSecret(label) {
  return new Promise((resolveSecret) => {
    if (!process.stdin.isTTY) {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (c) => (data += c));
      process.stdin.on("end", () => resolveSecret(data.trim()));
      return;
    }

    process.stderr.write(label);
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stderr.write("\n");
      resolveSecret(value.trim());
    };

    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === "\r" || c === "\n") {
          finish();
          return;
        }
        if (c === "\u0003") {
          process.stderr.write("\n");
          process.exit(130);
        }
        if (c === "\u007f" || c === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += c;
      }
    };

    process.stdin.on("data", onData);
  });
}

async function keyStatus(key) {
  try {
    const res = await fetch(`${opts.url}/api/build-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ prompt: "" }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.status;
  } catch {
    return 0;
  }
}

async function loadKey() {
  if (process.env.TRYEVE_API_KEY) return process.env.TRYEVE_API_KEY.trim();
  try {
    const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
    return typeof config.apiKey === "string" ? config.apiKey.trim() : null;
  } catch {
    return null;
  }
}

async function login() {
  const key = await readSecret("  api key: ");
  if (!key) fail("no key entered");

  const status = await keyStatus(key);
  if (status === 401) fail("that key was rejected", "check it and try again");

  await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  await writeFile(
    CONFIG_PATH,
    `${JSON.stringify({ apiKey: key }, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );
  await chmod(CONFIG_PATH, 0o600).catch(() => {});

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, verified: status === 400 }));
    return;
  }

  console.log(`  ${out.green(SYM.ok)} saved to ${CONFIG_PATH}`);
  if (status !== 400) {
    console.log(
      `  ${out.dim("couldn't verify the key right now, it will be checked on your next build")}`,
    );
  }
}

function slugify(prompt) {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));
  return `${words.slice(0, 4).join("-") || "generated"}-agent`;
}

const shown = (p) => {
  const r = relative(process.cwd(), p);
  if (!r) return ".";
  return r.startsWith("..") || isAbsolute(r) ? p : `.${sep}${r}`;
};
const quote = (p) => (/\s/.test(p) ? `"${p}"` : p);

async function isNonEmpty(dir) {
  try {
    return (await readdir(dir)).length > 0;
  } catch {
    return false;
  }
}

const GITIGNORE = `node_modules
.env
.env.local
.vercel
`;

const EVAL_CONFIG = `import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({});
`;

function envExample(vars) {
  const lines = [
    "# vercel ai gateway key, the agent's models run through it",
    "AI_GATEWAY_API_KEY=",
  ];
  if (vars.length > 0) {
    lines.push("", "# external services this agent connects to");
    for (const v of vars) lines.push(`${v}=`);
  }
  return `${lines.join("\n")}\n`;
}

function projectReadme(slug, prompt) {
  return `# ${slug}

${prompt}

built with [tryeve](https://tryeve.abhivarde.in)

## run it

1. copy \`.env.example\` to \`.env\` and fill in the values
2. \`npm install\`
3. \`npm run dev\`
`;
}

if (opts.version) {
  console.log(pkg.version);
  process.exit(0);
}

if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

if (opts.words.length === 1 && opts.words[0] === "login") {
  await login();
  process.exit(0);
}

const prompt = opts.words.join(" ").trim();
if (!prompt) {
  console.error(HELP);
  process.exit(1);
}

const key = await loadKey();
if (!key) fail("no api key found", "run `tryeve login`, or set TRYEVE_API_KEY");

const slug = slugify(prompt);
const dir = resolve(opts.out ?? slug);

if (!opts.force && (await isNonEmpty(dir))) {
  fail(
    `${shown(dir)} already exists and isn't empty`,
    "use --out <dir> for another folder, or --force to write into it",
  );
}

if (!opts.json)
  console.error(`\n  ${err.bold("tryeve")} ${err.dim(pkg.version)}\n`);

const started = Date.now();
const spinner = createSpinner("building and testing on a live eve runtime");
spinner.start();

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
} catch (e) {
  spinner.stop();
  if (e?.name === "TimeoutError") {
    fail("the build took too long", "try a simpler description");
  }
  fail(
    "couldn't reach tryeve",
    `check your connection, or the api url (${opts.url})`,
  );
}

const data = await res.json().catch(() => null);
spinner.stop();

if (res.status === 401) {
  fail("invalid api key", "run `tryeve login`, or check TRYEVE_API_KEY");
}
if (res.status === 429)
  fail("too many requests", "wait a minute and try again");
if (!data) fail(`unexpected response (${res.status})`, "try again in a moment");
if (!res.ok) {
  fail(
    data.error ?? `request failed (${res.status})`,
    res.status === 400 ? "try a clearer description" : "try again in a moment",
  );
}
if (data.needsClarification) {
  fail(data.error ?? "that description is too vague to build", null, 2);
}
if (!data.code || (!data.passed && !data.skipped)) {
  fail(
    data.error ?? "the build failed",
    "nothing was written, try rewording the description",
  );
}

const generated = [...data.code.matchAll(FILE_RE)].map((m) => ({
  path: m[1].trim(),
  content: `${m[2].trim()}\n`,
}));
if (generated.length === 0) fail("the response had no files", "try again");

const envVars = new Set(data.missingConnectionEnv ?? []);
for (const f of generated) {
  if (!f.path.startsWith("agent/connections/")) continue;
  for (const m of f.content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    envVars.add(m[1]);
  }
}

const project = new Map(generated.map((f) => [f.path, f.content]));
const extras = {
  "package.json": `${JSON.stringify(
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
  ".env.example": envExample([...envVars]),
  ".gitignore": GITIGNORE,
  "README.md": projectReadme(slug, prompt),
  "evals/evals.config.ts": EVAL_CONFIG,
};
for (const [path, content] of Object.entries(extras)) {
  if (path === "package.json" || !project.has(path)) project.set(path, content);
}

const written = [];
try {
  for (const [path, content] of project) {
    const target = resolve(dir, path);
    if (!target.startsWith(dir + sep)) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    written.push(path);
  }
} catch (e) {
  fail(
    "couldn't write the files",
    e?.message ?? "check the folder permissions",
  );
}

const tested = !!data.passed;
const missing = data.missingConnectionEnv ?? [];

if (opts.json) {
  console.log(
    JSON.stringify({
      ok: true,
      id: data.id ?? null,
      tested,
      missingConnectionEnv: missing,
      env: [...envVars],
      dir,
      files: written,
    }),
  );
  process.exit(0);
}

const took = err.dim(fmt(Date.now() - started));
console.error(
  tested
    ? `  ${err.green(SYM.ok)} passed a live eve test ${took}`
    : `  ${err.cyan(SYM.warn)} generated, not tested ${took}`,
);
if (!tested && missing.length > 0) {
  console.error(`    ${err.dim(`needs ${missing.join(", ")} to run a test`)}`);
}

const row = (k, v) => `  ${out.dim(k.padEnd(6))}${v}`;
const copyCmd = IS_WIN ? "copy .env.example .env" : "cp .env.example .env";

console.log("");
console.log(row("agent", slug));
console.log(row("files", `${written.length} written to ${shown(dir)}`));
if (data.id) console.log(row("id", data.id));
console.log("");
console.log(`  ${out.bold("next")}`);
if (shown(dir) !== ".") console.log(`    cd ${quote(shown(dir))}`);
console.log(`    ${copyCmd}   ${out.dim("then fill in the keys")}`);
console.log("    npm install");
console.log("    npm run dev");
console.log("");
