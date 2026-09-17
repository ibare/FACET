/**
 * PositionalValue 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 stage 에 **다섯**이 흩어져 있었다. projector 는 아무것도 쥐지 않았다.
 *
 * - `let onIndices: number[]` — **DOM 의 거울.** `markOn` 이 적어 두고 `sumUp` 이
 *   칩의 출발 x 를 거기서 셈했다. 되짚어 `sum-up` 만 세우면 그 배열이 옛 화면의
 *   것이라 칩 넷이 엉뚱한 칸에서 출발한다.
 * - `let cells: Cell[]` — 비트 칸의 손잡이. **어느 자리가 켜졌나**가 `rect` 의
 *   `fill` 속성에만 남았다.
 * - `let tenRect` · `let tenNum` — **10진 덩이가 아직 있나**가 이 둘의 null 여부에
 *   있었다.
 * - `let ghost` — 덩이가 떠난 빈 테두리. **"이 자리가 합으로 다시 찼다"** 가 오직
 *   `stroke-dasharray` 속성의 유무에 있었다. 한 속성이 두 말을 싣던 자리다.
 * - `cutInto(row: 'octal' | 'hex', …)` 의 **인자 인라인 유니온**과 `let leading` —
 *   어느 줄을 이미 끊었나는 `gRows` 의 자식 유무가, 앞의 0 을 떼어 읽는 판정은
 *   그 루프 안의 `leading` 이 쥐었다.
 *
 * 여기서는 그 다섯이 `phase` 하나에서 파생된다. 국면이 단조로 나아가므로 어느
 * 줄이 서 있고 어느 자리가 켜졌고 테두리가 점선인지 실선인지가 전부 그 하나로
 * 정해진다.
 *
 * ── 화면에 나란히 뜨는 수가 한 함수를 지난다
 *
 * 이 조각은 자리값 · 비트 · 켜진 자리의 값 · 그 합 · 셋씩 끊은 글자 · 넷씩 끊은
 * 글자를 **한 화면에 나란히** 띄운다. 그 수들이 서로 다른 출처에서 나오면 그림이
 * 제 안에서 거짓이 된다. 그래서 걸음은 **아무것도 실어 오지 않고**, 수와 비트 폭
 * 둘에서 `computePositionalValueFacts` 하나가 전부를 낸다 — algorithm 이 쓰는 것과
 * 글자 그대로 같은 함수다 (프로토콜 4 절의 B 갈래).
 *
 * 앞의 0 을 떼어 읽는 판정도 두 벌을 두지 않는다. `digits.length - reading.length`
 * 가 곧 떼어 낸 글자 수이므로 `droppedOf` 하나만 지난다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 칸 폭 · 줄의 높이 · 칩이 앉는 자리는 전부 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 — 무엇을
 * 말할지는 `phase` 가 이미 가르므로 캡션 필드를 따로 두지 않고, 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 *
 * `step` 필드도 두지 않는다. 걸음마다 국면이 정확히 하나씩 나아가므로 "방금 무슨
 * 걸음을 밟았나" 가 `phase` 와 같은 말이 된다 — 따로 두면 같은 것을 두 자리에서
 * 말하는 꼴이다. 그래서 그리는 쪽은 `prev` 를 아예 들추지 않는다 (S-scene).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  computePositionalValueFacts,
  type PositionalGrouping,
  type PositionalValueFacts,
} from './algorithm.js';

/**
 * 그림이 지나는 국면. **단조로 나아간다** — 뒤로 가는 길은 `rewind` 뿐이다.
 *
 * 배열의 차례가 곧 순서이고 `phaseRank` 가 그것을 읽는다. 어느 줄이 이미 서
 * 있나를 이 하나가 정하므로, 옛 stage 가 `gRows` 의 자식 유무로 알던 것이 전부
 * 여기로 올라왔다.
 */
export const POSITIONAL_VALUE_PHASES = [
  /** 한 덩이로 선 10진수. */
  'whole',
  /** 덩이가 자리마다 하나씩 쪼개졌다. 10진 자리는 빈 테두리가 된다. */
  'places',
  /** 켜진 자리가 물들고 들렸다. */
  'marked',
  /** 켜진 자리의 값이 올라와 식이 되고 빈 테두리를 다시 채웠다. */
  'summed',
  /** 같은 비트를 셋씩 끊은 줄이 섰다. */
  'octal',
  /** 같은 비트를 넷씩 끊은 줄이 섰다. */
  'hex',
  /** 네 줄의 양 끝을 잇는 선이 내려왔다 — 길이가 같다. */
  'aligned',
] as const;

