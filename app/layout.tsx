import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Analytics } from "@vercel/analytics/next";
import { BackgroundGlow } from "@/components/background-glow";
import { BotIdClient } from "botid/client";
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
    "Agent Runtime for eve, tested against a live eve runtime, then deployed as a live app to your own GitHub and Vercel.",
  keywords: [
    "eve",
    "ai agent builder",
    "vercel sandbox",
    "agent generator",
    "durable workflow",
    "eve runtime",
    "ai agent generator",
    "no code agent builder",
    "deploy ai agent to vercel",
    "deploy ai agent to github",
  ],
  authors: [{ name: "abhi varde", url: "https://abhivarde.in" }],
  alternates: {
    canonical: "https://tryeve.abhivarde.in",
  },
  openGraph: {
    title: "tryeve, describe an agent, get a working one",
    description:
      "Agent Runtime for eve, tested against a live eve runtime, ready to talk before you ever see it.",
    url: "https://tryeve.abhivarde.in",
    siteName: "tryeve",
    type: "website",
    locale: "en_US",
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
    site: "@varde_abhi",
    creator: "@varde_abhi",
    title: "tryeve, describe an agent, get a working one",
    description:
      "Agent Runtime for eve, tested against a live eve runtime, ready to talk before you ever see it.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "tryeve",
  url: "https://tryeve.abhivarde.in",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "Agent Runtime for eve, tested against a live eve runtime, ready to talk before you ever see it.",
  author: {
    "@type": "Person",
    name: "abhi varde",
    url: "https://abhivarde.in",
  },
};

const protectedRoutes = [{ path: "/api/build-agent", method: "POST" }];

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
      <head>
        <BotIdClient protect={protectedRoutes} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
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
