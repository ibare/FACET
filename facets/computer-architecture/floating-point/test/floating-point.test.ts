/**
 * IR 과 화면이 같은 답을 내는가 — 네 손잡이 값 전부에서.
 *
 * 코드 패널을 다는 까닭은 "옆의 코드가 이 그림이 하는 일"이라는 약속 하나다.
 * 둘이 어긋나면 그 약속이 거짓말이 되고 패널을 다는 이유 자체가 지워진다.
 * 그래서 여기서 세 자리를 한꺼번에 맞댄다.
 *
 *   사양표      사람이 손으로 셈해 적은 값
 *   algorithm   화면이 실제로 보이는 값 (같은 함수가 stage 로 간다)
 *   IR          코드 패널이 여섯 언어로 보이는 값 (ir-interpreter 로 실행)
 *
 * 셋이 다른 길로 얻어진다 — 사양표는 손셈, algorithm 은 `2 ** n`, IR 은 곱셈·
 * 나눗셈 루프다. 서로 베끼지 않았으므로 셋이 같으면 그것이 근거가 된다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView } from '@ffacet/core/runtime';
import type { IR, IRStmt } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';

import {
  computeFloatingPointFormat,
  floatingPointAlgorithm,
  storeInFormat,
  type FloatingPointData,
} from '../src/algorithm.js';
import { floatingPointImperativeIR } from '../src/irs.js';
import { floatingPointStageView } from '../src/floating-point-stage.js';
import { floatingPointFacet } from '../src/facet.js';

const TOTAL = 8;
const SIGN = 1;

/**
 * 사양이 실측으로 준 표. 손으로 셈한 값이라 algorithm 과 IR 어느 쪽도 이것을
 * 참조하지 않는다.
 */
const TABLE = [
  { expBits: 2, manBits: 5, bias: 1, maxValue: 3.9375, minNormal: 1, gap: 0.03125, tickCount: 32 },
  { expBits: 3, manBits: 4, bias: 3, maxValue: 15.5, minNormal: 0.25, gap: 0.0625, tickCount: 16 },
  { expBits: 4, manBits: 3, bias: 7, maxValue: 240, minNormal: 0.015625, gap: 0.125, tickCount: 8 },
  {
    expBits: 5,
    manBits: 2,
    bias: 15,
    maxValue: 57344,
    minNormal: 0.00006103515625,
    gap: 0.25,
    tickCount: 4,
  },
] as const;

/** 이 facet 이 쓰는 phase 어휘. algorithm 과 irs 가 이 집합에서 벗어나면 안 된다 (C3). */
const PHASES = ['bias', 'range', 'min-normal', 'gap', 'ticks', 'store'] as const;

const PROBE = 3.14159;

function phasesOfIR(ir: IR): Set<string> {
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

/**
 * 알고리즘을 한 바퀴 굴려 발신한 것을 모은다.
 *
 * reactive 라 걸음 사이에 `sleep` 과 `waitForInput` 이 있다. sleep 은 곧바로
 * 통과시키고, 한 바퀴가 끝나 입력을 기다리는 순간 취소로 끊어 빠져나온다 —
 * 알고리즘의 최상위 catch 가 그것을 정상 종료로 받는다.
 */
async function runOneCycle(expBits: number): Promise<{
  events: FacetRuntimeEvent[];
  metrics: Map<string, number>;
}> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  let cancelled = false;

  const ctx = {
    data: {
      type: 'floating-point',
      totalBits: TOTAL,
      signBits: SIGN,
      expBitsLadder: [2, 3, 4, 5],
      expBits,
    } as FloatingPointData,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent): Promise<void> {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc'): void {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep(): Promise<boolean> {
      return true;
    },
    async waitForInput(): Promise<never> {
      cancelled = true;
      throw new Error('cancelled');
    },
    pollInput(): null {
      return null;
    },
  };

  await floatingPointAlgorithm(ctx as unknown as FacetContext<FloatingPointData>);
  return { events, metrics };
}

function measureOf(events: FacetRuntimeEvent[], name: string): number | undefined {
  for (const e of events) {
    if (e.type !== 'measure') continue;
    const p = e.payload as { name?: unknown; value?: unknown };
    if (p?.name === name && typeof p.value === 'number') return p.value;
  }
  return undefined;
}

