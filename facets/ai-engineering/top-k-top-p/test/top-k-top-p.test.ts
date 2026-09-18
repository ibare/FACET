// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  mountView,
  type FacetContext,
  type FacetRuntimeEvent,
  type IR,
  type IRStmt,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';

import {
  cutContext,
  registerTopKTopP,
  roundPercent,
  topKTopPAlgorithm,
  topKTopPFacet,
  topKTopPImperativeIR,
  topKTopPProjector,
  topKTopPStageView,
  type TopKTopPData,
  type TopKTopPStage,
} from '../src/index.js';

const data = topKTopPFacet.initialData as TopKTopPData;
const [peaked, flat] = data.contexts;

type Seg = { value: number; default?: boolean };
type Knob = { widget: string; action: string; segments?: Seg[] };
const controls = (topKTopPFacet.blocks.controls as { controls: Knob[] }).controls;
const knob = (action: string) => controls.find((c) => c.action === action)!;

// ─────────────────────────────────────────────────────────────────────────────
// 사양 표 (대조용)
// ─────────────────────────────────────────────────────────────────────────────

/** [p, k, 뾰족 남김, 뾰족 잘린 %, 평평 남김, 평평 잘린 %, 뾰족 자른 쪽, 평평 자른 쪽] */
const SPEC: [number, number, number, number, number, number, string, string][] = [
  [100, 1, 1, 12, 1, 77, 'k', 'k'],
  [100, 2, 2, 8, 2, 58, 'k', 'k'],
  [100, 3, 3, 5, 3, 41, 'k', 'k'],
  [100, 5, 5, 2, 5, 16, 'k', 'k'],
  [100, 8, 8, 0, 8, 0, 'none', 'none'],
  [90, 8, 2, 8, 6, 7, 'p', 'p'],
  [75, 8, 1, 12, 5, 16, 'p', 'p'],
  [50, 8, 1, 12, 3, 41, 'p', 'p'],
  [90, 2, 1, 12, 2, 58, 'renorm-p', 'k'],
  [90, 5, 2, 8, 5, 16, 'p', 'k'],
  [50, 3, 1, 12, 2, 58, 'p', 'renorm-p'],
];

/** measure.py 출력의 스무 조합 — [p, k, 뾰족 남김, 뾰족 %, 평평 남김, 평평 %] */
const ALL20: [number, number, number, number, number, number][] = [
  [50, 1, 1, 12, 1, 77], [50, 2, 1, 12, 1, 77], [50, 3, 1, 12, 2, 58], [50, 5, 1, 12, 2, 58], [50, 8, 1, 12, 3, 41],
  [75, 1, 1, 12, 1, 77], [75, 2, 1, 12, 2, 58], [75, 3, 1, 12, 3, 41], [75, 5, 1, 12, 4, 27], [75, 8, 1, 12, 5, 16],
  [90, 1, 1, 12, 1, 77], [90, 2, 1, 12, 2, 58], [90, 3, 1, 12, 3, 41], [90, 5, 2, 8, 5, 16], [90, 8, 2, 8, 6, 7],
  [100, 1, 1, 12, 1, 77], [100, 2, 2, 8, 2, 58], [100, 3, 3, 5, 3, 41], [100, 5, 5, 2, 5, 16], [100, 8, 8, 0, 8, 0],
];

function redivided(permille: number[], kept: number): number[] {
  let sum = 0;
  for (let i = 0; i < kept; i++) sum += permille[i];
  return permille.slice(0, kept).map((x) => roundPercent(x, sum));
}

// ─────────────────────────────────────────────────────────────────────────────
// 가짜 reactive ctx — sleep 은 곧바로 지나고, 입력은 적힌 차례로 준다
// ─────────────────────────────────────────────────────────────────────────────

type Run = {
  events: FacetRuntimeEvent[];
  /** measure 걸음마다 계기 스냅숏 */
  rounds: Record<string, number>[];
  /** 걸음 경계(sleep)마다 켜져 있던 phase */
  boundaryPhases: string[];
};

