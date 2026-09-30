import type { OfferLifecycleStatus, SourceTime } from "./contract.ts";

const KATHMANDU_OFFSET_MILLISECONDS = (5 * 60 + 45) * 60 * 1_000;
const TWENTY_DAYS_MILLISECONDS = 20 * 24 * 60 * 60 * 1_000;

type ExpiryInput = Readonly<{
  explicitValidityEnd: SourceTime | null;
  sourcePublishedAt: SourceTime | null;
  firstDiscoveredAt: Date;
}>;

type LifecycleInput = Readonly<{
  now: Date;
  validityStartsAt: string | null;
  expiresAt: string;
  withdrawnAt: string | null;
}>;

function calendarParts(value: string): Readonly<{
  year: number;
  monthIndex: number;
  day: number;
}> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) throw new TypeError("Invalid Kathmandu calendar date");

  const yearText = match[1];
  const monthText = match[2];
  const dayText = match[3];
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    throw new TypeError("Invalid Kathmandu calendar date");
  }

  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = Number(dayText);
  const normalized = new Date(Date.UTC(year, monthIndex, day));

  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== monthIndex ||
    normalized.getUTCDate() !== day
  ) {
    throw new TypeError("Invalid Kathmandu calendar date");
  }

  return { year, monthIndex, day };
}

function kathmanduMidnight(value: string, dayOffset: number): Date {
  const { year, monthIndex, day } = calendarParts(value);
  const utcLikeCalendarTime = Date.UTC(year, monthIndex, day + dayOffset);
  return new Date(utcLikeCalendarTime - KATHMANDU_OFFSET_MILLISECONDS);
}

function instant(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError("Invalid instant");
  return parsed;
}

function sourceTimeStart(value: SourceTime): Date {
  return value.kind === "INSTANT"
    ? instant(value.value)
    : kathmanduMidnight(value.value, 0);
}

function explicitExpiry(value: SourceTime): Date {
  return value.kind === "INSTANT"
    ? instant(value.value)
    : kathmanduMidnight(value.value, 1);
}

export function calculateExpiry(input: ExpiryInput): Date {
  if (input.explicitValidityEnd !== null) {
    return explicitExpiry(input.explicitValidityEnd);
  }

  const fallbackStart =
    input.sourcePublishedAt === null
      ? new Date(input.firstDiscoveredAt.getTime())
      : sourceTimeStart(input.sourcePublishedAt);

  return new Date(fallbackStart.getTime() + TWENTY_DAYS_MILLISECONDS);
}

export function deriveLifecycleStatus(
  input: LifecycleInput,
): OfferLifecycleStatus {
  if (input.withdrawnAt !== null) return "WITHDRAWN";

  const now = input.now.getTime();
  if (
    input.validityStartsAt !== null &&
    now < instant(input.validityStartsAt).getTime()
  ) {
    return "SCHEDULED";
  }

  return now >= instant(input.expiresAt).getTime() ? "EXPIRED" : "ACTIVE";
}
