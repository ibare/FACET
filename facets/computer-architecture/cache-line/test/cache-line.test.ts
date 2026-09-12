/**
 * IR 과 화면이 같은 답을 내는가 — 네 라인 크기 × 두 접근 방식, 여덟 칸 전부.
 *
 * 화면 쪽 수는 **실제 알고리즘을 돌려서** 받는다. 같은 셈을 하는 순수 함수를
 * 하나 더 두고 그것과 견주면 둘이 나란히 틀릴 수 있다. 재는 자리는 화면이
 * 실제로 받는 `mark` 이벤트여야 한다.
 *
 * 사양의 표도 함께 못박는다. IR 과 화면이 서로 같기만 하고 둘 다 사양과 다르면
 * 자기들끼리만 맞는 검사가 되기 때문이다.
 */

import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { getAlgorithmMechanismKind } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent, ReactiveInputEvent } from '@ffacet/core/runtime';
import type { IR, IRStmt } from '@ffacet/core';

import { cacheLineAlgorithm, cacheLineRate } from '../src/algorithm.js';
import type { CacheLineData } from '../src/algorithm.js';
import { cacheLineFacet } from '../src/facet.js';
import { cacheLineImperativeIR } from '../src/irs.js';
import { registerCacheLine } from '../src/index.js';

/** 사양의 여덟 칸. */
const EXPECTED = [
  { lineSize: 4, sequential: 32, strided: 32 },
  { lineSize: 8, sequential: 16, strided: 32 },
  { lineSize: 16, sequential: 8, strided: 32 },
  { lineSize: 32, sequential: 4, strided: 16 },
];

const DATA = cacheLineFacet.initialData as unknown as CacheLineData;
const MAX_SLOTS = DATA.totalBytes / DATA.elementBytes;

type Mark = { lineSize: number; track: string; hit: boolean };

function strideOf(trackId: string): number {
  const track = DATA.tracks.find((x) => x.id === trackId);
  if (!track) throw new Error(`알 수 없는 트랙: ${trackId}`);
  return track.strideElements;
}

/**
 * 알고리즘을 돌려 `mark` 를 모은다.
 *
 * `sizes` 를 차례로 손잡이처럼 넣고, 다 쓰면 취소로 끝낸다 — 러너의 reset/destroy
 * 가 `waitForInput` 을 reject 하는 것과 같은 모양이다.
 */
async function replay(sizes: number[]): Promise<{ marks: Mark[]; phases: Set<string> }> {
  const data = structuredClone(DATA);
  const marks: Mark[] = [];
  const phases = new Set<string>();
  let lineSize = data.lineSize;
  let cancelled = false;
  let cursor = 0;

  const ctx = {
    data,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      const p = event.payload as Record<string, unknown> | undefined;
      if (typeof p !== 'object' || p === null) return;
      if (event.type === 'phase' && typeof p.phase === 'string') phases.add(p.phase);
      if (event.type === 'state-changed' && event.target === 'config' && typeof p.lineSize === 'number') {
        lineSize = p.lineSize;
      }
      if (event.type === 'mark' && typeof p.track === 'string' && typeof p.hit === 'boolean') {
        marks.push({ lineSize, track: p.track, hit: p.hit });
      }
    },
    metric(): void {},
    async sleep(): Promise<boolean> {
      return true;
    },
    pollInput(): ReactiveInputEvent | null {
      return null;
    },
    async waitForInput(): Promise<ReactiveInputEvent> {
      if (cursor < sizes.length) {
        const value = sizes[cursor];
        cursor += 1;
        return { type: 'lineSize', payload: { value } };
      }
      cancelled = true;
      throw new Error('cancelled');
    },
  };

  await cacheLineAlgorithm(ctx as unknown as FacetContext<CacheLineData>);
  return { marks, phases };
}

/** IR 이 세는 미스. 자리 배열은 IR 이 만들 수 없어 여기서 준다. */
function irMisses(lineSize: number, stride: number): number {
  const slots = new Array<number>(MAX_SLOTS).fill(-1);
  return runIR(cacheLineImperativeIR, 'countMisses', [
    slots,
    DATA.accessCount,
    DATA.elementBytes,
    stride,
    lineSize,
    DATA.totalBytes,
  ]) as number;
}

