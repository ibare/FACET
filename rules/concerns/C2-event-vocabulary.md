---
name: C2 이벤트 어휘
description: 이벤트 type 은 StandardEventType 을 기반으로 하고, facet 고유 확장은 algorithm.ts 상단 주석에 문서화한다.
type: concern
version: 1
last_verified: 2026-04-21
---

# C2. 이벤트 어휘

## When to Apply

- `algorithm.ts` 가 `ctx.emit({ type, ... })` 를 발신할 때
- `projector.ts` 가 `onEvent(event)` 에서 `switch (event.type)` 를 작성할 때
- 새 이벤트 타입 / payload 형태를 도입할 때

## MUST

- 표준 이벤트 (`highlight`, `unhighlight`, `mark`, `state-changed`, `enqueue`, `dequeue`, `append`, `layer-discovered`, `fold`, `unfold`, `done`) 의 이름과 의미를 다른 용도로 재해석하지 않는다.
- facet 고유 확장 이벤트를 쓰는 경우, 해당 `algorithm.ts` **파일 상단 JSDoc 블록에 이벤트 목록 + payload 스키마 + silent 여부를 명시**한다 (bubblesort/algorithm.ts 의 라인 1-18 과 동일한 형태).
- 동일 facet 의 `projector.ts` 는 그 algorithm 이 발신하는 **모든** 이벤트를 처리하거나, 의도적으로 무시하는 경우 `switch` 의 `default` 에서 silently drop 임을 주석으로 명시한다.
- 메타 이벤트 (`phase` 등 시각 변화가 없지만 상태 갱신이 필요한 이벤트) 는 `silent: true` 를 반드시 부여한다.

## MUST NOT

- `ctx.emit` 의 `type` 을 변수에서 동적으로 만들지 않는다 (`ctx.emit({ type: kind, ... })` 금지). 항상 리터럴 문자열이어야 한다.
- 같은 의미에 두 개 이상의 `type` 이름을 혼용하지 않는다 (예: `'highlight'` 와 `'select'` 를 동일 의미로 섞어 쓰는 것 금지).
- `silent: true` 를 step boundary 가 되어야 하는 이벤트에 부여하지 않는다. `highlight` / `state-changed` 처럼 시각 갱신이 있는 이벤트는 실버 처리 금지.

## PREFER

- 확장 이벤트 이름은 kebab-case. 두 단어 이상이면 `-` 연결 (`pass-begin`, `rising-move`).
- payload 는 평탄한 객체. 깊은 중첩 금지.

## 집합 이벤트 어휘 — `layer-discovered`

BFS 처럼 **같은 거리 / 같은 계층의 여러 노드가 한 프레임에 동시에 발견/변경** 되는 장면은 순차 emit 루프로 풀어 쓰면 기획 의도 (동시성) 가 훼손된다. 이럴 때는 집합 이벤트 하나로 묶어 발신한다.

- **용도**: BFS 레이어 동시 발견, 위상 정렬의 같은 in-degree 0 집합 배치, Dijkstra 의 가중치 0 인 동일-거리 확장 등 "계층/등고선 단위 집합 확장".
- **payload 스키마**: `{ distance: number, nodes: string[] }` (거리 또는 계층 인덱스 + 노드 식별자 집합).
- **target**: 선택적. 사용 시 `['node:<a>', 'node:<b>', ...]` 배열. 대개 `payload.nodes` 가 정규 경로이고 `target` 은 `toIndexArray` 류 공용 헬퍼와 호환하고 싶을 때만.
- **silent 여부**: 아니다 (시각 변화가 있는 step boundary 이벤트).
- **확장 주의**: `layer-*` 네이밍은 이 어휘 계열로 예약한다. `layer-settled` / `layer-reset` 등이 필요하면 같은 계열로 추가.

## 폴드 이벤트 어휘 — `fold` / `unfold`

BST 류 정렬형 이진 트리에서 **한 번의 비교가 서브트리 전체를 포기시키는 순간** 의 집합 상태 전이를 단일 이벤트로 표현한다. 노드를 하나씩 돌며 개별 이벤트로 풀면 "비교 1회 = 세계의 절반 포기" 라는 단호함이 시각적으로 무너진다.

- **용도**: BST 의 키 비교 후 반대편 서브트리 포기, AVL / Red-Black 의 회전 전 상태 비교, 세그먼트 트리 범위 질의의 가지치기 등 "이진 트리에서 한쪽 서브트리 전체를 한 번에 접거나 펴는" 장면.
- **`fold` payload 스키마**: `{ rootId: string; side: 'L' | 'R'; nodes: string[] }` — 비교 기준 노드 id + 포기 방향 + 해당 서브트리에 속한 모든 노드 id.
- **`unfold` payload 스키마**: `{ rootId: string; side?: 'L' | 'R' }` — `side` 생략 시 해당 루트의 모든 접힘 해제.
- **target**: 선택적. 사용 시 `target: 'node:<rootId>'`. 정규 경로는 payload.
- **silent 여부**: 아니다 (시각 변화가 있는 step boundary 이벤트).
- **확장 주의**: `fold` / `unfold` 는 **이진 트리 서브트리 단위** 에만 사용한다. 같은 어휘를 "하이라이트 on/off" 같은 다른 의미로 재해석하지 않는다 — 혼동 시 `layer-*` 계열 추가와 동일한 원칙으로 새 이름을 짓는다.

## Exception

- `packages/core/src/examples/**` 는 러너 샘플/테스트로, 표준 어휘 이외를 쓰지 않는 한 문서화 면제.
