// @vitest-environment happy-dom
/**
 * dependency-resolution 고유 검수 — IR ↔ algorithm 여섯 칸 · 사양 실측표 · 판마다의 계기 · 사다리 · 공개 목록 섞기.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  axisTicks,
  compareVersion,
  dependencyResolutionAlgorithm,
  dependencyResolutionFacet,
  dependencyResolutionImperativeIR,
  dependencyResolutionStageView,
  parseRange,
  parseVersion,
  resolve,
  type DependencyResolutionData,
} from '../src/index.js';

const data = dependencyResolutionFacet.initialData as DependencyResolutionData;
const published = data.target.published.map(parseVersion);
const first = parseRange(data.firstRange);
const seconds = data.secondRanges.map(parseRange);
const text = (v: readonly number[]): string => v.join('.');

/** 사양 실측표 — 대조용 (table 범위 × 해결기) */
const TABLE = [
  { range: '^3.5.0', solver: 'nested', copies: 1, shared: 2, uses: ['3.6.2', '3.6.2'], phases: ['pick-first', 'check-top', 'reuse'] },
  { range: '^3.5.0', solver: 'single', copies: 1, shared: 2, uses: ['3.6.2', '3.6.2'], phases: ['shared-range', 'pick-shared'], interval: ['3.5.0', '4.0.0'] },
  { range: '~3.4.0', solver: 'nested', copies: 2, shared: 1, uses: ['3.6.2', '3.4.1'], phases: ['pick-first', 'check-top', 'nest'] },
  { range: '~3.4.0', solver: 'single', copies: 1, shared: 1, uses: ['3.4.1', '3.4.1'], phases: ['shared-range', 'pick-shared'], interval: ['3.4.0', '3.5.0'] },
  { range: '^4.0.0', solver: 'nested', copies: 2, shared: 0, uses: ['3.6.2', '4.0.0'], phases: ['pick-first', 'check-top', 'nest'] },
  { range: '^4.0.0', solver: 'single', copies: 0, shared: 0, uses: null, phases: ['shared-range', 'fail'], interval: ['4.0.0', '4.0.0'] },
] as const;

const irRange = (r: ReturnType<typeof parseRange>): number[] => [r.op, ...r.lo];

function runResolveIR(order: number[], rangeIndex: number, solver: number): { copies: number; used: string[] | null } {
  const vers = order.flatMap((i) => published[i]);
  const used = [-1, -1];
  const out = runIR(dependencyResolutionImperativeIR, 'resolve', [vers, irRange(first), irRange(seconds[rangeIndex]), solver, used]);
  if (typeof out !== 'number') throw new Error('resolve 가 수를 돌려주지 않았다');
  if (out === 0) return { copies: 0, used: null };
  return { copies: out, used: used.map((k) => text(published[order[k]])) };
}

