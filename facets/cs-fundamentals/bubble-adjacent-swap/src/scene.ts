/**
 * bubbleAdjacentSwap 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 칸은 붙박여 있고 **값만 자리를 옮긴다.** 그 아래를 선두 표시가 달리고, 지나온
 * 만큼 자취선이 이어진다. 한 번 훑고 나면 오른쪽 끝 한 자리가 확정된다.
 *
 * 그러니 화면을 다시 그리는 데 필요한 것은 **어느 칸에 어느 값이 앉아 있는가**,
 * **선두가 몇 번 칸까지 왔는가**, **지금 견주는 짝이 어느 둘인가**, 그리고
 * **어디서부터가 확정된 꼬리인가** 다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 하나도 없었다. 상태는 전부 stage 안에 있었고, 어느
 * 이벤트에도 실리지 않아 걸음을 처음부터 다시 밟아야만 복원됐다.
 *
 * - **`tiles: Tile[]` 의 순서** — `Tile` 이 DOM 손잡이(`group`·`rect`·`label`)와
 *   `value` 를 한 객체에 묶어 쥐었고, 맞바꿈이 `tiles[left] = sliding` 으로
 *   **제자리에서 자리를 갈아 끼웠다.** "어느 칸에 어느 값이 앉았나" 가 그 배열의
 *   순서에만 있었다. `let` 이지만 담긴 것이 DOM 이라 상태로 안 읽힌다.
 * - **선두가 어디까지 왔나** — 코드 어디에도 수로 적혀 있지 않았다. 삼각 표시의
 *   `transform` 과 자취선의 `stroke-dashoffset` 이라는 **DOM 속성 둘**에만 있었고
 *   `advanceLead(slot, ms)` 가 그것을 고쳤다. **이 조각의 주장이 바로 그 누적인데**
 *   되짚으면 자취선이 통째로 사라진다.
 * - **`settledFrom`** — 확정된 꼬리가 어디서 시작하나. `pass-settled` 가 한 번
 *   정하고 걸음마다 `resetPaint` 가 그것을 다시 칠했다. 이벤트에 실리지 않는다.
 * - **`TileState` 타입** — 선언만 있고 어디에도 저장되지 않는다. `paint()` 의 인자로
 *   흐르며 칠에만 쓰였다. 곧 칸의 형편이 화면에만 있었다는 신호다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**(아직 도는 중 / 확정됨), **테두리는 견줌의 표식**이다.
 * 값이 실제로 자리를 옮기는 조각이라 이 구분이 정면으로 걸린다 — 고른 쪽을 채움으로
 * 칠하면 맞바꾼 뒤 그 자리에 **진 값**이 앉아 읽기가 뒤집힌다. 옮기기 전 stage 가
 * `paint(rising, 'moving')` 으로 그렇게 칠하고 있었고, 다음 걸음의 `resetPaint` 가
 * 그것을 지워 주어서 겨우 어긋나지 않았다. 되돌림에 기대는 짜임이라 되짚으면 깨진다.
 *
 * ── `pass-settled` 의 누적은 일부러 장면에 올린다
 *
 * 확정된 꼬리는 되돌림이 없어 쌓이던 자리다. 그것이 버그가 아니라 **정보**다 —
 * 한 바퀴가 끝나면 뒤쪽 한 칸이 영영 확정된다는 것이 이 조각의 결론이고, 선두의
 * 자취선이 왼쪽 끝에서 오른쪽 끝까지 끊김 없이 닿아 있는 것이 그 증거다. 둘 다
 * 정적 그리기가 세우게 한다 (S-scene PREFER — 남는 강조).
 *
 * 좌표는 담지 않는다. 칸 번호가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import { toIndexArray, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

/** 나란한 두 칸. 견줌의 표식이 얹히는 자리다. */
export type BubbleAdjacentSwapPair = {
  readonly left: number;
  readonly right: number;
};

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 그림**도
 * 여기서 셈한다.
 *
 * 값이 실제로 자리를 옮기는 조각이라 출발 그림이 꼭 필요하다. 그것을 `prev` 에서
 * 꺼내면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene), 어느 두 칸 사이의 일인지를
 * 걸음이 실어 온다. 두 칸 번호만 있으면 출발 자리가 전부 셈해진다 — 맞바꿈은 서로의
 * 자리에서 오고, 선두는 늘 왼쪽 칸에서 오른쪽 칸으로 간다.
 */
