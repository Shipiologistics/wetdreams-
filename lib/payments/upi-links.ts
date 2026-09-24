export type UpiApp = "phonepe" | "gpay" | "other";

const upiPrefixes: Record<UpiApp, string> = {
  phonepe: "phonepe://pay?",
  gpay: "gpay://upi/pay?",
  other: "upi://pay?",
};

export function createUpiAppLink(intentUri: string, app: UpiApp) {
  if (!intentUri.startsWith("upi://pay?")) {
    throw new Error("Invalid UPI payment link.");
  }

  const query = intentUri.slice("upi://pay?".length);
  if (!query) throw new Error("Invalid UPI payment link.");
  return `${upiPrefixes[app]}${query}`;
}
