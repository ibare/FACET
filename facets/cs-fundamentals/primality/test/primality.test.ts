/**
 * 화면에 뜨는 수가 사실인가 — 그 근거를 여기 둔다.
 *
 * 사양이 손잡이 다섯의 검사 횟수와 배율을 적어 두었지만, 그것을 코드로 옮겨
 * 적으면 호스트의 오타가 그대로 화면이 된다. 그래서 **`facet.ts` 에서 손잡이를
 * 읽어 이 자리에서 다시 셈한다.**
 *
 * 그리고 코드 패널이 보이는 것이 **진짜로 도는 코드**인지를 잰다. IR 을
 * ir-interpreter 로 실제로 돌려 판정과 검사 횟수를 algorithm 의 것과 견준다 —
 * 손잡이 다섯 값 전부에서. 문법만 성하고 셈이 틀린 경우를 이것이 잡는다.
 */

import { describe, expect, it } from 'vitest';
import type { FacetContext, IR, IRStmt } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

import {
  PRIMALITY_NS,
  examine,
  primalityAlgorithm,
  primalityFacet,
  primalityImperativeIR,
  type PrimalityData,
} from '../src/index.js';
// 캡션이 잘리는지는 stage 의 실제 셈으로 재야 한다 — 여기서 흉내 내면 그림과
// 검사가 따로 놀고, 그러면 재는 시늉만 된다.
import { captionOverflows } from '../src/primality-stage.js';

type Emitted = { type: string; payload: Record<string, unknown>; silent: boolean };
type Run = { events: Emitted[]; metrics: Record<string, number> };

/** 자동 재생을 끝까지 굴리고, 입력 대기에 들어서면 취소로 끊는다. */
async function play(n: number): Promise<Run> {
  const events: Emitted[] = [];
  const metrics: Record<string, number> = {};
  let cancelled = false;
  const ctx = {
    data: { type: 'primality', n, buildMs: 0, stepMs: 0 } satisfies PrimalityData,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: { type: string; payload?: unknown; silent?: boolean }): Promise<void> {
      events.push({
        type: event.type,
        payload: (event.payload ?? {}) as Record<string, unknown>,
        silent: event.silent === true,
      });
    },
    metric(name: string, delta: number | 'inc'): void {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep(): Promise<boolean> {
      return true;
    },
    pollInput(): null {
      return null;
    },
    async waitForInput(): Promise<never> {
      cancelled = true;
      throw new Error('cancelled');
    },
  };
  await primalityAlgorithm(ctx as unknown as FacetContext<PrimalityData>);
  return { events, metrics };
}

/**
 * 자동 재생을 마친 뒤 손잡이 입력을 하나 넣고, 그다음 대기에서 끊는다.
 *
 * `ReactiveMechanism.onControl` 이 facet 고유 액션을 `dispatch({ type: action })`
 * 로 넘기므로, 손잡이의 `action: 'n'` 이 곧 이벤트의 `type` 이다.
 */
async function playThenSwitch(n: number, to: number, type: string): Promise<Emitted[]> {
  const events: Emitted[] = [];
  let cancelled = false;
  let asked = 0;
  const ctx = {
    data: { type: 'primality', n, buildMs: 0, stepMs: 0 } satisfies PrimalityData,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: { type: string; payload?: unknown; silent?: boolean }): Promise<void> {
      events.push({
        type: event.type,
        payload: (event.payload ?? {}) as Record<string, unknown>,
        silent: event.silent === true,
      });
    },
    metric(): void {},
    async sleep(): Promise<boolean> {
      return true;
    },
    pollInput(): null {
      return null;
    },
    async waitForInput(): Promise<{ type: string; payload: unknown }> {
      asked += 1;
      if (asked === 1) return { type, payload: { value: to } };
      cancelled = true;
      throw new Error('cancelled');
    },
  };
  await primalityAlgorithm(ctx as unknown as FacetContext<PrimalityData>);
  return events;
}

/** IR 안에 적힌 phase 를 전부 모은다. */
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
 * 진짜 IR 에 **검사 세는 줄만** 끼워 넣은 사본.
 *
 * 구조는 손대지 않는다 — 반복 경계도 판정도 그대로다. 그래서 여기서 세어 나오는
 * 수가 곧 그 IR 이 하는 검사의 수다. 손으로 비슷한 IR 을 다시 적으면 진짜 IR 이
 * 바뀔 때 조용히 어긋난다.
 */
