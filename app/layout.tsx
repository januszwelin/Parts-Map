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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f7f5f1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-dvh overflow-hidden overscroll-none">{children}</body>
    </html>
  );
}
