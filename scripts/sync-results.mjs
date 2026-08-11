// 終了した試合の結果を取得し、マーケットの結果として報告する。
//
// 本体は scripts/sports-api/syncResults.mjs にあり、/api/cron/tick と
// 管理画面のボタンも同じものを呼ぶ（CLIと画面で挙動がずれないように）。
//
// 報告された結果はすぐには確定しない。人が報告するときと同じ
// Optimistic Oracle の異議申し立て期間を通り、期限までに異議がなければ
// finalize_expired_markets が精算する。
//
// Run with: npm run sync-results
//           npm run sync-results -- --allow-mock   （モックのスコアを許可）
import pg from "pg";
import { syncResults } from "./sports-api/syncResults.mjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const allowMock = process.argv.includes("--allow-mock");

  const r = await syncResults(pool, { log: (line) => console.log(line), allowMock });

  if (r.checked === 0) {
    console.log(
      "対象がありません。キックオフ時刻を過ぎたマーケット（status 'locked'）だけが対象です。" +
        "まだ自動生成のマーケットがなければ、先に npm run sync-fixtures を実行してください。"
    );
  }

  console.log(
    `完了: ${r.submitted}件を報告、${r.stillPending}件は試合がまだ終わっていません` +
      (r.failed > 0 ? `、${r.failed}件は取得に失敗` : "") +
      `。報告した結果は${r.disputeWindowMinutes}分の異議申し立て期間のあと精算されます。`
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
