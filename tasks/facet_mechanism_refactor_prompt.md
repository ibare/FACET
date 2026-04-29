# FACET 메커니즘 추상화 리팩토링

FACET의 4-layer 구조를 메커니즘 추상이 가능한 구조로 리팩토링한다. 현재 알고리즘 코루틴 전제로 작성된 부분을 일반화하여, 미래의 다른 시각화 type(concept, protocol, dataStructure 등)이 자기에게 맞는 메커니즘으로 들어올 자리를 마련한다.

이 리팩토링은 **현재 코루틴 동작을 깨지 않으면서** 추상 자리만 만든다. 새 메커니즘 type은 이 작업에서 구현하지 않는다.

---

## 결정사항 잠금 (2026-04-29)

본 지침 착수 전 합의된 사항. 구현은 이 결정에 묶인다.

1. **ctx 캡슐화** — `Mechanism.init(projector, initialData): void`. ctx 는 메커니즘 내부에서 생성·보유하며 외부에 노출하지 않는다. ctx 의 emit 분기에 필요한 mode/cancelled/speed 상태도 같이 메커니즘 안에 갇힌다.
2. **JSON 컨트롤 명시 분리** — control-bar 의 `controls` 배열 항목은 `{ widget, action, label? }` 형태로 명시 분리한다. supportedControls 매칭 단위는 **action 어휘** 다.
3. **컨트롤 위젯 union 미확장** — slider/toggle/select/text-input 등 미래 위젯 타입은 union 에 추가하지 않는다. `ControlSpec` 정의 위 주석으로만 어휘 후보를 메모한다.
4. **메커니즘 입력 채널** — 사용자 입력 (View 측 위젯) 은 `Mechanism.dispatch(event: { type: string; payload?: unknown }): void` 로 직교 분리한다. control-bar 클릭은 `onControl(action, payload)` 를 그대로 쓰고, dispatch 는 그 외 사용자 입력을 받는 별도 채널이다. 입력 어휘 표준화는 새 메커니즘 type 도입 시 결정.
5. **작업량 수용** — runner.ts 의 약 200 줄(상태 변수 7 개 + emit 본체 + lifecycle 5 개 함수 + reset 데이터 복원) 이 mechanism.ts 로 이동한다. 회귀 자산 부족 시 Step 0 으로 보강한다.
6. **kind literal** — `kind: 'coroutine'` literal 로 시작하고 추후 union 으로 확장. `kind: string` 금지.

---

## 배경

현재 4-layer 구조는 다음 가정에 기반한다:
- 시각화는 `async function(ctx)` 코루틴이 emit하는 이벤트로 진행한다
- 컨트롤은 재생/정지/단계/리셋/속도다
- IR/Transpiler가 표준 보조 자산이다

이 가정은 **type=algorithm**(정렬, 탐색, 그래프 알고리즘 등)에 잘 맞지만, type=concept(Big-O), type=protocol(TCP 핸드셰이크), type=dataStructure(자료구조 자체)에는 맞지 않는다. 이런 시각화는 시간 진행이 본질이 아니거나, 사용자 입력이 주된 동력이거나, 이벤트 발행자가 단일 코루틴이 아닌 등 가정이 깨진다.

리팩토링 목표는 **"로직 모듈 = 코루틴"이라는 결합을 끊고, "로직 모듈 = 메커니즘"이라는 추상화를 도입**하는 것이다. 현재 코루틴은 메커니즘의 한 종류(`CoroutineMechanism`)로 재정의된다.

---

## 리팩토링 방향 (3+1 안)

JSON에 컨트롤을 선언하고, 메커니즘은 자기가 지원하는 컨트롤을 명시한다.

### 핵심 변경

1. **Mechanism 인터페이스 도입** — 러너가 호출하는 추상
2. **CoroutineMechanism 구현** — 현재 코루틴 동작을 이 클래스로 감싼다
3. **JSON 컨트롤 선언** — 컨트롤을 JSON 블록 구성으로 명시
4. **호환성 검증** — JSON의 컨트롤이 메커니즘의 `supportedControls`에 포함되는지 러너가 확인

### Mechanism 인터페이스

