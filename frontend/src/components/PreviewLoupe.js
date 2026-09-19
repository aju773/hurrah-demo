"use client";

import { useEffect, useRef, useState } from "react";

const LOUPE_SIZE = 150;
const LOUPE_ZOOM = 3;

// Pointer devices only (spec story 69 / ticket 08): touch has no hover state
// to trigger the loupe from, so it's gated on the same media query that
// decides whether :hover behaves like a mouse.
function usePointerFine() {
  const [fine, setFine] = useState(() => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  useEffect(() => {
    const mql = window.matchMedia("(hover: hover) and (pointer: fine)");
    const onChange = (e) => setFine(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return fine;
}

/** Wraps a preview with a ~3x round hover loupe (ticket 08). Clicking the
 * preview (loupe or not) still opens the enlarged view via `onClick`. */
export default function PreviewLoupe({ children, onClick }) {
  const containerRef = useRef(null);
  const [hover, setHover] = useState(null);
  const canHover = usePointerFine();

  function handleMove(e) {
    const rect = containerRef.current.getBoundingClientRect();
    setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top, w: rect.width, h: rect.height });
  }

  return (
    <div
      ref={containerRef}
      dir="ltr"
      className="relative cursor-pointer"
      onClick={onClick}
      onMouseMove={canHover ? handleMove : undefined}
      onMouseLeave={canHover ? () => setHover(null) : undefined}
    >
      {children}
      {canHover && hover && (
        <div
          className="absolute rounded-full border-2 border-white shadow-[0_6px_24px_rgba(0,0,0,0.4)] overflow-hidden pointer-events-none bg-white"
          style={{ width: LOUPE_SIZE, height: LOUPE_SIZE, left: hover.x - LOUPE_SIZE / 2, top: hover.y - LOUPE_SIZE / 2 }}
        >
          <div
            style={{
              width: hover.w,
              height: hover.h,
              transformOrigin: "0 0",
              transform: `translate(${LOUPE_SIZE / 2 - LOUPE_ZOOM * hover.x}px, ${LOUPE_SIZE / 2 - LOUPE_ZOOM * hover.y}px) scale(${LOUPE_ZOOM})`,
            }}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
