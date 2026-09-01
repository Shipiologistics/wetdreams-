"use client";

import { useState } from "react";
import { Coins, MessageCircle, X } from "lucide-react";
import { coinPackages, regularCoinsFor } from "@/lib/coin-packages";
import { formatMoney } from "@/lib/format";

export function CoinTopupModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  onComplete?: (balance: number, coins: number) => void;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function topup(packageIndex: number) {
    const packageItem = coinPackages[packageIndex];
    setPending(packageIndex);
    setError(null);
    const text = `Hi Kizo support, I want to buy ${packageItem.coins} coins for Rs ${packageItem.priceInr}. Code: ${packageItem.code}. Please credit after payment confirmation.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    window.setTimeout(() => setPending(null), 500);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal compact-modal coin-topup-modal" role="dialog" aria-modal="true" aria-labelledby="quick-topup-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><span className="eyebrow">WhatsApp recharge</span><h2 id="quick-topup-title">Add coins</h2></div>
          <button className="icon-button" title="Close" type="button" onClick={onClose}><X size={20} /></button>
        </div>
        <p className="coin-offer-note">Recharge is handled on WhatsApp. Coins are credited manually by admin after payment confirmation.</p>
        <div className="coin-packages">
          {coinPackages.map((packageItem, index) => {
            const regularCoins = regularCoinsFor(packageItem);
            const hasBonus = packageItem.coins > regularCoins;
            return (
              <button key={packageItem.priceInr} type="button" onClick={() => topup(index)} disabled={pending !== null}>
                <span className="offer-label">{packageItem.label}</span>
                <Coins size={20} />
                <strong>{formatMoney(packageItem.coins)} coins</strong>
                <span className="coin-price-row">
                  <span>₹{formatMoney(packageItem.priceInr)}</span>
                  {hasBonus && <del>{formatMoney(regularCoins)} coins</del>}
                </span>
                <span className="discount-code">{packageItem.code}</span>
                {pending === index && <MessageCircle size={17} />}
              </button>
            );
          })}
        </div>
        {error && <p className="card-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
