export const CASINO_TIME_ZONE = "Asia/Seoul";
export const CASINO_UTC_OFFSET_SECONDS = 9 * 3_600;
export const CASINO_SECONDS_PER_DAY = 86_400;
export const CASINO_MINUTES_PER_DAY = 1_440;

/**
 * Casino calendar day number in KST. Instants remain Unix seconds so stored
 * transactions stay unambiguous and interoperable.
 */
export function casinoKstDayAtUtcSecond(utcSecond: number): number {
  assertSafeInteger(utcSecond, "casino_time_invalid_second");
  return Math.floor((utcSecond + CASINO_UTC_OFFSET_SECONDS) / CASINO_SECONDS_PER_DAY);
}

export function casinoKstDayAtUtcMinute(utcMinute: number): number {
  assertSafeInteger(utcMinute, "casino_time_invalid_minute");
  return Math.floor((utcMinute + CASINO_UTC_OFFSET_SECONDS / 60) / CASINO_MINUTES_PER_DAY);
}

export function casinoSecondOfKstDayAtUtcSecond(utcSecond: number): number {
  const kstDay = casinoKstDayAtUtcSecond(utcSecond);
  return utcSecond - casinoUtcSecondAtKstDay(kstDay);
}

export function casinoUtcSecondAtKstDay(kstDay: number, secondOfDay = 0): number {
  assertSafeInteger(kstDay, "casino_time_invalid_day");
  assertSafeInteger(secondOfDay, "casino_time_invalid_second_of_day");
  if (secondOfDay < 0 || secondOfDay >= CASINO_SECONDS_PER_DAY) throw new Error("casino_time_invalid_second_of_day");
  return kstDay * CASINO_SECONDS_PER_DAY - CASINO_UTC_OFFSET_SECONDS + secondOfDay;
}

function assertSafeInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(code);
}
