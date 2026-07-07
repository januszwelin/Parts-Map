"use client";

/* ════════════════════════════════════════════════════════════════════
   AUTH UI — small pieces shared by the sign-in and reset-password pages
   ════════════════════════════════════════════════════════════════════ */

/** Tiny inline spinner for buttons mid-flight. */
export function Spinner() {
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

/* ——— password strength (sign-up / reset) ———
   A quiet 3-segment bar, not a gate: minLength=8 stays the only hard
   rule. Scored on length + character variety — no zxcvbn dependency;
   this is a nudge toward better habits, not a security boundary. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
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

export function StrengthBar({ password }: { password: string }) {
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
        style={{ color: score === 0 ? "var(--danger)" : "var(--ink-faint)" }}
      >
        {label}
      </p>
    </div>
  );
}
