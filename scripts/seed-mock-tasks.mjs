// 動作確認用のモックタスクを投入する。
//
//   npm run seed-mock-tasks            投入する（既にあれば作り直す）
//   npm run seed-mock-tasks -- --remove 投入したものを消す
//
// 実装済みのタスク経路をひととおり触れるように、4種類を入れる:
//   1. 動画広告（自動承認）   … ポップアップ3秒 → 即ポイント付与
//   2. アンケート（自動承認） … 回答 → 即ポイント付与
//   3. マイクロワーク（相互チェック）… 提出 → 他の人が2人OK → 付与
//   4. マイクロワーク（運営検収）    … 提出 → /admin/work で承認 → 付与
//
// タイトルはすべて「[デモ]」で始める。以前、モックの試合データが本番に
// 混ざって実在しない試合のマーケットができたことがあり、モックは見た目で
// 判別できないと本物として扱われてしまう。--remove で消せるように、判定は
// この接頭辞1つに寄せてある。
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const DEMO_PREFIX = "[デモ]";
const SPONSOR_NAME = `${DEMO_PREFIX} サンプル広告主`;
const CAMPAIGN_CODE = "demo-mock-campaign";

// 実績のあるタスクは消さずに停止する。
//
// 誰かが提出して報酬が付いたタスクを行ごと消すと、台帳のエントリだけが
// 残り、それがどのタスクの報酬だったのかを辿れなくなる。残高は動いたのに
// 理由が消えている状態は、あとから不正を検証できないということで、
// /api/admin/tasks が削除ではなく停止にしているのと同じ理由。
async function remove() {
  const tasks = await pool.query(
    `select t.id, t.title,
            (select count(*) from task_completions tc where tc.task_id = t.id) as completions
     from tasks t where t.title like $1`,
    [`${DEMO_PREFIX}%`]
  );

  const used = tasks.rows.filter((r) => Number(r.completions) > 0);
  const unused = tasks.rows.filter((r) => Number(r.completions) === 0);

  if (unused.length > 0) {
    await pool.query(
      "delete from tasks where id = any($1::uuid[])",
      [unused.map((r) => r.id)]
    );
  }
  if (used.length > 0) {
    await pool.query(
      "update tasks set is_active = false where id = any($1::uuid[])",
      [used.map((r) => r.id)]
    );
  }

  // 案件とスポンサーも、実績が紐づいていれば残して終了扱いにする。
  const campaignUsed = await pool.query(
    `select count(*) as count from task_completions
     where campaign_id in (select id from campaigns where code = $1)`,
    [CAMPAIGN_CODE]
  );

  if (Number(campaignUsed.rows[0].count) > 0) {
    await pool.query("update campaigns set status = 'finished' where code = $1", [CAMPAIGN_CODE]);
    await pool.query("update sponsors set is_active = false where name = $1", [SPONSOR_NAME]);
  } else {
    await pool.query(
      "delete from campaign_payments where campaign_id in (select id from campaigns where code = $1)",
      [CAMPAIGN_CODE]
    );
    await pool.query("delete from campaigns where code = $1", [CAMPAIGN_CODE]);
    await pool.query("delete from sponsors where name = $1", [SPONSOR_NAME]);
  }

  console.log(`削除: ${unused.length}件（未使用）／停止: ${used.length}件（提出実績あり）`);
  if (used.length > 0) {
    console.log("  実績のあるタスクは、台帳から報酬の出どころを辿れるように残してあります。");
    console.log("  タスクセンターには表示されません。");
  }
}

// 何度実行しても同じ状態になるようにする。--remove で実績のあるタスクを
// 残す以上、次の実行が「同じタイトルの2つ目」を作ってしまうと、タスク
// センターに同じものが並ぶことになる。
async function ensureSponsor() {
  const existing = await pool.query("select id from sponsors where name = $1", [SPONSOR_NAME]);
  if (existing.rows[0]) {
    await pool.query("update sponsors set is_active = true where id = $1", [existing.rows[0].id]);
    return existing.rows[0];
  }
  return (
    await pool.query(
      `insert into sponsors (name, kind, note)
       values ($1, 'advertiser', '動作確認用のダミー。本番では削除してください。')
       returning id`,
      [SPONSOR_NAME]
    )
  ).rows[0];
}

async function ensureCampaign(sponsorId) {
  const existing = await pool.query("select id from campaigns where code = $1", [CAMPAIGN_CODE]);
  if (existing.rows[0]) {
    await pool.query("update campaigns set status = 'active' where id = $1", [existing.rows[0].id]);
    return existing.rows[0];
  }
  return (
    await pool.query(
      `insert into campaigns (sponsor_id, code, title, status,
         revenue_per_completion_yen, budget_yen, max_completions, point_value_yen, note)
       values ($1, $2, $3, 'active', 100, 100000, 1000, 1.0,
         '動作確認用のダミー案件。実際の入金はありません。')
       returning id`,
      [sponsorId, CAMPAIGN_CODE, `${DEMO_PREFIX} 動作確認用キャンペーン`]
    )
  ).rows[0];
}

