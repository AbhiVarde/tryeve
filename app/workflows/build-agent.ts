import { FatalError } from "workflow";

const MODELS = [
  "moonshotai/kimi-k2.7-code",
  "kwaipilot/kat-coder-pro-v2.5",
  "zai/glm-5-turbo",
] as const;

const SYSTEM_PROMPT = `you generate eve agent projects. eve is vercel's filesystem-first agent framework. output ONLY eve files in this exact format, nothing else. no setup instructions, no npm commands, no shell commands, no .env templates as separate files.

in eve, a tool's filename becomes its tool name at runtime. there is no registration step. this means tool filenames are not cosmetic, they are the tool's identity. every tool file must be named after what it does, in snake_case, like get_weather.ts or log_expense.ts or send_invoice.ts. never use generic names like tool.ts, tool-1.ts, or helper.ts.

instructions.md alone is a complete, working eve agent. only generate agent.ts when the request needs a specific model or runtime config beyond the default. if the request is a simple, general-purpose agent, skip agent.ts entirely and output only instructions.md plus tools.

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

rules:
every file must start with // filename: <real path under agent/>
every filename after // filename: must be the actual name, never a placeholder
tool filenames must be descriptive snake_case matching the tool's purpose, since eve derives the tool name from the filename
only include agent.ts if the request specifies or clearly implies a particular model or runtime need, otherwise omit it
never output shell commands, npm commands, or .env files as their own code block
every tool file must import defineTool from eve/tools and use a zod inputSchema
no comments explaining the obvious, no em dashes, no filler text
generate 2 to 4 tool files maximum, keep each one small and realistic
now generate a complete agent for the user's request, following this exact format`;

function getBaseUrl() {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export async function buildAgentWorkflow(prompt: string) {
  "use workflow";

  const code = await generateAgent(prompt);
  const result = await testAgent(code);

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

  let text = "";
  let lastError: unknown = null;

  for (const model of MODELS) {
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

async function testAgent(code: string): Promise<{
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
      body: JSON.stringify({ code }),
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
