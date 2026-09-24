import { z } from "zod";
import { coinPackages } from "@/lib/coin-packages";

export const pay100CreateResponseSchema = z.object({
  success: z.boolean(),
  request_id: z.string().optional(),
  data: z.object({
    order_id: z.string().min(1),
    amount: z.coerce.number().positive(),
    currency: z.string().optional(),
    status: z.string(),
    upi_intent: z.object({ intent_uri: z.string().startsWith("upi://") }),
    expires_in_minutes: z.coerce.number().int().min(1).max(60),
  }).optional(),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
  message: z.string().optional(),
});

export const pay100StatusResponseSchema = z.object({
  success: z.boolean(),
  request_id: z.string().optional(),
  data: z.object({
    order_id: z.string().min(1),
    amount: z.coerce.number().positive(),
    currency: z.string().optional(),
    status: z.string(),
  }).passthrough().optional(),
  error: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
  message: z.string().optional(),
});

export function findCoinPackage(packageCode: string) {
  return coinPackages.find((item) => item.code === packageCode) ?? null;
}

export function isPay100OrderId(value: string) {
  return /^KZ-[A-F0-9]{32}$/i.test(value);
}

export function extractCallbackOrderId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const direct = record.order_id;
  if (typeof direct === "string" && isPay100OrderId(direct)) return direct;
  const nested = record.data;
  if (nested && typeof nested === "object") {
    const nestedOrder = (nested as Record<string, unknown>).order_id;
    if (typeof nestedOrder === "string" && isPay100OrderId(nestedOrder)) return nestedOrder;
  }
  return null;
}
