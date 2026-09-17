/**
 * SiftUp 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 어디에 상태를 숨겨 두었나
 *
 * 나무의 칸(자리)은 고정이고 **값만 옮겨 다닌다.** 그런데 옮긴 결과가 어디에도
 * 자료로 없었다 —
 *
 *   · `nodesBySlot` 이라는 Map 이 "어느 칸에 어느 원이 서 있나" 를 쥐고 있었고,
 *     맞바꿀 때마다 `set(parentIndex, child)` 로 갈아 끼웠다. 되짚으면 그 Map 이
 *     이미 다 굴러간 배치를 가리킨다.
 *   · 원 객체 자신이 `slot` 필드로 제가 선 칸을 들고 다녔다 — DOM 손잡이와 수치가
 *     한 객체에 묶여 있어 눈에 띄지 않는 상태였다.
 *   · `initialValues` 라는 `let` 이 되감기의 바탕을 쥐고 있었다.
 *   · **오르는 값이 어느 것인지 · 어디서 멈췄는지가 원의 칠에만 있었다.** 멈춘
 *     자리는 이 조각의 결론인데, 되감으면 그 칠과 함께 주장이 사라졌다.
 *
 * 그 넷이 전부 이 장면 안으로 올라왔다. 되짚기는 옛 장면을 그대로 다시 그리는
 * 일이라 되돌릴 것이 없다.
 *
 * 좌표는 담지 않는다. 완전 이진 트리의 인덱스 규칙(i 의 부모는 ⌊(i-1)/2⌋)이 자리를
 * 정하므로 그리는 쪽이 캔버스에서 역산한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/**
 * 이번 걸음에 견준 두 칸. **머무는 강조**다 — 다음 걸음이 덮기 전까지 화면에 남으므로
 * 정적 그리기에도 들어간다 (S-scene).
 *
 * `precedes` 가 그 견줌의 **판정**이다. 이 값이 거짓인 견줌이 곧 "여기서 멈춘다" 이고,
 * 그 판정을 원의 칠에만 두지 않으려고 장면이 들고 있다.
 */
