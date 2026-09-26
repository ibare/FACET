/**
 * ancestor-as-referee — 두 쪽만 견주면 서지 않던 "누가 고쳤나" 가 조상이 들어오며 자리마다 선다.
 *
 * 셈:
 *   1. ours → theirs 를 걷는 diff 로 견준다. 남김 사이에 낀 덩이가 "다른 자리" 다.
 *   2. base → ours, base → theirs 를 각각 걷는 diff 로 견주어 diff3 덩이를 나눈다.
 *      바뀐 덩이는 다른 자리와 차례대로 하나씩 맞아야 한다 (맞지 않으면 던진다).
 *   3. 덩이마다 theirs == base 이면 ours 가, ours == base 이면 theirs 가 고쳤다.
 *      그 밖의 판정(같게 고침 · 충돌)은 이 조각이 말하지 않는다 — 던진다.
 *
 * 이벤트 (전부 silent 아님):
 *   compare   { spots: number }                       두 쪽만 견준 다른 자리의 수
 *   ancestor  {}                                      조상(base) 이 들어온다
 *   verdict   { spot: number; changer: 'ours' | 'theirs'; edit: 'change' | 'delete' | 'insert' }
 *             자리 하나의 판정. spot 은 0 기반 자리 번호
 *
 * 걸음 0 은 initial() 이 initialData 에서 세운다 (두 쪽의 줄).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Side = 'ours' | 'theirs';
export type Edit = 'change' | 'delete' | 'insert';

export type AncestorAsRefereeFacetData = {
  type: 'ancestor-as-referee';
  stepMs: number;
  base: string[];
  ours: string[];
  theirs: string[];
};

type Op = { kind: 'keep'; a: number; b: number } | { kind: 'del'; a: number } | { kind: 'ins'; b: number };

/** 앞에서부터 걷는 diff. 같으면 남김, 아니면 L[i+1][j] >= L[i][j+1] 이면 지움 먼저, 아니면 넣음. */
export function walkDiff(a: readonly string[], b: readonly string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const L: number[][] = [];
  for (let i = 0; i <= n; i++) L.push(new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ kind: 'keep', a: i, b: j });
      i += 1;
      j += 1;
    } else if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) {
      ops.push({ kind: 'del', a: i });
      i += 1;
    } else {
      ops.push({ kind: 'ins', b: j });
      j += 1;
    }
  }
  const keeps = ops.filter((o) => o.kind === 'keep').length;
  if (keeps !== L[0][0]) throw new Error(`walkDiff: 남김 ${keeps} 이 최장 공통 부분 수열 ${L[0][0]} 과 다르다`);
  return ops;
}

type Range = { s: number; e: number };
type Chunk = { kind: 'stable' | 'ours' | 'theirs' | 'same' | 'conflict'; base: Range; ours: Range; theirs: Range };

function keepMap(ops: Op[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const o of ops) if (o.kind === 'keep') m.set(o.a, o.b);
  return m;
}

function sameLines(x: readonly string[], y: readonly string[]): boolean {
  return x.length === y.length && x.every((v, k) => v === y[k]);
}

