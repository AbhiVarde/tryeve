# tryeve

build an eve agent from a sentence. every agent is tested on a live eve runtime before it's written to your disk.

## use

```bash
npx @abhivarde/tryeve "agent that roasts my startup idea with amount and category"
```

the first run asks you to sign in with github once: a short code, one click in the browser, and a key is saved to `~/.config/tryeve/config.json`. tryeve reads only your public profile, and your github token is never stored.

beta limits: one key per github account (accounts must be 7 days old), 10 builds a day. signing in on another machine replaces the first key.

already have a key? run `npx @abhivarde/tryeve login --key`, or set `TRYEVE_API_KEY`.

## what you see

```
  tryeve 0.5.0

  ✓ prompt looks buildable             2s
  ✓ agent written                      14s
  ✓ live eve test finished             31s

  ✓ passed a live eve test · 47s
```

then a file tree, a share link, and the exact commands to run it.

## what you get

a folder with the agent, its tools, an eval, `.env.example`, `.gitignore` and a short readme:

```bash
cd <folder>
cp .env.example .env    # copy on windows, then add your AI_GATEWAY_API_KEY
npm install
npm run dev             # chat with your agent in the terminal
```

agents that connect to a real service can't be tested here, since tryeve never holds your credentials. they're written to disk marked "not tested", with the variables they need listed.

## ship it

run these inside the agent folder:

```bash
npx @abhivarde/tryeve deploy github    # new private repo on your github, add --public for public
npx @abhivarde/tryeve deploy vercel    # deploy with your vercel account
```

`deploy github` needs [git](https://git-scm.com) and the [github cli](https://cli.github.com) signed in with `gh auth login`. `deploy vercel` runs `npx vercel` and walks you through sign-in. add `AI_GATEWAY_API_KEY` in your vercel project so the agent can answer.

your credentials stay on your machine. tryeve never sees them.

## use it from a coding agent

```bash
echo "agent that triages support emails" | npx @abhivarde/tryeve - --json
```

`--json` prints one object on stdout: `ok`, `id`, `share`, `tested`, `env`, `dir`, `files`. progress and errors never touch stdout.

## options

- `-o, --out <dir>` output folder, defaults to a name from the prompt
- `--force` write into a folder that isn't empty
- `--open` open the web page for the agent when the build finishes
- `--public` make the github repo public, default is private
- `--json` machine-readable output, nothing else on stdout
- `--url <base>` api base, or set `TRYEVE_URL`
- `-h, --help`, `-v, --version`

## commands

- `deploy github` push the agent in the current folder to a new github repo
- `deploy vercel` deploy the agent in the current folder to vercel
- `login` save your key to `~/.config/tryeve/config.json`
- `logout` remove it

## exit codes

- `0` built and written to disk
- `1` error or failed build
- `2` prompt too vague, needs clarification

## safety

the cli writes only under `agent/` and `evals/`, plus the project files it creates itself. anything else in a response is skipped.

web version: https://tryeve.abhivarde.in
