// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { FacetRuntimeEvent, IR, IRStmt } from '@ffacet/core/runtime';
import {
  interpolationSearch,
  interpolationSearchFacet,
  interpolationSearchProbeIR,
  type InterpolationSearchData,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

/** 사양이 정한 자료 — 고르게 퍼진 열둘에서 110 을 찾는다. */
const SPEC_VALUES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
const SPEC_TARGET = 110;

/** algorithm 이 발신할 수 있는 phase 어휘. irs 의 것과 같아야 한다 (C3). */
const PHASES = [
  'setup',
  'range-check',
  'probe',
  'compare',
  'found',
  'drop-left',
  'drop-right',
];

const TRANSPILERS = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(values: number[], target: number): Promise<Recorded> {
  const data: InterpolationSearchData = { type: 'array', values: [...values], target };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await interpolationSearch({
    data,
    cancelled: false,
    async emit(event) {
      events.push(event);
    },
    metric(name, delta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
  });
  return { events, metrics };
}

function irPhases(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      } else if (s.kind === 'for-range' || s.kind === 'while') {
        walk(s.body);
      }
    }
  };
  for (const f of ir.functions) walk(f.body);
  return out;
}

describe('보간 탐색 — 알고리즘', () => {
  it('겨눔 한 번에 닿고, 반씩 접는 쪽은 세 걸음이다', async () => {
    const { events, metrics } = await record(SPEC_VALUES, SPEC_TARGET);

    expect(metrics).toEqual({
      // 견줌은 세지 않는다 — 겨눔마다 한 번이라 probe-count 와 늘 같고,
      // 같은 수가 둘 뜨면 '1 대 3' 이 세 숫자 사이에서 흐려진다.
      'probe-count': 1,
      'halving-count': 3,
    });

    const probe = events.find((e) => e.type === 'probe')?.payload as Record<string, number>;
    // (110 - 10) * (11 - 0) = 1100, 1100 // 110 = 10 → 자리 10
    expect(probe).toMatchObject({
      lo: 0,
      hi: 11,
      mid: 10,
      value: 110,
      numer: 1100,
      denom: 110,
      offset: 10,
    });

    expect(
      events
        .filter((e) => e.type === 'halving-probe')
        .map((e) => (e.payload as { mid: number }).mid),
    ).toEqual([5, 8, 10]);

    expect(events.at(-1)).toMatchObject({
      type: 'done',
      payload: { probes: 1, halvings: 3, index: 10 },
    });
  });

  it('구간 밖 값은 겨누기 전에 while 조건이 막는다', async () => {
    const { events, metrics } = await record(SPEC_VALUES, 999);
    expect(metrics['probe-count']).toBeUndefined();
    expect(events.find((e) => e.type === 'range-check')?.payload).toMatchObject({ ok: false });
    expect(events.some((e) => e.type === 'search-missed')).toBe(true);
  });

  it('phase 이벤트는 전부 silent 이고 어휘가 irs 와 같다 (C3)', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_TARGET);
    const phaseEvents = events.filter((e) => e.type === 'phase');
    expect(phaseEvents.every((e) => e.silent === true)).toBe(true);

    const emitted = new Set(
      phaseEvents.map((e) => (e.payload as { phase: string }).phase),
    );
    const declared = irPhases(interpolationSearchProbeIR);
    expect([...declared].sort()).toEqual([...PHASES].sort());
    // 이 자료는 첫 겨눔에 닿으므로 한 번의 재생이 어휘 전부를 밟지는 않는다.
    for (const p of emitted) expect(declared.has(p)).toBe(true);
  });
});

describe('보간 탐색 — IR', () => {
  it('인터프리터로 돌린 결과가 배열의 실제 자리와 같다', () => {
    for (const target of [...SPEC_VALUES, 5, 115, 999]) {
      const got = runIR(interpolationSearchProbeIR, 'interpolation_search', [
        [...SPEC_VALUES],
        target,
      ]);
      expect(got, `target=${target}`).toBe(SPEC_VALUES.indexOf(target));
    }
  });

  it('값이 치우친 배열에서도 셈이 성한다', () => {
    const skew = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1000];
    for (const target of [...skew, 500]) {
      const got = runIR(interpolationSearchProbeIR, 'interpolation_search', [[...skew], target]);
      expect(got, `target=${target}`).toBe(skew.indexOf(target));
    }
  });

  it('여섯 언어에서 곱셈이 나눗셈보다 먼저다', () => {
    // 정수 나눗셈이라 순서가 결과를 바꾼다. 중첩 binop 은 괄호로 싸이므로
    // 곱셈 전체가 나눗셈의 왼쪽 피연산자로 남아야 한다.
    const expected: Record<string, string> = {
      python: 'mid = lo + (((target - arr[lo]) * (hi - lo)) // (arr[hi] - arr[lo]))',
      javascript:
        'let mid = lo + (Math.floor(((target - arr[lo]) * (hi - lo)) / (arr[hi] - arr[lo])));',
      typescript:
        'let mid = lo + (Math.floor(((target - arr[lo]) * (hi - lo)) / (arr[hi] - arr[lo])));',
      java: 'int mid = lo + (((target - arr[lo]) * (hi - lo)) / (arr[hi] - arr[lo]));',
      cpp: 'int mid = lo + (((target - arr[lo]) * (hi - lo)) / (arr[hi] - arr[lo]));',
      csharp: 'int mid = lo + (((target - arr[lo]) * (hi - lo)) / (arr[hi] - arr[lo]));',
    };
    for (const t of TRANSPILERS) {
      const { lines } = t.transpile(interpolationSearchProbeIR);
      expect(lines.length, t.id).toBeGreaterThan(0);
      expect(
        lines.every((l) => !l.code.includes('undefined')),
        t.id,
      ).toBe(true);
      const probeLine = lines.find((l) => l.phase === 'probe');
      expect(probeLine?.code.trim(), t.id).toBe(expected[t.id]);
    }
  });

  it('여섯 언어의 phase 라벨 집합이 IR 어휘와 같다', () => {
    const declared = [...irPhases(interpolationSearchProbeIR)].sort();
    for (const t of TRANSPILERS) {
      const emitted = [
        ...new Set(
          t
            .transpile(interpolationSearchProbeIR)
            .lines.map((l) => l.phase)
            .filter((p): p is string => p !== null),
        ),
      ].sort();
      expect(emitted, t.id).toEqual(declared);
    }
  });
});

describe('보간 탐색 — 선언', () => {
  it('facet 이 코드 패널과 메트릭을 사양대로 든다', () => {
    expect(interpolationSearchFacet.id).toBe('facet:interpolationSearch');
    expect(interpolationSearchFacet.initialData).toMatchObject({
      values: SPEC_VALUES,
      target: SPEC_TARGET,
    });
    // 정렬을 전제하므로 섞으면 안 된다.
    expect(interpolationSearchFacet.shuffleOnReset).toBeUndefined();
    expect(Object.keys(interpolationSearchFacet.blocks).sort()).toEqual([
      'codePanel',
      'controls',
      'stage',
    ]);
    const panel = interpolationSearchFacet.blocks.codePanel as { ir?: string };
    expect(panel.ir).toBe(`ir:${interpolationSearchProbeIR.id}`);
  });
});
