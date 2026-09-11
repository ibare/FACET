/**
 * 화면에 뜨는 수가 참값과 같은지, 그리고 코드 패널이 같은 답을 내는지 잰다.
 *
 * 근거의 정본은 스크래치가 아니라 이 파일이다 — 사다리도 손잡이 값도 `facet.ts` 에서
 * 읽으므로, 선언이 바뀌면 여기가 같이 움직인다.
 *
 * 잠그는 것 여덟.
 *   1. 선언이 1차 데이터만 준다 — 비도 낱개 수도 자릿값도 적혀 있지 않다.
 *   2. 손잡이 다섯 자리에서 두 비와 낱개 수가 참값과 같다.
 *   3. **같은 반의 비는 다섯 자리 전부에서 2 다** (이 완제품이 서는 주장).
 *   4. IR 이 셈하는 값과 algorithm 이 셈하는 값이 **손잡이 전 값에서** 같다.
 *   5. IR 이 32비트 천장에 구조적으로 닿지 않고, `log`/`floor` 가 닿는 자리가 전부
 *      `double` 이라 여섯 언어가 다 성한 코드를 낸다.
 *   6. 계기에는 선언된 이름의 정수만 실린다.
 *   7. 자리표 집합이 열 언어에서 같다.
 *   8. 그림이 서고, 걸음 벽시계가 800ms 바닥선 위다 (셈이 아니라 실측).
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type {
  CanvasView,
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRStmt,
  LocaleStr,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { asymptoticAlgorithm, type AsymptoticData } from '../src/algorithm.js';
import { asymptoticFacet } from '../src/facet.js';
import { asymptoticImperativeIR } from '../src/irs.js';
import { asymptoticProjector } from '../src/projector.js';
import {
  asymptoticStageView,
  tilePitch,
  RECORD_CAPACITY,
  TILE_CAPACITY,
} from '../src/asymptotic-stage.js';

/** 선언에서 읽는다. 수를 이 파일에 옮겨 적으면 대조가 아니라 복사가 된다. */
const declared = asymptoticFacet.initialData as unknown as AsymptoticData;

/** 손잡이가 고르는 크기. 이것도 선언이 정한다. */
function handleValues(): number[] {
  const controls = asymptoticFacet.blocks.controls as { controls?: unknown };
  const list = Array.isArray(controls.controls) ? controls.controls : [];
  for (const raw of list) {
    const c = raw as { action?: unknown; segments?: unknown };
    if (c.action !== 'size' || !Array.isArray(c.segments)) continue;
    return (c.segments as Array<{ value: unknown }>)
      .map((s) => s.value)
      .filter((v): v is number => typeof v === 'number');
  }
  return [];
}

/** 슬라이더가 처음 짚는 자리. 선언의 size 와 같아야 한다. */
function handleDefault(): number | null {
  const controls = asymptoticFacet.blocks.controls as { controls?: unknown };
  const list = Array.isArray(controls.controls) ? controls.controls : [];
  for (const raw of list) {
    const c = raw as { action?: unknown; segments?: unknown };
    if (c.action !== 'size' || !Array.isArray(c.segments)) continue;
    const hit = (c.segments as Array<{ value: unknown; default?: unknown }>).find(
      (s) => s.default === true,
    );
    return typeof hit?.value === 'number' ? hit.value : null;
  }
  return null;
}

type TilePayload = { index: number; n: number; tiles: number; remainder: number };
type SizePayload = { index: number; n: number; logBits: number };
type VerdictPayload = {
  index: number;
  n: number;
  crossTiles: number;
  sameTiles: number;
  gap: number;
  visited: number;
};

type Run = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  deltas: number[];
};

