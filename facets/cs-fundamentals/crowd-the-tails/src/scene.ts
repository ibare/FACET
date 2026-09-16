/**
 * CrowdTheTails 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 는 **네 자리**에 적어 두었고, 그중 둘은 grep 에 걸리지 않았다.
 *
 * - `let bounds` · `let counts` — 지금 경계가 어디이고 뭉치마다 몇 점이 드나.
 *   `cutByScale` 이 `const from = bounds.slice()` 로 **출발 그림을 되읽었다** —
 *   되감은 직후에는 그것이 아직 옛 화면의 경계다.
 * - **점의 `cx` / `cy` 속성** — `jobsFor` 가 `Number(dot.getAttribute('cx'))` 로
 *   점의 지금 자리를 화면에서 되읽었다. "이 점이 이미 담겼나, 아직 q 선 위인가" 가
 *   오직 그 두 속성에만 있었다.
 * - **`Vessel.floor` 의 `stroke`** — `markFilled(b)` 가 짙게 칠하는 것으로 "이
 *   그릇은 셈이 끝났다" 를 적어 두었다. DOM 손잡이와 뜻이 한 객체(`Vessel = { body,
 *   floor }`)에 묶여 있어 `let` 도 `Set.has` 도 아니었다 — **이 조각의 진행 자체가
 *   `rect` 와 `line` 의 칠 속성에만 있었다.**
 * - **점의 `fill` / `opacity`** — 담긴 점은 짙고 자국에 삼켜진 점은 사라진다.
 *   되돌리는 명령이 `rewind` 뿐이라 걸음 밖에서는 알 길이 없었다.
 *
 * 여기서는 그 넷이 `cut` · `poured` · `digested` 셋이다. 좌표도 칠도 전부 그 셋에서
 * 파생되므로 화면을 되읽을 자리가 없다.
 *
 * ── 수는 한 출처에서만 나온다 — δ 와 점의 수
 *
 * 화면에는 경계의 백분율, 뭉치마다 든 점의 수, 자국의 굵기, 그리고 캡션의
 * "가운데 {middle} · 꼬리 {tail} · {ratio} 배" 가 **나란히** 뜬다. 옛 발신은 그
 * 전부를 payload 로 실어 왔다 — 화면의 구조와 다른 출처가 되어 갈릴 자리였다.
 *
 * 이제 발신은 **비어 있고**, 그 수들이 전부 여기서 셈해진다.
 *
 * - **경계** — `scaledBoundsOf(delta)` 를 `algorithm.ts` 에서 그대로 가져온다.
 *   부동소수 척도 함수라 두 군데에서 각자 자르면 끝자리가 갈린다. 걸음의 수와
 *   그릇의 수가 같은 함수에서 나오게 하는 것이 요점이다.
 * - **뭉치의 크기** — `countsIn(bounds, count)`. 뭉치의 폭도 그 안의 점도 같은
 *   경계 배열에서 나오므로 "폭이 좁은데 점이 많다" 는 일이 구조적으로 없다.
 * - **꼬리 · 가운데 · 비** — `countsIn` 의 최소와 최대. 캡션의 세 수와 화면의
 *   자국 굵기가 한 배열에서 나온다.
 * - **몇 번째 짝인가** — `poured` 하나. `pairsOf(parts)` 가 그 짝이 어느 두 뭉치인지
 *   말하고, 그 함수도 algorithm 과 나눠 쓴다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 분위(0…1)와 뭉치 번호라는 **구조**만 담고, 자의 길이도
 * 기둥의 피치도 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도
 * 담지 않는다 — 캡션은 `cut` · `poured` · `digested` 셋에서 파생되므로 따로 실을
 * 것이 없고, 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { pairsOf, scaledBoundsOf } from './algorithm.js';

/** 자르는 잣대. q 를 고르게 자르나, k 를 한 칸씩 끊어 되돌린 자리로 자르나. */
export type CutKind = 'even' | 'scaled';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `slide` 만 계기값을 싣는다 — 경계가 미끄러지는 운동은 **떠나온 잣대**의 그림에서
 * 출발하는데, 그것을 `prev` 에서 꺼내 쓰면 "`prev` 는 고르는 데만" 을 어긴다
 * (S-scene). 좌표가 아니라 잣대의 이름을 실으므로 출발 경계도 `boundsFor` 라는
 * 같은 함수를 지난다.
 *
 * 나머지 셋은 아무것도 싣지 않는다. 어느 뭉치가 방금 담겼나는 `poured` 가, 자국이
 * 어디 앉나는 경계가 이미 말한다 — 걸음에 도로 실으면 방금 걷어낸 두 출처를 운동
 * 쪽으로 다시 들이는 꼴이다.
 */
