import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../messages/en.json";
import SiteFooter from "@/components/SiteFooter";

// The demo shows only what works. A link to "#" goes nowhere, so it never ships.
function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.jsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("no dead elements", () => {
  it('no component links to "#"', () => {
    const offenders = sourceFiles("src").filter((file) => /href=(["'{`]+)#\1?["'}`]/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the footer is text only, with nothing to click", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SiteFooter />
      </NextIntlClientProvider>
    );
    expect(container.querySelector("a, button")).toBeNull();
  });
});
