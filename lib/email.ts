/* ════════════════════════════════════════════════════════════════════
   EMAIL — server-only transactional email seam (Resend)
   ════════════════════════════════════════════════════════════════════

   The one place the app sends email from. Delivery goes through Resend's
   plain HTTP API (no SDK dependency); when RESEND_API_KEY or EMAIL_FROM
   is missing the send degrades to a server-side console.log of the link,
   so local dev and preview deploys keep working with zero setup — the
   flow is testable end-to-end straight from the terminal output.

   Failures are logged server-side and swallowed, deliberately: the reset
   email only goes out when the address has an account, so surfacing a
   send error to the client would leak account existence (the same
   enumeration concern that keeps the sign-in error generic). */
import "server-only";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/* Palette lifted from globals.css — email clients can't read CSS vars,
   so the values are inlined here. Keep in sync if the app's palette
   ever shifts (it rarely should). */
const INK = "#3a3733";
const INK_SOFT = "#6f6a62";
const CANVAS = "#f7f5f1";
const LINE = "#e4e0d8";
const ACCENT_STRONG = "#6b7962";

export async function sendPasswordResetEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    // Dev fallback — the whole reset flow works from this log line.
    console.log(`[auth] Password reset for ${to}: ${url}`);
    return;
  }

  const text = [
    "Someone asked to reset the password for your Parts Map account.",
    "If it was you, open this link to choose a new password:",
    "",
    url,
    "",
    "The link works for one hour. If you didn't ask for this, you can",
    "safely ignore this email — nothing about your account changes.",
  ].join("\n");

  const html = `<div style="background:${CANVAS};padding:32px 16px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:32px;">
    <p style="margin:0;font-size:13px;color:${INK_SOFT};letter-spacing:0.02em;">Parts Map</p>
    <h1 style="margin:16px 0 0;font-size:18px;font-weight:500;color:${INK};">Reset your password</h1>
    <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:${INK_SOFT};">
      Someone asked to reset the password for your Parts&nbsp;Map account.
      If it was you, choose a new password here:
    </p>
    <p style="margin:24px 0;">
      <a href="${url}" style="display:inline-block;background:${ACCENT_STRONG};color:#ffffff;text-decoration:none;font-size:14px;padding:11px 20px;border-radius:12px;">Choose a new password</a>
    </p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:${INK_SOFT};">
      The link works for one hour. If you didn't ask for this, you can
      safely ignore this email — nothing about your account changes.
    </p>
  </div>
</div>`;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "Reset your Parts Map password",
        text,
        html,
      }),
      // A hung email API must not hold the auth request open indefinitely.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(
        `[email] Resend rejected the reset email for ${to}: ${res.status} ${await res.text()}`,
      );
    }
  } catch (err) {
    console.error(`[email] Couldn't send the reset email for ${to}:`, err);
  }
}