```typescript
type MechanismKind = 'coroutine'; // 미래: 'reactive' | 'sequence' | ... 로 union 확장

interface Mechanism {
  // 메커니즘 식별 (literal — 새 메커니즘 추가 시 union 에 등록)
  kind: MechanismKind;

  // 이 메커니즘이 지원하는 컨트롤 액션 어휘 (control-bar 의 action 매칭용)
  // CoroutineMechanism: ['play', 'pause', 'step', 'reset', 'speed']
  supportedControls: string[];

  // 라이프사이클
  // ctx 는 메커니즘이 자체 생성·보유한다 (외부 비공개).
  // 외부는 projector 와 initialData 만 알면 된다.
  init(projector: Projector, initialData: unknown): void;
  start(): Promise<void>;
  stop(): void;
  reset(): void;
  destroy?(): void;

  // 컨트롤바 액션 처리 (play/pause/step/reset/speed)
  onControl(action: string, payload?: unknown): void;

  // 사용자 입력 채널 (View 위젯 → 메커니즘).
  // control-bar 클릭과 직교한다. 어휘는 메커니즘이 자체 정의.
  dispatch(event: { type: string; payload?: unknown }): void;
}
```

### CoroutineMechanism 구현

현재 러너 안에서 `await algorithmFn(ctx)`로 직접 호출하던 부분을 이 클래스로 옮긴다.

```typescript
class CoroutineMechanism implements Mechanism {
  readonly kind = 'coroutine' as const;
  readonly supportedControls = ['play', 'pause', 'step', 'reset', 'speed'];

  constructor(private coroutineFn: (ctx: FacetContext) => Promise<void>) {}

  // 내부 상태 (현재 러너 클로저에서 이동):
  //   ctx, mode, cancelled, runId, activePromise,
  //   stepResolve, pendingTimer, pendingTimerResolve, speedMul, metricsState, projector
  // ctx 는 init 시점에 메커니즘이 직접 생성하며 외부에 노출하지 않는다.

  init(projector, initialData) { /* projector 보관 + ctx 생성 (현재 러너의 ctx 로직 이동) */ }
  start()  { /* 현재 러너의 play 로직 */ }
  stop()   { /* pause */ }
  reset()  { /* 현재 러너의 reset 로직 — 데이터 복원은 메커니즘이 책임 */ }
  destroy() { /* cancelled = true + pending timer/step resolve 정리 */ }

  onControl(action, payload) {
    switch (action) {
      case 'play':  this.start(); break;
      case 'pause': this.stop(); break;
      case 'step':  this.step(); break;
      case 'reset': void this.reset(); break;
      case 'speed': this.setSpeed(payload as number); break;
    }
  }

  dispatch(_event) {
    // CoroutineMechanism 은 사용자 입력 채널을 사용하지 않는다.
    // 새 메커니즘 type 이 들어올 때 의미 있는 처리 추가.
  }
}
```

### JSON 컨트롤 선언

기존 `controls` 배열은 문자열(액션)과 객체(위젯 spec)가 섞여 있어 매칭 단위가 모호했다. **`{ widget, action, label? }` 명시 분리 형태** 로 통일한다. supportedControls 매칭은 `action` 어휘로만 한다.

리팩토링 후:
```json
"blocks": {
  "controls": {
    "type": "control-bar",
    "controls": [
      { "widget": "button", "action": "play" },
      { "widget": "button", "action": "step" },
      { "widget": "button", "action": "pause" },
      { "widget": "button", "action": "reset" },
      { "widget": "speed-slider", "action": "speed", "default": 1, "steps": [0.25, 0.5, 1, 2, 4, 8] }
    ],
    "metrics": [...]
  }
}
```

규칙:
- 각 항목은 객체. `widget` 은 control-bar 가 어떤 UI 를 그릴지, `action` 은 메커니즘이 어떤 동작을 받을지 결정.
- `label` 은 선택. 누락 시 control-bar 가 locale 별 기본 라벨을 사용 (현재 동작 유지).
- 러너는 `supportedControls.includes(action)` 으로 호환성 검증. 미지원 action 이 선언되면 한국어 메시지로 throw.
- 배열이 비어있거나 누락 시 기본값 `[{widget:'button',action:'play'},…,{widget:'button',action:'reset'}]` 사용 (현재 동작 유지).

타입:
```typescript
type ControlSpec = { widget: string; action: string; label?: LocaleStr; [key: string]: unknown };
```
(미래 위젯 어휘 후보 — slider/toggle/select/text-input — 는 본 작업에서 union 에 추가하지 않는다. 주석으로만 남긴다.)

### 러너의 변경

현재 러너의 흐름:
```
JSON 로드 → 알고리즘 모듈 import → ctx 생성 → algorithmFn(ctx) 직접 호출
                                              ← 컨트롤 클릭이 직접 알고리즘 상태 조작
```

