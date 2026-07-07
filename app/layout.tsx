import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Parts Map",
  description: "A spatial canvas for IFS parts work",
  applicationName: "Parts Map",
  // Icons themselves come from the app/icon.tsx and app/apple-icon.tsx
  // metadata-file conventions (and app/manifest.ts for the PWA manifest)
  // — Next injects those <link> tags on its own, nothing to list here.
  appleWebApp: {
    capable: true,
    title: "Parts Map",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Deliberately NOT locking maximumScale / userScalable: disabling browser
  // pinch-zoom is a WCAG 1.4.4 failure for low-vision users. React Flow owns
  // pinch *inside the canvas* on its own, so the page-level gesture can stay
  // available for the chrome and text without fighting the canvas.
  viewportFit: "cover",
  themeColor: "#f7f5f1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning on <html>/<body>: browser extensions (and
    // some mobile in-app browsers) inject attributes/classes onto these
    // top-level elements before React hydrates — e.g. a `vc-init` class on
    // <body> — which React would otherwise report as a hydration mismatch
    // in the console. It suppresses only these two elements' own
    // attributes (one level deep), not their subtree, so real mismatches
    // inside the app still surface. This is the Next.js-recommended fix for
    // extension-caused top-level mismatches.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="h-dvh overflow-hidden overscroll-none"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
