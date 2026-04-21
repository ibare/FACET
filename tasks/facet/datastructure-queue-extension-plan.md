# 큐 (Queue) facet 확장 계획서

입력 기획: `tasks/facet/datastructure-queue.md`
구현 지침: `tasks/facet_implementation_prompt.md`

---

## 1. 간극 목록 (기획 ↔ 자산 1:1 대조)

기획의 "5. 달성해야 할 시각 요소" · "6. 시각 구성" · "8. 진행과 이벤트" · "9. 초기 상태와 파라미터" 의 모든 요구를 나열한다.

| # | 기획 요구 | 현재 자산 / 부재 | 판정 | 대응 | 범용성 |
|---|---|---|---|---|---|
| 1 | 양끝 비대칭 게이트 (좌 `◀ OUT` / 우 `IN ▶`, 섬광 분리) | `queue-display` 는 단순 head/tail 텍스트, 게이트 DOM · 섬광 없음 | D | 신규 view `conveyor-queue` — 게이트 DOM · 섬광 애니메이션 | deque · 순환 큐 · PQ 의 "입출 지점" 시각화에 재사용 가능 |
| 2 | 나이 그라디언트 (블록별 대기 시간에 따른 채도 감산, 하한 0.35) | 어떤 view 도 아이템 생애 추적 없음 | D | `conveyor-queue` 내부 `ageByStamp` 맵 + `feature: 'aging-gradient'` | LRU · LFU · FIFO 페이지 교체 등에 재사용 |
| 3 | 입장 스탬프 `#n` (블록 상단, 불변) | queue-display 에 스탬프 개념 없음 | D | `enqueue({ stamp })` 파라미터 + 블록 내부 배지 | 모든 순차 자료구조에 적용 가능 |
| 4 | 동기 시프트 (dequeue 시 전체 한 프레임 한몸 이동) | queue-display 는 즉시 DOM 재렌더, 애니메이션 없음 | D | `conveyor-queue.dequeue()` 가 `transform: translateX` 을 묶어 단일 transition 으로 발행 | 선형 큐 공통 |
| 5 | 수직 드랍 (enqueue) vs 수평 이탈 (dequeue) 직교 궤적 | 없음 | D | enqueue/dequeue 별 전용 keyframe | 시각 언어 공통 |
| 6 | 꼬리 로그 3 칸 (경계 밖 잔상 opacity 0.45 / 0.25 / 0.10) | 없음 | D | `conveyor-queue` 내 tail slots 영역 + `feature: 'tail-log'` + `maxTailEntries` | 과거 기록 잔상 필요한 다른 자료구조에도 재사용 |
| 7 | 입장 카운터 (`총 입장: n_in`) + 크기 게이지 (`n` or `n / capacity`) | 없음 | D | `conveyor-queue` 헤더에 통합 (layout 으로 분리하면 동기화 복잡) | — |
| 8 | 연산 로그 패널 (최근 5~10 줄, `t=3  dequeue() → #2` 형식) | 없음 | D | `conveyor-queue.appendLog(text)` + 내부 스크롤 영역 (facet 전용 로컬) | 로그 표시 자체는 이 facet 주연 요소라 로컬로 품 |
| 9 | overflow 섬광 (우측 게이트 붉게 번쩍 + 흔들림) | 없음 | C (facet 로컬 어휘) + D | `overflow` 이벤트 + `conveyor-queue.signalOverflow()` 메서드 | bounded 자료구조 공통 |
| 10 | underflow 섬광 (좌측 게이트 붉게 번쩍) | 없음 | C (facet 로컬 어휘) + D | `underflow` 이벤트 + `conveyor-queue.signalUnderflow()` | 동상 |
| 11 | peek pulse (front 2회 확대→복귀) | 없음 | C (facet 로컬 어휘) + D | `peek` 이벤트 + `conveyor-queue.pulseFront()` | 큐 계열 공통 |
| 12 | bounded capacity 표시 | 없음 | D | `conveyor-queue` config.capacity + `feature: 'bounded'` | 공통 |
| 13 | 초기 큐 상태 + scenario 재생 | algorithm 이 initialData 를 소비 | A | algorithm.ts 에서 initialValues → enqueue 루프, scenario → op 순회 | — |
| 14 | 블록별 색 유지 + 꼬리 회색조 수렴 | 없음 | D | `conveyor-queue.dequeue()` 시 탈출 블록을 꼬리 슬롯으로 이동 + grayscale | 공통 |
| 15 | 벨트 표면 고정 빗살 패턴 (좌→우 45° 대각선 그루브, 고정) | 없음 | D | `conveyor-queue` 배경 CSS `repeating-linear-gradient` | 선형 큐 공통 |
| 16 | phase 동기 코드 패널 | `code-view` 존재 | A | `irs.ts` phase 어휘에 enqueue/dequeue/peek/overflow-check/underflow-check/scenario-loop 등 | — |
| 17 | 표준 컨트롤 (재생/단계/정지/리셋/속도 슬라이더) | `control-bar` | A | 그대로 사용 | — |
| 18 | 수동 모드 (값 입력 + Enqueue/Dequeue/Peek 버튼) | `control-bar` 커스텀 버튼 spec 있음(`{type:'button',id,label}`) 이나 runtime 콜백 바인딩 미지원 | — (타협) | 자동 재생(scenario)로 시각 정체성 전부 달성. 수동 모드는 제어 편의성이며 시각 정체성이 아니므로 별도 PR 로 보류. 타협 보고에 명시 | 추후 control-bar / runtime 에 custom-button 콜백 브리지 도입 시 복구 가능 |

