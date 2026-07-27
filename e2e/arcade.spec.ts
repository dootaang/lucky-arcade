import { expect, test } from "@playwright/test";

const entries = Array.from({ length: 4 }, (_, index) => [
  { id: `start-${index}`, name: `입구 ${index}`, keys: [`시작-${index}`], content: `중간-${index}`, enabled: true },
  { id: `middle-${index}`, name: `복도 ${index}`, keys: [`중간-${index}`], content: `마지막-${index}`, enabled: true },
  { id: `target-${index}`, name: `보물 ${index}`, keys: [`마지막-${index}`], content: `발굴 완료 ${index}`, enabled: true },
]).flat();
const card = JSON.stringify({ spec: "chara_card_v3", spec_version: "3.0", data: { name: "E2E 유적 카드", character_book: { entries } } });
const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const portraitCard = (people: number, variants: number, name: string) => JSON.stringify({ spec: "chara_card_v3", spec_version: "3.0", data: { name, assets: Array.from({ length: people }, (_, person) => Array.from({ length: variants }, (_, variant) => ({ name: `Hero${String.fromCharCode(65 + person)}_${variant === 0 ? "default" : `emotion${variant}`}`, ext: "png", uri: `data:image/png;base64,${pixel}` }))).flat() } });
const oldMaidCard = (people: number, name: string) => JSON.stringify({ spec: "chara_card_v3", spec_version: "3.0", data: { name, assets: Array.from({ length: people }, (_, person) => ["default", "happy", "angry"].map((emotion) => ({ name: `Hero${String.fromCharCode(65 + person)}_${emotion}`, ext: "png", uri: `data:image/png;base64,${pixel}` }))).flat() } });

test("imports a local card, plays a deterministic puzzle, and restores it", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  await page.goto("/dev");
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

test("mobile navigation and Venue floor remain reachable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile !== true);
  await page.goto("/");
  const mobileHero = await page.locator(".venue-art").boundingBox();
  expect((mobileHero?.width ?? 0) / (mobileHero?.height ?? 1)).toBeCloseTo(16 / 9, 1);
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();
  await expect(page.getByRole("button", { name: "로비" })).toBeVisible();
  await expect(page.getByRole("button", { name: "카지노", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "카지노", exact: true }).click();
  await expect(page.getByRole("heading", { name: "테이블을 골라주세요" })).toBeVisible();
  await expect(page.locator(".table-card.playable").filter({ hasText: "도둑잡기" }).getByRole("button", { name: "시작", exact: true })).toBeInViewport();
});

test("opens the sole public Venue with four open tables and five announced tables", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".venue-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "테메로세 카지노" })).toBeVisible();
  await expect(page.getByText("내 카드로 놀기")).toHaveCount(0);
  await page.getByRole("button", { name: "카지노 입장" }).click();
  await expect(page.locator(".table-card.playable")).toHaveCount(4);
  await expect(page.locator(".table-card.playable").filter({ hasText: "도둑잡기" }).getByRole("button", { name: "시작", exact: true })).toBeVisible();
  await expect(page.locator(".table-card.playable").filter({ hasText: "짝맞추기" }).getByRole("button", { name: "시작", exact: true })).toBeVisible();
  await expect(page.locator(".table-card.playable").filter({ hasText: "슬롯 777" })).toContainText("10 P부터");
  await expect(page.locator(".table-card.coming-soon").filter({ hasText: "텍사스 홀덤" })).toContainText("개장 준비 중");
  await expect(page.locator(".table-card.coming-soon")).toHaveCount(7);
  await expect(page.locator(".table-card.coming-soon button")).toHaveCount(0);
  await page.locator(".table-card.playable").filter({ hasText: "도둑잡기" }).getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByRole("heading", { name: "도둑잡기", exact: true })).toBeVisible();
});

test("loads the living ledger lazily and reuses the casino manifest in a game", async ({ page }) => {
  let casinoManifestRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/content/temerosa-margin/0.8.0/manifest.json")) casinoManifestRequests += 1;
  });
  await page.goto("/venues/temerosa-casino");
  await expect(page.locator(".casino-ledger-board caption")).toHaveText("명예의 전당");
  await expect(page.locator(".casino-ledger-board tbody tr")).toHaveCount(6);
  await expect(page.locator(".casino-ledger-activity [aria-live]")).toHaveCount(0);
  await expect(page.locator(".casino-live-grid .live-table-card")).toHaveCount(4);
  await expect(page.locator(".casino-live-grid .live-table-stage")).toHaveCount(4);
  await expect(page.locator(".casino-live-grid").getByText(/게임 중|지금 입장 가능/).first()).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".ledger-motion")).toBeHidden();
  await expect(page.locator(".ledger-static")).toBeVisible();
  await page.locator(".table-card.playable").filter({ hasText: "슬롯 777" }).getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByRole("heading", { name: "슬롯 777", exact: true })).toBeVisible();
  expect(casinoManifestRequests).toBe(1);
});

test("keeps the Venue title and entry action when its hero image fails", async ({ page }) => {
  await page.route("**/temerosa-casino-venue/0.1.0/**/*.webp", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".venue-art img")).toBeHidden();
  const fallbackLayout = await page.locator(".venue-card").evaluate((card) => {
    const frame = card.querySelector<HTMLElement>(".venue-art")!;
    const image = frame.querySelector<HTMLImageElement>("img")!;
    const bounds = frame.getBoundingClientRect();
    return { ratio: bounds.width / bounds.height, aspectRatio: getComputedStyle(frame).aspectRatio, objectFit: getComputedStyle(image).objectFit };
  });
  expect(fallbackLayout.ratio).toBeCloseTo(16 / 9, 1);
  expect(fallbackLayout.aspectRatio).toBe("16 / 9");
  expect(fallbackLayout.objectFit).toBe("cover");
  await expect(page.getByRole("heading", { name: "테메로세 카지노" })).toBeVisible();
  await page.getByRole("button", { name: "카지노 입장" }).click();
  await expect(page.getByRole("heading", { name: "테이블을 골라주세요" })).toBeVisible();
});

