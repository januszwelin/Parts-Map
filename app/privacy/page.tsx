/* ════════════════════════════════════════════════════════════════════
   PRIVACY NOTE — plain, factual, calm
   ════════════════════════════════════════════════════════════════════

   A short, honest statement of what the app does with a person's data.
   These maps are sensitive psychological material, so the note is
   deliberately concrete: it says exactly what is stored, where, and how
   to remove it — no boilerplate, no claims the code doesn't back up.

   A server component (static content only) — the only motion is the CSS
   vignette emblem, reduced-motion-gated by the .welcome-* rules in
   globals.css, so nothing here needs "use client". It owns its own
   scroll because the root layout locks body scrolling for the canvas.
   Wears the same face as the sign-in page (brand mark + living vignette),
   and the copy stays in sync with the sign-up consent line that links
   here — change one, change both. */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Parts Map",
  description: "What Parts Map stores, where, and how to remove it.",
};

export default function PrivacyPage() {
  return (
    <div className="h-dvh overflow-y-auto" style={{ background: "var(--canvas)" }}>
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-5 py-12 sm:py-16">
        <article className="fade-in">
          {/* ————— calm thematic header ————— */}
          <header className="flex flex-col items-center text-center">
            <Vignette />
            <span
              className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em]"
              style={{ color: "var(--ink-faint)" }}
            >
              Parts Map
            </span>
            <h1 className="mt-3 text-2xl font-medium" style={{ color: "var(--ink)" }}>
              Privacy
            </h1>
            <p
              className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed"
              style={{ color: "var(--ink-soft)" }}
            >
              A parts map is personal, sometimes tender material. Here is exactly
              what happens to it.
            </p>
          </header>

          {/* ————— sections, one calm card ————— */}
          <div
            className="mt-9 overflow-hidden rounded-3xl"
            style={{
              background: "var(--panel-solid)",
              border: "1px solid var(--line)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <Section icon={<BrowserIcon />} title="You don't need an account">
              The canvas works fully without signing in. Until you save, your map
              lives only in your browser&apos;s memory and is gone when you close
              the tab. You can also save a map to a file on your own device and
              open it again later — that file never touches our servers.
            </Section>

            <Section icon={<ArchiveIcon />} title="What we store if you create an account">
              Signing in adds the option to save maps to the cloud so you can
              reach them from another device. If you do, we store your email
              address, your maps (the parts you name, where you place them, their
              colors and notes, and the arrows between them), and the dates they
              were created and last edited — in a Postgres database run by our
              hosting provider. We do not sell this data, show ads, or share it
              with third parties beyond the hosting and database services needed
              to run the app.
            </Section>

            <Section icon={<ExportIcon />} title="Getting your data out, or deleting it">
              You can download any map as a file at any time — that is a complete
              export of everything in it. Deleting your account from the account
              menu removes your account and the maps saved to it. Files you saved
              to your own device are yours to keep or delete.
            </Section>

            <Section icon={<MailIcon />} title="Questions" last>
              If anything here is unclear or you want your data removed and
              can&apos;t reach the account menu, email{" "}
              <a
                href="mailto:janusz@deepmindfulness.io"
                className="underline underline-offset-2"
                style={{ color: "var(--ink)" }}
              >
                janusz@deepmindfulness.io
              </a>
              .
            </Section>
          </div>

          <Link
            href="/"
            className="mt-8 block text-center text-[12px] underline underline-offset-2"
            style={{ color: "var(--ink-faint)" }}
          >
            ← Back to the map
          </Link>
        </article>
      </div>
    </div>
  );
}

/* ——— one section: a sage-tinted icon chip beside the text, softly
   divided from the next ——— */
function Section({
  icon,
  title,
  children,
  last,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section
      className="flex gap-4 p-6 sm:px-7"
      style={last ? undefined : { borderBottom: "1px solid var(--line)" }}
    >
      <span
        aria-hidden
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in srgb, var(--accent) 14%, transparent)",
          color: "var(--accent-strong)",
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium" style={{ color: "var(--ink)" }}>
          {title}
        </h2>
        <p
          className="mt-1.5 text-[13px] leading-relaxed"
          style={{ color: "var(--ink-soft)" }}
        >
          {children}
        </p>
      </div>
    </section>
  );
}

/* ——— the app's living emblem: a part settles onto the body ———
   Same picture as the welcome modal and the sign-in hero (dot glides in,
   rests on the chest with a soft ring); static under reduced motion,
   gated by the .welcome-* rules in globals.css. Ties the privacy note
   into the same quiet world as the canvas — "here is how we hold the
   map of you." */
function Vignette() {
  return (
    <svg aria-hidden width="112" height="86" viewBox="0 0 132 100" fill="none">
      <circle cx="66" cy="24" r="13" stroke="var(--line)" strokeWidth="2" />
      <path
        d="M32 94c2.5-23 16-36 34-36s31.5 13 34 36"
        stroke="var(--line)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        className="welcome-ripple"
        cx="66"
        cy="72"
        r="9"
        stroke="var(--accent)"
        strokeWidth="1.5"
        opacity="0"
      />
      <circle className="welcome-dot" cx="66" cy="72" r="6" fill="var(--accent)" />
    </svg>
  );
}

/* ——— section icons: one quiet outline family, sage ——— */
function BrowserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="6.75" r="0.6" fill="currentColor" />
      <circle cx="8.2" cy="6.75" r="0.6" fill="currentColor" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 8.5v9.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M10 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5v10M8.5 10 12 13.5 15.5 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 16.5V18a2.5 2.5 0 0 0 2.5 2.5h10A2.5 2.5 0 0 0 19.5 18v-1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="m4 7.5 7.1 5a1.5 1.5 0 0 0 1.8 0l7.1-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
