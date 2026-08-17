"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, LoaderCircle, Mail, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateDeviceId, registerCurrentDevice } from "@/lib/device-id";
import { formatLocation } from "@/lib/location-options";
import { messageForError } from "@/lib/format";
import { LocationSelects } from "@/components/location-selects";

type AuthFormProps = {
  next?: string;
  onSuccess?: () => Promise<void> | void;
};

export function AuthForm({ next = "/discover", onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guestState, setGuestState] = useState("");
  const [guestCity, setGuestCity] = useState("");
  const [signupState, setSignupState] = useState("");
  const [signupCity, setSignupCity] = useState("");
  const [signupGender, setSignupGender] = useState<"male" | "female" | "">("");
  const [requiredScope, setRequiredScope] = useState<"guest" | "signup" | null>(null);

  async function finish() {
    if (onSuccess) {
      await onSuccess();
      return;
    }
    window.location.assign(next);
  }

  async function continueAsGuest() {
    const cleanLocation = formatLocation(guestCity, guestState);
    setPending("guest");
    setError(null);
    setNotice(null);
    setRequiredScope(null);
    const supabase = createClient();
    const response = await fetch("/api/auth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getOrCreateDeviceId(), location: cleanLocation }),
    });
    const guest = await response.json().catch(() => null) as { email?: string; password?: string; error?: string } | null;

    if (!response.ok || !guest?.email || !guest.password) {
      if (guest?.error === "LOCATION_REQUIRED") {
        setRequiredScope("guest");
        setError("Location is required for guest sign in.");
      } else {
        setError(messageForError(guest?.error ?? "Guest sign in failed."));
      }
      setPending(null);
      return;
    }

    const { error: guestError } = await supabase.auth.signInWithPassword({
      email: guest.email,
      password: guest.password,
    });

    if (guestError) {
      setError(messageForError(guestError.message));
      setPending(null);
      return;
    }

    try {
      await registerCurrentDevice();
    } catch (caught) {
      await supabase.auth.signOut();
      setError(messageForError(caught instanceof Error ? caught.message : "DEVICE_BANNED"));
      setPending(null);
      return;
    }

    await finish();
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("email");
    setError(null);
    setNotice(null);
    setRequiredScope(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const displayName = String(form.get("displayName") ?? "").trim();
    const cleanLocation = formatLocation(signupCity, signupState);
    if (mode === "signup" && !signupGender) {
      setRequiredScope("signup");
      setPending(null);
      return setError("Gender is required.");
    }
    if (mode === "signup" && !cleanLocation) {
      setRequiredScope("signup");
      setPending(null);
      return setError("Location is required.");
    }
    const supabase = createClient();

    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
            data: { display_name: displayName, gender: signupGender },
          },
        });

    if (result.error) {
      setError(messageForError(result.error.message));
      setPending(null);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      window.localStorage.setItem("p2c_pending_location", cleanLocation);
      setNotice("Check email.");
      setPending(null);
      return;
    }

    try {
      await registerCurrentDevice();
      if (mode === "signup" && cleanLocation) await saveLocation(cleanLocation);
    } catch (caught) {
      await supabase.auth.signOut();
      setError(messageForError(caught instanceof Error ? caught.message : "DEVICE_BANNED"));
      setPending(null);
      return;
    }

    await finish();
  }

  async function saveLocation(value: string) {
    window.localStorage.removeItem("p2c_pending_location");
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("AUTH_REQUIRED");
    const { error: locationError } = await supabase
      .from("profiles")
      .update({ location: value })
      .eq("user_id", data.user.id);
    if (locationError) throw locationError;
  }

  return (
    <div className="auth-panel modern-auth-panel">
      <div className="auth-panel-heading compact">
        <span className="auth-kicker">WetDreams access</span>
        <h2>{mode === "signup" ? "Create account" : "Welcome back"}</h2>
        <p>{mode === "signup" ? "Register with any email." : "Continue as guest or login."}</p>
      </div>

      <div className="auth-guest-card">
        <div>
          <span>Fast start</span>
          <strong>Guest sign in</strong>
        </div>
        <div className={requiredScope === "guest" ? "field-error" : undefined}>
          <LocationSelects state={guestState} city={guestCity} onStateChange={setGuestState} onCityChange={setGuestCity} required={false} />
        </div>
        {requiredScope === "guest" && <p className="field-required-message">Location required</p>}
        <button className="button primary wide" type="button" onClick={continueAsGuest} disabled={!!pending}>
          {pending === "guest" ? <LoaderCircle className="spin" size={19} /> : <UserRound size={19} />}
          Continue as guest
        </button>
      </div>

      <div className="auth-divider"><span>{mode === "login" ? "or login" : "or register"}</span></div>

      <div className="auth-tabs" role="tablist" aria-label="Email access">
        <button className={mode === "login" ? "active" : ""} type="button" onClick={() => { setMode("login"); setError(null); setNotice(null); setRequiredScope(null); }}>
          Login
        </button>
        <button className={mode === "signup" ? "active" : ""} type="button" onClick={() => { setMode("signup"); setError(null); setNotice(null); setRequiredScope(null); }}>
          Register
        </button>
      </div>

      <form
        onSubmit={submitEmail}
        onInvalid={(event) => {
          event.preventDefault();
          setRequiredScope(mode === "signup" ? "signup" : null);
          setError("Please fill required fields.");
        }}
        className="form-stack auth-email-form"
      >
        {mode === "signup" && (
          <>
            <label>
              Name
              <input name="displayName" autoComplete="name" minLength={2} maxLength={60} placeholder="Your name" required />
            </label>
            <fieldset className={`gender-choice ${requiredScope === "signup" && !signupGender ? "field-error" : ""}`}>
              <legend>I am</legend>
              <label>
                <input
                  type="radio"
                  name="gender"
                  value="male"
                  checked={signupGender === "male"}
                  onChange={() => setSignupGender("male")}
                  required
                />
                <span>Male</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="gender"
                  value="female"
                  checked={signupGender === "female"}
                  onChange={() => setSignupGender("female")}
                  required
                />
                <span>Female</span>
              </label>
            </fieldset>
            {requiredScope === "signup" && !signupGender && <p className="field-required-message">Gender required</p>}
            <div className={requiredScope === "signup" && !formatLocation(signupCity, signupState) ? "field-error" : undefined}>
              <LocationSelects state={signupState} city={signupCity} onStateChange={setSignupState} onCityChange={setSignupCity} />
            </div>
            {requiredScope === "signup" && !formatLocation(signupCity, signupState) && <p className="field-required-message">Location required</p>}
          </>
        )}
        <label>
          Email
          <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} placeholder="At least 8 characters" required />
        </label>
        <button className="button primary wide" disabled={!!pending} type="submit">
          {pending === "email" ? <LoaderCircle className="spin" size={19} /> : <Mail size={19} />}
          {mode === "login" ? "Login" : "Register"}
        </button>
      </form>

      {error && <p className="form-message error" role="alert">{error}</p>}
      {notice && <p className="form-message success" role="status">{notice}</p>}

      <button className="auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setNotice(null); setRequiredScope(null); }}>
        {mode === "login" ? "New here? Register" : "Already registered? Login"} <ArrowRight size={14} />
      </button>
    </div>
  );
}
