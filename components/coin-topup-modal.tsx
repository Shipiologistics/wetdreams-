"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Coins, LoaderCircle, Smartphone, X } from "lucide-react";
import { coinPackages, regularCoinsFor } from "@/lib/coin-packages";
import { formatMoney } from "@/lib/format";
import { createUpiAppLink, type UpiApp } from "@/lib/payments/upi-links";
import { GooglePayIcon, PhonePeIcon } from "@/components/payment-brand-icons";

export function CoinTopupModal({
  open,
  onClose,
  onComplete,
  welcomeCoins,
}: {
  open: boolean;
  onClose: () => void;
  onComplete?: (balance: number, coins: number) => void;
  welcomeCoins?: number;
}) {
  const [selected, setSelected] = useState(0);
  const [paymentApp, setPaymentApp] = useState<UpiApp>("phonepe");
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

  async function topup(app: UpiApp) {
    const packageItem = coinPackages[selected];
    // Reserve a browser window while this click is still a trusted user gesture.
    // Mobile browsers often block a custom-scheme navigation after an async fetch.
    const upiWindow = window.open("", "_blank");
    if (upiWindow) {
      upiWindow.document.title = "Opening UPI";
      upiWindow.document.body.innerHTML = '<p style="font:600 16px system-ui;padding:24px">Preparing your secure UPI payment...</p>';
    }
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
      upiWindow?.close();
      setPending(false);
      setError(payload?.error || "Could not start payment. Please try again.");
      return;
    }
    const launchUri = createUpiAppLink(payload.intentUri, app);
    setOrder({ orderId: payload.orderId, coins: Number(payload.coins ?? packageItem.coins), intentUri: payload.intentUri });
    setPending(false);
    if (upiWindow && !upiWindow.closed) {
      upiWindow.location.replace(launchUri);
    } else {
      const link = document.createElement("a");
      link.href = launchUri;
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
    }
  }

  function openExistingPayment() {
    if (!order) return;
    window.location.assign(createUpiAppLink(order.intentUri, paymentApp));
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal compact-modal coin-topup-modal" role="dialog" aria-modal="true" aria-labelledby="quick-topup-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">{welcomeCoins ? "Welcome bonus added" : "Secure UPI payment"}</span>
            <h2 id="quick-topup-title">{welcomeCoins ? "Recharge now" : "Add coins"}</h2>
          </div>
          <button className="icon-button" title="Close" type="button" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="coin-topup-scroll">
          {welcomeCoins ? (
            <div className="welcome-recharge-note">
              <Coins size={21} />
              <div><strong>{formatMoney(welcomeCoins)} free coins are ready</strong><span>Your first recharge starts at ₹100.</span></div>
            </div>
          ) : null}
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
          <PaymentMethodPicker selected={paymentApp} onSelect={setPaymentApp} disabled={pending} />
        </div>
        <div className="coin-topup-footer">
          {error && <p className="card-error" role="alert">{error}</p>}
          {completed ? (
            <div className="payment-state success" role="status"><CheckCircle2 size={20} /> Payment confirmed. Coins added.</div>
          ) : (
            <div className="payment-actions">
              {order ? <p className="payment-state"><LoaderCircle className="spin" size={18} /> Waiting for payment confirmation...</p> : null}
              <button className="button primary wide" type="button" onClick={order ? openExistingPayment : () => void topup(paymentApp)} disabled={pending}>
                {pending ? <LoaderCircle className="spin" size={18} /> : <SelectedPaymentIcon app={paymentApp} />}
                {order ? `Open ${paymentAppName(paymentApp)} again` : `Pay ₹${formatMoney(coinPackages[selected].priceInr)} now`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function paymentAppName(app: UpiApp) {
  if (app === "phonepe") return "PhonePe";
  if (app === "gpay") return "Google Pay";
  return "a UPI app";
}

function SelectedPaymentIcon({ app }: { app: UpiApp }) {
  if (app === "phonepe") return <PhonePeIcon size={20} />;
  if (app === "gpay") return <GooglePayIcon size={20} />;
  return <Smartphone size={19} />;
}

function PaymentMethodPicker({
  selected,
  onSelect,
  disabled,
}: {
  selected: UpiApp;
  onSelect: (app: UpiApp) => void;
  disabled: boolean;
}) {
  const methods: Array<{ app: UpiApp; name: string; detail: string; icon: ReactNode }> = [
    { app: "phonepe", name: "PhonePe", detail: "Open PhonePe directly", icon: <PhonePeIcon /> },
    { app: "gpay", name: "Google Pay", detail: "Open Google Pay directly", icon: <GooglePayIcon /> },
    { app: "other", name: "Other UPI app", detail: "Choose another installed app", icon: <Smartphone size={24} /> },
  ];

  return (
    <div className="payment-method-section">
      <strong className="payment-method-title">Pay using</strong>
      <div className="payment-method-picker" role="radiogroup" aria-label="Choose a UPI app">
        {methods.map((method) => (
          <button
            key={method.app}
            className={selected === method.app ? "payment-method selected" : "payment-method"}
            type="button"
            role="radio"
            aria-checked={selected === method.app}
            onClick={() => onSelect(method.app)}
            disabled={disabled}
          >
            <span className={`payment-brand-mark ${method.app}`}>{method.icon}</span>
            <span className="payment-method-copy"><strong>{method.name}</strong><small>{method.detail}</small></span>
            <span className="payment-radio" aria-hidden="true"><span /></span>
          </button>
        ))}
      </div>
    </div>
  );
}
