/**
 * TraverseFromHead 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 세로로 어긋나게 흩뿌린 노드 다섯, 그것들을 잇는 링크, 노드 아래 한 줄을 따라
 * 미끄러지는 커서 하나가 전부다. 걸음마다 달라지는 것은 커서가 어느 노드에 서
 * 있느냐와, 어디까지 지나왔느냐다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 이 조각의 상태는 **어느 `let` 에도 없었다**. 전부 화면의 칠과 속성
 * 안에만 있었고, 그래서 되짚으면 통째로 사라졌다.
 *
 * - **지나온 자취** — `markVisited(from)` 이 걸음마다 노드 테두리를 `itemSorted`
 *   로 칠했고, "몇 번째 마디까지 걸어왔는가" 가 그 칠에만 남았다. 링크의 자국
 *   (`strokeDashoffset`) 도 같다. 둘 다 **남는 강조**라 정적 그리기에 들어가야
 *   되짚었을 때 살아난다. 이제 `visited` 가 그것을 말한다.
 * - **커서 자리** — `gCursor` 의 `transform` 속성에만 있었다. 이제 `cursor`.
 * - **옮김 횟수와 그 굳힘** — `counter` 의 `textContent` 와 `fill` / `font-weight`
 *   에만 있었다. 이제 `hops` 와 `arrived`.
 * - **찾을 것을 못박았나** — 점선 테와 딱지의 `opacity` 에만 있었다. 이제 `marked`.
 *
 * 좌표는 담지 않는다. 노드 번호라는 구조만 담고 자리는 그리는 쪽이 셈한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type TraverseCaption =
  | { kind: 'want'; index: number }
  | { kind: 'noJump' }
  | { kind: 'follow' }
  | { kind: 'arrived'; index: number; hops: number; nodeCount: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `from` 을 함께 담는 까닭 — 커서의 운동과 화살의 뻗음은 **지나간 자리에서 출발**
 * 하는데, 그것을 `prev` 에서 꺼내 쓰면 "`prev` 는 고르는 데만" 을 어긴다
 * (S-scene). 그래서 출발 자리를 계기값으로 장면에 남긴다.
 */
export type TraverseStep =
  | { kind: 'mark' }
  | { kind: 'jump'; from: number; to: number }
  | { kind: 'move'; from: number }
  | { kind: 'arrive' };

export type TraverseFromHeadScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 노드에 담긴 값. 상자에 그대로 쓰인다. */
  values: number[];
  /** 찾아갈 노드의 번호. */
  targetIndex: number;

  /** 찾을 것에 점선 테와 딱지가 섰나. */
  marked: boolean;
  /** 커서가 서 있는 노드 번호. */
  cursor: number;
  /**
   * 커서가 떠나온 노드들. **남는 강조**다.
   *
   * 여기까지 걸어왔다는 것이 이 조각의 주장이므로 정적으로 그릴 때도 넣는다.
   * 노드 `i` 가 들어 있으면 `i → i+1` 링크의 자국도 함께 자라 있다.
   */
  visited: number[];
  /** 지금까지 옮긴 횟수. */
  hops: number;
  /** 목표에 닿아 셈이 굳었나. 완료 상태 자체가 정보다 (S-piece). */
  arrived: boolean;
  step: TraverseStep | null;
  caption: TraverseCaption | null;
};

/** 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다. */
type TraverseBase = Pick<TraverseFromHeadScene, 'values' | 'targetIndex'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: TraverseBase): TraverseFromHeadScene {
  return {
    values: base.values,
    targetIndex: base.targetIndex,
    marked: false,
    cursor: 0,
    visited: [],
    hops: 0,
    arrived: false,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

/**
 * 떠나온 노드를 자취에 더한다.
 *
 * 앞 장면의 배열을 제자리에서 고치지 않는다 — 되짚기는 지나온 장면들을 그대로
 * 다시 쓰므로, 고치면 과거가 함께 바뀐다.
 */
function withVisited(scene: TraverseFromHeadScene, index: number): number[] {
  return scene.visited.includes(index) ? scene.visited : [...scene.visited, index];
}

export const traverseFromHeadScene: ScenePlan<TraverseFromHeadScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene). `nums` 가 새 배열을 낸다.
   */
  initial(initialData: unknown): TraverseFromHeadScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({
      values: nums(d.values),
      targetIndex: num(d.targetIndex, 0),
    });
  },

  reduce(scene: TraverseFromHeadScene, event: FacetRuntimeEvent): TraverseFromHeadScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 찾아갈 노드를 못박는다. 테가 조여들고 딱지가 내려앉는다.
      case 'mark': {
        const index = num(p.index, scene.targetIndex);
        return {
          ...scene,
          marked: true,
          step: { kind: 'mark' },
          caption: { kind: 'want', index },
        };
      }

      // 곧장 건너뛰어 본다 — 셈할 주소가 없어 되돌아온다. 화면에 남는 것은 없다.
      case 'jump-attempt':
        return {
          ...scene,
          step: { kind: 'jump', from: num(p.from, scene.cursor), to: num(p.to, scene.targetIndex) },
          caption: { kind: 'noJump' },
        };

      // 링크 하나를 따라 옮겨 간다. 떠나온 노드가 자취로 남는다.
      case 'cursor-move': {
        const from = num(p.from, scene.cursor);
        const to = num(p.to, scene.cursor);
        return {
          ...scene,
          cursor: to,
          visited: withVisited(scene, from),
          hops: num(p.hops, scene.hops + 1),
          step: { kind: 'move', from },
          caption: { kind: 'follow' },
        };
      }

      // 도착. 찾던 노드가 한 번 부풀었다 가라앉고 셈이 굳는다.
      case 'done': {
        const index = num(p.index, scene.targetIndex);
        const hops = num(p.hops, scene.hops);
        return {
          ...scene,
          arrived: true,
          hops,
          step: { kind: 'arrive' },
          caption: { kind: 'arrived', index, hops, nodeCount: num(p.visited, hops + 1) },
        };
      }

      case 'rewind':
        return atStart(scene);

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
