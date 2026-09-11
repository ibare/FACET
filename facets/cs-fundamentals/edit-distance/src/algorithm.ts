/**
 * editDistance — 표를 다 채우면 숫자 하나가 아니라 고치는 방법이 나온다.
 *
 * 표의 마지막 칸은 "몇 번 손질하면 되는가" 를 말할 뿐이다. 그 표를 **거꾸로
 * 짚으면** 어느 칸에서 무엇을 했는지가 나오고, 그것이 곧 고침 목록이다.
 * 손잡이 하나가 그 목록을 바꾼다 — 교체를 비싸게 매기면 한 번의 바꿈 대신
 * 넣기와 지우기 둘로 돌아간다.
 *
 * ── 1차 데이터
 *
 * 낱말 둘과 교체 비용의 처음 자리뿐이다. **표도 되짚은 길도 고침 목록도 여기서
 * 직접 셈한다** — 미리 적어 두면 낱말을 고칠 때 화면이 조용히 거짓을 말한다.
 *
 * ── 이벤트 어휘 (C2)
 *
 * | type          | payload                                              | silent |
 * |---------------|------------------------------------------------------|--------|
 * | `phase`       | `{ phase: string }`                                  | O      |
 * | `table-init`  | `{ rows, cols, source, target, subCost }`            | X      |
 * | `cell-filled` | `{ i, j, value }`                                    | X      |
 * | `table-done`  | `{ value }`                                          | X      |
 * | `path-step`   | `{ i, j, pi, pj, op, from, to }`                     | X      |
 * | `fix-listed`  | `{ index, i, j, op, from, to }`                      | X      |
 * | `verdict`     | `{ subCost, cost, fixCount, replaceCount }`          | X      |
 * | `done`        | 없음 (표준 어휘)                                      | X      |
 *
 * `path-step` 의 `(i, j)` 는 지금 서 있는 칸이고 `(pi, pj)` 는 그 값이 온 이웃이다.
 * 되짚기는 마지막 칸에서 구석으로 가므로 발신 차례가 읽는 차례의 거꾸로다.
 *
 * ── phase 어휘 (C3 — irs.ts 와 집합이 완전히 일치해야 한다)
 *
 * `init-edges` · `compare` · `fill-cell` · `step-back` · `answer`
 *
 * ── 메트릭 (C5 — facet.ts 의 metrics[].name 과 일치)
 *
 * `cost-sum` · `fix-count` · `replace-count`
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EditDistanceData = {
  type: 'edit-distance';
  /** 고치는 쪽 낱말. 표의 세로. */
  source: string;
  /** 맞출 쪽 낱말. 표의 가로. */
  target: string;
  /** 글자 하나를 바꾸는 데 드는 값. 손잡이가 바꾼다. 넣기와 지우기는 늘 1. */
  subCost: number;
  /** 걸음 사이에 쉬는 시간. 읽을 틈을 주는 저작 결정이다. */
  stepMs: number;
};

/** 한 걸음이 무엇을 한 것인가. `keep` 은 손질이 아니라 그냥 지나간 것이다. */
export type EditOp = 'keep' | 'replace' | 'delete' | 'insert';

/**
 * 되짚은 길의 한 걸음.
 *
 * `(i, j)` 는 서 있던 칸, `(pi, pj)` 는 값이 온 이웃이다. `from` 은 고치는 쪽에서
 * 건드린 글자, `to` 는 맞출 쪽에서 놓인 글자 — 넣기에는 `from` 이, 지우기에는
 * `to` 가 빈 문자열이다.
 */
export type EditStep = {
  i: number;
  j: number;
  pi: number;
  pj: number;
  op: EditOp;
  from: string;
  to: string;
};

/**
 * 표를 끝까지 채운다. 칸 `(i, j)` 는 `source` 의 앞 `i` 글자를 `target` 의 앞
 * `j` 글자로 만드는 데 드는 최소값이다.
 */
export function fillEditTable(source: string, target: string, subCost: number): number[][] {
  const rows = source.length + 1;
  const cols = target.length + 1;
  const table: number[][] = [];
  for (let i = 0; i < rows; i += 1) table.push(new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) table[i][0] = i;
  for (let j = 0; j < cols; j += 1) table[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = source[i - 1] === target[j - 1] ? 0 : subCost;
      const best = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1);
      table[i][j] = Math.min(best, table[i - 1][j - 1] + cost);
    }
  }
  return table;
}

/**
 * 다 채운 표를 되짚어 고침 목록을 뽑는다. **읽는 차례로** 돌려준다.
 *
 * 값이 같으면 대각선을 먼저 고르고 그다음이 위(지움), 마지막이 왼쪽(넣음)이다.
 * 채울 때의 차례와 같아야 화면에 그린 길이 표가 고른 이웃과 어긋나지 않는다.
 */
export function backtrackEdits(
  table: number[][],
  source: string,
  target: string,
  subCost: number,
): EditStep[] {
  const steps: EditStep[] = [];
  let i = source.length;
  let j = target.length;
  while (i > 0 || j > 0) {
    let moved = false;
    if (i > 0 && j > 0) {
      const cost = source[i - 1] === target[j - 1] ? 0 : subCost;
      if (table[i][j] === table[i - 1][j - 1] + cost) {
        steps.push({
          i,
          j,
          pi: i - 1,
          pj: j - 1,
          op: cost === 0 ? 'keep' : 'replace',
          from: source[i - 1],
          to: target[j - 1],
        });
        i -= 1;
        j -= 1;
        moved = true;
      }
    }
    if (!moved && i > 0 && table[i][j] === table[i - 1][j] + 1) {
      steps.push({ i, j, pi: i - 1, pj: j, op: 'delete', from: source[i - 1], to: '' });
      i -= 1;
      moved = true;
    }
    if (!moved) {
      steps.push({ i, j, pi: i, pj: j - 1, op: 'insert', from: '', to: target[j - 1] });
      j -= 1;
    }
  }
  // 마지막 칸에서 거슬러 왔으니 뒤집어야 읽는 차례가 된다.
  return steps.reverse();
}

