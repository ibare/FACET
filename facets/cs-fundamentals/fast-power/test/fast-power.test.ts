/**
 * 화면에 뜨는 수가 참값과 같은지, 그리고 코드 패널이 같은 답을 내는지 잰다.
 *
 * 근거의 정본은 스크래치가 아니라 이 파일이다 — 밑과 지수를 `facet.ts` 에서 읽고
 * 손잡이 값도 선언에서 읽으므로, 선언이 바뀌면 여기가 같이 움직인다.
 *
 * 잠그는 것 다섯.
 *   1. 선언이 1차 데이터만 준다 — 이진 표기도 곱셈 횟수도 절약도 적혀 있지 않다.
 *   2. 손잡이 여섯 자리에서 곱셈 횟수·이진 표기·절약이 참값과 같다.
 *   3. 절약은 완전 단조이고, 빠른 쪽은 13 과 20 에서 같다 (주 수치를 절약으로 둔 까닭).
 *   4. IR 이 셈하는 값과 algorithm 이 셈하는 값이 **손잡이 전 값에서** 같다.
 *   5. 계기에는 선언된 이름의 정수만 실린다.
 *
 * 마지막 하나는 그림이 실제로 서는지를 본다 — 그래서 파일 전체가 happy-dom 이다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { FacetContext, FacetRuntimeEvent, IR, IRStmt } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { fastPowerAlgorithm, type FastPowerData } from '../src/algorithm.js';
import { fastPowerFacet } from '../src/facet.js';
import { fastPowerImperativeIR } from '../src/irs.js';
import { LADDER_CAPACITY, MIN_VISIBLE_BAR, TRACK_SPAN, unitFor } from '../src/fast-power-stage.js';

/** 선언에서 읽는다. 수를 이 파일에 옮겨 적으면 대조가 아니라 복사가 된다. */
const declared = fastPowerFacet.initialData as unknown as FastPowerData;
const BASE = declared.base;

/** 손잡이가 고르는 지수. 이것도 선언이 정한다. */
function handleValues(): number[] {
  const controls = fastPowerFacet.blocks.controls as { controls?: unknown };
  const list = Array.isArray(controls.controls) ? controls.controls : [];
  for (const raw of list) {
    const c = raw as { action?: unknown; segments?: unknown };
    if (c.action !== 'exponent' || !Array.isArray(c.segments)) continue;
    return (c.segments as Array<{ value: unknown }>)
      .map((s) => s.value)
      .filter((v): v is number => typeof v === 'number');
  }
  return [];
}

/** 슬라이더가 처음 짚는 자리. 선언의 exponent 와 같아야 한다. */
function handleDefault(): number | null {
  const controls = fastPowerFacet.blocks.controls as { controls?: unknown };
  const list = Array.isArray(controls.controls) ? controls.controls : [];
  for (const raw of list) {
    const c = raw as { action?: unknown; segments?: unknown };
    if (c.action !== 'exponent' || !Array.isArray(c.segments)) continue;
    const hit = (c.segments as Array<{ value: unknown; default?: unknown }>).find(
      (s) => s.default === true,
    );
    return typeof hit?.value === 'number' ? hit.value : null;
  }
  return null;
}

type TakePayload = { row: number; place: number; mults: number };
type SkipPayload = { row: number; place: number; mults: number };
type SquarePayload = { row: number; place: number; mults: number };
type VerdictPayload = {
  exponent: number;
  bits: number[];
  fast: number;
  slow: number;
  saved: number;
  squarings: number;
  takes: number;
};

type Run = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  deltas: number[];
};

/** 지수 하나로 한 판만 돌리고 멈추는 최소 컨텍스트. */
async function run(exponent: number): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const deltas: number[] = [];
  const ctx = {
    data: { ...declared, exponent, stepMs: 0 },
    cancelled: false,
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc'): void {
      const d = delta === 'inc' ? 1 : delta;
      deltas.push(d);
      metrics[name] = (metrics[name] ?? 0) + d;
    },
    // 한 판을 마친 뒤의 대기는 곧 취소로 본다 — 손잡이를 밀지 않고 끝낸다.
    async waitForInput(): Promise<{ type: string }> {
      throw new Error('cancelled');
    },
    pollInput(): null {
      return null;
    },
    async sleep(): Promise<boolean> {
      return true;
    },
  };
  try {
    await fastPowerAlgorithm(ctx as unknown as FacetContext<FastPowerData>);
  } catch (err) {
    if ((err as Error).message !== 'cancelled') throw err;
  }
  return { events, metrics, deltas };
}