describe('부동소수점 — 사양표 · 화면 · IR', () => {
  it.each(TABLE)(
    '지수 $expBits 비트: 화면이 셈한 값이 사양표와 같다',
    ({ expBits, manBits, bias, maxValue, minNormal, gap, tickCount }) => {
      const f = computeFloatingPointFormat(TOTAL, SIGN, expBits);
      expect(f).toMatchObject({ manBits, bias, maxValue, minNormal, gap, tickCount });
    },
  );

  it.each(TABLE)(
    '지수 $expBits 비트: IR 이 셈한 값이 화면과 글자까지 같다',
    ({ expBits, manBits, bias, maxValue, minNormal, gap, tickCount }) => {
      const ir = floatingPointImperativeIR;
      expect(runIR(ir, 'biasOf', [expBits])).toBe(bias);
      expect(runIR(ir, 'unitOf', [manBits])).toBe(gap);
      expect(runIR(ir, 'tickCountOf', [manBits])).toBe(tickCount);
      expect(runIR(ir, 'minNormalOf', [expBits])).toBe(minNormal);
      expect(runIR(ir, 'maxValueOf', [expBits, manBits])).toBe(maxValue);
    },
  );

  it.each(TABLE)(
    '지수 $expBits 비트: 담아 본 결과가 IR 과 같다',
    ({ expBits, manBits }) => {
      const mine = storeInFormat(PROBE, TOTAL, SIGN, expBits);
      const theirs = runIR(floatingPointImperativeIR, 'storedValueOf', [PROBE, expBits, manBits]);
      expect(theirs).toBe(mine);
      // 시료는 어느 배분에서도 그대로 담기지 않는다 — 그것이 이 줄의 요점이다.
      expect(mine).not.toBe(PROBE);
    },
  );

  it('맞바꿈이다 — 최대값은 늘고 눈금은 준다', () => {
    const maxes = TABLE.map((r) => computeFloatingPointFormat(TOTAL, SIGN, r.expBits).maxValue);
    const ticks = TABLE.map((r) => computeFloatingPointFormat(TOTAL, SIGN, r.expBits).tickCount);
    for (let i = 1; i < maxes.length; i += 1) {
      expect(maxes[i]!).toBeGreaterThan(maxes[i - 1]!);
      expect(ticks[i]!).toBeLessThan(ticks[i - 1]!);
    }
  });
});

describe('부동소수점 — 알고리즘이 발신하는 것', () => {
  it.each(TABLE)('지수 $expBits 비트: 발신한 수가 IR 과 같다', async ({ expBits, manBits }) => {
    const { events, metrics } = await runOneCycle(expBits);
    const ir = floatingPointImperativeIR;

    expect(measureOf(events, 'bias')).toBe(runIR(ir, 'biasOf', [expBits]));
    expect(measureOf(events, 'max-value')).toBe(runIR(ir, 'maxValueOf', [expBits, manBits]));
    expect(measureOf(events, 'min-normal')).toBe(runIR(ir, 'minNormalOf', [expBits]));
    expect(measureOf(events, 'gap')).toBe(runIR(ir, 'unitOf', [manBits]));
    expect(measureOf(events, 'tick-count')).toBe(runIR(ir, 'tickCountOf', [manBits]));

    // 메트릭도 같은 수여야 한다 — 컨트롤바가 다른 값을 보이면 그것도 거짓말이다.
    expect(metrics.get('max-value')).toBe(runIR(ir, 'maxValueOf', [expBits, manBits]));
    expect(metrics.get('tick-count')).toBe(runIR(ir, 'tickCountOf', [manBits]));
  });

  it('phase 어휘가 algorithm 과 irs 에서 정확히 일치한다 (C3)', async () => {
    const { events } = await runOneCycle(3);
    const emitted = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase?: unknown }).phase)
        .filter((p): p is string => typeof p === 'string'),
    );
    expect([...emitted].sort()).toEqual([...PHASES].sort());
    expect([...phasesOfIR(floatingPointImperativeIR)].sort()).toEqual([...PHASES].sort());
  });

  it('phase 는 모두 silent 로 나가고, 시각 이벤트는 그렇지 않다 (C2)', async () => {
    const { events } = await runOneCycle(3);
    for (const e of events) {
      if (e.type === 'phase') expect(e.silent).toBe(true);
      else expect(e.silent).toBeFalsy();
    }
  });

  it('선언한 메트릭만 갱신한다 (C5)', async () => {
    const declared = new Set(
      ((floatingPointFacet.blocks.controls as { metrics?: { name: string }[] }).metrics ?? []).map(
        (m) => m.name,
      ),
    );
    const { metrics } = await runOneCycle(5);
    for (const name of metrics.keys()) expect(declared.has(name)).toBe(true);
  });
});

