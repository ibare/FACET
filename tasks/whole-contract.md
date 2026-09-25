# 완제품 계약 카드 — whole-builder 가 먼저 읽는 한 장

완제품(projector facet) 하나를 만드는 데 필요한 **계약**만 모았다. `tasks/piece-contract.md` 의 짝이다.
규범 판정은 `rules/` 가 한다 — 이 카드와 규칙 문서가 어긋나면 **규칙 문서가 이긴다.** 줄마다 출처를
달아 두었으니 애매하면 그 문서의 그 절만 연다.

## 왜 있나

2026-09-18 배치의 완제품 에이전트 스물둘은 이 카드 없이 돌았다. 에이전트마다 규칙 문서 전문과 core 소스
스무 남짓을 `cat` 으로 처음부터 읽었고(첫 파일까지 4~7 분), 자체 검증과 렌더 스크립트를 새로 짰다. 평균
**6.1M 토큰 · 33 분**, 조각의 세 배였다. 조각 쪽이 계약 카드 · `piece-check` 로 17.8 → 9.6 분이 된 것과 같은
처방이다.

**이 카드에는 좌표 · 배치 · 골격 · 예시 stage 코드가 없다.** 넣으면 템플릿이 되고 템플릿은 관성을 낳는다.
형태는 사양의 **운동의 동사**("손잡이를 돌리면 무엇이 옮겨 가는가")가 정한다.

## 이것만 더 읽는다

1. `rules/principles.md` — 늘 읽는다 (짧다)
2. 호스트가 준 **공통 안내문** — 이 배치의 도메인 규약(같은 것을 같은 규약으로 세는 법)과 앞서 걸린 함정
3. 네 사양 한 파일 — **형제 사양은 열지 않는다**
4. 막히면 해당 규칙 문서의 해당 절. 색을 고를 때만 `rules/specifics/S-view.md` 의 "색 토큰 결정 트리",
   IR 이름을 지을 때만 `rules/specifics/S-transpiler.md` 의 예약어 절

**다른 facet 의 구현 파일은 열지 않는다** — 조각이든 완제품이든, 같은 이름의 조각이든. core 타입
(`packages/core/src/**`)은 열어도 되지만 아래 "쓰는 API" 로 대개 충분하다. core 소스를 훑어 읽지 않는다.

## 산출물과 이름

디렉터리 `facets/<domain>/<topic>/` (kebab-case), facet id `facet:<camel>` 일 때:

| 파일 | 내놓는 것 | 규칙 |
| --- | --- | --- |
| `package.json` | `name: @ffacet/algorithm-<topic>`, `version: 0.0.0`, `private: true`, `type: module`, main · types · `exports["."]` 가 `./src/index.ts`, `scripts.typecheck: "tsc --noEmit"`, `dependencies: { "@ffacet/core": "workspace:*" }`, `devDependencies: { "@ffacet/ir-interpreter": "workspace:*" }` | — |
| `tsconfig.json` | `extends: ../../../tsconfig.base.json`, `compilerOptions: { outDir: dist, noEmit: true }`, `include: [src]` | — |
| `src/algorithm.ts` | `<camel>Algorithm` · 자료 타입 `<Pascal>Data` | C2 · C3 · C5 · C8 |
| `src/projector.ts` | `<camel>Projector: ProjectorFactory` | S-facet · C9 · C10 |
| `src/irs.ts` | `<camel>ImperativeIR` · `<camel>IRs: IR[]` (IR 을 두지 않기로 했으면 빈 배열 + 까닭 주석) | S-facet · S-transpiler |
| `src/<topic>-stage.ts` | `<camel>StageView: CanvasView` | S-view |
| `src/facet.ts` | `<camel>Facet: FacetJson` | S-facet · C10 |
| `src/index.ts` | 위 전부 re-export + `register<Pascal>()` 하나 | S-facet |
| `test/<topic>.test.ts` | 아래 "검수 조건" 중 facet 고유의 것 | — |
| `apps/playground/src/descriptions/<camel>.md` | 데모 설명 글. 자기 토큰 `{facet:<camel>}` 을 반드시 담는다 | S-facet · C4 |

