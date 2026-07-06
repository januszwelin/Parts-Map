import type { NextConfig } from "next";

/* Static security headers applied to every route. These are the ones that
   can't break the app; the Content-Security-Policy is issued separately
   (per-request, with a nonce) from middleware.ts. */
const securityHeaders = [
  // Clickjacking: the sign-in form and delete-account control must never be
  // framed. frame-ancestors in the CSP is the modern control; this is the
  // belt-and-suspenders header for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Sensitive psychological tool — don't leak URLs to anywhere.
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
