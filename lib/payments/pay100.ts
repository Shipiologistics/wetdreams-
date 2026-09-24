import "server-only";

import {
  pay100CreateResponseSchema,
  pay100StatusResponseSchema,
} from "@/lib/payments/pay100-core";
import { createServiceClient } from "@/lib/supabase/service";

function requiredCredential(name: "PAY100_CLIENT_ID" | "PAY100_ENCRYPTED_KEY" | "PAY100_SECRET_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function providerUrl(path: string) {
  const base = process.env.PAY100_API_BASE_URL?.trim() || "https://pay100.in/api/v1";
  const url = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`);
  if (url.protocol !== "https:") throw new Error("PAY100_API_BASE_URL must use HTTPS.");
  return url;
}

async function pay100Fetch(path: string, init?: RequestInit) {
  const response = await fetch(providerUrl(path), {
    ...init,
    headers: {
      "X-Client-ID": requiredCredential("PAY100_CLIENT_ID"),
      "X-Encrypted-Key": requiredCredential("PAY100_ENCRYPTED_KEY"),
      "X-Secret-Key": requiredCredential("PAY100_SECRET_KEY"),
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const providerMessage = payload && typeof payload === "object"
      ? ((payload as { error?: { message?: string }; message?: string }).error?.message
        || (payload as { message?: string }).message)
      : null;
    throw new Error(providerMessage || `Pay100 returned HTTP ${response.status}.`);
  }
  return payload;
}

export async function createPay100Intent(input: { orderId: string; amount: number }) {
  const parsed = pay100CreateResponseSchema.parse(await pay100Fetch("payment-intents", {
    method: "POST",
    body: JSON.stringify({ order_id: input.orderId, amount: input.amount, expiry_minutes: 10 }),
  }));
  if (!parsed.success || !parsed.data) throw new Error(parsed.error?.message || parsed.message || "Pay100 declined the payment request.");
  if (parsed.data.order_id !== input.orderId || parsed.data.amount !== input.amount) {
    throw new Error("Pay100 returned mismatched payment details.");
  }
  return { ...parsed.data, requestId: parsed.request_id ?? null };
}

export async function getPay100Intent(orderId: string) {
  const parsed = pay100StatusResponseSchema.parse(await pay100Fetch(`payment-intents/${encodeURIComponent(orderId)}`));
  if (!parsed.success || !parsed.data) throw new Error(parsed.error?.message || parsed.message || "Could not read Pay100 payment status.");
  if (parsed.data.order_id !== orderId) throw new Error("Pay100 returned a mismatched order ID.");
  return parsed.data;
}

export async function syncPay100Payment(orderId: string) {
  const admin = createServiceClient();
  const { data: intent, error } = await admin
    .from("payment_intents")
    .select("status, amount_inr, coins_requested, user_id")
    .eq("gateway", "pay100")
    .eq("gateway_order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!intent) throw new Error("PAYMENT_NOT_FOUND");

  if (intent.status === "success") {
    const { data: wallet, error: walletError } = await admin.from("wallets").select("coins_balance").eq("user_id", intent.user_id).single();
    if (walletError) throw new Error(walletError.message);
    return { status: "success", coins: Number(intent.coins_requested), balance: Number(wallet.coins_balance), userId: intent.user_id };
  }

  const provider = await getPay100Intent(orderId);
  const providerStatus = provider.status.toUpperCase();
  if (Number(provider.amount) !== Number(intent.amount_inr)) throw new Error("PAYMENT_AMOUNT_MISMATCH");

  await admin.from("payment_intents").update({ gateway_status: providerStatus }).eq("gateway", "pay100").eq("gateway_order_id", orderId);
  if (providerStatus === "FAILED") {
    await admin.from("payment_intents").update({ status: "failed" }).eq("gateway", "pay100").eq("gateway_order_id", orderId).eq("status", "pending");
    return { status: "failed", coins: Number(intent.coins_requested), balance: null, userId: intent.user_id };
  }
  if (providerStatus !== "SUCCESS") {
    return { status: "pending", coins: Number(intent.coins_requested), balance: null, userId: intent.user_id };
  }

  const { data: completion, error: completionError } = await admin.rpc("complete_pay100_payment", {
    p_order_id: orderId,
    p_amount_inr: provider.amount,
  }).single();
  if (completionError) throw new Error(completionError.message);
  return {
    status: "success",
    coins: Number(completion.coins_credited),
    balance: Number(completion.coins_balance),
    userId: completion.user_id,
  };
}