`src/` 에 이 여섯 말고 다른 `.ts` 를 두지 않는다. **완제품은 `projector.ts` 다 — `scene.ts` 가 아니다**
(`tasks/scene-migration-protocol.md` "ProjectorFactory 는 걷어내지 않는다").

**이름이 서로 맞아야 하는 자리** (C4 · S-facet. `whole-check` 가 잰다):

- 알고리즘 등록 이름 `'<camel>'` = `algorithm: 'module:<camel>'` = IR 의 `algorithm: '<camel>'`
- projector 등록 이름 `'<camel>Projector'` = `projector: 'module:<camel>Projector'`
- view id `'<topic>-stage'` = stage 블록 `type`. 전역 레지스트리라 짧은 이름은 부딪힌다
- IR id `'<topic>-imperative'` = 코드 패널 블록의 `ir: 'ir:<topic>-imperative'`
- `initialData.type` 은 `'<topic>'`
- **`register` 로 시작하는 export 는 `register<Pascal>` 하나뿐.** 전수 검사가 `register*` export 를 전부 인자 없이 부른다
- camelCase 는 사양의 facet id 를 그대로 쓴다 (`topKTopP` · `kvCache` — 약어도 낱말 하나로 친다)

## 쓰는 API

전부 `@ffacet/core/runtime` 에서 온다 (`IR` 타입만 `@ffacet/core`, `runIR` 만 `@ffacet/ir-interpreter`).

```ts
// 등록
registerAlgorithm, registerProjector, registerIR, registerView, registerFacets
// 선언
type FacetJson, CONTROL_SET          // 재생 컨트롤: [...CONTROL_SET.playback, <손잡이들>]
// 알고리즘
type FacetContext, type ReactiveContext, type FacetRuntimeEvent
// projector
type ProjectorFactory, type ProjectorViews, type Translate
// 그림
type CanvasView, type ViewMountParams, type ViewInstance, type Palette,
getColors, makeTranslator, fonts, fontSizes, categorical, mountView
// 검사에서
runIR(ir, '<진입 함수>', args)   // @ffacet/ir-interpreter
getAlgorithmMechanismKind('<camel>')
```

- `FacetContext<D>` = `{ data: D; emit(e): Promise<void>; metric(name, delta: number | 'inc'): void; readonly cancelled: boolean }`
- `ReactiveContext<D>` = 위 + `waitForInput<T>(): Promise<T>` · `sleep(ms): Promise<boolean>` · `pollInput<T>(): T | null`.
  `T` 에는 **`T extends ReactiveInputEvent`**(`{ type: string; payload?: unknown }`) 제약이 있다 — 임의 모양을 넣으면 tsc 가 막는다.
  제네릭 없이 받고 payload 를 `typeof` 로 좁힌다 (2026-09-25 프로그래밍 기초 완제품 셋이 따로 걸렸다)
  알고리즘은 `FacetContext<D>` 로 받아 `as ReactiveContext<D>` 로 좁힌다
- 입력: `{ type: <손잡이 action>, payload: { value, segmentIndex, ...<손잡이 name 별 지금 값 (문자열)> } }`
- `ProjectorFactory` = `(views: Record<string, ViewInstance>, runtime?: { getSpeed(): number; t: Translate }) => { onInit?(data); onEvent(e): void | Promise<void>; onReset?(); onDestroy?() }`.
  `views` 의 키는 `blocks` 의 ref(`stage` · `codePanel` · `controls` …)
- `CanvasView` = `{ canvas: { width?, height, fit? }; mount(container, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance }`.
  `ViewInstance` 는 `{ destroy(): void; [method]: unknown }` — projector 가 부를 메서드를 여기 연다
