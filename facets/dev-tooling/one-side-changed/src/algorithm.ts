/**
 * one-side-changed — 3-way 병합에서 덩이 하나씩 결과로 옮겨 담는다.
 *
 * 조상(base) 과 두 쪽(ours · theirs) 을 각각 걷는 diff 로 견주고(diff3 덩이 나누기),
 * 덩이마다 판정대로 한 쪽의 줄을 결과로 옮긴다 — 아무도 안 고친 덩이는 조상의 줄,
 * 한쪽만 고친 덩이는 고친 쪽의 줄.
 *
 * 이 조각은 판정 stable · ours · theirs 만 말한다. same(같게 고침) · conflict(충돌),
 * 조상 줄이 없는 덩이(순수 넣음), 옮길 줄이 없는 덩이(한쪽의 지움)는 말하지 않으므로 던진다 (C6).
 *
 * 이벤트
 * - `take` (silent 아님) — 덩이 하나가 결과로 옮겨 간다
 *     payload: {
 *       kind: 'stable' | 'ours' | 'theirs',   // 덩이 판정 (옮길 쪽: stable → base)
 *       base: [from, to],                      // 0 기반, 끝 제외
 *       ours: [from, to],
 *       theirs: [from, to],
 *       index: number,                         // 0 기반 덩이 차례
 *       total: number,                         // 덩이 수
 *     }
 *
 * 걸음 0 은 장면의 `initial()` 이 세 파일과 빈 결과로 채운다 — 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Side = 'base' | 'ours' | 'theirs';
export type ChunkKind = 'stable' | 'ours' | 'theirs' | 'same' | 'conflict';
export type Range = readonly [number, number];

export interface Chunk {
  kind: ChunkKind;
  base: Range;
  ours: Range;
  theirs: Range;
}

export interface OneSideChangedFacetData {
  type: 'one-side-changed';
  stepMs: number;
  base: string[];
  ours: string[];
  theirs: string[];
}

/** L[i][j] = a[i:] 와 b[j:] 의 최장 공통 부분 수열 길이. 줄 비교는 글자 그대로. */
export function lcsSuffix(a: readonly string[], b: readonly string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const L: number[][] = [];
  for (let i = 0; i <= n; i += 1) L.push(new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = L[i]!;
    const below = L[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? below[j + 1]! + 1 : Math.max(below[j]!, row[j + 1]!);
    }
  }
  return L;
}

/** 걷는 diff 의 남김 짝 — base 줄 번호 → 다른 쪽 줄 번호 (0 기반). 동률이면 지움이 먼저. */
export function keepPairs(a: readonly string[], b: readonly string[]): Map<number, number> {
  const L = lcsSuffix(a, b);
  const pairs = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      pairs.set(i, j);
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && L[i + 1]![j]! >= L[i]![j + 1]!)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  const top = L[0]![0]!;
  if (pairs.size !== top) {
    throw new Error(`one-side-changed: 남김 ${pairs.size} 이 최장 공통 부분 수열 ${top} 과 다르다`);
  }
  return pairs;
}

function sameLines(x: readonly string[], y: readonly string[]): boolean {
  return x.length === y.length && x.every((line, k) => line === y[k]);
}

function judge(b: readonly string[], o: readonly string[], t: readonly string[]): ChunkKind {
  if (sameLines(o, b) && sameLines(t, b)) return 'stable';
  if (sameLines(t, b)) return 'ours';
  if (sameLines(o, b)) return 'theirs';
  if (sameLines(o, t)) return 'same';
  return 'conflict';
}

