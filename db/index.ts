/* ════════════════════════════════════════════════════════════════════
   DB CLIENT — server-only Drizzle instance over Neon's HTTP driver
   ════════════════════════════════════════════════════════════════════

   `neon-http` is stateless (one HTTP request per query, no pooled TCP
   connection to manage) — the right shape for Vercel's serverless route
   handlers, which don't get a long-lived process to hold a connection
   open. Lives in top-level db/, not lib/, so it can never be accidentally
   imported from a "use client" component (lib/ is the pure, client-safe
   zone — see CLAUDE.md's module map). */
import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/* Lazy: constructing the client at module scope means any build-time
   evaluation of a route that imports `db` (e.g. Next.js collecting page
   data) crashes if DATABASE_URL isn't set yet, even for routes never
   actually invoked. Deferring to first use confines the failure to
   requests that really need the database. */
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getDb() {
  if (!_db) {
    _db = drizzle(neon(process.env.DATABASE_URL!), { schema });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