function payloads<T>(events: FacetRuntimeEvent[], type: string): T[] {
  return events.filter((e) => e.type === type).map((e) => e.payload as T);
}

/** IR 트리에 붙은 phase 를 모은다. 중첩된 반복·조건 안까지 들어간다. */
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

describe('fastPower', () => {
  it('선언이 밑과 지수만 준다 — 파생값은 어디에도 적혀 있지 않다', () => {
    expect(Object.keys(declared).sort()).toEqual(['base', 'exponent', 'stepMs', 'type']);
    expect(BASE).toBeGreaterThan(0);
    expect(handleDefault()).toBe(declared.exponent);
    expect(handleValues()).toEqual([8, 13, 20, 50, 100, 1000]);
  });

  it('손잡이 전 값에서 이진 표기와 곱셈 횟수가 참값과 같다', async () => {
    /** 사양의 대조값. 이 표가 이 완제품이 서는 근거다. */
    const expected: Record<number, { bits: string; fast: number; slow: number; saved: number }> = {
      8: { bits: '1000', fast: 4, slow: 7, saved: 3 },
      13: { bits: '1101', fast: 6, slow: 12, saved: 6 },
      20: { bits: '10100', fast: 6, slow: 19, saved: 13 },
      50: { bits: '110010', fast: 8, slow: 49, saved: 41 },
      100: { bits: '1100100', fast: 9, slow: 99, saved: 90 },
      1000: { bits: '1111101000', fast: 15, slow: 999, saved: 984 },
    };

    for (const exponent of handleValues()) {
      const { events } = await run(exponent);
      const done = payloads<VerdictPayload>(events, 'verdict')[0];
      expect(done, `지수 ${exponent}`).toBeDefined();
      const v = done!;
      const takes = payloads<TakePayload>(events, 'take');
      const skips = payloads<SkipPayload>(events, 'skip');
      const squares = payloads<SquarePayload>(events, 'square');

      // 이진 표기는 지수 자신이 말한다.
      expect(v.bits.join('')).toBe(exponent.toString(2));
      expect(v.bits.join('')).toBe(expected[exponent]!.bits);

      // 걸음을 센 것이지 공식을 쓴 것이 아니다.
      expect(v.takes).toBe(takes.length);
      expect(v.squarings).toBe(squares.length);
      expect(v.fast).toBe(takes.length + squares.length);
      expect(takes.length + skips.length).toBe(v.bits.length);

      // 답으로 보낸 칸의 폭을 다 더하면 지수다 — 1 이 선 자리의 자릿값이다.
      expect(takes.reduce((a, t) => a + t.place, 0)).toBe(exponent);
      for (const t of takes) expect(Number.isInteger(Math.log2(t.place))).toBe(true);
      // 0 이 선 자리는 아무것도 보내지 않은 자리다.
      expect(takes.length + skips.length).toBe(v.squarings + 1);

      expect(v.slow).toBe(exponent - 1);
      expect(v.saved).toBe(v.slow - v.fast);
      expect({ fast: v.fast, slow: v.slow, saved: v.saved }).toEqual({
        fast: expected[exponent]!.fast,
        slow: expected[exponent]!.slow,
        saved: expected[exponent]!.saved,
      });
    }
  });

  it('절약은 완전 단조이고 빠른 쪽은 그렇지 않다 — 주 수치를 절약으로 둔 까닭', async () => {
    const saved: number[] = [];
    const fast: number[] = [];
    for (const exponent of handleValues()) {
      const v = payloads<VerdictPayload>((await run(exponent)).events, 'verdict')[0]!;
      saved.push(v.saved);
      fast.push(v.fast);
    }
    expect(saved).toEqual([3, 6, 13, 41, 90, 984]);
    expect(saved.every((v, i) => i === 0 || v > saved[i - 1]!)).toBe(true);
    // 13 과 20 이 둘 다 6 이라 빠른 쪽은 완전 단조가 아니다.
    expect(fast).toEqual([4, 6, 6, 8, 9, 15]);
    expect(fast.every((v, i) => i === 0 || v > fast[i - 1]!)).toBe(false);
  });

  it('IR 이 셈하는 값과 algorithm 이 셈하는 값이 같다', async () => {
    // 화면에 뜨는 수는 곱셈 횟수 · 절약 · 이진 표기 · 자릿값 넷뿐이고, 앞의 셋이
    // 여기서 대조된다. 값(3¹³ 따위)은 화면도 IR 도 셈하지 않는다 — 어깨수는 표기다.
    for (const exponent of handleValues()) {
      const v = payloads<VerdictPayload>((await run(exponent)).events, 'verdict')[0]!;
      expect(runIR(fastPowerImperativeIR, 'fastCost', [exponent]), `지수 ${exponent}`).toBe(v.fast);
      expect(runIR(fastPowerImperativeIR, 'slowCost', [exponent]), `지수 ${exponent}`).toBe(v.slow);
      expect(runIR(fastPowerImperativeIR, 'saved', [exponent]), `지수 ${exponent}`).toBe(v.saved);
    }
  });

  it('IR 이 32비트 천장에 닿지 않는다 — 곱셈이 한 번도 없다', () => {
    /*
     * IR 은 여섯 언어로 번역되고 그중 셋(C++ · 자바 · C#)은 정수 폭이 유한하다.
     * 중간값이 2^31 을 넘으면 그 셋에서만 답이 달라진다. 거듭제곱의 값을 셈하면
     * 3²⁰ = 34 억으로 손잡이 세 칸째에 이미 넘으므로 **값을 셈하지 않는다.**
     *
     * 넘지 않는다는 것을 수로 확인하는 대신 **구조로 잠근다** — 곱셈이 없으면
     * 모든 값이 지수 이하로 머문다. 뒷사람이 값을 셈하는 줄을 더하면 여기서 걸린다.
     */
    const json = JSON.stringify(fastPowerImperativeIR);
    expect(json).not.toContain('"op":"*"');

    const biggest = Math.max(...handleValues());
    for (const fn of ['slowCost', 'fastCost', 'saved']) {
      const got = runIR(fastPowerImperativeIR, fn, [biggest]) as number;
      expect(got, fn).toBeLessThanOrEqual(biggest);
      expect(got, fn).toBeGreaterThanOrEqual(0);
    }
    // 가장 큰 중간값조차 지수를 넘지 않으므로 천장에서 백만 배 아래다.
    expect(biggest).toBeLessThan(2 ** 31 - 1);
  });

  it('계기에는 선언된 이름의 정수만 실린다', async () => {
    const controls = fastPowerFacet.blocks.controls as { metrics?: Array<{ name: string }> };
    const declaredNames = (controls.metrics ?? []).map((m) => m.name).sort();
    const { metrics, deltas } = await run(100);

    expect(Object.keys(metrics).sort()).toEqual(declaredNames);
    expect(deltas.every((d) => Number.isInteger(d))).toBe(true);
    expect(metrics['fast-mult-count']).toBe(9);
    expect(metrics['slow-mult-count']).toBe(99);
    expect(metrics['saved-mult-count']).toBe(90);
    expect(metrics['square-count']).toBe(6);
  });

  it('걸음은 시작 · 자리마다 하나 · 제곱 사이사이 · 판정 · 마무리다', async () => {
    const { events } = await run(8);
    expect(events.filter((e) => e.type !== 'phase').map((e) => e.type)).toEqual([
      'begin',
      'skip', // 8 은 짝수
      'square',
      'skip', // 4 도 짝수
      'square',
      'skip', // 2 도 짝수
      'square',
      'take', // 1 은 홀수 — 8 = 1000 의 하나뿐인 1
      'verdict',
      'done',
    ]);
    // phase 는 걸음의 경계가 아니므로 silent 다 (C8).
    expect(events.filter((e) => e.type === 'phase').every((e) => e.silent === true)).toBe(true);
  });
});