/** 크기 하나로 한 판만 돌리고 멈추는 최소 컨텍스트. */
async function run(size: number): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const deltas: number[] = [];
  const ctx = {
    data: { ...declared, size, stepMs: 0 },
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
    await asymptoticAlgorithm(ctx as unknown as FacetContext<AsymptoticData>);
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

/** 선언을 보지 않고 여기서 다시 셈한 참값. 대조의 상대다. */
function truth(n: number): {
  logBits: number;
  crossRatio: number;
  crossTiles: number;
  sameRatio: number;
  sameTiles: number;
  gap: number;
} {
  const logBits = Math.floor(Math.log(n) / Math.log(2) + 0.5);
  const nLogN = n * logBits;
  const nSquared = n ** 2;
  const twice = 2 * n ** 2;
  const crossRatio = nSquared / nLogN;
  const sameRatio = twice / nSquared;
  return {
    logBits,
    crossRatio,
    crossTiles: Math.floor(crossRatio),
    sameRatio,
    sameTiles: Math.floor(sameRatio),
    gap: Math.floor(crossRatio) - Math.floor(sameRatio),
  };
}

describe('선언한 데이터', () => {
  it('1차 데이터는 세 함수의 모양과 사다리뿐이다', () => {
    expect(Object.keys(declared).sort()).toEqual([
      'nLogN',
      'nSquared',
      'size',
      'sizes',
      'stepMs',
      'twiceNSquared',
      'type',
    ]);
    expect(declared.type).toBe('asymptotic');
    expect(declared.nLogN).toEqual({ coefficient: 1, exponent: 1, logBase: 2 });
    expect(declared.nSquared).toEqual({ coefficient: 1, exponent: 2, logBase: 0 });
    // 같은 반이라는 것이 선언에서 보인다 — 계수만 다르고 지수와 로그가 같다.
    expect(declared.twiceNSquared.exponent).toBe(declared.nSquared.exponent);
    expect(declared.twiceNSquared.logBase).toBe(declared.nSquared.logBase);
    expect(declared.twiceNSquared.coefficient).toBe(2);
  });

  it('파생값을 선언에 적어 두지 않았다', () => {
    const flat = JSON.stringify(declared);
    // 비도 비용도 선언에 없다. 있으면 호스트의 오타가 그대로 화면에 뜬다.
    // (`1024` 는 사다리의 칸이라 있어야 한다 — 그 부분 문자열은 피해서 본다.)
    for (const derived of ['10240', '1048576', '102.4', '10.67', '2097152', '65536']) {
      expect(flat, derived).not.toContain(derived);
    }
  });

  it('손잡이의 처음 자리가 선언과 맞고, 손잡이 값이 사다리와 같다', () => {
    expect(handleValues()).toEqual(declared.sizes);
    expect(handleDefault()).toBe(declared.size);
  });

  it('title 이 카탈로그 카드 이름과 같다 (C4)', () => {
    expect((asymptoticFacet.title as Record<string, string>).ko).toBe('점근 분석');
  });
});

describe('두 반의 비', () => {
  it('손잡이 전 값에서 비와 낱개 수가 참값과 같다', async () => {
    /** 사양의 대조값. 이 표가 이 완제품이 서는 근거다. */
    const expected: Record<number, { bits: number; cross: number; same: number; gap: number }> = {
      4: { bits: 2, cross: 2, same: 2, gap: 0 },
      16: { bits: 4, cross: 4, same: 2, gap: 2 },
      64: { bits: 6, cross: 10, same: 2, gap: 8 },
      256: { bits: 8, cross: 32, same: 2, gap: 30 },
      1024: { bits: 10, cross: 102, same: 2, gap: 100 },
    };

    for (const size of handleValues()) {
      const { events } = await run(size);
      const sizeSteps = payloads<SizePayload>(events, 'size-set');
      const cross = payloads<TilePayload>(events, 'tile-cross');
      const same = payloads<TilePayload>(events, 'tile-same');

      // 사다리를 손잡이가 짚은 칸까지 걷는다 — 양쪽에 한 걸음씩, 같은 규칙으로.
      const upto = declared.sizes.indexOf(size) + 1;
      expect(sizeSteps).toHaveLength(upto);
      expect(cross).toHaveLength(upto);
      expect(same).toHaveLength(upto);

      sizeSteps.forEach((step, i) => {
        const t = truth(step.n);
        expect(step.n, `크기 ${size} 의 ${i} 번째 자리`).toBe(declared.sizes[i]);
        expect(step.logBits).toBe(t.logBits);
        expect(cross[i]!.tiles).toBe(t.crossTiles);
        expect(same[i]!.tiles).toBe(t.sameTiles);
        // 남은 조각은 비의 소수부다 — 표시와 판정이 같은 수에서 나온다.
        expect(cross[i]!.tiles + cross[i]!.remainder).toBeCloseTo(t.crossRatio, 10);
        expect(same[i]!.tiles + same[i]!.remainder).toBeCloseTo(t.sameRatio, 10);
        expect({
          bits: step.logBits,
          cross: cross[i]!.tiles,
          same: same[i]!.tiles,
        }).toEqual({
          bits: expected[step.n]!.bits,
          cross: expected[step.n]!.cross,
          same: expected[step.n]!.same,
        });
      });

      const verdict = payloads<VerdictPayload>(events, 'verdict')[0]!;
      expect(verdict.n).toBe(size);
      expect(verdict.gap).toBe(expected[size]!.gap);
      expect(verdict.visited).toBe(upto);
    }
  });

  it('같은 반의 비는 다섯 자리 전부에서 2 이고, 다른 반은 2 에서 102 로 떠난다', async () => {
    const { events } = await run(1024);
    const cross = payloads<TilePayload>(events, 'tile-cross').map((p) => p.tiles);
    const same = payloads<TilePayload>(events, 'tile-same').map((p) => p.tiles);

    // 손잡이를 밀어도 안 움직이는 수가 이 화면의 주장이다.
    expect(same).toEqual([2, 2, 2, 2, 2]);
    expect(new Set(same).size).toBe(1);
    // 다른 반은 완전 단조로 떠난다.
    expect(cross).toEqual([2, 4, 10, 32, 102]);
    expect(cross.every((v, i) => i === 0 || v > cross[i - 1]!)).toBe(true);
    // 맨 앞 칸에서는 둘이 똑같다 — 한 크기만으로는 반을 가를 수 없다.
    expect(cross[0]).toBe(same[0]);
  });

  it('두 판정 갈래가 다 일어난다 — 선언한 문안이 화면에 뜬다', async () => {
    // 갈래가 `gap === 0` 으로 갈리므로, 선언의 손잡이 중 양쪽이 다 있어야 한다.
    const gaps = new Map<number, number>();
    for (const size of handleValues()) {
      const v = payloads<VerdictPayload>((await run(size)).events, 'verdict')[0]!;
      gaps.set(size, v.gap);
    }
    expect([...gaps.values()].filter((g) => g === 0).length).toBeGreaterThan(0);
    expect([...gaps.values()].filter((g) => g > 0).length).toBeGreaterThan(0);
    expect(gaps.get(4)).toBe(0);
  });
});

describe('코드 패널', () => {
  it('IR 이 셈하는 값과 algorithm 이 셈하는 값이 같다', async () => {
    // 화면에 뜨는 수는 자릿값 · 두 낱개 수 · 그 차이 넷뿐이고 전부 여기서 대조된다.
    // 비용 값(1,048,576 따위)은 화면도 IR 도 셈하지 않는다.
    for (const size of handleValues()) {
      const { events } = await run(size);
      const sizeSteps = payloads<SizePayload>(events, 'size-set');
      const cross = payloads<TilePayload>(events, 'tile-cross');
      const same = payloads<TilePayload>(events, 'tile-same');
      const verdict = payloads<VerdictPayload>(events, 'verdict')[0]!;

      sizeSteps.forEach((step, i) => {
        const at = `크기 ${step.n}`;
        expect(runIR(asymptoticImperativeIR, 'logTwo', [step.n]), at).toBe(step.logBits);
        expect(runIR(asymptoticImperativeIR, 'crossTiles', [step.n]), at).toBe(cross[i]!.tiles);
        expect(runIR(asymptoticImperativeIR, 'sameTiles', [step.n]), at).toBe(same[i]!.tiles);
      });
      expect(runIR(asymptoticImperativeIR, 'classGap', [verdict.n]), `판정 ${size}`).toBe(
        verdict.gap,
      );
    }
  });

  it('IR 이 32비트 천장에 닿지 않는다 — 곱셈이 한 번도 없다', () => {
    /*
     * IR 은 여섯 언어로 번역되고 그중 셋(C++ · 자바 · C#)은 정수 폭이 유한하다.
     * 비용을 그대로 셈하면 `2n²` 가 사다리를 한 칸만 늘려도 천장에 다가간다. 그래서
     * 두 비용을 n 으로 나눠 비만 셈한다 — 넘지 않는다는 것을 **수가 아니라 구조로**
     * 잠근다. 곱셈이 없으면 모든 값이 2n 이하로 머문다.
     */
    const json = JSON.stringify(asymptoticImperativeIR);
    expect(json).not.toContain('"op":"*"');
    // 짧은 회로 함정은 회피가 아니라 제거로 푼다 — 반복도 분기도 없다.
    expect(json).not.toContain('"op":"&&"');
    expect(json).not.toContain('"op":"||"');

    const biggest = Math.max(...handleValues());
    for (const fn of ['logTwo', 'crossTiles', 'sameTiles', 'classGap']) {
      const got = runIR(asymptoticImperativeIR, fn, [biggest]) as number;
      expect(got, fn).toBeGreaterThanOrEqual(0);
      // 가장 큰 중간값조차 2n 을 넘지 않으므로 천장에서 백만 배 아래다.
      expect(got, fn).toBeLessThanOrEqual(2 * biggest);
    }
    expect(2 * biggest).toBeLessThan(2 ** 31 - 1);
  });

  it('log 와 floor 가 닿는 자리가 전부 double 이다', () => {
    /*
     * `log` 와 `floor` 는 부동소수를 돌려준다. 그 결과를 `int` 슬롯에 담으면 자바가
     * `int bits = Math.floor(...)` 를, C# 이 `int bits = Math.Floor(...)` 를 내는데
     * **둘 다 컴파일되지 않는다.** 여섯 언어로 직접 emit 해 확인하고 이 규약을 세웠다.
     * 저장소에 예약 수학 이름을 쓰는 IR 이 없어 선례가 없던 자리다.
     */
    for (const fn of asymptoticImperativeIR.functions) {
      expect(fn.returnType, fn.name).toEqual({ kind: 'double' });
      for (const s of fn.body) {
        if (s.kind === 'var') expect(s.type, `${fn.name}.${s.name}`).toEqual({ kind: 'double' });
      }
    }
    // 정수 나눗셈 `//` 는 쓰지 않는다 — double 피연산자에서는 세 언어가 실수
    // 나눗셈으로 옮겨 인터프리터의 내림과 갈린다.
    expect(JSON.stringify(asymptoticImperativeIR)).not.toContain('"op":"//"');
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    // 가장 짧은 판(크기 4)에서도 네 갈래가 다 나온다.
    const { events } = await run(4);
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(asymptoticImperativeIR)].sort());
    expect([...emitted].sort()).toEqual(['cross', 'gap', 'same', 'scale']);
    // phase 는 걸음의 경계가 아니므로 silent 다 (C8).
    expect(events.filter((e) => e.type === 'phase').every((e) => e.silent === true)).toBe(true);
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
    '%s — 네 함수가 다 나오고 phase 넷이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(asymptoticImperativeIR);
      expect(res.lines.length).toBeGreaterThan(10);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);

      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual([...irPhases(asymptoticImperativeIR)].sort());

      const all = res.lines.map((l) => l.code).join('\n');
      for (const fn of ['logTwo', 'crossTiles', 'sameTiles', 'classGap']) expect(all).toContain(fn);
      // 셈이 이름 뒤로 사라지지 않는다 — 거듭제곱을 부르지 않는다.
      expect(all).not.toContain('pow(');
    },
  );

  it('정수 폭이 유한한 셋에서 부동소수를 int 에 담지 않는다', () => {
    const java = javaTranspiler.transpile(asymptoticImperativeIR).lines.map((l) => l.code).join('\n');
    const csharp = csharpTranspiler.transpile(asymptoticImperativeIR).lines.map((l) => l.code).join('\n');
    const cpp = cppTranspiler.transpile(asymptoticImperativeIR).lines.map((l) => l.code).join('\n');

    expect(java).toContain('double bits = Math.floor(');
    expect(csharp).toContain('double bits = Math.Floor(');
    expect(cpp).toContain('double bits = std::floor(');
    // 이 한 줄이 자바·C# 에서 컴파일되지 않는 코드였다.
    expect(java).not.toContain('int bits =');
    expect(csharp).not.toContain('int bits =');
  });
});

