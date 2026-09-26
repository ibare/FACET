// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  backpropAlgorithm,
  backpropFacet,
  backpropImperativeIR,
  backpropProjector,
  backpropStageView,
  computeRound,
  ladderScales,
  type BackpropData,
} from '../src/index.js';

const data = backpropFacet.initialData as BackpropData;

type Slider = { action: string; segments: { value: number; label: string; default?: boolean }[] };
const sliders = (backpropFacet.blocks['controls'] as unknown as { controls: Slider[] }).controls.filter(
  (c) => (c as { widget?: string }).widget === 'segmented-slider',
);
const slider = (action: string): Slider => {
  const s = sliders.find((c) => c.action === action);
  if (!s) throw new Error(action);
  return s;
};

/** 사양 실측표 (sim backprop) */
const TABLE = {
  3: { bp: 21, nudge: 90, ratio: '4.3', off: 0, yHat: '0.594', loss: '0.1836', gaps: ['0.0405', '0.00405', '0.000405'], at: ['h1', 'wa'] },
  6: { bp: 42, nudge: 342, ratio: '8.1', off: 2, yHat: '-0.036', loss: '0.7638', gaps: ['0.0794', '0.00794', '0.000794'], at: ['h4', 'w2'] },
  12: { bp: 84, nudge: 1332, ratio: '15.9', off: 5, yHat: '0.480', loss: '0.2592', gaps: ['0.0794', '0.00794', '0.000794'], at: ['h4', 'w2'] },
  24: { bp: 168, nudge: 5256, ratio: '31.3', off: 10, yHat: '2.966', loss: '1.5594', gaps: ['0.0794', '0.00794', '0.000794'], at: ['h4', 'w2'] },
} as const;

/** 계기의 걸음별 값 (역전파 / 밀어 보기) */
const METERS: Record<number, [number, number][]> = {
  3: [[0, 0], [9, 0], [21, 0], [21, 36], [21, 63], [21, 90], [21, 90]],
  6: [[0, 0], [18, 0], [42, 0], [42, 126], [42, 234], [42, 342], [42, 342]],
  12: [[0, 0], [36, 0], [84, 0], [84, 468], [84, 900], [84, 1332], [84, 1332]],
  24: [[0, 0], [72, 0], [168, 0], [168, 1800], [168, 3528], [168, 5256], [168, 5256]],
};

describe('backprop — 데이터와 사다리', () => {
  it('사다리가 segments 값과 같고 기본값이 같다', () => {
    expect(slider('width').segments.map((s) => s.value)).toEqual(data.widths);
    expect(slider('nudge').segments.map((s) => s.value)).toEqual(data.nudges);
    expect(slider('width').segments.find((s) => s.default)?.value).toBe(data.width);
    expect(slider('nudge').segments.find((s) => s.default)?.value).toBe(data.nudge);
    expect(data.widths).toEqual([3, 6, 12, 24]);
    expect(data.nudges).toEqual([0.1, 0.01, 0.001]);
    expect(data.wa).toHaveLength(24);
    expect(data.wb).toHaveLength(24);
    expect(data.w2).toHaveLength(24);
    expect(Math.max(...data.widths)).toBe(data.w2.length);
  });

  it('판 하나가 20 초 안, 가장 얇은 걸음이 800ms 이상', () => {
    expect(7 * (data.stepMs + data.motionMs)).toBeLessThan(20_000);
    expect(data.stepMs).toBeGreaterThanOrEqual(800);
    expect(data.motionMs).toBeLessThanOrEqual(700);
  });
});

