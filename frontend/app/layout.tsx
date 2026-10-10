import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { TabBar } from "@/src/components/tab-bar";
import { UserRail } from "@/src/components/user-rail";
import { Suspense } from "react";
import { Providers } from "./providers";
import { THEME_COLORS, THEME_SCRIPT } from "@/src/lib/theme-script";

// Inter with optical sizing renders large text like Inter Display.
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

// Browser UI colour follows the surface; useTheme() updates it when the
// player picks a theme in the app.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      // The inline theme script sets data-theme and color-scheme before React
      // hydrates.
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved light/dark/system theme before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          {/* usePathname() suspends on dynamic routes with cacheComponents */}
          <Suspense fallback={null}>
            <TabBar />
            <div className="fixed right-6 top-6 z-[1100] hidden w-72 lg:block">
              <UserRail />
            </div>
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
