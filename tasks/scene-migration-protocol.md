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
  | `const cellOn = [...scene.bits]` | 지금 비트열 | **`const` 인데 `cellOn[s] = 0` 으로 제자리에서 고쳐진다.** 묶음이 상수일 뿐 알맹이는 변수다 |
  | `Cell = { g, fills, value, x, owners: number[] }` | **누가 이 칸을 켰나** (그 조각의 결론) | DOM 손잡이와 결론이 한 객체. `const cells: Cell[]` 이라 grep 을 통과한다 |
  | `tok.g` 의 `transform` | 그 칸이 셋 중 **어디에 서 있나** | 좌표가 아니라 *어느 단계에 있나* 를 화면이 혼자 안다 |
  | `badgeDisc` 의 `stroke-width` 1.5/3 | "견주는 중" **과** "확정" 두 뜻 | **한 속성에 두 말이 실려** 어느 쪽도 복원되지 않는다 |
  | 칸의 **부모**가 `lane.g` 냐 `lane.beam` 이냐 | 줄에 있나 저울대에 실렸나 | 좌표도 속성도 아니라 **부모 참조**가 단계를 말한다 |
  | `ledgerLayer.childNodes.length` | 몇 라운드를 마쳤나 | **`<g>` 자식 수**가 진행을 쥔다 |
  | stage 의 `headLeft`/`headRight` | 두 줄의 커서 — **algorithm 의 `i`/`j` 와 두 벌** | 사본을 애니메이션 도중에 올려 복원할 길이 없다 |
  | `ghost.getAttribute('opacity') !== '0'` | **끝내 안 연 자리가 어디인가**(그 조각의 결론) | 화면을 도로 읽어 **결론을 셈한다** |
  | `const lanes: Lane[]` 한 줄 | 실린 칸 · 각 · 수 · 자식 유무 · opacity · 부모 — **일곱** | 이름이 부품이라 어떤 낱말 목록에도 안 든다 |
  | `paintNode(item, tone: 'idle'\|'ready'\|'taken'\|'stuck')` | 마디의 형편 | **`type` 선언조차 아닌 함수 인자의 인라인 유니온.** 타입 선언 훑기로도 안 걸리고 함수 서명을 읽어야 보인다 |
  | `const matchedNodes = new Set<number>()` | 어디서 무늬를 거뒀나 | **`.add`/`.clear` 되는데 어디서도 읽히지 않는다.** 진짜 답은 `circle` 의 `fill` 에만 있었다 |
  | `let slotCount` | (없다) | **대입만 되고 읽히지 않는 죽은 변수.** 위와 짝이다 |

  `const tags` 아래 넷이 요점이다. 찾는 것은 특정 낱말이 아니라 **"이 조각이 화면에
  대해 아는 것을 어디에 적어 두었나"** 이고, 그 자리가 `let` 이 아닐 때가 많다.
  `const` 로 묶인 배열, 칠에만 쓰이는 타입, 그리고 **좌표가 아니라 단계를 말하는
  `transform`** 이 그렇다. 아래 한 줄로
  타입 선언과 모듈 스코프 선언을 전부 뽑아 **눈으로 읽는 것**이 유일하게 통한 방법이다.

  ```sh
  grep -nE "^(type|interface)|^ +(const|let) |new (Map|Set)<" $d/src/*-stage.ts
  ```

  그중 **DOM 손잡이와 뜻·수치가 한 객체에 묶인 것**, 그리고 **선언되었는데 저장되는
  곳이 없는 타입**을 의심한다.

  **이 한 줄도 다 잡지는 못한다.** 들여쓰기를 `^  ` 두 칸으로 박아 두었던 동안
  `mount` 안(네 칸 이상)의 선언을 통째로 놓쳤다 — 조각의 상태는 대개 거기 있는데도.
  `many-patterns-one-pass` 의 `const lanes` 가 stage 201 줄에서 **눈으로** 나왔고,
  그것이 `taken.push` 로 알맹이가 제자리에서 고쳐지는 자리였다. 패턴은 `^ +` 로
  고쳤지만, 요점은 **grep 을 믿지 말라**는 것이다.

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

  **계열에 따라 이것이 예외가 아니라 통례다.** 자료 구조 마흔둘에서는 한 건이었는데
  확률적 자료구조 여덟에서는 **여섯**이 여기 걸렸다. 우연이 아니다 — 그 계열의 조각은
  하나같이 *여럿이 한 자리를 나눠 써서 생기는 일*을 말하는데, 겹침이란 **칸 하나에
  누적으로만 드러나는 것**이라 명령형 stage 가 그것을 잠깐 물들였다 다음 걸음에서
  지우고 있었다. 지운 자리가 곧 그 조각의 결론이었다.

  | 조각 | 지워지던 것 | 지운 명령 |
  | --- | --- | --- |
  | `several-hashes-one-value` | 이 칸을 나눠 썼다 | 260ms 두드리는 테 |
  | `cannot-unset` | 어느 칸이 이번에 꺼진 것인가 | `clear` 의 `marked.delete(s)` |
  | `wrong-in-one-direction` | 이 셋을 켠 것은 누구인가 | `enterQuery` 의 `clearOwners()` |
  | `trust-the-smallest` | 어느 칸이 부딪혔나 | 걸음마다 `clearCellMarks()` |
  | `leading-zeros-tell` | 끝에 남는 눈금 | `clearAll()` 의 `notchY = null` |
  | `space-error-tradeoff` | 앞서 이만큼 부풀어 있었다 | `ghostGroup` 이 명령으로만 쌓임 |

  **소재를 먼저 보고 의심의 세기를 정한다.** 조각의 주장에 "나눠 쓴다 · 부딪힌다 ·
  겹친다 · 쌓인다 · 남는다" 가 들어 있으면, 명령형 stage 가 그것을 지우고 있다고
  먼저 가정하고 반증을 찾는다.

  고치는 길은 한 갈래로 모였다 — **채움은 값의 형편, 테두리는 겹침·짚음의 표식**으로
  갈라 두 칠이 부딪히지 않게 한다 (함정 "되돌림이 지우던 것이 정보였을 수 있다" 의
  갈래와 같다). 서로 모르는 에이전트 다섯이 각자 이 갈래에 이르렀다.

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