export type CrowdStep =
  /** 자르는 선 여섯이 눈금에서 내려와 그릇을 세운다. */
  | { kind: 'drop' }
  /** 잣대가 바뀌어 경계가 저마다 가까운 끝으로 미끄러진다. */
  | { kind: 'slide'; from: CutKind }
  /** 마주 보는 두 뭉치로 점이 쏟아진다. */
  | { kind: 'pour' }
  /** 삼킨 점들이 뭉치마다 자국 하나로 접힌다. */
  | { kind: 'merge' };

export type CrowdTheTailsScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 정렬된 점의 수. 점마다 분위 하나. */
  count: number;
  /** 압축 계수 δ. 두 잣대의 경계와 뭉치 수가 전부 여기서 나온다. */
  delta: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 지금 자르는 잣대. null 이면 아직 아무것도 자르지 않았다. */
  cut: CutKind | null;
  /**
   * 담은 짝의 수. 가운데 짝부터 꼬리 짝으로 나아간다.
   *
   * **남는 자취**다 — 어디까지 담았나가 이 조각의 진행 자체이므로 정적 그리기가
   * 그것을 세운다 (S-scene). 옛 stage 는 그릇 바닥의 칠에만 적어 두었다.
   */
  poured: number;
  /** 뭉치마다 자국 하나로 접혔나. */
  digested: boolean;

  step: CrowdStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `cut` · `poured` · `digested` 는 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 자른 그릇과 쌓인 기둥을 단 채로 선다 (S-scene).
 */
type Base = Pick<CrowdTheTailsScene, 'count' | 'delta'>;

/**
 * 되돌린 뒤의 장면 — q 선과 점만 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (S-scene).
 */
function atStart(base: Base): CrowdTheTailsScene {
  return { count: base.count, delta: base.delta, cut: null, poured: 0, digested: false, step: null };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const DEFAULT_COUNT = 60;
const DEFAULT_DELTA = 12;

// ── 파생. 화면이 쓰는 수는 전부 여기를 지난다 ───────────────────────────────

/** 뭉치 수. 자르기 전에도 안다 — δ 가 정한다. */
export function partsOf(delta: number): number {
  return scaledBoundsOf(delta).length - 1;
}

/** 같은 수의 뭉치로 q 를 고르게 자른 경계. 견줄 상대다. */
export function evenBoundsOf(parts: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= parts; i += 1) out.push(i / parts);
  return out;
}

/** 그 잣대의 경계. 두 잣대가 같은 수의 뭉치를 내므로 나란히 견줄 수 있다. */
export function boundsFor(cut: CutKind, delta: number): number[] {
  return cut === 'even' ? evenBoundsOf(partsOf(delta)) : scaledBoundsOf(delta);
}

/** 지금 그릴 경계. 아직 자르지 않았으면 빈 배열이다. */
export function boundsOf(scene: CrowdTheTailsScene): number[] {
  return scene.cut === null ? [] : boundsFor(scene.cut, scene.delta);
}

/** i 번째 점이 서 있는 분위. 표본의 한가운데를 잡는 흔한 규약이다. */
export function quantileAt(i: number, n: number): number {
  return (i + 0.5) / n;
}

/** 분위 q 가 드는 뭉치 번호. 경계는 왼쪽을 품고 오른쪽을 넘긴다. */
export function bucketOf(q: number, bounds: number[]): number {
  let b = 0;
  while (b < bounds.length - 2 && q >= bounds[b + 1]) b += 1;
  return b;
}

/** 뭉치마다 몇 점이 드는가. 뭉치의 폭과 그 안의 점이 같은 경계에서 나온다. */
export function countsIn(bounds: number[], n: number): number[] {
  if (bounds.length < 2) return [];
  const out = new Array<number>(bounds.length - 1).fill(0);
  for (let i = 0; i < n; i += 1) out[bucketOf(quantileAt(i, n), bounds)] += 1;
  return out;
}

