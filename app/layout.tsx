import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Analytics } from "@vercel/analytics/next";
import { BackgroundGlow } from "@/components/background-glow";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tryeve.abhivarde.in"),
  title: {
    default: "tryeve, describe an agent, get a working one",
    template: "%s · tryeve",
  },
  description:
    "a free, browser based tool that builds, tests, and runs a real eve agent from a plain english description. no install, no terminal.",
  keywords: ["eve", "ai agent builder", "vercel sandbox", "agent generator"],
  authors: [{ name: "abhi varde", url: "https://abhivarde.in" }],
  openGraph: {
    title: "tryeve, describe an agent, get a working one",
    description:
      "a free, browser based tool that builds, tests, and runs a real eve agent from a plain english description. no install, no terminal.",
    url: "https://tryeve.abhivarde.in",
    siteName: "tryeve",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "tryeve, describe an agent, get a working one",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "tryeve, describe an agent, get a working one",
    description:
      "a free, browser based tool that builds, tests, and runs a real eve agent from a plain english description. no install, no terminal.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col bg-background text-foreground"
        style={{ fontFamily: "var(--font-geist-sans)" }}
      >
        <TooltipProvider>
          <BackgroundGlow />
          {children}
          <Toaster />
        </TooltipProvider>
        <Analytics />
      </body>
    </html>
  );
}
