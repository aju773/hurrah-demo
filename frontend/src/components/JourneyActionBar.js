"use client";

/** The action bar pinned at the bottom of a Single-screen journey page — Options,
 * Artwork, Approve (CONTEXT.md, Single-screen): Back / Edit options on one side,
 * the page's primary action on the other, with the reason it is disabled beside
 * it. `secondary` is left out on the Options page, which has nothing before it.
 *
 * Sticky against the page's own scrolling container rather than fixed-position:
 * at the Single-screen floor that container is the page itself (so this sits at
 * its bottom, always in view); below the floor there is no such container, so it
 * sticks to the browser viewport instead — the same rule either way. */
export default function JourneyActionBar({ secondary, primary }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-[16px] sm:-mx-[32px] flex items-center justify-between gap-[12px] border-t border-[#e2e8f8] bg-[#f9f9ff] px-[16px] sm:px-[32px] py-[12px]">
      <div className="flex items-center gap-[12px]">{secondary}</div>
      <div className="flex items-center gap-[12px]">{primary}</div>
    </div>
  );
}
