/**
 * join-kinds 알고리즘 — 같은 두 표를 INNER · LEFT · RIGHT · FULL · CROSS 로 잇는다.
 *
 * 손잡이 `kind` (0 INNER · 1 LEFT · 2 RIGHT · 3 FULL · 4 CROSS) 를 돌리면 판을 다시 돈다. 판은 앞 판의 결과를
 * 들고 시작해, 걸음마다 그 가운데 어느 줄이 남고 어느 줄이 떨어지는지를 가른다.
 *
 * 셈 — 중첩 루프. 바깥 왼쪽 표(차례대로), 안쪽 오른쪽 표(차례대로). 잇는 조건은 `on.left = on.right` 하나.
 *   - CROSS 는 조건을 셈하지 않는다 (견줌 0). 왼쪽 줄마다 오른쪽 줄 모두를 잇는다
 *   - 아니면 왼쪽 줄마다 오른쪽을 훑어 같으면 잇는다 (견줌 1 씩). 하나도 없으면 keepLeft 일 때 (i, 없음)
 *   - 그다음 CROSS 가 아니면 오른쪽을 훑어 한 번도 짝이 되지 않은 줄을 keepRight 일 때 (없음, j) 로 끝에 잇는다
 *   `irs.ts` 의 `joinRows` 와 같은 루프다 — test 가 모든 종류에서 두 답을 견준다.
 *
 * 결과 줄 차례 — 왼쪽 차례, 그 안에서 오른쪽 차례. 왼쪽 짝 없는 줄은 제 자리, 오른쪽 짝 없는 줄은 끝에 오른쪽 차례로.
 *   ORDER BY 가 없어 SQL 이 약속한 차례는 아니다 (설명 글이 밝힌다). 동률이 없다 — 한 줄의 자리(rank)는 (왼쪽 번호,
 *   오른쪽 번호) 로 하나뿐이다.
 *
 * 줄이 판가름 나는 걸음 — 짝 맞은 줄(둘 다 있음)은 걸음 1, 왼쪽 짝 없는 줄은 걸음 2, 오른쪽 짝 없는 줄은 걸음 3.
 *   CROSS 는 모두 걸음 1. 앞 판의 줄 가운데 아직 판가름 나지 않은 것은 `held: true` 로 제자리에 남는다.
 *
 * 이벤트 (payload 의 `rows` 는 지금 보이는 결과 줄 전부, 차례대로 —
 *   `{ l: 왼쪽 줄 번호 | -1, r: 오른쪽 줄 번호 | -1, slot: 결과 칸 번호, leftText, rightText, held }`, 짝 없는 쪽 글은 `nullText`):
 *   - `round`       (걸음 0) `{ kind, keyword, joinTail, onLine: string | null, rows, held: 앞 판에서 든 줄 수 }`
 *   - `pairs`       (걸음 1) `{ cross, rows, matched: 이 걸음에 이어진 줄 수, compares, nLeft, nRight, leftName, rightName }`
 *   - `left-side`   (걸음 2) `{ rows, unmatched: 왼쪽 줄 번호[], names: string[], kept: boolean, nullText }`
 *   - `right-side`  (걸음 3) `{ rows, unmatched: 오른쪽 줄 번호[], names: string[], kept: boolean, nullText }`
 *   - `phase`       silent `{ phase }`
 *   CROSS 판은 `round` · `pairs` 둘뿐이다 (짝 없는 줄이 없다).
 *
 * phase 어휘 (irs.ts 와 같다): `pair-match` · `left-unmatched` · `keep-left` · `right-unmatched` · `keep-right` · `cross-pair`
 *   걸음 1 → `pair-match` (CROSS 는 `cross-pair`) · 걸음 2 → keepLeft 면 `keep-left`, 아니면 `left-unmatched` ·
 *   걸음 3 → keepRight 면 `keep-right`, 아니면 `right-unmatched`. 걸음마다 phase 를 보낸 뒤 그림을 보내고 sleep 한다.
 *
 * 계기: `result-rows` (지금 이어진 결과 줄) · `null-rows` (그 가운데 NULL 을 단 줄) · `key-compares` (조건을 셈한 수).
 *   걸음 0 에서 셋 다 0, 걸음 1 에서 짝 맞은 줄 수 · 견줌 수, 걸음 2 · 3 에서 남긴 줄만큼 더한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type JoinKindsTable = {
  name: string;
  alias: string;
  cols: string[];
  rows: Array<Array<number | string>>;
};

export type JoinKindsKind = {
  value: number;
  keyword: string;
  keepLeft: boolean;
  keepRight: boolean;
  cross: boolean;
  joinTail: string;
  onLine: string | null;
};

export type JoinKindsData = {
  type: string;
  stepMs: number;
  left: JoinKindsTable;
  right: JoinKindsTable;
  on: { left: string; right: string };
  select: { left: string; right: string };
  sqlHead: string[];
  kinds: JoinKindsKind[];
  kind: number;
  nullText: string;
};

/** 결과 줄 하나 — 짝 없는 쪽은 -1. */
export type JoinPair = { l: number; r: number };