리팩토링 후:
```
JSON 로드 → 모듈 import (코루틴 함수)
        → CoroutineMechanism 으로 감쌈
        → mechanism.init(projector, initialData)   // ctx 는 메커니즘 내부에서 생성
        → JSON 의 controls[].action 과 mechanism.supportedControls 호환성 검증
        → 컨트롤바 클릭   → mechanism.onControl(action, payload)
        → View 사용자 입력 → mechanism.dispatch({ type, payload })
        → mechanism 이 자기 상태 조작 + projector.onEvent 호출
```

View 가 `dispatch` 를 호출할 수 있도록 러너가 mechanism 핸들을 View 측에 전달하는 경로가 필요하다. 구현 시점에 다음 둘 중 하나를 택한다 (구현자가 결정):
- (i) `ViewMountParams` 에 `dispatch` 콜백 주입 — View 가 직접 호출.
- (ii) Projector 가 `dispatch` 를 보유하고 View 가 Projector 경유로 호출 — 단, View → Projector 역방향 호출은 원칙 5("Projector 가 유일한 번역기 — 알고리즘 → View") 와 충돌하므로 (i) 권장.

### 자동 메커니즘 래핑

JSON의 `"algorithm": "module:bubblesort"` 필드는 현재대로 유지. 러너가 모듈을 로드해서 다음을 판정:

- 모듈이 `async function`이거나 `function`이면 → `CoroutineMechanism`으로 자동 래핑
- 미래에 모듈이 `Mechanism` 인터페이스를 직접 구현한 객체이면 → 그대로 사용

이러면 기존 시각화 JSON·코드는 변경 없이 작동한다.

---

## 작업 절차

### Step 0 — 회귀 테스트 점검·보강

runner 의 약 200 줄이 mechanism.ts 로 이동하는 작업이므로, 이동 전에 runner-level 회귀 테스트가 다음을 커버하는지 확인한다. 부족한 항목은 이동 전에 먼저 추가한다.

- control-bar wire-up (play/step/pause/reset/speed 클릭이 algorithm 상태를 올바르게 조작)
- pause 후 resume 시 emit 의 `mode === 'paused'` 분기 정상 동작
- step boundary — `silent` 이벤트는 step 으로 멈추지 않는다
- reset 후 즉시 재생 시 올바른 초기 상태 (S-runtime §reset 순서)
- `shuffleOnReset: true` 인 facet 의 mount/reset 시점 셔플
- speed 변경이 다음 emit 의 지연에 즉시 반영

### Step 1 — 인터페이스와 CoroutineMechanism 구현

1. `packages/core/src/runtime/mechanism.ts` 생성
   - `Mechanism` 인터페이스 + `MechanismKind` literal union 정의
   - `CoroutineMechanism` 클래스 구현
   - 현재 러너 안에 있던 코루틴 실행, **ctx 생성**, play/pause/step/reset/speed 로직을 이 클래스로 이동
   - ctx 는 메커니즘 내부 private 멤버. 외부 노출 금지.

2. `packages/core/src/runtime/runner.ts` 수정
   - 알고리즘 모듈 로드 후 `CoroutineMechanism` 으로 감싸는 헬퍼
   - `mechanism.init(projector, initialData)` 호출
   - control-bar 클릭 → `mechanism.onControl(action, payload)` 라우팅
   - View 입력 채널 → `mechanism.dispatch(event)` 라우팅 (위 §러너의 변경 (i) 안)
   - JSON `controls[].action` 과 `mechanism.supportedControls` 호환성 검증, 미지원 시 한국어 메시지로 throw

3. ctx 인터페이스(`FacetContext`) 자체는 변경하지 않음
   - `ctx.emit`, `ctx.metric`, `ctx.cancelled`, `ctx.data` 시그니처 그대로
   - 단, ctx 의 **소유자가 runner → mechanism 으로 이동**

### Step 2 — 기존 시각화 호환성 검증

기존 시각화(bubble sort, quick sort 등)가 변경 없이 작동하는지 확인:

1. 기존 알고리즘 모듈 (`async function bubblesort(ctx)`)이 그대로 로드됨
2. 러너가 자동으로 `CoroutineMechanism`으로 감쌈
3. 기존 JSON의 컨트롤 선언이 `supportedControls`와 호환됨
4. 재생/정지/단계/리셋/속도 모두 정상 작동
5. 이벤트 발행 → Projector → 뷰 갱신 흐름 변경 없음

회귀 테스트로 기존 시각화 모두 통과 확인.

### Step 3 — 컨트롤 어휘 정리

현재 `ControlSpec` 은 문자열(액션) + `{type:'speed-slider'}` + `{type:'button'}` 가 union 으로 섞여 있다. **단일 객체 형태** 로 통일한다.

