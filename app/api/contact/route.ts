import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { query } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { rpcErrorResponse } from "@/lib/apiError";
import { CONTACT_CATEGORY_KEYS } from "@/lib/contactCategories";

// POST /api/contact
//
// 未ログインでも送信できる。「ログインできない」が問い合わせ理由の上位に
// 来るのに、送信にログインが要るのでは窓口として成立しない。
//
// そのぶん公開エンドポイントなので、連投の制限は必須。ここが無いと、
// 公開した日のうちに受信箱がスパムで埋まって、本物の問い合わせが埋もれる。
const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  category: z.enum(CONTACT_CATEGORY_KEYS),
  body: z.string().trim().min(10).max(4000),
  // 人間には見えない入力欄。埋まっていたら自動投稿とみなす。CAPTCHAほど
  // 強くはないが、単純なボットはこれで落ちるし、利用者に負担がない。
  //
  // ここで空文字を強制しない（max(0)にしない）のが重要。スキーマで弾くと
  // 「website が不正」という400が返り、ボットにどの欄が罠かを教えてしまう。
  // 素通りさせて、下で静かに捨てる。
  website: z.string().max(500).optional(),
});

const RATE_LIMIT_PER_HOUR = 5;

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", fields: parsed.error.issues.map((i) => String(i.path[0])) },
      { status: 400 }
    );
  }

  // ハニーポットに引っかかった場合、失敗ではなく成功を返す。ボットに
  // 「弾かれた」と教えると回避されるだけなので、静かに捨てる。
  if (parsed.data.website) {
    return NextResponse.json({ ok: true });
  }

  const userId = await getSessionUserId();
  const ipHash = hashIp(req);

  try {
    if (ipHash) {
      const recent = await query<{ count: string }>(
        `select count(*) as count from contact_messages
         where ip_hash = $1 and created_at > now() - interval '1 hour'`,
        [ipHash]
      );
      if (Number(recent.rows[0].count) >= RATE_LIMIT_PER_HOUR) {
        return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
      }
    }

    await query(
      `insert into contact_messages (user_id, name, email, category, body, ip_hash, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        parsed.data.name,
        parsed.data.email,
        parsed.data.category,
        parsed.data.body,
        ipHash,
        req.headers.get("user-agent")?.slice(0, 300) ?? null,
      ]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return rpcErrorResponse(err);
  }
}

// 生のIPは保存しない。連投を止めるのに必要なのは「さっきと同じ相手か」
// だけで、誰かを特定できる形で残す理由がない。SESSION_SECRET を混ぜるので、
// データベースだけを見てもIPには戻せない。
function hashIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  if (!ip) return null;
  const secret = process.env.SESSION_SECRET ?? "";
  return crypto.createHmac("sha256", secret).update(ip).digest("hex");
}