export type JoinOutcome = {
  rows: JoinPair[];
  compares: number;
  matched: number;
  keptLeft: number;
  keptRight: number;
  unmatchedLeft: number[];
  unmatchedRight: number[];
};

/** `slot` — 결과 칸 번호(0 부터). 줄마다 고정이라 판이 바뀌어도 같은 줄은 같은 칸에 선다. */
export type ShownRow = { l: number; r: number; slot: number; leftText: string; rightText: string; held: boolean };

type MetricName = 'result-rows' | 'null-rows' | 'key-compares';

export function colIndex(table: JoinKindsTable, col: string): number {
  const at = table.cols.indexOf(col);
  if (at < 0) throw new Error(`join-kinds: 표 ${table.name} 에 열 ${col} 이 없다`);
  return at;
}

function keyOf(table: JoinKindsTable, row: number, col: number): number {
  const v = table.rows[row]?.[col];
  if (typeof v !== 'number') throw new Error(`join-kinds: ${table.name} ${row + 1} 번째 줄의 열쇠가 수가 아니다`);
  return v;
}

export function kindOf(data: JoinKindsData, value: number): JoinKindsKind {
  const k = data.kinds.find((x) => x.value === value);
  if (!k) throw new Error(`join-kinds: 사다리 밖의 종류 ${value}`);
  return k;
}

/** IR `joinRows` 와 같은 루프. */
export function computeJoin(data: JoinKindsData, kind: JoinKindsKind): JoinOutcome {
  const lk = colIndex(data.left, data.on.left);
  const rk = colIndex(data.right, data.on.right);
  const nL = data.left.rows.length;
  const nR = data.right.rows.length;
  const rows: JoinPair[] = [];
  const rightHit: boolean[] = new Array<boolean>(nR).fill(false);
  const unmatchedLeft: number[] = [];
  const unmatchedRight: number[] = [];
  let compares = 0;
  let matched = 0;
  let keptLeft = 0;
  let keptRight = 0;
  for (let i = 0; i < nL; i += 1) {
    if (kind.cross) {
      for (let j = 0; j < nR; j += 1) rows.push({ l: i, r: j });
      continue;
    }
    let hit = false;
    for (let j = 0; j < nR; j += 1) {
      compares += 1;
      if (keyOf(data.left, i, lk) === keyOf(data.right, j, rk)) {
        rows.push({ l: i, r: j });
        matched += 1;
        hit = true;
        rightHit[j] = true;
      }
    }
    if (!hit) {
      unmatchedLeft.push(i);
      if (kind.keepLeft) {
        rows.push({ l: i, r: -1 });
        keptLeft += 1;
      }
    }
  }
  if (!kind.cross) {
    for (let j = 0; j < nR; j += 1) {
      if (rightHit[j]) continue;
      unmatchedRight.push(j);
      if (kind.keepRight) {
        rows.push({ l: -1, r: j });
        keptRight += 1;
      }
    }
  }
  return { rows, compares, matched, keptLeft, keptRight, unmatchedLeft, unmatchedRight };
}

