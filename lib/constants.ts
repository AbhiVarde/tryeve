export const SPONSORS_URL = "https://github.com/sponsors/AbhiVarde";

export const MAX_INPUT_LENGTH = 500;
export const MIN_PROMPT_LENGTH = 12;

export const STARTER_PROMPTS = [
  {
    label: "itinerary planner",
    prompt:
      "an agent that builds a customized daily travel itinerary when given a destination, budget, and trip duration",
  },
  {
    label: "packing assistant",
    prompt:
      "an agent that generates a checklist of clothes and gear based on the destination's current weather forecast and trip activities",
  },
  {
    label: "local food guide",
    prompt:
      "an agent that recommends the top five must-try local dishes and highly-rated restaurants in any city",
  },
  {
    label: "flight finder",
    prompt:
      "an agent that searches for the cheapest flight deals between two locations given preferred departure dates and maximum layovers",
  },
] as const;

export const FEATURE_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "build & test",
    items: [
      "describe an agent in plain english",
      "generates real eve files: instructions, typed tools, skills, subagents, mcp connections, schedules, and an eval",
      "connects to real services over mcp when you name one, like linear or notion",
      "tools that send, delete, or charge are generated with an approval gate",
      "generated files are checked and repaired before they are tested",
      "tested live in a sandbox against your actual request before you see it",
      "watch the build happen live, real steps as they run, not a fake timer",
      "generation and testing run as one durable workflow, survives crashes",
      "when the model pool is busy, it retries before giving up",
      "if a build fails, the reason is shown and you can retry with one click",
      "refine an existing agent with a follow-up instead of starting over",
      "describe or message an agent by voice in chrome and edge",
      "uses real web search when a request needs facts, never invents data",
    ],
  },
  {
    label: "deploy & own it",
    items: [
      "inspect every file with syntax highlighting",
      "export the full agent as a zip",
      "deploy any agent straight to your own GitHub, one-time authorization",
      "deploy that same agent to your own vercel account too, live in seconds",
    ],
  },
  {
    label: "chat & share",
    items: [
      "connect to your agent right after it's built, no install needed",
      "chat with it live, with markdown-formatted replies",
      "share a live link, anyone with it can chat with your agent directly",
      "your chat history is saved, reopening an agent restores the real conversation",
      "publish an agent to the public gallery with one toggle",
      "browse and open any agent others have published",
    ],
  },
  {
    label: "reliability & privacy",
    items: [
      "generated code runs sandboxed, network access locked to only what it needs",
      "tool failures and rate limits are handled gracefully, never crash the chat",
      "reload the page anytime, your agent and chat pick up right where you left off",
      "switching tabs never disconnects your agent, only real exits do",
      "dead share links reconnect automatically, no dead ends",
      "warned before disconnect, never cut off without notice",
      "idle or closed sandboxes shut down automatically, nothing left running",
      "only you can overwrite or stop your own agent, others can still chat with it",
      "concurrent sandboxes are capped per visitor to keep usage fair for everyone",
      "your history is private, delete any entry or clear it all",
    ],
  },
];

export const VERCEL_PRODUCTS: { name: string; description: string }[] = [
  {
    name: "eve",
    description: "the agent framework every generated agent runs on",
  },
  { name: "next.js", description: "the app itself" },
  { name: "ai gateway", description: "routes generation to a model" },
  { name: "ai sdk", description: "streams the model's response" },
  {
    name: "sandbox",
    description:
      "tests and runs each agent live, network-locked to only what it needs",
  },
  {
    name: "workflow sdk",
    description: "runs generate + test as one durable workflow",
  },
  { name: "blob", description: "stores agents, sessions, and chat history" },
  { name: "cron", description: "sweeps stale sandbox sessions" },
  {
    name: "observability",
    description: "traces the sandbox pipeline for failures",
  },
  {
    name: "firewall",
    description: "rate limits generation, connect, and chat",
  },
  {
    name: "connect",
    description: "issues scoped GitHub tokens to push generated files",
  },
  {
    name: "vercel oauth",
    description:
      "deploys agents straight to a user's own vercel account, no token of mine involved",
  },
  {
    name: "botid",
    description: "blocks bot traffic on generation, invisible to real users",
  },
  {
    name: "flags sdk",
    description: "flips the model or pauses generation live, no redeploy",
  },
  {
    name: "ai elements",
    description: "chat ui, progress, loading states, and voice input",
  },
  { name: "streamdown", description: "renders code and markdown cleanly" },
  { name: "shadcn/ui", description: "every ui component" },
  { name: "vercel", description: "hosts and deploys the app" },
  {
    name: "analytics",
    description: "tracks usage without slowing things down",
  },
];
