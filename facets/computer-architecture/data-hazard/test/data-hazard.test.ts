import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clearRegistry, getAlgorithmMechanismKind } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, IRStmt, ReactiveInputEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  dataHazardAlgorithm,
  dataHazardFacet,
  dataHazardImperativeIR,
  registerDataHazard,
  reorderFacts,
  scheduleDataHazard,
} from '../src/index.js';
import type { DataHazardData } from '../src/index.js';

const data = dataHazardFacet.initialData as unknown as DataHazardData;

/** 사양 표 — 대조용. */
const TABLE = [
  { cycles: 9, stalls: 0, stale: 4, r3: 5, r5: -2, r10: 0 },
  { cycles: 15, stalls: 6, stale: 0, r3: 25, r5: 23, r10: 16 },
  { cycles: 10, stalls: 1, stale: 0, r3: 25, r5: 23, r10: 16 },
  { cycles: 9, stalls: 0, stale: 0, r3: 25, r5: 23, r10: 16 },
];

/** 박자별 대조 — 실행 순서대로의 EX 박자. */
const EX_TABLE: Record<number, number[]> = {
  1: [3, 6, 9, 10, 13],
  2: [3, 5, 6, 7, 8],
  3: [3, 4, 5, 6, 7],
};

const RULE_CODE = { none: 0, wait: 1, forward: 2 } as const;

function segmentValues(): number[] {
  const controls = (dataHazardFacet.blocks.controls as { controls: { widget: string; segments?: { value: unknown; default?: boolean }[] }[] }).controls;
  const slider = controls.find((c) => c.widget === 'segmented-slider')!;
  return slider.segments!.map((s) => s.value as number);
}

/** order 대로 재배치한 배열 넷 — IR 은 배열을 짓지 못하므로 부르는 쪽이 만든다. */
function irArgs(plan: number) {
  const { order } = data.plans[plan]!;
  const ins = order.map((k) => data.instructions[k]!);
  return {
    dst: ins.map((i) => i.dst),
    srcA: ins.map((i) => i.srcA),
    srcB: ins.map((i) => i.srcB),
    isLoad: ins.map((i) => (i.op === 'lw' ? 1 : 0)),
  };
}

/** reactive ctx 흉내 — 입력을 차례로 내주고 다 떨어지면 취소한다. */
async function runRounds(start: number, inputs: number[]) {
  const d = JSON.parse(JSON.stringify(data)) as DataHazardData;
  d.plan = start;
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const rounds: { plan: number; metrics: Record<string, number>; done: Record<string, unknown> }[] = [];
  const queue: ReactiveInputEvent[] = inputs.map((v) => ({ type: 'plan', payload: { value: v, segmentIndex: v } }));
  let cancelled = false;
  let current = start;
  const ctx = {
    data: d,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'plan') current = (e.payload as { plan: number }).plan;
      if (e.type === 'done') {
        rounds.push({ plan: current, metrics: Object.fromEntries(metrics), done: e.payload as Record<string, unknown> });
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
  };
  await dataHazardAlgorithm(ctx as never);
  return { events, rounds };
}

describe('data-hazard — 셈한 값이 사양 표와 같다', () => {
  it('네 대처의 박자 · 멈춤 · 옛 값 읽기 · 최종 레지스터', () => {
    TABLE.forEach((row, plan) => {
      const s = scheduleDataHazard(data, plan);
      expect({ plan, cycles: s.cycles, stalls: s.stalls, stale: s.staleReads }).toEqual({ plan, cycles: row.cycles, stalls: row.stalls, stale: row.stale });
      expect([s.registers[3], s.registers[5], s.registers[10]]).toEqual([row.r3, row.r5, row.r10]);
    });
  });

  it('박자별 EX 가 사양의 대조와 같다', () => {
    for (const [plan, ex] of Object.entries(EX_TABLE)) {
      expect(scheduleDataHazard(data, Number(plan)).rows.map((r) => r.ex)).toEqual(ex);
    }
  });

  it('안 기다림은 옛 값을 읽은 원천과 틀린 결과 칸을 옳은 값과 함께 낸다', () => {
    const s = scheduleDataHazard(data, 0);
    const stale = s.rows.flatMap((r) => r.reads.filter((x) => x.kind === 'stale').map((x) => `I${r.index + 1}:r${x.reg}=${x.value}/${x.correct}`));
    expect(stale).toEqual(['I2:r1=0/20', 'I3:r3=0/25', 'I5:r5=0/23', 'I5:r7=0/7']);
    expect(s.wrong).toEqual([
      { reg: 3, value: 5, correct: 25 },
      { reg: 5, value: -2, correct: 23 },
      { reg: 10, value: 0, correct: 16 },
    ]);
  });
});

