#!/usr/bin/env node
import { exec, spawnSync } from "node:child_process";
import {
  access,
  chmod,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

const DEFAULT_URL = "https://tryeve.abhivarde.in";
const CONFIG_PATH = join(homedir(), ".config", "tryeve", "config.json");
const FILE_RE =
  /```[a-zA-Z]*\n(?:\/\/|#)\s*filename:\s*(\S+)[^\n]*\n([\s\S]*?)```/g;
const SAFE_PATH = /^(agent|evals)\/[A-Za-z0-9_\-./]+$/;
const TEMPORARY =
  /sandbox|test service|timed out|took too long|ran out of time|busy|too many|paused|unavailable|try again/i;
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

const STEP_TEXT = {
  preflight: ["checking the prompt", "prompt looks buildable"],
  generate: ["writing the agent", "agent written"],
  repair: ["fixing validation issues", "validation issues fixed"],
  test: ["booting eve and sending a live message", "live eve test finished"],
};

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
    yellow: w(33, 39),
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
      bad: "✗",
      warn: "!",
      add: "+",
      dot: "·",
      cut: "…",
      frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    }
  : {
      ok: "+",
      bad: "x",
      warn: "!",
      add: "+",
      dot: "-",
      cut: ".",
      frames: ["-", "\\", "|", "/"],
    };

const opts = {
  json: false,
  out: null,
  force: false,
  open: false,
  keyPaste: false,
  public: false,
  url: process.env.TRYEVE_URL || DEFAULT_URL,
  help: false,
  version: false,
  words: [],
};

let spinner = null;
let cursorHidden = false;

process.on("exit", () => {
  if (cursorHidden) process.stderr.write("\x1b[?25h");
});
process.on("SIGINT", () => process.exit(130));

const HELP = `
  tryeve ${pkg.version}

  build an eve agent from a sentence, tested on a live eve runtime

  usage
    tryeve "describe your agent" [options]
    echo "describe your agent" | tryeve - [options]
    tryeve deploy github      push the agent in this folder to a new github repo
    tryeve deploy vercel      deploy the agent in this folder to vercel
    tryeve login              sign in with github, once
    tryeve login --key        paste a key instead
    tryeve logout

  options
    -o, --out <dir>   output folder (default: name from the prompt)
        --force       write into a folder that isn't empty
        --open        open the web page for this agent when done
        --public      make the github repo public (default: private)
        --json        one machine-readable json object on stdout
        --url <base>  api base (env: TRYEVE_URL)
    -h, --help        show this help
    -v, --version     show the version

  auth
    the first build asks you to sign in with github, or set TRYEVE_API_KEY

  exit codes
    0 built and written, 1 error or failed build, 2 prompt too vague
`;

function fail(message, hint, code = 1) {
  spinner?.stop();
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
    case "--open":
      opts.open = true;
      break;
    case "--key":
      opts.keyPaste = true;
      break;
    case "--public":
      opts.public = true;
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
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60
    ? `${s}s`
    : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

function createSpinner() {
  const live = !!process.stderr.isTTY && !opts.json;
  let text = null;
  let t0 = Date.now();
  let timer = null;
  let i = 0;

  const draw = () => {
    if (!text) return;
    const room = Math.max(20, (process.stderr.columns || 80) - 14);
    const label =
      text.length > room ? `${text.slice(0, room - 1)}${SYM.cut}` : text;
    const frame = SYM.frames[i++ % SYM.frames.length];
    process.stderr.write(
      `\r\x1b[2K  ${err.cyan(frame)} ${label} ${err.dim(fmt(Date.now() - t0))}`,
    );
  };

  return {
    start() {
      if (opts.json || !live) return;
      process.stderr.write("\x1b[?25l");
      cursorHidden = true;
      timer = setInterval(draw, 80);
    },
    set(next) {
      if (opts.json || next === text) return;
      if (text === null) t0 = Date.now();
      text = next;
      if (live) draw();
      else console.error(`  ${next}...`);
    },
    done(label, ok = true) {
      if (opts.json) return;
      const mark = ok ? err.green(SYM.ok) : err.red(SYM.bad);
      const line = `  ${mark} ${label.padEnd(36)} ${err.dim(fmt(Date.now() - t0))}`;
      if (live) process.stderr.write(`\r\x1b[2K${line}\n`);
      else console.error(line);
      text = null;
      t0 = Date.now();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (live) process.stderr.write("\r\x1b[2K");
      if (cursorHidden) {
        process.stderr.write("\x1b[?25h");
        cursorHidden = false;
      }
      text = null;
    },
  };
}

function readStdin() {
  return new Promise((resolveInput) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolveInput(data));
  });
}

