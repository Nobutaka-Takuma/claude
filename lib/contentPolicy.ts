// A last line of defence at creation time.
//
// The community report vote is the real moderation mechanism, but it is
// reactive: a market that shouldn't exist is live, and being bet on,
// until three people notice. For the small set of subjects where even
// brief exposure is the harm — betting on whether a named person dies,
// on a terrorist attack happening, on a suicide — waiting for a vote is
// the wrong design.
//
// This list is deliberately short and blunt. It is not a content filter
// and cannot be one: it matches surface strings, so it will miss anything
// phrased carefully and will occasionally catch something innocent (a
// question about a character dying in a TV series, say). Both failure
// modes are acceptable because the report vote sits behind it — this only
// has to stop the obvious case from ever being published, and it tells
// the creator how to reach a human when it is wrong.
export interface ContentViolation {
  category: string;
  message: string;
}

interface Rule {
  category: string;
  patterns: RegExp[];
  message: string;
}

const RULES: Rule[] = [
  {
    category: "violence",
    patterns: [/死亡/, /死去/, /亡くなる/, /逝去/, /死ぬ/, /事故死/, /余命/, /殺害/, /殺人/, /殺す/],
    message:
      "人の死亡・死傷を予想の対象にすることはできません。ガイドラインの「危害・暴力」をご確認ください。",
  },
  {
    category: "violence",
    patterns: [/自殺/, /自死/, /心中/],
    message: "自傷・自殺に関する内容は扱えません。",
  },
  {
    category: "violence",
    patterns: [/テロ/, /爆破/, /暗殺/, /襲撃/, /銃撃/],
    message:
      "事件・攻撃の発生を予想の対象にすることはできません。予想が動機になりうるためです。",
  },
  {
    category: "minor",
    patterns: [/児童ポルノ/, /小児性愛/],
    message: "未成年の性的搾取に関する内容は扱えません。",
  },
];

// Checked against the title and description together: splitting the
// subject across the two fields is the first thing anyone would try.
export function checkMarketContent(
  title: string,
  description?: string | null
): ContentViolation | null {
  const text = `${title} ${description ?? ""}`;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { category: rule.category, message: rule.message };
    }
  }
  return null;
}
