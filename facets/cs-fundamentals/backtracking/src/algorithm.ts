/**
 * 백트래킹 — 4×4 판에 퀸 넷을 놓되 **모든 배치를 찾는다**.
 *
 * 위 행부터 한 줄에 하나씩 놓는다. 한 행에서 안전한 열을 만나면 놓고 다음 행으로
 * 내려가되, 돌아온 뒤에는 **반드시 그 자리를 물린다.** 해를 하나 찾아도 멈추지
 * 않고 남은 열을 마저 본다 — 그래서 되돌리기가 실패의 표시가 아니라 절차의
 * 정상 동작이라는 것이 드러난다. 놓은 열여섯은 결국 열여섯 번 다 물린다.
 *
 * 식별자 (C1): 쓰지 않는다. 판의 칸은 행·열 두 수라 표준 prefix
 * (`index:` · `node:` …) 어디에도 맞지 않고, 그 하나 때문에 새 prefix 를
 * 만들 이유가 없다. 모든 이벤트는 `target` 없이 payload 의 `row` / `col` 로
 * 자리를 말한다.
 *
 * 이벤트 (C2) — 전부 이 facet 고유 확장이다:
 *   - phase         payload { phase }                                   silent: true
 *   - row-enter     payload { row }
 *   - column-check  payload { row, col, safe, blockerRow, blockerCol, reason }
 *                   reason: 'column' | 'diagonal' | 'none'
 *                   safe 면 blockerRow / blockerCol 은 -1, reason 은 'none'.
 *   - place         payload { row, col }
 *   - descend       payload { from, to }
 *   - undo          payload { row, col }
 *   - solution      payload { index, cols }        cols 는 각 행의 열 번호 사본
 *   - row-exit      payload { row, found }
 *   - done          payload { solutions, places, undos }
 *
 * `is_safe` 의 훑기를 걸음마다 발신하지 않는다. 앞선 행을 하나씩 보는 그 루프는
 * 여든넷 번 돌아서, 걸음으로 쪼개면 재생이 그것만으로 채워진다. 대신 한 후보당
 * 한 걸음으로 묶고 **어느 행의 퀸이 왜 막았는지**를 payload 에 실어, 화면이 그
 * 퀸에서 후보 칸까지 선을 그어 보인다. 코드 쪽에서는 그 루프가 `irs.ts` 에
 * 펼쳐진 채로 남아 있다.
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'solution-found' | 'choose-row' | 'safety-check' |
 *   'place' | 'descend' | 'undo' | 'return-found'
 *
 * 메트릭 (C5): 'place-count' · 'undo-count' · 'solution-count'
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type BacktrackingData = {
  type: 'nqueens';
  /** 판의 한 변. 여기서는 4. */
  n: number;
  /** 각 행에 놓인 퀸의 열 번호. 빈 행은 -1. */
  cols: number[];
};

/** 후보를 막은 앞선 행의 퀸. `is_safe` 가 false 를 돌려준 그 자리. */
type Blocker = { row: number; col: number; reason: 'column' | 'diagonal' };

export async function backtracking(ctx: FacetContext<BacktrackingData>): Promise<void> {
  const n = ctx.data.n;
  const cols = ctx.data.cols;

  let places = 0;
  let undos = 0;
  let solutions = 0;

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  /**
   * `irs.ts` 의 `is_safe` 와 같은 셈. 다른 것은 돌려주는 값뿐이다 — 코드는
   * true/false 면 되지만 화면은 **누가 막았는지**를 알아야 선을 그을 수 있다.
   * 첫 충돌에서 멈추는 것까지 같다.
   */
  function firstBlocker(row: number, col: number): Blocker | null {
    for (let r = 0; r < row; r += 1) {
      if (cols[r] === col) return { row: r, col: cols[r], reason: 'column' };
      if (cols[r] - col === row - r || col - cols[r] === row - r) {
        return { row: r, col: cols[r], reason: 'diagonal' };
      }
    }
    return null;
  }

  async function solve(row: number): Promise<number> {
    if (ctx.cancelled) return 0;

    await phase('solution-found');
    if (row === n) {
      solutions += 1;
      ctx.metric('solution-count', 'inc');
      await ctx.emit({ type: 'solution', payload: { index: solutions, cols: [...cols] } });
      return 1;
    }

    await phase('choose-row');
    let found = 0;
    await ctx.emit({ type: 'row-enter', payload: { row } });

    for (let col = 0; col < n; col += 1) {
      if (ctx.cancelled) return found;

      await phase('safety-check');
      const blocker = firstBlocker(row, col);
      await ctx.emit({
        type: 'column-check',
        payload: {
          row,
          col,
          safe: blocker === null,
          blockerRow: blocker === null ? -1 : blocker.row,
          blockerCol: blocker === null ? -1 : blocker.col,
          reason: blocker === null ? 'none' : blocker.reason,
        },
      });
      if (blocker !== null) continue;

      await phase('place');
      cols[row] = col;
      places += 1;
      ctx.metric('place-count', 'inc');
      await ctx.emit({ type: 'place', payload: { row, col } });

      // 재귀 호출을 걸음 하나로 세운다. 이 걸음이 없으면 `descend` 는 자식 호출이
      // 곧바로 자기 phase 를 덮어써서 코드 패널에 한 번도 짚히지 않는다 — 재귀
      // 그 줄이 이 알고리즘의 심장인데 그것만 안 보이게 된다.
      await phase('descend');
      await ctx.emit({ type: 'descend', payload: { from: row, to: row + 1 } });
      found += await solve(row + 1);
      if (ctx.cancelled) return found;

      await phase('undo');
      cols[row] = -1;
      undos += 1;
      ctx.metric('undo-count', 'inc');
      await ctx.emit({ type: 'undo', payload: { row, col } });
    }

    await phase('return-found');
    await ctx.emit({ type: 'row-exit', payload: { row, found } });
    return found;
  }

  await solve(0);

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done', payload: { solutions, places, undos } });
}
