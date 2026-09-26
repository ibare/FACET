/**
 * register-allocation 고유 검수 — IR ↔ algorithm 전 조합 · 사양 표 · 회차별 계기 · 사다리.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  allocate,
  interference,
  liveness,
  regAllocAlgorithm,
  regAllocFacet,
  regAllocImperativeIR,
  toIrArgs,
  type RaInstr,
  type RegAllocData,
} from '../src/index.js';

const data = regAllocFacet.initialData as unknown as RegAllocData;
const PROG = data.program;

/** 사양 실측표 — K: 밀어냄 · 되불러옴 · 끼어든 줄 · 명령 수 · 쓴 스택 칸 · 쓴 레지스터 · 걸음(0 포함) */
const TABLE: Record<number, [number, number, number, number, number, number, number]> = {
  2: [5, 5, 10, 22, 5, 2, 18],
  3: [2, 2, 4, 16, 2, 3, 15],
  4: [0, 0, 0, 12, 0, 4, 13],
  5: [0, 0, 0, 12, 0, 4, 13],
};

function irAllocate(prog: RaInstr[], k: number, perm?: number[]): { stores: number; loads: number; total: number } {
  const { dst, srcA, srcB, nVal } = toIrArgs(prog, perm);
  const zeros = (n: number): number[] => Array.from({ length: n }, () => 0);
  const counts = [0, 0];
  const total = runIR(regAllocImperativeIR, 'allocate', [dst, srcA, srcB, nVal, k, zeros(nVal), zeros(nVal), zeros(nVal), zeros(k), zeros(nVal), counts]);
  return { stores: counts[0]!, loads: counts[1]!, total: total as number };
}

/** 식까지 적힌 섞개 — 선형 합동 생성기로 0..n-1 을 섞는다 */
function perms(n: number, count: number): number[][] {
  let s = 12345;
  const rnd = (): number => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const out: number[][] = [];
  for (let c = 0; c < count; c += 1) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j]!, p[i]!];
    }
    out.push(p);
  }
  return out;
}

const I = (op: RaInstr['op'], dst: string | null, srcs: string[], mem: string | null = null): RaInstr => ({ op, dst, srcs, mem });

