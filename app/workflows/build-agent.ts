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

rules:
every file must start with // filename: <real path under agent/>
every filename after // filename: must be the actual name, never a placeholder
tool filenames must be descriptive snake_case matching the tool's purpose, since eve derives the tool name from the filename
only include agent.ts if the request specifies or clearly implies a particular model or runtime need, otherwise omit it
only include a subagent if the request genuinely needs a distinct specialist, parallel work, or a narrower toolset, most requests do not need one
never output shell commands, npm commands, or .env files as their own code block
every tool file must import defineTool from eve/tools and use a zod inputSchema
every subagent file must import defineAgent from eve and include a description
no comments explaining the obvious, no em dashes, no filler text
generate 2 to 4 tool files maximum, keep each one small and realistic
now generate a complete agent for the user's request, following this exact format`;

function getBaseUrl() {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export async function buildAgentWorkflow(prompt: string, visitorId?: string) {
  "use workflow";

  const code = await generateAgent(prompt);
  const result = await testAgent(code, visitorId);

  return {
    code,
    passed: result.passed,
    error: result.error ?? null,
    sandboxName: result.sandboxName ?? null,
    url: result.url ?? null,
  };
}

async function generateAgent(prompt: string): Promise<string> {
  "use step";

  const { streamText } = await import("ai");

  const primary = await primaryModel();
  const models = [primary, ...FALLBACK_MODELS];

  let text = "";
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        prompt,
      });

      text = "";
      for await (const chunk of result.textStream) {
        text += chunk;
      }

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
  visitorId?: string,
): Promise<{
  passed: boolean;
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
      body: JSON.stringify({ code, visitorId }),
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
