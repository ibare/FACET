/**
 * mergeTwoSorted 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 축은 **두 줄에서 얼마나 꺼냈나** 다
 *
 * 두 줄이 위에 눕고 아래 결과줄이 채워진다. 화면을 다시 그리는 데 필요한 것은
 * 두 줄의 값(바뀌지 않는다)과 **결과줄에 무엇이 어느 줄에서 차례로 내려앉았나**
 * 뿐이다. 두 줄의 맨 앞(커서)은 그 자취에서 세어 나온다 — `headsOf` 가 유일한
 * 셈 자리이고, 화면의 커서도 캡션의 값도 모두 그 함수를 지난다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 상태는 전부 stage 안에 있었다.
 *
 * - **`headLeft` · `headRight`** — 두 줄의 커서. 어느 이벤트에도 실리지 않았고
 *   `takeDown` 이 애니메이션 **도중에** 제자리에서 올렸다. 되짚으면 복원할 길이
 *   없다. 이제 `headsOf(out)` 가 자취에서 센다.
 * - **`Cell.slot: number | null`** — "이 칸이 결과줄 몇 번째에 앉았나". DOM 손잡이
 *   (`g` · `box` · `label`) 와 **이 조각의 결론**이 한 객체에 묶여 있었고
 *   `const`·`let cells` 라 어떤 grep 에도 안 걸린다 (프로토콜 3-1 의 ⑤).
 *   이제 `out` 이 그 자취를 순서대로 쥔다.
 * - **`comparing` · `flying`** — 지금 견주는 중인가 / 지금 내려가는 칸이 무엇인가.
 *   `paint()` 가 이 둘로 칠을 갈랐다. 앞의 것은 `comparing` 으로 올라왔고, 뒤의
 *   것은 사라졌다 — 내려가는 칸은 장면에서 **이미 결과줄에 앉은 것**이고, 어디서
 *   출발했는지는 `step` 이 말한다.
 * - **다리(`bridge`) 의 `points` 와 고리(`ring`) 의 `transform`·`opacity`** —
 *   견줌의 표식과 맨 앞의 자리가 DOM 속성에만 있었다. 둘 다 `comparing` 과
 *   `headsOf` 에서 파생된다.
 *
 * ── 꺼낸 자취를 지우지 않는다
 *
 * 옮기기 전 결과줄은 칸이 전부 같은 칠로 앉아, 다 끝난 화면에서 **어느 줄에서
 * 몇 개를 꺼냈는지 구별이 없었다.** "두 줄을 번갈아 훑었다" 가 재생을 놓친 사람
 * 에게는 안 보였던 것이다 (프로토콜 4절 "조각의 주장이 애초에 화면에 안 남아
 * 있는 수가 있다"). 그래서 `out` 의 각 칸이 **어느 줄에서 왔는지**(`side`) 를
 * 함께 지고, 그리는 쪽이 그것을 결과줄에 남긴다.
 *
 * 칠은 갈라 둔다 — **채움은 값의 형편**(아직 줄에 있다 / 꺼내졌다), **테두리는
 * 견줌의 표식**(지금 이 둘을 견주고 있다). 두 칠이 부딪히지 않는다.
 *
 * 좌표는 담지 않는다. 줄의 길이와 자리 번호가 좌표를 정하므로 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 두 줄. 이 한 글자가 "어느 줄에서 꺼냈나" 의 전부다. */
export type MergeSide = 'left' | 'right';

/**
 * 결과줄에 내려앉은 것 하나. **걸어온 자취라 남는다.**
 *
 * `side` 가 이 조각의 주장을 다 끝난 화면까지 지고 간다 — 이것이 없으면 결과줄이
 * 그냥 정렬된 여섯 칸이 되어 "두 줄을 번갈아 훑었다" 가 사라진다.
 */
