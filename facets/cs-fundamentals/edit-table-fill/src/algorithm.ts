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
 *   diagonal-filled  { cells: { value: number;
 *                               from: 'origin' | 'up' | 'left' | 'diag' }[] }
 *                    다음 반대각선의 칸들이 이웃에서 값을 받아 채워진다.
 *                    칸의 차례는 `editTableDiagonal` 이 정하는 그 순서다.
 *                    silent 아님.
 *
 *   done             payload 없음
 *                    표가 다 찼다. 오른쪽 아래 한 칸이 두 낱말 전체의 답이다.
 *                    silent 아님.
 *
 *   rewind           payload 없음
 *                    표를 비우고 처음으로. 자동 재생이 끝난 뒤 advance 를 처음
 *                    누를 때 발신한다 (S-piece). silent 아님.
 *
 * ── 싣는 것과 싣지 않는 것
 *
 * **`from` 과 `value` 만 싣는다.** 그 둘이 편집 거리 점화식 그 자체다 — 어느 이웃을
 * 골랐고 거기서 무엇이 나왔나는 걸음이 내리는 판정이라, 장면이 스스로 셈하면 같은
 * 규칙이 두 곳에 적히고 언젠가 갈린다 (프로토콜 4 절의 잣대 표 · `bottom-up-table`
 * 의 피보나치 점화식과 같은 자리).
 *
 * 나머지는 전부 내주거나 장면이 센다.
 *   - **몇 번째 반대각선인가(`k`)** — 반대각선은 올 때마다 하나씩 쌓이므로
 *     `waves.length` 가 곧 그 번호다. 발신 순서가 이미 말한다.
 *   - **칸 자리(`i` · `j`)** — 표의 모양이 정하는 것이라 `editTableDiagonal` 이
 *     내주고 **algorithm 과 장면이 같은 함수를 부른다.** 순서를 정하는 자리가
 *     한 군데뿐이다.
 *   - **손질 값(`cost`)** — 두 글자가 같은가일 뿐이라 바탕 낱말에 순수 함수를
 *     먹이면 나온다. `editLetterMatch` 를 내준다 (프로토콜 4 절의 B).
 *   - **답 칸(`i` · `j` · `value`)** — 오른쪽 아래 구석이고 그 값은 표 안에 있다.
 *     `done` 이 아무것도 싣지 않는 까닭이다.
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

/**
 * 한 칸에 대한 점화식의 판정. 어느 이웃을 골랐고 거기서 무엇이 나왔나.
 *
 * 자리(`i` · `j`)는 담지 않는다 — 반대각선의 몇 번째인가가 곧 자리이고, 그 차례는
 * `editTableDiagonal` 이 정한다.
 */
export type EditFill = { value: number; from: EditCellFrom };

/** 반대각선 하나. `i + j === k` 인 칸들이 한꺼번에 채워진다. */
export type EditWave = readonly EditFill[];

/** 표의 세로 칸 수. 빈 앞자락 한 줄이 더 있다. */
export function editTableRows(source: string): number {
  return source.length + 1;
}

/** 표의 가로 칸 수. 빈 앞자락 한 열이 더 있다. */
export function editTableCols(target: string): number {
  return target.length + 1;
}

/** 반대각선의 개수. `k` 는 `0 .. count-1`. */
export function editWaveCount(source: string, target: string): number {
  return editTableRows(source) + editTableCols(target) - 1;
}

/**
 * 반대각선 `k` 위의 칸들. 위에서 아래로 (i 가 커지는 쪽으로) 줄 세운다.
 *
 * **표의 모양이 순서를 정한다** (S-piece). algorithm 의 채우는 순서도 장면이 칸
 * 자리를 되찾는 길도 이 함수 하나를 지나므로, 차례가 두 곳에 적히지 않는다.
 */
export function editTableDiagonal(
  rows: number,
  cols: number,
  k: number,
): readonly { i: number; j: number }[] {
  const out: { i: number; j: number }[] = [];
  const first = Math.max(0, k - (cols - 1));
  const last = Math.min(rows - 1, k);
  for (let i = first; i <= last; i += 1) out.push({ i, j: k - i });
  return out;
}

