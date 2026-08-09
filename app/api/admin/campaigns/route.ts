import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { rpcErrorResponse } from "@/lib/apiError";
import { parseAppLocalDateTime } from "@/lib/format";
import { POINT_VALUE_YEN } from "@/lib/config";
import type { Campaign } from "@/lib/types";

// POST /api/admin/campaigns — 1件の案件（商談）を登録する
//
// budget_yen と max_completions は任意だが、片方も入れずに案件を走らせる
// と、受注額を超えて作業させてもアプリは止めない。フォーム側で強く勧める。
const bodySchema = z.object({
  sponsorId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "code must be lowercase letters, digits, - or _"),
  title: z.string().trim().min(1).max(160),
  revenuePerCompletionYen: z.number().min(0).max(1_000_000).default(0),
  fixedFeeYen: z.number().min(0).max(100_000_000).default(0),
  budgetYen: z.number().min(0).max(100_000_000).nullable().optional(),
  maxCompletions: z.number().int().min(1).max(1_000_000).nullable().optional(),
  pointValueYen: z.number().min(0).max(1000).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  note: z.string().trim().max(1000).optional(),
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
  // datetime-local carries no timezone, so it has to be read as Japan time
  // rather than whatever zone the server happens to run in (Vercel: UTC).
  const startsAt = d.startsAt ? parseAppLocalDateTime(d.startsAt) : null;
  const endsAt = d.endsAt ? parseAppLocalDateTime(d.endsAt) : null;
  if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) {
    return NextResponse.json({ error: "invalid_input", fields: ["startsAt"] }, { status: 400 });
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    return NextResponse.json({ error: "invalid_input", fields: ["endsAt"] }, { status: 400 });
  }

  try {
    const result = await query<Campaign>(
      `insert into campaigns (
         sponsor_id, code, title, status,
         revenue_per_completion_yen, fixed_fee_yen, budget_yen, max_completions,
         point_value_yen, starts_at, ends_at, note
       ) values ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10, $11)
       returning *`,
      [
        d.sponsorId,
        d.code,
        d.title,
        d.revenuePerCompletionYen,
        d.fixedFeeYen,
        d.budgetYen ?? null,
        d.maxCompletions ?? null,
        d.pointValueYen ?? POINT_VALUE_YEN(),
        startsAt,
        endsAt,
        d.note ?? null,
      ]
    );
    return NextResponse.json({ ok: true, campaign: result.rows[0] });
  } catch (err) {
    if (err instanceof Error && err.message.includes("campaigns_code_key")) {
      return NextResponse.json({ error: "duplicate_code" }, { status: 409 });
    }
    return rpcErrorResponse(err);
  }
}
