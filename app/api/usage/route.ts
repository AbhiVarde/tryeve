import { cookies } from "next/headers";
import { getMonthlyUsage } from "@/app/lib/sandbox-quota";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const visitorId = cookieStore.get("tryeve_vid")?.value;

  const usage = await getMonthlyUsage(visitorId);

  return Response.json(usage);
}