### 판정 요약
- **A** (기존 자산 그대로): 4 개 (13, 16, 17, + 기본 enqueue/dequeue 이벤트)
- **B** (기존 view 기능 확장): 0 개
- **C** (신규 이벤트 어휘 — facet 로컬): 3 개 (`peek`, `overflow`, `underflow`)
- **D** (신규 view): 1 개 (`conveyor-queue`) — 요구 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 11 · 12 · 14 · 15 를 전부 수용

---

## 2. 확장별 상세

### (D) 신규 View — `conveyor-queue`

**파일**: `packages/core/src/views/conveyor-queue.ts`

**공개 인터페이스** (`ViewInstance` 계약):
```ts
type ConveyorQueueFeature = 'bounded' | 'aging-gradient' | 'tail-log';

type ConveyorQueueConfig = {
  type: 'conveyor-queue';
  label?: LocaleStr;
  capacity?: number | null;       // null/생략 = 무한
  maxTailEntries?: number;         // 기본 3, 꼬리 로그 칸 수
  features?: ConveyorQueueFeature[]; // 기본 ['aging-gradient', 'tail-log']
  logSize?: number;                 // 연산 로그 유지 줄 수 (기본 6)
};

type ConveyorQueueInstance = {
  destroy(): void;

  // 핵심 연산
  enqueue(item: { stamp: number; label: string; tint?: string }, opts?: { duration?: number }): Promise<void>;
  dequeue(opts?: { duration?: number }): Promise<void>;
  pulseFront(opts?: { duration?: number }): Promise<void>;

  // 에러 신호
  signalOverflow(opts?: { duration?: number }): Promise<void>;
  signalUnderflow(opts?: { duration?: number }): Promise<void>;

  // 헤더 갱신
  setTotalEnqueued(n: number): void;
  setSize(n: number, capacity?: number | null): void;

  // 연산 로그
  appendLog(text: string): void;
  clearLog(): void;

  reset(): void;
};
```

**내부 상태**:
- `blocks: { stamp, label, tint, age }[]` — 큐 내부 블록 FIFO 순.
- `tailSlots: { stamp, label, tint }[]` — 경계 밖 꼬리 로그 (좌측, `maxTailEntries` 개).
- `logLines: string[]` — 연산 로그 순환 버퍼.
- `totalEnqueued: number`, `capacity: number | null`.

**시각 동작**:
- DOM 구조 (mount 시 구축):
  ```
  .conveyor-queue (column)
    .header (총 입장 / 크기 게이지 / label)
    .track (row — 꼬리 로그 | 좌측 게이트 | 벨트 본체 | 우측 게이트)
    .log (column — 최근 로그 N 줄)
  ```
