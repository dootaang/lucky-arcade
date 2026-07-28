# 완료 기록 — 카지노 연출 4단계

> 작성·인수 완료 2026-07-26. Codex가 경합 검사를 안정화하고 전체 검증을 마쳤다.
>
> 이미 푸시된 것: `29fede7`(플로어) · `f6dd7fb`(테이블). 둘 다 e2e 전체 통과 상태로 나갔다.

## 1. 이번 단계가 하는 일

| 파일 | 내용 |
|---|---|
| `packages/ui/src/number-ticker.tsx` | rAF 카운트업. 감축 모션이면 즉시 착지 |
| `packages/ui/src/celebrate.ts` | 금색 컨페티. `canvas-confetti`를 **동적 import** |
| `packages/ui/src/holo-card.tsx` | 홀로 포일 래퍼 `HoloFoil` |
| `packages/ui/src/casino.css` | `.ca-holo` 부품 추가 |
| `packages/ui/package.json` | 서브패스 3개 + `canvas-confetti` 의존 |
| `cabinets/old-maid/*` | 컨페티·카운트업·포일·승패 문구 배선 |
| `apps/web/*` | 로비 포인트 필 카운트업 |

## 2. 최종 검증 상태

```
pnpm check          통과 (경계·타입·단위·프로덕션 빌드)
초기 JS gzip        137.3 / 200 KiB   (기준선 136.6 대비 +0.7)
confetti.module     4.24 KiB 독립 지연 청크 — 초기 청크에 없음
스크린샷            플로어 · 테이블 · 홀로 포일 육안 확인
핵심 e2e            5개 병렬 반복 통과
전체 e2e            25 통과 · 7 의도적 스킵
```

## 3. 해결한 E2E 경합

`arcade.spec.ts:343` **`plays and restores a complete Temerosa old maid table`** 이 인수 당시 4/5 확률로 실패했다.

### 진단 (완료)

```
테스트가 page.emulateMedia({ reducedMotion: "reduce" })를 건다
  → old-maid-screen.tsx:855   const duration = reduced ? 90 : 560
  → data-arriving 표시가 켜져 있는 시간이 90ms뿐

현재 검사 (431~438행) — 왕복 두 번
  ① await expect(...[data-arriving="true"]).toHaveCount(1)
  ② await page.locator(...).evaluate(...)
  ①과 ② 사이에 90ms 창이 닫힌다
```

**제품 결함이 아니다.** 도착 카드의 z 순서 자체는 그대로다. 원래 아슬아슬하던 검사를,
이 인계분이 더한 모듈이 왕복 시간을 임계 위로 밀어 드러냈을 뿐이다.

확인 근거 두 가지:
- 계측 코드를 한 줄 넣자 통과했다 — 타이밍이 바뀌면 결과가 바뀐다.
- `expect.poll`로 바꾸자 `arriving=0`이 나왔다 — 폴링 중에는 새 버리기가 없어 창이 다시 안 열린다.

### 적용한 해법

왕복으로 표본을 뜨지 말고 **브라우저 안에서 그 순간을 붙잡는다.** 주장은 그대로 둔다.

루프 시작 전에 한 번 설치:

```ts
await page.evaluate(() => {
  delete document.body.dataset.arrivalProbe;
  new MutationObserver(() => {
    if (document.body.dataset.arrivalProbe) return;
    const slots = [...document.querySelectorAll<HTMLElement>(".old-maid-pile-slot")];
    const arriving = slots.filter((slot) => slot.dataset.arriving === "true");
    if (arriving.length !== 1) return;
    const resting = slots.filter((slot) => slot.dataset.arriving !== "true").map((slot) => Number(getComputedStyle(slot).zIndex));
    if (resting.some((value) => !Number.isFinite(value))) return;
    document.body.dataset.arrivalProbe = JSON.stringify({
      z: Number(getComputedStyle(arriving[0]!).zIndex),
      restingZ: resting.length ? Math.max(...resting) : 0,
    });
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-arriving"] });
});
```

버리기 루프 안에서는 값이 잡혔을 때만 단언한다:

