/* ════════════════════════════════════════════════════════════════════
   AUTH — server-only BetterAuth config
   ════════════════════════════════════════════════════════════════════

   Email + password only for v1 (per the client's call — no Google/magic
   link yet). Auth is optional throughout the app: signing in adds cloud
   maps, but file save/load keeps working with no account at all (see
   the handoff checklist's privacy note — these maps are sensitive, so
   nothing about the canvas itself should ever require an account). */
import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

/* The session secret signs cookies and CSRF tokens. Without it better-auth
   falls back to an insecure dev default — fine locally, catastrophic in
   production, and silent either way. Fail the build/boot loudly instead of
   shipping unsigned sessions. */
if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET is required in production (set it in the deployment env).",
  );
}

const baseURL = process.env.BETTER_AUTH_URL;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  // Seeds origin checking for CSRF. Explicit, rather than relying on the
  // env var being picked up implicitly.
  ...(baseURL ? { baseURL, trustedOrigins: [baseURL] } : {}),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    deleteUser: {
      enabled: true,
    },
  },
  /* Cross-instance rate limiting. The in-memory default is per-serverless-
     instance and ephemeral, so it barely slows credential stuffing on
     Vercel — persist counters in the DB instead. Enabled in production by
     default (better-auth's own gate); the sign-in/sign-up rules are the
     brute-force chokepoints.

     NOTE: storage:"database" adds a `rateLimit` table (see db/schema.ts) —
     the migration in drizzle/ MUST be applied before deploying this. */
  rateLimit: {
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 3600, max: 10 },
    },
  },
  // Cross-subdomain SSO (per the handoff checklist's "one identity across
  // the whole DMC suite") is a later-phase decision, not v1 — enable this
  // once a second tool shares the same auth provider:
  // advanced: { crossSubDomainCookies: { enabled: true, domain: ".yourdomain.com" } },
});
