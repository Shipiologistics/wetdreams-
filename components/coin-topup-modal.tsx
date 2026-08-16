"use client";

import { useState } from "react";
import { Coins, LoaderCircle, X } from "lucide-react";
import { coinPackages, regularCoinsFor } from "@/lib/coin-packages";
import { formatMoney, messageForError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export function CoinTopupModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: (balance: number, coins: number) => void;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function topup(packageIndex: number) {
    const packageItem = coinPackages[packageIndex];
    setPending(packageIndex);
    setError(null);
    const supabase = createClient();
    const { data: intent, error: intentError } = await supabase.rpc("create_payment_intent", {
      p_coins: packageItem.coins,
      p_amount_inr: packageItem.priceInr,
    });
    if (intentError || !intent) {
      setError(messageForError(intentError?.message ?? "Could not create payment."));
      setPending(null);
      return;
    }
    const { data: balance, error: completeError } = await supabase.rpc("complete_dummy_payment", { p_intent_id: intent });
    setPending(null);
    if (completeError || balance === null) {
      setError(messageForError(completeError?.message ?? "Could not add coins."));
      return;
    }
    onComplete(Number(balance), packageItem.coins);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal compact-modal coin-topup-modal" role="dialog" aria-modal="true" aria-labelledby="quick-topup-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><span className="eyebrow">Wallet</span><h2 id="quick-topup-title">Buy coins</h2></div>
          <button className="icon-button" title="Close" type="button" onClick={onClose}><X size={20} /></button>
        </div>
        <p className="coin-offer-note">Offer codes are applied automatically.</p>
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
                {pending === index && <LoaderCircle className="spin" size={17} />}
              </button>
            );
          })}
        </div>
        {error && <p className="card-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
