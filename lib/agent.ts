// lib/agent.ts
// The agent loop: LLM asks for tools, our code runs them, repeat until done.

import { GoogleGenAI, type Content, type Part } from "@google/genai";
import fs from "fs";
import path from "path";
import * as tools from "./tools";
import { addLog } from "./logs";

// The agent tries these in order. If one is overloaded or unavailable, it moves to the next.
const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];
const MAX_STEPS = 8; // safety limit so the loop can never run forever

const policyText = fs.readFileSync(
  path.join(process.cwd(), "data", "policy.md"),
  "utf-8"
);

const SYSTEM_PROMPT = `You are a friendly customer support agent for an online store. You handle refund requests.

How you work:
1. If you don't have BOTH the customer's email and the order ID, ask for them.
2. ALWAYS call checkRefundEligibility before deciding anything.
3. Follow its decision exactly:
   - "approve"  -> call issueRefund
   - "deny"     -> call denyRefund with the reason
   - "escalate" -> call escalateToHuman with the reason
4. Never make exceptions or promises outside the policy. Never decide policy yourself.
5. After the action, tell the customer the outcome and the reason in 2-3 short, polite sentences.
6. If a tool returns an error (for example, order not found), tell the customer and ask them to double-check.

Here is the policy for reference:
${policyText}`;

// Tell the AI which tools exist and what inputs they need
const functionDeclarations = [
  {
    name: "lookupCustomer",
    description: "Find a customer and list their orders by email address.",
    parametersJsonSchema: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
  },
  {
    name: "getOrder",
    description: "Get details of one order by order ID.",
    parametersJsonSchema: {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    },
  },
  {
    name: "checkRefundEligibility",
    description:
      "Check the refund policy for an order. Returns approve, deny, or escalate with a reason. Always call this before deciding.",
    parametersJsonSchema: {
      type: "object",
      properties: { orderId: { type: "string" }, email: { type: "string" } },
      required: ["orderId", "email"],
    },
  },
  {
    name: "issueRefund",
    description: "Issue the refund. Only call after checkRefundEligibility returned approve.",
    parametersJsonSchema: {
      type: "object",
      properties: { orderId: { type: "string" }, email: { type: "string" } },
      required: ["orderId", "email"],
    },
  },
  {
    name: "denyRefund",
    description: "Record a refund denial with the reason.",
    parametersJsonSchema: {
      type: "object",
      properties: { orderId: { type: "string" }, reason: { type: "string" } },
      required: ["orderId", "reason"],
    },
  },
  {
    name: "escalateToHuman",
    description: "Send the case to a human agent, for example for orders over $500.",
    parametersJsonSchema: {
      type: "object",
      properties: { orderId: { type: "string" }, reason: { type: "string" } },
      required: ["orderId", "reason"],
    },
  },
];

// Map tool names to the real functions in tools.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const implementations: Record<string, (input: any) => unknown> = {
  lookupCustomer: tools.lookupCustomer,
  getOrder: tools.getOrder,
  checkRefundEligibility: tools.checkRefundEligibility,
  issueRefund: tools.issueRefund,
  denyRefund: tools.denyRefund,
  escalateToHuman: tools.escalateToHuman,
};

// Call Gemini. If a model fails, retry once, then fall back to the next model.
async function generateWithRetry(contents: Content[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let lastError: unknown;

  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [{ functionDeclarations }],
          },
        });
      } catch (e) {
        lastError = e;
        addLog("retry", `Model ${model} failed (attempt ${attempt}/2): ${String(e)}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    addLog("retry", `Switching away from ${model} to the next model.`);
  }
  throw lastError;
}

export type ChatMessage = { role: "user" | "assistant"; text: string };

export async function runAgent(history: ChatMessage[]): Promise<string> {
  // Convert our simple messages into Gemini's format
  const contents: Content[] = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.text }],
  }));

  addLog("user_message", history[history.length - 1]?.text ?? "");

  for (let step = 1; step <= MAX_STEPS; step++) {
    const response = await generateWithRetry(contents);
    const calls = response.functionCalls;

    // No tool requested -> this is the final answer
    if (!calls || calls.length === 0) {
      const text = response.text ?? "Sorry, I couldn't generate a reply.";
      addLog("final_answer", text);
      return text;
    }

    // The AI wants tools. Remember what it said, then run each tool.
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);
    if (response.text) addLog("llm_response", response.text);

    const resultParts: Part[] = [];

    for (const call of calls) {
      const name = call.name ?? "";
      const args = call.args ?? {};
      addLog("tool_call", { step, name, args });

      try {
        if (!implementations[name]) throw new Error(`Unknown tool: ${name}`);
        const result = implementations[name](args);
        addLog("tool_result", { name, result });

        if (["issueRefund", "denyRefund", "escalateToHuman"].includes(name)) {
          addLog("decision", { action: name, result });
        }
        resultParts.push({ functionResponse: { name, response: { result } } });
      } catch (e) {
        // Failure handling: tell the AI what went wrong so it can recover
        const message = e instanceof Error ? e.message : String(e);
        addLog("tool_error", { name, error: message });
        resultParts.push({ functionResponse: { name, response: { error: message } } });
      }
    }

    // Send the tool results back to the AI and loop again
    contents.push({ role: "user", parts: resultParts });
  }

  addLog("error", `Stopped after ${MAX_STEPS} steps without a final answer.`);
  return "I'm having trouble completing this request. A human agent will follow up with you.";
}