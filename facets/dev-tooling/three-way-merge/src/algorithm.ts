/**
 * three-way-merge — 조상 · 우리 쪽 · 그쪽 세 파일을 diff3 로 합친다.
 *
 * 손잡이 둘: `ours` (우리 쪽이 한 일 — 0 한 줄 고침 · 1 덩이 옮김) × `theirs` (그쪽이 고친 base 줄 t = 1..6).
 * 한 판을 끝까지 재생한 뒤 `waitForInput` 으로 다음 값을 받아 다시 재생한다.
 *
 * 모형 (공통 안내문의 규약 그대로):
 * - 줄 비교는 글자 그대로 (앞 빈칸도 글자). 바꿈은 없다 — 달라진 줄은 지움 1 + 넣음 1.
 * - 걷는 diff: `L[i][j]` = a 의 i 번째 줄부터와 b 의 j 번째 줄부터의 LCS 길이. 자리 (i, j) 에서
 *   ① 같으면 남김 ② `L[i+1][j] >= L[i][j+1]` 이면 지움 (동률이면 지움 먼저) ③ 아니면 넣음.
 * - 안정 줄 = 두 걷는 diff (base → ours, base → theirs) 모두에서 남김인 base 줄.
 *   안정 줄 사이 (와 앞 · 뒤) 의 세 쪽 조각이 한 덩이. 판정 — 두 쪽 다 base 와 같음 stable · theirs 만 같음 ours ·
 *   ours 만 같음 theirs · 두 쪽이 서로 같음 same · 그 밖 conflict. 이어진 stable 덩이는 하나로 붙인다.
 * - 결과: stable · ours · same 은 ours 조각, theirs 는 theirs 조각, conflict 는 표식 셋 사이에 두 쪽.
 * - 동률 (② 의 `L[i+1][j] == L[i][j+1]`) 이 실제로 걸리는 자리: 바꾼 줄마다 한 번 — 한 줄 고침의 base → ours 에서
 *   (4, 4), 그쪽 파일의 base → theirs 에서 (t, t). 지움이 넣음보다 먼저 오지만 짝 배열은 어느 쪽이든 같다.
 *   덩이 옮김의 base → ours 에는 동률이 없다 — 제자리 세 줄을 남기면 LCS 4, 옮긴 두 줄을 남기면 3 이라
 *   옮긴 두 줄이 지움 · 넣음으로 떨어진다.
 *
 * 이벤트 (모두 silent 아님, phase 만 silent):
 * - `round`    { act: number, t: number, base: string[], ours: string[], theirs: string[], theirsEdited: number,
 *                move: { first: number, last: number, below: number } | null }
 *                걸음 0. 세 파일을 세우고 결과는 자리만 남긴다. theirsEdited 는 0 기반 base 자리.
 *                move 는 덩이 옮김 칸에서 사람이 한 옮김 (1 기반 base 줄).
 * - `touched`  { oursTouched: number[], theirsTouched: number[], oursAdded: number[], theirsAdded: number[],
 *                stable: number[] }
 *                걸음 1. 걷는 diff 에서 남김이 아닌 base 줄 (0 기반) · 남김이 아닌 ours / theirs 줄 · 안정 줄.
 * - `chunks`   { chunks: { verdict: 'stable'|'ours'|'theirs'|'same'|'conflict',
 *                          baseStart, baseEnd, oursStart, oursEnd, theirsStart, theirsEnd: number }[] }
 *                걸음 2. 0 기반 반열린 구간 [start, end).
 * - `conflict` { blocks: { chunk: number, resultStart: number, lines: ResultLine[] }[] }
 *                걸음 3 (충돌이 있을 때만). 결과 파일 안의 충돌 덩이 자리와 그 줄 (표식 포함).
 * - `result`   { lines: ResultLine[], conflicts: number }
 *                마지막 걸음. ResultLine = { text, key, role: 'line'|'marker'|'ours'|'theirs', from: 'base'|'ours'|'theirs'|null,
 *                row: number (from 의 0 기반 줄, 표식이면 -1) }. key 는 글자 + '#' + 그 글자가 앞서 나온 횟수 —
 *                판이 바뀌어도 같은 줄은 같은 key 라 새 자리로 미끄러진다.
 * - `phase`    { phase } silent
 *
 * phase 어휘: `stable` · `classify` · `conflict` · `result` (irs.ts 와 같다)
 *
 * 계기: `stable-lines` (걸음 1) · `conflicts` (충돌 걸음) · `result-lines` (결과 걸음). 걸음 0 에 셋 다 0 으로.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ThreeWayMergeData = {
  type: 'three-way-merge';
  stepMs: number;
  motionMs: number;
  base: string[];
  oursFiles: string[][];
  oursMove: { first: number; last: number; below: number };
  theirsLines: string[];
  markers: { ours: string; mid: string; theirs: string };
  oursActions: string[];
  theirsLadder: number[];
  defaultAct: number;
  defaultT: number;
};

export type Verdict = 'stable' | 'ours' | 'theirs' | 'same' | 'conflict';

export type Chunk = {
  verdict: Verdict;
  baseStart: number;
  baseEnd: number;
  oursStart: number;
  oursEnd: number;
  theirsStart: number;
  theirsEnd: number;
};

export type ResultLine = {
  text: string;
  key: string;
  role: 'line' | 'marker' | 'ours' | 'theirs';
  from: 'base' | 'ours' | 'theirs' | null;
  row: number;
};

export type MergeOutcome = {
  keepOurs: number[];
  keepTheirs: number[];
  oursTouched: number[];
  theirsTouched: number[];
  oursAdded: number[];
  theirsAdded: number[];
  stable: number[];
  chunks: Chunk[];
  lines: ResultLine[];
  conflicts: number;
};

/** 걷는 diff 의 짝 배열 — base 줄 i 가 남김으로 짝 지어진 other 줄 (0 기반), 없으면 -1. */
export function keepArray<T extends string | number>(a: readonly T[], b: readonly T[]): number[] {
  const n = a.length;
  const m = b.length;
  const L: number[][] = [];
  for (let i = 0; i <= n; i += 1) L.push(new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const down = L[i + 1]![j]!;
      const right = L[i]![j + 1]!;
      L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(down, right);
    }
  }
  const keep = new Array<number>(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      keep[i] = j;
      i += 1;
      j += 1;
    } else if (j >= m || (i < n && L[i + 1]![j]! >= L[i]![j + 1]!)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return keep;
}