- `ViewMountParams` = `{ config, initialData?, locale?, t?, theme? }`
- 코드 패널(`code-view`) 인스턴스는 `highlightPhase(phase: string | null)` · `clearHighlight()` 를 연다
- 팔레트 이름: `bg bgSubtle border text textMuted textInverse primary primaryHover accent danger success itemDefault itemComparing itemSwapping itemSorted itemPivot itemActive stateInk`

**IR 어휘** (`packages/core/src/types/ir.ts` 전부다):

```ts
IR      = { id; algorithm; paradigm: 'imperative'; functions: IRFunc[] }   // 첫 함수가 진입점
IRFunc  = { name; params: { name; type: IRType }[]; returnType: IRType; body: IRStmt[] }
IRType  = int | double | bool | string | void | { kind: 'list'; of: IRType }
IRExpr  = lit | var | index{arr,idx} | len{of} | binop{op,l,r} | unop{op:'!'|'-',x} | call{fn,args}
IRStmt  = var{name,type,init} | assign{target,expr} | if{cond,then,else?} | for-range{var,from,to,inclusive,body}
        | while{cond,body} | swap{a,b} | return{expr?} | break | continue | expr-stmt{expr} | comment{text}
          // comment 를 뺀 문마다 phase?: string
IRBinOp = + - * / // %  < <= > >=  == !=  && ||
수학    = exp log sqrt abs max min floor   (IR_MATH_BUILTINS 뿐)
```

## index.ts — 등록 순서와 mechanismKind (S-facet MUST)

1. `registerAlgorithm<Data>('<camel>', <camel>Algorithm, { mechanismKind: 'reactive' })`
2. `registerProjector('<camel>Projector', <camel>Projector)`
3. `for (const ir of <camel>IRs) registerIR(ir.id, ir)`
4. `registerView('<topic>-stage', <camel>StageView)`
5. `registerFacets([<camel>Facet])`

**손잡이가 하나라도 있으면 `mechanismKind: 'reactive'` 를 여기 등록 옵션에 적는다** — `facet.ts` 가 아니다.
coroutine 으로 두면 러너가 **마운트 시점에 throw** 하고, 통과해도 `dispatch` 가 no-op 이라 손잡이가 알고리즘에
닿지 않는다 (`whole-batch-protocol.md`). `register<Pascal>()` 를 index.ts 가 스스로 부르지 않는다.

## facet.ts — 선언

- `id` · `title` · `description` — **열 언어** `en ko ja zh ar es fr hi id pt` (facet-i18n 테스트)
- `algorithm: 'module:<camel>'`, `projector: 'module:<camel>Projector'`
- `initialData` — 첫 필드 `type: '<topic>'`, 그리고 `stepMs`. **구조가 1차 데이터**다(값 · 목록 · 간선 · 확률표 ·
  손잡이 사다리). 점수 · 등수 · 합 · 백분율 같은 **파생값은 알고리즘이 셈한다.** 사양의 표는 **대조용**이다 —
  셈한 값이 사양 표와 다르면 멈추고 보고한다 (호스트가 틀렸을 수 있다)
- **소재 텍스트는 자료다** — 사양이 준 글은 `initialData` 에 두고 번역하지 않으며 **한 글자도 바꾸지 않는다**
- **사람이 읽는 이름은 데이터가 아니다** — 데이터에는 식별자, 표시 이름은 `messages` 의 `label.*` 로
- `layout` — `{ type: 'column', gap, children: [{ref:'header'}, {ref:'stage'}, {ref:'controls'}, {ref:'codePanel'}] }` 꼴
- `blocks`
  - `header: { type: 'title-block' }`
  - `stage: { type: '<topic>-stage' }`
  - `controls: { type: 'control-bar', controls: [...CONTROL_SET.playback, <손잡이들>], metrics: [...] }`
  - `codePanel: { type: 'code-view', ir: 'ir:<topic>-imperative', label: <열 언어> }` (IR 을 두지 않으면 이 블록도 없다)
- `messages` — stage 와 projector 가 그리는 문안 전부. 모양은 **키가 바깥, 언어가 안쪽**
  (`{ 'caption.x': { en, ko, … } }` — 거꾸로 써도 tsc 는 통과하고 검사가 키 전부를 "선언 없음" 으로 잡는다)
