"use client";

import { CampusMotif } from "@/src/components/campus-motif";
import { ThemeSwitch } from "@/src/components/theme-switch";
import { Compass, Map, Trophy, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Quests", icon: Compass },
  { href: "/map", label: "Map", icon: Map },
  { href: "/leaderboard", label: "Ranking", icon: Trophy },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return (
      pathname === "/" ||
      pathname.startsWith("/quests") ||
      pathname.startsWith("/join")
    );
  }
  return pathname.startsWith(href);
}

// Bottom tab bar on mobile, fixed left sidebar (14rem) from `lg:` up.
export function TabBar() {
  const pathname = usePathname();

  return (
    // z-index above Leaflet's map panes and controls (up to 1000).
    <nav className="fixed inset-x-0 bottom-0 z-[1100] border-t border-outline-variant bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:inset-x-auto lg:inset-y-0 lg:left-0 lg:flex lg:w-56 lg:flex-col lg:border-r lg:border-t-0 lg:bg-surface lg:pb-0 lg:backdrop-blur-none dark:lg:bg-surface-variant">
      <Link
        className="hidden rounded-2xl px-6 pb-6 pt-8 lg:block"
        href="/"
      >
        <span className="block text-xs font-semibold uppercase tracking-wider text-link">
          VISCON 2026
        </span>
        <span className="mt-1 block text-xl font-bold leading-tight tracking-tight text-on-surface">
          Campus Voyager
        </span>
        <CampusMotif className="mt-4 h-12 w-full text-outline" />
      </Link>
      <ul className="mx-auto grid max-w-2xl grid-cols-4 lg:mx-0 lg:flex lg:max-w-none lg:flex-col lg:gap-1 lg:px-3">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-xs font-semibold transition lg:flex-row lg:gap-3 lg:rounded-xl lg:px-4 lg:py-2.5 lg:text-[15px] ${
                  active
                    ? "text-on-surface lg:bg-surface-variant dark:lg:bg-surface-container"
                    : "text-muted hover:text-on-surface lg:hover:bg-surface-variant dark:lg:hover:bg-surface-container"
                }`}
                href={tab.href}
              >
                {active && (
                  <span className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-primary lg:inset-x-auto lg:inset-y-2 lg:left-0 lg:h-auto lg:w-1 lg:rounded-full" />
                )}
                <Icon
                  aria-hidden
                  className={`h-5 w-5 ${active ? "lg:text-on-surface" : ""}`}
                  strokeWidth={active ? 2.5 : 2}
                />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto hidden flex-col gap-2 border-t border-outline-variant px-6 py-5 lg:flex">
        <span className="text-xs font-semibold text-muted">Theme</span>
        <ThemeSwitch compact />
      </div>
    </nav>
  );
}
