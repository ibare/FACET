/**
 * myers-diff — 두 파일의 차이를 Myers 의 앞으로 가는 탐욕판으로 찾는다.
 *
 * 손잡이 둘: `edits` (고친 줄 k) · `length` (파일 길이 N). 두 파일 짓기 —
 * A = `lines` 의 앞 N 줄, B = A 에서 자리 t × (N div (k+1)) (0 기반, t = 1..k) 의 줄을
 * `newLines[t−1]` 로 바꾼 것. 줄 비교는 글자 그대로(앞 빈칸도 글자), 바꿈은 없다.
 *
 * Myers 규약 — D = 0, 1, … 마다 k = −D, −D+2, …, D. `k == −D` 이거나 (`k != D` 이고
 * `V[k−1] < V[k+1]`) 이면 아래(넣음, x = V[k+1]), 아니면 오른쪽(지움, x = V[k−1] + 1).
 * 그 뒤 같은 줄인 동안 대각선으로 미끄러진다(값 0). (N, M) 에 닿으면 그 자리에서 멈춘다 —
 * 같은 D 의 남은 k 를 돌지 않는다. 동률 `V[k−1] == V[k+1]` 은 오른쪽(지움)으로 간다.
 * 되짚기는 층 D−1 의 V 에 같은 고르기 규칙을 거꾸로 댄다.
 * 판 밖 끝점 · 없는 V 칸을 만나면 던진다 (C6).
 *
 * 한 판의 걸음 (걸음 경계 = sleep):
 *   0  `round-start` — 격자 · 두 파일 · 바꾼 자리 · 표 칸. 끝점 없음
 *   1  `layer-slide` (D = 0) — (0,0) 에서 공짜로 미끄러진다
 *   D ≥ 1 마다 `layer-pay` 다음 `layer-slide`
 *   끝 `fold` — 끝 경로가 편집 목록으로 접힌다 (phase 새로 없음)
 *
 * 이벤트 (silent 가 아닌 것은 모두 걸음 하나):
 *   phase        { phase: 'pay' | 'slide' | 'reach-end' }                        silent
 *   round-start  { k, n, m, delSpots: number[], insSpots: number[],
 *                  matches: { x, y }[], tableCells, cellsScale }
 *                  delSpots · insSpots 는 바꾼 줄의 0 기반 자리, matches 는 A[x] == B[y] 인 칸,
 *                  cellsScale 은 막대 눈금 — 사다리 끝 길이의 표 칸 (L+1)²
 *   layer-pay    { d, moves: { k, fromX, fromY, toX, toY, dir: 'del' | 'ins' }[], work }
 *   layer-slide  { d, runs: { k, fromX, fromY, toX, toY, len }[], layerSlides, reached, work }
 *                  work = 지금까지 들른 끝점 + 미끄러진 칸 ("Myers 일" 막대)
 *   fold         { points: { x, y }[], kinds: ('keep' | 'del' | 'ins')[],
 *                  rows: { kind: 'keep' | 'del' | 'ins' | 'run', mark, text, count, x, y }[],
 *                  kept, deleted, inserted }
 *                  points 는 끝 경로의 꼭짓점(0,0 부터), kinds 는 칸마다의 손질,
 *                  rows 는 편집 목록 — 남김이 셋 이상 이어지면 `run` 한 줄로 접는다.
 *                  (x, y) 는 그 줄이 격자에서 떠나는 자리
 *
 * phase 어휘: `pay` · `slide` · `reach-end` (irs.ts 와 같다). D = 0 걸음에는 `pay` 를
 * 보내지 않는다 — IR 의 D = 0 은 버퍼 트릭(v[offset+1] = 0)으로 고르기 if 를 지나지만
 * 값을 치르지 않는다. 끝에 닿은 층의 미끄러짐 걸음은 `slide` 뒤에 `reach-end` 를 보낸다.
 *
 * 계기 (회차마다 값, 누적 금지 — 차이만 보내는 헬퍼):
 *   edit-cost    값 D — 층의 치름 걸음에 그 D
 *   endpoints    들른 끝점 수
 *   slides       미끄러진 칸 합
 *   table-cells  LCS 표였다면 채울 칸 (N+1)(M+1) — 걸음 0 에 이 판의 값
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MyersDiffData = {
  type: 'myers-diff';
  stepMs: number;
  /** 파일 줄 마흔 — 모두 서로 다르다 */
  lines: string[];
  /** 바꿔 넣을 새 줄 */
  newLines: string[];
  editLadder: number[];
  lengthLadder: number[];
  /** 손잡이 기본값 */
  edits: number;
  length: number;
  /** 편집 목록 표식 */
  marks: { keep: string; del: string; ins: string };
};

