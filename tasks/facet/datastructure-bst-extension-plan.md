# BST 확장 계획서

입력 기획: `tasks/facet/datastructure-bst.md`
대상 식별자: `bst` / 카테고리: `cs-fundamentals`

부록 (e) 의 "tree-layout features 확장 vs 새 bst-stage View 분리" 설계 결정은 본 계획서에서 **tree-layout 확장**으로 귀결. 근거 — (1) 기획이 요구하는 5개 시각 요소 중 "좌소우대 색지 / 폴드 / 경로 조명 / 바닥선 / 보조 커서" 는 전부 **이진 트리 기하 위에서 동작하는 레이어**로, 트리 자체를 대체하지 않음. (2) AVL / Red-Black / Segment 등 동일한 정렬형 이진 트리 파생 facet 이 같은 레이어를 재사용할 여지가 큼. (3) principles.md §6 "둘 이상의 facet 이 공유할 수 있을 때만 새 View" 의 관점에서 전용 View 를 파기보다 공용 View 를 키우는 것이 비용 효율.

---

## 1. 간극 목록

| # | 기획 요구 | 현재 자산 / 부재 | 판정 | 대응 | 범용성 |
|---|---|---|---|---|---|
| 5-1 | 좌소우대 색지 (좌/우 서브트리 배경 음영) | `tree-layout` 은 배경 단일. `Palette` 에 서브트리 음영 토큰 없음 | B + B | `tree-layout` 에 `layoutMode: 'binary-ordered'` + `features: ['subtree-shade']`. `Palette` 에 `subtreeShadeLeft` / `subtreeShadeRight` 추가 | 모든 정렬형 이진 트리 (AVL / RB / 세그먼트) 재사용 가능 → 공용 승격 |
| 5-2 | 반을 접는 폴드 (140ms curl, 패배 서브트리 전체 동시) | 폴드 개념 없음, 표준 이벤트에도 집합 접힘 어휘 없음 | B + C | `tree-layout` 에 `features: ['fold-collapse']` + `foldSubtree(rootId, side)` / `unfoldSubtree(rootId, side?)` / `unfoldAll()`. 표준 어휘 `fold` · `unfold` 추가 (집합 이벤트, payload `{ rootId, side, nodes }`) | 같은 시각 언어가 AVL 회전 전 상태 비교, 세그먼트 트리 범위 질의에도 재사용 가능 |
| 5-3 | 경로 조명 (방문 노드 stroke 골드 + 간선 traversed) | `setNodeState('visited')` + `setEdgeState('traversed')` 존재 | A | 그대로 사용 | — |
| 5-4 | 정렬된 바닥선 (inorder mirror) + 수직 점선 가이드 | 없음 | B | `tree-layout` 에 `features: ['inorder-projection']`. SVG 내부 하단 스트립 + 노드별 수직 점선을 트리와 **동일 좌표계**에서 렌더 (외부 블록 분리하면 정렬이 깨짐) | 모든 이진 탐색 트리 파생 재사용 |
| 5-5 | 기울기 배지 (`h / log₂(n+1)` 게이지, 색 전이) | `text-display` view 존재, `control-bar.metrics` 존재 | A + projector 로컬 | projector 가 삽입/삭제 때마다 `h` 와 비율을 계산해 `text-display` 블록에 갱신. 색 전이는 HTML inline style 을 projector 가 집어넣는 형태 (design-tokens 경유). 레이아웃 평행이동은 부록 (e) 에 따라 **첫 구현 비활성** | — (로컬) |
| 6-a | 비교 헤드업 (`[키] ? [값]` → `<` / `>`) | 없음. `text-display` 로 렌더 가능 | A + facet-local 어휘 | algorithm 이 `compare` facet-local 이벤트 발신 (`payload: { key, nodeId, nodeValue, result }`, silent:false), projector 가 `text-display` 에 렌더. 두 번째 사용처 (이진 탐색 · interpolation) 생기면 표준으로 승격 | 1차는 facet 로컬 |
| 6-b | 연산 콘솔 (insert/search/delete 수동 입력) | `control-bar` 는 자유 입력창 없음 | 첫 구현 제외 | 부록 (e) 원칙 "평행이동 + 수동 입력은 첫 구현 비활성" 에 수동 콘솔 포함. 기획 섹션 9 의 자동 시나리오로 **모든 경로 유형을 한 바퀴에 관찰 가능**. 두 번째 반복에서 `control-bar` 에 `key-input` 컨트롤 확장 제안 | 제외 |
| 6-c | 코드 패널 (재귀 / 반복 토글) | `code-view` + IR 참조 | A (첫 구현은 단일 IR) | `irs.ts` 에 `bst-recursive` 와 `bst-iterative` 두 IR 을 **phase 어휘 공유**하도록 둘 다 정의. `facet.ts` 의 `code-view` 블록은 1차에서 recursive 하나만 참조. 향후 language / paradigm 토글은 `code-view` 확장 경로 (03-catalog.md §자동매칭 없음 참조) | — |
| 8-1 | 검색 miss 유령 원 (빈 자식 자리에 점선) | 없음 | B | `tree-layout` `features: ['ghost-probe']` + `setGhostProbe(parentId, side, label)` / `clearGhostProbe()` | BST / Trie / 범위 검색 재사용 |
| 8-2 | 삽입 슬라이드 인 (바닥선 새 셀 정렬 위치) | `addNode(parentId, child)` 존재 | A + B | 트리 노드 추가는 기존 API. 바닥선 셀 재정렬은 `inorder-projection` feature 의 내부 책임으로 통합 | — |
| 8-3 | 삭제 (leaf / 자식 1개 / 자식 2개 후계자) | `removeNode` · `replaceNodeLabel` 없음 | B | `tree-layout` 에 `removeNode(id)` · `replaceNodeLabel(id, label)` 추가 (값 이사에 사용) | 모든 이진 트리 삭제 재사용 |
| 8-4 | 보조 커서 (후계자 서브루틴) | 주 커서 외 없음 | B | `tree-layout` `features: ['aux-cursor']` + `setAuxCursor(id\|null)`. 주 커서는 `setCursor(id\|null)` 로 함께 도입 (기존 `setNodeState('active')` 와 독립 — active 는 *색*, cursor 는 *외곽 링*) | AVL / RB 회전 시각화에서도 유용 |
| 9-a | 자동 시나리오 재생 (`initialValues` + `scenario`) | `queue` facet 과 동일한 `initialData.scenario` 패턴 존재 (`facets/cs-fundamentals/queue/src/facet.ts:26`) | A | 동일 패턴 채택 | — |
| 9-b | allow duplicates = false, 중복 삽입 시 reject | algorithm 내부 분기 + metric | A | algorithm 에서 `ctx.metric('rejected-duplicate', 'inc')` | — |
| 9-c | `step mode` (tick / operation / batch) | 러너에는 step/play 둘뿐, operation/batch 해상도 없음 | 첫 구현 제외 | 기획 103 행: "기본 단계 해상도는 operation". 러너 확장은 영향 범위가 커 본 차수에서 제외. projector 가 operation 경계에 **비-silent 이벤트만** 두고 operation 내부 비교는 silent 아닌 고유 어휘로 emit → 사용자가 step 버튼을 누르면 자연히 비교 단위로 전진. tick ↔ operation 구분은 향후 `FacetContext.stepBoundary` 훅 신설로 제공 (부록) | 제외 |