/** 한 걸음에 드는 값. 넣기와 지우기는 1 로 고정이고 바꿈만 손잡이를 탄다. */
function costOf(op: EditOp, subCost: number): number {
  if (op === 'keep') return 0;
  return op === 'replace' ? subCost : 1;
}

/** segmented-slider 가 보내는 payload 에서 고른 값을 꺼낸다 (C9). */
function segmentValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as Record<string, unknown>).value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const editDistanceAlgorithm = async (
  ctx: FacetContext<EditDistanceData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<EditDistanceData>;
  const source = ctx.data.source;
  const target = ctx.data.target;
  const step = ctx.data.stepMs;

  let subCost = ctx.data.subCost;

  /**
   * 메트릭은 늘 더해진다 (`ctx.metric` 이 누적기다). 손잡이를 밀 때마다 처음부터
   * 다시 세므로, 보이고 싶은 것은 누적이 아니라 이번 판의 값이다. 지금 보이는
   * 값을 기억해 두고 그 차이를 보낸다.
   */
  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown[name] ?? 0));
    shown[name] = value;
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 한 판 — 표를 채우고, 되짚고, 고침 목록을 뽑는다. 취소 없이 끝났으면 true. */
  const fillAndWalkBack = async (): Promise<boolean> => {
    const rows = source.length + 1;
    const cols = target.length + 1;

    await ctx.emit({
      type: 'table-init',
      payload: { rows, cols, source, target, subCost },
    });
    setMetric('cost-sum', 0);
    setMetric('fix-count', 0);
    setMetric('replace-count', 0);
    if (!(await rctx.sleep(step))) return false;

    const table = fillEditTable(source, target, subCost);

    // ── 가장자리. 빈 것에서 오는 길은 글자 수만큼 넣거나 지우는 것뿐이다.
    await phase('init-edges');
    for (let i = 0; i < rows; i += 1) {
      // 한 걸음 안에서 가장자리를 통째로 내보내므로 문을 둘 수 없다 (C8).
      if (ctx.cancelled) return false;
      await ctx.emit({ type: 'cell-filled', payload: { i, j: 0, value: table[i][0] } });
    }
    for (let j = 1; j < cols; j += 1) {
      if (ctx.cancelled) return false;
      await ctx.emit({ type: 'cell-filled', payload: { i: 0, j, value: table[0][j] } });
    }
    if (!(await rctx.sleep(step))) return false;

    // ── 안쪽. 칸마다 이웃 셋을 견주고 가장 싼 것을 앉힌다.
    for (let i = 1; i < rows; i += 1) {
      if (ctx.cancelled) return false;
      for (let j = 1; j < cols; j += 1) {
        if (ctx.cancelled) return false;
        await phase('compare');
        if (!(await rctx.sleep(step / 12))) return false;
        await phase('fill-cell');
        await ctx.emit({ type: 'cell-filled', payload: { i, j, value: table[i][j] } });
        if (!(await rctx.sleep(step / 12))) return false;
      }
    }

    await ctx.emit({ type: 'table-done', payload: { value: table[rows - 1][cols - 1] } });
    if (!(await rctx.sleep(step * 2))) return false;

    // ── 되짚기. 읽는 차례의 거꾸로로 걸으며 길을 그린다.
    const steps = backtrackEdits(table, source, target, subCost);
    await phase('step-back');
    for (let k = steps.length - 1; k >= 0; k -= 1) {
      if (ctx.cancelled) return false;
      const s = steps[k];
      await ctx.emit({
        type: 'path-step',
        payload: { i: s.i, j: s.j, pi: s.pi, pj: s.pj, op: s.op, from: s.from, to: s.to },
      });
      if (!(await rctx.sleep(step * 0.6))) return false;
    }

    // ── 고침 목록. 읽는 차례로 되돌려 놓으면 손질만 남는다.
    await phase('answer');
    let cost = 0;
    let fixCount = 0;
    let replaceCount = 0;
    let index = 0;
    for (const s of steps) {
      if (ctx.cancelled) return false;
      if (s.op === 'keep') continue;
      cost += costOf(s.op, subCost);
      fixCount += 1;
      if (s.op === 'replace') replaceCount += 1;
      await ctx.emit({
        type: 'fix-listed',
        payload: { index, i: s.i, j: s.j, op: s.op, from: s.from, to: s.to },
      });
      index += 1;
      setMetric('cost-sum', cost);
      setMetric('fix-count', fixCount);
      setMetric('replace-count', replaceCount);
      if (!(await rctx.sleep(step * 0.8))) return false;
    }

    await ctx.emit({
      type: 'verdict',
      payload: { subCost, cost, fixCount, replaceCount },
    });
    // 판정이 한 박자 머문 뒤에 "이제 기다린다" 로 넘어간다. 둘을 붙여 내보내면
    // 판정 문장이 같은 프레임에 덮여 아무도 읽지 못한다.
    if (!(await rctx.sleep(step * 4))) return false;
    await ctx.emit({ type: 'done' });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await fillAndWalkBack())) return;

      // 손잡이를 기다린다. 여기서 재생·한 걸음이 꺼지고 되돌리기와 위젯만 남는다.
      const ev = await rctx.waitForInput();
      if (ev.type === 'sub-cost') {
        const v = segmentValue(ev.payload);
        if (v !== null) subCost = v;
      }
    }
  } catch (err) {
    // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C6·C8).
    if (!ctx.cancelled) throw err;
    return;
  }
};
