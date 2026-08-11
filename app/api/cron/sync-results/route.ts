import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { pool } from "@/lib/db";
import { isScheduledCaller } from "@/lib/cronAuth";
import { syncResults } from "@/scripts/sports-api/syncResults.mjs";

// POST /api/cron/sync-results
//
// 終了した試合の結果を取り込む。日次のcron（/api/cron/tick）でも走るので、
// こちらは「今すぐ確認したい」ときの手動実行用。管理画面のボタンが呼ぶ。
//
// 取り込んだ結果はすぐ確定にはならず、異議申し立て期間を経て精算される。
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isScheduledCaller(req)) {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (profile.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await syncResults(pool, { log: (line) => console.log(line) });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("result sync failed", err);
    return NextResponse.json(
      { error: "sync_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
