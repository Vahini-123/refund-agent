"use client";

import { useState, useRef, useEffect } from "react";

type Message = { role: "user" | "assistant"; text: string; badge?: Badge };
type Badge = "approved" | "denied" | "escalated" | "error" | null;

const EXAMPLES = [
  { label: "Standard refund", text: "Hi, I'd like a refund for order ORD-1005. My email is noah.brown@example.com" },
  { label: "Too old (45 days)", text: "I want a refund for order ORD-1002. My email is priya.patel@example.com" },
  { label: "Digital item", text: "Please refund order ORD-1003. My email is liam.johnson@example.com" },
  { label: "Over $500", text: "I need a refund for order ORD-1004. My email is emma.wilson@example.com" },
  { label: "Wrong order ID", text: "Refund order ORD-9999 please. My email is aarav.sharma@example.com" },
];

const BADGES: Record<string, { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  denied: { label: "Denied", className: "bg-red-100 text-red-700 border-red-300" },
  escalated: { label: "Escalated", className: "bg-amber-100 text-amber-700 border-amber-300" },
  error: { label: "Needs info", className: "bg-gray-100 text-gray-600 border-gray-300" },
};

function detectBadge(text: string): Badge {
  const t = text.toLowerCase();
  if (t.includes("refund") && (t.includes("approved") || t.includes("issued") || t.includes("processed"))) return "approved";
  if (t.includes("escalat") || t.includes("human agent will") || t.includes("human review")) return "escalated";
  if (t.includes("unable") || t.includes("cannot") || t.includes("not eligible") || t.includes("denied") || t.includes("non-refundable")) return "denied";
  if (t.includes("couldn't find") || t.includes("could not find") || t.includes("double-check") || t.includes("double check")) return "error";
  return null;
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const next: Message[] = [...messages, { role: "user", text: content }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, text }) => ({ role, text })) }),
      });
      const data = await res.json();
      const reply: string = data.reply ?? "Sorry, something went wrong.";
      setMessages([...next, { role: "assistant", text: reply, badge: detectBadge(reply) }]);
    } catch {
      setMessages([...next, { role: "assistant", text: "Network error. Please try again.", badge: "error" }]);
    } finally {
      setLoading(false);
    }
  }

  function goToAdmin() {
    window.location.href = "/admin";
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-gray-900">
      <div className="mx-auto flex h-screen max-w-2xl flex-col p-4">
        <header className="mb-3 flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
              AI
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Refund Support Assistant</h1>
              <p className="text-xs text-gray-500">Usually replies in a few seconds</p>
            </div>
          </div>
          <button
            onClick={goToAdmin}
            className="rounded-full border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Admin dashboard
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2 text-sm">
              Hi! I can help with refund requests. Please share your email and order ID.
            </div>
          </div>

          {messages.map((m, i) => (
            <div key={i} className={"flex flex-col " + (m.role === "user" ? "items-end" : "items-start")}>
              <div
                className={
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm " +
                  (m.role === "user"
                    ? "rounded-br-sm bg-blue-600 text-white"
                    : "rounded-bl-sm bg-gray-100 text-gray-900")
                }
              >
                {m.text}
              </div>
              {m.badge && BADGES[m.badge] && (
                <span
                  className={
                    "mt-1 rounded-full border px-2 py-0.5 text-[10px] font-medium " + BADGES[m.badge].className
                  }
                >
                  {BADGES[m.badge].label}
                </span>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <TypingDots />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="my-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => send(ex.text)}
              disabled={loading}
              className="rounded-full border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {ex.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type your message..."
            className="flex-1 rounded-full border bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={() => send()}
            disabled={loading}
            className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}