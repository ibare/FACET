// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRStmt,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { mountView } from '@ffacet/core/runtime';
import {
  euclideanAlgorithm,
  euclideanFacet,
  euclideanImperativeIR,
  euclideanStageView,
  euclideanSteps,
  type EuclideanData,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

/** 사양이 정한 손잡이 — 피보나치 인접쌍 다섯. */
const PAIRS: [number, number][] = [
  [21, 13],
  [55, 34],
  [144, 89],
  [377, 233],
  [987, 610],
];

/** 사양이 적은 주 수치. 여기서 직접 재서 맞는지 본다. */
const EXPECTED_DIVISIONS = [6, 8, 10, 12, 14];

/** algorithm 이 발신할 수 있는 phase 어휘. irs 의 것과 같아야 한다 (C3). */
const PHASES = ['remainder', 'shift', 'result'];

const TRANSPILERS = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  /** `ctx.sleep` 이 불린 횟수 = 걸음 수. 걸음의 단위가 주장의 일부라 함께 센다. */
  sleeps: number;
};

function data(a: number, b: number): EuclideanData {
  return {
    type: 'euclidean',
    pairs: PAIRS.map((p) => [...p]),
    a,
    b,
    stepMs: 0,
  };
}

/**
 * reactive 알고리즘을 한 판(또는 입력 수 + 1 판) 돌린다.
 *
 * `waitForInput` 이 줄 것이 떨어지면 취소로 끊는다 — 그러면 알고리즘의 최상위
 * `catch` 가 정상 종료 경로로 받아 돌아온다 (C8 의 정본). 그 경로까지 함께 재는
 * 셈이다.
 */
async function record(a: number, b: number, inputs: ReactiveInputEvent[] = []): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const queue = [...inputs];
  let cancelled = false;
  let sleeps = 0;
  const ctx = {
    data: data(a, b),
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      sleeps += 1;
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput(): Promise<ReactiveInputEvent> {
      const next = queue.shift();
      if (next) return next;
      cancelled = true;
      throw new Error('cancelled');
    },
  };
  await euclideanAlgorithm(ctx as unknown as FacetContext<EuclideanData>);
  return { events, metrics, sleeps };
}

