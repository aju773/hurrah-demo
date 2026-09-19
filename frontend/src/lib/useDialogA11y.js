"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, innermost last. Only the innermost one handles Escape and Tab, so
// the enlarged page over the Page picker closes alone and keeps its own focus loop.
const openDialogs = [];

function focusableIn(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => !el.closest("[hidden]") && el.getClientRects().length > 0);
}

/**
 * Keyboard behaviour every dialog and drawer shares: focus moves into it when it
 * opens (to `initialFocus` when given, else the dialog itself), Tab and Shift+Tab
 * stay inside it, Escape calls `onClose` (skipped when `closeOnEscape` is false,
 * for a dialog that must be answered or is busy), and focus goes back to whatever
 * had it before the dialog opened.
 *
 * `active` lets a component that stays mounted while closed (a drawer) reuse the
 * hook. `ref` is the dialog element; give it tabIndex={-1} so it can take focus.
 * `returnFocus` (a ref to an element) names where focus goes back to when the
 * element that opened the dialog is not the one that had focus (Safari does not
 * focus a button when it is clicked).
 */
export default function useDialogA11y(ref, { active = true, onClose, closeOnEscape = true, initialFocus, returnFocus } = {}) {
  const latest = useRef({ onClose, closeOnEscape });
  // Declared before the effect below so the handler always sees this render's values.
  useEffect(() => {
    latest.current = { onClose, closeOnEscape };
  });

  useEffect(() => {
    if (!active) return;
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement;
    openDialogs.push(dialog);
    (initialFocus?.current ?? dialog).focus({ preventScroll: true });

    function onKeyDown(event) {
      if (openDialogs[openDialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        const { onClose: close, closeOnEscape: allowed } = latest.current;
        if (allowed && close) {
          event.preventDefault();
          close();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableIn(dialog);
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (!dialog.contains(current) || current === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const at = openDialogs.indexOf(dialog);
      if (at !== -1) openDialogs.splice(at, 1);
      // Read at close time on purpose: the opener is recorded by a click after this effect ran.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const target = returnFocus?.current ?? opener;
      if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
    };
  }, [active, ref, initialFocus, returnFocus]);
}
