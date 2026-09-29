import { put, head } from "@vercel/blob";

const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN;

export type BuildResult = {
  code: string;
  passed: boolean;
  skipped: boolean;
  needsClarification: boolean;
  missingConnectionEnv: string[] | null;
  error: string | null;
  sandboxName: string | null;
  url: string | null;
};

export type BuildJob = {
  runId: string;
  visitorId: string;
  prompt: string;
  createdAt: string;
};

type HistoryEntry = { id: string; prompt: string; createdAt: string };

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const blob = await head(path, { token: blobToken() });
    const res = await fetch(blob.url, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(path: string, data: unknown) {
  await put(path, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    token: blobToken(),
  });
}

export const writeJob = (id: string, job: BuildJob) =>
  writeJson(`agents/jobs/${id}.json`, job);

export const readJob = (id: string) =>
  readJson<BuildJob>(`agents/jobs/${id}.json`);

export const readAgent = (id: string) =>
  readJson<{ prompt: string; code: string; ownerId?: string }>(
    `agents/${id}.json`,
  );

export async function readHistory(visitorId: string) {
  return (
    (await readJson<HistoryEntry[]>(`agents/history/${visitorId}.json`)) ?? []
  );
}

// safe to call more than once. the agent record is written last, so a
// failure midway is retried by the next poll
export async function persistBuild(args: {
  id: string;
  job: BuildJob;
  result: BuildResult;
}) {
  const { id, job, result } = args;

  if (!result.code || (!result.passed && !result.skipped)) return;

  const exists = await head(`agents/${id}.json`, { token: blobToken() })
    .then(() => true)
    .catch(() => false);
  if (exists) return;

  if (result.passed && result.sandboxName && result.url) {
    await writeJson(`agents/${id}-session.json`, {
      sandboxName: result.sandboxName,
      url: result.url,
    }).catch((err) => console.error("session write failed:", err));
  }

  const history = await readHistory(job.visitorId);
  if (!history.some((entry) => entry.id === id)) {
    history.unshift({ id, prompt: job.prompt, createdAt: job.createdAt });
    await writeJson(
      `agents/history/${job.visitorId}.json`,
      history.slice(0, 200),
    ).catch((err) => console.error("history write failed:", err));
  }

  await writeJson(`agents/${id}.json`, {
    prompt: job.prompt,
    code: result.code,
    ownerId: job.visitorId,
    public: false,
  });
}
