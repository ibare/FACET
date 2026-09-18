// @vitest-environment happy-dom
/**
 * 배치와 패딩 — 사양 표 · IR 대조 · phase · 손잡이 · 화면.
 */
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  makeTranslator,
  mountView,
  runFacet,
  type FacetContext,
  type FacetRuntimeEvent,
  type IRStmt,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';

import {
  batchingAndPaddingAlgorithm,
  batchingAndPaddingFacet,
  batchingAndPaddingImperativeIR,
  batchingAndPaddingStageView,
  registerBatchingAndPadding,
  type BatchStage,
  type BatchStageState,
  type BatchingAndPaddingData,
} from '../src/index.js';

const data = batchingAndPaddingFacet.initialData as unknown as BatchingAndPaddingData;

/** 사양 표 — 대조용. */
const TABLE: Record<string, { steps: number; idle: number; pct: number; sum: number }> = {
  '0/1': { steps: 48, idle: 0, pct: 100, sum: 222 },
  '0/2': { steps: 34, idle: 20, pct: 71, sum: 186 },
  '0/4': { steps: 21, idle: 36, pct: 57, sum: 132 },
  '0/8': { steps: 12, idle: 48, pct: 50, sum: 96 },
  '1/1': { steps: 48, idle: 0, pct: 100, sum: 222 },
  '1/2': { steps: 25, idle: 2, pct: 96, sum: 119 },
  '1/4': { steps: 14, idle: 8, pct: 86, sum: 68 },
  '1/8': { steps: 12, idle: 48, pct: 50, sum: 48 },
};

type Run = {
  policy: number;
  slots: number;
  metrics: Record<string, number>;
  finish: number[];
  done: Record<string, number>;
};

/** 가짜 reactive ctx 로 알고리즘을 돌린다. 판이 끝나 입력을 기다릴 때마다 한 판을 적는다. */
async function drive(inputs: { type: string; value: unknown }[]) {
  const d = structuredClone(data);
  const metrics = new Map<string, number>();
  const metricNamesPerRun: string[][] = [];
  let namesThisRun = new Set<string>();
  const emitted: string[] = [];
  const lit = new Set<string>();
  let lastPhase: string | null = null;
  let cancelled = false;
  const runs: Run[] = [];
  let finish: number[] = [];
  let done: Record<string, number> = {};
  let policy = d.policy;
  let slots = d.slots;
  const queue = [...inputs];

  const ctx = {
    data: d,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      if (e.type === 'phase') {
        lastPhase = String(p.phase);
        emitted.push(lastPhase);
        return;
      }
      if (e.type === 'setup') {
        policy = p.policy as number;
        slots = p.slots as number;
        finish = d.requests.map(() => 0);
        namesThisRun = new Set();
      }
      if (e.type === 'batch-returned' || e.type === 'release') {
        for (const it of p.items as { req: number; finish: number }[]) finish[it.req] = it.finish;
      }
      if (e.type === 'done') done = p as Record<string, number>;
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      namesThisRun.add(name);
    },
    async sleep() {
      if (lastPhase !== null) lit.add(lastPhase);
      return !cancelled;
    },
    async waitForInput() {
      if (lastPhase !== null) lit.add(lastPhase);
      runs.push({ policy, slots, metrics: Object.fromEntries(metrics), finish: [...finish], done: { ...done } });
      metricNamesPerRun.push([...namesThisRun].sort());
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value, segmentIndex: 0 } };
    },
    pollInput() {
      return null;
    },
  };
  await batchingAndPaddingAlgorithm(ctx as unknown as FacetContext<BatchingAndPaddingData>);
  return { runs, emitted: new Set(emitted), lit, metricNamesPerRun };
}

/** 여덟 조합을 다 지나며 A → B → A 로 되돌아오는 손잡이 순서. */
const TOUR = [
  { type: 'slots', value: 1 },
  { type: 'slots', value: 2 },
  { type: 'slots', value: 4 },
  { type: 'slots', value: 8 },
  { type: 'policy', value: 1 },
  { type: 'slots', value: 4 },
  { type: 'slots', value: 2 },
  { type: 'slots', value: 1 },
  { type: 'policy', value: 0 },
  { type: 'slots', value: 4 },
  { type: 'policy', value: 1 },
  { type: 'policy', value: 0 },
];

