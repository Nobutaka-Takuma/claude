import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { rpcErrorResponse } from "@/lib/apiError";

// PATCH /api/contact/:messageId — 対応状況の更新
const bodySchema = z.object({
  status: z.enum(["new", "in_progress", "closed"]),
  note: z.string().max(1000).optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<"/api/contact/[messageId]">) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { messageId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", fields: ["status"] }, { status: 400 });
  }

  try {
    const result = await query(
      `update contact_messages
         set status = $1,
             handler_note = coalesce($2, handler_note),
             handled_by = $3,
             handled_at = now()
       where id = $4
       returning id`,
      [parsed.data.status, parsed.data.note ?? null, guard.profile.id, messageId]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "message_not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}
