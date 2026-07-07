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
import { Spinner, StrengthBar } from "@/components/auth-ui";

type Stage = "idle" | "submitting" | "redirecting";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  // Forgot-password always ends in this generic confirmation (BetterAuth
  // itself never reveals whether the email had an account, to avoid
  // enumeration) rather than a redirect.
  const [resetSent, setResetSent] = useState(false);
  const busy = stage !== "idle";

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
          : mode === "up"
            ? "Creating your account…"
            : "Sending reset link…"
        : mode === "in"
          ? "Sign in"
          : mode === "up"
            ? "Create account"
            : "Send reset link";

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
          {mode === "in"
            ? "Sign in"
            : mode === "up"
              ? "Create an account"
              : "Reset your password"}
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--ink-soft)" }}>
          {mode === "forgot"
            ? "We'll email you a link to set a new password."
            : "Only needed for cloud-saved maps — the canvas itself works fine without an account."}
        </p>

        {mode === "forgot" && resetSent ? (
          <p className="mt-4 text-[13px]" style={{ color: "var(--ink-soft)" }} role="status">
            If that email has an account, check your inbox for a reset link.
          </p>
        ) : (
          <>
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
              {mode !== "forgot" && (
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
              )}
              {mode === "up" && <StrengthBar password={password} />}
            </div>

            {mode === "up" && (
              <label
                className="mt-3 flex cursor-pointer items-start gap-2 text-[12px] leading-relaxed"
                style={{ color: "var(--ink-soft)" }}
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
                    className="underline"
                    style={{ color: "var(--ink)" }}
                  >
                    privacy note
                  </Link>
                  .
                </span>
              </label>
            )}

            {mode === "in" && (
              <button
                type="button"
                disabled={busy}
                className="mt-2 text-[12px] underline disabled:opacity-50"
                style={{ color: "var(--ink-faint)" }}
                onClick={() => {
                  setError(null);
                  setMode("forgot");
                }}
              >
                Forgot password?
              </button>
            )}

            {error && (
              <p className="mt-3 text-[12px]" style={{ color: "var(--danger)" }} role="alert">
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
          </>
        )}

        <button
          type="button"
          disabled={busy}
          className="mt-3 w-full text-center text-[12px] underline disabled:opacity-50"
          style={{ color: "var(--ink-soft)" }}
          onClick={() => {
            setError(null);
            setResetSent(false);
            setMode((m) => (m === "in" ? "up" : "in"));
          }}
        >
          {mode === "forgot"
            ? "Back to sign in"
            : mode === "in"
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
