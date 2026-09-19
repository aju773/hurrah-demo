import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import { resetHints } from "@/lib/hints";
import FirstVisitHint, { ShowHintsLink } from "./FirstVisitHint";

function ui({ locale = "en", messages = en, onClick = () => {} } = {}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FirstVisitHint step="options" />
      <FirstVisitHint step="findings" />
      <ShowHintsLink />
      <button type="button" onClick={onClick}>
        Underneath
      </button>
      <input aria-label="Underneath field" />
    </NextIntlClientProvider>
  );
}

function show(options) {
  return act(async () => {
    render(ui(options));
  });
}

beforeEach(() => {
  localStorage.clear();
  resetHints();
});

afterEach(() => {
  cleanup();
  delete window.__HURRAH_HINTS__;
});

describe("FirstVisitHint", () => {
  it("shows a first-time visitor the hint for each step, politely announced", async () => {
    await show();
    const hints = screen.getAllByRole("status");
    expect(hints).toHaveLength(2);
    expect(hints[0]).toHaveAttribute("aria-live", "polite");
    expect(hints[0]).toHaveTextContent(en.Hints.options);
    expect(hints[1]).toHaveTextContent(en.Hints.findings);
  });

  it("never blocks the page: no modal, no focus taken, clicks and typing still work", async () => {
    const onClick = vi.fn();
    await show({ onClick });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Underneath" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Underneath field"), { target: { value: "typed" } });
    expect(screen.getByLabelText("Underneath field")).toHaveValue("typed");
  });

  it("dismisses one hint with its button", async () => {
    await show();
    fireEvent.click(screen.getAllByRole("button", { name: en.Hints.gotIt })[0]);
    const hints = screen.getAllByRole("status");
    expect(hints).toHaveLength(1);
    expect(hints[0]).toHaveTextContent(en.Hints.findings);
  });

  it("dismisses all hints with Dismiss all", async () => {
    await show();
    fireEvent.click(screen.getAllByRole("button", { name: en.Hints.dismissAll })[0]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("dismisses the hint with Escape wherever focus is", async () => {
    await show();
    fireEvent.keyDown(screen.getByLabelText("Underneath field"), { key: "Escape" });
    expect(screen.queryByRole("status")).toBeNull(); // both test hints share the page; the app shows one per step
  });

  it("leaves Escape to an open dialog", async () => {
    await show();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getAllByRole("status")).toHaveLength(2);
    dialog.remove();
  });

  it("does not show hints again to a returning visitor", async () => {
    await show();
    fireEvent.click(screen.getAllByRole("button", { name: en.Hints.dismissAll })[0]);
    cleanup();
    await show();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("brings hints back with Show hints", async () => {
    await show();
    fireEvent.click(screen.getAllByRole("button", { name: en.Hints.dismissAll })[0]);
    fireEvent.click(screen.getByRole("button", { name: en.Hints.show }));
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("shows nothing, and no Show hints link, when the runtime flag is off", async () => {
    window.__HURRAH_HINTS__ = false;
    await show();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: en.Hints.show })).toBeNull();
  });

  it("has its text in Arabic", async () => {
    await show({ locale: "ar", messages: ar });
    expect(screen.getAllByRole("status")[0]).toHaveTextContent(ar.Hints.options);
    expect(screen.getAllByRole("button", { name: ar.Hints.gotIt })).toHaveLength(2);
    expect(ar.Hints.show).toBeTruthy();
  });

  it("fades in with a class the reduced-motion stylesheet switches off", async () => {
    await show();
    expect(screen.getAllByRole("status")[0].className).toContain("hint-in");
  });
});
