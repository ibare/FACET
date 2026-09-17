/**
 * SiftDown 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 나무의 자리는 고정돼 있고 **값만 움직인다.** 꼭대기가 빠져 옆으로 물리고, 맨 끝
 * 값이 빈 자리로 올라오고, 두 자식 중 앞선 쪽과 맞바꾸며 내려간다. 그러니 화면을
 * 다시 그리는 데 필요한 것은 **어느 자리에 어느 값이 앉아 있는가** 와 **나무가
 * 어디까지인가**, 그리고 **옆에 물려 둔 값** 이다.
 *
 * 앞서 이 상태는 stage 의 `slots: Map<number, Slot>` 안에만 있었다. `Slot` 이
 * DOM 손잡이와 `value` · `x` · `y` 를 한 객체에 묶어 쥐고 있었고, 명령
 * (`extract` · `fill` · `swap`) 이 그것을 제자리에서 고쳤으며 역이 없었다.
 * 나무가 한 자리 줄었다는 사실은 `edges` Map 에서 선 하나를 지운 것으로만 남았고,
 * 빈 자리는 `ghosts` Map 에, 되감을 바탕은 `originalValues` 에 있었다.
 *
 * ── 이 조각의 요점은 **누구와 견주어 누구와 바꿨는가** 다
 *
 * 그 판단이 화면의 칠로만 남으면 되짚었을 때 "왜 그쪽으로 갔는지" 가 사라진다.
 * 그래서 `compared` 가 견준 짝(`left` · `right`)과 고른 쪽(`winner`), 그리고 그
 * 견줌 뒤에 실제로 자리를 바꿨는지(`moved`)까지 담는다. 맞바꿈이 일어난 뒤에도
 * 남아 있어, 내려간 길이 어느 변이었는지를 장면이 스스로 말한다.
 *
 * 좌표는 담지 않는다. 자리 번호가 완전이진트리의 좌표를 정하므로 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import { toIndexArray, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

/**
 * 견준 짝과 고른 쪽. **머문다** — 맞바꾼 뒤에도 남아 내려간 길을 설명한다.
 *
 * 자리 번호로 담는다. 값은 걸음마다 자리를 옮기지만 "이 두 자리를 견주었다" 는
 * 사실은 그 걸음에 붙박여 있다.
 */
export type SiftDownCompared = {
  /** 견주는 쪽 — 지금 내려가는 값이 앉은 자리. */
  readonly parent: number;
  /** 왼쪽 자식 자리. */
  readonly left: number;
  /** 오른쪽 자식 자리. 자식이 하나뿐이면 `null`. */
  readonly right: number | null;
  /** 더 작은(앞선) 자식의 자리. */
  readonly winner: number;
  /** 이 견줌 끝에 실제로 맞바꿔 내려갔나. 거짓이면 부모가 더 앞서 멈춘 것이다. */
  readonly moved: boolean;
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type SiftDownCaption =
  | { kind: 'extract'; value: number }
  | { kind: 'fill'; value: number }
  | { kind: 'compareTwo'; leftValue: number; rightValue: number; winnerValue: number }
  | { kind: 'compareOne'; leftValue: number }
  | { kind: 'swap' }
  | { kind: 'settle' };

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 그림**도
 * 여기서 셈한다.
 *
 * 값이 실제로 자리를 옮기는 조각이라 출발 그림이 꼭 필요하다. 그것을 `prev` 에서
 * 꺼내면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene), 어느 자리에서 어느 자리로
 * 갔는지를 걸음이 실어 온다.
 */
export type SiftDownStep =
  | { kind: 'extract'; from: number }
  | { kind: 'fill'; from: number; to: number }
  | { kind: 'compare'; left: number; right: number | null }
  | { kind: 'swap'; a: number; b: number }
  | { kind: 'settle'; index: number };

export type SiftDownScene = {
  /**
   * 처음 배치. `rewind` 가 여기로 돌아오고, 나무의 기하(깊이·칸 너비·마디 크기)도
   * 여기 길이가 정한다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly origin: readonly number[];
  /** 지금 나무에 남은 자리 수. 변을 어디까지 그릴지가 여기서 나온다. */
  readonly size: number;
  /** 자리마다 지금 앉아 있는 값. `null` 이면 비어 있는 자리다. 길이는 `size`. */
  readonly values: readonly (number | null)[];
  /** 나무에서 빼내 옆에 물려 둔 값. 없으면 `null`. */
  readonly aside: number | null;
  /** 지금 내려가는 값이 앉은 자리. 없으면 `null`. */
  readonly sinking: number | null;
  /** 견준 짝과 고른 쪽. **남는 강조**다 (S-scene). */
  readonly compared: SiftDownCompared | null;
  /** 더 내려가지 않기로 한 자리. **남는 강조**다. */
  readonly settled: number | null;
  readonly step: SiftDownStep | null;
  readonly caption: SiftDownCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `values` · `size` · `aside` 를 여기 넣지 않는다. 그것들은 걸음이 고치는 자취라,
 * 바탕으로 묶어 되감기에 넘기면 되감은 나무가 이미 한 칸 줄고 값이 다 굴러간 채로
 * 서고 그 위에 algorithm 이 처음부터 다시 밟는다 — 화면 안에서 두 배치가 어긋난다.
 * 타입으로 좁혀 두어 구조적으로 못 넘어가게 한다.
 */
type SiftDownBase = Pick<SiftDownScene, 'origin'>;

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: SiftDownBase): SiftDownScene {
  return {
    origin: base.origin,
    size: base.origin.length,
    values: [...base.origin],
    aside: null,
    sinking: null,
    compared: null,
    settled: null,
    step: null,
    caption: null,
  };
}