test("reserves and settles one deterministic Temerosa slot spin", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile === true);
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open("lucky-arcade", 7);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction("wallet", "readwrite");
      transaction.objectStore("wallet").put({ contract: "wallet/0.1", id: "wallet", balance: 1_000, updatedAt: new Date().toISOString() });
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.evaluate(async () => {
    const database = await new Function("return import('/src/lib/database.ts')")();
    await database.reserveGameWager({
      wagerId: "legacy-slot-wager", outcomeKey: "legacy-slot:seed", cabinetId: "temerosa-slot",
      sessionId: "temerosa-slot:machine-1", termsVersion: "temerosa-slot-paytable/0.1", choiceKey: "spin:legacy-seed", stake: 10, reservedAmount: 10,
    });
  });
  await page.goto("/play/temerosa-slot");
  await expect(page.getByRole("heading", { name: "슬롯 777", exact: true })).toBeVisible();
  await expect(page.locator(".slot-machine-cabinet")).toHaveAttribute("data-symbol-count", "38");
  await expect(page.locator(".slot-machine-cabinet")).toHaveAttribute("data-variant-count", "268");
  await expect(page.locator(".slot-machine-cabinet")).toHaveAttribute("data-series-count", "4");
  await expect(page.locator(".slot-machine-symbol img")).toHaveCount(9);
  const betConsole = page.locator(".slot-machine-bet-console");
  await page.getByRole("button", { name: "BET", exact: true }).click();
  await expect(betConsole).toContainText("50 P");
  await page.getByRole("button", { name: "MAX BET", exact: true }).click();
  await expect(betConsole).toContainText("200 P");
  await page.getByRole("button", { name: "BET", exact: true }).click();
  await expect(betConsole).toContainText("10 P");
  await page.getByRole("button", { name: "10 P 베팅 레버 당기기", exact: true }).click();
  await expect(page.locator(".slot-machine-track[data-track-count]")).toHaveCount(3);
  await expect(page.locator(".slot-machine-track[data-track-count]").first()).not.toHaveAttribute("data-track-count", "3");
  await page.waitForTimeout(180);
  const movingTransforms = await page.locator(".slot-machine-track[data-track-count]").evaluateAll((tracks) => tracks.map((track) => getComputedStyle(track).transform));
  expect(movingTransforms.every((transform) => transform !== "none")).toBe(true);
  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await expect(page.getByRole("button", { name: "계속", exact: true })).toBeVisible();
  const pausedTransforms = await page.locator(".slot-machine-track[data-track-count]").evaluateAll((tracks) => tracks.map((track) => getComputedStyle(track).transform));
  await page.waitForTimeout(220);
  expect(await page.locator(".slot-machine-track[data-track-count]").evaluateAll((tracks) => tracks.map((track) => getComputedStyle(track).transform))).toEqual(pausedTransforms);
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await expect(page.locator(".slot-machine-result")).toContainText(/당첨 없음|줄 적중/);
  const portraitRequests = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => name.includes("/content/temerosa-margin/") && name.includes("/assets/") && name.endsWith("/md.webp")));
  expect(new Set(portraitRequests).size).toBeLessThanOrEqual(18);
  const economy = await page.evaluate(async () => {
    const database = await new Function("return import('/src/lib/database.ts')")();
    const wagers = await database.listGameWagers("temerosa-slot:machine-2");
    const legacy = (await database.listGameWagers("temerosa-slot:machine-1"))[0];
    const wallet = await database.readWallet();
    return { wager: wagers[0], legacy, balance: wallet.balance };
  });
  expect(economy.wager).toMatchObject({ cabinetId: "temerosa-slot", stake: 10, reservedAmount: 10, status: "settled" });
  expect(economy.legacy).toMatchObject({ wagerId: "legacy-slot-wager", status: "refunded", settlementCredit: 10 });
  expect(economy.balance).toBe(1_000 - 10 + economy.wager.settlementCredit);
});

test("plays, wagers, records, and restores the public image-only match-pairs table", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile === true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open("lucky-arcade", 7);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction("wallet", "readwrite");
      transaction.objectStore("wallet").put({ contract: "wallet/0.1", id: "wallet", balance: 37, updatedAt: new Date().toISOString() });
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.getByRole("button", { name: "카지노 입장" }).click();
  await page.locator(".table-card.playable").filter({ hasText: "짝맞추기" }).getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByRole("heading", { name: "짝맞추기" })).toBeVisible();
  expect(await page.locator(".match-pairs-card-front").evaluateAll((fronts) => fronts.every((front) => (front.textContent ?? "").trim() === ""))).toBe(true);
  await expect(page.locator(".match-pairs-card-front img").first()).toHaveAttribute("alt", "");
  await page.getByRole("button", { name: "10 P로 시작", exact: true }).click();
  await expect(page.locator(".match-pairs-ready-panel")).toHaveCount(0);
  const pairs = await page.locator(".match-pairs-card").evaluateAll((cards) => {
    const indexes = new Map<string, number[]>();
    cards.forEach((card, index) => {
      const src = card.querySelector("img")?.getAttribute("src") ?? "";
      indexes.set(src, [...(indexes.get(src) ?? []), index]);
    });
    return [...indexes.values()];
  });
  expect(pairs).toHaveLength(6);
  for (let pair = 0; pair < pairs.length; pair += 1) {
    const [first, second] = pairs[pair]!;
    await page.locator(".match-pairs-card").nth(first!).click();
    await page.locator(".match-pairs-card").nth(second!).click();
    await expect(page.locator(".match-pairs-card.is-matched")).toHaveCount((pair + 1) * 2);
    if (pair === 0) {
      const pending = await page.evaluate(async () => {
        const database = await new Function("return import('/src/lib/database.ts')")();
        return { wallet: await database.readWallet(), wager: (await database.listGameWagers("temerosa-match-pairs:versus-1"))[0] };
      });
      expect(pending.wallet.balance).toBe(27);
      expect(pending.wager).toMatchObject({ status: "reserved", stake: 10, reservedAmount: 10 });
      await page.reload();
      await expect(page.getByRole("heading", { name: "짝맞추기" })).toBeVisible();
      await expect(page.locator(".match-pairs-card.is-matched")).toHaveCount(2);
    }
  }
  await expect(page.locator(".match-pairs-result")).toContainText("승리했습니다");
  const persisted = await page.evaluate(async () => {
    const database = await new Function("return import('/src/lib/database.ts')")();
    return { wallet: await database.readWallet(), wagers: await database.listGameWagers("temerosa-match-pairs:versus-1"), records: await database.listMatchRecordsForSession("temerosa-match-pairs:versus-1", 10) };
  });
  expect([15, 20, 25]).toContain(persisted.wagers[0]?.settlementCredit);
  expect(persisted.wallet.balance).toBe(37 - 10 + persisted.wagers[0].settlementCredit);
  expect(persisted.wagers[0]).toMatchObject({ cabinetId: "temerosa-match-pairs", stake: 10, reservedAmount: 10, status: "settled" });
  expect(persisted.records).toHaveLength(1);
  expect(persisted.records[0]).toMatchObject({ cabinetId: "temerosa-match-pairs", outcome: "win", turns: 6 });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "이어하기" })).toContainText("테메로세 카지노 · 짝맞추기");
  await page.getByRole("button", { name: "짝맞추기 이어하기", exact: true }).click();
  await expect(page.locator(".match-pairs-result")).toContainText("승리했습니다");
  expect((await page.evaluate(async () => (await new Function("return import('/src/lib/database.ts')")()).readWallet())).balance).toBe(persisted.wallet.balance);
});