function sameLines(x: readonly string[], y: readonly string[]): boolean {
  if (x.length !== y.length) return false;
  for (let k = 0; k < x.length; k += 1) if (x[k] !== y[k]) return false;
  return true;
}

/** diff3 — 덩이 나누기 · 판정 · 결과 줄. 세 파일의 글자만 받는다. */
export function mergeThree(
  base: readonly string[],
  ours: readonly string[],
  theirs: readonly string[],
  markers: ThreeWayMergeData['markers'],
): MergeOutcome {
  const keepOurs = keepArray(base, ours);
  const keepTheirs = keepArray(base, theirs);
  const stable: number[] = [];
  for (let o = 0; o < base.length; o += 1) if (keepOurs[o]! >= 0 && keepTheirs[o]! >= 0) stable.push(o);

  const raw: Chunk[] = [];
  let po = 0;
  let pa = 0;
  let pb = 0;
  for (let s = 0; s <= stable.length; s += 1) {
    const atEnd = s === stable.length;
    const o = atEnd ? base.length : stable[s]!;
    const eo = o;
    const ea = atEnd ? ours.length : keepOurs[o]!;
    const eb = atEnd ? theirs.length : keepTheirs[o]!;
    if (eo > po || ea > pa || eb > pb) {
      const B = base.slice(po, eo);
      const A = ours.slice(pa, ea);
      const T = theirs.slice(pb, eb);
      const sameA = sameLines(A, B);
      const sameT = sameLines(T, B);
      let verdict: Verdict;
      if (sameA && sameT) verdict = 'stable';
      else if (sameT) verdict = 'ours';
      else if (sameA) verdict = 'theirs';
      else if (sameLines(A, T)) verdict = 'same';
      else verdict = 'conflict';
      raw.push({ verdict, baseStart: po, baseEnd: eo, oursStart: pa, oursEnd: ea, theirsStart: pb, theirsEnd: eb });
    }
    if (!atEnd) {
      raw.push({
        verdict: 'stable',
        baseStart: o,
        baseEnd: o + 1,
        oursStart: ea,
        oursEnd: ea + 1,
        theirsStart: eb,
        theirsEnd: eb + 1,
      });
      po = o + 1;
      pa = ea + 1;
      pb = eb + 1;
    }
  }
  // 이어진 stable 덩이를 하나로
  const chunks: Chunk[] = [];
  for (const c of raw) {
    const prev = chunks[chunks.length - 1];
    if (prev && prev.verdict === 'stable' && c.verdict === 'stable') {
      prev.baseEnd = c.baseEnd;
      prev.oursEnd = c.oursEnd;
      prev.theirsEnd = c.theirsEnd;
    } else chunks.push({ ...c });
  }

  const seen = new Map<string, number>();
  const lines: ResultLine[] = [];
  const push = (text: string, role: ResultLine['role'], from: ResultLine['from'], row: number): void => {
    const n = seen.get(text) ?? 0;
    seen.set(text, n + 1);
    lines.push({ text, key: `${text}#${n}`, role, from, row });
  };
  let conflicts = 0;
  for (const c of chunks) {
    if (c.verdict === 'conflict') {
      conflicts += 1;
      push(markers.ours, 'marker', null, -1);
      for (let j = c.oursStart; j < c.oursEnd; j += 1) push(ours[j]!, 'ours', 'ours', j);
      push(markers.mid, 'marker', null, -1);
      for (let j = c.theirsStart; j < c.theirsEnd; j += 1) push(theirs[j]!, 'theirs', 'theirs', j);
      push(markers.theirs, 'marker', null, -1);
    } else if (c.verdict === 'theirs') {
      for (let j = c.theirsStart; j < c.theirsEnd; j += 1) push(theirs[j]!, 'line', 'theirs', j);
    } else if (c.verdict === 'stable') {
      for (let j = c.baseStart; j < c.baseEnd; j += 1) push(base[j]!, 'line', 'base', j);
    } else {
      for (let j = c.oursStart; j < c.oursEnd; j += 1) push(ours[j]!, 'line', 'ours', j);
    }
  }

  const notKept = (keep: number[]): number[] => keep.flatMap((v, i) => (v < 0 ? [i] : []));
  const added = (keep: number[], len: number): number[] => {
    const used = new Set(keep.filter((v) => v >= 0));
    const out: number[] = [];
    for (let j = 0; j < len; j += 1) if (!used.has(j)) out.push(j);
    return out;
  };
  return {
    keepOurs,
    keepTheirs,
    oursTouched: notKept(keepOurs),
    theirsTouched: notKept(keepTheirs),
    oursAdded: added(keepOurs, ours.length),
    theirsAdded: added(keepTheirs, theirs.length),
    stable,
    chunks,
    lines,
    conflicts,
  };
}

