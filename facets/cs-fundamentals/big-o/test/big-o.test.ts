// @vitest-environment happy-dom
/**
 * bigO — 선언에서 데이터를 읽어 **그 자리에서 다시 셈해** 대조한다.
 *
 * 근거의 정본은 스크래치가 아니라 커밋된 검사여야 한다. 측정 스크립트는 형제
 * 완제품과 한 디렉터리를 쓰므로 서로 덮어쓸 수 있다 — 여기서 재면 그 위험에
 * 노출되지 않는다.
 */

import { describe, expect, it } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRStmt,
  ProjectorViews,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { mountView } from '@ffacet/core/runtime';
import {
  bigOAlgorithm,
  bigOFacet,
  bigOImperativeIR,
  bigOProjector,
  bigORung,
  bigOStageView,
  type BigOData,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

/** 저장소가 번역 번들을 갖춘 열 언어. `messages/*.json` 과 같다. */
const LOCALES = ['en', 'ko', 'ja', 'zh', 'ar', 'es', 'fr', 'hi', 'id', 'pt'] as const;

/** algorithm 이 발신할 수 있는 phase 어휘. irs 의 것과 같아야 한다 (C3). */
const PHASES = ['evaluate', 'compare', 'result'];

const TRANSPILERS = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

/**
 * 사양이 준 실측표. **아래 검사가 선언에서 다시 셈한 것과 같아야 한다.**
 *
 * 둘이 어긋나면 선언이 틀렸거나 이 표가 틀린 것이고, 어느 쪽이든 화면이 거짓을
 * 말하게 된다. 항은 최고차부터다.
 */
const TABLE = [
  { n: 1, terms: [1, 5, 100, 1000], sum: 1106, pct: '0.1', places: [3, 2, 1, 0], outranked: 0, tied: 1 },
  { n: 5, terms: [125, 125, 500, 1000], sum: 1750, pct: '7.1', places: [2, 2, 1, 0], outranked: 0, tied: 1 },
  { n: 10, terms: [1000, 500, 1000, 1000], sum: 3500, pct: '28.6', places: [0, 3, 0, 0], outranked: 1, tied: 3 },
  { n: 20, terms: [8000, 2000, 2000, 1000], sum: 13000, pct: '61.5', places: [0, 1, 1, 3], outranked: 3, tied: 1 },
  { n: 50, terms: [125000, 12500, 5000, 1000], sum: 143500, pct: '87.1', places: [0, 1, 2, 3], outranked: 3, tied: 1 },
  { n: 100, terms: [1000000, 50000, 10000, 1000], sum: 1061000, pct: '94.3', places: [0, 1, 2, 3], outranked: 3, tied: 1 },
];

const declared = bigOFacet.initialData as unknown as BigOData;

/** projector 가 캡션과 아래 읽기에 같은 수를 쓰도록 한 자리에서 만드는 그 셈. */
const pctOf = (value: number, sum: number): string => ((value / sum) * 100).toFixed(1);

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  /** `ctx.sleep` 이 불린 횟수 = 걸음 수. 걸음의 단위가 주장의 일부라 함께 센다. */
  sleeps: number;
};

function data(n: number): BigOData {
  return {
    type: declared.type,
    coefficients: [...declared.coefficients],
    ladder: [...declared.ladder],
    n,
    stepMs: 0,
  };
}

/**
 * reactive 알고리즘을 한 판(또는 입력 수 + 1 판) 돌린다.
 *
 * `waitForInput` 이 줄 것이 떨어지면 취소로 끊는다 — 그러면 알고리즘의 최상위
 * `catch` 가 정상 종료 경로로 받아 돌아온다 (C8 의 정본).
 */
async function record(n: number, inputs: ReactiveInputEvent[] = []): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const queue = [...inputs];
  let cancelled = false;
  let sleeps = 0;
  const ctx = {
    data: data(n),
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
  await bigOAlgorithm(ctx as unknown as FacetContext<BigOData>);
  return { events, metrics, sleeps };
}

function payloadOf(event: FacetRuntimeEvent | undefined): Record<string, unknown> {
  return (event?.payload ?? {}) as Record<string, unknown>;
}

