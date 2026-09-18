// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  mountView,
  type FacetRuntimeEvent,
  type IRStmt,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  registerSimd,
  simdAlgorithm,
  simdFacet,
  simdImperativeIR,
  simdStageView,
  type SimdData,
  type SimdStage,
} from '../src/index.js';

/** 사양 표 — 대조용. */
const TABLE: Record<number, { packs: number; tail: number; ops: number; withLoadStore: number; pct: number }> = {
  1: { packs: 18, tail: 0, ops: 18, withLoadStore: 72, pct: 100 },
  2: { packs: 9, tail: 0, ops: 9, withLoadStore: 36, pct: 200 },
  4: { packs: 4, tail: 2, ops: 6, withLoadStore: 24, pct: 300 },
  8: { packs: 2, tail: 2, ops: 4, withLoadStore: 16, pct: 450 },
};

function freshData(): SimdData {
  return structuredClone(simdFacet.initialData) as SimdData;
}

type RoundRecord = {
  metrics: Record<string, number>;
  events: FacetRuntimeEvent[];
};

/**
 * 가짜 reactive ctx. 판이 끝나 `waitForInput` 에 닿을 때마다 그 판의 계기와 이벤트를
 * 떠 두고, 대본의 다음 차선을 건넨다. 대본이 다하면 취소한다.
 */
async function drive(
  script: number[],
  opts: { polled?: ReactiveInputEvent[]; extraWaitInputs?: ReactiveInputEvent[] } = {},
): Promise<RoundRecord[]> {
  const metrics = new Map<string, number>();
  const rounds: RoundRecord[] = [];
  let events: FacetRuntimeEvent[] = [];
  let cancelled = false;
  const polled = [...(opts.polled ?? [])];
  const queue = [...script];
  const extras = [...(opts.extraWaitInputs ?? [])];

  const ctx = {
    data: freshData(),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return polled.shift() ?? null;
    },
    async waitForInput(): Promise<ReactiveInputEvent> {
      // 우리 것이 아닌 입력을 먼저 흘려 본다 — 판이 새로 서면 안 된다.
      const extra = extras.shift();
      if (extra) return extra;
      rounds.push({ metrics: Object.fromEntries(metrics), events });
      events = [];
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'lanes', payload: { value: next, segmentIndex: 0 } };
    },
  };
  await simdAlgorithm(ctx as never);
  return rounds;
}

/** 이벤트에서 c 를 다시 짓는다. */
function cFromEvents(events: FacetRuntimeEvent[], n: number): number[] {
  const c = new Array<number>(n).fill(0);
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    if (e.type === 'pack-add') {
      const start = p['start'] as number;
      (p['sums'] as number[]).forEach((s, k) => (c[start + k] = s));
    } else if (e.type === 'tail-add') {
      c[p['index'] as number] = p['sum'] as number;
    }
  }
  return c;
}

function irPhases(stmts: IRStmt[], out: Set<string>): void {
  for (const s of stmts) {
    if (s.kind === 'comment') continue;
    if (s.phase) out.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, out);
      if (s.else) irPhases(s.else, out);
    }
    if (s.kind === 'while' || s.kind === 'for-range') irPhases(s.body, out);
  }
}

const LADDER = [1, 2, 4, 8];

describe('simd — 데이터', () => {
  it('1차 데이터는 열여덟 · 사다리 1 2 4 8 이고 손잡이 구간과 같다 (32 비트 잠금)', () => {
    const d = freshData();
    expect(d.a).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(d.b).toEqual(Array.from({ length: 18 }, (_, i) => (i + 1) * 10));
    expect(d.laneLadder).toEqual(LADDER);
    expect(Math.max(...d.laneLadder)).toBe(8);

    const controls = (simdFacet.blocks['controls'] as { controls: Array<Record<string, unknown>> }).controls;
    const knob = controls.find((c) => c['widget'] === 'segmented-slider')!;
    const segs = knob['segments'] as Array<{ value: number; default?: boolean }>;
    expect(segs.map((s) => s.value)).toEqual(d.laneLadder);
    expect(segs.find((s) => s.default)?.value).toBe(d.laneLadder[0]);
    expect(knob['action']).toBe('lanes');
  });
});

describe('simd — 등록', () => {
  it('reactive 로 등록된다', () => {
    clearRegistry();
    registerSimd();
    expect(getAlgorithmMechanismKind('simd')).toBe('reactive');
  });
});

