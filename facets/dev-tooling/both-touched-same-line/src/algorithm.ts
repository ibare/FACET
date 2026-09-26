/**
 * both-touched-same-line — 두 쪽이 같은 줄을 서로 다르게 고치면 병합은 그 자리에서 멈춘다.
 *
 * 셈:
 *   - 걷는 diff (base → ours, base → theirs). 같은 줄이면 남김, 아니면 L[i+1][j] >= L[i][j+1] 일 때 지움 먼저.
 *   - 손댄 줄 = base 의 줄 가운데 그 견줌에서 남김으로 짝 지어지지 않은 것.
 *   - 겹침 = 두 쪽의 손댄 줄의 교집합.
 *   - 결과 = 덩이 나누기(diff3). stable · ours · conflict 만 이 조각이 말한다 — theirs · same 을 만나면 던진다.
 *
 * 이벤트 (모두 silent 아님, 차례대로 네 번):
 *   touched   payload { side: 'ours' | 'theirs'; base: number[]; own: number[] }
 *             base = 그쪽이 손댄 base 줄 (0 기반), own = 그쪽 파일에서 짝 없는 줄 (0 기반)
 *   overlap   payload { lines: number[]; versions: number }
 *             lines = 겹친 base 줄 (0 기반), versions = 겹친 덩이의 base · ours · theirs 가운데 서로 다른 것의 수
 *   merged    payload { lines: MergedLine[]; conflicts: number }
 *             MergedLine = { text: string; from: MergedFrom; row: number }
 *             from = 'base' | 'ours' | 'theirs' | 'open' | 'mid' | 'close', row = 출처 파일의 줄 (0 기반, 표식은 -1)
 *
 * ctx.metric 은 부르지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Side = 'ours' | 'theirs';
export type MergedFrom = 'base' | 'ours' | 'theirs' | 'open' | 'mid' | 'close';
export type MergedLine = { text: string; from: MergedFrom; row: number };
export type Markers = { open: string; mid: string; close: string };

export type BothTouchedSameLineFacetData = {
  type: 'both-touched-same-line';
  stepMs: number;
  base: string[];
  ours: string[];
  theirs: string[];
  markers: Markers;
};

type Op = { kind: 'keep'; a: number; b: number } | { kind: 'del'; a: number } | { kind: 'ins'; b: number };

/** L[i][j] = a[i:] 와 b[j:] 의 최장 공통 부분 수열 길이. 줄은 글자 그대로 견준다. */
function lcsSuffix(a: readonly string[], b: readonly string[]): number[][] {
  const L: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) L.push(new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
    }
  }
  return L;
}

/** 앞에서부터 걷는 diff. 동률이면 지움이 먼저. */
function walk(a: readonly string[], b: readonly string[]): Op[] {
  const L = lcsSuffix(a, b);
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: 'keep', a: i, b: j });
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && L[i + 1]![j]! >= L[i]![j + 1]!)) {
      ops.push({ kind: 'del', a: i });
      i += 1;
    } else {
      ops.push({ kind: 'ins', b: j });
      j += 1;
    }
  }
  const kept = ops.filter((o) => o.kind === 'keep').length;
  if (kept !== L[0]![0]) throw new Error(`걷는 diff 의 남김 ${kept} 이 최장 공통 부분 수열 ${L[0]![0]} 과 다르다`);
  return ops;
}

/** base 줄 → 짝 지어진 그쪽 줄. */
function matches(base: readonly string[], side: readonly string[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const op of walk(base, side)) if (op.kind === 'keep') m.set(op.a, op.b);
  return m;
}

/** 그쪽이 손댄 base 줄과 그쪽 파일에서 짝 없는 줄 (둘 다 0 기반, 오름차순). */
export function touchedLines(base: readonly string[], side: readonly string[]): { base: number[]; own: number[] } {
  const m = matches(base, side);
  const paired = new Set(m.values());
  return {
    base: base.map((_, i) => i).filter((i) => !m.has(i)),
    own: side.map((_, j) => j).filter((j) => !paired.has(j)),
  };
}

export type ChunkKind = 'stable' | 'ours' | 'conflict';
export type Chunk = {
  kind: ChunkKind;
  base: [number, number];
  ours: [number, number];
  theirs: [number, number];
};

function sameLines(x: readonly string[], y: readonly string[]): boolean {
  return x.length === y.length && x.every((v, k) => v === y[k]);
}

/** 덩이 나누기. 이 조각이 말하지 않는 판정(theirs · same)은 던진다. */
export function diff3(base: readonly string[], ours: readonly string[], theirs: readonly string[]): Chunk[] {
  const ma = matches(base, ours);
  const mb = matches(base, theirs);
  const stable = base.map((_, o) => o).filter((o) => ma.has(o) && mb.has(o));
  const chunks: Chunk[] = [];
  let po = 0;
  let pa = 0;
  let pb = 0;
  const close = (eo: number, ea: number, eb: number): void => {
    if (po === eo && pa === ea && pb === eb) return;
    const B = base.slice(po, eo);
    const A = ours.slice(pa, ea);
    const T = theirs.slice(pb, eb);
    let kind: ChunkKind;
    if (sameLines(A, B) && sameLines(T, B)) kind = 'stable';
    else if (sameLines(T, B)) kind = 'ours';
    else if (sameLines(A, B)) throw new Error(`base 줄 ${po + 1}..${eo}: theirs 만 고친 덩이는 이 조각이 말하지 않는다`);
    else if (sameLines(A, T)) throw new Error(`base 줄 ${po + 1}..${eo}: 두 쪽이 같게 고친 덩이는 이 조각이 말하지 않는다`);
    else kind = 'conflict';
    chunks.push({ kind, base: [po, eo], ours: [pa, ea], theirs: [pb, eb] });
  };
  for (const o of stable) {
    const a = ma.get(o);
    const b = mb.get(o);
    if (a === undefined || b === undefined) throw new Error(`안정 줄 ${o + 1} 의 짝이 없다`);
    close(o, a, b);
    chunks.push({ kind: 'stable', base: [o, o + 1], ours: [a, a + 1], theirs: [b, b + 1] });
    po = o + 1;
    pa = a + 1;
    pb = b + 1;
  }
  close(base.length, ours.length, theirs.length);
  const merged: Chunk[] = [];
  for (const c of chunks) {
    const last = merged[merged.length - 1];
    if (last && last.kind === 'stable' && c.kind === 'stable') {
      merged[merged.length - 1] = {
        kind: 'stable',
        base: [last.base[0], c.base[1]],
        ours: [last.ours[0], c.ours[1]],
        theirs: [last.theirs[0], c.theirs[1]],
      };
    } else {
      merged.push(c);
    }
  }
  return merged;
}