describe('data-hazard — IR 이 화면과 같은 답을 낸다', () => {
  it('모든 손잡이 값에서 cycle-count · stale-read-count 가 같다', () => {
    for (const plan of segmentValues()) {
      const s = scheduleDataHazard(data, plan);
      const a = irArgs(plan);
      const ex = new Array<number>(a.dst.length).fill(0);
      const cycles = runIR(dataHazardImperativeIR, 'countCycles', [a.dst, a.srcA, a.srcB, a.isLoad, RULE_CODE[s.rule], ex]);
      expect({ plan, cycles }).toEqual({ plan, cycles: s.cycles });
      expect(ex).toEqual(s.rows.map((r) => r.ex));
      const stale = s.rule === 'none' ? runIR(dataHazardImperativeIR, 'countStaleReads', [a.dst, a.srcA, a.srcB]) : 0;
      expect({ plan, stale }).toEqual({ plan, stale: s.staleReads });
    }
  });

  it('32 비트 안 — 배열 길이와 사다리 끝값을 잠근다 (중간값 최대 13)', () => {
    expect(data.instructions.length).toBe(5);
    expect(Math.max(...segmentValues())).toBe(3);
    let max = 0;
    for (const plan of segmentValues()) for (const r of scheduleDataHazard(data, plan).rows) max = Math.max(max, r.ex);
    expect(max).toBe(13);
  });

  it('phase 집합이 algorithm 과 irs 에서 같다 (C3)', () => {
    const src = readFileSync(new URL('../src/algorithm.ts', import.meta.url), 'utf8');
    const algo = new Set([...src.matchAll(/phase\('([a-z-]+)'\)/g)].map((m) => m[1]!));
    const ir = new Set<string>();
    const walk = (stmts: IRStmt[]): void => {
      for (const s of stmts) {
        if ('phase' in s && typeof s.phase === 'string') ir.add(s.phase);
        if (s.kind === 'if') {
          walk(s.then);
          if (s.else) walk(s.else);
        }
        if (s.kind === 'for-range' || s.kind === 'while') walk(s.body);
      }
    };
    for (const f of dataHazardImperativeIR.functions) walk(f.body);
    expect([...algo].sort()).toEqual([...ir].sort());
    expect(algo.size).toBe(6);
  });
});

