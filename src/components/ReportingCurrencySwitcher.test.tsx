import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ReportingCurrencySwitcher } from "./ReportingCurrencySwitcher";
import {
  REPORTING_CURRENCY_STORAGE_KEY,
  ReportingCurrencyProvider,
  useReportingCurrency,
} from "@/lib/reporting-currency";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

function Probe() {
  const { currency } = useReportingCurrency();
  return <output data-testid="probe">{currency}</output>;
}

describe("ReportingCurrencySwitcher", () => {
  it("renders nothing without a provider (graceful degrade)", () => {
    const { container } = render(<ReportingCurrencySwitcher />);
    expect(container.querySelector("select")).toBeNull();
  });

  it("defaults to USD and lists every supported currency", () => {
    render(
      <ReportingCurrencyProvider>
        <ReportingCurrencySwitcher />
      </ReportingCurrencyProvider>,
    );
    const select = screen.getByTestId("reporting-currency") as HTMLSelectElement;
    expect(select.value).toBe("USD");
    const codes = [...select.options].map((o) => o.value);
    expect(codes).toEqual(["USD", "EUR", "GBP", "CHF"]);
  });

  it("starts from the persisted preference", () => {
    localStorage.setItem(REPORTING_CURRENCY_STORAGE_KEY, "EUR");
    render(
      <ReportingCurrencyProvider>
        <ReportingCurrencySwitcher />
      </ReportingCurrencyProvider>,
    );
    expect(
      (screen.getByTestId("reporting-currency") as HTMLSelectElement).value,
    ).toBe("EUR");
  });

  it("switching updates the shared state and persists it", async () => {
    const user = userEvent.setup();
    render(
      <ReportingCurrencyProvider>
        <ReportingCurrencySwitcher />
        <Probe />
      </ReportingCurrencyProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("USD");

    await user.selectOptions(screen.getByTestId("reporting-currency"), "GBP");

    expect(screen.getByTestId("probe")).toHaveTextContent("GBP");
    expect(localStorage.getItem(REPORTING_CURRENCY_STORAGE_KEY)).toBe("GBP");
  });

  it("is hidden from print", () => {
    render(
      <ReportingCurrencyProvider>
        <ReportingCurrencySwitcher />
      </ReportingCurrencyProvider>,
    );
    expect(
      screen.getByTestId("reporting-currency").closest("label"),
    ).toHaveClass("print:hidden");
  });
});