async function drive(inputs: ReactiveInputEvent[], base: TopKTopPData = data): Promise<Run> {
  const run: Run = { events: [], rounds: [], boundaryPhases: [] };
  const metrics = new Map<string, number>();
  let cancelled = false;
  let lit: string | null = null;
  const queue = [...inputs];
  const ctx = {
    data: structuredClone(base),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      run.events.push(e);
      if (e.type === 'phase') lit = (e.payload as { phase: string }).phase;
      if (e.type === 'measure') run.rounds.push(Object.fromEntries(metrics));
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      if (lit !== null) run.boundaryPhases.push(lit);
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
  await topKTopPAlgorithm(ctx as unknown as FacetContext<TopKTopPData>);
  return run;
}

const turn = (action: 'topK' | 'topP', value: number): ReactiveInputEvent => ({
  type: action,
  payload: { value, segmentIndex: 0 },
});

function phasesOfIR(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]) => {
    for (const s of stmts) {
      if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      }
      if (s.kind === 'for-range' || s.kind === 'while') walk(s.body);
    }
  };
  for (const f of ir.functions) walk(f.body);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('top-k-top-p — 1차 데이터', () => {
  it('확률은 천분율 정수, 합 1000, 큰 차례 (동률 없음), 여덟씩', () => {
    for (const c of [peaked, flat]) {
      expect(c.permille).toHaveLength(8);
      expect(c.tokens).toHaveLength(8);
      expect(c.permille.every((x) => Number.isInteger(x) && x > 0)).toBe(true);
      expect(c.permille.reduce((a, b) => a + b, 0)).toBe(1000);
      for (let i = 1; i < 8; i++) expect(c.permille[i]).toBeLessThan(c.permille[i - 1]);
    }
    expect(peaked.prompt).toBe('The opposite of hot is');
    expect(flat.prompt).toBe('For breakfast I had');
  });

  it('사다리가 손잡이 segments 와 같고 기본값이 같다', () => {
    expect(data.topKLadder).toEqual([1, 2, 3, 5, 8]);
    expect(data.topPLadder).toEqual([50, 75, 90, 100]);
    expect(knob('topK').segments!.map((s) => s.value)).toEqual(data.topKLadder);
    expect(knob('topP').segments!.map((s) => s.value)).toEqual(data.topPLadder);
    expect(knob('topK').segments!.find((s) => s.default)!.value).toBe(data.topK);
    expect(knob('topP').segments!.find((s) => s.default)!.value).toBe(data.topP);
  });

  it('32 비트 — 정수 중간값 최대 100 × 1000 을 구조로 잠근다', () => {
    const maxP = Math.max(...data.topPLadder);
    const maxMass = Math.max(...[peaked, flat].map((c) => c.permille.reduce((a, b) => a + b, 0)));
    expect(maxP).toBe(100);
    expect(maxMass).toBe(1000);
    // topP × M · run × 100 · (합 − 남은 합) × 100 + 합 // 2 모두 이 아래
    expect(maxP * maxMass + maxMass).toBeLessThan(2 ** 31);
  });
});

