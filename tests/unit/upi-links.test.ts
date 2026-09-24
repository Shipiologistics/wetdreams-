import { describe, expect, it } from "vitest";
import { createUpiAppLink } from "@/lib/payments/upi-links";

const intent = "upi://pay?pa=merchant%40yesbankltd&pn=Kizo&tr=KZ-123&am=100.00&cu=INR";

describe("createUpiAppLink", () => {
  it("preserves payment parameters for PhonePe", () => {
    expect(createUpiAppLink(intent, "phonepe")).toBe(
      "phonepe://pay?pa=merchant%40yesbankltd&pn=Kizo&tr=KZ-123&am=100.00&cu=INR",
    );
  });

  it("preserves payment parameters for Google Pay", () => {
    expect(createUpiAppLink(intent, "gpay")).toBe(
      "gpay://upi/pay?pa=merchant%40yesbankltd&pn=Kizo&tr=KZ-123&am=100.00&cu=INR",
    );
  });

  it("keeps the generic UPI link for other apps", () => {
    expect(createUpiAppLink(intent, "other")).toBe(intent);
  });

  it("rejects non-UPI links", () => {
    expect(() => createUpiAppLink("https://example.com", "phonepe")).toThrow("Invalid UPI payment link.");
  });
});
