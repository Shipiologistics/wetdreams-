"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Mail, MapPin, UserRound, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateDeviceId, registerCurrentDevice } from "@/lib/device-id";
import { formatLocation } from "@/lib/location-options";
import { messageForError } from "@/lib/format";
import { LocationSelects } from "@/components/location-selects";

type AuthFormProps = {
  next?: string;
  onSuccess?: () => Promise<void> | void;
};

type SignupStep = 1 | 2 | 3;
type SignupFieldError = "basic" | "location" | "account" | null;

export function AuthForm({ next = "/discover", onSuccess }: AuthFormProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupStep, setSignupStep] = useState<SignupStep>(1);
  const [signupFieldError, setSignupFieldError] = useState<SignupFieldError>(null);
  const [signupName, setSignupName] = useState("");
  const [signupGender, setSignupGender] = useState<"male" | "female" | "">("");
  const [signupState, setSignupState] = useState("");
  const [signupCity, setSignupCity] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  async function finish() {
    if (onSuccess) {
      await onSuccess();
      return;
    }
    window.location.assign(next);
  }

  async function continueAsGuest() {
    setPending("guest");
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const response = await fetch("/api/auth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getOrCreateDeviceId() }),
    });
    const guest = await response.json().catch(() => null) as { email?: string; password?: string; error?: string } | null;

    if (!response.ok || !guest?.email || !guest.password) {
      setError(messageForError(guest?.error ?? "Guest sign in failed."));
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

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("login");
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });

    if (loginError) {
      setError(messageForError(loginError.message));
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

  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateSignupStep(3)) return;
    const cleanLocation = formatLocation(signupCity, signupState);
    setPending("signup");
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const result = await supabase.auth.signUp({
      email: signupEmail.trim(),
      password: signupPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        data: { display_name: signupName.trim(), gender: signupGender },
      },
    });

    if (result.error) {
      setError(messageForError(result.error.message));
      setPending(null);
      return;
    }

    if (!result.data.session) {
      window.localStorage.setItem("p2c_pending_location", cleanLocation);
      setSignupOpen(false);
      setNotice("Check email.");
      setPending(null);
      return;
    }

    try {
      await registerCurrentDevice();
      await saveLocation(cleanLocation);
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

  function openSignup() {
    setSignupOpen(true);
    setSignupStep(1);
    setSignupFieldError(null);
    setError(null);
    setNotice(null);
  }

  function closeSignup() {
    if (pending === "signup") return;
    setSignupOpen(false);
    setSignupFieldError(null);
  }

  function validateSignupStep(step: SignupStep) {
    if (step === 1 && (signupName.trim().length < 2 || !signupGender)) {
      setSignupFieldError("basic");
      setError("Please fill basic info.");
      return false;
    }
    if (step === 2 && !formatLocation(signupCity, signupState)) {
      setSignupFieldError("location");
      setError("Location is required.");
      return false;
    }
    if (step === 3 && (!signupEmail.trim() || signupPassword.length < 8)) {
      setSignupFieldError("account");
      setError("Email and password are required.");
      return false;
    }
    setSignupFieldError(null);
    setError(null);
    return true;
  }

  function nextSignupStep() {
    if (!validateSignupStep(signupStep)) return;
    setSignupStep((current) => Math.min(3, current + 1) as SignupStep);
  }

  function previousSignupStep() {
    setSignupFieldError(null);
    setError(null);
    setSignupStep((current) => Math.max(1, current - 1) as SignupStep);
  }

  return (
    <div className="auth-panel modern-auth-panel quick-start-panel">
      <div className="auth-panel-heading compact">
        <span className="auth-kicker">WetDreams access</span>
        <h2>Start now</h2>
        <p>Quick guest access, or login with your registered email.</p>
      </div>

      <button className="quick-start-button" type="button" onClick={continueAsGuest} disabled={!!pending}>
        <span>{pending === "guest" ? <LoaderCircle className="spin" size={24} /> : <Zap size={24} fill="currentColor" />}</span>
        <strong>Quick Start</strong>
      </button>

      <div className="auth-divider"><span>Email login</span></div>

      <form
        onSubmit={submitLogin}
        onInvalid={(event) => {
          event.preventDefault();
          setError("Please fill email and password.");
        }}
        className="form-stack auth-email-form"
      >
        <label>
          Email
          <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" minLength={8} placeholder="At least 8 characters" required />
        </label>
        <button className="button primary wide" disabled={!!pending} type="submit">
          {pending === "login" ? <LoaderCircle className="spin" size={19} /> : <Mail size={19} />}
          Login
        </button>
      </form>

      <button className="auth-register-entry" type="button" onClick={openSignup}>
        Create registered account <ArrowRight size={15} />
      </button>

      {error && !signupOpen && <p className="form-message error" role="alert">{error}</p>}
      {notice && <p className="form-message success" role="status">{notice}</p>}

      {signupOpen && (
        <div className="modal-backdrop auth-step-backdrop" role="presentation" onMouseDown={closeSignup}>
          <form className="modal auth-step-modal" role="dialog" aria-modal="true" aria-labelledby="signup-step-title" onSubmit={submitSignup} onMouseDown={(event) => event.stopPropagation()}>
            <div className="auth-step-topbar">
              <button className="icon-button bordered" type="button" title="Back" onClick={signupStep === 1 ? closeSignup : previousSignupStep}>
                <ArrowLeft size={18} />
              </button>
              <span>{signupStep}/3</span>
            </div>

            {signupStep === 1 && (
              <>
                <div className="auth-step-title">
                  <strong>Please fill in the</strong>
                  <h2 id="signup-step-title">Basic info</h2>
                </div>
                <div className={`signup-gender-cards ${signupFieldError === "basic" && !signupGender ? "field-error" : ""}`}>
                  <button className={signupGender === "male" ? "active male" : "male"} type="button" onClick={() => setSignupGender("male")}>
                    <span>Male</span>
                    <UserRound size={58} />
                  </button>
                  <button className={signupGender === "female" ? "active female" : "female"} type="button" onClick={() => setSignupGender("female")}>
                    <span>Female</span>
                    <UserRound size={58} />
                  </button>
                </div>
                <label className={`step-field ${signupFieldError === "basic" && signupName.trim().length < 2 ? "field-error" : ""}`}>
                  Nickname
                  <input value={signupName} onChange={(event) => setSignupName(event.target.value)} autoComplete="name" minLength={2} maxLength={60} placeholder="Your name" />
                </label>
                {signupFieldError === "basic" && <p className="field-required-message">Gender and nickname required</p>}
                <button className="button primary wide step-next-button" type="button" onClick={nextSignupStep}>1/3 Next</button>
              </>
            )}

            {signupStep === 2 && (
              <>
                <div className="auth-step-title">
                  <strong>Please select your</strong>
                  <h2 id="signup-step-title">Location</h2>
                </div>
                <div className={signupFieldError === "location" ? "field-error" : ""}>
                  <LocationSelects state={signupState} city={signupCity} onStateChange={setSignupState} onCityChange={setSignupCity} />
                </div>
                <div className="step-tip-card">
                  <MapPin size={22} />
                  <p>Choose the city people should see on your profile and filters.</p>
                </div>
                {signupFieldError === "location" && <p className="field-required-message">State and city required</p>}
                <button className="button primary wide step-next-button" type="button" onClick={nextSignupStep}>2/3 Next</button>
              </>
            )}

            {signupStep === 3 && (
              <>
                <div className="auth-step-title">
                  <strong>Create your</strong>
                  <h2 id="signup-step-title">Login</h2>
                </div>
                <label className={`step-field ${signupFieldError === "account" && !signupEmail.trim() ? "field-error" : ""}`}>
                  Email
                  <input value={signupEmail} onChange={(event) => setSignupEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" />
                </label>
                <label className={`step-field ${signupFieldError === "account" && signupPassword.length < 8 ? "field-error" : ""}`}>
                  Password
                  <input value={signupPassword} onChange={(event) => setSignupPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} placeholder="At least 8 characters" />
                </label>
                <div className="step-tip-card">
                  <Check size={22} />
                  <p>Female accounts will be asked for a real profile image after login.</p>
                </div>
                {signupFieldError === "account" && <p className="field-required-message">Valid email and 8 character password required</p>}
                {error && <p className="form-message error" role="alert">{error}</p>}
                <button className="button primary wide step-next-button" type="submit" disabled={pending === "signup"}>
                  {pending === "signup" && <LoaderCircle className="spin" size={18} />}
                  3/3 Complete
                </button>
              </>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
