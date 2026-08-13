# ▲ tryeve

**Agent Runtime for eve.**

tested against a live eve runtime, ready to talk before you ever see it. no install, no terminal.

[live demo](https://tryeve.abhivarde.in) · built with ▲ [vercel](https://vercel.com)

## what it does

you type a description. tryeve generates real eve files, boots them in an isolated sandbox against the actual eve runtime, and only shows you the result once it has confirmed the agent responds. if it passes, you can chat with it live, download it as a working project, deploy it straight to your own GitHub or your own vercel account, or share a link that lets anyone else talk to it too.

reload the page anytime. your agent, your chat, your files, all still there.

## features

- describe an agent in plain english
- generates real, working eve files
- generation requests are screened by botid before they reach the ai gateway, bots never touch a sandbox
- the model used for generation and a kill-switch can be flipped live from the dashboard, no redeploy
- every agent is tested against a live eve runtime before you see it
- generation and testing run as one durable step, survives crashes
- if a build fails, the reason is shown and you can retry with one click
- inspect every file with syntax highlighting
- export the full agent as a zip
- deploy any generated agent straight to your own GitHub, no OAuth app to set up yourself
- deploy that same agent to your own vercel account too, one-time authorization, full app included, not just the agent's api, chat ui ships in the same repo
- one manual step remains after vercel deploy, add a model credential in your new project's settings and redeploy, no key of mine ships with your copy
- share a live link to any agent you build, anyone with the link can chat with it directly
- connect to your agent right after it's built, no install needed
- chat with it live, with markdown formatted replies
- your chat transcript is saved, reopening an agent from history or a share link restores the real conversation, not an empty chat
- reload the page anytime, your agent and chat pick up right where you left off
- idle or closed sandboxes shut down automatically, nothing left running
- switching tabs never disconnects your agent, only closing the tab or explicit disconnect does
- warned before disconnect, never cut off without notice
- only you can overwrite or stop your own agent's session, anyone with your share link can still chat with it, they just can't touch it
- every agent you've built is saved to your own private history, delete any entry or clear it all
- concurrent sandboxes are capped per visitor, so usage stays fair for everyone
- dark, minimal interface

## how it works

1. you describe an agent
2. a botid check runs first, bot traffic is rejected before it costs anything
3. the ai gateway routes the request to a model (switchable live via flags sdk), which writes real eve files
4. a vercel sandbox installs eve for real and boots it, no stubs
5. tryeve sends a live test message and confirms the agent actually responds
6. if it passes, the sandbox is kept alive rather than thrown away, so connecting afterward is instant
7. the agent, its live session, and its chat transcript are stored in blob, so a share link or a page reload brings it all back, including past messages
8. it's also added to your own history, tracked by a private cookie, not visible to anyone else
9. optionally, deploy the generated files straight to your own GitHub via Vercel Connect, no long-lived secret ever stored
10. optionally, deploy that same repo straight to your own vercel account via a vercel oauth authorization, no token of mine ever touches it, this deploys the whole app, agent and chat ui together, not the agent alone

steps 2 through 4 run as one durable workflow step, so a crash mid generation doesn't lose your request. a scheduled cron job separately sweeps any sandbox sessions left behind by a closed tab or crashed browser.

for the full technical breakdown, including real bugs hit building this, see [HOW_IT_WORKS.md](https://github.com/AbhiVarde/tryeve/blob/main/HOW_IT_WORKS.md).

## built with ▲

| product                                                | role                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --- |
| [next.js](https://nextjs.org)                          | the app itself                                                                              |
| [ai gateway](https://vercel.com/docs/ai-gateway)       | routes the generation request to a model                                                    |
| [ai sdk](https://sdk.vercel.ai)                        | streams the model's response                                                                |
| [sandbox](https://vercel.com/docs/sandbox)             | tests every agent against a real eve runtime, then runs it live so you can talk to it       |
| [workflow sdk](https://vercel.com/docs/workflow)       | runs generate and test as one durable step                                                  |
| [blob](https://vercel.com/docs/storage/vercel-blob)    | stores each agent, its live session, chat transcript, and per-visitor history               |
| [cron](https://vercel.com/docs/cron-jobs)              | sweeps stale sandbox sessions on a schedule                                                 |
| [firewall](https://vercel.com/docs/vercel-firewall)    | rate limits generation, connect, and chat requests                                          |
| [observability](https://vercel.com/docs/observability) | traces the sandbox pipeline for failures                                                    |
| [connect](https://vercel.com/docs/connect)             | issues short-lived, user-scoped GitHub tokens to deploy generated agents, no stored secrets |
| [vercel oauth](https://vercel.com/docs/integrations)   | lets a visitor authorize deploy-to-vercel on their own account, no token of mine involved   |
| [botid](https://vercel.com/docs/botid)                 | blocks bot traffic on generation, invisible to real users                                   |
| [flags sdk](https://vercel.com/docs/feature-flags)     | flips the model or pauses generation live, no redeploy                                      |
| [ai elements](https://ai-sdk.dev/elements)             | chat interface, task progress ui, loading states                                            |
| [streamdown](https://streamdown.ai)                    | renders code and markdown cleanly                                                           |
| [shadcn/ui](https://ui.shadcn.com)                     | every ui component                                                                          |
| [vercel](https://vercel.com)                           | hosts and deploys the app                                                                   |
| [analytics](https://vercel.com/docs/analytics)         | tracks real usage without slowing anything down                                             |     |

icons animated by [lucide-animated](https://lucide-animated.com).

## getting started

clone the repo and install dependencies:

```
git clone https://github.com/AbhiVarde/tryeve.git
cd tryeve
npm install
```

link the project to vercel and pull environment variables:

```
vercel link
vercel env pull
```

run the dev server:

```
npm run dev
```

open [localhost:3000](http://localhost:3000).

## environment variables

tryeve needs at least one model credential and a blob token. set these in your vercel project or in `.env.local`:

```
BLOB_READ_WRITE_TOKEN=

# at least one of the following
AI_GATEWAY_API_KEY=
VERCEL_OIDC_TOKEN=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# optional, only needed for GitHub deploy
GITHUB_CONNECTOR_UID=github/tryeve
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=

# optional, only needed for vercel deploy (requires GitHub deploy to run first)
VERCEL_OAUTH_CLIENT_ID=
VERCEL_OAUTH_CLIENT_SECRET=
VERCEL_INTEGRATION_SLUG=
```

`VERCEL_OIDC_TOKEN` is generated automatically when the project is linked and deployed on vercel. for local development, `vercel env pull` handles this for you.

`GITHUB_CONNECTOR_UID` defaults to `github/tryeve`, used to push generated files via a Vercel Connect GitHub App connector — see [Vercel Connect docs](https://vercel.com/docs/connect) for setup.

`GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` come from a separate, plain GitHub OAuth App, used only to create the repository itself. GitHub Apps cannot create repositories on personal accounts, so repo creation goes through a direct classic OAuth flow instead of Connect.

`VERCEL_OAUTH_CLIENT_ID`, `VERCEL_OAUTH_CLIENT_SECRET`, and `VERCEL_INTEGRATION_SLUG` come from a Vercel Marketplace Integration, used to let a visitor authorize deploy-to-vercel on their own account. deploy-to-vercel reads from the repo created by GitHub deploy, so GitHub deploy must run first.

## project structure

```
app/
  api/
    build-agent/      generates and tests an agent as one durable workflow step
    test-agent/       boots the agent in a sandbox and confirms it responds
    run-agent/        boots or reuses a live sandbox for chat, owner-restricted
    stop-agent/       stops a sandbox on disconnect, idle, or tab close, owner-restricted
    agent-chat/       streams chat responses from the live sandbox, rate limited
    agents/           returns the current visitor's private history
    save-transcript/  persists chat messages so past conversations survive reloads
    github/deploy/          creates the repo (direct OAuth) and pushes files (via Connect)
    github/oauth/start/     redirects to GitHub's OAuth consent screen
    github/oauth/callback/  exchanges the OAuth code for a token, stores it
    vercel/deploy-repo/     deploys the existing GitHub repo to the visitor's own vercel account
    vercel/oauth/callback/  exchanges the vercel OAuth code for a token, stores it
    cron/cleanup/     scheduled sweep for stale sandbox sessions
  agent/[id]/         shared agent view, includes real chat, not just file viewing
  page.tsx            the main app
components/
  agent-chat-panel.tsx   chat state, streaming ui, transcript sync
lib/
  sandbox-quota.ts       per-visitor concurrent sandbox cap
  github-connect.ts       Vercel Connect token handling for GitHub deploy
  vercel-connect.ts       vercel OAuth token handling for vercel deploy
```

## security

- generation requests are screened by botid before reaching a sandbox, keeping bot traffic and cost predictable
- generated agents are tagged with their creator's identity at generation time
- anyone with a share link can view a generated agent's files and chat with it live
- only the original creator can overwrite or stop that agent's session, share-link visitors cannot
- GitHub deploy only ever touches the deploying visitor's own GitHub account, never the original agent owner's data
- vercel deploy only ever touches the deploying visitor's own vercel account, never the original agent owner's data
- chat, generation, and connect requests are all rate limited per visitor

## limits

sandboxes run on the [hobby plan](https://vercel.com/docs/plans/hobby) by default. this means:

- 5 free sandbox cpu hours per month
- sandbox sessions can run up to 45 minutes before an automatic timeout
- concurrent sandboxes are capped per visitor to keep usage fair
- generation, connect, and chat requests are all rate limited per ip
- sandboxes are created with `persistent: false`, so stopping one never writes to Snapshot Storage, only compute hours apply

these are generous enough for regular use. earlier builds of this project did not set `persistent: false`, which caused Snapshot Storage (a separate Hobby allowance) to fill up from routine testing alone. that's fixed as of the current version, heavy usage now only affects the compute hour allowance, not storage.

## deploy your own

[![deploy with vercel](https://camo.githubusercontent.com/7015516519ae874ab75537283bc75f86b3d46386ed994093a3790a1180913164/68747470733a2f2f76657263656c2e636f6d2f627574746f6e)](https://vercel.com/new/clone?repository-url=https://github.com/AbhiVarde/tryeve)

## license

mit
