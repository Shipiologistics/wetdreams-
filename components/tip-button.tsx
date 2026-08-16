"use client";

import { useState } from "react";
import { Coins, Gift, LoaderCircle, X } from "lucide-react";
import { CoinTopupModal } from "@/components/coin-topup-modal";
import { formatMoney, messageForError } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const tipAmounts = [10, 25, 50, 100];

export function TipButton({
  roomId,
  callId,
  recipientName,
  wallet,
  disabled,
  onWalletChange,
  onMessage,
  onTipSent,
  compact = false,
}: {
  roomId: string;
  callId?: string | null;
  recipientName: string;
  wallet: number;
  disabled?: boolean;
  onWalletChange: (balance: number) => void;
  onMessage?: (message: string) => void;
  onTipSent?: (amount: number) => void;
  compact?: boolean;
}) {
  const [tipOpen, setTipOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [pending, setPending] = useState<number | "custom" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendTip(amount: number, pendingKey: number | "custom" = amount) {
    setPending(pendingKey);
    setError(null);
    const { data: balance, error: tipError } = await createClient().rpc("send_tip", {
      p_room_id: roomId,
      p_amount: amount,
      p_call_id: callId ?? null,
    });
    setPending(null);
    if (tipError || balance === null) {
      const message = messageForError(tipError?.message ?? "Could not send tip.");
      setError(message);
      if (tipError?.message.includes("INSUFFICIENT_BALANCE")) {
        setTopupOpen(true);
      }
      return;
    }
    onWalletChange(Number(balance));
    onTipSent?.(amount);
    setTipOpen(false);
  }

  function submitCustom() {
    const amount = Number(customAmount);
    if (!Number.isFinite(amount)) return;
    void sendTip(amount, "custom");
  }

  return (
    <>
      <button
        className={compact ? "icon-button tip-trigger" : "button secondary tip-trigger"}
        type="button"
        title={disabled ? "Unavailable" : `Tip ${recipientName}`}
        onClick={() => setTipOpen(true)}
        disabled={disabled}
      >
        <Gift size={compact ? 19 : 18} />
        {!compact && "Tip"}
      </button>

      {tipOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setTipOpen(false)}>
          <div className="modal compact-modal tip-modal" role="dialog" aria-modal="true" aria-labelledby="tip-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div><span className="eyebrow">Send love</span><h2 id="tip-title">Tip {recipientName}</h2></div>
              <button className="icon-button" title="Close" type="button" onClick={() => setTipOpen(false)}><X size={20} /></button>
            </div>
            <div className="tip-balance"><Coins size={16} /> {formatMoney(wallet)} coins available</div>
            <div className="tip-packages">
              {tipAmounts.map((amount) => (
                <button key={amount} type="button" onClick={() => sendTip(amount)} disabled={pending !== null}>
                  <Gift size={18} /><strong>{amount}</strong><span>coins</span>
                  {pending === amount && <LoaderCircle className="spin" size={16} />}
                </button>
              ))}
            </div>
            <div className="custom-tip-row">
              <input
                aria-label="Custom tip amount"
                inputMode="decimal"
                min="1"
                placeholder="Custom"
                type="number"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitCustom();
                  }
                }}
              />
              <button className="button primary" type="button" onClick={submitCustom} disabled={pending !== null || Number(customAmount) < 1}>
                {pending === "custom" && <LoaderCircle className="spin" size={17} />}
                Send
              </button>
            </div>
            <button className="button secondary wide" type="button" onClick={() => setTopupOpen(true)} disabled={pending !== null}>
              <Coins size={18} /> Buy coins
            </button>
            {error && <p className="card-error" role="alert">{error}</p>}
          </div>
        </div>
      )}

      <CoinTopupModal
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        onComplete={(balance, coins) => {
          onWalletChange(balance);
          onMessage?.(`${coins} coins added.`);
        }}
      />
    </>
  );
}
