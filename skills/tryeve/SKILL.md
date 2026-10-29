---
name: tryeve
description: build and live-test an eve agent from one sentence using the tryeve cli. use when the user asks to create, scaffold, or generate an eve agent.
---

# tryeve

builds an eve agent from a sentence, tests it on a live eve runtime, and writes the files to disk.

## run

```bash
npx @abhivarde/tryeve "<one sentence describing the agent>" --json
```

→ `-o <dir>` picks the output folder
→ `--force` only if the user okays writing into a non-empty folder
→ progress goes to stderr, the result is one json object on stdout

## auth

→ needs a key: set `TRYEVE_API_KEY`, or the user runs `npx @abhivarde/tryeve login` once
→ first login needs a human to approve a code in the browser, never bypass it
→ if the error says no api key, stop and ask the user to sign in

## read the result

success: `ok`, `id`, `share`, `tested`, `env`, `dir`, `files`

→ `tested: true` means it passed a live eve test
→ `tested: false` with `missingConnectionEnv` means it connects to a real service, tell the user which variables to add
→ `env` lists variables the agent needs in `.env`
→ `share` is a web link, give it to the user

failure: `ok: false`, `error`, optional `hint`

→ exit code `2`: prompt too vague, rewrite it to say what the agent does, retry once
→ exit code `1` with a temporary error (busy, timed out): retry once, then report
→ daily limit error: stop, do not retry

## prompts that build well

→ one sentence: what the agent does and what it returns
→ name a real service only when the user wants it, those agents are written untested
→ avoid vague asks like "help me with money"

## after it builds

```bash
cd <dir>
cp .env.example .env    # then add AI_GATEWAY_API_KEY
npm install
npm run dev
```

ship from inside the folder: `npx @abhivarde/tryeve deploy github` or `deploy vercel`

## rules

→ never invent or store the user's keys
→ never claim it passed when `tested` is false
