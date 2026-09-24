import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const signupBonusStartsAt = new Date("2026-09-01T08:30:00.000Z");
const signupPromptWindowMs = 30 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const admin = createServiceClient();
  const idempotencyKey = `signup_bonus:${auth.userId}`;

  const [
    { data: existing, error: existingError },
    { data: account, error: accountError },
  ] = await Promise.all([
    admin.from("wallet_transactions").select("id, amount").eq("idempotency_key", idempotencyKey).maybeSingle(),
    admin.from("users").select("created_at").eq("id", auth.userId).single(),
  ]);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  const accountCreatedAt = new Date(account.created_at);
  const eligibleForBonus = accountCreatedAt >= signupBonusStartsAt;
  const accountAgeMs = Date.now() - accountCreatedAt.getTime();
  const showRechargePrompt = eligibleForBonus && accountAgeMs >= 0 && accountAgeMs <= signupPromptWindowMs;

  if (existing) {
    return NextResponse.json({
      credited: false,
      reason: "already_claimed",
      coins: Number(existing.amount),
      showRechargePrompt,
    });
  }
  return NextResponse.json({
    credited: false,
    reason: eligibleForBonus ? "bonus_disabled_or_not_granted" : "existing_account",
    showRechargePrompt: false,
  });
}