---

## 2. 확장별 상세

### (B1) `tree-layout` 범용 확장

파일: `packages/core/src/views/tree-layout.ts`

새 타입:
```ts
export type TreeLayoutFeature =
  | 'subtree-shade'       // 좌/우 서브트리 배경 음영
  | 'fold-collapse'       // 서브트리 폴드/언폴드
  | 'inorder-projection'  // 중위 바닥선 + 수직 가이드
  | 'aux-cursor'          // 보조 커서 (본 커서와 다른 색)
  | 'ghost-probe';        // 리프 자식 자리의 유령 원

export type TreeLayoutMode = 'bfs-width' | 'binary-ordered';
```

config 확장 (추가만, 기본값은 현재 동작 유지):
```ts
{ type: 'tree-layout',
  width?: number, height?: number,
  layoutMode?: TreeLayoutMode,        // default 'bfs-width'
  features?: TreeLayoutFeature[],     // default []
}
```

새 메서드 시그니처 (모두 `ViewInstance` 에 추가, 기존 메서드 유지):
```ts
setLayoutMode(mode: TreeLayoutMode): void
setCursor(id: string | null): void
setAuxCursor(id: string | null): void
foldSubtree(rootId: string, side: 'L' | 'R'): Promise<void>
unfoldSubtree(rootId: string, side?: 'L' | 'R'): Promise<void>
unfoldAll(): void
setGhostProbe(parentId: string, side: 'L' | 'R', label: string): void
clearGhostProbe(): void
removeNode(id: string): void
replaceNodeLabel(id: string, label: string): void
```

