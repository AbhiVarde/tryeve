# how the generate and test loop works

an agent isn't shown until it has run against a real eve runtime and passed its own eval. this document covers the pipeline, what gets tested, and the real bugs found building it.

## the core idea

a model can write eve files without much trouble. what it can't guarantee is that those files are correct against the real runtime. so nothing is shown or written to disk until that is proven, not assumed.

## the pipeline

web and cli share one route, `build-agent`.

↳ the caller is identified: a cli api key, or a private cookie for the web  
↳ web requests pass a botid check, key holders skip it  
↳ a jev preflight scores whether the prompt is buildable  
↳ the ai gateway routes the request to a model, which writes the eve files  
↳ the files are validated, and repaired once if anything is wrong  
↳ a vercel sandbox installs eve for real and boots `eve dev`  
↳ `eve eval` runs against the live server, a clean report means it passed  
↳ the agent, its session pointer and the visitor's history are stored in blob  
↳ on a pass the sandbox stays alive, so chatting afterward reuses it

preflight, generation and testing run as one durable workflow. a crash mid build resumes instead of losing the request.

↳ the route streams progress as ndjson: one `step` line per change (`preflight`, `generate`, `repair`, `test`), then one final `result` line  
↳ the web page and the cli both render those same events

## preflight with jev

before generation runs, the prompt is scored with jev through the ai sdk's `experimental_evaluate`, routed via the ai gateway.

↳ a low buildability score returns a clarification, no sandbox is created  
↳ if jev or the gateway errors, the check fails open and generation proceeds  
↳ a plan that blocks jev access is remembered, so later builds skip the call  
↳ only runs on a fresh build, a refinement skips it

## generation

↳ the primary model comes from a flag, so it can change without a redeploy  
↳ a fallback list of models follows it, tried in order  
↳ up to 3 rounds, with a growing pause between rounds when the pool is busy  
↳ if every round fails, the build ends with a clear "pool is busy" message  
↳ the system prompt encodes eve's file conventions and the rules below

## validation and repair

`validateAgent` checks the output before any sandbox is spent.

↳ `agent/instructions.md`, `agent/agent.ts` and `evals/core.eval.ts` must exist  
↳ tool filenames must be snake_case, they become the tool names  
↳ tools may not call `fetch` or any url, live data goes through the built-in web search tool  
↳ for a tool agent, the eval must assert the tool was called and send a fixed off-topic message that must not call it

if anything fails, the model gets its own output plus the problem list and rewrites the files once. generation runs at most twice per build.

## the live test

this runs in `test-agent`, an internal route guarded by a shared secret.

↳ a per-visitor cap on active sandboxes is checked first  
↳ agents that name a real service are skipped here, see connections  
↳ a sandbox is created with node 24, port 3000 exposed, `persistent: false` and a locked network policy  
↳ the files, a `package.json` and an open test channel are written in  
↳ `npm install` runs, then `npx eve dev --no-ui` starts detached  
↳ the public url is polled until the server answers  
↳ `npx eve eval --url http://localhost:3000 --json` runs and its report is parsed  
↳ the test passes only if the eval exits cleanly with no failed checks

each stage has its own time budget inside one overall deadline. a stage that overruns fails the build with its own message, and the sandbox is stopped.

↳ if the first test fails for a retryable reason, it runs once more after a short pause  
↳ a visitor at their sandbox cap, missing model credentials, or no files are never retried  
↳ a sandbox quota error from the api pauses generation for everyone and shows the reason, the next successful sandbox clears the pause

an optional per-agent drive keyed by agent id keeps `node_modules`, with a hash of the code beside it, so the same code can skip install when the drive is reused.

## evals

↳ every agent ships one `evals/core.eval.ts`  
↳ a tool agent sends two messages: a real task that must call its tool, and a fixed off-topic message that must not  
↳ the off-topic message comes from a short fixed list, a custom one risks overlapping the agent's own domain  
↳ a no-tool agent sends one message and checks the reply for a common word  
↳ the same file is included in the zip, the cli folder and the github deploy

## connections

if a request names a real service, the model writes a connection file, eve's native way to give an agent another app's tools without hand written wrappers.

↳ only added when a specific service is named, never guessed  
↳ auth reads `process.env.<SERVICE>_API_TOKEN` at call time  
↳ tryeve never holds that credential, so a connection agent can't be tested here, it is marked skipped, not failed, and names the missing variable  
↳ chat is unavailable for these agents, deploy to github and vercel stay open since pushing files needs no credential  
↳ a subagent inherits no connection from root, if both need the service, the file is duplicated under the subagent

## schedules

a schedule runs the agent on its own cron cadence for daily digests, weekly reports or recurring sweeps.

↳ only added when the request explicitly implies recurring or automatic behavior  
↳ lives at `agent/schedules/`, root only, a subagent can't have one  
↳ `eve dev` never fires a schedule on its real cadence, only a deployed app does, the sandbox test only confirms the agent answers normally

## skills

two different things share the word.

↳ generated agents: a skill is written to `agent/skills/<name>.md` when the request implies a specific procedure or house style, plain markdown, only when called for  
↳ tryeve's own skill: `skills/tryeve/SKILL.md` teaches coding agents how to run the cli with `--json`, read the result and handle each failure

