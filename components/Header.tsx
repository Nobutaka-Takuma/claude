import Link from "next/link";
import type { Profile } from "@/lib/types";
import { formatPoints } from "@/lib/format";
import LogoutButton from "@/components/LogoutButton";

export default function Header({ profile }: { profile: Profile | null }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <Link href="/" className="font-extrabold text-sm tracking-tight shrink-0">
          ⚽ Prediction DAO
        </Link>

        {profile ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="hidden sm:inline text-sm text-ink-muted truncate">
              {profile.username}
            </span>
            <span className="font-mono-num text-xs font-semibold rounded-full bg-accent-soft text-accent-ink px-3 py-1">
              {formatPoints(profile.points_balance)}
            </span>
            {profile.role === "admin" && (
              <Link
                href="/admin"
                className="text-xs font-semibold text-ink-muted border border-line-strong rounded-full px-3 py-1 hover:text-ink"
              >
                管理
              </Link>
            )}
            <LogoutButton />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Link href="/login" className="text-ink-muted hover:text-ink">
              ログイン
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-accent text-white px-3 py-1.5 font-semibold hover:opacity-90"
            >
              新規登録
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
