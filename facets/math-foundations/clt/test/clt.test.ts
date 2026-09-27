// @vitest-environment happy-dom
/**
 * facet:clt 고유의 검수 — 사양 표 대조 · IR ↔ algorithm 전 조합 · 걸음 차례 · 회차별 계기 · 무대의 멱등.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  BIN_COUNT,
  binOf,
  buildTable,
  comboKey,
  cltAlgorithm,
  cltFacet,
  cltImperativeIR,
  cltInitialData,
  cltProjector,
  cltStageView,
  mulberry32,
  narrowCltData,
  type CltData,
  type CltStage,
} from '../src/index.js';

const data = narrowCltData(cltInitialData);
const table = buildTable(data);

// ── 사양 표 (sim 출력 그대로) ─────────────────────────────────────────────
const SPEC = `
 uniform n  1 ·  82   0  67   0  55   0  79   0  55   0  62 · 3.36 · 1.73 · 1.71 · 3 · 82
 uniform n  2 ·  10  26  26  42  70  65  51  39  35  28   8 · 3.50 · 1.20 · 1.21 · 1 · 70
 uniform n  6 ·   0   2  18  48  80 111  91  33  14   3   0 · 3.47 · 0.72 · 0.70 · 1 · 111
 uniform n 10 ·   0   0   3  37 100 131  91  33   5   0   0 · 3.49 · 0.57 · 0.54 · 1 · 131
 uniform n 30 ·   0   0   0   3  85 222  87   3   0   0   0 · 3.49 · 0.31 · 0.31 · 1 · 222
maxOfTwo n  1 ·  13   0  36   0  64   0  77   0 105   0 105 · 4.35 · 1.42 · 1.40 · 1 · 105
maxOfTwo n  2 ·   0   0   5  14  30  44  61  72  74  59  41 · 4.49 · 0.98 · 0.99 · 1 · 74
maxOfTwo n  6 ·   0   0   0   1   7  47  82 136 101  22   4 · 4.45 · 0.58 · 0.57 · 1 · 136
maxOfTwo n 10 ·   0   0   0   0   2  30  96 164  95  13   0 · 4.47 · 0.47 · 0.44 · 1 · 164
maxOfTwo n 30 ·   0   0   0   0   0   2  71 276  51   0   0 · 4.47 · 0.25 · 0.26 · 1 · 276
  skewed n  1 · 183   0 100   0  55   0  28   0  21   0  13 · 2.11 · 1.36 · 1.35 · 1 · 183
  skewed n  2 ·  69  87  90  52  40  34  16   8   3   1   0 · 2.17 · 0.95 · 0.95 · 1 · 90
  skewed n  6 ·  13  77 149 104  41  13   2   1   0   0   0 · 2.16 · 0.55 · 0.55 · 1 · 149
  skewed n 10 ·   4  66 155 127  42   6   0   0   0   0   0 · 2.19 · 0.45 · 0.43 · 1 · 155
  skewed n 30 ·   0  15 226 154   5   0   0   0   0   0   0 · 2.19 · 0.25 · 0.25 · 1 · 226
twoPeaks n  1 · 166   0  31   0   7   0  12   0  34   0 150 · 3.42 · 2.30 · 2.29 · 2 · 166
twoPeaks n  2 ·  60  24   7  15  29 134  24  13   5  25  64 · 3.51 · 1.61 · 1.62 · 3 · 134
twoPeaks n  6 ·   4   8  37  55  44 104  54  56  29   5   4 · 3.47 · 0.97 · 0.94 · 3 · 104
twoPeaks n 10 ·   1   3  18  40  93  97  76  47  21   4   0 · 3.50 · 0.77 · 0.72 · 1 · 97
twoPeaks n 30 ·   0   0   1  19 100 168  99  13   0   0   0 · 3.48 · 0.42 · 0.42 · 1 · 168
`;

const FIRST: Record<string, [number[], number, string, string]> = {
  'uniform:1': [[4], 4, '4.00', '4.0'],
  'uniform:2': [[4, 4], 8, '4.00', '4.0'],
  'uniform:6': [[3, 6, 2, 5, 3, 4], 23, '3.83', '4.0'],
  'uniform:10': [[1, 1, 2, 1, 5, 3, 6, 2, 4, 3], 28, '2.80', '3.0'],
  'uniform:30': [[2, 1, 5, 4, 3, 1, 3, 3, 3, 4, 1, 3, 5, 2, 3, 5, 6, 6, 6, 6, 1, 5, 5, 5, 1, 4, 4, 2, 4, 2], 105, '3.50', '3.5'],
  'maxOfTwo:1': [[5], 5, '5.00', '5.0'],
  'maxOfTwo:2': [[5, 5], 10, '5.00', '5.0'],
  'maxOfTwo:6': [[5, 6, 4, 6, 4, 5], 30, '5.00', '5.0'],
  'maxOfTwo:10': [[2, 2, 3, 3, 6, 4, 6, 3, 5, 4], 38, '3.80', '4.0'],
  'maxOfTwo:30': [[3, 3, 6, 5, 5, 3, 4, 4, 4, 5, 2, 5, 6, 4, 4, 5, 6, 6, 6, 6, 3, 6, 5, 6, 2, 5, 5, 3, 5, 4], 136, '4.53', '4.5'],
  'skewed:1': [[2], 2, '2.00', '2.0'],
  'skewed:2': [[2, 2], 4, '2.00', '2.0'],
  'skewed:6': [[2, 5, 1, 3, 1, 2], 14, '2.33', '2.5'],
  'skewed:10': [[1, 1, 1, 1, 3, 1, 4, 1, 2, 1], 16, '1.60', '1.5'],
  'skewed:30': [[1, 1, 3, 2, 2, 1, 1, 1, 1, 2, 1, 2, 3, 1, 2, 3, 4, 4, 4, 4, 1, 3, 3, 3, 1, 2, 2, 1, 2, 1], 62, '2.07', '2.0'],
  'twoPeaks:1': [[6], 6, '6.00', '6.0'],
  'twoPeaks:2': [[5, 6], 11, '5.50', '5.5'],
  'twoPeaks:6': [[3, 6, 1, 6, 1, 5], 22, '3.67', '3.5'],
  'twoPeaks:10': [[1, 1, 1, 1, 6, 1, 6, 1, 6, 1], 25, '2.50', '2.5'],
  'twoPeaks:30': [[1, 1, 6, 6, 3, 1, 1, 1, 1, 6, 1, 2, 6, 1, 2, 6, 6, 6, 6, 6, 1, 6, 6, 6, 1, 6, 5, 1, 5, 1], 107, '3.57', '3.5'],
};

const POP_STATS: Record<string, [string, string]> = {
  uniform: ['3.50', '1.71'],
  maxOfTwo: ['4.47', '1.40'],
  skewed: ['2.19', '1.35'],
  twoPeaks: ['3.50', '2.29'],
};

const popIndex = (id: string): number => data.populations.findIndex((p) => p.id === id);

function specRows() {
  return SPEC.trim()
    .split('\n')
    .map((line) => {
      const [head, bins, mean, spread, theory, peaks, tallest] = line.split('·').map((s) => s.trim());
      const [id, , n] = head!.split(/\s+/);
      return {
        pop: popIndex(id!),
        id: id!,
        n: Number(n),
        counts: bins!.split(/\s+/).map(Number),
        mean: mean!,
        spread: spread!,
        theory: theory!,
        peaks: Number(peaks),
        tallest: Number(tallest),
      };
    });
}

describe('clt — 생성기와 데이터', () => {
  it('mulberry32 확인값 (씨앗 12345 의 첫 다섯)', () => {
    const rng = mulberry32(12345);
    expect([rng(), rng(), rng(), rng(), rng()]).toEqual([
      0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203, 0.5094283693470061,
    ]);
  });

  it('사다리가 segments[].value 와 같다', () => {
    const controls = (cltFacet.blocks.controls as { controls: { name?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const pop = controls.find((c) => c.name === 'population');
    const per = controls.find((c) => c.name === 'perMean');
    expect(data.populations.length).toBe(4);
    expect(pop?.segments?.map((s) => s.value)).toEqual([0, 1, 2, 3]);
    expect(data.perMeanLadder).toEqual([1, 2, 6, 10, 30]);
    expect(per?.segments?.map((s) => s.value)).toEqual(data.perMeanLadder);
    expect(data.perMeanLadder[data.perMeanLadder.length - 1]).toBe(30);
    expect(pop?.segments?.find((s) => s.default)?.value).toBe(data.population);
    expect(per?.segments?.find((s) => s.default)?.value).toBe(data.perMean);
  });

  it('축척 — 칸 최대 276 · 무게 최대 15', () => {
    expect(table.countMax).toBe(276);
    expect(table.weightMax).toBe(15);
  });

  it('모집단 μ · σ 가 사양 표와 같다', () => {
    for (const [id, [mu, sigma]] of Object.entries(POP_STATS)) {
      const st = table.stats[popIndex(id)]!;
      expect(st.mu.toFixed(2)).toBe(mu);
      expect(st.sigma.toFixed(2)).toBe(sigma);
    }
  });

  it('스무 조합의 칸 · 평균 · 폭 · σ/√n · 봉우리 · 가장 높은 칸이 사양 표와 같다', () => {
    const rows = specRows();
    expect(rows).toHaveLength(20);
    for (const r of rows) {
      const c = table.combos.get(comboKey(r.pop, r.n))!;
      const tag = `${r.id} n${r.n}`;
      expect(c.counts, tag).toEqual(r.counts);
      expect(c.mean.toFixed(2), tag).toBe(r.mean);
      expect(c.spread.toFixed(2), tag).toBe(r.spread);
      expect(c.theory.toFixed(2), tag).toBe(r.theory);
      expect(c.peaks, tag).toBe(r.peaks);
      expect(c.tallest, tag).toBe(r.tallest);
      expect(c.sums).toHaveLength(400);
    }
  });

  it('첫 평균의 눈 · 합 · s/n · 칸 가운데가 사양과 같다 (전 조합)', () => {
    for (const [key, [faces, sum, mean, center]] of Object.entries(FIRST)) {
      const [id, n] = key.split(':');
      const c = table.combos.get(comboKey(popIndex(id!), Number(n)))!;
      expect(c.first, key).toEqual(faces);
      expect(c.firstSum, key).toBe(sum);
      expect((c.firstSum / Number(n)).toFixed(2), key).toBe(mean);
      expect((1 + 0.5 * c.firstBin).toFixed(1), key).toBe(center);
    }
  });
});

describe('clt — IR 이 algorithm 과 같은 답을 낸다', () => {
  it('스무 조합 모두 countInBin · meanOf · spreadOf · binOf', () => {
    for (let p = 0; p < data.populations.length; p++) {
      for (const n of data.perMeanLadder) {
        const c = table.combos.get(comboKey(p, n))!;
        const reversed = [...c.sums].reverse();
        for (let j = 0; j < BIN_COUNT; j++) {
          expect(runIR(cltImperativeIR, 'countInBin', [c.sums, n, j])).toBe(c.counts[j]);
          expect(runIR(cltImperativeIR, 'countInBin', [reversed, n, j])).toBe(c.counts[j]);
        }
        const m = runIR(cltImperativeIR, 'meanOf', [c.sums, n]) as number;
        const s = runIR(cltImperativeIR, 'spreadOf', [c.sums, n]) as number;
        expect(Math.abs(m - c.mean)).toBeLessThan(1e-9);
        expect(Math.abs(s - c.spread)).toBeLessThan(1e-9);
        expect(m.toFixed(2)).toBe(c.mean.toFixed(2));
        expect(s.toFixed(2)).toBe(c.spread.toFixed(2));
        expect(runIR(cltImperativeIR, 'binOf', [c.firstSum, n])).toBe(c.firstBin);
      }
    }
  });

  it('표지 — 칸 경계와 s < n 에서 TS 는 던지고 IR 은 −1', () => {
    expect(() => binOf(5, 4)).toThrow();
    expect(runIR(cltImperativeIR, 'binOf', [5, 4])).toBe(-1);
    expect(() => binOf(1, 2)).toThrow();
    expect(runIR(cltImperativeIR, 'binOf', [1, 2])).toBe(-1);
  });
});

// ── 알고리즘을 가짜 reactive 문맥으로 돌린다 ───────────────────────────────
type Rec = { kind: 'emit'; event: FacetRuntimeEvent } | { kind: 'sleep' } | { kind: 'metric'; name: string; delta: number };

async function runWith(inputs: { type: string; payload?: unknown }[]) {
  const log: Rec[] = [];
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: structuredClone(cltInitialData) as CltData,
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      log.push({ kind: 'emit', event });
    },
    metric(name: string, delta: number | 'inc') {
      log.push({ kind: 'metric', name, delta: delta === 'inc' ? 1 : delta });
    },
    async sleep() {
      log.push({ kind: 'sleep' });
      return !cancelled;
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await cltAlgorithm(ctx as unknown as FacetContext<CltData>);
  return log;
}

function runsOf(log: Rec[]) {
  // 판마다 [peaks, tallest-bin] 지금 값
  const shown: Record<string, number> = { peaks: 0, 'tallest-bin': 0 };
  const out: [number, number][] = [];
  for (const r of log) {
    if (r.kind === 'metric') shown[r.name] = (shown[r.name] ?? 0) + r.delta;
    if (r.kind === 'emit' && r.event.type === 'spread') out.push([shown.peaks!, shown['tallest-bin']!]);
  }
  return out;
}

describe('clt — 걸음 차례와 계기', () => {
  it('init → sleep → 첫 phase, 걸음마다 바로 앞이 그 걸음의 phase', async () => {
    const log = await runWith([]);
    const seq = log.filter((r) => r.kind !== 'metric');
    const first = seq[0];
    expect(first?.kind === 'emit' && first.event.type === 'init' && first.event.silent).toBe(true);
    expect(seq[1]?.kind).toBe('sleep');
    const want: Record<string, string> = { 'one-mean': 'bin', counts: 'count', 'grand-mean': 'mean', spread: 'spread' };
    let steps = 0;
    seq.forEach((r, i) => {
      if (r.kind !== 'emit' || r.event.silent) return;
      steps++;
      const prev = seq[i - 1];
      expect(prev?.kind === 'emit' && prev.event.type === 'phase').toBe(true);
      const ph = prev?.kind === 'emit' ? (prev.event.payload as { phase: string }).phase : '';
      expect(ph).toBe(want[r.event.type]);
      expect(r.event.silent).toBeFalsy();
    });
    expect(steps).toBe(4);
    // 걸음 사이 sleep: init 뒤 + 걸음 1..3 뒤 = 4 번
    expect(seq.filter((r) => r.kind === 'sleep')).toHaveLength(4);
  });

  it('회차별 계기 — 양 끝×10 → 양 끝×1 → 양 끝×10 → 고른×10', async () => {
    const log = await runWith([
      { type: 'perMean', payload: { value: 1 } },
      { type: 'somethingElse', payload: { value: 99 } },
      { type: 'perMean', payload: { value: 10 } },
      { type: 'population', payload: { value: 0 } },
    ]);
    expect(runsOf(log)).toEqual([
      [1, 97],
      [2, 166],
      [1, 97],
      [1, 131],
    ]);
    // 판 머리마다 두 계기를 (차이 0 이어도) 보낸다
    const inits = log.filter((r) => r.kind === 'emit' && r.event.type === 'init').length;
    expect(inits).toBe(4);
    expect(log.filter((r) => r.kind === 'metric' && r.name === 'peaks').length).toBe(8);
  });

  it('제 손잡이의 사다리 밖 값은 던진다', async () => {
    await expect(runWith([{ type: 'perMean', payload: { value: 3 } }])).rejects.toThrow();
    await expect(runWith([{ type: 'population', payload: { value: 4 } }])).rejects.toThrow();
    await expect(runWith([{ type: 'perMean', payload: {} }])).rejects.toThrow();
  });
});

describe('clt — 무대', () => {
  const mount = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(cltStageView, container, { config: {}, locale: 'ko', isInstant: () => true });
    return { container, stage: inst as unknown as CltStage };
  };

  it('initialData 없이 마운트해도 던지지 않는다', () => {
    expect(() => mount()).not.toThrow();
  });

  it('첫 그림을 두 번 먹여도 요소 수가 같고, onReset 이 결론을 걷는다', async () => {
    const { container, stage } = mount();
    const log = await runWith([]);
    const events = log.filter((r): r is Extract<Rec, { kind: 'emit' }> => r.kind === 'emit').map((r) => r.event);
    const proj = cltProjector({ stage: stage as unknown as { destroy(): void } }, { getSpeed: () => 1, t: (_k, en) => en });
    const init = events[0]!;
    await proj.onEvent(init);
    const n1 = container.querySelectorAll('*').length;
    await proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
    for (const e of events.slice(1)) await proj.onEvent(e);
    const text = container.textContent ?? '';
    expect(text).toContain('0.77');
    expect(text).toContain('97');
    // 새 판의 첫 그림은 앞 판의 결론을 걷는다
    await proj.onEvent(init);
    expect(container.textContent).not.toContain('0.77');
    expect(container.querySelectorAll('*').length).toBe(n1);
    // 되감기
    for (const e of events.slice(1)) await proj.onEvent(e);
    proj.onReset?.();
    expect(container.textContent).not.toContain('0.77');
    await proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
  });

  it('모르는 이벤트는 던진다', async () => {
    const { stage } = mount();
    const proj = cltProjector({ stage: stage as unknown as { destroy(): void } }, { getSpeed: () => 1, t: (_k, en) => en });
    expect(() => proj.onEvent({ type: 'mystery' })).toThrow();
  });
});
