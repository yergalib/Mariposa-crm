import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";
import "./catalog.css";
import "./customers.css";
import "./orders.css";

export const metadata: Metadata = {
  title: "MARIPOSA CRM",
  description: "Internal rental and inventory CRM for MARIPOSA"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