/** 그 자리에 앉은 값. 빈 자리거나 나무 밖이면 `null`. */
function valueAt(scene: SiftDownScene, index: number): number | null {
  const v = scene.values[index];
  return typeof v === 'number' ? v : null;
}

export const siftDownScene: ScenePlan<SiftDownScene> = {
  /**
   * 첫 장면은 처음 늘어선 최소 힙이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 아래 `filter` 가 새 배열을 만든다.
   */
  initial(initialData: unknown): SiftDownScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const origin = Array.isArray(raw.values)
      ? raw.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : [];
    return atStart({ origin });
  },

  reduce(scene: SiftDownScene, event: FacetRuntimeEvent): SiftDownScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 꼭대기 값이 힙에서 빠져 옆으로 물린다. 그 자리가 빈다.
      // target 파싱은 `toIndexArray` 를 경유한다 (원칙 4).
      case 'extract': {
        const index = toIndexArray(event.target)[0];
        if (typeof index !== 'number') return scene;
        const leaving = valueAt(scene, index);
        if (leaving === null) return scene;
        const values = scene.values.slice();
        values[index] = null;
        return {
          ...scene,
          values,
          aside: leaving,
          sinking: null,
          compared: null,
          settled: null,
          step: { kind: 'extract', from: index },
          caption: { kind: 'extract', value: leaving },
        };
      }

      // 맨 끝 값이 빈 자리로 올라온다. 나무는 그만큼 한 자리 짧아진다.
      case 'fill': {
        const from = num(p.from);
        const to = num(p.to);
        const moving = valueAt(scene, from);
        if (moving === null || from <= to) return scene;
        const values = scene.values.slice();
        values[to] = moving;
        // 맨 끝 자리는 나무에서 빠진다 — 그 자리로 가는 변도 함께 없어진다.
        values.length = from;
        return {
          ...scene,
          size: from,
          values,
          sinking: to,
          compared: null,
          settled: null,
          step: { kind: 'fill', from, to },
          caption: { kind: 'fill', value: moving },
        };
      }

      // 두 자식(또는 하나뿐인 자식)을 견주어 앞선 쪽을 고른다.
      case 'compare': {
        const parent = num(p.parent);
        const left = num(p.left);
        const winner = num(p.winner);
        const right = typeof p.right === 'number' && Number.isFinite(p.right) ? p.right : null;
        const leftValue = valueAt(scene, left);
        if (leftValue === null) return scene;
        const rightValue = right === null ? null : valueAt(scene, right);
        const winnerValue = valueAt(scene, winner);
        return {
          ...scene,
          sinking: parent,
          settled: null,
          compared: { parent, left, right, winner, moved: false },
          step: { kind: 'compare', left, right },
          caption:
            rightValue === null
              ? { kind: 'compareOne', leftValue }
              : { kind: 'compareTwo', leftValue, rightValue, winnerValue: winnerValue ?? leftValue },
        };
      }

      // 고른 자식과 자리를 맞바꾸며 한 칸 내려간다. 견준 표식은 지우지 않는다 —
      // 그것이 지워지면 "왜 그쪽으로 갔는지" 가 화면에서 사라진다.
      case 'swap': {
        const a = num(p.a);
        const b = num(p.b);
        const up = valueAt(scene, b);
        const down = valueAt(scene, a);
        if (up === null || down === null || a === b) return scene;
        const values = scene.values.slice();
        values[a] = up;
        values[b] = down;
        return {
          ...scene,
          values,
          sinking: b,
          compared: scene.compared === null ? null : { ...scene.compared, moved: true },
          step: { kind: 'swap', a, b },
          caption: { kind: 'swap' },
        };
      }

      // 여기서 멈춘다. 이 자리를 두고 한 견줌만 남기고 지난 견줌은 거둔다 —
      // 한 칸 위에서 한 견줌은 이 자리를 설명하지 못한다.
      case 'settle': {
        const index = num(p.index);
        const kept = scene.compared !== null && scene.compared.parent === index ? scene.compared : null;
        return {
          ...scene,
          sinking: index,
          settled: index,
          compared: kept,
          step: { kind: 'settle', index },
          caption: { kind: 'settle' },
        };
      }

      case 'rewind':
        return atStart({ origin: scene.origin });

      default:
        // 이 facet 의 algorithm 은 위 여섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