function payloadOf(event: FacetRuntimeEvent | undefined): Record<string, number> {
  return (event?.payload ?? {}) as Record<string, number>;
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

/**
 * 나눗셈 없이 빼기만으로 최대공약수를 구한다. 몫의 합과 견줄 독립 기준이다.
 *
 * **0 이 될 때까지 빼는 셈법이다.** 나눗셈 쪽이 나머지 0 까지 가므로 견주려면
 * 이쪽도 그래야 한다. 두 수가 같아지면 멈추는 셈법은 마지막 한 번을 덜 빼서
 * 늘 하나가 모자란다 — 처음에 그렇게 적었다가 (21,13) 에서 6 대 7 로 어긋났고,
 * 그것이 셈법의 차이지 값의 차이가 아님을 알고 여기 못박는다.
 */
function subtractiveSteps(a: number, b: number): number {
  let x = a;
  let y = b;
  let n = 0;
  // 둘 중 하나가 0 이 되면 끝이다. `y > 0` 만 보면 x 가 0 이 된 뒤 한 번을 더
  // 빼서 (0 을 빼는 헛걸음) 늘 하나가 남는다.
  while (x > 0 && y > 0) {
    if (x < y) {
      const t = x;
      x = y;
      y = t;
    }
    x -= y;
    n += 1;
  }
  return n;
}

describe('유클리드 호제법 — 알고리즘', () => {
  it('다섯 쌍에서 나눗셈이 6 · 8 · 10 · 12 · 14 로 정확히 둘씩 는다', async () => {
    const counts: number[] = [];
    for (const [a, b] of PAIRS) {
      const { events, metrics } = await record(a, b);
      const done = payloadOf(events.at(-1));
      expect(events.at(-1)?.type, `${a},${b}`).toBe('done');
      expect(done.gcd, `${a},${b}`).toBe(1);
      expect(metrics['division-count'], `${a},${b}`).toBe(done.divisions);
      counts.push(done.divisions ?? -1);
    }
    expect(counts).toEqual(EXPECTED_DIVISIONS);
    // 우연히 는 것이 아니라 걸음마다 둘씩이다.
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]! - counts[i - 1]!).toBe(2);
    }
  });

  it('몫의 합은 빼기만으로 했을 때의 걸음 수와 같다 — 나눗셈이 번 것이 하나뿐이다', async () => {
    const sums: number[] = [];
    for (const [a, b] of PAIRS) {
      const { events, metrics } = await record(a, b);
      const done = payloadOf(events.at(-1));
      expect(metrics['quotient-sum'], `${a},${b}`).toBe(done.quotientSum);
      // 빼기만 하는 판과 걸음 수가 같다 (독립으로 센 값이다).
      expect(done.quotientSum, `${a},${b}`).toBe(subtractiveSteps(a, b));
      // 그런데 나눗셈보다 딱 하나 크다 — 몫이 마지막 한 번 빼고 전부 1 이라서다.
      expect(done.quotientSum, `${a},${b}`).toBe((done.divisions ?? 0) + 1);
      sums.push(done.quotientSum ?? -1);
    }
    expect(sums).toEqual([7, 9, 11, 13, 15]);
  });

  it('한 걸음이 divide 와 reduce 둘로 보이고 짝이 한 칸씩 민다', async () => {
    const { events } = await record(21, 13);
    const divides = events.filter((e) => e.type === 'divide').map((e) => payloadOf(e));
    const reduces = events.filter((e) => e.type === 'reduce').map((e) => payloadOf(e));
    expect(divides.length).toBe(6);
    expect(reduces.length).toBe(6);

    const steps = euclideanSteps(21, 13);
    expect(divides.map((p) => [p.a, p.b, p.q, p.r])).toEqual(
      steps.map((s) => [s.a, s.b, s.q, s.r]),
    );
    // 다음 짝은 (b, r) 다.
    expect(reduces.map((p) => [p.a, p.b])).toEqual(steps.map((s) => [s.b, s.r]));
    // 마지막 나눗셈만 딱 나누어떨어진다 — 화면의 `caption.exact` 갈래가 그 한 번이다.
    expect(divides.filter((p) => p.r === 0).length).toBe(1);
    expect(divides.at(-1)?.r).toBe(0);
    // 마지막을 뺀 몫은 전부 1 이다. 그것이 이 입력이 최악인 까닭이다.
    expect(divides.slice(0, -1).every((p) => p.q === 1)).toBe(true);
  });

  it('phase 이벤트는 전부 silent 이고 어휘가 irs 와 같다 (C3)', async () => {
    const { events } = await record(55, 34);
    const phaseEvents = events.filter((e) => e.type === 'phase');
    expect(phaseEvents.every((e) => e.silent === true)).toBe(true);

    const emitted = new Set(phaseEvents.map((e) => (e.payload as { phase: string }).phase));
    const declared = irPhases(euclideanImperativeIR);
    expect([...declared].sort()).toEqual([...PHASES].sort());
    // 한 판이 어휘 셋을 모두 밟는다 — 선언해 놓고 안 뜨는 어휘가 없다.
    expect([...emitted].sort()).toEqual([...PHASES].sort());
  });

  it('손잡이를 밀면 다음 판이 그 쌍으로 돌고, 메트릭이 불어나지 않는다', async () => {
    const { events, metrics } = await record(21, 13, [{ type: 'pair', payload: { value: 987 } }]);
    const setups = events.filter((e) => e.type === 'setup').map((e) => payloadOf(e));
    expect(setups.map((p) => [p.a, p.b])).toEqual([
      [21, 13],
      [987, 610],
    ]);
    const dones = events.filter((e) => e.type === 'done').map((e) => payloadOf(e));
    expect(dones.map((p) => p.divisions)).toEqual([6, 14]);
    // 두 판을 돌았어도 화면에 뜨는 수는 이번 판의 것이다 (누적이 아니다).
    expect(metrics['division-count']).toBe(14);
    expect(metrics['quotient-sum']).toBe(15);
  });

  it('모르는 값이 오면 쌍을 바꾸지 않는다', async () => {
    const { events } = await record(21, 13, [{ type: 'pair', payload: { value: 9 } }]);
    const setups = events.filter((e) => e.type === 'setup').map((e) => payloadOf(e));
    expect(setups.map((p) => [p.a, p.b])).toEqual([
      [21, 13],
      [21, 13],
    ]);
  });
});