export type ConflictBlock = { chunk: number; resultStart: number; lines: ResultLine[] };

/** 결과 파일 안의 충돌 덩이 자리 — 덩이 차례대로 결과 줄을 세어 간다. */
export function conflictBlocks(m: MergeOutcome): ConflictBlock[] {
  const blocks: ConflictBlock[] = [];
  let at = 0;
  m.chunks.forEach((c, ci) => {
    if (c.verdict === 'conflict') {
      const size = c.oursEnd - c.oursStart + (c.theirsEnd - c.theirsStart) + 3;
      blocks.push({ chunk: ci, resultStart: at, lines: m.lines.slice(at, at + size) });
      at += size;
    } else if (c.verdict === 'theirs') at += c.theirsEnd - c.theirsStart;
    else if (c.verdict === 'stable') at += c.baseEnd - c.baseStart;
    else at += c.oursEnd - c.oursStart;
  });
  if (at !== m.lines.length) throw new Error(`three-way-merge: 덩이로 센 결과 줄 ${at} 이 결과 ${m.lines.length} 줄과 다르다`);
  return blocks;
}

/** 그쪽 파일 — base 에서 줄 t (1 기반) 하나만 theirsLines[t-1] 로. */
export function theirsFile(d: ThreeWayMergeData, t: number): string[] {
  const line = d.theirsLines[t - 1];
  if (line === undefined || t > d.base.length) throw new Error(`three-way-merge: theirsLines 에 줄 ${t} 이 없다`);
  const out = [...d.base];
  out[t - 1] = line;
  return out;
}

