"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage, fieldErrorMessage, readErrorBody } from "@/lib/errorMessages";
import {
  VERIFICATION_MODE_HELP,
  VERIFICATION_MODE_LABELS,
  WORK_FORM_TEMPLATES,
  WORK_KIND_LABELS,
} from "@/lib/workKinds";
import type { Campaign, Sponsor, WorkFormField } from "@/lib/types";

// 案件まわりの入力をひとまとめにしたパネル。
//
// スポンサー → 案件 → タスクの順にしか作れないので、3つを別ページに分ける
// と「次にどこへ行くのか」が毎回わからなくなる。1画面に順番どおり並べて
// あるのはそのため。
export default function WorkAdminPanel({
  sponsors,
  campaigns,
  defaults,
}: {
  sponsors: Sponsor[];
  campaigns: Campaign[];
  defaults: { pointValueYen: number; quorum: number; peerReviewReward: number; payoutRatioBps: number };
}) {
  const [tab, setTab] = useState<"task" | "campaign" | "sponsor">("task");

  return (
    <section className="rounded-xl border border-line bg-surface p-4 space-y-4">
      <div>
        <h2 className="text-sm font-bold">💼 案件とタスクの管理</h2>
        <p className="text-[11px] text-ink-faint mt-1">
          スポンサー（広告主・代理店・発注者）を登録し、その下に案件を作り、案件にタスクをぶら下げます。
          タスクの報酬ポイントは案件の受取額から出すので、先に案件を作ってください。
        </p>
      </div>

      <div className="flex gap-1 text-[11px] font-semibold">
        {(
          [
            ["task", "タスクを作る"],
            ["campaign", "案件を作る"],
            ["sponsor", "スポンサー登録"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-lg border ${
              tab === key ? "bg-accent text-white border-accent" : "border-line-strong text-ink-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "sponsor" && <SponsorForm />}
      {tab === "campaign" && <CampaignForm sponsors={sponsors} defaults={defaults} />}
      {tab === "task" && <TaskForm campaigns={campaigns} defaults={defaults} />}
    </section>
  );
}

function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function post(url: string, body: unknown, successText: string, method = "POST") {
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const parsed = await readErrorBody(res);
      setError(
        fieldErrorMessage(parsed.fields) ??
          apiErrorMessage(parsed.error, "登録できませんでした。", parsed.detail)
      );
      setBusy(false);
      return false;
    }
    setOk(successText);
    setBusy(false);
    router.refresh();
    return true;
  }

  return { busy, error, ok, post };
}

const inputClass = "w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs";
const labelClass = "block text-[11px] font-semibold mb-1";

function Feedback({ error, ok }: { error: string | null; ok: string | null }) {
  return (
    <>
      {error && <p className="text-[11px] text-neg">{error}</p>}
      {ok && <p className="text-[11px] text-accent-ink">{ok}</p>}
    </>
  );
}

function SponsorForm() {
  const { busy, error, ok, post } = useSubmit();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("advertiser");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");

  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const done = await post(
          "/api/admin/sponsors",
          { name, kind, contact: contact || undefined, note: note || undefined },
          "スポンサーを登録しました。"
        );
        if (done) {
          setName("");
          setContact("");
          setNote("");
        }
      }}
    >
      <div>
        <label className={labelClass} htmlFor="sponsor-name">
          名称
        </label>
        <input
          id="sponsor-name"
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="株式会社◯◯"
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="sponsor-kind">
          種別
        </label>
        <select id="sponsor-kind" className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="advertiser">広告主（直接取引）</option>
          <option value="agency">代理店・ASP</option>
          <option value="client">業務委託の発注者</option>
          <option value="internal">運営自身（原資なし）</option>
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor="sponsor-contact">
          連絡先（任意）
        </label>
        <input
          id="sponsor-contact"
          className={inputClass}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="担当者名 / メール"
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="sponsor-note">
          メモ（任意）
        </label>
        <textarea
          id="sponsor-note"
          rows={2}
          className={inputClass}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <Feedback error={error} ok={ok} />
      <button
        type="submit"
        disabled={busy}
        className="w-full text-xs font-semibold text-white bg-accent rounded-lg px-3 py-2 disabled:opacity-40"
      >
        {busy ? "登録中…" : "スポンサーを登録"}
      </button>
    </form>
  );
}

