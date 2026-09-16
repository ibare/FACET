# Scene 이행 프로토콜 — 조각 181 을 장면 방식으로 옮긴다

이 문서 하나로 이어서 일할 수 있게 적는다. 앞선 대화를 몰라도 여기부터 읽으면 된다.

---

## 1. 왜 하는가

조각의 화면은 지금 **명령으로** 만들어진다. projector 가 이벤트를 받아 stage 의
메서드를 부른다 — `revealInputs()` · `markInputDiff()` · `insertNode()`. 상태가 DOM
안에만 있고 명령에는 역이 없다. `revealInputs()` 의 반대는 정의되지 않는다.

그래서 **임의의 걸음으로 갈 수가 없다.** 재생 위치를 끌어 보는 스크럽을 붙이려다
이 벽에 막혔고, 조각 181 을 전수로 재어 확인했다.

| | |
| --- | ---: |
| 되짚은 화면이 맞는 조각 | 168 / 181 |
| 되짚은 뒤 조용한 조각 | **15 / 181** |
| 둘 다 되는 조각 | **14 / 181** |

명령 방식을 그대로 두고 바깥에서 고치려는 시도를 여러 갈래로 해 봤고 (즉시 모드,
세대 번호, 거두기 콜백, 지연 해제) 전부 부족했다. 조각마다 다른 사정을 타기
때문이다. 그 기록은 `tasks/scrub-timeline-experiment.md` 에 있다.

### 뒤집으면 풀린다

```
걸음 i   →  Scene(i)      순수 데이터. DOM 을 모른다.
Scene(i) →  화면          render 가 그린다.
```

`Scene(i)` 는 이벤트로부터 순수하게 셈해지므로 어느 걸음의 화면이든 계산으로 얻는다.
되짚기가 앞으로 가기와 같은 연산이 되고, **방향이라는 개념이 사라진다.**

성격이 다른 조각 셋으로 검증했다.

| 조각 | 성격 | 옮기기 전 | 옮긴 뒤 |
| --- | --- | --- | --- |
| `hash-avalanche` | 고정 격자 · CSS 전환 · 5 걸음 | 통과 | 통과 |
| `split-and-number` | rAF 궤적 · 좌표 이동 · 11 걸음 | 흔들림 | **통과** |
| `bst-degenerate` | 동적 마디 · 36 걸음 | 두 축 다 실패 | **통과** |

### 스크럽만 얻는 게 아니다

- **걸음 계약이 저절로 선다.** `render` 가 상태를 세우고 끝나므로 "끝났다고 해 놓고
  더 그리는" 일이 구조적으로 없다.
- **되돌림이 필요 없다.** 지울 것을 지우는 대신 목표 상태를 통째로 그린다.
- **projector 가 사라진다.** 조각당 128~159 줄. 4-layer 가 3-layer 가 된다.
- **검사가 싸진다.** Scene 은 순수 데이터라 화면을 띄우지 않고 견줄 수 있다. 지금은
  181 개를 12 분 돌려야 아는 것들이다.

---

## 2. 무엇을 만드나 — 규약

정본은 `packages/core/src/runtime/scene.ts` 의 주석이다. 여기서는 옮길 때 필요한
만큼만 적는다. 규범 판정은 `rules/specifics/S-scene.md`.

### 조각이 내놓는 둘

```ts
// facets/<domain>/<name>/src/scene.ts
export type FooScene = { /* 이 조각만의 장면 모양 */ };

export const fooScene: ScenePlan<FooScene> = {
  initial(initialData: unknown): FooScene { … },
  reduce(scene: FooScene, event: FacetRuntimeEvent): FooScene { … },
};
```

```ts
// facets/<domain>/<name>/src/<name>-stage.ts  — 반환 객체
return {
  destroy() { … },
  async render(next: FooScene, prev: FooScene | null, opts: { animate: boolean }) { … },
};
```

### 선언과 등록

```ts
// facet.ts — projector 를 지우고 scene 을 둔다. 둘 다 있으면 러너가 세우지 않는다.
scene: 'module:fooScene',

// index.ts
registerScenePlan('fooScene', fooScene);
```

### 러너가 하는 일

걸음마다 `reduce` 로 장면을 이어 붙여 `SceneTrack` 에 쌓고, `render(next, prev,
{animate:true})` 를 부른다. 스크럽이 걸음을 건너뛸 때는 쌓아 둔 장면을 꺼내
`{animate:false}` 로 부른다. 조각은 그 차이를 모른다.

---

## 3. 어떻게 옮기나 — 절차

`hash-avalanche` (가장 단순) 와 `bst-degenerate` (가장 대비가 큼) 를 본으로 삼는다.

```sh
git show <이 커밋>:facets/cs-fundamentals/bst-degenerate/src/scene.ts
git diff main -- facets/cs-fundamentals/bst-degenerate/src/
```

### 3-1. 이벤트와 화면을 나란히 놓고, 숨은 상태를 찾는다

```sh
d=facets/<domain>/<name>
grep -oE "type: '[a-z-]+'" $d/src/algorithm.ts | sort -u   # 걸음의 어휘
sed -n '/^    return {$/,/^    };$/p' $d/src/*-stage.ts     # stage 가 내놓는 메서드
cat $d/src/projector.ts                                     # 그 사이의 번역
```

**이 절이 이 문서에서 가장 중요하다.** 옮기는 일의 어려움은 그리기를 다시 짜는 데
있지 않고 **화면이 어디에 상태를 숨겨 두었는지 찾는 데** 있다. 숨은 상태는 되짚기가
어긋나던 자리이고, 장면으로 끌어올리는 순간 그 문제가 사라진다.

열아홉을 옮기며 **네 자리**에서 나왔다. **한 자리만 보면 놓친다.**

```sh
grep -nE "^    let |^  let " $d/src/projector.ts $d/src/*-stage.ts        # ① ②
grep -nE "\.has\(|\.get\(|includes\(" $d/src/projector.ts             # ③
grep -nE "getAttribute|getBBox|getBoundingClientRect|Number\(" $d/src/*-stage.ts   # ④
```

- **① projector 의 `let`** — `bst-degenerate` 의 `growingShown` · `results`. 논증
  단계와 셈을 쥐고 있어 되감아도 지난 캡션이 남았다.
- **② stage 의 `let`** — `tokens-per-language` 의 `activeCode`, `merge-the-frequent-pair`
  의 `learned`. "앞 줄을 찾아 강조를 지우는" 명령형 코드가 딸려 있다. 장면이 그것을
  말하게 하면 그 코드가 통째로 사라진다.
