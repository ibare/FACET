// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  ReactiveInputEvent,
  ViewInstance,
} from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  registerBuiltinViews,
  runFacet,
} from '@ffacet/core/runtime';
import {
  measureLayout,
  registerTsne,
  runTsne,
  tsne,
  tsneFacet,
  tsneIRs,
  tsneProjector,
  type LayoutMeasure,
  type LedgerRow,
  type PanelState,
  type TsneData,
} from '../src/index.js';

/**
 * 사양의 대조.
 *
 * 호스트가 낸 값과는 자리가 다르다 — 씨앗 20260910 에서는 퍼플렉시티 15 의
 * 갈림이 5.50 으로 문턱을 겨우 넘었고, 여기서 쓰는 씨앗 27 에서는 19.17 이
 * 나온다. 무엇이 바뀌지 않는지가 이 표의 핵심이다: 5 는 부서지고 30 은
 * 흐려지고 15 만 깨끗이 갈리며, 그 깨끗한 그림의 무리 사이 비가 1.05 다.
 */
const SPEC = {
  source: { gapAB: 3.45, gapBC: 7.52, ratio: 2.18, spreads: [0.61, 0.65, 0.62], separation: 5.3 },
  p5: { gapAB: 477.71, gapBC: 62.94, ratio: 0.13, separation: 0.26, verdict: 'broken' },
  p15: { gapAB: 197.53, gapBC: 207.61, ratio: 1.05, separation: 19.17, verdict: 'clean' },
  p30: { gapAB: 26.38, gapBC: 41.17, ratio: 1.56, separation: 2.95, verdict: 'blurred' },
} as const;

function freshData(): TsneData {
  return structuredClone(tsneFacet.initialData) as unknown as TsneData;
}

/**
 * 사양이 준 열두 줄. 알고리즘의 `mulberry32` 를 빌려 오지 않고 여기서 다시 적는다 —
 * 같은 함수를 양쪽에서 부르면 그 함수가 틀려도 검사가 통과한다.
 */
function pointsFromSpecRecipe(): number[][] {
  function rng(seed: number): () => number {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const jr = rng(4242);
  const P: number[][] = [];
  for (const [cx, cy] of [
    [1.5, 1.8],
    [4.7, 1.9],
    [12.5, 2.0],
  ]) {
    for (let i = 0; i < 20; i += 1) P.push([cx + (jr() - 0.5) * 1.6, cy + (jr() - 0.5) * 1.6]);
  }
  return P;
}

type SettledPayload = {
  perplexity: number;
  step: number;
  gapAB: number;
  gapBC: number;
  ratio: number;
  spreads: number[];
  separation: number;
  verdict: LayoutMeasure['verdict'];
};

type StepPayload = SettledPayload & { steps: number; coords: number[][]; exaggerating: boolean };

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  settled: SettledPayload[];
  steps: StepPayload[];
};

/**
 * 알고리즘을 러너 없이 굴린다.
 *
 * `sleep` 은 곧바로 돌아오고 `waitForInput` 은 대본을 하나씩 내어 준다. 대본이
 * 비면 취소로 만들어 알고리즘의 최상위 `catch` 가 조용히 접게 한다 — 실제 러너의
 * reset / destroy 가 하는 일과 같은 모양이다.
 */
async function drive(script: ReactiveInputEvent[], data = freshData()): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const queue = [...script];
  let cancelled = false;
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (next !== undefined) return next;
      cancelled = true;
      throw new Error('cancelled');
    },
  };
  await tsne(ctx as unknown as FacetContext<TsneData>);
  return {
    events,
    metrics,
    settled: events.filter((e) => e.type === 'run-settled').map((e) => e.payload as SettledPayload),
    steps: events.filter((e) => e.type === 'layout-step').map((e) => e.payload as StepPayload),
  };
}

