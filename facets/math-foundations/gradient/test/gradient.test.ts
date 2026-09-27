// @vitest-environment happy-dom
import { runIR } from '@ffacet/ir-interpreter';
import { type FacetRuntimeEvent, mountView } from '@ffacet/core/runtime';
import { describe, expect, it } from 'vitest';
import {
  type GradientData,
  cellOf,
  dirSlope,
  flattenTerms,
  fmt,
  gradientAlgorithm,
  gradientFacet,
  gradientImperativeIR,
  gradientProjector,
  gradientStageView,
  sectionTicks,
} from '../src/index.js';

const data = gradientFacet.initialData as unknown as GradientData;

// 사양 실측표 (sim) — 점 × 방향의 방향 기울기 글자
const TABLE: Record<string, { f: number; grad: [number, number]; mag: string; angle: string; s: string[] }> = {
  '2,1': { f: 7, grad: [4, 6], mag: '7.21', angle: '56.3', s: ['4.00', '7.07', '6.00', '1.41', '−4.00', '−7.07', '−6.00', '−1.41'] },
  '3,0': { f: 9, grad: [6, 0], mag: '6.00', angle: '0.0', s: ['6.00', '4.24', '0.00', '−4.24', '−6.00', '−4.24', '0.00', '4.24'] },
  '0,1': { f: 3, grad: [0, 6], mag: '6.00', angle: '90.0', s: ['0.00', '4.24', '6.00', '4.24', '0.00', '−4.24', '−6.00', '−4.24'] },
  '-1,1': { f: 4, grad: [-2, 6], mag: '6.32', angle: '108.4', s: ['−2.00', '2.83', '6.00', '5.66', '2.00', '−2.83', '−6.00', '−5.66'] },
  '1,-1': { f: 4, grad: [2, -6], mag: '6.32', angle: '288.4', s: ['2.00', '−2.83', '−6.00', '−5.66', '−2.00', '2.83', '6.00', '5.66'] },
};
const ANGLES = [
  [56, 11, 34, 79, 124, 169, 146, 101],
  [0, 45, 90, 135, 180, 135, 90, 45],
  [90, 45, 0, 45, 90, 135, 180, 135],
  [108, 63, 18, 27, 72, 117, 162, 153],
  [72, 117, 162, 153, 108, 63, 18, 27],
];

type Log = { kind: 'emit'; event: FacetRuntimeEvent } | { kind: 'sleep'; ms: number } | { kind: 'metric'; name: string; delta: number };