- **③ 조회로 갈리는 암묵 분기** — `unknown-becomes-known` 의 `if (!locked.has(word))`.
  `let` 이 아니라 `Set`/`Map` 조회라 눈에 안 띈다. 그 분기가 곧 상태다.
- **④ 화면을 도로 읽어 갈리는 분기** — `out-of-bounds` 의 `probeLabelWidth()` 가 커서
  딱지의 `width` **속성을 되읽어** 멎을 자리를 셈했고, `through-middle-node` 는 거리표를
  배지의 문자열로 얹어 두고 `Number(chord.label)` 로 도로 꺼내 썼다. `let` 도 `Set.has`
  도 아니라 ①~③ 의 grep 에 걸리지 않는다. 되감아 세운 직후에는 그 값이 아직 옛
  화면의 것이라 셈이 틀어진다.

- **⑤ 구조체와 타입 선언에 얹힌 상태 — grep 으로 쫓지 말고 `stage` 의 타입 선언을
  처음부터 끝까지 읽는다.**

  이 자리를 grep 패턴으로 잡으려 세 배치를 시도했고 **세 번 다 빗나갔다.** 나온 것들은
  이렇게 생겼다.

  | 모양 | 무엇이었나 | 왜 grep 이 놓치나 |
  | --- | --- | --- |
  | `Piece = { g, body, station }` | 각 값이 선 정거장 | 이름을 패턴에 적어 두어야 잡힌다 |
  | `Chip.used` | 문이 쓰인 적 있나 (**그 조각의 결론**) | 위와 같다 |
  | `Branch = { parent, side, line, badge }` | 어느 쪽이 빈 자리인가 | 생성 때 한 번 묶고 **읽기만** 해 대입이 없다 |
  | `Chip.tile: SVGGElement \| null` | 부호 비트를 아직 안 떨궜나 | **부품 이름**이라 어떤 낱말 목록에도 안 든다 |
  | `Map<string, { path, head }>` | 어디까지 밀려났나 | `new Map<…>` 한 줄이라 `type` 선언조차 없다 |
  | `const tags: Tag[]` | **어느 키가 어느 칸에 앉았나** | `const` 라 `let` grep 을 통과한다 |
  | `type NodeState = 'default' \| 'comparing' \| …` | 마디의 형편 | **선언만 있고 값이 어디에도 저장되지 않는다.** 칠에만 쓰인다 |

  마지막 둘이 요점이다. 찾는 것은 특정 낱말이 아니라 **"이 조각이 화면에 대해 아는
  것을 어디에 적어 두었나"** 이고, 그 자리가 `let` 이 아닐 때가 많다. 아래 한 줄로
  타입 선언과 모듈 스코프 선언을 전부 뽑아 **눈으로 읽는 것**이 유일하게 통한 방법이다.

  ```sh
  grep -nE "^(type|interface)|^  (const|let) |new (Map|Set)<" $d/src/*-stage.ts
  ```

  그중 **DOM 손잡이와 뜻·수치가 한 객체에 묶인 것**, 그리고 **선언되었는데 저장되는
  곳이 없는 타입**을 의심한다.

**변수가 하나도 없는 조각이 가장 위험하다.** `traverse-from-head` 는 `let` 이 전부 DOM
핸들이었고 지나온 자취는 `rect` 의 `stroke` 칠에, 옮김 횟수는 `textContent` 에,
커서 자리는 `transform` 에 있었다. `node-points-next` 도 "지금까지 무엇이 그려졌나" 를
말하는 자리가 코드 어디에도 없었다. ①~③ 이 0 건이라고 "숨은 상태가 없다" 고 읽으면
안 된다 — **화면이 통째로 상태라는 뜻이다.**

찾은 것을 장면 필드로 올리면 대개 그 자리의 명령형 코드가 함께 없어진다. **줄어드는
쪽이 그 조각의 숨은 상태였다는 신호다.**

### 3-2. 장면을 설계한다

물음은 하나다 — **이 걸음의 화면을 다시 그리려면 무엇을 알아야 하는가.**

지침 넷.

- **머무는 것과 지나가는 것을 가른다.** 반짝였다 돌아오는 강조는 장면에 담되
  `render` 가 `animate` 일 때만 반짝인다. 남는 강조(찾은 자리 등)는 정적으로도 그린다.
- **화면이 한 번에 하나만 보이면 목록이 필요 없다.** `split-and-number` 는
  `clearTransient()` 가 앞 줄을 지우므로 "지금 줄 하나 + 앉은 줄들" 로 충분했다.
- **좌표를 담지 않는다.** 값과 깊이가 좌표를 정하므로 `render` 가 셈한다 (S-piece).
- **문안을 담지 않는다.** 무엇을 말할지와 그 인자만 담고 문자는 `render` 가 만든다.
  같은 장면을 다른 locale 로 그릴 수 있어야 하고 저작자 오버라이드는 `params.t` 로만
  온다 (C10).

  ```ts
  caption: { kind: 'pick'; a: number; b: number } | null
  ```

### 3-3. reduce 를 쓴다

projector 의 `switch` 가 거의 그대로 옮겨 온다. 다른 점은 stage 를 부르지 않고 다음
장면을 돌려준다는 것뿐이다.

```ts
case 'tree-insert':
  return { ...scene, nodes: [...scene.nodes, { … }] };
```

**앞 장면을 제자리에서 고치지 않는다.** 되짚기는 지나온 장면들을 그대로 다시 쓰므로,
고치면 과거가 함께 바뀐다.

### 3-4. render 를 쓴다

뼈대는 늘 같다.

```ts
async function render(next: FooScene, prev: FooScene | null, opts: { animate: boolean }) {
  rewind();                       // 늘 비우고 시작한다. 되돌릴 명령이 필요 없다.
  drawStatic(next);               // 그 장면이 말하는 것을 전부 세운다
  drawCaption(next.caption);
  if (!opts.animate) return;      // 되짚기는 여기서 끝
  await animateWhatChanged(next, prev);   // 방금 달라진 것만 흐르게
}
```

기존 걸음 함수는 버리지 않는다. `animate` 인자를 받게 고쳐 두 쓰임을 겸하게 한다.

```ts
function splitRow(p: SplitPayload, withAnim: boolean): Promise<void> {
  …
  const draw = (t: number): void => { … };
  if (!withAnim) { draw(1); return Promise.resolve(); }   // 곧바로 끝 자리에
  return animate(420, draw);
}
```

"방금 달라진 것" 은 `prev` 와 견주어 안다.

```ts
const grewOne = opts.animate && prev !== null && next.nodes.length === prev.nodes.length + 1;
const justAssigned = opts.animate && prev?.active?.assigned == null;
```

