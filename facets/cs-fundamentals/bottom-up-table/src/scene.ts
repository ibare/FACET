/**
 * BottomUpTable 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 걸음이 다섯뿐이고 algorithm 이 125 줄인데도 **네 자리**에 흩어져 있었다. 작은
 * 조각이 쉬운 조각이 아니다 — 걸음이 적을수록 화면이 통째로 상태다.
 *
 * - **표의 값 자체가 `values[i].textContent` 에만 있었다.** `seedCell` 과 `fillCell`
 *   이 쓰기만 하고 아무 데서도 읽지 않는다. 코드 어디에도 "표" 라는 자료가 없었고,
 *   algorithm 쪽 `table` 은 발신에 실어 보내는 데만 쓰였다. 이제 `cells` 가 그것이다.
 * - `const arcs: Arc[]` — **어느 칸이 어느 칸을 보고 채워졌나.** 이 조각의 알맹이인데
 *   `const` 라 `let` grep 을 통과하고, `arcs.push` · `arcs.length = 0` 으로 제자리에서
 *   고쳐졌다. 게다가 `Arc = { path, head, p0, cp, p1 }` 은 DOM 손잡이와 좌표가 한
 *   객체다. 이제 `cell.from` 이 말하고 화살은 거기서 파생된다.
 * - `let states: CellState[]` — 칸의 형편. `'fresh'` 를 `settleFresh()` 가 다음 걸음에
 *   `'filled'` 로 되돌리고 `dimArcs()` 가 지난 화살을 흐리게 했다. 되짚어 세운 화면은
 *   그 되돌림을 밟지 않으므로 앞 걸음의 형편이 그대로 남을 자리였다. 이제 `cells` 와
 *   `step` 에서 매번 파생한다.
 * - **다 끝났나가 `windowLayer` 의 자식 유무에만 있었다.** `finish` 가 창을 하나 붙이고
 *   `clearBoard` 가 지우는 것이 전부라 어떤 변수도 그것을 말하지 않았다. 이제
 *   `finished` 다.
 *
 * ── 화면에 나란히 뜨는 수는 한 함수를 지난다
 *
 * 이 조각은 캡션에 `T[5] = T[3] + T[4] = 2 + 3 = 5` 처럼 수가 넷씩 나란히 뜬다. 표의
 * 칸 값과 결과가 서로 다른 출처에서 오면 그림이 제 안에서 거짓이 된다. 그래서
 * **읽는 값은 전부 `valueAt` 한 함수가 표에서 꺼낸다.** 걸음이 실어 오던
 * `values: [table[i-2], table[i-1]]` 을 버린 자리다.
 *
 * 마무리 걸음의 수 셋도 마찬가지다.
 *
 * - `cells` — 장면이 센다 (`cells.length`).
 * - `fills` — 장면이 센다 (`fillsOf`).
 * - `calls` — **`callsOf` 가 자취를 밟으며 센다.** 옛 발신은 `calls: 0` 을 상수로
 *   실어 보냈는데, 그러면 이 조각의 결론이 화면의 자취와 무관한 수가 된다. 지금은
 *   "칸을 채울 때 보아야 할 자리가 그때 이미 차 있었나" 를 왼쪽부터 실제로 세므로,
 *   0 이라는 수가 **화면에 남은 화살과 같은 자료**에서 나온다.
 * - `keep` — **`keepOf` 가 자취에서 잰다.** 옛 발신은 `[n-1, n]` 을 실어 보냈다.
 *   지금은 `reachOf` 가 화살이 실제로 얼마나 뒤까지 뻗었나를 재고 그만큼을 창으로
 *   감싼다. "어느 칸도 바로 앞 둘만 보았으므로 그 둘만 들고 있으면 된다" 는 말과
 *   화면의 화살이 같은 자료를 쓴다.
 *
 * ── 싣는 것은 점화식뿐이다
 *
 * `fill` 이 어느 칸을 보는지(`from`)와 거기서 무엇이 나오는지(`value`)는 **이 알고리즘
 * 그 자체**다. 바탕에 순수 함수를 먹여 얻는 값이 아니라 걸음이 내리는 판정이라,
 * 함수를 내주지 않고 **싣는다** (프로토콜 4 절의 잣대 표). 장면이 `[len-2, len-1]` 을
 * 스스로 셈하면 피보나치 점화식이 algorithm 과 장면 두 곳에 적히고, 그것이 바로
 * 갈리는 자리다.
 *
 * 반대로 **표의 칸 수는 함수를 부른다** — `bottomUpTableCellCount` 가 `n` 을 좁히는
 * 유일한 자리다. 자르는 잣대가 두 군데면 갈린다.
 *
 * 차례(`index`)는 싣지 않는다. 칸은 왼쪽에서 오른쪽으로 하나씩만 차므로 다음 빈 칸은
 * 늘 `cells.length` 다 — 발신이 오는 순서가 이미 말한다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 칸 번호라는 **구조**만 담고 칸 폭도 곡선의 솟음도 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 *
 * 문안도 담지 않는다. `step` 이 **무엇을 말할지**만 말하고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10). 캡션 필드를 따로 두지 않는 까닭은 `step` 과 캡션의
 * 갈래가 정확히 1 대 1 이기 때문이다 — 나란히 두면 같은 것을 두 자리에 적는 꼴이다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { bottomUpTableCellCount } from './algorithm.js';

/**
 * 칸 하나가 어떻게 찼나.
 *
 * `seed` 는 정의가 그냥 준 값이라 근거가 표 안에 없고, `fill` 은 `from` 두 칸을 보고
 * 나왔다. 그 갈림이 곧 화살을 그리느냐 마느냐다.
 */
