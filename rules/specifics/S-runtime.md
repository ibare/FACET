---
name: S-runtime
description: runner / event-bus / registry / layout-builder / context / projector 의 내부 규율. Mode 전이, silent 이벤트, cancelled flag.
type: specific
version: 1
last_verified: 2026-04-21
---

# S-runtime. Runtime 내부 규율

## 적용 범위

- `packages/core/src/runtime/**/*.ts`
- `packages/core/src/types/**/*.ts`

## MUST

- `runFacet` 이 `FacetJson.algorithm` / `projector` / `blocks[*].ir` 를 조회할 때 **미등록이면 한국어 메시지로 throw** 한다 (`알고리즘 모듈 미등록: <name>`).
- `cancelled` flag 는 `getter` 로 동적 반영 (runner.ts:277). 직접 속성 대입 금지.
- `ctx.emit` 내부는 다음 순서를 지킨다: (1) paused/idle → wait → (2) projector.onEvent → (3) silent 이면 즉시 return → (4) stepping 이면 paused 로 전이 / playing 이면 속도 비례 지연.
- `silent` 이벤트는 **BASE_DELAY 를 쓰지 않는다**. step boundary 도 아니다.
- `reset()` 은 `cancelled = true` → 진행 중인 실행 완료 대기 → 데이터 복원 → metrics 초기화 → `projector.onReset?()` → `projector.onInit?(data)` 순서로 수행. 이 순서는 "reset 후 즉시 재생 시 올바른 초기 상태" 를 보장.
- `shuffleOnReset: true` 인 facet 은 **mount 시점과 reset 시점 모두** initialData 의 최상위 배열 필드를 Fisher-Yates 로 셔플한다.
- `registerView` / `registerAlgorithm` / `registerProjector` / `registerFacets` 는 중복 키를 **조용히 덮어쓴다** (Map.set). 이 동작은 의도적이며 변경 시 영향 범위가 크므로 건드리지 않는다.
- `stripPrefix(ref, 'module')` / `stripPrefix(ref, 'ir')` 로 참조 문자열의 prefix 를 제거한 뒤 레지스트리 조회.

## MUST NOT

- 러너 외부에서 `ProjectorInstance.onEvent` 를 직접 호출하지 않는다. 이벤트는 반드시 `ctx.emit` 경유.
- Mode 전이를 `setMode` 외 경로로 하지 않는다 — control-bar 의 running 상태 동기화가 깨진다.
- `BASE_DELAY_MS` 를 facet 별로 다르게 적용하지 않는다. 속도 조정은 `control-bar.speed-slider` 와 `speedMul` 로만.
- layout-builder 가 `FacetJson.algorithm` / `projector` 를 해석하지 않는다 — 레이아웃 / 블록만 담당.

## PREFER

- 새 runtime 기능 (예: 새 control 타입) 은 `FacetJson` 스키마 확장 → `BlockSpec` 유니온에 추가 → layout-builder + runner 에서 조회. 한 번에 한 방향.
- runner.ts 는 이미 길다 (400+ 라인). 새 기능은 별도 모듈로 추출 후 runner 가 조립하는 방향을 검토한다.
- 공용 헬퍼 (`parseTarget`, `stripPrefix`, `resolveLocale`) 는 runtime 진입점에서 re-export 해 소비자가 하나의 subpath 에서 가져오도록 유지.

## Exception

- `packages/core/src/examples/**` 는 러너 검증용 샘플이며 이 규칙의 대상이 아니다.
- runner.ts 의 `as Record<string, unknown>` / `callMethod` 경로는 기존 코드의 legacy 경계다. **확산 금지** — 새 기능은 정식 타입으로 작성.
