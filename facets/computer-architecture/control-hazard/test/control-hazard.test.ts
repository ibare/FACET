// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  makeTranslator,
  mountView,
} from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, IRStmt, ReactiveInputEvent } from '@ffacet/core/runtime';
import {
  controlHazardAlgorithm,
  controlHazardFacet,
  controlHazardImperativeIR,
  controlHazardIRs,
  controlHazardProjector,
  controlHazardStageView,
  registerControlHazard,
  simulateControlHazard,
} from '../src/index.js';
import type { ControlHazardData } from '../src/index.js';

const base = controlHazardFacet.initialData as unknown as ControlHazardData;
const fresh = (): ControlHazardData => JSON.parse(JSON.stringify(base)) as ControlHazardData;

/** 사양 표 — 대조용. 알고리즘은 이것을 읽지 않는다. */
const TABLE: Record<number, { penalty: number; flushed: number; cycles: number; executed: number }> = {
  2: { penalty: 1, flushed: 3, cycles: 26, executed: 19 },
  3: { penalty: 2, flushed: 6, cycles: 29, executed: 19 },
  4: { penalty: 3, flushed: 9, cycles: 32, executed: 19 },
};
const DISCARDED_TEXT: Record<number, string[]> = {
  2: ['sw'],
  3: ['sw', 'add'],
  4: ['sw', 'add', 'sub'],
};

type Round = { stage: number; metrics: Record<string, number>; events: FacetRuntimeEvent[] };

/** 걸음 경계(sleep · waitForInput)에서 코드 패널에 남아 있던 phase — 다음 phase 에 덮이기 전의 것. */
const shownPhases = new Set<string>();

/**
 * 가짜 reactive ctx 로 알고리즘을 돌린다. `waitForInput` 에 닿을 때마다 그 판의
 * 계기를 떠 두고 다음 손잡이 입력을 건넨다. 입력이 떨어지면 취소한다.
 */
async function runRounds(inputs: ReactiveInputEvent[]): Promise<Round[]> {
  const data = fresh();
  const metrics = new Map<string, number>();
  const rounds: Round[] = [];
  let events: FacetRuntimeEvent[] = [];
  let stage = data.resolveStage;
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'round-start') {
        const p = e.payload as { resolveStage: number };
        stage = p.resolveStage;
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      const last = [...events].reverse().find((e) => e.type === 'phase');
      if (last) shownPhases.add((last.payload as { phase: string }).phase);
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const last = [...events].reverse().find((e) => e.type === 'phase');
      if (last) shownPhases.add((last.payload as { phase: string }).phase);
      // 흘린 입력 뒤에 다시 기다리는 것은 새 판이 아니다 — 발신이 있었을 때만 판을 뜬다.
      if (events.length > 0) rounds.push({ stage, metrics: Object.fromEntries(metrics), events });
      events = [];
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
  };
  await controlHazardAlgorithm(ctx as never);
  return rounds;
}

const turn = (value: number): ReactiveInputEvent => ({ type: 'resolve', payload: { value, segmentIndex: 0 } });

function irArgs(data: ControlHazardData, stage: number) {
  return [data.isBranch, data.target, data.trips, stage];
}

function collectPhases(stmts: IRStmt[], into: Set<string>): void {
  for (const s of stmts) {
    if (s.kind === 'comment') continue;
    if (s.phase) into.add(s.phase);
    if (s.kind === 'if') {
      collectPhases(s.then, into);
      if (s.else) collectPhases(s.else, into);
    }
    if (s.kind === 'while' || s.kind === 'for-range') collectPhases(s.body, into);
  }
}

