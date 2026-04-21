# BFS 확장 계획서

대상 기획: `tasks/facet/graph-bfs.md`
facet 카테고리: `facets/cs-fundamentals/bfs/`

기획 5.1 ~ 5.5, 6, 7, 8 의 모든 시각/이벤트 요구를 현재 자산과 1:1 대조해
확장의 범위와 설계를 확정한다. Step 3 구현은 본 문서의 시그니처와 스키마를
그대로 따른다.

## 1. 간극 목록

| # | 기획 요구 | 현재 자산 | 판정 | 대응 | 범용성 |
|---|---|---|---|---|---|
| 1 | 동심 방사형 레이아웃 (거리 = 반지름, 같은 거리 내 각도 균등) | `graph-layout.setGraph(data, positions)` — positions 을 외부 주입 | **A** | projector 가 BFS 거리 사전 계산 후 positions 계산해 넘김 | — |
| 2 | 배경 등고선 (옅은 점선 원, 거리 단계마다) | 없음 | **B** | `graph-layout` 에 `features: ['concentric-rings']` + `setConcentricRings(center, radii)` | Dijkstra/DFS/A\* 공용 |
| 3 | 출발점 배지 (중심 표식 = 파문 발원지) | `GraphNodeState` = 4종 (default/visited/active/goal) — source 없음 | **B** | `GraphNodeState` 유니온에 `'source'` 추가 + 스타일 | 모든 그래프 탐색 facet |
| 4 | 확정 거리 라벨 (`dist = k` 배지, 동시 점등) | 노드 라벨은 mount 시점 1회. 배지 없음 | **B** | `graph-layout` 에 `setNodeBadge(id, text)` / `clearNodeBadge(id)` | 거리·깊이·F-score·위상 순서 전반 |
| 5 | 동시 점등 섬광 (한 프레임 복수 노드 pulse) | `setNodeState(id, state)` — 단일 id. pulse 없음 | **B** | `graph-layout` 에 `pulseNodes(ids: string[], options?)` + 한 번에 pulse 애니메이션 | 집합적 시각 변화 일반 |
| 6 | 이벤트 "레이어 전체 동시 발견" (집합 발신) | 표준 어휘에 집합 이벤트 없음 | **C** | `layer-discovered` 어휘 추가 (payload: `{ distance: number, nodes: string[] }`) | BFS/Dijkstra-with-weight-0/토폴로지 배치 |
| 7 | 비가역 꼬리 (지나간 레이어 저채도 70%) | `GraphNodeState.visited` 존재 — 그대로 사용 | **A** | projector 가 layer-discovered 받으면 이전 레이어 모두 `visited` 상태로 전이 | — |
| 8 | 엣지 흐름 입자 (안→밖 트레일, 선두 색) | `setEdgeState(a, b, state)` — color/width 만 | **B** | `graph-layout` 에 `pulseEdge(a, b, options?)` (stroke-dashoffset 애니메이션) | 모든 그래프 traversal |
| 9 | FIFO 큐 트랙 (레이어 색 유지, 블록 단위 입장/퇴장) | `queue-display.enqueue(value: unknown)` — `String(v)` 렌더, tint 없음 | **B** | enqueue value 가 객체 `{ label: string, tint?: string }` 인 경우 분기 렌더 | 큐·스택 색상 연동이 필요한 facet 전반 |
| 10 | OUT ▶ / ◀ IN 라벨 + 좌→우 흐름 방향 | `queueDisplayView` 이미 head 좌 / tail 우. 라벨은 head/tail 텍스트 | **A** | `label` config 와 기본 head/tail 라벨로 충분. 방향은 이미 일치 | — |
| 11 | 거리 레이어 인덱스 (`k = 2 → 3` 미니 디스플레이) | `text-display` view 존재 | **A** | projector 가 `text-display.setText` 로 갱신 | — |
| 12 | phase 코드 패널 동기 (레이어 꺼내기 / 이웃 보기 / enqueue) | `silent: 'phase'` 표준 흐름 | **A** | phase 어휘 네 종 (`dequeue-node` / `scan-neighbors` / `discover-layer` / `layer-complete`) 를 algorithm + irs 에 동기 | — |
| 13 | 단계 전진 세 해상도 (tick / layer / full) | runner 의 step 은 한 이벤트 단위 — "layer 단위" 는 표현 불가 | **A (축소 인정)** | runner 확장(D'') 대신 기획 부록의 메모대로 기본 step = tick (한 dequeue 가 곧 tick 에 가깝게 세팅). "layer 단위" 는 기획에서 사용자 제어 지점이지만, runner 수정은 블래스트 반경이 크므로 이 facet 에서는 기본 재생 + 단계 전진(tick)으로 축소 제공. 별도 comment 로 추후 (D'') 경로 열어둔다 | — |
| 14 | 출발점 재선택(클릭 변경) | Facet 재생 중 파라미터 변경 메커니즘은 runner 의 `reset` 후 `initialData` 교체만 제공 | **A (축소 인정)** | 현재 FacetJson.initialData 의 `source` 로 고정. 기획의 "클릭으로 변경" 은 후속 runner 훅 확장 대상. 고정 source=A 로 출발 | — |
| 15 | graph preset 스위치 (넓은/좁은/가중치) | FacetJson 은 단일 initialData | **A (축소 인정)** | 첫 릴리즈는 "넓은 그래프" 단일 프리셋 — DFS/Dijkstra facet 도입 후 공용 preset-selector 확장 경로 열어둠 | — |

