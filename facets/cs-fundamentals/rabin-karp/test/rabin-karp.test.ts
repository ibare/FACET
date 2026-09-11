/**
 * 라빈-카프 완제품 검사.
 *
 * 이 facet 이 완제품인 까닭은 둘이다 — 손잡이 하나가 주장을 지고, IR 하나가
 * 여섯 언어로 갈린다. 검사도 거기에 걸려 있다.
 *
 *  1. **IR 이 셈하는 해시와 algorithm 이 셈하는 해시가 같은가.** 손잡이 다섯 값
 *     전부, 창 하나하나를 전수로 대조한다. 이것이 이 완제품에서 가장 중요한
 *     검수다 — 코드 패널이 화면과 다른 값을 셈하면 그것이 거짓말이고, 패널을
 *     다는 까닭 자체가 지워진다.
 *  2. **손잡이 실측표.** 굴리는 쪽이 만진 글자가 다섯 값 전부에서 120 으로
 *     붙박이고, 그 옆에서 단순 견줌이 세 배로 자라는가.
 *  3. 여섯 언어가 다 나오는가. phase 집합이 irs.ts ↔ algorithm.ts 에서 같은가 (C3).
 *  4. 화면에 뜬 수가 알고리즘이 셈한 수인가.
 *
 * 아래 기대값은 상수로 박아 둔 것이 아니라 **실행 결과와 견주는 대조값**이다.
 * 셈하는 자리는 언제나 algorithm / IR 이고, 검사는 그 둘이 어긋나는지만 본다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { clearRegistry, runFacet } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent, MetricDelta } from '@ffacet/core/runtime';
import type { IRStmt } from '@ffacet/core/runtime';

import {
  computeRabinKarp,
  letterValues,
  rabinKarpAlgorithm,
  rabinKarpPoints,
  RABIN_KARP_LENGTHS,
  type RabinKarpData,
} from '../src/algorithm.js';
import { rabinKarpImperativeIR } from '../src/irs.js';
import { rabinKarpFacet } from '../src/facet.js';
import { registerRabinKarp } from '../src/index.js';

/** 사양이 정한 자료를 선언에서 그대로 읽어 온다 (검사가 자료를 다시 적지 않는다). */
const data = rabinKarpFacet.initialData as unknown as RabinKarpData;

/**
 * 손잡이 실측표. 글 60 자 · 씨앗 없는 고정 데이터에서 잰 값이다.
 *
 *   굴리는 쪽  m + 2(n−m) + m = 2n = 120  — 다섯 값 전부에서 같다 (변동폭 0)
 *   단순 견줌  89 → 279 로 3.13 배
 */