- **차례는 발신이 오는 순서가 이미 말한다.** `index` · `row` · `probeIndex` 처럼
  "몇 번째 걸음인가" 를 싣는 필드는 장면이 세는 것으로 늘 대신할 수 있다 — 줄은 올
  때마다 하나씩 쌓이므로 `rows.length` 가 곧 그 줄의 번호다. 걷어내면 algorithm 의
  인덱스 루프가 함께 죽어 `for (const key of keys)` 가 된다. 확률적 여덟에서 이것만
  네 조각에 있었고, 한 배치 안에서 같은 물음에 두 답이 남아 감사가 잡았다.

- **바탕에서 결정되는 셈은 싣지 말고 같은 함수를 부르게 한다.** 해시 자리처럼
  *구조에서는 셀 수 없지만 바탕 자료에 순수 함수를 먹이면 나오는* 값이 있다. 두 길이
  있고 확률적 여덟이 넷 대 넷으로 갈렸다 — 규범이 말하지 않아서 갈린 것이다.

  ```ts
  // A — algorithm 이 세어 싣는다
  await ctx.emit({ type: 'probe', payload: { key, reads: cellsOf(key) } });

  // B — algorithm 이 함수를 내주고 장면이 부른다
  export function cellsOf(key: string, depth: number, width: number): Cell[] { … }
  ```

  **B 로 간다.** 둘 다 출처가 하나라 갈리지는 않지만, A 는 payload 를 무겁게 두어
  *다음 사람이 집어 쓸 문*을 열어 둔 채다 — 그 문이 바로 "두 자리에서 세기" 가
  들어오는 길이다. B 는 `scene.ts` 가 `algorithm.ts` 를 import 하는데 **원칙 1 의
  허용 방향**이다 (장면이 projector 자리를 잇는다).

  잣대는 이렇게 읽는다.

  | 무엇 | 어디서 | 보기 |
  | --- | --- | --- |
  | 구조에서 세지는 것 | **장면이 센다** | 켜진 칸 수 · 최솟값 · 층별 노드 수 |
  | 바탕 + 순수 함수로 나오는 것 | **함수를 내주고 장면이 부른다** | 해시 자리 · 척도 경계 · 좁히개 |
  | 걸음이 내리는 판정 | **싣는다** | 어느 칸이 부딪혔다고 볼 것인가 · 어느 값을 지울 것인가 |

  **가운데 줄에는 경계가 있다 — 내주려는 함수가 조각의 알고리즘 그 자체면 멈춘다.**
  내주면 장면이 알고리즘을 되풀이하는 꼴이 되고 발신이 장식이 된다. 알고리즘 계열에서
  서로 모르는 셋이 각자 같은 자리에서 멈췄다.

  | 조각 | 내주려던 것 | 판단 |
  | --- | --- | --- |
  | `in-place-vs-extra` | `planRounds` 전체 | 알고리즘 자체 → 판정 둘만 싣는다 |
  | `bottom-up-table` | `from`/`value` | **피보나치 점화식 자체** → 싣는다 |
  | `greedy-can-fail` | `planGreedy` + `planFewest` | 알고리즘 자체 → `capacity` 를 싣는다 |

  반대로 같은 조각들이 **자르는 잣대 · 펼침 · 술어**는 내주었다 —
  `bottomUpTableCellCount`(폭 좁히기) · `expandFibCalls`(나무 펼치기) ·
  `reachableIndices`(닿음의 술어) · `midOf`(가운데 고르기) · `slotsFor`(해시 자리).
  잣대는 이렇게 읽는다: **그 함수만 떼어 내도 조각이 말하려는 바가 남아 있으면 내준다.**

- **길이 0 짜리 선이 둥근 끝을 만나면 점이 된다.** `average-the-buckets` 는 가운데 벽을
  `y1 = y2` 로 미리 지어 두고 나중에 `y2` 만 늘렸는데, `stroke-linecap: 'round'` ·
  `stroke-width: 2` 라 **아직 나누지 않은 화면에 2px 점 셋이 찍혀 있었다.** 나눌 자리를
  미리 광고한 셈이다. 아직 없는 것은 **숨기지 말고 짓지 않는다** — 숨기기만 하면 앞
  걸음의 `y2` 도 함께 남아 되짚기 판정까지 어긋난다.

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

  **다만 `silent` 는 앞 걸음의 장면을 갈아 끼운다 — 방향이 있다.** 접으려는 발신이
  **다음** 국면을 예고하는 것이면 한 걸음 일찍 말하게 되므로 접으면 안 된다.
  `count-then-place` 의 `caption-changed` 넷이 그 자리였다: 접으면 마지막 세기 걸음이
  "눈금 더미가 굳는다" 를 말하고, 마지막 타일이 날아가는 중에 "정렬이 끝났다" 가 뜬다.
  거기서는 **발신을 통째로 걷어내고 장면이 스스로 정하게** 했다 (걸음 20 → 16). 같은
  배치의 `heap-sort-extract` 는 `rewind`/`heap-shown` 이 앞 걸음을 갈아 끼우는 것이
  맞아 `silent` 로 접었다. **같은 증상에 두 처방이 갈린다.**

  | 접으려는 발신이 | 처방 |
  | --- | --- |
  | 방금 지나간 걸음의 화면을 마저 고친다 | `silent: true` |
  | 다음에 올 국면을 예고한다 | 발신을 없애고 장면이 파생시킨다 |

