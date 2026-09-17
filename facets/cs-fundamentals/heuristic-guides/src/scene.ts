/**
 * heuristicGuides 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 같은 격자 두 판이 나란히 선다. 왼쪽은 지금까지 온 값만 보고 칸을 꺼내고,
 * 오른쪽은 거기에 남은 거리의 짐작을 더해 꺼낸다. 칸은 후보로 올라왔다가 꺼내어
 * 열어 본 칸이 되고, 아래 막대가 열어 본 칸이 격자 전체에서 차지하는 몫을 잰다.
 * 끝에 두 판 위로 길이 그어지는데 그 길이가 같다는 것이 이 조각의 결론이다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 도 `Map` 조회 분기도 하나도 없었고, stage 의 `let` 은
 * `destroyed` 하나뿐이었다. 그래서 ①③④ 가 전부 0 건인데, 그것이 "숨은 상태가
 * 없다" 는 뜻이 아니라 **화면이 통째로 상태**라는 뜻이었다. 숨은 자리는 전부
 * stage 의 **타입 선언**에 있었다.
 *
 * - **`type CellState = 'idle' | 'frontier' | 'active' | 'opened'`** — 선언만
 *   있고 값이 어디에도 저장되지 않았다. 칸의 형편은 rect 의 `fill` 속성과 짐작
 *   숫자의 `opacity` · `fill`, 그리고 표식 노드의 `fill` · `stroke` 에만 있었다.
 *   이제 `examined` · `frontier` · `arrived` 가 그것을 말한다.
 * - **`Panel.fills: Map<number, SVGRectElement>`** — 열쇠가 곧 **지금까지 손댄 칸
 *   전체**였다. 번지는 모양이 이 조각의 주장 그 자체인데 그 자취가 DOM 손잡이의
 *   열쇠로만 남아 있었다. `const panels` 로 묶여 있어 어떤 `let` grep 에도 안 걸린다.
 * - **`Panel.current: number | null`** — 지금 꺼낸 칸. 다음 걸음이 "앞의 것을 찾아
 *   열어 본 칸으로 내리는" 명령형 코드를 달고 있었고, 그 코드가 통째로 없어진다 —
 *   지금 꺼낸 칸은 `examined` 의 마지막 칸이고 닿은 뒤에는 없다.
 * - **`Panel.count: number`** — 열어 본 칸의 누계. 같은 수가 `countText` 의 글자와
 *   막대 폭에도 있어 **한 물음에 답이 셋**이었다. 이제 `examined.length` 하나다.
 * - **`Panel.fills.has(popped)`** — "이 칸이 이미 후보로 서 있었나" 를 화면에게 묻는
 *   암묵 분기. 정적 그리기가 장면에서 칸을 통째로 세우므로 물을 자리가 없어진다.
 *
 * 함께 사라지는 것이 하나 더 있다 — **짐작 h 가 두 출처였다.** algorithm 의
 * `remainingGuess` 와 stage 의 `guessOf` 가 같은 수를 따로 셈했고, 화면에 뜨는
 * 숫자와 꺼내는 차례를 정하는 수가 서로를 모른 채 같아야만 했다. 이제 장면이
 * algorithm 의 함수를 불러 `guesses` 에 담고 화면은 그것만 읽는다.
 *
 * 좌표는 담지 않는다. 격자의 크기와 칸의 좌표 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { remainingGuess } from './algorithm.js';

export type HeuristicGuidesSceneCell = { col: number; row: number };

/**
 * 한 걸음에서 한 판이 한 일.
 *
 * 운동의 출발 그림이 여기서 나온다 — 새로 후보가 된 칸들이 **꺼낸 칸의 한가운데**
 * 에서 자라 나오므로, 어디서 자라는지를 알아야 한다. 그것을 `prev` 에서 꺼내면
 * "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 */
export type HeuristicGuidesSceneMove = {
  /** 이번에 꺼낸 칸. */
  cell: HeuristicGuidesSceneCell;
  /** 이번에 새로 후보가 된 이웃 칸. */
  opened: HeuristicGuidesSceneCell[];
};

