/**
 * traversalOrder 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 하려는 말
 *
 * 같은 나무를 세 차례 밟는다. 발이 지나는 길은 세 번 다 똑같고, 달라지는 것은
 * "제 자리를 밟았다" 고 세는 접점 하나뿐이다. 그래서 **나온 차례들**이 쌓여
 * 나란히 서는 것이 이 조각의 결론이다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 projector 에는 `let` 이 하나도 없었다. 상태는 전부 stage 안에 있었고,
 * **그중 여럿은 어느 이벤트에도 실리지 않아** 걸음을 처음부터 다시 밟아야만
 * 복원됐다.
 *
 * - **결과 세 줄의 내용** — `cell.text.textContent` 와 칸의 칠. **이 조각의 결론
 *   자체가 DOM 에만 있었다.** 되짚으면 세 줄이 통째로 비어 조각이 할 말을 잃는다.
 *   이제 `rows` 가 말한다.
 * - **줄의 형편** — `row.group.style.opacity` 하나에 네 뜻(`아직` · `지금` ·
 *   `마쳤다` · `다 마쳤다`)이 겹쳐 있었다. 이제 `cursor` · `walking` · `rows` ·
 *   `concluded` 에서 파생한다.
 * - **표식이 앉은 접점** — `mark.style.transform`. **이 조각의 주장 그 자체인데**
 *   `beginOrder` 명령만이 그것을 정했다. 이제 `cursor` 가 가리키는 줄의 차례에서
 *   파생한다.
 * - **발 자리** — `foot.style.transform`. 되감아 세운 직후에는 옛 화면의 것이라
 *   다음 이동의 출발이 틀어진다 (프로토콜 3-1 의 ④). 이제 `path` 의 끝이 말한다.
 * - **자취** — `trailPts: Pt[]` 와 `trailPath` 의 `d`. 좌표 배열로 쌓여 있었다.
 *   장면은 좌표를 담지 않으므로 (S-piece) 밟은 **접점 목록**만 담고 선은 그리는
 *   쪽이 셈한다.
 * - **`lastTouched: number | null`** — 지금 물든 노드. 되돌리는 명령
 *   (`paintNode(lastTouched, 'idle')`) 이 세 곳에 흩어져 있었다. 장면이 `path` 의
 *   끝을 말하므로 그 코드가 통째로 사라진다.
 * - **`'idle' | 'passing' | 'stamped'`** — 선언만 있고 **값이 어디에도 저장되지
 *   않는** 상태였다. 칠에만 쓰였다 (프로토콜 3-1 의 ⑤). `path` 끝의 `counted` 가
 *   그것을 정한다.
 *
 * ── 같은 수를 두 자리에서 세지 않는다
 *
 * `record` 이벤트는 값이 떨어질 칸 번호를 싣지 않는다. 그 칸은 **그 줄에 이미
 * 몇이 앉았나** 이고, 그것은 장면의 `rows[cursor].length` 다. algorithm 이 따로
 * 세던 `filled` 를 걷어냈다 — 두 자리에서 세면 언젠가 갈린다.
 *
 * 마찬가지로 `record` 의 `order` 도 쓰지 않는다. 어느 줄에 떨어지는지는 `cursor`
 * 가 이미 말한다.
 *
 * ── 좌표도 문안도 담지 않는다
 *
 * 노드의 자리는 값의 인덱스와 깊이가 정하고, 접점은 노드 중심에서의 방향이 정한다.
 * 전부 그리는 쪽이 캔버스에서 역산한다 (S-piece). 캡션은 `cursor` 와 `concluded`
 * 에서 파생되는 것이라 필드로 두지 않고, 문자는 stage 가 `params.t` 로 만든다
 * (C10).
 */

