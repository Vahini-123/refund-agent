# Refund Policy

Reference date for all calculations ("today"): **2026-09-24**.
(In code, keep this as one constant so demos stay consistent.)

## Rules

Every refund request must pass ALL of these rules.

1. **Order must exist and belong to the customer.** The order ID must be found in the customer's account.
2. **Order status must be `delivered`.** Orders that are `shipped`, `processing`, or `cancelled` are not eligible.
3. **Not already refunded.** An order with status `refunded` cannot be refunded again.
4. **30-day window.** The refund request must be within 30 days of the purchase date. Day 30 is allowed; day 31 is denied.
5. **Digital goods are non-refundable.** This includes software licenses, e-books, and gift cards (`isDigital: true`).
6. **Final-sale items are non-refundable.** Clearance items marked `finalSale: true` cannot be returned.
7. **Refund limit.** A customer may receive at most **2 refunds per rolling 12 months**. If `refundsLast12Months` is already 2 or more, deny.
8. **High-value approval.** Orders with a price **over $500** cannot be approved by the AI agent. They must be escalated to a human.

## Decision order

Check rules in the order above (1 to 8).

- If any of rules 1 to 7 fails, **deny** and state the specific rule that failed.
- Only if rules 1 to 7 all pass, apply rule 8: **escalate** if price is over $500, otherwise **approve**.

## Agent behavior requirements

- The agent must never approve or deny from its own judgment. It must use the eligibility tool.
- The agent must always tell the customer the reason for a denial or escalation.
- The agent must not offer exceptions, discounts, or workarounds that are not in this policy.