/** diff3 덩이 나누기. 안정 줄 = 두 견줌 모두에서 남김으로 짝 지어진 base 줄. 이어진 stable 은 한 덩이. */
export function diff3Chunks(
  base: readonly string[],
  ours: readonly string[],
  theirs: readonly string[],
): Chunk[] {
  const ma = keepPairs(base, ours);
  const mb = keepPairs(base, theirs);
  const raw: Chunk[] = [];
  let po = 0;
  let pa = 0;
  let pb = 0;
  const pushGap = (eo: number, ea: number, eb: number): void => {
    if (po === eo && pa === ea && pb === eb) return;
    raw.push({
      kind: judge(base.slice(po, eo), ours.slice(pa, ea), theirs.slice(pb, eb)),
      base: [po, eo],
      ours: [pa, ea],
      theirs: [pb, eb],
    });
  };
  for (let o = 0; o < base.length; o += 1) {
    const a = ma.get(o);
    const b = mb.get(o);
    if (a === undefined || b === undefined) continue; // 안정 줄이 아니다 — 덩이 안에 든다
    pushGap(o, a, b);
    raw.push({ kind: 'stable', base: [o, o + 1], ours: [a, a + 1], theirs: [b, b + 1] });
    po = o + 1;
    pa = a + 1;
    pb = b + 1;
  }
  pushGap(base.length, ours.length, theirs.length);

  const merged: Chunk[] = [];
  for (const c of raw) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.kind === 'stable' && c.kind === 'stable') {
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

/** 판정에서 옮길 쪽. 이 조각이 말하지 않는 판정은 던진다. */
export function takenSide(kind: ChunkKind): Side {
  if (kind === 'stable') return 'base';
  if (kind === 'ours') return 'ours';
  if (kind === 'theirs') return 'theirs';
  throw new Error(`one-side-changed: 이 조각이 말하지 않는 덩이 판정 '${kind}'`);
}

function lineList(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`one-side-changed: ${path} 은 비지 않은 줄 목록이어야 한다`);
  }
  return value.map((line, k) => {
    if (typeof line !== 'string') throw new Error(`one-side-changed: ${path}[${k}] 가 글자가 아니다`);
    return line;
  });
}

/** initialData 좁히개 — 모르는 모양은 필드 경로를 담아 던진다. */
export function readFacetData(raw: unknown): OneSideChangedFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('one-side-changed: initialData 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'one-side-changed') throw new Error(`one-side-changed: initialData.type '${String(r.type)}'`);
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('one-side-changed: initialData.stepMs 가 양수가 아니다');
  return {
    type: 'one-side-changed',
    stepMs: r.stepMs,
    base: lineList(r.base, 'initialData.base'),
    ours: lineList(r.ours, 'initialData.ours'),
    theirs: lineList(r.theirs, 'initialData.theirs'),
  };
}

export async function oneSideChanged(ctx: FacetContext<OneSideChangedFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<OneSideChangedFacetData>;
  const data = readFacetData(ctx.data);
  const chunks = diff3Chunks(data.base, data.ours, data.theirs);

  // 셈할 수 없는 덩이를 걸음 전에 모두 거른다
  for (const c of chunks) {
    const side = takenSide(c.kind);
    if (c.base[0] === c.base[1]) {
      throw new Error(`one-side-changed: 조상 줄이 없는 덩이 (ours ${c.ours[0] + 1}, theirs ${c.theirs[0] + 1})`);
    }
    if (c[side][0] === c[side][1]) {
      throw new Error(`one-side-changed: 옮길 줄이 없는 덩이 (base ${c.base[0] + 1})`);
    }
  }

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !rctx.cancelled;
  }

  // 걸음 0 은 세 파일이 이미 읽을 것이다 — 읽을 틈을 둔다
  if (!(await pause())) return;

  for (let index = 0; index < chunks.length; index += 1) {
    if (rctx.cancelled) return;
    const c = chunks[index]!;
    await rctx.emit({
      type: 'take',
      payload: {
        kind: c.kind,
        base: [c.base[0], c.base[1]],
        ours: [c.ours[0], c.ours[1]],
        theirs: [c.theirs[0], c.theirs[1]],
        index,
        total: chunks.length,
      },
    });
    if (!(await pause())) return;
  }
}
