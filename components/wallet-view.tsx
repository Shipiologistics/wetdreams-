"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bean,
  CalendarX2,
  Clock3,
  Coins,
  History,
  LoaderCircle,
  Plus,
  WalletCards,
  X,
} from "lucide-react";
import type { Database } from "@/lib/database.types";
import { formatMoney, formatRelativeTime, messageForError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Wallet = Database["public"]["Tables"]["wallets"]["Row"];
type Transaction = Database["public"]["Tables"]["wallet_transactions"]["Row"];
type Withdrawal = Database["public"]["Tables"]["withdrawal_requests"]["Row"];
const packages = [100, 250, 500, 1000];
const withdrawalPolicy = "Withdrawals are processed within 24 hours, except Sundays and government holidays.";

export function WalletView({
  wallet,
  transactions,
  withdrawals,
  beanInrValue,
}: {
  wallet: Wallet;
  transactions: Transaction[];
  withdrawals: Withdrawal[];
  beanInrValue: number;
}) {
  const router = useRouter();
  const [topupOpen, setTopupOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [pending, setPending] = useState<number | "withdraw" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function topup(amount: number) {
    setPending(amount);
    setMessage(null);
    const supabase = createClient();
    const { data: intent, error: intentError } = await supabase.rpc("create_payment_intent", { p_coins: amount });
    if (intentError || !intent) {
      setMessage(messageForError(intentError?.message ?? "Could not create payment."));
      setPending(null);
      return;
    }
    const { error } = await supabase.rpc("complete_dummy_payment", { p_intent_id: intent });
    setPending(null);
    if (error) return setMessage(messageForError(error.message));
    setTopupOpen(false);
    setMessage(`${amount} coins added.`);
    router.refresh();
  }

  async function withdraw(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("withdraw");
    setMessage(null);
    const amount = Number(new FormData(event.currentTarget).get("beans"));
    const { error } = await createClient().rpc("request_withdrawal", { p_beans: amount });
    setPending(null);
    if (error) return setMessage(messageForError(error.message));
    setWithdrawOpen(false);
    setMessage(`Withdrawal request submitted. ${withdrawalPolicy}`);
    router.refresh();
  }

  return (
    <div className="page-shell wallet-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Balances and earnings</span>
          <h1>Wallet</h1>
        </div>
      </header>

      <section className="balance-grid">
        <article className="balance-card coins-card">
          <div className="balance-icon"><Coins size={24} /></div>
          <span>Coins</span>
          <strong>{formatMoney(wallet.coins_balance)}</strong>
          <p>₹1 per coin</p>
          <button className="button light" type="button" onClick={() => setTopupOpen(true)}><Plus size={18} /> Add coins</button>
        </article>
        <article className="balance-card beans-card">
          <div className="balance-icon"><Bean size={24} /></div>
          <span>Beans</span>
          <strong>{formatMoney(wallet.beans_balance)}</strong>
          <p>₹{formatMoney(beanInrValue)} per bean</p>
          <button className="button dark" type="button" onClick={() => setWithdrawOpen(true)} disabled={Number(wallet.beans_balance) < 1}>
            <ArrowUpRight size={18} /> Withdraw
          </button>
        </article>
      </section>

      <section className="withdrawal-policy-card" aria-label="Withdrawal processing policy">
        <div><Clock3 size={20} /><span>Processed within 24 hours</span></div>
        <div><CalendarX2 size={20} /><span>No payouts on Sundays or government holidays</span></div>
      </section>

      <section className="wallet-summary">
        <div><span>Coins purchased</span><strong>{formatMoney(wallet.lifetime_coins_purchased)}</strong></div>
        <div><span>Beans earned</span><strong>{formatMoney(wallet.lifetime_beans_earned)}</strong></div>
        <div><span>Beans withdrawn</span><strong>{formatMoney(wallet.lifetime_beans_withdrawn)}</strong></div>
      </section>

      {message && <div className="page-notice" role="status">{message}<button onClick={() => setMessage(null)} title="Dismiss"><X size={15} /></button></div>}

      <section className="ledger-section">
        <div className="section-heading"><div><History size={20} /><h2>Activity</h2></div><span>{transactions.length} entries</span></div>
        {transactions.length ? (
          <div className="transaction-list">
            {transactions.map((transaction) => {
              const positive = Number(transaction.amount) > 0;
              return (
                <div className="transaction-row" key={transaction.id}>
                  <span className={`transaction-icon ${positive ? "positive" : "negative"}`}>
                    {positive ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                  </span>
                  <div><strong>{labelForTransaction(transaction.type)}</strong><span>{formatRelativeTime(transaction.created_at)}</span></div>
                  <div className="transaction-amount">
                    <strong>{positive ? "+" : ""}{formatMoney(transaction.amount)}</strong>
                    <span>{transaction.currency === "coin" ? "coins" : "beans"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="inline-empty"><WalletCards size={22} /> Your activity will appear here.</div>
        )}
      </section>

      {withdrawals.length > 0 && (
        <section className="withdrawal-section">
          <div className="section-heading"><div><Clock3 size={20} /><h2>Withdrawals</h2></div><span>{withdrawalPolicy}</span></div>
          <div className="simple-table">
            {withdrawals.map((withdrawal) => (
              <div key={withdrawal.id}>
                <span>{formatRelativeTime(withdrawal.created_at)}</span>
                <strong>{formatMoney(withdrawal.beans_requested)} beans</strong>
                <span>₹{formatMoney(withdrawal.inr_amount)}</span>
                <span className={`status-label ${withdrawal.status}`}>{withdrawal.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {topupOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setTopupOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="topup-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow">Dummy checkout</span><h2 id="topup-title">Add coins</h2></div><button className="icon-button" title="Close" onClick={() => setTopupOpen(false)}><X size={20} /></button></div>
            <div className="coin-packages">
              {packages.map((amount) => (
                <button key={amount} type="button" onClick={() => topup(amount)} disabled={pending !== null}>
                  <Coins size={20} /><strong>{amount}</strong><span>₹{amount}</span>
                  {pending === amount && <LoaderCircle className="spin" size={17} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {withdrawOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setWithdrawOpen(false)}>
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="withdraw-title" onSubmit={withdraw} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow">Manual payout</span><h2 id="withdraw-title">Withdraw beans</h2></div><button className="icon-button" type="button" title="Close" onClick={() => setWithdrawOpen(false)}><X size={20} /></button></div>
            <label className="field">Beans<input name="beans" type="number" min="1" max={Number(wallet.beans_balance)} step="0.01" required /></label>
            <div className="withdrawal-modal-policy">
              <p className="conversion-note">You receive ₹{formatMoney(beanInrValue)} per approved bean.</p>
              <p><Clock3 size={15} /> Processed within 24 hours.</p>
              <p><CalendarX2 size={15} /> No payouts on Sundays or government holidays.</p>
            </div>
            <button className="button primary wide" type="submit" disabled={pending !== null}>{pending === "withdraw" && <LoaderCircle className="spin" size={18} />} Submit request</button>
          </form>
        </div>
      )}
    </div>
  );
}

function labelForTransaction(type: string) {
  return ({
    topup: "Coin top-up",
    chat_spend: "Paid message",
    call_spend: "Call minute",
    bean_credit: "Creator earning",
    bean_withdrawal: "Withdrawal request",
    refund: "Refund",
    admin_adjustment: "Balance adjustment",
  } as Record<string, string>)[type] ?? type;
}
