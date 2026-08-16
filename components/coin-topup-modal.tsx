"use client";

import { useState } from "react";
import { Coins, LoaderCircle, X } from "lucide-react";
import { formatMoney, messageForError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const coinPackages = [100, 250, 500, 1000];

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

  async function topup(amount: number) {
    setPending(amount);
    setError(null);
    const supabase = createClient();
    const { data: intent, error: intentError } = await supabase.rpc("create_payment_intent", { p_coins: amount });
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
    onComplete(Number(balance), amount);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="quick-topup-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><span className="eyebrow">Wallet</span><h2 id="quick-topup-title">Buy coins</h2></div>
          <button className="icon-button" title="Close" type="button" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="coin-packages">
          {coinPackages.map((amount) => (
            <button key={amount} type="button" onClick={() => topup(amount)} disabled={pending !== null}>
              <Coins size={20} /><strong>{amount}</strong><span>₹{formatMoney(amount)}</span>
              {pending === amount && <LoaderCircle className="spin" size={17} />}
            </button>
          ))}
        </div>
        {error && <p className="card-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
