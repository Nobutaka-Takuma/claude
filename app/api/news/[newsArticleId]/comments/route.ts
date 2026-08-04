import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { query } from "@/lib/db";

const bodySchema = z.object({
  body: z.string().min(1).max(2000),
});

export async function POST(req: Request, ctx: RouteContext<"/api/news/[newsArticleId]/comments">) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { newsArticleId } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const articleExists = await query("select 1 from news_articles where id = $1", [newsArticleId]);
  if (!articleExists.rowCount) {
    return NextResponse.json({ error: "article_not_found" }, { status: 404 });
  }

  const result = await query(
    "insert into comments (news_article_id, user_id, body) values ($1, $2, $3) returning id",
    [newsArticleId, userId, parsed.data.body]
  );

  return NextResponse.json({ ok: true, id: result.rows[0].id });
}
