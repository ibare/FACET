// @vitest-environment happy-dom
/**
 * 광선 추적 완제품 고유의 검수 — 사양 표 대조 · IR ↔ algorithm 전 조합 · TS 는 던지고 IR 은 표지 ·
 * 걸음 차례(init → sleep → phase → 걸음) · 회차별 계기 · 무대의 멱등 첫 그림과 판 머리의 결론 걷기.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { type FacetRuntimeEvent, mountView } from '@ffacet/core/runtime';
import {
  type RayTracingBaseData,
  type RayTracingBaseStage,
  fmt,
  rayTracingBaseAlgorithm,
  rayTracingBaseFacet,
  rayTracingBaseImperativeIR,
  rayTracingBaseProjector,
  rayTracingBaseStageView,
  readRayTracingBaseData,
  roundHalfAway,
  summarize,
  tracePixel,
  traceRow,
} from '../src/index.js';

const data = readRayTracingBaseData(rayTracingBaseFacet.initialData);

/** 사양 표 (measure.py) — n 별 */
const SPEC: Record<string, {
  p4in: string; p4out: string; maxBend: string; flipped: number; shadowed: number;
  p4x: string; p9x: string; bands: string; metric: [number, number, number];
}> = {
  '1': { p4in: '63.3', p4out: '63.3', maxBend: '0.0', flipped: 0, shadowed: 3, p4x: '-2.75', p9x: '2.75', bands: '2 3 3 4 4 5 5 6 6 7 7 8', metric: [0, 0, 3] },
  '1.2': { p4in: '63.3', p4out: '48.1', maxBend: '30.4', flipped: 2, shadowed: 3, p4x: '0.48', p9x: '-0.48', bands: '2 3 3 5 5 5 5 5 5 7 7 8', metric: [30, 2, 3] },
  '1.4': { p4in: '63.3', p4out: '39.7', maxBend: '47.3', flipped: 5, shadowed: 3, p4x: '2.49', p9x: '-2.49', bands: '2 3 3 6 5 5 5 5 4 7 7 8', metric: [47, 5, 3] },
  '1.6': { p4in: '63.3', p4out: '33.9', maxBend: '58.7', flipped: 5, shadowed: 4, p4x: '4.25', p9x: '-4.25', bands: '2 3 3 7 6 5 5 4 3 7 7 8', metric: [59, 5, 4] },
  '2': { p4in: '63.3', p4out: '26.5', maxBend: '73.6', flipped: 5, shadowed: 4, p4x: '7.94', p9x: '-7.94', bands: '2 3 3 9 6 5 5 4 1 7 7 8', metric: [74, 5, 4] },
};

function segmentsOf(): { value: number; default?: boolean }[] {
  const controls = (rayTracingBaseFacet.blocks.controls as { controls: unknown[] }).controls;
  const knob = controls.find((c) => (c as { action?: string }).action === 'refractive-index') as { segments: { value: number; default?: boolean }[] };
  return knob.segments;
}

function irRow(d: RayTracingBaseData, n: number) {
  const ray = [0, 0, 0, 0];
  const band = new Array<number>(d.row.count).fill(0);
  const lit = new Array<number>(d.row.count).fill(0);
  const ret = runIR(rayTracingBaseImperativeIR, 'renderRow', [
    d.eye.x, d.eye.y, d.row.left, d.row.right, d.row.count, d.row.y,
    d.glass.cx, d.glass.cy, d.glass.r, n,
    d.wall.y, d.wall.left, d.wall.bandWidth, d.wall.bands.length,
    d.light.x, d.light.y, ray, band, lit,
  ]);
  return { ret, band, lit };
}

describe('ray-tracing-base — 데이터와 사다리', () => {
  it('사다리 = segments, 기본값이 같다, 크기 단언', () => {
    const segs = segmentsOf();
    expect(segs.map((s) => s.value)).toEqual(data.indices);
    expect(segs.find((s) => s.default)?.value).toBe(data.defaultIndex);
    expect(segs.length).toBeLessThanOrEqual(9);
    expect(data.indices).toEqual([1.0, 1.2, 1.4, 1.6, 2.0]);
    expect(data.row.count).toBe(12);
    expect(data.wall.bands.length).toBe(9);
  });
});