```typescript
// packages/core/src/types/facet-json.ts
// 미래 위젯 어휘 후보 (이번 작업에서는 union 에 추가하지 않음):
//   slider / toggle / select / text-input
// 새 메커니즘 type 이 들어올 때 그 요구사항에 맞춰 union 확장.
type ControlSpec = {
  widget: string;     // 'button' | 'speed-slider' | …
  action: string;     // 메커니즘이 받는 액션 어휘 (supportedControls 매칭 단위)
  label?: LocaleStr;  // 선택. 누락 시 control-bar 가 locale 별 기본 라벨 사용
  [key: string]: unknown; // widget 별 부가 옵션 (예: speed-slider 의 default/steps)
};
```

control-bar 뷰는 `widget` 을 보고 렌더, `action` 을 보고 핸들러 발신. 기존 `'play'` 문자열 / `{type:'speed-slider'}` / `{type:'button'}` 입력은 모두 마이그레이션해야 하므로 facets/* 의 facet.ts 도 동시에 업데이트한다 (회귀 테스트로 보호).

### Step 4 — 문서·타입 정리

- `Mechanism` 타입을 코어 패키지의 public export에 포함
- 향후 새 메커니즘 추가 시 어떻게 작성하는지 짧은 가이드 문서
  - `docs/mechanisms.md` 또는 README 섹션
  - 코루틴 외 다른 메커니즘 예시는 "TBD" 또는 "concept type 들어올 때 추가"

### Step 5 (작업 외) — 미래 작업 메모

다음은 이번 리팩토링에서 **하지 않는다**. 메모로만 남긴다.

- ReactiveMechanism, SequenceMechanism 등 새 메커니즘 구현
- 컨트롤 패널 뷰의 새 컨트롤 타입 렌더링 (slider 외)
- type=concept, type=protocol 등 새 시각화 type의 정식 도입
- IR/Transpiler를 type별로 분리

이들은 새 시각화 type이 실제로 들어올 때 그 요구사항을 보고 결정.

---

## 변경하지 않는 것

다음은 이번 리팩토링에서 건드리지 않는다.

- **시각화 JSON 형식** — 기존 그대로
- **알고리즘 모듈 코드** — 기존 코루틴 함수 그대로
- **Projector 인터페이스** — 기존 그대로
- **View Catalog** — 기존 뷰 변경 없음
- **이벤트 어휘** — 표준 어휘 그대로
- **IR/Transpiler** — 별도 처리 안 함
- **호스트 어댑터(Tiptap)** — 변경 없음

이 리팩토링의 본질은 **러너 내부의 한 단계 추상화**이고, 외부 인터페이스는 모두 유지.

---

## 검증 기준

작업 완료 후 다음을 확인하고 체크리스트로 보고한다.

- [ ] `Mechanism` 인터페이스 + `MechanismKind` literal union 이 정의됨
- [ ] `CoroutineMechanism` 클래스가 현재 코루틴 실행 로직을 감싸고 있음 (ctx 는 내부 private)
- [ ] `init(projector, initialData)` 시그니처 — ctx 가 외부에 노출되지 않음
- [ ] `dispatch(event)` 채널이 인터페이스에 존재하고 View 측에서 호출 가능 (CoroutineMechanism 은 no-op)
- [ ] 러너가 `mechanism.start/stop/reset/onControl/dispatch` 를 통해 작동
- [ ] 알고리즘 모듈을 로드하면 자동으로 `CoroutineMechanism` 으로 래핑됨
- [ ] JSON `controls[].action` ↔ `mechanism.supportedControls` 호환성 검증이 작동함 (미지원 시 한국어 throw)
- [ ] 기존 facets/* 의 control-bar 선언이 `{ widget, action }` 객체 형태로 마이그레이션됨
- [ ] 재생/정지/단계/리셋/속도 모두 정상 작동
- [ ] Step 0 회귀 테스트 항목 모두 통과
- [ ] 미래 위젯 어휘(slider/toggle/select/text-input) 가 `ControlSpec` 정의 위 주석으로만 남음 (union 미확장)
- [ ] 문서(또는 코드 주석) 에 메커니즘 추가 방법 짧은 가이드 포함

---

## 완료 후 보고

다음을 보고한다.

1. 변경된 파일 목록
2. `Mechanism` 인터페이스와 `CoroutineMechanism` 클래스의 핵심 코드 (요약)
3. 러너의 변경된 부분 (요약)
4. 검증 체크리스트 (통과/미통과 + 이유)
5. 회귀 테스트 결과 (기존 시각화들이 정상 작동하는지)
6. 미래 새 메커니즘 추가 시 어디를 어떻게 건드려야 하는지 짧은 안내
