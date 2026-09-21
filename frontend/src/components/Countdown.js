"use client";

import DeliveryLine from "./DeliveryLine";
import useCutoffCountdown from "@/lib/useCutoffCountdown";

// Ticks the current Turnaround's Cut-off countdown down once a second and shows the
// delivery line beneath it; calls onExpire (a refetch) when it reaches zero, so a
// Same-day pick past its Cut-off (or a weekend) falls back and its notice shows
// without the customer touching anything. Keyed on clock.now at the call site, so a
// successful refetch remounts it with a fresh countdown.
export default function Countdown({ clock, locale, onExpire, commerceEnabled, className }) {
  const secondsLeft = useCutoffCountdown(clock, onExpire);

  return (
    <DeliveryLine
      clock={clock}
      secondsLeft={secondsLeft}
      locale={locale}
      commerceEnabled={commerceEnabled}
      className={className ?? "text-[#575c64] text-[12px]"}
    />
  );
}