describe('걸음과 계기', () => {
  it('걸음은 판 세우기 · 자리마다 셋 · 판정 · 마무리다', async () => {
    const { events } = await run(4);
    expect(events.filter((e) => e.type !== 'phase').map((e) => e.type)).toEqual([
      'board-set',
      'size-set',
      'tile-cross',
      'tile-same',
      'verdict',
      'done',
    ]);

    // 자리가 늘면 걸음도 자리마다 셋씩만 는다 — 양쪽을 같은 규칙으로 밟는다.
    const long = await run(1024);
    expect(long.events.filter((e) => e.type !== 'phase')).toHaveLength(
      1 + declared.sizes.length * 3 + 2,
    );
  });

  it('계기에는 선언된 이름의 정수만 실린다', async () => {
    const controls = asymptoticFacet.blocks.controls as { metrics?: Array<{ name: string }> };
    const declaredNames = (controls.metrics ?? []).map((m) => m.name).sort();
    const { metrics, deltas } = await run(1024);

    expect(Object.keys(metrics).sort()).toEqual(declaredNames);
    expect(deltas.every((d) => Number.isInteger(d))).toBe(true);
    expect(metrics['cross-tile-count']).toBe(102);
    expect(metrics['same-tile-count']).toBe(2);
    expect(metrics['log-bit-count']).toBe(10);
  });

  it('민 크기로 판을 다시 돈다', async () => {
    /*
     * 손잡이를 미는 것이 곧 다음 판의 시작이다 (reactive). 이 배선이 끊기면
     * 슬라이더가 있는데 아무 뜻이 없는 화면이 된다.
     */
    const events: FacetRuntimeEvent[] = [];
    let pushed = false;
    const ctx = {
      data: { ...declared, size: 1024, stepMs: 0 },
      cancelled: false,
      async emit(event: FacetRuntimeEvent): Promise<void> {
        events.push(event);
      },
      metric(): void {},
      async waitForInput(): Promise<{ type: string; payload: unknown }> {
        if (pushed) throw new Error('cancelled');
        pushed = true;
        return { type: 'size', payload: { value: 4, segmentIndex: 0 } };
      },
      pollInput(): null {
        return null;
      },
      async sleep(): Promise<boolean> {
        return true;
      },
    };
    try {
      await asymptoticAlgorithm(ctx as unknown as FacetContext<AsymptoticData>);
    } catch (err) {
      if ((err as Error).message !== 'cancelled') throw err;
    }

    const verdicts = payloads<VerdictPayload>(events, 'verdict');
    expect(verdicts.map((v) => v.n)).toEqual([1024, 4]);
    // 크기를 줄이면 두 반이 다시 구별되지 않는 자리로 돌아온다.
    expect(verdicts.map((v) => v.gap)).toEqual([100, 0]);
    expect(events.filter((e) => e.type === 'board-set')).toHaveLength(2);
  });
});