export type BubbleAdjacentSwapStep =
  | { kind: 'compare'; left: number; right: number }
  | { kind: 'swap'; left: number; right: number }
  | { kind: 'keep'; left: number; right: number }
  | { kind: 'settle'; from: number };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type BubbleAdjacentSwapCaption =
  | { kind: 'compare'; a: number; b: number }
  | { kind: 'swap'; big: number }
  | { kind: 'keep'; b: number }
  | { kind: 'settled'; comparisons: number; max: number };

export type BubbleAdjacentSwapScene = {
  /**
   * 처음 늘어선 값. `rewind` 가 여기로 돌아오고, 칸 수와 칸 폭도 이 길이가 정한다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly origin: readonly number[];
  /** 지금 각 칸에 앉아 있는 값. 길이는 `origin` 과 같다. */
  readonly values: readonly number[];
  /**
   * 선두 표시가 선 칸. 자취선이 0 번 칸에서 여기까지 이어진다.
   *
   * **견줌 한 번마다 정확히 하나씩 는다.** 그래서 훑기가 끝났을 때의 `lead` 가 곧
   * 견준 횟수이고, 이 조각이 하려는 말이 이 한 수에 들어 있다. 화면에 뜨는 견줌
   * 횟수도 여기서 나온다 — 나란히 뜨는 두 가지가 한 자리에서 난다.
   */
  readonly lead: number;
  /** 지금 견주는 짝. 테두리로 그린다. 한 견줌이 결판날 때까지 머문다. */
  readonly comparing: BubbleAdjacentSwapPair | null;
  /**
   * 확정된 꼬리가 시작하는 칸. 이 칸부터 오른쪽 끝까지가 확정이다.
   *
   * **남는 강조**라 정적 그리기가 세운다. 되돌리는 걸음이 없어 쌓이던 자리인데,
   * 그 누적이 곧 "한 바퀴에 한 칸이 영영 정해진다" 는 결론이다.
   */
  readonly settledFrom: number | null;
  readonly step: BubbleAdjacentSwapStep | null;
  readonly caption: BubbleAdjacentSwapCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `values` · `lead` · `comparing` · `settledFrom` 은 여기 들지 않는다. 전부 걸어오며
 * 쌓은 자취라, 바탕으로 묶어 되감기에 넘기면 되감은 화면이 이미 다 정렬된 채로 서고
 * 그 위에 algorithm 이 처음부터 다시 밟는다 — 화면 안에서 두 배치가 어긋난다.
 * 타입으로 좁혀 두어 구조적으로 못 넘어가게 한다.
 */
type BubbleAdjacentSwapBase = Pick<BubbleAdjacentSwapScene, 'origin'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: BubbleAdjacentSwapBase): BubbleAdjacentSwapScene {
  return {
    origin: base.origin,
    values: [...base.origin],
    lead: 0,
    comparing: null,
    settledFrom: null,
    step: null,
    caption: null,
  };
}