describe('부동소수점 — 화면이 그리는 글자', () => {
  it.each(TABLE)(
    '지수 $expBits 비트: stage 가 IR 과 같은 수를 적는다',
    ({ expBits, manBits, bias, maxValue, minNormal, gap, tickCount }) => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const view = mountView(floatingPointStageView, container, {
        config: {},
        locale: 'en',
        theme: 'light',
      }) as unknown as {
        setSplit: (t: number, s: number, e: number, m: number) => void;
        setMeasure: (name: string, value: number) => void;
        setRuler: (ticks: number) => void;
        setStored: (input: number, stored: number) => void;
        destroy: () => void;
      };

      view.setSplit(TOTAL, SIGN, expBits, manBits);
      view.setMeasure('bias', bias);
      view.setMeasure('max-value', maxValue);
      view.setMeasure('min-normal', minNormal);
      view.setMeasure('gap', gap);
      view.setRuler(tickCount);
      view.setStored(PROBE, storeInFormat(PROBE, TOTAL, SIGN, expBits));

      const shown = container.textContent ?? '';

      // 큰 수의 자리 구분은 쉼표로 한다.
      expect(shown).toContain(maxValue === 57344 ? '57,344' : String(maxValue));
      // 아주 작은 수도 줄이거나 반올림하지 않고 있는 그대로 적는다.
      expect(shown).toContain(String(minNormal));
      expect(shown).toContain(String(gap));
      expect(shown).toContain(String(bias));
      expect(shown).toContain(String(tickCount));

      // 눈금은 세로를 바꾸지 않고 개수만 바뀐다.
      const visible = [...container.querySelectorAll('line')].filter(
        (l) => l.getAttribute('opacity') !== '0',
      );
      // 눈금 tickCount+1 개 + 눈금자 밑줄 하나.
      expect(visible.length).toBe(tickCount + 2);

      view.destroy();
      container.remove();
    },
  );

  it('마운트해도 캔버스를 떼어내지 않고, 세로가 바뀌지 않는다 (S-view)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = mountView(floatingPointStageView, container, {
      config: {},
      locale: 'en',
      theme: 'light',
    }) as unknown as { setRuler: (n: number) => void; destroy: () => void };

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const before = svg?.getAttribute('viewBox');

    view.setRuler(32);
    view.setRuler(4);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(before);

    view.destroy();
    container.remove();
  });
});

describe('부동소수점 — 코드 패널이 여섯 언어로 선다', () => {
  const TRANSPILERS = [
    pythonTranspiler,
    javascriptTranspiler,
    typescriptTranspiler,
    javaTranspiler,
    cppTranspiler,
    csharpTranspiler,
  ];

  it.each(TRANSPILERS)('$language 로 옮겨진다', (transpiler) => {
    const { lines } = transpiler.transpile(floatingPointImperativeIR);
    expect(lines.length).toBeGreaterThan(0);

    const code = lines.map((l) => l.code).join('\n');
    // IR 이 선언한 함수 일곱이 모두 나와야 한다.
    for (const fn of floatingPointImperativeIR.functions) {
      expect(code).toContain(fn.name);
    }
    // 붙은 phase 는 전부 선언된 어휘 안에 있어야 한다 (C3).
    for (const l of lines) {
      if (l.phase !== null) expect(PHASES).toContain(l.phase);
    }
  });

  /*
   * `1 / powTwo(n)` 은 정적 언어에서 정수 나눗셈이 되어 0 을 낸다. 인터프리터는
   * 배정도라 그 어긋남을 잡지 못하므로 (S-transpiler: "검사로는 원리적으로 안
   * 걸린다"), 그 모양이 emit 에 아예 나오지 않는 것을 여기서 본다.
   */
  it.each(TRANSPILERS)('$language: 1 을 정수로 나누는 자리가 없다', (transpiler) => {
    const code = transpiler
      .transpile(floatingPointImperativeIR)
      .lines.map((l) => l.code)
      // 주석은 코드가 아니다. 이 IR 의 주석이 바로 그 위험한 모양을 인용하고
      // 있어서, 거르지 않으면 경고문 자체가 위반으로 잡힌다.
      .filter((l) => {
        const s = l.trim();
        return !s.startsWith('//') && !s.startsWith('#');
      });
    expect(code.length).toBeGreaterThan(0);
    for (const line of code) {
      expect(line).not.toMatch(/\b1\s*\/\s*powTwo/);
    }
  });
});