- **문 없이 나가는 발신은 벽시계가 0 이다.** `silent` 가 아니어도 `gate()` 를 안 지나면
  걸음 눈금이 0ms 로 선다. `take-best-now` 의 `reach-updated` 다섯이 그랬고
  (`gate` 가 루프 첫머리에 한 번뿐이었다), `guess-by-value` 의 `discard-half` 는
  360ms 였다. **앞 걸음과 한 뜻이면 `silent` 로 접고, 제 몫의 주장이면 문을 하나 넣는다.**
  `select-min-each-pass` 의 `mark-hop` 은 문을 넣어 300ms → 1050ms 가 됐다 — 발신 수는
  그대로라 띠 눈금이 변하지 않는다.

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

- **CSS `transition` 을 쓰지 않는다 (MUST NOT).** 되짚기는 `animate:false` 로 오는데
  transition 은 그 뒤에도 화면을 **저 혼자 흘러가게** 한다 — 흔들림의 직접 원인이다.
  알고리즘 계열에서 셋이 걸렸고 (`scan-until-found` · `greedy-can-fail` ·
  `try-and-undo` 는 일곱 곳), 전부 rAF 보간으로 옮겼다. 곁들여 `void nextFrame().then(…)`
  처럼 **나중에 transition 을 도로 켜는 지연 발화**도 같은 자리다.

- **`destroy()` 가 기다리던 Promise 를 반드시 푼다 (S-piece MUST).** `tween`/`animate` 의
  `resolve` 가 `tick`/`setTimeout` 콜백 **안에만** 있으면, `destroy` 가 rAF·타이머를
  취소할 때 그 콜백이 **아예 안 불려** 약속이 영영 안 풀린다. `await ctx.emit` 이
  안 돌아와 unmount 뒤에도 algorithm 과 SVG 가 붙들린다.

  **이 이행에서 열 조각이 글자 그대로 같은 구멍을 갖고 있었다.** 조각마다 고칠 일이
  아니라 관용구를 외워 두는 자리다 — `waiters: Set<() => void>` 에 `finish` 를 담고,
  `destroy` 가 `destroyed = true` → `gen += 1` → 프레임·타이머 일괄 취소 →
  **`for (const wake of [...waiters]) wake()`** 순으로 돈다. 전부가 걸린 것은 아니다
  (`take-best-now` 는 원본이 이미 옳았다).

  **더 나쁜 쪽도 있다.** `overlapping-subproblems` 는 `animate()` 가 `void` 를 돌려주고
  projector 의 `onEvent` 도 `void` 라 **풀 Promise 자체가 없었다.** `destroy-releases-waiters`
  전수 검사를 매달림 0 으로 통과하는데, **기다리는 것이 없어서** 통과하는 종류다. 검사가
  두 상태를 못 가른다.

- **자기 글자를 도로 읽어 덧붙이지 않는다.** `guess-by-value` 의 `aimLand` 가
  `formula.textContent = formula.textContent + ' = ' + index` 였다. 같은 걸음을 두 번
  그리면 `= 8 = 8` 이 된다. 명령형 stage 에서는 각 걸음이 한 번만 지나가 드러나지
  않지만 장면은 같은 걸음을 몇 번이든 다시 그린다 — **되짚기가 없으면 영영 안 보이는
  결함**이다.

- **걸음 계약이 거짓일 수 있다.** `scan-until-found` 는 `SETTLE_MS = 140` 으로 걸음이
  520ms 짜리 운동을 띄워 보내고 140ms 만에 "끝났다" 고 답했다. projector 의 `onEvent` 가
  `void` 를 돌려주니 가능했던 일이고, `render` 의 Promise 는 장면이 다 선 뒤에 풀려야
  하므로 구조적으로 못 하게 된다.

- **조각의 결론이 상수로 박혀 있을 수 있다.** `bottom-up-table` 의 옛 발신은 `calls: 0`
  을 **리터럴로** 실었다 — "위에서 내려가며 부르는 일이 한 번도 없다" 가 그 조각의
  결론인데 화면의 자취와 아무 관계가 없었다. `keep: [n-1, n]` 도 같다. 지금은
  `callsOf` 가 자취를 밟으며 세고 `keepOf` 가 **화살이 실제로 뻗은 거리**를 잰다.
  **조각의 결론이 그림과 같은 자료를 쓰게 하는 것이 이행의 알맹이다.**

- **아예 없던 상태도 있다.** `take-best-now` 는 "지금까지 얼마를 만들었나" 가 **코드에도
  화면에도** 없었다 — 계량기가 남은 몫만 보였다. 숨은 상태를 찾는 일과 별개로,
  **조각이 말하려는 것 중 화면이 아직 말하지 않는 것**을 따로 묻는다.

- **자취를 남기되 어휘를 가른다.** `try-and-undo` 의 헛걸음을 살아 있는 자국과 같은
  점선 원으로 그리면 "자국이 안 지워졌다" 로 읽히는데, 그것은 그 조각이 말하려는 것의
  **정반대**다(`description` 이 "그 아래 행의 자국도 지워져야 한다" 고 못박는다).
  모서리의 작은 점으로 갈랐다. **남길 것과 남기면 안 되는 것이 한 화면에 같이 있는
  조각에서는 어휘를 먼저 가른다.**

