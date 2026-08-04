// Drives the golden path end-to-end against a running dev server: signup,
// complete both task types, place a bet, check my page and the treasury
// dashboard. Not a CI test suite — a quick manual smoke check with
// screenshots to eyeball after making changes.
//
// Usage: npm run dev -- -p 3100  (in one terminal)
//        node scripts/smoke-test.mjs  (in another)
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHOTS_DIR = fileURLToPath(new URL("./shots/", import.meta.url));
mkdirSync(SHOTS_DIR, { recursive: true });

// Some sandboxed dev containers pre-install a Chromium build that doesn't
// match this project's pinned Playwright version's expected download path;
// fall back to it explicitly when present instead of trying to fetch one.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  headless: true,
  executablePath: existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined,
});
const page = await browser.newPage();
const base = process.env.SMOKE_TEST_BASE_URL ?? "http://127.0.0.1:3100";
const shot = (n) => page.screenshot({ path: `${SHOTS_DIR}${n}.png`, fullPage: true });
const log = (...a) => console.log(...a);
const rand = () => Math.random().toString(36).slice(2, 8);

const suffix = rand();
const email = `demo-${suffix}@example.com`;
const username = `demo_${suffix}`;

// 1. signup
await page.goto(`${base}/signup`);
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', "password123");
await page.fill("input:not([type])", username);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/auth/signup")),
  page.click('button[type="submit"]'),
]);
await page.waitForURL(base + "/");
log("1. signup ok ->", username, email);
await shot("01-home");

// 2. ad task
await page.goto(`${base}/tasks`);
await shot("02-tasks");
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/complete") && r.request().method() === "POST"),
  page.click("text=視聴する"),
]);
await page.waitForTimeout(500);
log("2. ad task completed");
await shot("03-tasks-after-ad");

// 3. survey task
await page.click("text=回答する");
await page.waitForTimeout(200);
const radios = await page.locator("input[type=radio]").all();
const seen = new Set();
for (const r of radios) {
  const name = await r.getAttribute("name");
  if (!seen.has(name)) {
    await r.click({ force: true });
    seen.add(name);
  }
}
await shot("04-survey-filled");
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/complete") && r.request().method() === "POST"),
  page.click("text=回答を送信"),
]);
await page.waitForTimeout(500);
log("3. survey completed, header:", (await page.locator("header").innerText()).replace(/\n/g, " | "));
await shot("05-after-survey");

// 4. markets list + detail + bet
await page.goto(`${base}/markets`);
await shot("06-markets");
await page.click('a:has-text("浦和レッズ")');
await page.waitForTimeout(300);
await shot("07-market-detail");
const marketId = page.url().split("/").pop();

await page.fill("input[type=number]", "20");
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/bet") && r.request().method() === "POST"),
  page.click("text=ベットを確定する"),
]);
await page.waitForTimeout(500);
log("4. bet placed on", marketId);
await shot("08-after-bet");
log("   header after bet:", (await page.locator("header").innerText()).replace(/\n/g, " | "));

// 5. mypage
await page.goto(`${base}/mypage`);
await shot("09-mypage-bets");
await page.click("text=ポイント履歴");
await page.waitForTimeout(300);
await shot("10-mypage-points");

// 6. treasury (public dashboard)
await page.goto(`${base}/treasury`);
await shot("11-treasury");

console.log(JSON.stringify({ marketId, username, email }));
await browser.close();
log("DONE (part 1)");