describe('ray-tracing-base — 사양 표 대조 (n 별)', () => {
  for (const n of data.indices) {
    it(`n ${n}`, () => {
      const spec = SPEC[String(n)]!;
      const row = traceRow(data, n);
      const sum = summarize(row);
      expect(sum.glass).toBe(6);
      expect(row.filter((p) => p.firstHit === 'glass').map((p) => p.k + 1)).toEqual([4, 5, 6, 7, 8, 9]);
      const p4 = row[3]!;
      expect(fmt(p4.crossings[0]!.angleIn, 1)).toBe(spec.p4in);
      expect(fmt(p4.crossings[0]!.angleOut, 1)).toBe(spec.p4out);
      expect(fmt(sum.maxBend, 1)).toBe(spec.maxBend);
      expect(sum.flippedPairs).toBe(spec.flipped);
      expect(sum.shadowed).toBe(spec.shadowed);
      expect(fmt(p4.wallX, 2)).toBe(spec.p4x);
      expect(fmt(row[8]!.wallX, 2)).toBe(spec.p9x);
      expect(row.map((p) => p.band + 1).join(' ')).toBe(spec.bands);
      expect([roundHalfAway(sum.maxBend), sum.flippedPairs, sum.shadowed]).toEqual(spec.metric);
      // 10 · 11 · 12 는 모든 n 에서 막힌다
      expect(row.slice(9).every((p) => !p.lit)).toBe(true);
    });
  }

  it('곧은 자리는 n 과 무관하고 n 1.0 의 벽 x 와 같다', () => {
    const straight = traceRow(data, 1.0);
    expect(straight.map((p) => fmt(p.straightX, 2)).join(' ')).toBe('-6.05 -4.95 -3.85 -2.75 -1.65 -0.55 0.55 1.65 2.75 3.85 4.95 6.05');
    for (const p of straight) expect(Math.abs(p.wallX - p.straightX)).toBeLessThan(1e-9);
  });

  it('유리를 지난 픽셀마다 꺾인 각이 n 을 따라 엄격히 커진다', () => {
    for (let k = 3; k <= 8; k += 1) {
      const bends = data.indices.map((n) => tracePixel(data, k, n).bend);
      for (let i = 1; i < bends.length; i += 1) expect(bends[i]!).toBeGreaterThan(bends[i - 1]!);
    }
  });
});

describe('ray-tracing-base — IR ↔ algorithm', () => {
  for (const n of data.indices) {
    it(`n ${n} — renderRow 의 band · lit · 반환값, 픽셀마다 traceToWall 의 벽 x · 마지막 방향`, () => {
      const row = traceRow(data, n);
      const ir = irRow(data, n);
      expect(ir.ret).toBe(summarize(row).shadowed);
      expect(ir.band).toEqual(row.map((p) => p.band));
      expect(ir.lit).toEqual(row.map((p) => (p.lit ? 1 : 0)));
      for (const p of row) {
        const ray = [0, 0, 0, 0];
        const crossed = runIR(rayTracingBaseImperativeIR, 'traceToWall', [
          data.eye.x, data.eye.y, p.dir0.x, p.dir0.y, data.glass.cx, data.glass.cy, data.glass.r, n, data.wall.y, ray,
        ]);
        expect(crossed).toBe(p.crossings.length);
        expect(Math.abs(ray[0]! - p.wallX)).toBeLessThan(1e-9);
        expect(Math.abs(ray[2]! - p.dir.x)).toBeLessThan(1e-9);
        expect(Math.abs(ray[3]! - p.dir.y)).toBeLessThan(1e-9);
      }
    });
  }

  it('TS 는 던지고 IR 은 표지 — 벽 밖 띠 −1.0 · 전반사 refract 0', () => {
    // 벽을 오른쪽으로 옮겨 왼쪽 픽셀들이 벽 밖에 닿게 한다
    const shifted: RayTracingBaseData = { ...data, wall: { ...data.wall, left: -3 } };
    expect(() => traceRow(shifted, 1.6)).toThrow(/벽 밖/);
    const ir = irRow(shifted, 1.6);
    expect(ir.band[0]).toBe(-1);
    // 스치듯 안에서 나가는 광선 — cos i 0.1, η 1.6 → k < 0
    const ray = [0, 0, 0, 0];
    const cosi = 0.1;
    const sin = Math.sqrt(1 - cosi * cosi);
    expect(runIR(rayTracingBaseImperativeIR, 'refract', [sin, -cosi, 0, 1, 1.6, ray])).toBe(0);
    expect(runIR(rayTracingBaseImperativeIR, 'refract', [sin, -cosi, 0, 1, 1 / 1.6, ray])).toBe(1);
  });
});