export type SiftUpCompare = {
  readonly childIndex: number;
  readonly parentIndex: number;
  readonly precedes: boolean;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `swap` 은 두 칸 번호를 다 싣는다. 맞바꾸는 운동의 **출발 그림**이 필요한데 그것을
 * `prev` 에서 꺼내면 위반이므로 (S-scene: `prev` 는 고르는 데만), 걸음이 스스로
 * 말하게 했다 — 지금 `parentIndex` 에 선 값은 `childIndex` 에서 올라온 것이고,
 * 지금 `childIndex` 에 선 값은 `parentIndex` 에서 내려온 것이다. 그리는 쪽은 이
 * 둘만으로 출발 자리를 셈한다.
 */
export type SiftUpStep =
  | { readonly kind: 'insert'; readonly index: number }
  | { readonly kind: 'compare'; readonly childIndex: number; readonly parentIndex: number }
  | { readonly kind: 'swap'; readonly childIndex: number; readonly parentIndex: number }
  | { readonly kind: 'settle'; readonly index: number };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type SiftUpCaption =
  | { readonly kind: 'insert'; readonly value: number }
  | { readonly kind: 'compareSwap'; readonly child: number; readonly parent: number }
  | { readonly kind: 'compareStop'; readonly child: number; readonly parent: number }
  | { readonly kind: 'settle' };

export type SiftUpScene = {
  /**
   * 넣기 전 힙 배열. `rewind` 가 이것으로 돌아간다.
   *
   * 아무도 고치지 않는 공유 구조다 (S-scene 예외) — 고치면 과거가 함께 바뀐다.
   * stage 의 `let initialValues` 가 쥐고 있던 것이 이 자리로 올라왔다.
   */
  readonly base: readonly number[];
  /**
   * 칸마다 지금 앉은 값. `null` 이면 빈 칸. 길이는 `base.length + 1` 로 고정이고
   * 마지막 칸이 새 값이 처음 앉는 맨 끝자리다.
   *
   * **걸음이 고치는 것이 이것이다.** 그래서 되감기의 바탕에 넣지 않는다 (아래 `Base`).
   */
  readonly cells: readonly (number | null)[];
  /** 오르는 값이 지금 앉은 칸. 아직 넣기 전이면 `null`. */
  readonly climberIndex: number | null;
  readonly compare: SiftUpCompare | null;
  /** 더 앞서지 못하는 부모를 만나 멈춘 자리 — 이 조각의 결론이다. */
  readonly settledIndex: number | null;
  readonly step: SiftUpStep | null;
  readonly caption: SiftUpCaption | null;
};

/**
 * 되감기가 딛는 바탕.
 *
 * `cells` 를 일부러 빼 둔다. 걸음이 고치는 값을 바탕과 같은 급으로 묶어 넘기면
 * 되감은 화면이 이미 다 올라간 배치로 서고, 그 위에 algorithm 이 새로 셈한 첫 걸음이
 * 겹쳐 화면 안에서 두 배치가 어긋난다. 타입으로 막아 두면 실수로도 못 넘긴다.
 */
type Base = Pick<SiftUpScene, 'base'>;

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * 넣기 전 배열을 읽는다.
 *
 * 값을 **복사해** 담는다. 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한
 * 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readBase(initialData: unknown): number[] {
  const d = (initialData ?? {}) as { values?: unknown };
  return Array.isArray(d.values) ? d.values.map(num) : [];
}

/** 아직 아무 걸음도 밟지 않은 화면. 끝자리 한 칸이 비어 새 값을 기다린다. */
function atStart(b: Base): SiftUpScene {
  return {
    base: b.base,
    cells: [...b.base, null],
    climberIndex: null,
    compare: null,
    settledIndex: null,
    step: null,
    caption: null,
  };
}

/**
 * 칸 하나를 갈아 끼운 새 목록.
 *
 * 앞 장면의 배열을 제자리에서 고치지 않는다 — 되짚기는 지나온 장면들을 그대로 다시
 * 쓰므로, 고치면 과거가 함께 바뀐다 (S-scene).
 */
function withCell(
  cells: readonly (number | null)[],
  index: number,
  value: number | null,
): (number | null)[] {
  const next = cells.slice();
  if (index >= 0 && index < next.length) next[index] = value;
  return next;
}

export const siftUpScene: ScenePlan<SiftUpScene> = {
  /**
   * 첫 장면은 넣기 전 힙 그대로다.
   *
   * 이 조각은 `init` 이벤트를 내지 않는다 — 첫 걸음이 시작되기 전에도 나무가 서
   * 있어야 "새 값이 맨 끝자리에 앉는다" 가 성립하기 때문이다. 그래서 여기서
   * `initialData` 를 한 번 좁혀 담는다.
   */
  initial(initialData: unknown): SiftUpScene {
    return atStart({ base: readBase(initialData) });
  },

  reduce(scene: SiftUpScene, event: FacetRuntimeEvent): SiftUpScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 새 값이 맨 끝자리에 앉는다. 여기서부터 오르기 시작한다.
      case 'insert': {
        const index = Math.trunc(num(p.index));
        const value = num(p.value);
        return {
          ...scene,
          cells: withCell(scene.cells, index, value),
          climberIndex: index,
          compare: null,
          settledIndex: null,
          step: { kind: 'insert', index },
          caption: { kind: 'insert', value },
        };
      }

      // 지금 자리와 부모 자리를 견준다. 판정(`precedes`)이 곧 다음 걸음을 가른다.
      case 'compare': {
        const childIndex = Math.trunc(num(p.childIndex));
        const parentIndex = Math.trunc(num(p.parentIndex));
        const childValue = num(p.childValue);
        const parentValue = num(p.parentValue);
        const precedes = p.precedes === true;
        return {
          ...scene,
          compare: { childIndex, parentIndex, precedes },
          step: { kind: 'compare', childIndex, parentIndex },
          caption: precedes
            ? { kind: 'compareSwap', child: childValue, parent: parentValue }
            : { kind: 'compareStop', child: childValue, parent: parentValue },
        };
      }

      // 두 칸의 값이 실제로 자리를 맞바꾼다. 오르는 값이 한 칸 위로 간다.
      case 'swap': {
        const childIndex = Math.trunc(num(p.childIndex));
        const parentIndex = Math.trunc(num(p.parentIndex));
        const childValue = scene.cells[childIndex] ?? null;
        const parentValue = scene.cells[parentIndex] ?? null;
        return {
          ...scene,
          cells: withCell(withCell(scene.cells, parentIndex, childValue), childIndex, parentValue),
          climberIndex: parentIndex,
          // 견줌은 끝났다. 맞바꾸고 나면 오르는 값 하나만 짚인다.
          compare: null,
          step: { kind: 'swap', childIndex, parentIndex },
          // 캡션은 견줌이 한 말을 그대로 둔다 — 맞바꿈이 그 말의 실행이다.
          caption: scene.caption,
        };
      }

      // 결론 — 더 앞서지 못하는 부모를 만나 여기서 멈췄다.
      case 'settle': {
        const index = Math.trunc(num(p.index));
        return {
          ...scene,
          settledIndex: index,
          step: { kind: 'settle', index },
          caption: { kind: 'settle' },
        };
      }

      // 손으로 짚기 시작 — 넣기 전 나무로 돌아간다.
      case 'rewind':
        // 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지 않아
        // 좁힌 타입이 아무것도 막지 못한다.
        return atStart({ base: scene.base });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
