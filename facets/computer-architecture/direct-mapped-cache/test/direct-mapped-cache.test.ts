/**
 * IR 이 셈하는 값과 화면이 보이는 값이 **여섯 손잡이 값 전부에서 같은가.**
 *
 * 코드 패널은 "이 그림이 하는 일이 이 코드다" 라고 말하는 자리다. 둘이 갈리면
 * 타입도 통과하고 화면도 멀쩡한데 **코드만 거짓말을 한다** — 보는 사람은 그것을
 * 알 길이 없다. 그래서 낱낱의 자리·태그부터 합계·미스율까지 전부 맞대 본다.
 *
 * 사양이 실측으로 준 표도 함께 잠근다. 어느 한쪽이 바뀌면 여기서 먼저 깨진다.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { IRStmt } from '@ffacet/core/runtime';

import { computeDirectMappedCacheTrace } from '../src/algorithm.js';
import { directMappedCacheImperativeIR } from '../src/irs.js';
import { directMappedCacheFacet } from '../src/facet.js';

const IR = directMappedCacheImperativeIR;
const SLOTS = 8;
const SWEEPS = 3;
const SIZES = [4, 6, 8, 9, 12, 16];

/** 사양이 실측으로 준 표. 배열 크기 → [접근, 미스, 미스율]. */
const EXPECTED: Record<number, [number, number, number]> = {
  4: [12, 4, 33],
  6: [18, 6, 33],
  8: [24, 8, 33],
  9: [27, 13, 48],
  12: [36, 28, 78],
  16: [48, 48, 100],
};

/** 빈 캐시. IR 은 배열을 만들 수 없으므로 부르는 쪽이 건넨다 (irs.ts 머리말). */
function emptyCache(): number[] {
  return new Array<number>(SLOTS).fill(-1);
}

function irMisses(lineCount: number): number {
  return runIR(IR, 'sweepAll', [emptyCache(), lineCount, SLOTS, SWEEPS]) as number;
}

