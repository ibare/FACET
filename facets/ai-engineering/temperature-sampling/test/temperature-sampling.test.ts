// @vitest-environment happy-dom
/**
 * 온도와 표본 추출 — 사양 표 대조 · IR ↔ algorithm 전 조합 · 걸음 경계의 phase ·
 * 회차별 계기 · 사다리 · 마운트.
 */

import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  getView,
  makeTranslator,
  mountView,
  runFacet,
  type ControlSpec,
  type FacetContext,
  type FacetRuntimeEvent,
  type IRStmt,
  type ReactiveContext,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';

import {
  computeRound,
  LCG_ADD,
  LCG_MOD,
  LCG_MUL,
  lcgStates,
  registerTemperatureSampling,
  temperatureSamplingAlgorithm,
  temperatureSamplingFacet,
  temperatureSamplingImperativeIR,
  temperatureSamplingIRs,
  temperatureSamplingProjector,
  temperatureSamplingStageView,
  usedFlags,
  type TemperatureSamplingData,
} from '../src/index.js';

const data = temperatureSamplingFacet.initialData as unknown as TemperatureSamplingData;

/** 사양 표 — 대조용. [θ, T, 확률 %, 서른 번 뽑힌 수, 1 등 %, 가짓수, 되풀이] */
const TABLE: Array<[number, number, number[], number[], number, number, number]> = [
  [1, 0.25, [66, 30, 3, 1, 0, 0, 0], [24, 6, 0, 0, 0, 0, 0], 66, 2, 30],
  [1, 0.5, [48, 32, 10, 5, 3, 1, 0], [18, 8, 2, 2, 0, 0, 0], 48, 4, 26],
  [1, 1, [33, 27, 15, 11, 8, 4, 2], [12, 12, 2, 0, 3, 1, 0], 33, 5, 24],
  [1, 2, [23, 21, 16, 14, 12, 9, 6], [10, 8, 6, 1, 1, 4, 0], 23, 6, 18],
  [1.5, 0.25, [21, 12, 47, 14, 4, 0, 0], [9, 4, 13, 4, 0, 0, 0], 47, 4, 13],
  [1.5, 0.5, [21, 16, 32, 17, 10, 3, 1], [9, 6, 9, 2, 4, 0, 0], 32, 5, 15],
  [1.5, 1, [19, 17, 23, 17, 13, 7, 3], [9, 5, 10, 2, 2, 2, 0], 23, 6, 14],
  [1.5, 2, [17, 16, 19, 16, 14, 10, 7], [8, 5, 7, 4, 2, 2, 2], 19, 7, 13],
  [2.5, 0.25, [1, 1, 70, 21, 6, 1, 0], [1, 0, 24, 3, 2, 0, 0], 70, 4, 1],
  [2.5, 0.5, [6, 5, 45, 25, 14, 4, 1], [3, 0, 19, 4, 4, 0, 0], 45, 4, 3],
  [2.5, 1, [11, 10, 29, 22, 16, 9, 4], [3, 6, 10, 6, 1, 4, 0], 29, 6, 9],
  [2.5, 2, [13, 12, 21, 18, 16, 12, 8], [4, 6, 8, 6, 2, 2, 2], 21, 7, 10],
];
const rowOf = (penalty: number, temperature: number) => {
  const row = TABLE.find(([th, T]) => th === penalty && T === temperature);
  if (!row) throw new Error(`표에 없는 칸: θ ${penalty} T ${temperature}`);
  return row;
};

// ─────────────────────────────────────────────────────────────────────────────
// 가짜 reactive 문맥 — 러너 없이 알고리즘을 끝까지 돌린다.
// ─────────────────────────────────────────────────────────────────────────────

type RoundSnap = {
  temperature: number;
  penalty: number;
  metrics: Record<string, number>;
  counts: number[];
  distinct: number;
  repeats: number;
};

