# 조각 계약 카드 — piece-builder 가 먼저 읽는 한 장

조각 하나를 만드는 데 필요한 **계약**만 모았다. 규범 판정은 여전히 `rules/` 가 한다 —
이 카드와 규칙 문서가 어긋나면 **규칙 문서가 이긴다.** 줄마다 출처를 달아 두었으니
애매하면 그 문서의 그 절만 연다.

출처 표기는 둘이다. **규칙 ID**(`S-piece` · `C8` …)는 규칙 문서의 조항이다. **`관례`** 는
규칙이 아니라 Scene 이행(`tasks/scene-migration-protocol.md`)에서 굳은 작업 방식이다 —
어겨도 규칙 위반은 아니지만 대개 되짚기 검사에 걸린다.

## 왜 있나

에이전트 하나가 첫 파일을 쓰기까지 **응답 50 번 안팎, 약 11 분**이 걸렸다 (2026-09 실측).
규칙 문서 일곱과 core 파일 열두 개, 테스트 넷을 조각마다 처음부터 읽었기 때문이다.
읽은 파일은 조각이 달라도 같았다. 그 공통분을 여기 한 장으로 줄인다.

**이 카드에는 좌표·배치·골격·예시 stage 코드가 없다.** 넣는 순간 템플릿이 되고, 템플릿은
관성을 낳는다 (`tasks/piece-batch-protocol.md` "왜 있는가"). 무엇을 지키는지만 적고
어떻게 생겨야 하는지는 적지 않는다. 형태는 사양의 **동사**가 정한다 (S-piece 2 절).

## 이것만 더 읽는다

1. `rules/principles.md` — 늘 읽는다 (짧다)
2. `rules/specifics/S-piece.md` 의 **"조각을 만드는 순서"** 절 (1·2 절, 짧다)
3. `rules/specifics/S-view.md` 의 **"색 토큰 결정 트리"** 절 — 색을 고를 때만
4. 막히면 해당 규칙 문서의 해당 절. 다른 조각의 구현 파일은 **열지 않는다**

core 의 타입(`packages/core/src/**`)은 열어도 된다. 다만 아래 "쓰는 API" 로 대개 충분하다.

## 산출물과 이름

사양의 디렉터리가 `facets/<domain>/<name>/` 이고 facet id 가 `facet:<camel>` 일 때:

| 파일 | 내놓는 것 | 규칙 |
| --- | --- | --- |
| `package.json` | `"name": "@ffacet/algorithm-<name>"`, `private: true`, `type: module`, main·types·exports 가 `./src/index.ts`, `scripts.typecheck: "tsc --noEmit"`, `dependencies: { "@ffacet/core": "workspace:*" }` | — |
| `tsconfig.json` | `extends: ../../../tsconfig.base.json`, `compilerOptions: { outDir: dist, noEmit: true }`, `include: [src]` | — |
| `src/algorithm.ts` | `<camel>` (알고리즘 함수) · `<Pascal>FacetData` (자료 타입) | C2 · C8 · S-piece |
| `src/scene.ts` | `<camel>Scene: ScenePlan<…>` · 장면 타입 | S-scene |
| `src/<name>-stage.ts` | `<camel>StageView: CanvasView` | S-view · S-scene · S-piece |
| `src/irs.ts` | `<camel>IRs: IR[] = []` (조각은 코드 패널이 없다. `FacetJson` 에는 `irs` 필드가 없다 — facet.ts 에 적지 않는다) | S-facet |
| `src/facet.ts` | `<camel>Facet: FacetJson` | S-facet · S-piece · C10 |
| `src/index.ts` | 위 전부 re-export + `register<Pascal>()` | S-facet |
| `apps/playground/src/descriptions/<camel>.md` | 데모 설명 글. 자기 토큰 `{facet:<camel>}` 을 반드시 담는다 | S-facet · C4 |

`src/` 에 이 여섯 말고 다른 `.ts` 를 두지 않는다. `projector.ts` 는 두지 않는다.

**이름 규약** (C4 · S-facet. 등록 이름의 충돌·미등록은 register-names 테스트가, view id 는 `piece-check` 가 잰다):