describe('선언의 점 예순', () => {
  it('사양의 열두 줄이 낸 좌표와 글자 하나 다르지 않다', () => {
    const data = freshData();
    const recipe = pointsFromSpecRecipe();
    expect(data.points).toHaveLength(60);
    expect(recipe).toHaveLength(60);
    for (let i = 0; i < 60; i += 1) {
      expect(data.points[i][0]).toBe(recipe[i][0]);
      expect(data.points[i][1]).toBe(recipe[i][1]);
    }
    // 뒤집어 본다 — 한 자리만 틀어도 위 단언이 실제로 걸린다.
    expect(data.points[0][0]).not.toBe(recipe[1][0]);
    expect(data.labels).toEqual(recipe.map((_, i) => Math.floor(i / 20)));
  });

  it('원래 자리는 B-C 가 A-B 의 2.18 배다', () => {
    const data = freshData();
    const m = measureLayout(data.points, data.labels, data.cleanSeparation, data.brokenSpreadRatio);
    expect(m.gapAB).toBeCloseTo(SPEC.source.gapAB, 2);
    expect(m.gapBC).toBeCloseTo(SPEC.source.gapBC, 2);
    expect(m.ratio).toBeCloseTo(SPEC.source.ratio, 2);
    expect(m.spreads.map((v) => Number(v.toFixed(2)))).toEqual(SPEC.source.spreads);
    expect(m.separation).toBeCloseTo(SPEC.source.separation, 2);
  });
});

describe('첫째 주장 — 퍼플렉시티가 답을 가른다', () => {
  const data = freshData();
  const out = {
    5: runTsne(data, 5).measure,
    15: runTsne(data, 15).measure,
    30: runTsne(data, 30).measure,
  } as const;

  it('셋이 사양의 대조와 맞는다', () => {
    expect(out[5].gapAB).toBeCloseTo(SPEC.p5.gapAB, 1);
    expect(out[5].gapBC).toBeCloseTo(SPEC.p5.gapBC, 1);
    expect(out[5].separation).toBeCloseTo(SPEC.p5.separation, 2);
    expect(out[15].gapAB).toBeCloseTo(SPEC.p15.gapAB, 1);
    expect(out[15].gapBC).toBeCloseTo(SPEC.p15.gapBC, 1);
    expect(out[15].separation).toBeCloseTo(SPEC.p15.separation, 2);
    expect(out[30].gapAB).toBeCloseTo(SPEC.p30.gapAB, 1);
    expect(out[30].gapBC).toBeCloseTo(SPEC.p30.gapBC, 1);
    expect(out[30].separation).toBeCloseTo(SPEC.p30.separation, 2);
  });

  it('작으면 부서지고 크면 흐려지고 15 만 깨끗이 갈린다', () => {
    expect(out[5].verdict).toBe(SPEC.p5.verdict);
    expect(out[15].verdict).toBe(SPEC.p15.verdict);
    expect(out[30].verdict).toBe(SPEC.p30.verdict);
    // 갈림은 15 가 홀로 문턱을 넘는다.
    expect(out[15].separation).toBeGreaterThan(data.cleanSeparation);
    expect(out[5].separation).toBeLessThan(data.cleanSeparation);
    expect(out[30].separation).toBeLessThan(data.cleanSeparation);
    // 그리고 15 가 셋 중 가장 크다 — 문턱과 상관없이.
    expect(out[15].separation).toBeGreaterThan(out[5].separation);
    expect(out[15].separation).toBeGreaterThan(out[30].separation);
  });

  it('부서짐과 흐려짐은 다른 모양이다 — 무리 안 퍼짐이 갈린다', () => {
    const spread = (m: LayoutMeasure): number => Math.max(...m.spreads) / Math.min(...m.spreads);
    // 5 에서는 한 무리만 흩어졌다 (C 가 나머지 셋보다 세 배 넘게 퍼진다).
    expect(spread(out[5])).toBeGreaterThan(data.brokenSpreadRatio);
    expect(Math.max(...out[5].spreads)).toBeCloseTo(239.49, 1);
    // 30 에서는 셋이 고르게 촘촘하다. 흐린 것은 무리가 아니라 사이다.
    expect(spread(out[30])).toBeLessThan(1.05);
  });

  it('기울기를 모아 한꺼번에 얹는다 — 좌표가 터지지 않는다', () => {
    for (const p of [5, 15, 30] as const) {
      const { coords } = runTsne(data, p);
      for (const [x, y] of coords) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        // 점마다 곧바로 갱신하면 여기가 1e24 가 된다.
        expect(Math.abs(x)).toBeLessThan(1e4);
        expect(Math.abs(y)).toBeLessThan(1e4);
      }
    }
  });
});

