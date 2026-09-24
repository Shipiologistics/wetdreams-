"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Coins, LoaderCircle, Smartphone, X } from "lucide-react";
import { coinPackages, regularCoinsFor } from "@/lib/coin-packages";
import { formatMoney } from "@/lib/format";

export function CoinTopupModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete?: (balance: number, coins: number) => void;
}) {
  const [selected, setSelected] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<{ orderId: string; coins: number; intentUri: string } | null>(null);
  const [completed, setCompleted] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("coin-topup-open");
    return () => document.documentElement.classList.remove("coin-topup-open");
  }, [open]);

  useEffect(() => {
    if (!open || !order || completed) return;
    let cancelled = false;
    let checks = 0;

    async function checkStatus() {
      checks += 1;
      const response = await fetch(`/api/payments/pay100/status?orderId=${encodeURIComponent(order!.orderId)}`, { cache: "no-store" }).catch(() => null);
      const payload = response ? await response.json().catch(() => null) as { status?: string; balance?: number; coins?: number; error?: string } | null : null;
      if (cancelled) return;
      if (response?.ok && payload?.status === "success" && Number.isFinite(payload.balance)) {
        const balance = Number(payload.balance);
        const coins = Number(payload.coins ?? order!.coins);
        setCompleted(true);
        setPending(false);
        window.dispatchEvent(new CustomEvent("wetdreams:wallet-updated", { detail: { coins: balance } }));
        onComplete?.(balance, coins);
      } else if (payload?.status === "failed") {
        setPending(false);
        setError("Payment failed. No coins were added.");
      } else if (!response?.ok && payload?.error && checks > 2) {
        setError(payload.error);
      }
    }

    const firstCheck = window.setTimeout(() => void checkStatus(), 1800);
    const interval = window.setInterval(() => {
      if (checks >= 200) {
        window.clearInterval(interval);
        return;
      }
      void checkStatus();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, [completed, onComplete, open, order]);

  async function topup() {
    const packageItem = coinPackages[selected];
    setPending(true);
    setError(null);
    setCompleted(false);
    const response = await fetch("/api/payments/pay100/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageCode: packageItem.code }),
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) as { orderId?: string; coins?: number; intentUri?: string; error?: string } | null : null;
    if (!response?.ok || !payload?.orderId || !payload.intentUri) {
      setPending(false);
      setError(payload?.error || "Could not start payment. Please try again.");
      return;
    }
    setOrder({ orderId: payload.orderId, coins: Number(payload.coins ?? packageItem.coins), intentUri: payload.intentUri });
    window.location.assign(payload.intentUri);
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal compact-modal coin-topup-modal" role="dialog" aria-modal="true" aria-labelledby="quick-topup-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><span className="eyebrow">Secure UPI payment</span><h2 id="quick-topup-title">Add coins</h2></div>
          <button className="icon-button" title="Close" type="button" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="coin-topup-scroll">
          <p className="coin-offer-note">Choose a pack, pay in any UPI app, and your coins will be credited automatically after confirmation.</p>
          <div className="coin-packages">
            {coinPackages.map((packageItem, index) => {
              const regularCoins = regularCoinsFor(packageItem);
              const hasBonus = packageItem.coins > regularCoins;
              const bonusCoins = Math.max(0, packageItem.coins - regularCoins);
              return (
                <button key={packageItem.priceInr} type="button" className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} disabled={pending}>
                  <span className="offer-label">{packageItem.label}</span>
                  <Coins size={20} />
                  <strong>{formatMoney(packageItem.coins)} coins</strong>
                  <span className="coin-price-row">
                    <span>₹{formatMoney(packageItem.priceInr)}</span>
                    {hasBonus && <span className="coin-bonus">+{formatMoney(bonusCoins)} bonus</span>}
                  </span>
                  <span className="discount-code">{packageItem.code}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="coin-topup-footer">
          {error && <p className="card-error" role="alert">{error}</p>}
          {completed ? (
            <div className="payment-state success" role="status"><CheckCircle2 size={20} /> Payment confirmed. Coins added.</div>
          ) : order ? (
            <div className="payment-actions">
              <p className="payment-state"><LoaderCircle className="spin" size={18} /> Waiting for Pay100 confirmation…</p>
              <a className="button primary wide" href={order.intentUri}><Smartphone size={18} /> Open UPI app again</a>
            </div>
          ) : (
            <button className="button primary wide" type="button" onClick={() => void topup()} disabled={pending}>
              {pending ? <LoaderCircle className="spin" size={18} /> : <Smartphone size={18} />} Pay ₹{formatMoney(coinPackages[selected].priceInr)} with UPI
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
