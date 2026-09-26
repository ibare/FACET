/**
 * dependency-resolution — 두 꾸러미(charts · table)가 같은 것(color)을 다른 범위로 부를 때
 * 해결기의 방식이 벌 수(한 벌 · 두 벌 · 실패)를 어떻게 바꾸는가.
 *
 * 규약 (공통 안내문 "버전 규약")
 *   - 버전은 세 수 `M.m.p` — 세 수를 차례로 수로 견준다. 세 수가 아니면 던진다.
 *   - 범위 `^M.m.p` · `~M.m.p` 는 두 끝 [아래 포함, 위 제외). `^` 의 0.x 특례도 푼다. 다른 기호는 던진다.
 *   - 고르기는 범위 안 가장 큰 것 — 공개 목록의 차례에 기대지 않고 수로 견주어 고른다.
 *     같은 버전이 목록에 두 번 있으면(동률) 앞의 것이 남는다 — 이 데이터에는 동률이 없다.
 *   - 중첩: 처음 부름(charts)이 꼭대기 `node_modules/color` 에 범위 안 가장 큰 것. 다음 부름(table)은 꼭대기 것이
 *     제 범위 안이면 다시 쓰고, 밖이면 `node_modules/table/node_modules/color` 에 제 범위 안 가장 큰 것. 되짚지 않는다.
 *   - 한 벌: 함께 쓸 구간 = [아래 끝 가운데 큰 것, 위 끝 가운데 작은 것). 비거나 안에 공개된 것이 없으면 실패.
 *
 * 이벤트 (모두 await, 걸음 경계는 phase 뒤의 sleep 과 입력 대기)
 *   axis            { ticks: string[]; published: number[] (ticks 안의 자리); root: string;
 *                     callers: { name: string; version: string }[]; target: string;
 *                     slots: { top: string; inner: string } (node_modules 자리 글) }
 *                   — 판을 돌기 전 한 번. 차례 간격 수직선의 눈금(공개 버전 + 모든 범위 끝, 수로 정렬)
 *   round           { rangeIndex: number; solver: 'nested' | 'single';
 *                     bands: { from: string; range: string; lo: number; hi: number }[] (눈금 자리);
 *                     overlap: { lo: number; hi: number } | null }                               — 판 머리 (걸음 0)
 *   pick            { version: string; tick: number; by: string; range: string }   — pick-first
 *   pick-shared     { version: string; tick: number }                                           — pick-shared (둘 다 쓴다)
 *   check           { version: string; range: string; tick: number; inside: boolean }           — check-top
 *   reuse           { version: string; tick: number }                                           — reuse
 *   nest            { version: string; tick: number; range: string }              — nest
 *   shared-range    { lo: string; hi: string; loTick: number; hiTick: number; empty: boolean }  — shared-range
 *   fail            { reason: 'empty-range' | 'nothing-published' }                             — fail
 *   done            { copies: number; uses: { from: string; slot: 'top' | 'inner' }[];
 *                     shared: number[] (눈금 자리); sharedVersions: string[] }                     — 끝 걸음
 *   phase (silent)  { phase: string }
 *
 * phase 어휘 (irs.ts 와 같다): pick-first · check-top · reuse · nest · shared-range · pick-shared · fail
 *
 * 계기 (판마다의 값 — 차이만 보내고 판 머리에서 0)
 *   copies           이번 판에 깔린 color 벌 수 (실패는 0). 중첩은 걸음 3, 한 벌은 걸음 2 에서 정해진다
 *   shared-versions  두 범위를 함께 채우는 공개된 color 수. 끝 걸음에서 정해진다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DependencyResolutionData = {
  type: 'dependency-resolution';
  stepMs: number;
  root: string;
  /** app 이 부르는 꾸러미 — 판 머리에 이미 놓인다. 첫째가 먼저 부르는 쪽 */
  callers: { name: string; range: string; published: string[] }[];
  target: { name: string; published: string[] };
  /** 첫째 부르는 쪽(charts)이 target 을 부르는 범위 — 고정 */
  firstRange: string;
  /** 둘째 부르는 쪽(table)이 target 을 부르는 범위 — 손잡이 사다리 */
  secondRanges: string[];
  solvers: ('nested' | 'single')[];
  folder: string;
  defaults: { 'table-range': number; solver: number };
};

