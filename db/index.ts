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

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
