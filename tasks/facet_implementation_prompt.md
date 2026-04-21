# FACET 시각화 구현

**[기획 문서]** 섹션에 명시된 기획 문서를 입력으로 받아 FACET 리포에 facet 을 구현한다. 이 작업에서 새로운 기획 판단은 하지 않는다.

기획 문서는 **FACET 아키텍처의 제약을 모른 채** 작성된다(그렇게 작성되어야 한다 — `tasks/facet_planning_prompt.md` 참조). 따라서 기획의 일부 요구가 현재 시스템으로 **곧바로 표현되지 않는 것은 정상**이다. 이때 구현의 책임은 **기획을 깎는 것이 아니라 시스템을 확장하는 것**이다.

---

## 불가침 원칙

아래 다섯은 이 프롬프트의 다른 모든 지침에 우선한다.

1. **기획 불가침** — 기획의 "달성해야 할 시각 요소" 와 "결정적 순간" 은 구현 완료 후 육안으로 전부 드러나야 한다. "기존 시스템이 지원하지 않는다" 는 사유로 기획을 단순화·제거·희석하는 것은 **실패**다. 구현 경로가 떠오르지 않으면 시스템을 확장한다.
2. **확장은 범용 설계** — 특정 facet 전용 하드코딩 금지. 같은 패턴의 다른 facet 도 쓸 수 있는 설정 파라미터로 설계한다. 범용성 판단이 애매하면 그 facet 내부(projector 로컬) 에서 먼저 처리하고, 두 번째 사용처가 생길 때 공용 자산으로 승격한다.
3. **기존 자산 불변** — 기존 view/이벤트 어휘/runtime 훅의 **기존 메서드 시그니처와 동작 변경 금지**. 확장은 항상 "추가" 로만 한다.
4. **규율 준수** — 모든 변경은 `rules/principles.md` + `rules/concerns/C1–C9` + `rules/specifics/S-*` 를 통과해야 한다. rule-guard 서브에이전트 결과가 Clean 이어야 한다.
5. **한국어** — 모든 주석/커밋/PR/작업 기록은 한국어. 한자·일본어·중국어 금지.

---

## 입력

- **기획 문서**: `tasks/facet/<도메인>-<대상>.md` (기획 프롬프트의 출력 규약).
- **대상 식별자**: 기획 파일명의 `<대상>` 부분을 그대로 사용. 예: `bfs`, `quicksort`, `avl`.
- **카테고리**: facet 이 속할 `facets/<category>/` 디렉터리. 기본값 `cs-fundamentals`.

---

## Source of Truth (코드 참조)

구현 세부는 아래 파일이 권위다. 프롬프트 본문과 차이가 있으면 **코드가 이긴다** — 프롬프트가 오래되어 있을 수 있으므로 작업 시작 시 반드시 먼저 읽어 최신 상태를 확인한다.

| 영역 | 권위 파일 |
|---|---|
| Algorithm 계약 (`FacetContext`, `AlgorithmFn`) | `packages/core/src/runtime/context.ts` |
| Event 계약 (`FacetRuntimeEvent`, `StandardEventType`, `parseTarget`, `toIndexArray`, `TargetPrefix`) | `packages/core/src/types/event.ts` |
| Projector 계약 (`ProjectorFactory`, `ProjectorInstance`, `ProjectorRuntime`) | `packages/core/src/runtime/projector.ts` |
| FacetJson 스키마 | `packages/core/src/types/facet-json.ts` |
| IR 스키마 | `packages/core/src/types/ir.ts` |
| Locale 타입 (`{ en, ko }`) | `packages/core/src/types/locale.ts` |
| 등록 헬퍼 | `packages/core/src/runtime/registry.ts` |
| 러너 / 이벤트 버스 / 레이아웃 빌더 | `packages/core/src/runtime/{runner,event-bus,layout-builder}.ts` |
| 코어 View 카탈로그 | `packages/core/src/views/` + `index.ts` |
| 코드 패널 View | `packages/view-code/src/` |
| IR 실행기 | `packages/ir-interpreter/` |
| Transpiler (cpp/csharp/java/javascript/python/typescript) | `packages/transpiler-*/` |
| 호스트 어댑터 (Tiptap NodeView) | `packages/host-tiptap/` |
| 참고 facet (모든 6파일 실제 예시) | `facets/cs-fundamentals/bubblesort/src/` |
| 규율 | `rules/principles.md`, `rules/INDEX.yaml`, `rules/concerns/*.md`, `rules/specifics/*.md` |