describe('둘째 주장 — 깨끗이 갈린 그림에서도 거리는 읽으면 안 된다', () => {
  it('1 : 2.18 이던 것이 1 : 1.05 가 된다', () => {
    const data = freshData();
    const source = measureLayout(
      data.points,
      data.labels,
      data.cleanSeparation,
      data.brokenSpreadRatio,
    );
    const flat = runTsne(data, 15).measure;
    expect(source.ratio).toBeCloseTo(SPEC.source.ratio, 2);
    expect(flat.ratio).toBeCloseTo(SPEC.p15.ratio, 2);
    expect(flat.verdict).toBe('clean');
    // 두 배가 넘던 사이가 거의 같아진다.
    expect(source.ratio).toBeGreaterThan(2);
    expect(Math.abs(flat.ratio - 1)).toBeLessThan(0.1);
  });
});

describe('알고리즘의 발신', () => {
  it('phase 를 하나도 보내지 않는다 — IR 이 없으므로 받을 자리가 없다 (C3)', async () => {
    const { events } = await drive([]);
    expect(events.filter((e) => e.type === 'phase')).toEqual([]);
    expect(tsneIRs).toEqual([]);
  });

  it('발신하는 어휘는 주석에 적은 넷뿐이다 (C2)', async () => {
    const { events } = await drive([{ type: 'perplexity', payload: { value: 5 } }]);
    expect([...new Set(events.map((e) => e.type))].sort()).toEqual([
      'layout-step',
      'run-begin',
      'run-settled',
      'source-measured',
    ]);
  });

  it('메트릭은 셈한 값이다 — 마지막 프레임이 낸 수와 같다', async () => {
    const { metrics, steps, settled } = await drive([]);
    const data = freshData();
    expect(settled).toHaveLength(1);
    expect(metrics['step-count']).toBe(data.steps);
    expect(metrics['separation-score']).toBeCloseTo(
      Math.round(settled[0].separation * 100) / 100,
      9,
    );
    expect(metrics['gap-ratio']).toBeCloseTo(Math.round(settled[0].ratio * 100) / 100, 9);
    // 계기의 수는 실제로 사양의 대조와 같다.
    expect(metrics['separation-score']).toBe(SPEC.p15.separation);
    expect(metrics['gap-ratio']).toBe(SPEC.p15.ratio);
    // 걸음은 프레임마다 stepsPerFrame 씩 는다.
    expect(steps[0].step).toBe(0);
    expect(steps[1].step).toBe(data.stepsPerFrame);
    expect(steps[steps.length - 1].step).toBe(data.steps);
  });

  it('손잡이를 옮기면 그 값으로 다시 셈해 갈아 끼운다', async () => {
    const { settled } = await drive([
      { type: 'perplexity', payload: { value: 5 } },
      { type: 'perplexity', payload: { value: 30 } },
    ]);
    expect(settled.map((s) => s.perplexity)).toEqual([15, 5, 30]);
    expect(settled[0].separation).toBeCloseTo(SPEC.p15.separation, 2);
    expect(settled[1].separation).toBeCloseTo(SPEC.p5.separation, 2);
    expect(settled[2].separation).toBeCloseTo(SPEC.p30.separation, 2);
  });

  it('같은 값을 다시 고르면 다시 돌지 않는다', async () => {
    const { settled } = await drive([{ type: 'perplexity', payload: { value: 15 } }]);
    expect(settled).toHaveLength(1);
  });

  it('알 수 없는 조작과 목록에 없는 값은 흘린다', async () => {
    const { settled } = await drive([
      { type: 'nonsense' },
      { type: 'input', payload: { name: 'perplexity', value: '7' } },
      { type: 'perplexity', payload: { value: 7 } },
    ]);
    expect(settled).toHaveLength(1);
  });
});