- `messages` 의 값은 **리터럴로 적는다** — facet-i18n 검사는 `facet.ts` 를 글자로 읽어 `'label.x': SOME_CONST` 를 선언으로 보지 못한다.
  번역하지 않는 약어(`DMA`)도 열 언어 모두 같은 값의 객체로 둔다(단일 문자열은 손잡이 구간 라벨에만) (2026-09-25 운영체제 배치)
- `initialData` 의 타입은 `type` 별칭으로 — `interface` 로 두면 index signature 가 없어 `initialData` 자리에서 tsc 가 막는다 (같은 배치)

**손잡이 (`segmented-slider`)**

```ts
{
  widget: 'segmented-slider',
  action: '<액션>',          // 알고리즘이 input.type 으로 받는 이름
  name: '<액션>',
  label: { en, ko, ja, zh, ar, es, fr, hi, id, pt },   // 손잡이의 이름만
  segments: [{ value: <number>, label: <문자열 또는 열 언어>, default: true }, { value: <number>, label: … }],
}
```

- **`segments[].value` 는 number 다.** 식별자면 값을 0.. 순번으로 두고 목록은 `initialData` 로 뺀다
- **구간 라벨이 원어 그대로 통용되는 표식이면**(`'16'` · `'0.25'` · `'75%'`) 단일 문자열. `{ en: '16' }` 으로 적으면
  i18n 감사가 열 언어를 요구해 깨진다. 낱말이면 열 언어
- 손잡이 라벨은 **24 자 이하**, `이름 — 설명` · `이름: 설명` 꼴 금지 (`control-label-fits`)
- 사다리(`initialData` 쪽)와 `segments[].value` 가 같아야 한다 — 검사로 잠근다

**계기** (C5): `metrics: [{ name: '<kebab-case>', label: { 열 언어 }, initial: 0 }, ...]`. 이름은 사양 그대로.

## algorithm.ts

- 상단 JSDoc 에 **이벤트 목록 + payload 스키마 + silent 여부**, **phase 어휘**, **계기 목록** (C2 · C3 · C5)
- `ctx.emit` 은 **늘 `await`**, `type` 은 **리터럴** (C2 · C8)
- 루프 바디 첫 문장에서 취소를 본다 — `if (ctx.cancelled) return …;` 또는 `if (!(await pause())) return …;` (C8)
- `ctx.sleep` 은 `Promise<boolean>` — **그 값을 버리면 취소가 먹지 않는다** (C8. `whole-check` 가 잡는다)
- 헬퍼 이름을 `t` · `tr` 로 두지 않는다 — C10 · i18n 검사가 번역 호출로 읽는다
- 셈하는 코드는 모르는 모양 · 셈할 수 없는 상태를 `?? 0` · `continue` 로 지나치지 않고 던진다 (C6). projector · stage 도 받은 값이 비면 0 을 지어내지 말고 던진다
- 테스트 파일이 stage 를 마운트하면 머리에 `// @vitest-environment happy-dom` (둘이 따로 `document is not defined` 에 걸렸다)
- `waitForInput` 루프는 **앞뒤로** `ctx.cancelled` 를 본다. 우리 것이 아닌 입력은 `continue` 로 흘리고, payload 의
  `value` 는 `typeof === 'number'` 와 **사다리 소속**을 확인하고 받는다 (C8 · C9)
- 최상위 `try` 를 두면 `catch (err) { if (!ctx.cancelled) throw err; }` 가 정본. `catch { return; }` 금지 (C8)
- `phase` 는 `silent: true`. 헬퍼 `const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true })`
  는 허용 — 호출부가 **리터럴** (C3). phase 집합은 algorithm 과 irs.ts 가 **정확히 같다**
- `Math.random` 금지 — 난수가 필요하면 식까지 적힌 생성기

