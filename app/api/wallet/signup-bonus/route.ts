import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const signupBonusCoins = 50;
const signupBonusStartsAt = new Date("2026-09-01T08:30:00.000Z");

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const admin = createServiceClient();
  const idempotencyKey = `signup_bonus:${auth.userId}`;

  const { data: existing, error: existingError } = await admin
    .from("wallet_transactions")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (existing) return NextResponse.json({ credited: false, reason: "already_claimed" });

  const [{ data: account, error: accountError }, { data: wallet, error: walletError }] = await Promise.all([
    admin.from("users").select("created_at").eq("id", auth.userId).single(),
    admin.from("wallets").select("*").eq("user_id", auth.userId).single(),
  ]);
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if (walletError) return NextResponse.json({ error: walletError.message }, { status: 500 });
  if (new Date(account.created_at) < signupBonusStartsAt) {
    return NextResponse.json({ credited: false, reason: "existing_account" });
  }

  const nextCoinsBalance = Number(wallet.coins_balance) + signupBonusCoins;
  const nextLifetimeCoins = Number(wallet.lifetime_coins_purchased) + signupBonusCoins;

  const { error: transactionError } = await admin
    .from("wallet_transactions")
    .insert({
      user_id: auth.userId,
      type: "topup",
      currency: "coin",
      amount: signupBonusCoins,
      balance_after: nextCoinsBalance,
      payment_gateway_ref: "signup_bonus",
      idempotency_key: idempotencyKey,
    });
  if (transactionError) {
    if (transactionError.code === "23505") {
      return NextResponse.json({ credited: false, reason: "already_claimed" });
    }
    return NextResponse.json({ error: transactionError.message }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("wallets")
    .update({
      coins_balance: nextCoinsBalance,
      lifetime_coins_purchased: nextLifetimeCoins,
    })
    .eq("user_id", auth.userId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ credited: true, coins: signupBonusCoins });
}
