function toDate(value: string | Date) {
  return typeof value === "string" ? new Date(value) : value;
}

export function formatDateDMY(value?: string | Date | null, fallback = "Not available") {
  if (!value) return fallback;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(toDate(value));
}

export function formatDateTimeDMY(value?: string | Date | null, fallback = "Not available") {
  if (!value) return fallback;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(toDate(value));
}
