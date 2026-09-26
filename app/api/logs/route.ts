import { NextResponse } from "next/server";
import { getLogs } from "../../../lib/logs";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  return NextResponse.json(getLogs(after));
}