const TABLE: ReadonlyArray<{ m: number; rolled: number; naive: number }> = [
  { m: 2, rolled: 120, naive: 89 },
  { m: 4, rolled: 120, naive: 142 },
  { m: 6, rolled: 120, naive: 189 },
  { m: 8, rolled: 120, naive: 236 },
  { m: 10, rolled: 120, naive: 279 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 0. 1차 데이터가 사양대로 생겼는가
// ─────────────────────────────────────────────────────────────────────────────

describe('1차 데이터', () => {
  it('되풀이 글 60 자이고, 심은 자리 하나만 결이 끊긴다', () => {
    expect(data.text.length).toBe(60);
    expect(data.text.charAt(data.patternEnd)).toBe('c');
    // 심은 한 글자 말고는 전부 ab 되풀이다 — 이 결이 이 facet 의 급소다.
    for (let i = 0; i < data.text.length; i += 1) {
      if (i === data.patternEnd) continue;
      expect(data.text.charAt(i)).toBe(i % 2 === 0 ? 'a' : 'b');
    }
    // 'c' 가 하나뿐이라 어떤 손잡이 값에서도 등장이 한 건으로 묶인다.
    expect([...data.text].filter((c) => c === 'c')).toHaveLength(1);
  });

  it('법이 10⁶ 급이고 손잡이로 나와 있지 않다', () => {
    expect(data.mod).toBeGreaterThan(100_000);
    const controls = rabinKarpFacet.blocks.controls as { controls?: { action: string }[] };
    const actions = (controls.controls ?? []).map((c) => c.action);
    expect(actions).not.toContain('mod');
    expect(actions).toContain('length');
  });

  it('중간값이 32비트를 넘지 않는다 — 정수 폭이 유한한 세 언어가 같은 답을 낸다', () => {
    // 가장 큰 중간값은 `h * radix` 와 `val * weight` 둘이다.
    const biggest = Math.max((data.mod - 1) * data.radix, 26 * (data.mod - 1));
    expect(biggest).toBeLessThan(2 ** 31 - 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. IR ↔ algorithm 해시 대조 — 이 완제품에서 가장 중요한 검수
// ─────────────────────────────────────────────────────────────────────────────

describe('IR 과 algorithm 이 같은 해시를 셈한다', () => {
  it.each(RABIN_KARP_LENGTHS.map((m) => [m] as const))(
    '패턴 길이 %i — 창 전수의 해시가 글자 하나까지 같다',
    (m) => {
      const r = computeRabinKarp({ ...data, patternLength: m });
      const textValues = letterValues(data.text);

      // 찾는 조각의 해시.
      expect(
        runIR(rabinKarpImperativeIR, 'window_hash', [
          letterValues(r.pattern),
          0,
          m,
          data.radix,
          data.mod,
        ]),
      ).toBe(r.patternHash);

      // 창 하나하나. algorithm 은 **굴려서** 얻고 IR 의 window_hash 는
      // **처음부터** 셈한다 — 그 둘이 같다는 것이 이 알고리즘의 전부다.
      expect(r.windows.length).toBe(data.text.length - m + 1);
      for (const w of r.windows) {
        expect(
          runIR(rabinKarpImperativeIR, 'window_hash', [textValues, w.start, m, data.radix, data.mod]),
        ).toBe(w.hash);
      }
    },
  );

  it.each(RABIN_KARP_LENGTHS.map((m) => [m] as const))(
    '패턴 길이 %i — IR 의 rabin_karp 가 algorithm 과 같은 등장 수를 낸다',
    (m) => {
      const r = computeRabinKarp({ ...data, patternLength: m });
      const hits = runIR(rabinKarpImperativeIR, 'rabin_karp', [
        letterValues(data.text),
        letterValues(r.pattern),
        data.radix,
        data.mod,
      ]);
      expect(hits).toBe(r.hits);
      // 데이터가 등장 한 건을 보장한다.
      expect(hits).toBe(1);
    },
  );

  it('헛일치가 하나도 없다 — 법이 커서 해시 일치가 곧 글자 일치다', () => {
    for (const m of RABIN_KARP_LENGTHS) {
      const r = computeRabinKarp({ ...data, patternLength: m });
      expect(r.hashHits, `m=${m}`).toBe(r.hits);
    }
  });

  it('IR 이 없는 조각을 찾으면 0 을 낸다 — 찾기 자체가 돌고 있다는 증거', () => {
    const hits = runIR(rabinKarpImperativeIR, 'rabin_karp', [
      letterValues(data.text),
      letterValues('zzz'),
      data.radix,
      data.mod,
    ]);
    expect(hits).toBe(0);
  });

  it('확인 단계가 살아 있다 — 해시가 같아도 글자가 다르면 세지 않는다', () => {
    // 법을 아주 작게 잡으면 헛일치가 생긴다. 그때도 등장 수는 참인 것만 세야 한다.
    const tiny = 7;
    const text = letterValues(data.text);
    const pattern = letterValues(computeRabinKarp({ ...data, patternLength: 6 }).pattern);
    const hits = runIR(rabinKarpImperativeIR, 'rabin_karp', [text, pattern, data.radix, tiny]);
    expect(hits).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 손잡이 실측표
// ─────────────────────────────────────────────────────────────────────────────

describe('손잡이 — 패턴 길이', () => {
  it('굴리는 쪽이 만진 글자가 다섯 값 전부에서 2n 으로 붙박인다', () => {
    const measured = RABIN_KARP_LENGTHS.map((m) => computeRabinKarp({ ...data, patternLength: m }));
    const rolled = measured.map((r) => r.touched);
    expect(rolled).toEqual(TABLE.map((row) => row.rolled));
    // 변동폭 0 — 이것이 주장이다.
    expect(new Set(rolled).size).toBe(1);
    expect(rolled[0]).toBe(2 * data.text.length);

    // 항등식이 실제로 성립하는지 항별로 본다.
    for (const r of measured) {
      const n = data.text.length;
      expect(r.rolls).toBe(n - r.m);
      // 첫 창 m + 구르기 2(n−m) + 확인 m
      expect(r.m + 2 * (n - r.m) + r.m).toBe(r.touched);
    }
  });

  it('그 옆에서 단순 견줌은 세 배가 된다', () => {
    const naive = RABIN_KARP_LENGTHS.map(
      (m) => computeRabinKarp({ ...data, patternLength: m }).naive,
    );
    expect(naive).toEqual(TABLE.map((row) => row.naive));
    // 완전단조로 는다.
    for (let i = 1; i < naive.length; i += 1) expect(naive[i]).toBeGreaterThan(naive[i - 1]);
    expect(naive[naive.length - 1] / naive[0]).toBeGreaterThan(3);
  });

  it('구르기는 줄어드는데 만진 글자는 그대로다 — 상쇄가 눈에 보이는 자리', () => {
    const rolls = RABIN_KARP_LENGTHS.map((m) => computeRabinKarp({ ...data, patternLength: m }).rolls);
    expect(rolls).toEqual([58, 56, 54, 52, 50]);
  });

  it('대조 도표의 점이 실제로 셈한 값이다', () => {
    const points = rabinKarpPoints(data);
    expect(points).toEqual(TABLE.map((row) => ({ m: row.m, rolled: row.rolled, naive: row.naive })));
  });

  it('자연어 글에서는 이 주장이 무너진다 — 글의 결이 전제임을 못박는다', () => {
    const natural = 'thequickbrownfoxjumpsoverthelazydogwhilethecatsleepsnearbyxx';
    const naive = [2, 6, 10].map(
      (m) =>
        computeRabinKarp({
          ...data,
          text: natural.slice(0, 60),
          patternEnd: 59,
          patternLength: m,
        }).naive,
    );
    // 첫 글자에서 거의 다 어긋나 견줌이 붙박인다 — 아낄 것이 없다.
    for (const v of naive) expect(v).toBeLessThan(80);
    expect(Math.max(...naive) - Math.min(...naive)).toBeLessThan(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 여섯 언어 + phase 어휘 (C3)
// ─────────────────────────────────────────────────────────────────────────────

const transpilers = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

describe('여섯 언어 emit', () => {
  it.each(transpilers.map((t) => [t.id, t] as const))('%s 가 성한 코드를 낸다', (_id, t) => {
    const out = t.transpile(rabinKarpImperativeIR);
    expect(out.lines.length).toBeGreaterThan(20);
    for (const line of out.lines) {
      expect(line.code).not.toContain('undefined');
      expect(line.code).not.toContain('\r');
    }
  });

  it('여섯 언어 모두 무게 루프 · 굴리기 · 확인을 낸다', () => {
    for (const t of transpilers) {
      const out = t.transpile(rabinKarpImperativeIR);
      const has = (phase: string) => out.lines.some((l) => l.phase === phase);
      for (const phase of ['weight', 'scan', 'compare', 'verify', 'roll', 'found']) {
        expect(has(phase), `${t.id} / ${phase}`).toBe(true);
      }
    }
  });

  it('설명 없는 매직 넘버가 코드 패널에 뜨지 않는다', () => {
    for (const t of transpilers) {
      const code = t.transpile(rabinKarpImperativeIR).lines.map((l) => l.code).join('\n');
      // 32비트 우회의 흔적. 넘칠 일이 없으므로 있어서는 안 된다.
      expect(code, t.id).not.toContain('2147483');
      expect(code, t.id).not.toContain('0x7');
    }
  });

  it('이름 붙인 호출은 window_hash 하나뿐이다 — 나머지는 전부 펼쳐져 있다', () => {
    const calls: string[] = [];
    const walk = (e: unknown): void => {
      if (typeof e !== 'object' || e === null) return;
      const n = e as { kind?: string; fn?: string } & Record<string, unknown>;
      if (n.kind === 'call' && typeof n.fn === 'string') calls.push(n.fn);
      for (const v of Object.values(n)) {
        if (Array.isArray(v)) v.forEach(walk);
        else walk(v);
      }
    };
    for (const fn of rabinKarpImperativeIR.functions) fn.body.forEach(walk);
    expect([...new Set(calls)]).toEqual(['window_hash']);
  });

  it('여섯 언어 어디서도 예약어를 식별자로 쓰지 않는다', () => {
    const names = new Set<string>();
    for (const fn of rabinKarpImperativeIR.functions) {
      for (const p of fn.params) names.add(p.name);
      const walk = (stmts: IRStmt[]): void => {
        for (const s of stmts) {
          if (s.kind === 'var') names.add(s.name);
          if (s.kind === 'for-range') {
            names.add(s.var);
            walk(s.body);
          } else if (s.kind === 'while') walk(s.body);
          else if (s.kind === 'if') {
            walk(s.then);
            if (s.else) walk(s.else);
          }
        }
      };
      walk(fn.body);
    }
    // C# (base/out/ref/params/lock/event/string/object) 과 파이썬 (from/in/is/...).
    const reserved = [
      'base', 'out', 'ref', 'params', 'lock', 'event', 'string', 'object',
      'from', 'in', 'is', 'as', 'not', 'and', 'or', 'class', 'def', 'lambda',
    ];
    expect([...names].filter((n) => reserved.includes(n))).toEqual([]);
  });
});

/** IR 트리를 훑어 phase 를 모은다. */
function irPhases(stmts: IRStmt[], out: Set<string>): Set<string> {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, out);
      if (s.else) irPhases(s.else, out);
    } else if (s.kind === 'for-range' || s.kind === 'while') {
      irPhases(s.body, out);
    }
  }
  return out;
}

type Run = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

/**
 * 알고리즘을 한 판 굴리고 이벤트와 메트릭을 걷는다.
 *
 * reactive 라 입력을 기다리는 자리가 있다. 거기서 취소로 깨워 한 판만 받는다 —
 * `waitForInput` 이 reject 하고 `cancelled` 가 참이면 알고리즘은 C8 정본 catch 로
 * 조용히 돌아간다.
 */
async function play(input: RabinKarpData): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  let stopped = false;
  const ctx = {
    data: input,
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
    },
    metric(name: string, delta: MetricDelta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    get cancelled() {
      return stopped;
    },
    async sleep() {
      return !stopped;
    },
    async waitForInput() {
      stopped = true;
      throw new Error('cancelled');
    },
    pollInput() {
      return null;
    },
  };
  await rabinKarpAlgorithm(ctx as unknown as FacetContext<RabinKarpData>);
  return { events, metrics };
}

describe('phase 어휘 (C3)', () => {
  it('irs.ts 와 algorithm.ts 의 phase 집합이 같다', async () => {
    const fromIR = new Set<string>();
    for (const fn of rabinKarpImperativeIR.functions) irPhases(fn.body, fromIR);

    const run = await play({ ...data });
    const fromAlgorithm = new Set<string>();
    for (const e of run.events) {
      if (e.type !== 'phase') continue;
      const p = e.payload as { phase?: unknown } | undefined;
      if (typeof p?.phase === 'string') fromAlgorithm.add(p.phase);
    }

    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
    // 한쪽만 비어 있어도 위 단언이 통과하지 않도록 실제 어휘를 못박아 둔다.
    expect([...fromIR].sort()).toEqual(['compare', 'found', 'roll', 'scan', 'verify', 'weight']);
  });

  it('phase 이벤트는 모두 silent 다 (C2)', async () => {
    const run = await play({ ...data });
    for (const e of run.events) {
      if (e.type === 'phase') expect(e.silent).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. 발신하는 값
// ─────────────────────────────────────────────────────────────────────────────

describe('발신하는 값', () => {
  it('이벤트에 실려 나가는 해시가 algorithm 이 셈한 해시와 같다', async () => {
    const run = await play({ ...data });
    const truth = computeRabinKarp(data);
    const seen = run.events
      .filter((e) => e.type === 'first-window' || e.type === 'roll')
      .map((e) => (e.payload as { hash: number }).hash);
    expect(seen).toEqual(truth.windows.map((w) => w.hash));
  });

  it('마지막 done 이 실측표의 수를 낸다', async () => {
    for (const row of TABLE) {
      const run = await play({ ...data, patternLength: row.m });
      const done = run.events.filter((e) => e.type === 'done').at(-1);
      const payload = done?.payload as { touched?: unknown; naive?: unknown; hits?: unknown };
      expect(payload?.touched, `m=${row.m}`).toBe(row.rolled);
      expect(payload?.naive, `m=${row.m}`).toBe(row.naive);
      expect(payload?.hits, `m=${row.m}`).toBe(1);
    }
  });

  it('확인은 한 번만 일어나고 거기서 m 글자를 더 만진다', async () => {
    for (const row of TABLE) {
      const run = await play({ ...data, patternLength: row.m });
      const verifies = run.events.filter((e) => e.type === 'verify');
      expect(verifies.length, `m=${row.m}`).toBe(1);
      expect((verifies[0].payload as { chars: number }).chars).toBe(row.m);
      expect(run.events.filter((e) => e.type === 'found')).toHaveLength(1);
    }
  });

  it('메트릭 이름이 facet.ts 선언과 같고 값이 실행에서 나온다 (C5)', async () => {
    const run = await play({ ...data });
    const controls = rabinKarpFacet.blocks.controls as { metrics?: { name: string }[] };
    const declared = (controls.metrics ?? []).map((m) => m.name).sort();
    expect(Object.keys(run.metrics).sort()).toEqual(declared);

    const truth = computeRabinKarp(data);
    expect(run.metrics['touch-count']).toBe(truth.touched);
    expect(run.metrics['compare-count']).toBe(truth.naive);
    expect(run.metrics['roll-count']).toBe(truth.rolls);
  });

  it('멈추라 하면 그 자리에서 멎는다 (C8)', async () => {
    const events: FacetRuntimeEvent[] = [];
    let seen = 0;
    const ctx = {
      data: { ...data },
      async emit(event: FacetRuntimeEvent) {
        events.push(event);
        seen += 1;
      },
      metric() {},
      get cancelled() {
        return seen >= 10;
      },
      async sleep() {
        return seen < 10;
      },
      async waitForInput() {
        throw new Error('cancelled');
      },
      pollInput() {
        return null;
      },
    };
    await rabinKarpAlgorithm(ctx as unknown as FacetContext<RabinKarpData>);
    expect(events.length).toBeLessThan(30);
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. 화면
// ─────────────────────────────────────────────────────────────────────────────

describe('화면', () => {
  /**
   * 여기까지의 검사는 알고리즘과 IR 만 본다 — stage 도 projector 도 한 번도
   * 마운트되지 않았다. 공용 전수 검사가 구조(캔버스 부착 · 세로 고정 · destroy)는
   * 잡아 주지만 **화면에 뜬 수가 알고리즘이 셈한 수인지**는 재지 않는다.
   */
  it('끝난 화면의 수가 알고리즘이 셈한 수와 같다', async () => {
    clearRegistry();
    registerRabinKarp();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const original = console.error;
    const errors: string[] = [];
    console.error = (...a: unknown[]) => {
      errors.push(a.map(String).join(' '));
    };

    // 걸음 간격만 줄인 사본으로 띄운다. 재는 것은 수이지 박자가 아니다.
    const fast = {
      ...rabinKarpFacet,
      initialData: { ...rabinKarpFacet.initialData, stepMs: 1 },
    };
    const handle = runFacet(fast, container);
    try {
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const box = svg?.getAttribute('viewBox');

      // 화면이 멎을 때까지 기다린다. 찾는 값이 나타나는 것으로 끊으면 이르다 —
      // 그 수가 마침 도중에도 떠 있으면 첫 프레임에 통과한다.
      let text = '';
      let quiet = 0;
      const started = Date.now();
      while (Date.now() - started < 40_000 && quiet < 6) {
        await new Promise((r) => setTimeout(r, 250));
        const now = svg?.textContent ?? '';
        quiet = now === text ? quiet + 1 : 0;
        text = now;
      }

      const truth = computeRabinKarp(rabinKarpFacet.initialData as unknown as RabinKarpData);
      // 원장의 두 수와 대조 도표의 다섯 쌍이 전부 화면에 있어야 한다.
      expect(text).toContain(String(truth.touched));
      expect(text).toContain(String(truth.naive));
      for (const p of rabinKarpPoints(rabinKarpFacet.initialData as unknown as RabinKarpData)) {
        expect(text, `m=${p.m}`).toContain(String(p.naive));
      }
      expect(svg?.getAttribute('viewBox')).toBe(box);
      expect(errors).toEqual([]);
    } finally {
      handle.destroy();
      container.remove();
      console.error = original;
    }
  }, 60_000);
});