function countingIR(src: IR): IR {
  const clone = structuredClone(src) as IR;
  const fn = clone.functions[0];
  if (!fn) throw new Error('함수가 없다');
  const loop = fn.body.find((s): s is Extract<IRStmt, { kind: 'while' }> => s.kind === 'while');
  if (!loop) throw new Error('while 이 없다');

  // 검사 한 번마다 세는 줄을 반복 바디 맨 앞에 끼운다.
  loop.body.unshift({
    kind: 'assign',
    target: { kind: 'var', name: 'checks' },
    expr: {
      kind: 'binop',
      op: '+',
      l: { kind: 'var', name: 'checks' },
      r: { kind: 'lit', value: 1 },
    },
  });

  // 어느 갈래로 나가든 검사 수를 돌려준다.
  const returnChecks = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if (s.kind === 'return') s.expr = { kind: 'var', name: 'checks' };
      else if (s.kind === 'if') {
        returnChecks(s.then);
        if (s.else) returnChecks(s.else);
      } else if (s.kind === 'while' || s.kind === 'for-range') returnChecks(s.body);
    }
  };
  returnChecks(fn.body);

  fn.body.unshift({
    kind: 'var',
    name: 'checks',
    type: { kind: 'int' },
    init: { kind: 'lit', value: 0 },
  });
  return clone;
}

const COUNTING_IR = countingIR(primalityImperativeIR);

/** 손잡이가 실제로 내주는 값. 선언에서 읽는다 — 사양을 옮겨 적지 않는다. */
const controls = primalityFacet.blocks.controls as {
  controls: Array<{ widget?: string; segments?: Array<{ value: number }> }>;
};
const handleNs = (controls.controls.find((c) => c.widget === 'segmented-slider')?.segments ?? []).map(
  (s) => s.value,
);

/** 낱낱이 훑어 구한 판정 — 알고리즘과 다른 방법이어야 견줌에 뜻이 있다. */
function primeByBruteForce(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d < n; d += 1) if (n % d === 0) return false;
  return true;
}

describe('손잡이', () => {
  it('선언한 손잡이와 algorithm 이 아는 손잡이가 같다', () => {
    expect(handleNs).toEqual([...PRIMALITY_NS]);
  });

  /*
   * 이 facet 이 서는 자리다. 합성수가 하나라도 섞이면 그 값에서만 두 방법이 다
   * 일찍 멈춰 아낌이 사라지고, 손잡이가 무엇을 말하는지 알 수 없게 된다.
   */
  it('다섯 다 소수다 — 아낌은 소수에서만 드러난다', () => {
    for (const n of handleNs) {
      expect(primeByBruteForce(n)).toBe(true);
      expect(examine(n).prime).toBe(true);
    }
  });

  /*
   * 기본 눈금이 선언 · initialData · algorithm 에서 갈리면 처음 뜨는 화면이
   * 손잡이가 가리키는 자리와 어긋난다. stage 는 손잡이 값을 아예 들지 않으므로
   * (primality-stage.ts 머리말) 묶어야 할 것이 이 셋이다.
   */
  it('기본 눈금 하나가 선언 · initialData · algorithm 에서 같다', () => {
    const segs = (controls.controls.find((c) => c.widget === 'segmented-slider')?.segments ??
      []) as Array<{ value: number; default?: boolean }>;
    const marked = segs.filter((s) => s.default === true);
    expect(marked).toHaveLength(1);
    const initial = primalityFacet.initialData['n'];
    expect(initial).toBe(marked[0]?.value);
    expect(PRIMALITY_NS).toContain(initial);
  });

  /*
   * 손잡이 액션 이름이 곧 dispatch 이벤트의 type 이다. 둘이 갈리면 손잡이를
   * 밀어도 아무 일이 없는데 단추는 멀쩡해 보인다 — 코어가 실제로 데인 모양이다.
   * 그리고 그 밖의 어휘를 흘리는 문이 나중에 조용히 풀리지 않게 함께 잠근다.
   */
  it('손잡이 액션은 n 이고, 그 type 으로 온 입력만 판을 다시 짓는다', async () => {
    const seg = controls.controls.find((c) => c.widget === 'segmented-slider') as
      | { action?: string }
      | undefined;
    expect(seg?.action).toBe('n');

    const switched = await playThenSwitch(97, 1597, 'n');
    const builts = switched.filter((e) => e.type === 'built');
    expect(builts).toHaveLength(2);
    expect(builts[1]?.payload['n']).toBe(1597);

    // 다른 어휘는 흘린다 — 판이 다시 지어지지 않는다.
    const ignored = await playThenSwitch(97, 1597, 'play');
    expect(ignored.filter((e) => e.type === 'built')).toHaveLength(1);
  });

  it('손잡이가 커질수록 배율이 단조로 는다', () => {
    const ratios = handleNs.map((n) => {
      const f = examine(n);
      return f.fullChecks / f.sqrtChecks;
    });
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i]!).toBeGreaterThan(ratios[i - 1]!);
    }
  });
});