- 알고리즘 등록 이름 `<camel>` = `facet.ts` 의 `algorithm: 'module:<camel>'`
- 장면 등록 이름 `<camel>Scene` = `scene: 'module:<camel>Scene'`
- view id **`<name>-stage`** (디렉터리 이름 + `-stage`). 전역 레지스트리라 짧은 이름은 부딪힌다
- facet 의 stage 블록 `type` 은 view id 와 같다
- **`register` 로 시작하는 이름은 `register<Pascal>` 하나만 내보낸다.** 전수 검사가 모듈의 `register*` export 를 전부 등록 함수로 부른다 — `registerNames` 같은 헬퍼를 내보내면 인자 없이 불려 터진다 (2026-09-18 파이프라인 배치)

## 쓰는 API

전부 `@ffacet/core/runtime` 에서 온다 (`IR` 타입만 `@ffacet/core`).

```ts
// 등록
registerAlgorithm, registerScenePlan, registerIR, registerView, registerFacets
// 선언
type FacetJson, CONTROL_SET
// 알고리즘
type FacetContext, type ReactiveContext, type FacetRuntimeEvent
// 장면
type ScenePlan, type SceneRenderer
// 그림
type CanvasView, type ViewMountParams, type ViewInstance, type Translate, type Palette,
getColors, makeTranslator, fonts, fontSizes, PIECE_CANVAS_W, categorical
```

- `ScenePlan<S>` = `{ initial(initialData: unknown): S; reduce(scene: S, event: FacetRuntimeEvent): S }`
- `SceneRenderer<S>` = `{ render(next: S, prev: S | null, opts: { animate: boolean }): void | Promise<void>; destroy(): void }`
- `CanvasView` = `{ canvas: { height: H }; mount(container, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance }` — **제네릭이 아니다.** 돌려주는 인스턴스가 `render`/`destroy` 를 열어 `SceneRenderer<S>` 로서 일한다 (선언은 `const xStageView: CanvasView = …`)
- `ReactiveContext` 는 `FacetContext` 에 `sleep(ms): Promise<boolean>` 을 더한 것. 알고리즘은 `FacetContext<Data>` 로 받아 `as ReactiveContext<Data>` 로 좁힌다.
- `params`: `canvas`(러너가 만든 SVG) · `t`(문안 조회기) · `theme` · `locale` · `initialData`
- 팔레트 이름: `bg bgSubtle border text textMuted textInverse primary primaryHover accent danger success itemDefault itemComparing itemSwapping itemSorted itemPivot itemActive stateInk`

## index.ts — 등록 순서 (S-facet MUST)

1. `registerAlgorithm<Data>('<camel>', <camel>, { mechanismKind: 'reactive' })`
2. `registerScenePlan('<camel>Scene', <camel>Scene)`
3. `for (const ir of <camel>IRs) registerIR(ir.id, ir)`
4. `registerView('<name>-stage', <camel>StageView)`
5. `registerFacets([<camel>Facet])`

`register<Pascal>()` 를 index.ts 가 스스로 부르지 않는다 — 호출은 호스트 몫이다.

## facet.ts — 선언

**있어야 하는 것**

- JSDoc 에 **`@piece`** 표식과 이 조각이 답하는 **질문 한 문장** (S-piece)
- `id` · `title` · `description` — 사람이 읽는 것은 전부 **열 언어** `en ko ja zh ar es fr hi id pt` (S-piece PREFER, `facet-i18n` 테스트가 막는다)
- `algorithm: 'module:<camel>'`, `scene: 'module:<camel>Scene'` — `projector` 는 없다
- `initialData` — 첫 필드 `type: '<name>'`, 그리고 **`stepMs`** (걸음 뒤 머무는 ms)
- `shuffleOnReset: false`
- `messages` — stage 가 그리는 문안 전부. 키는 짧게 (`'caption.merge'`, `'label.top'`) (C10). 열 언어 (S-piece PREFER, facet-i18n 테스트가 막는다)
  - 모양은 **키가 바깥, 언어가 안쪽** — `{ 'caption.x': { en: '…', ko: '…', … } }`. 거꾸로(`{ en: { 'caption.x': … } }`) 써도 tsc 는 통과하고 검사가 키 전부를 "선언 없음" 으로 잡는다 (2026-09-18)