export type Point = { x: number; y: number };

export type LayerEnd = {
  k: number;
  /** 앞 층의 끝점 (D = 0 이면 null) */
  prev: Point | null;
  /** 한 칸 치른 뒤 자리 */
  paid: Point;
  /** 미끄러진 뒤 자리 */
  end: Point;
  slide: number;
};

export type MyersTrace = {
  d: number;
  layers: LayerEnd[][];
  /** 층마다 그 층을 마친 V 사진 */
  snaps: Map<number, number>[];
};

export type MoveKind = 'keep' | 'del' | 'ins';
export type Move = { kind: MoveKind; x: number; y: number };

/** A = 앞 n 줄, B = A 의 자리 t·(n div (k+1)) 를 새 줄 t 로. spots 는 0 기반 자리 */
export function buildFiles(
  lines: readonly string[],
  newLines: readonly string[],
  n: number,
  k: number,
): { a: string[]; b: string[]; spots: number[] } {
  if (n > lines.length) throw new Error(`myers-diff: 파일 길이 ${n} 이 lines(${lines.length}) 보다 길다`);
  if (k > newLines.length) throw new Error(`myers-diff: 고친 줄 ${k} 이 newLines(${newLines.length}) 보다 많다`);
  const a = lines.slice(0, n);
  const b = a.slice();
  const step = Math.floor(n / (k + 1));
  const spots: number[] = [];
  for (let t = 1; t <= k; t += 1) {
    const at = t * step;
    const line = newLines[t - 1];
    if (line === undefined) throw new Error(`myers-diff: newLines[${t - 1}] 이 없다`);
    b[at] = line;
    spots.push(at);
  }
  return { a, b, spots };
}

function vAt(v: Map<number, number>, k: number): number {
  const x = v.get(k);
  if (x === undefined) throw new Error(`myers-diff: V[${k}] 이 비어 있다`);
  return x;
}

/** 규약대로 고른다 — true 면 아래(넣음) */
function goesDown(v: Map<number, number>, k: number, d: number): boolean {
  if (k === -d) return true;
  if (k === d) return false;
  return vAt(v, k - 1) < vAt(v, k + 1);
}

/**
 * Myers 앞으로 찾기. strict 면 판 밖 끝점에서 던진다.
 * 돌려줌: 값 D, 층마다의 끝점, 층마다의 V 사진.
 */
export function traceMyers(a: readonly string[], b: readonly string[], strict = true): MyersTrace {
  const n = a.length;
  const m = b.length;
  const v = new Map<number, number>([[1, 0]]);
  const layers: LayerEnd[][] = [];
  const snaps: Map<number, number>[] = [];
  for (let d = 0; d <= n + m; d += 1) {
    const eps: LayerEnd[] = [];
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      let prev: Point | null;
      if (d === 0) {
        x = 0;
        prev = null;
      } else if (goesDown(v, k, d)) {
        x = vAt(v, k + 1);
        prev = { x, y: x - (k + 1) };
      } else {
        const px = vAt(v, k - 1);
        x = px + 1;
        prev = { x: px, y: px - (k - 1) };
      }
      let y = x - k;
      if (strict && (x < 0 || x > n || y < 0 || y > m)) {
        throw new Error(`myers-diff: 판 밖 끝점 D=${d} k=${k} (${x}, ${y})`);
      }
      const paid = { x, y };
      let slide = 0;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
        slide += 1;
      }
      v.set(k, x);
      eps.push({ k, prev, paid, end: { x, y }, slide });
      if (x >= n && y >= m) {
        layers.push(eps);
        snaps.push(new Map(v));
        return { d, layers, snaps };
      }
    }
    layers.push(eps);
    snaps.push(new Map(v));
  }
  throw new Error('myers-diff: 끝에 닿지 못했다');
}

