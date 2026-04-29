---
name: S-runtime
description: runner / mechanism / event-bus / registry / layout-builder / context / projector 의 내부 규율. Mechanism 추상화, supportedControls 호환성 검증, dispatch 채널 직교 분리, Mode 전이, silent 이벤트, cancelled flag.
type: specific
version: 2
last_verified: 2026-04-29
---

# S-runtime. Runtime 내부 규율

## 적용 범위

- `packages/core/src/runtime/**/*.ts`
- `packages/core/src/types/**/*.ts`

## MUST

- `runFacet` 이 `FacetJson.algorithm` / `projector` / `blocks[*].ir` 를 조회할 때 **미등록이면 한국어 메시지로 throw** 한다 (`알고리즘 모듈 미등록: <name>`).
- `cancelled` flag 는 `getter` 로 동적 반영 (`mechanism.ts` 의 `CoroutineMechanism.createContext`). 직접 속성 대입 금지.
- `ctx.emit` 내부는 다음 순서를 지킨다 (현재 주체: `CoroutineMechanism.createContext` 의 `emit`): (1) paused/idle → 다음 신호 대기 → (2) `projector.onEvent` → (3) `silent` 이면 즉시 return → (4) stepping 이면 paused 로 전이 / playing 이면 속도 비례 지연.
- `silent` 이벤트는 **BASE_DELAY 를 쓰지 않는다**. step boundary 도 아니다.
- `CoroutineMechanism.reset()` 은 다음 순서로 수행한다: `cancelled = true` → 진행 중인 실행 완료 대기 → `cancelled = false` 복귀 → 데이터 in-place 복원 (참조 유지) → `metricsState.clear` → `hooks.onMetricsReset` → `hooks.onComplete(false)` → `hooks.onRunningChange(false)` → `projector.onReset?()` → `projector.onInit?(data)` → `setMode('idle')`. 이 순서는 "reset 후 즉시 재생 시 올바른 초기 상태" 를 보장.
- `shuffleOnReset: true` 인 facet 은 **mount 시점과 reset 시점 모두** initialData 의 최상위 배열 필드를 Fisher-Yates 로 셔플한다. 셔플 주체는 `CoroutineMechanism`.
- `registerView` / `registerAlgorithm` / `registerProjector` / `registerFacets` 는 중복 키를 **조용히 덮어쓴다** (Map.set). 이 동작은 의도적이며 변경 시 영향 범위가 크므로 건드리지 않는다.
- `stripPrefix(ref, 'module')` / `stripPrefix(ref, 'ir')` 로 참조 문자열의 prefix 를 제거한 뒤 레지스트리 조회.

## Mechanism 추상화 규약

- 알고리즘 진행 동력 (mode / cancelled / runId / activePromise / pendingTimer / speedMul / metricsState / ctx) 은 모두 **`Mechanism` 구현체 안에 캡슐화**한다. runner 가 closure 로 끌어쓰지 않는다.
- `ctx` 는 mechanism 이 자기 안에서 만들고 외부에 노출하지 않는다. runner 와 projector 는 `ctx` 를 모른다.
- 새 메커니즘 kind 추가 절차:
  1. `MechanismKind` union 에 새 literal 추가 (예: `'reactive'`).
  2. `Mechanism` 인터페이스를 구현하는 클래스 작성 (필요 시 자체 ctx 보유).
  3. `supportedControls` 에 control-bar 에서 받을 액션 어휘 선언.
  4. `dispatch(event)` 로 View 위젯의 사용자 입력 처리.
  5. `runner.ts` 의 메커니즘 인스턴스화 분기에 새 type 등록 (현재는 `CoroutineMechanism` 한 종만 정식 지원).
- runner 는 facet `controls[].action` 이 `mechanism.supportedControls` 에 모두 포함되는지 **mount 전에 검증**해 한국어 메시지로 throw 한다 (`assertControlsSupported`).
- **두 입력 채널을 직교 분리**한다:
  - control-bar 클릭 → `mechanism.onControl(action, payload?)` (어휘: `play | pause | step | reset | speed`)
  - View 위젯 사용자 입력 → `mechanism.dispatch({ type, payload? })`
  두 채널을 섞지 않는다. control-bar 액션을 dispatch 로 보내거나 View 입력을 onControl 로 보내는 건 금지.
- mechanism 의 외부 신호는 `MechanismHooks` (`onRunningChange` / `onComplete` / `onMetric` / `onMetricsReset`) 만 사용한다. runner 가 mechanism 내부 상태를 직접 읽지 않는다.
- `Mode` 전이는 mechanism 내부 `setMode` 외 경로로 하지 않는다 — control-bar 의 running 동기화가 `hooks.onRunningChange` 로 이루어지므로 다른 경로의 전이는 동기화를 깬다.

## MUST NOT

- 러너 외부에서 `ProjectorInstance.onEvent` 를 직접 호출하지 않는다. 이벤트는 반드시 `ctx.emit` 경유.
- runner 가 알고리즘 코루틴을 직접 실행하지 않는다 — 반드시 `Mechanism` 을 통해 진행한다.
- View 가 알고리즘에 직접 명령하지 않는다 — 사용자 입력은 `params.dispatch` (→ `mechanism.dispatch`) 한 채널로만.
- `BASE_DELAY_MS` 를 facet 별로 다르게 적용하지 않는다. 속도 조정은 `control-bar.speed-slider` 와 `speedMul` 로만.
- layout-builder 가 `FacetJson.algorithm` / `projector` 를 해석하지 않는다 — 레이아웃 / 블록만 담당.

## PREFER

- 새 runtime 기능 (예: 새 control 타입) 은 `FacetJson` 스키마 확장 → `BlockSpec` 유니온에 추가 → layout-builder + runner 에서 조회. 한 번에 한 방향.
- 새 mechanism kind 가 두 종 이상이 되면 본 specific 의 "Mechanism 추상화 규약" 절을 별도 specific (예: `S-mechanism`) 으로 분리한다. 1종일 때는 본 specific 안에서 다룬다.
- 공용 헬퍼 (`parseTarget`, `stripPrefix`, `resolveLocale`) 는 runtime 진입점에서 re-export 해 소비자가 하나의 subpath 에서 가져오도록 유지.

## Exception

- `packages/core/src/examples/**` 는 러너 검증용 샘플이며 이 규칙의 대상이 아니다.
- `runner.ts` 의 `as Record<string, unknown>` / `callMethod` 경로는 control-bar 어댑터 호환을 위한 legacy 경계다. **확산 금지** — 새 기능은 정식 타입으로 작성.
