import { expect, test } from "@playwright/test";

test("mobile startup feedback paints before the entry JavaScript and reports failure", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/src/main.tsx", async (route) => { await gate; await route.abort(); });
  try {
    await page.goto("/venues/temerosa-casino", { waitUntil: "commit" });
    await expect(page.locator("#app-startup-message")).toHaveText("럭키 오락실을 불러오고 있습니다.");
    await expect(page.locator("#app-startup-ring")).toBeVisible();
    release();
    await expect(page.locator("#app-startup-message")).toContainText("화면을 불러오지 못했습니다.");
    await expect(page.getByRole("link", { name: "다시 불러오기" })).toBeVisible();
  } finally { release(); }
});

test("mobile casino chunk loading stays above the felt with usable game entries", async ({ page }, testInfo) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/casino-ledger-view.tsx*", async (route) => { await gate; await route.abort(); });
  try {
    await page.goto("/venues/temerosa-casino", { waitUntil: "domcontentloaded" });
    const panel = page.locator(".casino-ledger-loading");
    await expect(panel.getByRole("heading")).toHaveText("카지노를 준비하고 있습니다.");
    await expect(panel.locator(".casino-loading-games button")).toHaveCount(6);
    await expect(panel.getByRole("button", { name: "도둑잡기 시작", exact: true })).toBeEnabled();
    await expect(panel).toHaveCSS("position", "relative");
    await expect(panel).toHaveCSS("z-index", "1");
    await expect(page.locator(".floor-backdrop")).toHaveCSS("z-index", "0");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(panel.locator(".casino-loading-indicator")).toHaveCSS("animation-name", "none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.screenshot({ path: testInfo.outputPath("casino-loading.png") });
    release();
    await expect(panel.getByRole("heading")).toHaveText("카지노 기록을 불러오지 못했습니다.");
    await expect(panel.getByRole("button", { name: "다시 시도", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "도둑잡기 시작", exact: true }).click();
    await expect(page).toHaveURL(/\/play\/temerosa-old-maid$/);
  } finally { release(); }
});

test("mobile casino worker failure retries only on request and keeps navigation", async ({ page }) => {
  // No expensive history replay: exercise the real client/view error path.
  await page.addInitScript(() => {
    const state = { floors: 0 };
    Object.assign(window, { loadingProbe: state });
    window.Worker = class extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage(message: { id?: number; method: string }) {
        if (message.method !== "floor") return;
        state.floors++;
        if (state.floors === 1) setTimeout(() => this.onmessage?.(new MessageEvent("message", { data: { id: message.id, error: "test_worker_failure" } })), 10);
      }
      terminate() { /* No native worker was started. */ }
    } as unknown as typeof Worker;
  });
  await page.goto("/venues/temerosa-casino");
  const panel = page.locator(".casino-ledger-loading");
  await expect(panel.getByRole("heading")).toHaveText("카지노 기록을 불러오지 못했습니다.");
  await page.clock.install();
  await page.clock.runFor(3_000);
  expect(await page.evaluate(() => (window as unknown as { loadingProbe: { floors: number } }).loadingProbe.floors)).toBe(1);
  await panel.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(panel.getByRole("heading")).toHaveText("카지노 기록을 불러오는 중입니다.");
  expect(await page.evaluate(() => (window as unknown as { loadingProbe: { floors: number } }).loadingProbe.floors)).toBe(2);
  await page.clock.runFor(15_001);
  await expect(panel).toContainText("예상보다 시간이 걸리고 있습니다.");
  expect(await page.evaluate(() => (window as unknown as { loadingProbe: { floors: number } }).loadingProbe.floors)).toBe(2);
  await panel.getByRole("link", { name: "로비로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("mobile casino replaces loading feedback when the real worker is ready", async ({ page }) => {
  // Bounded date keeps this a loading lifecycle test rather than a 45-day audit.
  await page.route("**/content/temerosa-margin/0.8.0/manifest.json", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), date: "Sun, 02 Aug 2026 03:00:00 GMT", age: "0" } });
  });
  await page.goto("/venues/temerosa-casino");
  await expect(page.locator(".casino-live-grid")).toBeVisible();
  await expect(page.locator(".casino-ledger-loading")).toHaveCount(0);
  await expect(page.locator("#app-startup")).toHaveCount(0);
});