- **사양 문제와 이행 문제를 가른다.** `prune-branch` 의 뻗는 걸음이 462ms 로 800ms
  아래인데 **이행 전에도 같은 값**이었고 projector 도 그 운동을 `await` 하고 있었다.
  고치려면 걸음 열일곱의 박자를 다시 잡아야 한다 — 이행이 건드릴 자리가 아니다.
  얇은 걸음을 만났을 때 **이행이 드러낸 것인지 원래 사양이 그런 것인지** 먼저 본다.

- **DOM 의 *거울*을 되읽는 것도 ④ 다.** `chipNowY` · `spinDeg` · `torchBox` · `Card.at`
  처럼 화면의 지금 자리·값을 따로 적어 둔 표를 운동의 **출발값**으로 삼으면,
  `getAttribute` 도 `textContent` 도 안 쓰니 ④ 의 grep 을 통과하고 `const` 로 묶여
  있으면 ② 도 통과한다. 되짚어 세운 직후에는 그 거울이 옛 화면의 것이다.
  **그래프·문자열·복잡도 예순두 조각 중 스물이 여기 걸렸다** — 줄·창·표지·저울이
  움직이는 조각은 화면의 좌표를 거울에 적어 두는 것이 자연스러운 설계라 그렇다.
  출발 그림이 필요하면 `step` 에 계기값을 실어 장면이 말하게 한다.

- **한 축에 값을 셋 이상 욱여넣지 않는다 — 결론이 형편을 덮는다.**
  `type EdgeVisual = 'tree'|'candidate'|'idle'` 은 고른 간선이 `tree` 가 되는 순간
  *그것이 후보 중에서 골라졌다*는 사실을 지운다. `grow-one-tree` 는 조각 이름이
  "가장 가벼운 것을 붙인다" 인데 **가장**이 사라지고 있었고, `all-suffixes-sorted` 는
  앞머리 표식이 채움이라 덩어리를 짚는 순간 "줄에 앉았다" 가 사라졌으며,
  `three-edit-choices` 는 진 칩 둘을 지워 **셋 중**도 **가장**도 안 남았다.
  **형편(채움)과 표식(테두리)을 각각 제 축에 두면** 이긴 것과 진 것이 한 화면에 선다.

- **상시 도는 rAF 루프는 CSS `transition` 과 같은 병이다 (MUST NOT).**
  `pick-nearest-unsettled` 가 mount 부터 destroy 까지 쉬지 않고 돌며 정점의
  `transform` 을 **벽시계로** 고쳤다 — 되짚기는 `animate:false` 로 오는데 그 뒤에도
  화면이 저 혼자 흔들려 **흔들림 축을 구조적으로 통과할 수 없다.** 떨림·맥놀이·물결은
  **걸음의 운동 안으로 접어** `e`(0→1)로만 진폭이 정해지게 한다 (양 끝에서 0).

- **결론을 셈하지 않고 적어 둔 자리가 있다.** 이 계열에서 셋이 나왔고 셋 다 화면이
  거짓을 말하고 있었다. `growth-outpaces` 의 캡션은 "the largest term holds {pct}%"
  라고 써 놓고 언제나 **n² 의 몫**을 넣어, n = 1 에서 가장 큰 항이 상수 100(90.1%)인데
  화면은 **0.9%** 라고 말했다 — 조각의 주장과 정반대다. `constant-fades` 의
  `moveBoundary` 는 `settleChips(c, value, value, 'tie')` 로 같은 값을 두 번 넘겨
  **만남을 단정**했다. `verify-vs-find` 의 `setup` 은 `answers: 3` 을 실어
  **다 훑기 전에는 알 수 없어야 할 수**로 선반 폭을 정했다.
  **큰 n 에서는 우연히 맞아 여태 안 드러나는 종류다.**

- **`silent` 를 쓰면 자체 검증 축 1 에 구멍이 생긴다.** `SceneTrack` 은 조용한 발신에
  대해 걸음을 늘리지 않고 앞 걸음의 장면을 갈아 끼우므로, 접히기 직전 장면이 track 에
  남지 않는다. 축 1 이 track 을 훑으면 그 `render` 를 **아예 안 잰다** — `done` 을 접은
  조각에서 가장 무거운 운동(1400ms)이 검사를 그냥 지나갔다. 접은 걸음이 있으면 **그
  직전 장면을 따로 `reduce` 해** 견주는 검사를 덧붙인다.

- **자체 검증 축 3 은 기본값으로 두면 이빨이 없다.** 끊은 뒤 "풀렸나" 를 **프레임
  대기**로 재면 `destroy` 가 Promise 를 안 풀어도 **다음 rAF 가 대신 깨워** 통과한다.
  **마이크로태스크 안에 풀리는지**로 조여야 한다. `undo-by-back-edge` 는 `destroy` 가
  rAF 를 취소조차 하지 않아 그 상태였고 — 비활성 탭·헤드리스에서는 영영 안 풀린다 —
  프레임 대기로 재던 `row-times-column` 의 **커밋된 테스트**도 `delay(800)` 으로 재서
  같은 구멍이 있었다.

- **운동이 happy-dom 에서 실제로 도는지 확인한다.** 운동이 안 돌면 "흘려 세운 화면" 과
  "곧바로 세운 화면" 이 같아지는 것이 당연해져 축 1 이 통과해 버린다. stage 를 rAF 로
  옮기면 `canAnimate` 가 거짓이 되는 조각이 있어 `setTimeout` 기반을 그대로 둔 담당이
  둘 있었다. **마지막 `drawStatic(next)` 를 뺐을 때 축 1 이 여러 건을 잡으면 보간
  경로가 돌았다는 증거다** — 음성 대조가 이 확인을 겸한다.

