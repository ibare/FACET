// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  axisTicks,
  formatVersion,
  parseRange,
  parseVersion,
  playRound,
  semanticVersioningAlgorithm,
  semanticVersioningFacet,
  semanticVersioningImperativeIR,
  semanticVersioningStageView,
  upperOf,
  type SemanticVersioningData,
  type SemanticVersioningStage,
} from '../src/index.js';

const data = semanticVersioningFacet.initialData as SemanticVersioningData;

/** 사양 실측표 (measure.py semantic-versioning) — 대조용 */
const TABLE: Array<{
  change: number;
  receiver: number;
  version: string;
  zeroed: number;
  ends: string | null;
  verdict: string;
  installed: string;
  accepted: number;
  steps: number;
}> = [
  { change: 0, receiver: 0, version: '1.4.3', zeroed: 0, ends: '[1.4.2, 2.0.0)', verdict: 'inside', installed: '1.4.3', accepted: 1, steps: 5 },
  { change: 0, receiver: 1, version: '1.4.3', zeroed: 0, ends: '[1.4.2, 1.5.0)', verdict: 'inside', installed: '1.4.3', accepted: 1, steps: 5 },
  { change: 0, receiver: 2, version: '1.4.3', zeroed: 0, ends: null, verdict: 'locked', installed: '1.4.2', accepted: 0, steps: 4 },
  { change: 1, receiver: 0, version: '1.5.0', zeroed: 1, ends: '[1.4.2, 2.0.0)', verdict: 'inside', installed: '1.5.0', accepted: 1, steps: 5 },
  { change: 1, receiver: 1, version: '1.5.0', zeroed: 1, ends: '[1.4.2, 1.5.0)', verdict: 'above', installed: '1.4.2', accepted: 0, steps: 5 },
  { change: 1, receiver: 2, version: '1.5.0', zeroed: 1, ends: null, verdict: 'locked', installed: '1.4.2', accepted: 0, steps: 4 },
  { change: 2, receiver: 0, version: '2.0.0', zeroed: 2, ends: '[1.4.2, 2.0.0)', verdict: 'above', installed: '1.4.2', accepted: 0, steps: 5 },
  { change: 2, receiver: 1, version: '2.0.0', zeroed: 2, ends: '[1.4.2, 1.5.0)', verdict: 'above', installed: '1.4.2', accepted: 0, steps: 5 },
  { change: 2, receiver: 2, version: '2.0.0', zeroed: 2, ends: null, verdict: 'locked', installed: '1.4.2', accepted: 0, steps: 4 },
];

type Knob = { action: string; segments: Array<{ value: number; default?: boolean }> };
function knob(action: string): Knob {
  const controls = (semanticVersioningFacet.blocks.controls as { controls: unknown[] }).controls;
  const k = controls.find((c) => typeof c === 'object' && c !== null && (c as { action?: string }).action === action);
  if (!k) throw new Error(`손잡이 ${action} 없음`);
  return k as Knob;
}

/** 알고리즘을 가짜 ctx 로 돌려 판마다 걸음 · phase · 계기를 모은다 */
async function runRounds(inputs: Array<{ type: string; value: number }>) {
  const queue = [...inputs];
  let cancelled = false;
  const metrics = new Map<string, number>();
  const rounds: Array<{ phases: string[]; steps: number; metrics: Record<string, number>; events: FacetRuntimeEvent[] }> = [];
  let current = { phases: [] as string[], steps: 0, metrics: {} as Record<string, number>, events: [] as FacetRuntimeEvent[] };
  const close = () => {
    current.metrics = Object.fromEntries(metrics);
    rounds.push(current);
    current = { phases: [], steps: 0, metrics: {}, events: [] };
  };
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      current.events.push(e);
      if (e.type === 'phase') current.phases.push((e.payload as { phase: string }).phase);
    },
    metric(name: string, delta: number | 'inc') {
      if (typeof delta !== 'number') throw new Error('inc 를 쓰지 않는다');
      metrics.set(name, (metrics.get(name) ?? 0) + delta);
    },
    async sleep() {
      current.steps += 1;
      return !cancelled;
    },
    async waitForInput() {
      current.steps += 1; // 입력 대기도 걸음 경계
      close();
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await semanticVersioningAlgorithm(ctx as unknown as FacetContext<SemanticVersioningData>);
  return rounds;
}

