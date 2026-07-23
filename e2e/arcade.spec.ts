import { expect, test } from "@playwright/test";

const entries = Array.from({ length: 4 }, (_, index) => [
  { id: `start-${index}`, name: `입구 ${index}`, keys: [`시작-${index}`], content: `중간-${index}`, enabled: true },
  { id: `middle-${index}`, name: `복도 ${index}`, keys: [`중간-${index}`], content: `마지막-${index}`, enabled: true },
  { id: `target-${index}`, name: `보물 ${index}`, keys: [`마지막-${index}`], content: `발굴 완료 ${index}`, enabled: true },
]).flat();
const card = JSON.stringify({ spec: "chara_card_v3", spec_version: "3.0", data: { name: "E2E 유적 카드", character_book: { entries } } });

test("imports a local card, plays a deterministic puzzle, and restores it", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: "e2e-card.json", mimeType: "application/json", buffer: Buffer.from(card) });
  await expect(page.getByRole("heading", { name: "E2E 유적 카드" })).toBeVisible();
  await expect(page.getByText("4", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /게임 시작/ }).click();
  await page.getByRole("button", { name: "회로 가동" }).click();
  await page.locator(".clue-list button").first().click();
  await page.locator(".clue-list button").first().click();
  await expect(page.getByRole("heading", { name: "1000점" })).toBeVisible();
  await page.getByRole("button", { name: "분석 화면으로 돌아가기" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "E2E 유적 카드" })).toBeVisible();
  await page.getByRole("button", { name: /게임 시작/ }).click();
  await expect(page.getByRole("heading", { name: "1000점" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("mobile navigation remains reachable", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  await page.goto("/");
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();
  await expect(page.getByRole("button", { name: "카드 보관함" })).toBeVisible();
});
