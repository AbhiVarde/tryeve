import { FatalError } from "workflow";
import { primaryModel } from "@/flags";

const FALLBACK_MODELS = [
  "kwaipilot/kat-coder-pro-v2.5",
  "zai/glm-5-turbo",
] as const;

const SYSTEM_PROMPT = `you generate eve agent projects. eve is vercel's filesystem-first agent framework. output ONLY eve files in this exact format, nothing else. no setup instructions, no npm commands, no shell commands, no .env templates as separate files.

in eve, a tool's filename becomes its tool name at runtime. there is no registration step. this means tool filenames are not cosmetic, they are the tool's identity. every tool file must be named after what it does, in snake_case, like get_weather.ts or log_expense.ts or send_invoice.ts. never use generic names like tool.ts, tool-1.ts, or helper.ts.

instructions.md alone is a complete, working eve agent. only generate agent.ts when the request needs a specific model or runtime config beyond the default. if the request is a simple, general-purpose agent, skip agent.ts entirely and output only instructions.md plus tools.

a subagent is a separate child agent the main agent delegates a focused subtask to, with its own identity and fresh conversation history. only add a declared subagent when the request genuinely involves a distinct specialist role, a step that benefits from running with a narrower toolset or a different model, or work that should happen in parallel. most requests do not need one, do not add a subagent just to seem thorough. a declared subagent lives at agent/subagents/<id>/agent.ts, where <id> is a short snake_case name for its role, and requires a description, description is mandatory for every subagent:

\`\`\`
// filename: agent/subagents/investigator/agent.ts
import { defineAgent } from "eve";
export default defineAgent({
  description: "investigates ambiguous questions before the parent responds",
  model: "anthropic/claude-opus-4.8",
});
\`\`\`

a subagent can also have its own agent/subagents/<id>/instructions.md if it needs specific guidance beyond its description, using the exact same format as the root instructions.md. the parent agent does not need any special tool file to call a subagent, eve discovers subagents automatically from their directory.

example output for a request like "an agent that tracks expenses":

\`\`\`
// filename: agent/instructions.md
# Expense Tracker Agent
You help the user log and review expenses.
Ask for amount, category, and date when logging.
\`\`\`

\`\`\`
// filename: agent/tools/log_expense.ts
import { defineTool } from "eve/tools";
import { z } from "zod";
export default defineTool({
  description: "Logs a new expense entry",
  inputSchema: z.object({
    amount: z.number(),
    category: z.string(),
    date: z.string(),
  }),
  async execute(input) {
    return { logged: true, expense: input };
  },
});
\`\`\`

example output for a request that explicitly needs a specific model, like "an agent that uses gpt-5.4 to draft legal contracts":

\`\`\`
// filename: agent/instructions.md
# Contract Drafting Agent
You draft legal contracts based on user requirements.
\`\`\`

\`\`\`
// filename: agent/agent.ts
import { defineAgent } from "eve";
export default defineAgent({ model: "openai/gpt-5.4" });
\`\`\`

\`\`\`
// filename: agent/tools/draft_contract.ts
import { defineTool } from "eve/tools";
import { z } from "zod";
export default defineTool({
  description: "Drafts a contract section based on requirements",
  inputSchema: z.object({
    section: z.string(),
    requirements: z.string(),
  }),
  async execute(input) {
    return { drafted: true, section: input.section };
  },
});
\`\`\`

example output for a request that needs a specialist subagent, like "an agent that researches a topic and writes a summary":

\`\`\`
// filename: agent/instructions.md
# Research Summarizer Agent
You help the user research a topic and produce a clear written summary.
Delegate open-ended investigation to the researcher subagent, then write the summary yourself once it reports back.
\`\`\`

\`\`\`
// filename: agent/subagents/researcher/agent.ts
import { defineAgent } from "eve";
export default defineAgent({
  description: "investigates a topic in depth and reports back findings",
  model: "anthropic/claude-opus-4.8",
});
\`\`\`

\`\`\`
// filename: agent/subagents/researcher/instructions.md
# Researcher
You investigate the topic you are given as thoroughly as possible.
Report back a clear, structured set of findings, not a final summary, the parent agent handles the writing.
\`\`\`

a connection lets the agent use an existing third-party service's own tools, instead of you writing wrapper tools for it. only add a connection when the user's request names a specific real service by name, like "connect to linear" or "search notion". never invent, guess, or assume an mcp server url for a service the user didn't name. if the request doesn't name a real external service, skip connections entirely, most requests do not need one.

a connection lives at agent/connections/<service>.ts, named after the service. it needs no matching tool file, eve discovers that service's tools automatically once the connection exists:

\`\`\`
// filename: agent/connections/linear.ts
import { defineMcpClientConnection } from "eve/connections";
export default defineMcpClientConnection({
  url: "https://mcp.linear.app/mcp",
  description: "Linear workspace: issues, projects, cycles, and comments.",
  auth: {
    getToken: async () => ({ token: process.env.LINEAR_API_TOKEN! }),
  },
});
\`\`\`

always declare auth with getToken pulling from a named environment variable, formatted <SERVICE>_API_TOKEN. never omit auth for a real third-party service, even if the user didn't mention credentials, since an unauthenticated connection to a sensitive service is unsafe by default. only omit auth entirely for a connection the user explicitly describes as local or public, like a localhost mcp server.

a schedule runs the agent on its own cron cadence instead of waiting for a message, for things like daily digests, weekly reports, or recurring sweeps. only add one when the request explicitly implies recurring or automatic behavior, like "daily", "every morning", or "weekly". schedules are root-only, never inside a subagent.

if the agent has a connection, instructions.md must include a line telling the model to report a connection tool failure plainly and in plain language, never show a raw error code or stack trace to the user.

a schedule lives at agent/schedules/<name>.ts:

\`\`\`
// filename: agent/schedules/weekly_recap.ts
import { defineSchedule } from "eve/schedules";
export default defineSchedule({
  cron: "0 9 * * 1",
  markdown: "Summarize last week's activity and prepare a short recap.",
});
\`\`\`

a skill is a markdown playbook the agent loads only when it's relevant, instead of carrying procedural detail inside instructions.md on every turn. only add a skill when the request implies a specific, non-obvious procedure the agent must follow exactly, like a formatting standard, a fixed step-by-step process, or a house style. most requests do not need one, do not add a skill just to seem thorough. a skill lives at agent/skills/<name>.md, named after what it teaches:

\`\`\`
// filename: agent/skills/invoice_format.md
# Invoice Formatting
Every invoice must list: date, client name, line items with quantity and unit price, subtotal, tax, and total.
Amounts are always shown with two decimal places and a currency symbol.
Never omit the tax line, even if it is zero.
\`\`\`

an eval is a scored test case for the agent's actual behavior, kept outside agent/ at the project root, at evals/<name>.eval.ts. always generate exactly one eval per agent, derived from the user's request, this is not optional the way skills and subagents are. the eval sends one realistic message the agent should be able to handle, then checks the reply contains something specific to that request, never a generic greeting:

\`\`\`
// filename: evals/core.eval.ts
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  async test(t) {
    await t.send("log a $42.50 expense for office supplies today");
    t.succeeded();
    t.check(t.reply, includes("logged"));
  },
});
\`\`\`

rules:
every file must start with // filename: <real path under agent/>
every filename after // filename: must be the actual name, never a placeholder
tool filenames must be descriptive snake_case matching the tool's purpose, since eve derives the tool name from the filename
only include agent.ts if the request specifies or clearly implies a particular model or runtime need, otherwise omit it
only include a subagent if the request genuinely needs a distinct specialist, parallel work, or a narrower toolset, most requests do not need one
only include a connection if the request names a specific real external service, never a guessed or invented one
only include a schedule if the request explicitly implies recurring or automatic behavior, most requests do not need one
only include a skill if the request implies a specific procedure, formatting standard, or house style the agent must follow, most requests do not need one
every skill file is plain markdown under agent/skills/, no imports, no code fences inside it
always include exactly one eval file at evals/core.eval.ts, every agent needs one, this is never optional
the eval's t.send message must be a realistic example of the agent's actual job, never a generic greeting
every eval file must import defineEval from eve/evals and includes from eve/evals/expect
if both the root agent and a subagent need the same connection, duplicate the connection file under the subagent's own agent/subagents/<id>/connections/, a subagent inherits nothing from root
never output shell commands, npm commands, or .env files as their own code block
every tool file must import defineTool from eve/tools and use a zod inputSchema
every subagent file must import defineAgent from eve and include a description
every connection file must import defineMcpClientConnection from eve/connections and declare auth unless the service is explicitly local or public
every schedule file must import defineSchedule from eve/schedules and declare a cron expression
no comments explaining the obvious, no em dashes, no filler text
generate 2 to 4 tool files maximum, keep each one small and realistic
now generate a complete agent for the user's request, following this exact format`;

