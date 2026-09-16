import { expect, test } from "@playwright/test";

test("VIP blackjack mobile and desktop: gated lazy art, purchase, resume and atomic comp", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [], vipImages = new Set<string>();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (/temerosa-vip\/.*\.webp/.test(request.url())) vipImages.add(request.url()); });
  // A bounded deterministic world-line sample, not today's multi-month replay.
  await page.clock.setFixedTime(new Date("2026-08-02T00:00:00.000Z"));
  await page.route("**/temerosa-margin/0.8.0/manifest.json", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), date: "Sun, 02 Aug 2026 00:00:00 GMT", age: "0" } });
  });
  await page.goto("/play/temerosa-vip-blackjack");
  await expect(page.getByRole("heading", { name: "VIP 회원권이 필요합니다." })).toBeVisible();
  expect(vipImages.size).toBe(0);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("lucky-arcade");
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(["vip", "wallet", "game-wagers"], "readwrite");
      tx.objectStore("vip").clear();
      tx.objectStore("wallet").put({ id: "wallet", contract: "wallet/0.1", balance: 10_000, updatedAt: "2026-08-02T00:00:00.000Z" });
      for (let i = 0; i < 20; i++) tx.objectStore("game-wagers").put({ contract: "game-wager/0.1", wagerId: `public-${i}`, outcomeKey: `public-${i}`, cabinetId: "temerosa-slot", sessionId: "public", termsVersion: "public/1", stake: 10, reservedAmount: 10, status: "settled", settlementCredit: i % 2 ? 0 : 20, createdAt: "2026-08-01T00:00:00.000Z" });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    }; request.onerror = () => reject(request.error);
  }));
  await page.goto("/venues/temerosa-casino");
  await expect(page.locator(".vip-door")).toHaveAttribute("data-state", "purchasable");
  expect(vipImages.size).toBe(0);
  await page.locator(".vip-door").getByRole("button", { name: "회원권 구매 · 1,000 P" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "1,000 P로 구매" }).click();
  await expect(page.locator(".vip-door")).toHaveAttribute("data-state", "open");
  await page.locator(".vip-door").getByRole("button", { name: "입장", exact: true }).click();
  await expect(page.getByRole("heading", { name: "VIP 블랙잭" })).toBeVisible();
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await page.getByRole("button", { name: "앉기", exact: true }).click();
  await expect(page.locator(".vip-host-art img").first()).toBeVisible();
  expect(vipImages.size).toBeLessThanOrEqual(3);
  expect(await page.locator(".vip-host-art img").count()).toBeLessThanOrEqual(2);
  expect(await page.locator(".vip-host-art img").first().evaluate((image) => getComputedStyle(image).objectFit)).toBe("contain");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("vip-room.png"), fullPage: true });
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.locator(".vip-hand")).toHaveCount(2, { timeout: 30_000 });
  const before = await vipState(page);
  expect(before.wagers).toHaveLength(1);
  await page.reload();
  await expect(page.locator(".vip-hand")).toHaveCount(2);
  expect((await vipState(page)).wagers[0].wagerId).toBe(before.wagers[0].wagerId);
  if (await page.getByRole("button", { name: "멈추기", exact: true }).count()) await page.getByRole("button", { name: "멈추기", exact: true }).click();
  await expect(page.locator(".vip-result")).toBeVisible();
  const after = await vipState(page);
  expect(after.comp.wageredTotal).toBe(200);
  expect(after.wagers[0].status).toBe("settled");
  expect(after.wallet.balance).toBe(8_800 + after.wagers[0].settlementCredit);
  await page.reload();
  await expect(page.locator(".vip-result")).toBeVisible();
  expect(await vipState(page)).toEqual(after);
  expect(errors).toEqual([]);
});

async function vipState(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const db = await new Function("return import('/src/lib/database.ts')")();
    return { wallet: await db.readWallet(), comp: (await db.readVipStatus()).comp, wagers: await db.listGameWagers("temerosa-vip-blackjack:main") };
  });
}