describe('축이 손잡이를 따라간다', () => {
  /*
   * **stage 는 algorithm 을 참조할 수 없다** (원칙 1). 그래서 손잡이 눈금을 stage 가
   * 따로 들면 선언 · algorithm · stage 셋이 갈리고 축이 조용히 거짓말을 한다.
   *
   * 이 화면은 **눈금의 사본을 두지 않는다.** 사다리 칸 수도 자의 눈금도 걸음마다 오는
   * payload 에서 그 자리에 셈하므로 갈릴 사본이 없다. 그래서 여기서 잠그는 것은 "셋의
   * 값이 같은가" 가 아니라 **선언이 고르는 값이 그림이 담을 수 있는 범위 안인가** 다 —
   * 손잡이에 더 큰 값을 더하면 사다리가 못 담거나 막대가 사라지고, 그때 이 검사가
   * 걸린다. 쓰는 함수와 상수는 stage 가 쓰는 바로 그것이다.
   */
  it('선언의 손잡이 값이 모두 사다리에 담긴다', () => {
    for (const exponent of handleValues()) {
      // 칸 수는 지수가 아니라 자릿수만큼이다 — 1000 이라도 열 칸이다.
      expect(exponent.toString(2).length, `지수 ${exponent}`).toBeLessThanOrEqual(LADDER_CAPACITY);
    }
  });

  it('가장 큰 손잡이 값에서도 빠른 쪽 막대가 보이고, 벌어짐은 단조로 커진다', async () => {
    const gaps: number[] = [];
    for (const exponent of handleValues()) {
      const v = payloads<VerdictPayload>((await run(exponent)).events, 'verdict')[0]!;
      const unit = unitFor(v.slow);
      // 자 둘이 같은 눈금을 쓴다 — 그것이 이 화면의 견줌이다.
      expect(unit * v.fast, `지수 ${exponent}`).toBeGreaterThanOrEqual(MIN_VISIBLE_BAR);
      // 단순한 쪽 막대는 자를 넘지 않는다 — 넘으면 잘린 길이가 절약을 뜻하게 된다.
      expect(unit * v.slow, `지수 ${exponent}`).toBeLessThanOrEqual(TRACK_SPAN);
      gaps.push(unit * v.saved);
    }
    // 절약이 수로만 커지는 것이 아니라 화면에서도 단조로 벌어진다.
    expect(gaps.every((g, i) => i === 0 || g > gaps[i - 1]!)).toBe(true);
  });
});

