import { expect, test } from "@playwright/test";

test("homepage shows the app heading", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /family office os/i }),
  ).toBeVisible();
});