describe('Projector 배선', () => {
  it('잰 값을 판과 장부로 옮기고 판정에 따라 다른 말을 한다', async () => {
    const { events } = await drive([
      { type: 'perplexity', payload: { value: 5 } },
      { type: 'perplexity', payload: { value: 30 } },
    ]);
    const rows: LedgerRow[] = [];
    const captions: string[] = [];
    let source: PanelState | null = null;
    let embedding: PanelState | null = null;
    let cleared = 0;
    let current: string | null = null;

    const stage = {
      setSource(state: PanelState) {
        source = state;
      },
      setEmbedding(state: PanelState) {
        embedding = state;
      },
      clearEmbedding() {
        cleared += 1;
        embedding = null;
      },
      addLedgerRow(row: LedgerRow) {
        rows.push(row);
      },
      setCurrentRow(key: string | null) {
        current = key;
      },
      setCaption(line: string) {
        captions.push(line);
      },
      reset() {},
      destroy() {},
    } as unknown as ViewInstance;

    const projector = tsneProjector({ stage });
    projector.onInit?.(tsneFacet.initialData);
    for (const e of events) await projector.onEvent(e);

    expect(source).not.toBeNull();
    expect((source as unknown as PanelState).coords).toHaveLength(60);
    expect(embedding).not.toBeNull();
    expect((embedding as unknown as PanelState).coords).toHaveLength(60);
    expect(cleared).toBe(3);
    expect(current).toBe('p30');
    expect(rows.map((r) => r.key)).toEqual(['source', 'p15', 'p5', 'p30']);
    expect(rows.map((r) => r.verdict)).toEqual(['clean', 'clean', 'broken', 'blurred']);
    // 세 판정이 서로 다른 문장을 낸다.
    const settledCaptions = captions.filter((c) => !c.includes('step'));
    expect(new Set(settledCaptions).size).toBe(settledCaptions.length);
    // 깨끗이 갈린 그림의 문장은 원래 비와 지금 비를 나란히 말한다.
    const clean = captions.find((c) => c.includes('1.05'));
    expect(clean).toBeDefined();
    expect(clean).toContain('2.18');
  });
});