async function drive(inputs: ReactiveInputEvent[]): Promise<{
  rounds: RoundSnap[];
  events: FacetRuntimeEvent[];
  boundaryPhases: Set<string>;
  emittedPhases: Set<string>;
}> {
  const metrics: Record<string, number> = {};
  const events: FacetRuntimeEvent[] = [];
  const boundaryPhases = new Set<string>();
  const emittedPhases = new Set<string>();
  const rounds: RoundSnap[] = [];
  let lit: string | null = null;
  let cancelled = false;
  let temperature = data.temperature;
  let penalty = data.penalty;
  const queue = inputs.slice();
  let lastTally: { counts: number[]; distinct: number; repeats: number } | null = null;

  const ctx = {
    data: JSON.parse(JSON.stringify(data)) as TemperatureSamplingData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'phase') {
        const name = (e.payload as { phase: string }).phase;
        emittedPhases.add(name);
        lit = name; // 코드 패널의 highlightPhase 는 앞 것을 덮는다
      }
      if (e.type === 'tally') {
        const p = e.payload as { counts: number[]; distinct: number; repeats: number };
        lastTally = { counts: p.counts.slice(), distinct: p.distinct, repeats: p.repeats };
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      if (lit !== null) boundaryPhases.add(lit);
      return !cancelled;
    },
    async waitForInput() {
      if (lit !== null) boundaryPhases.add(lit);
      // 한 판이 끝났다 — 지금 계기에 떠 있는 값을 적는다.
      if (lastTally) {
        rounds.push({ temperature, penalty, metrics: { ...metrics }, ...lastTally });
        lastTally = null;
      }
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      const v = (next.payload as { value?: number } | undefined)?.value;
      if (next.type === 'temperature' && v !== undefined && data.temperatures.includes(v)) temperature = v;
      if (next.type === 'penalty' && v !== undefined && data.penalties.includes(v)) penalty = v;
      return next;
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<TemperatureSamplingData>;

  await temperatureSamplingAlgorithm(ctx as FacetContext<TemperatureSamplingData>);
  return { rounds, events, boundaryPhases, emittedPhases };
}

const knob = (type: 'temperature' | 'penalty', value: number): ReactiveInputEvent => ({
  type,
  payload: { value, segmentIndex: 0 },
});

/** 모든 칸을 지나고 A → B → A 로 되돌아오는 길. */
const PATH: ReactiveInputEvent[] = [
  knob('temperature', 0.25),
  knob('temperature', 0.5),
  knob('temperature', 2),
  knob('penalty', 1.5),
  knob('temperature', 1),
  knob('temperature', 0.5),
  knob('temperature', 0.25),
  knob('penalty', 2.5),
  knob('temperature', 0.5),
  knob('temperature', 1),
  knob('temperature', 2),
  knob('penalty', 1), // (1, 2) 로 돌아온다
  knob('penalty', 2.5), // 다시 (2.5, 2)
  knob('temperature', 0.25), // (2.5, 0.25)
  knob('penalty', 1), // (1, 0.25)
  knob('temperature', 1), // 처음 칸으로
  { type: 'speed', payload: 3 }, // 우리 것이 아닌 입력은 흘린다
  knob('temperature', 3), // 사다리 밖 값은 받지 않는다
  knob('penalty', 1.5), // (1.5, 1)
];

function phasesOf(stmts: IRStmt[], out: Set<string>): Set<string> {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
    if (s.kind === 'if') {
      phasesOf(s.then, out);
      if (s.else) phasesOf(s.else, out);
    }
    if (s.kind === 'for-range' || s.kind === 'while') phasesOf(s.body, out);
  }
  return out;
}
const irPhases = (): Set<string> => {
  const out = new Set<string>();
  for (const ir of temperatureSamplingIRs) for (const f of ir.functions) phasesOf(f.body, out);
  return out;
};

describe('temperature-sampling — 셈', () => {
  it('이미 쓴 말은 프롬프트에서 셈해 cats · dogs 다', () => {
    expect(usedFlags(data.prompt, data.words)).toEqual([1, 1, 0, 0, 0, 0, 0]);
  });

  it('선형 합동 생성기의 서른 상태가 사양과 같다', () => {
    expect(lcgStates(data.seed, data.draws)).toEqual([
      149, 11249, 57305, 38044, 35283, 24819, 26463, 18689, 25472, 9901, 21742, 57836, 12332, 7456, 34978,
      1944, 14800, 61482, 23634, 3125, 37838, 19833, 45735, 22275, 32274, 61292, 9384, 48504, 33339, 10093,
    ]);
  });

  it.each(TABLE)('θ %s · T %s — 사양 표와 같다', (penalty, temperature, pct, counts, top, distinct, repeats) => {
    const r = computeRound(data, temperature, penalty);
    expect(r.probs.map((p) => Math.round(p * 100))).toEqual(pct);
    expect(r.counts).toEqual(counts);
    expect(r.topPercent).toBe(top);
    expect(r.distinct).toBe(distinct);
    expect(r.repeats).toBe(repeats);
  });

  it('실수 여유 — u 와 누적 경계가 6 × 10⁻⁵ 보다 가깝지 않다 (동률 0)', () => {
    let min = Infinity;
    for (const [penalty, temperature] of TABLE) {
      const { probs } = computeRound(data, temperature, penalty);
      for (const s of lcgStates(data.seed, data.draws)) {
        const u = s / LCG_MOD;
        let acc = 0;
        for (const p of probs) {
          acc += p;
          min = Math.min(min, Math.abs(acc - u));
          if (u < acc) break;
        }
      }
    }
    expect(min).toBeGreaterThan(6e-5);
  });

  it('32 비트 — 데이터 크기와 정수 중간값이 int32 안이다', () => {
    expect(data.logits).toHaveLength(7);
    expect(data.words).toHaveLength(7);
    expect(data.draws).toBe(30);
    expect(data.seed).toBeLessThan(LCG_MOD);
    const maxState = Math.max(...lcgStates(data.seed, data.draws));
    expect(maxState * LCG_MUL + LCG_ADD).toBe(4_611_224);
    expect((LCG_MOD - 1) * LCG_MUL + LCG_ADD).toBeLessThan(2 ** 31 - 1);
  });
});