describe('걸음의 단위', () => {
  /*
   * **걸음의 단위가 주장의 일부다.** 빠른 쪽은 곱셈이 4 → 15 이고 단순한 쪽은
   * 7 → 999 다. 단순한 쪽을 낱낱이 밟으면 지수 1000 에서 걸음이 999 개라 재생이
   * 끝나지 않고, 무엇보다 화면이 **정반대 인상**을 준다.
   *
   * 그래서 걸음은 빠른 쪽만 밟는다 — 자리마다 하나, 제곱마다 하나. 단순한 쪽은
   * 걸음이 아니라 **같은 눈금의 자 위에서 수와 길이로** 견준다. 한쪽만 묶고 다른
   * 쪽을 낱낱이 보이는 것이 아니라, **양쪽 다 같은 자로 재고 걸음은 빠른 쪽에만
   * 둔다.**
   */
  it('걸음은 빠른 쪽을 따라가고 단순 쪽은 낱낱이 밟지 않는다', async () => {
    const steps: number[] = [];
    const slows: number[] = [];
    for (const exponent of handleValues()) {
      const { events } = await run(exponent);
      const v = payloads<VerdictPayload>(events, 'verdict')[0]!;
      const visible = events.filter((e) => e.type !== 'phase');
      // 자리마다 한 걸음, 제곱마다 한 걸음, 그리고 시작 · 판정 · 마무리 셋.
      expect(visible.length, `지수 ${exponent}`).toBe(v.bits.length + v.squarings + 3);
      steps.push(visible.length);
      slows.push(v.slow);
    }
    expect(steps).toEqual([10, 10, 12, 14, 16, 22]);

    // 단순 쪽을 걸음으로 삼았다면 지수 1000 에서 999 걸음이다. 걸음 수는 그쪽이
    // 아니라 빠른 쪽(자릿수)을 따라간다.
    expect(slows[5]).toBe(999);
    expect(steps[5]).toBeLessThan(25);
    expect(steps[5]! - steps[0]!).toBeLessThan(15);
  });
});

describe('손잡이', () => {
  /*
   * 손잡이를 미는 것이 곧 다음 판의 시작이다 (reactive). 한 판을 마친 뒤 들어온
   * segmented-slider 의 payload 를 받아 그 지수로 처음부터 다시 도는지 본다 —
   * 이 배선이 끊기면 슬라이더가 있는데 아무 뜻이 없는 화면이 된다.
   */
  it('민 지수로 판을 다시 돈다', async () => {
    const events: FacetRuntimeEvent[] = [];
    let pushed = false;
    const ctx = {
      data: { ...declared, exponent: 8, stepMs: 0 },
      cancelled: false,
      async emit(event: FacetRuntimeEvent): Promise<void> {
        events.push(event);
      },
      metric(): void {},
      async waitForInput(): Promise<{ type: string; payload: unknown }> {
        // 첫 판을 마치면 지수 1000 으로 민다. 두 판째가 끝나면 그만둔다.
        if (pushed) throw new Error('cancelled');
        pushed = true;
        return { type: 'exponent', payload: { value: 1000, segmentIndex: 5 } };
      },
      pollInput(): null {
        return null;
      },
      async sleep(): Promise<boolean> {
        return true;
      },
    };
    try {
      await fastPowerAlgorithm(ctx as unknown as FacetContext<FastPowerData>);
    } catch (err) {
      if ((err as Error).message !== 'cancelled') throw err;
    }

    const verdicts = payloads<VerdictPayload>(events, 'verdict');
    expect(verdicts.map((v) => v.exponent)).toEqual([8, 1000]);
    expect(verdicts.map((v) => v.saved)).toEqual([3, 984]);
    // 두 판째는 사다리가 열 칸이다 — 지수가 125 배가 되는 동안 칸은 넷에서 열로만 는다.
    expect(verdicts[1]!.bits.length).toBe(10);
    expect(verdicts[1]!.squarings).toBe(9);
    // 판이 처음부터 다시 선다.
    expect(events.filter((e) => e.type === 'begin')).toHaveLength(2);
  });
});