---

## 아키텍처 요약

### 4-layer

```
Algorithm  →  Projector  →  FacetJson  →  Runner
```

- **Algorithm** (`facets/<cat>/<name>/src/algorithm.ts`): `async function(ctx)` 코루틴. 대상 동작 + `await ctx.emit(event)` yield 지점.
- **Projector** (`facets/<cat>/<name>/src/projector.ts`): 이벤트를 받아 뷰 인스턴스 메서드를 호출. 로직과 뷰 사이의 **단일 번역기**.
- **FacetJson** (`facets/<cat>/<name>/src/facet.ts`): TypeScript 모듈. 메타·algorithm/projector 참조·IR 참조·초기 데이터·layout·blocks 구성. 로직은 포함하지 않는다. **파일 확장자는 `.ts` (JSON 파일 아님).**
- **Runner** (`packages/core/src/runtime/runner.ts`): 기존 러너 사용. 확장은 최후 수단.

### Facet 6파일 구성 (S-facet 규율)

`facets/<category>/<name>/src/` 아래 아래 여섯 파일을 빠짐없이 둔다.

| 파일 | 책임 |
|---|---|
| `algorithm.ts` | 순수 함수 코루틴. `AlgorithmFn<TData>` + 선택적 `computeResult(initialData)` 순수 함수 export. |
| `projector.ts` | `ProjectorFactory` export. 이벤트→뷰 메서드 번역. |
| `irs.ts` | IR 정의 배열 export. phase 필드 어휘는 algorithm 의 phase payload 와 일치해야 함(C3). |
| `facet.ts` | `FacetJson` export. algorithm/projector/ir/facet 참조 문자열은 레지스트리 등록명과 일치(C4). |
| `description.ts` | 다국어 상세 설명 모듈. `{ en, ko }` 로컬라이즈. |
| `index.ts` | 위 다섯을 re-export + `register<Name>()` 헬퍼 export (등록 진입점). |

### Algorithm 계약 (요약, 실제는 `context.ts` 가 권위)

```ts
type MetricDelta = number | 'inc';

interface FacetContext<TData = unknown> {
  data: TData;
  emit(event: FacetRuntimeEvent): Promise<void>;   // 반드시 await
  metric(name: string, delta: MetricDelta): void;  // kebab-case name, facet.ts 선언분만
  readonly cancelled: boolean;                     // 루프마다 검사, 즉시 return
}

type AlgorithmFn<TData = unknown> = (ctx: FacetContext<TData>) => Promise<void>;
```

### Event 계약 (요약, 실제는 `event.ts` 가 권위)

```ts
type FacetRuntimeEvent = {
  type: string;                    // StandardEventType 또는 확장 어휘
  target?: string | string[];      // `prefix:id` 문법, parseTarget 경유
  payload?: unknown;
  silent?: boolean;                // step boundary 가 아닌 메타 이벤트(phase 동기화 등)
};

type StandardEventType =
  | 'highlight' | 'unhighlight'
  | 'mark'
  | 'state-changed'
  | 'enqueue' | 'dequeue'
  | 'append'
  | 'done';
```

