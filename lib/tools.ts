// lib/tools.ts
// The six tools the AI agent can call.
// KEY IDEA: the refund policy lives HERE, in plain code.
// The AI never decides policy. It only calls these functions.

import customersData from "../data/customers.json";

// One fixed "today" so the day counts match policy.md and the demo.
export const TODAY = "2026-09-24";

export type Order = {
  orderId: string;
  item: string;
  price: number;
  purchaseDate: string;
  status: string;
  category: string;
  isDigital: boolean;
  finalSale: boolean;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  tier: string;
  refundsLast12Months: number;
  orders: Order[];
};

// Our fake "CRM database": a copy of customers.json kept in memory.
// Refunds change this copy, not the file. It resets when the server restarts.
const db: Customer[] = JSON.parse(JSON.stringify(customersData));

// ---------- helpers ----------

function daysSince(dateStr: string): number {
  const ms = new Date(TODAY).getTime() - new Date(dateStr).getTime();
  return Math.floor(ms / 86400000); // milliseconds in one day
}

function findOrder(orderId: string) {
  for (const customer of db) {
    const order = customer.orders.find((o) => o.orderId === orderId);
    if (order) return { customer, order };
  }
  return null;
}

// ---------- tool 1: lookupCustomer ----------

export function lookupCustomer(input: { email: string }) {
  const customer = db.find(
    (c) => c.email.toLowerCase() === input.email.toLowerCase()
  );
  if (!customer) throw new Error(`No customer found with email ${input.email}`);
  return {
    name: customer.name,
    tier: customer.tier,
    refundsLast12Months: customer.refundsLast12Months,
    orders: customer.orders.map((o) => ({
      orderId: o.orderId,
      item: o.item,
      price: o.price,
      status: o.status,
    })),
  };
}

// ---------- tool 2: getOrder ----------

export function getOrder(input: { orderId: string }) {
  const found = findOrder(input.orderId);
  if (!found) throw new Error(`Order ${input.orderId} not found`);
  return { ...found.order, daysSincePurchase: daysSince(found.order.purchaseDate) };
}

// ---------- tool 3: checkRefundEligibility (THE POLICY) ----------

export type Eligibility = {
  decision: "approve" | "deny" | "escalate";
  ruleFailed: number | null; // which policy rule number failed, if any
  reason: string;
};

export function checkRefundEligibility(input: {
  orderId: string;
  email: string;
}): Eligibility {
  const found = findOrder(input.orderId);
  if (!found) throw new Error(`Order ${input.orderId} not found`);
  const { customer, order } = found;
  const days = daysSince(order.purchaseDate);

  // Rule 1: the order must belong to this customer
  if (customer.email.toLowerCase() !== input.email.toLowerCase()) {
    return { decision: "deny", ruleFailed: 1, reason: "This order does not belong to the email provided." };
  }
  // Rules 2 and 3: status must be "delivered" and not already refunded
  if (order.status === "refunded") {
    return { decision: "deny", ruleFailed: 3, reason: "This order has already been refunded." };
  }
  if (order.status !== "delivered") {
    return { decision: "deny", ruleFailed: 2, reason: `Order status is "${order.status}". Only delivered orders can be refunded.` };
  }
  // Rule 4: 30-day window (day 30 allowed, day 31 denied)
  if (days > 30) {
    return { decision: "deny", ruleFailed: 4, reason: `Purchased ${days} days ago. Refunds are only allowed within 30 days.` };
  }
  // Rule 5: digital goods
  if (order.isDigital) {
    return { decision: "deny", ruleFailed: 5, reason: "Digital goods (software, e-books, gift cards) are non-refundable." };
  }
  // Rule 6: final sale
  if (order.finalSale) {
    return { decision: "deny", ruleFailed: 6, reason: "This is a final-sale item and cannot be refunded." };
  }
  // Rule 7: max 2 refunds per 12 months
  if (customer.refundsLast12Months >= 2) {
    return { decision: "deny", ruleFailed: 7, reason: "Customer has reached the limit of 2 refunds in 12 months." };
  }
  // Rule 8: over $500 needs a human (only checked if rules 1-7 all passed)
  if (order.price > 500) {
    return { decision: "escalate", ruleFailed: 8, reason: `Order value $${order.price} is over $500 and needs human approval.` };
  }

  return { decision: "approve", ruleFailed: null, reason: `Eligible: ${days} days since purchase, delivered, physical item, within refund limit.` };
}

// ---------- tool 4: issueRefund ----------

export function issueRefund(input: { orderId: string; email: string }) {
  // Safety net: re-check the policy inside the tool.
  // Even if the AI makes a mistake, a bad refund can never go through.
  const check = checkRefundEligibility(input);
  if (check.decision !== "approve") {
    throw new Error(`Refund blocked by policy: ${check.reason}`);
  }
  const { customer, order } = findOrder(input.orderId)!;
  order.status = "refunded";
  customer.refundsLast12Months += 1;
  return {
    success: true,
    orderId: order.orderId,
    refundedAmount: order.price,
    message: `Refund of $${order.price} issued for ${order.item}.`,
  };
}

// ---------- tool 5: denyRefund ----------

export function denyRefund(input: { orderId: string; reason: string }) {
  return { recorded: true, orderId: input.orderId, decision: "denied", reason: input.reason };
}

// ---------- tool 6: escalateToHuman ----------

export function escalateToHuman(input: { orderId: string; reason: string }) {
  return {
    ticketId: `ESC-${Date.now()}`,
    orderId: input.orderId,
    status: "sent to human review",
    reason: input.reason,
  };
}

// Helper used only by the test page
export function listAllOrders() {
  return db.flatMap((c) => c.orders.map((o) => ({ email: c.email, orderId: o.orderId })));
}