describe('검사 횟수', () => {
  it.each([
    [97, 8, 95, '11.9'],
    [211, 13, 209, '16.1'],
    [409, 19, 407, '21.4'],
    [797, 27, 795, '29.4'],
    [1597, 38, 1595, '42.0'],
  ])('n=%i — √까지 %i · 2..n-1 %i · 배율 %s', (n, sqrtChecks, fullChecks, ratio) => {
    const f = examine(n);
    expect(f.sqrtChecks).toBe(sqrtChecks);
    expect(f.fullChecks).toBe(fullChecks);
    expect((f.fullChecks / f.sqrtChecks).toFixed(1)).toBe(ratio);
    // 후보는 2..⌊√n⌋ 이고 그 수가 곧 검사 횟수다.
    expect(f.limit).toBe(Math.floor(Math.sqrt(n)));
    expect(f.candidates[0]).toBe(2);
    expect(f.candidates[f.candidates.length - 1]).toBe(f.limit);
  });

  /**
   * **양쪽이 같은 단위로 세어지는가.**
   *
   * 화면의 자는 왼쪽 도막(제곱근까지)과 오른쪽 줄(n 아래 전부)을 **같은 눈금**
   * 으로 그린다 — 검사 한 번이 길이 한 칸이고, 그 규칙이 두 쪽에 똑같이 걸린다.
   * 그 전제가 참이려면 두 수가 같은 것을 세고 있어야 한다.
   *
   * 약수가 √n 이하에 있는 합성수가 그것을 잰다. 그때 두 방법은 **똑같은
   * 자리에서** 멈추므로 검사 횟수가 정확히 같아야 한다. 하나라도 어긋나면 두
   * 수가 다른 것을 세고 있다는 뜻이고, 그러면 자의 대비가 통째로 거짓이 된다.
   */
  it.each([91, 1591, 100, 4, 9, 209])(
    '약수가 √n 이하면 두 방법의 검사 횟수가 같다 — 같은 단위라는 증거 (n=%i)',
    (n) => {
      const f = examine(n);
      const factor = f.factor ?? 0;
      expect(factor).toBeGreaterThan(0);
      expect(factor).toBeLessThanOrEqual(Math.sqrt(n));
      expect(f.sqrtChecks).toBe(f.fullChecks);
    },
  );

  /*
   * 합성수 갈래는 화면에 닿지 않지만 **코드에는 있어야 한다.** 없으면 이것은
   * 소수 판정이 아니라 "√까지 세는 것" 일 뿐이다.
   */
  it.each([91, 1591, 100, 4, 9, 209])('합성수 %i 은 걸린 자리에서 멈춘다', (n) => {
    const f = examine(n);
    expect(f.prime).toBe(false);
    expect(f.factor).not.toBeNull();
    expect(n % (f.factor ?? 1)).toBe(0);
    // 걸린 자리가 마지막으로 본 후보다 — 그 뒤로는 보지 않는다.
    expect(f.candidates[f.candidates.length - 1]).toBe(f.factor);
    expect(f.sqrtChecks).toBeLessThanOrEqual(f.limit - 1);
  });
});