export type BottomUpCell =
  | { kind: 'seed'; value: number }
  | { kind: 'fill'; value: number; from: readonly [number, number] };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 흐르게 할 것이 출발하는 자리는 전부 장면이 이미 말한다.
 * 값 알갱이는 `from` 의 칸에서 출발하고 창은 화면 왼쪽 밖에서 들어온다. `prev` 를
 * 들출 일이 없다 (S-scene).
 */
export type BottomUpStep = { kind: 'seed' } | { kind: 'fill' } | { kind: 'keep' };

export type BottomUpTableScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 표의 칸 수. `bottomUpTableCellCount` 가 좁힌 것이라 그리는 쪽이 다시 자르지 않는다. */
  size: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 왼쪽부터 찬 칸들. 자리 번호가 곧 칸 번호이고 `length` 가 다음 빈 칸이다.
   *
   * 표의 값도, 어느 칸이 어느 칸을 보았나도 여기 있다. 옛 화면은 앞의 것을
   * `textContent` 에, 뒤의 것을 `arcs` 배열의 좌표에 두고 있었다.
   */
  cells: readonly BottomUpCell[];
  /** 다 채웠나. 들고 있어야 할 칸을 창이 감싼다. */
  finished: boolean;

  step: BottomUpStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `cells` · `finished` 는 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이 다
 * 채워진 표를 단 채로 서고 그 위에 algorithm 이 처음부터 다시 놓는 값이 겹친다
 * (S-scene).
 */
type BottomUpBase = Pick<BottomUpTableScene, 'size'>;

/**
 * 아무것도 놓이지 않은 처음 화면. 점선 칸만 줄지어 서 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: BottomUpBase): BottomUpTableScene {
  return { size: base.size, cells: [], finished: false, step: null };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 두 칸 번호의 쌍인지 확인하고 튜플로 좁힌다. */
function cellPair(v: unknown): readonly [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const a = num(v[0]);
  const b = num(v[1]);
  return a === null || b === null ? null : [a, b];
}

// ── 화면에 나란히 뜨는 수는 전부 아래를 지난다 ───────────────────────────────

/** 그 칸에 적혀 있는 값. 아직 안 찼으면 `null`. */
export function valueAt(scene: BottomUpTableScene, index: number): number | null {
  return scene.cells[index]?.value ?? null;
}

/** 방금 찬 칸의 번호. 아직 아무것도 안 찼으면 `null`. */
export function freshIndex(scene: BottomUpTableScene): number | null {
  return scene.cells.length === 0 ? null : scene.cells.length - 1;
}

/** 덧셈으로 찬 칸의 수. 마무리 캡션의 `{fills}` 가 여기서 나온다. */
export function fillsOf(scene: BottomUpTableScene): number {
  let n = 0;
  for (const cell of scene.cells) if (cell.kind === 'fill') n += 1;
  return n;
}