describe('control-hazard — 셈', () => {
  it('사다리의 값마다 사양 표와 같다', () => {
    for (const stage of base.resolveLadder) {
      const run = simulateControlHazard(fresh(), stage);
      const row = TABLE[stage]!;
      expect({ cycles: run.cycles, flushed: run.flushed, taken: run.taken, executed: run.executed }).toEqual({
        cycles: row.cycles,
        flushed: row.flushed,
        taken: 3,
        executed: row.executed,
      });
      // 박자 = 동적 명령어 + 4 + 버린 수
      expect(run.cycles).toBe(run.executed + 4 + run.flushed);
    }
  });

  it('탈 때마다 버려지는 것은 반복 밖의 명령어다 — 목표와 헷갈리지 않는다', () => {
    const data = fresh();
    for (const stage of data.resolveLadder) {
      const run = simulateControlHazard(data, stage);
      const takenResolves = run.frames.filter((f) => f.resolve?.taken);
      expect(takenResolves).toHaveLength(3);
      for (const f of takenResolves) {
        const ops = f.resolve!.flushed.map((x) => data.program[x.pc]!.split(' ')[0]);
        expect(ops).toEqual(DISCARDED_TEXT[stage]);
      }
    }
  });

  it('분기 뒤 명령어 수 ≥ 사다리 끝 − 1 — IR 의 무조건 더하기와 등식이 서는 가정', () => {
    const data = fresh();
    const top = Math.max(...data.resolveLadder);
    data.isBranch.forEach((b, pc) => {
      if (b === 1) expect(data.program.length - 1 - pc).toBeGreaterThanOrEqual(top - 1);
    });
    // 그 가정 아래에서 탈 때마다 버리는 수는 늘 resolveStage − 1 이다.
    for (const stage of data.resolveLadder) {
      const run = simulateControlHazard(data, stage);
      for (const f of run.frames) if (f.resolve?.taken) expect(f.resolve.flushed).toHaveLength(stage - 1);
      expect(run.flushed).toBe(run.taken * (stage - 1));
    }
  });

  it('반복 횟수가 레지스터 대조와 맞는다 (r1 0 → r5 16, 한 바퀴 +4)', () => {
    expect((16 - 0) / 4).toBe(base.trips);
  });
});

describe('control-hazard — IR 과 화면이 같은 답을 낸다', () => {
  it('모든 손잡이 값에서 countCycles · countFlushed = 화면의 계기', async () => {
    const rounds = await runRounds(base.resolveLadder.map(turn));
    // 첫 판은 기본값, 이어서 사다리 값 전부.
    const seen = new Map<number, Record<string, number>>();
    for (const r of rounds) seen.set(r.stage, r.metrics);
    for (const stage of base.resolveLadder) {
      const m = seen.get(stage)!;
      const data = fresh();
      expect(runIR(controlHazardImperativeIR, 'countCycles', irArgs(data, stage))).toBe(m['cycle-count']);
      expect(runIR(controlHazardImperativeIR, 'countFlushed', irArgs(data, stage))).toBe(m['flush-count']);
    }
  });

  it('32비트 — 입력 길이와 사다리 끝을 잠그고, 중간값 최대가 32 다', () => {
    expect(base.isBranch).toHaveLength(7);
    expect(base.target).toHaveLength(7);
    expect(base.program).toHaveLength(7);
    expect(base.trips).toBe(4);
    expect(Math.max(...base.resolveLadder)).toBe(4);
    expect(runIR(controlHazardImperativeIR, 'countCycles', irArgs(fresh(), 4))).toBe(32);
  });

  it('phase 집합이 algorithm 과 irs 에서 같다 (C3)', async () => {
    const rounds = await runRounds(base.resolveLadder.map(turn));
    const algo = new Set<string>();
    for (const r of rounds)
      for (const e of r.events)
        if (e.type === 'phase') algo.add((e.payload as { phase: string }).phase);
    const ir = new Set<string>();
    for (const x of controlHazardIRs) for (const f of x.functions) collectPhases(f.body, ir);
    expect([...algo].sort()).toEqual([...ir].sort());
  });

  it('모든 phase 가 걸음 경계에서 코드 패널에 남는다 — 연달아 보내 덮이는 것이 없다', async () => {
    shownPhases.clear();
    await runRounds(base.resolveLadder.map(turn));
    const ir = new Set<string>();
    for (const x of controlHazardIRs) for (const f of x.functions) collectPhases(f.body, ir);
    expect([...shownPhases].sort()).toEqual([...ir].sort());
  });
});