async function seed() {
  // 案件に紐づけておくと、/admin/work の採算表にも数字が出る。
  // タスクを触ったときに何が起きるかを、経済側まで通して確認できる。
  const sponsor = await ensureSponsor();
  const campaign = await ensureCampaign(sponsor.id);

  const surveyConfig = {
    questions: [
      { id: "q1", label: "このアプリを何で知りましたか？", options: ["紹介", "SNS", "検索", "その他"] },
      { id: "q2", label: "よく見るスポーツは？", options: ["サッカー", "野球", "バスケ", "見ない"] },
    ],
    required_question_ids: ["q1", "q2"],
  };

  const labelingConfig = {
    instructions:
      "下のリンクの記事を読み、内容がどのジャンルに当てはまるかを選んでください。判断に迷った場合は理由も書いてください。",
    reference_url: "https://www3.nhk.or.jp/news/",
    fields: [
      {
        id: "genre",
        label: "ジャンル",
        type: "select",
        options: ["政治", "経済", "スポーツ", "エンタメ", "国際", "その他"],
        required: true,
      },
      { id: "headline", label: "見出しを書き写してください", type: "text", required: true },
      { id: "note", label: "判断に迷った点（任意）", type: "textarea" },
    ],
  };

  const reviewConfig = {
    instructions:
      "このアプリを使ってみて、分かりにくかった画面と、その理由を具体的に書いてください。運営が内容を確認してからポイントを付与します。",
    fields: [
      { id: "screen", label: "分かりにくかった画面", type: "text", required: true },
      { id: "reason", label: "どこがどう分かりにくかったか", type: "textarea", required: true },
      { id: "device", label: "使用した端末", type: "select", options: ["スマホ", "PC", "タブレット"], required: true },
    ],
  };

  const rows = [
    {
      type: "ad_view",
      work_kind: "ad_view",
      title: `${DEMO_PREFIX} 動画広告を見る（3秒）`,
      description: "サンプル広告が3秒間表示されます。再生が終わるとポイントが付与されます。",
      reward_points: 10,
      verification_mode: "auto",
      max_per_user: 20,
      cooldown: null,
      config: {},
    },
    {
      type: "survey",
      work_kind: "survey",
      title: `${DEMO_PREFIX} アンケートに答える`,
      description: "2問だけの簡単なアンケートです。回答するとすぐポイントが付与されます。",
      reward_points: 50,
      verification_mode: "auto",
      max_per_user: 1,
      cooldown: null,
      config: surveyConfig,
    },
    {
      type: "micro_work",
      work_kind: "data_labeling",
      title: `${DEMO_PREFIX} ニュースをジャンル分けする`,
      description:
        "提出したあと、他の参加者2名が内容を確認してOKを出すとポイントが付与されます。相互チェックの流れを確認できます。",
      reward_points: 30,
      verification_mode: "quorum",
      max_per_user: 3,
      cooldown: null,
      config: labelingConfig,
    },
    {
      type: "micro_work",
      work_kind: "content_check",
      title: `${DEMO_PREFIX} 使いにくかった画面を報告する`,
      description:
        "提出したあと、運営が内容を確認してからポイントが付与されます。運営検収の流れを確認できます。",
      reward_points: 80,
      verification_mode: "review",
      max_per_user: 2,
      cooldown: null,
      config: reviewConfig,
    },
  ];

  for (const r of rows) {
    const params = [
      campaign.id,
      r.type,
      r.work_kind,
      r.title,
      r.description,
      r.reward_points,
      JSON.stringify(r.config),
      r.verification_mode,
      r.cooldown,
      r.max_per_user,
    ];

    const existing = await pool.query("select id from tasks where title = $1", [r.title]);
    if (existing.rows[0]) {
      await pool.query(
        // title ($4) はマッチに使った値と同じだが、参照しないと Postgres が
        // その引数の型を決められずエラーになるので、そのまま代入しておく。
        `update tasks set
           campaign_id = $1, type = $2, work_kind = $3, title = $4, description = $5,
           reward_points = $6, config = $7, verification_mode = $8,
           quorum_size = 2, review_reward_points = 2, cooldown_minutes = $9,
           max_completions_per_user = $10, is_active = true
         where id = $11`,
        [...params, existing.rows[0].id]
      );
      console.log(`  ↻ ${r.title}（${r.reward_points}pt / ${r.verification_mode}）`);
      continue;
    }

    await pool.query(
      `insert into tasks (
         campaign_id, type, work_kind, title, description, reward_points, provider, config,
         verification_mode, quorum_size, review_reward_points, cooldown_minutes,
         max_completions_per_user
       ) values ($1, $2, $3, $4, $5, $6, 'local_demo', $7, $8, 2, 2, $9, $10)`,
      params
    );
    console.log(`  ✓ ${r.title}（${r.reward_points}pt / ${r.verification_mode}）`);
  }

  console.log(`\nタスク ${rows.length}件を投入しました。/tasks で確認できます。`);
  console.log("採算は /admin/work（1件あたり100円の受取という想定のダミー案件）。");
  console.log(`\n消すときは: npm run seed-mock-tasks -- --remove`);
}

async function main() {
  const removeOnly = process.argv.includes("--remove");

  await remove();
  if (removeOnly) return;

  console.log("\nモックタスクを投入します...");
  await seed();
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
