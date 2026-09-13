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

### 3-1. 이벤트와 화면을 나란히 놓는다

```sh
d=facets/<domain>/<name>
grep -oE "type: '[a-z-]+'" $d/src/algorithm.ts | sort -u   # 걸음의 어휘
sed -n '/^    return {$/,/^    };$/p' $d/src/*-stage.ts     # stage 가 내놓는 메서드
cat $d/src/projector.ts                                     # 그 사이의 번역
```

**projector 안의 `let` 을 특히 본다.** 거기 있는 것이 곧 숨은 상태이고, 되짚기가
어긋나던 자리다. `bst-degenerate` 는 `growingShown` · `searchingShown` · `results` 를
쥐고 있었고 그것이 축 1 실패의 정체였다.

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

2026-09-13 기준 **3 / 181**.

```
security/hash-avalanche        ai-engineering/split-and-number
cs-fundamentals/bst-degenerate
```

### 순서에 대한 권고

- **한 도메인씩 묶어서** 옮긴다. 같은 도메인의 조각은 그리는 결이 비슷해 장면 설계가
  이어진다.
- **묶음마다 커밋**하고 그 커밋에 감사 결과를 적는다. 되돌릴 자리가 분명해진다.
- 두 방식이 **공존한다.** facet 이 `projector` 또는 `scene` 중 하나를 선언하고 러너가
  갈라 받는다. 한 번에 다 옮기지 않아도 검사가 통과한다.

### 규모 (실측)

```
hash-avalanche    520 → 486   (-34)
bst-degenerate    461 → 511   (+50)
split-and-number  945 → 1101  (+156)
```

평균 +57 줄 (+8%). 늘어난 쪽은 걸음 함수를 그대로 두고 정적으로 그리는 길을 덧댄
탓이다. 걸음 함수를 장면에서 바로 그리도록 합치면 줄어든다 — `hash-avalanche` 를
그렇게 했더니 줄었다. 다만 그것은 재작성 분량을 키우므로, 급하지 않으면 덧대는
쪽으로 간다.

파일당 1~2 시간.

---

## 7. 이행이 끝난 뒤

- `ProjectorFactory` 와 그 배선을 러너에서 걷어낸다.
- `rules/principles.md` 의 "Projector 단일 번역기" 를 장면 방식으로 다시 쓴다.
- `S-facet` 의 6 파일 구성에서 `projector.ts` 를 `scene.ts` 로 바꾼다.
- 스크럽 띠를 전 조각에 단다 (`CONTROL_SET.piece` → `pieceScrub`). 그때 조각
  algorithm 의 손짚기 루프(`waitForInput` → `rewind`)가 죽은 코드가 되므로 함께
  걷어낸다 — 179 곳이고, 자취를 닫는 신호가 `enterAwaiting` 에서 `runAlgorithm` 끝으로
  옮겨 가므로 조각 하나로 먼저 확인한다.
