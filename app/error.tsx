"use client";

// Route-level fallback. A page that reads a table or column the database
// doesn't have yet throws during rendering, and Next's default screen
// shows a stack trace with no hint about what to do — which is how a
// skipped `npm run migrate` turns into "the app is broken".
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const looksLikeSchemaMismatch = /does not exist|relation .* does not exist/i.test(error.message);

  return (
    <div className="rounded-xl border border-neg/40 bg-neg/5 p-4 space-y-3">
      <h1 className="text-sm font-bold text-neg">画面を表示できませんでした</h1>

      {looksLikeSchemaMismatch ? (
        <p className="text-xs text-ink-muted">
          データベースがアプリの更新に追いついていない可能性があります。アプリを止めて{" "}
          <code className="font-mono-num">npm run migrate</code> を実行してから、もう一度お試しください。
        </p>
      ) : (
        <p className="text-xs text-ink-muted">
          一時的なエラーの可能性があります。再読み込みしても直らない場合は、下のエラー内容をお知らせください。
        </p>
      )}

      <p className="text-[11px] text-ink-faint font-mono-num break-all">{error.message}</p>

      <button
        type="button"
        onClick={reset}
        className="text-xs font-semibold border border-line-strong rounded-full px-3 py-1.5"
      >
        再読み込み
      </button>
    </div>
  );
}
