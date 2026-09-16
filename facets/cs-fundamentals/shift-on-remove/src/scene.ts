/**
 * ShiftOnRemove 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 칸은 고정된 자리이고 값만 움직인다. 그러니 화면을 다시 그리는 데 필요한 것은
 * **어느 칸에 어느 값이 앉아 있는가** 하나다. 빈 칸이 어디인지도 거기서 나온다 —
 * 값이 없는 칸이 곧 빈 칸이다.
 *
 * 앞서 이 상태는 stage 의 `chips` 배열과 칸에 칠해진 점선 안에만 있었다. 명령
 * (`lift` · `pull`) 이 그것을 제자리에서 고쳤고 역이 없었으므로, 되짚으면 구멍이
 * 어디까지 걸어갔는지를 아무도 몰랐다.
 *
 * 좌표는 담지 않는다. 칸 수가 칸 폭을 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type ShiftCaption =
  | { kind: 'intact' }
  | { kind: 'remove'; index: number }
  | { kind: 'pull' }
  | { kind: 'result'; moved: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 캡션만 바뀐 걸음은 `null` 이다 — 흐르게 할 것이 없다.
 */
export type ShiftStep =
  | { kind: 'remove'; index: number; value: number }
  | { kind: 'pull'; from: number; to: number }
  | { kind: 'settle'; from: number };

export type ShiftOnRemoveScene = {
  /**
   * 처음 상태. `rewind` 가 여기로 돌아온다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  seed: readonly number[];
  /** 칸마다 지금 앉아 있는 값. `null` 이면 빈 칸이다. 칸 수는 변하지 않는다. */
  slots: (number | null)[];
  /** 쓰이는 구간의 길이. 이보다 뒤의 칸은 더 읽지 않는 칸이다. */
  usedLength: number;
  caption: ShiftCaption | null;
  step: ShiftStep | null;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 아무 일도 일어나지 않은 처음 장면. */
function fresh(seed: readonly number[]): ShiftOnRemoveScene {
  return {
    seed,
    slots: [...seed],
    usedLength: seed.length,
    caption: null,
    step: null,
  };
}

/** algorithm 이 보내는 **키** 를 장면이 쥘 뜻으로 옮긴다. 문안은 여기 없다 (C10). */
function readCaption(p: Record<string, unknown>): ShiftCaption | null {
  switch (p.textKey) {
    case 'caption.intact':
      return { kind: 'intact' };
    case 'caption.remove':
      return { kind: 'remove', index: num(p.index) };
    case 'caption.pull':
      return { kind: 'pull' };
    case 'caption.result':
      return { kind: 'result', moved: num(p.moved) };
    default:
      return null;
  }
}

export const shiftOnRemoveScene: ScenePlan<ShiftOnRemoveScene> = {
  /**
   * 첫 장면은 처음 늘어선 값들이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 아래 `filter` 가 새 배열을 만든다.
   */
  initial(initialData: unknown): ShiftOnRemoveScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const seed = Array.isArray(raw.values)
      ? raw.values.filter((v): v is number => typeof v === 'number')
      : [];
    return fresh(seed);
  },

  reduce(scene: ShiftOnRemoveScene, event: FacetRuntimeEvent): ShiftOnRemoveScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 캡션만 바뀌는 걸음. 흐르게 할 것이 없으므로 걸음 표식을 비운다.
      case 'caption': {
        const caption = readCaption(p);
        return caption === null ? scene : { ...scene, caption, step: null };
      }

      // 그 칸의 값이 배열 밖으로 빠져나가고 자리가 빈다.
      case 'remove': {
        const index = num(p.index);
        const sitting = scene.slots[index];
        if (sitting === null || sitting === undefined) return scene;
        const value = typeof p.value === 'number' ? p.value : sitting;
        const slots = scene.slots.slice();
        slots[index] = null;
        return { ...scene, slots, step: { kind: 'remove', index, value } };
      }

      // 빈 자리를 메우러 뒤의 값이 왼쪽으로 한 칸 옮겨 온다.
      case 'pull': {
        const from = num(p.from);
        const to = num(p.to);
        const moving = scene.slots[from];
        if (moving === null || moving === undefined) return scene;
        const slots = scene.slots.slice();
        slots[from] = null;
        slots[to] = moving;
        return { ...scene, slots, step: { kind: 'pull', from, to } };
      }

      // 칸은 그대로 남고 쓰이는 구간만 줄어든다.
      case 'settle':
        // 줄어들기 **전** 길이를 함께 싣는다. 구간 표시가 어디서 줄어드는지는
        // 출발 그림이라 `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다.
        return {
          ...scene,
          usedLength: num(p.usedLength),
          step: { kind: 'settle', from: scene.usedLength },
        };

      case 'rewind':
        return fresh(scene.seed);

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
