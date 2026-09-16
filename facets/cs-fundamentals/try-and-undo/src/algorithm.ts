/**
 * try-and-undo — 백트래킹 조각(piece)의 algorithm.
 *
 * 4×4 판에 말 넷을 놓는다. 위 행부터 한 줄에 하나씩 내려가고, 같은 열이나 같은
 * 대각선에는 둘이 서지 못한다. 갈 자리가 없어지면 방금 놓은 말을 **걷어내고**
 * 한 행 위로 되올라가 다음 열부터 다시 본다.
 *
 * 이 조각이 말하려는 것은 물림(되돌리기)이 실패의 뒤처리가 아니라 절차의 한 짝
 * 이라는 것이다. 그래서 걸음은 놓기 · 막힘 · 물리기 셋으로만 나뉜다.
 *
 * 이 데이터에서는 놓기 여덟 · 물리기 넷 만에 답(행0 열1 · 행1 열3 · 행2 열0 ·
 * 행3 열2)에 닿는다. 화면에 뜨는 그 수는 장면이 걸음을 세어 얻는 값이며 여기서
 * 보내지 않는다 — 같은 수를 두 자리에서 세면 언젠가 갈린다.
 *
 * ## 무엇을 싣고 무엇을 싣지 않나
 *
 * 걸음이 **내리는 판정**만 싣는다. 이 조각에서 그것은 `place` 의 `col` 하나다 —
 * 그 행에서 어느 열을 골랐는가는 탐색이 정하는 것이지 화면이 셀 수 있는 것이
 * 아니다. 나머지는 전부 장면이 셈한다.
 *
 * - **행 번호** — `place` · `blocked` · `undo` 모두 지금 채운 행 수가 곧 그 행이다.
 *   차례는 발신이 오는 순서가 이미 말한다.
 * - **못 쓰는 칸** — 놓인 말들에서 순수하게 나온다. 그 규칙(`hits`)을 내주므로
 *   장면이 같은 함수를 부른다. 싣는 순간 다음 사람이 집어 쓸 문이 열린다.
 * - **막은 짝** — 어느 말이 어느 칸을 막는지도 `hits` 로 풀린다.
 * - **자국** — 물려 나온 자리는 물림 발신이 오는 순서가 말한다.
 * - **놓기 · 물리기 횟수** — 장면이 걸음을 센다.
 *
 * ## 이벤트 (facet 고유 확장, C2)
 *
 * | type      | payload       | silent |
 * |-----------|---------------|--------|
 * | `place`   | `{ col }`     | no     |
 * | `blocked` | 없음          | no     |
 * | `undo`    | 없음          | no     |
 * | `done`    | 없음          | no     |
 * | `rewind`  | 없음          | no     |
 *
 * - `place` 의 `col` — 이 행에서 고른 열. 탐색이 내리는 판정이라 유일하게 싣는다.
 * - `blocked` — 지금 채우려던 행에 남은 자리가 하나도 없다.
 * - `undo` — 바로 위 행의 말을 걷어낸다. 어느 말인지는 판이 말한다.
 * - `rewind` — 자동 재생을 마친 뒤 한 걸음씩 다시 볼 때 판을 비운다 (S-piece).
 *   시각 변화가 있으므로 silent 가 아니다.
 *
 * 정규 경로는 payload 다. 칸을 가리키는 `target` 문법은 두지 않는다 — 판은
 * 2차원이라 `index:` 어휘가 맞지 않고, 새 prefix 를 지어 아무도 쓰지 않게 두는
 * 것보다 payload 하나로 두는 편이 낫다.
 *
 * 메트릭은 없다. 조각은 셀 것을 패널에 걸지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TryAndUndoData = {
  type: 'try-and-undo';
  /** 판의 한 변. 행 수 = 열 수 = 놓을 말의 수. */
  boardSize: number;
  /** 걸음 사이의 간격 (S-piece — 읽을 시간을 주는 것은 저작 결정이다). */
  stepMs: number;
};

/** 걸음 사이의 문. 자동 재생은 재우고, 한 걸음씩 볼 때는 누를 때까지 기다린다. */
type Gate = () => Promise<boolean>;