**손잡이를 받는 짜임** — "한 판을 끝까지 재생 → `waitForInput` → 받은 값으로 다시 재생". 입력은 mechanism 의
**큐**에 쌓여, 재생 도중 돌리면 지금 판이 끝나고 다음 `waitForInput` 에서 받힌다.

**걸음 경계 사이에는 마지막 phase 하나만 켜진다 (덮이는 phase).** reactive 에서 걸음 경계는 `sleep` 과 입력
대기뿐이고 코드 패널의 `highlightPhase` 는 앞 것을 덮는다. `sleep` 없이 연달아 보낸 phase 는 **한 번도 켜지지
않는다** — C3 의 "집합이 같다" 는 통과하면서. 코드 패널에 보여야 할 줄의 phase 뒤에는 걸음 경계를 둔다.
(2026-09-18 컴퓨터 구조 완제품 열하나 중 여섯. `whole-check` 가 모든 손잡이 값으로 돌려 잰다)

**계기(`ctx.metric`)는 누적 채널이다.** 더하기만 하고, 러너는 **되감기 때만** 비운다. 손잡이를 돌려 다시 도는 것은
되감기가 아니다 — 그대로 두면 판마다 쌓인다.
- **지금 보이는 값을 들고 차이만 보내는 헬퍼**를 둔다. 계기 이름은 호출부에 **리터럴** (C5)
- **처음 한 번은 차이가 0 이어도 보낸다** — 안 보내면 갈리지 않는 손잡이 값에서 이름째 빠져 "선언한 계기가 빠진
  것" 과 구별되지 않는다
- 판이 바뀌는 자리에서 0 으로 되돌리는 것도 이 헬퍼로

**수에 대해**
- **백분율은 반올림으로** — `(x * 100 + n // 2) // n`. 알고리즘과 IR 이 같은 식을 쓴다
- **실수 동률을 믿지 않는다** — 정수로 견준다 (`5.7000000000000002` 대 `5.699999999999999` 로 재현율을 잃은 적이 있다)
- **동률 규칙을 코드 머리말과 글에 적고, 이 데이터에서 실제로 걸리는지 세어 보고한다**
- **화면과 글에서 자리 · 등수 · 번호는 1 부터.** 배열 색인은 0 부터 다뤄도 되지만 읽는 자리에서 하나를 더한다

## projector.ts · stage

- stage 의 구조적 표면을 **타입 하나로 모아** `views.stage as unknown as <Stage> | undefined` 로 좁힌다 (C9).
  `mountView` 반환형은 오픈 타입이라 그대로 쓰면 `instance.setX?.()` 가 `{}` 로 좁혀져 **호출이 불가능해진다** —
  손잡이가 죽는데 눈으로는 안 잡힌다
- `case 'phase'` 에서 코드 패널로 `highlightPhase(phase)` 를 넘긴다. silent 는 "걸음 경계가 아니다" 이지
  "projector 에 안 온다" 가 아니다 (code-panel-phase 테스트)
- 번역기는 러너가 주는 것 — projector 는 `runtime?.t ?? makeTranslator()`, stage 는 `params.t ?? makeTranslator(params.locale)`.
  **손수 만든 대체 번역기를 두지 않는다** (셋이 `vars` 를 버려 `{n}` 이 날것으로 떴다)
- `t('<키>', '<en 원본>', vars)` — **키와 en 원본 둘 다 리터럴**, en 원본은 facet.ts 의 en 과 **글자까지 같다** (C10)
- 문안 — 자리 표시자 뒤에 **받침 따라 바뀌는 조사**를 붙이지 않는다 (`'{word} 를'` 이 `box 를` 로 뜬다). 문장을 바꿔
  조사가 필요 없게 한다. 값 삽입은 `{name}` + vars. 결론을 캡션 글자에 상수로 박지 않는다