test("mobile match-pairs keeps the whole board inside the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile !== true);
  await page.goto("/play/temerosa-match-pairs");
  await expect(page.getByRole("heading", { name: "짝맞추기" })).toBeVisible();
  const layout = await page.locator(".match-pairs-board").evaluate((board) => {
    const box = board.getBoundingClientRect();
    return { left: box.left, right: box.right, viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport + 1);
});

test("blocks hidden cabinets at direct public URLs", async ({ page }) => {
  for (const cabinet of ["gfl-favorite-cup", "favorite-cup", "old-maid-card", "gfl-ember"]) {
    await page.goto(`/play/${cabinet}`);
    await expect(page.getByRole("heading", { name: "이 게임은 공개되어 있지 않습니다." })).toBeVisible();
    await expect(page.locator("input[type=file]")).toHaveCount(0);
  }
});

test("keeps announced casino tables visible but blocks their direct URLs", async ({ page }) => {
  for (const cabinet of ["temerosa-high-low", "temerosa-blackjack", "temerosa-doubt", "temerosa-one-card", "temerosa-texas-holdem"]) {
    await page.goto(`/play/${cabinet}`);
    await expect(page.getByRole("heading", { name: "개장 준비 중입니다." })).toBeVisible();
    await expect(page.getByRole("button", { name: "카지노로 돌아가기" })).toBeVisible();
  }
});

test("filters hidden RecentPlay records and ignores the retired query preview", async ({ page }) => {
  await page.goto("/?privateCabinets=1");
  await expect(page.locator(".venue-card")).toHaveCount(1);
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open("lucky-arcade", 7);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction("recent", "readwrite");
      const store = transaction.objectStore("recent");
      store.put({ contract: "recent-play/0.1", cabinetId: "gfl-ember", sessionId: "hidden", title: "소녀전선: 잔불 작전", progressLabel: "비공개 기록", updatedAt: "2026-07-26T12:00:00.000Z" });
      store.put({ contract: "recent-play/0.1", cabinetId: "temerosa-old-maid", sessionId: "public", title: "테메로세 도둑잡기", progressLabel: "12턴 · 18장 남음", updatedAt: "2026-07-26T11:00:00.000Z" });
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.reload();
  await expect(page.getByRole("region", { name: "이어하기" })).toContainText("테메로세 카지노 · 도둑잡기");
  await expect(page.getByText("소녀전선: 잔불 작전")).toHaveCount(0);
});

test("plays, wagers, and restores the public five-round Indian poker table", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile === true);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => { const opening = indexedDB.open("lucky-arcade", 7); opening.onerror = () => reject(opening.error); opening.onsuccess = () => { const db = opening.result, transaction = db.transaction("wallet", "readwrite"); transaction.objectStore("wallet").put({ contract: "wallet/0.1", id: "wallet", balance: 1_000, updatedAt: new Date().toISOString() }); transaction.onerror = () => reject(transaction.error); transaction.oncomplete = () => { db.close(); resolve(); }; }; }));
  await page.goto("/play/indian-poker");
  await expect(page.getByRole("heading", { name: "인디언 포커" })).toBeVisible();
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.locator(".indian-poker-player").getByRole("img", { name: "보이지 않는 내 카드" })).toBeVisible();
  await takeSafeIndianPokerAction(page);
  await expect(page.locator(".indian-poker-player").getByRole("img", { name: "보이지 않는 내 카드" })).toHaveCount(0);
  await page.getByRole("button", { name: "다음 라운드" }).click();
  await page.reload();
  await expect(page.getByText("2/5 라운드")).toBeVisible();
  for (let round = 2; round <= 5; round += 1) {
    await takeSafeIndianPokerAction(page);
    await page.getByRole("button", { name: round === 5 ? "최종 결과" : "다음 라운드" }).click();
  }
  await expect(page.locator(".indian-poker-result")).toBeVisible();
  expect(browserErrors).toEqual([]);
});

async function takeSafeIndianPokerAction(page: import("@playwright/test").Page): Promise<void> {
  const check = page.getByRole("button", { name: "체크", exact: true });
  if (await check.isVisible()) await check.click();
  else await page.getByRole("button", { name: "콜 · 1칩", exact: true }).click();
}

