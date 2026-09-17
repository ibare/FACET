/**
 * FindRoot 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`packages/core/src/runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **자기 자신을 가리키는 자리에 닿을 때까지 몇 번 올라갔는가.** 그러니 화면이
 * 반드시 쥐고 있어야 하는 것은 **올라온 길**이다. 길이 있으면 올라간 횟수도,
 * 어느 곡선을 탔는지도, 어느 이름에 닿았는지도 거기서 나온다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * - **stage 의 `let currentPath`** — 지금 오르는 길. 결과 딱지의 `3→1→0` 이 여기서
 *   나왔는데, 딱지를 그리고 나면 그 길이 화면 어디에도 남지 않았다. 이제 `climbing`
 *   과 `walks[].path` 가 쥔다. **올라간 횟수는 이 길의 길이에서만 나온다** —
 *   payload 가 수를 따로 실어 오면 언젠가 두 수가 갈린다.
 * - **stage 의 `let currentWalkArcKeys`** — 이번 오름이 물들인 곡선들. `colorizeGroup`
 *   이 그것을 무리 색으로 다시 칠해 화면에 **남겼는데**, 그 근거가 이 배열뿐이라
 *   되감으면 통째로 사라졌다. 이제 길에서 파생된다 (남는 강조).
 * - **동그라미 테두리와 곡선의 칠** — "어느 자리가 어느 무리에 들었나" 가
 *   `stroke` 속성 안에만 있었다. `let` 도 `Set.has` 도 아니라 grep 에 안 걸리는
 *   자리다 (3-1 의 ⑤). 이제 `walks` + `roots` 에서 파생된다.
 * - **stage 의 `let resultChipCount`** — 딱지가 몇 장 놓였나. 딱지의 가로 자리를
 *   정하던 셈이다. 이제 `walks.length` 가 그것을 말한다.
 * - **마커의 `opacity` 와 `cx`/`cy`** — 지금 어느 자리에 서 있나. 이제 `climbing`
 *   이 `null` 이면 서 있지 않고, 아니면 그 끝이 선 자리다.
 * - **projector 의 `let rootByStart`** — start 자리가 닿은 이름. 비교 캡션이 그것을
 *   말하는 데 썼다. 이제 `walks` 에서 `rootOfStart` 로 찾는다.
 * - **projector 의 `let groupCount`** — 지금까지 드러난 무리 수. `categorical(n)` 의
 *   씨앗이라 **걸음마다 자라며 같은 무리의 색을 바꿔 놓았다.** 이제 `nameCount` 가
 *   바탕 자료에서 한 번에 셈한다 — 색이 걸음을 타지 않는다.
 *
 * ── 같은 수를 두 자리에서 세지 않는다
 *
 * 옮기기 전 `hop` 은 `to` 를, `root-reached` 는 `start`·`node`·`groupIndex` 를,
 * `compare` 는 `same` 을 실어 왔다. 다섯 다 **장면이 스스로 셀 수 있는 것**이다 —
 * 오르는 곳은 `parent[from]` 이고, 뿌리와 출발 자리는 올라온 길의 양 끝이며,
 * 무리 번호는 이름이 드러난 차례이고, 한 무리인지는 두 이름이 같은지다. 항이 두
 * 출처에서 오면 언젠가 갈리고, 갈리는 날 화면이 스스로 거짓이 된다.
 *
 * 좌표는 담지 않는다. 자리 수와 가리킴이 배치를 정하므로 `render` 가 셈한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 끝난 오름 하나.
 *
 * `path[0]` 이 출발 자리이고 마지막이 닿은 뿌리(=이름)다. **올라간 횟수는 이
 * 배열의 길이에서만 낸다** (`hopsOf`).
 */