describe('backprop — 사양 표와 대조', () => {
  for (const w of data.widths) {
    data.nudges.forEach((eps, ei) => {
      it(`폭 ${w} · ε ${eps}`, () => {
        const r = computeRound(data, w, eps);
        const row = TABLE[w as keyof typeof TABLE];
        expect(r.bpMults).toBe(7 * w);
        expect(r.nudgeMults).toBe(3 * w * (1 + 3 * w));
        expect(r.bpMults).toBe(row.bp);
        expect(r.nudgeMults).toBe(row.nudge);
        expect(r.ratio.toFixed(1)).toBe(row.ratio);
        expect(r.on.filter((o) => !o).length).toBe(row.off);
        expect(r.yHat.toFixed(3)).toBe(row.yHat);
        expect(r.loss.toFixed(4)).toBe(row.loss);
        expect(r.maxGap.toFixed(r.gapDigits)).toBe(row.gaps[ei]);
        expect([r.units[r.maxUnit]!.id, r.maxWeight]).toEqual(row.at);
        expect(r.maxTies).toBe(0);
        // 꺼진 단위의 기울기는 부호 없는 0
        for (let j = 0; j < w; j++) {
          if (r.on[j]) continue;
          for (const g of [r.ga[j], r.gb[j], r.g2[j]]) expect(Object.is(g, 0)).toBe(true);
        }
        // 가장 작은 |z| 가 0.15 보다 크다 — 밀어도 꺾임을 건너지 않는다
        expect(Math.min(...r.z.map(Math.abs))).toBeGreaterThan(0.15);
        // 역전파 기울기 셋째 자리에 -0.000 이 없다
        for (const g of [...r.ga, ...r.gb, ...r.g2]) expect(g.toFixed(3)).not.toBe('-0.000');
      });
    });
  }

  it('어긋남이 ε 와 함께 정확히 열 배씩 준다', () => {
    for (const w of data.widths) {
      const g = data.nudges.map((e) => computeRound(data, w, e).maxGap);
      expect(Math.abs(g[0]! / g[1]! - 10)).toBeLessThan(1e-4);
      expect(Math.abs(g[1]! / g[2]! - 10)).toBeLessThan(1e-4);
    }
  });

  it('폭 3 의 역전파 기울기가 조각의 대조와 같고, 밀어 본 기울기가 sim 과 같다', () => {
    const r = computeRound(data, 3, 0.1);
    expect(r.ga.map((v) => v.toFixed(3))).toEqual(['-0.545', '0.303', '-0.242']);
    expect(r.g2.map((v) => v.toFixed(3))).toEqual(['-0.315', '-0.109', '-0.327']);
    expect(r.na.map((v) => v.toFixed(6))).toEqual(['-0.504900', '0.315500', '-0.234400']);
    expect(r.nb.map((v) => v.toFixed(6))).toEqual(['-0.312660', '0.186300', '-0.142560']);
    expect(r.n2.map((v) => v.toFixed(6))).toEqual(['-0.301600', '-0.107460', '-0.312660']);
  });

  it('폭 24 의 역전파 기울기가 sim 과 같다 (셋째 자리)', () => {
    const r = computeRound(data, 24, 0.1);
    const sim = [
      [1.589, 0.954, 0.918], [-0.883, -0.53, 0.318], [0.706, 0.424, 0.954], [-0.883, -0.53, 2.225],
      [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [1.236, 0.742, 0.494], [0, 0, 0],
      [0.353, 0.212, 1.342], [1.06, 0.636, 0.494], [1.236, 0.742, 0.424], [0.706, 0.424, 0.954],
      [0.53, 0.318, 0.494], [0, 0, 0], [0, 0, 0], [0, 0, 0], [1.413, 0.848, 1.554], [1.06, 0.636, 1.978],
      [0, 0, 0], [-0.53, -0.318, 0.459], [0, 0, 0], [1.413, 0.848, 1.589],
    ];
    sim.forEach(([a, b, c], j) => {
      expect(r.ga[j]!.toFixed(3)).toBe(a!.toFixed(3));
      expect(r.gb[j]!.toFixed(3)).toBe(b!.toFixed(3));
      expect(r.g2[j]!.toFixed(3)).toBe(c!.toFixed(3));
    });
  });

  it('눈금은 사다리 전체로 — 막대 5256 · 어긋남 0.08', () => {
    const s = ladderScales(data);
    expect(s.barMax).toBe(5256);
    expect(s.gapScale).toBeCloseTo(0.08, 12);
  });
});

// ── IR ↔ algorithm

const runGap = (w: number, eps: number, order: number[]) => {
  const wa = order.map((i) => data.wa[i]!);
  const wb = order.map((i) => data.wb[i]!);
  const w2 = order.map((i) => data.w2[i]!);
  const bufs = Array.from({ length: 6 }, () => new Array<number>(w).fill(0));
  const cnt = [0, 0];
  const gap = runIR(backpropImperativeIR, 'gradientGap', [wa, wb, w2, data.x1, data.x2, data.y, eps, ...bufs, cnt]);
  const [ga, gb, g2, na, nb, n2] = bufs as [number[], number[], number[], number[], number[], number[]];
  return { gap: gap as number, cnt, ga, gb, g2, na, nb, n2, wa, w2 };
};

/** 식까지 적힌 섞개 (test 전용) */
const shuffled = (n: number, seed: number): number[] => {
  const a = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

describe('backprop — IR 이 화면과 같은 답을 낸다', () => {
  it('모든 손잡이 조합에서 IR 과 algorithm 이 같다', () => {
    for (const w of data.widths) {
      for (const eps of data.nudges) {
        const order = Array.from({ length: w }, (_, i) => i);
        const ir = runGap(w, eps, order);
        const r = computeRound(data, w, eps);
        expect(ir.gap).toBe(r.maxGap);
        expect(ir.cnt).toEqual([r.bpMults, r.nudgeMults]);
        expect(ir.ga).toEqual(r.ga);
        expect(ir.gb).toEqual(r.gb);
        expect(ir.g2).toEqual(r.g2);
        expect(ir.na).toEqual(r.na);
        expect(ir.nb).toEqual(r.nb);
        expect(ir.n2).toEqual(r.n2);
        // 밀어 본 뒤 무게가 제자리
        expect(ir.wa).toEqual(order.map((i) => data.wa[i]));
        expect(ir.w2).toEqual(order.map((i) => data.w2[i]));
      }
    }
  });

  it('단위의 차례를 섞어도 기울기는 단위를 따라 옮기고 곱셈 수 · 가장 큰 어긋남의 표시는 같다', () => {
    for (const w of data.widths) {
      for (const eps of data.nudges) {
        const base = computeRound(data, w, eps);
        for (let s = 1; s <= 20; s++) {
          const order = shuffled(w, s * 7919 + w);
          const r = computeRound(data, w, eps, order);
          const ir = runGap(w, eps, order);
          expect(ir.gap).toBe(r.maxGap);
          expect(ir.cnt).toEqual([base.bpMults, base.nudgeMults]);
          expect(r.maxGap.toFixed(r.gapDigits)).toBe(base.maxGap.toFixed(base.gapDigits));
          expect(r.units[r.maxUnit]!.id).toBe(base.units[base.maxUnit]!.id);
          order.forEach((i, j) => {
            expect(ir.ga[j]).toBeCloseTo(base.ga[i]!, 12);
            expect(ir.g2[j]).toBeCloseTo(base.g2[i]!, 12);
            expect(ir.gb[j]).toBeCloseTo(base.gb[i]!, 12);
            expect(r.ga[j]!.toFixed(3)).toBe(base.ga[i]!.toFixed(3));
          });
        }
      }
    }
  });
});

// ── 알고리즘을 가짜 ctx 로 돌린다

type Log = { events: FacetRuntimeEvent[]; meters: Record<string, number>[] };

async function play(inputs: { type: string; value: number }[]): Promise<Log> {
  const events: FacetRuntimeEvent[] = [];
  const meters: Record<string, number>[] = [];
  const now: Record<string, number> = {};
  const queue = [...inputs];
  const ctx = {
    data,
    cancelled: false,
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (!e.silent) meters.push({ ...now });
    },
    metric(name: string, delta: number | 'inc') {
      if (typeof delta !== 'number') throw new Error('inc 는 쓰지 않는다');
      now[name] = (now[name] ?? 0) + delta;
    },
    async sleep() {
      return true;
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        ctx.cancelled = true;
        throw new Error('끝');
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await backpropAlgorithm(ctx as never);
  return { events, meters };
}

describe('backprop — 걸음 · 계기 · phase', () => {
  it('회차마다 계기가 사양의 걸음 값을 지난다 (폭 3 → 24 → 3)', async () => {
    const { events, meters } = await play([
      { type: 'width', value: 24 },
      { type: 'width', value: 3 },
    ]);
    const steps = events.filter((e) => !e.silent);
    expect(steps).toHaveLength(21);
    const rounds = [3, 24, 3];
    rounds.forEach((w, ri) => {
      for (let s = 0; s < 7; s++) {
        const m = meters[ri * 7 + s]!;
        expect([m['backprop-mults'], m['nudge-mults']]).toEqual(METERS[w]![s]);
      }
    });
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 다 (#0 은 phase 없음)', async () => {
    const { events } = await play([{ type: 'nudge', value: 0.001 }]);
    const want = [null, 'forward', 'backward', 'nudge', 'nudge', 'nudge', 'compare'];
    let step = 0;
    events.forEach((e, i) => {
      if (e.silent) return;
      const expected = want[step % 7];
      const prev = events[i - 1];
      if (expected === null) {
        expect(prev === undefined || !prev.silent).toBe(true);
      } else {
        expect(prev?.type).toBe('phase');
        expect((prev?.payload as { phase: string }).phase).toBe(expected);
      }
      step++;
    });
    expect(step).toBe(14);
  });

  it('사다리 밖 · 수가 아닌 입력은 흘린다', async () => {
    const { events } = await play([
      { type: 'width', value: 5 },
      { type: 'other', value: 3 },
      { type: 'nudge', value: 0.01 },
    ]);
    expect(events.filter((e) => e.type === 'net-drawn')).toHaveLength(2);
  });
});

// ── 무대

describe('backprop — 무대', () => {
  const mount = () => {
    const container = document.createElement('div');
    const stageInst = mountView(backpropStageView, container, {
      config: { type: 'backprop-stage' },
      initialData: data as unknown as Record<string, unknown>,
      locale: 'ko',
      t: makeTranslator('ko', backpropFacet.messages),
    });
    return { container, stageInst };
  };

  it('initialData 없이도 마운트에서 던지지 않는다', () => {
    const container = document.createElement('div');
    expect(() => mountView(backpropStageView, container, { config: {} })).not.toThrow();
  });

  it('걸음 0 을 두 번 먹여도 요소 수가 같고, 되감으면 앞 판의 결론이 남지 않는다', async () => {
    const { container, stageInst } = mount();
    const proj = backpropProjector({ stage: stageInst });
    proj.onInit?.(data);
    const { events } = await play([{ type: 'width', value: 24 }]);
    const first = events.find((e) => e.type === 'net-drawn')!;
    const count = () => container.querySelectorAll('*').length;
    await proj.onEvent(first);
    const n0 = count();
    for (const e of events) await proj.onEvent(e);
    expect(count()).toBe(n0);
    const txt = () => container.textContent ?? '';
    expect(txt()).toContain('가장 큰 어긋남: 0.0794');
    expect(txt()).toContain('곱셈의 배: ×31.3');
    proj.onReset?.();
    await proj.onEvent(first);
    expect(count()).toBe(n0);
    expect(txt()).not.toContain('가장 큰 어긋남');
    expect(txt()).not.toContain('-0.545');
    stageInst.destroy();
  });

  it('밀어 본 값은 글자로 두지 않는다 — 역전파 값만 셋째 자리로 뜬다', async () => {
    const { container, stageInst } = mount();
    const proj = backpropProjector({ stage: stageInst });
    proj.onInit?.(data);
    const { events } = await play([]);
    for (const e of events) await proj.onEvent(e);
    const txt = container.textContent ?? '';
    expect(txt).toContain('-0.545');
    expect(txt).not.toContain('-0.505');
    expect(txt).not.toContain('-0.5049');
    expect(txt).toContain('가장 큰 어긋남: 0.0405');
    expect(txt).toContain('자리: h1 · wa');
    stageInst.destroy();
  });
});