describe('유클리드 호제법 — IR', () => {
  it('IR 이 셈하는 최대공약수와 걸음 수가 algorithm 의 것과 같다 (손잡이 전 값)', async () => {
    for (const [a, b] of PAIRS) {
      const { events } = await record(a, b);
      const done = payloadOf(events.at(-1));
      expect(runIR(euclideanImperativeIR, 'gcd', [a, b]), `gcd ${a},${b}`).toBe(done.gcd);
      expect(
        runIR(euclideanImperativeIR, 'division_count', [a, b]),
        `division_count ${a},${b}`,
      ).toBe(done.divisions);
    }
  });

  it('손잡이 밖의 수에서도 IR 과 순수 함수가 같은 답을 낸다', () => {
    const cases: [number, number][] = [
      [48, 18],
      [270, 192],
      [1071, 462],
      [17, 5],
      [13, 13],
      [100, 1],
      [7, 0],
    ];
    for (const [a, b] of cases) {
      const steps = euclideanSteps(a, b);
      // 견줄 기준은 IR 도 euclideanSteps 도 아닌 제3의 루프여야 한다. 같은 함수로
      // 양쪽을 만들면 견주는 시늉만 하게 된다.
      const byLoop = (() => {
        let x = a;
        let y = b;
        while (y > 0) {
          const r = x % y;
          x = y;
          y = r;
        }
        return x;
      })();
      expect(runIR(euclideanImperativeIR, 'gcd', [a, b]), `gcd ${a},${b}`).toBe(byLoop);
      expect(
        runIR(euclideanImperativeIR, 'division_count', [a, b]),
        `division_count ${a},${b}`,
      ).toBe(steps.length);
    }
  });

  it('여섯 언어가 성한 코드를 내고 phase 라벨 집합이 IR 어휘와 같다', () => {
    const declared = [...irPhases(euclideanImperativeIR)].sort();
    for (const t of TRANSPILERS) {
      const { lines } = t.transpile(euclideanImperativeIR);
      expect(lines.length, t.id).toBeGreaterThan(0);
      expect(
        lines.every((l) => !l.code.includes('undefined')),
        t.id,
      ).toBe(true);
      const emitted = [
        ...new Set(lines.map((l) => l.phase).filter((p): p is string => p !== null)),
      ].sort();
      expect(emitted, t.id).toEqual(declared);
      // 두 함수가 같은 루프를 돈다 — 그것이 이 패널의 몫이다.
      const source = lines.map((l) => l.code).join('\n');
      expect(source, t.id).toContain('gcd');
      expect(source, t.id).toContain('division_count');
    }
  });
});

describe('유클리드 호제법 — 최악의 입력', () => {
  it('각 크기에서 나눗셈이 가장 많이 드는 쌍은 그 피보나치 인접쌍 하나뿐이다', () => {
    const stepsOf = (a: number, b: number): number => {
      let x = a;
      let y = b;
      let n = 0;
      while (y > 0) {
        const r = x % y;
        x = y;
        y = r;
        n += 1;
      }
      return n;
    };
    for (let i = 0; i < PAIRS.length; i += 1) {
      const [A, B] = PAIRS[i]!;
      let best = 0;
      let ties = 0;
      let arg: [number, number] = [0, 0];
      for (let a = 1; a <= A; a += 1) {
        for (let b = 1; b <= a; b += 1) {
          const s = stepsOf(a, b);
          if (s > best) {
            best = s;
            ties = 1;
            arg = [a, b];
          } else if (s === best) {
            ties += 1;
          }
        }
      }
      expect(best, `a≤${A}`).toBe(EXPECTED_DIVISIONS[i]);
      expect(ties, `a≤${A} 동률`).toBe(1);
      expect(arg, `a≤${A} 최악`).toEqual([A, B]);
    }
  }, 30_000);
});

describe('유클리드 호제법 — 선언', () => {
  it('facet 이 코드 패널과 손잡이와 메트릭을 사양대로 든다', () => {
    expect(euclideanFacet.id).toBe('facet:euclidean');
    expect(euclideanFacet.algorithm).toBe('module:euclidean');
    expect(euclideanFacet.projector).toBe('module:euclideanProjector');
    expect(euclideanFacet.initialData.type).toBe('euclidean');
    // 섞으면 안 된다 — 두 수의 짝이 곧 손잡이다.
    expect(euclideanFacet.shuffleOnReset).toBeUndefined();
    // 완제품이므로 머리말(title-block)을 든다 — 조각과 갈리는 자리다.
    expect(Object.keys(euclideanFacet.blocks).sort()).toEqual([
      'codePanel',
      'controls',
      'header',
      'stage',
    ]);
    expect((euclideanFacet.blocks.header as { type: string }).type).toBe('title-block');
    expect(euclideanFacet.layout).toBeDefined();
    const panel = euclideanFacet.blocks.codePanel as { ir?: string };
    expect(panel.ir).toBe(`ir:${euclideanImperativeIR.id}`);
  });

  it('손잡이의 값이 initialData 의 쌍과 하나도 어긋나지 않는다', () => {
    const pairs = euclideanFacet.initialData.pairs as number[][];
    expect(pairs).toEqual(PAIRS.map((p) => [...p]));

    const controls = (euclideanFacet.blocks.controls as { controls: Record<string, unknown>[] })
      .controls;
    const slider = controls.find((c) => c.action === 'pair') as
      | { segments?: { value: number; default?: boolean }[] }
      | undefined;
    expect(slider?.segments?.map((s) => s.value)).toEqual(pairs.map((p) => p[0]));
    // 처음 걸리는 칸이 initialData 의 두 수와 같아야 한다.
    const initial = slider?.segments?.find((s) => s.default === true);
    expect(initial?.value).toBe(euclideanFacet.initialData.a);
  });

  it('화면이 부르는 문안 키를 선언이 모두 든다', () => {
    const declared = Object.keys(euclideanFacet.messages ?? {}).sort();
    expect(declared).toEqual([
      'caption.divide',
      'caption.done',
      'caption.exact',
      'caption.setup',
      'label.divisions',
      'label.gcd',
      'label.squares',
      'label.whole',
      'value.division',
    ]);
  });
});