export type MergeTwoSortedPick = {
  readonly side: MergeSide;
  /** 제 줄에서의 자리. 떠나온 자리를 되짚는 데 쓴다. */
  readonly index: number;
  readonly value: number;
};

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 그림**도
 * 여기서 셈한다.
 *
 * 값이 실제로 위에서 아래로 내려가는 조각이라 출발 자리가 꼭 필요하다. 그것을
 * `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene), 어느 줄
 * 몇 번째에서 결과줄 몇 번째로 갔는지를 걸음이 지고 온다.
 */
export type MergeTwoSortedStep =
  | { kind: 'compare' }
  | { kind: 'take'; side: MergeSide; index: number; slot: number }
  | { kind: 'done' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type MergeTwoSortedCaption =
  | { kind: 'premise' }
  | { kind: 'compare'; left: number; right: number }
  | { kind: 'take'; value: number }
  | { kind: 'drain' }
  | { kind: 'done'; comparisons: number };

export type MergeTwoSortedScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 왼쪽 줄의 값. 이미 오름차순이다. */
  readonly left: readonly number[];
  /** 오른쪽 줄의 값. 이미 오름차순이다. */
  readonly right: readonly number[];

  // ── 걸어온 자취.
  /** 결과줄. 내려앉은 차례대로, 어느 줄에서 왔는지와 함께. */
  readonly out: readonly MergeTwoSortedPick[];
  /** 지금 맨 앞 둘을 견주는 중인가. **지나가는 표식** — 다음 걸음에 걷힌다. */
  readonly comparing: boolean;
  /** 지금까지의 견줌 횟수. 걸음이 실어 오지 않고 장면이 센다. */
  readonly comparisons: number;
  readonly step: MergeTwoSortedStep | null;
  readonly caption: MergeTwoSortedCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `out` · `comparing` · `comparisons` 를 여기 넣지 않는다. 전부 걸어오며 쌓은
 * 자취라, 바탕으로 묶어 되감기에 넘기면 되감은 화면이 이미 다 내려앉은 채로 서고
 * 그 위에 algorithm 이 처음부터 다시 밟는다. 타입으로 좁혀 두고 **객체 리터럴로**
 * 넘겨 초과 속성 검사가 실제로 돌게 한다.
 */
type MergeTwoSortedBase = Pick<MergeTwoSortedScene, 'left' | 'right'>;

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function nums(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/**
 * 두 줄의 맨 앞이 어디인가 — **자취에서 센다.**
 *
 * 꺼낸 개수가 곧 커서다. 화면의 고리도, 견줌의 다리도, 캡션의 두 값도 모두 이
 * 한 함수를 지난다 (나란히 뜨는 수는 한 출처여야 한다).
 */
export function headsOf(out: readonly MergeTwoSortedPick[]): { left: number; right: number } {
  let left = 0;
  let right = 0;
  for (const pick of out) {
    if (pick.side === 'left') left += 1;
    else right += 1;
  }
  return { left, right };
}

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: MergeTwoSortedBase): MergeTwoSortedScene {
  return {
    left: base.left,
    right: base.right,
    out: [],
    comparing: false,
    comparisons: 0,
    step: null,
    caption: { kind: 'premise' },
  };
}

export const mergeTwoSortedScene: ScenePlan<MergeTwoSortedScene> = {
  /**
   * 첫 장면은 줄 선 둘만 세운다. 결과줄은 비어 있고 `take` 가 채운다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   * 아래 `nums` 가 값만 베껴 새 배열을 만든다.
   */
  initial(initialData: unknown): MergeTwoSortedScene {
    const d = (initialData ?? {}) as { left?: unknown; right?: unknown };
    return atStart({ left: nums(d.left), right: nums(d.right) });
  },

  reduce(scene: MergeTwoSortedScene, event: FacetRuntimeEvent): MergeTwoSortedScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 두 줄의 맨 앞끼리 한 번 견준다. 어느 둘인지는 자취가 말하므로 걸음은
      // 아무것도 싣지 않는다.
      case 'compare': {
        const heads = headsOf(scene.out);
        const left = scene.left[heads.left];
        const right = scene.right[heads.right];
        if (typeof left !== 'number' || typeof right !== 'number') return scene;
        return {
          ...scene,
          comparing: true,
          comparisons: scene.comparisons + 1,
          step: { kind: 'compare' },
          caption: { kind: 'compare', left, right },
        };
      }

      // 한쪽 맨 앞이 결과줄로 내려간다. **어느 쪽인가만** 걸음이 진다 — 그것이
      // 이 조각에서 algorithm 이 내리는 유일한 판정이다. 자리도 값도 자취에서
      // 나온다.
      case 'take': {
        const side = p.side === 'left' || p.side === 'right' ? p.side : null;
        if (side === null) return scene;
        const heads = headsOf(scene.out);
        const index = side === 'left' ? heads.left : heads.right;
        const value = (side === 'left' ? scene.left : scene.right)[index];
        if (typeof value !== 'number') return scene;
        return {
          ...scene,
          out: [...scene.out, { side, index, value }],
          comparing: false,
          step: { kind: 'take', side, index, slot: scene.out.length },
          // 견줌을 거쳐 왔는지는 앞 장면이 안다 — 그 잣대를 여기서 다시 적으면
          // 같은 규칙이 algorithm 과 장면 두 곳에 놓인다.
          caption: scene.comparing ? { kind: 'take', value } : { kind: 'drain' },
        };
      }

      // 다 합쳤다. 견줌 횟수는 걸음이 실어 온 것이 아니라 장면이 세어 온 것이다.
      case 'done':
        return {
          ...scene,
          comparing: false,
          step: { kind: 'done' },
          caption: { kind: 'done', comparisons: scene.comparisons },
        };

      case 'rewind':
        return atStart({ left: scene.left, right: scene.right });

      default:
        // 이 facet 의 algorithm 은 위 넷만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
