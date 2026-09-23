import { FatalError } from "workflow";
import { experimental_evaluate } from "ai";
import { primaryModel } from "@/flags";

const DEFAULT_MODEL = "inclusionai/ling-3.0-flash-vl";

const FALLBACK_MODELS = [
  "inclusionai/ling-3.0-flash-vl-free",
  "inclusionai/ling-3.0-flash-fin",
  "inclusionai/ling-3.0-flash-fin-free",
  "poolside/laguna-s-2.1-free",
] as const;

const BUILDABLE_THRESHOLD = 0.35;
const ROUNDS = 3;
const ROUND_DELAY_MS = 4000;
const MODEL_DELAY_MS = 1000;
const TEST_RETRY_DELAY_MS = 5000;
const NON_RETRYABLE_TEST_ERROR =
  /too many active|no model credentials|no tool or agent files/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const file = (name: string, body: string) =>
  ["```", `// filename: ${name}`, body.trim(), "```"].join("\n");

const AGENT_TS = `
import { defineAgent } from "eve";
export default defineAgent({
  model: "${DEFAULT_MODEL}",
  modelOptions: {
    providerOptions: {
      gateway: {
        models: ["${FALLBACK_MODELS[0]}", "${FALLBACK_MODELS[1]}"],
      },
    },
  },
});
`;

const SYSTEM_PROMPT = [
  `you generate eve agent projects. eve is vercel's filesystem-first agent framework, an agent is a directory of files discovered by name, with no registration step. output only files in the exact format shown below, nothing else. no setup instructions, no shell commands, no .env files.`,

  `files you may output, each in its own code block that starts with a "// filename: <path>" line:
agent/instructions.md, always. the agent's always-on system prompt
agent/agent.ts, always. every agent sets its model explicitly
agent/tools/<snake_case_name>.ts, one to three small tools. the filename is the tool name at runtime, so name it after what it does, like log_expense.ts, never tool.ts or helper.ts
agent/skills/<name>.md, only when the request implies a specific procedure, formatting standard, or house style. plain markdown, no imports, no code fences
agent/subagents/<id>/agent.ts plus an optional instructions.md, only for a distinct specialist, parallel work, or a narrower toolset. description is required
agent/connections/<service>.ts, only when the user names a real external service
agent/schedules/<name>.ts, only when the request implies recurring or automatic behavior, root only
evals/core.eval.ts, always, exactly one
most requests need only instructions.md, agent.ts, one to three tools, and the eval.`,

  `example for "an agent that tracks expenses":`,
  file(
    "agent/instructions.md",
    `
# Expense Tracker Agent
You help the user log expenses.
Ask for amount, category, and date when any is missing.
Always call log_expense to log an expense, never log it in text, then report the tool's result.
If the message is not about logging an expense, answer directly in plain text without calling any tool.
`,
  ),
  file("agent/agent.ts", AGENT_TS),
  file(
    "agent/tools/log_expense.ts",
    `
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
    try {
      return { success: true, logged: true, expense: input };
    } catch {
      return { success: false, message: "couldn't log the expense" };
    }
  },
});
`,
  ),
  file(
    "evals/core.eval.ts",
    `
import { defineEval } from "eve/evals";

export default defineEval({
  async test(t) {
    await t.send("log a $42.50 expense for office supplies today");
    t.succeeded();
    t.calledTool("log_expense");

    await t.send("tell me a joke");
    t.succeeded();
    t.calledTool("log_expense", { count: 0 });
  },
});
`,
  ),

  `live data uses the built-in web search tool, never a custom fetch:`,
  file(
    "agent/tools/web_search.ts",
    `export { default } from "eve/tools/web_search";`,
  ),

  `a tool with a real-world side effect needs human approval:`,
  file(
    "agent/tools/send_invoice.ts",
    `
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
export default defineTool({
  description: "Sends an invoice email to a client",
  needsApproval: always(),
  inputSchema: z.object({ to: z.string(), amount: z.number() }),
  async execute(input) {
    try {
      return { success: true, sent: true, invoice: input };
    } catch {
      return { success: false, message: "couldn't send the invoice" };
    }
  },
});
`,
  ),

  `a named service uses a connection, its tools are discovered automatically:`,
  file(
    "agent/connections/linear.ts",
    `
import { defineMcpClientConnection } from "eve/connections";
export default defineMcpClientConnection({
  url: "https://mcp.linear.app/mcp",
  description: "Linear workspace: issues, projects, cycles, and comments.",
  auth: {
    getToken: async () => ({ token: process.env.LINEAR_API_TOKEN! }),
  },
});
`,
  ),

  `recurring behavior uses a schedule:`,
  file(
    "agent/schedules/weekly_recap.ts",
    `
import { defineSchedule } from "eve/schedules";
export default defineSchedule({
  cron: "0 9 * * 1",
  markdown: "Summarize last week's activity and prepare a short recap.",
});
`,
  ),

  `a specialist subagent, the parent discovers it from its directory:`,
  file(
    "agent/subagents/researcher/agent.ts",
    `
import { defineAgent } from "eve";
export default defineAgent({
  description: "investigates a topic in depth and reports back findings",
  model: "${DEFAULT_MODEL}",
});
`,
  ),

  `rules:
model: default agent.ts to "${DEFAULT_MODEL}" with the gateway fallbacks shown in the example. only use another model when the user names one, and then use exactly that id
tools: import defineTool from "eve/tools" and use a zod inputSchema. execute() wraps its logic in try/catch and never throws. when it fails or has no real data source, return { success: false, message: "..." } and never invent values. tools do the real work, a calculation tool computes and returns the numbers, a logging tool returns what it logged
live data: weather, news, prices, scores, and any real-world fact always use agent/tools/web_search.ts. custom tools never call fetch or any url, the sandbox blocks outbound network access
approval: a tool that sends, deletes, charges, deploys, or publishes sets needsApproval: always() imported from eve/tools/approval. plain lookups, calculations, and logging never do
instructions: instructions.md tells the agent to always call its tool for the task the tool does, never do that work in text, and report the tool's result. it also tells the agent to answer directly in plain text, without calling any tool, when the message does not match what a tool does. with a connection, it also tells the agent to report a connection failure in plain language, never a raw error code or stack trace
connections: only for a service the user names, never an invented url. always declare auth with getToken reading process.env.<SERVICE>_API_TOKEN, omit auth only for a service the user calls local or public
eval: an agent with tools sends two messages, each with await t.send(...), each its own fresh session. first message is a realistic task the agent's job actually handles, never a greeting, followed by t.succeeded() then t.calledTool("<tool filename without extension>"). second message is the negative check and must be copied verbatim from this exact list, never invented: "tell me a joke", "what's 2 plus 2", "say hi". a custom message risks overlapping the agent's own domain and failing a correct agent. followed by t.succeeded() then t.calledTool("<same tool>", { count: 0 }). with multiple tools, only the primary tool needs the negative check. never check t.reply for an agent with tools, small models can return an empty reply after a tool call. an agent with no tools sends one message and checks t.reply with includes(...) from eve/evals/expect and a common word. a schedule-only agent sends one message asking it to run the scheduled action now
style: no comments, no em dashes, no filler text, output the files and nothing else`,

  `now generate a complete agent for the user's request, following this exact format.`,
].join("\n\n");

