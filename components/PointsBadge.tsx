"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPoints } from "@/lib/format";

// The header sits in the root layout, which Next reuses across
// client-side navigations rather than re-rendering — so a balance passed
// down from the server keeps showing whatever it was when the layout
// first rendered, long after bets and payouts have moved it.
//
// Re-fetching on every navigation is the cheapest fix that stays correct:
// one small request per page change, and the number matches what the page
// itself is showing.
export default function PointsBadge({ initialBalance }: { initialBalance: number }) {
  const pathname = usePathname();
  const [balance, setBalance] = useState(initialBalance);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !body?.profile) return;
        setBalance(body.profile.points_balance);
      })
      .catch(() => {
        // Keep showing the last known value: a blank badge would be worse
        // than a slightly stale one.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <span className="font-mono-num text-xs font-semibold rounded-full bg-accent-soft text-accent-ink px-3 py-1">
      {formatPoints(balance)}
    </span>
  );
}
