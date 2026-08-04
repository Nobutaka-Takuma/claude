import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { proposeMarket, rpcErrorStatus, RpcError } from "@/lib/rpc";

const bodySchema = z.object({
  title: z.string().min(3).max(120),
  homeTeam: z.string().min(1).max(60),
  awayTeam: z.string().min(1).max(60),
  kickoffTime: z.string().min(1),
  description: z.string().max(2000).optional(),
  category: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const market = await proposeMarket(
      userId,
      parsed.data.title,
      parsed.data.homeTeam,
      parsed.data.awayTeam,
      new Date(parsed.data.kickoffTime).toISOString(),
      parsed.data.description ?? null,
      parsed.data.category ?? "soccer"
    );
    return NextResponse.json({ ok: true, market });
  } catch (err) {
    if (err instanceof RpcError) {
      return NextResponse.json({ error: err.message }, { status: rpcErrorStatus(err.message) });
    }
    throw err;
  }
}