**한 걸음에 흐르게 할 것이 여럿일 수 있다.** 러너가 이벤트를 하나씩 주므로 처음 아홉
조각은 모두 하나였고, 그래서 이 문서는 한동안 그것을 전제로 적혀 있었다.
`queue-vs-stack-order` 에서 깨졌다 — 걸음 하나에 두 그릇이 함께 움직이고 통에 남은
것들이 따라 미끄러진다. 그것이 우연이 아니라 **그 조각의 주장 자체**다. 두 그릇을
나란히(lockstep) 돌려야 갈리는 순간이 한 화면에서 보인다.

그럴 때 **시계를 둘로 나누지 않는다.**

```ts
// 나쁨 — 시계가 둘이라 lockstep 이 우연히 맞는 꼴이 되고, 하나를 void 로 흘릴 여지가 생긴다
await Promise.all([slideQueue(next, my), slideStack(next, my)]);

// 좋음 — 옮길 것을 한 목록에 모아 한 시계로 흘린다
const { moves, duration } = movesFor(next, step);
await animate(duration, my, (t) => {
  for (const m of moves) place(m.chip, pointAt(m, t));
});
```

`Promise.all` 은 **서로 다른 뜻의 운동**을 나란히 돌릴 때 쓴다. 두 운동이 한 뜻으로
묶여 있으면 한 시계가 옳고, 그러면 `render` 의 Promise 가 둘 다 선 뒤에 구조적으로
풀린다 — `void` 로 던질 Promise 자체가 생기지 않는다.

**운동의 방향이 뒤집힌다.** 정적 그리기가 정본이 되므로 요소는 이미 끝 자리에 서 있고,
애니메이션은 **아직 못 온 만큼을 뒤로 물리는** 꼴이 된다 — `translate(dx*e)` 가 아니라
`translate(dx*(e-1))`. 생성 시점에 그 물림을 미리 박아 두지 않으면 첫 프레임에 끝
자리가 번쩍인다 (`space-is-part-of-it`).

**지연 발화를 무엇으로 막나 — `isInstant` 가 아니라 세대 빗장이다.**

> **러너는 장면 조각에서 `isInstant` 와 `onScrubStart` 를 부르지 않는다.**

`timeline.ts` 의 `rewindTo` 는 `renderStep` 이 있으면 장면을 꺼내 그리고 **`onInstant`
앞에서 돌아간다**. 그러니 장면 조각에서 `instantMode` 는 늘 거짓이고 `scrubCleaners`
도 돌지 않는다. 달아 두는 것이 해롭지는 않고 (projector 조각과 코드를 나눠 쓰는 자리도
있다) 앞 배치들이 그렇게 했지만, **그것을 빗장으로 믿으면 안 된다.** 세 조각이 그것을
"지연 발화를 막는 유일한 장치" 라고 주석에 적어 두었는데 사실이 아니었다.

실효 있는 것은 둘뿐이다.

- **`opts.animate` 검사** — 되짚기는 이 길로 온다. 거짓이면 타이머도 프레임도 걸지
  않고 곧바로 돌아온다. 이것만으로 충분한 조각이 많다.
- **세대 빗장** — `render` 첫머리에서 `gen += 1` 하고, 걸음 함수가 `await` 뒤마다 자기
  세대가 아직 유효한지 보아 아니면 **화면에 손대지 않고 물러난다.** `destroy` 도 `gen`
  을 올린다.

  ```ts
  let gen = 0;
  const alive = (mine: number): boolean => mine === gen && !destroyed;

  async function render(next, _prev, opts) {
    const mine = (gen += 1);
    drawStatic(next);
    if (!opts.animate) return;          // 되짚기는 여기서 끝
    await flow(next, mine);
  }
  ```

**세대 빗장이 언제 필요한가.** `node-points-next` 가 그 갈림을 정확히 짚었다.

> 걸음이 만지는 요소를 **정적 그리기가 매번 새로 만들면** 필요 없고, **바탕이 바뀔
> 때만 짓고 속성만 덮어쓰면** 필요하다.

매번 새로 만드는 요소라면 살아남은 옛 운동이 쥔 것은 이미 떨어져 나간 노드라 무해하다.
반대로 배치 밑감처럼 계속 쓰는 요소를 프레임마다 고치는 걸음은 stale 프레임이 **살아
있는 화면**에 쓴다. 고정 자리에 둔 캡션·집계처럼 재건 밖에 있는 요소도 마찬가지다.

**다만 "매번 새로 만든다" 를 너무 믿지 않는다.** 새로 지어지는 것은 **노드**이지 그
노드를 가리키는 **클로저 변수**가 아니다. `cells` · `markers` 처럼 정적 그리기가
재할당하는 손잡이를 걸음 함수가 `await` 뒤에 읽으면, 옛 세대의 이음매가 새 손잡이를
타고 살아 있는 화면에 쓴다 (`circular-buffer-wrap`). 걸음 함수가 `await` 를 하나라도
지나면 빗장을 두는 편이 안전하다.

운동이 `wait` 나 rAF 로 여러 마디를 이어 달리는 조각은 대개 필요하다 — 되짚기가 가운데
끼어들면 남은 마디들이 깨어나 이미 새로 선 화면을 덮는다. 걷어내는 뒷마디가 특히
위험하다 (`through-middle-node` 의 `fadeProbe` 는 앞 세대의 뒷마디가 `textContent = ''`
를 돌려 **새 세대가 막 세운 점을 지웠다**).

**지나간 것에서 출발하는 운동은 표식으로 되짚는다.** "합쳐지며 미끄러지는" 운동처럼
출발 그림 전체가 있어야 그릴 수 있는 경우가 있다. `prev` 를 그대로 쓰면 "`prev` 는
고르는 데만" 을 어기므로, **무엇이 이번에 달라졌는지 가리키는 표식**과 그 계기값을
장면에 담아 출발 그림을 셈으로 복원한다 (`merge-the-frequent-pair` 의 `merged.at`).

### 3-5. 선언을 바꾸고 projector 를 지운다

```sh
# facet.ts   projector: 'module:fooProjector'  →  scene: 'module:fooScene'
# index.ts   registerProjector(...)            →  registerScenePlan(...)
#            export/import 도 함께
rm $d/src/projector.ts
npx tsc --noEmit -p $d/tsconfig.json
```

`t` 가 없다는 오류가 나면 stage 가 문안을 만들게 됐다는 뜻이다. mount 첫머리에 둔다.

```ts
const t = params.t ?? makeTranslator(params.locale);
```

---

## 4. 함정 — 실제로 걸린 것들

