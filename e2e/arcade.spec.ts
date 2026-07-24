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
  await expect(page.getByRole("button", { name: "내 카드" })).toBeVisible();
});

test("opens built-in quick cabinets without a card", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "기다리는 동안, 바로 한 판" })).toBeVisible();
  await expect(page.locator(".arcade-entry")).toHaveCount(4);
  await page.locator(".arcade-entry").filter({ hasText: "소녀전선 최애 월드컵" }).getByRole("button", { name: "바로 시작" }).click();
  await expect(page.getByRole("heading", { name: "최애 월드컵" })).toBeVisible();
  for (let pick = 0; pick < 11; pick += 1) await page.locator(".favorite-choice").first().click();
  await expect(page.getByText("오늘의 최애", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "다른 놀이 보기" }).click();
  await page.locator(".arcade-entry").filter({ hasText: "작전 암호 기억" }).getByRole("button", { name: "바로 시작" }).click();
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.locator(".memory-portrait img")).toBeVisible();
  await expect(page.locator(".memory-grid")).toBeVisible({ timeout: 4_000 });
});

test("replays one deterministic derby through all four rendering engines", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/");
  await page.locator(".arcade-entry").filter({ hasText: "럭키★더비 엔진 실험장" }).getByRole("button", { name: "바로 시작" }).click();
  await expect(page.getByRole("heading", { name: "럭키★더비 엔진 실험장" })).toBeVisible();
  for (const engine of ["Phaser 4", "melonJS", "Excalibur", "LittleJS"]) {
    await page.getByRole("tab", { name: new RegExp(`^${engine}`) }).click();
    await expect(page.getByText("완주 · 결과가 모든 엔진에서 동일합니다")).toBeVisible({ timeout: 12_000 });
    await expect(page.locator(".derby-stage canvas").first()).toBeVisible();
    await expect.poll(() => page.locator(".derby-stage canvas").count()).toBeLessThanOrEqual(2);
  }
  await expect(page.locator(".derby-metrics article").filter({ hasText: "완주 검증" })).toHaveCount(4);
  expect(browserErrors).toEqual([]);
});

test("mobile derby keeps the race and controls on screen", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  await page.goto("/");
  await page.locator(".arcade-entry").filter({ hasText: "럭키★더비 엔진 실험장" }).getByRole("button", { name: "바로 시작" }).click();
  await expect(page.getByRole("heading", { name: "럭키★더비 엔진 실험장" })).toBeVisible();
  await expect(page.locator(".derby-stage")).toBeInViewport();
  await expect(page.getByRole("button", { name: "4엔진 자동 비교" })).toBeVisible();
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

test("opens the built-in GFL operation, resolves combat, and restores the reward step", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  await page.goto("/");
  await page.getByRole("button", { name: "작전 시작", exact: true }).click();
  await expect(page.getByRole("heading", { name: "첫 제대를 편성하세요" })).toBeVisible();
  await expect(page.locator(".doll-grid img")).toHaveCount(12);
  await page.getByRole("button", { name: "화력 제대", exact: true }).click();
  await page.getByRole("button", { name: "작전 지도 진입", exact: true }).click();
  for (let depth = 0; depth < 3 && await page.locator(".route-node.battle, .route-node.elite").count() === 0; depth += 1) {
    await page.locator(".route-node").first().click();
    await page.locator(".reward-grid button").first().click();
  }
  await page.locator(".route-node.battle, .route-node.elite").first().click();
  await expect(page.getByRole("heading", { name: /준비/ })).toBeVisible();
  await page.getByRole("button", { name: "전투 영수증 확정", exact: true }).click();
  await expect(page.locator("canvas.gfl-battle-canvas")).toBeVisible();
  await page.getByRole("button", { name: "4×", exact: true }).click();
  await expect(page.getByRole("button", { name: "전투 보고 확인", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "전투 보고 확인", exact: true }).click();
  await expect(page.getByRole("heading", { name: "하나를 회수하세요" })).toBeVisible();
  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.getByRole("region", { name: "이어하기" })).toContainText("보상 선택");
  await page.getByRole("button", { name: "잔불 작전 이어하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "하나를 회수하세요" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});
