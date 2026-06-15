import type { Metadata, Viewport } from "next";
import {
  JetBrains_Mono,
  Space_Grotesk,
  VT323,
  DM_Serif_Display,
} from "next/font/google";
import "./globals.css";

// Mono is the default body face — the whole system reads like a logbook.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

// Space Grotesk: giant uppercase display headlines only.
const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

// VT323: pixel/CRT face for terminal strips and counters.
const pixel = VT323({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
});

// DM Serif Display: rare italic editorial accents.
const serif = DM_Serif_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "LISTSER",
  description: "One shared list. Nothing forgotten.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LISTSER",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EEEEEE" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
  width: "device-width",
  initialScale: 1,
  // Prevents the iOS zoom-on-input-focus jump; inputs use 16px+ text anyway.
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${mono.variable} ${display.variable} ${pixel.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