## tool approval

a tool that sends, deletes, charges, deploys or publishes is generated with `needsApproval: always()` from `eve/tools/approval`. a plain lookup, calculation or logging tool never gets it. this is enforced by the generation prompt, not by a separate check.

## refine

an already built agent can be changed with a follow-up instead of regenerating from scratch.

↳ the existing files and the instruction go to the model, which returns the full updated set  
↳ the same validation and test run again  
↳ `previousCode` is optional everywhere, a fresh build works exactly as before

## the cli

the cli is a thin client over the same route.

↳ first run signs in with github device flow, the server exchanges the github token for a tryeve key and the token is not stored  
↳ keys live in `~/.config/tryeve/config.json`, or in `TRYEVE_API_KEY`  
↳ each key has a daily build limit, 10 by default, set by `TRYEVE_DAILY_LIMIT`  
↳ the cli writes only under `agent/` and `evals/`, plus the project files it creates itself, anything else in a response is skipped  
↳ a connection agent is written to disk marked not tested, with its variables listed in `.env.example`  
↳ `deploy github` and `deploy vercel` run on the user's machine with their own git, gh and vercel sessions  
↳ `--json` keeps stdout to one object and sends progress to stderr, exit code `2` means the prompt was too vague

## publish and discovery

an agent can be listed in the public gallery, separate from a private share link.

↳ a `public` flag lives on the agent's own record, off by default  
↳ toggling it also updates one shared index of published agents, only the creator can flip it  
↳ the gallery reads that index and shows a preview image rendered on demand from the agent's prompt  
↳ unpublishing removes it from the index, the share link keeps working

## sandbox network policy

generated tool code runs inside the sandbox, which can only reach `registry.npmjs.org` and the configured model provider host (`ai-gateway.vercel.sh`, `api.anthropic.com` or `api.openai.com`).

## why real testing instead of stubs

the first version stubbed `eve`, `eve/tools` and `zod` to catch syntax errors cheaply.

↳ fast, and wrong  
↳ a file could pass the stub and still fail against the real runtime  
↳ a passing test that isn't true is worse than no test  
↳ stubs were removed, testing is slower now, and the result means what it says

## the ownership and privacy boundary

a share link lets anyone view an agent's files and chat with it. it doesn't let them touch it.

↳ every agent is tagged with its creator's identity at generation time  
↳ overwriting a session or stopping a sandbox is checked against that identity, a stranger gets a 403  
↳ viewing and chatting stay open to anyone with the link, that's the point of sharing  
↳ github and vercel deploys only ever touch the deploying visitor's own account

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
↳ the ai sdk keeps messages in react state only, reconnecting showed an empty chat  
↳ fix: each turn syncs to blob, restored as `useChat`'s initial state on reconnect

**sandboxes were persistent by default, and nothing needed that**  
↳ `@vercel/sandbox` auto-snapshots the filesystem on every stop, exhausting a month's storage quota in a day  
↳ fix: `persistent: false` on every `Sandbox.create()`

**github apps can't create personal repos**  
↳ vercel connect's github connector is blocked from `POST /user/repos` on personal accounts  
↳ fix: repo creation split to a direct classic oauth flow, connect kept for pushing files

**firewall's ip limit doesn't stop a distributed botnet**  
↳ rate limiting by ip works against one abuser, not requests spread across many ips  
↳ fix: botid screens real bot signals on the generation endpoint, the ip limit stays as a backstop

**model choice and the kill-switch were hardcoded**  
↳ changing the model, or pausing generation during an incident, meant a redeploy  
↳ fix: flags sdk exposes both live from the dashboard

**deploy retried the wrong flow**  
↳ github and vercel deploy shared one popup name and retry callback  
↳ fix: each flow gets its own window name and retry callback

**missing oauth client id failed silently**  
↳ an unset `GITHUB_OAUTH_CLIENT_ID` produced a broken redirect to github's own 404  
↳ fix: the route checks for the client id first and returns a real error

**jev model id mismatch**  
↳ used `typesafe-ai/jev-latest`, the gateway lists it as `typesafe-ai/jev`  
↳ fix: corrected the model string

**gallery didn't reflect a publish toggle**  
↳ vercel blob's cdn can serve stale content for up to 60s after an overwrite  
↳ fix: reads of an overwritten blob path append a cache-busting query param

**chat threw a 410 on an older shared agent**  
↳ a sandbox can expire independent of any idle timer tracked client-side  
↳ fix: ping the sandbox before every send, revive and queue the message if it's gone

## what's deliberately not built

hosting a generated agent on tryeve's own infrastructure as a permanent live service was built, then removed.

↳ that would mean running someone else's agent indefinitely, on this project's own account and cost

deploying to the user's own github and vercel accounts replaced it. this isn't hosting, it's handing over files the person owns, the full app, agent and chat ui both. pushing files uses a short-lived scoped token via connect. creating the repo uses a separate classic oauth token. deploying to vercel depends on the github step, since it deploys from that repo. one manual step remains before either app responds: a model credential added in the new project's settings, since no key from this project is included.
