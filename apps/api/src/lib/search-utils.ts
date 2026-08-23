const monthIndexes: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};

function isValidDateParts(year: number, monthIndex: number, day: number) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return false;
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;

  const candidate = new Date(year, monthIndex, day);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === monthIndex &&
    candidate.getDate() === day &&
    !Number.isNaN(candidate.getTime())
  );
}

export function parseSearchYear(query: string) {
  const trimmed = query.trim();
  if (!/^\d{4}$/.test(trimmed)) return null;
  const year = Number(trimmed);
  if (!Number.isFinite(year) || year < 1900 || year > 2200) return null;
  return year;
}

export function parseSearchDateRange(query: string): { start: Date; end: Date } | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const monthIndex = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    if (!isValidDateParts(year, monthIndex, day)) return null;
    const start = new Date(year, monthIndex, day);
    const end = new Date(year, monthIndex, day + 1);
    return { start, end };
  }

  const dmyMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(trimmed);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const monthIndex = Number(dmyMatch[2]) - 1;
    let year = Number(dmyMatch[3]);
    if (year < 100) {
      year = 2000 + year;
    }
    if (!isValidDateParts(year, monthIndex, day)) return null;
    const start = new Date(year, monthIndex, day);
    const end = new Date(year, monthIndex, day + 1);
    return { start, end };
  }

  const monthNameMatch = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(trimmed);
  if (monthNameMatch) {
    const day = Number(monthNameMatch[1]);
    const monthKey = monthNameMatch[2].toLowerCase();
    const monthIndex = monthIndexes[monthKey] ?? null;
    const year = Number(monthNameMatch[3]);
    if (monthIndex === null) return null;
    if (!isValidDateParts(year, monthIndex, day)) return null;
    const start = new Date(year, monthIndex, day);
    const end = new Date(year, monthIndex, day + 1);
    return { start, end };
  }

  const parsedYear = parseSearchYear(trimmed);
  if (parsedYear !== null) {
    const start = new Date(parsedYear, 0, 1);
    const end = new Date(parsedYear + 1, 0, 1);
    return { start, end };
  }

  return null;
}