- 벨트 본체 배경: `repeating-linear-gradient(45deg, ...)` 의 빗살 패턴 (고정).
- 좌측 게이트 label: locale 에 따라 `◀ OUT` / `OUT ◀`. 배경 tint: `danger-ish` (design-tokens `danger` 사용).
- 우측 게이트 label: `IN ▶`. 배경 tint: `primary-ish` (design-tokens `primary` 사용).
- enqueue: 새 블록을 우측 게이트 위 스폰 → `translateY` transition 으로 드랍. 우측 게이트에 섬광(짧은 border 글로우). `await` 으로 완료 대기.
- dequeue: 전체 블록에 `translateX(-blockWidth)` 를 한 프레임에 적용 → transition 완료 후 front 블록은 tail slots 로 옮김, 각 tail slot 을 한 칸씩 좌측 시프트. 좌측 게이트 섬광.
- 나이 그라디언트 (`aging-gradient`): 매 enqueue/dequeue 시점에 남아있는 블록의 `age++`. 블록 배경을 `hsl` 계산해 `saturation = max(0.35, 1 - age * 0.08)` 적용. 블록 원래 tint 가 있으면 채도 감산해 원색 유지하면서 탈색.
- 꼬리 로그 (`tail-log`): 탈출 블록이 slot[0] 에 들어가고 기존 slot[0]→slot[1]→slot[2] 로 밀림. 각 slot opacity `0.45, 0.25, 0.10`, grayscale(100%).
- bounded 게이지: `feature: 'bounded'` 이고 capacity 가 숫자면 헤더에 `n / capacity` 표시.
- signalOverflow: 우측 게이트 붉은 섬광 + `translateX` 좌우 6px 2 회 shake.
- signalUnderflow: 좌측 게이트 붉은 섬광 + 좌우 shake.
- pulseFront: 첫 블록 `scale(1.0→1.15→1.0)` 2 회.

**design-tokens 사용**:
- 색상: `colors.bg / border / text / textMuted / primary / danger / accent / itemDefault / textInverse`.
- 폰트/스페이싱: `fonts / fontSizes / radii / space`.
- 붉은 섬광: `colors.danger` (단색 배지/테두리 tint). 하드코딩 hex 없음.

**theme / locale 파라미터**:
- `params.theme` → `getColors(theme)` 로 팔레트 캡쳐.
- `params.locale` → 내부 고정 라벨(`(빈 큐)`, `총 입장`, `크기`, `IN`, `OUT`, `t=...`) 다국어 매핑.

**기본값**:
- `features`: `['aging-gradient', 'tail-log']` (기본 활성, `bounded` 는 opt-in).
- `maxTailEntries`: 3.
- `logSize`: 6.
- `capacity`: `null`.

**기존 사용처 회귀 점검**: 신규 view 이므로 없음. 기존 `queue-display` 는 손대지 않음.

**등록**:
- `packages/core/src/views/index.ts` 의 `registerBuiltinViews` 에 `'conveyor-queue'` 등록.
- `packages/core/src/runtime/index.ts` 에서 `conveyorQueueView` export.

### (C) 신규 이벤트 어휘 — facet 로컬

`StandardEventType` 유니온 자체는 건드리지 않는다. `rules/concerns/C2-event-vocabulary.md` 의 규정 ("facet 고유 확장 이벤트를 쓰는 경우 algorithm.ts 상단 JSDoc 에 명시") 을 따라 algorithm.ts 상단에 다음을 명세한다.

| type | target | payload | silent | 용도 |
|---|---|---|---|---|
| `peek` | `queue:front` | `{ stamp: number, label: string }` | 아니오 | front 검사 — 구조 변화 없음, front 블록 pulse |
| `overflow` | `queue:rear` | `{ attempted: string }` | 아니오 | bounded 큐 가득 참 — 우측 게이트 에러 섬광 |
| `underflow` | `queue:front` | `{}` | 아니오 | 빈 큐 dequeue 시도 — 좌측 게이트 에러 섬광 |

향후 deque / circular-queue / priority-queue facet 이 추가돼 두 번째 사용처가 생기면 `StandardEventType` 에 승격한다. 지금은 단일 사용처이므로 공용 어휘를 오염시키지 않는다 (범용성 판단 가이드 적용).

또한 facet 로컬 `state-shift` (동기 시프트 발생 시점) 같은 추가 어휘는 필요 없다 — `dequeue` 이벤트가 시프트 효과를 이미 유도하기 때문.

**target prefix**: `queue:front`, `queue:rear` — 이미 `TargetPrefix` 유니온에 `'queue'` 가 있으므로 추가 확장 불필요 (C1).

### (B) 기존 view 기능 확장
없음.

### (D') 신규 layout primitive
없음. column/row 충분.

