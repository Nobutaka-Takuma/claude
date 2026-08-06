"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "ホーム", icon: "🏠" },
  { href: "/news", label: "ニュース", icon: "📰" },
  { href: "/markets", label: "マーケット", icon: "📊" },
  { href: "/tasks", label: "タスク", icon: "✅" },
  { href: "/mypage", label: "マイページ", icon: "👤" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-10 border-t border-line bg-surface/95 backdrop-blur">
      <div className="max-w-3xl mx-auto grid grid-cols-5">
        {ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`text-center text-[11px] py-3 font-medium ${
                active ? "text-accent-ink font-bold" : "text-ink-faint"
              }`}
            >
              <span className="block text-base leading-none mb-0.5">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
