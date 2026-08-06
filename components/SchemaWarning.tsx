import { getPendingMigrations } from "@/lib/schemaCheck";

// Shown on every page while the database is behind the code. Without it,
// a skipped `npm run migrate` only shows up as individual buttons failing
// with messages that don't point at the cause.
export default async function SchemaWarning() {
  const pending = await getPendingMigrations();
  if (pending.length === 0) return null;

  return (
    <div className="bg-neg/10 border-b border-neg/30 px-4 py-2 text-center">
      <p className="text-[11px] text-neg font-semibold max-w-3xl mx-auto">
        ⚠ データベースがアプリの更新に追いついていません（未適用のマイグレーション {pending.length}
        件）。アプリを止めて <code className="font-mono-num">npm run migrate</code>{" "}
        を実行してください。実行するまで一部の機能が失敗します。
      </p>
      <p className="text-[10px] text-ink-faint mt-0.5">未適用: {pending.join(", ")}</p>
    </div>
  );
}
