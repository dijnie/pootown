import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "@/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AppProviders } from "@/components/providers/app-provider";
import { Analytics } from "@vercel/analytics/next";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  preload: true,
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: {
    default: "Poo Town",
    template: "%s | Poo Town",
  },
  description:
    "The First Fully On-Chain Property Tycoon Game on @solana, Powered by @magicblock",
  keywords: ["solana", "monopoly", "blockchain", "web3", "magicblock"],
  authors: [{ name: "Poo Town", url: "https://pootown.vercel.app" }],
  creator: "Poo Town",
  publisher: "Poo Town",
  metadataBase: new URL("https://pootown.vercel.app"),
  alternates: {
    canonical: "https://pootown.vercel.app",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    title:
      "Poo Town - The First Fully On-Chain Property Tycoon Game on @solana, Powered by @magicblock",
    description:
      "The First Fully On-Chain Property Tycoon Game on @solana, Powered by @magicblock",
    url: "https://pootown.vercel.app",
    siteName: "Poo Town",
  },
  twitter: {
    card: "summary_large_image",
    title:
      "Poo Town - The First Fully On-Chain Property Tycoon Game on @solana, Powered by @magicblock",
    description:
      "The First Fully On-Chain Property Tycoon Game on @solana, Powered by @magicblock",
    images: ["https://pootown.vercel.app/preview.png"],
    creator: "@poo_town_",
  },
  // verification: {
  //   google: "your-google-verification-code", // Replace with actual code when available
  //   // yandex: 'your-yandex-verification-code',
  //   // yahoo: 'your-yahoo-verification-code',
  // },
  category: "blockchain",
  classification: "Poo Town",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.className}>
        <AppProviders>{children}</AppProviders>
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