- **초기 자료를 참조로 담지 않는다.** 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
  한 객체이고 algorithm 이 제자리에서 고친다 (`values[i] = …`). `initial()` 에서
  참조를 쥐면 되짚을 때 **이미 다 굴러간 자료**로 바탕을 그린다. 셋 다 `initial()` 이
  빈 장면을 돌려주고 `init` 이벤트가 채우는 식이라 피했다.
- **되짚을 때는 `animate: false` 다.** 장면을 쥐고 있으므로 지나온 걸음을 되밟을 까닭이
  없다. 되밟으면 그 애니메이션이 되짚기보다 오래 남아 화면이 흔들린다.
- **`prev` 가 이어지지 않을 수 있다.** 걸음 7 에서 3 으로 뛰면 `prev` 는 7 의 장면이다.
  "방금 하나 늘었나" 로 애니메이션을 가리면 그런 경우 저절로 걸러진다.
- **머무는 강조를 빠뜨리지 않는다.** `bst-degenerate` 의 `match` 는 반짝이고 **남는다**.
  정적 그리기에도 넣어야 되짚었을 때 남는다.
- **운동이 남긴 속성 하나가 화면을 가른다.** 흐르며 선 화면과 곧바로 세운 화면이
  `opacity="1"` 같은 **속성의 유무**만큼 달라 되짚기 판정에서 어긋난다. 눈에는 안
  보이지만 DOM 을 견주는 감사는 잡는다. 운동 끝에서 값을 되돌릴 때 `setAttribute(…, '1')`
  이 아니라 `removeAttribute(…)` 로 거둔다. **여섯 중 셋이 독립적으로 여기 걸렸다** —
  `enter()` · 크로스페이드 같은 관용구에 딸려 있다.

  계측기(`scrub-replay`)는 이런 차이를 "화면에 뜻이 없다" 며 걷어내지만, **이행하는
  쪽에서는 걷어내면 안 된다.** 계측의 관용을 이행의 기준으로 삼지 않는다.

- **속성을 하나씩 거두는 대신 운동이 끝나면 장면을 통째로 다시 세운다.** 위 함정의
  정식 해법이다. 서로를 모르는 에이전트 셋이 독립적으로 같은 곳에 이르렀다
  (`grow-and-copy` 의 `settle(next)` · `traverse-from-head` 의 `drawScene(next)` ·
  `node-points-next`).

  ```ts
  await animateWhatChanged(next, mine);
  drawStatic(next);        // 흐르며 남은 전환·opacity·임시 노드가 통째로 사라진다
  ```

  되돌릴 목록을 손으로 관리하면 반드시 하나를 빠뜨리는데, 이 길은 그 목록 자체를
  없앤다. 보간의 끝자리(`translate(44 116.00)` 대 `translate(44 116)`)도 함께 지워진다.
  정적 경로가 두 번 그려도 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다 (아래
  "정적 경로가 두 번 그려도" 를 보라). 다만 **세대 빗장을 대신하지는 못한다** — 정적
  그리기가 다시 만들지 않는 요소는 여전히 stale 프레임에 노출된다.

  `probeLayer` 처럼 **자식을 비워도 자신의 `opacity` 는 남는** 레이어를 조심한다.
  레이어를 비우는 것과 레이어를 되돌리는 것은 다른 일이다.

  **재건 밖 요소에는 이 관용구가 자동으로 적용되지 않는다.** 정적 그리기가 매번 다시
  짓지 않고 계속 쓰는 요소 — 고정 자리의 캡션·집계, `display:none` 으로 숨기기만 하는
  띠 — 는 정적 경로가 그 속성을 **매번 명시로 쓰는지** 직접 확인해야 한다.
  `push-pop-top` 의 막음 띠는 숨겨도 `y1` 이 앞 걸음 값으로 남아 되짚기 판정에서
  어긋났다. 눈에는 안 보이는 차이다.

- **애니메이션의 출발값을 `prev` 에서 꺼내면 위반이다.** S-scene 은 `prev` 를 "무엇을
  흐르게 할지 **고르는 데만**" 쓰라고 못박는다. `settleBracket(prev.usedLength, …)` 이
  실제로 감사에 걸렸다. 출발 그림이 필요하면 `step` 에 계기값을 실어 장면이 말하게
  한다 — `step.from` · `mark.gone` · `step.before` · `mark.was` 가 모두 그 관용구다.
  그렇게 하면 `render` 가 `prev` 를 아예 안 쓰게 되는 조각도 많다 (`_prev`).

- **`step` 이 객체면 `step === prev?.step` 은 언제나 거짓이다.** "걸음을 건너뛰어
  왔으면 여기서 걸러진다" 는 주석을 달고 아무것도 거르지 못하는 조건이 세 조각에
  있었다. 건너뛰기는 `opts.animate` 가 거짓으로 오므로 그것으로 거르거나, 갈래마다
  `prev` 를 견주어 (그 칸에 그 값이 있었나) 판정한다.

- **운동 둘을 나란히 돌릴 때 하나를 `void` 로 던지지 않는다.** `render` 가 돌려주는
  Promise 는 그 장면이 다 선 뒤에 풀려야 한다 — 그것이 바깥이 걸음의 끝을 아는 유일한
  통로다. `await Promise.all([...])` 로 묶는다.

- **`-0` 과 부동소수 끝자리가 문자열을 가른다.** `translate(0px, ${-R * (1 - e)}px)` 는
  `e === 1` 에서 `-0` 이 되고, `RETIRED_OPACITY` 를 보간했다 되돌리면 `'0.55'` 가
  `'0.5500000000000001'` 이 된다. 끝에서는 보간값 대신 목표값·상수를 그대로 쓴다.

- **되돌림이 있으면 정보가 지워지고, 없으면 정보가 쌓인다 — 둘 다 판단할 자리다.**
  명령형 stage 에서 **물들였다 되돌리는 쌍**(`paintCellFilled(blocked)` · `clearActive()`)
  이 보이면, 되돌리는 쪽이 지우는 것이 **정보였는지** 먼저 묻는다.
  `open-addressing-probe` 는 짚어 본 칸을 잠깐 물들였다 되돌려, 되짚으면 "몇 칸을
  짚어 보았나" 라는 주장이 사라졌다. 반대 짝이 아래 항목이다.

