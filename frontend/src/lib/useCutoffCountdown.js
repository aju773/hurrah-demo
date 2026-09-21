"use client";

import { useEffect, useState } from "react";

const EXPIRED_RETRY_MS = 5000;

/** Ticks a Cut-off down once a second from `clock.seconds_to_cutoff` and returns the
 * seconds left. At zero it calls `onExpire` (a refetch); if the refetch fails the
 * clock stays at zero, so it asks again on a delay rather than freezing. A successful
 * refetch brings a new `clock.now`; callers key on it so a fresh clock remounts. */
export default function useCutoffCountdown(clock, onExpire) {
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

  return secondsLeft;
}