function irPhases(stmts: IRStmt[], out = new Set<string>()): Set<string> {
  for (const s of stmts) {
    if (s.kind === 'comment') continue;
    if (s.phase) out.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, out);
      if (s.else) irPhases(s.else, out);
    }
    if (s.kind === 'for-range' || s.kind === 'while') irPhases(s.body, out);
  }
  return out;
}

describe('batchingAndPadding — 사양 표', () => {
  it('회차마다 계기가 사양 표와 같다 (A → B → A, 여덟 조합)', async () => {
    const { runs, metricNamesPerRun } = await drive(TOUR);
    expect(runs.length).toBe(TOUR.length + 1);
    const seen = new Set<string>();
    runs.forEach((r, i) => {
      const key = `${r.policy}/${r.slots}`;
      seen.add(key);
      const want = TABLE[key]!;
      expect({ key, i, ...r.metrics }).toEqual({
        key,
        i,
        'step-count': want.steps,
        'idle-cell-count': want.idle,
        'finish-step-sum': want.sum,
      });
      expect(r.done.pct).toBe(want.pct);
      expect(r.done.cells).toBe(r.slots * want.steps);
      expect(r.finish.reduce((a, b) => a + b, 0)).toBe(want.sum);
    });
    expect(seen.size).toBe(8);
    // 첫 판에서 셋이 모두 실린다 — 델타 0 도 처음 한 번은 보낸다. 뒤 판은 바뀐 것만 보낸다.
    expect(metricNamesPerRun[0]).toEqual(['finish-step-sum', 'idle-cell-count', 'step-count']);
  });

  it('사다리 밖의 값과 우리 것이 아닌 입력은 흘린다', async () => {
    const { runs } = await drive([
      { type: 'slots', value: 3 },
      { type: 'slots', value: '8' },
      { type: 'other', value: 1 },
      { type: 'slots', value: 8 },
    ]);
    expect(runs.map((r) => `${r.policy}/${r.slots}`)).toEqual(['0/4', '0/4', '0/4', '0/4', '0/8']);
  });
});

describe('batchingAndPadding — IR', () => {
  it('여덟 조합 전부에서 걸음 수와 끝난 걸음 배열이 알고리즘과 같다', async () => {
    const { runs } = await drive(TOUR);
    const lengths = data.requests.map((r) => r.tokens);
    const checked = new Set<string>();
    for (const r of runs) {
      const holder = Array.from({ length: r.slots }, () => -1);
      const left = Array.from({ length: r.slots }, () => 0);
      const finish = lengths.map(() => 0);
      const steps = runIR(batchingAndPaddingImperativeIR, 'runBatch', [
        [...lengths],
        r.slots,
        r.policy,
        holder,
        left,
        finish,
      ]);
      expect(steps).toBe(r.metrics['step-count']);
      expect(finish).toEqual(r.finish);
      checked.add(`${r.policy}/${r.slots}`);
    }
    expect(checked.size).toBe(8);
  });

  it('phase 집합이 같고, 걸음 경계마다 켜진 phase 를 모으면 IR 의 집합이 된다', async () => {
    const { emitted, lit } = await drive(TOUR);
    const ir = irPhases(batchingAndPaddingImperativeIR.functions.flatMap((f) => f.body));
    expect([...emitted].sort()).toEqual([...ir].sort());
    expect([...lit].sort()).toEqual([...ir].sort());
  });

  it('32 비트 — 자료가 커지면 여기서 먼저 깨진다', () => {
    expect(data.requests.length).toBe(8);
    expect(data.requests.reduce((a, r) => a + r.tokens, 0)).toBe(48);
    expect(Math.max(...data.requests.map((r) => r.tokens))).toBe(12);
    expect(Math.max(...data.slotLadder)).toBe(8);
    // 중간값 최대 — 끝난 걸음 합 222 (자리 1). 걸음 수는 48 을 넘지 않는다.
    expect(Math.max(...Object.values(TABLE).map((v) => v.sum))).toBe(222);
  });
});

