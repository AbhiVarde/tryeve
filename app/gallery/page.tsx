import Link from "next/link";
import { head } from "@vercel/blob";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/topbar";

type PublicEntry = { id: string; prompt: string; createdAt: string };

async function getPublicAgents(): Promise<PublicEntry[]> {
  try {
    const blob = await head("agents/public/index.json", {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(blob.url, { cache: "no-store" });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export const metadata = {
  title: "gallery",
  description: "agents built with tryeve, shared publicly",
};

export default async function GalleryPage() {
  const agents = await getPublicAgents();

  return (
    <AppShell>
      <TopBar />
      <div className="mx-auto w-full max-w-2xl px-6 pt-24 pb-16">
        <h1 className="mb-6 font-mono text-lg font-medium">gallery</h1>
        {agents.length === 0 ? (
          <p className="font-mono text-sm text-muted-foreground">
            no public agents yet, be the first to share one
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