function getBaseUrl() {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

function readFiles(raw: string) {
  const files = new Map<string, string>();
  const regex =
    /```[a-zA-Z]*\n(?:\/\/|#)\s*filename:\s*(\S+)[^\n]*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    files.set(match[1].trim(), match[2].trim());
  }
  return files;
}

function validateAgent(raw: string): string[] {
  const files = readFiles(raw);
  const problems: string[] = [];

  for (const required of [
    "agent/instructions.md",
    "agent/agent.ts",
    "evals/core.eval.ts",
  ]) {
    if (!files.has(required)) problems.push(`missing ${required}`);
  }

  const tools = [...files].filter(([name]) => name.startsWith("agent/tools/"));

  for (const [name, body] of tools) {
    if (!/^agent\/tools\/[a-z][a-z0-9_]*\.ts$/.test(name)) {
      problems.push(`tool filename must be snake_case: ${name}`);
    }
    if (/\bfetch\s*\(|https?:\/\//.test(body)) {
      problems.push(
        `${name} must not call external urls, use agent/tools/web_search.ts for live data`,
      );
    }
  }

  const evalBody = files.get("evals/core.eval.ts") ?? "";

  if (tools.length > 0) {
    const toolNames = tools.map(([name]) =>
      name.slice("agent/tools/".length, -".ts".length),
    );
    if (!toolNames.some((tool) => evalBody.includes(`calledTool("${tool}")`))) {
      problems.push(
        "evals/core.eval.ts must call t.calledTool with an existing tool name",
      );
    }
    if (/t\.reply/.test(evalBody)) {
      problems.push(
        "evals/core.eval.ts must not check t.reply when the agent has tools",
      );
    }
    if ((evalBody.match(/await t\.send\(/g) ?? []).length < 2) {
      problems.push(
        "evals/core.eval.ts must call t.send at least twice for a tool-using agent, once for the real task and once for an off-topic message that should not call any tool",
      );
    }
    const NEGATIVE_CHECK_PHRASES = [
      "tell me a joke",
      "what's 2 plus 2",
      "say hi",
    ];
    if (!NEGATIVE_CHECK_PHRASES.some((phrase) => evalBody.includes(phrase))) {
      problems.push(
        `evals/core.eval.ts must use one of these exact negative-check phrases for the second t.send: ${NEGATIVE_CHECK_PHRASES.map((p) => `"${p}"`).join(", ")}`,
      );
    }
  }

  return problems;
}

function buildPrompt(
  prompt: string,
  previousCode?: string,
  repair?: { code: string; problems: string[] },
) {
  const base = previousCode
    ? `here is the existing agent's files:\n\n${previousCode}\n\nthe user now wants this change: "${prompt}"\n\napply only what's needed for this change and output the complete updated set of files in the same format, keep everything else the same.`
    : prompt;

  if (!repair) return base;

  return `${base}\n\nyour previous output had these problems:\n- ${repair.problems.join("\n- ")}\n\nprevious output:\n${repair.code}\n\nfix every problem and output the complete set of files again.`;
}

export async function buildAgentWorkflow(
  prompt: string,
  visitorId?: string,
  previousCode?: string,
) {
  "use workflow";

  if (!previousCode) {
    const preflight = await checkBuildable(prompt);
    if (!preflight.buildable) {
      return {
        code: "",
        passed: false,
        skipped: true,
        needsClarification: true,
        missingConnectionEnv: null,
        error: preflight.reason ?? null,
        sandboxName: null,
        url: null,
      };
    }
  }

  let code = await generateAgent(prompt, previousCode);
  const problems = validateAgent(code);

  if (problems.length > 0) {
    console.error("buildAgentWorkflow: repairing output", problems);
    code = await generateAgent(prompt, previousCode, { code, problems });
    const remaining = validateAgent(code);
    if (remaining.length > 0) {
      console.error("buildAgentWorkflow: still invalid", remaining);
    }
  }

  let result = await testAgent(code, prompt, visitorId);

  if (
    !result.passed &&
    !result.skipped &&
    result.error?.startsWith("eval failed")
  ) {
    code = await generateAgent(prompt, previousCode, {
      code,
      problems: [
        result.error,
        "Fix agent/instructions.md: only call tools for the task they are designed for. For off-topic messages such as jokes, greetings, or simple questions, respond in plain text without calling a tool.",
      ],
    });

    result = await testAgent(code, prompt, visitorId);
  }

  return {
    code,
    passed: result.passed,
    skipped: result.skipped ?? false,
    needsClarification: false,
    missingConnectionEnv: result.missingConnectionEnv ?? null,
    error: result.error ?? null,
    sandboxName: result.sandboxName ?? null,
    url: result.url ?? null,
  };
}

async function checkBuildable(
  prompt: string,
): Promise<{ buildable: boolean; reason?: string }> {
  "use step";

  try {
    const result = await experimental_evaluate({
      model: "typesafe-ai/jev",
      state: { prompt },
      questions: {
        buildable: {
          type: "boolean",
          instructions:
            "can a working eve agent (instructions.md plus a few typed tools) actually be generated from this request? answer false only if the request is too vague, contradictory, or not describing an agent at all.",
        },
      },
    });

    if (result.answers.buildable.probability < BUILDABLE_THRESHOLD) {
      return {
        buildable: false,
        reason:
          "this description is too vague to build from, try naming what the agent should actually do, like 'log expenses with amount and category' instead of 'help me with money'",
      };
    }

    return { buildable: true };
  } catch (err) {
    console.error("checkBuildable: jev failed, skipping preflight", err);
    return { buildable: true };
  }
}

async function generateAgent(
  prompt: string,
  previousCode?: string,
  repair?: { code: string; problems: string[] },
): Promise<string> {
  "use step";

  const { streamText } = await import("ai");

  const primary = await primaryModel();
  const models = [...new Set<string>([primary, ...FALLBACK_MODELS])];
  const userPrompt = buildPrompt(prompt, previousCode, repair);

  let lastError: unknown = null;

  for (let round = 0; round < ROUNDS; round++) {
    if (round > 0) await sleep(ROUND_DELAY_MS * round);

    for (const [i, model] of models.entries()) {
      if (i > 0) await sleep(MODEL_DELAY_MS);

      try {
        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
          prompt: userPrompt,
          maxRetries: 0,
        });

        let text = "";
        for await (const chunk of result.textStream) {
          text += chunk;
        }

        if (text.trim()) return text;
      } catch (err) {
        lastError = err;
        console.error(
          `generateAgent: round ${round + 1}, "${model}" failed`,
          err,
        );
      }
    }
  }

  console.error("generateAgent: all rounds exhausted", lastError);
  throw new FatalError(
    "the free model pool is busy right now, please try again in a minute",
  );
}

type TestResult = {
  passed: boolean;
  skipped?: boolean;
  missingConnectionEnv?: string[];
  error?: string;
  sandboxName?: string;
  url?: string;
};

async function callTestService(
  code: string,
  prompt: string,
  visitorId?: string,
): Promise<TestResult> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/test-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, prompt, visitorId }),
    });

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
  } catch (err) {
    console.error("testAgent: fetch failed", err);
    return { passed: false, error: "couldn't reach the test service" };
  }
}

async function testAgent(
  code: string,
  prompt: string,
  visitorId?: string,
): Promise<TestResult> {
  "use step";

  const first = await callTestService(code, prompt, visitorId);

  if (
    first.passed ||
    first.skipped ||
    NON_RETRYABLE_TEST_ERROR.test(first.error ?? "")
  ) {
    return first;
  }

  await sleep(TEST_RETRY_DELAY_MS);
  return callTestService(code, prompt, visitorId);
}
