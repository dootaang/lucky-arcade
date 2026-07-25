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
  await page.goto("/?privateCabinets=1");
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
  test.skip(testInfo.project.metadata.mobile !== true);
  await page.goto("/");
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await expect(page.getByRole("navigation", { name: "주 메뉴" })).toBeVisible();
  await expect(page.getByRole("button", { name: "내 카드" })).toBeVisible();
});

test("opens built-in quick cabinets without a card", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "기다리는 동안, 바로 한 판" })).toBeVisible();
  await expect(page.locator(".arcade-entry")).toHaveCount(2);
  await page.locator(".arcade-entry").filter({ hasText: "소녀전선 최애 월드컵" }).getByRole("button", { name: "바로 시작" }).click();
  await expect(page.getByRole("heading", { name: "최애 월드컵" })).toBeVisible();
  for (let pick = 0; pick < 11; pick += 1) await page.locator(".favorite-choice").first().click();
  await expect(page.getByText("오늘의 최애", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "다른 놀이 보기" }).click();
  await expect(page.locator(".arcade-entry").filter({ hasText: "테메로세 도둑잡기" })).toBeVisible();
  for (const hiddenTitle of ["작전 암호 기억", "럭키★더비 엔진 실험장", "소녀전선: 잔불 작전", "테메로세: 여백 — 첫 항로"]) {
    await expect(page.locator(".arcade-entry").filter({ hasText: hiddenTitle })).toHaveCount(0);
  }
});

test("replays one deterministic derby through all four rendering engines", async ({ page }) => {
  test.setTimeout(75_000);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/?privateCabinets=1");
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
  await page.goto("/?privateCabinets=1");
  await page.locator(".arcade-entry").filter({ hasText: "럭키★더비 엔진 실험장" }).getByRole("button", { name: "바로 시작" }).click();
  await expect(page.getByRole("heading", { name: "럭키★더비 엔진 실험장" })).toBeVisible();
  await expect(page.locator(".derby-stage")).toBeInViewport();
  await expect(page.getByRole("button", { name: "4엔진 자동 비교" })).toBeVisible();
});

test("mobile favorite choice does not stay highlighted in the next round", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile !== true);
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

test("opens an expressive personal card as an old maid table", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile === true);
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: "old-maid.json", mimeType: "application/json", buffer: Buffer.from(oldMaidCard(4, "E2E 도둑잡기 카드")) });
  await expect(page.getByRole("heading", { name: "E2E 도둑잡기 카드 도둑잡기" })).toBeVisible();
  await expect(page.locator(".old-maid-opponent-picker button")).toHaveCount(4);
  await page.getByRole("button", { name: "카드 배분 시작" }).click();
  await expect(page.locator(".old-maid-player-hand")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".old-maid-card.face img").first()).toBeVisible();
});

test("keeps personal old maid closed with only three expressive characters", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile === true);
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({ name: "old-maid-short.json", mimeType: "application/json", buffer: Buffer.from(oldMaidCard(3, "E2E 재료 부족 카드")) });
  await expect(page.getByRole("heading", { name: "E2E 재료 부족 카드" })).toBeVisible();
  const cabinet = page.locator(".cabinet-card").filter({ hasText: "내 카드 도둑잡기" });
  await expect(cabinet).toContainText("최소 4명");
  await expect(cabinet.getByRole("button", { name: "게임 시작" })).toBeDisabled();
});

