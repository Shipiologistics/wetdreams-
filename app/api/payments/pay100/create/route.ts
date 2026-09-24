import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/api-auth";
import { createPay100Intent } from "@/lib/payments/pay100";
import { findCoinPackage } from "@/lib/payments/pay100-core";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ packageCode: z.string().min(1).max(30) });

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const packageItem = body.success ? findCoinPackage(body.data.packageCode) : null;
  if (!packageItem) return NextResponse.json({ error: "Choose a valid coin pack." }, { status: 400 });

  const admin = createServiceClient();
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from("payment_intents").select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId).eq("gateway", "pay100").gte("created_at", oneMinuteAgo);
  if ((count ?? 0) >= 5) return NextResponse.json({ error: "Too many payment attempts. Please wait a minute." }, { status: 429 });

  const orderId = `KZ-${randomUUID().replaceAll("-", "").toUpperCase()}`;
  const { data: intent, error: intentError } = await admin.from("payment_intents").insert({
    user_id: auth.userId,
    coins_requested: packageItem.coins,
    amount_inr: packageItem.priceInr,
    gateway: "pay100",
    gateway_order_id: orderId,
    gateway_status: "CREATING",
  }).select("id").single();
  if (intentError) return NextResponse.json({ error: "Could not start payment." }, { status: 500 });

  try {
    const provider = await createPay100Intent({ orderId, amount: packageItem.priceInr });
    const expiresAt = new Date(Date.now() + provider.expires_in_minutes * 60_000).toISOString();
    await admin.from("payment_intents").update({
      gateway_request_id: provider.requestId,
      gateway_status: provider.status.toUpperCase(),
      expires_at: expiresAt,
    }).eq("id", intent.id);
    return NextResponse.json({
      orderId,
      amount: packageItem.priceInr,
      coins: packageItem.coins,
      intentUri: provider.upi_intent.intent_uri,
      expiresAt,
    });
  } catch (error) {
    await admin.from("payment_intents").update({ status: "failed", gateway_status: "CREATE_FAILED" }).eq("id", intent.id);
    const message = error instanceof Error ? error.message : "Pay100 could not create the payment.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
