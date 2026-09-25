# how the generate and test loop works

an agent isn't shown until it has run against a real runtime and answered a real message. this document covers the pipeline, what gets tested, and the real bugs found building it.

## the core idea

a model can write eve files without much trouble. what it can't guarantee is that those files are correct against the real eve runtime. so nothing is shown until that's proven, not assumed.

## the pipeline

↳ a botid check runs first, bot traffic never reaches the ai gateway  
↳ a jev preflight score checks the prompt for buildability before any sandbox spins up  
↳ the ai gateway routes the request to a model, which writes real eve files  
↳ a vercel sandbox installs eve for real, not stubbed  
↳ `eve dev` boots inside the sandbox  
↳ the exposed port is polled until eve's http server responds  
↳ a test message derived from the prompt is sent to `/eve/v1/session`  
↳ a real reply means it passed, a failure is surfaced as-is  
↳ on a pass, the sandbox stays alive, so connecting later reuses it instead of booting a second one

steps 3 through 8 run as one durable workflow step.  
↳ a crash mid generation resumes instead of losing the request

## preflight with jev

before generation runs, the prompt is checked with jev via the ai sdk's `evaluate()` method, routed through the ai gateway.

↳ a low buildability score returns a clarification message, no sandbox is created  
↳ if jev or the gateway errors, the check fails open, generation proceeds as normal  
↳ only runs on a fresh build, a follow-up refinement skips this check

## connections

if a request names a real service, the model writes a connection file, eve's native way to give an agent another app's tools without hand-written wrappers.

↳ only added when a specific real service is named, never guessed  
↳ auth is declared on the connection, pulled from an environment variable at call time  
↳ tryeve never holds that credential, a connection agent can't be tested or chatted with here, this is marked skipped, not failed, and names the missing variable  
↳ deploy to github and vercel stay available regardless, since pushing files doesn't need the credential  
↳ a subagent inherits no connection from root, if both need the same service, the connection file is duplicated under the subagent's own directory

## schedules

a schedule runs the agent on its own cron cadence for daily digests, weekly reports, or recurring sweeps.

↳ only added when the request explicitly implies recurring or automatic behavior  
↳ lives at `agent/schedules/`, root only, a subagent can't have one  
↳ `eve dev` never fires a schedule on its real cadence, only a deployed app does, tryeve's sandbox test only confirms the agent responds to a normal message

## skills and evals

↳ a skill is written to `agent/skills/<name>.md` when the request implies a specific procedure or house style, only added when called for  
↳ every agent ships one `evals/core.eval.ts` file regardless of the request  
↳ an agent with tools sends two messages: the real task it should handle, and a fixed off-topic message it should not call any tool for  
↳ evals aren't run by tryeve, only generated and included in the zip or deploy, running one during testing would risk the 60s workflow timeout

## refine

an already-built agent can be refined with a follow-up instruction instead of regenerating from scratch.

↳ a follow-up reruns the same pipeline against the existing files, not a blank slate  
↳ `previousCode` is optional everywhere, a fresh build works exactly as before

## publish and discovery

an agent can be listed in the public gallery so anyone can find and open it, separate from a private share link.

↳ a `public` flag lives on the agent's own record, off by default  
↳ toggling it also updates a single shared index of published agents, only the creator can flip it  
↳ the gallery page reads that index and shows a generated preview image per agent, rendered on demand from the agent's prompt  
↳ unpublishing removes the agent from the index, the individual share link still works exactly as before

## tool approval

a tool description that names a real-world consequence, sending, deleting, charging, deploying, or publishing, gets `approval: auto()` from `eve/tools/approval` attached during generation. a plain lookup, calculation, or logging tool never gets this. the approval decision is also backed by jev.

## sandbox network policy

generated tool code runs with real credentials injected when a connection is present. the sandbox running that code is restricted outbound to `registry.npmjs.org` plus whichever model-provider host is configured (`ai-gateway.vercel.sh`, `api.anthropic.com`, or `api.openai.com`). this closes the gap where generated code held a real secret and unrestricted network access.

## why real testing instead of stubs

the first version stubbed `eve`, `eve/tools`, and `zod` to catch syntax errors cheaply.