/** 되짚기 — 끝 (N, M) 에서 층을 거꾸로. 돌려줌은 앞에서부터의 손질 차례 */
export function backtrack(a: readonly string[], b: readonly string[], trace: MyersTrace): Move[] {
  let x = a.length;
  let y = b.length;
  const moves: Move[] = [];
  for (let d = trace.d; d > 0; d -= 1) {
    const vp = trace.snaps[d - 1];
    if (vp === undefined) throw new Error(`myers-diff: 층 ${d - 1} 의 V 사진이 없다`);
    const k = x - y;
    let px: number;
    let py: number;
    let sx: number;
    let sy: number;
    let kind: MoveKind;
    if (goesDown(vp, k, d)) {
      px = vAt(vp, k + 1);
      py = px - (k + 1);
      sx = px;
      sy = py + 1;
      kind = 'ins';
    } else {
      px = vAt(vp, k - 1);
      py = px - (k - 1);
      sx = px + 1;
      sy = py;
      kind = 'del';
    }
    while (x > sx && y > sy) {
      moves.push({ kind: 'keep', x: x - 1, y: y - 1 });
      x -= 1;
      y -= 1;
    }
    if (x !== sx || y !== sy) throw new Error(`myers-diff: 되짚기가 (${sx}, ${sy}) 에 닿지 못했다`);
    moves.push({ kind, x: px, y: py });
    x = px;
    y = py;
  }
  while (x > 0 && y > 0) {
    moves.push({ kind: 'keep', x: x - 1, y: y - 1 });
    x -= 1;
    y -= 1;
  }
  if (x !== 0 || y !== 0) throw new Error(`myers-diff: 되짚기가 (0, 0) 에 닿지 못했다 (${x}, ${y})`);
  return moves.reverse();
}

/** 남김이 이만큼 이어지면 목록에서 한 줄로 접는다 */
const RUN_FOLD = 3;

type FoldRow = { kind: MoveKind | 'run'; mark: string; text: string; count: number; x: number; y: number };

function foldRows(
  a: readonly string[],
  b: readonly string[],
  moves: readonly Move[],
  marks: MyersDiffData['marks'],
): FoldRow[] {
  const rows: FoldRow[] = [];
  let i = 0;
  while (i < moves.length) {
    const mv = moves[i];
    if (mv === undefined) throw new Error(`myers-diff: 손질 ${i} 이 없다`);
    if (mv.kind === 'keep') {
      let j = i;
      while (j < moves.length && moves[j]?.kind === 'keep') j += 1;
      const run = j - i;
      if (run >= RUN_FOLD) {
        rows.push({ kind: 'run', mark: marks.keep, text: '', count: run, x: mv.x, y: mv.y });
      } else {
        for (let q = i; q < j; q += 1) {
          const kp = moves[q];
          if (kp === undefined) throw new Error(`myers-diff: 손질 ${q} 이 없다`);
          const text = a[kp.x];
          if (text === undefined) throw new Error(`myers-diff: A[${kp.x}] 이 없다`);
          rows.push({ kind: 'keep', mark: marks.keep, text, count: 1, x: kp.x, y: kp.y });
        }
      }
      i = j;
      continue;
    }
    if (mv.kind === 'del') {
      const text = a[mv.x];
      if (text === undefined) throw new Error(`myers-diff: A[${mv.x}] 이 없다`);
      rows.push({ kind: 'del', mark: marks.del, text, count: 1, x: mv.x, y: mv.y });
    } else {
      const text = b[mv.y];
      if (text === undefined) throw new Error(`myers-diff: B[${mv.y}] 이 없다`);
      rows.push({ kind: 'ins', mark: marks.ins, text, count: 1, x: mv.x, y: mv.y });
    }
    i += 1;
  }
  return rows;
}

function inLadder(ladder: readonly number[], value: unknown): value is number {
  return typeof value === 'number' && ladder.includes(value);
}