import { parseTarget, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';
import { isTraversalMoment, type TraversalMoment } from './algorithm.js';

/**
 * 발이 밟은 접점 하나.
 *
 * `counted` 는 이번 차례가 세기로 한 접점이라는 뜻이다. 지나가기만 하는 접점과
 * 칠이 갈린다 — 채움은 *세었다*, 테두리는 *스쳐 갔다*.
 */
export type TraversalOrderTouch = {
  /** 밟은 노드의 값. 값이 곧 이름이라 이것으로 자리를 찾는다. */
  value: number;
  /** 노드의 세 접점 중 어디인가 — 왼쪽 · 아래 · 오른쪽. */
  moment: TraversalMoment;
  /** 이번 차례가 세는 접점인가. */
  counted: boolean;
};

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 출발 그림은 `prev` 에서 꺼내지 않는다 (S-scene). 발의 출발은 `path` 의 끝에서
 * 하나 앞이고 값이 떨어질 자리는 `rows` 의 길이라, 전부 `next` 에서 되셈된다.
 * 되셈으로 못 얻는 것이 하나 있어 그것만 계기값으로 싣는다 — 표식이 **어느
 * 접점에서** 옮겨 오는가.
 */
export type TraversalOrderStep =
  /** 한 차례가 시작된다. 표식 일곱이 `from` 에서 지금 차례의 접점으로 옮겨 간다. */
  | { kind: 'begin'; from: TraversalMoment | null }
  /** 발이 접점 하나에 닿았다. 자취가 그만큼 늘어난다. */
  | { kind: 'touch' }
  /** 세는 접점이었으므로 값이 나무에서 줄의 칸으로 떨어진다. */
  | { kind: 'record'; value: number }
  /** 한 차례를 마치고 발이 들머리로 돌아간다. 한 바퀴가 닫힌다. */
  | { kind: 'end' }
  /** 세 차례를 다 마쳤다. 세 줄이 나란히 남는다. */
  | { kind: 'done' };

export type TraversalOrderScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 레벨 순서로 적은 완전 이진 트리. 인덱스 i 의 자식은 2i+1 / 2i+2. */
  values: readonly number[];
  /** 밟아 볼 차례들. 배열 순서가 곧 결과 줄의 순서다. */
  orders: readonly TraversalMoment[];

  // ── 걸어온 자취.
  /**
   * 지금(또는 마지막으로) 밟는 줄. 표식이 앉은 접점은 `orders[cursor]` 다.
   * `done` 에서 `null` 이 되어 표식·발·자취가 함께 걷힌다.
   */
  cursor: number | null;
  /** 발이 나무 위에 있나. 한 차례를 마치면 거짓이 되고 표식만 남는다. */
  walking: boolean;
  /** 이번 차례에 밟아 온 접점들. 자취와 발 자리가 여기서 나온다. */
  path: readonly TraversalOrderTouch[];
  /** 차례마다의 결과 줄. **길이가 곧 다음 값이 앉을 칸이다.** */
  rows: readonly (readonly number[])[];
  /** 세 차례를 다 마쳤나. 세 줄이 같은 밝기로 서는 결론. */
  concluded: boolean;
  step: TraversalOrderStep | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * 결과 줄도 자취도 **여기 들지 않는다** — 전부 걸어오며 쌓은 것이라 되감기에
 * 그대로 넘기면 되감은 화면이 이미 세 줄을 다 채운 채로 선다. 바탕은 나무와
 * 차례 목록뿐이고, 이 조각에서 변하지 않는 것도 그 둘뿐이다.
 */
type TraversalOrderBase = Pick<TraversalOrderScene, 'values' | 'orders'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: TraversalOrderBase): TraversalOrderScene {
  return {
    values: base.values,
    orders: base.orders,
    cursor: null,
    walking: false,
    path: [],
    rows: base.orders.map(() => []),
    concluded: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 넘겨받은 배열을 쥐지 않고 값만 베껴 담는다 (S-scene 의 참조 금지). */
function nums(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function moments(value: unknown): TraversalMoment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isTraversalMoment);
}

/** `node:<값>` 하나를 값으로 되돌린다. 식별자 파싱은 parseTarget 을 경유한다. */
function nodeValue(target: FacetRuntimeEvent['target']): number | null {
  const raw = Array.isArray(target) ? target[0] : target;
  if (typeof raw !== 'string') return null;
  const parsed = parseTarget(raw);
  if (parsed === null || parsed.prefix !== 'node') return null;
  return num(Number(parsed.id));
}

/** 지금 표식이 앉은 접점. `cursor` 가 가리키는 줄의 차례다. */
export function activeOrderOf(scene: TraversalOrderScene): TraversalMoment | null {
  if (scene.cursor === null) return null;
  return scene.orders[scene.cursor] ?? null;
}

export const traversalOrderScene: ScenePlan<TraversalOrderScene> = {
  /**
   * 첫 장면은 나무와 빈 줄 셋만 세운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만
   * 넘겨받은 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게
   * 된다 (S-scene).
   */
  initial(initialData: unknown): TraversalOrderScene {
    const d = (initialData ?? {}) as { values?: unknown; orders?: unknown };
    return atStart({ values: nums(d.values), orders: moments(d.orders) });
  },

  reduce(scene: TraversalOrderScene, event: FacetRuntimeEvent): TraversalOrderScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 한 차례가 시작된다. 표식 일곱이 이번 차례의 접점으로 옮겨 간다 — 이
      // 움직임 하나에 조각이 하는 말이 다 들어 있다.
      case 'order-begin': {
        const index = num(p.index);
        if (index === null || index < 0 || index >= scene.orders.length) return scene;
        return {
          ...scene,
          cursor: index,
          walking: true,
          path: [],
          // 다시 밟는 줄은 비우고 시작한다. 되감아 처음부터 짚을 때의 길이다.
          rows: scene.rows.map((row, r) => (r === index ? [] : row)),
          concluded: false,
          step: { kind: 'begin', from: activeOrderOf(scene) },
        };
      }

      // 발이 접점 하나에 닿았다. 자취가 그만큼 늘어난다.
      case 'touch': {
        const value = nodeValue(event.target);
        const moment = isTraversalMoment(p.moment) ? p.moment : null;
        if (value === null || moment === null) return scene;
        return {
          ...scene,
          walking: true,
          path: [...scene.path, { value, moment, counted: p.counted === true }],
          step: { kind: 'touch' },
        };
      }

      // 세는 접점이었으므로 값이 그 줄로 떨어진다. **앉을 칸은 그 줄의 길이다**
      // — payload 가 실어 온 번호를 다시 세지 않는다.
      case 'record': {
        const value = num(p.value) ?? nodeValue(event.target);
        const cursor = scene.cursor;
        if (value === null || cursor === null) return scene;
        return {
          ...scene,
          rows: scene.rows.map((row, r) => (r === cursor ? [...row, value] : row)),
          step: { kind: 'record', value },
        };
      }

      // 한 바퀴가 닫힌다. 발은 들머리로 돌아가지만 표식은 그대로 남는다.
      case 'order-end':
        return { ...scene, walking: false, step: { kind: 'end' } };

      // 세 줄이 나란히 선다. 견주는 것이 이 조각의 결론이다.
      case 'done':
        return { ...scene, cursor: null, walking: false, concluded: true, step: { kind: 'done' } };

      case 'rewind':
        return atStart({ values: scene.values, orders: scene.orders });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