/** 뭉치가 남기는 자국의 자리 — 그 뭉치에 든 점들의 분위 평균. */
export function centroidsIn(bounds: number[], n: number): number[] {
  if (bounds.length < 2) return [];
  const sum = new Array<number>(bounds.length - 1).fill(0);
  const hit = new Array<number>(bounds.length - 1).fill(0);
  for (let i = 0; i < n; i += 1) {
    const q = quantileAt(i, n);
    const b = bucketOf(q, bounds);
    sum[b] += q;
    hit[b] += 1;
  }
  return sum.map((s, b) => (hit[b] === 0 ? (bounds[b] + bounds[b + 1]) / 2 : s / hit[b]));
}

/**
 * 담긴 뭉치 — 담은 짝의 수에서 나온다.
 *
 * `pairsOf` 가 짝의 차례를 정하고 `poured` 가 어디까지 왔나를 말하므로, 화면의
 * 짙은 바닥과 쌓인 기둥이 같은 한 수에서 나온다.
 */
export function filledOf(scene: CrowdTheTailsScene): boolean[] {
  const parts = partsOf(scene.delta);
  const out = new Array<boolean>(parts).fill(false);
  const pairs = pairsOf(parts);
  for (let j = 0; j < scene.poured && j < pairs.length; j += 1) {
    out[pairs[j].left] = true;
    out[pairs[j].right] = true;
  }
  return out;
}

/** 방금 담긴 짝. 아직 담은 것이 없으면 null. */
export function lastPairOf(scene: CrowdTheTailsScene): { left: number; right: number } | null {
  if (scene.poured <= 0) return null;
  const pairs = pairsOf(partsOf(scene.delta));
  return pairs[scene.poured - 1] ?? null;
}

export const crowdTheTailsScene: ScenePlan<CrowdTheTailsScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다 — q 선과 점 예순만 서 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 담는 것이
   * 수 둘뿐이라 참조를 쥘 자리가 애초에 없다 — 러너가 주는 객체는 algorithm 이
   * 제자리에서 고칠 수 있으므로 배열이었다면 복사해야 했을 것이다 (S-scene).
   */
  initial(initialData: unknown): CrowdTheTailsScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const count = Math.floor(num(d.count, DEFAULT_COUNT));
    const delta = num(d.delta, DEFAULT_DELTA);
    return atStart({
      count: count >= 1 ? count : DEFAULT_COUNT,
      delta: delta > 0 ? delta : DEFAULT_DELTA,
    });
  },

  reduce(scene: CrowdTheTailsScene, event: FacetRuntimeEvent): CrowdTheTailsScene {
    switch (event.type) {
      /*
       * 고르게 자른다 — 문제를 세우는 걸음. 한 회차의 첫 걸음이므로 자취를 새로
       * 깐다 (되감지 않고 곧바로 다시 재생하는 길도 있다).
       */
      case 'cut-evenly':
        return { ...scene, cut: 'even', poured: 0, digested: false, step: { kind: 'drop' } };

      // 잣대를 바꾼다 — 떠나온 잣대를 걸음에 실어 출발 그림을 셈으로 되살린다.
      case 'cut-by-scale':
        return {
          ...scene,
          cut: 'scaled',
          poured: 0,
          digested: false,
          step: { kind: 'slide', from: scene.cut ?? 'even' },
        };

      /*
       * 마주 보는 두 뭉치에 담는다.
       *
       * 뭉치 번호를 받지 않는다 — **이 발신의 차례가 곧 짝**이고, 그 짝이 어느
       * 둘인지는 `pairsOf` 가 말한다. 자르지 않은 채로 오면 담을 그릇이 없으므로
       * 조용히 흘린다 (C2).
       */
      case 'fill-pair': {
        if (scene.cut === null) return scene;
        const pairs = pairsOf(partsOf(scene.delta));
        if (scene.poured >= pairs.length) return scene;
        return { ...scene, poured: scene.poured + 1, step: { kind: 'pour' } };
      }

      // 뭉치마다 자국 하나. 삼킨 점은 더 이상 따로 서 있지 않는다.
      case 'digest-formed':
        if (scene.cut === null) return scene;
        return { ...scene, digested: true, step: { kind: 'merge' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ count: scene.count, delta: scene.delta });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