describe('top-k-top-p — 사양 표 대조', () => {
  it.each(SPEC)('p %i · k %i', (p, k, pk, pc, fk, fc, pw, fw) => {
    const a = cutContext(peaked.permille, k, p);
    const b = cutContext(flat.permille, k, p);
    expect([a.kept, a.cutPercent, b.kept, b.cutPercent]).toEqual([pk, pc, fk, fc]);
    expect([a.cutter, b.cutter]).toEqual([pw, fw]);
  });

  it('스무 조합 전부가 measure.py 와 같다', () => {
    for (const [p, k, pk, pc, fk, fc] of ALL20) {
      const a = cutContext(peaked.permille, k, p);
      const b = cutContext(flat.permille, k, p);
      expect([p, k, a.kept, a.cutPercent, b.kept, b.cutPercent]).toEqual([p, k, pk, pc, fk, fc]);
    }
  });

  it('"둘 중 작은 쪽" 보다 적게 남는 칸은 여섯이다', () => {
    const cells: string[] = [];
    for (const [p, k] of ALL20) {
      for (const [name, c] of [['peaked', peaked], ['flat', flat]] as const) {
        const both = cutContext(c.permille, k, p).kept;
        const kAlone = cutContext(c.permille, k, 100).kept;
        const pAlone = cutContext(c.permille, 8, p).kept;
        if (both < Math.min(kAlone, pAlone)) cells.push(`${name} p${p} k${k}`);
      }
    }
    expect(cells.sort()).toEqual(
      ['flat p50 k2', 'flat p50 k3', 'flat p50 k5', 'flat p75 k5', 'peaked p90 k2', 'peaked p90 k3'].sort(),
    );
  });

  it('다시 나눈 확률 — 평평 k2 · 평평 p90 · 뾰족 p90', () => {
    expect(redivided(flat.permille, cutContext(flat.permille, 2, 100).kept)).toEqual([55, 45]);
    expect(redivided(flat.permille, cutContext(flat.permille, 8, 90).kept)).toEqual([25, 20, 18, 15, 12, 10]);
    expect(redivided(peaked.permille, cutContext(peaked.permille, 8, 90).kept)).toEqual([96, 4]);
  });

  it('등호(c × 100 = p × M) 가 걸리는 자리 — p < 100 에서는 평평 p50 k5 하나 (toast+eggs 420 = 840 의 절반)', () => {
    const ties: string[] = [];
    for (const [p, k] of ALL20) {
      for (const [name, c] of [['peaked', peaked], ['flat', flat]] as const) {
        const cut = cutContext(c.permille, k, p);
        const stop = cut.runs[cut.kept - 1];
        if (stop * 100 === p * cut.mass && p < 100) ties.push(`${name} p${p} k${k}`);
      }
    }
    expect(ties).toEqual(['flat p50 k5']);
    // "p 이상" 이라 eggs 에서 멈춘다 — 초과로 읽으면 cereal 까지 셋이 남아 사양 표(2 · 58)와 갈린다
    expect(cutContext(flat.permille, 5, 50).kept).toBe(2);
  });
});