describe('algorithm 이 내는 걸음', () => {
  it.each([...PRIMALITY_NS])('n=%i — check 걸음 수가 검사 횟수와 같다', async (n) => {
    const { events, metrics } = await play(n);
    const f = examine(n);
    const checks = events.filter((e) => e.type === 'check');
    expect(checks).toHaveLength(f.sqrtChecks);
    expect(checks.map((e) => e.payload['d'])).toEqual(f.candidates);
    expect(checks[checks.length - 1]?.payload['checks']).toBe(f.sqrtChecks);
    expect(metrics['check-count']).toBe(f.sqrtChecks);
    expect(metrics['full-check-count']).toBe(f.fullChecks);
  });

  it('메트릭에 분수형 수치를 싣지 않는다', async () => {
    const { metrics } = await play(1597);
    for (const v of Object.values(metrics)) expect(Number.isInteger(v)).toBe(true);
  });

  it('phase 이벤트만 silent 다', async () => {
    const { events } = await play(97);
    for (const e of events) expect(e.silent).toBe(e.type === 'phase');
  });

  /**
   * 선언한 문안이 고정 데이터에서 한 번은 떠야 한다. 어느 갈래가 안 일어나면
   * 그 캡션은 코드에만 있는 죽은 문장이 된다 (배치 공통 지침).
   */
  it('선언한 캡션의 네 갈래가 손잡이 전 값에서 모두 일어난다', async () => {
    for (const n of PRIMALITY_NS) {
      const kinds = new Set((await play(n)).events.map((e) => e.type));
      expect(kinds.has('built')).toBe(true);
      expect(kinds.has('check')).toBe(true);
      expect(kinds.has('wall')).toBe(true);
      expect(kinds.has('verdict')).toBe(true);
    }
  });

  it('선언한 messages 키가 코드가 부르는 것과 정확히 같다', () => {
    expect(Object.keys(primalityFacet.messages ?? {}).sort()).toEqual([
      'caption.built',
      'caption.check',
      'caption.verdict',
      'caption.wall',
      'label.candidates',
      'label.fullSide',
      'label.ratio',
      'label.sqrtSide',
    ]);
  });
});

describe('자리표가 언어마다 갈리지 않는다', () => {
  /*
   * 열 언어를 다 채워도 **자리표 집합이 다르면** 전수 검사
   * (`test/facet-i18n.test.ts`) 가 실패한다. 실제로 `caption.verdict` 의
   * ko·ja·zh 가 {n} 을 빠뜨려 저장소 전수를 깨뜨렸다.
   *
   * 문안을 손볼 때마다 눈으로 대조할 수는 없다 — 여덟 키 곱하기 열 언어라
   * 여든 칸이고, 빠진 자리표는 화면에서 **그냥 안 보일 뿐**이라 띄워 봐도
   * 모른다. 한 번 난 것은 여기서 계속 잡는다.
   */
  const marks = (s: string): string =>
    [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? ''))].sort().join(',');

  const keys = Object.keys(primalityFacet.messages ?? {});

  it.each(keys)('%s — 열 언어의 자리표가 en 과 같다', (key) => {
    const table = ((primalityFacet.messages ?? {})[key] ?? {}) as Record<string, string>;
    const want = marks(table['en'] ?? '');
    const bad: string[] = [];
    for (const [locale, text] of Object.entries(table)) {
      if (typeof text !== 'string') continue;
      if (marks(text) !== want) bad.push(`${locale}: [${marks(text)}] 이라야 할 것은 [${want}]`);
    }
    expect(bad).toEqual([]);
  });
});

describe('캡션이 화면에서 잘리지 않는다', () => {
  /*
   * 고정 폭 자리는 **열 언어 중 가장 긴 것으로** 확인해야 하고, 그것을 막는
   * 검사가 없다는 것이 배치 공통 지침의 경고다. 여기서 그 검사를 둔다.
   *
   * 값이 들어가면 문장이 길어지므로 가장 큰 손잡이(n=1597)의 수를 꽂아 잰다 —
   * 템플릿만 재면 실제로 뜨는 문장보다 짧아 헛통과한다.
   */
  const WORST = {
    n: '1597',
    limit: '39',
    d: '39',
    checks: '38',
    full: '1595',
    ratio: '42.0',
  };

  const render = (tpl: string): string =>
    tpl.replace(/\{(\w+)\}/g, (_m, k: string) => WORST[k as keyof typeof WORST] ?? `{${k}}`);

  /*
   * 캡션 상자에 들어가는 것만 잰다. `label.*` 는 줄 머리와 자(meter) 양 끝에
   * 따로 놓이는 짧은 표식이라 상자도 쓸 수 있는 폭도 다르다 — 캡션의 자로 재면
   * 통과해도 뜻이 없다.
   */
  const rows: Array<[string, string, string]> = [];
  for (const [key, table] of Object.entries(primalityFacet.messages ?? {})) {
    if (!key.startsWith('caption.')) continue;
    for (const [locale, text] of Object.entries(table)) {
      if (typeof text === 'string') rows.push([key, locale, text]);
    }
  }

  it('캡션 넷의 열 언어를 다 재고 있다 — 목록이 비면 아래가 헛통과한다', () => {
    expect(rows.length).toBe(4 * 10);
  });

  it.each(rows)('%s / %s 가 캡션 상자 안에 든다', (_key, _locale, text) => {
    expect(captionOverflows(render(text))).toBe(false);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await play(97);
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => String(e.payload['phase'])),
    );
    expect([...emitted].sort()).toEqual([...irPhases(primalityImperativeIR)].sort());
    expect([...emitted].sort()).toEqual(['bound', 'next', 'prime', 'test']);
  });
});

