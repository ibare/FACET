/**
 * edit-table-fill — 두 낱말을 같게 만드는 데 드는 최소 손질을 표로 채운다.
 *
 * 동사는 **번져 나간다** 다. 왼쪽 위 구석에서 시작한 값이 반대각선 물결을 타고
 * 오른쪽 아래로 번지고, 마지막 칸 하나가 두 낱말 전체의 답이 된다.
 *
 * 한 걸음은 반대각선 하나다. 같은 반대각선(i + j === k)의 칸들은 서로를 참조하지
 * 않는다 — 의존이 k-1 과 k-2 에만 걸리기 때문이다. 그래서 한꺼번에 채우는 것이
 * 거짓이 아니다.
 *
 * ── 이벤트 (facet 고유 확장, C2)
 *
 *   diagonal-filled  { k: number;
 *                      cells: { i: number; j: number; value: number;
 *                               from: 'origin' | 'up' | 'left' | 'diag';
 *                               cost: 0 | 1 }[] }
 *                    반대각선 k 의 칸들이 이웃에서 값을 받아 채워진다.
 *                    from 은 값이 어느 이웃에서 왔는지, cost 는 그 걸음에 든
 *                    손질 수 (0 이면 글자가 같아 공짜로 지나간 것). silent 아님.
 *
 *   done             { i: number; j: number; value: number }
 *                    마지막 칸. 두 낱말 전체의 답. silent 아님.
 *
 *   rewind           {}
 *                    표를 비우고 처음으로. 자동 재생이 끝난 뒤 advance 를 처음
 *                    누를 때 발신한다 (S-piece). silent 아님.
 *
 * metric 은 부르지 않는다 — 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EditTableFillData = {
  type: string;
  /** 고치는 쪽 낱말. 표의 세로. */
  source: string;
  /** 맞출 쪽 낱말. 표의 가로. */
  target: string;
  /** 애니메이션이 끝난 뒤의 정지 시간 (ms). */
  stepMs: number;
};

/** 값이 어느 이웃에서 왔는가. `origin` 은 왼쪽 위 구석 — 올 데가 없는 자리다. */
export type EditCellFrom = 'origin' | 'up' | 'left' | 'diag';

export type EditCell = {
  i: number;
  j: number;
  value: number;
  from: EditCellFrom;
  cost: 0 | 1;
};

/** 반대각선 하나. `i + j === k` 인 칸들이 한꺼번에 채워진다. */
export type EditWave = { k: number; cells: EditCell[] };

function fillCell(
  value: number[][],
  source: string,
  target: string,
  i: number,
  j: number,
): EditCell {
  // 빈 것에서 빈 것으로 — 손질할 것이 없다.
  if (i === 0 && j === 0) return { i, j, value: 0, from: 'origin', cost: 0 };
  // 첫 행은 넣기만으로, 첫 열은 지우기만으로 온다. 가장자리도 이웃에서 오는 것은 같다.
  if (i === 0) return { i, j, value: value[0][j - 1] + 1, from: 'left', cost: 1 };
  if (j === 0) return { i, j, value: value[i - 1][0] + 1, from: 'up', cost: 1 };

  const cost: 0 | 1 = source[i - 1] === target[j - 1] ? 0 : 1;
  const diag = value[i - 1][j - 1] + cost;
  const up = value[i - 1][j] + 1;
  const left = value[i][j - 1] + 1;
  // 값이 같으면 대각선을 고른다 — 글자가 겹치는 자리가 대각선으로 이어져 보이게.
  if (diag <= up && diag <= left) return { i, j, value: diag, from: 'diag', cost };
  if (up <= left) return { i, j, value: up, from: 'up', cost: 1 };
  return { i, j, value: left, from: 'left', cost: 1 };
}

/**
 * 표를 반대각선 물결 순서로 셈한다. 걸음표를 손으로 적는 것이 아니라 표의 모양이
 * 순서를 정한다 (S-piece).
 */
export function buildEditWaves(source: string, target: string): EditWave[] {
  const rows = source.length + 1;
  const cols = target.length + 1;
  const value: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  const waves: EditWave[] = [];
  for (let k = 0; k <= rows + cols - 2; k += 1) {
    const cells: EditCell[] = [];
    const first = Math.max(0, k - (cols - 1));
    const last = Math.min(rows - 1, k);
    for (let i = first; i <= last; i += 1) {
      const cell = fillCell(value, source, target, i, k - i);
      value[i][k - i] = cell.value;
      cells.push(cell);
    }
    waves.push({ k, cells });
  }
  return waves;
}

export async function editTableFillAlgorithm(
  ctx: FacetContext<EditTableFillData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<EditTableFillData>;
  const waves = buildEditWaves(rc.data.source, rc.data.target);
  if (waves.length === 0) return;

  const lastWave = waves[waves.length - 1];
  const answer = lastWave.cells[lastWave.cells.length - 1];
  const finalPayload = { i: answer.i, j: answer.j, value: answer.value };

  // 자동 재생. 첫 걸음은 문을 지나지 않는다 — emit 이 먼저고 쉬는 것이 뒤다 (S-piece).
  for (const wave of waves) {
    await rc.emit({ type: 'diagonal-filled', payload: wave });
    if (rc.cancelled) return;
    if (!(await rc.sleep(rc.data.stepMs))) return;
  }
  await rc.emit({ type: 'done', payload: finalPayload });

  // 한 걸음씩. 자동 재생이 끝난 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 보인다.
  let next = waves.length;
  for (;;) {
    if (rc.cancelled) return;
    if ((await rc.waitForInput()).type !== 'advance') continue;
    if (next >= waves.length) {
      await rc.emit({ type: 'rewind', payload: {} });
      next = 0;
    }
    await rc.emit({ type: 'diagonal-filled', payload: waves[next] });
    next += 1;
    if (next >= waves.length) {
      await rc.emit({ type: 'done', payload: finalPayload });
    }
    if (rc.cancelled) return;
  }
}
