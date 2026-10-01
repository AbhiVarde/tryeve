# tryeve cli

build and test an eve agent from your terminal. every agent is tested against a live eve runtime before it's written to disk.

```bash
export TRYEVE_API_KEY=tv_yourkey
npx @abhivarde/tryeve "agent that logs expenses with amount and category"
```

## options

- `--out, -o <dir>` output folder, defaults to a slug of the prompt
- `--json` machine-readable output
- `--url <base>` override the API base, or set `TRYEVE_URL`

## exit codes

- `0` built, and written to disk
- `1` error or failed build
- `2` prompt too vague, needs clarification

web version: https://tryeve.abhivarde.in
