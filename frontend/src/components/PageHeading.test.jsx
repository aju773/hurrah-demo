import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import PageHeading from "./PageHeading";

window.scrollTo = () => {};
afterEach(cleanup);

const withIntl = (ui, locale = "en") => (
  <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
    {ui}
  </NextIntlClientProvider>
);

describe("page heading", () => {
  it("names each page of the journey in a heading", () => {
    const { rerender } = render(withIntl(<PageHeading page="options" />));
    expect(screen.getByRole("heading", { level: 1, name: "Choose your options" })).toBeInTheDocument();
    rerender(withIntl(<PageHeading page="artwork" />));
    expect(screen.getByRole("heading", { level: 1, name: "Add your artwork" })).toBeInTheDocument();
    rerender(withIntl(<PageHeading page="approve" />));
    expect(screen.getByRole("heading", { level: 1, name: "Approve your order" })).toBeInTheDocument();
  });

  it("does not take focus or announce anything on first render", () => {
    render(withIntl(<PageHeading page="artwork" />));
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveFocus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("moves focus to the heading and announces the page when the page changes", () => {
    const { rerender } = render(withIntl(<PageHeading page="options" />));
    screen.getByRole("heading", { level: 1 }).blur();
    rerender(withIntl(<PageHeading page="artwork" />));
    expect(screen.getByRole("heading", { level: 1, name: "Add your artwork" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Page 2 of 3: Add your artwork");
    rerender(withIntl(<PageHeading page="approve" />));
    expect(screen.getByRole("heading", { level: 1, name: "Approve your order" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Page 3 of 3: Approve your order");
  });

  it("announces in Arabic too", () => {
    const { rerender } = render(withIntl(<PageHeading page="options" />, "ar"));
    rerender(withIntl(<PageHeading page="artwork" />, "ar"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(ar.FlyersConfigurator.pageArtwork);
  });
});
