import { authenticateApiRequest } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdjustmentBody = {
  userId?: unknown;
  currency?: unknown;
  amount?: unknown;
  notes?: unknown;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as AdjustmentBody | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const currency = body?.currency === "coin" || body?.currency === "bean" ? body.currency : null;
  const amount = typeof body?.amount === "number" ? body.amount : Number(body?.amount);
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 2000) : "";

  if (!userId || !currency || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000 || notes.length < 3) {
    return Response.json({ error: "INVALID_WALLET_ADJUSTMENT" }, { status: 400 });
  }

  const auth = await authenticateApiRequest(request);
  if (!auth.authenticated) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const { data: adminAccount, error: adminError } = await auth.client
    .from("users")
    .select("role")
    .eq("id", auth.userId)
    .maybeSingle();
  if (adminError || adminAccount?.role !== "admin") {
    return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
  }

  if (currency === "bean") {
    const service = createServiceClient();
    const { data: target, error: targetError } = await service
      .from("users")
      .select("role, is_guest, is_banned, is_verified")
      .eq("id", userId)
      .maybeSingle();
    if (targetError || !target) {
      return Response.json({ error: targetError?.message ?? "USER_NOT_FOUND" }, { status: 404 });
    }
    if (target.role !== "user" || target.is_guest || target.is_banned || !target.is_verified) {
      return Response.json({ error: "HOST_VERIFICATION_REQUIRED" }, { status: 403 });
    }
  }

  const { data: returnedBalance, error: adjustmentError } = await auth.client.rpc("admin_adjust_wallet", {
    p_target_user: userId,
    p_currency: currency,
    p_amount: amount,
    p_notes: notes,
  });
  if (adjustmentError) {
    return Response.json({ error: adjustmentError.message }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: wallet, error: walletError } = await service
    .from("wallets")
    .select("coins_balance, beans_balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (walletError || !wallet) {
    return Response.json({ error: walletError?.message ?? "WALLET_NOT_FOUND" }, { status: 409 });
  }

  const balance = Number(currency === "coin" ? wallet.coins_balance : wallet.beans_balance);
  if (!Number.isFinite(balance) || Math.abs(balance - Number(returnedBalance)) > 0.001) {
    return Response.json({ error: "WALLET_ADJUSTMENT_NOT_VERIFIED" }, { status: 409 });
  }

  const { data: transaction, error: transactionError } = await service
    .from("wallet_transactions")
    .select("id, amount, balance_after")
    .eq("user_id", userId)
    .eq("type", "admin_adjustment")
    .eq("currency", currency)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (transactionError || !transaction || Number(transaction.balance_after) !== balance || Number(transaction.amount) !== amount) {
    return Response.json({ error: transactionError?.message ?? "WALLET_LEDGER_NOT_VERIFIED" }, { status: 409 });
  }

  return Response.json({ adjusted: true, balance, transactionId: transaction.id });
}