- **payload 를 걷어내면 검사의 헛단언이 드러난다.** 이번 계열에서 **일곱 개**가 나왔다.
  전부 같은 뿌리다 — **알고리즘이 방금 적어 보낸 수를 테스트가 같은 식으로 다시 셈해
  견주는 것.** `folds.map(f => f.row)` 가 `[1,2,3]` 인지 보는 것은 `row` 가 정의상 접은
  횟수라 늘 참이고, `expect(names).toEqual(subjects)` 는 발신이 `subjects` 를 그대로
  되돌려준 배열이며, `schedule.payload.total === color.payload.total` 은 같은 변수를
  두 발신에 실은 것이다. **통과하는데 아무것도 지키지 않는다.** payload 가 사라지면
  그 단언이 죽어서 드러나므로, 지우지 말고 **화면이 세는 수와 알고리즘이 세는 수**라는
  서로 다른 두 구조를 견주게 고친다.

- **문안은 두 자리에 산다.** `facet.ts` 의 선언을 고치면 stage 호출부의 **en 원본**도
  함께 고쳐야 한다 (`t(key, '<en 원본>', args)`). `rolling-hash` 가 열 로캘을 다 고치고
  호출부를 빠뜨려 `en-original-matches-declaration` 이 잡았다. 선언이 정본이다.

- **띠를 달면 중간 걸음의 화면도 산출물이 된다.** 지금까지 "조각의 주장이 **완주
  화면**에 남아야 한다" 를 잣대로 써 왔는데, `pieceScrub` 이 붙으면 어느 걸음이든
  끌어서 볼 수 있으므로 **그 걸음의 화면도 도달 가능한 산출물**이다.
  `spatial-locality` 는 자료가 `count: 8` · `perLine: 4` 라 여덟을 다 물어 **완주
  화면에는 덤 칸이 남지 않는데**, 어휘를 갖춰 두었으므로 걸음 2·7 로 끌면 선다.
  자료가 완주 시점에 그 주장을 못 보이는 조각이면 **어휘만 세우고 그 걸음으로 끌게
  하는 것**이 답일 수 있다. 다만 **기본값은 여전히 완주 화면**이다 — 끌지 않는 사람이
  훨씬 많다.

- **얇은 걸음에는 한 겹이 더 있다 — 사양이 만든 얇음과 stage 가 만든 얇음.**
  "이행 전에도 같은 값이면 사양 문제" 는 절반만 맞다. 값이 같아도 **그 값을 만든 것이
  걸음 수·`stepMs`·문 배치(사양)인지, projector 의 `onEvent` 가 `void` 라 stage 가
  운동을 아예 안 걸었던 것(게으름)인지**가 갈린다. 후자면 이행이 고칠 자리다 —
  `write-back-vs-through` 의 `done` 은 `finish()` 가 동기 `void` 라 700ms 였고, 자(尺)가
  자라는 260ms 를 얹어 960ms 가 됐다. **`stepMs` 를 올리는 것이 아니라 그 걸음이 하는
  말과 같은 동사를 얹는다.**

- **`Math.sin(π)` 는 0 이 아니다 (함정 "부동소수 끝자리" 의 변종).** `1.2246e-16` 이라
  `translate(0 -6.1e-16)` 같은 끝자리가 남는다. 진폭이 양 끝에서 0 인 운동
  (`sin(πe)` 로 부풀었다 돌아오는 꼴)은 이 도메인에서 여럿이 쓰는데, **양 끝에서 정확히
  0 을 내는 헬퍼**로 감싸야 한다.

- **`Map` 의 삽입 순서가 숨은 상태일 수 있다 ("순회 순서" 함정의 변종).**
  `conflict-miss` 의 `chipsByCol: Map<number, number[]>` 는 **그 Map 의 키 삽입 순서**가
  라벨이 설 가로 자리를 정하고 있었다. 좌표를 읽는 것이 아니라 **자료 구조의 순서**에
  기대는 것이라 함정 13 의 grep 으로도 안 잡힌다. 자리를 정하는 것은 **값**(줄 번호 ·
  색인)이어야 한다.

- **캡션 문안이 상수를 못박는다.** `associativity-relief` 는 줄 수와 **연관도**를 열
  언어에 상수로 적어 두었는데 **그 수가 바뀌는 것이 그 조각의 주제였다.** `line-fill` 은
  "이웃 셋" 을, `growth-outpaces` 는 "가장 큰 항" 이라 써 놓고 언제나 n² 를 넣었다.
  **화면에 나란히 뜨는 수만 의심하지 말고 산문도 읽어라** — 문안이 자료를 못박으면
  자료가 바뀔 때 조용히 거짓이 된다. 지금 자료에서 이미 거짓인 것이 있는지 먼저 본다.

- **`origin` 이 서브도메인을 가로지른다** 와 짝이 되는 것 — **카탈로그와 구현이 다르다.**
  `computer-architecture` 는 카탈로그에 조각 39 개가 선언돼 있는데 facet 이 있는 것은
  19 개다(파이프라인 8 · 분기 예측 6 · 데이터 배치 6 이 미구현). **대상을 셀 때
  카탈로그만 보면 없는 것을 세고, 파일만 보면 `origin` 이 가로지르는 것을 놓친다.**
  둘 다 세어 견준다.