/** 그 칸에 앉은 값. 칸 밖이면 `null`. */
function valueAt(scene: BubbleAdjacentSwapScene, slot: number): number | null {
  const v = scene.values[slot];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 나란한 두 칸을 target 에서 읽는다. 식별자 파싱은 `toIndexArray` 를 경유한다
 * (원칙 4). 칸 번호가 이미 `index:<n>` 으로 와 있으므로 payload 가 그것을 또 실을
 * 까닭이 없다 — 같은 수가 두 자리에 있으면 언젠가 갈린다.
 */
function readPair(
  scene: BubbleAdjacentSwapScene,
  target: FacetRuntimeEvent['target'],
): BubbleAdjacentSwapPair | null {
  const [left, right] = toIndexArray(target);
  if (typeof left !== 'number' || typeof right !== 'number') return null;
  if (right !== left + 1) return null;
  if (valueAt(scene, left) === null || valueAt(scene, right) === null) return null;
  return { left, right };
}

export const bubbleAdjacentSwapScene: ScenePlan<BubbleAdjacentSwapScene> = {
  /**
   * 첫 장면은 처음 늘어선 값들이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이고 algorithm 이 `values[i] = …` 로 제자리에서 고친다. 참조를 쥐면 되짚을
   * 때 이미 다 굴러간 자료로 바탕을 그린다 (S-scene). 아래 `filter` 가 새 배열을
   * 만든다.
   */
  initial(initialData: unknown): BubbleAdjacentSwapScene {
    const raw = (initialData ?? {}) as { values?: unknown };
    const origin = Array.isArray(raw.values)
      ? raw.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : [];
    return atStart({ origin });
  },

  reduce(
    scene: BubbleAdjacentSwapScene,
    event: FacetRuntimeEvent,
  ): BubbleAdjacentSwapScene {
    switch (event.type) {
      // 나란한 두 칸을 견주기 시작한다. 아직 아무것도 옮기지 않았고 선두도
      // 그대로다 — 움직이는 것은 이 견줌이 결판난 다음이다.
      case 'compare-begin': {
        const pair = readPair(scene, event.target);
        if (pair === null) return scene;
        const a = valueAt(scene, pair.left);
        const b = valueAt(scene, pair.right);
        if (a === null || b === null) return scene;
        return {
          ...scene,
          comparing: pair,
          step: { kind: 'compare', left: pair.left, right: pair.right },
          caption: { kind: 'compare', a, b },
        };
      }

      // 왼쪽이 더 컸다 — 그 값이 이웃을 넘어 한 칸 오른쪽으로 간다. 두 값이 서로의
      // 자리로 가고 선두는 넘어간 값을 따라간다.
      case 'swap-adjacent': {
        const pair = readPair(scene, event.target);
        if (pair === null) return scene;
        const moved = valueAt(scene, pair.left);
        const stayed = valueAt(scene, pair.right);
        if (moved === null || stayed === null) return scene;
        const values = scene.values.slice();
        values[pair.left] = stayed;
        values[pair.right] = moved;
        return {
          ...scene,
          values,
          lead: pair.right,
          comparing: pair,
          step: { kind: 'swap', left: pair.left, right: pair.right },
          caption: { kind: 'swap', big: moved },
        };
      }

      // 오른쪽이 이미 컸다 — 값은 하나도 옮기지 않고 선두만 한 칸 넘어간다.
      // 값이 안 움직이는데도 선두는 나아간다는 것이 이 걸음의 요점이다.
      case 'keep-adjacent': {
        const pair = readPair(scene, event.target);
        if (pair === null) return scene;
        const b = valueAt(scene, pair.right);
        if (b === null) return scene;
        return {
          ...scene,
          lead: pair.right,
          comparing: pair,
          step: { kind: 'keep', left: pair.left, right: pair.right },
          caption: { kind: 'keep', b },
        };
      }

      // 한 번 훑었다 — 오른쪽 끝 한 자리가 확정된다. 견줌의 표식은 거둔다.
      // 훑기가 끝난 마당에 마지막 한 짝만 표시해 두면 그 짝이 특별했던 것처럼
      // 읽힌다. 남아야 할 것은 자취선과 확정된 꼬리다.
      case 'pass-settled': {
        const slot = toIndexArray(event.target)[0];
        if (typeof slot !== 'number') return scene;
        const max = valueAt(scene, slot);
        if (max === null) return scene;
        return {
          ...scene,
          comparing: null,
          settledFrom: scene.settledFrom === null ? slot : Math.min(scene.settledFrom, slot),
          step: { kind: 'settle', from: slot },
          // 견준 횟수는 선두가 온 칸 수와 같다 — 견줌 한 번에 한 칸이 이 조각의
          // 주장이므로, 화면의 자취와 화면의 수가 한 자리에서 난다 (두 출처 금지).
          caption: { kind: 'settled', comparisons: scene.lead, max },
        };
      }

      case 'rewind':
        return atStart({ origin: scene.origin });

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
