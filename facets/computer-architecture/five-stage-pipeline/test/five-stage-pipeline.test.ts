// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  mountView,
  type FacetRuntimeEvent,
  type IRStmt,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';

import {
  computeFiveStagePipelineRound,
  fiveStagePipelineAlgorithm,
  fiveStagePipelineFacet,
  fiveStagePipelineImperativeIR,
  fiveStagePipelineProjector,
  fiveStagePipelineStageView,
  registerFiveStagePipeline,
  type FiveStagePipelineData,
  type FiveStagePipelineStage,
} from '../src/index.js';

const data = fiveStagePipelineFacet.initialData as FiveStagePipelineData;
const STAGES = data.stageCount;

/** 사양 표 — 대조용. */
const SPEC: Record<number, { pipe: number; serial: number; latency: number; speedup: number; util: number }> = {
  1: { pipe: 5, serial: 5, latency: 5, speedup: 100, util: 20 },
  2: { pipe: 6, serial: 10, latency: 5, speedup: 167, util: 33 },
  4: { pipe: 8, serial: 20, latency: 5, speedup: 250, util: 50 },
  8: { pipe: 12, serial: 40, latency: 5, speedup: 333, util: 67 },
  16: { pipe: 20, serial: 80, latency: 5, speedup: 400, util: 80 },
};

/** 걸음 경계(sleep · 입력 대기)에서 코드 패널에 남아 있는 phase — 마지막 것이 앞 것을 덮는다. */
const heldPhases = new Set<string>();

type Round = {
  count: number;
  metrics: Record<string, number>;
  events: FacetRuntimeEvent[];
};

/**
 * reactive ctx 를 흉내 내 알고리즘을 돌린다. 판이 끝날 때마다 그때 보이는 계기를 뜨고,
 * 손잡이 입력을 차례로 넣는다. 입력이 떨어지면 취소한다.
 */
async function runRounds(inputs: Array<number | ReactiveInputEvent>, d: FiveStagePipelineData = data): Promise<Round[]> {
  const metrics = new Map<string, number>();
  const rounds: Round[] = [];
  let events: FacetRuntimeEvent[] = [];
  let count = d.startCount;
  let cancelled = false;
  let lastPhase: string | null = null;
  const queue = [...inputs];
  const ctx = {
    data: structuredClone(d),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'phase') lastPhase = (e.payload as { phase: string }).phase;
      if (e.type === 'round-start') count = (e.payload as { count: number }).count;
      if (e.type === 'round-end') {
        rounds.push({ count, metrics: Object.fromEntries(metrics), events });
        events = [];
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      if (lastPhase) heldPhases.add(lastPhase);
      return !cancelled;
    },
    async waitForInput(): Promise<ReactiveInputEvent> {
      if (lastPhase) heldPhases.add(lastPhase);
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      if (typeof next !== 'number') return next;
      return { type: 'count', payload: { value: next, segmentIndex: 0 } };
    },
    pollInput() {
      return null;
    },
  };
  await fiveStagePipelineAlgorithm(ctx as never);
  return rounds;
}

function phasesOfIR(stmts: IRStmt[], out: Set<string>): void {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
    if (s.kind === 'if') {
      phasesOfIR(s.then, out);
      if (s.else) phasesOfIR(s.else, out);
    }
    if (s.kind === 'for-range' || s.kind === 'while') phasesOfIR(s.body, out);
  }
}

