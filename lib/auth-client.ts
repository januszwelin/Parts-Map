"use client";

/* ════════════════════════════════════════════════════════════════════
   AUTH CLIENT — the only auth import client components may use
   ════════════════════════════════════════════════════════════════════ */
import { createAuthClient } from "better-auth/react";

// No baseURL: the client and the /api/auth routes are always same-origin
// today (no cross-subdomain SSO yet — see lib/auth.ts), so better-auth
// defaults to the page's own origin.
export const authClient = createAuthClient();

// Call methods off `authClient` directly (authClient.signIn.email(...),
// authClient.deleteUser(...)) rather than destructuring them — the hook
// is the one piece safe to pull out on its own.
export const { useSession } = authClient;
