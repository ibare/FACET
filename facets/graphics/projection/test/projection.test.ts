// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getAlgorithmMechanismKind, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  computeRound,
  projectionAlgorithm,
  projectionFacet,
  projectionImperativeIR,
  projectionIRArgs,
  projectionProjector,
  projectionStageView,
  readProjectionData,
  registerProjection,
  type ProjectionData,
  type ProjectionMode,
} from '../src/index.js';

const data = readProjectionData(projectionFacet.initialData);
const MODES: ProjectionMode[] = ['perspective', 'orthographic'];
const f2 = (x: number) => x.toFixed(2);
const f3 = (x: number) => x.toFixed(3);

// 사양 실측표 (measure.py)
const TABLE: Record<string, { front: string; back: string; behind: number; kcd: string; w: Record<ProjectionMode, [string, string, string, number]> }> = {
  '12': { front: '11.50..12.50', back: '15.50..16.50', behind: 0, kcd: '12·0·0', w: { perspective: ['0.151', '0.112', '1.348', 135], orthographic: ['0.500', '0.500', '1.000', 100] } },
  '8': { front: '7.50..8.50', back: '11.50..12.50', behind: 0, kcd: '12·0·0', w: { perspective: ['0.231', '0.151', '1.533', 153], orthographic: ['0.500', '0.500', '1.000', 100] } },
  '5': { front: '4.50..5.50', back: '8.50..9.50', behind: 0, kcd: '12·0·0', w: { perspective: ['0.385', '0.204', '1.889', 189], orthographic: ['0.500', '0.500', '1.000', 100] } },
  '3': { front: '2.50..3.50', back: '6.50..7.50', behind: 0, kcd: '12·0·0', w: { perspective: ['0.693', '0.266', '2.600', 260], orthographic: ['0.500', '0.500', '1.000', 100] } },
  '2': { front: '1.50..2.50', back: '5.50..6.50', behind: 0, kcd: '12·0·0', w: { perspective: ['1.155', '0.315', '3.667', 367], orthographic: ['0.500', '0.500', '1.000', 100] } },
  '1.4': { front: '0.90..1.90', back: '4.90..5.90', behind: 4, kcd: '4·4·4', w: { perspective: ['1.732', '0.353', '4.900', 490], orthographic: ['0.500', '0.500', '1.000', 100] } },
};

function irArgs(d: number, m: ProjectionMode, first: number | null, reverse = false) {
  const a = projectionIRArgs(data, d, m);
  let ea = a.ea;
  let eb = a.eb;
  if (reverse) {
    ea = [...a.eb].reverse();
    eb = [...a.ea].reverse();
  }
  const head = [a.vx, a.vy, a.vz];
  const tail = [ea, eb, a.eye, a.target, a.up, a.focal, a.near, a.half, a.persp, a.axes, a.seg];
  return first === null ? [...head, ...tail] : [...head, first, ...tail];
}