- **target 문법(C1)**: `prefix:id`. 표준 prefix = `index`·`node`·`edge`·`queue`·`list`·`tree`. 파싱은 항상 `parseTarget` / `toIndexArray` 경유. 임의 문자열·자체 규약 금지.
- **어휘 확장(C2)**: 위 유니온으로 부족하면 Step 2 확장 경로 (C) 로 표준에 추가하거나, facet 국소 어휘로 `algorithm.ts` 상단 JSDoc 에 명세해야 한다.
- **phase 동기화(C3)**: `payload.phase` 값 어휘는 `irs.ts` 의 phase 필드와 반드시 일치. code-view 가 실행 라인을 맞추는 데 쓴다.

### Projector 계약 (요약, 실제는 `projector.ts` 가 권위)

```ts
type ProjectorViews = Record<string, ViewInstance>;

type ProjectorRuntime = {
  getSpeed(): number;  // 현재 재생 속도 배수 (1 = 100ms/스텝)
};

type ProjectorInstance = {
  onInit?(initialData: unknown): void;
  onEvent(event: FacetRuntimeEvent): void | Promise<void>;
  onReset?(): void;
  onDestroy?(): void;
};

type ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
) => ProjectorInstance;
```

- 애니메이션 길이는 `runtime.getSpeed()` 에 비례시킨다(S-runtime).
- `silent: true` 이벤트는 시각 변화 없이 상태만 갱신. paused 로 전환되지 않고 BASE_DELAY 도 적용되지 않는다.

---

## 작업 절차

아래 Step 순서를 엄격히 따른다. **Step 1 의 간극 목록 없이 Step 3 로 넘어가지 않는다.**

### Step 0 — 입력 분석

1. 기획 문서 전체 통독. 특히 "5. 달성해야 할 시각 요소", "6. 시각 구성", "8. 진행과 이벤트", "9. 초기 상태와 파라미터" 를 머리에 싣는다.
2. Source of Truth 표의 권위 파일을 현재 시점의 리포에서 직접 읽어 최신 계약 확인.
3. `facets/cs-fundamentals/bubblesort/` 6파일을 모범으로 훑어 흐름 감각을 맞춘다.
4. `rules/INDEX.yaml` 트리거에 매치되는 concerns/specifics 문서를 로드.

### Step 1 — 자산 대조와 간극 목록 (가장 중요한 단계)

기획의 각 요구를 현재 자산과 1:1 대조해 **간극 목록** 표를 작성한다.

| 기획 요구 | 현재 자산 / 부재 | 판정 | 대응 | 범용성 |
|---|---|---|---|---|
| (예) 동심 방사형 레이아웃 | `graph-layout` 은 force 계열만 지원 | B | `graph-layout` 에 `layoutMode: 'concentric'` + 레이어 그룹핑 옵션 추가 | 같은 패턴 다른 facet(Dijkstra, 위상정렬)도 활용 가능 → 공용 승격 |
| (예) 레이어 동시 섬광 | 표준 이벤트에 집합 점등 어휘 없음 | C | `layer-discovered` 어휘 추가 (payload: `{ nodes: string[], distance: number }`) | 계층적 그래프 탐색 전반에 재사용 |
| (예) FIFO 큐 트랙 | `queue-display` 존재 | A | 그대로 사용 | — |
| (예) 흐름 입자 트레일 | 어느 뷰도 파티클 렌더 미지원 | D | `graph-layout` 에 particle 레이어 메서드 추가 vs 신규 `effect-layer` view. 후자는 너무 일반적 → 전자 선택 | 범용 입자 옵션 |

판정 기호:

- **(A) 기존 자산 그대로 표현 가능**
- **(B) 기존 자산 기능 확장** (메서드/옵션 추가만)
- **(C) 신규 이벤트 어휘 / 신규 target prefix** (`StandardEventType` · `TargetPrefix` 에 등재)
- **(D) 신규 View / 신규 layout primitive / 신규 runtime 훅** (범용 설계)

금지 사항:

- 판정이 어렵다는 이유로 "A (간소화)" 로 내리지 않는다. A 는 기획 요구가 **그대로** 현재 자산으로 표현될 때만.
- 기획 요소를 목록에서 빠뜨리지 않는다. 5번·6번·8번 섹션의 모든 요구가 간극 목록에 1:1 로 대응되어야 한다.

