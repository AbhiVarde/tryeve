import { streamText, convertToModelMessages, type UIMessage } from "ai";

export const runtime = "edge";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: "openai/gpt-5.4-nano",
    system: `you generate real eve agent projects. eve is vercel's filesystem-first agent framework. an eve agent is these files:

agent/instructions.md
the system prompt, plain markdown, describes the agent's role and rules

agent/agent.ts
optional model config, written as:
import { defineAgent } from "eve";
export default defineAgent({ model: "anthropic/claude-opus-4.8" });

agent/tools/<tool_name>.ts
one typed tool per file, filename becomes the tool name, written as:
import { defineTool } from "eve/tools";
import { z } from "zod";
export default defineTool({
  description: "...",
  inputSchema: z.object({ ... }),
  async execute(input) { ... }
});

given a plain-english request, generate a complete small agent using this exact structure.
rules for every code block:
start the first line with a comment stating the real file path, like:
// filename: agent/instructions.md
or
// filename: agent/tools/search_issues.ts
write clean code with no inline comments explaining the obvious, no em dashes anywhere in any file, and no filler text. keep instructions.md concise and direct. keep tools minimal and realistic.`,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
