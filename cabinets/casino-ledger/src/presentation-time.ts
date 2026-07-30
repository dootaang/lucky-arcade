export const CASINO_DISPLAY_TIME_ZONE = "Asia/Seoul";

const KST_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: CASINO_DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const KST_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: CASINO_DISPLAY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatCasinoKstTimestamp(utcSecond: number): string {
  if (!Number.isSafeInteger(utcSecond)) throw new Error("npc_ledger_invalid_display_time");
  const parts = Object.fromEntries(
    KST_TIMESTAMP_FORMATTER.formatToParts(new Date(utcSecond * 1_000)).map((part) => [part.type, part.value]),
  );
  return `${parts.year}. ${parts.month}. ${parts.day}. ${parts.hour}:${parts.minute} KST`;
}

export function formatCasinoKstTime(utcSecond: number): string {
  if (!Number.isSafeInteger(utcSecond)) throw new Error("npc_ledger_invalid_display_time");
  return `${KST_TIME_FORMATTER.format(new Date(utcSecond * 1_000))} KST`;
}
