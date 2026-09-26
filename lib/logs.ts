// lib/logs.ts
// A simple in-memory list of everything the agent does.
// The admin dashboard reads this list.

export type LogType =
  | "user_message"
  | "llm_response"
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "retry"
  | "decision"
  | "final_answer"
  | "error";

export type LogEntry = {
  id: number;
  time: string;
  type: LogType;
  content: unknown;
};

// globalThis keeps one shared list even when Next.js reloads files in dev mode
const g = globalThis as unknown as { __logs?: LogEntry[]; __logId?: number };
g.__logs ??= [];
g.__logId ??= 0;

export function addLog(type: LogType, content: unknown) {
  g.__logId = (g.__logId ?? 0) + 1;
  g.__logs!.push({
    id: g.__logId,
    time: new Date().toISOString(),
    type,
    content,
  });
}

export function getLogs(afterId = 0): LogEntry[] {
  return g.__logs!.filter((l) => l.id > afterId);
}