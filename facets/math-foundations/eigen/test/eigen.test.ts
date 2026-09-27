// @vitest-environment happy-dom
/**
 * eigen 고유 검사 — 사양 표 대조 · IR ↔ algorithm 전 조합 · 계기 회차 · phase 차례 · 첫 그림 멱등.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  buildMatrix,
  computeBoard,
  eigenAlgorithm,
  eigenFacet,
  eigenImperativeIR,
  eigenProjector,
  eigenStageView,
  narrowEigenData,
  oneDegreeTol,
  type EigenData,
} from '../src/index.js';

const data = narrowEigenData(eigenFacet.initialData);

/** 사양 표 — 칸 = 1° 안에 든 곱 · 곱 10 뒤 틈 · 넘나듦 · inside-one-degree 끝 값 · tan 비 */
const SPEC: Record<number, string[]> = {
  [-8]: ['0 · 0.00 · 0 · 10 · —', '-1 · 6.13 · 10 · 0 · 0.800', '-1 · 21.49 · 10 · 0 · 0.800', '-1 · 90.00 · 10 · 0 · —'],
  [-6]: ['0 · 0.00 · 0 · 10 · —', '8 · 0.35 · 10 · 3 · 0.600', '-1 · 1.27 · 10 · 0 · 0.600', '-1 · 90.00 · 10 · 0 · —'],
  [-4]: ['0 · 0.00 · 0 · 10 · —', '5 · 0.01 · 10 · 6 · 0.400', '6 · 0.02 · 10 · 5 · 0.400', '-1 · 90.00 · 10 · 0 · —'],
  [-2]: ['0 · 0.00 · 0 · 10 · —', '3 · 0.00 · 10 · 8 · 0.200', '4 · 0.00 · 10 · 7 · 0.200', '-1 · 90.00 · 10 · 0 · —'],
  2: ['0 · 0.00 · 0 · 10 · —', '3 · 0.00 · 0 · 8 · 0.200', '4 · 0.00 · 0 · 7 · 0.200', '-1 · 90.00 · 0 · 0 · —'],
  4: ['0 · 0.00 · 0 · 10 · —', '5 · 0.01 · 0 · 6 · 0.400', '6 · 0.02 · 0 · 5 · 0.400', '-1 · 90.00 · 0 · 0 · —'],
  6: ['0 · 0.00 · 0 · 10 · —', '8 · 0.35 · 0 · 3 · 0.600', '-1 · 1.27 · 0 · 0 · 0.600', '-1 · 90.00 · 0 · 0 · —'],
  8: ['0 · 0.00 · 0 · 10 · —', '-1 · 6.13 · 0 · 0 · 0.800', '-1 · 21.49 · 0 · 0 · 0.800', '-1 · 90.00 · 0 · 0 · —'],
};

// ── 가짜 reactive 문맥 ──
type LogItem =
  | { kind: 'emit'; event: FacetRuntimeEvent }
  | { kind: 'sleep'; ms: number }
  | { kind: 'metric'; name: string; delta: number }
  | { kind: 'wait' };