/** 결과 줄의 자리 — 왼쪽 차례, 그 안에서 오른쪽 차례, 오른쪽 짝 없는 줄은 끝에. */
export function rankOf(p: JoinPair, nL: number, nR: number): number {
  return p.l >= 0 ? p.l * (nR + 1) + (p.r + 1) : nL * (nR + 1) + p.r;
}

/** 그 줄이 판가름 나는 걸음. */
function decideStep(p: JoinPair, cross: boolean): number {
  if (cross) return 1;
  if (p.l >= 0 && p.r >= 0) return 1;
  return p.r < 0 ? 2 : 3;
}

function cellText(data: JoinKindsData, side: 'left' | 'right', row: number): string {
  if (row < 0) return data.nullText;
  const table = data[side];
  const v = table.rows[row]?.[colIndex(table, data.select[side])];
  if (v === undefined) throw new Error(`join-kinds: ${table.name} 에 ${row + 1} 번째 줄이 없다`);
  return String(v);
}

/**
 * 결과 칸 배치 — 그 종류에서 나올 수 있는 줄 전부를 자리 차례로 늘어놓은 것. 줄의 칸 = 이 목록 안 번호.
 *   CROSS 가 아니면 FULL 의 줄 모음(짝 맞은 줄 + 양쪽 짝 없는 줄 전부)이라 INNER · LEFT · RIGHT · FULL 이 같은 배치를 쓴다 —
 *   Lee-NULL 이 들어와도 Mo-Owls 는 제 칸을 지키고, INNER 에서는 그 칸이 빈다. CROSS 는 제 결과 그대로.
 */
export function slotLayout(data: JoinKindsData, kind: JoinKindsKind): Map<string, number> {
  const nL = data.left.rows.length;
  const nR = data.right.rows.length;
  const all = kind.cross ? computeJoin(data, kind) : computeJoin(data, { ...kind, keepLeft: true, keepRight: true });
  const sorted = [...all.rows].sort((a, b) => rankOf(a, nL, nR) - rankOf(b, nL, nR));
  return new Map(sorted.map((p, k) => [`${p.l}:${p.r}`, k]));
}

function slotIn(layout: Map<string, number>, p: JoinPair): number {
  const k = layout.get(`${p.l}:${p.r}`);
  if (k === undefined) throw new Error(`join-kinds: 줄 ${p.l}:${p.r} 이 칸 배치에 없다`);
  return k;
}

/**
 * 걸음 `step` 에서 보이는 결과 줄 — 앞 판에서 든 줄 가운데 아직 판가름 나지 않은 것 + 이미 이어진 것.
 * 앞 판에서 든 줄은 앞 판의 칸에, 이어진 줄은 이 판의 칸에 선다.
 */
export function shownAt(
  data: JoinKindsData,
  kind: JoinKindsKind,
  prevKind: JoinKindsKind | null,
  prev: JoinPair[],
  out: JoinOutcome,
  step: number,
): ShownRow[] {
  const nL = data.left.rows.length;
  const nR = data.right.rows.length;
  const here = slotLayout(data, kind);
  const before = prevKind ? slotLayout(data, prevKind) : here;
  const held = prev.filter((p) => decideStep(p, kind.cross) > step).map((p) => ({ ...p, held: true, slot: slotIn(before, p) }));
  const joined = out.rows.filter((p) => decideStep(p, kind.cross) <= step).map((p) => ({ ...p, held: false, slot: slotIn(here, p) }));
  return [...held, ...joined]
    .sort((a, b) => rankOf(a, nL, nR) - rankOf(b, nL, nR))
    .map((p) => ({
      l: p.l,
      r: p.r,
      slot: p.slot,
      leftText: cellText(data, 'left', p.l),
      rightText: cellText(data, 'right', p.r),
      held: p.held,
    }));
}