test("replays one deterministic derby through all four rendering engines", async ({ page }) => {
  test.setTimeout(75_000);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/dev");
  await page.locator(".arcade-entry").filter({ hasText: "럭키★더비 엔진 실험장" }).getByRole("button", { name: "바로 시작" }).click();
  await expect(page.getByRole("heading", { name: "럭키★더비 엔진 실험장" })).toBeVisible();
  for (const engine of ["Phaser 4", "melonJS", "Excalibur", "LittleJS"]) {
    await page.getByRole("tab", { name: new RegExp(`^${engine}`) }).click();
    await expect(page.getByText("완주 · 결과가 모든 엔진에서 동일합니다")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".derby-stage canvas").first()).toBeVisible();
    await expect.poll(() => page.locator(".derby-stage canvas").count()).toBeLessThanOrEqual(2);
  }
  await expect(page.locator(".derby-metrics article").filter({ hasText: "완주 검증" })).toHaveCount(4);
  expect(browserErrors).toEqual([]);
});

test("mobile derby keeps the race and controls on screen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile !== true);
  await page.goto("/dev");
  await page.locator(".arcade-entry").filter({ hasText: "럭키★더비 엔진 실험장" }).getByRole("button", { name: "바로 시작" }).click();
  await expect(page.getByRole("heading", { name: "럭키★더비 엔진 실험장" })).toBeVisible();
  await expect(page.locator(".derby-stage")).toBeInViewport();
  await expect(page.getByRole("button", { name: "4엔진 자동 비교" })).toBeVisible();
});

test("mobile favorite choice does not stay highlighted in the next round", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile !== true);
  await page.goto("/dev");
  await page.locator('input[type="file"]').setInputFiles({ name: "favorite-mobile.json", mimeType: "application/json", buffer: Buffer.from(portraitCard(8, 3, "모바일 월드컵 카드")) });
  await expect(page.getByRole("heading", { name: "최애 월드컵" })).toBeVisible();
  await page.locator(".favorite-choice").first().click();
  await expect(page.locator(".favorite-choice:focus")).toHaveCount(0);
  await expect.poll(() => page.locator(".favorite-choice").first().evaluate((element) => getComputedStyle(element).transform)).toBe("none");
});

test("opens a card into the favorite cup and completes every round", async ({ page }) => {
  await page.goto("/dev");
  await page.locator('input[type="file"]').setInputFiles({ name: "favorite.json", mimeType: "application/json", buffer: Buffer.from(portraitCard(8, 3, "E2E 월드컵 카드")) });
  await expect(page.getByRole("heading", { name: "최애 월드컵" })).toBeVisible();
  for (let pick = 0; pick < 7; pick += 1) await page.locator(".favorite-choice").first().click();
  await expect(page.getByText("오늘의 최애", { exact: true })).toBeVisible();
  await expect(page.locator(".favorite-result")).toContainText("화면을 캡처해 자랑해 보세요");
});

test("opens an expressive personal card as an old maid table", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile === true);
  await page.goto("/dev");
  await page.locator('input[type="file"]').setInputFiles({ name: "old-maid.json", mimeType: "application/json", buffer: Buffer.from(oldMaidCard(4, "E2E 도둑잡기 카드")) });
  await expect(page.getByRole("heading", { name: "E2E 도둑잡기 카드 도둑잡기" })).toBeVisible();
  await expect(page.locator(".old-maid-opponent-picker button")).toHaveCount(4);
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.locator(".old-maid-player-hand")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".old-maid-card.face img").first()).toBeVisible();
});

test("keeps personal old maid closed with only three expressive characters", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile === true);
  await page.goto("/dev");
  await page.locator('input[type="file"]').setInputFiles({ name: "old-maid-short.json", mimeType: "application/json", buffer: Buffer.from(oldMaidCard(3, "E2E 재료 부족 카드")) });
  await expect(page.getByRole("heading", { name: "E2E 재료 부족 카드" })).toBeVisible();
  const cabinet = page.locator(".cabinet-card").filter({ hasText: "내 카드 도둑잡기" });
  await expect(cabinet).toContainText("최소 4명");
  await expect(cabinet.getByRole("button", { name: "게임 시작" })).toBeDisabled();
});

test("falls back to restoration crew and finishes a run", async ({ page }) => {
  await page.goto("/dev");
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
  await page.goto("/dev");
  await page.locator(".arcade-entry").filter({ hasText: "소녀전선: 잔불" }).getByRole("button", { name: "작전 시작", exact: true }).click();
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

test("becomes a provisional navigator and restores the chosen Temerosa party", async ({ page }) => {
  await page.goto("/dev");
  await page.locator(".arcade-entry").filter({ hasText: "테메로세: 여백" }).getByRole("button", { name: "작전 시작" }).click();
  await expect(page.getByRole("heading", { name: "테메로세: 여백" })).toBeVisible();

  await page.getByRole("button", { name: /살펴본다/ }).click();
  await expect(page.getByRole("definition").filter({ hasText: "A.T.272 발신 기록" })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "예비 전력 한 칸" })).toBeVisible();
  await advanceDialogue(page, 3);
  await page.getByRole("button", { name: /무슨 일이 생겼는지/ }).click();
  await advanceDialogue(page, 4);
  await advanceDialogue(page, 5);
  await page.getByRole("button", { name: /A\.T\.272 발신 기록/ }).click();
  await advanceDialogue(page, 4);
  await page.getByRole("button", { name: /직접 서명한다/ }).click();
  await advanceDialogue(page, 2);
  await advanceDialogue(page, 4);

  await expect(page.getByRole("heading", { name: "함께 갈 두 사람" })).toBeVisible();
  await page.getByRole("button", { name: /페일/ }).click();
  await page.getByRole("button", { name: /카노/ }).click();
  await page.getByRole("button", { name: /동행 조건 확인/ }).click();
  await page.getByRole("button", { name: /그 기분은 단서로만/ }).click();
  await advanceDialogue(page, 1);
  await advanceDialogue(page, 2);
  await page.getByRole("button", { name: /두 조건을 확인하고 수락/ }).click();
  await advanceDialogue(page, 4);
  await advanceDialogue(page, 2);

  await expect(page.getByRole("heading", { name: "임시 항해사의 첫 편성이 끝났습니다." })).toBeVisible();
  await expect(page.getByText("자동 저장됨")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "이어하기" })).toContainText("첫 편성 완료");
  await page.getByRole("button", { name: "첫 항로 이어하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "임시 항해사의 첫 편성이 끝났습니다." })).toBeVisible();
  await expect(page.locator(".temerosa-selected-party")).toContainText("페일");
  await expect(page.locator(".temerosa-selected-party")).toContainText("카노");
});

