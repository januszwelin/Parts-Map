"use client";

/* ════════════════════════════════════════════════════════════════════
   SIGN IN — email + password, calm and self-contained
   ════════════════════════════════════════════════════════════════════

   A dedicated route (not a modal in the canvas) so the orchestrator
   stays untouched. Signing in is entirely optional for this app — file
   save/load keeps working with no account at all; this page only adds
   the option of cloud-saved maps. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } =
      mode === "in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: name || email });
    setBusy(false);
    if (err) {
      setError(err.message ?? "Something went wrong — try again.");
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <div
      className="flex min-h-dvh items-center justify-center p-4"
      style={{ background: "var(--canvas)" }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl p-6"
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
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "rgba(255,255,255,0.7)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
              }}
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          )}
          <input
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
            }}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
            }}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </div>

        {error && (
          <p className="mt-3 text-[12px]" style={{ color: "#A05B5B" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-xl px-4 py-2.5 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </button>

        <button
          type="button"
          className="mt-3 w-full text-center text-[12px] underline"
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
      </form>
    </div>
  );
}