describe('register-allocation — 데이터 · 사다리', () => {
  it('사다리 = segments[].value, 기본값 = default', () => {
    const controls = (regAllocFacet.blocks?.controls as { controls: { widget: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const knob = controls.find((c) => c.widget === 'segmented-slider');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.registersLadder);
    expect(knob?.segments?.find((s) => s.default)?.value).toBe(data.registers);
    expect(data.registersLadder).toEqual([2, 3, 4, 5]);
    expect(data.registersLadder[data.registersLadder.length - 1]).toBe(5);
    expect(PROG).toHaveLength(12);
  });

  it('산 구간 · 간섭 그래프 · 칠하기 — 사양 그대로', () => {
    const lv = liveness(PROG);
    const g = interference(PROG, lv);
    expect(lv.order.map((v) => `${v} (${lv.def.get(v)},${lv.last.get(v)})`).join(' · ')).toBe(
      't1 (1,6) · t2 (2,6) · t3 (3,5) · t4 (4,5) · t5 (5,10) · t6 (6,10) · t7 (7,9) · t8 (8,9) · t9 (9,11) · t10 (10,11) · t11 (11,12)',
    );
    expect(g.liveAfter).toEqual([1, 2, 3, 4, 3, 2, 3, 4, 3, 2, 1, 0]);
    expect(g.maxLive).toBe(4);
    expect(g.edges.map(([a, b]) => `${a}–${b}`).join(' · ')).toBe(
      't1–t2 · t1–t3 · t1–t4 · t1–t5 · t2–t3 · t2–t4 · t2–t5 · t3–t4 · t5–t6 · t5–t7 · t5–t8 · t5–t9 · t6–t7 · t6–t8 · t6–t9 · t7–t8 · t9–t10',
    );
    expect(lv.order.map((v) => g.color.get(v))).toEqual([1, 2, 3, 4, 3, 1, 2, 4, 2, 1, 1]);
    expect(g.colors).toBe(4);
  });
});

describe('register-allocation — 사양 실측표와 결과 명령', () => {
  for (const k of data.registersLadder) {
    it(`K ${k}`, () => {
      const r = allocate(PROG, k);
      const [stores, loads, inserted, total, slots, used, steps] = TABLE[k]!;
      expect([r.stores, r.loads, r.stores + r.loads, r.total, r.slots, r.usedRegs, r.steps.length + 1]).toEqual([
        stores,
        loads,
        inserted,
        total,
        slots,
        used,
        steps,
      ]);
      expect(r.out).toHaveLength(total);
    });
  }

  it('결과 명령 글자 — K 2 · 3 · 4 (K 5 는 K 4 와 같다)', () => {
    expect(allocate(PROG, 4).out.join(' · ')).toBe(
      'load r1, a · load r2, b · load r3, c · load r4, d · sub r3, r3, r4 · add r1, r1, r2 · load r2, e · load r4, f · mul r2, r2, r4 · mul r1, r1, r3 · sub r1, r1, r2 · store x, r1',
    );
    expect(allocate(PROG, 5).out).toEqual(allocate(PROG, 4).out);
    expect(allocate(PROG, 3).out.join(' · ')).toBe(
      'load r1, a · load r2, b · load r3, c · store [sp+0], r1 · load r1, d · sub r1, r3, r1 · load r3, [sp+0] · add r2, r3, r2 · load r3, e · store [sp+8], r1 · load r1, f · mul r1, r3, r1 · load r3, [sp+8] · mul r2, r2, r3 · sub r1, r2, r1 · store x, r1',
    );
    expect(allocate(PROG, 2).out.join(' · ')).toBe(
      'load r1, a · load r2, b · store [sp+0], r1 · load r1, c · store [sp+8], r2 · load r2, d · sub r1, r1, r2 · load r2, [sp+0] · store [sp+16], r1 · load r1, [sp+8] · add r1, r2, r1 · load r2, e · store [sp+24], r1 · load r1, f · mul r1, r2, r1 · load r2, [sp+24] · store [sp+32], r1 · load r1, [sp+16] · mul r1, r2, r1 · load r2, [sp+32] · sub r1, r1, r2 · store x, r1',
    );
  });

  it('K 3 의 걸음 차례와 동률 자리 (L4 t1 · L8 t5)', () => {
    const r = allocate(PROG, 3);
    expect(r.steps.map((s) => s.kind)).toEqual(['take', 'take', 'take', 'evict', 'take', 'reload', 'take', 'take', 'evict', 'take', 'reload', 'take', 'take', 'free']);
    const ev = r.steps.filter((s) => s.kind === 'evict');
    expect(ev.map((s) => (s.kind === 'evict' ? `L${s.line} ${s.victim} ${s.compared.map((c) => `${c.value} ${c.last}`).join(' · ')}` : ''))).toEqual([
      'L4 t1 t1 6 · t2 6 · t3 5',
      'L8 t5 t5 10 · t6 10 · t7 9',
    ]);
    expect(r.steps.map((s) => s.inserted)).toEqual([0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 4]);
  });

  it('K 2 — 동률 자리 L3 (t1 6 · t2 6 → t1) · 되불러옴 안의 밀어냄', () => {
    const r = allocate(PROG, 2);
    const first = r.steps.find((s) => s.kind === 'evict');
    expect(first?.kind === 'evict' ? `L${first.line} ${first.victim}` : '').toBe('L3 t1');
    const inner = r.steps.filter((s) => s.kind === 'reload' && s.spill !== null);
    expect(inner.map((s) => (s.kind === 'reload' && s.spill ? `L${s.line} ${s.spill.victim} ${s.spill.slotText}` : ''))).toEqual([
      'L6 t5 [sp+16]',
      'L10 t9 [sp+32]',
    ]);
  });

  it('조각 대조 — registers-are-few K 3 밀어냄 0 · spill-to-memory K 2 명령 10', () => {
    const rf = [
      I('load', 't1', [], 'a'), I('load', 't2', [], 'b'), I('load', 't3', [], 'c'), I('mul', 't4', ['t2', 't3']),
      I('add', 't5', ['t1', 't4']), I('load', 't6', [], 'd'), I('load', 't7', [], 'e'), I('sub', 't8', ['t6', 't7']),
      I('mul', 't9', ['t5', 't8']), I('store', null, ['t9'], 'x'),
    ];
    expect(allocate(rf, 3).stores).toBe(0);
    expect(irAllocate(rf, 3).stores).toBe(0);
    const sp = [
      I('load', 't1', [], 'a'), I('load', 't2', [], 'b'), I('mul', 't3', ['t1', 't2']), I('load', 't4', [], 'c'),
      I('load', 't5', [], 'd'), I('sub', 't6', ['t4', 't5']), I('add', 't7', ['t3', 't6']), I('store', null, ['t7'], 'x'),
    ];
    const s2 = allocate(sp, 2);
    expect(s2.total).toBe(10);
    expect(s2.out).toEqual(['load r1, a', 'load r2, b', 'mul r1, r1, r2', 'load r2, c', 'store [sp+0], r1', 'load r1, d', 'sub r1, r2, r1', 'load r2, [sp+0]', 'add r1, r2, r1', 'store x, r1']);
    expect(irAllocate(sp, 2).total).toBe(10);
  });
});

describe('register-allocation — IR ↔ algorithm', () => {
  it('셈할 수 없는 데이터 — 알고리즘은 던지고 IR 은 −1', () => {
    // K 1: L2 의 새 값 t2 (마지막 읽기 L4) 가 쥔 값 t1 (L3) 보다 늦게 쓰인다
    const selfFar = [I('load', 't1', [], 'a'), I('load', 't2', [], 'b'), I('store', null, ['t1'], 'x'), I('store', null, ['t2'], 'y')];
    expect(() => allocate(selfFar, 1)).toThrow(/가장 늦게/);
    expect(irAllocate(selfFar, 1).total).toBe(-1);
    // K 1: L3 이 밀려난 두 값을 함께 읽는다 — 되불러올 때 밀어낼 값이 없다
    const noVictim = [I('load', 't1', [], 'a'), I('load', 't2', [], 'b'), I('add', 't3', ['t1', 't2']), I('store', null, ['t3'], 'x')];
    expect(() => allocate(noVictim, 1)).toThrow();
    expect(irAllocate(noVictim, 1).total).toBe(-1);
  });

  it('네 K 모두 밀어냄 · 되불러옴 · 명령 수가 같다', () => {
    for (const k of data.registersLadder) {
      const a = allocate(PROG, k);
      expect(irAllocate(PROG, k)).toEqual({ stores: a.stores, loads: a.loads, total: a.total });
    }
  });

  it('값 번호를 섞어도 같다 (마흔 번 × 넷)', () => {
    for (const p of perms(11, 40)) {
      for (const k of data.registersLadder) {
        const a = allocate(PROG, k);
        expect(irAllocate(PROG, k, p)).toEqual({ stores: a.stores, loads: a.loads, total: a.total });
      }
    }
  });
});

describe('register-allocation — 회차별 계기 (K 3 → 2 → 3 → 5)', () => {
  it('판이 끝날 때마다 사양 표와 같고, 판 머리에서 0 · 12 · 4 로 돌아간다', async () => {
    const inputs = [2, 3, 5];
    const metrics = new Map<string, number>();
    const atRoundStart: string[] = [];
    const atRoundEnd: string[] = [];
    const snap = (): string => `${metrics.get('inserted-lines')} · ${metrics.get('instr-count')} · ${metrics.get('max-live')}`;
    let rounds = 0;
    const ctx = {
      data: JSON.parse(JSON.stringify(data)) as RegAllocData,
      cancelled: false,
      async emit(e: FacetRuntimeEvent) {
        if (e.type === 'round') rounds += 1;
      },
      metric(name: string, d: number | 'inc') {
        if (typeof d !== 'number') throw new Error('inc 를 쓰지 않는다');
        metrics.set(name, (metrics.get(name) ?? 0) + d);
      },
      async sleep() {
        if (metrics.size > 0 && atRoundStart.length < rounds) atRoundStart.push(snap());
        return true;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        atRoundEnd.push(snap());
        const v = inputs.shift();
        if (v === undefined) {
          ctx.cancelled = true;
          return { type: 'none' };
        }
        return { type: 'registers', payload: { value: v, segmentIndex: 0, registers: String(v) } };
      },
    };
    await regAllocAlgorithm(ctx as unknown as FacetContext<RegAllocData>);
    expect(atRoundStart).toEqual(['0 · 12 · 4', '0 · 12 · 4', '0 · 12 · 4', '0 · 12 · 4']);
    expect(atRoundEnd).toEqual(['4 · 16 · 4', '10 · 22 · 4', '4 · 16 · 4', '0 · 12 · 4']);
  });
});
