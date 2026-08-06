// Recognises a scheduler calling in without a session.
//
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` and only ever
// issues GET requests, which is why the scheduled endpoints accept GET at
// all. NEWS_SYNC_SECRET stays supported for anything else (a GitHub
// Action, curl from a laptop) that would rather send its own header.
export function isScheduledCaller(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${cronSecret}`) return true;
  }

  const syncSecret = process.env.NEWS_SYNC_SECRET;
  if (syncSecret) {
    const presented = req.headers.get("x-news-sync-secret");
    if (presented === syncSecret) return true;
  }

  return false;
}