/** 덩이 나누기(diff3). 안정 줄 = 두 견줌 모두에서 남김으로 짝 지어진 base 의 줄. */
export function diff3Chunks(base: readonly string[], ours: readonly string[], theirs: readonly string[]): Chunk[] {
  const ma = keepMap(walkDiff(base, ours));
  const mb = keepMap(walkDiff(base, theirs));
  const chunks: Chunk[] = [];
  let po = 0;
  let pa = 0;
  let pb = 0;
  const pushChunk = (eo: number, ea: number, eb: number): void => {
    if (po === eo && pa === ea && pb === eb) return;
    const B = base.slice(po, eo);
    const A = ours.slice(pa, ea);
    const T = theirs.slice(pb, eb);
    let kind: Chunk['kind'];
    if (sameLines(A, B) && sameLines(T, B)) kind = 'stable';
    else if (sameLines(T, B)) kind = 'ours';
    else if (sameLines(A, B)) kind = 'theirs';
    else if (sameLines(A, T)) kind = 'same';
    else kind = 'conflict';
    chunks.push({ kind, base: { s: po, e: eo }, ours: { s: pa, e: ea }, theirs: { s: pb, e: eb } });
  };
  for (let o = 0; o < base.length; o++) {
    const a = ma.get(o);
    const b = mb.get(o);
    if (a === undefined || b === undefined) continue; // 안정 줄이 아니다 — 덩이 안에 든다
    pushChunk(o, a, b);
    chunks.push({ kind: 'stable', base: { s: o, e: o + 1 }, ours: { s: a, e: a + 1 }, theirs: { s: b, e: b + 1 } });
    po = o + 1;
    pa = a + 1;
    pb = b + 1;
  }
  pushChunk(base.length, ours.length, theirs.length);
  const merged: Chunk[] = [];
  for (const c of chunks) {
    const last = merged[merged.length - 1];
    if (last && last.kind === 'stable' && c.kind === 'stable') {
      merged[merged.length - 1] = {
        kind: 'stable',
        base: { s: last.base.s, e: c.base.e },
        ours: { s: last.ours.s, e: c.ours.e },
        theirs: { s: last.theirs.s, e: c.theirs.e },
      };
    } else {
      merged.push(c);
    }
  }
  return merged;
}

/** 화면의 한 줄. 세 쪽의 줄 번호(0 기반) 또는 null(그 줄에 없음), 그리고 속한 자리 번호. */
export type RefereeRow = { ours: number | null; base: number | null; theirs: number | null; spot: number | null };
export type RefereeSpot = { rows: number[]; changer: Side; edit: Edit };
export type RefereeLayout = { rows: RefereeRow[]; spots: RefereeSpot[] };

/**
 * 두 쪽만 견준 다른 자리와 diff3 판정을 한 줄 배치로 셈한다. 알고리즘과 stage 가 함께 부른다.
 * 행은 ours → theirs 걷는 diff 의 차례를 따른다 — 남김은 한 행, 다른 자리는 세 쪽 가운데 가장 긴 만큼의 행.
 */
export function refereeLayout(
  base: readonly string[],
  ours: readonly string[],
  theirs: readonly string[],
): RefereeLayout {
  type Seg = { kind: 'keep'; a: number; b: number } | { kind: 'spot'; ours: number[]; theirs: number[] };
  const segs: Seg[] = [];
  for (const op of walkDiff(ours, theirs)) {
    if (op.kind === 'keep') {
      segs.push({ kind: 'keep', a: op.a, b: op.b });
      continue;
    }
    let last = segs[segs.length - 1];
    if (!last || last.kind !== 'spot') {
      last = { kind: 'spot', ours: [], theirs: [] };
      segs.push(last);
    }
    if (op.kind === 'del') last.ours.push(op.a);
    else last.theirs.push(op.b);
  }

  const changed = diff3Chunks(base, ours, theirs).filter((c) => c.kind !== 'stable');
  const spotSegs = segs.filter((s): s is Extract<Seg, { kind: 'spot' }> => s.kind === 'spot');
  if (changed.length !== spotSegs.length) {
    throw new Error(`refereeLayout: 두 쪽만 견준 자리 ${spotSegs.length} 과 diff3 의 바뀐 덩이 ${changed.length} 이 맞지 않는다`);
  }

  // 안정 줄: ours 줄 번호 → base 줄 번호
  const stableByOurs = new Map<number, number>();
  for (const c of diff3Chunks(base, ours, theirs)) {
    if (c.kind !== 'stable') continue;
    for (let k = 0; k < c.base.e - c.base.s; k++) stableByOurs.set(c.ours.s + k, c.base.s + k);
  }

  const rows: RefereeRow[] = [];
  const spots: RefereeSpot[] = [];
  let spotIdx = 0;
  for (const seg of segs) {
    if (seg.kind === 'keep') {
      rows.push({ ours: seg.a, base: stableByOurs.get(seg.a) ?? null, theirs: seg.b, spot: null });
      continue;
    }
    const c = changed[spotIdx];
    const cOurs = range(c.ours);
    const cTheirs = range(c.theirs);
    if (!sameLines(cOurs.map(String), seg.ours.map(String)) || !sameLines(cTheirs.map(String), seg.theirs.map(String))) {
      throw new Error(`refereeLayout: 자리 ${spotIdx + 1} 의 줄이 diff3 덩이 ${spotIdx + 1} 과 다르다`);
    }
    let changer: Side;
    let changedLines: number;
    if (c.kind === 'ours') {
      changer = 'ours';
      changedLines = c.ours.e - c.ours.s;
    } else if (c.kind === 'theirs') {
      changer = 'theirs';
      changedLines = c.theirs.e - c.theirs.s;
    } else {
      throw new Error(`refereeLayout: 자리 ${spotIdx + 1} 의 판정 '${c.kind}' 은 이 조각이 말하지 않는다 — 두 쪽 모두 조상과 다르다`);
    }
    const baseLines = c.base.e - c.base.s;
    let edit: Edit;
    if (baseLines > 0 && changedLines > 0) edit = 'change';
    else if (changedLines === 0 && baseLines > 0) edit = 'delete';
    else if (baseLines === 0 && changedLines > 0) edit = 'insert';
    else throw new Error(`refereeLayout: 자리 ${spotIdx + 1} 에 조상도 고친 쪽도 줄이 없다`);

    const cBase = range(c.base);
    const height = Math.max(cOurs.length, cTheirs.length, cBase.length);
    const spotRows: number[] = [];
    for (let k = 0; k < height; k++) {
      spotRows.push(rows.length);
      rows.push({
        ours: k < cOurs.length ? cOurs[k] : null,
        base: k < cBase.length ? cBase[k] : null,
        theirs: k < cTheirs.length ? cTheirs[k] : null,
        spot: spotIdx,
      });
    }
    spots.push({ rows: spotRows, changer, edit });
    spotIdx += 1;
  }
  const placed = rows.filter((r) => r.base !== null).length;
  if (placed !== base.length) throw new Error(`refereeLayout: 조상 ${base.length} 줄 가운데 ${placed} 줄만 자리를 얻었다`);
  return { rows, spots };
}