function rungsOf(events: FacetRuntimeEvent[]): Record<string, unknown>[] {
  return events.filter((e) => e.type === 'rung').map((e) => payloadOf(e));
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

describe('Big-O 표기 — 손잡이', () => {
  it('최고차항의 몫이 0.1 → 7.1 → 28.6 → 61.5 → 87.1 → 94.3 으로 단조로 는다', async () => {
    const shares: string[] = [];
    for (const row of TABLE) {
      const { events } = await record(row.n);
      const last = rungsOf(events).at(-1) ?? {};
      const terms = last.terms as number[];
      const sum = last.sum as number;
      expect(last.n, `n=${row.n}`).toBe(row.n);
      shares.push(pctOf(terms[0]!, sum));
    }
    expect(shares).toEqual(TABLE.map((r) => r.pct));
    // 우연히 오른 것이 아니라 눈금마다 오른다.
    const asNumber = shares.map(Number);
    for (let i = 1; i < asNumber.length; i += 1) {
      expect(asNumber[i]!).toBeGreaterThan(asNumber[i - 1]!);
    }
  });

  it('걸음이 실어 보내는 수가 그 자리에서 다시 셈한 것과 같다', async () => {
    const { events } = await record(100);
    const rungs = rungsOf(events);
    expect(rungs.length).toBe(TABLE.length);
    rungs.forEach((p, i) => {
      const want = TABLE[i]!;
      expect({
        n: p.n,
        terms: p.terms,
        sum: p.sum,
        places: p.places,
        outranked: p.outranked,
        tied: p.tied,
      }).toEqual({
        n: want.n,
        terms: want.terms,
        sum: want.sum,
        places: want.places,
        outranked: want.outranked,
        tied: want.tied,
      });
      // 순수 함수가 같은 것을 그 자리에서 다시 셈한다.
      const again = bigORung(declared.coefficients, want.n);
      expect(again.terms).toEqual(want.terms);
      expect(again.sum).toBe(want.sum);
      expect(again.places).toEqual(want.places);
    });
  });

  it('손잡이를 밀면 그 단까지 가고, 메트릭이 판마다 불어나지 않는다', async () => {
    const { events, metrics } = await record(1, [{ type: 'size', payload: { value: 100 } }]);
    const setups = events.filter((e) => e.type === 'setup').map((e) => payloadOf(e));
    expect(setups.map((p) => [p.n, p.rungs])).toEqual([
      [1, 1],
      [100, 6],
    ]);
    // 두 판을 돌았어도 화면에 뜨는 수는 이번 판의 것이다 (누적이 아니다).
    expect(metrics['rung-count']).toBe(6);
    expect(metrics['outranked-count']).toBe(3);
  });

  it('메트릭 둘이 정수이고 손잡이를 따라 단조로 는다', async () => {
    const rungCounts: number[] = [];
    const outranked: number[] = [];
    for (const row of TABLE) {
      const { metrics } = await record(row.n);
      // 처음부터 끝까지 0 인 판에서는 알릴 차가 없어 아무것도 보내지 않는다.
      // 컨트롤바가 `initial: 0` 으로 이미 0 을 띄우고 있으므로 그것이 맞다.
      const rungs = metrics['rung-count'] ?? 0;
      const passed = metrics['outranked-count'] ?? 0;
      expect(Number.isInteger(rungs), `n=${row.n}`).toBe(true);
      expect(Number.isInteger(passed), `n=${row.n}`).toBe(true);
      rungCounts.push(rungs);
      outranked.push(passed);
    }
    expect(rungCounts).toEqual([1, 2, 3, 4, 5, 6]);
    expect(outranked).toEqual(TABLE.map((r) => r.outranked));
    for (let i = 1; i < outranked.length; i += 1) {
      expect(outranked[i]!).toBeGreaterThanOrEqual(outranked[i - 1]!);
    }
  });

  it('모르는 값이 오면 사다리를 바꾸지 않는다', async () => {
    const { events } = await record(1, [{ type: 'size', payload: { value: 7 } }]);
    const setups = events.filter((e) => e.type === 'setup').map((e) => payloadOf(e));
    expect(setups.map((p) => p.n)).toEqual([1, 1]);
  });

  it('화면 문안을 payload 로 보내지 않는다 (C10)', async () => {
    const { events } = await record(100);
    for (const event of events) {
      for (const v of Object.values(payloadOf(event))) {
        if (event.type === 'phase') {
          expect(typeof v).toBe('string');
          continue;
        }
        const ok = typeof v === 'number' || typeof v === 'boolean' || Array.isArray(v);
        expect(ok, `${event.type} 의 ${String(v)}`).toBe(true);
      }
    }
  });
});

describe('Big-O 표기 — 자리가 뒤집히는 순서', () => {
  it('첫 단에서 자리는 정확히 거꾸로이고 끝 단에서는 차수 순서다', () => {
    const first = bigORung(declared.coefficients, declared.ladder[0]!);
    const last = bigORung(declared.coefficients, declared.ladder.at(-1)!);
    expect(first.places).toEqual([3, 2, 1, 0]);
    expect(last.places).toEqual([0, 1, 2, 3]);
  });

  it('최고차항의 자리는 내려가기만 하고 상수항의 자리는 올라가기만 한다', () => {
    const rows = declared.ladder.map((n) => bigORung(declared.coefficients, n));
    const top = rows.map((r) => r.places[0]!);
    const constant = rows.map((r) => r.places.at(-1)!);
    expect(top).toEqual([3, 2, 0, 0, 0, 0]);
    expect(constant).toEqual([0, 0, 0, 3, 3, 3]);
    for (let i = 1; i < rows.length; i += 1) {
      expect(top[i]!).toBeLessThanOrEqual(top[i - 1]!);
      expect(constant[i]!).toBeGreaterThanOrEqual(constant[i - 1]!);
    }
  });

  it('상수가 먼저 꼴찌가 되고 그 뒤에 1 차항이 2 차항 아래로 내려간다', () => {
    const rows = declared.ladder.map((n) => bigORung(declared.coefficients, n));
    const constantLast = rows.find((r) => r.places.at(-1) === 3)?.n;
    const linearUnderQuadratic = rows.find((r) => r.terms[2]! < r.terms[1]!)?.n;
    expect(constantLast).toBe(20);
    expect(linearUnderQuadratic).toBe(50);
    expect(constantLast!).toBeLessThan(linearUnderQuadratic!);
  });

  it('동률이 셋 있고 그것이 자리가 갈리는 길목이다', () => {
    const ties = declared.ladder
      .map((n) => bigORung(declared.coefficients, n))
      .filter((r) => new Set(r.terms).size < r.terms.length)
      .map((r) => r.n);
    expect(ties).toEqual([5, 10, 20]);
    // n = 10 에서는 셋이 한 자리를 나눠 가져 단독 1 위가 없다.
    expect(bigORung(declared.coefficients, 10).tied).toBe(3);
    expect(bigORung(declared.coefficients, 10).strictLead).toBe(false);
    expect(bigORung(declared.coefficients, 20).strictLead).toBe(true);
  });
});

describe('Big-O 표기 — IR', () => {
  it('IR 이 셈하는 합 · 항 · 따라잡은 수가 algorithm 의 것과 같다 (손잡이 여섯 전부)', async () => {
    const c = [...declared.coefficients];
    for (const row of TABLE) {
      const { events } = await record(row.n);
      const last = rungsOf(events).at(-1) ?? {};
      const terms = last.terms as number[];

      expect(runIR(bigOImperativeIR, 'total', [c, row.n]), `total n=${row.n}`).toBe(last.sum);
      expect(runIR(bigOImperativeIR, 'outranked', [c, row.n]), `outranked n=${row.n}`).toBe(
        last.outranked,
      );
      for (let i = 0; i < c.length; i += 1) {
        expect(runIR(bigOImperativeIR, 'term_at', [c, row.n, i]), `term_at ${i} n=${row.n}`).toBe(
          terms[i],
        );
      }
    }
  });

  it('손잡이 밖의 수와 다른 계수에서도 IR 과 순수 함수가 같은 답을 낸다', () => {
    const cases: { c: number[]; n: number }[] = [
      { c: [1, 5, 100, 1000], n: 2 },
      { c: [1, 5, 100, 1000], n: 37 },
      { c: [3, 0, 7], n: 9 },
      { c: [2, 1], n: 11 },
      { c: [42], n: 6 },
    ];
    for (const { c, n } of cases) {
      // 견줄 기준은 IR 도 bigORung 도 아닌 제3의 루프여야 한다.
      const byLoop = c.reduce((acc, coefficient) => acc * n + coefficient, 0);
      expect(runIR(bigOImperativeIR, 'total', [c, n]), `total ${c} @${n}`).toBe(byLoop);
      const rung = bigORung(c, n);
      expect(rung.sum, `sum ${c} @${n}`).toBe(byLoop);
      expect(runIR(bigOImperativeIR, 'outranked', [c, n]), `outranked ${c} @${n}`).toBe(
        rung.outranked,
      );
      for (let i = 0; i < c.length; i += 1) {
        expect(runIR(bigOImperativeIR, 'term_at', [c, n, i]), `term_at ${i}`).toBe(rung.terms[i]);
      }
    }
  });

  it('phase 이벤트는 전부 silent 이고 어휘가 irs 와 같다 (C3)', async () => {
    const { events } = await record(1);
    const phaseEvents = events.filter((e) => e.type === 'phase');
    expect(phaseEvents.every((e) => e.silent === true)).toBe(true);

    const emitted = new Set(phaseEvents.map((e) => (e.payload as { phase: string }).phase));
    expect([...irPhases(bigOImperativeIR)].sort()).toEqual([...PHASES].sort());
    // 가장 짧은 판(한 단)도 어휘 셋을 모두 밟는다 — 선언해 놓고 안 뜨는 어휘가 없다.
    expect([...emitted].sort()).toEqual([...PHASES].sort());
  });

  it('여섯 언어가 성한 코드를 내고 phase 라벨 집합이 IR 어휘와 같다', () => {
    const want = [...irPhases(bigOImperativeIR)].sort();
    for (const t of TRANSPILERS) {
      const { lines } = t.transpile(bigOImperativeIR);
      expect(lines.length, t.id).toBeGreaterThan(0);
      expect(
        lines.every((l) => !l.code.includes('undefined')),
        t.id,
      ).toBe(true);
      const emitted = [
        ...new Set(lines.map((l) => l.phase).filter((p): p is string => p !== null)),
      ].sort();
      expect(emitted, t.id).toEqual(want);
      // 화면이 세는 것을 코드도 센다 — 세 함수가 다 보여야 그 말이 선다.
      const source = lines.map((l) => l.code).join('\n');
      for (const fn of ['total', 'term_at', 'outranked']) {
        expect(source, `${t.id} 의 ${fn}`).toContain(fn);
      }
    }
  });

  it('IR 이 쓰는 연산은 넷뿐이다 — `&&` 와 `||` 가 한 번도 나오지 않는다', () => {
    // `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라, 쓰면 오른쪽이 늘 셈해진다.
    // 여기서는 피한 것이 아니라 **없다** — 판정이 하나뿐이라서다.
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
    walk(bigOImperativeIR);
    expect([...seen].sort()).toEqual(['*', '+', '-', '<']);
  });

  it('32비트 — 이 IR 이 만드는 가장 큰 수는 사다리 끝의 f(n) 이고 상한의 0.1% 아래다', () => {
    const c = [...declared.coefficients];
    const LIMIT = 2 ** 31 - 1;
    let biggest = 0;
    for (const n of declared.ladder) {
      // 호너의 중간값. `t = t·n + c[i]` 라 답을 넘는 자리가 없다.
      let t = 0;
      for (const coefficient of c) {
        t = t * n + coefficient;
        biggest = Math.max(biggest, t);
      }
      // 항 하나를 구하는 동안의 중간값. 그 항의 값이 상한이다.
      for (let i = 0; i < c.length; i += 1) {
        let v = c[i]!;
        for (let k = 0; k < c.length - 1 - i; k += 1) {
          v *= n;
          biggest = Math.max(biggest, v);
        }
      }
      expect(t, `f(${n})`).toBe(bigORung(c, n).sum);
    }
    expect(biggest).toBe(1061000);
    expect(biggest).toBeLessThan(LIMIT * 0.001);
  });
});

describe('Big-O 표기 — 선언', () => {
  it('1차 데이터는 계수와 사다리뿐이다 — 파생값을 옮겨 적지 않았다', () => {
    expect(Object.keys(declared).sort()).toEqual(
      ['coefficients', 'ladder', 'n', 'stepMs', 'type'].sort(),
    );
    expect(declared.type).toBe('big-o');
    expect(declared.coefficients).toEqual([1, 5, 100, 1000]);
    expect(declared.ladder).toEqual(TABLE.map((r) => r.n));
  });

  it('facet 이 코드 패널과 손잡이와 메트릭을 사양대로 든다', () => {
    expect(bigOFacet.id).toBe('facet:bigO');
    expect(bigOFacet.algorithm).toBe('module:bigO');
    expect(bigOFacet.projector).toBe('module:bigOProjector');
    // 사다리는 오름차순이 뜻이다 — 섞으면 안 된다.
    expect(bigOFacet.shuffleOnReset).toBeUndefined();
    // 완제품이므로 머리말(title-block)을 든다 — 조각과 갈리는 자리다.
    expect(Object.keys(bigOFacet.blocks).sort()).toEqual([
      'codePanel',
      'controls',
      'header',
      'stage',
    ]);
    expect((bigOFacet.blocks.header as { type: string }).type).toBe('title-block');
    expect((bigOFacet.blocks.stage as { type: string }).type).toBe('big-o-stage');
    const panel = bigOFacet.blocks.codePanel as { ir?: string };
    expect(panel.ir).toBe(`ir:${bigOImperativeIR.id}`);

    const controls = (bigOFacet.blocks.controls as { metrics: { name: string }[] }).metrics;
    expect(controls.map((m) => m.name).sort()).toEqual(['outranked-count', 'rung-count']);
  });

  it('title 이 카탈로그 카드 이름과 같다 (C4)', () => {
    expect((bigOFacet.title as Record<string, string>).ko).toBe('Big-O 표기');
  });

  it('손잡이의 값이 initialData 의 사다리와 하나도 어긋나지 않는다', () => {
    const controls = (bigOFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
    const slider = controls.find((c) => c.action === 'size') as
      | { segments?: { value: number; default?: boolean }[] }
      | undefined;
    expect(slider?.segments?.map((s) => s.value)).toEqual(declared.ladder);
    // 처음 걸리는 칸이 initialData 의 n 과 같아야 한다.
    expect(slider?.segments?.find((s) => s.default === true)?.value).toBe(declared.n);
  });

  it('화면이 부르는 문안 키를 선언이 모두 든다', () => {
    expect(Object.keys(bigOFacet.messages ?? {}).sort()).toEqual([
      'caption.ahead',
      'caption.behind',
      'caption.settleDone',
      'caption.settleEarly',
      'caption.setup',
      'caption.tie',
      'label.place',
      'label.share',
      'label.size',
    ]);
  });

  it('열 언어를 다 채웠다', () => {
    const tables: Array<[string, Record<string, string | undefined>]> = [
      ['title', bigOFacet.title as Record<string, string | undefined>],
      ['description', bigOFacet.description as Record<string, string | undefined>],
      ...Object.entries(bigOFacet.messages ?? {}).map(
        ([k, v]) => [k, v as Record<string, string | undefined>] as [string, Record<string, string | undefined>],
      ),
    ];
    // 컨트롤바와 코드 패널의 라벨도 화면에 뜨는 문안이다 (i18n 감사가 보는 자리).
    for (const [ref, block] of Object.entries(bigOFacet.blocks)) {
      const spec = block as { label?: unknown; controls?: unknown; metrics?: unknown };
      if (spec.label) tables.push([`${ref}.label`, spec.label as Record<string, string | undefined>]);
      for (const c of (spec.controls ?? []) as { action?: string; label?: unknown }[]) {
        if (c.label) tables.push([`${ref}.${c.action}`, c.label as Record<string, string | undefined>]);
      }
      for (const m of (spec.metrics ?? []) as { name?: string; label?: unknown }[]) {
        if (m.label) tables.push([`${ref}.${m.name}`, m.label as Record<string, string | undefined>]);
      }
    }
    const short: string[] = [];
    for (const [name, table] of tables) {
      for (const loc of LOCALES) if (!table[loc]) short.push(`${name} [${loc}]`);
    }
    expect(short).toEqual([]);
  });

  it('en 이 쓰는 자리표를 어느 언어도 빠뜨리지 않는다', () => {
    const marks = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    const bad: string[] = [];
    for (const [key, table] of Object.entries(bigOFacet.messages ?? {})) {
      const loc = table as Record<string, string | undefined>;
      const want = marks(loc.en ?? '');
      for (const l of LOCALES) {
        const got = new Set(marks(loc[l] ?? ''));
        for (const p of want) if (!got.has(p)) bad.push(`${key} [${l}] {${p}} 빠짐`);
      }
      // 없는 자리표를 지어낸 번역도 거짓이 된다.
      for (const l of LOCALES) {
        for (const p of marks(loc[l] ?? '')) {
          if (!want.includes(p)) bad.push(`${key} [${l}] {${p}} 여분`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('가장 얇은 걸음이 800ms 아래로 떨어지지 않는다', async () => {
    /*
     * **셈하지 말고 잰다.** 벽시계는 `애니메이션 + stepMs` 라 선언만 보면 거짓이 된다.
     * 그래서 **실물 stage 를 감싸** 메서드가 불리는 시각을 찍는다 — 모든 메서드를
     * 빈 함수로 둔 가짜 stage 로 재면 얹히는 애니메이션이 통째로 빠져 재는 뜻이 없다.
     */
    const { clearRegistry, registerView, runFacet } = await import('@ffacet/core/runtime');
    const { registerBigO } = await import('../src/index.js');
    clearRegistry();
    registerBigO();

    const stamps: number[] = [];
    const real = bigOStageView;
    const spy = {
      canvas: real.canvas,
      mount(container: HTMLElement, params: Parameters<typeof real.mount>[1]) {
        const inner = real.mount(container, params) as unknown as Record<string, unknown>;
        const wrap = (name: string): ((...args: unknown[]) => unknown) => {
          const fn = inner[name] as ((...args: unknown[]) => unknown) | undefined;
          return (...args: unknown[]) => {
            stamps.push(Date.now());
            return fn?.(...args);
          };
        };
        return {
          ...(inner as unknown as Record<string, unknown>),
          setup: wrap('setup'),
          showRung: wrap('showRung'),
          settle: wrap('settle'),
        };
      },
    };
    registerView('big-o-stage', spy as never);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(bigOFacet, container);
    try {
      await new Promise((r) => setTimeout(r, 4_200));
    } finally {
      handle.destroy();
      container.remove();
    }

    const gaps: number[] = [];
    for (let i = 1; i < stamps.length; i += 1) gaps.push((stamps[i] ?? 0) - (stamps[i - 1] ?? 0));
    // 몇 걸음은 실제로 지나갔어야 잰 것이 있다.
    expect(gaps.length).toBeGreaterThanOrEqual(2);
    // 바닥선은 800ms 이고, 타이머 오차와 CI 부하를 감안해 조금 낮춰 본다.
    expect(Math.min(...gaps)).toBeGreaterThan(700);
  }, 20_000);

  it('화면에 뜬 큰 수는 전부 천 단위로 끊긴다', async () => {
    /*
     * **검사가 원리적으로 못 보던 자리다.** en 원본 대조는 문안만 보고, facet-i18n 은
     * 키가 찼는지만 보며, 다른 검사는 발신 payload 를 본다 — 그려진 글자를 보는 것이
     * 없어서 `1 000` 과 `1,000` 이 갈린 채 전수를 통과했다.
     */
    const { clearRegistry, runFacet } = await import('@ffacet/core/runtime');
    const { registerBigO } = await import('../src/index.js');
    clearRegistry();
    registerBigO();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(bigOFacet, container);
    let text = '';
    try {
      await new Promise((r) => setTimeout(r, 4_200));
      text = Array.from(container.querySelectorAll('text'))
        .map((el) => el.textContent ?? '')
        .join(' | ');
    } finally {
      handle.destroy();
      container.remove();
    }

    // 그리기는 했어야 잰 것이 있다.
    expect(text.length).toBeGreaterThan(0);

    /*
     * **두 층위를 가른다.** 항 이름(`1000`)은 식 표기라 끊지 않는 것이 맞고, 값 읽기
     * (합 · 항의 값)만 끊는다. 계수에서 만든 이름을 빼지 않으면 화면이 옳은데도
     * 검사가 걸린다 — 실제로 처음 이 검사를 넣었을 때 `1000` 셋이 잡혔다.
     */
    const coefficients = (bigOFacet.initialData as { coefficients?: number[] }).coefficients ?? [];
    const termNames = new Set(coefficients.map((c) => String(c)));
    const unbroken = (text.match(/(?<![,.\d])\d{4,}(?![,.\d])/g) ?? []).filter(
      (s) => !termNames.has(s),
    );
    expect(unbroken).toEqual([]);
  }, 20_000);
});

describe('Big-O 표기 — 눈금과 걸음', () => {
  it('걸음의 단위가 사다리 한 단이다 — 걸음 수가 손잡이와 함께 는다', async () => {
    const steps: number[] = [];
    for (const row of TABLE) {
      const { events, sleeps } = await record(row.n);
      const rungs = rungsOf(events).length;
      // 판을 세우는 걸음 하나 + 단마다 한 걸음 + 마무리 하나. 그 밖의 걸음은 없다.
      expect(sleeps, `n=${row.n}`).toBe(rungs + 2);
      steps.push(sleeps);
    }
    expect(steps).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('stage 는 눈금을 자기 상수로 들지 않는다 — 받은 수를 그대로 그린다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(bigOStageView, container, {
      config: {},
      // 선언과 전혀 다른 계수·사다리다. stage 가 제 상수를 들고 있으면 드러난다.
      initialData: { coefficients: [1, 2], ladder: [2, 4, 8], n: 4 },
      locale: 'en',
      theme: 'light',
    }) as unknown as {
      showRung(step: {
        index: number;
        n: number;
        terms: number[];
        places: number[];
        sum: number;
        pcts: string[];
        caption: string;
      }): Promise<void>;
      destroy(): void;
    };

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const texts = (): string[] => [...svg!.querySelectorAll('text')].map((t) => t.textContent ?? '');

    expect(texts()).toContain('f(n) = n + 2');
    expect(texts()).toContain('n = 4');
    for (const tick of ['2', '4', '8']) expect(texts()).toContain(tick);

    // 걸음의 값도 payload 에서 온다 — stage 가 스스로 셈하지 않는다.
    await instance.showRung({
      index: 1,
      n: 4,
      terms: [4, 2],
      places: [0, 1],
      sum: 6,
      pcts: ['66.7', '33.3'],
      caption: 'measured caption',
    });
    expect(texts()).toContain('n = 4 · 66.7%');
    expect(texts()).toContain('2 = 2 · 33.3%');
    expect(texts()).toContain('measured caption');

    instance.destroy();
    container.remove();
  });

  it('선언한 캡션 여섯이 손잡이 전체에서 모두 한 번은 뜬다', async () => {
    const captions: string[] = [];
    const stage = {
      setup: (_n: number, _rungs: number, message: string) => {
        captions.push(message);
      },
      showRung: (step: { caption: string }) => {
        captions.push(step.caption);
      },
      settle: (message: string) => {
        captions.push(message);
      },
      reset: () => undefined,
    };
    const projector = bigOProjector(
      { stage: stage as unknown as ProjectorViews[string] },
      undefined,
    );

    for (const row of TABLE) {
      const { events } = await record(row.n);
      for (const event of events) await projector.onEvent(event);
    }

    // 선언의 en 을 자리표만 풀어 견준다 — 코드가 부르는 키와 선언이 1:1 이어야 한다.
    const missing: string[] = [];
    for (const [key, table] of Object.entries(bigOFacet.messages ?? {})) {
      if (!key.startsWith('caption.')) continue;
      const en = (table as { en: string }).en;
      const shape = new RegExp(
        `^${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.+')}$`,
      );
      if (!captions.some((c) => shape.test(c))) missing.push(key);
    }
    expect(missing).toEqual([]);
  });
});
