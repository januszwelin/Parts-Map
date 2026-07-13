"use client";

/* ════════════════════════════════════════════════════════════════════
   SIGN IN — email + password, calm and self-contained
   ════════════════════════════════════════════════════════════════════

   A dedicated route (not a modal in the canvas) so the orchestrator
   stays untouched. Signing in is entirely optional for this app — file
   save/load keeps working with no account at all; this page only adds
   the option of cloud-saved maps.

   Layout: a two-panel card — a warm hero (the app's living dot-settles-
   on-the-body vignette + why an account helps) beside the form. On
   phones the hero collapses to a compact brand line above the form so
   the keyboard never has to fight a tall illustration. One page, three
   modes (in / up / forgot); a segmented toggle picks in vs up, forgot is
   a sub-flow of signing in.

   The submit button narrates its stages ("Signing in…" → "Opening your
   map…") because auth round-trips are the one genuinely slow moment in
   the app; a silent button reads as broken. The page owns its scroll
   (the root layout locks body scrolling for the canvas, which would
   otherwise clip this form behind a phone keyboard). */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Spinner, StrengthBar } from "@/components/auth-ui";

type Stage = "idle" | "submitting" | "redirecting";
type Mode = "in" | "up" | "forgot";

/* The resend button sleeps this long after every send — long enough that
   mail has a fair chance to arrive, and it keeps a jittery finger well
   inside BetterAuth's 5-per-hour reset rate limit. */