↳ fast, and wrong  
↳ a file could pass the stub and still fail against the real runtime  
↳ a passing test that isn't true is worse than no test  
↳ stubs were removed, testing is slower now, and the result means what it says

## the ownership and privacy boundary

a share link lets anyone view an agent's files and chat with it. it doesn't let them touch it.

↳ every agent is tagged with its creator's identity at generation time  
↳ overwriting a session or stopping a sandbox is checked against that identity, a stranger gets a 403  
↳ chatting and viewing files stay open to anyone with the link, that's the point of sharing  
↳ github and vercel deploy only ever touch the deploying visitor's own account, never the creator's

## bugs found building this

**a stale first-read race**  
↳ history looked empty right after a write, cookie and blob write landed a beat apart  
↳ fix: refetch on every panel open instead of caching

**silent 404 on cleanup route**  
↳ it sat in an underscore-prefixed folder, excluded from next.js routing by design  
↳ fix: moved out of the private folder

**vercel firewall's rate-limit rule quota**  
↳ hobby allows one rate-limit rule per project, not per route  
↳ fix: one rule with an or-condition across both paths

**sandbox identity isn't an id**  
↳ `@vercel/sandbox` has no `sandboxId` accessor, identity is the `name` set at creation  
↳ fix: `Sandbox.get()` takes `{ name }`

**tab visibility isn't tab closing**  
↳ a `visibilitychange` listener stopped the sandbox on any tab switch  
↳ fix: only `beforeunload` counts as a real exit now

**`useChat` has no memory of its own**  
↳ the ai sdk keeps messages in react state only, reconnecting showed an empty chat, nothing to restore from  
↳ fix: each turn syncs to blob, restored as `useChat`'s initial state on reconnect

**sandboxes were persistent by default, and nothing needed that**  
↳ `@vercel/sandbox` auto-snapshots the filesystem on every stop, exhausting a month's storage quota in a day  
↳ fix: `persistent: false` on every `Sandbox.create()`

**github apps can't create personal repos**  
↳ vercel connect's github connector is blocked from `POST /user/repos` on personal accounts, org repos only  
↳ fix: repo creation split to a direct classic oauth flow, connect kept for pushing files

**firewall's ip limit doesn't stop a distributed botnet**  
↳ rate limiting by ip works against a single abuser, not requests spread across many ips  
↳ fix: botid screens actual bot signals on the generation endpoint, firewall's ip limit stays as a backstop

**model choice and the kill-switch were hardcoded**  
↳ changing the model, or pausing generation during an incident, meant a redeploy either way  
↳ fix: flags sdk exposes both live from the dashboard, no redeploy needed

**deploy retried the wrong flow**  
↳ github and vercel deploy shared one popup name and retry callback  
↳ fix: each flow gets its own window name and retry callback

**missing oauth client id failed silently**  
↳ an unset `GITHUB_OAUTH_CLIENT_ID` produced a broken redirect to github's own 404  
↳ fix: the route checks for the client id first, returns a real error

**jev model id mismatch**  
↳ used `typesafe-ai/jev-latest`, the gateway lists it as `typesafe-ai/jev`  
↳ fix: corrected the model string

**gallery didn't reflect a publish toggle**  
↳ vercel blob's cdn can serve stale content for up to 60s after an overwrite, and `cacheControlMaxAge` can't go below that minimum  
↳ fix: reads of an overwritten blob path append a cache-busting query param

**chat threw a 410 on an older shared agent**  
↳ a sandbox can expire independent of any idle timer tracked client-side  
↳ fix: ping the sandbox before every send, revive and queue the message if it's gone

## what's deliberately not built

hosting a generated agent on tryeve's own infrastructure as a permanent live service was built, then removed.

↳ that would mean running someone else's agent indefinitely, on this project's own account and cost, forever

deploying to the user's own github and vercel accounts replaced it. this isn't hosting, it's handing over files the person owns, the full app, agent and chat ui both, not just an api. pushing files uses a short-lived scoped token via connect. creating the repo uses a separate classic oauth token, since github apps can't create personal repos. deploying to vercel depends on the github step running first, since it deploys from that repo rather than a second copy of the files. one manual step remains before either app responds: a model credential added in the new project's settings, since no key from this project is included.