- **명령형 코드가 남긴 "누적" 이 사실은 정보였을 수 있다.** 되돌리는 명령이 없어
  칠이 쌓이던 자리를 버그로 읽고 장면에서 깔끔히 지우면 **화면이 말하던 것이 줄어든다.**
  `sift-down` 의 `swap` 은 두 마디만 기본색으로 되돌려 진 자식이 계속 물들어 있었는데,
  그것이 "이 둘을 견주어 이쪽으로 내려갔다" 를 남기고 있었다. 장면으로 옮기면 그 누적이
  저절로 사라지므로, **정말 남아야 할 것은 일부러 장면에 올려야 한다.**

  갈라 두면 부딪히지 않는다 — 채움은 *값의 형편*(내려가는 중 / 멈춤 / 차 있다),
  테두리는 *견줌의 표식*(견주었다 / 짚어 보았다). 값이 자리를 옮기는 조각에서 고른
  쪽을 채움으로 칠하면 맞바꾼 뒤 그 자리에 진 값이 앉아 읽기가 뒤집힌다. 서로 모르는
  두 조각(`sift-down` · `open-addressing-probe`)이 각자 이 갈래에 이르렀다.

- **나무 조각은 "가지" 가 은신처다.** `sift-up` 은 삽입 가지를 상수로 박아 두고 걸음
  함수 안에서 그렸다 — 되감으면 바탕 그리기가 원래 가지만 다시 그려 **그 가지가 조용히
  사라졌다.** 실제 결함이었고 눈으로만 잡히는 종류다. 가지를 칸의 빈 자리 여부에서
  파생시키면 그 상태 자체가 없어진다.

- **`init()` 이 사라지면 캔버스 세로도 장면이 정한다.** mount 때 한 번 재던 `viewBox`·
  기준선을 정적 그리기가 매번 다시 정하게 옮기지 않으면 첫 그림이 기본 높이로 눌린다
  (`parent-two-children`).

- **조각의 주장이 애초에 화면에 안 남아 있는 수가 있다.** `share-prefix-path` 는 "어느
  길이 이미 있어서 나눠 쓰였나" 를 380ms 동안만 물들였다 되돌렸다. 다 끝난 화면에는
  새로 난 길과 나눠 쓴 길의 구별이 없다 — **되짚기 이전에 이미 주장이 안 보였다.**
  옮길 때 "이 조각이 말하려는 것이 마지막 화면에 남아 있나" 를 따로 묻는다. 없으면
  장면에 올려 정적 그리기가 세우게 한다. 이행이 화면을 고치는 자리다.

- **색판의 크기를 "지금까지 드러난 수" 로 정하지 않는다.** `categorical(n)` 은 `n` 이
  바뀌면 hue 간격이 통째로 갈린다. `find-root` 는 걸음마다 자라는 셈을 씨앗으로 써서
  **무리가 하나 더 드러날 때 이미 칠한 무리의 색이 바뀌었다.** 바탕 자료에서 한 번에
  센다.

- **payload 가 친절하면 오히려 위험하다.** 걸음이 실어 오는 수가 장면에서 셀 수 있는
  것이면 그대로 받지 않는다. 타입도 통과하고 화면도 맞아 보이지만 그 수와 화면의
  구조가 다른 출처가 되어 언젠가 갈린다. 자료 구조 마흔둘에서 **화면에 나란히 뜨는
  수는 거의 언제나 구조에서 나왔다.**

  **이 일은 두 단계다. 한 단계에서 멈추기 쉽다.**

  1. 장면이 그 수를 안 읽게 한다 — 화면이 갈릴 자리가 없어진다.
  2. **algorithm 의 발신에서도 걷어낸다** — 다음 사람이 집어 쓸 문이 닫힌다.

  ①만 하고 "걷어냈다" 고 적기 쉽다. 실제로 한 배치에서 아홉 중 여섯이 그랬고
  감사가 `git diff --stat -- .../algorithm.ts` 로 잡았다. **보고를 믿지 말고 diff 를
  본다.**

  ②까지 하면 algorithm 쪽 셈이 연쇄로 죽는데, 그 죽는 자리가 곧 **규칙이 두 곳에
  적혀 있던 자리**다. `skip-a-layer` 의 `if (nextColumn !== null) looks += 1` 은 "본
  것만 센다" 를 장면과 algorithm 양쪽에 적어 두고 있었고, `flatColumn` 셈 루프는
  `scene.ts` 의 같은 함수와 글자 그대로 같았다. `share-prefix-path` 는 `TrieNode` 가
  절반으로 줄었고(`parentId`·`char`·`depth` 가 아무 데서도 안 읽히게 됐다),
  `walk-per-character` 는 인덱스 루프가 죽으며 UTF-16 과 코드 포인트로 갈려 있던
  어휘가 맞아졌다.

- **정적 그리기가 이웃의 "지금 좌표" 를 읽으면 순서가 화면을 가른다.** `recolor-then-rotate`
  는 마디를 목록 순서로 돌며 가지의 위 끝을 `parentEl.x` 에서 읽었는데, 부모가 목록
  뒤에 있으면 그것이 아직 **옛 자리**였다. 회전 걸음에서 가지가 엉뚱한 데서 출발했다.
  **자리를 먼저 한 번에 셈하고 그 다음에 그린다** — 그리면서 재면 순회 순서가 곧
  숨은 상태가 된다.

- **등식의 한 항이 상수로 박혀 있는 것도 "두 자리에서 세기" 다.** `height-balance-check`
  는 없는 자식 자리의 키를 `'0'` 이라는 **문자열 상수**로 그렸다. 장식처럼 보이지만
  그 자리에서 실제로 키 0 이 올라와 `|2 − 0| = 2` 의 한 항이 된다. 화면에 함께 뜨는
  수는 상수라도 같은 함수를 지나야 한다.

- **자르는 잣대가 두 군데면 갈린다.** `coin-flip-height` 는 층의 상한을 셈하는 쪽과
  그리는 쪽이 각자 `min(6, maxLevels)` 로 잘랐다. 장면이 한 번 좁히고 양쪽이 그것을
  쓰게 한다.

- **조용한 발신(`silent: true`)이 걸음 셈을 어긋내던 것을 러너에서 고쳤다.**
  `SceneTrack` 은 발신마다 장면을 쌓는데 `Timeline` 의 걸음 경계는 `silent` 가 아닌
  발신만 센다. 그래서 조용한 발신이 하나 끼면 **그 뒤 모든 걸음에서 띠가 옆 걸음의
  장면을 세웠다.** 조용한 발신 자체는 대개 화면을 안 바꾸므로 그 걸음은 멀쩡해 보이고,
  되짚기 감사도 화면만 보므로 통과시킨다 — **눈으로도 감사로도 안 잡히는 어긋남**이다.

  이제 `SceneTrack.push` 가 조용한 발신에 대해 걸음을 늘리지 않고 그 걸음의 장면을
  갈아 끼운다 (`packages/core/test/scene-silent-step.test.ts` 가 지킨다). 조각 87 개가
  `silent` 를 쓰므로 그 전에 옮겼다면 전부 어긋났을 자리다.

  **고친 덕에 `silent` 가 쓸 수 있는 도구가 됐다.** 한 걸음으로 묶여야 할 발신이
  셋으로 갈려 띠에 0ms 짜리 눈금이 서는 조각이 있으면 (`bst-inorder-sorted` 는 값 하나가
  흘러나오는 데 발신 셋을 썼다) 뒤의 둘을 `silent` 로 돌린다 — 장면에는 반영되고
  눈금은 하나로 접힌다.

