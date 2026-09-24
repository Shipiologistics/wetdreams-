import { describe, expect, it } from "vitest";
import { extractCallbackOrderId, findCoinPackage, isPay100OrderId, pay100CreateResponseSchema } from "@/lib/payments/pay100-core";

const orderId = "KZ-0123456789ABCDEF0123456789ABCDEF";

describe("Pay100 payment validation", () => {
  it("accepts only server-defined coin packages", () => {
    expect(findCoinPackage("BONUS10")).toMatchObject({ priceInr: 100, coins: 110 });
    expect(findCoinPackage("SUPER100")).toMatchObject({ priceInr: 750, coins: 850 });
    expect(findCoinPackage("START45")).toBeNull();
    expect(findCoinPackage("FAKE5000")).toBeNull();
  });

  it("validates internal order IDs and callback shapes", () => {
    expect(isPay100OrderId(orderId)).toBe(true);
    expect(isPay100OrderId("ORDER-1001")).toBe(false);
    expect(extractCallbackOrderId({ order_id: orderId })).toBe(orderId);
    expect(extractCallbackOrderId({ data: { order_id: orderId } })).toBe(orderId);
    expect(extractCallbackOrderId({ order_id: "ORDER-1001" })).toBeNull();
  });

  it("rejects a create response without a UPI intent URI", () => {
    expect(pay100CreateResponseSchema.safeParse({
      success: true,
      data: { order_id: orderId, amount: "50.00", status: "PENDING", expires_in_minutes: 10 },
    }).success).toBe(false);
  });
});
