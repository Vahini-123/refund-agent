import { NextResponse } from "next/server";
import { checkRefundEligibility, listAllOrders } from "../../../lib/tools";

export async function GET() {
  const results = listAllOrders().map((o) => ({
    orderId: o.orderId,
    ...checkRefundEligibility(o),
  }));
  return NextResponse.json(results);
}