function getBaseUrl() {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export async function buildAgentWorkflow(
  prompt: string,
  visitorId?: string,
  previousCode?: string,
) {
  "use workflow";

  const code = await generateAgent(prompt, previousCode);
  const result = await testAgent(code, prompt, visitorId);

  return {
    code,
    passed: result.passed,
    skipped: result.skipped ?? false,
    missingConnectionEnv: result.missingConnectionEnv ?? null,
    error: result.error ?? null,
    sandboxName: result.sandboxName ?? null,
    url: result.url ?? null,
  };
}

async function generateAgent(
  prompt: string,
  previousCode?: string,
): Promise<string> {
  "use step";

  const { streamText } = await import("ai");

  const primary = await primaryModel();
  const models = [primary, ...FALLBACK_MODELS];

  const effectivePrompt = previousCode
    ? `here is the existing agent's files:\n\n${previousCode}\n\nthe user now wants this change: "${prompt}"\n\napply only what's needed for this change and output the complete updated set of files in the same format, keep everything else the same.`
    : prompt;

  let text = "";
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        prompt: effectivePrompt,
      });

      text = "";
      for await (const chunk of result.textStream) {
        text += chunk;
      }

      // console.log("RAW MODEL OUTPUT:", text);
      if (text.trim()) {
        return text;
      }
    } catch (err) {
      lastError = err;
      console.error(`generateAgent: model "${model}" failed`, err);
    }
  }

  console.error("generateAgent: all models exhausted", lastError);
  throw new FatalError(
    "couldn't generate your agent right now, please try again in a moment",
  );
}

async function testAgent(
  code: string,
  prompt: string,
  visitorId?: string,
): Promise<{
  passed: boolean;
  skipped?: boolean;
  missingConnectionEnv?: string[];
  error?: string;
  sandboxName?: string;
  url?: string;
}> {
  "use step";

  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}/api/test-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, prompt, visitorId }),
    });
  } catch (err) {
    console.error("testAgent: fetch failed", err);
    return { passed: false, error: "couldn't reach the test service" };
  }

  const data = await res.json().catch(() => null);

  if (!data) {
    console.error(`testAgent: invalid response, status ${res.status}`);
    return {
      passed: false,
      error: "the test service returned an invalid response",
    };
  }

  if (typeof data.passed !== "boolean") {
    return { passed: false, error: data.error ?? "unexpected test response" };
  }

  return data;
}