function range(r: Range): number[] {
  const out: number[] = [];
  for (let k = r.s; k < r.e; k++) out.push(k);
  return out;
}

function readLinesAt(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  if (!Array.isArray(v)) throw new Error(`ancestorAsReferee: data.${key} 가 배열이 아니다`);
  return v.map((line, k) => {
    if (typeof line !== 'string') throw new Error(`ancestorAsReferee: data.${key}[${k}] 가 문자열이 아니다`);
    return line;
  });
}

/** 알고리즘이 받는 자료를 좁힌다. 모르는 모양은 필드 경로를 담아 던진다. */
export function readFacetData(raw: unknown): AncestorAsRefereeFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('ancestorAsReferee: data 가 객체가 아니다');
  const data = raw as Record<string, unknown>;
  if (data.type !== 'ancestor-as-referee') throw new Error(`ancestorAsReferee: data.type 이 'ancestor-as-referee' 가 아니다`);
  const stepMs = data.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 0) {
    throw new Error('ancestorAsReferee: data.stepMs 가 0 이상의 수가 아니다');
  }
  return {
    type: 'ancestor-as-referee',
    stepMs,
    base: readLinesAt(data, 'base'),
    ours: readLinesAt(data, 'ours'),
    theirs: readLinesAt(data, 'theirs'),
  };
}

export async function ancestorAsReferee(context: FacetContext<AncestorAsRefereeFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<AncestorAsRefereeFacetData>;
  const { base, ours, theirs, stepMs } = readFacetData(ctx.data);
  const layout = refereeLayout(base, ours, theirs);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 두 쪽의 줄이 이미 읽을 거리다 — 첫 발신 앞에 틈을 둔다
  if (!(await pause())) return;
  await ctx.emit({ type: 'compare', payload: { spots: layout.spots.length } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'ancestor', payload: {} });

  for (let spot = 0; spot < layout.spots.length; spot++) {
    if (!(await pause())) return;
    const s = layout.spots[spot];
    await ctx.emit({ type: 'verdict', payload: { spot, changer: s.changer, edit: s.edit } });
  }
}
