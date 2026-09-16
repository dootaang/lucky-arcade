import { expect, test } from "@playwright/test";

test("mobile and desktop casino remain responsive beyond the historical cache window", async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/content/temerosa-margin/0.8.0/manifest.json", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), date: "Wed, 16 Sep 2026 03:00:00 GMT", age: "0", "cache-control": "no-store" } });
  });
  await page.addInitScript(() => {
    const diagnostics = { beats: 0, longTasks: [] as number[], presenceRequests: 0 };
    Object.assign(window, { casinoPerf: diagnostics });
    setInterval(() => { diagnostics.beats++; }, 100);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.startTime > 1_000) diagnostics.longTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
    const BrowserWorker = window.Worker;
    window.Worker = class extends BrowserWorker {
      override postMessage(message: unknown, transfer: Transferable[]): void;
      override postMessage(message: unknown, options?: StructuredSerializeOptions): void;
      override postMessage(message: unknown, options?: StructuredSerializeOptions | Transferable[]): void {
        if ((message as { method?: string })?.method === "presence") diagnostics.presenceRequests++;
        if (Array.isArray(options)) super.postMessage(message, options); else super.postMessage(message, options);
      }
    };
  });
  await page.goto("/venues/temerosa-casino");
  // First-ever history recovery must not lock even the loading UI.
  await expect(page.getByRole("button", { name: "도둑잡기 시작", exact: true })).toBeEnabled();
  await page.waitForTimeout(2_000);
  expect(await page.evaluate(() => (window as unknown as { casinoPerf: { beats: number } }).casinoPerf.beats)).toBeGreaterThan(10);
  await expect(page.locator(".casino-side-market")).toBeVisible({ timeout: 70_000 });
  await page.waitForTimeout(2_000);
  const maximumTask = await page.evaluate(() => Math.max(0, ...(window as unknown as { casinoPerf: { longTasks: number[] } }).casinoPerf.longTasks));
  expect(maximumTask).toBeLessThan(1_000);
  console.log(`${testInfo.project.name}: maximum UI long task after startup = ${maximumTask.toFixed(0)} ms`);

  // Exercise the actual built worker and the native card-flight experience.
  const market = page.locator(".casino-side-market");
  await market.locator(".side-market-recent button").filter({ hasText: "도둑잡기" }).first().click();
  await market.getByRole("button", { name: "처음부터 다시 보기", exact: true }).click();
  const replay = page.getByRole("dialog", { name: /도둑잡기.*관전/ });
  await expect(replay.locator(".old-maid-shell")).toBeVisible({ timeout: 20_000 });
  await expect(replay.locator(".old-maid-deal-card").first()).toBeVisible();
  await replay.getByRole("button", { name: "오락실로 돌아가기", exact: true }).click();

  // SPA entry keeps the shared worker; once cards are dealt, invitations stop.
  await page.locator(".table-card.playable").filter({ hasText: "도둑잡기" }).getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.locator(".old-maid-random")).toBeEnabled({ timeout: 15_000 });
  await page.locator(".old-maid-random").click();
  await page.locator(".old-maid-start-actions .old-maid-primary").click();
  await expect(page.locator(".old-maid-start-actions")).toHaveCount(0);
  const requests = await page.evaluate(() => (window as unknown as { casinoPerf: { presenceRequests: number } }).casinoPerf.presenceRequests);
  await page.waitForTimeout(6_000);
  expect(await page.evaluate(() => (window as unknown as { casinoPerf: { presenceRequests: number } }).casinoPerf.presenceRequests)).toBe(requests);
  expect(errors).toEqual([]);
});