/**
 * 값을 얻으려고 아래로 내려가야 했던 횟수 — **이 조각의 답**.
 *
 * 칸을 채울 때 보아야 할 자리가 **그때 이미 차 있었으면** 부를 일이 없다. 자취를
 * 왼쪽부터 밟으며 그 시점에 비어 있던 자리를 물은 적이 있나를 세므로, 0 이라는 수가
 * 화면에 남은 화살과 같은 자료에서 나온다. 걸음이 `calls: 0` 을 상수로 실어 오던
 * 자리다 (프로토콜 4 절 "등식의 한 항이 상수로 박혀 있는 것도 두 자리에서 세기다").
 */
export function callsOf(scene: BottomUpTableScene): number {
  let calls = 0;
  scene.cells.forEach((cell, index) => {
    if (cell.kind !== 'fill') return;
    // 왼쪽부터 차례로 차므로 "그때 차 있었다" 는 곧 `src < index` 다.
    for (const src of cell.from) if (src < 0 || src >= index) calls += 1;
  });
  return calls;
}

/**
 * 한 칸을 채우며 얼마나 뒤까지 보았나 — 화살이 실제로 뻗은 거리의 최댓값.
 *
 * 걸음이 `keep: [n-1, n]` 을 실어 오던 것을 이 함수가 대신한다. 창의 폭과 캡션의
 * 주장이 화면의 화살과 같은 자료를 쓰게 된다.
 */
export function reachOf(scene: BottomUpTableScene): number {
  let reach = 0;
  scene.cells.forEach((cell, index) => {
    if (cell.kind !== 'fill') return;
    for (const src of cell.from) reach = Math.max(reach, index - src);
  });
  return reach;
}

/**
 * 이어 가려면 들고 있어야 할 칸들.
 *
 * 다음 칸도 앞의 `reachOf` 칸만 보므로 그만큼이면 충분하다 — 표 전체가 필요 없다는
 * 것이 이 조각이 마지막에 하는 말이다.
 */
export function keepOf(scene: BottomUpTableScene): readonly number[] {
  const reach = reachOf(scene);
  const end = scene.cells.length;
  const out: number[] = [];
  for (let i = Math.max(0, end - reach); i < end; i++) out.push(i);
  return out;
}

export const bottomUpTableScene: ScenePlan<BottomUpTableScene> = {
  /**
   * 첫 장면은 빈 표만 세운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 정한다. 넘겨받는 것이
   * 수 하나라 참조를 쥘 일이 없고, 좁히는 잣대는 algorithm 이 내주는 한 함수를
   * 부른다 (S-scene).
   */
  initial(initialData: unknown): BottomUpTableScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    return atStart({ size: bottomUpTableCellCount(d.n) });
  },

  reduce(scene: BottomUpTableScene, event: FacetRuntimeEvent): BottomUpTableScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 정의가 그냥 주는 바닥 칸. 표 안에 근거가 없으므로 `from` 이 없다.
       *
       * 어느 칸인지는 받지 않는다 — 다음 빈 칸이 늘 `cells.length` 다.
       */
      case 'seed': {
        const value = num(p.value);
        if (value === null) return scene;
        return {
          ...scene,
          cells: [...scene.cells, { kind: 'seed', value }],
          step: { kind: 'seed' },
        };
      }

      /*
       * 앞의 두 칸을 보고 한 칸이 찬다.
       *
       * `from` 과 `value` 가 곧 점화식이라 걸음이 싣는다. 읽은 값(`x` · `y`)은 싣지
       * 않는다 — `valueAt` 이 표에서 꺼내므로 캡션의 네 수가 한 출처가 된다.
       */
      case 'fill': {
        const from = cellPair(p.from);
        const value = num(p.value);
        if (from === null || value === null) return scene;
        return {
          ...scene,
          cells: [...scene.cells, { kind: 'fill', value, from }],
          step: { kind: 'fill' },
        };
      }

      /*
       * 다 찼다. 들고 있어야 할 칸을 창이 감싼다 — 어느 칸을 감쌀지는 `keepOf` 가
       * 자취에서 재므로 여기서 아무것도 받지 않는다.
       */
      case 'done':
        return { ...scene, finished: true, step: { kind: 'keep' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ size: scene.size });

      default:
        // 이 algorithm 이 발신하는 것은 위 넷이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
