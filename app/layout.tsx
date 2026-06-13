import type { Metadata } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ErrorReporter } from "@/components/error-reporter";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Optimum People Hub",
  description: "Staff-operations suite for Optimum Swim School & Optimum Fit",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${nunito.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-screen bg-background text-foreground font-sans">
        <ErrorReporter />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
