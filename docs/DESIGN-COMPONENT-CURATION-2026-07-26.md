# 디자인 컴포넌트 선별 기록 — 2026-07-26

> 오너가 채팅으로 전달한 외부 UI 라이브러리 코드 3묶음(91.5KB)을 검토해 등급을 매기고,
> 그중 일부를 `packages/ui/src/casino.css` 등으로 재작성해 넣은 판단의 기록이다.
>
> **원본 코드**: `C:\freetalk\디자인\컴포넌트라이브러리\` (`magicui.txt` · `aceternity.txt` · `uiverse.txt`)
> 그 폴더 `README.md`에 복원 경위가 있다.
>
> 이 문서가 없으면 다음 사람이 같은 판단을 처음부터 다시 해야 한다. **되돌리기 전에 5절을 읽어라.**

## 1. 무엇을 받았나

| 묶음 | 출처 | 규모 | 성격 |
|---|---|---|---|
| ① | Magic UI | 데모 28종 · 1,144줄 | Next/Tailwind 완성 컴포넌트 |
| ② | Aceternity UI | 데모 10종 · 386줄 | React + motion 완성 컴포넌트 |
| ③ | Uiverse.io | 스니펫 약 20종 · 1,778줄 | 순수 CSS 부품 창고 |

같은 날 오전에 받은 Google Stitch 시안(`디자인/스티치/`)은 성격이 다르다.
**Stitch는 뼈대(레이아웃 위계·색 배분), 이 3묶음은 살(효과)이다.**

## 2. 그대로 쓸 수 없는 이유 — 이식 규칙

### ① 데모 코드는 전부 실행 불가

```
next/link · next-themes          없음 (Vite 프로젝트, Next 아님)
@/components/ui/* (shadcn)       없음
motion / framer-motion           없음
lucide-react · @radix-ui         없음 (아이콘은 @tabler/icons-react)
canvas-confetti · rough-notation · simplex-noise   없음
```

**붙여넣기가 아니라 효과 추출이다.**

### ② `motion`을 설치하지 않는다

```
초기 청크  raw 331,101 → gzip 102.3 KiB   (당시 실측)
예산       200 KiB gzip
motion     gzip 30~50 KiB   ← 여유의 절반
```

**채택한 것 중 motion이 필요한 건 0개다.** 순수 CSS + 자작 rAF로 전부 된다.
motion이 본질적인 컴포넌트는 전부 B급 이하라 버려도 손해가 없다.

### ③ 스타일 체계가 다르다

```
프로젝트   className 371개 중 semantic 317개 — .venue-card · .table-card · .game-shell
외부       전부 Tailwind 유틸 + cn() 헬퍼
```

그대로 이식하면 **한 앱에 두 체계가 공존한다.** 효과만 뽑아 프로젝트 관례대로 재작성한다.

### ④ 두 가지 필수 처리

- **서브패스 export로 격리한다.** `packages/ui` 배럴에 넣으면 초기 청크로 샌다(`PlayingCard`에서 이미 겪음).
- **`prefers-reduced-motion`을 넣는다.** 프로젝트에 전역 규칙이 있는데 외부 컴포넌트는 대부분 무시한다.

## 3. 최종 선별

### S급 — 다섯

| 항목 | 출처 | 붙일 곳 | 의존 |
|---|---|---|---|
| **GlareCard** (+CometCard 틸트) | ② | 카드 포일 — 도감 · 상세 · 결과 | CSS만 |
| **Spotlight (new)** | ② | 카지노 플로어 무대 조명 | CSS/SVG |
| **ShineBorder** | ① | 입장 가능 테이블 상시 표시 | CSS만 |
| **NumberTicker** | ① | 포인트 정산 카운트업 | rAF 30줄 |
| **Confetti** | ① | 1등 · 짝 맞춤 · 잭팟 | `canvas-confetti` (~5 KiB) |

**GlareCard가 세 묶음 통틀어 최고다.** `--m-x/--m-y` 포인터 변수 + `background-blend-mode`로 만든
포켓몬 카드 홀로그램 포일이고 외부 의존이 0이다.

> 이게 특별한 이유: 우리는 이미 카드를 가지고 있다. `playing-card.tsx`의 pip SVG 40장,
> 3:4 세로 인물 카드 189종, "봇카드 아케이드"라는 정체성. 카드 게임 아케이드에서
> **카드에 포일이 씌워지는 것은 장식이 아니라 정체성이다.**

**ShineBorder는 항상 켜져 있고, GlowingEffect는 다가가면 켜진다.** 둘은 경쟁이 아니라 층이다.
ShineBorder · NeonGradientCard · BackgroundGradient는 같은 계열이라 **셋 중 하나만** 쓴다.

### S급 — Uiverse에서 뽑은 다섯 기법

지적했던 **"누르는 맛이 없다"(`:active` 규칙 3개, 전부 `scale(.98)`)가 이 묶음으로 해결된다.**

```css
/* ① -webkit-box-reflect — 한 줄로 바닥이 생긴다 (ShrinilDhorda) */
-webkit-box-reflect: below 10px linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.4));
/* Firefox 미지원이지만 반사가 안 나올 뿐 깨지지 않는다. 위험 0 */