type Rec = { kind: 'emit'; event: FacetRuntimeEvent } | { kind: 'sleep'; ms: number } | { kind: 'wait' } | { kind: 'metric'; name: string; delta: number };

async function drive(values: number[]) {
  const log: Rec[] = [];
  const totals = new Map<string, number>();
  const snapshots: Map<string, number>[] = [];
  const queue = values.map((v) => ({ type: 'refractive-index', payload: { value: v } }));
  let cancelled = false;
  let idle!: () => void;
  const done = new Promise<void>((r) => (idle = r));
  const ctx = {
    data: structuredClone(rayTracingBaseFacet.initialData),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      const d = delta === 'inc' ? 1 : delta;
      totals.set(name, (totals.get(name) ?? 0) + d);
      log.push({ kind: 'metric', name, delta: d });
    },
    async emit(event: FacetRuntimeEvent) {
      log.push({ kind: 'emit', event });
    },
    async sleep(ms: number) {
      log.push({ kind: 'sleep', ms });
      return !cancelled;
    },
    async waitForInput() {
      log.push({ kind: 'wait' });
      snapshots.push(new Map(totals));
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  void rayTracingBaseAlgorithm(ctx as never);
  await done;
  cancelled = true;
  return { log, snapshots };
}

describe('ray-tracing-base — 재생', () => {
  it('init → sleep(stepMs + motionMs) → phase → 걸음, 걸음마다 바로 앞이 제 phase', async () => {
    const { log } = await drive([]);
    const steps = ['rays-shot', 'rays-entered', 'rays-exited', 'shadow-rays', 'cells-shaded'];
    const phases = ['shoot', 'enter', 'exit', 'shadow', 'shade'];
    const emits = log.filter((r): r is Extract<Rec, { kind: 'emit' }> => r.kind === 'emit');
    expect(emits[0]!.event.type).toBe('scene-set');
    expect(emits[0]!.event.silent).toBe(true);
    const flow = log.filter((r) => r.kind !== 'metric');
    expect(flow[1]).toEqual({ kind: 'sleep', ms: data.stepMs + data.motionMs });
    let si = 0;
    for (let i = 0; i < flow.length; i += 1) {
      const r = flow[i]!;
      if (r.kind !== 'emit' || !steps.includes(r.event.type)) continue;
      expect(r.event.type).toBe(steps[si]);
      expect(r.event.silent).not.toBe(true);
      const before = flow[i - 1]!;
      expect(before.kind === 'emit' && before.event.type === 'phase' && (before.event.payload as { phase: string }).phase).toBe(phases[si]);
      si += 1;
    }
    expect(si).toBe(5);
    // 걸음 사이 sleep 은 stepMs — 재생 길이 2500 + 4 × 1800
    const sleeps = log.filter((r) => r.kind === 'sleep').map((r) => (r as { ms: number }).ms);
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(9700);
  });

  it('계기 — A → B → A 로 회차마다 사양 표', async () => {
    const seq = [1.0, 1.6, 2.0, 1.2, 1.4, 1.6];
    const { snapshots } = await drive(seq);
    const rounds = [data.defaultIndex, ...seq];
    expect(snapshots.length).toBe(rounds.length);
    rounds.forEach((n, i) => {
      const s = snapshots[i]!;
      expect([s.get('max-bend'), s.get('flipped-pairs'), s.get('shadowed-pixels')]).toEqual(SPEC[String(n)]!.metric);
    });
  });

  it('사다리 밖 값은 던진다', async () => {
    const ctx = {
      data: structuredClone(rayTracingBaseFacet.initialData),
      cancelled: false,
      metric() {},
      async emit() {},
      async sleep() {
        return true;
      },
      async waitForInput() {
        return { type: 'refractive-index', payload: { value: 1.33 } };
      },
      pollInput() {
        return null;
      },
    };
    await expect(rayTracingBaseAlgorithm(ctx as never)).rejects.toThrow(/사다리/);
  });
});

describe('ray-tracing-base — 무대', () => {
  async function collect(values: number[]): Promise<FacetRuntimeEvent[][]> {
    const { log } = await drive(values);
    const rounds: FacetRuntimeEvent[][] = [];
    for (const r of log) {
      if (r.kind !== 'emit') continue;
      if (r.event.type === 'scene-set') rounds.push([]);
      rounds[rounds.length - 1]!.push(r.event);
    }
    return rounds;
  }

  function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(rayTracingBaseStageView, container, { config: {}, isInstant: () => true }) as RayTracingBaseStage;
    const proj = rayTracingBaseProjector({ stage }, { getSpeed: () => 1, t: (_k, en, vars) => en.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? `{${k}}`)) });
    return { container, stage, proj };
  }

  it('config 만 주고 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    expect(() => mountView(rayTracingBaseStageView, container, { config: {} })).not.toThrow();
  });

  it('첫 그림을 두 번 먹여도 요소 수가 같다 (되짚기 멱등)', async () => {
    const [round] = await collect([]);
    const { stage, proj } = mount();
    proj.onEvent(round![0]!);
    const once = stage.countElements();
    proj.onEvent(round![0]!);
    expect(stage.countElements()).toBe(once);
    proj.onReset?.();
    proj.onEvent(round![0]!);
    expect(stage.countElements()).toBe(once);
  });

  it('새 판 걸음 0 에 앞 판의 결론(광선 · 점 · 그림자 · 칸 색 · 캡션 수)이 남지 않는다', async () => {
    const rounds = await collect([2.0]);
    const { container, stage, proj } = mount();
    const empty = (() => {
      proj.onEvent(rounds[0]![0]!);
      return stage.countElements();
    })();
    for (const e of rounds[0]!.slice(1)) proj.onEvent(e);
    expect(stage.countElements()).toBeGreaterThan(empty);
    expect(container.textContent).toContain('bands 2 3 3 7 6 5 5 4 3 7 7 8');
    proj.onEvent(rounds[1]![0]!);
    expect(stage.countElements()).toBe(empty);
    expect(container.textContent).not.toContain('bands');
    expect(container.textContent).toContain('n 2.0');
    for (const e of rounds[1]!.slice(1)) proj.onEvent(e);
    expect(container.textContent).toContain('bands 2 3 3 9 6 5 5 4 1 7 7 8');
  });

  it('걸음 2 · 3 캡션은 셈한 꺾임으로 갈린다 — n 1.6 은 꺾인다, n 1.0 은 곧게', async () => {
    const rounds = await collect([1.0]);
    const captionAt = (round: FacetRuntimeEvent[], type: string): string => {
      const { container, proj } = mount();
      for (const e of round) {
        proj.onEvent(e);
        if (e.type === type) break;
      }
      return container.textContent ?? '';
    };
    // 첫 판 = 기본 1.6, 둘째 판 = 1.0
    expect(captionAt(rounds[0]!, 'rays-entered')).toContain('Entering the glass, each ray bends toward the normal');
    expect(captionAt(rounds[0]!, 'rays-exited')).toContain('Leaving the glass, each ray bends away from the normal and slides along the wall');
    expect(captionAt(rounds[1]!, 'rays-entered')).toContain('Entering the glass, the rays go straight on without bending');
    expect(captionAt(rounds[1]!, 'rays-entered')).toContain('incidence 63.3° → refraction 63.3°');
    expect(captionAt(rounds[1]!, 'rays-exited')).toContain('Leaving the glass without bending, the rays land on their straight-line spots');
    expect(captionAt(rounds[1]!, 'rays-exited')).toContain('largest bend 0.0°');
    // payload 의 판정 — 다섯 n 모두 1.0 에서만 곧다
    for (const n of data.indices) {
      const sum = summarize(traceRow(data, n));
      expect(roundHalfAway(sum.maxBend * 10) !== 0).toBe(n !== 1.0);
    }
  });

  it('모르는 이벤트는 던진다', () => {
    const { proj } = mount();
    expect(() => proj.onEvent({ type: 'mystery' })).toThrow(/모르는 이벤트/);
  });
});