- payload 는 `typeof` 가드로 읽는다. `payload as <이름 붙은 타입>` · `p.items as Item[]` 로 믿지 않는다 (C9)
- 색은 `getColors(theme)`, 글꼴은 `fonts`/`fontSizes`. hex · rgba · 글꼴 이름 리터럴 0 건 (S-facet · S-view). 글자 폭 셈용 크기도 `parseFloat(fontSizes.sm)` 처럼 토큰에서 (`const CODE_PX = 12` 금지)
- **마운트 뒤 세로를 바꾸지 않는다** — 사다리의 가장 큰 값이 들어갈 자리를 처음부터 잡는다 (canvas-height)
- 러너가 붙여 준 캔버스를 떼지 않는다 — `container.textContent = ''` 금지 (canvas-attach)
- `initialData` 가 없어도 마운트에서 던지지 않는다 — 전수 검사가 `config: {}` 만 주고 마운트한다
- 한 판이 끝나 입력을 기다리는 동안 재생 · 한 걸음 단추가 꺼지는 것은 정상이다

**운동 — 필수.** 손잡이를 돌리면 화면의 무엇이 **자리를 옮기거나 모양이 바뀌어야** 한다. 값을 갈아 끼우는
재그리기만으로는 관성 계측의 운동 항목(≥ 70%)을 못 넘는다. 사양의 **운동의 동사**가 화면에서 **시간에 걸쳐**
일어나게 한다 (rAF 또는 CSS transition — 완제품의 transition 은 위반이 아니다). 길이는 **재생 속도를 따라가게**
(`runtime.getSpeed()` 를 그때그때 읽는다 — 요소를 만들 때 한 번 박으면 속도를 올려도 걸음 경계를 넘는다).
opacity 만으로는 운동이 아니다. 앞 판의 결과가 새 판의 결과로 **옮겨 가는** 것이 가장 강한 운동이고, 지우고
처음부터 다시 쌓는 것이 가장 약하다.

**금지** — 전제 · 출처 각주. "예로 정한 값" · "낱말 하나를 토큰 하나로 친다" · 논문 인용 같은 줄을 화면에 늘
두지 않는다. 전제는 **설명 글과 개념 메타**가 밝힌다 (2026-09-18 AI 배치에서 완제품 다섯이 올렸다가 걷었다).

## IR — 코드 패널은 화면과 같은 답을 내야 한다

IR 이 셈하는 값과 화면이 보이는 값이 어긋나면 그것이 거짓말이다. 주석으로 간극을 밝히는 것으로는 모자라다.

