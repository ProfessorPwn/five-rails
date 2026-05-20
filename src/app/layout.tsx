import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import NotificationCenter from "@/components/NotificationCenter";
import { ToastProvider } from "@/components/ui/Toast";
// AutomationScheduler removed — replaced by the server-side watchdog-daemon
// heartbeat (scripts/watchdog-daemon.ts). Running the scheduler in every
// browser tab fired redundant heartbeats and contributed to dev-server saturation.
import CommandPalette from "@/components/CommandPalette";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Five Rails — AI Business Incubator",
  description: "AI-powered business incubator platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="font-sans bg-[#0a0c14] text-[#e2e8f0] min-h-screen antialiased noise-overlay" suppressHydrationWarning>
        <ToastProvider>
          <CommandPalette />
          <div className="flex min-h-screen">
            <Suspense><Sidebar /></Suspense>
            <div className="flex-1 ml-64 flex flex-col">
              {/* Top bar with notification center */}
              <header className="flex items-center justify-end px-8 py-3 border-b border-[#1e293b]/30">
                <Suspense><NotificationCenter /></Suspense>
              </header>
              <main className="flex-1 p-8 overflow-y-auto">{children}</main>
            </div>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
