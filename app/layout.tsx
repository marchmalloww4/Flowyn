import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flowyn — Agentic business automation",
  description: "A local-first AI automation platform for brand-aware business workflows.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
