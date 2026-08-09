// 運営者情報。
//
// すべて環境変数から読む。ここをソースコードに直書きしなかったのは、
// 法務ページで一番危険なのが「それらしい体裁で、中身が嘘」の状態だから。
// サンプルの会社名や住所が入ったまま公開されたプライバシーポリシーは、
// 何も無いより悪い（利用者に対しても、広告審査に対しても）。
//
// 未設定の項目は画面上で「未設定」と赤く出るようにしてあり、埋めないまま
// 公開すれば一目で分かる。
export interface OperatorInfo {
  name: string | null;
  representative: string | null;
  address: string | null;
  contactEmail: string | null;
  serviceName: string;
  siteUrl: string | null;
  established: string | null;
  businessDescription: string | null;
}

export function operatorInfo(): OperatorInfo {
  return {
    name: process.env.OPERATOR_NAME || null,
    representative: process.env.OPERATOR_REPRESENTATIVE || null,
    address: process.env.OPERATOR_ADDRESS || null,
    contactEmail: process.env.OPERATOR_CONTACT_EMAIL || null,
    serviceName: process.env.SERVICE_NAME || "Prediction Market DAO",
    siteUrl: process.env.SITE_URL || null,
    established: process.env.OPERATOR_ESTABLISHED || null,
    businessDescription: process.env.OPERATOR_BUSINESS || null,
  };
}

// 法務ページを公開する前に必ず埋めるべき項目。広告ネットワーク・ASPの
// 審査はこの4つを見る。
const REQUIRED_FIELDS = [
  ["name", "運営者名"],
  ["address", "所在地"],
  ["contactEmail", "連絡先メールアドレス"],
  ["siteUrl", "サイトURL"],
] as const;

export function missingOperatorFields(info: OperatorInfo): string[] {
  return REQUIRED_FIELDS.filter(([key]) => !info[key]).map(([, label]) => label);
}

// 規約・ポリシーの最終改定日。文面を直したらここも更新する。
// 改定日の入っていない規約は、いつ時点のものか誰にも分からない。
export const POLICY_REVISED_AT = "2026年8月9日";

// 18歳未満の扱い。予測市場に見た目が近いサービスなので、ここは運営の
// 判断で厳しくできるようにしてある（既定は保護者の同意を条件に許可）。
export const MINIMUM_AGE = () => {
  const raw = process.env.MINIMUM_AGE;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 13;
};
export const PARENTAL_CONSENT_AGE = () => {
  const raw = process.env.PARENTAL_CONSENT_AGE;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 18;
};
