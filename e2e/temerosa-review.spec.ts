import { expect, test } from "@playwright/test";

test("reviews a Temerosa expression and restores the decision", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });

  await page.goto("/review/temerosa");
  await expect(page.locator(".temerosa-review-stage")).toBeVisible();
  await expect(page.locator(".temerosa-review-candidate-grid button")).toHaveCount(3);
  await expect(page.locator(".temerosa-review-portrait img")).toHaveJSProperty("complete", true);

  await page.locator(".temerosa-review-candidate-grid button").nth(1).click();
  await page.locator(".temerosa-review-actions .approve").click();
  await expect(page.locator('.temerosa-review-scenes i[data-status="approved"]')).toHaveCount(1);

  await page.reload();
  await expect(page.locator(".temerosa-review-candidate-grid button").nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".temerosa-review-actions .approve")).toHaveClass(/active/);
  expect(browserErrors).toEqual([]);
});

test("keeps Temerosa review controls usable on mobile", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  await page.goto("/review/temerosa");
  await expect(page.locator(".temerosa-review-stage")).toBeVisible();
  await page.locator(".temerosa-review-actions .approve").scrollIntoViewIfNeeded();
  await expect(page.locator(".temerosa-review-actions .approve")).toBeInViewport();
  await page.locator(".temerosa-review-actions .hold").click();
  await expect(page.locator('.temerosa-review-scenes i[data-status="hold"]')).toHaveCount(1);
});
