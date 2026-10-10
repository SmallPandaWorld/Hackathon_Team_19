import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { TabBar } from "@/src/components/tab-bar";
import { Suspense } from "react";
import { Providers } from "./providers";

// Inter with optical sizing renders large text like Inter Display (VIS's font).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Campus Voyager",
  description: "Explore ETH campus through quests and collect points.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          {/* usePathname() suspends on dynamic routes with cacheComponents */}
          <Suspense fallback={null}>
            <TabBar />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
