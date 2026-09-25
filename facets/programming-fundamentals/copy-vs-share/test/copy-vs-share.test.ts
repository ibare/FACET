import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  COPY_VS_SHARE_DEFAULT_PASS,
  COPY_VS_SHARE_DEFAULT_TIMES,
  copyVsShareAlgorithm,
  copyVsShareFacet,
  copyVsShareImperativeIR,
  type CopyVsShareData,
} from '../src/index.js';

const data = copyVsShareFacet.initialData as unknown as CopyVsShareData;

type Round = { metrics: Record<string, number>; steps: number; read: number; cells: number[]; phases: string[] };

type Knob = { pass: number; times: number };

/** 기본 판 뒤에 손잡이를 차례로 돌리고, 판마다 계기 누적값 · 걸음 수 · 읽은 값을 모은다. */
async function drive(turns: Knob[]): Promise<Round[]> {
  const events: FacetRuntimeEvent[] = [];
  const totals: Record<string, number> = {};
  const rounds: Round[] = [];
  let sleeps = 0;
  let cancelled = false;
  let mark = 0;
  let sleepMark = 0;
  let current: Knob = { pass: COPY_VS_SHARE_DEFAULT_PASS, times: COPY_VS_SHARE_DEFAULT_TIMES };
  const queue = [...turns];

  const closeRound = () => {
    const slice = events.slice(mark);
    const read = slice.find((e) => e.type === 'read');
    const last = [...slice].reverse().find((e) => e.type === 'return' || e.type === 'run');
    const readValue = (read?.payload as { value?: unknown } | undefined)?.value;
    const cells = (last?.payload as { cells?: unknown } | undefined)?.cells;
    if (typeof readValue !== 'number' || !Array.isArray(cells)) throw new Error('판이 끝나지 않았다');
    rounds.push({
      metrics: { ...totals },
      steps: sleeps - sleepMark + 1,
      read: readValue,
      cells: cells as number[],
      phases: slice
        .filter((e) => e.type === 'phase')
        .map((e) => String((e.payload as { phase?: unknown }).phase)),
    });
    mark = events.length;
    sleepMark = sleeps;
  };

  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      sleeps += 1;
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      closeRound();
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return null;
      }
      const changed = next.pass !== current.pass ? 'pass' : 'times';
      current = next;
      return {
        type: changed,
        payload: { value: next[changed], segmentIndex: 0, pass: String(next.pass), times: String(next.times) },
      };
    },
  };
  await copyVsShareAlgorithm(ctx as unknown as FacetContext<CopyVsShareData>);
  return rounds;
}

/** 사양 표 — 구조에서 셈하지 않고 대조용으로만 적는다 */
const SPEC: Record<string, { value: (k: number) => number; copies: (k: number) => number; cellsEnd: (k: number) => number[] }> = {
  number: { value: () => 7, copies: (k) => k, cellsEnd: () => [2, 7, 4] },
  list: { value: (k) => 7 + k, copies: () => 0, cellsEnd: (k) => [2, 7 + k, 4] },
  cell: { value: () => 7, copies: (k) => k, cellsEnd: () => [2, 7, 4] },
};

function irAnswer(kind: string, k: number): { answer: unknown; cells: number[] } {
  const cells = data.cells.slice(); // 조합마다 새 사본 — 인터프리터는 목록을 공유로 넘긴다
  if (kind === 'number') return { answer: runIR(copyVsShareImperativeIR, 'passNumber', [data.level, k]), cells };
  if (kind === 'list') return { answer: runIR(copyVsShareImperativeIR, 'passList', [cells, data.at, k]), cells };
  return { answer: runIR(copyVsShareImperativeIR, 'passCell', [cells, data.at, k]), cells };
}

describe('copyVsShare', () => {
  it('사다리가 segments[].value 와 같고 자료의 모양이 잠겨 있다', () => {
    const controls = (copyVsShareFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const seg = (name: string) => {
      const c = controls.find((x) => x.name === name);
      return (c?.segments as Array<{ value: number; default?: boolean }>) ?? [];
    };
    expect(seg('pass').map((s) => s.value)).toEqual(data.passKinds.map((_, i) => i));
    expect(seg('times').map((s) => s.value)).toEqual(data.timesLadder);
    expect(seg('pass').find((s) => s.default)?.value).toBe(COPY_VS_SHARE_DEFAULT_PASS);
    expect(seg('times').find((s) => s.default)?.value).toBe(COPY_VS_SHARE_DEFAULT_TIMES);
    expect(data.passKinds).toEqual(['number', 'list', 'cell']);
    expect(data.timesLadder.at(-1)).toBe(4);
    expect(data.cells).toHaveLength(3);
    expect(data.at).toBeGreaterThanOrEqual(0);
    expect(data.at).toBeLessThan(data.cells.length);
  });

  it('열둘 조합 모두에서 IR 의 답 = 화면의 caller-value = 사양 표, 목록은 공유 · 수와 칸은 복사', async () => {
    const turns: Knob[] = [];
    for (let pass = 0; pass < 3; pass += 1) for (const times of data.timesLadder) turns.push({ pass, times });
    const rounds = await drive(turns);
    expect(rounds).toHaveLength(turns.length + 1);
    turns.forEach((knob, i) => {
      const round = rounds[i + 1];
      const prev = rounds[i];
      if (round === undefined || prev === undefined) throw new Error('판이 모자라다');
      const kind = data.passKinds[knob.pass] ?? '';
      const spec = SPEC[kind];
      if (spec === undefined) throw new Error(kind);
      const k = knob.times;
      const ir = irAnswer(kind, k);
      // 계기는 누적 채널 — 판 끝의 누적값이 곧 그 판의 값이다 (판 시작에 되돌리므로)
      expect(round.read).toBe(ir.answer);
      expect(round.metrics['caller-value']).toBe(ir.answer);
      expect(round.read).toBe(spec.value(k));
      expect(round.metrics.calls).toBe(k);
      expect(round.metrics.copies).toBe(spec.copies(k));
      expect(round.steps).toBe(3 * k + 1);
      expect(ir.cells).toEqual(spec.cellsEnd(k));
      expect(round.cells).toEqual(spec.cellsEnd(k));
      expect(new Set(round.phases).size).toBe(3);
    });
  });

  it('회차별 계기 — 목록 k=3 → 수 k=3 → 목록 k=3', async () => {
    const rounds = await drive([
      { pass: 0, times: 3 },
      { pass: 1, times: 3 },
    ]);
    const pick = (r: Round | undefined) => [r?.metrics.calls, r?.metrics.copies, r?.metrics['caller-value']];
    expect(pick(rounds[0])).toEqual([3, 0, 10]);
    expect(pick(rounds[1])).toEqual([3, 3, 7]);
    expect(pick(rounds[2])).toEqual([3, 0, 10]);
  });

  it('여덟 phase 가 IR 과 같다', async () => {
    const rounds = await drive([
      { pass: 0, times: 1 },
      { pass: 2, times: 1 },
    ]);
    const seen = new Set(rounds.flatMap((r) => r.phases));
    const inIR = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (typeof x === 'object' && x !== null) {
        const ph = (x as { phase?: unknown }).phase;
        if (typeof ph === 'string') inIR.add(ph);
        Object.values(x).forEach(walk);
      }
    };
    walk(copyVsShareImperativeIR.functions);
    expect([...seen].sort()).toEqual([...inIR].sort());
    expect(inIR.size).toBe(8);
  });
});
