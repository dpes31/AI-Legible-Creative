import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

import { TopNav } from "@/components/layout/TopNav";
import { SideNav } from "@/components/layout/SideNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ORIGIN MVP Suite",
  description: "AI-Legible Creative Validation & Generation Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TopNav />
        <div className="flex bg-[var(--background)]">
          <SideNav />
          <main className="flex-1 min-h-[calc(100vh-4rem)] p-8">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