test("plays and restores a complete Temerosa old maid table", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  test.skip(testInfo.project.metadata.mobile === true);
  await holdCasinoOpponents(page, ["echo", "adesha", "ttaengchil"]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "카지노 입장" }).click();
  await page.locator(".table-card.playable").filter({ hasText: "도둑잡기" }).getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByRole("heading", { name: "도둑잡기", exact: true })).toBeVisible();
  await expect(page.getByText("조커를 피해라")).toBeVisible();
  await expect(page.getByText("배분 전").first()).toBeVisible();
  const desktopAngles = await page.locator(".old-maid-center").evaluate((center) => {
    const read = (owner: string) => {
      const slot = document.createElement("div");
      slot.className = "old-maid-pile-slot";
      slot.dataset.owner = owner;
      center.append(slot);
      const angle = getComputedStyle(slot).getPropertyValue("--pile-angle").trim();
      slot.remove();
      return angle;
    };
    return { top: read("cpu-1"), left: read("cpu-2"), right: read("cpu-3"), bottom: read("player") };
  });
  expect(desktopAngles).toEqual({ top: "180deg", left: "90deg", right: "-90deg", bottom: "0deg" });
  await expect(page.getByText(/침착한 듯|만족한 듯|긴장한 듯/).first()).toBeVisible();
  const initialRoster = await page.locator(".old-maid-opponent-picker button.selected").allTextContents();
  await page.getByRole("button", { name: "무작위 선택" }).click();
  await expect(page.locator(".old-maid-opponent-picker button.selected")).toHaveCount(3);
  await expect.poll(() => page.locator(".old-maid-opponent-picker button.selected").allTextContents()).not.toEqual(initialRoster);
  while (await page.locator(".old-maid-opponent-picker button.selected").count()) await page.locator(".old-maid-opponent-picker button.selected").first().click();
  for (const name of ["에코", "아데샤", "땡칠이"]) await page.locator(".old-maid-opponent-picker button").filter({ hasText: name }).click();
  await expect(page.locator(".seat-cpu-1 strong")).toHaveText("에코");
  await expect(page.locator(".seat-cpu-2 strong")).toHaveText("아데샤");
  await expect(page.locator(".seat-cpu-3 strong")).toHaveText("땡칠이");
  // The reduced-motion deal lasts only 190 ms. Arm the pause before starting
  // so the browser clicks on the exact render where the ready-only disabled
  // state clears, without a Playwright round trip racing the deal timer.
  await page.evaluate(() => {
    const pause = document.querySelector<HTMLButtonElement>(".old-maid-pause");
    if (!pause) throw new Error("pause button missing");
    const clickWhenEnabled = () => {
      if (pause.disabled) return;
      observer.disconnect();
      pause.click();
    };
    const observer = new MutationObserver(clickWhenEnabled);
    observer.observe(pause, { attributes: true, attributeFilter: ["disabled"] });
    clickWhenEnabled();
  });
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.getByText("일시정지됨")).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.getByText("카드를 나누는 중…")).toBeVisible();
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await expect(page.locator(".old-maid-player-hand")).toBeVisible();
  await page.getByRole("button", { name: "수동", exact: true }).click();
  await expect(page.getByRole("button", { name: "수동", exact: true })).toHaveClass(/selected/);
  await page.getByRole("button", { name: "자동", exact: true }).click();
  let checkedDetail = false;
  let checkedDiscardPile = false;
  let checkedDiscardSpread = false;
  let checkedThrowingChrome = false;
  let checkedArrival = false;
  let checkedSpeech = false;
  let checkedOfferReaction = false;

  // Reduced motion leaves the arriving-card marker up for only 90 ms. Capture
  // the computed stacking order in the browser instead of racing two
  // Playwright round trips against that presentation window.
  await page.evaluate(() => {
    delete document.body.dataset.arrivalProbe;
    const observer = new MutationObserver(() => {
      if (document.body.dataset.arrivalProbe) return;
      const slots = [...document.querySelectorAll<HTMLElement>(".old-maid-pile-slot")];
      const arriving = slots.filter((slot) => slot.dataset.arriving === "true");
      if (arriving.length !== 1) return;
      const resting = slots
        .filter((slot) => slot.dataset.arriving !== "true")
        .map((slot) => Number(getComputedStyle(slot).zIndex));
      if (resting.some((value) => !Number.isFinite(value))) return;
      document.body.dataset.arrivalProbe = JSON.stringify({
        z: Number(getComputedStyle(arriving[0]!).zIndex),
        restingZ: resting.length ? Math.max(...resting) : 0,
      });
      observer.disconnect();
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-arriving"] });
  });

  for (let turn = 0; turn < 800; turn += 1) {
    if (await page.getByText(/에게 조커가 남았습니다/).count()) break;
    if (!checkedArrival) {
      const probe = await page.evaluate(() => document.body.dataset.arrivalProbe ?? "");
      if (probe) {
        const arriving = JSON.parse(probe) as { z: number; restingZ: number };
        // 쌓인 더미 위에 얹히되, 뽑기 열과 진행 UI(z-index 3) 아래에 머물러야 한다.
        expect(arriving.z).toBeGreaterThan(arriving.restingZ);
        expect(arriving.z).toBeLessThan(3);
        checkedArrival = true;
      }
    }
    const presentationHold = page.locator('.old-maid-shell[data-presentation-hold="true"]');
    if (await presentationHold.count()) {
      await expect(presentationHold).toHaveCount(0, { timeout: 12_000 });
      continue;
    }
    const speech = page.locator(".old-maid-speech").first();
    if (!checkedSpeech && await speech.count()) {
      await expect(speech).toBeVisible();
      await expect(speech).not.toHaveAttribute("aria-live");
      await expect(speech).toHaveAttribute("data-line-id", /^(echo|adesha|ttaengchil)-/);
      checkedSpeech = true;
    }
    const ownCards = page.getByRole("button", { name: /크게 보기/ });
    const ownCardCount = await ownCards.count();
    const cardStage = page.locator(".old-maid-reveal-stage, .old-maid-discard-stage, .old-maid-deal-layer");
    if (!checkedDetail && ownCardCount > 0 && await cardStage.count() === 0) {
      await ownCards.nth(Math.floor(ownCardCount / 2)).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "카드 상세 닫기" }).click();
      checkedDetail = true;
    }
    const discard = page.locator('button[aria-label$="두 장 버리기"]:not([disabled])').first();
    if (await discard.count()) {
      await discard.click();
      if (!checkedThrowingChrome) {
        const chrome = await page.locator(".old-maid-discard-options>button.throwing").evaluate((button) => {
          const name = button.querySelector(".old-maid-card strong");
          return { nameDisplay: name ? getComputedStyle(name).display : "missing", buttonTransform: getComputedStyle(button).transform };
        });
        expect(chrome).toEqual({ nameDisplay: "none", buttonTransform: "none" });
        await expect(page.locator(".old-maid-discard-options>button.throwing>strong")).toHaveCSS("opacity", "0", { timeout: 170 });
        checkedThrowingChrome = true;
      }
      await expect(page.locator(".old-maid-pile-pair")).not.toHaveCount(0);
      checkedDiscardSpread ||= await page.locator(".old-maid-pile-slot").evaluateAll((slots) => {
        const byOwner = new Map<string, DOMRect>();
        for (const slot of slots) { const owner = slot.getAttribute("data-owner"); if (owner && !byOwner.has(owner)) byOwner.set(owner, slot.getBoundingClientRect()); }
        const positions = [...byOwner.values()];
        if (positions.length < 2) return false;
        const first = positions[0] as DOMRect, second = positions[1] as DOMRect;
        return Math.hypot(first.x - second.x, first.y - second.y) > 40;
      });
      checkedDiscardPile = true;
      continue;
    }
    const finishOffer = page.getByRole("button", { name: "재배열 종료 · 이대로 내밀기", exact: true });
    if (await finishOffer.count()) await finishOffer.click();
    else {
      const backs = page.locator(".old-maid-offer-card:not([disabled]), .old-maid-draw-row button");
      if (await backs.count()) {
        let drewWithTouch = false;
        const offeredCard = page.locator(".old-maid-offer-card:not([disabled])").first();
        if (!checkedOfferReaction && await offeredCard.count()) {
          const targetId = await page.locator(".old-maid-offer-stage").getAttribute("data-offer-target");
          const offeredCardId = await offeredCard.getAttribute("data-card-id");
          expect(targetId).toMatch(/^cpu-/);
          expect(offeredCardId).toBeTruthy();
          await offeredCard.hover();
          await expect(page.locator(`.seat-${targetId} .old-maid-reaction-text`)).toHaveText(/만족한 듯|긴장한 듯/);
          const offeredCardBox = await offeredCard.boundingBox();
          expect(offeredCardBox).not.toBeNull();
          await offeredCard.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 1, isPrimary: true });
          await expect(offeredCard).toHaveAttribute("aria-label", /한 번 더 누르면 뽑기/);
          await page.evaluate((cardId) => {
            delete document.body.dataset.drawRevealProbe;
            const observer = new MutationObserver(() => {
              const flight = document.querySelector<HTMLElement>(`.old-maid-flight-layer[data-draw-path="center"][data-card-id="${CSS.escape(cardId)}"]`);
              if (!flight) return;
              document.body.dataset.drawRevealProbe = flight.dataset.revealPhase ?? "missing";
              observer.disconnect();
            });
            observer.observe(document.body, { childList: true, subtree: true });
          }, offeredCardId);
          await offeredCard.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 1, isPrimary: true });
          const flight = page.locator(`.old-maid-flight-layer[data-draw-path="center"][data-card-id="${offeredCardId}"]`);
          await expect(flight).toBeVisible();
          await expect.poll(() => page.evaluate(() => document.body.dataset.drawRevealProbe ?? "")).toBe("back");
          await expect(flight.locator(".old-maid-flight-back .old-maid-card.back")).toHaveCount(1);
          await expect(flight.locator(".old-maid-flight-front .old-maid-card.face")).toHaveCount(1);
          await expect(flight).toHaveAttribute("data-source-x", String(Math.round((offeredCardBox?.x ?? 0) + (offeredCardBox?.width ?? 0) / 2)));
          await expect(flight).toHaveAttribute("data-source-y", String(Math.round((offeredCardBox?.y ?? 0) + (offeredCardBox?.height ?? 0) / 2)));
          await expect(flight).toHaveAttribute("data-reveal-phase", "face");
          await expect.poll(() => flight.locator(".old-maid-flight-card-inner").evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
          drewWithTouch = true;
          checkedOfferReaction = true;
        }
        if (!drewWithTouch) await backs.first().click();
      }
      else await page.waitForTimeout(180);
    }
  }
  await expect(page.getByText(/에게 조커가 남았습니다/)).toBeVisible();
  await expect(page.locator(".old-maid-discard-pile")).toHaveCount(0);
  expect(checkedDiscardPile).toBe(true);
  expect(checkedDiscardSpread).toBe(true);
  expect(checkedThrowingChrome).toBe(true);
  expect(checkedArrival).toBe(true);
  expect(checkedSpeech).toBe(true);
  expect(checkedOfferReaction).toBe(true);
  const award = page.locator(".old-maid-award");
  await expect(award).toHaveText(/^\+(10|5|3|1) P · [1-4]등 순위 보상$/);
  const awardMatch = /\+(\d+) P · (\d)등/.exec(await award.innerText());
  expect(Number(awardMatch?.[1])).toBe(({ 1: 10, 2: 5, 3: 3, 4: 1 } as Record<number, number>)[Number(awardMatch?.[2])]);
  await expect(page.getByText("자동 저장됨")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("region", { name: "이어하기" })).toContainText("대국 완료");
  await expect(page.getByRole("region", { name: "이어하기" })).toContainText("테메로세 카지노 · 도둑잡기");
  await page.getByRole("button", { name: "도둑잡기 이어하기", exact: true }).click();
  await expect(page).toHaveURL(/\/play\/temerosa-old-maid$/);
  await expect(page.getByText(/에게 조커가 남았습니다/)).toBeVisible();
  await expect(page.getByRole("button", { name: "다시하기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "상대 다시 고르기" })).toBeVisible();
  await page.getByRole("button", { name: "다시하기" }).click();
  await expect(page.getByText("같은 상대와 새 패로 다시 시작합니다")).toBeVisible();
  await expect(page.locator(".old-maid-opponent-picker")).toHaveCount(0);
  await expect(page.locator(".old-maid-card.face")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "시작", exact: true })).toBeEnabled();
});