describe('마운트와 조작', () => {
  let errors: string[] = [];
  let spy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    errors = [];
    spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    spy?.mockRestore();
  });

  it('캔버스가 붙고 세로가 안 바뀌며 손잡이가 화면을 바꾼다', async () => {
    registerTsne();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(tsneFacet, host);
    handle.setSpeed(60);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    expect(box).toBe('0 0 760 430');
    // 원래 자리는 마운트 순간 이미 그려져 있다 — 알고리즘을 기다리지 않는다.
    expect(host.querySelectorAll('svg circle').length).toBeGreaterThanOrEqual(60);

    /** 장부 한 줄의 글자를 통째로 읽는다. 줄마다 열쇠가 새겨져 있다. */
    const ledger = (key: string): string =>
      [...(host.querySelector(`[data-ledger-key="${key}"]`)?.querySelectorAll('text') ?? [])]
        .map((t) => t.textContent ?? '')
        .join(' | ');
    const wait = async (until: () => boolean, ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !until()) {
        await new Promise((r) => setTimeout(r, 25));
      }
    };

    // 손잡이를 대기 전에 이미 세 자리가 잡혀 있고, 돌지 않은 줄은 줄표다.
    expect(ledger('p5')).toContain('—');
    expect(ledger('p30')).toContain('—');

    await wait(() => ledger('p15').includes('19.17'), 25_000);
    expect(ledger('source')).toContain('2.18');
    expect(ledger('source')).toContain('5.30');
    expect(ledger('p15')).toContain('19.17');
    expect(ledger('p15')).toContain('1.05');
    expect(ledger('p15')).toContain('split cleanly');
    // 아직 눌러 보지 않은 둘은 그대로 비어 있다.
    expect(ledger('p5')).toContain('—');
    expect(svg?.getAttribute('viewBox')).toBe(box);

    // ── 손잡이가 논증을 진다. 퍼플렉시티 5 로 옮기면 화면이 실제로 바뀐다.
    const segs = host.querySelectorAll<HTMLElement>('[data-seg-index]');
    expect(segs.length).toBe(3);
    segs[0].click();
    await wait(() => ledger('p5').includes('0.26'), 25_000);
    expect(ledger('p5')).toContain('0.26');
    expect(ledger('p5')).toContain('groups broke apart');
    // 앞서 본 답은 지워지지 않는다 — 견줌이 장부 위에서 일어난다.
    expect(ledger('p15')).toContain('19.17');
    expect(svg?.getAttribute('viewBox')).toBe(box);

    // 퍼플렉시티 30 도 자기 줄을 얹는다.
    segs[2].click();
    await wait(() => ledger('p30').includes('2.95'), 25_000);
    expect(ledger('p30')).toContain('2.95');
    expect(ledger('p30')).toContain('1.56');
    expect(ledger('p30')).toContain('edges blurred');
    expect(ledger('p5')).toContain('0.26');
    expect(ledger('p15')).toContain('19.17');

    // 계기의 수도 알고리즘이 셈한 것이다.
    const stepMetric = host.querySelector('.facet-control-bar__metric--step-count');
    expect(Number(stepMetric?.textContent?.replace(/[^\d]/g, ''))).toBe(1000);
    const sepMetric = host.querySelector('.facet-control-bar__metric--separation-score');
    expect(sepMetric?.textContent).toContain('2.95');
    const ratioMetric = host.querySelector('.facet-control-bar__metric--gap-ratio');
    expect(ratioMetric?.textContent).toContain('1.56');

    expect(errors).toEqual([]);

    handle.destroy();
    expect(host.querySelector('svg')).toBeNull();
    expect(host.children.length).toBe(0);
    host.remove();
  }, 90_000);

  it('되감기는 장부를 비우고 손잡이를 처음 자리로 돌린다', async () => {
    registerTsne();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(tsneFacet, host);
    handle.setSpeed(60);

    const ledger = (key: string): string =>
      [...(host.querySelector(`[data-ledger-key="${key}"]`)?.querySelectorAll('text') ?? [])]
        .map((t) => t.textContent ?? '')
        .join(' | ');
    const wait = async (until: () => boolean, ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !until()) {
        await new Promise((r) => setTimeout(r, 25));
      }
    };

    await wait(() => ledger('p15').includes('19.17'), 25_000);
    const segs = host.querySelectorAll<HTMLElement>('[data-seg-index]');
    segs[0].click();
    await wait(() => ledger('p5').includes('0.26'), 25_000);
    expect(ledger('p5')).toContain('0.26');

    host.querySelector<HTMLButtonElement>('button[data-control-id="reset"]')?.click();
    await wait(() => ledger('p5').includes('—'), 25_000);
    expect(ledger('p5')).toContain('—');
    // 되감기 뒤에는 다시 기본 퍼플렉시티로 돈다 — 코어가 위젯도 처음 자리로 돌린다.
    await wait(() => ledger('p15').includes('19.17'), 25_000);
    expect(ledger('p15')).toContain('19.17');

    expect(errors).toEqual([]);
    handle.destroy();
    host.remove();
  }, 90_000);
});