범용성 판단 가이드:

- 확장이 같은 도메인의 다른 facet 에서도 의미가 있으면 공용 자산으로 승격.
- 오직 이 facet 만 쓸 패턴이면 **공용 확장하지 말고 projector 내부에서 로컬 해결**(views 래퍼, 이벤트 합성 등). 향후 두 번째 사용처가 생기면 그때 공용으로 올린다.

### Step 2 — 확장 계획서 저장

Step 3 로 넘어가기 전, 확장 계획서를 **`tasks/facet/<대상>-extension-plan.md`** 에 저장한다. 포함 항목:

1. **간극 목록** (위 표 그대로)
2. **확장별 상세**:
   - (B): 파일 · 추가 메서드 시그니처 · 기본값 · 기존 사용처 회귀 점검 체크리스트
   - (C): `event.ts` 의 `StandardEventType` 유니온 diff · payload 타입 · `rules/concerns/C2-event-vocabulary.md` 에 추가할 항목
   - (C'): `TargetPrefix` 유니온 diff · `rules/concerns/C1-target-identifier.md` 등재 항목
   - (D): 공개 인터페이스(`mount(container, config) => { destroy, ...methods }`) · 내부 상태 · design-tokens 사용 계획 · theme/locale 준수(S-view)
3. **회귀 영향 분석**: (B)(D'') 확장이 기존 facet 재생에 영향 없는지 논리적 근거(또는 필요 테스트).
4. **확장 없음 판정의 근거**: 기획 요구가 A 로 판정된 항목은 왜 A 인지.

확장 계획서가 자기검토 시 의심이 남으면 Step 3 로 넘어가지 말고 사용자에게 확인 요청. (rule-guard 는 계획 단계에서도 호출 가능.)

### Step 3 — 아키텍처 확장 구현

Step 2 계획서대로 확장을 먼저 구현한다. Facet 본체(Step 4) 보다 선행한다 — facet 은 확장된 자산 위에 올라탄다.

**(B) 기존 뷰 기능 확장**
- 파일: `packages/core/src/views/<view>.ts`
- 규칙: 새 메서드·새 `features[]` 플래그·새 옵션 키만 추가. 기존 시그니처·기본 동작 변경 금지.
- `packages/core/src/views/design-tokens.ts` 경유로만 색상. 하드코딩 금지(S-view).
- theme / locale 파라미터를 새 옵션이 받을 수 있게.
- 공개 export 필요 시 `packages/core/src/views/index.ts` 갱신.

**(C) 신규 표준 이벤트 어휘**
- `packages/core/src/types/event.ts`:
  - `StandardEventType` 유니온에 추가
  - 필요시 `StandardFacetEvent` 판별 유니온에 케이스 추가
- `rules/concerns/C2-event-vocabulary.md` 에 어휘 · payload 스키마 · 용도 등재 (rule-guard 가 이 문서를 기준으로 감사).
- 러너나 Projector 기본 경로에서 처리가 필요하면 해당 지점에 분기 추가. 대부분은 facet 의 projector 가 각자 소비하므로 러너 수정 없음.

**(C') 신규 target prefix**
- `event.ts` 의 `TargetPrefix` 유니온에 추가. `parseTarget` 은 `prefix:id` 구조만 분리하므로 코드 변경 불필요.
- `rules/concerns/C1-target-identifier.md` 에 등재.

**(D) 신규 View**
- 파일: `packages/core/src/views/<name>.ts`
- `ViewInstance` 인터페이스: `mount(container, config) => { destroy(), ...methods }` (`packages/core/src/views/types.ts` 참조).
- design-tokens 경유 색상, theme/locale 파라미터(S-view).
- `packages/core/src/views/index.ts` 에 export.
- 러너의 뷰 팩토리 맵(runner/layout-builder) 에 타입 등록. facet.ts 의 `blocks.<ref>.type` 으로 지목된다.
- 범용 설계: 설정 객체로 동작 파라미터화. 특정 데이터 형태를 가정하지 않는다.

**(D') 신규 layout primitive**
- `packages/core/src/runtime/layout-builder.ts` 에 추가. 기존 `column`/`row` 와 병렬.

**(D'') 신규 runtime 훅**
- 최후 수단. `packages/core/src/runtime/runner.ts` 수정 시 모든 기존 facet 회귀 가능(S-runtime).
- 기본값으로 opt-out. Mode 전이 · `silent` 이벤트 · `BASE_DELAY_MS` · `cancelled` 규율 준수.

**공용 자산 패키지 간 import** (C7): 각 패키지는 `src/index.ts` 경유로만 공개. 내부 파일 직접 import 금지.

확장 완료 후:

- `pnpm typecheck` 통과
- `pnpm test` 전체 녹색 (필요하면 확장 대상 테스트 추가/갱신 — vitest + happy-dom)
- rule-guard 서브에이전트 호출로 C1–C9 · S-* 감사. Clean 이어야 Step 4 진행.

### Step 4 — Facet 6파일 구현

경로: `facets/<category>/<name>/src/`

#### algorithm.ts
- `export async function <name>(ctx: FacetContext<TData>): Promise<void>`
- 기획 문서의 "진행과 이벤트" 단계마다 `await ctx.emit({ type, target, payload })` (C8 — 반드시 await).
- 반복 루프 내부에서 `if (ctx.cancelled) return;` 주기 검사(C8).
- 표준 외 확장 어휘를 쓰면 파일 상단 JSDoc 에 어휘명·용도·payload 명세 나열(C2).
- `target` 은 항상 `prefix:id` (C1). 예: `node:A`, `edge:A-B`.
- `ctx.metric(name, delta)` 의 `name` 은 facet.ts 의 `metrics[].name` 에 선언된 kebab-case 값만(C5).
- `payload.phase` 어휘는 `irs.ts` 의 phase 필드와 완전 일치(C3).
- `console.*` 금지. 오류는 `throw new Error(...)` (C6).
- 기획이 "같은 레이어 전체의 동시 발견" 같은 **집합적 순간**을 요구하면 **하나의 이벤트로 묶어 emit** — 순차 emit 루프로 풀어 쓰지 않는다(기획 수행 실패).
- `export function compute<Name>Result(initialData): TResult` — 최종 상태 순수 함수. goalPreview 가 필요하면 필수.

#### projector.ts
- `export const <name>Projector: ProjectorFactory = (views, runtime) => { ... }`
- `onInit(initialData)` — 각 뷰의 초기 상태 세팅.
- `onEvent(event)` — `event.type` 분기, `views.<ref>.method(...)` 호출. target 파싱은 반드시 `parseTarget` / `toIndexArray` (C1).
- `onReset()` — 모든 뷰를 초기 상태로.
- `onDestroy?()` — 인터벌/옵저버 해제 필요 시.
- 애니메이션 지속 시간은 `runtime.getSpeed()` 에 비례.
- `silent: true` 이벤트도 처리 분기에 포함.

#### irs.ts
- `export const <name>Imperative: IR = { id: 'ir:<name>-imperative', ... }` 등 IR 을 정의.
- `export const <name>IRs: IR[] = [ ... ]` 배열 export (복수 스타일 가능).
- 각 IR 의 phase 필드 값 집합은 algorithm.ts 의 phase payload 어휘와 1:1 일치(C3).
- code-view 를 띄우지 않을 facet 이라도 이 파일은 존재. 빈 배열 export 지양, 최소 1개 IR 을 작성해 다언어 렌더를 기본 제공.

#### facet.ts
- `export const <name>Facet: FacetJson = { ... }`
- 필수 필드:
  - `id: 'facet:<camelOrKebab>'`
  - `title: { en, ko }`, `description: { en, ko }`
  - `algorithm: 'module:<name>'`, `projector: 'module:<name>Projector'` (C4 — registry 등록명과 일치)
  - `initialData`: 기획의 "9. 초기 상태와 파라미터" 구조를 그대로.
  - `shuffleOnReset?: boolean`
  - `layout`: column/row 중첩 트리(레이아웃 primitive).
  - `blocks`: `{ <ref>: BlockSpec }`. `blocks.<ref>.type` 은 실존 view 타입명.
- `codePanel` 을 포함할 경우 `blocks.codePanel.ir: 'ir:<name>-<style>'` 은 `irs.ts` 의 IR id 와 일치(C4).
- `metrics[].name` 은 kebab-case. 이 목록에 없는 이름을 `ctx.metric` 으로 갱신하면 C5 위반.

#### description.ts
- `export const <name>Description = { ... }` — 학습자용 설명 본문(다국어).
- `registerDescription(<facet-id>, description)` 로 등록.

#### index.ts
- 6파일의 심볼을 `export` 로 재노출.
- `export function register<Name>(): void`:
  ```ts
  registerAlgorithm<TData>('<name>', <name>, { computeResult: compute<Name>Result });
  registerProjector('<name>Projector', <name>Projector);
  for (const ir of <name>IRs) registerIR(ir.id, ir);
  registerFacets([<name>Facet]);
  registerDescription(<name>Facet.id, <name>Description);
  ```
- 패키지 간 import 는 `@facet/core/runtime` 등 공개 subpath 만 사용(C7).

### Step 5 — 호스트 등록

- 호스트 앱/데모(예: `apps/playground/`) 의 facet 로더에 `register<Name>()` 호출을 추가한다. 이 호출 없이는 러너가 facet 을 찾지 못한다.
- `packages/host-tiptap/` 경유일 경우 lazy load 계약을 유지한다(S-host — DSL 파서 격리 · facet lazy load · 코어 비침투).

### Step 6 — 검증

#### 자동 검증
1. `pnpm typecheck` 전체 통과 (tsc `strict: true` 가 ESLint 역할을 대신함).
2. `pnpm test` 전체 녹색 — 회귀 확인.
3. **rule-guard 서브에이전트 호출**. 변경 파일을 대상으로 C1–C9 · S-* 감사. Clean 이어야 완료.
4. Baden MCP 가 활성이면 각 결과를 `baden_verify` 로 보고. 규칙 위반은 `baden_rule` 로 기록.

#### 육안 검증 (가장 중요)
데모 앱을 띄우고 기획 문서와 대조하며 체크.

- [ ] 기획의 **달성해야 할 시각 요소** 전부가 재생 중 드러난다.
- [ ] **시그니처 행동**이 재생 중 명확히 인지된다.
- [ ] **결정적 순간**이 매번 각인된다.
- [ ] **구별점**에 따라 유사 대상과 나란히 놓았을 때 시각적으로 다르다.
- [ ] **처음 보는 사람**이 "이게 `<대상>` 이구나" 라고 말할 수 있다.
- [ ] 기존 다른 facet 이 정상 재생 (회귀 없음).
- [ ] 재생·단계·일시정지·리셋·속도 모두 정상.

마지막 "처음 보는 사람" 항목이 실패하면 Step 1 로 돌아간다. 다른 항목이 다 통과해도 이것이 실패면 재작업.

### Step 7 — Baden / 작업 통제 (CLAUDE.md)

Baden MCP 도구가 활성이면 다음을 수행 (활성이 아니면 생략 가능):

1. 세션 시작: `baden_start_task(projectName: "FACET")` → `taskId` 수령.
2. 비자명 설계 결정 기록: `baden_plan`.
3. 파일 읽기/수정/생성 전: `baden_action` (snake_case 동사).
4. 검증 결과: `baden_verify`.
5. 규칙 사건: `baden_rule` (ruleId = `C1` 등).
6. 종료: `baden_complete_task`.

---

## 보고

채팅에는 다음만 남긴다. 계획·코드 본문을 반복 출력하지 않는다.

1. **확장 계획서 파일 경로** + 3~5 줄 요약(간극 개수, B/C/D 분포, 핵심 확장 자산).
2. **변경 파일 목록**을 카테고리별로:
   - 신규 facet 6파일
   - (B) 기존 view 확장 파일
   - (C) event.ts / 규칙 문서 diff
   - (D) 신규 view / layout / runtime
   - 호스트 등록 지점
3. **자동 검증 결과**: typecheck · test · rule-guard 각각 통과/실패.
4. **육안 체크리스트 결과**.
5. **기획 대비 타협한 부분** (있으면 이유 명시. 원칙상 최소화 — 기획 불가침).
6. **재사용 가능한 확장 자산**: 이후 facet 이 import 할 수 있는 새 자산 이름/시그니처.

---

## 자주 생기는 간극 유형과 권장 경로

| 기획 요구 유형 | 권장 경로 | 비고 |
|---|---|---|
| 집합적/동시적 시각 변화 ("레이어 전체 동시 점등", "일제 마킹") | (C) 집합 이벤트 어휘 1개 | 순차 emit 루프는 기획 의도 훼손 |
| 거리·깊이·계층 기반 좌표 | (B) `graph-layout` / `tree-layout` 에 layoutMode 추가 | 다른 탐색 facet 도 재사용 |
| 파티클·흐름 트레일·잔상 | (B) 해당 view 에 particle 레이어 메서드 또는 (D) `effect-layer` view | 너무 일반화하면 남용 위험 — 기본은 (B) |
| 비표준 자료구조 패널 | (D) 신규 view | 범용 설계 철저 |
| 기획의 단계 세분화가 현재 step resolution 초과 | (C) silent 메타 이벤트 + phase payload 활용 | BASE_DELAY 영향 없이 상태 동기화 |
| 코드 패널 없음 | facet.ts 의 `blocks` / `layout` 에서 제외 | `irs.ts` 는 여전히 최소 IR 1개 유지 권장 |
| 기획의 시각 정체성이 기존 뷰로 90% 도달, 10% 새 장치 | (B) 확장 우선 | 신규 view 양산 지양 |

---

## 자가 점검

최종 제출 전 아래가 모두 "예" 여야 한다. 하나라도 "아니오" 면 해당 단계로 돌아간다.

- [ ] 기획의 모든 "달성해야 할 시각 요소" 가 간극 목록에 대응 항목을 가졌는가
- [ ] 간극 중 (B/C/D) 확장이 범용 설계인가 (이 facet 전용 하드코딩 없음)
- [ ] 기존 view/이벤트/runtime 의 기존 시그니처가 변하지 않았는가 (추가만)
- [ ] `target` 이 전부 `prefix:id` 문법이며 `parseTarget` 경유로 소비되는가 (C1)
- [ ] algorithm 상단 JSDoc 에 확장 이벤트 어휘가 명세되어 있는가 (C2)
- [ ] algorithm 의 phase payload 어휘 = irs 의 phase 필드 어휘인가 (C3)
- [ ] `module:` / `ir:` / `facet:` 참조가 등록명과 일치하는가 (C4)
- [ ] `ctx.metric` name 이 facet.ts `metrics[].name` 의 부분집합인가 (C5)
- [ ] `ctx.emit` 이 전부 await 이고 루프에 `ctx.cancelled` 검사가 있는가 (C8)
- [ ] 패키지 간 import 가 공개 subpath 만 사용하는가 (C7)
- [ ] description / title / label 이 `{ en, ko }` 로 지역화되었는가
- [ ] `register<Name>()` 헬퍼가 호스트에서 실제 호출되어 러너가 facet 을 발견하는가
- [ ] `pnpm typecheck` + `pnpm test` + rule-guard 모두 Clean 인가
- [ ] 처음 보는 사람이 "이게 `<대상>` 이구나" 라고 말할 수 있는가

---

## [기획 문서]

(여기에 기획 파일 경로를 명시한다. 예: `tasks/facet/graph-bfs.md`)
