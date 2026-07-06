"use client";

/* ════════════════════════════════════════════════════════════════════
   SIGN IN — email + password, calm and self-contained
   ════════════════════════════════════════════════════════════════════

   A dedicated route (not a modal in the canvas) so the orchestrator
   stays untouched. Signing in is entirely optional for this app — file
   save/load keeps working with no account at all; this page only adds
   the option of cloud-saved maps.

   The submit button narrates its stages ("Signing in…" → "Opening your
   map…") because auth round-trips are the one genuinely slow moment in
   the app; a silent button reads as broken. The page owns its scroll
   (the root layout locks body scrolling for the canvas, which would
   otherwise clip this form behind a phone keyboard). */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/* ——— password strength (sign-up only) ———
   A quiet 3-segment bar, not a gate: minLength=8 stays the only hard
   rule. Scored on length + character variety — no zxcvbn dependency;
   this is a nudge toward better habits, not a security boundary. */
function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (pw.length === 0) return { score: 0, label: "" };
  if (pw.length < 8) return { score: 0, label: "Too short — 8 characters minimum" };
  let points = 1; // ≥8 chars
  if (pw.length >= 12) points++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) points++;
  if (/\d/.test(pw)) points++;
  if (/[^A-Za-z0-9]/.test(pw)) points++;
  if (points <= 2) return { score: 1, label: "Weak — add length or variety" };
  if (points <= 4) return { score: 2, label: "Good" };
  return { score: 3, label: "Strong" };
}

const STRENGTH_COLORS = ["var(--line)", "#C08A8A", "#B5A97B", "#7D8B74"] as const;

function StrengthBar({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  if (!password) return null;
  return (
    <div aria-live="polite">
      <div className="flex gap-1" role="img" aria-label={`Password strength: ${label}`}>
        {[1, 2, 3].map((seg) => (
          <div
            key={seg}
            className="h-1 flex-1 rounded-full transition-colors duration-300"
            style={{
              background: seg <= score ? STRENGTH_COLORS[score] : "var(--line)",
            }}
          />
        ))}
      </div>
      <p
        className="mt-1 text-[11px]"
        style={{ color: score === 0 ? "#A05B5B" : "var(--ink-faint)" }}
      >
        {label}
      </p>
    </div>
  );
}

/** Tiny inline spinner for buttons mid-flight. */
function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Stage = "idle" | "submitting" | "redirecting";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const busy = stage !== "idle";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setStage("submitting");
    const { error: err } =
      mode === "in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: name || email });
    if (err) {
      setStage("idle");
      setError(err.message ?? "Something went wrong — try again.");
      return;
    }
    // Success: stay disabled through the navigation so the button can't
    // be pressed again while Next swaps routes.
    setStage("redirecting");
    router.push("/");
    router.refresh();
  };

  const inputStyle = {
    background: "rgba(255,255,255,0.7)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
  } as const;

  const buttonLabel =
    stage === "redirecting"
      ? "Opening your map…"
      : stage === "submitting"
        ? mode === "in"
          ? "Signing in…"
          : "Creating your account…"
        : mode === "in"
          ? "Sign in"
          : "Create account";

  return (
    <div
      className="flex h-dvh items-center justify-center overflow-y-auto p-4"
      style={{ background: "var(--canvas)" }}
    >
      <form
        onSubmit={submit}
        className="my-auto w-full max-w-sm rounded-2xl p-6"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-rest)",
        }}
      >
        <h1 className="text-base font-medium" style={{ color: "var(--ink)" }}>
          {mode === "in" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--ink-soft)" }}>
          Only needed for cloud-saved maps — the canvas itself works fine
          without an account.
        </p>

        <div className="mt-4 flex flex-col gap-2.5">
          {mode === "up" && (
            <input
              className="rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60"
              style={inputStyle}
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              disabled={busy}
            />
          )}
          <input
            className="rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60"
            style={inputStyle}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
            disabled={busy}
          />
          <input
            className="rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60"
            style={inputStyle}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            minLength={8}
            required
            disabled={busy}
          />
          {mode === "up" && <StrengthBar password={password} />}
        </div>

        {error && (
          <p className="mt-3 text-[12px]" style={{ color: "#A05B5B" }} role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {busy && <Spinner />}
          {buttonLabel}
        </button>

        <button
          type="button"
          disabled={busy}
          className="mt-3 w-full text-center text-[12px] underline disabled:opacity-50"
          style={{ color: "var(--ink-soft)" }}
          onClick={() => {
            setError(null);
            setMode((m) => (m === "in" ? "up" : "in"));
          }}
        >
          {mode === "in"
            ? "Need an account? Create one"
            : "Already have an account? Sign in"}
        </button>

        <Link
          href="/"
          className="mt-4 block text-center text-[12px]"
          style={{ color: "var(--ink-faint)" }}
        >
          ← Back to the map
        </Link>
      </form>
    </div>
  );
}
