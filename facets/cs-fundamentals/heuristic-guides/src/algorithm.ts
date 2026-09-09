/**
 * 휴리스틱 — 남은 거리를 짐작하면 탐색이 목표 쪽으로 치우친다.
 *
 * 같은 격자를 두 번 뒤진다. 한쪽은 지금까지 온 값(g)만 보고 꺼내고, 다른 쪽은
 * 거기에 남은 거리의 짐작(h)을 더한 값(g+h)을 보고 꺼낸다. 두 판을 같은 걸음에
 * 나란히 진행시켜 **열어 본 칸이 번지는 모양**과 **그 수**를 견주게 한다.
 * 찾아낸 길은 양쪽이 같다 — 짐작은 답을 바꾸지 않고 어디를 들여다볼지만 바꾼다.
 *
 * ── 꺼내는 규칙 (양쪽 공통, 데이터가 정한다)
 *   1) 열쇠값이 작은 것부터. 열쇠값은 g (짐작 없이) 또는 g+h (짐작을 더해).
 *   2) 같으면 짐작 h 가 작은 것부터.
 *   3) 그것도 같으면 위에서 아래로 · 왼쪽에서 오른쪽으로.
 * 한 칸 옮기는 값은 어디서나 1 이고 막힌 칸은 없다. 짐작 h 는 목표까지의
 * 가로 차이 + 세로 차이다.
 *
 * ── 식별자
 *   칸은 `{ col, row }` 좌표 객체로 싣는다. 그림의 자리는 stage 가 셈하므로
 *   좌표를 target 문자열로 옮길 이유가 없다 (S-piece).
 *
 * ── 이벤트 (전부 facet 고유. silent 없음 — 모두 화면이 바뀐다)
 *   'search-begin'     { frontier: Cell[] }
 *                      두 판 모두 출발 칸 하나가 후보로 올라간 상태.
 *   'frontier-spread'  { step: number;
 *                        plain: Move | null; guided: Move | null;
 *                        plainFinished: boolean; guidedFinished: boolean }
 *                      한 걸음. 각 판에서 칸 하나를 꺼내고 이웃을 연다.
 *                      먼저 목표에 닿은 판은 그 뒤로 null 이 된다. `finished` 는
 *                      **이번 걸음이 그 판의 마지막이다** 라는 뜻이라 도착하는 그
 *                      걸음에서 이미 참이고, 그 뒤로도 참으로 남는다. projector 가
 *                      이것으로 도착 캡션을 고른다.
 *   'route-drawn'      { plain: Cell[]; guided: Cell[]; steps: number }
 *                      되짚은 길 둘. steps 는 걸음 수(칸 수 - 1)이며 양쪽이 같다.
 *   'rewind'           {}
 *                      되감기. 자동 재생이 끝난 뒤 처음 누른 advance 가 발신한다.
 *
 * ── Move
 *   { cell: Cell; opened: Cell[]; count: number }
 *   cell   이번에 꺼낸 칸
 *   opened 이번에 새로 후보가 된 이웃 칸
 *   count  그 판이 지금까지 꺼낸(열어 본) 칸의 누계
 *
 * 메트릭은 부르지 않는다 (조각 — S-piece).
 */

import type { ReactiveContext } from '@ffacet/core/runtime';

export type Cell = { col: number; row: number };

export type HeuristicGuidesData = {
  type: 'heuristic-guides';
  /** 격자의 가로 칸 수. */
  cols: number;
  /** 격자의 세로 칸 수. */
  rows: number;
  start: Cell;
  goal: Cell;
  /** 걸음 간격 (ms). 읽을 시간을 주는 저작 결정이다 (S-piece). */
  stepMs: number;
};

export type Move = {
  cell: Cell;
  opened: Cell[];
  count: number;
};

type Trace = {
  moves: Move[];
  route: Cell[];
};

/** 목표까지의 가로 차이 + 세로 차이. 막힌 칸이 없으므로 실제 남은 거리와 같다. */
function guess(col: number, row: number, goal: Cell): number {
  return Math.abs(goal.col - col) + Math.abs(goal.row - row);
}

/**
 * 한 판을 끝까지 뒤진다. `useGuess` 가 참이면 열쇠값에 짐작을 더한다.
 *
 * 걸음표를 손으로 적지 않는다 — 아래 배열은 격자를 뒤진 결과다 (S-piece).
 */