/** 우리 쪽 파일 — oursFiles[act]. 덩이 옮김이면 oursMove 를 base 에 댄 것과 같은지 확인한다. */
export function oursFile(d: ThreeWayMergeData, act: number): string[] {
  const file = d.oursFiles[act];
  if (!file) throw new Error(`three-way-merge: oursFiles[${act}] 이 없다`);
  if (d.oursActions[act] === 'move') {
    const { first, last, below } = d.oursMove;
    const block = d.base.slice(first - 1, last);
    const rest = [...d.base.slice(0, first - 1), ...d.base.slice(last)];
    const at = rest.indexOf(d.base[below - 1]!);
    if (at < 0) throw new Error('three-way-merge: oursMove 의 below 줄을 찾지 못했다');
    const moved = [...rest.slice(0, at + 1), ...block, ...rest.slice(at + 1)];
    if (!sameLines(moved, file)) throw new Error('three-way-merge: oursMove 를 base 에 댄 것이 oursFiles 와 다르다');
  }
  return [...file];
}

export async function threeWayMergeAlgorithm(ctx: FacetContext<ThreeWayMergeData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ThreeWayMergeData>;
  const d = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const shown = new Map<string, number>();
  const show = (name: string, value: number): void => {
    const delta = value - (shown.get(name) ?? 0);
    shown.set(name, value);
    ctx.metric(name, delta);
  };
  const step = d.stepMs + d.motionMs;

  let act = d.defaultAct;
  let t = d.defaultT;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const ours = oursFile(d, act);
      const theirs = theirsFile(d, t);
      const m = mergeThree(d.base, ours, theirs, d.markers);

      // 걸음 0 — 처음
      await ctx.emit({
        type: 'round',
        payload: {
          act,
          t,
          base: [...d.base],
          ours,
          theirs,
          theirsEdited: t - 1,
          move: d.oursActions[act] === 'move' ? { ...d.oursMove } : null,
        },
      });
      show('stable-lines', 0);
      show('conflicts', 0);
      show('result-lines', 0);
      if (!(await rctx.sleep(step))) return;

      // 걸음 1 — 손댄 줄
      await ctx.emit({
        type: 'touched',
        payload: {
          oursTouched: m.oursTouched,
          theirsTouched: m.theirsTouched,
          oursAdded: m.oursAdded,
          theirsAdded: m.theirsAdded,
          stable: m.stable,
        },
      });
      show('stable-lines', m.stable.length);
      await phase('stable');
      if (!(await rctx.sleep(step))) return;

      // 걸음 2 — 덩이 판정
      await ctx.emit({ type: 'chunks', payload: { chunks: m.chunks } });
      await phase('classify');
      if (!(await rctx.sleep(step))) return;

      // 걸음 3 — 충돌 덩이 (있을 때만)
      if (m.conflicts > 0) {
        const blocks = conflictBlocks(m);
        await ctx.emit({ type: 'conflict', payload: { blocks } });
        show('conflicts', m.conflicts);
        await phase('conflict');
        if (!(await rctx.sleep(step))) return;
      }

      // 마지막 — 결과
      await ctx.emit({ type: 'result', payload: { lines: m.lines, conflicts: m.conflicts } });
      show('result-lines', m.lines.length);
      await phase('result');
      if (!(await rctx.sleep(step))) return;

      // 손잡이 입력
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        // 우리 것이 아닌 입력만 흘린다. 아는 손잡이에 틀린 값이 오면 던진다
        if (input.type !== 'ours' && input.type !== 'theirs') continue;
        const p = input.payload as { value?: unknown } | undefined;
        const value = p?.value;
        if (input.type === 'ours') {
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= d.oursActions.length) {
            throw new Error(`three-way-merge: ours 손잡이 값 ${String(value)} 이 oursActions 범위 밖이다`);
          }
          act = value;
          break;
        }
        if (typeof value !== 'number' || !d.theirsLadder.includes(value)) {
          throw new Error(`three-way-merge: theirs 손잡이 값 ${String(value)} 이 theirsLadder 에 없다`);
        }
        t = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
