import localFont from "next/font/local";
import type { ReactNode } from "react";

const headingFont = localFont({
  src: "./fonts/Manrope.ttf",
  weight: "200 800",
  style: "normal",
  display: "swap",
  variable: "--font-showroom-heading",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export default function ShowroomLayout({ children }: { children: ReactNode }) {
  return <div className={headingFont.variable}>{children}</div>;
}