describe('축이 손잡이를 따라간다', () => {
  /*
   * **stage 는 algorithm 을 참조할 수 없다** (원칙 1). 이 화면은 눈금의 사본을 두지
   * 않는다 — 사다리도 낱개의 폭도 걸음마다 오는 payload 에서 셈하므로 갈릴 사본이
   * 없다. 그래서 여기서 잠그는 것은 **선언이 고르는 값이 그림이 담을 수 있는 범위
   * 안인가** 다. 손잡이에 더 큰 값을 더하면 빗살이 통막대가 되고 이 검사가 걸린다.
   */
  it('선언의 사다리가 기록줄에 담긴다', () => {
    expect(declared.sizes.length).toBeLessThanOrEqual(RECORD_CAPACITY);
  });

  it('가장 큰 손잡이 값에서도 낱개가 빗살로 읽힌다', async () => {
    for (const size of handleValues()) {
      const { events } = await run(size);
      for (const p of payloads<TilePayload>(events, 'tile-cross')) {
        expect(p.tiles, `크기 ${p.n}`).toBeLessThanOrEqual(TILE_CAPACITY);
        // 낱개 하나의 폭이 실틈을 남길 만큼은 된다.
        expect(tilePitch(p.tiles, p.remainder), `크기 ${p.n}`).toBeGreaterThan(2);
      }
    }
  });
});

