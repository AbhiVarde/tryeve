# ▲ tryeve

**Agent builder for eve.**

Describe an agent in plain English. tryeve generates real eve files, tests them against a live eve runtime in an isolated sandbox, then lets you chat with it, download it, or deploy it to your own GitHub and Vercel.

[Live demo](https://tryeve.abhivarde.in) · Built with ▲ [Vercel](https://vercel.com)

## What it does

1. You describe an agent.
2. tryeve generates real eve files and connects to a named third-party service over MCP if you asked for one.
3. A sandbox boots the actual eve runtime and confirms the agent responds to a live message.
4. Once it passes, you can chat with it, download it, deploy it to your own GitHub, or deploy that repo straight to your own Vercel account.

Nothing is shown until step 3 passes. Reloading the page restores your agent, chat, and files exactly where you left them.

## Features

| Category    | What it does                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build       | Plain English to real eve files. Adds a connection, schedule, or skill only when the request calls for it. Ships one eval file per agent.                                                                                    |
| Verify      | Checked with jev (typesafe ai) before generation starts, catching prompts too vague to build from before a sandbox is spent. Every agent is then tested live against your actual prompt in a real sandbox before you see it. |
| Refine      | Follow up on an existing agent instead of starting over.                                                                                                                                                                     |
| Deploy      | One click to your own GitHub, one click from there to your own Vercel account. No OAuth app setup required on your end.                                                                                                      |
| Chat        | Connect right after a build passes. Markdown-formatted replies. Transcripts persist across reloads and share links.                                                                                                          |
| Share       | Anyone with a link can view files and chat. Only the creator can overwrite or stop the session.                                                                                                                              |
| Reliability | Idle sandboxes shut down automatically. Tab switches never disconnect you, only closing the tab does. Failed builds show why and offer a retry.                                                                              |
| Privacy     | Your build history is private, tied to a cookie, deletable at any time. Concurrent sandboxes are capped per visitor.                                                                                                         |

## How it works

1. A botid check rejects bot traffic before it reaches the AI Gateway.
2. jev screens the prompt. Too vague, and you get a clarification prompt before any sandbox spins up.
3. The AI Gateway routes the request to a model, which writes real eve files.
4. A Vercel Sandbox installs eve for real and boots it, no stubs.
5. tryeve sends a live test message and confirms a real response.
6. If the agent needs a connection credential tryeve doesn't hold, this step is marked skipped, not failed, and names the missing variable.
7. On a pass, the sandbox stays alive so a later chat reuses it instantly.
8. The agent, its session, and its transcript are stored in Blob, so a reload or share link restores everything.
9. It's added to your private history, tracked by a cookie.
10. Optionally, deploy to your own GitHub via Vercel Connect, no long-lived secret stored.
11. Optionally, deploy that same repo to your own Vercel account via Vercel OAuth.

Steps 2 through 5 run as one durable workflow step. A crash mid-generation resumes instead of losing the request. A cron job separately sweeps sandboxes left behind by closed tabs or crashed browsers.

Full technical breakdown: [HOW_IT_WORKS.md](https://github.com/AbhiVarde/tryeve/blob/main/HOW_IT_WORKS.md). System design: [ARCHITECTURE.md](https://github.com/AbhiVarde/tryeve/blob/main/ARCHITECTURE.md).

## Built with ▲

| Product                                                | Role                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| [eve](https://eve.dev)                                 | The agent framework every generated agent runs on                     |
| [Next.js](https://nextjs.org)                          | The app itself                                                        |
| [AI Gateway](https://vercel.com/docs/ai-gateway)       | Routes generation and preflight checks to a model                     |
| [AI SDK](https://sdk.vercel.ai)                        | Streams generation, runs the jev evaluation call                      |
| [Sandbox](https://vercel.com/docs/sandbox)             | Tests and runs every agent, network-locked to only the hosts it needs |
| [Workflow SDK](https://vercel.com/docs/workflow)       | Runs generate and test as one durable step                            |
| [Blob](https://vercel.com/docs/storage/vercel-blob)    | Stores agents, sessions, transcripts, and history                     |
| [Cron](https://vercel.com/docs/cron-jobs)              | Sweeps stale sandbox sessions                                         |
| [Firewall](https://vercel.com/docs/vercel-firewall)    | Rate limits generation, connect, and chat                             |
| [Observability](https://vercel.com/docs/observability) | Traces the sandbox pipeline                                           |
| [Connect](https://vercel.com/docs/connect)             | Issues short-lived GitHub tokens for deploy                           |
| [Vercel OAuth](https://vercel.com/docs/integrations)   | Lets a visitor deploy to their own Vercel account                     |
| [BotID](https://vercel.com/docs/botid)                 | Blocks bot traffic on generation                                      |
| [Flags SDK](https://vercel.com/docs/feature-flags)     | Flips the model or pauses generation live                             |
| [AI Elements](https://ai-sdk.dev/elements)             | Chat UI, task progress, loading states                                |
| [Streamdown](https://streamdown.ai)                    | Renders code and markdown                                             |
| [shadcn/ui](https://ui.shadcn.com)                     | UI components                                                         |
| [Vercel](https://vercel.com)                           | Hosting and deploys                                                   |
| [Analytics](https://vercel.com/docs/analytics)         | Usage tracking                                                        |

Icons animated by [lucide-animated](https://lucide-animated.com).

## Getting started

```bash
git clone https://github.com/AbhiVarde/tryeve.git
cd tryeve
npm install
vercel link
vercel env pull
npm run dev
```

Open [localhost:3000](http://localhost:3000).

## Environment variables

```bash
BLOB_READ_WRITE_TOKEN=

# at least one model credential
AI_GATEWAY_API_KEY=
VERCEL_OIDC_TOKEN=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# optional, GitHub deploy
GITHUB_CONNECTOR_UID=github/tryeve
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=

# optional, Vercel deploy (requires GitHub deploy first)
VERCEL_OAUTH_CLIENT_ID=
VERCEL_OAUTH_CLIENT_SECRET=
VERCEL_INTEGRATION_SLUG=
```

| Variable                                                        | Note                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `VERCEL_OIDC_TOKEN`                                             | Generated automatically on link and deploy. `vercel env pull` handles local dev.                                       |
| `GITHUB_CONNECTOR_UID`                                          | Defaults to `github/tryeve`. Used by a Vercel Connect GitHub App connector to push files.                              |
| `GITHUB_OAUTH_CLIENT_ID` / `SECRET`                             | From a separate classic GitHub OAuth App, used only to create the repository. GitHub Apps can't create personal repos. |
| `VERCEL_OAUTH_CLIENT_ID` / `SECRET` / `VERCEL_INTEGRATION_SLUG` | From a Vercel Marketplace Integration, lets a visitor deploy to their own Vercel account. Runs after GitHub deploy.    |

A named connection's own credential (e.g. `LINEAR_API_TOKEN`) is never held by tryeve. It's requested at test time and added to the exported project's own environment.

## Project structure

```
app/
  api/
    build-agent/       generates and tests an agent as one durable step
    test-agent/        boots the agent in a sandbox, confirms it responds
    run-agent/         boots or reuses a live sandbox for chat
    stop-agent/        stops a sandbox, owner-restricted
    agent-chat/        streams chat responses
    agents/            returns the visitor's private history
    save-transcript/   persists chat messages
    github/deploy/          creates the repo, pushes files
    github/oauth/           GitHub OAuth flow
    vercel/deploy-repo/     deploys the repo to the visitor's Vercel account
    vercel/oauth/           Vercel OAuth flow
    cron/cleanup/      sweeps stale sandbox sessions
  agent/[id]/          shared agent view, real chat included
  page.tsx             main app
components/
  agent-chat-panel.tsx   chat state, streaming, transcript sync
lib/
  sandbox-quota.ts        per-visitor sandbox cap
  github-connect.ts       GitHub token handling
  vercel-connect.ts       Vercel OAuth token handling
  vercel-deploy-files.ts  builds the exported app
```

## Security

- Generation requests are screened by BotID before reaching a sandbox.
- Agents are tagged with their creator's identity. Only the creator can overwrite or stop a session.
- GitHub and Vercel deploys only ever touch the deploying visitor's own account.
- A connection is only ever generated for a named service. Its credential is never stored, only referenced.
- Chat, generation, and connect requests are rate limited per visitor.
- Generated code runs sandboxed with outbound access locked to only the hosts it needs.

## Limits

Sandboxes run on the [Hobby plan](https://vercel.com/docs/plans/hobby):

- 5 free sandbox CPU hours per month
- Sessions time out automatically after 45 minutes
- Concurrent sandboxes capped per visitor
- All API routes rate limited per IP
- Sandboxes run with `persistent: false`, so stopping one never writes to Snapshot Storage

## Deploy your own

[![Deploy with Vercel](https://camo.githubusercontent.com/7015516519ae874ab75537283bc75f86b3d46386ed994093a3790a1180913164/68747470733a2f2f76657263656c2e636f6d2f627574746f6e)](https://vercel.com/new/clone?repository-url=https://github.com/AbhiVarde/tryeve)

## License

MIT