- `blocks: { stage: { type: '<name>-stage' }, controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub } }`

**없어야 하는 것** — `metrics` · `header` · `layout` · `canvas` · `aspects` · 좌표(S-piece)

**initialData 에 넣는 것은 구조다** — 값·키 목록·간선·무게·출발점. 자리(좌표)는 stage 가
셈한다. 높이·합계·비교 횟수 같은 파생값은 알고리즘이 구조에서 셈한다. 사양이 파생값을
적어 줬다면 **대조용**이다.

**사람이 읽는 이름은 데이터가 아니다** — `initialData` 에는 식별자(`math`)를 두고 표시
이름은 `messages` 의 `label.*` 로 뺀다. 한국어가 열 언어 화면에 박힌다.

## algorithm.ts

- 상단 JSDoc 에 **이벤트 목록 + payload 스키마 + silent 여부** (C2). 주석과 실제 발신을 맞춘다 — JSDoc 은 **첫 `import` 보다 앞에** 둔다 (검사가 그 자리만 본다)
- `ctx.emit` 의 `type` 은 **리터럴** (C2). 삼항식·변수 금지. 걸음표를 사람이 적은 배열로 두르지 않는다 — 데이터 순회의 결과라면 괜찮다 (S-piece)
- `ctx.emit` 은 **늘 `await`** (C8)
- 걸음 사이는 문 하나로 — 취소를 함께 진다 (C8)
  ```ts
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }
  // 부르는 쪽: if (!(await pause())) return;
  ```
- **모든 루프는 바디 첫 문장에서 취소를 본다** — `if (!(await pause())) return;` 이거나 `if (ctx.cancelled) return;`. 문이 첫 문장이면 그것이 진입 검사다 (C8). `piece-check` 는 기다림(`await`)이 있는 루프만 기계로 잰다
- **마운트 직후 첫 걸음 앞에서 `stepMs` 만큼 _빈_ 화면을 두지 않는다** — 첫 emit 을 문 밖에 두거나 첫 문만 그냥 통과시킨다. 결과는 같아야 한다 (S-piece 의 문 조항을 따른 `관례` — 그 조항은 `advance` 조각의 것이다). **걸음 0 이 이미 읽을 것이 있는 화면**(프로그램 전체 · 바탕 구조)이면 첫 발신 앞에 `stepMs` 를 두어 읽을 틈을 준다 — "첫 걸음도 800ms 이상" 과 같은 뜻이다 (2026-09-25 제어 흐름 배치에서 셋이 같은 판단을 했다)
- **자동 재생을 마치면 그냥 돌아온다.** 손짚기 루프(`waitForInput` → `rewind`)를 두지 않는다 — `pieceScrub` 에는 `advance` 가 없어 도달하지 않는 죽은 코드다. 러너가 알고리즘 종료를 보고 띠를 연다 (`관례` — 이행 프로토콜 7 절. S-piece 는 "이행 뒤 일괄로 걷어낸다" 고만 한다)
- 화면 문안을 payload 로 보내지 않는다 — 무엇을 말할지(종류와 인자)만 싣는다 (C10)
- `ctx.metric` 을 부르지 않는다 (S-piece)
- 화면에 뜰 값은 사양이 준 실측값이거나 알고리즘이 셈한 값이다. **지어내지 않는다** (S-piece)
- 바탕에서 결정되는 셈은 payload 에 싣지 말고 장면·그림이 같은 함수를 부르게 한다 — 두 자리에서 세면 언젠가 갈린다
- **소재가 코드라 작은 해석기를 두면, 모르는 모양과 셈할 수 없는 상태는 줄 번호를 담아 던진다** (C6) — 모르는 문 · 식 모양을
  `else` 로 몰지 않는다, `continue` / `return` 으로 조용히 지나치지 않는다, 없는 이름 · 빈 칸 · 크기를 `?? 0` · `''` 로 지어내지 않는다,
  `args[0]!` 단언으로 TypeError 를 내지 않는다. 데이터가 틀리면 걸음이 줄어든 그림이 오류 없이 나오기 때문이다
  (2026-09-25 프로그래밍 기초 배치에서 일곱 조각이 걸렸다 — 메모리 · 객체 조각에 몰렸다)
