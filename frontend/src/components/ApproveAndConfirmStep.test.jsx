import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import ApproveAndConfirmStep from "./ApproveAndConfirmStep";

vi.mock("@/lib/preview", () => ({
  fetchPreview: vi.fn(async () => ({
    front: { findings: [], thumbnail_url: "/f.png" },
    back: { same_as_front: true },
    ordered_trim_mm: [148, 210],
  })),
}));
vi.mock("./ArtworkPreview", () => ({ default: () => <div data-testid="proof" /> }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MONEY = /AED|درهم|VAT|ضريبة|\btotal\b|الإجمالي|delivery|payment|address|التوصيل|العنوان/i;
const CATALOGUE = {
  options: [{ code: "size", name: "Size", values: [{ code: "a5", label: "A5" }] }],
};
const CLOCK = { now: "n1", seconds_to_cutoff: 5400, promised_date: "2026-09-22", window_start: null, window_end: "20:00" };

function renderStep({ commerceEnabled = false, locale = "en", extra = {} } = {}) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      <ApproveAndConfirmStep
        catalogue={CATALOGUE}
        selection={{ size: "a5", turnaround: "standard" }}
        quote={null}
        commerceEnabled={commerceEnabled}
        clock={CLOCK}
        frontId={1}
        backId={null}
        sameAsFront
        sizeCode="a5"
        sizeChoice={null}
        ticks={{ approval: true, warnings: false }}
        onSetTick={vi.fn()}
        onClockExpire={vi.fn()}
        browsingLanguage={locale}
        locale={locale}
        idempotencyKey="key-1"
        onBack={vi.fn()}
        onSubmitted={vi.fn()}
        {...extra}
      />
    </NextIntlClientProvider>
  );
}

describe("ApproveAndConfirmStep with the Commerce switch off", () => {
  for (const locale of ["en", "ar"]) {
    it(`shows no money, address or payment wording (${locale})`, async () => {
      const { container } = renderStep({ locale });
      await screen.findByTestId("proof");
      const labels = [...container.querySelectorAll("label span, span, p, div")].map((n) => n.children.length === 0 ? n.textContent : "").join(" ");
      expect(labels).not.toMatch(MONEY);
      expect(container.querySelectorAll("input[type=text]")).toHaveLength(5); // name, mobile, email, company, note
    });
  }

  it("prefills +971 and enables Submit only for a valid name and mobile", async () => {
    const { container } = renderStep();
    await screen.findByTestId("proof");
    const [name, mobile] = container.querySelectorAll("input[type=text]");
    const submit = screen.getByRole("button", { name: en.ApproveAndConfirmStep.submit });
    expect(mobile.value).toBe("+971");
    expect(submit.disabled).toBe(true);
    fireEvent.change(name, { target: { value: "Layla" } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(mobile, { target: { value: "+971 50 123 4567" } });
    expect(submit.disabled).toBe(false);
  });

  it("keeps Submit disabled until the approval tick is on", async () => {
    const { container } = renderStep({ extra: { ticks: { approval: false, warnings: false } } });
    await screen.findByTestId("proof");
    const [name, mobile] = container.querySelectorAll("input[type=text]");
    fireEvent.change(name, { target: { value: "Layla" } });
    fireEvent.change(mobile, { target: { value: "+971501234567" } });
    expect(screen.getByRole("button", { name: en.ApproveAndConfirmStep.submit }).disabled).toBe(true);
  });

  it("posts contact details and no total, then hands the Order on", async () => {
    const order = { token: "tok", number: "HUR-10001" };
    const fetchMock = vi.fn(async () => ({ status: 201, json: async () => order }));
    vi.stubGlobal("fetch", fetchMock);
    const onSubmitted = vi.fn();
    const { container } = renderStep({ extra: { onSubmitted } });
    await screen.findByTestId("proof");
    const [name, mobile] = container.querySelectorAll("input[type=text]");
    fireEvent.change(name, { target: { value: "Layla" } });
    fireEvent.change(mobile, { target: { value: "+971 50 123 4567" } });
    fireEvent.click(screen.getByRole("button", { name: en.ApproveAndConfirmStep.submit }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(order));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contact).toMatchObject({ name: "Layla", mobile: "+971501234567" });
    expect(body).not.toHaveProperty("delivery");
    expect(body).not.toHaveProperty("expected_total_fils");
    expect(body.expected_promised_date).toBe("2026-09-22");
    expect(body.idempotency_key).toBe("key-1");
  });

  it("on a 409 refreshes, clears the ticks and shows a notice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 409, json: async () => ({ code: "stale" }) })));
    const onClockExpire = vi.fn();
    const { container } = renderStep({ extra: { onClockExpire } });
    await screen.findByTestId("proof");
    const [name, mobile] = container.querySelectorAll("input[type=text]");
    fireEvent.change(name, { target: { value: "Layla" } });
    fireEvent.change(mobile, { target: { value: "+971501234567" } });
    fireEvent.click(screen.getByRole("button", { name: en.ApproveAndConfirmStep.submit }));
    expect(await screen.findByText(en.ApproveAndConfirmStep.staleNotice)).toBeTruthy();
    expect(onClockExpire).toHaveBeenCalled();
  });
});

describe("ApproveAndConfirmStep with the Commerce switch on", () => {
  it("still asks for the delivery address", async () => {
    const quote = { subtotal_aed: "10.00", vat_aed: "0.50", total_aed: "10.50" };
    const { container } = renderStep({ commerceEnabled: true, extra: { quote } });
    await screen.findByTestId("proof");
    expect(container.querySelectorAll("input[type=text]")).toHaveLength(7);
    expect(container.textContent).toMatch(/AED 10\.50/);
  });
});

describe("Edit options and Change file shortcuts (ticket 06)", () => {
  for (const locale of ["en", "ar"]) {
    const m = (locale === "ar" ? ar : en).ApproveAndConfirmStep;

    it(`Edit options and a single Change file for a same-as-front Order (${locale})`, async () => {
      const onEdit = vi.fn();
      renderStep({ locale, extra: { onEdit } });
      await screen.findByTestId("proof");
      fireEvent.click(screen.getByRole("button", { name: m.editOptions }));
      expect(onEdit).toHaveBeenLastCalledWith("options");
      expect(screen.queryByRole("button", { name: m.changeFileBack })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: m.changeFileFront }));
      expect(onEdit).toHaveBeenLastCalledWith("front");
    });
  }

  it("offers Change file for Back when Back is its own file", async () => {
    const { fetchPreview } = await import("@/lib/preview");
    fetchPreview.mockResolvedValueOnce({
      front: { findings: [], thumbnail_url: "/f.png" },
      back: { same_as_front: false, findings: [], thumbnail_url: "/b.png" },
      ordered_trim_mm: [148, 210],
    });
    const onEdit = vi.fn();
    renderStep({ extra: { onEdit, backId: 2, sameAsFront: false } });
    await screen.findAllByTestId("proof");
    fireEvent.click(screen.getByRole("button", { name: en.ApproveAndConfirmStep.changeFileBack }));
    expect(onEdit).toHaveBeenLastCalledWith("back");
  });
});