describe('semantic-versioning', () => {
  it('아홉 칸 모두 사양 실측표와 같다', () => {
    for (const row of TABLE) {
      const r = playRound(data, row.change, row.receiver);
      expect(formatVersion(r.newVersion)).toBe(row.version);
      expect(r.zeroed.length).toBe(row.zeroed);
      expect(r.ends ? `[${formatVersion(r.ends.lower)}, ${formatVersion(r.ends.upper)})` : null).toBe(row.ends);
      expect(r.verdict).toBe(row.verdict);
      expect(formatVersion(r.installed)).toBe(row.installed);
      expect(r.accepted ? 1 : 0).toBe(row.accepted);
    }
  });

  it('IR receive 가 아홉 칸 모두 알고리즘과 같은 답 · 같은 새 버전을 낸다', () => {
    const cur = parseVersion(data.installed);
    for (const row of TABLE) {
      const rec = data.receivers[row.receiver];
      if (!rec) throw new Error('받는 쪽 없음');
      const { op, want } = parseRange(rec.range);
      const bumped = [0, 0, 0];
      const out = runIR(semanticVersioningImperativeIR, 'receive', [[...cur], row.change, op, [...want], rec.locked, bumped]);
      const r = playRound(data, row.change, row.receiver);
      const expected = r.verdict === 'locked' ? 2 : r.accepted ? 1 : 0;
      expect(out).toBe(expected);
      expect(bumped).toEqual([...r.newVersion]);
      expect(formatVersion(bumped)).toBe(row.version);
    }
  });

  it('0.x 특례 — IR upperPart 와 알고리즘 upperOf 가 같다', () => {
    const cases: Array<[number, [number, number, number], string]> = [
      [0, [0, 3, 1], '0.4.0'],
      [0, [0, 0, 4], '0.0.5'],
      [0, [1, 4, 2], '2.0.0'],
      [1, [1, 4, 2], '1.5.0'],
      [1, [0, 3, 1], '0.4.0'],
    ];
    for (const [op, want, upper] of cases) {
      expect(formatVersion(upperOf(op, want))).toBe(upper);
      const parts = [0, 1, 2].map((part) =>
        runIR(semanticVersioningImperativeIR, 'upperPart', [op, want[0], want[1], want[2], part]),
      );
      expect(parts.join('.')).toBe(upper);
    }
  });

  it('사다리가 segments[].value 와 같고 처음 값이 default 와 같다', () => {
    const change = knob('change');
    const receiver = knob('receiver');
    expect(change.segments.map((s) => s.value)).toEqual(data.changes.map((_, i) => i));
    expect(receiver.segments.map((s) => s.value)).toEqual(data.receivers.map((_, i) => i));
    expect(data.changes).toHaveLength(3);
    expect(data.receivers).toHaveLength(3);
    expect(change.segments.find((s) => s.default)?.value).toBe(data.start.change);
    expect(receiver.segments.find((s) => s.default)?.value).toBe(data.start.receiver);
  });

  it('눈금은 차례대로 넷', () => {
    expect(axisTicks(data)).toEqual(['1.4.2', '1.4.3', '1.5.0', '2.0.0']);
  });

  it('회차마다 계기 · 걸음 · phase — 기본 → 받는 쪽 ~ → 잠금 → 다시 ^ → 호환 깨짐 → 고침', async () => {
    const rounds = await runRounds([
      { type: 'receiver', value: 1 },
      { type: 'receiver', value: 2 },
      { type: 'receiver', value: 0 },
      { type: 'change', value: 2 },
      { type: 'change', value: 0 },
    ]);
    const plan: Array<[number, number]> = [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 0],
      [2, 0],
      [0, 0],
    ];
    expect(rounds).toHaveLength(plan.length);
    rounds.forEach((round, i) => {
      const [c, r] = plan[i] as [number, number];
      const row = TABLE.find((x) => x.change === c && x.receiver === r);
      if (!row) throw new Error('표 줄 없음');
      expect(round.metrics).toEqual({ accepted: row.accepted, 'zeroed-digits': row.zeroed });
      expect(round.steps).toBe(row.steps);
      const bump = ['bump-patch', 'bump-minor', 'bump-major'][c];
      const tail =
        row.verdict === 'locked'
          ? ['read-lock', 'keep-lock']
          : ['range-ends', 'compare', row.accepted ? 'accept' : 'reject'];
      expect(round.phases).toEqual([bump, ...tail]);
    });
  });

  it('알고리즘 phase 집합이 IR phase 집합과 같다', async () => {
    const irPhases = new Set<string>();
    const walk = (stmts: unknown[]) => {
      for (const s of stmts) {
        const st = s as { phase?: string; then?: unknown[]; else?: unknown[]; body?: unknown[] };
        if (st.phase) irPhases.add(st.phase);
        if (st.then) walk(st.then);
        if (st.else) walk(st.else);
        if (st.body) walk(st.body);
      }
    };
    for (const f of semanticVersioningImperativeIR.functions) walk(f.body);
    const rounds = await runRounds([
      { type: 'change', value: 0 },
      { type: 'change', value: 2 },
      { type: 'receiver', value: 1 },
      { type: 'receiver', value: 2 },
    ]);
    const algoPhases = new Set(rounds.flatMap((r) => r.phases));
    expect([...algoPhases].sort()).toEqual([...irPhases].sort());
    expect(irPhases.size).toBe(9);
  });

  it('무대가 mountView 로 서고 한 판을 받는다', () => {
    const container = document.createElement('div');
    const canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    container.appendChild(canvas);
    const inst = mountView(semanticVersioningStageView, container, { config: {}, locale: 'ko' });
    expect(typeof inst.destroy).toBe('function');
    inst.destroy();
  });

  it('올림 캡션은 0 으로 떨어진 자리를 payload 로만 말한다 — 고침은 그 말이 없다', () => {
    const container = document.createElement('div');
    const canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    container.appendChild(canvas);
    const stage = mountView(semanticVersioningStageView, container, { config: {} }) as unknown as SemanticVersioningStage;
    stage.setAxis(axisTicks(data));
    const round = { packageName: 'units', installed: '1.4.2', installedTick: 0, range: '^1.4.2', locked: false, lockLine: null, digits: [1, 4, 2] };
    const lastText = () => {
      const texts = container.querySelectorAll('text');
      return texts[texts.length - 1]?.textContent;
    };
    stage.startRound(round, 0);
    stage.bump({ change: 'fix', digit: 2, to: [1, 4, 3], tick: 1, zeroed: [] }, 0);
    expect(lastText()).toBe('Fix: patch +1');
    stage.startRound(round, 0);
    stage.bump({ change: 'breaking', digit: 0, to: [2, 0, 0], tick: 3, zeroed: [1, 2] }, 0);
    expect(lastText()).toBe('Breaking change: major +1 · dropped to 0: minor, patch');
    stage.destroy();
  });
});
