// Formatting for the Clock and turnaround module's countdown/delivery line. Pure
// functions only, so they can be unit-tested without going through a component
// render (see clock.test.js).

// Arabic always formats with Western digits and the Gregorian calendar
// (spec: Arabic stories 113-119), which plain "ar" does not guarantee: some
// browsers default it to Arabic-Indic digits.
export const INTL_LOCALES = { en: "en-US", ar: "ar-AE-u-nu-latn" };

function intlLocale(locale) {
  return INTL_LOCALES[locale] ?? INTL_LOCALES.en;
}

const COUNTDOWN_UNITS = {
  en: { h: "h", m: "m", s: "s" },
  ar: { h: "س", m: "د", s: "ث" },
};

// "1h 24m", "24m 10s" or "10s" (Arabic: "1س 24د") — coarsest two units, dropped to
// one near zero.
export function formatCountdown(totalSeconds, locale = "en") {
  const unit = COUNTDOWN_UNITS[locale] ?? COUNTDOWN_UNITS.en;
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}${unit.h} ${minutes}${unit.m}`;
  if (minutes > 0) return `${minutes}${unit.m} ${seconds % 60}${unit.s}`;
  return `${seconds % 60}${unit.s}`;
}

const EN_SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "Tue 22 Sep" / "الثلاثاء 22 سبتمبر" in Asia/Dubai, from an ISO date string
// ("2026-09-22").
export function formatPromisedDate(isoDate, locale) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  const format = (options) =>
    new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone: "Asia/Dubai" }).format(date);
  const weekday = format({ weekday: "short" });
  const day = format({ day: "numeric" });
  if (locale === "ar") {
    return `${weekday} ${day} ${format({ month: "short" })}`;
  }
  // Fixed English abbreviations (not Intl's "Sept") to match the spec's wording exactly.
  const month = EN_SHORT_MONTHS[Number(isoDate.slice(5, 7)) - 1];
  return `${weekday.replace(",", "")} ${day} ${month}`;
}

// "15:00–20:00" (24-hour) or, with no window start (Standard), "by 20:00" / "بحلول 20:00".
// `byLabel` is the translated "by" word.
export function formatWindow(clock, byLabel = "by") {
  return clock.window_start ? `${clock.window_start}–${clock.window_end}` : `${byLabel} ${clock.window_end}`;
}

/** The three pieces of the delivery line, each formatted for `locale`, so the
 * component can drop them into one translated sentence (and isolate the
 * countdown left-to-right): "Approve in {countdown} for delivery {date},
 * {window} (Dubai)". */
export function deliveryParts(clock, secondsToCutoff, locale, byLabel) {
  return {
    countdown: formatCountdown(secondsToCutoff ?? clock.seconds_to_cutoff, locale),
    date: formatPromisedDate(clock.promised_date, locale),
    window: formatWindow(clock, byLabel),
  };
}