/**
 * 한 판의 자취.
 *
 * `examined` 의 길이가 곧 "열어 본 칸의 수" 다 — 화면에 뜨는 그 수를 장면이 세지
 * 않고 실어 오면 막대·글자·타일이 서로 다른 출처가 된다.
 *
 * `arrived` 는 마지막으로 꺼낸 칸이 목표인가로 정해진다. 걸음이 실어 오던
 * `plainFinished` · `guidedFinished` 가 말하던 것과 같고, 구조에서 세지는 것이라
 * 장면이 판정한다.
 */
export type HeuristicGuidesSceneBoard = {
  /** 꺼내어 열어 본 칸. 꺼낸 차례대로. */
  examined: HeuristicGuidesSceneCell[];
  /** 후보로 올라왔지만 아직 꺼내지 않은 칸. */
  frontier: HeuristicGuidesSceneCell[];
  /** 목표에 닿았는가. 닿으면 그 판은 멎고 지금 꺼낸 칸이 없어진다. */
  arrived: boolean;
  /** 끝에 그어진 길. 아직 안 그었으면 빈 배열. */
  route: HeuristicGuidesSceneCell[];
};

/** 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다. */
export type HeuristicGuidesSceneStep =
  | { kind: 'seed' }
  | {
      kind: 'spread';
      plain: HeuristicGuidesSceneMove | null;
      guided: HeuristicGuidesSceneMove | null;
    }
  | { kind: 'route' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type HeuristicGuidesSceneCaption =
  | { kind: 'begin' }
  | { kind: 'spread' }
  | { kind: 'arrived' }
  | { kind: 'same' };

export type HeuristicGuidesScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 격자의 가로 칸 수. */
  cols: number;
  /** 격자의 세로 칸 수. */
  rows: number;
  start: HeuristicGuidesSceneCell;
  goal: HeuristicGuidesSceneCell;
  /**
   * 칸마다의 짐작 h. 열쇠는 `row * cols + col`.
   *
   * algorithm 의 `remainingGuess` 가 셈한 것이다 — 꺼내는 차례를 정하는 수와
   * 화면에 뜨는 숫자가 **같은 함수를 지난다**. 바탕과 순수 함수에서 나오는 값이라
   * 발신에 실어 오지 않고 장면이 부른다.
   */
  guesses: number[];

  // ── 걸음이 고치는 것.
  plain: HeuristicGuidesSceneBoard;
  guided: HeuristicGuidesSceneBoard;
  step: HeuristicGuidesSceneStep | null;
  caption: HeuristicGuidesSceneCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분.
 *
 * 걸음이 고치는 것(`plain` · `guided` · `step` · `caption`)은 들지 않는다 —
 * 그대로 넘기면 되감아도 걸어온 자취가 남는다. 호출부는 **객체 리터럴**로 넘겨야
 * 초과 속성 검사가 돌아 이 좁히기가 실제로 막는다.
 */
type HeuristicGuidesBase = Pick<
  HeuristicGuidesScene,
  'cols' | 'rows' | 'start' | 'goal' | 'guesses'
>;

const EMPTY_BOARD: HeuristicGuidesSceneBoard = {
  examined: [],
  frontier: [],
  arrived: false,
  route: [],
};

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: HeuristicGuidesBase): HeuristicGuidesScene {
  return {
    cols: base.cols,
    rows: base.rows,
    start: base.start,
    goal: base.goal,
    guesses: base.guesses,
    plain: EMPTY_BOARD,
    guided: EMPTY_BOARD,
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function int(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function cellOf(value: unknown): HeuristicGuidesSceneCell | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as { col?: unknown; row?: unknown };
  if (typeof rec.col !== 'number' || typeof rec.row !== 'number') return null;
  return { col: rec.col, row: rec.row };
}

function cellsOf(value: unknown): HeuristicGuidesSceneCell[] {
  if (!Array.isArray(value)) return [];
  const out: HeuristicGuidesSceneCell[] = [];
  for (const item of value) {
    const cell = cellOf(item);
    if (cell) out.push(cell);
  }
  return out;
}

function moveOf(value: unknown): HeuristicGuidesSceneMove | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as { cell?: unknown; opened?: unknown };
  const cell = cellOf(rec.cell);
  if (!cell) return null;
  return { cell, opened: cellsOf(rec.opened) };
}

function same(a: HeuristicGuidesSceneCell, b: HeuristicGuidesSceneCell): boolean {
  return a.col === b.col && a.row === b.row;
}

/**
 * 한 판에 걸음 하나를 얹는다.
 *
 * 앞 장면의 배열을 제자리에서 고치지 않는다 — 되짚기는 지나온 장면들을 그대로
 * 다시 쓰므로, 고치면 과거가 함께 바뀐다 (S-scene).
 */
function advance(
  board: HeuristicGuidesSceneBoard,
  move: HeuristicGuidesSceneMove | null,
  goal: HeuristicGuidesSceneCell,
): HeuristicGuidesSceneBoard {
  if (!move) return board;
  return {
    examined: [...board.examined, move.cell],
    // 꺼낸 칸은 후보에서 내려오고, 새로 열린 이웃이 그 자리에 올라간다.
    frontier: [...board.frontier.filter((at) => !same(at, move.cell)), ...move.opened],
    arrived: board.arrived || same(move.cell, goal),
    route: board.route,
  };
}

export const heuristicGuidesScene: ScenePlan<HeuristicGuidesScene> = {
  /**
   * 첫 장면은 빈 격자다. 두 판 모두 아직 아무 칸도 손대지 않았다.
   *
   * 넘겨받은 선언을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다
   * (S-scene).
   */
  initial(initialData: unknown): HeuristicGuidesScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const cols = Math.max(2, int(d.cols, 7));
    const rows = Math.max(2, int(d.rows, 5));
    const start = cellOf(d.start) ?? { col: 0, row: Math.floor(rows / 2) };
    const goal = cellOf(d.goal) ?? { col: cols - 1, row: Math.floor(rows / 2) };

    // 짐작은 바탕과 순수 함수에서 나온다. algorithm 이 꺼내는 차례를 정할 때 쓰는
    // 바로 그 함수라, 화면의 숫자와 탐색의 판단이 갈릴 자리가 없다.
    const guesses: number[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) guesses.push(remainingGuess(col, row, goal));
    }

    return atStart({ cols, rows, start, goal, guesses });
  },

  reduce(scene: HeuristicGuidesScene, event: FacetRuntimeEvent): HeuristicGuidesScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 두 판 모두 출발 칸 하나가 후보로 올라간다. 어느 칸인지는 바탕이 말한다.
      case 'search-begin': {
        const seeded: HeuristicGuidesSceneBoard = { ...EMPTY_BOARD, frontier: [scene.start] };
        return {
          ...scene,
          plain: seeded,
          guided: seeded,
          step: { kind: 'seed' },
          caption: { kind: 'begin' },
        };
      }

      // 한 걸음. 각 판에서 칸 하나를 꺼내고 이웃을 연다. 먼저 닿은 판은 null 이다.
      case 'frontier-spread': {
        const plainMove = moveOf(p.plain);
        const guidedMove = moveOf(p.guided);
        const plain = advance(scene.plain, plainMove, scene.goal);
        const guided = advance(scene.guided, guidedMove, scene.goal);
        return {
          ...scene,
          plain,
          guided,
          step: { kind: 'spread', plain: plainMove, guided: guidedMove },
          // 한쪽만 닿아 있는 동안은 그것이 이 걸음이 말하는 것이다.
          caption: guided.arrived && !plain.arrived ? { kind: 'arrived' } : { kind: 'spread' },
        };
      }

      // 되짚은 길 둘. 걸음 수는 그어진 길에서 센다.
      case 'route-drawn': {
        const plainRoute = cellsOf(p.plain);
        const guidedRoute = cellsOf(p.guided);
        return {
          ...scene,
          plain: { ...scene.plain, route: plainRoute },
          guided: { ...scene.guided, route: guidedRoute },
          step: { kind: 'route' },
          caption: { kind: 'same' },
        };
      }

      case 'rewind':
        return atStart({
          cols: scene.cols,
          rows: scene.rows,
          start: scene.start,
          goal: scene.goal,
          guesses: scene.guesses,
        });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
