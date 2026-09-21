"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { dismissAllHints, dismissHint, hintsEnabled, isHintSeen, resetHints, subscribeHints } from "@/lib/hints";

// The server render never shows a hint: "seen" lives in the browser, and
// rendering it there first would flash a hint (or mismatch) on hydration.
function useHintSeen(step) {
  return useSyncExternalStore(
    subscribeHints,
    () => isHintSeen(step),
    () => true
  );
}

/**
 * One small, non-modal hint for a page of the Flyers journey (Hints, in
 * CONTEXT.md). It sits in the page flow beside the control it explains, never
 * takes focus and never covers anything. "Got it" dismisses this one, "Dismiss
 * all" dismisses every hint, and Escape dismisses it unless a dialog is open
 * (the dialog keeps its Escape).
 */
export default function FirstVisitHint({ step, className = "" }) {
  const t = useTranslations("Hints");
  const seen = useHintSeen(step);
  const visible = !seen && hintsEnabled();

  useEffect(() => {
    if (!visible) return;
    function onKey(event) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      dismissHint(step);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, step]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-hint={step}
      className={`hint-in relative flex flex-col gap-[8px] rounded-[10px] border border-[#ffc72c] bg-[#fff8e1] px-[14px] py-[10px] text-[#6f5400] text-[13px] ${className}`}
    >
      <span aria-hidden="true" className="absolute -top-[6px] start-[20px] h-[10px] w-[10px] rotate-45 border-s border-t border-[#ffc72c] bg-[#fff8e1]" />
      <p>{t(step)}</p>
      <div className="flex items-center gap-[12px]">
        <button
          type="button"
          onClick={() => dismissHint(step)}
          className="tap h-[32px] px-[12px] rounded-[8px] bg-[#6f5400] text-white text-[12px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#bb0027]"
        >
          {t("gotIt")}
        </button>
        <button
          type="button"
          onClick={dismissAllHints}
          className="tap inline-flex items-center justify-center text-[12px] font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#bb0027]"
        >
          {t("dismissAll")}
        </button>
      </div>
    </div>
  );
}

/** "Show hints": forgets what was dismissed so the hints come back. Absent when hints are switched off. */
export function ShowHintsLink({ className = "" }) {
  const t = useTranslations("Hints");
  const enabled = useSyncExternalStore(
    subscribeHints,
    () => hintsEnabled(),
    () => false
  );
  if (!enabled) return null;
  return (
    <button
      type="button"
      onClick={resetHints}
      className={`tap inline-flex items-center justify-center text-[#575c64] text-[12px] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#bb0027] ${className}`}
    >
      {t("show")}
    </button>
  );
}
