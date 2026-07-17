import { FatalError } from "workflow";

export async function buildAgentWorkflow(prompt: string) {
  "use workflow";

  const code = await generateAgent(prompt);
  const result = await testAgent(code);

  return { code, passed: result.passed, error: result.error ?? null };
}

async function generateAgent(prompt: string) {
  "use step";

  const { streamText } = await import("ai");
  const result = streamText({
    model: "openai/gpt-5.4-nano",
    system: `you generate real eve agent projects...`,
    prompt,
  });

  let text = "";
  for await (const chunk of result.textStream) {
    text += chunk;
  }

  if (!text.trim()) {
    throw new FatalError("model returned no output");
  }

  return text;
}

async function testAgent(code: string) {
  "use step";

  const res = await fetch(
    `${process.env.VERCEL_URL ?? "http://localhost:3000"}/api/test-agent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    },
  );

  return res.json();
}