function CampaignForm({
  sponsors,
  defaults,
}: {
  sponsors: Sponsor[];
  defaults: { pointValueYen: number };
}) {
  const { busy, error, ok, post } = useSubmit();
  const [sponsorId, setSponsorId] = useState("");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [revenuePer, setRevenuePer] = useState("0");
  const [fixedFee, setFixedFee] = useState("0");
  const [budget, setBudget] = useState("");
  const [maxCompletions, setMaxCompletions] = useState("");
  const [pointValue, setPointValue] = useState(String(defaults.pointValueYen));
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  if (sponsors.length === 0) {
    return (
      <p className="text-[11px] text-ink-faint">
        先に「スポンサー登録」タブでスポンサーを1件登録してください。
      </p>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const done = await post(
          "/api/admin/campaigns",
          {
            sponsorId,
            code,
            title,
            revenuePerCompletionYen: Number(revenuePer) || 0,
            fixedFeeYen: Number(fixedFee) || 0,
            budgetYen: budget === "" ? null : Number(budget),
            maxCompletions: maxCompletions === "" ? null : Number(maxCompletions),
            pointValueYen: Number(pointValue) || defaults.pointValueYen,
            startsAt: startsAt || undefined,
            endsAt: endsAt || undefined,
          },
          "案件を作成しました。下の一覧から「稼働」にすると受付が始まります。"
        );
        if (done) {
          setCode("");
          setTitle("");
        }
      }}
    >
      <div>
        <label className={labelClass} htmlFor="campaign-sponsor">
          スポンサー
        </label>
        <select
          id="campaign-sponsor"
          className={inputClass}
          value={sponsorId}
          onChange={(e) => setSponsorId(e.target.value)}
          required
        >
          <option value="">選択してください</option>
          {sponsors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor="campaign-code">
            案件コード
          </label>
          <input
            id="campaign-code"
            className={inputClass}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="autumn-cpa-2026"
            pattern="[a-z0-9][a-z0-9_-]*"
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="campaign-title">
            案件名
          </label>
          <input
            id="campaign-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor="campaign-revenue">
            1件あたりの受取額（円）
          </label>
          <input
            id="campaign-revenue"
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            value={revenuePer}
            onChange={(e) => setRevenuePer(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="campaign-fixed">
            固定額（円）
          </label>
          <input
            id="campaign-fixed"
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            value={fixedFee}
            onChange={(e) => setFixedFee(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor="campaign-budget">
            予算上限（円・任意）
          </label>
          <input
            id="campaign-budget"
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="無制限"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="campaign-max">
            受付件数の上限（任意）
          </label>
          <input
            id="campaign-max"
            type="number"
            min={1}
            className={inputClass}
            value={maxCompletions}
            onChange={(e) => setMaxCompletions(e.target.value)}
            placeholder="無制限"
          />
        </div>
      </div>
      <p className="text-[11px] text-ink-faint">
        予算上限も件数上限も入れないと、受注額を超えて作業させても止まりません。どちらかは入れてください。
      </p>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelClass} htmlFor="campaign-pv">
            1ptの円換算
          </label>
          <input
            id="campaign-pv"
            type="number"
            min={0}
            step="0.0001"
            className={inputClass}
            value={pointValue}
            onChange={(e) => setPointValue(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="campaign-start">
            開始（任意）
          </label>
          <input
            id="campaign-start"
            type="datetime-local"
            className={inputClass}
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="campaign-end">
            終了（任意）
          </label>
          <input
            id="campaign-end"
            type="datetime-local"
            className={inputClass}
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
      </div>

      <Feedback error={error} ok={ok} />
      <button
        type="submit"
        disabled={busy}
        className="w-full text-xs font-semibold text-white bg-accent rounded-lg px-3 py-2 disabled:opacity-40"
      >
        {busy ? "作成中…" : "案件を作成"}
      </button>
    </form>
  );
}

function TaskForm({
  campaigns,
  defaults,
}: {
  campaigns: Campaign[];
  defaults: { quorum: number; peerReviewReward: number; payoutRatioBps: number };
}) {
  const { busy, error, ok, post } = useSubmit();
  const [campaignId, setCampaignId] = useState("");
  const [type, setType] = useState<"micro_work" | "survey" | "ad_view">("micro_work");
  const [workKind, setWorkKind] = useState("data_labeling");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rewardPoints, setRewardPoints] = useState("30");
  const [verificationMode, setVerificationMode] = useState("quorum");
  const [quorumSize, setQuorumSize] = useState(String(defaults.quorum));
  const [reviewReward, setReviewReward] = useState(String(defaults.peerReviewReward));
  const [cooldown, setCooldown] = useState("");
  const [perUser, setPerUser] = useState("1");
  const [total, setTotal] = useState("");
  const [formJson, setFormJson] = useState(WORK_FORM_TEMPLATES.data_labeling);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const campaign = campaigns.find((c) => c.id === campaignId);
  const perCompletionYen = campaign ? Number(campaign.revenue_per_completion_yen) : 0;
  const pointValueYen = campaign ? Number(campaign.point_value_yen) : 1;
  const suggestedReward =
    perCompletionYen > 0 && pointValueYen > 0
      ? Math.floor((perCompletionYen * (defaults.payoutRatioBps / 10000)) / pointValueYen)
      : null;

  // チェック側の報酬も原価。相互チェックなら quorum_size 人分が上乗せに
  // なるので、1件あたりの本当の原価はここで出しておかないと逆ざやになる。
  const totalCostYen =
    (Number(rewardPoints || 0) +
      (verificationMode === "quorum" ? Number(reviewReward || 0) * Number(quorumSize || 0) : 0)) *
    pointValueYen;

  function applyTemplate(kind: string) {
    setWorkKind(kind);
    if (WORK_FORM_TEMPLATES[kind]) setFormJson(WORK_FORM_TEMPLATES[kind]);
  }

  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setJsonError(null);

        let parsedForm: { instructions?: string; reference_url?: string; fields?: WorkFormField[] } = {};
        if (type === "micro_work") {
          try {
            parsedForm = JSON.parse(formJson);
          } catch {
            setJsonError("提出フォームのJSONが壊れています。テンプレートを選び直してください。");
            return;
          }
        }

        const done = await post(
          "/api/admin/tasks",
          {
            campaignId: campaignId || null,
            type,
            workKind: type === "micro_work" ? workKind : type,
            title,
            description: description || undefined,
            rewardPoints: Number(rewardPoints) || 1,
            verificationMode,
            quorumSize: Number(quorumSize) || defaults.quorum,
            reviewRewardPoints: Number(reviewReward) || 0,
            cooldownMinutes: cooldown === "" ? null : Number(cooldown),
            maxCompletionsPerUser: perUser === "" ? null : Number(perUser),
            maxCompletionsTotal: total === "" ? null : Number(total),
            instructions: parsedForm.instructions || undefined,
            referenceUrl: parsedForm.reference_url || undefined,
            fields: parsedForm.fields ?? [],
          },
          "タスクを作成しました。タスクセンターに表示されます。"
        );
        if (done) setTitle("");
      }}
    >
      <div>
        <label className={labelClass} htmlFor="task-campaign">
          案件
        </label>
        <select
          id="task-campaign"
          className={inputClass}
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
        >
          <option value="">案件なし（原資のない運営タスク）</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}（1件 {Number(c.revenue_per_completion_yen).toLocaleString()}円 / {c.status}）
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor="task-type">
            タスクの形式
          </label>
          <select
            id="task-type"
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="micro_work">マイクロワーク（自由なフォーム）</option>
            <option value="survey">アンケート</option>
            <option value="ad_view">広告視聴</option>
          </select>
        </div>
        {type === "micro_work" && (
          <div>
            <label className={labelClass} htmlFor="task-kind">
              仕事の種類
            </label>
            <select
              id="task-kind"
              className={inputClass}
              value={workKind}
              onChange={(e) => applyTemplate(e.target.value)}
            >
              {Object.entries(WORK_KIND_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className={labelClass} htmlFor="task-title">
          タイトル
        </label>
        <input
          id="task-title"
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="商品画像をカテゴリに分類する"
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="task-desc">
          説明（任意）
        </label>
        <textarea
          id="task-desc"
          rows={2}
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="task-verify">
          検収方法
        </label>
        <select
          id="task-verify"
          className={inputClass}
          value={verificationMode}
          onChange={(e) => setVerificationMode(e.target.value)}
        >
          {Object.entries(VERIFICATION_MODE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-ink-faint mt-1">{VERIFICATION_MODE_HELP[verificationMode]}</p>
        {type === "micro_work" && (verificationMode === "auto" || verificationMode === "none") && (
          <p className="text-[11px] text-neg mt-1">
            ⚠️ 人が作る成果物を検収なしで支払うと、内容が空でもポイントが出ます。相互チェックか運営検収を選んでください。
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelClass} htmlFor="task-reward">
            報酬（pt）
          </label>
          <input
            id="task-reward"
            type="number"
            min={1}
            className={inputClass}
            value={rewardPoints}
            onChange={(e) => setRewardPoints(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="task-quorum">
            必要チェック数
          </label>
          <input
            id="task-quorum"
            type="number"
            min={1}
            max={20}
            className={inputClass}
            value={quorumSize}
            onChange={(e) => setQuorumSize(e.target.value)}
            disabled={verificationMode !== "quorum"}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="task-review-reward">
            チェック報酬（pt）
          </label>
          <input
            id="task-review-reward"
            type="number"
            min={0}
            className={inputClass}
            value={reviewReward}
            onChange={(e) => setReviewReward(e.target.value)}
            disabled={verificationMode !== "quorum"}
          />
        </div>
      </div>

      {campaign && (
        <div className="rounded-lg bg-surface-2 p-2 text-[11px] space-y-0.5">
          <p>
            受取 <span className="font-mono-num">{perCompletionYen.toLocaleString()}円</span> / 1件
            {suggestedReward !== null && (
              <>
                {" "}・ 目安の報酬{" "}
                <span className="font-mono-num font-bold">{suggestedReward.toLocaleString()}pt</span>
                （受取の{defaults.payoutRatioBps / 100}%）
              </>
            )}
          </p>
          <p className={totalCostYen > perCompletionYen ? "text-neg font-bold" : "text-ink-muted"}>
            この設定の原価 <span className="font-mono-num">{totalCostYen.toLocaleString()}円</span> / 1件
            {verificationMode === "quorum" && "（チェック報酬を含む）"}
            {totalCostYen > perCompletionYen && " ← 受取額を超えています（逆ざや）"}
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelClass} htmlFor="task-per-user">
            1人あたり上限
          </label>
          <input
            id="task-per-user"
            type="number"
            min={1}
            className={inputClass}
            value={perUser}
            onChange={(e) => setPerUser(e.target.value)}
            placeholder="無制限"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="task-total">
            全体の募集件数
          </label>
          <input
            id="task-total"
            type="number"
            min={1}
            className={inputClass}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="無制限"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="task-cooldown">
            再実行の間隔（分）
          </label>
          <input
            id="task-cooldown"
            type="number"
            min={0}
            className={inputClass}
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value)}
            placeholder="なし"
          />
        </div>
      </div>

      {type === "micro_work" && (
        <div>
          <label className={labelClass} htmlFor="task-form">
            提出フォーム（JSON）
          </label>
          <textarea
            id="task-form"
            rows={10}
            className={`${inputClass} font-mono-num`}
            value={formJson}
            onChange={(e) => setFormJson(e.target.value)}
          />
          <p className="text-[11px] text-ink-faint mt-1">
            fields の type は text / textarea / url / number / select / checkbox が使えます。
            select には options を指定してください。
          </p>
          {jsonError && <p className="text-[11px] text-neg">{jsonError}</p>}
        </div>
      )}

      <Feedback error={error} ok={ok} />
      <button
        type="submit"
        disabled={busy}
        className="w-full text-xs font-semibold text-white bg-accent rounded-lg px-3 py-2 disabled:opacity-40"
      >
        {busy ? "作成中…" : "タスクを作成"}
      </button>
    </form>
  );
}