function kindFromInput(data: JoinKindsData, payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) throw new Error('join-kinds: 손잡이 입력에 payload 가 없다');
  const value = (payload as { value?: unknown }).value;
  if (typeof value !== 'number') throw new Error('join-kinds: 손잡이 값이 수가 아니다');
  return kindOf(data, value).value;
}

export async function joinKindsAlgorithm(baseCtx: FacetContext<JoinKindsData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<JoinKindsData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const shown: Record<MetricName, number> = { 'result-rows': 0, 'null-rows': 0, 'key-compares': 0 };
  const setMetric = (name: MetricName, value: number) => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };

  const namesOf = (side: 'left' | 'right', rows: number[]) => rows.map((i) => cellText(data, side, i));

  /** 한 판. 취소되면 false. */
  const playRound = async (kind: JoinKindsKind, prevKind: JoinKindsKind | null, prev: JoinPair[], out: JoinOutcome): Promise<boolean> => {
    // 걸음 0 — 질의가 바뀌고 앞 판의 결과가 판가름을 기다린다
    setMetric('result-rows', 0);
    setMetric('null-rows', 0);
    setMetric('key-compares', 0);
    await ctx.emit({
      type: 'round',
      payload: {
        kind: kind.value,
        keyword: kind.keyword,
        joinTail: kind.joinTail,
        onLine: kind.onLine,
        rows: shownAt(data, kind, prevKind, prev, out, 0),
        held: prev.length,
      },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    // 걸음 1 — 짝 맞은 줄이 한꺼번에 이어진다 (CROSS 는 모든 짝)
    if (kind.cross) await phase('cross-pair');
    else await phase('pair-match');
    const pairRows = kind.cross ? out.rows.length : out.matched;
    await ctx.emit({
      type: 'pairs',
      payload: {
        cross: kind.cross,
        rows: shownAt(data, kind, prevKind, prev, out, 1),
        matched: pairRows,
        compares: out.compares,
        nLeft: data.left.rows.length,
        nRight: data.right.rows.length,
        leftName: data.left.name,
        rightName: data.right.name,
      },
    });
    setMetric('result-rows', pairRows);
    setMetric('key-compares', out.compares);
    if (!(await ctx.sleep(data.stepMs))) return false;
    if (kind.cross) return true;

    // 걸음 2 — 왼쪽 짝 없는 줄
    if (kind.keepLeft) await phase('keep-left');
    else await phase('left-unmatched');
    await ctx.emit({
      type: 'left-side',
      payload: {
        rows: shownAt(data, kind, prevKind, prev, out, 2),
        unmatched: out.unmatchedLeft,
        names: namesOf('left', out.unmatchedLeft),
        kept: kind.keepLeft,
        nullText: data.nullText,
      },
    });
    setMetric('result-rows', pairRows + out.keptLeft);
    setMetric('null-rows', out.keptLeft);
    if (!(await ctx.sleep(data.stepMs))) return false;

    // 걸음 3 — 오른쪽 짝 없는 줄
    if (kind.keepRight) await phase('keep-right');
    else await phase('right-unmatched');
    await ctx.emit({
      type: 'right-side',
      payload: {
        rows: shownAt(data, kind, prevKind, prev, out, 3),
        unmatched: out.unmatchedRight,
        names: namesOf('right', out.unmatchedRight),
        kept: kind.keepRight,
        nullText: data.nullText,
      },
    });
    setMetric('result-rows', pairRows + out.keptLeft + out.keptRight);
    setMetric('null-rows', out.keptLeft + out.keptRight);
    return ctx.sleep(data.stepMs);
  };

  try {
    let kind = kindOf(data, data.kind);
    let prev: JoinPair[] = [];
    let prevKind: JoinKindsKind | null = null;
    for (;;) {
      if (ctx.cancelled) return;
      const out = computeJoin(data, kind);
      if (!(await playRound(kind, prevKind, prev, out))) return;
      prev = out.rows;
      prevKind = kind;
      // 다음 손잡이 값을 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'kind') continue;
        kind = kindOf(data, kindFromInput(data, input.payload));
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