/**
 * 한 말이 (row, col) 을 못 쓰게 만드는가 — 같은 열이거나 같은 대각선이면 그렇다.
 *
 * 판의 규칙이므로 한 벌만 둔다. 탐색이 자리를 고를 때 쓰고, 장면이 못 쓰는 칸과
 * 막은 짝을 셈할 때 같은 함수를 부른다 (원칙 1 의 허용 방향 — 장면이 projector
 * 자리를 잇는다).
 */
export function hits(queenRow: number, queenCol: number, row: number, col: number): boolean {
  return queenCol === col || Math.abs(queenRow - row) === Math.abs(queenCol - col);
}

/**
 * 탐색 한 판. 걸음마다 `gate` 를 먼저 지나고 나서 발신한다.
 *
 * 걸음표를 배열로 적어 두지 않는다 (S-piece / C2) — 어느 자리를 어느 순서로
 * 짚을지는 탐색 자체가 정한다. 이 함수를 두 번 (자동 재생 · 한 걸음씩) 부르므로
 * 두 경로가 같은 순서를 볼 수밖에 없다.
 *
 * @returns gate 가 끊겼으면(취소) 도중에 돌아온다.
 */
async function runSearch(ctx: ReactiveContext<TryAndUndoData>, gate: Gate): Promise<void> {
  const size = ctx.data.boardSize;

  /** queens[row] = 그 행에 놓인 말의 열. 길이가 곧 지금 채운 행 수다. */
  const queens: number[] = [];
  /** cursor[row] = 그 행에서 다음에 볼 열. 물려 나올 때 그 다음 열로 옮겨진다. */
  const cursor = new Array<number>(size).fill(0);

  // 판이 유한하므로 탐색은 반드시 끝난다. 그래도 무한 루프를 남기지 않기 위해
  // 넉넉한 상한을 둔다 — 4×4 에서 실제로 도는 것은 열일곱 걸음이다.
  const maxSteps = size * size * size + 64;

  for (let step = 0; step < maxSteps; step += 1) {
    if (ctx.cancelled) return;

    const row = queens.length;

    if (row === size) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'done' });
      return;
    }

    // 이 행에서 아직 보지 않은 열 가운데 놓을 수 있는 첫 자리.
    let chosen = -1;
    for (let col = cursor[row]; col < size; col += 1) {
      if (!queens.some((queenCol, queenRow) => hits(queenRow, queenCol, row, col))) {
        chosen = col;
        break;
      }
    }

    if (chosen >= 0) {
      queens.push(chosen);
      if (!(await gate())) return;
      await ctx.emit({ type: 'place', payload: { col: chosen } });
      continue;
    }

    // 막혔다. 어느 말이 어느 칸을 막고 있는지는 판에서 풀리므로 싣지 않는다.
    if (!(await gate())) return;
    await ctx.emit({ type: 'blocked' });

    // 첫 행이 막히면 답이 없다는 뜻이다. 이 데이터에서는 일어나지 않는다.
    if (row === 0) return;

    const undoRow = row - 1;
    const undoCol = queens[undoRow];
    queens.pop();
    cursor[undoRow] = undoCol + 1;
    // 물린 행보다 아래는 통째로 처음 상태로 돌아간다 — 반쯤 남지 않는다.
    for (let r = undoRow + 1; r < size; r += 1) cursor[r] = 0;

    if (!(await gate())) return;
    await ctx.emit({ type: 'undo' });
  }
}

/**
 * 조각의 진행 — 자동으로 한 판을 보이고, 그 뒤로는 눌러서 한 걸음씩.
 *
 * 자동 재생만 보고 지나가도 화면은 할 말을 마친다. `advance` 는 곱씹으며 읽고
 * 싶은 사람을 위한 것이지 진행에 필요한 조작이 아니다 (S-piece).
 */
export const tryAndUndo = async (base: FacetContext<TryAndUndoData>): Promise<void> => {
  const ctx = base as ReactiveContext<TryAndUndoData>;
  const stepMs = ctx.data.stepMs;

  await runSearch(ctx, () => ctx.sleep(stepMs));

  for (;;) {
    await ctx.waitForInput();
    if (ctx.cancelled) return;

    // 자동 재생을 마친 뒤 처음 누르는 advance 는 되감고 **첫 걸음까지** 보인다.
    // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    await ctx.emit({ type: 'rewind' });
    let firstGate = true;
    await runSearch(ctx, async () => {
      if (firstGate) {
        firstGate = false;
        return true;
      }
      await ctx.waitForInput();
      return !ctx.cancelled;
    });
  }
};
