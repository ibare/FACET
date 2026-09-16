/**
 * HeapSortExtract 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 칸 다섯짜리 줄 하나가 전부다. 칸은 붙박여 있고 **값만 움직인다.** 줄 안쪽 어딘가에
 * 경계가 서 있어 왼쪽이 아직 다룰 힙, 오른쪽이 이미 끝난 꼬리다. 그러니 화면을 다시
 * 그리는 데 필요한 것은 **어느 칸에 어느 값이 앉아 있는가** 와 **힙이 어디까지인가**,
 * 그리고 **지금 공중에 뜬 값** 이 전부다.
 *
 * 앞서 이 셋은 stage 안에만 있었다 — `let slots` · `let boundary` · `let flying`,
 * 거기에 칸을 감추는 `const hidden = new Set<number>()` (const 로 묶였을 뿐 알맹이는
 * 걸음마다 고쳐졌다) 와 옮겨 앉는 중인 `let movers` 가 붙어 있었다. 명령
 * (`reset` · `liftTop` · `placeAndShrink` · `finish`) 이 그것을 제자리에서 고쳤고
 * 역이 없었다. 되감을 바탕은 projector 의 `let initialValues` 에 따로 있었다.
 *
 * ── 이 조각의 주장은 **정렬된 꼬리가 한 칸씩 자란다** 이다
 *
 * 꺼낸 값이 뒤쪽에 쌓이며 경계가 물러나는 그 **누적**이 다 끝난 화면에 남아야 한다.
 * `heapSize` 하나가 그것을 말한다 — `heapSize..n-1` 이 꼬리이고, 꼬리에 한 칸이
 * 더해진 자국이 자 위에 도막으로 남는다 (`done` 에서 `heapSize` 가 0 이 되어
 * 줄 전체가 다섯 도막이 된 채 끝난다).
 *
 * 그래서 **꼬리 여부는 채움**(값의 형편), **꼭대기 표식은 테두리**(짚음의 표식)로
 * 갈라 둔다. 고른 쪽을 채움으로 칠하면 값이 자리를 옮긴 뒤 그 자리에 다른 값이
 * 앉아 읽기가 뒤집힌다.
 *
 * 좌표는 담지 않는다. 칸 번호가 좌표를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { extractTop } from './algorithm.js';

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type HeapSortExtractCaption =
  | { kind: 'heap' }
  | { kind: 'take'; value: number }
  | { kind: 'place'; value: number }
  | { kind: 'done' };

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 그림**도
 * 여기서 셈한다.
 *
 * 값이 실제로 자리를 옮기는 조각이라 출발 그림이 꼭 필요하다. 그것을 `prev` 에서
 * 꺼내면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene), 어느 칸에서 어느 칸으로
 * 갔는지를 걸음이 `order` 로 실어 온다. 나머지는 장면에서 셈으로 나온다 —
 * 직전 경계는 `heapSize + 1`, 떠 있던 값은 `slots[heapSize]` 다.
 */
export type HeapSortExtractStep =
  /** 되돌린 줄이 힙임을 긋는다. 흐를 것이 없어 얇은 걸음이라, 자가 그어지는 것으로 말한다. */
  | { kind: 'shown' }
  /** 꼭대기가 줄 위로 떠오른다. 떠오른 값은 `lifted` 가 말한다. */
  | { kind: 'lift' }
  /** 경계가 한 칸 물러난다. `order[i]` 는 지금 i 번 칸의 값이 **직전에 있던 칸**. */
  | { kind: 'place'; order: readonly number[] }
  /** 마지막 한 칸도 제자리다. 경계가 맨 왼쪽까지 간다. */
  | { kind: 'finish' };

