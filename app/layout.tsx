import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leads Comercial",
  description: "Importação e gestão de leads comerciais"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
