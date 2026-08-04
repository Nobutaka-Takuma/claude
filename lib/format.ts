export function formatPoints(value: string | number): string {
  return `${Number(value).toLocaleString("ja-JP")}pt`;
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("ja-JP", {
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
