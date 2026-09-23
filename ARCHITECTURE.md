# Architecture

System design for tryeve. For the generate/test pipeline in detail, see [HOW_IT_WORKS.md](https://github.com/AbhiVarde/tryeve/blob/main/HOW_IT_WORKS.md).

## Overview

tryeve is a Next.js app that turns a plain English prompt into a tested eve agent, then hands the result to the user as a chat session, a downloadable project, or a deploy to their own GitHub and Vercel accounts.

## Request flow

```
prompt
  │
  ▼
BotID check ──── blocked ──▶ 403
  │ passed
  ▼
jev preflight (AI Gateway) ──── low score ──▶ clarification, no sandbox spent
  │ buildable
  ▼
generation (AI Gateway → model) ──▶ real eve files
  │
  ▼
Vercel Sandbox
  ├─ install eve
  ├─ boot eve dev
  ├─ send live test message
  └─ pass/fail
  │
  ▼
Blob storage (agent, session, transcript, history)
  │
  ├─▶ chat (reuses live sandbox)
  ├─▶ download as zip
  ├─▶ publish (public flag + shared index) ──▶ gallery listing
  ├─▶ deploy to GitHub (Connect + classic OAuth)
  └─▶ deploy to Vercel (Vercel OAuth, depends on GitHub deploy)
```

## Core components

| Layer        | Responsibility                                                                                                                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generation   | AI Gateway routes to a primary model with a fallback chain. System prompt encodes eve's file conventions, tool approval rules, and when to add a connection, schedule, or skill.                                                                                                                                             |
| Preflight    | jev (typesafe ai), called via AI SDK's `evaluate()`, scores whether a prompt is buildable before generation runs. Fails open on error.                                                                                                                                                                                       |
| Verification | A Vercel Sandbox installs and boots the real eve runtime, then sends a live test message. Nothing is shown to the user until this passes.                                                                                                                                                                                    |
| Durability   | Generation and testing run as one Workflow SDK step, `"use workflow"` / `"use step"`. A crash resumes instead of losing the request.                                                                                                                                                                                         |
| Storage      | Blob stores the agent's files, its live session pointer, its chat transcript, and per-visitor history, keyed by a private cookie.                                                                                                                                                                                            |
| Chat         | A live sandbox is kept alive after a passing test. Chat streams through the AI SDK, `useChat`, backed by the sandbox's own HTTP endpoint.                                                                                                                                                                                    |
| Discovery    | A public flag on the agent record and a shared index decide what the gallery lists. Each card's preview image is generated on demand via `next/og` from the agent's prompt.                                                                                                                                                  |
| Deploy       | GitHub deploy uses two separate identities: Vercel Connect for pushing files with a short-lived scoped token, and a classic GitHub OAuth App for repo creation, since GitHub Apps can't create personal repos. Vercel deploy uses a Vercel Marketplace Integration OAuth, runs only after GitHub deploy has produced a repo. |
| Cleanup      | A cron job sweeps sandbox sessions left behind by closed tabs or crashed browsers. Idle sessions also self-terminate client-side.                                                                                                                                                                                            |

## Identity and ownership

Every agent is tagged with its creator's identity at generation time, tracked by a private cookie, not exposed to other visitors.

| Action                          | Who can do it                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| View files, chat via share link | Anyone with the link                                                                       |
| Overwrite or stop a session     | Only the creator                                                                           |
| Publish or unpublish to gallery | Only the creator                                                                           |
| Deploy to GitHub or Vercel      | Only the deploying visitor, against their own account, regardless of who created the agent |

## Network boundaries

| Boundary                | Enforcement                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Bot traffic             | BotID screens the generation endpoint before it reaches the AI Gateway                                                            |
| Abusive request volume  | Vercel Firewall rate limits generation, connect, and chat per visitor                                                             |
| Sandbox outbound access | `Sandbox.create()` network policy allow-lists `registry.npmjs.org` plus the active model-provider host only                       |
| Credential exposure     | Named connection credentials are never stored by tryeve, only referenced by environment variable name, and requested at test time |

## Configuration surface

| Mechanism             | Controls                                                                             |
| --------------------- | ------------------------------------------------------------------------------------ |
| Flags SDK             | Primary generation model, generation kill-switch. Both changeable live, no redeploy. |
| Environment variables | Model credentials, Blob token, GitHub and Vercel OAuth app credentials               |

## What's out of scope by design

tryeve does not host a generated agent as a permanent live service on its own infrastructure. Deploy to GitHub and deploy to Vercel exist specifically so the person ends up owning the running app, not tryeve running it on their behalf indefinitely.