내부 상태 추가:
- `features: Set<TreeLayoutFeature>` — mount 시 config 에서 빌드
- `layoutMode`
- `foldedSubtrees: Map<string, Set<'L'|'R'>>` — 현재 접힌 집합
- `cursorId: string | null`, `auxCursorId: string | null`
- `ghostProbe: { parentId, side, label } | null`

렌더 책임:
- `binary-ordered` layoutMode — 각 노드의 좌/우 자식 슬롯을 **재귀 폭 분할** (`x = parent.x ± (width / 2^(depth+1))`) 로 계산. 자식이 한 쪽만 있어도 좌우 의미가 유지되도록 null 슬롯을 건너뛰지 않는다.
- `subtree-shade` — 좌/우 자식이 덮는 bounding box 를 `<rect>` 로 계산해 `subtreeShadeLeft` / `subtreeShadeRight` 토큰 색으로 칠한다 (볼록 외곽 polygon 은 첫 구현에서 bounding box 로 근사 — 기획 부록 (a)).
- `fold-collapse` — `foldSubtree` 가 대상 서브트리의 모든 노드 id 를 수집해 `<g>` 에 `transform='scaleX(0.92) translate(±offset, 0)'` + `filter='saturate(0.3) brightness(0.7)'` + 해치 `<pattern>` 오버레이. transition duration = `140 / runtime.getSpeed()` ms 를 기본으로 하되, view 는 runtime 을 모르므로 `foldSubtree` 에 선택적 `durationMs` 파라미터를 받는다 (projector 가 `runtime.getSpeed()` 로 계산해 전달).
- `inorder-projection` — 트리 inorder walk 로 리프 셀 순서를 계산해 SVG 하단 y=`H-24` 에 고정 높이 띠로 렌더. 각 노드의 트리 좌표 → 바닥선 셀 x 로 수직 점선 연결 (`<line stroke-dasharray='2 2'>`).
- `aux-cursor` / cursor — 노드 원에 추가 `<circle>` 을 덧대 stroke 외곽 링. cursor 는 `accent` (노랑), aux 는 `auxCursor` (새 토큰) 으로 구분.
- `ghost-probe` — 주어진 parent 의 해당 side slot 좌표에 점선 원 + label 텍스트를 `<g class='ghost'>` 로 렌더. `clearGhostProbe` 로 제거.

기본값 (회귀 방지):
- `features` 비어 있으면 `subtree-shade` · `fold-collapse` · `inorder-projection` · `aux-cursor` · `ghost-probe` 전부 비활성 → 현재 bfs facet 동작 불변.
- `layoutMode` 기본 `'bfs-width'` 유지.

기존 사용처 회귀 점검:
- 프로덕션: `packages/core/src/views/index.ts` export 만.
- 테스트: `packages/core/test/views.test.ts` 의 `describe('tree-layout', ...)` — `setTree` + `addNode` 만 호출. 두 메서드 시그니처 유지됨 → Green.
- 실사용 facet: 0건 (BFS 는 `graph-layout` 사용). 따라서 실 서비스 회귀 경로 없음.