describe('IR 을 실제로 돌려 본다 (ir-interpreter)', () => {
  // 코드 패널이 보여 주는 것이 진짜로 도는 코드인지 재는 유일한 방법이다.

  it.each([...PRIMALITY_NS])('n=%i — IR 의 판정이 algorithm 의 것과 같다', (n) => {
    expect(runIR(primalityImperativeIR, 'is_prime', [n])).toBe(1);
    expect(examine(n).prime).toBe(true);
  });

  it.each([...PRIMALITY_NS])('n=%i — IR 의 검사 횟수가 algorithm 의 것과 같다', (n) => {
    expect(runIR(COUNTING_IR, 'is_prime', [n])).toBe(examine(n).sqrtChecks);
  });

  /*
   * 소수에서는 닿지 않는 `return 0` 이 실제로는 성한 코드여야 한다. 합성수로
   * 그것을 밟아 본다 — 코드 패널의 불 꺼진 줄이 죽은 줄이 아니라는 근거다.
   */
  it.each([91, 1591, 100, 4, 9, 209])('합성수 %i — IR 도 algorithm 도 0 으로 답한다', (n) => {
    expect(runIR(primalityImperativeIR, 'is_prime', [n])).toBe(0);
    expect(examine(n).prime).toBe(false);
    expect(runIR(COUNTING_IR, 'is_prime', [n])).toBe(examine(n).sqrtChecks);
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
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 넷이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(primalityImperativeIR);
      expect(res.lines.length).toBeGreaterThan(5);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual([...irPhases(primalityImperativeIR)].sort());
      const all = res.lines.map((l) => l.code).join('\n');
      expect(all).toContain('is_prime');
      // 이 facet 의 주장이 코드 패널에서 낱말로 보여야 한다.
      expect(all.toLowerCase()).toContain('sqrt');
    },
  );
});

describe('걸음 벽시계', () => {
  /*
   * 가장 얇은 걸음은 후보 하나를 짚는 걸음이고, 그 길이는
   * `커서 이동(170ms) + 빗금·자(140ms) + stepMs` 다. 실측은
   * 스크래치에서 실제 러너로 재고(보고 참조), 여기서는 그 바닥이 나중에
   * 조용히 깎이지 않도록 선언값을 붙들어 둔다.
   *
   * 바닥선 800ms 는 `S-piece` 85–87 행의 것이다. 그것은 조각 규범이고
   * `tasks/whole-batch-protocol.md` 에는 같은 조항이 없다 — 이 배치 사양이
   * "완제품은 컨트롤바가 있어 조각만큼 빡빡하지 않으나 **자동 재생의 걸음은 같은
   * 잣대로 본다**" 고 해서 빌려 온 잣대다. 출처를 적어 두지 않으면 다음 사람이
   * 완제품 규범에서 이 수를 찾다가 못 찾는다.
   */
  const STAGE_ANIMATION_MS = 310;
  const FLOOR_MS = 800;

  it('가장 얇은 걸음이 800ms 아래로 떨어지지 않는다', () => {
    const stepMs = primalityFacet.initialData['stepMs'];
    expect(typeof stepMs).toBe('number');
    expect((stepMs as number) + STAGE_ANIMATION_MS).toBeGreaterThanOrEqual(FLOOR_MS);
  });
});