describe('data-hazard — 선언과 등록', () => {
  it('mechanismKind 는 reactive', () => {
    clearRegistry();
    registerDataHazard();
    expect(getAlgorithmMechanismKind('dataHazard')).toBe('reactive');
  });

  it('1차 데이터의 사다리가 segments[].value 와 같고 기본값이 같다', () => {
    expect(segmentValues()).toEqual(data.plans.map((_, i) => i));
    const controls = (dataHazardFacet.blocks.controls as { controls: { widget: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const def = controls.find((c) => c.widget === 'segmented-slider')!.segments!.find((s) => s.default)!;
    expect(def.value).toBe(data.plan);
  });

  it('명령어 글이 구조 필드와 같은 명령어다', () => {
    for (const ins of data.instructions) {
      const m = /^(\w+) r(\d+), (?:(-?\d+)\(r(\d+)\)|r(\d+), r(\d+))$/.exec(ins.text)!;
      expect(m).not.toBeNull();
      expect(m[1]).toBe(ins.op);
      expect(Number(m[2])).toBe(ins.dst);
      if (ins.op === 'lw') expect([Number(m[3]), Number(m[4]), ins.srcB]).toEqual([ins.offset, ins.srcA, -1]);
      else expect([Number(m[5]), Number(m[6])]).toEqual([ins.srcA, ins.srcB]);
    }
  });

  it('문안 · 이름이 열 언어다', () => {
    const LANGS = ['en', 'ko', 'ja', 'zh', 'ar', 'es', 'fr', 'hi', 'id', 'pt'].sort();
    const locs: unknown[] = [dataHazardFacet.title, dataHazardFacet.description, ...Object.values(dataHazardFacet.messages ?? {})];
    const controls = dataHazardFacet.blocks.controls as { controls: Record<string, unknown>[]; metrics: { label: unknown }[] };
    for (const c of controls.controls) {
      if (c.label) locs.push(c.label);
      for (const s of (c.segments as { label: unknown }[] | undefined) ?? []) locs.push(s.label);
    }
    for (const m of controls.metrics) locs.push(m.label);
    locs.push((dataHazardFacet.blocks.codePanel as unknown as { label: unknown }).label);
    for (const l of locs) expect(Object.keys(l as object).sort()).toEqual(LANGS);
  });
});

describe('data-hazard — 회차마다 계기를 뜬다', () => {
  it('손잡이를 1 → 0 → 1 → 2 → 3 → 2 로 돌리면 회차마다 사양 표와 같다', async () => {
    const { rounds } = await runRounds(1, [0, 1, 2, 3, 2]);
    expect(rounds.map((r) => r.plan)).toEqual([1, 0, 1, 2, 3, 2]);
    for (const r of rounds) {
      const t = TABLE[r.plan]!;
      expect({ plan: r.plan, ...r.metrics }).toEqual({
        plan: r.plan,
        'cycle-count': t.cycles,
        'stall-count': t.stalls,
        'stale-read-count': t.stale,
      });
    }
  });

  it('처음 판에서 갈리지 않는 계기(옛 값 읽기 0)도 이름이 실린다', async () => {
    const d = JSON.parse(JSON.stringify(data)) as DataHazardData;
    const names = new Set<string>();
    let cancelled = false;
    await dataHazardAlgorithm({
      data: d,
      get cancelled() {
        return cancelled;
      },
      async emit() {},
      metric(name: string) {
        names.add(name);
      },
      async waitForInput() {
        cancelled = true;
        throw new Error('cancelled');
      },
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        return null;
      },
    } as never);
    expect([...names].sort()).toEqual(['cycle-count', 'stale-read-count', 'stall-count']);
  });

  it('쓰기는 박자 순서로 흐르고, 옛 값 읽기는 생산자의 쓰기보다 먼저 온다', async () => {
    const { events } = await runRounds(0, []);
    const seq = events
      .filter((e) => e.type === 'write' || e.type === 'operand')
      .map((e) => {
        const p = e.payload as { index: number; reg: number; kind?: string };
        return e.type === 'write' ? `w${p.reg}` : `${p.kind}${p.reg}`;
      });
    // r1 은 I2 가 읽은 뒤에야 쓰인다
    expect(seq.indexOf('stale1')).toBeLessThan(seq.indexOf('w1'));
    const wbs = events.filter((e) => e.type === 'write').map((e) => (e.payload as { wb: number }).wb);
    expect(wbs).toEqual([...wbs].sort((a, b) => a - b));
  });

  it('find-producer phase 는 제 걸음을 갖는다 — 다음 phase 전에 보이는 이벤트가 온다', async () => {
    for (const plan of [0, 1, 2, 3]) {
      const { events } = await runRounds(plan, []);
      let pending: string | null = null;
      let lookups = 0;
      for (const e of events) {
        if (e.type === 'phase') {
          const name = (e.payload as { phase: string }).phase;
          expect({ plan, overwritten: pending }).toEqual({ plan, overwritten: null });
          pending = name === 'find-producer' ? name : null;
        } else {
          if (pending && e.type === 'lookup') lookups += 1;
          pending = null;
        }
      }
      expect(lookups).toBeGreaterThan(0);
    }
  });

  it('순서 바꿈 캡션의 수는 셈한 값이다 — I4 가 I2 앞으로, 함께 쓰는 레지스터 0', () => {
    expect(reorderFacts(data, data.plans[3]!.order)).toEqual({ moved: 3, before: 1, shared: 0 });
    expect(reorderFacts(data, data.plans[1]!.order)).toEqual({ moved: -1, before: -1, shared: 0 });
    // 데이터를 바꾸면 수도 바뀐다 — I3 를 I2 앞으로 당기면 r3 를 함께 쓴다
    expect(reorderFacts(data, [0, 2, 1, 3, 4])).toEqual({ moved: 2, before: 1, shared: 1 });
  });
});