- 헬퍼 이름을 `t` 로 두지 않는다 — i18n 검사가 알고리즘 · 장면의 `t('…')` 도 문안 키로 읽는다

## scene.ts (S-scene)

- `initial` 은 넘겨받은 자료를 **참조로 쥐지 않는다** — 값을 베낀다. **걸음 0 은 `initial()` 이 `initialData` 에서 채우는 것을 먼저 고른다**
  (코드 줄 · 바탕 구조). 알고리즘이 셈해야 하는 바탕이면 `silent: true` 인 `init` 이 걸음 0 을 갈아 끼운다. 빈 장면 + silent 가 아닌
  `init` 은 **빈 걸음 0 이 하나 더 생긴다** — 되짚기 띠의 첫 칸이 빈 화면이다. 옛 조각에 남아 있는 꼴이라 검사는 막지 않지만 새로 쓰지 않는다
  (2026-09-25 감사가 이 꼴을 조각마다 다르게 판정했다. 이 줄이 판정이다)
- `reduce` 는 **새 객체를 돌려준다.** 앞 장면을 고치면 되짚을 때 과거가 바뀐다
- `reduce` 는 순수하다 — DOM · 타이머 · 무작위 없음
- `event.payload` 를 이름 붙은 타입으로 통째 단언하지 않는다 (`payload as StepPayload` ✗) — `typeof` 가드로 필드를 좁힌다 (C9. `piece-check` 가 잡는다. 2026-09-18 AI 배치에서 넷이 걸렸다)
- 장면에 **좌표 · 문안 · DOM** 을 담지 않는다. 문안 대신 `{ kind: 'pick'; a: number }` 처럼 종류와 인자
- 장면에는 **바탕**(init 이 한 번 정하는 것)과 **자취**(걸음이 쌓는 것)와 **이번 걸음**(`step`)을 가른다 (`관례`)
- 지나간 것에서 출발하는 운동이 필요하면 `step` 에 계기값(`from` · `was` · `before`)을 실어 장면이 말하게 한다 (`관례` — S-scene 의 "prev 는 고르는 데만" 을 지키는 길)

## stage (S-view · S-scene · S-piece)

**계약**

- `CanvasView` 로 선언하고 세로는 파일 상수 `canvas: { height: H }`. 가로는 `PIECE_CANVAS_W` — 어디에도 적지 않는다
- **세로는 마운트 뒤 바뀌지 않는다.** 내용이 커지면 간격을 줄여 담는다 (canvas-height 테스트)
- **그 폭을 채운다** — 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece)
- 비울 때는 `params.canvas.textContent = ''` — **container 를 비우면 캔버스가 떨어져 나간다**
- 색은 `getColors(params.theme)`, 글꼴은 `fonts`/`fontSizes`. hex·rgb 리터럴 0 건. **글자 폭을 셈하려고 쥐는 크기도 토큰에서** — `const CODE_PX = 12` 가 아니라 `parseFloat(fontSizes.sm)`. 따로 쥐면 토큰이 바뀔 때 셈과 글자가 어긋난다 (2026-09-25 배치에서 넷이 이 꼴로 걸렸다. `piece-check` 가 경고한다)
- **수는 문장 밖에 둔다** — `'Open slots: {n}'` 이지 `'{n} open slots'` 가 아니다 (n=1 에서 복수형이 깨진다. 관사 `a {cls}` 도 같은 꼴 — 이름이 모음으로 시작하면 틀린다)
- 문안은 `const t = params.t ?? makeTranslator(params.locale)` 로 만들고 `t('caption.x', 'en 원본', vars)` — **en 원본은 호출부에 리터럴**, facet.ts 의 en 과 글자까지 같게 (en-original 테스트)
- `mount` 가 `initialData` 를 좁힌다. 좁히개는 stage 가 가진다. **`initialData` 가 없어도 던지지 않는다** — `canvas-attach` 전수 검사가 `config: {}` 만 주고 마운트한다. 던지면 잰 수 0 으로 실패한다. 빈 캔버스를 두는 렌더러를 돌려주거나, 값을 장면(`init` 이벤트)에서 읽는다 (2026-09-18, 둘이 따로 걸렸다)