/**
 * 칸 `(i, j)` 가 견주는 두 글자가 같은가.
 *
 * 가장자리(`i === 0` 또는 `j === 0`)에는 견줄 글자가 없다. 바탕 낱말 둘에 순수
 * 함수를 먹여 나오는 값이라 발신에 싣지 않고 내준다.
 */
export function editLetterMatch(
  source: string,
  target: string,
  i: number,
  j: number,
): boolean {
  if (i <= 0 || j <= 0) return false;
  return source[i - 1] === target[j - 1];
}

/**
 * 골라 온 이웃에 붙는 손질 수.
 *
 * 대각선으로 왔으면 글자가 같은지가 정하고, 위·왼쪽으로 왔으면 언제나 하나다.
 * 구석은 올 데가 없어 0 이다.
 */
export function editStepCost(from: EditCellFrom, letterMatch: boolean): 0 | 1 {
  if (from === 'origin') return 0;
  if (from === 'diag') return letterMatch ? 0 : 1;
  return 1;
}

function fillCell(
  value: number[][],
  source: string,
  target: string,
  i: number,
  j: number,
): EditFill {
  // 빈 것에서 빈 것으로 — 손질할 것이 없다.
  if (i === 0 && j === 0) return { value: 0, from: 'origin' };
  // 첫 행은 넣기만으로, 첫 열은 지우기만으로 온다. 가장자리도 이웃에서 오는 것은 같다.
  if (i === 0) return { value: value[0][j - 1] + 1, from: 'left' };
  if (j === 0) return { value: value[i - 1][0] + 1, from: 'up' };

  const cost = editStepCost('diag', editLetterMatch(source, target, i, j));
  const diag = value[i - 1][j - 1] + cost;
  const up = value[i - 1][j] + 1;
  const left = value[i][j - 1] + 1;
  // 값이 같으면 대각선을 고른다 — 글자가 겹치는 자리가 대각선으로 이어져 보이게.
  if (diag <= up && diag <= left) return { value: diag, from: 'diag' };
  if (up <= left) return { value: up, from: 'up' };
  return { value: left, from: 'left' };
}

/**
 * 표를 반대각선 물결 순서로 셈한다. 걸음표를 손으로 적는 것이 아니라 표의 모양이
 * 순서를 정한다 (S-piece).
 */
export function buildEditWaves(source: string, target: string): EditWave[] {
  const rows = editTableRows(source);
  const cols = editTableCols(target);
  const value: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  const waves: EditWave[] = [];
  for (let k = 0; k < editWaveCount(source, target); k += 1) {
    const cells: EditFill[] = [];
    for (const at of editTableDiagonal(rows, cols, k)) {
      const cell = fillCell(value, source, target, at.i, at.j);
      value[at.i][at.j] = cell.value;
      cells.push(cell);
    }
    waves.push(cells);
  }
  return waves;
}

export async function editTableFillAlgorithm(
  ctx: FacetContext<EditTableFillData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<EditTableFillData>;
  const waves = buildEditWaves(rc.data.source, rc.data.target);
  if (waves.length === 0) return;

  // 자동 재생. 첫 걸음은 문을 지나지 않는다 — emit 이 먼저고 쉬는 것이 뒤다 (S-piece).
  for (const wave of waves) {
    await rc.emit({ type: 'diagonal-filled', payload: { cells: wave } });
    if (rc.cancelled) return;
    if (!(await rc.sleep(rc.data.stepMs))) return;
  }
  await rc.emit({ type: 'done' });

  // 한 걸음씩. 자동 재생이 끝난 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 보인다.
  let next = waves.length;
  for (;;) {
    if (rc.cancelled) return;
    if ((await rc.waitForInput()).type !== 'advance') continue;
    if (next >= waves.length) {
      await rc.emit({ type: 'rewind' });
      next = 0;
    }
    await rc.emit({ type: 'diagonal-filled', payload: { cells: waves[next] } });
    next += 1;
    if (next >= waves.length) {
      await rc.emit({ type: 'done' });
    }
    if (rc.cancelled) return;
  }
}
