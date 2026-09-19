"use client";

import { useEffect, useState } from "react";
import DeliveryLine from "./DeliveryLine";

const EXPIRED_RETRY_MS = 5000;

// Ticks the current Turnaround's Cut-off countdown down once a second and shows the
// delivery line beneath it; calls onExpire (a refetch) when it reaches zero, so a
// Same-day pick past its Cut-off (or a weekend) falls back and its notice shows
// without the customer touching anything. A successful refetch brings a new
// clock.now, which remounts this component (see its `key` at the call site) with a
// fresh countdown; if the refetch fails instead, we keep retrying on a delay rather
// than freezing on "0s" forever.
export default function Countdown({ clock, locale, onExpire, commerceEnabled, className }) {
  const [secondsLeft, setSecondsLeft] = useState(clock.seconds_to_cutoff);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (secondsLeft > 0) {
      const timer = setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
      return () => clearTimeout(timer);
    }
    onExpire();
    const retry = setTimeout(() => setRetryCount((c) => c + 1), EXPIRED_RETRY_MS);
    return () => clearTimeout(retry);
  }, [secondsLeft, retryCount, onExpire]);

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