/* ② 금테 흐름 버튼 (vinodjangid07) — #ffd277이 우리 --accent #f3bd55와 형제라 재색 불필요 */
background: linear-gradient(to right, #77530a, #ffd277, #77530a, #77530a, #ffd277, #77530a);
background-size: 250%;
::before { width: 97%; height: 90%; background: rgba(0,0,0,.842); }  /* 안쪽을 덮어 금테만 남김 */
:hover { background-position: right; transition-duration: 1s; }

/* ③ 눌렀을 때 색이 터지는 것 (mrtqzbek11) — 축소만이 아니라 배경이 그라디언트로 바뀐다 */
:active { transform: scale(.9) rotate(3deg); background: radial-gradient(...); }

/* ④ 바닥 반사광 (cssbuttons-io) — ①이 형태를 비추면 이건 빛을 비춘다 */
button::after { top: 120%; filter: blur(2em); opacity: .7;
                transform: perspective(1.5em) rotateX(35deg) scale(1, .6); }

/* ⑤ 코너 브래킷 (00Kubi) — 테두리 전체 금색보다 고급스럽고 조준선 느낌이 난다 */
.corner-elements span { width: 15px; height: 15px; border: 2px solid; }
:nth-child(1) { top: 10px; left: 10px; border-right: 0; border-bottom: 0; }
```

### A급

| 항목 | 출처 | 쓸 곳 |
|---|---|---|
| GlowingEffect | ② | 데스크톱 근접 반응. ShineBorder 위에 얹는 층. 모바일은 ShineBorder만 |
| HoverEffect | ② | 35명 선택기 — 색 블록이 hover 칸 뒤로 미끄러진다 (`layoutId`를 CSS transition으로 근사) |
| Backlight | ① | 인물 초상 뒤 조명. **인물 색이 곧 조명색이 된다 — 추가 자산 0** |
| PixelImage | ① | 도감 해금(12 P) · 짝맞추기 카드 공개. "여는" 감각 |
| EvervaultCard | ② | 미해금 도감 슬롯. "여기 누군가 있는데 아직 안 보인다" |
| PulsatingButton | ① | `시작` 버튼 |
| Meteors | ① | 플로어 배경 (순수 CSS라 Particles보다 싸다) |
| `.card-glare` + `.scan-line` | ③ | **GlareCard의 포인터 없는 저비용 버전.** 5절 참조 |
| ♠♥♦♣ 소수 주기 반짝임 | ③ | 플로어 배경. `19n · 29n · 11n · 37n · 41n …` 전부 소수라 패턴이 반복되지 않는다 |
| 금가루 타일 | ③ | `radial-gradient(#fff 1px, transparent 1%)` + `background-size: 50px`. 이미지 0 |
| 계단식 감속 회전 | ③ | **슬롯 릴·룰렛의 감속 곡선.** 키프레임 두 개를 같은 값으로 두어 정지 구간을 만든다 |
| 전구 켜짐 토글 | ③ | inset 3중 + 외곽 3중 `box-shadow`. 진짜 자리는 소리 켜기/끄기 |

### 보류 — motion이 필요해서

`Text3DFlip` `WordRotate` `TextAnimate` `DiaTextReveal` `BlurFade` `WarpBackground` `AnimatedBeam`
`Vortex`(+`simplex-noise`) `AuroraBackground` `BackgroundGradient`

`Dock`만 아깝다 — 모바일 카지노 하단 게임 바로 좋은데 motion + radix tooltip을 동시에 요구한다.
**나중에 motion이 다른 이유로 들어오면 그때 재검토한다.**

### 버림

| 항목 | 이유 |
|---|---|
| TypingAnimation | **대사에 쓰면 안 된다.** 대사집은 말풍선 한 박자로 읽히게 설계했다. 관전 모드에서 넷이 말하면 겹친다 |
| Highlighter | `rough-notation` 의존. 손그림 밑줄은 카지노 어휘가 아니다 |
| AnimatedBeam | 우리 UI에 노드 연결 개념이 없다 |
| Keyboard | 쓸 자리 없음. 다만 `enableSound` 옵션은 **소리도 UI의 일부**라는 신호다. 우리 앱은 오디오가 0이다 |
| 피라미드 로더 · 스피너 · SVG 프레임 | 기존 `.hamster-loader`로 충분하거나, 쓸 자리를 새로 만들어야 한다 |

**AuroraBackground는 순수 CSS라 싸지만 오로라는 차갑고 부드러운 빛이다.**
카지노는 따뜻하고 강한 빛이다. Spotlight가 같은 자리를 더 잘 채운다.

## 4. 화면별 배치안

```
카지노 플로어   Spotlight + ShineBorder(입장가능만) + ♠♥♦♣ 소수주기 + 금가루 타일
테이블 준비     PulsatingButton(시작) + 금테 흐름
결과            Confetti(1등) + NumberTicker(정산)
짝맞추기        .card-glare(격자 전체) + PixelImage(카드 공개) + scan-line
도감            PixelImage(해금) + GlareCard(확대 1장) + Backlight(초상) + EvervaultCard(미해금)
슬롯            계단식 감속(릴) + Particles(잭팟) + 룰렛 휠 회전(대기)
전역            box-reflect + 코너 브래킷 + :active 색폭발
```

**추가 의존은 `canvas-confetti` 하나뿐이다.** 나머지는 전부 순수 CSS 또는 자작 rAF다.

## 5. 성능 예산 — 반드시 지킬 것

### 블러 전용 레이어는 한 화면에 3개 이하

이 묶음들은 `filter: blur()`를 남용한다 — `blur(15px) blur(20px) blur(30px) blur(2em) …`,
`backdrop-filter: blur(1rem)`. 도둑잡기 화면엔 이미 좌석 4개 + 손패 + 버림더미가 있고
`.clue-dock`과 `.gfl-sticky-action`이 `backdrop-filter`를 쓴다.

→ **Backlight를 좌석에 쓸 때는 4명 전부가 아니라 현재 차례 1명에게만.** 그게 정보 전달도 된다.

### 포일은 두 층으로 나눈다

`color-dodge`/`hard-light` 블렌드 + 대형 그라디언트는 GPU를 크게 먹는다.
짝맞추기 6×6 보드 36장에 전부 씌우면 폰이 녹는다.

```
격자 전체       .card-glare   (포인터 추적 없음, hover만. 저비용)
확대한 1장      GlareCard     (진짜 포일)
동시 최대       3장
```

### 막대는 `width`가 아니라 `transform: scaleX`

```css
.depth-fill {
  transform-origin: left;
  transform: scaleX(var(--depth));
  transition: transform 160ms cubic-bezier(.34, 1.2, .64, 1);  /* 1.2 오버슛이 탄력을 만든다 */
}
```

`width` 트랜지션은 매 프레임 레이아웃을 다시 계산한다. 4행은 버티지만 20~40행에서 무너진다.

### 플래시는 리플로우로 재시작시킨다

```ts
row.removeAttribute("data-flash");
void row.offsetWidth;            // 이 줄을 빼면 두 번째 변화부터 안 번쩍인다
row.setAttribute("data-flash", dir);
```

### 데이터 글자는 등폭

`font-variant-numeric: tabular-nums` + `ui-monospace`.
숫자 폭이 다르면 값이 바뀔 때마다 글자가 좌우로 흔들린다. 그건 요동이 아니라 지저분한 것이다.

### 그 밖에

- `min-width: 1920px`(jp-matrix) · `width: 200rem`(별밭)은 **반드시 버린다.** 모바일 가로 스크롤이 터진다.
- `prefers-reduced-motion`에서는 플래시와 보간을 끄고 값만 바꾼다.
- 전부 표현 계층이라 **`resultHash`에 영향이 없다.**

## 6. 구현 현황 (2026-07-27 실측)

채택분은 `packages/ui/src/casino.css`(서브패스 export `@lucky-arcade/ui/casino.css`)로 재작성됐다.

| casino.css 부품 | 유래 | 배선된 곳 |
|---|---|---|
| `.ca-press` | ③ 색폭발 `:active` | `casino-ledger-panel.tsx` |
| `.ca-gold-btn` | ③ 금테 흐름 | `casino-ledger-panel.tsx` |
| `.ca-brackets` | ③ 코너 브래킷 | `casino-ledger-panel.tsx` · `apps/web/src/styles.css` |
| `.ca-glare` · `.ca-holo` | ② GlareCard | `holo-card.tsx` (`HoloFoil`) → `old-maid-screen.tsx` |
| `.ca-spotlight` | ② Spotlight | `apps/web/src/routes/home.tsx` |
| `.ca-floorlight` | ② Spotlight 파생 | `casino-ledger-panel.tsx` |
| `.ca-num` · `.ca-serif` · `.ca-label` | 5절 등폭 규칙 | 원장 · 도둑잡기 · 슬롯 · 로비 |
| `.ca-live` · `.ca-tableau` | 상태 점등 · 펠트+금가루 | `casino-ledger-panel.tsx` · `home.tsx` |
| `number-ticker.tsx` | ① NumberTicker (rAF, 감축 모션이면 즉시 착지) | 원장 · 도둑잡기 · 로비 |
| `celebrate.ts` | ① Confetti (`canvas-confetti` **동적 import**, 4.24 KiB 지연 청크) | `old-maid-screen.tsx` |

### 정의는 했지만 아직 아무 데도 안 붙은 것

```
.ca-reflect     box-reflect          — 손패 · 테이블 카드 · 시작 버튼에 한 줄씩 붙일 자리가 있다
.ca-scan        scan-line            — 카드 공개 연출용
.ca-shine       ShineBorder          — 입장 가능 테이블
.ca-pulse       PulsatingButton      — 시작 버튼
.ca-gold-rim    금테 링              — .ca-gold-btn과 택일
```

### 아예 미착수

`Backlight`(초상 뒤 조명) · `PixelImage`(도감 해금) · `EvervaultCard`(미해금 슬롯) ·
`HoverEffect`(35명 선택기) · `Meteors` · `♠♥♦♣ 소수주기` · `계단식 감속`(슬롯 릴) · `전구 토글`

> **계단식 감속은 지금이 적기다.** 슬롯 캐비닛(`cabinets/slot-machine`)이 만들어졌으므로
> 릴 감속 곡선을 새로 설계하지 말고 `uiverse.txt`의 SelfMadeSystem 키프레임을 그대로 쓴다.

## 7. 새 웹폰트를 넣지 않는다 (관련 결정)

Stitch가 `Playfair Display + Plus Jakarta Sans + Space Grotesk`를 제안했지만 셋 다 라틴 전용이라
한글 제목이 폴백으로 떨어진다. 한글 세리프는 서브셋해도 수백 KB다.
대신 `old-maid.css`가 이미 쓰던 `Georgia, "Noto Serif KR", serif`를 `--ca-display`로 승격했다. **네트워크 비용 0.**

## 8. 라이선스

- **Uiverse.io**는 MIT다. 채택한 스니펫의 원작자를 [THIRD_PARTY_PROVENANCE](./THIRD_PARTY_PROVENANCE.md)에
  기록한다. `uiverse.txt`의 `/* From Uiverse.io by ... */` 주석이 그 근거이므로 지우지 않는다.
- **Magic UI · Aceternity UI** 원본 코드는 리포에 들어가 있지 않다. 기법만 재작성했다.
  통째로 이식하게 되면 그때 각 사이트 라이선스를 먼저 확인한다.

## 관련 문서

- [UI-LAYOUT](./UI-LAYOUT.md) — 2026-07-23 오너 승인 레이아웃 기준본
- [SPEC-A29 라이브 오즈 시장 패널](./SPEC-A29-live-odds-market-panel.md) — 12절이 Stitch 시안 사용법
- [HANDOFF 카지노 연출 4단계](./HANDOFF-casino-presentation-2026-07-26.md) — 이 선별의 1차 구현 인계
- [THIRD_PARTY_PROVENANCE](./THIRD_PARTY_PROVENANCE.md)