describe('top-k-top-p — IR 과 algorithm 이 같은 답을 낸다', () => {
  it('스무 조합 × 두 문맥 — 남김과 잘린 몫 %', () => {
    let checked = 0;
    for (const k of data.topKLadder) {
      for (const p of data.topPLadder) {
        for (const c of [peaked, flat]) {
          const cut = cutContext(c.permille, k, p);
          const kept = runIR(topKTopPImperativeIR, 'keptCount', [c.permille, k, p]);
          expect(kept).toBe(cut.kept);
          expect(runIR(topKTopPImperativeIR, 'cutPercent', [c.permille, cut.kept])).toBe(cut.cutPercent);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(40);
  });

  it('화면의 계기 = IR 답 (스무 조합을 손잡이로 모두 돈다)', async () => {
    // 첫 판(8, 100) 뒤 p 를 하나 돌리고 k 를 사다리대로 다섯 번 — p 마다 되풀이
    const inputs: ReactiveInputEvent[] = [];
    for (const p of data.topPLadder) {
      inputs.push(turn('topP', p));
      for (const k of data.topKLadder) inputs.push(turn('topK', k));
    }
    const run = await drive(inputs);
    const expected: [number, number][] = [[8, 100]];
    let k = 8;
    for (const p of data.topPLadder) {
      expected.push([k, p]);
      for (const kk of data.topKLadder) {
        k = kk;
        expected.push([k, p]);
      }
    }
    expect(run.rounds).toHaveLength(expected.length);
    run.rounds.forEach((m, i) => {
      const [kk, p] = expected[i];
      expect({ kk, p, m }).toEqual({
        kk,
        p,
        m: {
          'peaked-kept-count': runIR(topKTopPImperativeIR, 'keptCount', [peaked.permille, kk, p]),
          'flat-kept-count': runIR(topKTopPImperativeIR, 'keptCount', [flat.permille, kk, p]),
          'peaked-cut-percent': runIR(topKTopPImperativeIR, 'cutPercent', [
            peaked.permille,
            runIR(topKTopPImperativeIR, 'keptCount', [peaked.permille, kk, p]),
          ]),
          'flat-cut-percent': runIR(topKTopPImperativeIR, 'cutPercent', [
            flat.permille,
            runIR(topKTopPImperativeIR, 'keptCount', [flat.permille, kk, p]),
          ]),
        },
      });
    });
  });
});

describe('top-k-top-p — 회차별 계기 (A → B → A)', () => {
  it('k 2 → 8 → 2, 그다음 p 90 → 100 → 90 을 회차마다 사양 표와 견준다', async () => {
    const run = await drive([
      turn('topK', 2),
      turn('topK', 8),
      turn('topK', 2),
      turn('topP', 90),
      turn('topP', 100),
      turn('topP', 90),
    ]);
    const m = (pk: number, fk: number, pc: number, fc: number) => ({
      'peaked-kept-count': pk,
      'flat-kept-count': fk,
      'peaked-cut-percent': pc,
      'flat-cut-percent': fc,
    });
    expect(run.rounds).toEqual([
      m(8, 8, 0, 0), // k8 p100
      m(2, 2, 8, 58), // k2 p100
      m(8, 8, 0, 0), // k8 p100
      m(2, 2, 8, 58), // k2 p100
      m(1, 2, 12, 58), // k2 p90 — 다시 나눈 p 가 뾰족에서 cold 하나만 남긴다
      m(2, 2, 8, 58), // k2 p100
      m(1, 2, 12, 58), // k2 p90
    ]);
  });

  it('사다리 밖 값 · 우리 것이 아닌 입력은 흘려보낸다', async () => {
    const run = await drive([
      { type: 'topK', payload: { value: 4 } },
      { type: 'topP', payload: { value: '90' } },
      { type: 'other', payload: { value: 2 } },
      turn('topK', 1),
    ]);
    expect(run.rounds).toHaveLength(2);
    expect(run.rounds[1]['peaked-kept-count']).toBe(1);
    expect(run.rounds[1]['flat-cut-percent']).toBe(77);
  });
});

describe('top-k-top-p — phase', () => {
  it('algorithm 의 phase 집합 = IR 의 phase 집합 (C3)', async () => {
    const run = await drive([turn('topP', 50), turn('topK', 2)]);
    const emitted = new Set(
      run.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...phasesOfIR(topKTopPImperativeIR)].sort());
  });

  it('걸음 경계마다 켜진 phase 를 모으면 IR 의 phase 집합이다 — 기본 판 하나에서도', async () => {
    const ir = [...phasesOfIR(topKTopPImperativeIR)].sort();
    const single = await drive([]);
    expect([...new Set(single.boundaryPhases)].sort()).toEqual(ir);
    for (const [k, p] of [[1, 50], [2, 90], [5, 75]] as const) {
      const r = await drive([turn('topK', k), turn('topP', p)]);
      expect([...new Set(r.boundaryPhases)].sort()).toEqual(ir);
    }
  });

  it('phase 는 silent 로 나간다', async () => {
    const run = await drive([]);
    for (const e of run.events) if (e.type === 'phase') expect(e.silent).toBe(true);
  });
});

describe('top-k-top-p — 등록과 화면', () => {
  it('mechanismKind 는 reactive', () => {
    clearRegistry();
    registerTopKTopP();
    expect(getAlgorithmMechanismKind('topKTopP')).toBe('reactive');
  });

  it('initialData 없이도 mountView 가 던지지 않는다', () => {
    const box = document.createElement('div');
    const inst = mountView(topKTopPStageView, box, { config: {} });
    expect(box.querySelector('svg')).not.toBeNull();
    inst.destroy();
  });

  it('projector 를 거쳐 한 판을 그리면 캡션과 표지에 셈한 값이 뜬다', async () => {
    const box = document.createElement('div');
    const inst = mountView(topKTopPStageView, box, {
      config: { type: 'top-k-top-p-stage' },
      initialData: data as unknown as Record<string, unknown>,
    });
    const seen: (string | null)[] = [];
    const projector = topKTopPProjector(
      { stage: inst, codePanel: { highlightPhase: (p: string | null) => seen.push(p), destroy() {} } },
      undefined,
    );
    const run = await drive([turn('topK', 2), turn('topP', 90)]);
    for (const e of run.events) await projector.onEvent(e);
    const text = box.textContent ?? '';
    // 마지막 판은 k2 · p90 — 뾰족 cold 하나(잘린 12 %), 평평 둘(잘린 58 %)
    expect(text).toContain('Cut share — peaked: 12% · flat: 58%.');
    expect(text).toContain('Cut by: p on the rescaled rest');
    expect(text).toContain('Cut by: k');
    expect(text).toContain('k 2');
    expect(text).toContain('p 0.9');
    expect(text).not.toContain('p 90');
    expect(text).toContain('100%'); // 뾰족 cold 가 다시 나뉘어 전부
    expect(text).toContain('55%'); // 평평 toast
    expect(text).toContain('45%'); // 평평 eggs
    expect(seen).toContain('measure');
    projector.onReset?.();
    // 되감으면 화면이 처음 모습으로 — 캡션 · 표지 · 판정이 비고 칼날은 k 8 · p 1 로 돌아간다
    const after = box.textContent ?? '';
    expect(after).not.toContain('Cut by');
    expect(after).not.toContain('Cut share —');
    expect(after).toContain('k 8');
    expect(after).toContain('p 1');
    (inst as unknown as TopKTopPStage).setCaption('x');
    inst.destroy();
    expect(box.querySelector('svg')?.childNodes.length).toBe(0);
  });

  it('p 가 닿은 걸음에 곧바로 남은 합으로 다시 나눈 몫이 뜬다 (뾰족 · p 0.9 → cold 96%)', async () => {
    const box = document.createElement('div');
    const inst = mountView(topKTopPStageView, box, {
      config: {},
      initialData: data as unknown as Record<string, unknown>,
    });
    const projector = topKTopPProjector({ stage: inst }, undefined);
    const run = await drive([turn('topP', 90)]);
    // 둘째 판(k8 · p90)의 첫 reach 걸음까지만 먹인다
    const second = run.events.map((e, i) => (e.type === 'round' ? i : -1)).filter((i) => i >= 0)[1];
    const reach = run.events.findIndex(
      (e, i) => i > second && e.type === 'p-check' && (e.payload as { status: string[] }).status[0] === 'reach',
    );
    for (const e of run.events.slice(0, reach + 1)) await projector.onEvent(e);
    const cold = box.textContent ?? '';
    expect(cold).toContain('96%');
    expect(cold).toContain('4%');
    expect(cold).not.toContain('88%');
    inst.destroy();
  });

  it('데이터를 바꾸면 캡션 · 계기의 수가 따라 바뀐다 (박아 둔 수가 아니다)', async () => {
    const altered: TopKTopPData = structuredClone(data);
    altered.contexts[1].permille = [400, 300, 100, 80, 60, 30, 20, 10];
    const box = document.createElement('div');
    const inst = mountView(topKTopPStageView, box, {
      config: {},
      initialData: altered as unknown as Record<string, unknown>,
    });
    const projector = topKTopPProjector({ stage: inst }, undefined);
    const run = await drive([turn('topK', 2)], altered);
    for (const e of run.events) await projector.onEvent(e);
    const flatCut = cutContext(altered.contexts[1].permille, 2, 100).cutPercent;
    expect(flatCut).toBe(30);
    expect(run.rounds[1]['flat-cut-percent']).toBe(30);
    expect(box.textContent).toContain('Cut share — peaked: 8% · flat: 30%.');
    expect(box.textContent).toContain('57%'); // 400 / 700
    expect(box.textContent).toContain('43%'); // 300 / 700
    inst.destroy();
  });
});
