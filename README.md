\# AI Customer Support Agent — Refund Assistant

A full-stack Next.js application where an AI agent handles e-commerce refund requests end-to-end: it talks to the customer, calls tools to check a strict refund policy, and either approves, denies, or escalates the request — all while a live admin dashboard shows exactly what the agent is thinking and doing.

Built for the Jobform Automator Next.js Developer take-home assignment.

## Demo

- **Live walkthrough video:** [https://drive.google.com/file/d/1dNQxwLFfSdcA0ymmY9J6ylSz2B1CT0HP/view?usp=sharing]
- **Customer chat:** `http://localhost:3000`
- **Admin dashboard:** `http://localhost:3000/admin`

## Why this architecture

The core design decision in this project is: **the LLM never decides policy. Code does.**

The AI's only job is to hold a natural conversation and decide *which tool to call and when*. Every actual rule (refund windows, digital goods, dollar thresholds, refund limits) lives in plain TypeScript functions in `lib/tools.ts`. Even if the model hallucinates or is told to "make an exception," `issueRefund()` re-checks the policy internally before it will touch any data — so a bad decision from the LLM can never actually issue a bad refund.

This mirrors how you'd want to build this in production: LLMs are great at orchestration and conversation, unreliable as the source of truth for business rules.

## Architecture

```
┌─────────────────┐        ┌──────────────────┐        ┌─────────────────────┐
│  Customer Chat   │──POST─▶│   /api/chat       │──────▶│   Agent Loop         │
│  (app/page.tsx)  │        │  (route.ts)       │        │   (lib/agent.ts)     │
└─────────────────┘        └──────────────────┘        └──────────┬───────────┘
                                                                    │ tool calls
                                                                    ▼
┌─────────────────┐        ┌──────────────────┐        ┌─────────────────────┐
│  Admin Dashboard │◀──GET──│   /api/logs       │◀───────│   Tools              │
│  (app/admin)     │ poll   │  (route.ts)       │  logs  │   (lib/tools.ts)     │
└─────────────────┘        └──────────────────┘        └──────────┬───────────┘
                                                                    │ reads/writes
                                                                    ▼
                                                          ┌─────────────────────┐
                                                          │  Mock CRM + Policy   │
                                                          │  (data/*.json, .md)  │
                                                          └─────────────────────┘
```

**Flow of a single request:**

1. Customer sends a message on the chat page.
2. `/api/chat` hands the full conversation to `runAgent()`.
3. The agent calls Gemini with the conversation, the policy document (injected into the system prompt), and a list of six available tools.
4. If Gemini requests a tool call, the agent runs the real function, logs every step (`addLog`), and sends the result back to Gemini.
5. This repeats (max 8 steps) until Gemini has a final natural-language answer for the customer.
6. Every step — messages, tool calls, tool results, errors, retries, and the final decision — is written to an in-memory log store that the admin dashboard polls once per second.

## Tech stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **Google Gemini** (`@google/genai`) for the LLM, using raw function calling (no LangGraph/CrewAI — see "Design decisions" below)
- No database — a mock CRM (`data/customers.json`) is loaded into memory and mutated as refunds are processed

## Project structure

```
refund-agent/
├── app/
│   ├── page.tsx              # Customer chat UI
│   ├── admin/page.tsx        # Admin reasoning-log dashboard
│   └── api/
│       ├── chat/route.ts     # POST — runs the agent loop
│       ├── logs/route.ts     # GET  — returns the reasoning log
│       └── test/route.ts     # GET  — runs the policy engine against all mock orders (sanity check)
├── lib/
│   ├── tools.ts               # The 6 agent tools + the refund policy logic
│   ├── agent.ts                # The agent loop: LLM ↔ tools, retries, model fallback
│   └── logs.ts                 # In-memory reasoning-log store
├── data/
│   ├── customers.json          # 15 mock customers with 17 orders, covering every rule
│   └── policy.md                # The refund policy, in plain English (also fed to the LLM)
└── .env.local                   # GEMINI_API_KEY (not committed)
```

## The refund policy

Full text in [`data/policy.md`](./data/policy.md). Summary, checked in order:

| # | Rule | Result if it fails |
|---|------|---------------------|
| 1 | Order must belong to the customer's email | Deny |
| 2 | Order status must be `delivered` | Deny |
| 3 | Order must not already be refunded | Deny |
| 4 | Must be within 30 days of purchase | Deny |
| 5 | Digital goods (software, e-books, gift cards) are non-refundable | Deny |
| 6 | Final-sale items are non-refundable | Deny |
| 7 | Max 2 refunds per customer per 12 months | Deny |
| 8 | Orders over $500 need a human | Escalate |

If rules 1–7 all pass and the order is $500 or under, the refund is **approved** automatically.

## The 6 agent tools

| Tool | Purpose |
|---|---|
| `lookupCustomer` | Find a customer and their orders by email |
| `getOrder` | Get one order's details |
| `checkRefundEligibility` | Run the policy above, return approve/deny/escalate + reason |
| `issueRefund` | Mark an order refunded — re-validates the policy itself before touching data |
| `denyRefund` | Record a denial with its reason |
| `escalateToHuman` | Create a human-review ticket |

The AI is instructed to **always** call `checkRefundEligibility` before taking any action, and to never invent exceptions outside the policy.

## Failure handling & reliability

This was a specific focus, since the assignment asks for it explicitly:

- **Model fallback:** `lib/agent.ts` tries a list of Gemini models in order (`gemini-3.5-flash-lite` → `gemini-3.8-flash` → ...). If one is overloaded (`503`) or unavailable, it retries once, then automatically moves to the next model.
- **Tool error recovery:** if a tool throws (e.g., a customer gives a wrong order ID), the error is caught, logged as `tool_error`, and fed back to the LLM as a tool result — so the agent can gracefully tell the customer to double-check, instead of crashing.
- **Step limit:** the agent loop is capped at 8 steps so it can never run forever if the model gets stuck in a call-a-tool loop.
- **Defense in depth:** `issueRefund()` re-runs the eligibility check itself. Even a compromised or confused LLM cannot force a policy-violating refund through.
- All of the above is visible live in the admin dashboard (orange = retry/fallback, red = tool error, dark green = final decision).

## Setup

```bash
git clone <your-repo-url>
cd refund-agent
npm install
```

Create `.env.local` in the project root:

```
GEMINI_API_KEY=your_key_here
```

Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

```bash
npm run dev
```

Open:
- `http://localhost:3000` — customer chat
- `http://localhost:3000/admin` — admin dashboard
- `http://localhost:3000/api/test` — sanity check: runs the policy against all 17 mock orders

## Demo scenarios

The chat page has one-click buttons for these, matched to specific mock orders:

| Button | Customer | Order | Expected result |
|---|---|---|---|
| Standard refund | Noah Brown | ORD-1005 | Approved |
| Too old (45 days) | Priya Patel | ORD-1002 | Denied — window |
| Digital item | Liam Johnson | ORD-1003 | Denied — digital goods |
| Over $500 | Emma Wilson | ORD-1004 | Escalated to human |
| Wrong order ID | — | ORD-9999 | Tool error, handled gracefully |

**Note:** refunds mutate in-memory data. Restart the dev server (`Ctrl+C` then `npm run dev`) to reset all orders before a fresh demo run.

## Design decisions & trade-offs

- **Raw function calling instead of LangGraph/CrewAI:** for a single agent with 6 tools and a simple loop, a hand-rolled loop is more transparent and easier to explain/debug than pulling in a graph framework — appropriate for this scope. LangGraph would earn its complexity with multiple cooperating agents or more complex branching state.
- **In-memory data instead of a real database:** kept the assignment focused on the agent/tool architecture rather than infra. `data/customers.json` acts as a mock CRM; refunds mutate an in-memory copy that resets on server restart.
- **Gemini over OpenAI/Anthropic:** free tier, no billing setup required, was the fastest path to a working demo. Swapping providers only requires changing `lib/agent.ts`.
- **Polling instead of WebSockets for the dashboard:** the admin page polls `/api/logs` every second. Simpler to implement and reason about than a WebSocket server, "real-time" enough for this use case (sub-second is not required for reviewing agent reasoning).

## Known limitations

- Data resets on server restart (no persistent database).
- No authentication on the admin dashboard — would add auth before any real deployment.
- The free-tier Gemini API occasionally returns `503 (overloaded)`; the retry/fallback logic mitigates but can't fully eliminate this.
- Voice functionality: [include if implemented, otherwise remove this line]

## What I'd do with more time

- Persist the CRM in a real database (e.g., Postgres via Prisma) instead of an in-memory copy.
- Add authentication to the admin dashboard.
- Stream the agent's reasoning to the dashboard via WebSockets instead of polling.
- Add a voice pipeline (OpenAI Realtime API / ElevenLabs) for spoken refund requests.