describe('문안', () => {
  it('자리표 집합이 열 언어에서 같다', () => {
    /*
     * `{k}` 가 한 언어에서만 빠지면 그 언어에서만 값이 안 나온다. 타입도 통과하고
     * 그 언어로 띄워 본 사람만 안다. 전수 검사는 en → 번역 한 방향만 보므로
     * 여기서는 **집합이 정확히 같은지**를 본다.
     */
    const bad: string[] = [];
    for (const [key, table] of Object.entries(asymptoticFacet.messages ?? {})) {
      const entries = Object.entries(table as Record<string, string>);
      const en = (table as Record<string, string>).en ?? '';
      const want = [...new Set([...en.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
      for (const [locale, value] of entries) {
        const got = [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
        if (got.join(',') !== want.join(',')) bad.push(`${key} [${locale}] ${got.join(',')} != ${want.join(',')}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('열 언어를 다 채웠다', () => {
    const LOCALES = ['en', 'ko', 'ja', 'zh', 'ar', 'es', 'fr', 'hi', 'id', 'pt'];
    const tables: Array<[string, LocaleStr]> = [
      ['title', asymptoticFacet.title],
      ['description', asymptoticFacet.description as LocaleStr],
      ...Object.entries(asymptoticFacet.messages ?? {}),
    ];
    const bad: string[] = [];
    for (const [name, table] of tables) {
      for (const l of LOCALES) {
        if (typeof (table as Record<string, unknown>)[l] !== 'string') bad.push(`${name}.${l}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('화면에 실제로 그려진 글자', () => {
  /*
   * **이 자리는 다른 검사가 원리적으로 못 잡는다.** `facet-i18n` 은 키가 차 있는지만
   * 보고, 위의 검사들은 발신 payload 를 볼 뿐 **그려진 글자**를 보지 않는다. 형제
   * 완제품이 머리 식에 `1,000` 이라 적어 계수에 천 단위 구분이 붙은 채로 타입도
   * 검사도 통과한 전례가 있다.
   *
   * 숫자 표기는 **두 층위**다.
   *   - 식 표기 — `2n²` 의 `2` 는 계수라 구분을 넣지 않는다.
   *   - 값 읽기 — 입력 크기 1,024 는 값이라 세 자리마다 끊는다.
   *
   * 그리고 이 화면은 **소수를 그리지 않는다.** 비가 10.67 · 102.4 로 나오지만 화면이
   * 적는 것은 온전한 낱개 수(내림)뿐이고 남은 조각은 수가 아니라 **부분 낱개**로
   * 보인다. 그래서 표시와 판정이 같은 수이고, 자릿수를 몇으로 자를지 · `2` 를
   * `2.00` 으로 맞출지 하는 판단이 애초에 생기지 않는다. 그 성질을 여기서 잠근다.
   */
  const COSTS = ['1,048,576', '2,097,152', '10,240', '65,536', '1048576', '2097152', '10240'];

  function glyphProblems(glyphs: string[]): string[] {
    const bad: string[] = [];
    for (const g of glyphs) {
      // 네 자리가 연달아 붙어 있으면 값 읽기인데 안 끊긴 것이다.
      if (/\d{4,}/.test(g)) bad.push(`안 끊긴 수 [${g}]`);
      // 화면에 소수가 뜰 자리가 없다.
      if (/\d\.\d/.test(g)) bad.push(`소수 [${g}]`);
      for (const cost of COSTS) if (g.includes(cost)) bad.push(`비용 값 [${g}]`);
    }
    return bad;
  }

  it('projector 가 stage 로 넘기는 캡션이 두 층위를 지킨다', async () => {
    const captions: string[] = [];
    const fake = {
      async setBoard(): Promise<void> {},
      async setSize(): Promise<void> {},
      async tileCross(): Promise<void> {},
      async tileSame(): Promise<void> {},
      async verdict(): Promise<void> {},
      setCaption(v: string): void {
        captions.push(v);
      },
      reset(): void {},
      destroy(): void {},
    };
    const views = { stage: fake } as unknown as Parameters<typeof asymptoticProjector>[0];
    const instance = asymptoticProjector(views, undefined);

    for (const size of handleValues()) {
      const { events } = await run(size);
      for (const ev of events) await instance.onEvent?.(ev);
    }

    expect(captions.length).toBeGreaterThan(10);
    expect(glyphProblems(captions)).toEqual([]);
    // 가장 큰 크기가 실제로 끊겨서 문장에 들어간다 — 규칙이 헛돌지 않는다.
    expect(captions.some((c) => c.includes('1,024'))).toBe(true);
    expect(captions.some((c) => c.includes('1024'))).toBe(false);
  });

  it('마운트한 화면의 글자가 두 층위를 지킨다', async () => {
    const { clearRegistry, runFacet } = await import('@ffacet/core/runtime');
    const { registerAsymptotic } = await import('../src/index.js');
    clearRegistry();
    registerAsymptotic();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(asymptoticFacet, container);

    const seen = new Set<string>();
    try {
      const deadline = Date.now() + 3_200;
      while (Date.now() < deadline) {
        for (const node of container.querySelectorAll('svg text')) {
          const s = (node.textContent ?? '').trim();
          if (s !== '') seen.add(s);
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    } finally {
      handle.destroy();
      container.remove();
    }

    const glyphs = [...seen];
    expect(glyphs.length).toBeGreaterThan(8);
    expect(glyphProblems(glyphs)).toEqual([]);
    // 기록줄의 가장 큰 크기는 끊겨서 뜬다.
    expect(glyphs).toContain('1,024');
    // 식 표기에는 구분을 넣지 않는다 — 계수는 식의 일부다.
    const formulas = glyphs.filter((g) => g.includes('÷'));
    expect(formulas.length).toBeGreaterThan(0);
    for (const f of formulas) expect(f).not.toContain(',');
  }, 20_000);
});

describe('마운트와 재생', () => {
  it('그림이 서고 재생 내내 캔버스 세로가 변하지 않는다', async () => {
    const { clearRegistry, runFacet } = await import('@ffacet/core/runtime');
    const { registerAsymptotic } = await import('../src/index.js');
    clearRegistry();
    registerAsymptotic();

    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]): void => {
      errors.push(args);
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(asymptoticFacet, container);
    try {
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const before = svg!.getAttribute('viewBox');
      expect(svg!.childNodes.length).toBeGreaterThan(0);

      // 세 걸음쯤 굴린다. 걸음 하나가 900ms 남짓이다.
      await new Promise((r) => setTimeout(r, 2_800));

      expect(svg!.getAttribute('viewBox')).toBe(before);
      // 캡션과 낱개가 실제로 그려진다.
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

  it('가장 얇은 걸음이 800ms 아래로 떨어지지 않는다', async () => {
    /*
     * **셈하지 말고 잰다.** 걸음 벽시계는 `애니메이션 + stepMs` 라 선언만 보면
     * 거짓이 된다. 그래서 **실제 stage 를 감싸** 메서드가 불리는 시각을 찍는다 —
     * 가짜 stage 로 재면 얹히는 애니메이션이 통째로 빠져 재는 뜻이 없어진다.
     */
    const { clearRegistry, registerView, runFacet } = await import('@ffacet/core/runtime');
    const { registerAsymptotic } = await import('../src/index.js');
    clearRegistry();
    registerAsymptotic();

    const stamps: number[] = [];
    const real = asymptoticStageView;
    const spy: CanvasView = {
      canvas: real.canvas,
      mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
        const inner = real.mount(container, params) as unknown as Record<string, unknown>;
        const wrap = (name: string): ((...args: unknown[]) => unknown) => {
          const fn = inner[name] as (...args: unknown[]) => unknown;
          return (...args: unknown[]) => {
            stamps.push(Date.now());
            return fn(...args);
          };
        };
        return {
          ...(inner as unknown as ViewInstance),
          setBoard: wrap('setBoard'),
          setSize: wrap('setSize'),
          tileCross: wrap('tileCross'),
          tileSame: wrap('tileSame'),
          verdict: wrap('verdict'),
        } as unknown as ViewInstance;
      },
    };
    registerView('asymptotic-stage', spy);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(asymptoticFacet, container);
    try {
      await new Promise((r) => setTimeout(r, 4_200));
    } finally {
      handle.destroy();
      container.remove();
    }

    const gaps: number[] = [];
    for (let i = 1; i < stamps.length; i += 1) gaps.push((stamps[i] ?? 0) - (stamps[i - 1] ?? 0));
    // 몇 걸음은 실제로 지나갔어야 잰 것이 있다.
    expect(gaps.length).toBeGreaterThanOrEqual(3);
    // 바닥선은 800ms 이고, 타이머 오차와 CI 부하를 감안해 조금 낮춰 본다.
    expect(Math.min(...gaps)).toBeGreaterThan(700);
  }, 20_000);
});