describe('control-hazard — 회차별 계기', () => {
  it('EX → ID → MEM → ID → EX 로 돌려 회차마다 사양 표와 같다 (누적되지 않는다)', async () => {
    const rounds = await runRounds([turn(2), turn(4), turn(2), turn(3)]);
    expect(rounds.map((r) => r.stage)).toEqual([3, 2, 4, 2, 3]);
    for (const r of rounds) {
      const row = TABLE[r.stage]!;
      expect(r.metrics).toEqual({
        'cycle-count': row.cycles,
        'flush-count': row.flushed,
        'taken-count': 3,
      });
    }
  });

  it('사다리 밖의 값과 남의 입력은 흘린다', async () => {
    const rounds = await runRounds([
      { type: 'other', payload: { value: 2 } },
      { type: 'resolve', payload: { value: 5 } },
      { type: 'resolve', payload: { value: '2' } },
      turn(4),
    ]);
    expect(rounds.map((r) => r.stage)).toEqual([3, 4]);
  });

  it('취소되면 바로 멈춘다', async () => {
    let calls = 0;
    const ctx = {
      data: fresh(),
      cancelled: false,
      async emit() {
        calls += 1;
        if (calls === 5) ctx.cancelled = true;
      },
      metric() {},
      async sleep() {
        return !ctx.cancelled;
      },
      pollInput: () => null,
      async waitForInput(): Promise<ReactiveInputEvent> {
        throw new Error('should not wait');
      },
    };
    await controlHazardAlgorithm(ctx as never);
    expect(calls).toBeLessThan(8);
  });
});

describe('control-hazard — 선언과 등록', () => {
  it('reactive 로 등록된다', () => {
    clearRegistry();
    registerControlHazard();
    expect(getAlgorithmMechanismKind('controlHazard')).toBe('reactive');
  });

  it('사다리 = segments[].value, 기본 구간 = 처음 판정 단계', () => {
    const controls = (controlHazardFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
    const knob = controls.find((c) => c.widget === 'segmented-slider') as {
      action: string;
      segments: { value: number; default?: boolean }[];
    };
    expect(knob.action).toBe('resolve');
    expect(knob.segments.map((s) => s.value)).toEqual(base.resolveLadder);
    expect(knob.segments.find((s) => s.default)?.value).toBe(base.resolveStage);
  });

  it('메트릭 선언 이름이 알고리즘이 싣는 이름과 같다 (C5)', async () => {
    const rounds = await runRounds([]);
    const declared = (controlHazardFacet.blocks.controls as { metrics: { name: string }[] }).metrics.map((m) => m.name);
    expect(Object.keys(rounds[0]!.metrics).sort()).toEqual([...declared].sort());
  });
});

describe('control-hazard — stage 와 projector', () => {
  /** 한 판을 실제 stage 에 먹여 캡션과 viewBox 를 본다. */
  async function play(stages: number[]) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('en', controlHazardFacet.messages);
    const stage = mountView(controlHazardStageView, container, {
      config: { type: 'control-hazard-stage' },
      initialData: fresh() as unknown as Record<string, unknown>,
      t,
    });
    const canvas = container.querySelector('svg')!;
    const highlighted: (string | null)[] = [];
    const projector = controlHazardProjector(
      {
        stage,
        codePanel: { destroy() {}, highlightPhase: (p: string | null) => highlighted.push(p) },
      },
      { getSpeed: () => 1, t },
    );
    projector.onInit?.(fresh());
    const rounds = await runRounds(stages.map(turn));
    const captions: string[] = [];
    const captionNode = () => [...canvas.querySelectorAll('text')].find((n) => n.getAttribute('y') === '382');
    for (const r of rounds) {
      for (const e of r.events) {
        await projector.onEvent(e);
        if (e.type === 'resolve' || e.type === 'round-end' || e.type === 'round-start') {
          captions.push(captionNode()?.textContent ?? '');
        }
      }
    }
    const viewBox = canvas.getAttribute('viewBox');
    stage.destroy();
    container.remove();
    return { captions, highlighted, viewBox };
  }

  it('캡션의 수가 이름의 수다 — 판정 단계를 바꾸면 따라 바뀐다', async () => {
    const { captions, highlighted, viewBox } = await play([2]);
    // 첫 판 EX
    expect(captions[0]).toBe('Resolve in EX: each taken branch discards 2. Guess: not taken, keep fetching.');
    expect(captions).toContain('Cycle 6: resolved in EX — taken. Discard 2 and jump back → L');
    expect(captions).toContain('29 cycles: 3 taken × 2 = 6 discarded');
    // 둘째 판 ID
    expect(captions).toContain('Resolve in ID: each taken branch discards 1. Guess: not taken, keep fetching.');
    expect(captions).toContain('Cycle 5: resolved in ID — taken. Discard 1 and jump back → L');
    expect(captions).toContain('26 cycles: 3 taken × 1 = 3 discarded');
    expect(captions.some((c) => c.includes('not taken. The guess holds'))).toBe(true);
    expect(highlighted).toContain('flush');
    expect(viewBox).toBe(`0 0 ${controlHazardStageView.canvas.width} ${controlHazardStageView.canvas.height}`);
  });
});