### (D'') 신규 runtime 훅
없음. `ctx.emit` await + projector 비동기 반환을 이미 runner 가 대기한다 (runner.ts:244).

---

## 3. 회귀 영향 분석

- **(D) conveyor-queue 신규 추가**: 기존 `queue-display` 는 시그니처 불변. BFS facet 은 `queue-display` 참조이므로 영향 없음.
- **views/index.ts `registerBuiltinViews` 확장**: 추가만 하고 기존 등록은 건드리지 않음.
- **runtime/index.ts export 추가**: type-only / 뷰 심볼 추가만.
- **이벤트 어휘**: `StandardEventType` 유니온 미변경. FacetRuntimeEvent 의 `type: string` 은 임의 문자열 허용이므로 facet 로컬 어휘는 타입 오염 없음.
- **rules**: C2 는 algorithm.ts 상단 JSDoc 에 확장 어휘를 명시하면 충족. 룰 문서 변경 불필요.

---

## 4. "A" 판정 근거

- **#13 (scenario 재생)**: `initialData` 에 `scenario` 배열을 두고 algorithm 이 순회하며 `enqueue/dequeue/peek` emit. `FacetJson` 스키마의 `initialData` 는 자유 형식(`[key: string]: unknown`) 이라 그대로 실을 수 있음.
- **#16 (phase 동기 코드 패널)**: 기존 `code-view` + `irs.ts` 로 커버. phase 어휘는 algorithm.ts 와 irs.ts 에서 동시 정의.
- **#17 (표준 컨트롤)**: `control-bar` 그대로.

---

## 5. 구현 순서

1. (Step 3) `packages/core/src/views/conveyor-queue.ts` 작성 → views/index.ts 등록 → runtime/index.ts export.
2. (Step 3) `pnpm typecheck` + `pnpm test` 로 회귀 확인.
3. (Step 4) `facets/cs-fundamentals/queue/` 6 파일 + package.json + tsconfig.json 작성.
4. (Step 5) `apps/playground/src/facet-bootstrap.ts` 에 `registerFacetLoader('facet:queue', ...)` 추가 + `catalog.json` 의 `queue` topic 에 `facetId: 'facet:queue'` 기재 + pnpm workspace 의 playground package.json 에 의존성 추가.
5. (Step 6) typecheck / test / rule-guard 감사.

## 6. 타협 보고 (기획 대비 축소)

- **수동 모드** (기획 8 번 "사용자 제어 지점" 후단부, 섹션 9 의 수동 모드 옵션): 미구현. 이유: 기획의 **시각 정체성 5 개 장치** (섹션 5) 는 scenario 자동 재생만으로 전부 드러난다. 수동 모드는 control-bar 의 custom-button 콜백 ↔ projector/algorithm 주입 브리지가 현재 runner 에 없어 도입 시 런타임 훅 추가가 필요한데, 이는 이 facet 단일 수요로 보편 확장하기엔 근거가 약하다 (두 번째 사용처가 생길 때 승격). 시각 정체성 불가침 원칙 (원칙 1) 은 유지되므로 축소가 아니라 "제어 표면만" 보류에 해당.

그 외 요소는 원칙적으로 불가침으로 구현한다.

---

## 7. 재설계 v2 — 2D 파이프 + 3D 외관 (2026-04-21)

### 배경

초기 v1 구현(HTML flex + 좌우 게이트 박스 + 하단 연산 로그 패널) 을 마친 뒤 사용자 검토에서 두 가지 변경이 확정됐다.

1. **연산 로그 패널 제거**: 꼬리 로그(공간) + 코드 패널 phase 하이라이트(연산 종류) + 메트릭 카운터(횟수) 의 3 중 표현으로 로그 패널 역할이 이미 충족. 로그가 차지하던 세로 공간(약 104px)을 스테이지로 돌려 벨트 본체를 더 크게 가져간다.
2. **시각 모델 전환**: 평면 DOM 박스 → **납작한 파이프에 큐브 아이템이 들어간 3D 외관**. 단, 애니메이션은 **순수 2D 수평 이동**. 아이소메트릭 대각선 이동의 "길을 벗어난 느낌" 을 피하고 기존 컨베이어 은유의 좌↔우 흐름을 유지한다.

### 기획 불가침 조정

