"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bean,
  CalendarX2,
  Clock3,
  Coins,
  History,
  LoaderCircle,
  MessageCircle,
  Plus,
  WalletCards,
  X,
} from "lucide-react";
import type { Database } from "@/lib/database.types";
import { coinPackages, regularCoinsFor } from "@/lib/coin-packages";
import { formatMoney, formatRelativeTime, messageForError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Wallet = Database["public"]["Tables"]["wallets"]["Row"];
type Transaction = Database["public"]["Tables"]["wallet_transactions"]["Row"];
type Withdrawal = Database["public"]["Tables"]["withdrawal_requests"]["Row"];
type PayoutMethod = "upi" | "bank";
const withdrawalPolicy = "Withdrawals are processed within 24 hours, except Sundays and government holidays.";

function withdrawalStatusLabel(status: string) {
  if (status === "paid" || status === "approved") return "complete";
  return status;
}

export function WalletView({
  wallet,
  transactions,
  withdrawals,
  beanInrValue,
  isHost,
}: {
  wallet: Wallet;
  transactions: Transaction[];
  withdrawals: Withdrawal[];
  beanInrValue: number;
  isHost: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [topupOpen, setTopupOpen] = useState(() => searchParams.get("buy") === "coins");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>("upi");
  const [pending, setPending] = useState<"withdraw" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const visibleTransactions = isHost
    ? transactions
    : transactions.filter((transaction) => transaction.currency === "coin");

  function closeTopup() {
    setTopupOpen(false);
    if (searchParams.get("buy") === "coins") router.replace("/wallet", { scroll: false });
  }

  function topup(packageIndex: number) {
    const packageItem = coinPackages[packageIndex];
    setMessage(null);
    const text = `Hi Kizo support, I want to buy ${packageItem.coins} coins for Rs ${packageItem.priceInr}. Code: ${packageItem.code}. Please credit after payment confirmation.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    closeTopup();
    setMessage("WhatsApp opened. Coins will be credited by admin after payment confirmation.");
  }

  async function withdraw(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("withdraw");
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("beans"));
    const method = String(form.get("payout_method") ?? "upi") as PayoutMethod;
    const { error } = await createClient().rpc("request_withdrawal", {
      p_beans: amount,
      p_payout_method: method,
      p_upi_id: method === "upi" ? String(form.get("upi_id") ?? "") : null,
      p_account_holder: method === "bank" ? String(form.get("account_holder") ?? "") : null,
      p_bank_account: method === "bank" ? String(form.get("bank_account") ?? "") : null,
      p_ifsc: method === "bank" ? String(form.get("ifsc") ?? "") : null,
    });
    setPending(null);
    if (error) return setMessage(messageForError(error.message));
    setWithdrawOpen(false);
    setMessage(`Withdrawal request submitted. ${withdrawalPolicy}`);
    router.refresh();
  }

  return (
    <div className="page-shell wallet-page">
      <header className="page-header app-page-header">
        <div>
          <span className="eyebrow">{isHost ? "Balances and earnings" : "Coin balance"}</span>
          <h1>Wallet</h1>
        </div>
      </header>

      <section className={`balance-grid ${isHost ? "" : "single-balance"}`}>
        <article className="balance-card coins-card">
          <div className="balance-icon"><Coins size={24} /></div>
          <span>Coins</span>
          <strong>{formatMoney(wallet.coins_balance)}</strong>
          <p>Recharge through WhatsApp</p>
          <button className="button light" type="button" onClick={() => setTopupOpen(true)}><Plus size={18} /> Add coins</button>
        </article>
        {isHost && <article className="balance-card beans-card">
          <div className="balance-icon"><Bean size={24} /></div>
          <span>Beans</span>
          <strong>{formatMoney(wallet.beans_balance)}</strong>
          <p>₹{formatMoney(beanInrValue)} per bean</p>
          <button className="button dark" type="button" onClick={() => setWithdrawOpen(true)} disabled={Number(wallet.beans_balance) < 1}>
            <ArrowUpRight size={18} /> Withdraw
          </button>
        </article>}
      </section>

      {isHost && <section className="withdrawal-policy-card" aria-label="Withdrawal processing policy">
        <div><Clock3 size={20} /><span>Processed within 24 hours</span></div>
        <div><CalendarX2 size={20} /><span>No payouts on Sundays or government holidays</span></div>
        <Link href="/host-policy">Read host payout policy</Link>
      </section>}

      <section className="wallet-summary">
        <div><span>Coins credited</span><strong>{formatMoney(wallet.lifetime_coins_purchased)}</strong></div>
        {isHost && <div><span>Beans earned</span><strong>{formatMoney(wallet.lifetime_beans_earned)}</strong></div>}
        {isHost && <div><span>Beans withdrawn</span><strong>{formatMoney(wallet.lifetime_beans_withdrawn)}</strong></div>}
      </section>

      {message && <div className="page-notice" role="status">{message}<button onClick={() => setMessage(null)} title="Dismiss"><X size={15} /></button></div>}

      <section className="ledger-section">
        <div className="section-heading"><div><History size={20} /><h2>Activity</h2></div><span>{visibleTransactions.length} entries</span></div>
        {visibleTransactions.length ? (
          <div className="transaction-list">
            {visibleTransactions.map((transaction) => {
              const positive = Number(transaction.amount) > 0;
              return (
                <div className="transaction-row" key={transaction.id}>
                  <span className={`transaction-icon ${positive ? "positive" : "negative"}`}>
                    {positive ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                  </span>
                  <div><strong>{labelForTransaction(transaction)}</strong><span>{formatRelativeTime(transaction.created_at)}</span></div>
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

      {isHost && withdrawals.length > 0 && (
        <section className="withdrawal-section">
          <div className="section-heading"><div><Clock3 size={20} /><h2>Withdrawals</h2></div><span>{withdrawalPolicy}</span></div>
          <div className="simple-table">
            {withdrawals.map((withdrawal) => (
              <div key={withdrawal.id}>
                <span>{formatRelativeTime(withdrawal.created_at)}</span>
                <strong>{formatMoney(withdrawal.beans_requested)} beans</strong>
                <span>₹{formatMoney(withdrawal.inr_amount)}</span>
                <span>{payoutLabel(withdrawal)}</span>
                <span className={`status-label ${withdrawalStatusLabel(withdrawal.status)}`}>
                  {withdrawalStatusLabel(withdrawal.status)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {topupOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeTopup}>
          <div className="modal coin-topup-modal" role="dialog" aria-modal="true" aria-labelledby="topup-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow">WhatsApp recharge</span><h2 id="topup-title">Add coins</h2></div><button className="icon-button" title="Close" onClick={closeTopup}><X size={20} /></button></div>
            <p className="coin-offer-note">Choose a pack and continue on WhatsApp. Coins are credited manually by admin after payment confirmation.</p>
            <div className="coin-packages">
              {coinPackages.map((packageItem, index) => {
                const regularCoins = regularCoinsFor(packageItem);
                const hasBonus = packageItem.coins > regularCoins;
                const bonusCoins = Math.max(0, packageItem.coins - regularCoins);
                return (
                  <button key={packageItem.priceInr} type="button" onClick={() => topup(index)} disabled={pending !== null}>
                    <span className="offer-label">{packageItem.label}</span>
                    <Coins size={20} />
                    <strong>{formatMoney(packageItem.coins)} coins</strong>
                    <span className="coin-price-row">
                      <span>₹{formatMoney(packageItem.priceInr)}</span>
                      {hasBonus && <span className="coin-bonus">+{formatMoney(bonusCoins)} bonus</span>}
                    </span>
                    <span className="discount-code">{packageItem.code}</span>
                    <MessageCircle size={17} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {isHost && withdrawOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setWithdrawOpen(false)}>
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="withdraw-title" onSubmit={withdraw} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="eyebrow">Manual payout</span><h2 id="withdraw-title">Withdraw beans</h2></div><button className="icon-button" type="button" title="Close" onClick={() => setWithdrawOpen(false)}><X size={20} /></button></div>
            <label className="field">Beans<input name="beans" type="number" min="1" max={Number(wallet.beans_balance)} step="0.01" required /></label>
            <fieldset className="payout-method-choice">
              <legend>Receive money by</legend>
              <label>
                <input type="radio" name="payout_method" value="upi" checked={payoutMethod === "upi"} onChange={() => setPayoutMethod("upi")} />
                UPI
              </label>
              <label>
                <input type="radio" name="payout_method" value="bank" checked={payoutMethod === "bank"} onChange={() => setPayoutMethod("bank")} />
                Bank account
              </label>
            </fieldset>
            {payoutMethod === "upi" ? (
              <label className="field">UPI ID<input name="upi_id" inputMode="email" autoComplete="off" placeholder="name@upi" minLength={5} maxLength={120} required /></label>
            ) : (
              <div className="bank-detail-grid">
                <label className="field">Account holder<input name="account_holder" autoComplete="name" minLength={2} maxLength={120} required /></label>
                <label className="field">Bank account number<input name="bank_account" inputMode="numeric" autoComplete="off" minLength={6} maxLength={34} required /></label>
                <label className="field">IFSC code<input name="ifsc" autoCapitalize="characters" autoComplete="off" minLength={4} maxLength={20} required /></label>
              </div>
            )}
            <div className="withdrawal-modal-policy">
              <p className="conversion-note">You receive ₹{formatMoney(beanInrValue)} per approved bean.</p>
              <p><Clock3 size={15} /> Processed within 24 hours.</p>
              <p><CalendarX2 size={15} /> No payouts on Sundays or government holidays.</p>
              <Link href="/host-policy" target="_blank">Read payout rules</Link>
            </div>
            <button className="button primary wide" type="submit" disabled={pending !== null}>{pending === "withdraw" && <LoaderCircle className="spin" size={18} />} Submit request</button>
          </form>
        </div>
      )}
    </div>
  );
}

function labelForTransaction(transaction: Transaction) {
  if (transaction.type === "topup" && transaction.payment_gateway_ref === "signup_bonus") {
    return "Signup bonus";
  }
  return ({
    topup: "Coin top-up",
    chat_spend: "Chat time",
    call_spend: "Call time",
    tip_spend: "Tip sent",
    tip_earn: "Tip received",
    bean_credit: "Creator earning",
    bean_withdrawal: "Withdrawal request",
    refund: "Refund",
    admin_adjustment: "Balance adjustment",
  } as Record<string, string>)[transaction.type] ?? transaction.type;
}

function payoutLabel(withdrawal: Withdrawal) {
  if (withdrawal.payout_method === "bank") {
    return `Bank ${withdrawal.payout_ifsc ?? ""}`.trim();
  }
  return withdrawal.payout_upi_id ? `UPI ${withdrawal.payout_upi_id}` : "UPI";
}