describe('simd — 회차별 계기', () => {
  it('차선을 1 → 2 → 4 → 8 → 4 → 2 → 1 → 8 → 1 로 돌리면 회차마다 사양 표와 같다', async () => {
    const script = [2, 4, 8, 4, 2, 1, 8, 1];
    const rounds = await drive(script);
    const order = [1, ...script];
    expect(rounds).toHaveLength(order.length);
    rounds.forEach((r, idx) => {
      const lanes = order[idx]!;
      const row = TABLE[lanes]!;
      expect(r.metrics, `회차 ${idx} (차선 ${lanes})`).toEqual({
        'add-op-count': row.ops,
        'tail-op-count': row.tail,
        'speedup-percent': row.pct,
      });
      expect(row.withLoadStore).toBe(row.ops * 4);
      const start = r.events.find((e) => e.type === 'round-start')!.payload as Record<string, number>;
      expect(start).toMatchObject({ lanes, packs: row.packs, tail: row.tail, ops: row.ops, n: 18 });
      const done = r.events.find((e) => e.type === 'round-done')!.payload as Record<string, number>;
      expect(done).toMatchObject({ lanes, ops: row.ops, tailOps: row.tail, pct: row.pct, n: 18 });
      expect(r.events.filter((e) => e.type === 'pack-add')).toHaveLength(row.packs);
      expect(r.events.filter((e) => e.type === 'tail-add')).toHaveLength(row.tail);
    });
  });

  it('갈리지 않는 첫 회차에서도 계기 이름이 셋 다 실린다', async () => {
    const [first] = await drive([]);
    expect(Object.keys(first!.metrics).sort()).toEqual(['add-op-count', 'speedup-percent', 'tail-op-count']);
  });

  it('재생 중에 돌린 손잡이는 다음 걸음에서 받혀 판을 새로 세운다 · 남의 입력은 흘린다', async () => {
    const rounds = await drive([], {
      polled: [{ type: 'other' }, { type: 'lanes', payload: { value: 4 } }],
      extraWaitInputs: [{ type: 'other' }, { type: 'lanes', payload: { value: 3 } }],
    });
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.metrics).toEqual({ 'add-op-count': 6, 'tail-op-count': 2, 'speedup-percent': 300 });
    const starts = rounds[0]!.events.filter((e) => e.type === 'round-start');
    expect(starts.map((e) => (e.payload as { lanes: number }).lanes)).toEqual([1, 4]);
  });
});

describe('simd — IR 은 화면과 같은 답을 낸다', () => {
  it('모든 차선에서 addLanes · countTail · speedupPercent 가 algorithm 의 계기와 같다', async () => {
    const script = [2, 4, 8];
    const rounds = await drive(script);
    const d = freshData();
    const n = d.a.length;
    [1, ...script].forEach((lanes, idx) => {
      const r = rounds[idx]!;
      const c = new Array<number>(n).fill(0);
      const ops = runIR(simdImperativeIR, 'addLanes', [[...d.a], [...d.b], c, lanes]);
      const tail = runIR(simdImperativeIR, 'countTail', [n, lanes]);
      const pct = runIR(simdImperativeIR, 'speedupPercent', [n, ops as number]);
      expect(ops).toBe(r.metrics['add-op-count']);
      expect(tail).toBe(r.metrics['tail-op-count']);
      expect(pct).toBe(r.metrics['speedup-percent']);
      expect(c).toEqual(d.a.map((x, i) => x + d.b[i]!));
      expect(cFromEvents(r.events, n)).toEqual(c);
      // 중간값 상한 — c 최대 198, 빨라짐 분자 최대 n*100 + 18//2 = 1809.
      expect(Math.max(...c)).toBe(198);
      expect(n * 100 + Math.floor((ops as number) / 2)).toBeLessThanOrEqual(1809);
    });
  });

  it('phase 집합이 algorithm 과 IR 에서 같다', async () => {
    const rounds = await drive([2, 4, 8]);
    const algo = new Set<string>();
    for (const r of rounds) {
      for (const e of r.events) {
        if (e.type === 'phase') algo.add((e.payload as { phase: string }).phase);
      }
    }
    const ir = new Set<string>();
    for (const f of simdImperativeIR.functions) irPhases(f.body, ir);
    expect([...algo].sort()).toEqual([...ir].sort());
    expect([...ir].sort()).toEqual(['bundle-add', 'plan', 'speedup', 'tail-add']);
  });
});

describe('simd — stage 운동', () => {
  it('차선을 돌리면 띠가 넓어지고 꼬리 띠가 자라며 시간 줄이 줄어든다', () => {
    const container = document.createElement('div');
    const inst = mountView(simdStageView, container, {
      config: { type: 'simd-stage' },
      initialData: simdFacet.initialData,
      isInstant: () => true,
    });
    const stage = inst as unknown as SimdStage;
    const canvas = container.querySelector('svg')!;
    // 러너 밖에서도 자리 표시자가 풀린다.
    expect(canvas.textContent).toContain('c = a + b over 18 elements');
    expect(canvas.textContent).not.toContain('{n}');
    const rects = () => [...canvas.querySelectorAll('g')[0]!.querySelectorAll('rect')];
    const widthOf = (r: Element) => Number(r.getAttribute('width'));
    const slotWidths = () =>
      [...canvas.querySelectorAll('g')[3]!.querySelectorAll('rect')].slice(1).map(widthOf);

    stage.layout(4, 4, 2, 6);
    const bands4 = rects().map(widthOf);
    expect(bands4.slice(0, 4).every((w) => w > 4 * 36 - 1)).toBe(true);
    expect(bands4.slice(4, 6).every((w) => w > 35 && w < 36)).toBe(true);
    expect(bands4.slice(6).every((w) => w === 0)).toBe(true);
    expect(slotWidths().filter((w) => w > 0)).toHaveLength(6);

    stage.layout(8, 2, 2, 4);
    const bands8 = rects().map(widthOf);
    expect(bands8.slice(0, 2).every((w) => w > 8 * 36 - 1)).toBe(true);
    expect(Number(rects()[2]!.getAttribute('x'))).toBe(84 + 16 * 36 - 2);
    expect(slotWidths().filter((w) => w > 0)).toHaveLength(4);

    stage.layout(1, 18, 0, 18);
    expect(slotWidths().filter((w) => w > 0)).toHaveLength(18);
    inst.destroy();
  });
});