const slider = (fiveStagePipelineFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls.find(
  (c) => c.widget === 'segmented-slider',
) as { action: string; segments: Array<{ value: number; default?: boolean }> };

describe('5단계 파이프라인 — 데이터와 선언', () => {
  it('사다리가 손잡이 구간 값과 같고, 기본 구간이 첫 판의 N 이다', () => {
    expect(slider.segments.map((s) => s.value)).toEqual(data.countLadder);
    expect(slider.segments.find((s) => s.default)?.value).toBe(data.startCount);
    expect(slider.action).toBe('count');
  });

  it('명령어 열여섯 · 단계 다섯 · 사다리 끝 16 — 32비트 여유가 이 크기에 기대고 있다', () => {
    expect(data.program).toHaveLength(16);
    expect(STAGES).toBe(5);
    expect(Math.max(...data.countLadder)).toBe(16);
    expect(data.countLadder.every((n) => n <= data.program.length)).toBe(true);
    // 중간값 최대는 serial * 100 (N=16) = 8,000
    const worst = Math.max(...data.countLadder) * STAGES * 100 + (Math.max(...data.countLadder) + STAGES - 1);
    expect(worst).toBeLessThan(10_000);
  });

  it('명령어는 서로 안 걸린다 — 목적지 r1..r16, 원천 r17..r24', () => {
    data.program.forEach((line, i) => {
      const regs = [...line.matchAll(/r(\d+)/g)].map((m) => Number(m[1]));
      expect(regs[0]).toBe(i + 1);
      expect(regs.slice(1).every((r) => r >= 17 && r <= 24)).toBe(true);
    });
  });

  it('등록하면 reactive 다', () => {
    clearRegistry();
    registerFiveStagePipeline();
    expect(getAlgorithmMechanismKind('fiveStagePipeline')).toBe('reactive');
  });
});

describe('5단계 파이프라인 — 셈', () => {
  it.each(Object.keys(SPEC).map(Number))('N=%i 의 셈이 사양 표와 같다', (n) => {
    const r = computeFiveStagePipelineRound(n, STAGES);
    const s = SPEC[n]!;
    expect(r).toMatchObject({
      pipeCycles: s.pipe,
      serialCycles: s.serial,
      latencyCycles: s.latency,
      speedupPercent: s.speedup,
      utilizationPercent: s.util,
    });
  });

  it('IR 이 모든 손잡이 값에서 계기와 같은 답을 낸다', async () => {
    const rounds = await runRounds(data.countLadder.filter((n) => n !== data.startCount));
    const seen = new Set(rounds.map((r) => r.count));
    expect([...seen].sort((a, b) => a - b)).toEqual(data.countLadder);
    for (const r of rounds) {
      const piped = runIR(fiveStagePipelineImperativeIR, 'countPipelinedCycles', [r.count, STAGES]);
      const serial = runIR(fiveStagePipelineImperativeIR, 'countSerialCycles', [r.count, STAGES]);
      const speedup = runIR(fiveStagePipelineImperativeIR, 'speedupPercent', [serial as number, piped as number]);
      expect({ n: r.count, piped, serial, speedup }).toEqual({
        n: r.count,
        piped: r.metrics['cycle-count'],
        serial: r.metrics['serial-cycle-count'],
        speedup: r.metrics['speedup-percent'],
      });
    }
  });

  it('회차마다 계기가 사양 표와 같다 — A → B → A 로 돌려도 쌓이지 않는다', async () => {
    const rounds = await runRounds([16, 4, 1, 16, 2, 8, 8, 1]);
    expect(rounds.map((r) => r.count)).toEqual([4, 16, 4, 1, 16, 2, 8, 8, 1]);
    for (const r of rounds) {
      const s = SPEC[r.count]!;
      expect({ n: r.count, ...r.metrics }).toEqual({
        n: r.count,
        'cycle-count': s.pipe,
        'serial-cycle-count': s.serial,
        'latency-cycle-count': s.latency,
        'speedup-percent': s.speedup,
      });
    }
  });

  it('박자 흐름 — i 번째는 i+1 에 IF, i+5 에 WB, 지연은 늘 5', async () => {
    const [first, second] = await runRounds([16]);
    for (const round of [first!, second!]) {
      const ticks = round.events.filter((e) => e.type === 'tick');
      expect(ticks).toHaveLength(SPEC[round.count]!.pipe);
      for (const tick of ticks) {
        const { cycle, slots } = tick.payload as { cycle: number; slots: number[] };
        slots.forEach((i, s) => {
          if (i >= 0) expect(i + 1 + s).toBe(cycle);
        });
      }
      const retires = round.events.filter((e) => e.type === 'retire').map((e) => e.payload as Record<string, number>);
      expect(retires.map((r) => r.index)).toEqual([...Array(round.count).keys()]);
      for (const r of retires) {
        expect(r.ifCycle).toBe(r.index! + 1);
        expect(r.wbCycle).toBe(r.index! + 5);
        expect(r.latencyCycles).toBe(5);
      }
      const end = round.events.find((e) => e.type === 'round-end')!.payload as Record<string, number>;
      expect(end.utilizationPercent).toBe(SPEC[round.count]!.util);
      // 꽉 찬 박자는 N-4 (N≥4), 나머지가 채움과 비움
      expect(end.fullCycles).toBe(Math.max(0, round.count - 4));
    }
  });

  it('사다리 밖의 값과 남의 입력은 흘린다', async () => {
    const rounds = await runRounds([3, { type: 'speed', payload: { value: 2 } }, { type: 'count' }, 16]);
    expect(rounds.map((r) => r.count)).toEqual([4, 16]);
  });

  it('모든 phase 가 걸음 경계에서 코드 패널에 머문다 — 곧바로 덮이는 phase 가 없다', async () => {
    heldPhases.clear();
    await runRounds([16]);
    const ir = new Set<string>();
    for (const f of fiveStagePipelineImperativeIR.functions) phasesOfIR(f.body, ir);
    expect([...heldPhases].sort()).toEqual([...ir].sort());
  });

  it('phase 집합이 algorithm 과 IR 에서 같다', async () => {
    const [round] = await runRounds([]);
    const algo = new Set(
      round!.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    const ir = new Set<string>();
    for (const f of fiveStagePipelineImperativeIR.functions) phasesOfIR(f.body, ir);
    expect([...algo].sort()).toEqual([...ir].sort());
  });
});

describe('5단계 파이프라인 — projector 캡션', () => {
  /** 캡션의 수가 그 이름의 수인지 — 데이터를 바꿔 본다. */
  it('완료 캡션은 WB 박자 · 그 명령어 글 · IF 부터의 길이를 말한다', async () => {
    const shifted: FiveStagePipelineData = {
      ...data,
      program: data.program.map((line, i) => `${line} #${i}`),
      startCount: 8,
    };
    const [round] = await runRounds([], shifted);
    const captions: string[] = [];
    const stage = new Proxy(
      {},
      {
        get: (_t, key) =>
          key === 'setCaption'
            ? (a: string, b: string) => captions.push(a, b)
            : key === 'then'
              ? undefined
              : () => undefined,
      },
    ) as unknown as FiveStagePipelineStage;
    const projector = fiveStagePipelineProjector({ stage, codePanel: stage } as never, undefined);
    projector.onInit?.(shifted);
    for (const e of round!.events) await projector.onEvent(e);
    expect(captions).toContain('Cycle 8: or r4, r23, r24 #3 leaves WB, 5 cycles after entering IF.');
    expect(captions).toContain('Cycle 12: or r8, r22, r24 #7 leaves WB, 5 cycles after entering IF.');
    expect(captions).toContain('Cycle 7: 5 of 5 stages busy.');
    expect(captions).toContain('Pipelined 12 cycles · one at a time 40 · speedup 333% · stages busy 67%');
    expect(captions).toContain('All stages full for 4 cycles · filling and draining 8 cycles');
  });
});

describe('5단계 파이프라인 — 화면의 운동', () => {
  /** 되짚기 모드(즉시)로 그려 끝 자리를 잰다. 움직임의 도착점이 셈과 같은지 본다. */
  it('판마다 직렬 끝은 5N, 파이프 끝은 N+4 로 옮겨 가고 지연 괄호의 길이는 그대로다', async () => {
    const container = document.createElement('div');
    const stage = mountView(fiveStagePipelineStageView, container, {
      config: {},
      initialData: data as unknown as Record<string, unknown>,
      isInstant: () => true,
    }) as unknown as FiveStagePipelineStage;
    const canvas = container.querySelector('svg')!;
    const projector = fiveStagePipelineProjector({ stage } as never, undefined);
    projector.onInit?.(data);

    const px = (790 - 110) / (16 * STAGES);
    const X = (cycle: number) => 110 + cycle * px;
    const lines = () => [...canvas.querySelectorAll('line')];
    const markAt = (stroke: 'primary' | 'serial') => {
      // 파이프 커서는 굵기 2 · 맨 끝에 그린 선, 직렬 끝은 그 앞의 굵기 2 선
      const thick = lines().filter((l) => l.getAttribute('stroke-width') === '2');
      const el = stroke === 'primary' ? thick[thick.length - 1]! : thick[thick.length - 2]!;
      return Number(el.getAttribute('x1'));
    };

    const rounds = await runRounds([16, 1, 4]);
    let prevPipe = -1;
    for (const round of rounds) {
      for (const e of round.events) await projector.onEvent(e);
      const n = round.count;
      expect(markAt('serial')).toBeCloseTo(X(5 * n));
      expect(markAt('primary')).toBeCloseTo(X(n + 4));
      // 지연 괄호: 마지막 명령어의 IF 앞 경계부터 WB 박자까지 — 길이 5 박자
      const lat = [...canvas.querySelectorAll('path')].find((p) => /^M[\d.]+ 254 /.test(p.getAttribute('d') ?? ''));
      const nums = (lat?.getAttribute('d') ?? '').match(/[\d.]+/g)!.map(Number);
      expect(nums[6]! - nums[0]!).toBeCloseTo(5 * px);
      expect(nums[0]).toBeCloseTo(X(n - 1));
      // 앞 판의 파이프 끝이 점선으로 남아 있다
      if (prevPipe >= 0) {
        const ghost = lines().find((l) => l.getAttribute('stroke-dasharray') === '3 3' && l.getAttribute('y1') === '196');
        expect(Number(ghost?.getAttribute('x1'))).toBeCloseTo(X(prevPipe));
      }
      prevPipe = n + 4;
    }
    stage.destroy();
  });
});