function readSecret(label) {
  return new Promise((resolveSecret) => {
    if (!process.stdin.isTTY) {
      readStdin().then((d) => resolveSecret(d.trim()));
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

async function saveKey(key) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  await writeFile(
    CONFIG_PATH,
    `${JSON.stringify({ apiKey: key }, null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(CONFIG_PATH, 0o600).catch(() => {});
}

const postJson = (url, body, ms = 15_000) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });

async function githubLogin() {
  let clientId = null;
  try {
    const res = await fetch(`${opts.url}/api/keys`, {
      signal: AbortSignal.timeout(15_000),
    });
    clientId = (await res.json()).clientId ?? null;
  } catch {
    fail(
      "couldn't reach tryeve",
      `check your connection, or the api url (${opts.url})`,
    );
  }
  if (!clientId) {
    fail(
      "sign-in isn't available right now",
      "try again later, or use `tryeve login --key` if you were given a key",
    );
  }

  let device;
  try {
    const res = await postJson("https://github.com/login/device/code", {
      client_id: clientId,
    });
    device = await res.json();
  } catch {
    fail("couldn't reach github", "check your connection and try again");
  }
  if (!device?.device_code) {
    fail(
      device?.error_description ?? "github sign-in couldn't start",
      "try again in a moment",
    );
  }

  console.error(`  open   ${err.cyan(device.verification_uri)}`);
  console.error(`  code   ${err.bold(device.user_code)}`);
  console.error(
    `\n  ${err.dim("waiting for you to approve in the browser...")}\n`,
  );
  openUrl(device.verification_uri);

  let wait = (device.interval || 5) * 1000;
  const deadline = Date.now() + (device.expires_in || 900) * 1000;
  let githubToken = null;

  while (Date.now() < deadline && !githubToken) {
    await new Promise((r) => setTimeout(r, wait));
    let t;
    try {
      const res = await postJson(
        "https://github.com/login/oauth/access_token",
        {
          client_id: clientId,
          device_code: device.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        },
      );
      t = await res.json();
    } catch {
      continue;
    }
    if (t.access_token) githubToken = t.access_token;
    else if (t.error === "slow_down") wait += 5000;
    else if (t.error === "access_denied") fail("sign-in was cancelled");
    else if (t.error && t.error !== "authorization_pending") {
      fail(t.error_description ?? t.error, "run the command again");
    }
  }

  if (!githubToken) fail("the sign-in code expired", "run the command again");

  let body = null;
  let res = null;
  try {
    res = await postJson(`${opts.url}/api/keys`, { githubToken }, 20_000);
    body = await res.json();
  } catch {}

  if (!res?.ok || !body?.key) {
    fail(body?.error ?? "couldn't create a key", "try again in a moment");
  }

  await saveKey(body.key);
  console.error(
    `  ${err.green(SYM.ok)} signed in as ${err.bold(body.login)}, key saved\n`,
  );
  return body.key;
}

async function login() {
  let verified = true;

  if (opts.keyPaste || !process.stdin.isTTY) {
    const key = await readSecret("  api key: ");
    if (!key) fail("no key entered");

    const status = await keyStatus(key);
    if (status === 401) fail("that key was rejected", "check it and try again");

    await saveKey(key);
    verified = status === 400;
  } else {
    await githubLogin();
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, verified }));
    return;
  }

  console.log(`  ${out.green(SYM.ok)} saved to ${CONFIG_PATH}`);
  if (!verified) {
    console.log(
      `  ${out.dim("couldn't verify the key right now, it will be checked on your next build")}`,
    );
  }
}

async function logout() {
  let removed = true;
  try {
    await unlink(CONFIG_PATH);
  } catch {
    removed = false;
  }
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, removed }));
    return;
  }
  console.log(
    removed
      ? `  ${out.green(SYM.ok)} removed ${CONFIG_PATH}`
      : `  ${out.dim("no saved key found")}`,
  );
}

function slugify(prompt) {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));
  return `${words.slice(0, 3).join("-") || "generated"}-agent`;
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

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readBuild(res, onEvent) {
  const type = res.headers.get("content-type") ?? "";
  if (!res.body || !type.includes("application/x-ndjson")) {
    return res.json().catch(() => null);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;

  const handle = (line) => {
    if (!line.trim()) return;
    try {
      const p = JSON.parse(line);
      if (p.type === "step") onEvent(p);
      else if (p.type === "result") result = p.result ?? null;
    } catch {}
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buffer);
  return result;
}

const GITIGNORE = `node_modules
.env
.env.local
.vercel
.eve
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

## ship it

\`npx @abhivarde/tryeve deploy github\` pushes this folder to a new github repo

\`npx @abhivarde/tryeve deploy vercel\` deploys it to vercel
`;
}

const sh = (command) =>
  spawnSync(command, { stdio: "inherit", shell: true }).status === 0;
const quiet = (command) =>
  spawnSync(command, { stdio: "ignore", shell: true }).status === 0;

function openUrl(url) {
  const cmd = IS_WIN
    ? `start "" "${url}"`
    : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function deploy(target) {
  const cwd = process.cwd();

  if (!(await exists(join(cwd, "agent")))) {
    fail(
      "this folder isn't an eve agent",
      "cd into the folder tryeve wrote, then run this again",
    );
  }

  if (target === "github") {
    if (!quiet("git --version")) {
      fail("git isn't installed", "install it from git-scm.com");
    }
    if (!quiet("gh --version")) {
      fail(
        "the github cli isn't installed",
        "install it from cli.github.com, run `gh auth login`, then try again",
      );
    }
    if (!quiet("gh auth status")) {
      fail("you're not signed in to github", "run `gh auth login` first");
    }

    if (!(await exists(join(cwd, ".git"))) && !sh("git init")) {
      fail("git init failed");
    }

    sh("git add -A");
    sh('git commit -m "tryeve: initial agent"');

    if (!quiet("git rev-parse HEAD")) {
      fail(
        "git couldn't create a commit",
        'set your identity: git config --global user.name "you" and git config --global user.email "you@example.com"',
      );
    }

    const name =
      basename(cwd)
        .toLowerCase()
        .replace(/[^a-z0-9-_.]/g, "-")
        .replace(/^-+|-+$/g, "") || "my-eve-agent";
    const visibility = opts.public ? "--public" : "--private";

    if (!sh(`gh repo create ${name} ${visibility} --source . --push`)) {
      fail(
        "couldn't create the github repo",
        "the name may already exist or this folder already has an origin, rename the folder or fix the remote and try again",
      );
    }

    console.log(
      `\n  ${out.green(SYM.ok)} pushed to github as ${out.bold(name)}\n`,
    );
    console.log(`  ${out.bold("next")}`);
    console.log("    npx @abhivarde/tryeve deploy vercel   live on vercel");
    console.log("");
    return;
  }

  if (target === "vercel") {
    console.log(
      `\n  ${out.dim("vercel will ask you to sign in and link a project")}\n`,
    );
    if (!sh("npx vercel")) {
      fail("the vercel deploy failed", "run `npx vercel` yourself to see why");
    }

    console.log(`\n  ${out.green(SYM.ok)} deployed to vercel\n`);
    console.log(`  ${out.bold("one more step")}`);
    console.log(
      "    npx vercel env add AI_GATEWAY_API_KEY   the agent needs it to answer",
    );
    console.log("    npx vercel --prod                       redeploy with it");
    console.log("");
    return;
  }

  fail(
    `unknown deploy target "${target ?? ""}"`,
    "use `tryeve deploy github` or `tryeve deploy vercel`",
  );
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

if (opts.words.length === 1 && opts.words[0] === "logout") {
  await logout();
  process.exit(0);
}

if (opts.words[0] === "deploy" && opts.words.length <= 2) {
  await deploy(opts.words[1]);
  process.exit(0);
}

let prompt = opts.words.join(" ").trim();
if (prompt === "-") prompt = (await readStdin()).trim();
if (!prompt) {
  console.error(HELP);
  process.exit(1);
}

let key = await loadKey();
if (!key) {
  if (opts.json || !process.stdin.isTTY || !process.stderr.isTTY) {
    fail("no api key found", "run `tryeve login`, or set TRYEVE_API_KEY");
  }
  console.error(`\n  ${err.dim("first run, sign in with github once")}\n`);
  key = await githubLogin();
}

const slug = slugify(prompt);
const dir = resolve(opts.out ?? slug);

if (!opts.force && (await isNonEmpty(dir))) {
  fail(
    `${shown(dir)} already exists and isn't empty`,
    "use --out <dir> for another folder, or --force to write into it",
  );
}

if (!opts.json) {
  console.error(`\n  ${err.bold("tryeve")} ${err.dim(pkg.version)}\n`);
}

const started = Date.now();
spinner = createSpinner();
spinner.start();
spinner.set("connecting");

const netFail = (e, dropped) => {
  if (e?.name === "TimeoutError") {
    fail("the build took too long", "try a simpler description");
  }
  if (dropped) {
    fail("the connection dropped mid-build", "try again in a moment");
  }
  fail(
    "couldn't reach tryeve",
    `check your connection, or the api url (${opts.url})`,
  );
};

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
  netFail(e, false);
}

let data;
try {
  data = await readBuild(res, (e) => {
    const [running, finished] = STEP_TEXT[e.step] ?? [e.step, e.step];
    if (e.status === "running") {
      spinner.set(e.detail ? `${running}, ${e.detail}` : running);
    } else if (e.status === "done") {
      spinner.done(finished);
    } else if (e.status === "failed") {
      spinner.done(`${running} failed`, false);
    }
  });
} catch (e) {
  netFail(e, true);
}
spinner.stop();

if (res.status === 401) {
  fail("invalid api key", "run `tryeve login`, or check TRYEVE_API_KEY");
}
if (res.status === 429) {
  fail(
    data?.error ?? "too many requests",
    "wait a minute, or try again tomorrow if you hit the daily limit",
  );
}
if (!data) fail(`unexpected response (${res.status})`, "try again in a moment");
if (!res.ok) {
  fail(
    data.error ?? `request failed (${res.status})`,
    res.status === 400 ? "try a clearer description" : "try again in a moment",
  );
}
if (data.needsClarification) {
  fail(
    data.error ?? "that description is too vague to build",
    "say what the agent does, like 'log expenses with amount and category'",
    2,
  );
}
if (!data.code || (!data.passed && !data.skipped)) {
  const reason = data.error ?? "the build failed";
  fail(
    reason,
    TEMPORARY.test(reason)
      ? "nothing was written, this looks temporary, try again in a moment"
      : "nothing was written, try rewording the description",
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

const project = new Map();
let rejected = 0;
for (const f of generated) {
  if (!SAFE_PATH.test(f.path) || f.path.split("/").includes("..")) {
    rejected++;
    continue;
  }
  project.set(f.path, f.content);
}

if (project.size === 0) fail("the response had no usable files", "try again");

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
const share = data.id ? `${opts.url}/?a=${data.id}` : null;

if (opts.open && share) openUrl(share);

if (opts.json) {
  console.log(
    JSON.stringify({
      ok: true,
      id: data.id ?? null,
      share,
      tested,
      missingConnectionEnv: missing,
      env: [...envVars],
      dir,
      files: written,
      skippedFiles: rejected,
    }),
  );
  process.exit(0);
}

const took = fmt(Date.now() - started);
console.error("");
console.error(
  tested
    ? `  ${err.green(SYM.ok)} ${err.bold("passed a live eve test")} ${err.dim(`${SYM.dot} ${took}`)}`
    : `  ${err.yellow(SYM.warn)} ${err.bold("generated, not tested")} ${err.dim(`${SYM.dot} ${took}`)}`,
);
if (!tested && missing.length > 0) {
  console.error(
    `    ${err.dim(`connects to a real service, needs ${missing.join(", ")} to run a test`)}`,
  );
}
if (rejected > 0) {
  console.error(
    `    ${err.dim(`skipped ${rejected} file(s) outside agent/ and evals/`)}`,
  );
}

const order = (p) =>
  p.startsWith("agent/") ? 0 : p.startsWith("evals/") ? 1 : 2;
const sorted = [...written].sort(
  (a, b) => order(a) - order(b) || a.localeCompare(b),
);
const copyCmd = IS_WIN ? "copy .env.example .env" : "cp .env.example .env";
const row = (k, v) => `  ${out.dim(k.padEnd(6))}${v}`;

console.log("");
console.log(row("agent", slug));
console.log(row("dir", shown(dir)));
if (share) console.log(row("share", share));
console.log("");
for (const p of sorted) console.log(`    ${out.dim(SYM.add)} ${p}`);
console.log("");
if (envVars.size > 0) {
  console.log(
    `  ${out.bold("needs")}  ${[...envVars].join(", ")} ${out.dim("in .env")}`,
  );
  console.log("");
}
console.log(`  ${out.bold("next")}`);
if (shown(dir) !== ".") console.log(`    cd ${quote(shown(dir))}`);
console.log(`    ${copyCmd}   ${out.dim("then add your AI_GATEWAY_API_KEY")}`);
console.log("    npm install");
console.log(
  `    npm run dev   ${out.dim("chat with your agent in the terminal")}`,
);
console.log("");
console.log(`  ${out.bold("ship it")}`);
console.log(
  `    npx @abhivarde/tryeve deploy github   ${out.dim("new repo on your github")}`,
);
console.log(
  `    npx @abhivarde/tryeve deploy vercel   ${out.dim("live on vercel")}`,
);
console.log("");
