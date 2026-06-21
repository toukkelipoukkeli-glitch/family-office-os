import { expect, test, type Page } from "@playwright/test";

/** Strip everything but digits from a formatted money string. */
function digits(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

/** Set the global reporting currency from the dashboard switcher. */
async function setCurrency(page: Page, code: string): Promise<void> {
  await page.goto("/");
  const select = page.getByTestId("reporting-currency");
  await expect(select).toBeVisible();
  await select.selectOption(code);
  await expect(select).toHaveValue(code);
}

/**
 * m15-home-currency — the executive overview (`#/home`) re-expresses every
 * monetary figure in the active global reporting currency, through the same
 * `convertMoney` boundary every other value-bearing page uses.
 *
 * The headline net-worth tile is the oracle: switching the global base on the
 * dashboard must re-express it (and revert), with a genuinely different
 * magnitude (a real FX conversion, not a relabel).
 */
test.describe("executive overview re-expresses in the reporting currency", () => {
  test("the headline net worth re-expresses into EUR and reverts to USD", async ({
    page,
  }) => {
    // Baseline: USD on the executive overview.
    await setCurrency(page, "USD");
    await page.goto("/#/home");
    await expect(page.getByTestId("home-overview")).toBeVisible();

    const nwTile = page
      .getByTestId("home-kpi")
      .filter({ hasText: "Net worth" });
    const usd = nwTile.getByTestId("home-kpi-value");
    await expect(usd).toBeVisible();
    const usdText = (await usd.innerText()).trim();
    expect(usdText).toContain("$");
    expect(usdText).toBe("$7.22M");

    // The status-banner net-worth mirrors the tile.
    await expect(page.getByTestId("home-banner-networth")).toHaveText("$7.22M");

    // Switch the global base to EUR, return to the overview, and confirm the
    // headline now reads in EUR with a different magnitude (a real conversion).
    await setCurrency(page, "EUR");
    await page.goto("/#/home");
    await expect(page.getByTestId("home-overview")).toBeVisible();

    const eur = page
      .getByTestId("home-kpi")
      .filter({ hasText: "Net worth" })
      .getByTestId("home-kpi-value");
    await expect(eur).toBeVisible();
    const eurText = (await eur.innerText()).trim();
    expect(eurText).toMatch(/€|EUR/);
    expect(eurText).not.toContain("$");
    expect(digits(eurText)).not.toBe(digits(usdText));
    await expect(page.getByTestId("home-banner-networth")).toContainText(
      /€|EUR/,
    );

    // The liquidity tile's embedded min-balance figure re-expresses too, while
    // its runway month count stays a plain number.
    const liq = page.getByTestId("home-kpi").filter({ hasText: "Liquidity" });
    await expect(liq).toContainText(/min balance €/);
    await expect(liq.getByTestId("home-kpi-value")).not.toContainText("$");

    // Revert to USD: the headline returns to its base value exactly.
    await setCurrency(page, "USD");
    await page.goto("/#/home");
    const reverted = page
      .getByTestId("home-kpi")
      .filter({ hasText: "Net worth" })
      .getByTestId("home-kpi-value");
    await expect(reverted).toHaveText("$7.22M");
    await expect(page.getByTestId("home-banner-networth")).toHaveText("$7.22M");
  });

  test("non-monetary headline tiles are unaffected by the reporting currency", async ({
    page,
  }) => {
    await setCurrency(page, "EUR");
    await page.goto("/#/home");
    await expect(page.getByTestId("home-overview")).toBeVisible();

    // TWR stays a percentage; the runway value stays a month count.
    const twr = page.getByTestId("home-kpi").filter({ hasText: "TWR" });
    await expect(twr.getByTestId("home-kpi-value")).toHaveText("+16.27%");

    const liqValue = page
      .getByTestId("home-kpi")
      .filter({ hasText: "Liquidity" })
      .getByTestId("home-kpi-value");
    await expect(liqValue).toContainText(/mo$/);
    await expect(liqValue).not.toContainText(/[€$£]/);
  });
});
