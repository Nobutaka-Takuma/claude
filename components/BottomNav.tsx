"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/news", label: "ニュース" },
  { href: "/", label: "ホーム" },
  { href: "/tasks", label: "タスク" },
  { href: "/markets", label: "マーケット" },
  { href: "/mypage", label: "マイページ" },
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
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