- **IR 함수는 배열을 만들 수 없다.** 받아서 읽고 쓸 뿐이다. 버퍼는 **매개변수로 받고** 부르는 쪽이 길이만큼 만든다
- 큐 · 스택 · 맵 · 집합 · 문자열 비교 · **비트 연산**이 없다. 글 · 낱말은 부르는 쪽이 **번호나 1/0 배열로** 바꿔 건넨다
- `exp` · `log` · `floor` · `sqrt` 의 결과를 `int` 슬롯에 담지 않는다 (java · C# 컴파일 실패). `max` · `min` 은 정수만 주면 안전
- **정수를 정수로 나누어 실수를 얻지 않는다** — `double` 지역 변수에 먼저 담고 나눈다. `//` 는 `double` 에 쓰지 않는다
- **`//` 와 `%` 는 음수가 아닐 때만** — 음수면 파이썬과 java · cpp · C# 이 갈린다
- **`ir-interpreter` 의 `&&` 는 짧은 회로가 아니다** — 색인 범위 확인과 그 읽기를 `&&` 로 잇지 말고 `if` 를 중첩한다
- 식별자는 여섯 언어의 예약어를 피한다 — C# `base out ref params event lock checked fixed object string`,
  Python `pass lambda from global`, Java `final native`, C++ `and or not xor register union default`. `next` · `new` · `delete` · `char` 도
- **32 비트** — 셋은 정수 폭이 유한하다. `(a + b) % m` 은 `(a % m + b % m) % m` 으로 접어 중간값을 키우지 않는다.
  `ir-interpreter` 는 배정도라 넘침을 통과시킨다 — 인터프리터 답이 맞아도 넘침이 없다는 증거가 아니다
- **IR 안의 주석은 영어** — 코드 패널은 어느 언어 화면에서든 그대로 띄운다 (`whole-check` 가 잡는다)

**검수 조건 — facet 자신의 `test/<topic>.test.ts` 로 잠근다** (공통분은 `whole-check` 가 한다):

1. `runIR(<camel>ImperativeIR, '<진입 함수>', args)` 의 답이 **모든 손잡이 조합에서** algorithm 이 화면에 내는 값과 같다
2. 회차별 계기 — 손잡이를 A → B → A 로 돌려 **회차마다** 사양 표와 견준다
3. 사다리가 `segments[].value` 와 같다. 매개변수 배열 길이와 사다리 끝값을 단언해 데이터가 커지면 먼저 깨지게
4. 검사에서 view 의 `.mount` 를 직접 부르지 않는다 — `mountView(view, container, params)` 를 거친다

## 끝내기 전에

```sh
node scripts/whole-check.mjs facets/<domain>/<topic> --static   # 쓰는 도중엔 이것 (1 초)
node scripts/whole-check.mjs facets/<domain>/<topic>            # 마치기 전에 한 번 (20 초 안팎)
```
- 새 디렉터리라 `@ffacet/core` 를 못 찾으면 `pnpm install` 대신 링크: `mkdir -p <dir>/node_modules/@ffacet && ln -s ../../../../../packages/core <dir>/node_modules/@ffacet/core`
  (IR 을 쓰면 `ir-interpreter` 도 같은 꼴). 등록 때 호스트가 `pnpm install` 로 정리한다 (2026-09-25 — 조각 쉰넷 · 완제품 열여섯이 이렇게 했다)

정적 검사 · tsc(src 와 test) · 좁힌 전수 검사 · **완제품 자체 검증**(손잡이가 닿는가 · 덮이는 phase · 계기가 판마다
쌓이는가 · 선언한 계기가 첫 판에 실리는가 · 여섯 transpiler 가 옮기는가) · facet 자신의 test 가 한 번에 돈다.
**오류 0 이 될 때까지 고친다.** 경고는 읽고 판단한다. 자체 검증을 임시 파일로 새로 짜지 않는다.

**화면을 볼 때**는 렌더 스크립트를 새로 짜지 않는다:

```sh
npx tsx scripts/facet-shot.mts facets/<domain>/<topic> --locale ko --input <action>=<값> [--input …]
```

걸음마다 화면을 떠 **글자 요약**을 찍고 모음 PNG 한 장을 만든다 (9 초 안팎). **글자 요약으로 판단이 서면 PNG 를
열지 않는다** — 캡션의 수가 화면의 수와 같은지는 글자로 본다. 그림을 봐야 할 때만 PNG 한 장을 연다.
**캡션에 들어가는 수가 정말 그 이름의 수인지** 손잡이를 바꿔 한 번 확인한다 — 이 함정은 검사가 전부 초록인 채로
여섯 번 났고 매번 화면을 정독한 제삼자가 찾았다.

**하지 않는 것** — `pnpm install` · `pnpm typecheck` · `pnpm -r …` · 전체 `pnpm test` · dev 서버 · 등록 파일
(`catalog.json` · `taxonomy.json` · bootstrap). 여럿이 동시에 도는 중이라 부딪힌다. 임시 파일은 호스트가 준
**자기 topic 디렉터리 안에만** 둔다.

## 보고

짧게, 이 순서로.

1. 만든 것 — 손잡이와 그 운동(무엇이 옮겨 가는가) 한 줄, 걸음 수
2. `whole-check` 결과 — 오류 0 · 경고 몇, 남긴 경고와 그 이유
3. 사양 표와 셈한 값의 대조 (다르면 어디가), IR ↔ algorithm 전 조합 대조, 동률이 실제로 걸린 자리, 중간값 최대치
4. **사양에서 모자랐던 것** — 값에 이르는 규약이 열려 있던 자리, 스스로 정한 것
5. core 나 규칙에서 걸린 것 — 있으면
