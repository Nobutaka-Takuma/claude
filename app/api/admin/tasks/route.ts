import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { rpcErrorResponse } from "@/lib/apiError";
import { parseAppLocalDateTime } from "@/lib/format";
import type { Task } from "@/lib/types";

// POST /api/admin/tasks — 案件にぶら下がるタスクを1件作る
//
// これがマイクロワークを増やす唯一の入口。新しい種類の仕事を出すのに
// コードを書く必要はなく、提出フォームの項目は config.fields に JSON で
// 書く（lib/workKinds.ts に雛形がある）。

const fieldSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z0-9_]+$/, "field id must be alphanumeric"),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "textarea", "url", "number", "select", "checkbox"]),
  options: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  required: z.boolean().optional(),
  help: z.string().trim().max(300).optional(),
  placeholder: z.string().trim().max(120).optional(),
});

const bodySchema = z.object({
  campaignId: z.string().uuid().nullable().optional(),
  type: z.enum(["ad_view", "survey", "micro_work"]),
  workKind: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  rewardPoints: z.number().int().min(1).max(1_000_000),
  verificationMode: z.enum(["auto", "review", "quorum", "none"]),
  quorumSize: z.number().int().min(1).max(20).optional(),
  reviewRewardPoints: z.number().int().min(0).max(10_000).optional(),
  cooldownMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
  maxCompletionsPerUser: z.number().int().min(1).max(10_000).nullable().optional(),
  maxCompletionsTotal: z.number().int().min(1).max(1_000_000).nullable().optional(),
  revenuePerCompletionYen: z.number().min(0).max(1_000_000).nullable().optional(),
  instructions: z.string().trim().max(2000).optional(),
  referenceUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  fields: z.array(fieldSchema).max(20).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", fields: parsed.error.issues.map((i) => String(i.path[0])) },
      { status: 400 }
    );
  }

  const d = parsed.data;

  // A quorum task with no reviewer reward never fills its quorum: nobody
  // is paid to look, so every submission sits pending forever and the
  // workers conclude the app doesn't pay. Refuse it rather than let an
  // operator discover it a week later.
  if (d.verificationMode === "quorum" && !(d.reviewRewardPoints && d.reviewRewardPoints > 0)) {
    return NextResponse.json(
      {
        error: "invalid_input",
        fields: ["reviewRewardPoints"],
        detail: "相互チェックを選んだ場合は、チェック1件あたりの報酬を1pt以上に設定してください。",
      },
      { status: 400 }
    );
  }

  // Duplicate field ids silently overwrite each other in the submitted
  // answers object, so the reviewer sees one answer where two were given.
  const fields = d.fields ?? [];
  const ids = new Set(fields.map((f) => f.id));
  if (ids.size !== fields.length) {
    return NextResponse.json({ error: "invalid_input", fields: ["fields"] }, { status: 400 });
  }
  for (const f of fields) {
    if (f.type === "select" && (!f.options || f.options.length < 2)) {
      return NextResponse.json({ error: "invalid_input", fields: ["fields"] }, { status: 400 });
    }
  }
  if (d.type === "micro_work" && fields.length === 0) {
    return NextResponse.json({ error: "invalid_input", fields: ["fields"] }, { status: 400 });
  }

  const startsAt = d.startsAt ? parseAppLocalDateTime(d.startsAt) : null;
  const endsAt = d.endsAt ? parseAppLocalDateTime(d.endsAt) : null;
  if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) {
    return NextResponse.json({ error: "invalid_input", fields: ["startsAt"] }, { status: 400 });
  }

  const config = {
    instructions: d.instructions ?? null,
    reference_url: d.referenceUrl || null,
    fields,
  };

  try {
    const result = await query<Task>(
      `insert into tasks (
         campaign_id, type, work_kind, title, description, reward_points, provider, config,
         verification_mode, quorum_size, review_reward_points, cooldown_minutes,
         max_completions_per_user, max_completions_total, revenue_per_completion_yen,
         starts_at, ends_at
       ) values ($1, $2, $3, $4, $5, $6, 'internal', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       returning *`,
      [
        d.campaignId ?? null,
        d.type,
        d.workKind ?? null,
        d.title,
        d.description ?? null,
        d.rewardPoints,
        JSON.stringify(config),
        d.verificationMode,
        d.quorumSize ?? 3,
        d.reviewRewardPoints ?? 0,
        d.cooldownMinutes ?? null,
        d.maxCompletionsPerUser ?? null,
        d.maxCompletionsTotal ?? null,
        d.revenuePerCompletionYen ?? null,
        startsAt,
        endsAt,
      ]
    );
    return NextResponse.json({ ok: true, task: result.rows[0] });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