export type FindRootWalk = {
  start: number;
  path: number[];
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type FindRootCaption =
  | { kind: 'start'; node: number }
  | { kind: 'hop'; from: number }
  | { kind: 'root'; node: number }
  | { kind: 'compare'; a: number; b: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `hop` 이 **출발 자리를 함께 싣는 까닭** — 마커가 곡선을 타는 운동은 떠나온
 * 자리에서 출발하는데, 그것을 `prev` 에서 꺼내 쓰면 "`prev` 는 고르는 데만" 을
 * 어긴다 (S-scene). 닿을 곳은 싣지 않는다 — `parent[from]` 이 정본이다.
 */
export type FindRootStep =
  | { kind: 'start'; node: number }
  | { kind: 'hop'; from: number }
  | { kind: 'root'; node: number }
  | { kind: 'compare'; a: number; b: number };

export type FindRootScene = {
  /** 자리마다 가리키는 자리. `parent[i] === i` 면 자기 자신 — 뿌리. 바탕. */
  parent: number[];
  /** 차례로 올라가 볼 시작 자리들. 딱지가 설 칸 수를 정한다. 바탕. */
  queries: number[];
  /** 끝난 오름들, 차례대로. 길과 딱지가 여기서 나온다. 남는 강조. */
  walks: FindRootWalk[];
  /**
   * 지금 오르는 중인 길. `null` 이면 마커가 서 있지 않다.
   *
   * 첫 칸이 출발 자리, 끝이 마커가 선 자리다. 뿌리에 닿으면 통째로 `walks` 로
   * 옮겨 가고 여기는 비워진다.
   */
  climbing: number[] | null;
  /** 이름(뿌리)이 드러난 차례. 무리 색의 번호를 여기서 낸다 — 셈의 정본. */
  roots: number[];
  caption: FindRootCaption | null;
  step: FindRootStep | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면과 되감기가 함께 쓴다.
 *
 * **`walks`·`climbing`·`roots` 를 여기 넣지 않는다.** 셋은 걸어온 자취이지 바탕이
 * 아니다. 넣어 두면 되감은 화면이 이미 다 올라간 꼴로 서고 그 위에 algorithm 이
 * 처음부터 다시 오르므로, 화면 안에서 두 이야기가 어긋난다 (S-scene).
 */
type FindRootBase = Pick<FindRootScene, 'parent' | 'queries'>;

/**
 * 바탕만 남기고 걸어온 자취를 거둔 장면.
 *
 * 부르는 쪽은 **객체 리터럴**로 넘긴다 — 변수를 넘기면 TypeScript 의 초과 속성
 * 검사가 돌지 않아 좁힌 타입이 아무것도 막지 못한다.
 */
function atStart(base: FindRootBase): FindRootScene {
  return {
    parent: base.parent,
    queries: base.queries,
    walks: [],
    climbing: null,
    roots: [],
    caption: null,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function nums(v: unknown): number[] {
  return Array.isArray(v)
    ? v.filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
    : [];
}

function slot(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

/** 그 자리가 실제로 있는가. 자료가 어긋나면 걸음을 조용히 버린다. */
function exists(scene: FindRootScene, i: number): boolean {
  return i >= 0 && i < scene.parent.length;
}

/** 자리 하나가 가리키는 곳. **오르는 곳의 정본** — 걸음이 실어 오지 않는다. */
export function pointsTo(scene: FindRootScene, i: number): number | null {
  return exists(scene, i) ? scene.parent[i] : null;
}

/**
 * 올라간 횟수. **셈의 정본이자 이 조각의 주장**이다.
 *
 * 길에 자리가 셋이면 두 번 올라온 것이다. 화면에 뜨는 수도, 딱지의 글자도 전부
 * 이 함수 하나를 지난다 — 그래서 그려진 곡선의 수와 말해진 수가 갈릴 수 없다.
 */
export function hopsOf(path: readonly number[]): number {
  return Math.max(0, path.length - 1);
}

/** 그 자리에서 올라가 닿은 이름. 비교 캡션이 여기서 이름을 얻는다. */
export function rootOfStart(scene: FindRootScene, start: number): number | null {
  const walk = scene.walks.find((w) => w.start === start);
  if (walk === undefined || walk.path.length === 0) return null;
  return walk.path[walk.path.length - 1];
}

/** 이름이 드러난 차례. 무리 색의 번호다. 아직 안 드러났으면 `-1`. */
export function groupIndexOf(scene: FindRootScene, root: number): number {
  return scene.roots.indexOf(root);
}

/**
 * 이 자료에 있는 이름의 개수 — 자기 자신을 가리키는 자리의 수.
 *
 * 색판의 크기를 여기서 정한다. 옮기기 전에는 projector 가 **드러난 만큼만** 세어
 * `categorical(groupCount)` 에 넣었고, 그래서 둘째 무리가 드러나는 순간 첫 무리의
 * 색이 바뀌었다. 바탕에서 한 번에 세면 색이 걸음을 타지 않는다.
 */
export function nameCount(scene: FindRootScene): number {
  let n = 0;
  for (let i = 0; i < scene.parent.length; i += 1) if (scene.parent[i] === i) n += 1;
  return n;
}

/** 길을 이루는 곡선들 — 잇달아 나온 두 자리의 쌍. 곡선의 강조가 여기서 나온다. */
export function arcsOf(path: readonly number[]): Array<{ child: number; parent: number }> {
  const out: Array<{ child: number; parent: number }> = [];
  for (let i = 1; i < path.length; i += 1) out.push({ child: path[i - 1], parent: path[i] });
  return out;
}

export const findRootScene: ScenePlan<FindRootScene> = {
  /**
   * 첫 장면은 아직 아무도 오르지 않은 자리들이다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   * `nums` 가 새 배열을 낸다.
   */
  initial(initialData: unknown): FindRootScene {
    const d = (initialData ?? {}) as { parent?: unknown; queries?: unknown };
    return atStart({
      parent: nums(d.parent),
      queries: nums(d.queries),
    });
  },

  reduce(scene: FindRootScene, event: FacetRuntimeEvent): FindRootScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 새 질의가 시작된다. 마커가 그 자리에 선다.
      case 'walk-start': {
        const node = slot(p.node);
        if (node === null || !exists(scene, node)) return scene;
        return {
          ...scene,
          climbing: [node],
          caption: { kind: 'start', node },
          step: { kind: 'start', node },
        };
      }

      // 가리키는 자리로 한 번 오른다. 길이 한 칸 길어진다.
      case 'hop': {
        const from = slot(p.from);
        if (from === null || scene.climbing === null) return scene;
        // 닿을 곳은 걸음이 아니라 자료가 정한다 — 화면의 곡선과 같은 출처다.
        const to = pointsTo(scene, from);
        if (to === null) return scene;
        // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
        return {
          ...scene,
          climbing: [...scene.climbing, to],
          caption: { kind: 'hop', from },
          step: { kind: 'hop', from },
        };
      }

      // 자기 자신을 가리키는 자리에 닿았다. 오르던 길이 통째로 자취가 된다.
      case 'root-reached': {
        const path = scene.climbing;
        if (path === null || path.length === 0) return scene;
        const start = path[0];
        const root = path[path.length - 1];
        return {
          ...scene,
          // `path` 를 그대로 옮겨 담는다. 누구도 고치지 않으므로 과거가 바뀌지
          // 않는다 (S-scene 의 Exception).
          walks: [...scene.walks, { start, path }],
          climbing: null,
          roots: scene.roots.includes(root) ? scene.roots : [...scene.roots, root],
          caption: { kind: 'root', node: root },
          step: { kind: 'root', node: root },
        };
      }

      // 두 자리가 닿은 이름을 견준다. 같은지 다른지는 장면이 셈한다.
      case 'compare': {
        const a = slot(p.a);
        const b = slot(p.b);
        if (a === null || b === null) return scene;
        return {
          ...scene,
          caption: { kind: 'compare', a, b },
          step: { kind: 'compare', a, b },
        };
      }

      case 'rewind':
        // 바탕은 가리킴과 질의뿐이다. 올라온 길과 이름은 여기서 거두어진다.
        return atStart({ parent: scene.parent, queries: scene.queries });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