### (B2) `design-tokens.ts` Palette 확장

파일: `packages/core/src/views/design-tokens.ts`

추가 필드:
```ts
subtreeShadeLeft: string
subtreeShadeRight: string
auxCursor: string
ghostOutline: string
```

값 (흑백 + 노랑 프로젝트 톤 유지):
- light:
  - `subtreeShadeLeft: 'rgba(23, 23, 23, 0.04)'`
  - `subtreeShadeRight: 'rgba(250, 204, 21, 0.10)'`
  - `auxCursor: '#737373'` (textMuted 와 동일 채도, 주 커서 노랑과 대비)
  - `ghostOutline: '#a3a3a3'`
- dark:
  - `subtreeShadeLeft: 'rgba(250, 250, 250, 0.04)'`
  - `subtreeShadeRight: 'rgba(250, 204, 21, 0.12)'`
  - `auxCursor: '#a3a3a3'`
  - `ghostOutline: '#737373'`

기획과의 차이: 기획 라인 39 는 "좌 한색 hue 200~220 / 우 난색 hue 20~35" 를 *예시* 로 명시. 본질은 "좌/우 서브트리가 시각적으로 즉시 구별" 이므로 흑백+노랑 정체성 안에서 **옅은 검정 tint vs 옅은 노랑 tint** 로 대체. 구별 가능성 + 프로젝트 톤 정체성 모두 만족. (기획 대비 타협 항목 — 보고서에 명시.)

회귀 영향: `Palette` 는 모든 view 가 받지만 기존 view 는 새 필드를 참조하지 않아 순수 추가. 타입 체크만 통과하면 영향 없음.

### (C) 표준 이벤트 어휘 확장 — `fold` · `unfold`

파일: `packages/core/src/types/event.ts`

diff:
```ts
export type StandardEventType =
  | 'highlight' | 'unhighlight'
  | 'mark'
  | 'state-changed'
  | 'enqueue' | 'dequeue'
  | 'append'
  | 'layer-discovered'
+ | 'fold'
+ | 'unfold'
  | 'done';
```

`StandardFacetEvent` 유니온에도 같은 두 케이스 추가.

payload 스키마:
- `fold`: `{ rootId: string; side: 'L' | 'R'; nodes: string[] }` — 루트(비교 기준 노드) + 포기 방향 + 포기된 모든 노드 id 집합.
- `unfold`: `{ rootId: string; side?: 'L' | 'R' }` — 지정 서브트리 또는 `side` 생략 시 해당 루트의 모든 접힘 해제.

`target`: 선택적. 사용 시 `target: 'node:<rootId>'`. 정규 경로는 payload.

`silent`: 둘 다 false — 시각 변화가 있는 step boundary.

`rules/concerns/C2-event-vocabulary.md` 갱신 (본 계획서가 승인되면 Step 3 에서 수행):
- "집합 이벤트 어휘" 섹션 옆에 "폴드 이벤트 어휘 — `fold` / `unfold`" 추가
- 표준 이벤트 목록 나열부 (19행) 에 두 이름 삽입
- 용도: "정렬형 이진 트리에서 한 번의 비교가 서브트리 전체를 포기시키는 순간의 집합 상태 전이" 설명

### (facet-local 어휘) `compare` · `probe` · `value-move`

표준화하지 않고 `algorithm.ts` 상단 JSDoc 에만 명세 (C2 MUST). 두 번째 사용처가 생기면 표준 승격.

- `compare` — `payload: { key: string, nodeId: string, nodeValue: string, result: '<' | '>' | '=' }`. silent:false.
- `probe` — `payload: { parentId: string, side: 'L' | 'R', key: string }`. silent:false.
- `value-move` — `payload: { fromId: string, toId: string, value: string }`. silent:false.

projector 가 이 셋을 받아 각각 `text-display` (비교 HUD) 또는 `tree-layout.setGhostProbe` / `tree-layout.replaceNodeLabel` 로 번역.

---

## 3. 회귀 영향 분석

