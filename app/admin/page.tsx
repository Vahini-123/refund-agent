"use client";

import { useEffect, useMemo, useState } from "react";

type LogEntry = { id: number; time: string; type: string; content: unknown };

const STYLES: Record<string, { label: string; box: string; tag: string }> = {
  user_message: { label: "Customer message", box: "border-blue-200 bg-blue-50", tag: "bg-blue-600" },
  llm_response: { label: "Agent thought", box: "border-purple-200 bg-purple-50", tag: "bg-purple-600" },
  tool_call: { label: "Tool call", box: "border-amber-200 bg-amber-50", tag: "bg-amber-600" },
  tool_result: { label: "Tool result", box: "border-green-200 bg-green-50", tag: "bg-green-600" },
  tool_error: { label: "Tool error", box: "border-red-200 bg-red-50", tag: "bg-red-600" },
  retry: { label: "Retry / fallback", box: "border-orange-200 bg-orange-50", tag: "bg-orange-600" },
  decision: { label: "DECISION", box: "border-emerald-400 bg-emerald-100", tag: "bg-emerald-700" },
  final_answer: { label: "Reply to customer", box: "border-indigo-200 bg-indigo-50", tag: "bg-indigo-600" },
  error: { label: "Error", box: "border-red-300 bg-red-100", tag: "bg-red-700" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "decision", label: "Decisions" },
  { key: "tool_call", label: "Tool calls" },
  { key: "tool_error", label: "Errors" },
  { key: "retry", label: "Retries" },
];

function show(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

// Pull a one-line summary out of a log entry's content, for the collapsed view
function summarize(l: LogEntry): string {
  const c = l.content as Record<string, unknown> | string;
  if (typeof c === "string") return c.slice(0, 100);
  if (l.type === "tool_call") return `${c.name}(${JSON.stringify(c.args)})`;
  if (l.type === "tool_result") return `${c.name} -> ${JSON.stringify(c.result).slice(0, 80)}`;
  if (l.type === "tool_error") return `${c.name} failed: ${c.error}`;
  if (l.type === "decision") return `${c.action} -> ${JSON.stringify(c.result).slice(0, 80)}`;
  return JSON.stringify(c).slice(0, 100);
}

export default function AdminPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [online, setOnline] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/logs", { cache: "no-store" });
        setLogs(await res.json());
        setOnline(true);
      } catch {
        setOnline(false);
      }
    }
    load();
    const timer = setInterval(load, 1000);
    return () => clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    let approved = 0, denied = 0, escalated = 0, errors = 0;
    for (const l of logs) {
      if (l.type === "decision") {
        const c = l.content as { action: string };
        if (c.action === "issueRefund") approved++;
        else if (c.action === "denyRefund") denied++;
        else if (c.action === "escalateToHuman") escalated++;
      }
      if (l.type === "tool_error" || l.type === "error") errors++;
    }
    return { approved, denied, escalated, errors };
  }, [logs]);

  const ordered = [...logs].reverse();
  const filtered = filter === "all" ? ordered : ordered.filter((l) => l.type === filter);

  return (
    <div className="min-h-screen bg-gray-50 p-4 text-gray-900">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between pb-4">
          <div>
            <h1 className="text-xl font-semibold">Agent Reasoning Log</h1>
            <p className="text-sm text-gray-500">
              Live view, updates every second &middot; {logs.length} entries
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className={"flex items-center gap-1 text-xs " + (online ? "text-green-600" : "text-red-600")}>
              <span className={"h-2 w-2 rounded-full " + (online ? "bg-green-500" : "bg-red-500")} />
              {online ? "Live" : "Disconnected"}
            </span>
            <a href="/" className="text-sm text-blue-600 underline">
              Customer chat
            </a>
          </div>
        </header>

        {/* Summary stats */}
        <div className="mb-4 grid grid-cols-4 gap-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
            <div className="text-2xl font-semibold text-emerald-700">{stats.approved}</div>
            <div className="text-xs text-emerald-700">Approved</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
            <div className="text-2xl font-semibold text-red-700">{stats.denied}</div>
            <div className="text-xs text-red-700">Denied</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
            <div className="text-2xl font-semibold text-amber-700">{stats.escalated}</div>
            <div className="text-xs text-amber-700">Escalated</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
            <div className="text-2xl font-semibold text-gray-700">{stats.errors}</div>
            <div className="text-xs text-gray-500">Tool errors</div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={
                "rounded-full border px-3 py-1 text-xs " +
                (filter === f.key ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100")
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="rounded-lg border bg-white p-6 text-center text-sm text-gray-500">
            No activity yet. Send a message in the customer chat and it will appear here.
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((l) => {
            const style = STYLES[l.type] ?? { label: l.type, box: "border-gray-200 bg-white", tag: "bg-gray-600" };
            const isOpen = expanded === l.id;
            return (
              <div
                key={l.id}
                className={"cursor-pointer rounded-lg border p-3 " + style.box}
                onClick={() => setExpanded(isOpen ? null : l.id)}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={"rounded px-2 py-0.5 text-xs font-medium text-white " + style.tag}>
                      {style.label}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(l.time).toLocaleTimeString()}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{isOpen ? "▲ collapse" : "▼ expand"}</span>
                </div>
                {isOpen ? (
                  <pre className="whitespace-pre-wrap break-words text-xs">{show(l.content)}</pre>
                ) : (
                  <p className="truncate text-xs text-gray-700">{summarize(l)}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}