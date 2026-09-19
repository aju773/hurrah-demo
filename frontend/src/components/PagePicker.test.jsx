import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import PagePicker from "./PagePicker";

const page = (number, code, w = 148, h = 210) => ({
  number,
  matched_size_code: code,
  trim_width_mm: w,
  trim_height_mm: h,
  orientation: "portrait",
  thumbnail_url: `http://api/sources/7/pages/${number}/thumbnail/`,
});
const SOURCE = { id: 7, page_count: 4, original_filename: "menu.pdf", pages: [page(1, "a4", 210, 297), page(2, "a5"), page(3, "a5"), page(4, "a5")] };

function renderPicker(props = {}) {
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PagePicker source={SOURCE} orderedSize="a5" {...handlers} {...props} />
    </NextIntlClientProvider>
  );
  return handlers;
}

afterEach(cleanup);

describe("PagePicker: reopened with a choice", () => {
  it("starts from the pages already chosen, so they can be swapped", () => {
    const { onConfirm } = renderPicker({ initialChoice: { front: 2, back: 3, same: false } });
    expect(screen.getByRole("button", { name: "Use page 2 as Front" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Use page 3 as Back" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Front" }));
    fireEvent.click(screen.getByRole("button", { name: "Use page 2 as Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Use these pages" }));
    expect(onConfirm).toHaveBeenCalledWith({ front: 3, back: 2, same: false });
  });

  it("allows one page on both sides only through 'Use the same artwork for the back'", () => {
    const { onConfirm } = renderPicker({ initialChoice: { front: 3, back: null, same: false } });
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Back" }));
    // Choosing Front's page for Back takes it off Front; the picker never holds it on both.
    expect(screen.getByRole("button", { name: "Use page 3 as Front" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Use these pages" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Front" }));
    fireEvent.click(screen.getByLabelText("Use the same artwork for the back"));
    expect(screen.queryByRole("button", { name: /as Back/ })).toBeNull();
    expect(screen.getByTestId("picker-summary")).toHaveTextContent("Front: 3 · Back: same as front");
    fireEvent.click(screen.getByRole("button", { name: "Use these pages" }));
    expect(onConfirm).toHaveBeenCalledWith({ front: 3, back: null, same: true });
  });

  it("opens with 'same artwork' already on when the Back was Front's page", () => {
    renderPicker({ initialChoice: { front: 3, back: null, same: true } });
    expect(screen.getByLabelText("Use the same artwork for the back")).toBeChecked();
  });
});

describe("PagePicker: one side only", () => {
  const FIXED_FRONT = { matched_size_code: "a5", trim_width_mm: 148, trim_height_mm: 210 };

  it("Back only: offers only Back buttons and confirms one page", () => {
    const { onConfirm } = renderPicker({ mode: "back", fixed: FIXED_FRONT });
    expect(screen.queryByRole("button", { name: /as Front/ })).toBeNull();
    expect(screen.queryByLabelText("Use the same artwork for the back")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Use these pages" }));
    expect(onConfirm).toHaveBeenCalledWith({ front: null, back: 3, same: false });
  });

  it("Back only: says why a page of another Size cannot be the Back", () => {
    renderPicker({ mode: "back", fixed: FIXED_FRONT });
    fireEvent.click(screen.getByRole("button", { name: "Use page 1 as Back" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Front is A5 but Back is A4");
    expect(screen.getByRole("button", { name: "Use these pages" })).toBeDisabled();
  });
});

describe("PagePicker: enlarged view", () => {
  it("opens a bigger render of the page, and Escape closes just that view", () => {
    const { onCancel } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Enlarge page 2" }));
    const view = screen.getByRole("dialog", { name: "Page 2, enlarged" });
    expect(view.querySelector("img")).toHaveAttribute("src", "http://api/sources/7/pages/2/thumbnail/?size=large");
    fireEvent.keyDown(view, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Page 2, enlarged" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Choose your flyer pages" })).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Enlarge page 2" })).toHaveFocus();
  });

  it("closes by its Close button, and by a click outside the page", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Enlarge page 3" }));
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Page 3, enlarged" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enlarge page 3" }));
    fireEvent.click(screen.getByRole("dialog", { name: "Page 3, enlarged" }).parentElement);
    expect(screen.queryByRole("dialog", { name: "Page 3, enlarged" })).toBeNull();
  });

  it("Escape with the enlarged view shut still cancels the picker", () => {
    const { onCancel } = renderPicker();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
