# how the generate and test loop works

most tools that generate ai agent code show the output and stop there. tryeve doesn't. an agent isn't shown until it has actually run, against a real runtime, and answered a real message.

## the core idea

an eve agent is a small set of files, instructions, typed tools, sometimes a channel. a model can write those files without much trouble. what a model can't guarantee is that the files are correct against the real eve runtime. so nothing is shown until that's proven, not assumed.

## the pipeline

↳ a prompt is routed through the ai gateway to a model, which writes real eve files
↳ a vercel sandbox is created and eve is installed for real, not stubbed
↳ `eve dev` boots inside the sandbox
↳ the sandbox's exposed port is polled until eve's http server responds
↳ a single test message is sent to `/eve/v1/session`
↳ a real reply marks the agent passed, a failure is surfaced as-is, not hidden behind a generic error

the first five steps run as one durable step through the workflow sdk.
↳ a crash mid generation resumes the workflow rather than losing the request

## why real testing instead of stubs

the first version stubbed `eve`, `eve/tools`, and `zod`, enough to catch obvious syntax errors without the cost of a full sandbox boot.

↳ fast, and wrong
↳ a file could pass the stub and still fail against real eve, real zod validation, real runtime behavior the stub never modeled
↳ a passing test that isn't actually true is worse than no test at all
↳ the stubs were removed. testing is slower now, and the result means what it says

## bugs found building this

**a stale first-read race**
↳ a brand new visitor's first generation occasionally showed an empty history panel, even though the write had already succeeded
↳ the private-history cookie and the blob write could land a beat after the very first read
↳ fix: refetch on every panel open instead of caching
↳ found only by testing cold, first-time visits, not repeated local sessions where the cookie was already warm

**next.js's private-folder convention**
↳ a temporary cleanup route returned a silent 404 for an hour
↳ it sat in a folder prefixed with an underscore, and next.js excludes any underscore-prefixed folder under `app/` from routing by design
↳ useful for co-locating helpers, easy to hit by accident, no warning, just a 404 indistinguishable from a typo

**vercel firewall's rate-limit rule quota**
↳ the hobby plan allows one rate-limit rule per project, not one per route
↳ two protected routes meant one rule with an or-condition on path, not two separate rules
↳ a constraint the dashboard flow doesn't surface until the second rule creation fails

**sandbox identity isn't an id**
↳ `@vercel/sandbox` has no `sandboxId` or `.id` accessor
↳ identity is the `name` set at creation, and `Sandbox.get()` takes `{ name }`
↳ the default assumption, every cloud resource has an opaque id, doesn't hold here

## what's deliberately not built

deploy was built, then removed.

↳ an eve agent is an api, not a page, instructions and tools describe behavior, not content
↳ a deployed agent with no channel or frontend wired up is a live endpoint with nothing to show
↳ shipping that would have looked like progress and functioned like a dead end
↳ it stayed out
