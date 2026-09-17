/**
 * SquashToProbability 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 의 `let` 이 0 건, 조회로 갈리는 분기도 0 건, DOM 되읽기도 0 건이었다.
 * 숨은 상태가 없다는 뜻이 아니라 **화면이 통째로 상태**였다는 뜻이고, 실제로 stage
 * 의 선언과 SVG 속성에 흩어져 있었다 (프로토콜 3-1 의 ⑤ 자리).
 *
 * - `let zSpan` — **축의 척도.** `xTop(z) = AXIS_C + (z / zSpan) * AXIS_REACH` 이라
 *   화면의 모든 가로 좌표가 이 하나에서 나왔다. 걸음이 실어 온 점수 목록을 stage 가
 *   제 변수에 옮겨 담고 그 뒤로 계속 쓰는 짜임이라, 척도를 정하는 자리와 쓰는 자리가
 *   갈라져 있었다. 지금은 바탕의 `scores` 하나에서 그리는 쪽이 매번 셈한다.
 * - `let scores` — 위와 같은 자리. 바탕 자료를 stage 가 따로 쥐고 있었다.
 * - `const chutes = new Map<number, Chute>()` — **DOM 좌표와 "누가 내려앉았나" 가 한
 *   객체.** `Chute = { x0, x1 }` 은 픽셀인데, 그 맵에 자리가 있느냐가 곧 그 점수가
 *   이미 띠로 내려앉았느냐였다. `chutes.get(step.fromIndex)` 하나가 리본을 칠지 말지를
 *   갈랐다 — `const` 라 `let` grep 을 통과하고, stage 안이라 projector 의 조회 분기
 *   grep 에도 안 걸린다. 지금은 `landed` 목록이 말하고 좌표는 그리는 쪽이 셈한다.
 * - `const valueLabels = new Map<number, SVGTextElement>()` 의 **`fill`** — 양 끝
 *   두 값이 자투리의 안쪽 끝이라는 표식. `pressTails` 가 물들이고 되돌리는 명령이
 *   없어 **쌓이던** 자리다. 지금은 `tails` 하나에서 파생된다.
 * - `walls` 의 `y1`·`y2` — **꼬리가 눌렸나.** 벽이 위아래로 6 만큼 자란 것이 유일한
 *   보관처였다. 좌표가 아니라 *어느 국면인가*를 화면이 혼자 알고 있었다.
 * - `segRect` 의 `x`·`width` 와 `segSpan` — 마지막으로 얻은 폭. `ensureSeg` 가 **한
 *   요소를 계속 옮겨 쓰는** 짜임이라 앞 걸음의 폭이 제자리에서 덮였다.
 * - `dot` 의 `r`(4 / 3) 과 `fill` — 지금 내려앉는 중인가 이미 앉았나. 한 요소의 두
 *   속성에 국면이 실렸다.
 * - `gChute` · `gRibbon` · `gTail` 의 **자식 수** — 몇이 내려앉았고 꼬리가 들어찼나.
 *   어떤 변수도 그것을 말하지 않았고 `clearGroups()` 가 유일한 되돌림이었다.
 *
 * 여기서는 그 전부가 `axis` · `band` · `landed` · `tails` · `settled` 다섯으로 줄었다.
 *
 * ── 화면에 나란히 뜨는 수는 한 출처에서만 나온다
 *
 * 옛 발신은 `index` · `z` · `fromIndex` · `fromZ` · `fromP` · `axisGap` · `bandGap` 을
 * 전부 실어 보냈다. 캡션이 말하는 두 수와 깔때기의 모양이 다른 출처가 되는 자리다.
 *
 * - **밟는 차례와 점수 목록은 `algorithm.ts` 가 내준 함수를 부른다** —
 *   `squashScoresOf`(좁히개) 와 `squashOrder`(자르는 잣대). 프로토콜 4 절의 B 갈래이고,
 *   장면이 `algorithm.ts` 를 import 하는 방향은 원칙 1 이 허용한다. 두 함수만 떼어
 *   내도 "끝없는 축이 띠로 접혀 든다" 는 주장이 그대로 남으므로 내줄 수 있다.
 * - **σ(z) 는 내주지 않는다.** 그것이 이 조각의 알고리즘 그 자체라 (화면에 식이
 *   그대로 새겨져 있다) 장면이 대신 풀면 발신이 장식이 된다. 그래서 `score-squashed`
 *   는 **내려앉은 자리 `p` 하나만** 싣는다 (프로토콜 4 절의 셋째 줄 — 걸음이 내리는
 *   판정은 싣는다).
 * - **나머지는 전부 걷어냈다.** 몇 번째 자리인지는 `landed.length` 가 세고, 이웃과
 *   벌린 거리는 이미 내려앉은 것들에서 나온다. 꼬리의 두 값(`lowP` · `highP`)도
 *   그때는 이미 양 끝이 내려앉은 뒤라 자취가 쥐고 있다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다 — 축의 자리도 띠의 자리도 캔버스에서 역산하는 값이라 그리는
 * 쪽의 몫이다 (S-piece). 척도(`zSpan`)도 담지 않는다. 담는 것은 **값의 범위를 정하는
 * 점수 목록**이고 픽셀로 옮기는 일은 `render` 가 한다.
 *
 * 문안도 담지 않는다. `captionFor` 가 무엇을 말할지와 그 인자만 내고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { squashOrder, squashScoresOf } from './algorithm.js';

/** 띠로 내려앉은 점수 하나. `index` 는 오름차순 점수 목록에서의 자리다. */
export type LandedScore = {
  index: number;
  /** σ(z). 이 조각의 알고리즘이 낸 값이라 걸음이 싣는 유일한 수다. */
  p: number;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 내려앉는 점의 출발 자리는 `scores[index]` 가, 꼬리의 안쪽
 * 끝은 자취가 이미 말한다. `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type SquashStep =
  /** 점수 축이 한가운데에서 양쪽 끝까지 뻗는다. */
  | { kind: 'axis' }
  /** 확률의 띠가 두 벽 사이에 선다. */
  | { kind: 'band' }
  /** 점수 하나가 축을 떠나 띠로 내려앉는다. */
  | { kind: 'squash' }
  /** 축의 나머지가 양 끝 자투리로 눌려 든다. */
  | { kind: 'tails' }
  /** 마지막으로 얻은 폭의 강조를 거둔다. */
  | { kind: 'settle' };

/** 캡션이 말할 것과 그 인자. 문자는 그리는 쪽이 만든다 (C10). */
export type SquashCaption =
  /** 축은 양쪽으로 끝이 없다. */
  | { kind: 'axis' }
  /** 확률이 앉을 자리는 두 벽 사이뿐이다. */
  | { kind: 'band' }
  /** 한가운데는 한가운데로 — 견줄 이웃이 아직 없는 첫 걸음. */
  | { kind: 'center'; p: number }
  /** 축에서 벌린 거리와 띠에서 얻은 폭. */
  | { kind: 'squash'; z: number; p: number; axisGap: number; bandGap: number }
  /** 나머지 전부가 자투리로 눌려도 벽에는 닿지 못한다. */
  | { kind: 'tails'; lowP: number; highP: number };

export type SquashToProbabilityScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /**
   * 눌러 담을 점수, 오름차순.
   *
   * **이 장면의 척도가 여기서 나온다** — 축이 보여 주는 범위도, 값 라벨이 나눠 앉는
   * 칸도 전부 이 목록 **전체**에서 정해진다. 내려앉은 것만으로 다시 잡으면 점이
   * 하나 앉을 때마다 앞의 눈금이 자리를 옮긴다.
   */
  scores: readonly number[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 축이 뻗었나. 그 전에는 빈 화면이다. */
  axis: boolean;
  /** 띠가 두 벽 사이에 섰나. */
  band: boolean;
  /** 내려앉은 점수들, 내려앉은 차례대로. 차례가 곧 몇 번째 걸음인가다. */
  landed: readonly LandedScore[];
  /** 축의 나머지가 양 끝 자투리로 눌려 들었나. 벽이 그만큼 더 버틴다. */
  tails: boolean;
  /** 마지막으로 얻은 폭의 강조를 거두었나. */
  settled: boolean;

  step: SquashStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `axis` 아래 다섯은 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 다
 * 내려앉은 점과 눌린 꼬리를 단 채로 서고 그 위에 algorithm 이 처음부터 다시 밟는
 * 것이 겹친다 (S-scene).
 */
type Base = Pick<SquashToProbabilityScene, 'scores'>;

/**
 * 아직 축도 서지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): SquashToProbabilityScene {
  return {
    scores: base.scores,
    axis: false,
    band: false,
    landed: [],
    tails: false,
    settled: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function fields(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

// ── 장면에서 셈해지는 것들 ────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 깔때기도 캡션도 자투리도 같은 함수를 부르므로
// 갈릴 자리가 없다.

/** 다음에 내려앉을 자리. 다 앉았으면 null. 밟는 차례는 algorithm 이 내준 하나다. */
export function nextLandingIndex(scene: SquashToProbabilityScene): number | null {
  return squashOrder(scene.scores)[scene.landed.length] ?? null;
}

/** 그 자리가 이미 내려앉았다면 그때 얻은 확률. 아니면 null. */
export function probabilityAt(
  scene: SquashToProbabilityScene,
  index: number,
): number | null {
  for (const one of scene.landed) if (one.index === index) return one.p;
  return null;
}

/**
 * 견줄 이웃의 자리. 이미 내려앉은 것 중에서 고른다.
 *
 * 가운데에서 바깥으로 밟으므로 안쪽 이웃이 먼저 있다. 데이터에 0 이 없어 양쪽 첫
 * 걸음이 갈리는 경우를 위해 바깥쪽도 본다. **옛 algorithm 의 `landedNeighbour` 가
 * 여기로 왔다** — 걸음이 `fromIndex` 를 싣지 않게 되면서 그 셈을 쓰는 곳이 화면
 * 하나뿐이 되었기 때문이다.
 */
function neighbourIndex(index: number, z: number, before: readonly LandedScore[]): number | null {
  const inner = z < 0 ? index + 1 : index - 1;
  const outer = z < 0 ? index - 1 : index + 1;
  const has = (at: number): boolean => before.some((one) => one.index === at);
  if (has(inner)) return inner;
  if (has(outer)) return outer;
  return null;
}

/** 한 자리에서 읽히는 것 전부. 깔때기도 리본도 캡션도 이 한 함수를 지난다. */
export type Reading = {
  index: number;
  z: number;
  p: number;
  /** 견준 이웃. 한가운데 첫 걸음에는 없다. */
  from: { index: number; z: number; p: number } | null;
  /** 축에서 벌린 거리. 견줄 이웃이 없으면 null. */
  axisGap: number | null;
  /** 띠에서 얻은 폭. 견줄 이웃이 없으면 null. */
  bandGap: number | null;
};

/** `k` 번째로 내려앉은 것의 읽기. 범위 밖이면 null. */
export function readingAt(scene: SquashToProbabilityScene, k: number): Reading | null {
  const at = scene.landed[k];
  if (at === undefined) return null;
  const z = scene.scores[at.index];
  if (z === undefined) return null;
  const fromIndex = neighbourIndex(at.index, z, scene.landed.slice(0, k));
  const fromZ = fromIndex === null ? undefined : scene.scores[fromIndex];
  const fromP = fromIndex === null ? null : probabilityAt(scene, fromIndex);
  if (fromIndex === null || fromZ === undefined || fromP === null) {
    return { index: at.index, z, p: at.p, from: null, axisGap: null, bandGap: null };
  }
  return {
    index: at.index,
    z,
    p: at.p,
    from: { index: fromIndex, z: fromZ, p: fromP },
    axisGap: Math.abs(z - fromZ),
    bandGap: Math.abs(at.p - fromP),
  };
}

/** 내려앉은 것들의 읽기, 내려앉은 차례대로. 정적 그리기가 이 목록으로 화면을 세운다. */
export function readings(scene: SquashToProbabilityScene): Reading[] {
  const out: Reading[] = [];
  for (let k = 0; k < scene.landed.length; k += 1) {
    const one = readingAt(scene, k);
    if (one !== null) out.push(one);
  }
  return out;
}

/** 방금 내려앉은 것의 읽기. 아직 하나도 안 앉았으면 null. */
export function lastReading(scene: SquashToProbabilityScene): Reading | null {
  return readingAt(scene, scene.landed.length - 1);
}

/**
 * 양 끝 자투리의 안쪽 끝.
 *
 * 걸음이 실어 오지 않는다 — 꼬리가 눌릴 때는 이미 양 끝 점수가 내려앉은 뒤라 자취가
 * 그 두 값을 쥐고 있다. 자투리 면이 닿는 자리와 값 라벨의 수가 같은 출처다.
 */
export function tailValues(
  scene: SquashToProbabilityScene,
): { lowP: number; highP: number } | null {
  const n = scene.scores.length;
  if (n === 0) return null;
  const lowP = probabilityAt(scene, 0);
  const highP = probabilityAt(scene, n - 1);
  return lowP === null || highP === null ? null : { lowP, highP };
}

/** 띠 위에서 두 확률 사이. `from` 에서 `to` 로 얻은 폭이다. */
export type GainedSpan = { fromP: number; toP: number };

/**
 * 마지막으로 얻은 폭. 견줄 이웃이 없었으면 null.
 *
 * `settled` 를 보지 않는다 — 거두는 운동이 출발 그림으로 이것을 쓴다. 정적 그리기가
 * 쓰는 것은 아래 `shownSpan` 이다.
 */
export function gainedSpan(scene: SquashToProbabilityScene): GainedSpan | null {
  const last = lastReading(scene);
  return last === null || last.from === null ? null : { fromP: last.from.p, toP: last.p };
}

/** 지금 화면에 선 폭 강조. 거둔 뒤에는 없다. */
export function shownSpan(scene: SquashToProbabilityScene): GainedSpan | null {
  return scene.settled ? null : gainedSpan(scene);
}

/**
 * 지금 화면이 할 말. 아직 아무 말도 없으면 null.
 *
 * `step` 이 아니라 **상태**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 말이 나와야
 * 하고, 장면에 캡션 필드를 따로 두면 같은 것을 두 자리에 적는 꼴이다.
 */
export function captionFor(scene: SquashToProbabilityScene): SquashCaption | null {
  if (!scene.axis) return null;
  if (scene.tails) {
    const tail = tailValues(scene);
    return tail === null ? null : { kind: 'tails', lowP: tail.lowP, highP: tail.highP };
  }
  const last = lastReading(scene);
  if (last !== null) {
    if (last.from === null || last.axisGap === null || last.bandGap === null) {
      return { kind: 'center', p: last.p };
    }
    return {
      kind: 'squash',
      z: last.z,
      p: last.p,
      axisGap: last.axisGap,
      bandGap: last.bandGap,
    };
  }
  return scene.band ? { kind: 'band' } : { kind: 'axis' };
}

export const squashToProbabilityScene: ScenePlan<SquashToProbabilityScene> = {
  /**
   * 첫 장면은 점수 목록만 세우고 비어 있다.
   *
   * 넘겨받은 배열을 **참조로 쥐지 않는다** — `squashScoresOf` 가 걸러 정렬한 새 배열을
   * 낸다 (S-scene). 좁히는 잣대는 algorithm 이 내준 하나다. 두 군데서 좁히면 걸음
   * 수와 눈금 수가 갈린다.
   */
  initial(initialData: unknown): SquashToProbabilityScene {
    const d = fields(initialData) ?? {};
    return atStart({ scores: squashScoresOf(d.scores) });
  },

  reduce(
    scene: SquashToProbabilityScene,
    event: FacetRuntimeEvent,
  ): SquashToProbabilityScene {
    switch (event.type) {
      /*
       * 축이 뻗는다. 점수 목록을 실어 오지 않는다 — 선언에서 결정되는 바탕이라
       * `initial` 이 이미 쥐고 있다.
       */
      case 'axis-extends':
        return { ...scene, axis: true, step: { kind: 'axis' } };

      /* 띠가 선다. 축이 아직 없으면 설 자리가 없다. 조용히 흘린다 (C2). */
      case 'band-appears':
        if (!scene.axis) return scene;
        return { ...scene, band: true, step: { kind: 'band' } };

      /*
       * 점수 하나가 띠로 내려앉는다. 어느 자리인지는 싣지 않는다 — 밟는 차례가
       * 목록에서 정해지므로 `landed.length` 가 곧 그 자리다. 실리는 것은 σ(z) 하나,
       * 곧 이 걸음이 내리는 판정뿐이다.
       */
      case 'score-squashed': {
        const p = num(fields(event.payload)?.p);
        const index = nextLandingIndex(scene);
        // 선언된 점수보다 많이 내려앉으면 앉을 자리가 없다. 조용히 흘린다 (C2).
        if (p === null || index === null) return scene;
        return {
          ...scene,
          landed: [...scene.landed, { index, p }],
          step: { kind: 'squash' },
        };
      }

      /*
       * 축의 나머지가 자투리로 눌려 든다. 두 끝 값을 싣지 않는다 — 그때는 이미 양
       * 끝이 내려앉은 뒤라 자취가 쥐고 있다.
       */
      case 'tails-pressed':
        if (!scene.band || tailValues(scene) === null) return scene;
        return { ...scene, tails: true, step: { kind: 'tails' } };

      /* 마지막으로 얻은 폭의 강조를 거둔다. */
      case 'done':
        if (scene.settled) return scene;
        return { ...scene, settled: true, step: { kind: 'settle' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ scores: scene.scores });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
