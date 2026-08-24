import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const accept = request.headers.get("accept") || "";
  const wantsMarkdown = accept.includes("text/markdown");

  const response = NextResponse.next();

  const existingVary = response.headers.get("vary") || "";
  const varyParts = new Set(
    existingVary
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
  varyParts.add("Accept");
  response.headers.set("Vary", Array.from(varyParts).join(", "));

  if (wantsMarkdown) {
    response.headers.set("x-wants-markdown", "1");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
