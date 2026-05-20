import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Five Rails — Validation",
  description: "Validation campaign landing pages.",
  // No SEO, no analytics, no third-party junk.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
