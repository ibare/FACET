// @vitest-environment happy-dom
/**
 * number-theory 고유 검사 — IR ↔ algorithm 전 63 조합 · 사양 표 · 걸음 차례와 phase 자리 ·
 * 회차별 계기 · 사다리 · 판 머리의 걸음 경계 · 첫 그림 멱등.
 * 공통분(손잡이가 닿는가 · 덮이는 phase · 계기 누적 · transpile)은 whole-check 가 잰다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  numberTheoryAlgorithm,
  numberTheoryFacet,
  numberTheoryImperativeIR,
  numberTheoryProjector,
  numberTheoryStageView,
  type NumberTheoryData,
} from '../src/index.js';

type Input = { type: 'modulus' | 'stride'; value: number };
/** 한 판 — 이벤트와, 그 사이의 걸음 경계(sleep)를 '|' 로 끼운 차례. */
type Round = { events: FacetRuntimeEvent[]; trace: string[]; metrics: Record<string, number>; lit: string[] };

const M = [6, 7, 8, 9, 10, 11, 12];
const A = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 사양 표 (python3 sim.py number-theory) — 밟는 칸 수 = 뜀 수. 행 m, 열 a. */
const ORBIT: Record<number, number[]> = {
  6: [6, 3, 2, 3, 6, 1, 6, 3, 2],
  7: [7, 7, 7, 7, 7, 7, 1, 7, 7],
  8: [8, 4, 8, 2, 8, 4, 8, 1, 8],
  9: [9, 9, 3, 9, 9, 3, 9, 9, 1],
  10: [10, 5, 10, 5, 2, 5, 10, 5, 10],
  11: [11, 11, 11, 11, 11, 11, 11, 11, 11],
  12: [12, 6, 4, 3, 12, 2, 12, 3, 4],
};
/** 사양 표 — gcd(a, m). */
const GCD: Record<number, number[]> = {
  6: [1, 2, 3, 2, 1, 6, 1, 2, 3],
  7: [1, 1, 1, 1, 1, 1, 7, 1, 1],
  8: [1, 2, 1, 4, 1, 2, 1, 8, 1],
  9: [1, 1, 3, 1, 1, 3, 1, 1, 9],
  10: [1, 2, 1, 2, 5, 2, 1, 2, 1],
  11: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  12: [1, 2, 3, 4, 1, 6, 1, 4, 3],
};

function data(): NumberTheoryData {
  return JSON.parse(JSON.stringify(numberTheoryFacet.initialData)) as NumberTheoryData;
}

async function drive(inputs: Input[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const metrics = new Map<string, number>();
  let cur: Round = { events: [], trace: [], metrics: {}, lit: [] };
  let lastPhase: string | null = null;
  let cancelled = false;
  const queue = [...inputs];
  const close = (): void => {
    if (cur.events.length === 0) return; // 흘린 입력 뒤 다시 기다리는 자리 — 판이 아니다
    cur.metrics = Object.fromEntries(metrics);
    rounds.push(cur);
    cur = { events: [], trace: [], metrics: {}, lit: [] };
  };
  const ctx = {
    data: data(),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      cur.events.push(e);
      if (e.type === 'phase') {
        const p = e.payload as { phase?: unknown };
        lastPhase = typeof p.phase === 'string' ? p.phase : null;
        cur.trace.push(`phase:${String(p.phase)}`);
      } else cur.trace.push(e.type);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      cur.trace.push('|');
      if (lastPhase !== null) cur.lit.push(lastPhase);
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      close();
      lastPhase = null;
      const v = queue.shift();
      if (v === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: v.type, payload: { value: v.value, segmentIndex: 0, [v.type]: String(v.value) } };
    },
  };
  await numberTheoryAlgorithm(ctx as never);
  return rounds;
}

function payloadOf(r: Round, type: string): Record<string, unknown> {
  const e = r.events.find((x) => x.type === type);
  if (!e) throw new Error(`이벤트 ${type} 가 없다`);
  return e.payload as Record<string, unknown>;
}

/** 첫 판 (12, 9) 뒤로 63 조합을 모두 돈다. */
function everyCombo(): Input[] {
  const out: Input[] = [];
  for (const m of M) {
    out.push({ type: 'modulus', value: m });
    for (const a of A) out.push({ type: 'stride', value: a });
  }
  return out;
}

