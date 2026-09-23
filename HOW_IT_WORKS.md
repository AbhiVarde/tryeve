# How the generate and test loop works

An agent isn't shown until it has run against a real runtime and answered a real message. This document covers the pipeline, what gets tested, and the real bugs found building it.

## The core idea

A model can write eve files without much trouble. It can't guarantee those files are correct against the real eve runtime. So nothing is shown until that's proven, not assumed.

## The pipeline

| Step | What happens                                                                      |
| ---- | --------------------------------------------------------------------------------- |
| 1    | BotID check, bot traffic never reaches the AI Gateway                             |
| 2    | jev (typesafe ai) screens the prompt for buildability before any sandbox spins up |
| 3    | The AI Gateway routes the request to a model, which writes real eve files         |
| 4    | A Vercel Sandbox installs eve for real, not stubbed                               |
| 5    | `eve dev` boots inside the sandbox                                                |
| 6    | The exposed port is polled until eve's HTTP server responds                       |
| 7    | A test message derived from the prompt is sent to `/eve/v1/session`               |
| 8    | A real reply means it passed. A failure is surfaced as is                         |
| 9    | On a pass, the sandbox stays alive so a later connect reuses it                   |

Steps 3 through 8 run as one durable workflow step. A crash mid-generation resumes instead of losing the request.

## Preflight with jev

Before generation runs, the prompt is checked with jev via the AI SDK's `evaluate()` method, routed through the AI Gateway.

- A low buildability score returns a clarification message, no sandbox is created.
- If jev or the gateway errors, the check fails open, generation proceeds as normal.
- Only runs on a fresh build. A follow-up refinement skips this check.

## Connections

If a request names a real service, the model writes a connection file, eve's native way to give an agent another app's tools without hand-written wrappers.

- Only added when a specific real service is named, never guessed.
- Auth is declared on the connection, pulled from an environment variable at call time.
- tryeve never holds that credential. A connection agent can't be tested or chatted with here. This is marked skipped, not failed, and names the missing variable.
- Deploy to GitHub and Vercel stay available regardless, since pushing files doesn't need the credential.
- A subagent inherits no connection from root. If both need the same service, the connection file is duplicated under the subagent's own directory.

## Schedules

A schedule runs the agent on its own cron cadence for daily digests, weekly reports, or recurring sweeps.

- Only added when the request explicitly implies recurring or automatic behavior.
- Lives at `agent/schedules/`, root only, a subagent can't have one.
- `eve dev` never fires a schedule on its real cadence. Only a deployed app does. tryeve's sandbox test only confirms the agent responds to a normal message.

## Skills and evals

- A skill is written to `agent/skills/<name>.md` when the request implies a specific procedure or house style. Only added when called for.
- Every agent ships one `evals/core.eval.ts` file regardless of the request.
- An agent with tools sends two messages: the real task it should handle, and a fixed off-topic message it should not call any tool for.
- Evals aren't run by tryeve, only generated and included in the zip or deploy. Running one during testing would risk the 60s workflow timeout.

## Refine

An already-built agent can be refined with a follow-up instruction instead of regenerating from scratch.

- A follow-up reruns the same pipeline against the existing files, not a blank slate.
- `previousCode` is optional everywhere. A fresh build works exactly as before.

## Publish and discovery

An agent can be listed in the public gallery so anyone can find and open it, separate from a private share link.

- A `public` flag lives on the agent's own record, off by default.
- Toggling it also updates a single shared index of published agents. Only the creator can flip it.
- The gallery page reads that index and shows a generated preview image per agent, rendered on demand from the agent's prompt.
- Unpublishing removes the agent from the index. The individual share link still works exactly as before.

## Tool approval

A tool description that names a real-world consequence, sending, deleting, charging, deploying, or publishing, gets `approval: auto()` from `eve/tools/approval` attached during generation. A plain lookup, calculation, or logging tool never gets this. The approval decision is also backed by jev.

## Sandbox network policy

Generated tool code runs with real credentials injected when a connection is present. The sandbox running that code is restricted outbound to `registry.npmjs.org` plus whichever model-provider host is configured (`ai-gateway.vercel.sh`, `api.anthropic.com`, or `api.openai.com`). This closes the gap where generated code held a real secret and unrestricted network access.