describe('projection — 자료 · 사다리', () => {
  it('사다리가 손잡이 구간과 같다', () => {
    const controls = (projectionFacet.blocks.controls as { controls: { name?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const dist = controls.find((c) => c.name === 'distance');
    const proj = controls.find((c) => c.name === 'projection');
    expect(dist?.segments?.map((s) => s.value)).toEqual(data.distances);
    expect(data.distances).toEqual([12, 8, 5, 3, 2, 1.4]);
    expect(dist?.segments?.find((s) => s.default)?.value).toBe(data.startDistance);
    expect(proj?.segments?.map((s) => s.value)).toEqual(data.projections.map((_, i) => i));
    expect(data.projections).toEqual(['perspective', 'orthographic']);
    expect(data.projections[proj?.segments?.find((s) => s.default)?.value ?? -1]).toBe(data.startProjection);
    expect(data.edges).toHaveLength(12);
    expect(data.cornerSigns).toHaveLength(8);
  });
  it('mechanismKind 는 reactive', () => {
    registerProjection();
    expect(getAlgorithmMechanismKind('projection')).toBe('reactive');
  });
});

describe('projection — 사양 표 대조', () => {
  for (const d of data.distances) {
    for (const m of MODES) {
      it(`d ${d} · ${m}`, () => {
        const row = TABLE[String(d)];
        if (!row) throw new Error(`표에 ${d} 가 없다`);
        const r = computeRound(data, d, m);
        const [front, back] = r.boxes;
        if (!front || !back) throw new Error('상자 둘');
        expect(`${f2(front.depthMin)}..${f2(front.depthMax)}`).toBe(row.front);
        expect(`${f2(back.depthMin)}..${f2(back.depthMax)}`).toBe(row.back);
        expect(front.behind + back.behind).toBe(row.behind);
        expect(`${front.kept}·${front.cut}·${front.dropped}`).toBe(row.kcd);
        expect(`${back.kept}·${back.cut}·${back.dropped}`).toBe('12·0·0');
        const [fw, bw, ratio, pct] = row.w[m];
        expect(f3(front.width)).toBe(fw);
        expect(f3(back.width)).toBe(bw);
        expect(f3(r.ratio)).toBe(ratio);
        expect(r.pct).toBe(pct);
        // look-at 세 축
        expect(r.axes.right.map(f3)).toEqual(['1.000', '0.000', '0.000']);
        expect(r.axes.up.map(f3)).toEqual(['0.000', '1.000', '0.000']);
        expect(r.axes.forward.map(f3)).toEqual(['0.000', '0.000', '-1.000']);
      });
    }
  }
  it('d 1.4 의 새 꼭짓점 넷 — 카메라 (±0.50, ±0.50, −1.00), 화면 원근 ±0.866 · 직교 ±0.250', () => {
    for (const [m, s] of [['perspective', '0.866'], ['orthographic', '0.250']] as [ProjectionMode, string][]) {
      const front = computeRound(data, 1.4, m).boxes[0];
      if (!front) throw new Error('앞 상자');
      const cut = front.edges.filter((e) => e.status === 'cut');
      expect(cut).toHaveLength(4);
      for (const e of cut) {
        const q = -e.camFrom[2] < -e.camTo[2] ? e.camFrom : e.camTo;
        expect(Math.abs(q[0]).toFixed(2)).toBe('0.50');
        expect(Math.abs(q[1]).toFixed(2)).toBe('0.50');
        expect(q[2].toFixed(2)).toBe('-1.00');
      }
      expect(f3(front.bounds.xMax)).toBe(s);
      expect(f3(-front.bounds.xMin)).toBe(s);
    }
  });
});

describe('projection — IR 과 algorithm 은 같은 답', () => {
  for (const d of data.distances) {
    for (const m of MODES) {
      it(`d ${d} · ${m}`, () => {
        const r = computeRound(data, d, m);
        const ratio = runIR(projectionImperativeIR, 'widthRatio', irArgs(d, m, null)) as number;
        expect(Math.abs(ratio - r.ratio)).toBeLessThan(1e-12);
        const fw = runIR(projectionImperativeIR, 'boxWidth', irArgs(d, m, 0)) as number;
        const bw = runIR(projectionImperativeIR, 'boxWidth', irArgs(d, m, 8)) as number;
        expect(Math.abs(fw - (r.boxes[0]?.width ?? NaN))).toBeLessThan(1e-12);
        expect(Math.abs(bw - (r.boxes[1]?.width ?? NaN))).toBeLessThan(1e-12);
        const rev = runIR(projectionImperativeIR, 'widthRatio', irArgs(d, m, null, true)) as number;
        expect(Math.abs(rev - r.ratio)).toBeLessThan(1e-12);
      });
    }
  }
  it('깊이가 near 와 같은 꼭짓점 — TS 는 던지고 IR 은 −1', () => {
    // 눈 1.5 이면 앞 상자의 z = +0.5 꼭짓점 깊이가 1.0 = near
    expect(() => computeRound(data, 1.5, 'perspective')).toThrow();
    expect(runIR(projectionImperativeIR, 'widthRatio', irArgs(1.5, 'perspective', null))).toBe(-1);
  });
  it('모르는 투영 번호 — IR 은 −1', () => {
    const args = irArgs(5, 'perspective', 0);
    args[12] = 2;
    expect(runIR(projectionImperativeIR, 'boxWidth', args)).toBe(-1);
  });
});

type Rec = { kind: 'wait' } | { kind: 'emit'; e: FacetRuntimeEvent } | { kind: 'sleep'; ms: number } | { kind: 'metric'; name: string; delta: number };

async function play(inputs: { type: string; payload: unknown }[]): Promise<Rec[]> {
  const log: Rec[] = [];
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: projectionFacet.initialData as unknown as ProjectionData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      log.push({ kind: 'emit', e });
    },
    metric(name: string, delta: number | 'inc') {
      if (delta === 'inc') throw new Error('inc 를 쓰지 않는다');
      log.push({ kind: 'metric', name, delta });
    },
    async sleep(ms: number) {
      log.push({ kind: 'sleep', ms });
      return true;
    },
    async waitForInput() {
      log.push({ kind: 'wait' });
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        return { type: 'end' };
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await projectionAlgorithm(ctx as never);
  return log;
}

describe('projection — 한 판의 걸음', () => {
  it('판 머리 → sleep → phase → 걸음, 걸음마다 바로 앞이 그 phase', async () => {
    const log = await play([]);
    const kinds = log.filter((r) => r.kind === 'emit' || r.kind === 'sleep');
    const first = kinds[0];
    expect(first?.kind === 'emit' && first.e.type === 'round' && first.e.silent === true).toBe(true);
    expect(kinds[1]).toEqual({ kind: 'sleep', ms: data.stepMs + data.motionMs });
    const expected: [string, string][] = [
      ['view', 'camera'],
      ['clip', 'clip'],
      ['project', 'project'],
      ['compare', 'compare'],
    ];
    const emits = log.flatMap((r) => (r.kind === 'emit' ? [r.e] : []));
    for (const [ph, step] of expected) {
      const i = emits.findIndex((e) => e.type === step);
      expect(i).toBeGreaterThan(0);
      const prev = emits[i - 1];
      expect(prev?.type).toBe('phase');
      expect((prev?.payload as { phase: string }).phase).toBe(ph);
      expect(emits[i]?.silent).toBeFalsy();
    }
    // 걸음 사이 sleep 넷 (마지막 걸음 뒤는 입력 대기) — 재생 10.0 초
    const sleeps = log.flatMap((r) => (r.kind === 'sleep' ? [r.ms] : []));
    expect(sleeps).toEqual([2500, 2500, 2500, 2500]);
    // 기본값 d 5 · 원근 의 걸음 값
    const cam = emits.find((e) => e.type === 'camera')?.payload as { boxes: { depthMin: number; depthMax: number }[] };
    expect(cam.boxes.map((b) => `${f2(b.depthMin)}..${f2(b.depthMax)}`)).toEqual(['4.50..5.50', '8.50..9.50']);
    const clip = emits.find((e) => e.type === 'clip')?.payload as Record<string, number>;
    expect([clip.behind, clip.cut, clip.dropped, clip.added]).toEqual([0, 0, 0, 0]);
    const proj = emits.find((e) => e.type === 'project')?.payload as { boxes: { width: number }[] };
    expect(proj.boxes.map((b) => f3(b.width))).toEqual(['0.385', '0.204']);
    const cmp = emits.find((e) => e.type === 'compare')?.payload as { ratio: number; pct: number };
    expect([f3(cmp.ratio), cmp.pct]).toEqual(['1.889', 189]);
  });

  it('계기는 회차마다 — 5 → 1.4 → 5 원근, 그리고 1.4 직교', async () => {
    const log = await play([
      { type: 'distance', payload: { value: 1.4 } },
      { type: 'distance', payload: { value: 5 } },
      { type: 'distance', payload: { value: 1.4 } },
      { type: 'projection', payload: { value: 1 } },
    ]);
    const totals: [number, number][] = [];
    const cur = { 'cut-edges': 0, 'width-ratio-pct': 0 } as Record<string, number>;
    // 한 판이 끝나 입력을 기다리는 자리에서 잰다
    for (const r of log) {
      if (r.kind === 'metric') cur[r.name] = (cur[r.name] ?? 0) + r.delta;
      if (r.kind === 'wait') totals.push([cur['cut-edges'] ?? NaN, cur['width-ratio-pct'] ?? NaN]);
    }
    expect(totals).toEqual([
      [0, 189],
      [4, 490],
      [0, 189],
      [4, 490],
      [4, 100],
    ]);
    // 판 머리마다 두 계기 모두 보낸다 (처음은 차이 0)
    const firstTwo = log.filter((r) => r.kind === 'metric').slice(0, 2);
    expect(firstTwo).toEqual([
      { kind: 'metric', name: 'cut-edges', delta: 0 },
      { kind: 'metric', name: 'width-ratio-pct', delta: 0 },
    ]);
  });

  it('사다리 밖 값은 던진다 · 남의 입력은 흘린다', async () => {
    await expect(play([{ type: 'distance', payload: { value: 7 } }])).rejects.toThrow();
    await expect(play([{ type: 'projection', payload: { value: 2 } }])).rejects.toThrow();
    const log = await play([{ type: 'other', payload: {} }]);
    expect(log.filter((r) => r.kind === 'emit' && r.e.type === 'round')).toHaveLength(1);
  });
});

describe('projection — 무대', () => {
  it('판 머리를 두 번 먹여도 요소 수가 같고, onReset 이 무대를 비운다', async () => {
    const log = await play([]);
    const emits = log.flatMap((r) => (r.kind === 'emit' ? [r.e] : []));
    const container = document.createElement('div');
    const stage = mountView(projectionStageView, container, { config: {} });
    const proj = projectionProjector({ stage }, { getSpeed: () => 1, t: (_k, en) => en });
    const round = emits[0];
    if (!round) throw new Error('판 머리');
    await proj.onEvent(round);
    const n1 = container.querySelectorAll('*').length;
    await proj.onEvent(round);
    expect(container.querySelectorAll('*').length).toBe(n1);
    for (const e of emits.slice(1)) await proj.onEvent(e);
    const full = container.querySelectorAll('*').length;
    expect(full).toBeGreaterThan(n1);
    expect(container.textContent).toContain('1.889');
    proj.onReset?.();
    await proj.onEvent(round);
    expect(container.querySelectorAll('*').length).toBe(n1);
    expect(container.textContent).not.toContain('1.889');
    stage.destroy();
  });

  it('config 만으로 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    const stage = mountView(projectionStageView, container, { config: {} });
    expect(container.querySelector('svg')).not.toBeNull();
    stage.destroy();
  });
});
