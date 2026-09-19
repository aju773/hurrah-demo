// Formatting for the Clock and turnaround module's countdown/delivery line. Pure
// functions only, so they can be unit-tested without going through a component
// render (see clock.test.js).

// "1h 24m", "24m 10s" or "10s" — coarsest two units, dropped to one near zero.
export function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds % 60}s`;
}

const EN_SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "Tue 22 Sep" in Asia/Dubai, from an ISO date string ("2026-09-22").
export function formatPromisedDate(isoDate, locale) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-US", {
    weekday: "short",
    timeZone: "Asia/Dubai",
  }).format(date);
  const day = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-US", {
    day: "numeric",
    timeZone: "Asia/Dubai",
  }).format(date);
  if (locale === "ar") {
    const month = new Intl.DateTimeFormat("ar", { month: "short", timeZone: "Asia/Dubai" }).format(date);
    return `${weekday} ${day} ${month}`;
  }
  // Fixed English abbreviations (not Intl's "Sept") to match the spec's wording exactly.
  const month = EN_SHORT_MONTHS[Number(isoDate.slice(5, 7)) - 1];
  return `${weekday.replace(",", "")} ${day} ${month}`;
}

// "15:00–20:00" or, with no window start (Standard), "by 20:00".
export function formatWindow(clock) {
  return clock.window_start ? `${clock.window_start}–${clock.window_end}` : `by ${clock.window_end}`;
}

// "Approve in 1h 24m for delivery Tue 22 Sep, 15:00–20:00 (Dubai)"
export function deliveryLine(clock, secondsToCutoff, locale) {
  const countdown = formatCountdown(secondsToCutoff ?? clock.seconds_to_cutoff);
  const date = formatPromisedDate(clock.promised_date, locale);
  return `Approve in ${countdown} for delivery ${date}, ${formatWindow(clock)} (Dubai)`;
}
