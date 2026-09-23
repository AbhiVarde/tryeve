import { ImageResponse } from "next/og";
import { head } from "@vercel/blob";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "tryeve agent";

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let prompt = "shared agent";

  try {
    const blob = await head(`agents/${id}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(`${blob.url}?v=${blob.uploadedAt.getTime()}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data: { prompt: string } = await res.json();
      prompt = data.prompt;
    }
  } catch {
    // keep the fallback prompt text
  }

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px",
        backgroundColor: "#0a0a0a",
        backgroundImage:
          "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.06), transparent 60%)",
      }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: "monospace",
          fontSize: 28,
          color: "rgba(255,255,255,0.5)",
        }}
      >
        tryeve
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: "monospace",
          fontSize: 44,
          lineHeight: 1.4,
          color: "rgba(255,255,255,0.92)",
          maxWidth: "960px",
        }}
      >
        {truncate(prompt, 140)}
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: "monospace",
          fontSize: 22,
          color: "rgba(255,255,255,0.4)",
        }}
      >
        tryeve.abhivarde.in
      </div>
    </div>,
    { ...size },
  );
}