test("falls back to restoration crew and finishes a run", async ({ page }) => {
  await page.goto("/?privateCabinets=1");
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
  await page.goto("/?privateCabinets=1");
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
  await page.goto("/?privateCabinets=1");
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
  await page.goto("/");
  await page.locator(".arcade-entry").filter({ hasText: "테메로세 도둑잡기" }).getByRole("button", { name: "바로 시작" }).click();
  await expect(page.getByRole("heading", { name: "테메로세 도둑잡기" })).toBeVisible();
  await expect(page.getByText("마지막 조커를 피하세요")).toBeVisible();
  await expect(page.getByText("배분 전").first()).toBeVisible();
  await expect(page.getByText(/침착한 듯|만족한 듯|긴장한 듯/).first()).toBeVisible();
  await page.getByRole("button", { name: "카드 배분 시작" }).click();
  await expect(page.getByText("카드를 나누는 중…")).toBeVisible();
  await expect(page.locator(".old-maid-player-hand")).toBeVisible();
  let checkedDetail = false;
  let checkedDiscardPile = false;
  let checkedDiscardSpread = false;
  let checkedThrowingChrome = false;
  let checkedArrival = false;
  let checkedSpeech = false;

  for (let turn = 0; turn < 800; turn += 1) {
    if (await page.getByText(/에게 조커가 남았습니다/).count()) break;
    const speech = page.locator(".old-maid-speech").first();
    if (!checkedSpeech && await speech.count()) {
      await expect(speech).toBeVisible();
      await expect(speech).not.toHaveAttribute("aria-live");
      checkedSpeech = true;
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
      if (!checkedArrival) {
        await expect(page.locator('.old-maid-pile-slot[data-arriving="true"]')).toHaveCount(1);
        checkedArrival = true;
      }
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
    const ownCard = page.getByRole("button", { name: /크게 보기/ }).first();
    if (!checkedDetail && await ownCard.count()) {
      await ownCard.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "카드 상세 닫기" }).click();
      checkedDetail = true;
    }
    const backs = page.getByRole("button", { name: /번째 뒷면 카드/ });
    if (await backs.count()) await backs.first().click();
    else await page.waitForTimeout(180);
  }
  await expect(page.getByText(/에게 조커가 남았습니다/)).toBeVisible();
  await expect(page.locator(".old-maid-discard-pile")).toHaveCount(0);
  expect(checkedDiscardPile).toBe(true);
  expect(checkedDiscardSpread).toBe(true);
  expect(checkedThrowingChrome).toBe(true);
  expect(checkedArrival).toBe(true);
  expect(checkedSpeech).toBe(true);
  await expect(page.getByText("자동 저장됨")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "이어하기" })).toContainText("대국 완료");
  await page.getByRole("button", { name: "도둑잡기 이어하기", exact: true }).click();
  await expect(page.getByText(/에게 조커가 남았습니다/)).toBeVisible();
  await expect(page.getByRole("button", { name: "같은 판 다시 하기" })).toBeVisible();
});

test("starts an open-hand four-NPC Temerosa spectator table", async ({ page }, testInfo) => {
  test.skip(testInfo.project.metadata.mobile === true);
  await page.goto("/");
  await page.locator(".arcade-entry").filter({ hasText: "테메로세 도둑잡기" }).getByRole("button", { name: "바로 시작" }).click();
  await page.getByRole("button", { name: "NPC 4명 관전" }).click();
  await expect(page.locator(".old-maid-opponent-picker button.selected")).toHaveCount(4);
  await page.getByRole("button", { name: "NPC 대국 관전 시작" }).click();
  await expect(page.getByText("카드를 나누는 중…")).toBeVisible();
  await expect(page.locator(".old-maid-spectator-seat")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("상대끼리 뽑은 카드는 비공개")).toHaveCount(0);
  await expect(page.locator(".old-maid-spectator-hand .old-maid-card.face").first()).toBeVisible();
  await expect(page.locator(".old-maid-reveal-stage .old-maid-card.face").first()).toBeVisible({ timeout: 30_000 });
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
  await page.goto("/");
  await page.locator(".arcade-entry").filter({ hasText: "테메로세 도둑잡기" }).getByRole("button", { name: "바로 시작" }).click();
  await page.getByRole("button", { name: "카드 배분 시작" }).click();
  const speech = page.locator(".old-maid-speech").first();
  for (let step = 0; step < 160 && !await speech.isVisible(); step += 1) {
    const discard = page.locator('button[aria-label$="두 장 버리기"]:not([disabled])').first();
    if (await discard.count()) await discard.click();
    else {
      const backs = page.getByRole("button", { name: /번째 뒷면 카드/ });
      if (await backs.count()) await backs.first().click();
      else await page.waitForTimeout(120);
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
  await page.goto("/?privateCabinets=1");
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
