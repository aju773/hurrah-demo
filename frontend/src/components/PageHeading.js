"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PAGES } from "@/lib/draftOrder";

const NAME_KEY = { options: "pageOptions", artwork: "pageArtwork", approve: "pageApprove" };

/** The heading of the journey page on screen: the page's own h1 (Single-screen, in
 * CONTEXT.md, merges the site's page title and this subtitle into one one-line
 * heading rather than two). Moving to another page replaces the page content,
 * which would leave keyboard focus on a control that is gone: focus goes to this
 * heading instead, and a polite status line says which page it is. Neither
 * happens on first render, so opening a page never steals focus. */
export default function PageHeading({ page }) {
  const t = useTranslations("FlyersConfigurator");
  const headingRef = useRef(null);
  const priorPage = useRef(page);
  const [announcement, setAnnouncement] = useState("");
  const name = t(NAME_KEY[page]);

  useEffect(() => {
    if (priorPage.current === page) return;
    priorPage.current = page;
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0 });
    setAnnouncement(t("pageAnnouncement", { n: PAGES.indexOf(page) + 1, total: PAGES.length, name }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="outline-none text-[#151c27] text-[20px] font-bold">
        {name}
      </h1>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
