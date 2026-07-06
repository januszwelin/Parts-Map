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

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    deleteUser: {
      enabled: true,
    },
  },
  // Cross-subdomain SSO (per the handoff checklist's "one identity across
  // the whole DMC suite") is a later-phase decision, not v1 — enable this
  // once a second tool shares the same auth provider:
  // advanced: { crossSubDomainCookies: { enabled: true, domain: ".yourdomain.com" } },
});
