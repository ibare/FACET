/**
 * gapShrink 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 값 칸 한 줄이 있고 **칸은 자리, 숫자는 값**이다. 멀리 견줄 때 숫자가 여러 칸을
 * 한 번에 건너뛰는 것이 이 조각의 동사다. 칸 아래에는 보폭 자가 지금 견주는 두
 * 끝을 재고 있고, 라운드가 바뀌면 그 폭이 좁아진다. 맨 아래 장부 두 줄이 보폭을
 * 줄여 온 쪽과 처음부터 옆칸만 견준 쪽의 견줌·이동 횟수를 나란히 들고 있는다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 stage 에는 `let` 이 셋뿐이었고(`destroyed` · `spanLeft` · `spanRight`)
 * 상태는 전부 `const` 배열과 `textContent` 에 있었다.
 *
 * - **`const occupant: SVGTextElement[]`** — **어느 칸에 어느 값이 앉아 있나**.
 *   이 조각의 축인 배열 순열이 여기에만 있었다. `const` 라 `let` grep 을 통과하고
 *   (프로토콜 3-1 의 ⑤), `showSwap` 이 `occupant[left] = goingLeft` 로 제자리에서
 *   고쳤다. 게다가 **수 자체는 `glyph.textContent` 에만** 있어 화면을 도로 읽지
 *   않고는 알 수 없었다. 이제 `values` 가 말한다.
 * - **`const slotState: SlotState[]`** — 칸의 형편. 역시 `const` 배열인데
 *   `paintSlot` 이 제자리에서 고쳤고, `clearMarks` 가 `slotState[i] !== 'sorted'`
 *   라는 **조회로 갈리는 암묵 분기**(③)까지 두고 있었다. `SlotState` 는 타입
 *   선언이 있었지만 저장되는 곳이 그 배열 하나였다.
 * - **`let spanLeft` · `let spanRight`** — 보폭 자의 지금 좌표. `moveBracket` 이
 *   이것을 **출발값으로 되읽었다**. 되감아 세운 직후에는 옛 화면의 값이라 자가
 *   엉뚱한 데서 출발한다. 이제 `span` 이 자리 번호로 말하고, 출발 자리는 `step`
 *   이 실어 온다 (S-scene — `prev` 는 고르는 데만).
 * - **`strideLabel.textContent`** — **지금 보폭이 몇 칸인가**. `let gap` 이 아니라
 *   `beginRound(round, gap)` 의 인자로 왔다 문자열에만 남았다. 이제 라운드 차례에서
 *   파생된다 (`strideOf`).
 * - **장부 넉 줄의 `textContent` 와 `shrinkPips`/`nearPips` 의 자식 수** — 견줌·이동
 *   횟수와 "대조군이 아직 안 드러났다"(`NOT_YET`)가 전부 DOM 에만 쌓였다. 이제
 *   `comparisons` · `moves` · `baseline` 이 말한다.
 * - **`bracket` 의 `opacity`** — 자가 떠 있나. `span` 의 유무가 대신한다.
 *
 * ── 화면에 나란히 뜨는 수는 한 자로 잰다
 *
 * 걸음이 실어 오던 `comparisons` · `moves` · `round` · `gap` · `baseComparisons` ·
 * `baseMoves` 를 전부 걷어냈다. 견줌 수는 `stride-compare` 발신 수, 이동 수는
 * `stride-swap` 발신 수이므로 **장면이 센다**. 라운드 차례도 `round-begin` 이 오는
 * 순서가 이미 말한다 (싣지 않는다).
 *
 * 대조군만은 구조에서 셀 수 없다 — 일어나지 않은 주행이다. 그것은 **바탕 자료에
 * 순수 함수를 먹이면 나오는 값**이라 algorithm 이 내주는 `countGapRun` 을 장면이
 * 부른다. payload 로 받으면 다음 사람이 집어 쓸 문이 열린 채로 남는다.
 *
 * 좌표는 담지 않는다. 칸 번호가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import { toIndexArray, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

import { countGapRun } from './algorithm.js';

/** 보폭 자가 걸친 두 자리. 좌표가 아니라 칸 번호다 (S-piece). */
export type GapShrinkSpan = {
  readonly left: number;
  readonly right: number;
};

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 그림**도
 * 여기서 셈한다.
 *
 * 정적 그리기가 정본이라 자도 값도 이미 끝 자리에 서 있다. 흐르게 하려면 출발
 * 자리를 알아야 하는데, 그것을 `prev` 에서 꺼내면 S-scene 위반이다. 그래서 자가
 * 어디서 왔는지(`from`)를 걸음이 실어 온다. 맞바꿈은 두 값이 서로의 자리로 가는
 * 것이라 자리 번호 둘로 출발 그림이 온전히 셈해진다.
 */