- **흐를 것이 없는 걸음은 벽시계가 `stepMs` 그대로다.** 짚기만 하는 걸음, 답에 이름만
  붙이는 걸음은 운동이 없어 S-piece 의 얇은 걸음 잣대(800ms) 아래로 떨어진다. 띠를
  끌 때 앞뒤와 구별되지 않는 자리다.

  **`stepMs` 를 올리지 말고 그 걸음에만 220~300ms 짜리 얇은 운동을 얹는다.** `stepMs`
  를 올리면 이미 긴 걸음이 함께 길어진다.

  운동은 **얼마나 눈에 띄나가 아니라 그 걸음이 하는 말과 같은 동사인가**로 고른다.
  되돌아오는 걸음을 자리 이동으로 그리면 "걸어간다" 가 되고, 이미 서 있던 것을
  `opacity` 0→1 로 나타나게 하면 깜빡임으로 읽힌다. 처음 뜨는 줄이면 앉는 꼴이 맞고,
  이미 있던 것이면 부풀었다 돌아오는 꼴이 맞다.

  짚을 자리는 **걸음이 아니라 장면에서 찾는다.** `step` 에 대상 id 를 도로 실으면
  방금 걷어낸 "두 출처" 를 운동 쪽으로 다시 들이는 꼴이다.

- **걸음 벽시계가 정직해지면서 재생이 길어지는 조각이 있다.** projector 의 `onEvent` 는
  `void` 를 돌려주어 애니메이션을 띄워 보내기만 할 수 있었지만, `render` 의 Promise 는
  그 장면이 다 선 뒤에 풀려야 한다 (S-scene). 그래서 `stepMs` 위에 애니메이션이 더해진다
  (`traversal-order` 는 15 초에서 24 초가 됐다). **이행이 만든 결함이 아니라 원래 화면이
  못 지키던 수가 드러난 것이다.** S-piece 의 처방대로 `stepMs` 를 낮추는 것이 아니라
  걸음 수나 사양을 다시 본다.

- **바탕 타입을 좁히려면 호출부를 객체 리터럴로 넘긴다.** `Pick<Scene, 'base'>` 로
  좁혀 놓고 `atStart(scene)` 처럼 **변수**를 넘기면 TypeScript 의 초과 속성 검사가 돌지
  않아 장면 전체가 그대로 통과한다. 좁힌 타입이 아무것도 막지 못하는데 주석은 "타입으로
  막아 두면 실수로도 못 넘긴다" 고 단언하게 된다 — 한 배치에서 셋이 그랬다.

  ```ts
  return atStart(scene);                    // 나쁨 — 초과 속성 검사가 돌지 않는다
  return atStart({ base: scene.base });     // 좋음 — 여기서 걸린다
  ```

- **`rewind` 갈래가 걸음이 고치는 바탕을 그대로 넘기지 않는다.** `through-middle-node`
  는 걸음이 고치는 거리표(`roads`)를 `nodes`·`edges` 와 같은 급의 바탕으로 묶어
  되감기에 넘겼다. 되감은 화면이 줄은 이미 굵고 배지는 최종 거리를 단 채로 서고, 그
  위에 algorithm 이 새로 셈한 처음 거리가 겹쳐 **화면 안에서 두 수가 어긋났다.**

  ```ts
  // 걸음이 고치는 것은 바탕이 아니다. 선언에서 다시 셈한다.
  type Base = Pick<Scene, 'nodes' | 'edges'>;          // roads 를 넣지 않는다
  function atStart(base: Base): Scene {
    return { ...base, roads: openingRoads(base.edges), … };
  }
  ```

  **이 대목은 전수 검사로 세울 수 없다.** 세 가지 잣대를 짜 보고 셋 다 접었다 — 첫
  장면에 곧바로 `rewind` 를 먹이면 바탕이 아직 안 고쳐져 아무것도 못 잡고, 걸어간 뒤
  첫 장면과 견주면 되감은 뒤에도 남아야 옳은 것(`lost-link` 의 노드 명부,
  `index-address-calc` 의 놓인 칸)까지 틀렸다고 잡으며, 두 주행을 견주는 것은 걸음이
  절대값을 실어 오는 조각에서 `reduce` 가 멱등이라 통과해 버린다. **무엇이 걸어온
  자취이고 무엇이 남아도 되는 바탕인지는 그 조각만 안다.** 옮길 때 눈으로 가리고,
  rule-guard 감사에 맡긴다 (실제로 감사가 잡았다).

- **정적 경로가 두 번 그려도 깜빡이지 않는다.** `rewind()` 뒤에 옛 자리로 세웠다가
  끝 자리로 옮겨도 그 사이에 타이머도 프레임도 없어 마이크로태스크만 돈다 — 페인트가
  끼지 않는다. 그러니 정적 경로를 단순하게 짜도 된다.

- **이름이 부딪힌다.** 기존 stage 에 `Scene` · `readScene` 같은 이름이 이미 쓰이는
  조각이 있다 (`tokens-per-language` · `unknown-becomes-known`). 배치 밑감이면
  `Layout`, 문장 읽기면 `readSentences` 처럼 갈라 준다.

- **전수 검사가 새 구조를 모른다.** `piece-first-advance` 는 projector 만 감싸 발신을
  세던 탓에 scene 조각을 "발신 없음" 으로 잘못 잡았다. 이미 고쳤지만, 다른 검사에서
  비슷한 것이 나올 수 있다.

---

## 5. 검증

### 매번 (조각 하나를 옮길 때마다)

```sh
d=facets/<domain>/<name>
npx tsc --noEmit -p $d/tsconfig.json
npx tsc --noEmit -p packages/core/tsconfig.json
```

### 되짚기가 서는가 (핵심 판정)

```sh
pnpm --filter @ffacet/playground dev            # 포트를 적어 둔다
node scripts/scene-audit.mjs --port <포트> --only facet:<id>
```

**흔들림 0 · 왕복어긋남 0** 이어야 통과다.

- *흔들림* — 되짚은 뒤 화면이 나중에 저 혼자 바뀐다 (지연 발화가 덮어썼다)
- *왕복어긋남* — 되짚었다 끝으로 돌아왔을 때 처음 완주 화면과 다르다

