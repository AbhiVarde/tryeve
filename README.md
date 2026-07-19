# ▲ tryeve

describe an agent. get a working one.

a free, browser based tool that builds, tests, and runs a real [eve](https://eve.dev) agent from a plain english description. no install, no terminal.

[live demo](https://tryeve.abhivarde.in) · built with ▲ [vercel](https://vercel.com)

## what it does

you type a description. tryeve generates real eve files, boots them in an isolated sandbox against the actual eve runtime, and only shows you the result once it has confirmed the agent responds. if it passes, you can chat with it live, download it as a working project, or share a link that lets anyone else talk to it too.

reload the page anytime. your agent, your chat, your files, all still there.

## features

- describe an agent in plain english
- generates real, working eve files
- every agent is tested against a live eve runtime before you see it
- generation and testing run as one durable step, survives crashes
- inspect every file with syntax highlighting
- export the full agent as a zip
- share a live link to any agent you build
- connect to your agent right after it's built, no install needed
- chat with it live, with markdown formatted replies
- reload the page anytime, your agent and chat pick up right where you left off
- idle or closed sandboxes shut down automatically, nothing left running
- warned before disconnect, never cut off without notice
- every agent you've built is saved to your own private history
- dark, minimal interface

## how it works

1. you describe an agent
2. the ai gateway routes the request to a model, which writes real eve files
3. a vercel sandbox installs eve for real and boots it, no stubs
4. tryeve sends a live test message and confirms the agent actually responds
5. if it passes, the files are shown and the agent stays reachable to chat with
6. the agent is stored in blob, so a share link or a page reload brings it all back
7. it's also added to your own history, tracked by a private cookie, not visible to anyone else

steps 2 through 4 run as one durable workflow step, so a crash mid generation doesn't lose your request. a scheduled cron job separately sweeps any sandbox sessions left behind by a closed tab or crashed browser.

## built with ▲

| product | role |
|---|---|
| [next.js](https://nextjs.org) | the app itself |
| [ai gateway](https://vercel.com/docs/ai-gateway) | routes the generation request to a model |
| [ai sdk](https://sdk.vercel.ai) | streams the model's response |
| [sandbox](https://vercel.com/docs/sandbox) | tests every agent against a real eve runtime, then runs it live so you can talk to it |
| [workflow sdk](https://vercel.com/docs/workflow) | runs generate and test as one durable step |
| [blob](https://vercel.com/docs/storage/vercel-blob) | stores each agent, its chat session, and per-visitor history |
| [cron](https://vercel.com/docs/cron-jobs) | sweeps stale sandbox sessions on a schedule |
| [firewall](https://vercel.com/docs/vercel-firewall) | rate limits generation and connect requests |
| [ai elements](https://ai-sdk.dev/elements) | chat interface, task progress ui, loading states |
| [streamdown](https://streamdown.ai) | renders code and markdown cleanly |
| [shadcn/ui](https://ui.shadcn.com) | every ui component |
| [vercel](https://vercel.com) | hosts and deploys the app |
| [analytics](https://vercel.com/docs/analytics) | tracks real usage without slowing anything down |

icons animated by [lucide-animated](https://lucide-animated.com).

## getting started

clone the repo and install dependencies:

```bash
git clone https://github.com/AbhiVarde/tryeve.git
cd tryeve
npm install
```

link the project to vercel and pull environment variables:

```bash
vercel link
vercel env pull
```

run the dev server:

```bash
npm run dev
```

open [localhost:3000](http://localhost:3000).

## environment variables

tryeve needs at least one model credential and a blob token. set these in your vercel project or in `.env.local`:

```bash
BLOB_READ_WRITE_TOKEN=

# at least one of the following
AI_GATEWAY_API_KEY=
VERCEL_OIDC_TOKEN=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

`VERCEL_OIDC_TOKEN` is generated automatically when the project is linked and deployed on vercel. for local development, `vercel env pull` handles this for you.

## project structure

```
app/
  api/
    build-agent/     generates and tests an agent as one durable workflow step
    test-agent/      boots the agent in a sandbox and confirms it responds
    run-agent/       boots a live sandbox for chat
    stop-agent/      stops a sandbox on disconnect, idle, or tab close
    agent-chat/      streams chat responses from the live sandbox
    agents/          returns the current visitor's private history
    cron/cleanup/     scheduled sweep for stale sandbox sessions
  agent/[id]/        shared, read only view of a generated agent
  page.tsx           the main app
components/
  agent-chat-panel.tsx   chat state and streaming ui
```

## limits

sandboxes run on the [hobby plan](https://vercel.com/docs/plans/hobby) by default. this means:

- 5 free sandbox cpu hours per month
- sandbox sessions can run up to 45 minutes before an automatic timeout
- generation and connect requests are rate limited per ip

these are generous enough for regular use, but heavy or repeated testing during development will use up hobby quota faster than the old stub based tests did.

## deploy your own

[![deploy with vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/AbhiVarde/tryeve)

## license

mit