export const SPONSORS_URL = "https://github.com/sponsors/AbhiVarde";

export const MAX_INPUT_LENGTH = 500;
export const MIN_PROMPT_LENGTH = 12;

export const STARTER_PROMPTS = [
  {
    label: "itinerary planner",
    prompt:
      "an agent that builds a daily travel itinerary from a destination, budget, and trip length",
  },
  {
    label: "packing assistant",
    prompt:
      "an agent that lists clothes and gear based on the destination's weather forecast and trip activities",
  },
  {
    label: "local food guide",
    prompt:
      "an agent that recommends five must-try dishes and well-rated restaurants in any city",
  },
  {
    label: "flight finder",
    prompt:
      "an agent that finds the cheapest flights between two places for given dates and a maximum number of layovers",
  },
] as const;

export const FEATURE_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "build and test",
    items: [
      "describe an agent in plain english",
      "writes real eve files: instructions, typed tools, skills, subagents, mcp connections, schedules and an eval",
      "connects to real services over mcp when you name one, like linear or notion",
      "tools that send, delete or charge get an approval gate",
      "uses web search for live facts, never invents data",
      "files are validated and repaired before testing",
      "every agent is tested live in a sandbox before you see it",
      "real build steps stream as they run",
      "generation and testing run as one durable workflow",
      "retries when the model pool is busy, one click to retry a failed build",
      "refine an existing agent with a follow-up",
      "describe or message an agent by voice in chrome and edge",
    ],
  },
  {
    label: "cli",
    items: [
      "build from your terminal with npx @abhivarde/tryeve",
      "one github sign-in, same live eve test, files written to your disk",
      "deploy to github or vercel from inside the agent folder",
      "--json prints one machine-readable object for coding agents",
      "ships an agent skill so coding agents know how to use it",
    ],
  },
  {
    label: "deploy and own it",
    items: [
      "inspect every file with syntax highlighting",
      "export the full agent as a zip",
      "deploy to your own github with a one-time authorization",
      "deploy that repo to your own vercel account",
    ],
  },
  {
    label: "chat and share",
    items: [
      "chat with your agent right after it's built, no install",
      "replies render as markdown",
      "share a live link, anyone with it can chat",
      "reopening an agent restores the real conversation",
      "publish to the public gallery with one toggle",
      "browse and open agents others have published",
    ],
  },
  {
    label: "reliability and privacy",
    items: [
      "generated code runs sandboxed with locked-down network access",
      "tool failures and rate limits never crash the chat",
      "reload anytime, your agent and chat stay put",
      "switching tabs never disconnects, only real exits do",
      "dead share links reconnect automatically",
      "you are warned before a disconnect",
      "idle sandboxes shut down on their own",
      "only the creator can overwrite or stop an agent",
      "concurrent sandboxes are capped per visitor",
      "history is private, delete one entry or all of it",
    ],
  },
];

export const VERCEL_PRODUCTS: { name: string; description: string }[] = [
  { name: "eve", description: "the framework every generated agent runs on" },
  { name: "next.js", description: "the app" },
  { name: "ai gateway", description: "routes generation to a model" },
  { name: "ai sdk", description: "streams model output" },
  {
    name: "sandbox",
    description: "tests and runs each agent, network access locked down",
  },
  {
    name: "workflow sdk",
    description: "runs generate and test as one durable workflow",
  },
  { name: "blob", description: "stores agents, sessions and chat history" },
  { name: "cron", description: "sweeps stale sandbox sessions" },
  { name: "observability", description: "traces the sandbox pipeline" },
  {
    name: "firewall",
    description: "rate limits generation, connect and chat",
  },
  {
    name: "connect",
    description: "issues scoped github tokens to push generated files",
  },
  {
    name: "vercel oauth",
    description: "deploys to your own vercel account, no shared token",
  },
  { name: "botid", description: "blocks bot traffic on generation" },
  {
    name: "flags sdk",
    description: "switches the model or pauses generation, no redeploy",
  },
  {
    name: "ai elements",
    description: "chat ui, progress, loading states and voice input",
  },
  { name: "streamdown", description: "renders code and markdown" },
  { name: "shadcn/ui", description: "every ui component" },
  { name: "vercel", description: "hosts and deploys the app" },
  { name: "analytics", description: "usage tracking, no slowdown" },
];
