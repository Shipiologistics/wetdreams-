import { describe, expect, it } from "vitest";
import { beanCredit, billedCallMinutes, shouldChargeMessage } from "@/lib/domain";
import { messageForError } from "@/lib/format";

describe("message paywall", () => {
  it("keeps the first ten messages free and charges message eleven", () => {
    expect(shouldChargeMessage(9, false, 5)).toBe(false);
    expect(shouldChargeMessage(10, false, 5)).toBe(true);
  });

  it("never charges a receiver-enabled free chat", () => {
    expect(shouldChargeMessage(500, true, 5)).toBe(false);
    expect(shouldChargeMessage(500, false, 0)).toBe(false);
  });
});

describe("monetization math", () => {
  it("applies and rounds the configurable bean payout ratio", () => {
    expect(beanCredit(5)).toBe(4);
    expect(beanCredit(3.33)).toBe(2.66);
    expect(beanCredit(10, 0.75)).toBe(7.5);
  });

  it("bills calls in started minutes", () => {
    expect(billedCallMinutes(0)).toBe(0);
    expect(billedCallMinutes(1)).toBe(1);
    expect(billedCallMinutes(60)).toBe(1);
    expect(billedCallMinutes(61)).toBe(2);
  });
});

describe("database error copy", () => {
  it("turns stable database errors into useful messages", () => {
    expect(messageForError("P0001: INSUFFICIENT_BALANCE")).toContain("more coins");
    expect(messageForError("plain error")).toBe("plain error");
  });
});
