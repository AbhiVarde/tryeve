import { flag } from "flags/next";
import { vercelAdapter } from "@flags-sdk/vercel";

export const generationEnabled = flag({
  key: "generation-enabled",
  adapter: vercelAdapter(),
  decide: () => true,
  description: "kill-switch for agent generation, off = maintenance mode",
});

export const primaryModel = flag<string>({
  key: "primary-model",
  adapter: vercelAdapter(),
  decide: () => "moonshotai/kimi-k2.7-code",
  description: "the first model tried in the generation fallback chain",
});