function sweep(data: HeuristicGuidesData, useGuess: boolean): Trace {
  const { cols, rows, start, goal } = data;
  const idOf = (col: number, row: number): number => row * cols + col;

  const cost = new Map<number, number>();
  const parent = new Map<number, number>();
  const open = new Set<number>();
  const closed = new Set<number>();

  cost.set(idOf(start.col, start.row), 0);
  open.add(idOf(start.col, start.row));

  const moves: Move[] = [];
  let count = 0;

  while (open.size > 0) {
    let bestId = -1;
    let bestKey = 0;
    let bestGuess = 0;
    let bestRow = 0;
    let bestCol = 0;
    for (const id of open) {
      const col = id % cols;
      const row = (id - col) / cols;
      const g = cost.get(id) ?? 0;
      const h = guess(col, row, goal);
      const key = useGuess ? g + h : g;
      const better =
        bestId < 0 ||
        key < bestKey ||
        (key === bestKey &&
          (h < bestGuess ||
            (h === bestGuess && (row < bestRow || (row === bestRow && col < bestCol)))));
      if (better) {
        bestId = id;
        bestKey = key;
        bestGuess = h;
        bestRow = row;
        bestCol = col;
      }
    }
    if (bestId < 0) break;

    open.delete(bestId);
    closed.add(bestId);
    count += 1;

    const opened: Cell[] = [];
    const reachedGoal = bestCol === goal.col && bestRow === goal.row;
    if (!reachedGoal) {
      const stepG = (cost.get(bestId) ?? 0) + 1;
      for (const [dc, dr] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ] as const) {
        const col = bestCol + dc;
        const row = bestRow + dr;
        if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
        const id = idOf(col, row);
        if (closed.has(id)) continue;
        const known = cost.get(id);
        if (known !== undefined && known <= stepG) continue;
        cost.set(id, stepG);
        parent.set(id, bestId);
        if (!open.has(id)) {
          open.add(id);
          opened.push({ col, row });
        }
      }
    }

    moves.push({ cell: { col: bestCol, row: bestRow }, opened, count });
    if (reachedGoal) break;
  }

  const route: Cell[] = [];
  let cursor: number | undefined = idOf(goal.col, goal.row);
  while (cursor !== undefined) {
    const col = cursor % cols;
    route.unshift({ col, row: (cursor - col) / cols });
    cursor = parent.get(cursor);
  }

  return { moves, route };
}

/** 두 판의 걸음표. 화면에 뜨는 수는 전부 여기서 셈해 나온다. */
export function computeHeuristicGuidesResult(data: HeuristicGuidesData): {
  plain: Trace;
  guided: Trace;
} {
  return { plain: sweep(data, false), guided: sweep(data, true) };
}

type Gate = () => Promise<boolean>;

/** 자동 재생과 한 걸음씩을 한 몸으로 굴린다. false 를 돌려주면 접힌 것이다. */
async function playThrough(
  ctx: ReactiveContext<HeuristicGuidesData>,
  plan: { plain: Trace; guided: Trace },
  gate: Gate,
): Promise<void> {
  const { start } = ctx.data;
  const total = Math.max(plan.plain.moves.length, plan.guided.moves.length);

  await ctx.emit({ type: 'search-begin', payload: { frontier: [{ ...start }] } });

  for (let i = 0; i < total; i += 1) {
    if (!(await gate())) return;
    const plain: Move | null = i < plan.plain.moves.length ? plan.plain.moves[i] : null;
    const guided: Move | null = i < plan.guided.moves.length ? plan.guided.moves[i] : null;
    await ctx.emit({
      type: 'frontier-spread',
      payload: {
        step: i + 1,
        plain,
        guided,
        plainFinished: i + 1 >= plan.plain.moves.length,
        guidedFinished: i + 1 >= plan.guided.moves.length,
      },
    });
  }

  if (!(await gate())) return;
  await ctx.emit({
    type: 'route-drawn',
    payload: {
      plain: plan.plain.route,
      guided: plan.guided.route,
      steps: plan.plain.route.length - 1,
    },
  });
}

export const heuristicGuidesAlgorithm = async (
  ctx: ReactiveContext<HeuristicGuidesData>,
): Promise<void> => {
  const plan = computeHeuristicGuidesResult(ctx.data);

  // 짐작이 실제 남은 거리를 넘지 않으면 두 길의 길이는 반드시 같다. 그 전제가
  // 깨진 데이터로 화면이 "답은 같다" 고 말하면 그림이 거짓이 된다 (C6).
  if (plan.plain.route.length !== plan.guided.route.length) {
    throw new Error(
      `두 길의 걸음 수가 다르다: 짐작 없이 ${plan.plain.route.length - 1}, 짐작을 더해 ${plan.guided.route.length - 1}` +
        ' (짐작이 실제 남은 거리를 넘었을 때 일어난다. 목표에 닿지 못해 길이 끊긴 경우도 같은 조건이 된다)',
    );
  }

  const stepMs = ctx.data.stepMs;
  await playThrough(ctx, plan, () => ctx.sleep(stepMs));

  // 자동 재생이 끝나면 한 걸음씩. 처음 누르는 advance 는 되감고 첫 걸음까지
  // 간다 — 되감기만 하면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
  for (;;) {
    const input = await ctx.waitForInput();
    if (input.type !== 'advance') continue;
    await ctx.emit({ type: 'rewind', payload: {} });

    let opened = false;
    await playThrough(ctx, plan, async () => {
      if (!opened) {
        opened = true;
        return true;
      }
      for (;;) {
        const next = await ctx.waitForInput();
        if (next.type === 'advance') return !ctx.cancelled;
      }
    });
  }
};