/** 덩이에서 결과 파일을 세운다. conflict 는 git 의 기본 merge 꼴(표식 셋)로 들어간다. */
export function mergeLines(data: BothTouchedSameLineFacetData, chunks: readonly Chunk[]): MergedLine[] {
  const out: MergedLine[] = [];
  const take = (from: 'base' | 'ours' | 'theirs', lines: readonly string[], [s, e]: [number, number]): void => {
    for (let r = s; r < e; r += 1) {
      const text = lines[r];
      if (text === undefined) throw new Error(`${from} 의 줄 ${r + 1} 이 없다`);
      out.push({ text, from, row: r });
    }
  };
  for (const c of chunks) {
    if (c.kind === 'stable') take('base', data.base, c.base);
    else if (c.kind === 'ours') take('ours', data.ours, c.ours);
    else {
      out.push({ text: data.markers.open, from: 'open', row: -1 });
      take('ours', data.ours, c.ours);
      out.push({ text: data.markers.mid, from: 'mid', row: -1 });
      take('theirs', data.theirs, c.theirs);
      out.push({ text: data.markers.close, from: 'close', row: -1 });
    }
  }
  return out;
}

function lineList(v: unknown, path: string): string[] {
  if (!Array.isArray(v) || v.length === 0 || !v.every((x): x is string => typeof x === 'string')) {
    throw new Error(`${path} 는 비지 않은 글자 배열이어야 한다`);
  }
  return v;
}

/** initialData 의 모양을 좁힌다. 모르는 모양은 필드 경로를 담아 던진다. */
function checkData(raw: unknown): BothTouchedSameLineFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('initialData 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'both-touched-same-line') throw new Error(`initialData.type 을 모른다: ${String(d.type)}`);
  const stepMs = d.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error(`initialData.stepMs 는 양수여야 한다: ${String(stepMs)}`);
  }
  const mk = d.markers;
  if (typeof mk !== 'object' || mk === null) throw new Error('initialData.markers 가 객체가 아니다');
  const m = mk as Record<string, unknown>;
  const open = m.open;
  const mid = m.mid;
  const close = m.close;
  if (typeof open !== 'string' || open === '') throw new Error('initialData.markers.open 이 없다');
  if (typeof mid !== 'string' || mid === '') throw new Error('initialData.markers.mid 가 없다');
  if (typeof close !== 'string' || close === '') throw new Error('initialData.markers.close 가 없다');
  return {
    type: 'both-touched-same-line',
    stepMs,
    base: lineList(d.base, 'initialData.base'),
    ours: lineList(d.ours, 'initialData.ours'),
    theirs: lineList(d.theirs, 'initialData.theirs'),
    markers: { open, mid, close },
  };
}

export async function bothTouchedSameLine(
  context: FacetContext<BothTouchedSameLineFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<BothTouchedSameLineFacetData>;
  const data = checkData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const o = touchedLines(data.base, data.ours);
  const th = touchedLines(data.base, data.theirs);
  const theirsSet = new Set(th.base);
  const overlap = o.base.filter((i) => theirsSet.has(i));
  const chunks = diff3(data.base, data.ours, data.theirs);
  const conflictChunks = chunks.filter((c) => c.kind === 'conflict');
  if (overlap.length === 0 || conflictChunks.length === 0) {
    throw new Error(`겹친 줄 ${overlap.length} · 충돌 덩이 ${conflictChunks.length} — 이 조각은 겹침에서 멈추는 병합을 말한다`);
  }
  for (const line of overlap) {
    if (!conflictChunks.some((c) => c.base[0] <= line && line < c.base[1])) {
      throw new Error(`겹친 base 줄 ${line + 1} 이 충돌 덩이 안에 없다`);
    }
  }
  const first = conflictChunks[0]!;
  const versions = new Set([
    data.base.slice(...first.base).join('\n'),
    data.ours.slice(...first.ours).join('\n'),
    data.theirs.slice(...first.theirs).join('\n'),
  ]).size;
  const lines = mergeLines(data, chunks);

  // 걸음 0 은 세 파일이 이미 읽을 것이다 — 첫 발신 앞에 읽을 틈을 둔다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'touched', payload: { side: 'ours', base: o.base, own: o.own } });
  if (!(await pause())) return;
  await ctx.emit({ type: 'touched', payload: { side: 'theirs', base: th.base, own: th.own } });
  if (!(await pause())) return;
  await ctx.emit({ type: 'overlap', payload: { lines: overlap, versions } });
  if (!(await pause())) return;
  await ctx.emit({ type: 'merged', payload: { lines, conflicts: conflictChunks.length } });
}
