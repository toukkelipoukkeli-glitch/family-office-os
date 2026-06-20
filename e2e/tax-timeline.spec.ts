import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = join(here, "evidence", "m11-tax-timeline");

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

test.describe("unified tax timeline", () => {
  test("navigates from the dashboard to the timeline and back", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();

    await page.getByTestId("nav-tax-timeline").click();
    await expect(page).toHaveURL(/#\/tax-timeline$/);
    await expect(
      page.getByRole("heading", { name: /^tax timeline$/i }),
    ).toBeVisible();
    await expect(page.getByTestId("taxtimeline-page")).toBeVisible();

    await page.getByTestId("timeline-back").click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByRole("heading", { name: "Family Office OS" }),
    ).toBeVisible();
  });

  test.describe("on the tax-timeline route", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/#/tax-timeline");
      await expect(page.getByTestId("taxtimeline-page")).toBeVisible();
    });

    test("renders KPIs, the year track and the ordered event list", async ({
      page,
    }) => {
      await expect(page.getByTestId("kpi-tax")).toContainText(/\$250/);
      // Compact notation renders "$21K" or "$21.0K" depending on the browser's
      // ICU version, so accept both forms.
      await expect(page.getByTestId("kpi-harvest")).toContainText(/\$21(\.0)?K/);
      await expect(page.getByTestId("kpi-deadlines")).toContainText("7");

      const track = page.getByTestId("year-track");
      await expect(track).toBeVisible();
      await expect(track.getByTestId("track-row")).toHaveCount(5);
      await expect(
        track.getByTestId("track-window").first(),
      ).toBeVisible();

      const rows = page.getByTestId("event-list").getByTestId("event-row");
      await expect(rows).toHaveCount(14);
      await expect(rows.first()).toHaveAttribute("data-id", "estate-review");
      await expect(rows.last()).toHaveAttribute("data-id", "filing-return");
    });

    test("filters the event list by category", async ({ page }) => {
      await page.getByTestId("filter-estimated-tax").click();
      const rows = page.getByTestId("event-list").getByTestId("event-row");
      await expect(rows).toHaveCount(4);
      await expect(rows.first()).toHaveAttribute(
        "data-category",
        "estimated-tax",
      );
      // Toggle off restores the full timeline.
      await page.getByTestId("filter-all").click();
      await expect(
        page.getByTestId("event-list").getByTestId("event-row"),
      ).toHaveCount(14);
    });

    test("captures desktop evidence (1280x800)", async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("event-list")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "tax-timeline-desktop.png"),
        fullPage: true,
      });
    });

    test("captures desktop evidence with a filter applied", async ({
      page,
    }) => {
      await page.setViewportSize(DESKTOP);
      await page.getByTestId("filter-harvest").click();
      await expect(
        page.getByTestId("event-list").getByTestId("event-row").first(),
      ).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "tax-timeline-filtered.png"),
        fullPage: true,
      });
    });

    test("captures mobile evidence (390x844)", async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await expect(page.getByTestId("kpi-tax")).toBeVisible();
      await expect(page.getByTestId("event-list")).toBeVisible();
      await page.screenshot({
        path: join(EVIDENCE_DIR, "tax-timeline-mobile.png"),
        fullPage: true,
      });
    });
  });
});
