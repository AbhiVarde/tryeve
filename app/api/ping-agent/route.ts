export async function POST(req: Request) {
  const { url } = await req.json();

  if (!url || typeof url !== "string") {
    return Response.json({ alive: false }, { status: 400 });
  }

  try {
    const res = await fetch(url, { method: "GET" });
    return Response.json({ alive: res.ok });
  } catch {
    return Response.json({ alive: false });
  }
}
