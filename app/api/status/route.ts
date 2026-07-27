import { readStatus } from "@/app/lib/system-status";

export async function GET() {
  const status = await readStatus();
  return Response.json(status);
}
