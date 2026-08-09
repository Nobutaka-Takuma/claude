import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { rpcErrorResponse } from "@/lib/apiError";
import type { Sponsor } from "@/lib/types";

// POST /api/admin/sponsors — 広告主・代理店・発注者を登録する
const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["advertiser", "agency", "client", "internal"]),
  contact: z.string().trim().max(200).optional(),
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

  const { name, kind, contact, note } = parsed.data;
  try {
    const result = await query<Sponsor>(
      `insert into sponsors (name, kind, contact, note) values ($1, $2, $3, $4) returning *`,
      [name, kind, contact ?? null, note ?? null]
    );
    return NextResponse.json({ ok: true, sponsor: result.rows[0] });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
