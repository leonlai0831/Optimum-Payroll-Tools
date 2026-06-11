import type { Metadata } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Optimum People Hub",
  description: "Allowance & KPI bonus calculators for Optimum Swim School",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${nunito.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen bg-background text-foreground font-sans">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
