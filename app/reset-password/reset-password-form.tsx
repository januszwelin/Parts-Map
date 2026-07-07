"use client";

/* ════════════════════════════════════════════════════════════════════
   RESET PASSWORD FORM — the client half of /reset-password
   ════════════════════════════════════════════════════════════════════

   Landed on via the link BetterAuth emails (see lib/auth.ts's
   sendResetPassword and app/sign-in/page.tsx's "Forgot password?" flow).
   BetterAuth's own redirect appends `?token=...` on success or
   `?error=INVALID_TOKEN` if the link was already used/expired — this page
   just reads whichever is present. */

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Spinner, StrengthBar } from "@/components/auth-ui";

type Stage = "idle" | "submitting" | "done";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const busy = stage === "submitting";

  const inputStyle = {
    background: "rgba(255,255,255,0.7)",
    border: "1px solid var(--line)",
    color: "var(--ink)",
  } as const;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !token) return;
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setError(null);
    setStage("submitting");
    const { error: err } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    if (err) {
      setStage("idle");
      setError(err.message ?? "Couldn't reset your password — try again.");
      return;
    }
    setStage("done");
  };

  return (
    <div
      className="flex h-dvh items-center justify-center overflow-y-auto p-4"
      style={{ background: "var(--canvas)" }}
    >
      <div
        className="my-auto w-full max-w-sm rounded-2xl p-6"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-rest)",
        }}
      >
        <h1 className="text-base font-medium" style={{ color: "var(--ink)" }}>
          Reset your password
        </h1>

        {!token || linkError ? (
          <>
            <p className="mt-2 text-[13px]" style={{ color: "var(--ink-soft)" }} role="alert">
              This reset link is invalid or has expired.
            </p>
            <Link
              href="/sign-in"
              className="mt-4 block text-center text-[12px] underline"
              style={{ color: "var(--ink-soft)" }}
            >
              Request a new link
            </Link>
          </>
        ) : stage === "done" ? (
          <>
            <p className="mt-2 text-[13px]" style={{ color: "var(--ink-soft)" }} role="status">
              Your password has been reset.
            </p>
            <Link
              href="/sign-in"
              className="mt-4 block w-full rounded-xl px-4 py-2.5 text-center text-sm text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)" }}
            >
              Sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="mt-1 text-[13px]" style={{ color: "var(--ink-soft)" }}>
              Choose a new password for your account.
            </p>
            <div className="mt-4 flex flex-col gap-2.5">
              <input
                className="rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60"
                style={inputStyle}
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                autoFocus
                required
                disabled={busy}
              />
              <StrengthBar password={password} />
              <input
                className="rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-60"
                style={inputStyle}
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={busy}
              />
            </div>

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
              {busy ? "Setting new password…" : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
