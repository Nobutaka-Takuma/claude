// Every date this app shows or accepts is Japan time.
//
// Not a preference — a correctness requirement. Server components format
// dates on the server, and a Vercel function runs in UTC, so leaving the
// zone implicit meant deadlines rendered nine hours early in production
// while looking correct on a developer's machine in Tokyo. Pinning it
// here also makes the server and the browser agree, which is what stops
// React complaining about mismatched markup.
//
// A user outside Japan sees Japan time rather than their own. For an app
// whose entire interface is Japanese that's the right trade: one clock
// everyone can reason about, so "締切 15:00" means the same thing in every
// conversation about it.
export const APP_TIME_ZONE = "Asia/Tokyo";

export function formatPoints(value: string | number): string {
  return `${Number(value).toLocaleString("ja-JP")}pt`;
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("ja-JP", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeToNow(value: string | Date): string {
  const target = new Date(value).getTime();
  const diffMs = target - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);

  let text: string;
  if (minutes < 60) text = `${Math.max(minutes, 1)}分`;
  else if (hours < 24) text = `${hours}時間`;
  else text = `${days}日`;

  return diffMs >= 0 ? `あと${text}` : `${text}前`;
}

// How far ahead of UTC the app's zone is at a given instant.
function zoneOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return (asIfUtc - at.getTime()) / 60_000;
}

// Turns "2026-08-07T15:00" from <input type="datetime-local"> into the
// instant it names in Japan time.
//
// `new Date(...)` on a string with no zone reads it in the *runtime's*
// zone. Locally that's Japan and everything looked fine; on Vercel it's
// UTC, so a 15:00 deadline was stored as 15:00Z — midnight the next day in
// Tokyo, nine hours later than the person setting it intended. Deadlines
// decide when betting closes and when payouts happen, so this is the half
// of the timezone fix that actually moves money.
export function parseAppLocalDateTime(value: string): Date {
  // Already carries a zone (a trailing Z or ±hh:mm)? Trust it.
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value)) return new Date(value);

  const asIfUtc = Date.parse(`${value}Z`);
  if (Number.isNaN(asIfUtc)) return new Date(NaN);

  // Japan has no daylight saving, so the offset at the provisional instant
  // is the offset at the real one and a single correction is exact.
  return new Date(asIfUtc - zoneOffsetMinutes(new Date(asIfUtc)) * 60_000);
}