판정 분포: **A 8 / B 6 / C 1 / D 0**.

### 축소 판정의 근거 (기획 대비 타협)

기획 9 에서 "파라미터" 로 제시된 출발점 클릭 변경(14)·graph preset 스위치(15)·레이어 단위 step(13) 세 가지는 runner 계층 (D'') 을 건드려야만 **제대로** 제공할 수 있다. runner 는 BFS 만의 요구로 바꾸기에는 회귀 반경이 지나치게 크다 (18 개 facet 재생 경로에 영향). 기획 부록 메모 자체가 이 세 항목을 "구현 단계로 열어 둔 판단" 으로 분류하고 있어, 이번 릴리즈에서는 축소해 수록하고 후속 스펙트럼 facet(DFS/Dijkstra)이 추가될 때 runner 확장을 한 번에 설계한다. 나머지 핵심 시각 요소 (동심 파면 · 동시 점등 섬광 · FIFO 큐 · 거리 라벨 · 비가역 꼬리 + 흐름 입자 + 등고선) 는 전부 완전 구현한다 — 기획의 "달성해야 할 시각 요소" 5 종은 불가침.

## 2. 확장별 상세

### (B-1) `packages/core/src/views/graph-layout.ts`

#### 추가 상태

```ts
export type GraphNodeState = 'default' | 'visited' | 'active' | 'goal' | 'source';
```

- `'source'`: 발원지 표식. 채움은 `colors.itemPivot`(accent) + 두꺼운 외곽 + 가운데 점.
- 기존 4 종은 시그니처/스타일 불변.

#### 추가 config

```ts
type GraphLayoutFeature = 'concentric-rings';
config: {
  type: 'graph-layout',
  width?: number,
  height?: number,
  features?: GraphLayoutFeature[],
}
```

- features 미지정 시 기존 동작 유지.

#### 추가 메서드

| 메서드 | 시그니처 | 동작 |
|---|---|---|
| `setConcentricRings` | `(centerId: string, radii: number[]) => void` | feature 가 `'concentric-rings'` 일 때 배경 `<g class="rings">` 에 점선 원 N 개. centerId 의 positions 좌표를 원점으로. feature 꺼짐이면 no-op. |
| `clearConcentricRings` | `() => void` | 원 전체 제거. |
| `setNodeBadge` | `(id: string, text: string) => void` | 노드 오른쪽 위 작은 배지 `<g class="badge">` — 흰 바탕 + 경계선, `fontSizes.xs`, `fontWeight: 600`. 이미 배지 있으면 텍스트만 교체. |
| `clearNodeBadge` | `(id: string) => void` | 해당 노드 배지 제거. |
| `pulseNodes` | `(ids: string[], options?: { duration?: number }) => Promise<void>` | 전달된 노드들에 **동시** r-pulse (1.0→1.4→1.0) 애니메이션 (SMIL `<animate>` 또는 setAttribute + requestAnimationFrame 단일 프레임 시작). 기본 duration 120ms, `runtime.getSpeed()` 는 호출자 책임. `Promise<void>` 는 pulse 종료 시점에 resolve. |
| `pulseEdge` | `(a: string, b: string, options?: { duration?: number }) => Promise<void>` | 엣지 stroke 에 `stroke-dasharray` + 애니메이션으로 안→밖 흐름. 종료 후 stroke 을 현재 state 색으로 복원. |

#### 메서드 시그니처 회귀 점검

- 기존 `setGraph` / `setNodeState` / `setEdgeState` / `reset` / `destroy`: 변경 없음.
- 기존 `GraphNodeState` 소비자 0건 (facets/ 에 사용 예 0건, 코어/테스트 한정).
- 신규 메서드는 전부 추가. projector 는 `?.()` 로 optional 소비.

#### design-tokens 사용 계획

- source state: `colors.itemPivot`(accent) 채움 + `colors.primary` 외곽 2px.
- concentric rings: `colors.border`(옅은 회색) + stroke-dasharray `4 4`.
- node badge: `colors.bg` 채움 + `colors.border` 테두리 + `colors.text` 글자.
- pulse 애니메이션: 현재 state 색을 유지, 반지름만 트윈.
- edge pulse: 현재 엣지 색상 (active) 을 `stroke-dashoffset` 애니메이션에 사용.

#### theme/locale

- `params.theme` 은 mount 시 캡쳐된 palette 를 그대로 활용 — 신규 코드도 동일 패턴.
- locale: 배지·링은 언어 의존 텍스트 없음.

### (B-2) `packages/core/src/views/queue-display.ts`

#### value 객체 확장