const RESEND_COOLDOWN_S = 60;

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  // Forgot-password always ends in this generic confirmation (BetterAuth
  // itself never reveals whether the email had an account, to avoid
  // enumeration) rather than a redirect.
  const [resetSent, setResetSent] = useState(false);
  // The confirmation's "Send again" affordance: seconds left on its
  // cooldown, whether a resend is in flight / just landed, and its own
  // error line (kept as generic as the confirmation itself).
  const [resendLeft, setResendLeft] = useState(0);
  const [resendStage, setResendStage] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const busy = stage !== "idle";

  // One-second heartbeat for the cooldown countdown; re-arms itself while
  // any time remains and vanishes at zero (or when the flow is left).
  useEffect(() => {
    if (resendLeft <= 0) return;
    const t = setTimeout(() => setResendLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendLeft]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setStage("submitting");

    if (mode === "forgot") {
      const { error: err } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setStage("idle");
      if (err) {
        setError(err.message ?? "Couldn't send a reset link — try again.");
        return;
      }
      setResetSent(true);
      setResendLeft(RESEND_COOLDOWN_S);
      return;
    }

    if (mode === "up" && !consent) {
      setStage("idle");
      setError("Please agree to how your maps are handled to continue.");
      return;
    }

    const { error: err } =
      mode === "in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: name || email });
    if (err) {
      setStage("idle");
      // Sign-in stays deliberately generic: a "no such user" vs "wrong
      // password" distinction lets an attacker enumerate which emails have
      // accounts. Sign-up can be specific (users need to know an email is
      // already taken so they can switch to signing in).
      setError(
        mode === "in"
          ? "Email or password is incorrect."
          : (err.message ?? "Couldn't create your account — try again."),
      );
      return;
    }
    // Success: stay disabled through the navigation so the button can't
    // be pressed again while Next swaps routes.
    setStage("redirecting");
    router.push("/");
    router.refresh();
  };

  /* Switch between the sign-in and sign-up faces (or out of the forgot
     sub-flow), clearing anything left over from the previous mode. */
  const goMode = (m: Mode) => {
    setError(null);
    setResetSent(false);
    setResendLeft(0);
    setResendStage("idle");
    setResendError(null);
    setMode(m);
  };

  /* Re-request the reset link for the email already confirmed on screen.
     Success restarts the cooldown; failure stays generic — a specific
     error here would leak whether the address has an account, the same
     enumeration concern the confirmation text is worded around. */
  const resendReset = async () => {
    if (resendStage === "sending" || resendLeft > 0) return;
    setResendError(null);
    setResendStage("sending");
    const { error: err } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (err) {
      setResendStage("idle");
      setResendError("Couldn't send just now — try again in a bit.");
      return;
    }
    setResendStage("sent");
    setResendLeft(RESEND_COOLDOWN_S);
  };

  const resendLabel =
    resendStage === "sending"
      ? "Sending again…"
      : resendStage === "sent" && resendLeft > RESEND_COOLDOWN_S - 4
        ? "Sent ✓"
        : resendLeft > 0
          ? `Send again (${resendLeft}s)`
          : "Didn't get it? Send again";

  const labelClass = "text-[12px] font-medium";
  const labelStyle = { color: "var(--ink-soft)" } as const;
  const fieldClass =
    "w-full min-h-11 rounded-xl px-3.5 text-sm outline-none transition-colors disabled:opacity-60";
  // Warm-paper fields read as gently inset on the white card; the global
  // :focus-visible rule warms the border to accent on focus (no extra ring
  // here, so it can never double up or clip).
  const fieldStyle = {
    background: "var(--canvas)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
  } as const;

  const buttonLabel =
    stage === "redirecting"
      ? "Opening your map…"
      : stage === "submitting"
        ? mode === "in"
          ? "Signing in…"
          : mode === "up"
            ? "Creating your account…"
            : "Sending reset link…"
        : mode === "in"
          ? "Sign in"
          : mode === "up"
            ? "Create account"
            : "Send reset link";

  const heading =
    mode === "in"
      ? "Welcome back"
      : mode === "up"
        ? "Create your space"
        : "Reset your password";
  const subhead =
    mode === "forgot"
      ? "We'll email you a link to set a new password."
      : mode === "up"
        ? "A private, cloud-saved home for your maps — reachable from any device."
        : "Sign in to open your saved maps.";

  return (
    <div
      className="flex h-dvh items-center justify-center overflow-y-auto p-4"
      style={{ background: "var(--canvas)" }}
    >
      <div
        className="fade-in my-auto grid w-full min-w-0 max-w-4xl grid-cols-1 overflow-hidden rounded-3xl md:grid-cols-[1.05fr_1fr]"
        style={{
          background: "var(--panel-solid)",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* ————— HERO (desktop) — the app's own living picture ————— */}
        <aside
          className="relative hidden flex-col justify-between p-9 md:flex"
          style={{
            background:
              "linear-gradient(157deg, color-mix(in srgb, var(--accent) 15%, #fff), color-mix(in srgb, var(--accent) 5%, #fff))",
            borderRight: "1px solid var(--line)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span
              className="text-[13px] font-medium tracking-wide"
              style={{ color: "var(--ink-soft)" }}
            >
              Parts Map
            </span>
          </div>

          <div aria-hidden className="flex justify-center py-4">
            <Vignette />
          </div>

          <div>
            <h2
              className="text-lg font-medium leading-snug"
              style={{ color: "var(--ink)" }}
            >
              A quiet, spatial place
              <br />
              for parts work.
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              <Reassure>The canvas works without an account — this just adds cloud save.</Reassure>
              <Reassure>Save your maps and reach them from any device.</Reassure>
              <Reassure>
                Personal, tender material — handled with care.{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="underline underline-offset-2"
                  style={{ color: "var(--ink)" }}
                >
                  How your data is handled
                </Link>
                .
              </Reassure>
            </ul>
          </div>
        </aside>

        {/* ————— FORM ————— */}
        <div className="min-w-0 p-7 sm:p-9">
          {/* Compact brand for phones, where the hero panel is hidden. */}
          <div className="mb-6 flex items-center gap-2.5 md:hidden">
            <BrandMark />
            <span
              className="text-[13px] font-medium tracking-wide"
              style={{ color: "var(--ink-soft)" }}
            >
              Parts Map
            </span>
          </div>

          {/* Segmented mode toggle — the obvious way to switch faces
              (hidden while resetting a password). */}
          {mode !== "forgot" && (
            <div
              role="tablist"
              aria-label="Sign in or create an account"
              className="mb-6 grid grid-cols-2 gap-1 rounded-xl p-1"
              style={{ background: "var(--canvas)", border: "1px solid var(--line)" }}
            >
              {(["in", "up"] as const).map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={busy}
                    onClick={() => goMode(m)}
                    className="min-h-9 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-60"
                    style={
                      active
                        ? {
                            background: "var(--panel-solid)",
                            color: "var(--ink)",
                            boxShadow: "var(--shadow-rest)",
                          }
                        : { color: "var(--ink-soft)" }
                    }
                  >
                    {m === "in" ? "Sign in" : "Create account"}
                  </button>
                );
              })}
            </div>
          )}

          <h1 className="text-xl font-medium" style={{ color: "var(--ink)" }}>
            {heading}
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            {subhead}
          </p>

          {mode === "forgot" && resetSent ? (
            <>
              <div
                className="mt-6 rounded-xl p-4 text-[13px] leading-relaxed"
                style={{ background: "var(--canvas)", color: "var(--ink-soft)" }}
                role="status"
              >
                If that email has an account, check your inbox for a reset link.
              </div>
              <button
                type="button"
                onClick={resendReset}
                disabled={resendStage === "sending" || resendLeft > 0}
                className="mt-4 block text-[13px] underline underline-offset-2 disabled:no-underline disabled:opacity-60"
                style={{ color: "var(--ink-soft)" }}
              >
                {resendLabel}
              </button>
              {resendError && (
                <p
                  className="mt-3 rounded-lg px-3 py-2 text-[12px]"
                  style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
                  role="alert"
                >
                  {resendError}
                </p>
              )}
            </>
          ) : (
            <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
              {mode === "up" && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="name" className={labelClass} style={labelStyle}>
                    Name
                  </label>
                  <input
                    id="name"
                    className={fieldClass}
                    style={fieldStyle}
                    placeholder="What should we call you?"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    disabled={busy}
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className={labelClass} style={labelStyle}>
                  Email
                </label>
                <input
                  id="email"
                  className={fieldClass}
                  style={fieldStyle}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                  disabled={busy}
                />
              </div>

              {mode !== "forgot" && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="password" className={labelClass} style={labelStyle}>
                      Password
                    </label>
                    {mode === "in" && (
                      <button
                        type="button"
                        disabled={busy}
                        className="text-[12px] underline underline-offset-2 disabled:opacity-50"
                        style={{ color: "var(--ink-faint)" }}
                        onClick={() => goMode("forgot")}
                      >
                        Forgot your password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      className={`${fieldClass} pr-11`}
                      style={fieldStyle}
                      type={showPw ? "text" : "password"}
                      placeholder={mode === "up" ? "At least 8 characters" : "Your password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === "in" ? "current-password" : "new-password"}
                      minLength={8}
                      required
                      disabled={busy}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      disabled={busy}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      aria-pressed={showPw}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl disabled:opacity-50"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {showPw ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  {mode === "up" && <StrengthBar password={password} />}
                </div>
              )}

              {mode === "up" && (
                <label
                  className="flex cursor-pointer items-start gap-2.5 rounded-xl p-3 text-[12px] leading-relaxed"
                  style={{ background: "var(--canvas)", color: "var(--ink-soft)" }}
                >
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    disabled={busy}
                    className="mt-0.5 shrink-0 disabled:opacity-60"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span>
                    I understand my saved maps are personal and I&apos;m okay with
                    how they&apos;re handled — see the{" "}
                    <Link
                      href="/privacy"
                      target="_blank"
                      className="underline underline-offset-2"
                      style={{ color: "var(--ink)" }}
                    >
                      privacy note
                    </Link>
                    .
                  </span>
                </label>
              )}

              {error && (
                <p
                  className="rounded-lg px-3 py-2 text-[12px]"
                  style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
                  role="alert"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: "var(--accent-strong)" }}
              >
                {busy && <Spinner />}
                {buttonLabel}
              </button>
            </form>
          )}

          {mode === "forgot" && (
            <button
              type="button"
              disabled={busy}
              className="mt-5 text-[13px] underline underline-offset-2 disabled:opacity-50"
              style={{ color: "var(--ink-soft)" }}
              onClick={() => goMode("in")}
            >
              ← Back to sign in
            </button>
          )}

          <Link
            href="/"
            className="mt-6 block text-[12px]"
            style={{ color: "var(--ink-faint)" }}
          >
            ← Back to the map
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ——— brand mark: the canvas's landing-dot + pulse-ring, at rest ———
   Echoes app/icons/mark.tsx (favicon / PWA icon) so the sign-in page
   wears the same face as the installed app. */
function BrandMark() {
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 items-center justify-center rounded-full"
      style={{ border: "1.5px solid color-mix(in srgb, var(--accent) 45%, transparent)" }}
    >
      <span
        className="h-3 w-3 rounded-full"
        style={{
          background: "var(--accent)",
          boxShadow: "0 0 0 3px rgba(255,255,255,0.85)",
        }}
      />
    </span>
  );
}

/* ——— hero vignette: a part finds its place on the body ———
   The same living picture as the welcome modal — the dot glides in,
   settles on the chest with a soft ring, and repeats (static under
   reduced motion, gated by the .welcome-* rules in globals.css). */
function Vignette() {
  return (
    <svg width="168" height="128" viewBox="0 0 132 100" fill="none">
      <circle cx="66" cy="24" r="13" stroke="var(--line)" strokeWidth="2" />
      <path
        d="M32 94c2.5-23 16-36 34-36s31.5 13 34 36"
        stroke="var(--line)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        className="welcome-ripple"
        cx="66"
        cy="72"
        r="9"
        stroke="var(--accent)"
        strokeWidth="1.5"
        opacity="0"
      />
      <circle className="welcome-dot" cx="66" cy="72" r="6" fill="var(--accent)" />
    </svg>
  );
}

/* ——— a reassurance line with the app's sage dot as its bullet ——— */
function Reassure({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
      <span
        aria-hidden
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "var(--accent)" }}
      />
      <span>{children}</span>
    </li>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3l18 18M10.6 6.2A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a15 15 0 0 1-3.4 3.9M6.5 8.1A15.2 15.2 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 3.1-.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.9 10a3 3 0 0 0 4.2 4.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