test("keeps direct play free and offers an optional self prediction", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile === true);
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open("lucky-arcade", 7);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction("wallet", "readwrite");
      transaction.objectStore("wallet").put({ contract: "wallet/0.1", id: "wallet", balance: 20, updatedAt: new Date().toISOString() });
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.reload();
  await page.goto("/play/temerosa-old-maid");
  await expect(page.getByRole("button", { name: "시작", exact: true })).toBeEnabled();
  await expect(page.getByText("순위 보상 · 1등 10 P · 2등 5 P · 3등 3 P · 패배 1 P")).toBeVisible();
  await page.getByRole("button", { name: "선택 베팅 열기" }).click();
  await expect(page.getByRole("button", { name: "나", exact: true })).toHaveClass(/selected/);
  await page.getByRole("button", { name: "베팅하고 시작" }).click();
  await expect(page.getByText("카드를 나누는 중…")).toBeVisible({ timeout: 20_000 });
  const prediction = await page.evaluate(async () => {
    const database = await new Function("return import('/src/lib/database.ts')")();
    return (await database.listSpectatorPredictions())[0];
  });
  expect(prediction).toMatchObject({ market: "first-place", predictedCharacterId: "player", reservedAmount: 20, status: "reserved" });
});

test("starts an open-hand four-NPC Temerosa spectator table", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile === true);
  await page.setViewportSize({ width: 920, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open("lucky-arcade", 7);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction("wallet", "readwrite");
      transaction.objectStore("wallet").put({ contract: "wallet/0.1", id: "wallet", balance: 20, updatedAt: new Date().toISOString() });
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.reload();
  await page.goto("/play/temerosa-old-maid");
  await page.getByRole("button", { name: "NPC 4명 관전" }).click();
  await expect(page.locator(".old-maid-opponent-picker button.selected")).toHaveCount(4);
  await expect(page.locator(".old-maid-spectator-hand .old-maid-card.face")).toHaveCount(0);
  await expect(page.getByText("최대 손익 20 P", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "2배", exact: true })).toHaveClass(/selected/);
  await page.getByRole("button", { name: "예측하고 NPC 대국 관전" }).click();
  await expect(page.getByText("카드를 나누는 중…")).toBeVisible();
  await page.getByRole("button", { name: "수동", exact: true }).click();
  await expect(page.locator(".old-maid-spectator-seat")).toBeVisible({ timeout: 20_000 });
  const npcOffer = page.locator(".old-maid-offer-card:disabled").first();
  await expect(npcOffer).toBeVisible();
  await npcOffer.hover({ force: true });
  expect(await npcOffer.evaluate((button) => ({
    pointerEvents: getComputedStyle(button).pointerEvents,
    cardTransform: getComputedStyle(button.querySelector<HTMLElement>(".old-maid-card")!).transform,
  }))).toEqual({ pointerEvents: "none", cardTransform: "none" });
  await page.getByRole("button", { name: "자동", exact: true }).click();
  const desktopControls = page.locator(".old-maid-progress-controls-desktop");
  await expect(desktopControls).toBeVisible();
  await expect(page.locator(".old-maid-progress-controls-mobile")).toBeHidden();
  await expect(desktopControls.getByRole("button", { name: "보통", exact: true })).toBeVisible();
  await expect(desktopControls.getByRole("button", { name: "빠르게", exact: true })).toBeVisible();
  const controlBounds = await desktopControls.evaluate((controls) => {
    const box = controls.getBoundingClientRect();
    const table = controls.closest(".old-maid-table")!.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, tableLeft: table.left, tableRight: table.right, tableTop: table.top, viewportWidth: window.innerWidth, insideClippedCenter: Boolean(controls.closest(".old-maid-center")) };
  });
  expect(controlBounds.insideClippedCenter).toBe(false);
  expect(controlBounds.left).toBeGreaterThanOrEqual(controlBounds.tableLeft);
  expect(controlBounds.right).toBeLessThanOrEqual(Math.min(controlBounds.tableRight, controlBounds.viewportWidth));
  expect(controlBounds.top).toBeGreaterThanOrEqual(controlBounds.tableTop);
  await page.evaluate(() => {
    const selector = '.old-maid-flight-layer[data-draw-path="direct"] .old-maid-card.face';
    document.body.dataset.directFaceSeen = document.querySelector(selector) ? "true" : "false";
    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) return;
      document.body.dataset.directFaceSeen = "true";
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 30_000);
  });
  await page.getByRole("button", { name: "빠르게", exact: true }).click();
  await expect(page.getByText("상대끼리 뽑은 카드는 비공개")).toHaveCount(0);
  await expect(page.locator(".old-maid-spectator-hand .old-maid-card.face").first()).toBeVisible();
  await expect.poll(() => page.locator("body").getAttribute("data-direct-face-seen"), { timeout: 30_000 }).toBe("true");
  await expect(page.locator(".old-maid-reveal-stage")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이 카드를 내 손으로 가져오기" })).toHaveCount(0);
  const rightColumn = await page.locator(".old-maid-table").evaluate((table) => {
    const seat = table.querySelector(".seat-cpu-3")?.getBoundingClientRect();
    const log = table.querySelector(".old-maid-log")?.getBoundingClientRect();
    return { seatBottom: seat?.bottom ?? 0, logTop: log?.top ?? 0 };
  });
  expect(rightColumn.logTop).toBeGreaterThanOrEqual(rightColumn.seatBottom);
});