어긋나면 `--diff` 를 붙여 어느 자리가 다른지 본다.

띠가 없는 조각은 감사가 `띠없음` 으로 건너뛴다. 재려면 그 facet 의 컨트롤을
`CONTROL_SET.pieceScrub` 으로 바꾼다.

### 묶음마다 (열 개쯤 옮기고)

```sh
pnpm -r run typecheck
pnpm test                     # 현 기준 1601 개
node scripts/scene-audit.mjs --port <포트>    # 전수. 30 분~1 시간
```

### 눈으로

`apps/playground/scrub.html` 에 옮긴 조각을 올려 직접 끌어 본다.

---

## 6. 진행

목록을 손으로 적지 않는다. 낡기 때문이다.

```sh
# 옮긴 조각
grep -l "scene: 'module:" facets/*/*/src/facet.ts | wc -l
# 남은 조각
grep -l "projector: 'module:" facets/*/*/src/facet.ts | wc -l
# 어느 것이 남았나
grep -L "scene: 'module:" $(grep -rl "@piece" facets --include="facet.ts")
```

2026-09-16 기준 **52 / 181**.

옮긴 배치는 셋이다. 셋 다 **흔들림 0 · 왕복어긋남 0** 으로 닫았다.

| 배치 | 날짜 | 조각 |
| --- | --- | --- |
| 첫 셋 (성격 검증) | 2026-09-13 | `hash-avalanche` · `split-and-number` · `bst-degenerate` |
| 토큰화 여섯 | 2026-09-13 | `ai-engineering` 의 여섯. 옮기기 전 여섯 다 되짚기가 흔들렸다 |
| 자료 구조 · 배열 다섯 | 2026-09-16 | `index-address-calc` · `shift-on-insert` · `shift-on-remove` · `out-of-bounds` · `grow-and-copy` |
| 자료 구조 · 연결 리스트 다섯 | 2026-09-16 | `node-points-next` · `traverse-from-head` · `relink-insert` · `lost-link` · `through-middle-node` |
| 자료 구조 · 스택과 큐 다섯 | 2026-09-16 | `push-pop-top` · `enqueue-dequeue-ends` · `queue-vs-stack-order` · `circular-buffer-wrap` · `deque-both-ends` |
| 자료 구조 · 힙 다섯 | 2026-09-16 | `heap-property` · `array-as-tree` · `parent-two-children` · `sift-up` · `sift-down` |
| 자료 구조 · 해시 넷 | 2026-09-16 | `hash-to-bucket` · `chaining-bucket` · `open-addressing-probe` · `load-factor-rehash` |
| 자료 구조 · BST 와 순회 다섯 | 2026-09-16 | `bst-compare-and-go` · `bst-inorder-sorted` · `traversal-order` · `height-stays-low` · `depth-doubles-count` |
| 자료 구조 · 균형 트리 다섯 | 2026-09-16 | `height-balance-check` · `rotate-to-balance` · `black-height-equal` · `recolor-then-rotate` · `coin-flip-height` |
| 자료 구조 · B트리 · 트라이 · 스킵 · 유니온 파인드 아홉 | 2026-09-16 | `node-holds-many` · `split-when-full` · `share-prefix-path` · `walk-per-character` · `skip-a-layer` · `find-root` · `union-by-rank` · `path-compression` · `separate-components` |

**자료 구조 계열 42 개가 이것으로 닫혔다.** 아홉 배치, 배치마다 병렬 에이전트 넷~아홉.

### 배치를 돌리는 법

조각 하나에 에이전트 하나, 한 배치에 다섯. 서로를 모른 채 같은 워킹트리에서 동시에
고친다. 조각이 서로 독립이라 파일이 겹치지 않는다.

- **`git stash` 를 쓰지 않는다.** 회귀를 보려고 `git stash -u` 를 한 번 썼다가 형제
  넷의 미커밋 작업을 통째로 치웠다 (`stash pop` 으로 복구). 옛 파일이 필요하면
  `git show HEAD:<path>`.
- **전수 검사는 배치 도중에 뜻이 없다.** 형제 조각이 반쯤 옮겨진 상태라
  `stage.init is not a function` 으로 멎는다. 배치가 다 끝난 뒤 돌린다.
- **되짚기 감사는 호스트가 일괄로 돌린다.** 에이전트마다 dev 서버를 띄우면 포트를
  다툰다. 조각별 `tsc` 까지 에이전트가 통과시키고, `scene-audit --only <다섯>` 은
  배치가 닫힐 때 한 번 돈다.
- **앞 배치가 걸린 것을 다음 배치의 지시문에 싣는다.** 4 절의 함정 목록이 그대로
  지시문이 된다. 배열 다섯에서 나온 넷(`prev` 출발값 · `void` 운동 · 죽은 `step`
  비교 · `isInstant` 오해)을 연결 리스트 다섯의 지시문에 넣었더니 그 넷이 한 건도
  재발하지 않았다.

### 순서에 대한 권고

- **한 도메인씩 묶어서** 옮긴다. 같은 도메인의 조각은 그리는 결이 비슷해 장면 설계가
  이어진다.
- **묶음마다 커밋**하고 그 커밋에 감사 결과를 적는다. 되돌릴 자리가 분명해진다.
- 두 방식이 **공존한다.** facet 이 `projector` 또는 `scene` 중 하나를 선언하고 러너가
  갈라 받는다. 한 번에 다 옮기지 않아도 검사가 통과한다.

### 규모 (실측 9 종)

**시간** — 토큰화 여섯을 서로 모르는 에이전트 여섯이 동시에 옮겼다.

```
tokens-per-language       5:19
between-letter-and-word   6:31
unknown-becomes-known     8:35
boundary-shift           10:51
merge-the-frequent-pair  12:50
space-is-part-of-it      20:21     ← stage 722 줄, 여섯 중 가장 큼
                        ──────
             하나당 평균 10:44 · 여섯 동시에 21:46
```

여섯을 **동시에** 돌린 값이라 서로 CPU 와 타입 검사를 다툰다. 순차라면 하나당 더
짧다. 다만 181 개를 옮길 때도 병렬로 할 것이므로 이 값이 실제에 가깝다.

자료 구조 두 배치(다섯씩)도 같은 결이었다. 한 배치가 **닫히는 데 14 분 남짓** 이고
(가장 큰 조각이 배치의 길이를 정한다) 하나당 9~14 분에 고르게 들어왔다.

```
배열 다섯          9:32 ~ 12:58    배치 12:58
연결 리스트 다섯    9:25 ~ 14:03    배치 14:03
```

