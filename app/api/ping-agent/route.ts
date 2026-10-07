import { isSafeAgentUrl } from "@/app/lib/safe-url";

export async function POST(req: Request) {
  const { url } = await req.json().catch(() => ({}));

  if (!url || typeof url !== "string" || !isSafeAgentUrl(url)) {
    return Response.json({ alive: false }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    return Response.json({ alive: res.status < 500 });
  } catch {
    return Response.json({ alive: false });
  }
}