describe('temperature-sampling — IR 과 algorithm', () => {
  it('열두 칸 전부에서 IR 의 counts · 가짓수 · 되풀이가 algorithm 이 화면에 낸 계기와 같다', async () => {
    const { rounds } = await drive(PATH);
    const seen = new Set<string>();
    for (const round of rounds) {
      const counts = [0, 0, 0, 0, 0, 0, 0];
      const weights = [0, 0, 0, 0, 0, 0, 0];
      const used = usedFlags(data.prompt, data.words);
      const distinct = runIR(temperatureSamplingImperativeIR, 'sampleCounts', [
        data.logits.slice(),
        used,
        round.temperature,
        round.penalty,
        data.seed,
        data.draws,
        counts,
        weights,
      ]);
      expect(counts).toEqual(round.counts);
      expect(distinct).toBe(round.metrics['distinct-count']);
      expect(counts[0]! + counts[1]!).toBe(round.metrics['repeat-count']);
      seen.add(`${round.penalty}/${round.temperature}`);
    }
    expect(seen.size).toBe(12);
  });

  it('회차마다 계기가 사양 표와 같다 — 판을 거듭해도 쌓이지 않는다', async () => {
    const { rounds } = await drive(PATH);
    // 첫 판 + 손잡이 입력 17 (흘린 둘은 판을 만들지 않는다)
    expect(rounds).toHaveLength(1 + PATH.length - 2);
    for (const round of rounds) {
      const [, , , counts, top, distinct, repeats] = rowOf(round.penalty, round.temperature);
      expect(round.metrics).toEqual({ 'top-percent': top, 'distinct-count': distinct, 'repeat-count': repeats });
      expect(round.counts).toEqual(counts);
      expect(round.distinct).toBe(distinct);
      expect(round.repeats).toBe(repeats);
    }
  });

  it('phase — algorithm 이 보낸 집합, 걸음 경계마다 켜진 집합, IR 의 집합이 모두 같다', async () => {
    const { emittedPhases, boundaryPhases } = await drive([knob('penalty', 2.5)]);
    const want = irPhases();
    expect([...want].sort()).toEqual(['draw', 'penalize', 'scale', 'softmax', 'tally']);
    expect([...emittedPhases].sort()).toEqual([...want].sort());
    expect([...boundaryPhases].sort()).toEqual([...want].sort());
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await drive([]);
    for (const e of events) if (e.type === 'phase') expect(e.silent).toBe(true);
    for (const e of events) if (e.type !== 'phase') expect(e.silent).not.toBe(true);
  });
});

