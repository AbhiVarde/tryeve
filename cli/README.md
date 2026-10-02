# tryeve

build an eve agent from a sentence. every agent is tested on a live eve runtime before it's written to your disk.

invite-key beta: keys are handed out by hand for now. open an issue at github.com/AbhiVarde/tryeve to ask for one.

## use

```bash
npx @abhivarde/tryeve login
npx @abhivarde/tryeve "agent that logs expenses with amount and category"
```

or skip login and set `TRYEVE_API_KEY`.

## what you get

a folder with the agent, its tools, an eval, `.env.example`, `.gitignore` and a short readme. then:

```bash
cd <folder>
cp .env.example .env    # copy on windows, then fill in the keys
npm install
npm run dev
```

the agent's models run through the vercel ai gateway, so `AI_GATEWAY_API_KEY` is needed to chat with it locally.

## options

- `-o, --out <dir>` output folder, defaults to a name from the prompt
- `--force` write into a folder that isn't empty
- `--json` machine-readable output, nothing else on stdout
- `--url <base>` api base, or set `TRYEVE_URL`
- `-h, --help`, `-v, --version`

## exit codes

- `0` built and written to disk
- `1` error or failed build
- `2` prompt too vague, needs clarification

web version: https://tryeve.abhivarde.in
