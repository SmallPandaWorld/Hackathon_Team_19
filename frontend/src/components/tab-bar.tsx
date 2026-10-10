"use client";

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

export function TabBar() {
  const pathname = usePathname();

  return (
    // z-index above Leaflet's map panes and controls (up to 1000).
    <nav className="fixed inset-x-0 bottom-0 z-[1100] border-t border-outline-variant bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${
                  active
                    ? "text-on-surface"
                    : "text-muted hover:text-on-surface"
                }`}
                href={tab.href}
              >
                {active && (
                  <span className="absolute inset-x-6 top-0 h-[3px] rounded-b-sm bg-primary" />
                )}
                <Icon
                  aria-hidden
                  className="h-5 w-5"
                  strokeWidth={active ? 2.5 : 2}
                />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