export type PositionalValuePhase = (typeof POSITIONAL_VALUE_PHASES)[number];

/** 국면의 차례. 견줄 때 쓴다 — `rank(phase) >= rank('octal')` 이면 8진 줄이 섰다. */
export function phaseRank(phase: PositionalValuePhase): number {
  return POSITIONAL_VALUE_PHASES.indexOf(phase);
}

export type PositionalValueScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 화면이 보이는 수. */
  value: number;
  /** 몇 자리로 적는가. */
  bitWidth: number;

  // ── 자취. 걸음이 나아가고 `rewind` 가 턴다.
  /**
   * 지금 국면. `null` 이면 아직 아무 걸음도 밟지 않았다 — 처음과 되감은 뒤.
   *
   * **이 하나가 화면 전체를 정한다.** 어느 줄이 서 있나, 켜진 자리가 물들었나,
   * 10진 자리의 테두리가 점선인가 실선인가, 가이드선이 내려왔나가 모두 국면의
   * 차례에서 파생된다.
   */
  phase: PositionalValuePhase | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `phase` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 이미 네 줄을
 * 세운 채로 서고 그 위에 algorithm 이 처음부터 다시 밟는 것이 겹친다
 * (S-scene · 프로토콜 4 절).
 */
type Base = Pick<PositionalValueScene, 'value' | 'bitWidth'>;

/**
 * 되돌린 뒤의 장면 — 캔버스가 비어 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): PositionalValueScene {
  return { value: base.value, bitWidth: base.bitWidth, phase: null };
}

/**
 * `initialData` 를 좁힌다. 받는 자리가 `initial` 이므로 좁히개도 여기 있다.
 *
 * 원시값 둘만 꺼내므로 넘겨받은 객체를 참조로 쥐지 않는다 (S-scene MUST).
 */
function readBase(data: unknown): Base {
  const d = (data ?? {}) as { value?: unknown; bitWidth?: unknown };
  return {
    value: typeof d.value === 'number' ? d.value : 0,
    bitWidth: typeof d.bitWidth === 'number' && d.bitWidth > 0 ? Math.floor(d.bitWidth) : 8,
  };
}

/**
 * 화면이 쓰는 수를 전부 낸다 — algorithm 과 **같은 함수**다.
 *
 * 걸음이 아무것도 실어 오지 않으므로 화면에 나란히 뜨는 수가 두 출처에서 나올
 * 길이 없다. `stepMs` 는 그림과 무관하니 자리만 채운다.
 */
export function factsOf(scene: PositionalValueScene): PositionalValueFacts {
  return computePositionalValueFacts({
    type: 'positional-value',
    value: scene.value,
    bitWidth: scene.bitWidth,
    stepMs: 0,
  });
}

/**
 * 묶음 앞에서 떼어 읽는 0 의 개수.
 *
 * 화면이 흐린 글자로 두는 자리와 캡션의 표기가 **한 잣대**를 지나게 한다 —
 * `reading` 이 이미 앞의 0 을 떼고 나온 문자열이므로 길이 차가 곧 그 수다.
 */
export function droppedOf(group: PositionalGrouping): number {
  const dropped = group.digits.length - group.reading.length;
  return dropped > 0 ? dropped : 0;
}

export const positionalValueScene: ScenePlan<PositionalValueScene> = {
  /**
   * 첫 장면은 무엇을 그릴지만 알고 아직 아무것도 그리지 않았다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다.
   */
  initial(initialData: unknown): PositionalValueScene {
    return atStart(readBase(initialData));
  },

  reduce(scene: PositionalValueScene, event: FacetRuntimeEvent): PositionalValueScene {
    /*
     * 발신 일곱이 국면 일곱과 하나씩 맞물린다. **payload 를 읽지 않는다** —
     * 자리값도 비트도 합도 묶음도 `factsOf` 가 바탕에서 낸다 (프로토콜 4 절
     * "payload 가 친절하면 오히려 위험하다"). `mark` 의 target 도 읽지 않는다.
     */
    switch (event.type) {
      case 'show-number':
        return { ...scene, phase: 'whole' };
      case 'split-places':
        return { ...scene, phase: 'places' };
      case 'mark':
        return { ...scene, phase: 'marked' };
      case 'sum-up':
        return { ...scene, phase: 'summed' };
      case 'cut-by-three':
        return { ...scene, phase: 'octal' };
      case 'cut-by-four':
        return { ...scene, phase: 'hex' };
      case 'done':
        return { ...scene, phase: 'aligned' };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ value: scene.value, bitWidth: scene.bitWidth });

      default:
        // 이 algorithm 이 발신하는 것은 위 여덟이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