- **섹션 6 "연산 로그 패널"** 문단 사용자 승인하에 폐기. 대신 "OUT/IN 캡이 그려진 납작한 파이프" 로 벨트 본체 시각을 교체.
- **섹션 8 "enqueue 수직 드랍 / dequeue 수평 이탈 궤적 직교"** 사용자 승인하에 수정. enqueue 도 **IN 캡 오른쪽 바깥에서 수평 삽입**, dequeue 는 그대로 수평 이탈. 파이프 구도가 수평 흐름을 강하게 암시하므로 수평 일관성이 더 자연스럽다.
- 그 외 시각 정체성 5종(양끝 비대칭 게이트 / 나이 그라디언트 / 입장 스탬프 / 동기 시프트 / 꼬리 로그) 은 전부 유지.

### 기하 / 색 수치 (Queue-SVG.svg 에서 추출)

- **viewBox 기준**: `254 x 51` (가로:세로 ≈ 5:1 납작한 파이프)
- **파이프 3 구간** (x 좌표):
  - OUT 캡 (좌): 0.5 ~ 33.28, 팔레트 `#CC1010` (front) / `#FF6161` (top)
  - 투명 본체: 33.28 ~ 241.78 (블록 슬롯 영역, **폭 208.5px**)
  - IN 캡 (우): 241.78 ~ 252.96, 팔레트 `#5302EB` (front) / `#A97BFF` (top)
- **파이프 앞면**: y 10.5 ~ 50.5 (높이 40px)
- **3D 외관 깊이 오프셋** (정적 장식용, 애니메이션 축 아님): `Δ = (−15.46, −10)`
- **블록 큐브 정면**: 26.17 x 35.07 (기본), 팔레트 `#00BED7` (front) / `#16D6EF` (left) / `#76EFFF` (top)
- **OUT / IN 텍스트**: 파이프 front face 중앙에 `white` 텍스트로 스탬핑
- **블록 텍스트**: front face 상단 `#stamp` (작은 폰트), 하단 `label` (큰 폰트)

### 좌표 / 애니메이션 단순화

```
slotPitch = 208.5 / capacity                        // capacity=10 → 20.85px
slotX(i)  = 33.28 + i * slotPitch                   // OUT 캡 경계부터 rear 방향
blockFrontW = min(26.17, slotPitch - 1)             // 겹침 방지
```

- **모든 애니메이션 transform 은 순수 수평 X 이동.** 3D 외관의 깊이 벡터는 블록 mount 시 path 를 한 번 그리는 데만 쓰이며 애니메이션 축 역할은 하지 않는다.
- **enqueue**: 새 `<g>` 를 IN 캡 **오른쪽 바깥** (`x = 260` 정도) 에 opacity 0 으로 생성 → transition 으로 rear 슬롯까지 수평 이동 + opacity 1. IN 캡 팔레트 펄스.
- **dequeue**: track `<g>` 에 `transform = translate(-slotPitch, 0)` 한 번. transitionend 에서 front `<g>` 를 tailGroup 으로 이동 + track transform 리셋.
- **peek**: front `<g>` 에 `scale(1.15)` 2 회 반복.
- **overflow / underflow**: IN / OUT 캡 path 의 fill 을 `#ff0000` 으로 펄스 + shake.

### 꼬리 로그

SVG viewBox 를 좌측으로 확장 (`-90 ~ 254`) 해 OUT 캡 왼쪽 공간을 SVG 안에 통합. 3 슬롯 수평 배치, dequeue 마다 `tailGroup.prepend(front)` + 기존 슬롯 좌측 시프트. grayscale + opacity ramp `[0.5, 0.3, 0.1]`.

### 제거되는 코드

- `ConveyorQueue.appendLog / clearLog` 메서드.
- conveyor-queue.ts 의 `logPanel / logHeader / logLines / logBuffer / logSize` 관련 전부.
- projector.ts 의 `stage.appendLog(...)` 호출 6 군데.
- facet.ts stage block 의 `logSize: 6` 옵션.

### 유지되는 것

- 루트 DOM 셀렉터 `.facet-conveyor-queue` (기존 9 개 테스트 호환).
- `CQ_TOKENS` CSS 변수 주입 패턴 (섬광 색). 팔레트 확장만 필요.
- nge-gradient, bounded 크기 게이지, totalEnqueued / size 헤더, 모든 이벤트 어휘 및 facet JSON 구조.

