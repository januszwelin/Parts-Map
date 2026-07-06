import { NextResponse, type NextRequest } from "next/server";

/* ════════════════════════════════════════════════════════════════════
   PROXY — per-request Content Security Policy nonce
   ════════════════════════════════════════════════════════════════════

   (Next 16 renamed the old "middleware" convention to "proxy"; same idea —
   run before the request completes and set response headers.)

   Shipped as *Report-Only* first: the browser reports violations to the
   console but blocks nothing, so a stray inline script can't white-screen
   the app. Once the console is clean in prod, flip REPORT_ONLY to false to
   enforce. `frame-ancestors 'none'` is the real clickjacking control (the
   static X-Frame-Options in next.config.ts backs it up for old browsers).

   style-src keeps 'unsafe-inline' on purpose: the canvas leans on React
   inline `style={{}}` attributes everywhere, which a nonce can't cover.
   script-src uses a nonce + 'strict-dynamic' so Next's own bootstrap
   scripts run while arbitrary injected scripts don't. */
const REPORT_ONLY = true;

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join("; ");

  // Next reads the nonce off the request's CSP header and stamps its own
  // <script> tags with it — so this must be set even in report-only mode.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(
    REPORT_ONLY ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    csp,
  );
  return response;
}

export const config = {
  // Skip API routes and static assets; don't run on prefetches.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