describe('batchingAndPadding — 선언', () => {
  it('reactive 로 등록된다', () => {
    clearRegistry();
    registerBatchingAndPadding();
    expect(getAlgorithmMechanismKind('batchingAndPadding')).toBe('reactive');
  });

  it('사다리가 손잡이 segments 와 같다', () => {
    const controls = (batchingAndPaddingFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
    const seg = (action: string) => {
      const c = controls.find((x) => x.action === action) as {
        segments: { value: number; default?: boolean }[];
      };
      return { values: c.segments.map((s) => s.value), def: c.segments.find((s) => s.default)?.value };
    };
    expect(seg('policy')).toEqual({ values: data.policies, def: data.policy });
    expect(seg('slots')).toEqual({ values: data.slotLadder, def: data.slots });
  });
});

describe('batchingAndPadding — 화면', () => {
  function mount(withData = true) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(batchingAndPaddingStageView, container, {
      config: { type: 'batching-and-padding-stage' },
      ...(withData ? { initialData: data as unknown as Record<string, unknown> } : {}),
      locale: 'en',
      theme: 'light',
      t: makeTranslator('en', batchingAndPaddingFacet.messages),
    }) as unknown as BatchStage & { destroy(): void };
    return { container, inst };
  }

  it('자료 없이도 마운트하고 무언가 그린다', () => {
    const { container, inst } = mount(false);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.childNodes.length).toBeGreaterThan(0);
    inst.destroy();
  });

  it('캡션과 계기 줄의 수는 넘긴 상태의 수다', () => {
    const { container, inst } = mount();
    const requests = data.requests.map((r) => ({ tokens: r.tokens, prompt: r.prompt }));
    const state: BatchStageState = {
      requests,
      slots: 4,
      lanes: [
        { req: 0, done: 3, pad: 4 },
        { req: 1, done: 7, pad: 0 },
        { req: 2, done: 5, pad: 2 },
        { req: 3, done: 7, pad: 0 },
      ],
      queue: [4, 5, 6, 7],
      finish: [0, 0, 0, 0, 0, 0, 0, 0],
      ghost: [],
      step: 7,
      idle: 6,
      used: 22,
      cells: 28,
      pct: 79,
      caption: { kind: 'step', step: 7, active: 2, slots: 4 },
    };
    inst.show(state, 0);
    const text = container.textContent ?? '';
    expect(text).toContain('Step 7 · cells 28 · empty 6 · busy 79%');
    expect(text).toContain('Step 7: 2 of 4 slots make a token.');
    expect(text).toContain('Summarise this paragraph about rainfall.');
    inst.show({ ...state, caption: { kind: 'form', batch: 2, first: 4, last: 7, longest: 5, len: 9 } }, 0);
    expect(container.textContent).toContain('Batch 2: R5–R8. The longest is R6, 9 tokens.');
    inst.destroy();
  });

  it('러너 안에서 끝까지 돌고, 손잡이를 돌리면 다시 돈다', async () => {
    clearRegistry();
    registerBatchingAndPadding();
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(batchingAndPaddingFacet, container, { locale: 'en' });
    handle.setSpeed(100);
    try {
      const until = async (s: string) => {
        for (let i = 0; i < 200; i++) {
          if ((container.textContent ?? '').includes(s)) return true;
          await new Promise((r) => setTimeout(r, 20));
        }
        return false;
      };
      expect(await until('Finished in 21 steps. 36 of 84 cells were empty.')).toBe(true);
      expect(container.textContent).toContain('Step 21 · cells 84 · empty 36 · busy 57%');
      // 자리 8 로 돌린다.
      const eight = [...container.querySelectorAll<HTMLElement>('[data-seg-index]')].find(
        (el) => el.textContent === '8',
      );
      expect(eight).toBeDefined();
      eight!.click();
      expect(await until('Finished in 12 steps. 48 of 96 cells were empty.')).toBe(true);
    } finally {
      handle.destroy();
      console.error = orig;
    }
    expect(errors).toEqual([]);
  }, 20_000);
});
