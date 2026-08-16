"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { LocationSelects } from "@/components/location-selects";
import { SignOutButton } from "@/components/sign-out-button";
import { messageForError } from "@/lib/format";
import { formatLocation, parseLocation } from "@/lib/location-options";
import { createClient } from "@/lib/supabase/client";
import type { Account, Profile } from "@/lib/view-models";

const policyLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/safety", label: "Safety Rules" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/host-policy", label: "Host Payout Policy" },
];

export function AccountSettings({
  account,
  profile,
  email,
}: {
  account: Account;
  profile: Profile;
  email: string | null;
}) {
  const router = useRouter();
  const initialLocation = parseLocation(profile.location);
  const [locationState, setLocationState] = useState(initialLocation.state);
  const [locationCity, setLocationCity] = useState(initialLocation.city);
  const [passwordPending, setPasswordPending] = useState(false);
  const [locationPending, setLocationPending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordPending(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm_password") ?? "");

    if (password !== confirm) {
      setPasswordPending(false);
      setMessage({ type: "error", text: "Both passwords must match." });
      return;
    }

    const { error } = await createClient().auth.updateUser({ password });
    setPasswordPending(false);
    if (error) {
      setMessage({ type: "error", text: messageForError(error.message) });
      return;
    }
    event.currentTarget.reset();
    setMessage({ type: "success", text: "Password changed." });
  }

  async function updateLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocationPending(true);
    setMessage(null);
    const location = formatLocation(locationCity, locationState);
    const { error } = await createClient().from("profiles").update({ location }).eq("user_id", account.id);
    setLocationPending(false);
    if (error) {
      setMessage({ type: "error", text: messageForError(error.message) });
      return;
    }
    setMessage({ type: "success", text: "Location saved." });
    router.refresh();
  }

  return (
    <div className="page-shell settings-page narrow-page">
      <header className="page-header app-page-header">
        <div>
          <span className="eyebrow">Account center</span>
          <h1>Settings</h1>
        </div>
        <Link className="button secondary" href="/profile"><UserRound size={18} /> Profile</Link>
      </header>

      {message && (
        <div className={`form-message ${message.type}`} role="status">
          {message.text}
          <button type="button" title="Dismiss" onClick={() => setMessage(null)}><X size={15} /></button>
        </div>
      )}

      <section className="account-summary-panel">
        <span className="account-avatar">{account.display_name.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{account.display_name}</strong>
          <span>@{account.username}</span>
          <small>{email ?? "Signed in account"}</small>
        </div>
        <span className={`presence-label ${account.status}`}>{account.status}</span>
      </section>

      <div className="settings-panel-grid">
        <form className="settings-section account-panel" onSubmit={updatePassword}>
          <div className="section-heading"><div><KeyRound size={20} /><h2>Password</h2></div></div>
          <p className="settings-helper">Use at least 8 characters for your email login.</p>
          <div className="form-grid single">
            <label className="field">New password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
            <label className="field">Confirm password<input name="confirm_password" type="password" minLength={8} autoComplete="new-password" required /></label>
          </div>
          <button className="button primary" type="submit" disabled={passwordPending}>
            {passwordPending ? <LoaderCircle className="spin" size={18} /> : <LockKeyhole size={18} />} Change password
          </button>
        </form>

        <form className="settings-section account-panel" onSubmit={updateLocation}>
          <div className="section-heading"><div><MapPin size={20} /><h2>Location</h2></div></div>
          <p className="settings-helper">Saved once after sign-in. Change it here only when your city changes.</p>
          <LocationSelects state={locationState} city={locationCity} onStateChange={setLocationState} onCityChange={setLocationCity} />
          <button className="button secondary" type="submit" disabled={locationPending}>
            {locationPending ? <LoaderCircle className="spin" size={18} /> : <MapPin size={18} />} Save location
          </button>
        </form>
      </div>

      <section className="settings-section account-panel">
        <div className="section-heading"><div><FileText size={20} /><h2>Policies</h2></div></div>
        <div className="policy-link-grid">
          {policyLinks.map((link) => (
            <Link href={link.href} key={link.href}>
              <ShieldCheck size={18} />
              <span>{link.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="settings-section account-panel danger-zone">
        <div>
          <h2>Session</h2>
          <p>Sign out on this device when you are done.</p>
        </div>
        <SignOutButton />
      </section>
    </div>
  );
}