export type GapShrinkStep =
  | { kind: 'round'; from: GapShrinkSpan | null; to: GapShrinkSpan }
  | { kind: 'compare'; from: GapShrinkSpan | null; to: GapShrinkSpan }
  | { kind: 'swap'; left: number; right: number }
  | { kind: 'baseline' }
  | { kind: 'done'; from: GapShrinkSpan | null };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type GapShrinkCaption =
  | { kind: 'roundFar'; round: number; gap: number }
  | { kind: 'roundNear'; round: number }
  | { kind: 'baseline' }
  | { kind: 'result'; moves: number; baseMoves: number };

export type GapShrinkScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /**
   * 처음 늘어선 값. 칸 수와 대조군이 여기서 나온다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly origin: readonly number[];
  /** 라운드마다 쓸 간격. 차례가 곧 라운드 번호이고, 길이가 색판의 크기를 정한다. */
  readonly gaps: readonly number[];

  // ── 걸어온 자취.
  /** 지금 각 칸에 앉은 값. `origin` 의 순열이다. */
  readonly values: readonly number[];
  /** 지금 열려 있는 라운드의 차례(0부터). 아직 안 열렸으면 `null`. */
  readonly round: number | null;
  /** 지금까지의 견줌 횟수 — `stride-compare` 발신 수다. */
  readonly comparisons: number;
  /** 이동마다 그때의 라운드 차례. **길이가 곧 이동 횟수**라 수가 한 자리에만 있다. */
  readonly moves: readonly number[];
  /** 보폭 자가 걸친 두 자리. 없으면 자를 그리지 않는다. */
  readonly span: GapShrinkSpan | null;
  /** 지금 견주고 있는 짝. **테두리**로 그린다 — 견줌의 표식이다. */
  readonly compared: GapShrinkSpan | null;
  /** 방금 맞바꾼 짝. 그 걸음 내내 남아 "이 둘을 바꿨다" 를 화면에 세워 둔다. */
  readonly swapped: GapShrinkSpan | null;
  /** 대조군 장부. `null` 이면 아직 안 드러났다. */
  readonly baseline: { readonly comparisons: number; readonly moves: number } | null;
  /** 다 끝났다 — 줄이 굳고 자가 걷힌다. **채움**이 여기서 갈린다. */
  readonly finished: boolean;
  readonly step: GapShrinkStep | null;
  readonly caption: GapShrinkCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `values` · `round` · `comparisons` · `moves` 를 여기 넣지 않는다. 전부 걸어오며
 * 쌓은 자취라, 바탕으로 묶어 되감기에 넘기면 되감은 줄이 이미 다 정렬된 채로 서고
 * 그 위에 algorithm 이 처음부터 다시 밟는다 — 화면 안에서 두 배치가 어긋난다.
 * 타입으로 좁혀 두어 구조적으로 못 넘어가게 한다.
 */
type GapShrinkBase = Pick<GapShrinkScene, 'origin' | 'gaps'>;

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function numbersOf(raw: unknown): number[] {
  return Array.isArray(raw)
    ? raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [];
}

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: GapShrinkBase): GapShrinkScene {
  return {
    origin: base.origin,
    gaps: base.gaps,
    values: [...base.origin],
    round: null,
    comparisons: 0,
    moves: [],
    span: null,
    compared: null,
    swapped: null,
    baseline: null,
    finished: false,
    step: null,
    caption: null,
  };
}

/**
 * 지금 라운드의 보폭.
 *
 * 간격은 라운드 차례에서 파생된다 — `gaps` 는 선언이 정하는 바탕이고 차례는
 * 발신이 오는 순서가 말한다. 화면에 뜨는 간격(자의 폭 · 보폭 라벨 · 캡션)은 전부
 * 이 함수를 지난다. 두 자리에서 셈하면 언젠가 갈린다.
 */
export function strideOf(scene: GapShrinkScene): number | null {
  if (scene.round === null) return null;
  const gap = scene.gaps[scene.round];
  return typeof gap === 'number' ? gap : null;
}

