/* ════════════════════════════════════════════════════════════════════
   PRIVACY NOTE — plain, factual, calm
   ════════════════════════════════════════════════════════════════════

   A short, honest statement of what the app does with a person's data.
   These maps are sensitive psychological material, so the note is
   deliberately concrete: it says exactly what is stored, where, and how
   to remove it — no boilerplate, no claims the code doesn't back up.

   A server component (static content only). It owns its own scroll
   because the root layout locks body scrolling for the canvas. Kept in
   sync with the sign-up consent line, which links here. */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Parts Map",
  description: "What Parts Map stores, where, and how to remove it.",
};

export default function PrivacyPage() {
  return (
    <div
      className="h-dvh overflow-y-auto p-4"
      style={{ background: "var(--canvas)" }}
    >
      <article
        className="mx-auto my-8 w-full max-w-xl rounded-2xl p-7"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-rest)",
        }}
      >
        <h1 className="text-lg font-medium" style={{ color: "var(--ink)" }}>
          Privacy
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--ink-soft)" }}>
          A parts map is personal, sometimes tender material. Here is exactly
          what happens to it.
        </p>

        <div
          className="mt-6 flex flex-col gap-5 text-[13px] leading-relaxed"
          style={{ color: "var(--ink-soft)" }}
        >
          <section>
            <h2
              className="text-[13px] font-medium"
              style={{ color: "var(--ink)" }}
            >
              You don&apos;t need an account
            </h2>
            <p className="mt-1">
              The canvas works fully without signing in. Until you save, your
              map lives only in your browser&apos;s memory and is gone when you
              close the tab. You can also save a map to a file on your own
              device and open it again later — that file never touches our
              servers.
            </p>
          </section>

          <section>
            <h2
              className="text-[13px] font-medium"
              style={{ color: "var(--ink)" }}
            >
              What we store if you create an account
            </h2>
            <p className="mt-1">
              Signing in adds the option to save maps to the cloud so you can
              reach them from another device. If you do, we store your email
              address, your maps (the parts you name, where you place them,
              their colors and notes, and the arrows between them), and the
              dates they were created and last edited — in a Postgres database
              run by our hosting provider. We do not sell this data, show ads,
              or share it with third parties beyond the hosting and database
              services needed to run the app.
            </p>
          </section>

          <section>
            <h2
              className="text-[13px] font-medium"
              style={{ color: "var(--ink)" }}
            >
              Getting your data out, or deleting it
            </h2>
            <p className="mt-1">
              You can download any map as a file at any time — that is a
              complete export of everything in it. Deleting your account from
              the account menu removes your account and the maps saved to it.
              Files you saved to your own device are yours to keep or delete.
            </p>
          </section>

          <section>
            <h2
              className="text-[13px] font-medium"
              style={{ color: "var(--ink)" }}
            >
              Questions
            </h2>
            <p className="mt-1">
              If anything here is unclear or you want your data removed and
              can&apos;t reach the account menu, email{" "}
              <a
                href="mailto:janusz@deepmindfulness.io"
                className="underline"
                style={{ color: "var(--ink)" }}
              >
                janusz@deepmindfulness.io
              </a>
              .
            </p>
          </section>
        </div>

        <Link
          href="/sign-in"
          className="mt-7 inline-block text-[12px] underline"
          style={{ color: "var(--ink-faint)" }}
        >
          ← Back
        </Link>
      </article>
    </div>
  );
}