describe('number-theory', () => {
  it('사다리 = segments[].value, 첫 판 = default', () => {
    const d = data();
    expect(d.mLadder).toEqual(M);
    expect(d.aLadder).toEqual(A);
    expect(d.mLadder.length).toBe(7);
    expect(d.aLadder.length).toBe(9);
    expect(d.mLadder.at(-1)).toBe(12);
    expect(d.aLadder.at(-1)).toBe(9);
    const controls = (numberTheoryFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const knob = (action: string) =>
      controls.find((c) => c.action === action) as { segments: Array<{ value: number; default?: boolean }> };
    expect(knob('modulus').segments.map((s) => s.value)).toEqual(d.mLadder);
    expect(knob('stride').segments.map((s) => s.value)).toEqual(d.aLadder);
    expect(knob('modulus').segments.find((s) => s.default)?.value).toBe(d.m);
    expect(knob('stride').segments.find((s) => s.default)?.value).toBe(d.a);
    expect([d.m, d.a]).toEqual([12, 9]);
  });

  it('63 조합 모두 — IR orbitLength = 뜀 수 = 밟은 칸 = m ÷ gcd = 사양 표, IR gcdSub = gcd = 사양 표', async () => {
    const rounds = await drive(everyCombo());
    const seen = new Set<string>();
    for (const r of rounds) {
      const end = payloadOf(r, 'gcd');
      const m = end.m as number;
      const a = end.a as number;
      seen.add(`${m},${a}`);
      const orbitIR = Number(runIR(numberTheoryImperativeIR, 'orbitLength', [m, a]));
      const gcdIR = Number(runIR(numberTheoryImperativeIR, 'gcdSub', [a, m]));
      expect(Number.isInteger(orbitIR) && Number.isInteger(gcdIR)).toBe(true);
      expect(end.jumps).toBe(orbitIR);
      expect(end.g).toBe(gcdIR);
      expect(end.len).toBe(orbitIR);
      expect(orbitIR).toBe(ORBIT[m]![a - 1]);
      expect(gcdIR).toBe(GCD[m]![a - 1]);
      const visited = end.visited as number[];
      expect(visited.length).toBe(orbitIR);
      // 밟은 칸 = gcd 의 배수 전부
      const multiples: number[] = [];
      for (let k = 0; k < m; k += gcdIR) multiples.push(k);
      expect(visited).toEqual(multiples);
      // 뜀 걸음의 새 칸은 다시 밟지 않고, 돌아오는 뜀만 0 에
      const tos = r.events.filter((e) => e.type === 'jump').map((e) => (e.payload as { to: number }).to);
      expect(new Set(tos).size).toBe(tos.length);
      expect(tos.includes(0)).toBe(false);
      const back = payloadOf(r, 'back');
      expect(back.to).toBe(0);
      expect(back.count).toBe(orbitIR);
      // 걸음 수 = m ÷ gcd + 2 (걸음 0 포함)
      const steps = r.events.filter((e) => e.silent !== true).length;
      expect(steps).toBe(orbitIR + 2);
      expect(r.metrics).toEqual({ 'visited-cells': orbitIR, gcd: gcdIR });
    }
    expect(seen.size).toBe(63);
  });

  it('기본값 (12, 9) 걸음 차례 = 사양 · 넷 phase 가 모두 켜진다', async () => {
    const [r] = await drive([]);
    const steps = r!.events.filter((e) => e.silent !== true).map((e) => {
      const p = e.payload as Record<string, unknown>;
      return e.type === 'jump' || e.type === 'back' ? `${e.type} ${p.from}->${p.to} ${p.count}` : e.type;
    });
    expect(steps).toEqual(['start', 'jump 0->9 2', 'jump 9->6 3', 'jump 6->3 4', 'back 3->0 4', 'gcd']);
    expect(payloadOf(r!, 'gcd')).toMatchObject({ g: 3, len: 4, jumps: 4, visited: [0, 3, 6, 9] });
    expect(r!.lit).toEqual(['start', 'jump', 'jump', 'jump', 'back']);
    const phases = r!.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase);
    expect(new Set(phases)).toEqual(new Set(['start', 'jump', 'back', 'gcd']));
  });

  it('jump 가 켜지지 않는 조합은 한 뜀에 제자리인 넷뿐이다', async () => {
    const rounds = await drive(everyCombo());
    const noJump = new Set<string>();
    for (const r of rounds) {
      const end = payloadOf(r, 'gcd');
      if (!r.events.some((e) => e.type === 'jump')) noJump.add(`${end.m},${end.a}`);
    }
    expect([...noJump].sort()).toEqual(['6,6', '7,7', '8,8', '9,9']);
  });

  it('phase 는 걸음 발신 바로 앞 · 판 머리 init 뒤에 걸음 경계가 먼저 온다', async () => {
    const rounds = await drive([{ type: 'stride', value: 5 }, { type: 'modulus', value: 7 }]);
    for (const r of rounds) {
      expect(r.trace.slice(0, 4)).toEqual(['round', '|', 'phase:start', 'start']);
      r.trace.forEach((x, i) => {
        if (x === 'start' || x === 'jump' || x === 'back' || x === 'gcd') {
          expect(r.trace[i - 1]).toBe(`phase:${x}`);
        }
      });
    }
  });

  it('회차별 계기 — (12, 9) → (12, 5) → (12, 9) · (7, 3) · (6, 6)', async () => {
    const rounds = await drive([
      { type: 'stride', value: 5 },
      { type: 'stride', value: 9 },
      { type: 'modulus', value: 7 },
      { type: 'stride', value: 3 },
      { type: 'modulus', value: 6 },
      { type: 'stride', value: 6 },
    ]);
    expect(rounds.map((r) => r.metrics)).toEqual([
      { 'visited-cells': 4, gcd: 3 },
      { 'visited-cells': 12, gcd: 1 },
      { 'visited-cells': 4, gcd: 3 },
      { 'visited-cells': 7, gcd: 1 }, // (7, 9)
      { 'visited-cells': 7, gcd: 1 }, // (7, 3)
      { 'visited-cells': 2, gcd: 3 }, // (6, 3)
      { 'visited-cells': 1, gcd: 6 }, // (6, 6)
    ]);
  });

  it('제 손잡이의 사다리 밖 값은 던진다 · 남의 입력은 흘린다', async () => {
    await expect(drive([{ type: 'modulus', value: 13 }])).rejects.toThrow(/사다리 밖/);
    await expect(drive([{ type: 'stride', value: 0 }])).rejects.toThrow(/사다리 밖/);
    const rounds = await drive([{ type: 'other' as 'stride', value: 99 }, { type: 'stride', value: 2 }]);
    expect(rounds.map((r) => payloadOf(r, 'gcd').a)).toEqual([9, 2]);
  });

  it('무대 — 걸음 0 과 한 판, 첫 그림을 두 번 먹여도 요소 수가 같다, 되짚기가 비운다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('ko', numberTheoryFacet.messages);
    const stage = mountView(numberTheoryStageView, container, { config: {}, locale: 'ko', t, isInstant: () => true });
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('캔버스가 없다');
    const projector = numberTheoryProjector({ stage }, { getSpeed: () => 1, t });
    const [r] = await drive([]);
    // 되짚기처럼 즉시 모드로 먹인다 — 운동은 끝 상태로 건너뛴다
    const events = r!.events;
    const count = (): number => svg.querySelectorAll('*').length;
    projector.onInit?.(data());
    for (const e of events.slice(0, 3)) await projector.onEvent(e); // round · phase · start
    expect(svg.textContent).toContain('출발: 0');
    expect(svg.textContent).toContain('밟은 칸: 1');
    expect(svg.textContent).toContain('mod 12');
    for (const e of events.slice(3)) await projector.onEvent(e);
    expect(svg.textContent).toContain('gcd(9, 12) = 3 · 12 ÷ 3 = 4');
    expect(svg.textContent).toContain('밟은 칸: {0, 3, 6, 9}');
    const lines = svg.querySelectorAll('line').length;
    expect(lines).toBe(4);
    // 첫 그림(판 머리)을 두 번 — 앞 판의 줄 · 자국은 걷히고 요소 수는 같다
    await projector.onEvent(events[0]!);
    const once = count();
    await projector.onEvent(events[0]!);
    expect(count()).toBe(once);
    expect(svg.querySelectorAll('line').length).toBe(0);
    // m 이 바뀌면 칸 수가 따라간다
    await projector.onEvent({ type: 'round', payload: { m: 7, a: 3, motionMs: 0 }, silent: true });
    expect(svg.querySelectorAll('text').length).toBe(7 + 3); // 칸 글자 7 · 캡션 둘 · 가운데 하나
    // 되짚기 — onReset 이 비우고 자취를 다시 먹여도 한 벌
    projector.onReset?.();
    projector.onInit?.(data());
    for (const e of events) await projector.onEvent(e);
    const full = count();
    projector.onReset?.();
    projector.onInit?.(data());
    for (const e of events) await projector.onEvent(e);
    expect(count()).toBe(full);
    (stage as { destroy(): void }).destroy();
  });
});