function irPhases(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if (s.kind !== 'comment' && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      }
      if (s.kind === 'for-range' || s.kind === 'while') walk(s.body);
    }
  };
  for (const fn of ir.functions) walk(fn.body);
  return out;
}

describe('캐시 라인', () => {
  it('화면이 보이는 미스 수가 사양의 여덟 칸과 같다', async () => {
    // 첫 판은 1차 데이터의 라인 크기(8)로 돌고, 나머지는 손잡이로 넣는다.
    const { marks } = await replay([4, 16, 32]);

    const seen = EXPECTED.map(({ lineSize }) => {
      const cell = (track: string): { accesses: number; misses: number } => {
        const rows = marks.filter((m) => m.lineSize === lineSize && m.track === track);
        return { accesses: rows.length, misses: rows.filter((m) => !m.hit).length };
      };
      const sequential = cell('sequential');
      const strided = cell('strided');
      return {
        lineSize,
        sequential: sequential.misses,
        strided: strided.misses,
        accesses: [sequential.accesses, strided.accesses],
      };
    });

    expect(seen).toEqual(
      EXPECTED.map((row) => ({ ...row, accesses: [DATA.accessCount, DATA.accessCount] })),
    );
  });

  it('IR 이 셈하는 미스 수가 화면과 같다 — 여덟 칸 전부', () => {
    const fromIR = EXPECTED.map(({ lineSize }) => ({
      lineSize,
      sequential: irMisses(lineSize, strideOf('sequential')),
      strided: irMisses(lineSize, strideOf('strided')),
    }));
    expect(fromIR).toEqual(EXPECTED);
  });

  it('미스율도 IR 과 화면이 같은 값을 낸다', () => {
    for (const row of EXPECTED) {
      for (const misses of [row.sequential, row.strided]) {
        const fromIR = runIR(cacheLineImperativeIR, 'missPercent', [
          misses,
          DATA.accessCount,
        ]) as number;
        expect(fromIR).toBe(cacheLineRate(misses, DATA.accessCount));
      }
    }
    // 4/32 는 12.5% 다. 두 셈이 같은 쪽으로 반올림하는지 못박는다.
    expect(cacheLineRate(4, 32)).toBe(13);
  });

  it('phase 어휘가 algorithm 과 IR 에서 같은 집합이다', async () => {
    const { phases } = await replay([4, 32]);
    expect([...phases].sort()).toEqual([...irPhases(cacheLineImperativeIR)].sort());
  });

  it('IR 의 중간값이 32비트 천장 아래다', () => {
    const maxStride = Math.max(...DATA.tracks.map((x) => x.strideElements));
    const maxAddress = (DATA.accessCount - 1) * maxStride * DATA.elementBytes;
    // missPercent 가 만드는 가장 큰 수 — `misses * 100 + accessCount // 2`.
    const maxPercent = DATA.accessCount * 100 + Math.floor(DATA.accessCount / 2);
    expect(Math.max(maxAddress, maxPercent)).toBeLessThan(2 ** 31 - 1);
  });

  it('손잡이 구간이 1차 데이터의 사다리와 같고 기본값이 시작 라인 크기다', () => {
    const bar = cacheLineFacet.blocks.controls as unknown as {
      controls: Array<Record<string, unknown>>;
    };
    const slider = bar.controls.find((c) => c.widget === 'segmented-slider');
    const segments = (slider?.segments ?? []) as Array<{ value: number; default?: boolean }>;
    expect(segments.map((s) => s.value)).toEqual(DATA.lineSizes);
    expect(segments.filter((s) => s.default === true).map((s) => s.value)).toEqual([
      DATA.lineSize,
    ]);
    // 구간 라벨은 LocaleStr 단일 문자열이어야 한다 — 표 하나가 열 언어를 요구한다.
    for (const seg of slider?.segments as Array<{ label: unknown }>) {
      expect(typeof seg.label).toBe('string');
    }
  });

  it('손잡이를 받으려면 reactive 로 등록되어야 한다', () => {
    registerCacheLine();
    expect(getAlgorithmMechanismKind('cacheLine')).toBe('reactive');
  });
});
