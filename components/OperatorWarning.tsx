import { missingOperatorFields, operatorInfo } from "@/lib/operator";

// 運営者情報が未設定のまま法務ページが公開されるのを防ぐための警告。
//
// 体裁だけ整った、中身の空のプライバシーポリシーは何も無いより悪い。
// 利用者を欺くことになるし、広告審査でもそこを見られる。埋まっていない
// 項目があるうちは、ページの一番上でそう言う。
export default function OperatorWarning() {
  const missing = missingOperatorFields(operatorInfo());
  if (missing.length === 0) return null;

  return (
    <div className="rounded-xl border border-neg bg-neg/10 p-3 space-y-1">
      <p className="text-xs font-bold text-neg">⚠️ このページは公開できる状態ではありません</p>
      <p className="text-[11px] text-ink-muted">
        次の項目が未設定です: <span className="font-bold">{missing.join(" / ")}</span>
      </p>
      <p className="text-[11px] text-ink-muted">
        環境変数（本番なら Vercel の Environment Variables）に <code>OPERATOR_NAME</code>,{" "}
        <code>OPERATOR_ADDRESS</code>, <code>OPERATOR_CONTACT_EMAIL</code>, <code>SITE_URL</code>{" "}
        を設定してください。詳しくは <code>.env.example</code> を参照。
      </p>
    </div>
  );
}