- **`t()` 를 지나지 않는 화면 글자는 어떤 검사도 못 잡는다.**
  `en-original-matches-declaration` 도 `facet-i18n` 도 **`t()` 호출만 훑기 때문에**
  `label.textContent = 'pattern'` 같은 자리는 통과한다. `rolling-hash` 는 거기에
  "도식 라벨 한 단어라 표식이다 — 키를 만들지 않는다 (C10)" 는 **C10 에 없는 예외**를
  주석으로 적어 두기까지 했다. 옮길 때 stage 의 `textContent = '<라틴 두 자 이상>'` 을
  직접 훑어라 — 저장소 전반에 같은 종류가 열 곳 남짓 더 있다 (`head` · `tail` ·
  `capacity` 등). 검사를 하나 붙이면 다시 안 들어온다.

- **`origin` 이 서브도메인을 가로지른다.** `adjacency-list-vs-matrix` 는 카탈로그상
  `data-structures` 인데 `origin: graph` 라 자료구조 배치에서도 그래프 배치에서도
  빠졌다. **대상을 셀 때 서브도메인만 보면 놓친다** — `kind: 'piece'` 를 전부 세고
  `grep -L "scene: 'module:"` 로 교차 확인한다.

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

**그리고 자체 검증 세 항목을 돌린다.** 알고리즘 계열에서 담당들이 만들어 낸 것으로,
**dev 서버로만 알 수 있던 두 축을 조각 안에서 미리 잰다.** happy-dom 위에 임시 검사
파일을 두고(확인 뒤 지운다) 실제 `algorithm` 의 발신을 `reduce` 에 먹여 장면을 쌓은 뒤:

1. **걸음마다** ⑴ `animate:true` 로 흘려 세운 `innerHTML` 과 ⑵ `animate:false` 로 곧바로
   세운 `innerHTML` 이 **글자 하나 다르지 않은가.** — 운동이 남긴 속성·보간 끝자리를
   전부 잡는다.
2. **걸음을 뛰어다닌 뒤** 각 화면이 곧바로 세운 것과 같고, **끝으로 돌아온 화면이 처음
   완주 화면과 같은가.** 이웃 걸음(1→3→0→4→2)만이 아니라 **큰 널뛰기**(19→7→0→12→3→19)
   까지 잰다 — 되짚기가 가장 깨지기 쉬운 것은 멀리 뛸 때다.
3. **재생 도중 `destroy`** 하면 `render` 의 Promise 가 즉시 풀리는가. 끊기 **전에는**
   안 풀려 있는 것도 함께 확인해야 검사가 헛돌지 않는다.
이것을 붙인 뒤로 배치 감사에서 어긋남이 한 건도 안 나왔다. 앞서는 배치가 다 끝난 뒤에야
알던 것이다.

### 넷째 축을 만들려다 접었다 — 러너가 그 상황을 만들지 않는다

"운동이 도는 **한가운데서** 다른 걸음으로 뛰면 앞 세대가 새 화면을 덮지 않는가" 를 재는
축을 세워 `prune-branch` 의 세대 빗장 세 자리가 빠진 것을 잡아냈다. 그런데 **그 상황은
러너에서 일어나지 않는다.** 기록해 두지 않으면 다음 사람이 같은 길을 되밟는다.

- **띠는 자동 재생이 완주한 뒤에만 열린다.** `runner.ts` 의 `onComplete` 가 `timeline.seal()`
  뒤에 `setTimelineSeekable(timeline.complete)` 를 부른다. 재생 중에는 `seekable === false`
  라 `track` 에 `tabIndex` 가 없고, `control-bar.ts` 의 `onPointerDown`·`onKeyDown` 이 첫
  줄에서 `if (!seekable) return;` 로 막는다.
- **완주 뒤에도 러너가 직렬화한다.** `forwardOne` 도 `rewindTo` 도 `renderStep` 을
  `await` 한다 — 한 `render` 가 끝나기 전에 다음 `render` 를 부르지 않는다.

그러니 `render` 를 겹쳐 부른 것은 검사 코드뿐이었고, 잡힌 것은 **도달할 수 없는 자리**였다.