test("mobile Temerosa old maid keeps the draw cards reachable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile !== true);
  await holdCasinoOpponents(page, ["pale", "kano", "nemo"]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/play/temerosa-old-maid");
  const mobileAngles = await page.locator(".old-maid-center").evaluate((center) => {
    const read = (owner: string) => {
      const slot = document.createElement("div");
      slot.className = "old-maid-pile-slot";
      slot.dataset.owner = owner;
      center.append(slot);
      const angle = getComputedStyle(slot).getPropertyValue("--pile-angle").trim();
      slot.remove();
      return angle;
    };
    return [read("cpu-1"), read("cpu-2"), read("cpu-3"), read("player")];
  });
  expect(mobileAngles).toEqual(["180deg", "180deg", "180deg", "0deg"]);
  while (await page.locator(".old-maid-opponent-picker button.selected").count()) await page.locator(".old-maid-opponent-picker button.selected").first().click();
  for (const name of ["페일", "카노", "네모"]) await page.locator(".old-maid-opponent-picker button").filter({ hasText: name }).click();
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(page.locator(".old-maid-progress-controls-mobile")).toBeVisible();
  await expect(page.locator(".old-maid-progress-controls-desktop")).toBeHidden();
  const speech = page.locator(".old-maid-speech").first();
  for (let step = 0; step < 160 && !await speech.isVisible(); step += 1) {
    const discard = page.locator('button[aria-label$="두 장 버리기"]:not([disabled])').first();
    if (await discard.count()) await discard.click();
    else {
      const finishOffer = page.getByRole("button", { name: "재배열 종료 · 이대로 내밀기", exact: true });
      if (await finishOffer.count()) await finishOffer.click();
      else {
        const backs = page.locator(".old-maid-offer-card:not([disabled]), .old-maid-draw-row button");
        if (await backs.count()) await backs.first().click();
        else await page.waitForTimeout(120);
      }
    }
  }
  await expect(speech).toBeVisible();
  const speechLayout = await speech.evaluate((element) => {
    const bubble = element.getBoundingClientRect();
    const hand = document.querySelector(".old-maid-player-hand")?.getBoundingClientRect();
    const header = document.querySelector(".old-maid-header")?.getBoundingClientRect();
    return { left: bubble.left, right: bubble.right, top: bubble.top, bottom: bubble.bottom, headerBottom: header?.bottom ?? 0, handTop: hand?.top ?? Number.POSITIVE_INFINITY, viewportWidth: window.innerWidth };
  });
  expect(speechLayout.left).toBeGreaterThanOrEqual(-1);
  expect(speechLayout.right).toBeLessThanOrEqual(speechLayout.viewportWidth + 1);
  expect(speechLayout.top).toBeGreaterThanOrEqual(speechLayout.headerBottom);
  expect(speechLayout.bottom).toBeLessThanOrEqual(speechLayout.handTop);
  const firstBack = page.getByRole("button", { name: /첫 번째|1번째 뒷면 카드/ }).first();
  if (await firstBack.count()) await expect(firstBack).toBeInViewport();
  await expect(page.locator(".old-maid-player-hand")).toBeInViewport();
  if (await page.locator(".old-maid-pile-slot").count()) {
    const pileLayout = await page.locator(".old-maid-center").evaluate((center) => {
      const boundary = center.getBoundingClientRect();
      const slots = [...center.querySelectorAll<HTMLElement>(".old-maid-pile-slot")];
      const visibleRatios = slots.map((slot) => {
        const rect = slot.getBoundingClientRect();
        const width = Math.max(0, Math.min(rect.right, boundary.right) - Math.max(rect.left, boundary.left));
        const height = Math.max(0, Math.min(rect.bottom, boundary.bottom) - Math.max(rect.top, boundary.top));
        return width * height / Math.max(1, rect.width * rect.height);
      });
      const draw = center.querySelector<HTMLElement>(".old-maid-draw-row");
      return { minVisibleRatio: Math.min(...visibleRatios), maxPileZ: Math.max(...slots.map((slot) => Number(getComputedStyle(slot).zIndex))), drawZ: draw ? Number(getComputedStyle(draw).zIndex) : 3 };
    });
    expect(pileLayout.minVisibleRatio).toBeGreaterThanOrEqual(.5);
    expect(pileLayout.maxPileZ).toBeLessThan(pileLayout.drawZ);
  }
  const mobileOrder = await page.locator(".old-maid-table").evaluate((table) => {
    const player = table.querySelector(".old-maid-player")?.getBoundingClientRect();
    const log = table.querySelector(".old-maid-log")?.getBoundingClientRect();
    return { playerBottom: player?.bottom ?? 0, logTop: log?.top ?? 0 };
  });
  expect(mobileOrder.logTop).toBeGreaterThanOrEqual(mobileOrder.playerBottom);
});