- `tree-layout` 확장: 기본값으로 모든 새 feature 가 opt-in. 기존 메서드 시그니처/동작 불변. 기존 테스트는 `setTree` + `addNode` 만 — Green 유지.
- `design-tokens` Palette 확장: 기존 view 는 새 필드를 참조하지 않음. `Palette` 인터페이스 소비처는 모두 `getColors(theme)` 로 획득 후 필요한 키만 접근 → 추가 키는 무해.
- `event.ts` `StandardEventType` 확장: 유니온 추가는 기존 `switch(event.type)` 의 `default` 분기로 안전하게 떨어짐. 기존 projector 가 `fold`/`unfold` 를 받을 일은 없다 (BST 외 발신자 없음). `StandardFacetEvent` 판별 유니온도 추가형이라 exhaustive check 가 있는 경우에만 영향 — 현재 소비처 점검 필요 (Step 3 착수 전 grep 으로 재확인).
- `C2-event-vocabulary.md` 갱신: 문서 추가. 코드 영향 없음.

필요한 추가 테스트 (Step 3 에서 작성):
- `views.test.ts` 에 `tree-layout` 의 `binary-ordered` layoutMode 로 좌/우 좌표가 분리되는지 + `foldSubtree` 후 해당 노드의 `<g>` 에 transform 이 적용되는지 + `unfoldAll` 로 초기화되는지 스냅샷.

---

## 4. 확장 없음 판정 근거

- **5-3 경로 조명** (A): 기획은 방문 노드 stroke 가 골드 2px, 간선 선두 색 pulse 를 요구. `setNodeState('active'|'visited')` + `setEdgeState('traversed')` 의 현재 토큰 연결 (`itemActive`=검정, `itemSorted`=검정) 이 기획의 "선두 색(골드)" 와 충돌해 보이지만, cursor 오버레이는 새로 도입하는 `setCursor` 가 accent(노랑) 링으로 표현하므로 **"경로 조명 = visited 노드 stroke + traversed 간선 + cursor 링" 의 합성** 으로 충족. setNodeState 의미 자체는 재정의하지 않음.
- **6-c 코드 패널** (A, 첫 구현 단일 IR): `code-view` 는 현재 단일 IR 참조만 지원. 재귀/반복 토글 UI 는 `03-catalog.md §자동매칭 없음` 원칙상 `code-view` 자체의 **다중 variant** 확장으로 가야 하며, 이는 BST 전용이 아니라 host 경로 전반에 영향. 본 차수에서는 `irs.ts` 에 두 IR 을 **phase 어휘를 공유하도록** 미리 둬서 (부록 (d) 대응) 향후 토글 도입 시 즉시 쓸 수 있게 하되 UI 는 recursive 하나로 시작.
- **9-a 자동 시나리오** (A): `queue` facet 이 `initialData.scenario` 배열 패턴을 이미 확립 (`facets/cs-fundamentals/queue/src/facet.ts:30-43`). 동일 구조 채택.

---

## 5. 결정된 설계 요약

1. 새 View 를 만들지 않는다 — `tree-layout` 을 첫 소비처로 범용 확장.
2. 표준 이벤트 어휘 확장은 `fold` / `unfold` 두 개로 최소화. 나머지 `compare` / `probe` / `value-move` 는 facet 로컬.
3. Palette 에 4개 토큰 추가. 좌/우 서브트리 음영은 기획의 한/난색을 흑백+노랑 정체성 안의 검정-옅은음영 / 노랑-옅은음영으로 대체.
4. 기획 섹션 9 의 자동 시나리오로 모든 연산 유형을 한 바퀴에 관찰. 수동 콘솔 · 평행이동 · step mode 해상도 · 코드 패널 토글은 첫 구현 비활성 (부록 (e) / 회귀 위험 관리).
5. fold 애니메이션 140ms 는 `runtime.getSpeed()` 에 비례하도록 projector 에서 계산해 `tree-layout.foldSubtree(..., durationMs)` 로 주입.
6. allow duplicates = false 는 algorithm 내부에서 처리하고 `rejected-duplicate` 메트릭을 증가.
