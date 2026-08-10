import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kavro CRM",
  description: "CRM conversacional para equipes comerciais"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