export const gapShrinkScene: ScenePlan<GapShrinkScene> = {
  /**
   * 첫 장면은 처음 늘어선 줄이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이고 algorithm 이 `values[i] = …` 로 제자리에서 고친다. 참조를 쥐면 되짚을 때
   * 이미 다 정렬된 자료로 바탕을 그린다 (S-scene). 아래 `filter` 가 새 배열을 만든다.
   */
  initial(initialData: unknown): GapShrinkScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    return atStart({ origin: numbersOf(raw.values), gaps: numbersOf(raw.gaps) });
  },

  reduce(scene: GapShrinkScene, event: FacetRuntimeEvent): GapShrinkScene {
    switch (event.type) {
      // 라운드가 열린다. 차례는 발신이 오는 순서가 말하므로 싣지 않는다.
      case 'round-begin': {
        const round = scene.round === null ? 0 : scene.round + 1;
        const gap = scene.gaps[round];
        if (typeof gap !== 'number') return scene;
        // 자를 어디까지 벌릴지는 여기서 한 번만 좁힌다 — 그리는 쪽이 다시 자르면
        // 잣대가 둘이 된다.
        const to: GapShrinkSpan = {
          left: 0,
          right: Math.min(gap, Math.max(0, scene.origin.length - 1)),
        };
        return {
          ...scene,
          round,
          span: to,
          compared: null,
          swapped: null,
          step: { kind: 'round', from: scene.span, to },
          caption:
            gap > 1
              ? { kind: 'roundFar', round: round + 1, gap }
              : { kind: 'roundNear', round: round + 1 },
        };
      }

      // 짝 하나를 견준다. 자가 그 짝으로 미끄러지고 두 칸에 견줌의 테가 선다.
      // 견줌 횟수는 이 발신을 세어 얻는다 — 걸음이 실어 오지 않는다.
      // target 파싱은 `toIndexArray` 를 경유한다 (원칙 4).
      case 'stride-compare': {
        const pair = toIndexArray(event.target);
        const left = pair[0];
        const right = pair[1];
        if (typeof left !== 'number' || typeof right !== 'number') return scene;
        const to: GapShrinkSpan = { left, right };
        return {
          ...scene,
          comparisons: scene.comparisons + 1,
          span: to,
          compared: to,
          swapped: null,
          step: { kind: 'compare', from: scene.span, to },
        };
      }

      // 어긋난 짝을 맞바꾼다 — 값 둘이 서로의 자리로 건너뛴다.
      case 'stride-swap': {
        const pair = toIndexArray(event.target);
        const left = pair[0];
        const right = pair[1];
        if (typeof left !== 'number' || typeof right !== 'number' || left === right) return scene;
        if (scene.round === null) return scene;
        const a = scene.values[left];
        const b = scene.values[right];
        if (typeof a !== 'number' || typeof b !== 'number') return scene;
        const values = scene.values.slice();
        values[left] = b;
        values[right] = a;
        return {
          ...scene,
          values,
          // 이동의 라운드를 함께 적어 둔다. 장부의 점이 그 라운드 색으로 남아,
          // 다 끝난 화면에서도 "어느 보폭에서 몇 번 옮겼나" 가 읽힌다.
          moves: [...scene.moves, scene.round],
          compared: null,
          swapped: { left, right },
          step: { kind: 'swap', left, right },
        };
      }

      // 대조군이 드러난다. 일어나지 않은 주행이라 구조에서 셀 수 없고, 바탕 자료에
      // 순수 함수를 먹여 얻는다 — algorithm 이 내준 `countGapRun` 을 여기서 부른다.
      case 'baseline-reveal': {
        const tally = countGapRun(scene.origin, [1]);
        return {
          ...scene,
          compared: null,
          swapped: null,
          baseline: { comparisons: tally.comparisons, moves: tally.moves },
          step: { kind: 'baseline' },
          caption: { kind: 'baseline' },
        };
      }

      // 다 끝났다. 자를 거두고 줄을 굳힌다.
      case 'done': {
        const base = scene.baseline;
        return {
          ...scene,
          span: null,
          compared: null,
          swapped: null,
          finished: true,
          step: { kind: 'done', from: scene.span },
          caption: {
            kind: 'result',
            moves: scene.moves.length,
            baseMoves: base === null ? 0 : base.moves,
          },
        };
      }

      case 'rewind':
        // 바탕만 넘긴다. 객체 리터럴로 넘겨야 초과 속성 검사가 돌아 자취가 섞여
        // 들어가는 것을 타입이 막는다.
        return atStart({ origin: scene.origin, gaps: scene.gaps });

      default:
        // 이 facet 의 algorithm 은 위 여섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