**세대 빗장이 실효를 갖는 경우는 하나 남는다 — 조각이 걸음 계약을 어길 때.** `render` 의
Promise 를 일찍 풀면(운동을 띄워 보내고 끝났다고 답하면) 러너의 `await` 가 무의미해져
실제로 겹친다. `scan-until-found` 의 `SETTLE_MS = 140` 이 그 경우였다 (4 절 "걸음 계약이
거짓일 수 있다"). **계약을 지키면 빗장은 방어일 뿐이고, 어기면 빗장이 있어도 화면이
어긋난다 — 고칠 것은 계약 쪽이다.**

그래도 빗장은 단다. 스물일곱 조각이 같은 모양을 갖는 값이 있고, `destroy` 가 운동 도중에
오는 길은 실제로 열려 있다.

**그리고 이 일에서 건진 규율이 하나 있다.**

> **검사를 넣을 때는 빠진 것을 일부러 만들어 잡히는지 보고, 되돌려서 통과하는지도 본다.
> 그리고 그 상황이 실제로 일어나는지를 러너에서 확인한다.**

앞의 둘만 보면 이빨 없는 검사와 거짓양성을 가르지만, 셋째를 빠뜨리면 **잡히기는 하는데
아무도 겪지 않을 일**을 쫓게 된다. 이 절이 그 사례다.

### 되짚기가 서는가 (핵심 판정)

```sh
pnpm --filter @ffacet/playground dev            # 포트를 적어 둔다
node scripts/scene-audit.mjs --port <포트> --only facet:<id>
```

**흔들림 0 · 왕복어긋남 0** 이어야 통과다.

- *흔들림* — 되짚은 뒤 화면이 나중에 저 혼자 바뀐다 (지연 발화가 덮어썼다)
- *왕복어긋남* — 되짚었다 끝으로 돌아왔을 때 처음 완주 화면과 다르다

어긋나면 `--diff` 를 붙여 어느 자리가 다른지 본다. **다만 `--diff` 가 자리를 남기는
것은 흔들림뿐이다** — 왕복어긋남은 견준 두 화면을 버리므로 자리를 보려면 그 기록을
`apps/playground/src/scrub-audit.ts` 에 잠깐 붙여야 한다. 붙일 때 `shotRaw` 는 해시를
돌려주니 `raw` 쪽을 견줘야 첫 갈리는 자리가 나온다.

**계측기를 먼저 의심한다.** 왕복 대기가 `700 + n*400` 이라는 고정값이었고, 걸음마다의
운동이 400ms 를 넘는 조각에서 구조적으로 모자랐다. `average-the-buckets` 는 여섯 걸음에
걸음당 640ms 라 마지막 운동이 `p ≈ 0.75` 에서 찍혀 **멀쩡한 조각이 왕복어긋남으로
잡혔다** (남은 속성이 `opacity="0.4333…"` 이라는 보간 중간값인 것이 단서였다). 지금은
화면이 두 번 연속 같을 때까지 기다리는 **정착 대기**로 고쳤다. 나중에 저 혼자 바뀌는
것은 축 1 이 따로 재므로 여기서 기다려도 축이 흐려지지 않는다.

어긋남이 나오면 **남은 값이 보간 중간값인지 먼저 본다.** 중간값이면 대개 계측이 이른
것이고, 끝값·상수면 조각이 거둘 것을 안 거둔 것이다.

**흔들림 축이 지연 발화를 겨눈 그 잣대다.** 되짚은 뒤 화면이 저 혼자 바뀌는지를 재고,
그것이 그랩 UI 를 검토할 때 세운 축이다. 조각 181 을 전수로 잰 것도 이 축이다.

감사에 "운동 도중 끊기" 축을 더하려다 접은 기록은 위 5 절의 자체 검증 절에 있다 —
러너가 그 상황을 만들지 않아 잴 값이 없었다.

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
# 옮긴 조각 — **커밋된 것만 센다**
git grep -l "scene: 'module:" HEAD -- 'facets/**/facet.ts' | sed 's|^HEAD:||' \
  | grep -Fx -f <(git grep -l "@piece" HEAD -- 'facets/**/facet.ts' | sed 's|^HEAD:||') | wc -l
# 어느 것이 남았나
grep -L "scene: 'module:" $(grep -rl "@piece" facets --include="facet.ts")
```

**워킹트리로 세면 틀린다.** 배치를 겹쳐 돌리면 다음 배치의 미커밋분이 섞여 앞선 수가
나온다. 실제로 두 번 걸렸고 한 번은 커밋을 amend 로 고쳤다 — 배치를 닫는 시점에는
형제 배치가 이미 `facet.ts` 를 고쳐 놓았기 때문이다.

2026-09-17 기준 **144 / 181**.

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
| 확률적 자료구조 여덟 | 2026-09-16 | `several-hashes-one-value` · `wrong-in-one-direction` · `cannot-unset` · `trust-the-smallest` · `space-error-tradeoff` · `leading-zeros-tell` · `average-the-buckets` · `crowd-the-tails` |
| 알고리즘 · 정렬의 기본 동작 다섯 | 2026-09-16 | `compare-and-swap` · `bubble-adjacent-swap` · `select-min-each-pass` · `insert-into-sorted-part` · `gap-shrink` |
| 알고리즘 · 나누고 합치기 다섯 | 2026-09-16 | `split-until-one` · `merge-two-sorted` · `divide-conquer-combine` · `partition-around-pivot` · `pivot-choice-matters` |
| 알고리즘 · 정렬의 성질과 비교 없는 정렬 다섯 | 2026-09-16 | `sort-stability` · `in-place-vs-extra` · `count-then-place` · `digit-by-digit` · `heap-sort-extract` |
| 알고리즘 · 탐색 넷 | 2026-09-16 | `scan-until-found` · `requires-sorted` · `halve-the-range` · `guess-by-value` |
| 알고리즘 · 동적 계획법과 그리디 다섯 | 2026-09-16 | `overlapping-subproblems` · `memo-write-once` · `bottom-up-table` · `greedy-can-fail` · `take-best-now` |
| 알고리즘 · 백트래킹 셋 | 2026-09-16 | `try-and-undo` · `prune-branch` · `bound-and-cut` |
| 그래프 · 기본 다섯 | 2026-09-16 | `one-way-edge` · `fewer-hops-not-shorter` · `dive-then-backtrack` · `mark-visited-or-loop` · `two-color-conflict` |
| 그래프 · 최단경로 다섯 | 2026-09-16 | `relax-shorter-path` · `pick-nearest-unsettled` · `negative-edge-breaks` · `repeat-relax-all` · `one-more-round-drops` |
| 그래프 · MST 와 위상 다섯 | 2026-09-16 | `heuristic-guides` · `grow-one-tree` · `sort-edges-avoid-cycle` · `indegree-zero-first` · `cycle-blocks-order` |
| 그래프 · SCC 와 최대 유량 셋 | 2026-09-16 | `mutually-reachable` · `bottleneck-sets-flow` · `undo-by-back-edge` |
| 문자열 · 탐색 다섯 | 2026-09-16 | `naive-shift-by-one` · `prefix-suffix-jump` · `match-from-back` · `bad-char-skip` · `rolling-hash` |
| 문자열 · 접미사와 아호코라식 넷 | 2026-09-16 | `all-suffixes-sorted` · `match-length-per-spot` · `many-patterns-one-pass` · `fail-link` |
| 편집 거리 둘 + 수치 셋 | 2026-09-16 | `edit-table-fill` · `three-edit-choices` · `square-and-halve` · `divisor-pairs-sqrt` · `row-times-column` |
| 계산 복잡도 다섯 | 2026-09-16 | `growth-outpaces` · `constant-fades` · `curves-cross` · `verify-vs-find` · `reduce-to-known` |
| 컴퓨터 구조 · 수와 진법 다섯 | 2026-09-17 | `positional-value` · `negate-and-add-one` · `signed-wraparound` · `silent-truncation` · `byte-order` |
| 컴퓨터 구조 · 부동소수 셋 + 비트 둘 | 2026-09-17 | `mantissa-and-exponent` · `unrepresentable-fraction` · `uneven-float-gaps` · `bit-mask` · `bit-shift` |
| 컴퓨터 구조 · 캐시 줄과 지역성 다섯 | 2026-09-17 | `line-fill` · `temporal-locality` · `spatial-locality` · `latency-ladder` · `index-and-tag` |
| 컴퓨터 구조 · 캐시 충돌과 쓰기 넷 | 2026-09-17 | `conflict-miss` · `associativity-relief` · `write-back-vs-through` · `false-sharing` |

**자료 구조 42 · 확률적 자료구조 10 · 알고리즘 27 이 닫혔다.** 확률적 열 중 스킵
리스트 둘(`skip-a-layer` · `coin-flip-height`)은 자료 구조 배치에 섞여 이미 옮겨져
있었다. 배치마다 병렬 에이전트 셋~아홉.

**`cs-fundamentals` 가 닫혔다 — 조각 117 개 전부 Scene 이고 projector 는 0 건이다.**
서브도메인 일곱이 모두 끝났다: 자료구조 40 · 확률적 자료구조 10 · 알고리즘 27 ·
그래프 21 · 문자열 11 · 수치 3 · 복잡도 5.

마지막 하나(`adjacency-list-vs-matrix`)는 카탈로그상 `data-structures` 인데
`origin: graph` 라 양쪽 배치에서 빠져 있었다 — **대상을 서브도메인으로만 세면
놓친다.**

**`computer-architecture` 도 닫혔다 — 구현된 조각 19 개 전부 Scene 이다**
(수와 비트 표현 10 · 캐시 계층 9). 다만 **카탈로그에는 39 개가 선언돼 있고 facet 이
있는 것은 19 개다** — 파이프라인 8 · 분기 예측 6 · 데이터 배치 6 은 항목만 있고 구현이
없다. 그 스물은 이행이 아니라 **새로 만들 일**이고 `tasks/piece-batch-protocol.md` 의
몫이다.

남은 37 은 다른 도메인이다 — `ml-basics` 23 · `security` 8 · `ai-engineering` 6.

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
확률적 여덟        8773 → 12449  +3676  +41%
알고리즘 스물일곱  29578 → 40117 +10539  +35%
그래프 기본 다섯    5979 → 7804   +1825  +31%
최단경로 다섯       6768 → 9003   +2235  +33%
MST 와 위상 다섯    6434 → 8339   +1905  +30%
SCC·최대유량 셋     4484 → 5580   +1096  +24%
문자열 탐색 다섯    5463 → 7806   +2343  +43%
접미사·아호 넷      5067 → 6805   +1738  +34%
편집거리 2+수치 3   5326 → 7570   +2244  +42%
계산 복잡도 다섯    6371 → 8491   +2120  +33%
수와 진법 다섯      5214 → 7110   +1896  +36%
부동소수 3+비트 2   5575 → 7669   +2094  +38%
캐시 줄과 지역성 5  5340 → 6996   +1656  +31%
캐시 충돌과 쓰기 4  5208 → 7356   +2148  +41%
                                 ─────
                 백열여섯 조각 평균 +342 줄 (+34%)

**이 여덟 배치(37 조각)의 `algorithm.ts` 는 7615 → 7362 (−253)** 이다. 앞 계열들보다
덜 줄었는데, **B 갈래로 내준 순수 함수와 판단 근거 주석이 그만큼 들어왔기** 때문이다.
`divisor-pairs-sqrt` 는 발신 다섯이 전부 비었는데도 `readN`·`sqrtLimit` 를 내주며
110 → 135 로 늘었다. **줄이 아니라 무엇이 남았는가로 읽는다** — `edit-table-fill` 은
139 → 211 이 되었지만 그 몫이 `editTableDiagonal`·`editLetterMatch`·`editStepCost`
셋이고, 그 덕에 `i`·`j`·`cost` 가 payload 에서 사라졌다.

늘어나는 것은 `scene.ts` 와 stage 이고 **`algorithm.ts` 는 대개 줄어든다.** 확률적
여덟에서 1269 → 1201 (−68), 알고리즘 스물일곱에서 **5108 → 4795 (−313)** 이었다. payload 를 걷어내면 그것을 만들던
셈이 연쇄로 죽기 때문이다 — 가장 많이 준 `crowd-the-tails`(−37) 는 발신 넷의 payload
가 전부 비면서 `quantileAt` · `evenBounds` · `bucketOf` · `countsIn` · `centroidsIn`
다섯 함수가 통째로 죽었다.

**늘어나는 경우가 둘 있다.** 주석이 두꺼워진 몫(+2 ~ +11)이 하나고, 나머지 하나는
위의 B 갈래를 고를 때다 — `space-error-tradeoff` 는 `widthsOf` · `slotsFor` ·
`countsFor` 를 내주어 오히려 +23 이 되었고 그 대신 `pass()` 가 `gate` 와 `emit` 만
남은 **박자 함수**가 됐다. 줄이 아니라 **무엇이 남았는가**로 읽어야 한다.

어느 쪽이든 **보고를 믿지 말고 `git diff -- .../algorithm.ts` 를 본다.**

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
