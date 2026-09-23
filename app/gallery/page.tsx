import { head } from "@vercel/blob";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/topbar";
import { GalleryCard } from "./gallery-card";

type PublicEntry = { id: string; prompt: string; createdAt: string };

export const dynamic = "force-dynamic";

async function getPublicAgents(): Promise<PublicEntry[]> {
  try {
    const blob = await head("agents/public/index.json", {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(`${blob.url}?v=${blob.uploadedAt.getTime()}`, {
      cache: "no-store",
    });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export const metadata = {
  title: "gallery",
  description: "agents published by the community",
};

export default async function GalleryPage() {
  const agents = await getPublicAgents();

  return (
    <AppShell>
      <TopBar />
      <div className="mx-auto w-full max-w-3xl px-6 pt-24 pb-16">
        <div className="mb-8">
          <h1 className="font-mono text-lg font-medium">gallery</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {agents.length > 0
              ? `${agents.length} agent${agents.length !== 1 ? "s" : ""} published by the community`
              : "agents published by the community"}
          </p>
        </div>
        {agents.length === 0 ? (
          <p className="font-mono text-sm text-muted-foreground">
            nothing published yet. be the first to share an agent.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <GalleryCard
                key={a.id}
                id={a.id}
                prompt={a.prompt}
                createdAt={a.createdAt}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