async function run(inputs: { type: string; value: number }[], d: EigenData = data): Promise<LogItem[]> {
  const log: LogItem[] = [];
  const queue = inputs.slice();
  const ctx = {
    data: d,
    cancelled: false,
    async emit(event: FacetRuntimeEvent) {
      log.push({ kind: 'emit', event });
    },
    metric(name: string, delta: number | 'inc') {
      log.push({ kind: 'metric', name, delta: delta === 'inc' ? 1 : delta });
    },
    async sleep(ms: number) {
      log.push({ kind: 'sleep', ms });
      return true;
    },
    async waitForInput() {
      log.push({ kind: 'wait' });
      const next = queue.shift();
      if (!next) {
        ctx.cancelled = true;
        return { type: '__end' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await eigenAlgorithm(ctx as never);
  return log;
}

/** 판마다 계기 끝 값 — 판이 끝나 입력을 기다리는 자리에서 잰다 */
function metricTotals(log: LogItem[]): number[][] {
  const names = ['products', 'crossings', 'inside-one-degree'];
  const now: Record<string, number> = { products: 0, crossings: 0, 'inside-one-degree': 0 };
  const boards: number[][] = [];
  for (const item of log) {
    if (item.kind === 'metric') now[item.name] += item.delta;
    if (item.kind === 'wait') boards.push(names.map((n) => now[n]));
  }
  return boards;
}

describe('eigen — 사양 표 대조', () => {
  it('A 는 사양의 여덟 행렬이다', () => {
    const want: Record<number, number[]> = {
      [-8]: [1, 9, 9, 1],
      [-6]: [2, 8, 8, 2],
      [-4]: [3, 7, 7, 3],
      [-2]: [4, 6, 6, 4],
      2: [6, 4, 4, 6],
      4: [7, 3, 3, 7],
      6: [8, 2, 2, 8],
      8: [9, 1, 1, 9],
    };
    for (const s of data.smallEigLadder) expect(buildMatrix(10, s, [1, 1], [-1, 1])).toEqual(want[s]);
  });

  it('서른둘 조합이 사양 표와 같다', () => {
    for (const s of data.smallEigLadder) {
      data.startLadder.forEach((i) => {
        const b = computeBoard(data, s, i);
        const last = b.rows[b.rows.length - 1];
        const crossings = b.rows.filter((r) => r.crossed).length;
        const inside = b.rows.filter((r) => r.k > 0 && r.inside).length;
        const ratio = b.showRatio ? (last.tanRatio as number).toFixed(3) : '—';
        expect(`${b.first} · ${last.gap.toFixed(2)} · ${crossings} · ${inside} · ${ratio}`).toBe(SPEC[s][i]);
        // tan 비가 곱 열 번 모두 |λ₂| / 10
        if (b.showRatio) {
          for (const r of b.rows.slice(1)) expect(Math.abs((r.tanRatio as number) - Math.abs(s) / 10)).toBeLessThan(1e-9);
        }
        // 늘어난 배수는 10 이하
        for (const r of b.rows.slice(1)) expect(r.stretch as number).toBeLessThanOrEqual(10 + 1e-12);
      });
    }
  });

  it('기본 판의 걸음 값이 사양과 같다', () => {
    const b = computeBoard(data, 4, 1);
    const line = (k: number) => {
      const r = b.rows[k];
      return `${r.vx.toFixed(2)} ${r.vy.toFixed(2)} ${r.angle.toFixed(1)} ${r.gap.toFixed(2)} ${r.stretch === null ? '-' : r.stretch.toFixed(2)}`;
    };
    expect(line(0)).toBe('0.00 1.00 90.0 45.00 -');
    expect(line(1)).toBe('0.39 0.92 66.8 21.80 7.62');
    expect(line(5)).toBe('0.70 0.71 45.6 0.59 10.00');
    expect(line(10)).toBe('0.71 0.71 45.0 0.01 10.00');
    const neg = computeBoard(data, -6, 3);
    expect(neg.rows.map((r) => r.angle.toFixed(1)).slice(0, 3)).toEqual(['135.0', '315.0', '135.0']);
    expect((neg.rows[1].stretch as number).toFixed(2)).toBe('6.00');
  });
});

describe('eigen — IR', () => {
  it('서른둘 조합에서 stepsToAlign 이 algorithm 의 1° 안에 든 곱과 같다', () => {
    const tol = oneDegreeTol();
    let n = 0;
    for (const s of data.smallEigLadder) {
      for (const i of data.startLadder) {
        const b = computeBoard(data, s, i);
        const [sx, sy] = data.starts[i];
        const got = runIR(eigenImperativeIR, 'stepsToAlign', [b.a, sx, sy, 1, 1, data.products, tol]);
        expect(got).toBe(b.first);
        n++;
      }
    }
    expect(n).toBe(32);
  });

  it('사다리 밖 λ₂ 를 algorithm 이 던진다', async () => {
    for (const bad of [0, 10, 3]) {
      expect(() => buildMatrix(10, bad, [1, 1], [-1, 1])).toThrow();
      expect(() => computeBoard(data, bad, 1)).toThrow();
      await expect(run([{ type: 'smallEig', value: bad }])).rejects.toThrow();
    }
    await expect(run([{ type: 'startDir', value: 4 }])).rejects.toThrow();
  });
});

describe('eigen — 손잡이 · 계기 · phase', () => {
  it('사다리가 segments 와 같다', () => {
    const controls = (eigenFacet.blocks.controls as { controls: { name?: string; segments?: { value: number }[] }[] })
      .controls;
    const seg = (name: string) => controls.find((c) => c.name === name)?.segments?.map((x) => x.value);
    expect(seg('smallEig')).toEqual(data.smallEigLadder);
    expect(seg('startDir')).toEqual(data.startLadder);
    expect(data.smallEigLadder).toHaveLength(8);
    expect(data.smallEigLadder[0]).toBe(-8);
    expect(data.smallEigLadder[7]).toBe(8);
    expect(data.starts).toHaveLength(4);
  });

  it('계기 회차 — λ₂ 4 → −4 → 4', async () => {
    const log = await run([
      { type: 'smallEig', value: -4 },
      { type: 'smallEig', value: 4 },
    ]);
    expect(metricTotals(log)).toEqual([
      [10, 0, 6],
      [10, 10, 6],
      [10, 0, 6],
    ]);
  });

  it('계기 회차 — 출발 (0, 1) → (−1, 1) → (0, 1)', async () => {
    const log = await run([
      { type: 'startDir', value: 3 },
      { type: 'startDir', value: 1 },
    ]);
    expect(metricTotals(log)).toEqual([
      [10, 0, 6],
      [10, 0, 0],
      [10, 0, 6],
    ]);
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 이고, 판 머리 뒤에 sleep 이 온다', async () => {
    const log = await run([{ type: 'startDir', value: 0 }]);
    const seq = log.filter((x) => x.kind !== 'metric' && x.kind !== 'wait');
    const phases: string[][] = [[]];
    seq.forEach((item, i) => {
      if (item.kind !== 'emit') return;
      const type = item.event.type;
      if (type === 'board') {
        const next = seq[i + 1];
        expect(next.kind).toBe('sleep');
        if (next.kind === 'sleep') expect(next.ms).toBe(1400);
        expect(item.event.silent).toBe(true);
        if (phases[phases.length - 1].length > 0) phases.push([]);
      }
      if (type === 'origin' || type === 'product') {
        expect(item.event.silent).toBeFalsy();
        const prev = seq[i - 1];
        expect(prev.kind).toBe('emit');
        if (prev.kind === 'emit') {
          expect(prev.event.type).toBe('phase');
          phases[phases.length - 1].push((prev.event.payload as { phase: string }).phase);
        }
      }
    });
    expect(phases[0]).toEqual([
      'start', 'iterate', 'iterate', 'iterate', 'iterate', 'aligned', 'iterate', 'iterate', 'iterate', 'iterate', 'done',
    ]);
    expect(phases[1][0]).toBe('aligned');
    expect(phases[1]).toHaveLength(11);
    // 재생 — 판마다 sleep 열하나 (판 머리 뒤 하나 + 걸음 0..9 뒤)
    const sleeps = seq.filter((x) => x.kind === 'sleep').length;
    expect(sleeps).toBe(22);
  });
});

describe('eigen — 무대', () => {
  async function feed(): Promise<{ svg: SVGSVGElement; events: FacetRuntimeEvent[]; projector: ReturnType<typeof eigenProjector> }> {
    const container = document.createElement('div');
    const stage = mountView(eigenStageView, container, { config: {}, isInstant: () => true });
    const projector = eigenProjector({ stage }, { getSpeed: () => 1, t: (_k, fb, vars) => {
      let out = fb;
      for (const [k, v] of Object.entries(vars ?? {})) out = out.split(`{${k}}`).join(String(v));
      return out;
    } });
    const log = await run([]);
    const events = log.flatMap((x) => (x.kind === 'emit' ? [x.event] : []));
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('svg 없음');
    return { svg, events, projector };
  }

  it('첫 그림을 두 번 먹여도 요소 수가 같다 · 되짚기 뒤 같은 화면', async () => {
    const { svg, events, projector } = await feed();
    const board = events[0];
    projector.onEvent(board);
    const once = svg.querySelectorAll('*').length;
    projector.onEvent(board);
    expect(svg.querySelectorAll('*').length).toBe(once);
    for (const e of events.slice(1)) projector.onEvent(e);
    const full = svg.querySelectorAll('*').length;
    const text = svg.textContent;
    projector.onReset?.();
    expect(svg.querySelectorAll('*').length).toBe(0);
    for (const e of events) projector.onEvent(e);
    expect(svg.querySelectorAll('*').length).toBe(full);
    expect(svg.textContent).toBe(text);
    expect(text).toContain('gap 0.01°');
    expect(text).toContain('first product within 1°: 5');
    expect(text).toContain('compare |λ₂| ÷ λ₁ = 0.400');
  });

  it('걸음 0 에는 앞 판의 결론이 없다', async () => {
    const { svg, events, projector } = await feed();
    for (const e of events) projector.onEvent(e);
    projector.onEvent(events[0]);
    const text = svg.textContent ?? '';
    expect(text).not.toContain('within 1°:');
    expect(text).not.toContain('tan ratio');
  });

  it('config 만으로 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    expect(() => mountView(eigenStageView, container, { config: {} })).not.toThrow();
  });
});
