"use client";

import { useState } from "react";

// A plain GET form so a search is a real, shareable URL and the back
// button works — no client-side state to keep in sync with the server
// component that reads these params.
export default function MarketSearchBox({
  defaultValue,
  hiddenParams,
}: {
  defaultValue: string;
  hiddenParams: Record<string, string | number | null>;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <form action="/markets" method="get" className="flex gap-2">
      {Object.entries(hiddenParams).map(([k, v]) =>
        v === null || v === "" ? null : <input key={k} type="hidden" name={k} value={String(v)} />
      )}
      <input
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="チーム名・リーグ・キーワードで検索"
        className="flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="rounded-lg bg-accent text-white text-xs font-bold px-4"
      >
        検索
      </button>
    </form>
  );
}