**render**

- 늘 그 장면의 화면 **전체**를 세운다 (`drawStatic(next)`). 앞 화면과의 차이만 고치지 않는다
- `opts.animate` 가 거짓이면 **타이머도 프레임도 걸지 않고** 곧바로 돌아온다 — 되짚기가 이 길로 온다
- 돌려주는 Promise 는 **그 장면이 다 선 뒤에** 풀린다. 운동을 `void` 로 던지지 않는다. 한 뜻의 운동 둘은 한 시계로 흘린다
- 운동이 끝나면 **`drawStatic(next)` 를 한 번 더** — 운동이 남긴 속성·보간 끝자리가 노드째 사라진다 (`관례` — 이행 프로토콜 4 절. 자체 검증 축 1 이 그 차이를 잡는다)
- `prev` 는 **무엇을 흐르게 할지 고르는 데만** 쓴다. 출발값을 `prev` 에서 꺼내지 않는다
- 머무는 강조는 정적 그리기에도 넣는다 — 빠뜨리면 되짚었을 때 사라진다 (S-scene PREFER). 정적 그리기가 `step` 을 읽지 않고 자취에서 파생시키면 이것이 구조가 된다 (`관례`)
- 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 운동은 그 자리에 **아직 못 온 만큼**으로 그린다 — 첫 프레임에 끝 자리가 번쩍이지 않게 (`관례`)

**금지**

- CSS `transition` · 상시 도는 rAF 루프 — 되짚기가 `animate:false` 로 와도 저 혼자 흐른다 (이행 프로토콜 4 절의 MUST NOT. S-scene 의 "animate 가 거짓이면 타이머도 프레임도 걸지 않는다" 에서 나온다)
- `isInstant` · `onScrubStart` 를 빗장으로 믿기 — 장면 조각에서 러너가 부르지 않는다
- 운동을 `opacity` 전환으로만 — 동사가 이동·변형이면 실제로 움직인다 (S-piece MUST NOT)
- 개념을 설명하는 상시 캡션 — 캡션은 지금 일어나는 일만 말한다 (S-piece)
- 전제 · 출처 각주 — "예로 정한 값" · "낱말 하나를 토큰 하나로 친다" · 논문 인용 같은 줄을 화면에 늘 두지 않는다. 전제는 설명 글이 밝힌다 (S-piece MUST. 2026-09-18 AI 배치에서 사양이 "밝혀라" 고 하자 넷이 각주로 올렸다)

**거두기** — `destroy()` 는 기다리던 Promise 를 **푼다** (S-piece MUST)

- 걸어 둔 것은 집합에 담는다: `timers: Set<…>` 과 `waiters: Set<() => void>`
- `destroy()` 에서 `destroyed = true` → `gen += 1` → 타이머 일괄 취소 → `waiters` 를 전부 깨움 → 캔버스 안쪽 비움
- **세대 빗장** (S-scene): `render` 첫머리 `const mine = (gen += 1)`, 걸음 함수는 `await` 뒤마다 `mine === gen && !destroyed` 가 아니면 화면에 손대지 않고 물러난다. **필요한 때** — 바탕이 바뀔 때만 짓고 속성만 덮어쓰는 요소를 `await` 뒤에 만질 때. 정적 그리기가 매번 새로 만드는 요소만 만지면 없어도 된다. 다만 클로저 변수(`cells` 같은 손잡이)는 새로 지어지지 않으니 걸음 함수가 `await` 를 하나라도 지나면 두는 편이 안전하다 (`관례`)

## 문안 (C10 · S-piece)

- 열 언어. `en` 이 원본이고 나머지는 번역 — 에이전트가 쓴다
- **수 뒤에 조사를 붙이지 않는다** — `'{n} 이 남았다'` 가 아니라 `'남은 것은 {n}.'`
- 값 삽입은 `{name}` + vars. 이어붙이기·템플릿 보간 금지
- 조각의 결론을 캡션 글자에 상수로 박지 않는다 — 셈한 값을 넣는다

## 걸음 벽시계 (S-piece)

걸음 하나 = 그 걸음의 운동 + `stepMs`. **가장 얇은 걸음이 800ms 아래면 읽을 틈이 없다.**
그 아래로 가야 하면 `stepMs` 가 아니라 걸음 수를 다시 본다.

