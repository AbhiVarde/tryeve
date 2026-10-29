# architecture

system design for tryeve. for the generate and test pipeline in detail, see [HOW_IT_WORKS.md](https://github.com/AbhiVarde/tryeve/blob/main/HOW_IT_WORKS.md).

## overview

tryeve is a next.js app that turns a plain english prompt into a tested eve agent. the result can be chatted with live, downloaded, written to disk by the cli, published to a gallery, or deployed to the user's own github and vercel accounts.

## entry points

|           | web                                          | cli                                                         |
| --------- | -------------------------------------------- | ----------------------------------------------------------- |
| identity  | private cookie                               | api key from github device flow                             |
| bot check | botid                                        | skipped, the key identifies the caller                      |
| limits    | firewall rate limit, sandbox cap per visitor | firewall rate limit, sandbox cap, daily build limit per key |
| output    | chat, zip, share link, gallery, deploy       | files on disk, share link, deploy from the folder           |
| progress  | ndjson events rendered in the page           | the same events rendered in the terminal                    |

both call the same `build-agent` route.

## request flow

```
prompt (web or cli)
  │
  ▼
identify caller ── bad key ──▶ 401
  │
  ├─ web: botid ── blocked ──▶ 403
  ├─ generation kill-switch off ──▶ 503
  ├─ firewall rate limit ── hit ──▶ 429
  └─ cli: daily limit ── hit ──▶ 429
  │
  ▼
durable workflow
  ├─ jev preflight ── low score ──▶ clarification, no sandbox spent
  ├─ generation (ai gateway, model fallbacks)
  ├─ validate, repair once if needed
  └─ live test in a vercel sandbox
        ├─ install eve
        ├─ boot eve dev
        └─ run eve eval ── fail ──▶ reason shown, one automatic retry
  │
  ▼
blob (agent, session pointer, history)
  │
  ├─▶ chat (reuses the live sandbox)
  ├─▶ zip download
  ├─▶ cli writes files to disk
  ├─▶ publish (public flag and shared index) ──▶ gallery
  ├─▶ deploy to github (connect and classic oauth)
  └─▶ deploy to vercel (vercel oauth, needs the github repo)
```

## core components

| layer        | responsibility                                                                                                                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| generation   | the ai gateway routes to a primary model chosen by a flag, with a fallback list and retry rounds. the system prompt encodes eve's file conventions, approval rules and when to add a connection, schedule, skill or subagent.                                                                 |
| preflight    | jev, called through the ai sdk, scores whether a prompt is buildable before generation. it fails open on error.                                                                                                                                                                               |
| validation   | rule checks on the generated files, with one model repair pass when something is wrong.                                                                                                                                                                                                       |
| verification | a vercel sandbox installs and boots the real eve runtime and runs the agent's eval. nothing is shown or written until it passes.                                                                                                                                                              |
| durability   | preflight, generation and testing run as one workflow, so a crash resumes instead of losing the request.                                                                                                                                                                                      |
| storage      | blob holds the agent files, its live session pointer and per-visitor history, keyed by a private identity. chat transcripts are stored per agent.                                                                                                                                             |
| chat         | the live sandbox is kept after a passing test. chat streams through the ai sdk, backed by the sandbox's own http endpoint.                                                                                                                                                                    |
| discovery    | a public flag on the agent record and a shared index decide what the gallery lists. preview images render on demand with `next/og`.                                                                                                                                                           |
| deploy       | github uses two identities: vercel connect pushes files with a short-lived scoped token, and a classic github oauth app creates the repo. vercel deploy uses a marketplace integration oauth and only runs after the github repo exists. the cli instead deploys from the user's own machine. |
| cleanup      | a cron job sweeps sandboxes left behind by closed tabs. idle sessions also disconnect on their own, with a warning first.                                                                                                                                                                     |
| status       | a sandbox quota error pauses generation for everyone with a visible reason, the next successful sandbox clears it.                                                                                                                                                                            |

## time budgets

the live test runs inside one deadline, and each stage has its own cap.

| stage          | cap       |
| -------------- | --------- |
| whole test     | 150s      |
| sandbox create | 30s       |
| install        | up to 90s |
| boot           | up to 45s |
| eval           | up to 75s |

a stage that overruns ends the build with its own message and the sandbox is stopped. a retryable failure gets one more attempt after a short pause.

## identity and ownership

every agent is tagged with its creator's identity at generation time, a cookie for the web or the key owner for the cli, never exposed to other visitors.

| action                              | who can do it                                         |
| ----------------------------------- | ----------------------------------------------------- |
| view files, chat via share link     | anyone with the link                                  |
| overwrite or stop a session         | only the creator                                      |
| publish or unpublish to the gallery | only the creator                                      |
| deploy to github or vercel          | only the deploying visitor, against their own account |

## network boundaries

| boundary                | enforcement                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| bot traffic             | botid screens web generation requests before they reach the ai gateway                                                             |
| abusive volume          | firewall rate limits generation, connect and chat per visitor                                                                      |
| daily cost              | cli keys have a daily build limit, one key per github account                                                                      |
| internal route          | `test-agent` only answers requests that carry the shared internal secret                                                           |
| sandbox outbound access | the network policy allows `registry.npmjs.org` and the active model provider host only                                             |
| generated tools         | tools may not call urls, live data goes through the built-in web search tool                                                       |
| credential exposure     | connection credentials are never stored, only referenced by variable name. agents that need one are skipped in testing, not failed |
| cli file writes         | only `agent/` and `evals/`, plus the files the cli creates itself                                                                  |

## observability

the workflow and each sandbox stage (create, install, boot, eval) are traced, so a slow or failing build shows which stage cost the time.

## configuration

| mechanism                           | controls                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| flags sdk                           | primary generation model and the generation kill-switch, both live with no redeploy              |
| model credentials                   | `AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, at least one |
| `BLOB_READ_WRITE_TOKEN`             | storage                                                                                          |
| `TRYEVE_INTERNAL_SECRET`            | authenticates the workflow's call to `test-agent`                                                |
| `TRYEVE_DAILY_LIMIT`                | daily builds per cli key, default 10                                                             |
| github and vercel oauth credentials | deploy flows                                                                                     |
| `TRYEVE_API_KEY`, `TRYEVE_URL`      | client side, set by cli users                                                                    |

## agent skill

`skills/tryeve/SKILL.md` ships in the repo. it teaches coding agents to call the cli with `--json`, read the result fields, handle each exit code and never bypass sign-in.

## out of scope by design

tryeve does not host a generated agent as a permanent live service. deploy to github and deploy to vercel exist so the person ends up owning the running app, not tryeve running it on their behalf indefinitely.