/**
 * 손잡이 눈금이 선언 · algorithm · stage 셋에서 갈리지 않는가.
 *
 * stage 는 algorithm 을 참조할 수 없으므로 (원칙 1) 눈금을 자기 상수로 다시 적고
 * 싶어지는 자리다. 그렇게 하면 **선언과 갈려도 화면이 멀쩡해 보인다** — 나눗셈
 * 횟수만 맞으면 (377,233) 을 (377,234) 로 적어도 눈으로는 못 잡는다. 여기서 셋을
 * 한 검사로 묶는다.
 */
describe('유클리드 호제법 — 눈금과 걸음', () => {
  it('선언한 다섯 쌍이 피보나치 인접쌍이다 — 옮겨 적은 것이 아니라 점화식에서 나온다', () => {
    const fib: number[] = [0, 1];
    while (fib.length < 24) fib.push(fib[fib.length - 1]! + fib[fib.length - 2]!);
    const adjacent = new Set<string>();
    for (let k = 1; k + 1 < fib.length; k += 1) adjacent.add(`${fib[k + 1]},${fib[k]}`);

    const pairs = euclideanFacet.initialData.pairs as number[][];
    expect(pairs.length).toBe(5);
    for (const [a, b] of pairs) {
      expect(adjacent.has(`${a},${b}`), `(${a},${b}) 이 피보나치 인접쌍인가`).toBe(true);
    }
    // 건너뛰지 않고 하나씩 걸러 이웃해야 "정확히 둘씩" 이 나온다.
    const at = pairs.map(([a]) => fib.indexOf(a!));
    for (let i = 1; i < at.length; i += 1) {
      expect(at[i]! - at[i - 1]!, `${pairs[i]} 의 자리`).toBe(2);
    }
  });

  it('stage 는 눈금을 자기 상수로 들지 않는다 — 받은 수를 그대로 그린다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(euclideanStageView, container, {
      config: {},
      // 선언의 셋째 칸이다. stage 가 제 상수를 들고 있으면 첫 칸이 그려진다.
      initialData: { a: 377, b: 233 },
      locale: 'en',
      theme: 'light',
    }) as unknown as {
      divide(a: number, b: number, q: number, r: number, index: number): Promise<void>;
      destroy(): void;
    };

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const texts = (): string[] => [...svg!.querySelectorAll('text')].map((t) => t.textContent ?? '');
    const rects = (): SVGRectElement[] => [...svg!.querySelectorAll('rect')];

    // 받은 두 수가 그대로 캡션이고 그림의 치수다 (unit 좌표).
    expect(texts()).toContain('Start with two numbers: 377 and 233.');
    expect(
      rects().some((r) => r.getAttribute('width') === '377' && r.getAttribute('height') === '233'),
      '377 × 233 직사각형이 있어야 한다',
    ).toBe(true);

    // 걸음의 값도 payload 에서 온다 — stage 가 스스로 셈하지 않는다.
    await instance.divide(377, 233, 1, 144, 1);
    expect(texts()).toContain('377 = 1 × 233 + 144');

    instance.destroy();
    container.remove();
  });

  it('걸음의 단위가 나눗셈 하나다 — 걸음 수가 주 수치와 함께 는다', async () => {
    const steps: number[] = [];
    for (const [a, b] of PAIRS) {
      const { events, sleeps } = await record(a, b);
      const done = payloadOf(events.at(-1));
      // 판을 세우는 걸음 하나 + 나눗셈마다 한 걸음. 그 밖의 걸음은 없다.
      expect(sleeps, `${a},${b}`).toBe((done.divisions ?? 0) + 1);
      steps.push(sleeps);
    }
    expect(steps).toEqual(EXPECTED_DIVISIONS.map((n) => n + 1));
  });

  it('IR 이 쓰는 연산은 셋뿐이다 — `&&` 와 `||` 가 한 번도 나오지 않는다', () => {
    // `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라, 쓰면 오른쪽이 늘 셈해진다.
    // 여기서는 피한 것이 아니라 **없다** — 루프 조건이 하나뿐이라서다.
    const seen = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const v of node) walk(v);
        return;
      }
      if (typeof node !== 'object' || node === null) return;
      const rec = node as Record<string, unknown>;
      if (typeof rec.op === 'string') seen.add(rec.op);
      for (const v of Object.values(rec)) walk(v);
    };
    walk(euclideanImperativeIR);
    expect([...seen].sort()).toEqual(['!=', '%', '+']);
  });
});