describe('직접 사상 캐시 — IR 과 화면', () => {
  it('사양의 실측 표를 화면이 그대로 낸다', () => {
    const table: Record<number, [number, number, number]> = {};
    for (const n of SIZES) {
      const tr = computeDirectMappedCacheTrace(n, SLOTS, SWEEPS);
      table[n] = [tr.accessCount, tr.missCount, tr.missRatePct];
    }
    expect(table).toEqual(EXPECTED);
  });

  it('여섯 손잡이 값 전부에서 IR 의 미스 수가 화면과 같다', () => {
    const mine: Record<number, number> = {};
    const theirs: Record<number, number> = {};
    for (const n of SIZES) {
      mine[n] = computeDirectMappedCacheTrace(n, SLOTS, SWEEPS).missCount;
      theirs[n] = irMisses(n);
    }
    expect(theirs).toEqual(mine);
  });

  it('여섯 손잡이 값 전부에서 IR 의 미스율이 화면과 같다', () => {
    const mine: Record<number, number> = {};
    const theirs: Record<number, number> = {};
    for (const n of SIZES) {
      const tr = computeDirectMappedCacheTrace(n, SLOTS, SWEEPS);
      mine[n] = tr.missRatePct;
      theirs[n] = runIR(IR, 'missRate', [irMisses(n), tr.accessCount]) as number;
    }
    expect(theirs).toEqual(mine);
  });

  it('여섯 손잡이 값 전부에서 IR 이 가른 두 갈래 미스가 화면과 같다', () => {
    const mine: Record<number, [number, number]> = {};
    const theirs: Record<number, [number, number]> = {};
    for (const n of SIZES) {
      const tr = computeDirectMappedCacheTrace(n, SLOTS, SWEEPS);
      mine[n] = [tr.coldCount, tr.conflictCount];
      const misses = irMisses(n);
      const conflict = runIR(IR, 'conflictMisses', [misses, n]) as number;
      theirs[n] = [misses - conflict, conflict];
    }
    expect(theirs).toEqual(mine);
    // 첫 접촉은 배열 크기만큼만 늘고, 절벽을 만드는 것은 밀려난 쪽이다.
    expect(SIZES.map((n) => mine[n]![0])).toEqual(SIZES);
    expect(SIZES.map((n) => mine[n]![1])).toEqual([0, 0, 0, 4, 16, 32]);
  });

  it('낱낱의 자리와 태그도 IR 과 화면이 같다', () => {
    const bad: string[] = [];
    for (const n of SIZES) {
      for (const a of computeDirectMappedCacheTrace(n, SLOTS, SWEEPS).accesses) {
        const slot = runIR(IR, 'slotOf', [a.lineNo, SLOTS]) as number;
        const tag = runIR(IR, 'tagOf', [a.lineNo, SLOTS]) as number;
        if (slot !== a.slot || tag !== a.tag) {
          bad.push(`n=${n} L${a.lineNo} 화면 ${a.slot}/${a.tag} ↔ IR ${slot}/${tag}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('한 걸음씩 건드려도 IR 의 히트 판정이 화면과 같다', () => {
    const bad: string[] = [];
    for (const n of SIZES) {
      const slots = emptyCache();
      for (const a of computeDirectMappedCacheTrace(n, SLOTS, SWEEPS).accesses) {
        const ok = runIR(IR, 'touch', [slots, a.lineNo, SLOTS]) as number;
        const want = a.outcome === 'hit' ? 1 : 0;
        if (ok !== want) bad.push(`n=${n} 바퀴${a.sweep} L${a.lineNo} 화면 ${a.outcome} ↔ IR ${ok}`);
      }
    }
    expect(bad).toEqual([]);
  });

  /*
   * 32비트 천장. 지금은 가장 큰 중간값이 4800 이라 넉넉하지만, 그 근거가 주석에만
   * 있으면 다음 사람이 사다리를 늘릴 때 아무도 막지 않는다. 여기서 실제로 재어
   * 구조를 잠근다 — 사다리가 커지면 이 검사가 먼저 깨진다.
   */
  it('모든 중간값이 32비트 천장 아래다', () => {
    const CEIL = 2 ** 31 - 1;
    let peak = 0;
    for (const n of SIZES) {
      const tr = computeDirectMappedCacheTrace(n, SLOTS, SWEEPS);
      peak = Math.max(peak, tr.missCount * 100 + Math.floor(tr.accessCount / 2));
    }
    expect(peak).toBe(4824);
    expect(peak).toBeLessThan(CEIL);
  });

  /*
   * C3 — algorithm 의 phase 어휘와 IR 의 phase 어휘는 집합이 정확히 같아야 한다.
   * 어긋나면 코드 패널이 재생 내내 아무 줄도 짚지 않거나 죽은 줄을 짚는데, 둘 다
   * 눈으로는 "원래 그런 것" 과 구별되지 않는다.
   */
  it('algorithm 과 IR 의 phase 어휘가 같다', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../src/algorithm.ts'), 'utf8');
    const emitted = new Set<string>();
    for (const m of source.matchAll(/\bphase\('([a-z-]+)'\)/g)) emitted.add(m[1]!);

    const declared = new Set<string>();
    const walk = (stmts: IRStmt[]): void => {
      for (const s of stmts) {
        if ('phase' in s && typeof s.phase === 'string') declared.add(s.phase);
        if (s.kind === 'if') {
          walk(s.then);
          if (s.else) walk(s.else);
        } else if (s.kind === 'for-range' || s.kind === 'while') {
          walk(s.body);
        }
      }
    };
    for (const fn of IR.functions) walk(fn.body);

    expect([...emitted].sort()).toEqual([...declared].sort());
    expect([...declared].sort()).toEqual(['hit', 'index', 'miss', 'probe', 'rate', 'split', 'sweep']);
  });

  it('선언이 화면과 같은 사다리를 들고 있다', () => {
    const d = directMappedCacheFacet.initialData as {
      sizes?: unknown;
      slotCount?: unknown;
      sweeps?: unknown;
      lineCount?: unknown;
    };
    expect(d.sizes).toEqual(SIZES);
    expect(d.slotCount).toBe(SLOTS);
    expect(d.sweeps).toBe(SWEEPS);
    expect(SIZES).toContain(d.lineCount);

    const controls = (directMappedCacheFacet.blocks.controls as { controls: Array<Record<string, unknown>> })
      .controls;
    const slider = controls.find((c) => c.widget === 'segmented-slider');
    const segments = (slider?.segments ?? []) as Array<{ value: number }>;
    expect(segments.map((s) => s.value)).toEqual(SIZES);
    // 구간 값은 수여야 한다 — 문자열이면 알고리즘의 검사를 통과하지 못한다.
    expect(segments.every((s) => typeof s.value === 'number')).toBe(true);

    // 알고리즘이 갱신하는 이름은 모두 선언되어 있어야 한다 (C5).
    const metrics = (directMappedCacheFacet.blocks.controls as { metrics: Array<{ name: string }> }).metrics;
    expect(metrics.map((m) => m.name).sort()).toEqual([
      'access-count',
      'cold-miss-count',
      'conflict-miss-count',
      'miss-rate-pct',
    ]);
  });
});