## 자주 걸린 함정 (scene-migration-protocol 4 절에서 추림)

- `-0` 과 부동소수 끝자리가 문자열을 가른다 — 좌표·글자를 만들 때 반올림하고 `-0` 을 0 으로
- `Math.sin(π)` 는 0 이 아니다
- `Map` 의 삽입 순서도 상태다 — 장면에 담으면 순서까지 같게
- 운동 끝에 값을 되돌릴 때 `setAttribute(…, '1')` 이 아니라 `removeAttribute(…)` — 속성의 유무가 화면을 가른다
- 자식을 비워도 레이어 자신의 `opacity` 는 남는다
- `step` 이 객체면 `step === prev?.step` 은 늘 거짓이다
- 자기 글자를 도로 읽어 덧붙이지 않는다 (`textContent += …`) — 장면에서 다시 만든다
- DOM 을 상태의 거울로 되읽지 않는다 (`dataset.*` · 지금 좌표 읽기) — 장면이 정본이다
- 견줄 짝을 지우면서 견줌의 결론을 말하지 않는다 — "A 와 B 를 견주면" 조각은 완주 화면에 둘이 다 남아야 한다
- 그림이 주장을 **그리지 않고 되풀이**하는지 묻는다 — 캡션이 할 말을 그림이 글자로 한 번 더 쓰고 있지 않은가
- 길이 0 짜리 선에 둥근 끝을 달면 점이 된다
- `categorical(n)` 의 `n` 을 "지금까지 드러난 수" 로 정하지 않는다 — 걸음마다 색이 바뀐다

## 끝내기 전에

```sh
node scripts/piece-check.mjs facets/<domain>/<name> --static   # 쓰는 도중엔 이것 (1 초)
node scripts/piece-check.mjs facets/<domain>/<name>            # 마치기 전에 (17 초 안팎)
```

정적 검사 · tsc · 좁힌 전수 검사 · **장면 자체 검증**(바탕 · 순수 · 흘림과 곧바로의 일치 ·
지연 발화 · 뛰어다니기 · 흘리는 도중 destroy)을 한 번에 돈다. **오류 0 이 될 때까지 고친다.**
경고는 읽고 판단한다. 전체 검사는 조각 하나에 평균 다섯 번 돌았다(2026-09-18) — 정적 오류는
`--static` 으로 먼저 걷어 내고 전체는 마칠 때 돌린다.

**화면을 볼 때**는 렌더 스크립트를 새로 짜지 않는다:

```sh
npx tsx scripts/facet-shot.mts facets/<domain>/<name> --locale ko
```

되짚기와 같은 길(`animate:false`)로 걸음마다 화면을 떠 **글자 요약**을 찍고 모음 PNG 한 장을
만든다 (2 초 안팎). **글자 요약으로 판단이 서면 PNG 를 열지 않는다** — 캡션의 수는 글자로 본다.
형태(동사가 그림이 되었는가)를 봐야 할 때만 PNG 한 장을 연다. `--theme dark` 로 다크도 본다.

자체 검증을 **임시 파일로 새로 짜지 않는다** — 위 명령에 들어 있다. 조각 고유의 주장(완주
화면에 무엇이 남아야 하는가)을 재고 싶으면 스크래치패드에 `<name>-claim.test.ts` 로 두고
확인 뒤 지운다. 레포 루트에 남기지 않는다.

**하지 않는 것** — `pnpm install` · 등록 파일(`catalog.json` · `taxonomy.json` · bootstrap) ·
전체 `pnpm test` · dev 서버. 여럿이 동시에 도는 중이라 부딪힌다. 호스트가 배치를 닫을 때 한다.

## 보고

짧게, 이 순서로.

1. 만든 것 — 걸음 수, 걸음 벽시계(가장 얇은 걸음), 동사가 화면에서 무엇이 되었는지 한 줄
2. `piece-check` 결과 — 오류 0 · 경고 몇, 남긴 경고와 그 이유
3. **사양에서 모자랐던 것** — 값에 이르는 규약이 열려 있던 자리, 스스로 메운 것
4. core 나 규칙에서 걸린 것 — 있으면
