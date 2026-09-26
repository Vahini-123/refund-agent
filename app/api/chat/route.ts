import { NextResponse } from "next/server";
import { runAgent } from "../../../lib/agent";
import { addLog } from "../../../lib/logs";

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const reply = await runAgent(messages);
    return NextResponse.json({ reply });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    addLog("error", message);
    return NextResponse.json(
      { reply: "Sorry, something went wrong on our side. Please try again.", error: message },
      { status: 500 }
    );
  }
}