describe('temperature-sampling — 선언과 등록', () => {
  it('mechanismKind 는 reactive 다', () => {
    clearRegistry();
    registerTemperatureSampling();
    expect(getAlgorithmMechanismKind('temperatureSampling')).toBe('reactive');
    expect(getView('temperature-sampling-stage')).toBe(temperatureSamplingStageView);
  });

  it('손잡이 사다리 = initialData 의 사다리, 기본값 = 처음 값', () => {
    const controls = (temperatureSamplingFacet.blocks['controls'] as { controls: ControlSpec[] }).controls;
    const slider = (action: string) => {
      const c = controls.find((x) => x.action === action);
      if (!c) throw new Error(action);
      return c as ControlSpec & { segments: Array<{ value: number; default?: boolean }> };
    };
    const t = slider('temperature');
    const p = slider('penalty');
    expect(t.segments.map((s) => s.value)).toEqual(data.temperatures);
    expect(p.segments.map((s) => s.value)).toEqual(data.penalties);
    expect(t.segments.find((s) => s.default)?.value).toBe(data.temperature);
    expect(p.segments.find((s) => s.default)?.value).toBe(data.penalty);
    // 사다리 끝값 — 데이터가 커지면 여기서 먼저 깨진다
    expect(Math.min(...data.temperatures)).toBe(0.25);
    expect(Math.max(...data.penalties)).toBe(2.5);
  });

  it('이름이 서로 맞는다', () => {
    expect(temperatureSamplingFacet.algorithm).toBe('module:temperatureSampling');
    expect(temperatureSamplingFacet.projector).toBe('module:temperatureSamplingProjector');
    expect(temperatureSamplingImperativeIR.algorithm).toBe('temperatureSampling');
    expect(temperatureSamplingImperativeIR.id).toBe('temperature-sampling-imperative');
    expect(temperatureSamplingFacet.blocks['stage']?.type).toBe('temperature-sampling-stage');
    expect(temperatureSamplingFacet.initialData.type).toBe('temperature-sampling');
  });
});

describe('temperature-sampling — 화면', () => {
  it('initialData 없이 마운트해도 던지지 않는다', () => {
    const c = document.createElement('div');
    const inst = mountView(temperatureSamplingStageView, c, { config: {} });
    expect(c.querySelector('svg')).not.toBeNull();
    inst.destroy();
  });

  it('캡션의 수가 계기와 같다 — projector 를 거쳐 한 판을 곧바로 먹인다', async () => {
    const c = document.createElement('div');
    const t = makeTranslator('en', temperatureSamplingFacet.messages);
    const stage = mountView(temperatureSamplingStageView, c, {
      config: {},
      initialData: JSON.parse(JSON.stringify(data)),
      locale: 'en',
      t,
    });
    const proj = temperatureSamplingProjector({ stage }, { getSpeed: () => 1, t });
    const { events } = await drive([knob('penalty', 2.5)]);
    // 둘째 판(θ 2.5 · T 1)의 끝까지 먹인다
    for (const e of events) await proj.onEvent({ ...e, payload: e.payload });
    const caption = [...c.querySelectorAll('text')].map((x) => x.textContent ?? '').find((s) => s.includes('draws:'));
    expect(caption).toBe('30 draws: 6 kinds, 9 repeats of words already said.');
    stage.destroy();
  });

  it('러너 위에서 한 판을 끝까지 돈다 — 세로가 바뀌지 않고 캡션이 계기와 같다', async () => {
    clearRegistry();
    registerTemperatureSampling();
    const c = document.createElement('div');
    document.body.appendChild(c);
    const handle = runFacet(temperatureSamplingFacet, c, { locale: 'en' });
    handle.setSpeed(100);
    const svg = () => c.querySelector('[data-block-ref="stage"] svg');
    const before = svg()?.getAttribute('viewBox');
    const deadline = Date.now() + 8000;
    let caption = '';
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      caption = [...c.querySelectorAll('[data-block-ref="stage"] text')].map((x) => x.textContent ?? '').find((s) => s.includes('draws:')) ?? '';
      if (caption !== '') break;
    }
    expect(caption).toBe('30 draws: 5 kinds, 24 repeats of words already said.');
    expect(svg()?.getAttribute('viewBox')).toBe(before);
    handle.destroy();
  }, 15000);

  it('데이터를 바꿔도 캡션의 수는 그 데이터의 셈이다 — 상수로 박힌 수가 아니다', async () => {
    clearRegistry();
    registerTemperatureSampling();
    const changed = {
      ...temperatureSamplingFacet,
      initialData: { ...temperatureSamplingFacet.initialData, prompt: 'I like birds. I like', seed: 7, draws: 20 },
    };
    const want = computeRound(changed.initialData as unknown as TemperatureSamplingData, 1, 1);
    expect(want.repeats).toBe(want.counts[2]); // 이미 쓴 말은 birds 하나
    const c = document.createElement('div');
    document.body.appendChild(c);
    const handle = runFacet(changed, c, { locale: 'en' });
    handle.setSpeed(100);
    const deadline = Date.now() + 8000;
    let caption = '';
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      caption = [...c.querySelectorAll('[data-block-ref="stage"] text')].map((x) => x.textContent ?? '').find((s) => s.includes('draws:')) ?? '';
      if (caption !== '') break;
    }
    expect(caption).toBe(`20 draws: ${want.distinct} kinds, ${want.repeats} repeats of words already said.`);
    handle.destroy();
  }, 15000);
});