/** 가짜 reactive ctx — sleep 은 곧장 참, 입력은 큐에서, 큐가 비면 취소 */
async function drive(inputs: { type: string; value: number }[]) {
  const log: Log[] = [];
  const metrics = new Map<string, number>();
  const snapshots: Record<string, number>[] = [];
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      log.push({ kind: 'emit', event });
    },
    metric(name: string, delta: number | 'inc') {
      const d = delta === 'inc' ? 1 : delta;
      metrics.set(name, (metrics.get(name) ?? 0) + d);
      log.push({ kind: 'metric', name, delta: d });
    },
    async sleep(ms: number) {
      log.push({ kind: 'sleep', ms });
      return true;
    },
    async waitForInput() {
      snapshots.push(Object.fromEntries(metrics));
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        return { type: 'none' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await gradientAlgorithm(ctx as never);
  return { log, snapshots };
}

describe('gradient — 셈', () => {
  it('IR dirSlope 가 40 조합 모두 algorithm 과 같다 (항 차례를 뒤집어도)', () => {
    const flat = flattenTerms(data.terms);
    const flatRev = flattenTerms([...data.terms].reverse());
    for (let pi = 0; pi < data.points.length; pi++) {
      for (let di = 0; di < data.directions.length; di++) {
        const cell = cellOf(data, pi, di);
        const [dx, dy] = data.directions[di] as [number, number];
        for (const f of [flat, flatRev]) {
          const ir = runIR(gradientImperativeIR, 'dirSlope', [f, cell.p[0], cell.p[1], dx, dy, data.delta]) as number;
          expect(Math.abs(ir - cell.s)).toBeLessThan(1e-9);
          expect(Math.abs(dirSlope(f, cell.p[0], cell.p[1], dx, dy, data.delta) - cell.s)).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('사양 실측표와 같다 — f · ∇f · |∇f| · 각 · 방향 기울기 글자', () => {
    for (let pi = 0; pi < data.points.length; pi++) {
      const [x, y] = data.points[pi] as [number, number];
      const row = TABLE[`${x},${y}`];
      if (!row) throw new Error(`표에 없는 점 ${x},${y}`);
      for (let di = 0; di < 8; di++) {
        const cell = cellOf(data, pi, di);
        expect(cell.f).toBe(row.f);
        expect(cell.grad).toEqual(row.grad);
        expect(fmt(cell.mag, 2)).toBe(row.mag);
        expect(fmt(cell.angle, 1)).toBe(row.angle);
        expect(fmt(cell.s, 2)).toBe(row.s[di]);
        expect(Math.round(cell.between)).toBe(ANGLES[pi]?.[di]);
        // 어느 칸도 |∇f| 를 넘지 않는다
        expect(Math.abs(cell.s)).toBeLessThanOrEqual(cell.mag + 1e-9);
      }
    }
  });

  it('0° 칸 = ∂f/∂x · 90° 칸 = ∂f/∂y, 표시 0.00 네 칸에 빼기 기호가 없다', () => {
    for (let pi = 0; pi < data.points.length; pi++) {
      const c0 = cellOf(data, pi, 0);
      const c90 = cellOf(data, pi, 2);
      expect(c0.axis).toBe('x');
      expect(c90.axis).toBe('y');
      expect(Math.abs(c0.s - c0.grad[0])).toBeLessThan(1e-9);
      expect(Math.abs(c90.s - c90.grad[1])).toBeLessThan(1e-9);
      for (const di of [1, 3, 4, 5, 6, 7]) expect(cellOf(data, pi, di).axis).toBe('none');
    }
    for (const [pi, di] of [[1, 2], [1, 6], [2, 0], [2, 4]] as const) {
      const text = fmt(cellOf(data, pi, di).s, 2);
      expect(text).toBe('0.00');
      expect(text).not.toContain('−');
      expect(text).not.toContain('-');
    }
  });

  it('사다리 — 정수 쌍과 도가 같은 방향, segments 와 같다, 점 다섯 · 방향 여덟', () => {
    expect(data.points).toHaveLength(5);
    expect(data.directions).toHaveLength(8);
    expect(data.dirLadder).toHaveLength(8);
    expect(data.dirLadder[7]).toBe(315);
    data.directions.forEach(([dx, dy], i) => {
      let a = (Math.atan2(dy as number, dx as number) * 180) / Math.PI;
      if (a < 0) a += 360;
      expect(Math.abs(a - (data.dirLadder[i] as number))).toBeLessThan(1e-9);
    });
    const controls = (gradientFacet.blocks.controls as { controls: { action?: string; segments?: { value: number }[] }[] }).controls;
    const seg = (action: string) => controls.find((c) => c.action === action)?.segments?.map((s) => s.value);
    expect(seg('direction')).toEqual(data.dirLadder);
    expect(seg('point')).toEqual(data.points.map((_, i) => i));
  });
});

describe('gradient — 단면 눈금', () => {
  it('눈금 글자는 sectionT 에서 온다', () => {
    expect(sectionTicks(data).map((tk) => tk.text)).toEqual(['−1', '0', '1']);
    expect(sectionTicks({ ...data, sectionT: [-0.5, 2] }).map((tk) => tk.text)).toEqual(['−0.5', '0', '2']);
    expect(sectionTicks({ ...data, sectionT: [0, 1] }).map((tk) => [tk.text, tk.origin])).toEqual([['0', true], ['1', false]]);
  });
});

describe('gradient — 걸음과 계기', () => {
  it('회차별 계기 — direction 0 → 90 → 0', async () => {
    const { snapshots } = await drive([
      { type: 'direction', value: 90 },
      { type: 'direction', value: 0 },
    ]);
    expect(snapshots.slice(0, 3)).toEqual([
      { 'point-level': 7, 'angle-to-gradient': 56 },
      { 'point-level': 7, 'angle-to-gradient': 34 },
      { 'point-level': 7, 'angle-to-gradient': 56 },
    ]);
  });

  it('회차별 계기 — point 0 → 1 → 0', async () => {
    const { snapshots } = await drive([
      { type: 'point', value: 1 },
      { type: 'point', value: 0 },
    ]);
    expect(snapshots.slice(0, 3)).toEqual([
      { 'point-level': 7, 'angle-to-gradient': 56 },
      { 'point-level': 9, 'angle-to-gradient': 0 },
      { 'point-level': 7, 'angle-to-gradient': 56 },
    ]);
  });

  it('사다리 밖 값은 던진다', async () => {
    await expect(drive([{ type: 'direction', value: 30 }])).rejects.toThrow();
    await expect(drive([{ type: 'point', value: 5 }])).rejects.toThrow();
  });

  it('init → sleep → 첫 phase, 걸음 이벤트마다 바로 앞 phase', async () => {
    const { log } = await drive([]);
    const seq = log
      .filter((l) => l.kind !== 'metric')
      .map((l) =>
        l.kind === 'sleep'
          ? 'sleep'
          : l.event.type === 'phase'
            ? `phase:${(l.event.payload as { phase: string }).phase}`
            : l.event.type,
      );
    expect(seq).toEqual(['init', 'sleep', 'phase:unit', 'cut', 'sleep', 'phase:diff', 'slope', 'sleep', 'gradient']);
    const sleeps = log.filter((l): l is { kind: 'sleep'; ms: number } => l.kind === 'sleep');
    expect(sleeps.reduce((a, s) => a + s.ms, 0)).toBe(7500);
    // init · phase 만 silent
    for (const l of log) {
      if (l.kind !== 'emit') continue;
      const silent = (l.event as { silent?: boolean }).silent === true;
      expect(silent).toBe(l.event.type === 'init' || l.event.type === 'phase');
    }
  });
});

describe('gradient — 무대', () => {
  it('첫 그림이 멱등이고 되짚기(reset) 뒤에도 요소 수가 같다', async () => {
    const { log } = await drive([]);
    const events = log.filter((l): l is { kind: 'emit'; event: FacetRuntimeEvent } => l.kind === 'emit').map((l) => l.event);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(gradientStageView, container, { config: { type: 'gradient-stage' }, initialData: data as never, locale: 'ko', isInstant: () => true });
    const phases: (string | null)[] = [];
    const codePanel = { highlightPhase: (p: string | null) => phases.push(p), destroy() {} };
    const projector = gradientProjector({ stage, codePanel }, { getSpeed: () => 1, t: (_k, en) => en });
    const init = events[0] as FacetRuntimeEvent;
    await projector.onEvent(init);
    const once = container.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    for (const e of events.slice(1)) await projector.onEvent(e);
    const full = container.querySelectorAll('*').length;
    projector.onReset?.();
    for (const e of events) await projector.onEvent(e);
    expect(container.querySelectorAll('*').length).toBe(full);
    expect(phases[0]).toBeNull();
    expect(() => projector.onEvent({ type: 'nope', payload: {} } as FacetRuntimeEvent)).toThrow();
    stage.destroy();
  });
});