여기에 배치를 닫는 검증이 더 붙는다 — 전체 `typecheck` + `test` 로 약 3 분,
`scene-audit --only <다섯>` 이 약 1 분, rule-guard 감사가 약 10 분. 감사는 다섯을
옮기는 동안 함께 돌릴 수 없다 (미커밋 상태를 읽어야 한다).

**줄수** — 조각의 성격에 따라 갈렸다.

```
hash-avalanche     520 →  486   -34   -7%
space-is-part-of-it 853 → 1004  +151  +18%
bst-degenerate     461 →  511   +50  +11%
tokens-per-language 703 →  797   +94  +13%
between-letter-and-word 485 → 627 +142 +29%
unknown-becomes-known 870 → 1100 +230 +26%
boundary-shift     678 →  863  +185  +27%
merge-the-frequent-pair 671 → 875 +204 +30%
split-and-number   945 → 1101  +156  +17%
                                ─────
                       아홉 평균 +131 줄 (+18%)
```

자료 구조 두 배치는 `src/` 전체를 기준으로 쟀다 (위 아홉은 projector+stage 기준이라
바로 견줄 수 없다).

```
배열 다섯          5123 → 6435   +1312  +26%
연결 리스트 다섯    6241 → 7890   +1649  +26%
스택과 큐 다섯     5231 → 6411   +1180  +23%
힙 다섯            4343 → 5901   +1558  +36%
해시 넷            4035 → 5403   +1368  +34%
BST 와 순회 다섯    4265 → 5965   +1700  +40%
균형 트리 다섯      4945 → 6684   +1739  +35%
마지막 아홉        8694 → 12331  +3637  +42%
                                 ─────
                  마흔셋 조각 평균 +352 줄 (+34%)

가장 적게 는 것은 `rotate-to-balance` 였다 (+17%). projector 가 238 줄로 그 배치에서 가장
무거웠는데도 그렇다 — 회전 걸음이 장면을 통째로 갈아 `layout(base) → layout(next)`
보간 하나로 끝난다.

**처음에는 그 까닭을 "이벤트가 하나라서" 로 적었는데, 반례가 나왔다.**
`split-when-full` 은 쪼개기가 이벤트 **셋**(넘침 · 올라감 · 갈라짐)인데도 걸음 함수 넷이
보간 하나로 합쳐졌다. 셋 다 **온전한 키 목록**을 내놓기 때문이다 — 넘친 자리를 "잠시
한도를 넘은 온전한 자리" 로 보면 중간 장면이 깨지지 않는다.

> **옮기기 쉬운 조각은 이벤트가 적은 조각이 아니라, 걸음마다의 상태가 온전한 구조인
> 조각이다.** 나무가 반쯤 끊기거나 자리가 반쯤 비는 중간 장면이 있으면 그때부터
> 어려워진다.
```

힙 다섯이 가장 많이 늘었다 (+36%). 값이 실제로 자리를 옮기는 묶음이라, 어느 칸에 어느
값이 앉았나를 장면이 말하게 되면서 "자리 ↔ 값" 을 잇는 층이 새로 생긴다. 대신 그 층이
서자 `moveNode` · `drawInitial` · 가지 상수 같은 것들이 통째로 없어졌다.

가장 적게 는 것은 `queue-vs-stack-order` 였다 (+12%). 걸음 함수를 덧대는 대신 옮길
것을 `Move` 목록 하나로 합쳐 `settleMoves` · `showRing` · `clearRings` · `markVisited`
· `createChip` 분기가 통째로 없어졌다. **걸음 함수를 그대로 두고 정적 경로를 덧대면
+26%, 장면에서 바로 그리도록 합치면 그보다 적다** 는 것이 열다섯의 결론이다.

늘어난 몫의 정체는 배치마다 같았다 — 걸음 함수를 버리지 않고 **정적으로 그리는 길을
덧댄** 것, 그리고 캡션 문안 만들기가 projector 에서 stage 로 넘어온 것이다. 줄이려면
`hash-avalanche` 처럼 걸음 함수를 장면에서 바로 그리도록 합쳐야 하는데 재작성 분량이
커진다. 열 조각 모두 덧대는 쪽을 골랐다.

다만 **줄이 늘어도 사라지는 것이 있다.** `relink-insert` 는 화살표를 하나하나 고쳐
쓰던 코드가 통째로 없어지고, 마지막 걸음의 사슬 훑기가 손으로 적어 둔 좌표 배열 대신
**링크를 실제로 밟아** 길을 낸다 — 조각의 주장과 그림이 같은 자료를 쓰게 됐다.
`lost-link` 는 배치가 달라지는 네 걸음이 `layout(was) → layout(next)` 를 보간하는
`glide` 하나로 합쳐졌다.

늘어난 쪽은 걸음 함수를 그대로 두고 정적으로 그리는 길을 덧댄 몫이다. `hash-avalanche`
처럼 걸음 함수를 장면에서 바로 그리도록 합치면 줄어들지만 재작성 분량이 커진다.
급하지 않으면 덧대는 쪽으로 간다.

**181 개로 미루면** 대략 +2 만 줄, 병렬 여섯으로 30 배치.

---

## 7. 이행이 끝난 뒤

- `ProjectorFactory` 와 그 배선을 러너에서 걷어낸다. **`ViewMountParams.isInstant` 와
  `onScrubStart` 는 걷어내지 않는다** — projector 조각이 남아 있는 동안 쓴다. 다만
  **장면 조각에서는 러너가 그 둘을 부르지 않는다** (3-4 절). 그 사실을 모른 채 걷어낼
  자리를 고르면 엉뚱한 것을 지운다.
- `packages/authoring/src/screen-labels.generated.ts` 를 다시 만든다 (`pnpm screen:gen`).
  띠를 단 조각은 `advance` 단추가 없는데 생성물이 아직 `⏭ 한 걸음` 을 담고 있다. 호스트
  쪽에 없는 조작이 광고되는 셈이다. 배치마다 다시 만들면 커밋 잡음만 커지므로 이행이
  끝난 뒤 한 번에 한다.
- `rules/principles.md` 의 "Projector 단일 번역기" 를 장면 방식으로 다시 쓴다.
- `S-facet` 의 6 파일 구성에서 `projector.ts` 를 `scene.ts` 로 바꾼다.
- 스크럽 띠를 전 조각에 단다 (`CONTROL_SET.piece` → `pieceScrub`). 그때 조각
  algorithm 의 손짚기 루프(`waitForInput` → `rewind`)가 죽은 코드가 되므로 함께
  걷어낸다 — 179 곳이고, 자취를 닫는 신호가 `enterAwaiting` 에서 `runAlgorithm` 끝으로
  옮겨 가므로 조각 하나로 먼저 확인한다.
