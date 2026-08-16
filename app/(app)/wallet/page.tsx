import type { Metadata } from "next";
import { WalletView } from "@/components/wallet-view";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Wallet" };

export default async function WalletPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [{ data: transactions }, { data: withdrawals }] = await Promise.all([
    supabase.from("wallet_transactions").select("*").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("withdrawal_requests").select("*").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <WalletView
      wallet={viewer.wallet}
      transactions={transactions ?? []}
      withdrawals={withdrawals ?? []}
    />
  );
}