```ts
type QueueItem = string | number | { label: string; tint?: string; tag?: string };
enqueue(value: QueueItem): void
```

- value 가 객체이면 `label` 을 본문에, `tint` (palette 키 아닌 raw CSS color) 를 박스 background 으로, 없으면 기존 `colors.itemDefault`.
- 기존 사용자 (facet 0건 + core 예제) 는 string/number 만 전달하므로 회귀 무.
- dequeue 반환 타입은 `unknown` 유지.

#### design-tokens / locale

- tint 가 없으면 기존 `colors.itemDefault`. tint 는 projector 가 `design-tokens.colors.itemActive` / `itemPivot` 등에서 직접 집어 넘긴다 — 하드코딩 없이 유지.

### (C) 신규 표준 이벤트 어휘 — `layer-discovered`

#### `packages/core/src/types/event.ts`

```ts
export type StandardEventType =
  | 'highlight'
  | 'unhighlight'
  | 'mark'
  | 'state-changed'
  | 'enqueue'
  | 'dequeue'
  | 'append'
  | 'layer-discovered'   // 추가
  | 'done';
```

- `StandardFacetEvent` 판별 유니온에도 동일 케이스 추가.
- payload 스키마 (facet 기준 권고): `{ distance: number, nodes: string[] }`.
- target prefix: 선택적 `node:<id>` 배열. 일반적으로 payload.nodes 로 충분하지만 projector 가 `toIndexArray` 같은 공용 헬퍼를 쓰고 싶을 때를 위해 `target` 도 허용.

#### `rules/concerns/C2-event-vocabulary.md`

- "집합적 시각 변화" 섹션에 `layer-discovered` 어휘 / payload 스키마 / 용도 (BFS 레이어 동시 점등, 토폴로지 레벨 배치) 를 등재. 순차 emit 루프 금지 경고도 함께.

### 회귀 영향 분석

| 변경 | 영향 받는 기존 facet | 리스크 |
|---|---|---|
| `GraphNodeState` 에 `'source'` 추가 | 0건 (graph-layout 아직 아무도 안 씀) | 없음 |
| graph-layout 신규 메서드 (pulseNodes/pulseEdge/setConcentricRings/setNodeBadge) | 0건 | 없음 |
| queue-display value 객체 분기 | 0건 | 없음 |
| `StandardEventType` 에 `layer-discovered` 추가 | 0건 (기존 projector switch 는 모른 채 default 로 drop — 각 projector 가 default 로 떨어뜨리므로 silent ignore) | 없음 |

검증 방법:
- `pnpm typecheck`: 전체 패키지 strict 컴파일.
- `pnpm test`: 기존 18 facet + core 뷰 테스트 회귀 확인.
- rule-guard 서브에이전트: C1~C9 + S-view + S-runtime 감사.

## 3. 확장 없음 판정의 근거 (A 항목)

- **방사형 좌표 계산 (#1)**: `graph-layout.setGraph(data, positions)` 가 이미 외부 positions 수용. projector 에서 BFS 거리 계산 후 `{ distance → radius, 같은 distance 내 각도 균등 }` 공식으로 좌표 주입하면 그만이다. view 확장 불필요.
- **거리 레이어 인덱스 (#11)**: `text-display` view 존재 — `setText(...)` 로 `k=2 → 3` 문자열 렌더.
- **visited 저채도 (#7)**: 기존 `GraphNodeState.visited` 가 `colors.itemSorted` (저채도 primary) 로 렌더되므로 그대로 사용.
- **OUT/IN 라벨 & 방향 (#10)**: 이미 head/tail (좌/우) 흐름이며 locale 별 head/tail 텍스트로 충분.
- **phase 동기 (#12)**: 표준 silent phase 이벤트 흐름이 이미 확립.

## 4. 신규 재사용 자산 요약

이후 DFS / Dijkstra / 위상정렬 facet 이 사용할 수 있게 되는 자산:

- `GraphNodeState = '... | source'`
- `graphLayoutView`
  - features: `'concentric-rings'`
  - `setConcentricRings(centerId, radii)` / `clearConcentricRings()`
  - `setNodeBadge(id, text)` / `clearNodeBadge(id)`
  - `pulseNodes(ids, options?)` → Promise
  - `pulseEdge(a, b, options?)` → Promise
- `queueDisplayView.enqueue({ label, tint?, tag? })`
- `StandardEventType = '... | layer-discovered'`
- `C2-event-vocabulary.md` 의 집합 이벤트 모범 예시

## 5. Step 3 구현 순서 (확정)

1. `packages/core/src/types/event.ts` — `layer-discovered` 어휘 추가.
2. `rules/concerns/C2-event-vocabulary.md` — 어휘 등재.
3. `packages/core/src/views/graph-layout.ts` — `source` 상태 + 5개 신규 메서드 + features.
4. `packages/core/src/views/queue-display.ts` — value 객체 분기.
5. `pnpm typecheck` + `pnpm test` 회귀 확인.
6. Step 4 (BFS facet 6파일) 진입.