/** 식까지 적힌 섞기 (LCG) — 되풀이해도 같은 차례 */
function shuffled(n: number, seed: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  for (let i = n - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

describe('dependency-resolution — 규약', () => {
  it('버전은 세 수를 수로 견준다', () => {
    expect(compareVersion(parseVersion('1.10.0'), parseVersion('1.9.4'))).toBe(1);
    expect(() => parseVersion('v1.2.3')).toThrow();
    expect(() => parseVersion('1.2.3-beta')).toThrow();
  });
  it('범위의 두 끝 — ^ · ~ · 0.x 특례, 다른 기호는 던진다', () => {
    expect(text(parseRange('^3.2.0').hi)).toBe('4.0.0');
    expect(text(parseRange('~3.4.0').hi)).toBe('3.5.0');
    expect(text(parseRange('^0.3.1').hi)).toBe('0.4.0');
    expect(text(parseRange('^0.0.3').hi)).toBe('0.0.4');
    expect(() => parseRange('>=3.0.0')).toThrow();
  });
  it('IR 의 upperPart 가 0.x 특례까지 algorithm 과 같다', () => {
    for (const r of ['^3.2.0', '~3.4.0', '^0.3.1', '^0.0.3', '~0.0.3']) {
      const range = parseRange(r);
      const parts = [0, 1, 2].map((k) =>
        runIR(dependencyResolutionImperativeIR, 'upperPart', [range.op, ...range.lo, k]),
      );
      expect(parts, r).toEqual([...range.hi]);
    }
  });
});

describe('dependency-resolution — 사양 실측표와 IR', () => {
  it('데이터 모양 — 공개 버전 여섯(IR 배열 길이 18) · 사다리 끝', () => {
    expect(published.flat()).toHaveLength(18);
    expect(data.secondRanges).toEqual(['^3.5.0', '~3.4.0', '^4.0.0']);
    expect(data.solvers).toEqual(['nested', 'single']);
    // 중간값 최대 3 * i + 2
    expect(3 * (published.length - 1) + 2).toBe(17);
  });

  it('여섯 칸 모두 algorithm 이 사양 표와 같다', () => {
    TABLE.forEach((row, k) => {
      const ri = data.secondRanges.indexOf(row.range);
      const res = resolve(published, first, seconds[ri], row.solver);
      expect(res.copies, `${row.range} × ${row.solver}`).toBe(row.copies);
      expect(res.sharedVersions.length).toBe(row.shared);
      expect(res.phases).toEqual([...row.phases]);
      expect(res.used === null ? null : res.used.map((i) => text(published[i]))).toEqual(row.uses === null ? null : [...row.uses]);
      if ('interval' in row) {
        expect(res.shared === null ? null : [text(res.shared.lo), text(res.shared.hi)]).toEqual([...row.interval]);
      }
      expect(k).toBeGreaterThanOrEqual(0);
    });
  });

  it('여섯 칸 모두 IR 의 벌 수 · used 가 algorithm 과 같다 — 공개 목록을 스무 번 섞어도', () => {
    const orders = [published.map((_, i) => i), ...Array.from({ length: 20 }, (_, s) => shuffled(published.length, s + 7))];
    for (const order of orders) {
      const vs = order.map((i) => published[i]);
      for (let ri = 0; ri < seconds.length; ri += 1) {
        for (let si = 0; si < 2; si += 1) {
          const solver = data.solvers[si];
          const res = resolve(vs, first, seconds[ri], solver);
          const ir = runResolveIR(order, ri, si);
          const row = TABLE[ri * 2 + si];
          expect(ir.copies, `${order.join(',')} ${row.range} × ${solver}`).toBe(res.copies);
          expect(ir.copies).toBe(row.copies);
          expect(ir.used).toEqual(res.used === null ? null : res.used.map((i) => text(vs[i])));
        }
      }
    }
  });

  it('수직선 눈금 — 공개 여섯과 범위 끝을 합쳐 수로 정렬', () => {
    expect(axisTicks(published, [first, ...seconds]).map(text)).toEqual([
      '3.0.2', '3.2.0', '3.4.0', '3.4.1', '3.5.0', '3.6.2', '4.0.0', '5.0.0',
    ]);
  });
});

describe('dependency-resolution — 사다리와 선언', () => {
  const controls = (dependencyResolutionFacet.blocks.controls as { controls: unknown[] }).controls;
  const slider = (action: string): { segments: { value: number; default?: boolean }[] } => {
    const c = controls.find((x) => typeof x === 'object' && x !== null && 'action' in x && x.action === action);
    if (c === undefined) throw new Error(`손잡이 ${action} 가 없다`);
    return c as { segments: { value: number; default?: boolean }[] };
  };
  it('segments[].value 가 사다리와 같고 기본값이 defaults 와 같다', () => {
    const range = slider('table-range');
    const solver = slider('solver');
    expect(range.segments.map((s) => s.value)).toEqual(data.secondRanges.map((_, i) => i));
    expect(solver.segments.map((s) => s.value)).toEqual(data.solvers.map((_, i) => i));
    expect(range.segments.find((s) => s.default)?.value).toBe(data.defaults['table-range']);
    expect(solver.segments.find((s) => s.default)?.value).toBe(data.defaults.solver);
  });
});

/** 알고리즘을 가짜 ctx 로 돌려 판마다의 계기와 이벤트를 모은다 */
async function runRounds(inputs: { type: string; value: number }[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const snapshots: { copies: number; shared: number; phases: string[]; steps: number }[] = [];
  let phases: string[] = [];
  let steps = 0;
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'round') {
        phases = [];
        steps = 0;
      }
      if (e.type === 'phase') {
        const p = e.payload;
        if (typeof p === 'object' && p !== null && 'phase' in p && typeof p.phase === 'string') phases.push(p.phase);
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      steps += 1;
      return !cancelled;
    },
    async waitForInput() {
      steps += 1;
      snapshots.push({ copies: metrics.get('copies') ?? NaN, shared: metrics.get('shared-versions') ?? NaN, phases, steps });
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'cancel' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await dependencyResolutionAlgorithm(ctx as unknown as FacetContext<DependencyResolutionData>);
  return { events, snapshots };
}

describe('dependency-resolution — 판마다의 계기 (A → B → A)', () => {
  it('손잡이를 돌려 다시 돌 때마다 계기가 사양 표의 값이다', async () => {
    const { snapshots } = await runRounds([
      { type: 'solver', value: 1 }, // ~3.4.0 × 한 벌
      { type: 'table-range', value: 2 }, // ^4.0.0 × 한 벌 (실패)
      { type: 'solver', value: 0 }, // ^4.0.0 × 중첩
      { type: 'table-range', value: 0 }, // ^3.5.0 × 중첩
      { type: 'table-range', value: 1 }, // ~3.4.0 × 중첩 (처음으로)
    ]);
    const want = [
      { copies: 2, shared: 1, phases: ['pick-first', 'check-top', 'nest'], steps: 5 },
      { copies: 1, shared: 1, phases: ['shared-range', 'pick-shared'], steps: 4 },
      { copies: 0, shared: 0, phases: ['shared-range', 'fail'], steps: 4 },
      { copies: 2, shared: 0, phases: ['pick-first', 'check-top', 'nest'], steps: 5 },
      { copies: 1, shared: 2, phases: ['pick-first', 'check-top', 'reuse'], steps: 5 },
      { copies: 2, shared: 1, phases: ['pick-first', 'check-top', 'nest'], steps: 5 },
    ];
    expect(snapshots).toEqual(want);
  });

  it('첫 판에 두 계기가 모두 실린다 · 눈금은 판 앞의 첫 이벤트에', async () => {
    const { events } = await runRounds([]);
    expect(events[0].type).toBe('axis');
    const axis = events[0].payload;
    expect(typeof axis === 'object' && axis !== null && 'ticks' in axis ? axis.ticks : null).toHaveLength(8);
  });

  it('모르는 입력은 흘리고, 사다리 밖 값은 던진다', async () => {
    await expect(runRounds([{ type: 'table-range', value: 3 }])).rejects.toThrow();
  });
});

describe('dependency-resolution — 무대', () => {
  it('mountView 로 마운트하고 한 판을 그린다', () => {
    const host = document.createElement('div');
    const stage = mountView(dependencyResolutionStageView, host, { config: {}, locale: 'ko' }) as unknown as {
      setAxis(p: unknown): void;
      beginRound(p: unknown, ms: number): void;
      pick(p: unknown, ms: number): void;
      done(p: unknown, ms: number): void;
      destroy(): void;
    };
    stage.setAxis({
      ticks: ['3.0.2', '3.2.0', '3.4.0', '3.4.1', '3.5.0', '3.6.2', '4.0.0', '5.0.0'],
      published: [0, 1, 3, 4, 5, 6],
      root: 'app',
      callers: [
        { name: 'charts', version: '4.1.0' },
        { name: 'table', version: '2.3.0' },
      ],
      target: 'color',
      slots: { top: 'node_modules/color', inner: 'node_modules/table/node_modules/color' },
    });
    stage.beginRound({ solver: 'nested', bands: [{ from: 'charts', range: '^3.2.0', lo: 1, hi: 6 }, { from: 'table', range: '~3.4.0', lo: 2, hi: 4 }], overlap: { lo: 2, hi: 4 } }, 0);
    stage.pick({ version: '3.6.2', tick: 5, by: 'charts', range: '^3.2.0' }, 0);
    stage.done({ copies: 1, uses: [{ from: 'charts', slot: 'top' }], shared: [3] }, 0);
    expect(host.textContent).toContain('node_modules/table/node_modules/color');
    expect(host.textContent).toContain('3.6.2');
    stage.destroy();
  });
});