type Version = [number, number, number];
type Range = { op: 0 | 1; text: string; lo: Version; hi: Version };

export function parseVersion(text: string): Version {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (m === null) throw new Error(`dependency-resolution: 세 수가 아닌 버전 '${text}'`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareVersion(a: Version, b: Version): number {
  for (let k = 0; k < 3; k += 1) {
    if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  }
  return 0;
}

export function parseRange(text: string): Range {
  const sign = text.charAt(0);
  if (sign !== '^' && sign !== '~') throw new Error(`dependency-resolution: 모르는 범위 기호 '${text}'`);
  const lo = parseVersion(text.slice(1));
  const [M, m, p] = lo;
  if (sign === '~') return { op: 1, text, lo, hi: [M, m + 1, 0] };
  if (M > 0) return { op: 0, text, lo, hi: [M + 1, 0, 0] };
  if (m > 0) return { op: 0, text, lo, hi: [0, m + 1, 0] };
  return { op: 0, text, lo, hi: [0, 0, p + 1] };
}

const versionText = (v: Version): string => `${v[0]}.${v[1]}.${v[2]}`;

const inside = (v: Version, lo: Version, hi: Version): boolean =>
  compareVersion(v, lo) >= 0 && compareVersion(v, hi) < 0;

/** [lo, hi) 안 가장 큰 공개 버전의 자리 — 수로 견준다. 없으면 -1 */
export function maxIn(published: Version[], lo: Version, hi: Version): number {
  let best = -1;
  published.forEach((v, i) => {
    if (!inside(v, lo, hi)) return;
    if (best < 0 || compareVersion(v, published[best]) > 0) best = i;
  });
  return best;
}

/** 한 판의 결과 — 검사와 알고리즘이 함께 쓴다 */
export type Resolution = {
  solver: 'nested' | 'single';
  phases: string[];
  copies: number;
  /** charts · table 이 쓰는 버전의 자리 (published 안) — 실패면 null */
  used: [number, number] | null;
  /** 중첩에서 처음 부름이 고른 자리 (-1 = 범위 안이 빔) — 한 벌은 null */
  top: number | null;
  topInsideSecond: boolean | null;
  shared: { lo: Version; hi: Version; empty: boolean } | null;
  sharedVersions: number[];
};

export function resolve(published: Version[], first: Range, second: Range, solver: 'nested' | 'single'): Resolution {
  const sharedVersions = published
    .map((v, i) => (inside(v, first.lo, first.hi) && inside(v, second.lo, second.hi) ? i : -1))
    .filter((i) => i >= 0);
  if (solver === 'nested') {
    const top = maxIn(published, first.lo, first.hi);
    if (top < 0) {
      // 처음 부름의 범위 안이 비면 그 걸음이 곧 실패다 — 고른 것 없는 빈 pick-first 걸음을 두지 않는다
      return { solver, phases: ['fail'], copies: 0, used: null, top, topInsideSecond: null, shared: null, sharedVersions };
    }
    const reusable = inside(published[top], second.lo, second.hi);
    if (reusable) {
      return { solver, phases: ['pick-first', 'check-top', 'reuse'], copies: 1, used: [top, top], top, topInsideSecond: true, shared: null, sharedVersions };
    }
    const inner = maxIn(published, second.lo, second.hi);
    if (inner < 0) {
      return { solver, phases: ['pick-first', 'check-top', 'fail'], copies: 0, used: null, top, topInsideSecond: false, shared: null, sharedVersions };
    }
    return { solver, phases: ['pick-first', 'check-top', 'nest'], copies: 2, used: [top, inner], top, topInsideSecond: false, shared: null, sharedVersions };
  }
  const lo = compareVersion(second.lo, first.lo) > 0 ? second.lo : first.lo;
  const hi = compareVersion(second.hi, first.hi) < 0 ? second.hi : first.hi;
  const empty = compareVersion(lo, hi) >= 0;
  const shared = { lo, hi, empty };
  if (empty) {
    return { solver, phases: ['shared-range', 'fail'], copies: 0, used: null, top: null, topInsideSecond: null, shared, sharedVersions };
  }
  const best = maxIn(published, lo, hi);
  if (best < 0) {
    return { solver, phases: ['shared-range', 'fail'], copies: 0, used: null, top: null, topInsideSecond: null, shared, sharedVersions };
  }
  return { solver, phases: ['shared-range', 'pick-shared'], copies: 1, used: [best, best], top: null, topInsideSecond: null, shared, sharedVersions };
}

/** 수직선 눈금 — 공개 버전과 모든 범위 끝을 합쳐 수로 정렬 (겹치면 하나) */
export function axisTicks(published: Version[], ranges: Range[]): Version[] {
  const all: Version[] = [...published];
  for (const r of ranges) all.push(r.lo, r.hi);
  all.sort(compareVersion);
  return all.filter((v, i) => i === 0 || compareVersion(v, all[i - 1]) !== 0);
}

const inLadder = (value: unknown, size: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < size;

export async function dependencyResolutionAlgorithm(ctx0: FacetContext<DependencyResolutionData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<DependencyResolutionData>;
  const data = ctx.data;
  if (data.callers.length !== 2) throw new Error('dependency-resolution: 부르는 쪽은 둘이다 (callers)');
  const [firstCaller, secondCaller] = data.callers;
  const published = data.target.published.map(parseVersion);
  const firstRange = parseRange(data.firstRange);
  const secondRanges = data.secondRanges.map(parseRange);
  const ticks = axisTicks(published, [firstRange, ...secondRanges]);
  const tickOf = (v: Version): number => {
    const i = ticks.findIndex((x) => compareVersion(x, v) === 0);
    if (i < 0) throw new Error(`dependency-resolution: 눈금에 없는 버전 ${versionText(v)}`);
    return i;
  };
  const topPath = `${data.folder}/${data.target.name}`;
  const innerPath = `${data.folder}/${secondCaller.name}/${data.folder}/${data.target.name}`;

  // 판 머리에 이미 놓인 꾸러미 — app 이 부르는 범위 안 가장 큰 것
  const placed = data.callers.map((c) => {
    const r = parseRange(c.range);
    const vs = c.published.map(parseVersion);
    const i = maxIn(vs, r.lo, r.hi);
    if (i < 0) throw new Error(`dependency-resolution: ${c.name} ${c.range} 안에 공개된 버전이 없다`);
    return { name: c.name, version: versionText(vs[i]) };
  });

  let rangeIndex = data.defaults['table-range'];
  let solverIndex = data.defaults.solver;
  if (!inLadder(rangeIndex, secondRanges.length)) throw new Error('dependency-resolution: defaults.table-range 가 사다리 밖');
  if (!inLadder(solverIndex, data.solvers.length)) throw new Error('dependency-resolution: defaults.solver 가 사다리 밖');

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  const shown = { copies: 0, shared: 0 };
  let firstSend = true;
  const setCopies = (value: number): void => {
    const d = value - shown.copies;
    if (d !== 0 || firstSend) ctx.metric('copies', d);
    shown.copies = value;
  };
  const setShared = (value: number): void => {
    const d = value - shown.shared;
    if (d !== 0 || firstSend) ctx.metric('shared-versions', d);
    shown.shared = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  try {
    await ctx.emit({
      type: 'axis',
      payload: {
        ticks: ticks.map(versionText),
        published: published.map(tickOf),
        root: data.root,
        callers: placed,
        target: data.target.name,
        slots: { top: topPath, inner: innerPath },
      },
    });

    for (;;) {
      if (ctx.cancelled) return;
      const second = secondRanges[rangeIndex];
      const solver = data.solvers[solverIndex];
      if (solver !== 'nested' && solver !== 'single') throw new Error(`dependency-resolution: 모르는 해결기 '${String(solver)}'`);
      const res = resolve(published, firstRange, second, solver);
      const olo = compareVersion(second.lo, firstRange.lo) > 0 ? second.lo : firstRange.lo;
      const ohi = compareVersion(second.hi, firstRange.hi) < 0 ? second.hi : firstRange.hi;

      // 걸음 0 — 판 머리
      setCopies(0);
      setShared(0);
      firstSend = false;
      await ctx.emit({
        type: 'round',
        payload: {
          rangeIndex,
          solver,
          bands: [
            { from: firstCaller.name, range: firstRange.text, lo: tickOf(firstRange.lo), hi: tickOf(firstRange.hi) },
            { from: secondCaller.name, range: second.text, lo: tickOf(second.lo), hi: tickOf(second.hi) },
          ],
          overlap: compareVersion(olo, ohi) < 0 ? { lo: tickOf(olo), hi: tickOf(ohi) } : null,
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;

      for (const ph of res.phases) {
        if (ctx.cancelled) return;
        switch (ph) {
          case 'pick-first': {
            if (res.top === null) throw new Error('dependency-resolution: pick-first 의 자리가 없다');
            if (res.top < 0) throw new Error('dependency-resolution: 고른 것 없는 pick-first — resolve 는 이 칸을 fail 로 보낸다');
            await phase('pick-first');
            const v = published[res.top];
            await ctx.emit({
              type: 'pick',
              payload: { version: versionText(v), tick: tickOf(v), by: firstCaller.name, range: firstRange.text },
            });
            break;
          }
          case 'check-top': {
            if (res.top === null || res.top < 0 || res.topInsideSecond === null) throw new Error('dependency-resolution: check-top 의 판정이 없다');
            await phase('check-top');
            const v = published[res.top];
            await ctx.emit({
              type: 'check',
              payload: { version: versionText(v), range: second.text, tick: tickOf(v), inside: res.topInsideSecond },
            });
            break;
          }
          case 'reuse': {
            if (res.used === null) throw new Error('dependency-resolution: reuse 인데 쓰는 것이 없다');
            await phase('reuse');
            const v = published[res.used[1]];
            await ctx.emit({ type: 'reuse', payload: { version: versionText(v), tick: tickOf(v) } });
            setCopies(res.copies);
            break;
          }
          case 'nest': {
            if (res.used === null) throw new Error('dependency-resolution: nest 인데 쓰는 것이 없다');
            await phase('nest');
            const v = published[res.used[1]];
            await ctx.emit({
              type: 'nest',
              payload: { version: versionText(v), tick: tickOf(v), range: second.text },
            });
            setCopies(res.copies);
            break;
          }
          case 'shared-range': {
            if (res.shared === null) throw new Error('dependency-resolution: shared-range 의 구간이 없다');
            await phase('shared-range');
            await ctx.emit({
              type: 'shared-range',
              payload: {
                lo: versionText(res.shared.lo),
                hi: versionText(res.shared.hi),
                loTick: tickOf(res.shared.lo),
                hiTick: tickOf(res.shared.hi),
                empty: res.shared.empty,
              },
            });
            break;
          }
          case 'pick-shared': {
            if (res.used === null) throw new Error('dependency-resolution: pick-shared 인데 고른 것이 없다');
            await phase('pick-shared');
            const v = published[res.used[0]];
            await ctx.emit({
              type: 'pick-shared',
              payload: { version: versionText(v), tick: tickOf(v) },
            });
            setCopies(res.copies);
            break;
          }
          case 'fail': {
            await phase('fail');
            await ctx.emit({
              type: 'fail',
              payload: { reason: res.shared !== null && res.shared.empty ? 'empty-range' : 'nothing-published' },
            });
            setCopies(0);
            break;
          }
          default:
            throw new Error(`dependency-resolution: 모르는 phase '${ph}'`);
        }
        if (!(await ctx.sleep(data.stepMs))) return;
      }

      // 끝 걸음
      if (ctx.cancelled) return;
      const uses: { from: string; slot: 'top' | 'inner' }[] =
        res.used === null
          ? []
          : [
              { from: firstCaller.name, slot: 'top' },
              { from: secondCaller.name, slot: res.copies === 2 ? 'inner' : 'top' },
            ];
      await ctx.emit({
        type: 'done',
        payload: {
          copies: res.copies,
          uses,
          shared: res.sharedVersions.map((i) => tickOf(published[i])),
          sharedVersions: res.sharedVersions.map((i) => versionText(published[i])),
        },
      });
      setShared(res.sharedVersions.length);

      // 입력 대기 — 우리 손잡이만 받는다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null && 'value' in p ? p.value : undefined;
        if (input.type === 'table-range') {
          if (!inLadder(value, secondRanges.length)) throw new Error(`dependency-resolution: table-range 값이 사다리 밖 (${String(value)})`);
          rangeIndex = value;
          break;
        }
        if (input.type === 'solver') {
          if (!inLadder(value, data.solvers.length)) throw new Error(`dependency-resolution: solver 값이 사다리 밖 (${String(value)})`);
          solverIndex = value;
          break;
        }
        continue;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
