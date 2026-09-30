const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function calendarDate(text: string): string | null {
  const match = /^(?:([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})|(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}))$/.exec(
    text.trim(),
  );
  if (!match) return null;
  const name = (match[1] ?? match[5] ?? "").toLowerCase();
  const fullNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const month = (name.length === 3 ? MONTHS.indexOf(name) : fullNames.indexOf(name)) + 1;
  const day = Number(match[2] ?? match[4]),
    year = Number(match[3] ?? match[6]);
  if (month === 0) return null;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
    ? date
    : null;
}