export type HeapSortExtractScene = {
  /**
   * 처음 줄. `rewind` 가 여기로 돌아오고, 칸 수와 칸 너비도 이 길이가 정한다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly origin: readonly number[];
  /** 칸마다 지금 앉아 있는 값. 길이는 `origin` 과 같다 — 줄은 줄지 않는다. */
  readonly slots: readonly number[];
  /**
   * 힙이 차지한 앞쪽 길이. 힙은 `0..heapSize-1`, **정렬된 꼬리는 `heapSize..n-1`** 다.
   *
   * 꼬리가 자란 누적이 이 수 하나에 있다. 꼬리를 따로 목록으로 두지 않는다 —
   * 같은 물음에 답이 둘이 된다.
   */
  readonly heapSize: number;
  /** 줄 위로 떠올라 아직 어느 칸에도 앉지 않은 값. 없으면 `null`. */
  readonly lifted: number | null;
  readonly step: HeapSortExtractStep | null;
  readonly caption: HeapSortExtractCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `slots` · `heapSize` · `lifted` 를 여기 넣지 않는다. 그것들은 걸음이 고치는
 * 자취라, 바탕으로 묶어 되감기에 넘기면 되감은 줄이 이미 다 굴러간 채로 서고 그
 * 위에 algorithm 이 처음부터 다시 밟는다. 타입으로 좁혀 구조적으로 못 넘어가게 한다.
 */
type HeapSortExtractBase = Pick<HeapSortExtractScene, 'origin'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: HeapSortExtractBase): HeapSortExtractScene {
  return {
    origin: base.origin,
    slots: [...base.origin],
    heapSize: base.origin.length,
    lifted: null,
    step: null,
    caption: null,
  };
}

export const heapSortExtractScene: ScenePlan<HeapSortExtractScene> = {
  /**
   * 첫 장면은 처음 늘어선 최대 힙이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 아래 `filter` 가 새 배열을 만든다.
   */
  initial(initialData: unknown): HeapSortExtractScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const origin = Array.isArray(raw.values)
      ? raw.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : [];
    return atStart({ origin });
  },

  reduce(scene: HeapSortExtractScene, event: FacetRuntimeEvent): HeapSortExtractScene {
    switch (event.type) {
      // 되돌린 줄이 최대 힙이다. 화면은 그대로고 말만 붙는다 — 얇은 걸음이라
      // 그리는 쪽이 자를 그어 보인다.
      case 'heap-shown':
        return { ...scene, step: { kind: 'shown' }, caption: { kind: 'heap' } };

      // 꼭대기 값이 줄 위로 떠오른다. 칸에서 빼내지 않는다 — 어느 칸의 값인지는
      // 그대로 두고, 공중에 있다는 사실만 `lifted` 가 말한다.
      case 'top-lifted': {
        const value = scene.slots[0];
        if (scene.heapSize < 1 || typeof value !== 'number') return scene;
        return {
          ...scene,
          lifted: value,
          step: { kind: 'lift' },
          caption: { kind: 'take', value },
        };
      }

      // 힙이 마지막 칸을 내놓는다. 떠 있던 값이 그 칸에 앉고 남은 힙이 모양을
      // 되찾는다. 그 자리바꿈은 algorithm 이 내준 순수 함수가 셈한다 — 걸음이
      // 실어 오지 않으므로 같은 물음에 답이 하나뿐이다.
      case 'boundary-moved': {
        if (scene.lifted === null || scene.heapSize < 2) return scene;
        const { values, order } = extractTop(scene.slots, scene.heapSize);
        return {
          ...scene,
          slots: values,
          heapSize: scene.heapSize - 1,
          lifted: null,
          step: { kind: 'place', order },
          caption: { kind: 'place', value: scene.lifted },
        };
      }

      // 한 칸만 남았으면 그것도 이미 제자리다. 꼬리가 줄 전체가 된다.
      case 'done':
        return {
          ...scene,
          heapSize: 0,
          lifted: null,
          step: { kind: 'finish' },
          caption: { kind: 'done' },
        };

      case 'rewind':
        return atStart({ origin: scene.origin });

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