```ts
if (!checkedArrival) {
  const probe = await page.evaluate(() => document.body.dataset.arrivalProbe ?? "");
  if (probe) {
    const arriving = JSON.parse(probe) as { z: number; restingZ: number };
    expect(arriving.z).toBeGreaterThan(arriving.restingZ);
    expect(arriving.z).toBeLessThan(3);
    checkedArrival = true;
  }
}
```

같은 스트레스 검증에서 두 경합을 추가로 발견해 함께 고쳤다.

- 감축 모션의 190ms 배분 구간은 Playwright 왕복 전에 끝날 수 있으므로, 시작 전에 브라우저 감시기를 설치해 일시정지 버튼이 활성화되는 즉시 클릭한다.
- 카드 뒤집기의 짧은 `back` 위상도 두 번째 터치 전에 감시기를 설치해 최초 DOM 상태를 기록한다.
- 일시정지 클릭과 타이머 콜백이 같은 순간 겹쳐도 상태가 전진하지 않도록 화면 계층에 동기식 pause ref 가드를 추가했다.

### 함께 확인한 것

- `arcade.spec.ts:500` `toHaveText(/^\+(60|30|15|5) P · [1-4]등 순위 보상$/)` — 카운트업이 숫자를
  `<span>`으로 감싸도 `textContent`가 유지되어 통과했다.
- 컨페티는 `prefers-reduced-motion`에서 뜨지 않으며 감축 모션 E2E에 영향을 주지 않았다.
- 새 Vite 서버로 전체 E2E를 실행해 추가된 package export가 정상 해석되는 것을 확인했다.

## 4. 설계 판단 세 가지 (되돌리기 전에 읽을 것)

**① 포일은 `hard-light`다. `color-dodge`가 아니다.**
`color-dodge`는 흰 바탕에 아무 효과가 없어서 밝은 인물화에서 포일이 통째로 사라진다.
`hard-light`는 밝은 띠는 밝게, 어두운 띠는 어둡게 해서 양쪽 다 산다. 세기는 `.17` → hover `.36`.

**② 자이로를 쓰지 않는다.**
iOS는 `DeviceOrientationEvent.requestPermission`을 별도 제스처 뒤에 둔다. 조용히 아무 일도 안
일어나는 카드보다, 손가락 없이도 천천히 흐르는 카드가 낫다. 터치 기기는 `data-holo-drift`로
9초 주기 드리프트를 받는다.

**③ 새 웹폰트를 넣지 않았다.**
스티치는 `Playfair Display + Plus Jakarta Sans + Space Grotesk`를 제안했지만 셋 다 라틴 전용이라
한글 제목이 폴백으로 떨어진다. 한글 세리프는 서브셋해도 수백 KB다. 대신 `old-maid.css`가 이미 쓰던
`Georgia, "Noto Serif KR", serif` 스택을 `--ca-display`로 승격했다. **네트워크 비용 0.**

## 5. 남은 것

```
라이브 오즈(호가창)   보류 — 아래 이유
초점 좌표             매니페스트 focus 필드 0건. 얼굴 크롭·6열 보드의 선행
결과 화면 순위표      승패 문구까지만 했고 순위표 재구성은 미착수
```

### 라이브 오즈를 보류한 이유

관전 모드가 **손패 공개**다(`revealCpuDraws={mode === "spectate"}`). 그러면 관전자는 조커 위치를
이미 볼 수 있어서 "조커 보유 확률"을 띄우는 것의 의미가 먼저 정해져야 한다.

정해야 할 것:
- 표시값이 **현재 보유 확률**인가 **최종 보유 확률**인가. 앞은 `h_x / Σh`로 정확히 계산되고 검증 가능하다.
- 직접 플레이에서 띄운다면 `publicRead` 범위(내가 세도 알 수 있는 것)를 넘지 않아야 한다.
- 손패가 공개된 관전에서 확률이 0/1로 붙어 버리면 요동이 사라진다. 그럼 무엇을 흔들 것인가.

**돈이 걸린 숫자라 미검증으로 넘기지 않았다.** 의미가 정해지면 순수 함수 + 유닛 테스트로 먼저 만들고,
그 위에 호가창 UI를 얹는 순서가 맞다.
