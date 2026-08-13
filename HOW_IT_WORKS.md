# how the generate and test loop works

most tools that generate ai agent code show the output and stop there. tryeve doesn't. an agent isn't shown until it has actually run, against a real runtime, and answered a real message.

## the core idea

a model can write eve files without much trouble. what it can't guarantee is that those files are correct against the real eve runtime. so nothing is shown until that's proven, not assumed.

## the pipeline

↳ a botid check runs first, bot traffic never reaches the ai gateway  
↳ a prompt is routed through the ai gateway to a model, which writes real eve files  
↳ a vercel sandbox installs eve for real, not stubbed  
↳ `eve dev` boots inside the sandbox  
↳ the exposed port is polled until eve's http server responds  
↳ a test message is sent to `/eve/v1/session`  
↳ a real reply means it passed, a failure is surfaced as-is  
↳ on a pass, the sandbox stays alive, so connecting later reuses it instead of booting a second one

the first five steps run as one durable workflow step.  
↳ a crash mid generation resumes instead of losing the request

## connections

if you name a real service, the model also writes a connection file, eve's native way to give an agent another app's own tools without hand-writing wrappers for them.

↳ only added when the request names a specific real service, never guessed  
↳ auth is declared on the connection, pulled from an env var at call time  
↳ if that env var isn't set, testing fails with the exact variable name needed, not a generic timeout

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
↳ github deploy only ever touches the deploying visitor's own account, never the creator's  
↳ vercel deploy follows the same rule, checked against the same identity, before it ever touches the deploying visitor's own vercel account

## bugs found building this

**a stale first-read race**  
↳ a first-time visitor's history sometimes looked empty right after a successful write  
↳ the cookie and the blob write could land a beat after the first read  
↳ fix: refetch on every panel open instead of caching

**next.js's private-folder convention**  
↳ a cleanup route 404'd silently for an hour  
↳ it sat in an underscore-prefixed folder, which next.js excludes from routing by design

**vercel firewall's rate-limit rule quota**  
↳ hobby allows one rate-limit rule per project, not per route  
↳ two protected routes meant one rule with an or-condition on path

**sandbox identity isn't an id**  
↳ `@vercel/sandbox` has no `sandboxId` accessor  
↳ identity is the `name` set at creation, `Sandbox.get()` takes `{ name }`

**tab visibility isn't tab closing**  
↳ a `visibilitychange` listener stopped the sandbox on any tab switch, not just real exits  
↳ this was the actual cause of two bugs, share links only showing files, and history reconnects never working  
↳ fix: only `beforeunload` counts as a real exit now

**`useChat` has no memory of its own**  
↳ the ai sdk keeps messages in react state only, by design  
↳ reconnecting to a live sandbox still showed an empty chat, nothing to restore from  
↳ fix: each turn syncs to blob, restored as `useChat`'s initial state on reconnect

**sandboxes were persistent by default, and nothing needed that**  
↳ `@vercel/sandbox` auto-snapshots the filesystem on every stop, meant for resuming later  
↳ tryeve never resumes a stopped sandbox, connect always reuses one still running  
↳ every stop during testing snapshotted anyway, exhausting a month's storage quota in a day  
↳ fix: `persistent: false` on every `Sandbox.create()`, stopping now discards instead of saving

**github apps can't create personal repos**  
↳ vercel connect's github connector is a github app under the hood  
↳ github apps are blocked from `POST /user/repos` on personal accounts by design, org repos only  
↳ fix: repo creation split off to a direct, self-hosted classic oauth flow, connect kept for pushing files

**firewall's ip limit doesn't stop a distributed botnet**  
↳ rate limiting by ip works against a single abuser, not requests spread across many ips  
↳ fix: botid screens actual bot signals on the generation endpoint, firewall's ip limit stays as a backstop

**model choice and the kill-switch were hardcoded**  
↳ changing the model, or pausing generation during an incident, meant a redeploy either way  
↳ fix: flags sdk exposes both live from the dashboard, no redeploy needed

**deploy to vercel retried the wrong deploy**  
↳ deploy-to-github and deploy-to-vercel shared one popup window name and one hardcoded retry callback  
↳ closing the vercel auth popup always retried the github deploy instead, showing "deploying..." on the wrong button  
↳ fix: each flow gets its own window name and its own retry callback

**a missing oauth client id failed silently as a 404**  
↳ the github oauth start route built the authorize url even when `GITHUB_OAUTH_CLIENT_ID` was unset for an environment  
↳ an empty `client_id` param sends github straight to its own 404, no error message, no clue why  
↳ fix: the route checks for the client id first and returns a real error instead of a broken redirect

## what's deliberately not built

hosting a generated agent on tryeve's own infrastructure as a permanent live service was built, then removed.

↳ that would mean tryeve running someone else's agent indefinitely, on my account, at my cost, forever  
↳ it stayed out for that reason, not because a deployed agent has nothing to show

deploying the generated code to the user's own github made the cut instead. it's not hosting, it's handing over files the person owns, the full app, agent and chat ui both, not the agent's api alone. pushing those files uses a short-lived scoped token from a github app, issued through connect. creating the repo itself uses a separate classic oauth token, because github apps cannot create repositories on personal accounts, only on organizations, so connect's github app can't do that one step. either way, one produces a repo they control, the other a process nobody asked for.

deploying that same repo to a user's own vercel account was added the same way, later. it's still not tryeve hosting anything, it's handing the same working app to an account the person controls, this time via a vercel marketplace integration oauth instead of a github app token. it depends on the github deploy step running first, since it deploys straight from that repo rather than a second copy of the files. one manual step remains before it responds, a model credential has to be added in the new project's vercel settings and redeployed, since no key of mine is included.
