"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Quests", icon: "🧭" },
  { href: "/map", label: "Map", icon: "🗺️" },
  { href: "/leaderboard", label: "Ranking", icon: "🏆" },
  { href: "/profile", label: "Profile", icon: "👤" },
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
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${
                  active
                    ? "text-indigo-600"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                href={tab.href}
              >
                <span aria-hidden className="text-lg leading-none">
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
