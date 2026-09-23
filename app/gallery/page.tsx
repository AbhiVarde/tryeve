import Link from "next/link";
import { head } from "@vercel/blob";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/topbar";

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
  description: "agents the community has published",
};

export default async function GalleryPage() {
  const agents = await getPublicAgents();

  return (
    <AppShell>
      <TopBar />
      <div className="mx-auto w-full max-w-2xl px-6 pt-24 pb-16">
        <div className="mb-6">
          <h1 className="font-mono text-lg font-medium">gallery</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            agents the community has published
          </p>
        </div>
        {agents.length === 0 ? (
          <p className="font-mono text-sm text-muted-foreground">
            nothing published yet — be the first to share an agent
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {agents.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/agent/${a.id}`}
                  className="block rounded-md border border-border/40 px-3 py-2 font-mono text-sm transition-colors hover:bg-accent"
                >
                  {a.prompt}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
