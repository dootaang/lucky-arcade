import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const unlock = readFileSync("apps/web/src/routes/admin-preview-route.tsx", "utf8").match(/const PASSWORD_SHA256 = "([a-f0-9]+)"/)![1]!;
const previewKey = "lucky-arcade:vip-blackjack-preview:0.1";

test("VIP admin preview mobile: private wallet, refresh, tools and lazy portraits", async ({ page }, testInfo) => {
  const images = new Set<string>(), errors: string[] = [];
  let liveAdapterRequests = 0;
  page.on("request", (request) => {
    if (/temerosa-vip\/.*\.webp/.test(request.url())) images.add(request.url());
    if (request.url().includes("vip-live-session")) liveAdapterRequests++;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const probe = { workers: 0 };
    Object.assign(window, { vipProbe: probe });
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); probe.workers++; }
    };
    crypto.randomUUID = () => "00000000-0000-4000-8000-000000000001";
  });
  await page.goto("/play/temerosa-vip-blackjack");
  await expect(page.getByRole("heading", { name: "VIP 회원권이 필요합니다." })).toBeVisible();
  const realBefore = await realRecords(page);
  await page.goto("/preview/temerosa-vip-blackjack");
  await expect(page.getByLabel("관리자 비밀번호")).toBeVisible();
  expect(images.size).toBe(0);
  await page.getByLabel("관리자 비밀번호").fill("wrong-password");
  await page.getByRole("button", { name: "시험 입장", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("관리자 비밀번호가 맞지 않습니다.");
  await page.evaluate((hash) => sessionStorage.setItem("lucky-arcade:admin-preview:temerosa-vip-blackjack", hash), unlock);
  await page.reload();
  await expect(page.getByText("관리자 시험 · 실제 기록에 반영되지 않음", { exact: true })).toBeVisible();
  await expect(page.locator(".vip-room-header strong")).toHaveText("시험 10,000 P");
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await page.getByRole("button", { name: "앉기", exact: true }).click();
  expect(images.size).toBeLessThanOrEqual(3);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.locator(".vip-hand")).toHaveCount(2);
  const saved = await previewData(page);
  await page.reload();
  await expect(page.locator(".vip-hand")).toHaveCount(2);
  expect((await previewData(page)).state).toEqual(saved.state);
  if (await page.getByRole("button", { name: "멈추기", exact: true }).count()) await page.getByRole("button", { name: "멈추기", exact: true }).click();
  await expect(page.locator(".vip-result")).toBeVisible();
  const settled = await previewData(page);
  expect(settled.balance).toBe(9800 + settled.state.creditAmount);
  await page.reload();
  await expect(page.locator(".vip-result")).toBeVisible();
  expect(await previewData(page)).toEqual(settled);

  await page.getByText("관리자 시험 도구", { exact: true }).click();
  const art = page.getByLabel("박니은 이미지 · 29장");
  await expect(art.locator("option")).toHaveCount(30);
  const finalArt = await art.locator("option").last().getAttribute("value");
  const imageCount = images.size;
  await art.selectOption(finalArt!);
  await expect(page.locator(`.vip-host-art img[src*="${finalArt}"]`)).toBeVisible();
  expect(images.size - imageCount).toBeLessThanOrEqual(1);
  expect(await page.locator(".vip-host-art img").count()).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "컴프 4단계", exact: true }).click();
  await expect(page.locator(".vip-speech")).toContainText("연출 미리보기");
  expect(await previewData(page)).toEqual(settled);
  await page.getByRole("button", { name: "연출 확인 종료 · 게임으로" }).click();
  await page.getByRole("button", { name: "첫 입장 연출 다시 보기" }).click();
  await expect(page.getByRole("button", { name: "계속", exact: true })).toBeVisible();
  expect(await previewData(page)).toEqual(settled);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("vip-preview.png"), fullPage: true });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "시험 초기화 · 10,000 P" }).click();
  await expect(page.locator(".vip-room-header strong")).toHaveText("시험 10,000 P");
  expect((await previewData(page)).state.status).toBe("ready");
  expect(await realRecords(page)).toEqual(realBefore);
  expect(liveAdapterRequests).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { vipProbe: { workers: number } }).vipProbe.workers)).toBe(0);
  await page.goto("/play/temerosa-vip-blackjack");
  await expect(page.getByRole("heading", { name: "VIP 회원권이 필요합니다." })).toBeVisible();
  expect(errors).toEqual([]);
});

async function previewData(page: Page) {
  return page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), previewKey);
}
async function realRecords(page: Page) {
  return page.evaluate(() => new Promise<Record<string, unknown[]>>((resolve, reject) => {
    const request = indexedDB.open("lucky-arcade");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const names = [...db.objectStoreNames];
      const result: Record<string, unknown[]> = {};
      const tx = db.transaction(names, "readonly");
      for (const name of names) { const read = tx.objectStore(name).getAll(); read.onsuccess = () => { result[name] = read.result; }; }
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => reject(tx.error);
    };
  }));
}
