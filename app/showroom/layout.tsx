import localFont from "next/font/local";
import type { ReactNode } from "react";

const headingFont = localFont({
  src: "./fonts/CormorantGaramond.ttf",
  weight: "500",
  style: "normal",
  display: "swap",
  variable: "--font-showroom-heading",
  fallback: ["Georgia", "serif"],
});

const bodyFont = localFont({
  src: "./fonts/Onest.ttf",
  weight: "400 500",
  style: "normal",
  display: "swap",
  variable: "--font-showroom-body",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export default function ShowroomLayout({ children }: { children: ReactNode }) {
  return <div className={`${headingFont.variable} ${bodyFont.variable}`}>{children}</div>;
}
