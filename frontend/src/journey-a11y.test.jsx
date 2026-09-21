import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import ArtworkChecks from "@/components/ArtworkChecks";
import DesignHelpDrawer from "@/components/DesignHelpDrawer";
import PagePicker from "@/components/PagePicker";
import SyncDialog from "@/components/SyncDialog";
import { fetchPreview } from "@/lib/preview";

// Keyboard, focus, announcement and severity behaviour across the journey (ticket 14).
vi.mock("@/lib/preview", () => ({ fetchPreview: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, locale, ...rest }) => <a href="#top" {...rest}>{children}</a>,
  usePathname: () => "/flyers",
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });
Element.prototype.getClientRects = function () {
  return [{}];
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const intl = (ui, locale = "en") => (
  <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
    {ui}
  </NextIntlClientProvider>
);
const finding = (o) => ({ code: "low_ppi", severity: "warning", value: 180, page: 1, bbox: [10, 10, 40, 40], message: "", ...o });
const PREVIEW = {
  front: {
    image_url: "/front.png",
    findings: [finding({ code: "font_not_embedded", severity: "error", bbox: null }), finding(), finding({ code: "rgb_colour", severity: "note", bbox: null })],
  },
  back: { same_as_front: true },
  ordered_trim_mm: [148, 210],
  product_bleed_mm: 3,
  product_safe_mm: 5,
};

function renderStep2(locale = "en") {
  vi.mocked(fetchPreview).mockResolvedValue(PREVIEW);
  return render(intl(<ArtworkChecks frontId={1} backId={null} sameAsFront sizeCode="a5" sizeChoice={null} />, locale));
}

describe("Findings: Severity is never carried by colour alone", () => {
  for (const [locale, words] of [["en", ["Error", "Warning", "Note"]], ["ar", ["خطأ", "تحذير", "ملاحظة"]]]) {
    it(`each row states its Severity in words next to its icon (${locale})`, async () => {
      renderStep2(locale);
      const rows = await screen.findAllByText(new RegExp(`^(${words.join("|")}) · `));
      expect(rows.map((row) => row.textContent.split(" · ")[0].replace(/^\S+\s/, ""))).toEqual(words);
    });
  }
});

describe("Artwork page announcements and previews", () => {
  it("announces the result of the check in a polite status region", async () => {
    renderStep2();
    await waitFor(() => {
      const statuses = screen.getAllByRole("status");
      expect(statuses.some((s) => s.textContent.includes("Must fix before ordering") && s.getAttribute("aria-live") === "polite")).toBe(true);
    });
  });

  it("announces the loading state, and an alert when the preview cannot load", async () => {
    vi.mocked(fetchPreview).mockResolvedValue(null);
    render(intl(<ArtworkChecks frontId={1} backId={null} sameAsFront sizeCode="a5" sizeChoice={null} />));
    expect(screen.getByRole("status")).toHaveTextContent("Loading your preview");
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("opens the enlarged view from the keyboard, traps focus, closes on Escape and returns focus", async () => {
    renderStep2();
    const loupe = await screen.findByRole("button", { name: "Enlarge Front preview" });
    loupe.focus();
    fireEvent.keyDown(loupe, { key: "Enter" });
    const dialog = screen.getByRole("dialog", { name: "Enlarged preview" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loupe).toHaveFocus();
  });

  it("opens the enlarged view with Space too", async () => {
    renderStep2();
    const loupe = await screen.findByRole("button", { name: "Enlarge Front preview" });
    fireEvent.keyDown(loupe, { key: " " });
    expect(screen.getByRole("dialog", { name: "Enlarged preview" })).toBeInTheDocument();
  });
});

describe("Blocking size dialog", () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>upload</button>
        <SyncDialog
          dialog={open ? { key: "sides:double", kind: "front-only", field: "sides", file: "single", ordered: "double" } : null}
          preview={{ status: "ready", notices: [] }}
          onPreviewSwitch={vi.fn()}
          onResolve={() => setOpen(false)}
        />
      </>
    );
  }

  it("takes focus, keeps it inside, ignores Escape (it must be answered), and gives focus back once answered", () => {
    render(intl(<Host />));
    const opener = screen.getByText("upload");
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(/only a front/i);
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const buttons = screen.getAllByRole("button").filter((b) => dialog.contains(b) && !b.disabled);
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(buttons[0]).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /Use the same artwork/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});

describe("Need a design? drawer", () => {
  function Host({ onClose }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>need design</button>
        <DesignHelpDrawer open={open} onClose={() => { onClose(); setOpen(false); }} product={{ id: 1 }} configurationLine="A5" configurationSnapshot={{}} />
      </>
    );
  }

  it("is a labelled modal dialog: focus goes in, Tab stays in, Escape closes, focus returns", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ whatsapp_number: "971500000000" }) })));
    const onClose = vi.fn();
    render(intl(<Host onClose={onClose} />));
    const opener = screen.getByText("need design");
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Need a design?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
    opener.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("reports a failed send as an alert", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url, init) => { if (init?.method === "POST") throw new Error("offline"); return { ok: true, json: async () => ({ whatsapp_number: "1" }) }; }));
    render(intl(<DesignHelpDrawer open onClose={vi.fn()} product={{ id: 1 }} configurationLine="A5" configurationSnapshot={{}} />));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Layla" } });
    fireEvent.change(screen.getByLabelText(/Phone/), { target: { value: "0501234567" } });
    fireEvent.change(screen.getByLabelText(/flyer for/), { target: { value: "A flyer" } });
    fireEvent.submit(screen.getByRole("button", { name: "Send brief" }).closest("form"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("Page picker", () => {
  const page = (number, code) => ({ number, matched_size_code: code, trim_width_mm: 148, trim_height_mm: 210, orientation: "portrait", thumbnail_url: `/p${number}.png` });
  const source = { id: 7, page_count: 2, original_filename: "menu.pdf", pages: [page(1, "a5"), page(2, "a5")] };

  it("can be completed from the keyboard, and Escape closes the enlarged page before the picker", () => {
    const onCancel = vi.fn();
    render(intl(<PagePicker source={source} orderedSize="a5" onConfirm={vi.fn()} onCancel={onCancel} />));
    const enlarge = screen.getByRole("button", { name: "Enlarge page 1" });
    enlarge.focus();
    fireEvent.click(enlarge);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(enlarge).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not cancel on Escape while the pages are being checked, and says so", () => {
    const onCancel = vi.fn();
    render(intl(<PagePicker source={source} orderedSize="a5" initialChoice={{ front: 1, back: 2, same: false }} busy onConfirm={vi.fn()} onCancel={onCancel} />));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getAllByRole("status").some((s) => s.textContent === "Checking…" || s.textContent.startsWith("Checking"))).toBe(true);
  });
});

describe("reduced motion", () => {
  it("switches every animation and transition off, and smooth scrolling too", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const block = css.slice(css.indexOf("prefers-reduced-motion: reduce", css.indexOf("Reduced motion")));
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });
});
