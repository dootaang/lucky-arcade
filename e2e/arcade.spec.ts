import { expect, test } from "@playwright/test";

const entries = Array.from({ length: 4 }, (_, index) => [
  { id: `start-${index}`, name: `입구 ${index}`, keys: [`시작-${index}`], content: `중간-${index}`, enabled: true },
  { id: `middle-${index}`, name: `복도 ${index}`, keys: [`중간-${index}`], content: `마지막-${index}`, enabled: true },
  { id: `target-${index}`, name: `보물 ${index}`, keys: [`마지막-${index}`], content: `발굴 완료 ${index}`, enabled: true },
]).flat();
const card = JSON.stringify({ spec: "chara_card_v3", spec_version: "3.0", data: { name: "E2E 유적 카드", character_book: { entries } } });
const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const portraitCard = (people: number, variants: number, name: string) => JSON.stringify({ spec: "chara_card_v3", spec_version: "3.0", data: { name, assets: Array.from({ length: people }, (_, person) => Array.from({ length: variants }, (_, variant) => ({ name: `Hero${String.fromCharCode(65 + person)}_${variant === 0 ? "default" : `emotion${variant}`}`, ext: "png", uri: `data:image/png;base64,${pixel}` }))).flat() } });

test("imports a local card, plays a deterministic puzzle, and restores it", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: "e2e-card.json", mimeType: "application/json", buffer: Buffer.from(card) });
  await expect(page.getByRole("heading", { name: "E2E 유적 카드" })).toBeVisible();
  await expect(page.getByText("4", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /게임 시작/ }).last().click();
  await page.getByRole("button", { name: "회로 가동" }).click();
  await page.locator(".clue-list button").first().click();
  await page.locator(".clue-list button").first().click();
  await expect(page.getByRole("heading", { name: "1000점" })).toBeVisible();
  await page.getByRole("button", { name: "분석 화면으로 돌아가기" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "E2E 유적 카드" })).toBeVisible();
  await page.getByRole("button", { name: /게임 시작/ }).last().click();
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

test("mobile favorite choice does not stay highlighted in the next round", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: "favorite-mobile.json", mimeType: "application/json", buffer: Buffer.from(portraitCard(8, 3, "모바일 월드컵 카드")) });
  await expect(page.getByRole("heading", { name: "최애 월드컵" })).toBeVisible();
  await page.locator(".favorite-choice").first().click();
  await expect(page.locator(".favorite-choice:focus")).toHaveCount(0);
  await expect.poll(() => page.locator(".favorite-choice").first().evaluate((element) => getComputedStyle(element).transform)).toBe("none");
});

test("opens a card into the favorite cup and completes every round", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: "favorite.json", mimeType: "application/json", buffer: Buffer.from(portraitCard(8, 3, "E2E 월드컵 카드")) });
  await expect(page.getByRole("heading", { name: "최애 월드컵" })).toBeVisible();
  for (let pick = 0; pick < 7; pick += 1) await page.locator(".favorite-choice").first().click();
  await expect(page.getByText("오늘의 최애", { exact: true })).toBeVisible();
  await expect(page.locator(".favorite-result")).toContainText("화면을 캡처해 자랑해 보세요");
});

test("falls back to restoration crew and finishes a run", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: "restoration.json", mimeType: "application/json", buffer: Buffer.from(portraitCard(4, 3, "E2E 복구 카드")) });
  await expect(page.getByRole("heading", { name: "카드 복구반" })).toBeVisible();
  for (let problem = 0; problem < 4; problem += 1) {
    await page.locator(".identity-case button, .intruder-grid button").first().click();
    await page.getByRole("button", { name: problem === 3 ? "결과 보기" : "다음 기록" }).click();
  }
  await expect(page.getByText("복구 완료", { exact: true })).toBeVisible();
});
