export type BuildStep = "preflight" | "generate" | "repair" | "test";

export type BuildEvent = {
  type: "step";
  step: BuildStep;
  status: "running" | "done" | "failed";
  detail?: string;
};

export const BUILD_STEP_LABELS: Record<BuildStep, string> = {
  preflight: "checking the request",
  generate: "writing the agent files",
  repair: "fixing issues in the files",
  test: "testing in a live sandbox",
};

const STEPS = new Set<string>(["preflight", "generate", "repair", "test"]);
const STATUSES = new Set<string>(["running", "done", "failed"]);

export function toBuildEvent(chunk: unknown): BuildEvent | null {
  let value: unknown = chunk;

  if (value instanceof Uint8Array) {
    value = new TextDecoder().decode(value);
  }

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object") return null;

  const e = value as Partial<BuildEvent>;
  if (e.type !== "step" || !e.step || !e.status) return null;
  if (!STEPS.has(e.step) || !STATUSES.has(e.status)) return null;

  return {
    type: "step",
    step: e.step,
    status: e.status,
    detail: typeof e.detail === "string" ? e.detail : undefined,
  };
}