describe('마운트와 재생', () => {
  /*
   * stage 가 실제로 서는지, 재생 도중 캔버스 세로가 흔들리지 않는지 본다 (S-view).
   * 걸음 벽시계(운동 + stepMs)를 재는 것도 이 경로였다 — 지수 13 에서 가장 얇은
   * 걸음(건너뛰기)이 915ms 로 800ms 바닥선 위였다.
   */
  it('그림이 서고 재생 내내 캔버스 세로가 변하지 않는다', async () => {
    const { clearRegistry, runFacet } = await import('@ffacet/core/runtime');
    const { registerFastPower } = await import('../src/index.js');
    clearRegistry();
    registerFastPower();

    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]): void => {
      errors.push(args);
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(fastPowerFacet, container);
    try {
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const before = svg!.getAttribute('viewBox');
      expect(svg!.childNodes.length).toBeGreaterThan(0);

      // 세 걸음쯤 굴린다. 걸음 하나가 900ms 남짓이다.
      await new Promise((r) => setTimeout(r, 2_600));

      expect(svg!.getAttribute('viewBox')).toBe(before);
      // 캡션과 사다리 칸이 실제로 그려진다.
      const texts = [...svg!.querySelectorAll('text')].map((t) => t.textContent ?? '');
      expect(texts.some((s) => s.length > 20)).toBe(true);
      expect(svg!.querySelectorAll('rect').length).toBeGreaterThan(2);
      expect(errors).toEqual([]);
    } finally {
      handle.destroy();
      container.remove();
      console.error = original;
    }
  }, 20_000);
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    // 지수 13 은 1101 이라 네 갈래가 한 판에 다 나온다 — 시작 · 답곱 · 건너뜀 · 제곱.
    const { events } = await run(13);
    const emitted = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(fastPowerImperativeIR)].sort());
    expect([...emitted].sort()).toEqual(['naive', 'square', 'take', 'test']);
  });
});

describe('여섯 언어 emit (S-transpiler)', () => {
  const ALL = [
    pythonTranspiler,
    javascriptTranspiler,
    typescriptTranspiler,
    javaTranspiler,
    cppTranspiler,
    csharpTranspiler,
  ];

  it.each(ALL.map((t) => [t.id, t] as const))(
    '%s — 두 알고리즘과 비용 함수가 다 나오고 phase 넷이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(fastPowerImperativeIR);
      expect(res.lines.length).toBeGreaterThan(10);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);

      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual([...irPhases(fastPowerImperativeIR)].sort());

      const all = res.lines.map((l) => l.code).join('\n');
      for (const fn of ['slowCost', 'fastCost', 'saved']) expect(all).toContain(fn);
      // 예약 이름으로 감춘 것이 없다 — 셈이 이름 뒤로 사라지지 않는다.
      expect(all).not.toContain('pow(');
    },
  );

  it('IR 에 짧은 회로가 없다 — 판정을 if 로 포갰다', () => {
    /*
     * `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라 오른쪽이 늘 셈해진다. 회피가
     * 아니라 제거로 푼다 — 반복 조건은 `n > 0` 하나뿐이고 홀짝과 마지막 자리 판정은
     * `if` 로 포갰다. 그래서 그 어휘가 IR 에 한 번도 나오지 않고 코드 패널도 더 읽힌다.
     */
    const json = JSON.stringify(fastPowerImperativeIR);
    expect(json).not.toContain('"op":"&&"');
    expect(json).not.toContain('"op":"||"');
  });
});