test("mobile Temerosa pilot keeps the first choice and dialogue controls reachable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile !== true);
  await page.goto("/dev");
  await page.locator(".arcade-entry").filter({ hasText: "테메로세: 여백" }).getByRole("button", { name: "작전 시작" }).click();
  await expect(page.getByRole("button", { name: /손을 뻗는다/ })).toBeInViewport();
  await page.getByRole("button", { name: /손을 뻗는다/ }).click();
  await expect(page.locator(".temerosa-resource-delta")).toContainText("구조 신호의 생체 구간");
  await expect(page.locator(".temerosa-resource-delta")).toContainText("오래된 발신 기록 한 조각");
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await expect(page.locator(".temerosa-communication-frame img")).toBeVisible();
  await expect(page.getByRole("button", { name: "계속", exact: true })).toBeInViewport();
});

async function advanceDialogue(page: import("@playwright/test").Page, count: number) {
  for (let index = 0; index < count; index += 1) await page.getByRole("button", { name: "계속", exact: true }).click();
}

async function holdCasinoOpponents(page: import("@playwright/test").Page, npcIds: readonly string[]) {
  await page.addInitScript((ids) => {
    const expiresAtUtcSecond = Math.floor(Date.now() / 1_000) + 600;
    sessionStorage.setItem("casino-invite/0.1:temerosa-old-maid", JSON.stringify(ids.map((npcId) => ({ npcId, expiresAtUtcSecond }))));
  }, npcIds);
}