## Why real testing instead of stubs

The first version stubbed `eve`, `eve/tools`, and `zod` to catch syntax errors cheaply. This was fast and wrong: a file could pass the stub and still fail against the real runtime. A passing test that isn't true is worse than no test. Stubs were removed.

## Ownership and privacy boundary

A share link lets anyone view an agent's files and chat with it. It doesn't let them touch it.

- Every agent is tagged with its creator's identity at generation time.
- Overwriting a session or stopping a sandbox is checked against that identity. A stranger gets a 403.
- Viewing files and chatting stay open to anyone with the link, that's the point of sharing.
- GitHub and Vercel deploy only ever touch the deploying visitor's own account, never the creator's.

## Bugs found building this

| Bug                                          | Cause                                                                                                                            | Fix                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Stale first-read race                        | History looked empty right after a write, cookie and blob write landed a beat apart                                              | Refetch on every panel open instead of caching                                     |
| Silent 404 on cleanup route                  | Sat in an underscore-prefixed folder, excluded from Next.js routing by design                                                    | Moved out of the private folder                                                    |
| Firewall rule quota                          | Hobby allows one rate-limit rule per project, not per route                                                                      | One rule with an or-condition across both paths                                    |
| Sandbox has no ID accessor                   | `@vercel/sandbox` has no `sandboxId`, identity is the `name` set at creation                                                     | `Sandbox.get()` takes `{ name }`                                                   |
| Tab switch treated as exit                   | A `visibilitychange` listener stopped the sandbox on any tab switch                                                              | Only `beforeunload` counts as a real exit                                          |
| `useChat` has no memory                      | AI SDK keeps messages in React state only, reconnecting showed an empty chat                                                     | Each turn syncs to Blob, restored as initial state                                 |
| Sandboxes snapshotted by default             | Auto-snapshot on every stop exhausted a month's storage quota in a day                                                           | `persistent: false` on every `Sandbox.create()`                                    |
| GitHub Apps can't create personal repos      | Vercel Connect's GitHub connector is blocked from `POST /user/repos` on personal accounts                                        | Repo creation split to a direct classic OAuth flow, Connect kept for pushing files |
| IP rate limit doesn't stop distributed abuse | A botnet spreads requests across many IPs                                                                                        | BotID screens actual bot signals, firewall stays as backstop                       |
| Model choice hardcoded                       | Changing the model or pausing generation meant a redeploy                                                                        | Flags SDK exposes both live, no redeploy                                           |
| Deploy retried the wrong flow                | GitHub and Vercel deploy shared one popup name and retry callback                                                                | Each flow gets its own window name and retry callback                              |
| Missing OAuth client ID failed silently      | An unset `GITHUB_OAUTH_CLIENT_ID` produced a broken redirect to GitHub's own 404                                                 | Route checks for the client ID first, returns a real error                         |
| jev model ID mismatch                        | Used `typesafe-ai/jev-latest`, gateway lists it as `typesafe-ai/jev`                                                             | Corrected the model string                                                         |
| Gallery didn't reflect a publish toggle      | Vercel Blob's CDN can serve stale content for up to 60s after an overwrite, and `cacheControlMaxAge` can't go below that minimum | Reads of an overwritten blob path append a cache-busting query param               |
| Chat threw a 410 on an older shared agent    | A sandbox can expire independent of any idle timer tracked client-side                                                           | Ping the sandbox before every send, revive and queue the message if it's gone      |

## What's deliberately not built

Hosting a generated agent on tryeve's own infrastructure as a permanent live service was built, then removed. That would mean running someone else's agent indefinitely, on this project's own account and cost, forever.

Deploying to the user's own GitHub and Vercel accounts replaced it. This isn't hosting, it's handing over files the person owns, the full app, agent and chat UI both, not just an API. Pushing files uses a short-lived scoped token via Connect. Creating the repo uses a separate classic OAuth token, since GitHub Apps can't create personal repos. Deploying to Vercel depends on the GitHub step running first, since it deploys from that repo rather than a second copy of the files. One manual step remains before either app responds: a model credential added in the new project's settings, since no key from this project is included.