export async function myersDiffAlgorithm(ctx: FacetContext<MyersDiffData>): Promise<void> {
  const rctx = ctx as ReactiveContext<MyersDiffData>;
  const data = ctx.data;
  if (!inLadder(data.editLadder, data.edits)) throw new Error(`myers-diff: 기본 edits ${data.edits} 가 사다리에 없다`);
  if (!inLadder(data.lengthLadder, data.length)) throw new Error(`myers-diff: 기본 length ${data.length} 가 사다리에 없다`);
  let edits = data.edits;
  let length = data.length;

  // 지금 보이는 값 — 계기는 누적 채널이라 차이만 보낸다
  const shown: Record<string, number> = { 'edit-cost': 0, endpoints: 0, slides: 0, 'table-cells': 0 };
  const setMetric = (name: string, value: number): void => {
    const now = shown[name];
    if (now === undefined) throw new Error(`myers-diff: 선언하지 않은 계기 ${name}`);
    ctx.metric(name, value - now);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRound = async (k: number, n: number): Promise<boolean> => {
    const { a, b, spots } = buildFiles(data.lines, data.newLines, n, k);
    const trace = traceMyers(a, b);
    const moves = backtrack(a, b, trace);
    const tableCells = (a.length + 1) * (b.length + 1);
    const longest = Math.max(...data.lengthLadder);
    const cellsScale = (longest + 1) * (longest + 1);
    const matches: Point[] = [];
    for (let x = 0; x < a.length; x += 1) {
      for (let y = 0; y < b.length; y += 1) {
        if (a[x] === b[y]) matches.push({ x, y });
      }
    }

    // 걸음 0 — 처음
    setMetric('edit-cost', 0);
    setMetric('endpoints', 0);
    setMetric('slides', 0);
    setMetric('table-cells', tableCells);
    await ctx.emit({
      type: 'round-start',
      payload: { k, n: a.length, m: b.length, delSpots: spots, insSpots: spots, matches, tableCells, cellsScale },
    });
    if (!(await rctx.sleep(data.stepMs))) return false;

    let endpoints = 0;
    let slides = 0;
    for (let d = 0; d < trace.layers.length; d += 1) {
      if (ctx.cancelled) return false;
      const eps = trace.layers[d];
      if (eps === undefined) throw new Error(`myers-diff: 층 ${d} 이 없다`);
      const last = d === trace.d;
      if (d > 0) {
        // ① 치름 — 이 층의 끝점마다 앞 층 끝점에서 한 칸
        const moveList = eps.map((e) => {
          if (e.prev === null) throw new Error(`myers-diff: 층 ${d} k=${e.k} 의 앞 끝점이 없다`);
          const dir: 'del' | 'ins' = e.paid.x > e.prev.x ? 'del' : 'ins';
          return { k: e.k, fromX: e.prev.x, fromY: e.prev.y, toX: e.paid.x, toY: e.paid.y, dir };
        });
        endpoints += eps.length;
        await phase('pay');
        setMetric('edit-cost', d);
        setMetric('endpoints', endpoints);
        await ctx.emit({ type: 'layer-pay', payload: { d, moves: moveList, work: endpoints + slides } });
        if (!(await rctx.sleep(data.stepMs))) return false;
        if (ctx.cancelled) return false;
      } else {
        endpoints += eps.length;
        setMetric('endpoints', endpoints);
      }
      // ② 미끄러짐 — 끝점마다 대각선으로 공짜 칸
      const runs = eps.map((e) => ({
        k: e.k,
        fromX: e.paid.x,
        fromY: e.paid.y,
        toX: e.end.x,
        toY: e.end.y,
        len: e.slide,
      }));
      const layerSlides = eps.reduce((s, e) => s + e.slide, 0);
      slides += layerSlides;
      await phase('slide');
      if (last) await phase('reach-end');
      setMetric('slides', slides);
      await ctx.emit({
        type: 'layer-slide',
        payload: { d, runs, layerSlides, reached: last, work: endpoints + slides },
      });
      if (!(await rctx.sleep(data.stepMs))) return false;
    }
    if (ctx.cancelled) return false;

    // 접힘 — 끝 경로 하나가 편집 목록으로
    const points: Point[] = [{ x: 0, y: 0 }];
    let px = 0;
    let py = 0;
    for (const mv of moves) {
      if (mv.kind !== 'ins') px += 1;
      if (mv.kind !== 'del') py += 1;
      points.push({ x: px, y: py });
    }
    const kept = moves.filter((mv) => mv.kind === 'keep').length;
    const deleted = moves.filter((mv) => mv.kind === 'del').length;
    const inserted = moves.filter((mv) => mv.kind === 'ins').length;
    if (deleted + inserted !== trace.d) {
      throw new Error(`myers-diff: 끝 경로의 지움+넣음 ${deleted + inserted} 이 D ${trace.d} 와 다르다`);
    }
    await ctx.emit({
      type: 'fold',
      payload: {
        points,
        kinds: moves.map((mv) => mv.kind),
        rows: foldRows(a, b, moves, data.marks),
        kept,
        deleted,
        inserted,
      },
    });
    return rctx.sleep(data.stepMs);
  };

  while (!ctx.cancelled) {
    if (!(await playRound(edits, length))) return;
    // 손잡이를 기다린다
    for (;;) {
      if (ctx.cancelled) return;
      const input = await rctx.waitForInput();
      if (ctx.cancelled) return;
      const payload = input.payload;
      const value: unknown =
        typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).value : undefined;
      if (input.type === 'edits' && inLadder(data.editLadder, value)) {
        edits = value;
        break;
      }
      if (input.type === 'length' && inLadder(data.lengthLadder, value)) {
        length = value;
        break;
      }
    }
  }
}
