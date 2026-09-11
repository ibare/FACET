/**
 * boyerMoore — 손잡이가 논증을 지는가, 그리고 코드 패널이 화면과 같은 답을 내는가.
 *
 * 두 가지를 잰다.
 *
 * 1. **손잡이** — 패턴 길이 2·4·6·8 에서 평균 점프 거리와 안 본 글자가 단조로
 *    늘어나는가. 아니면 화면이 "길수록 멀리 뛴다" 는 **거짓**을 말하게 된다.
 * 2. **코드 패널** — IR 이 셈하는 값과 algorithm 이 셈하는 값이 **네 손잡이 값
 *    전부에서** 같은가. 어긋나면 코드 패널을 다는 까닭 자체가 지워진다.
 *
 * 아래의 SPEC 은 **견주는 상대**이지 화면에 뜨는 값이 아니다. 화면에 뜨는 것은
 * 전부 algorithm 이 그 자리에서 셈한다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRStmt,
  ProjectorViews,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  registerBuiltinViews,
  runFacet,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

import {
  BOYER_MOORE_ALPHABET,
  boyerMooreAlgorithm,
  boyerMooreFacet,
  boyerMooreImperativeIR,
  boyerMooreProjector,
  buildBadCharTable,
  registerBoyerMoore,
  type BoyerMooreData,
} from '../src/index.js';

/**
 * 이 facet 의 소스 전문. 아래 두 검사가 소스를 직접 읽는다.
 *
 * `readFileSync` 로는 못 읽는다 — vite 가 변환한 모듈에서 `import.meta.url` 이
 * 루트 상대 경로로 나와 파일을 찾지 못한다. `import.meta.glob` 은 vite 가 빌드
 * 시각에 펴 주는 것이라 vitest 안에서 제대로 돈다.
 *
 * **변수에 담아 부르면 안 된다** — vite 는 `import.meta.glob(` 이라는 *모양*을
 * 소스에서 찾아 펴는 것이라, 한 번 거치면 런타임에 함수가 아니라고 터진다.
 */
declare global {
  interface ImportMeta {
    glob(
      pattern: string,
      options: { query: '?raw'; import: 'default'; eager: true },
    ): Record<string, string>;
  }
}

const SOURCE_TEXT: Record<string, string> = import.meta.glob('../src/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** 색 리터럴과 문안 대조의 대상 — src 전부 (S-facet 의 "facet 영역"). */
const SOURCES = [
  'algorithm.ts',
  'projector.ts',
  'facet.ts',
  'irs.ts',
  'index.ts',
  'description.ts',
  'boyer-moore-stage.ts',
];

function sourceOf(name: string): string {
  const key = Object.keys(SOURCE_TEXT).find((k) => k.endsWith(`/${name}`));
  if (key === undefined) throw new Error(`소스를 찾지 못했다: ${name}`);
  return SOURCE_TEXT[key];
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 사양의 대조표 — 실측으로 얻은 값이며 algorithm·IR 양쪽과 견준다. */
const SPEC = {
  textLength: 77,
  rows: [
    { m: 2, pattern: 'he', foundAt: 32, jumps: 18, jumpSum: 32, compares: 21, unread: 57 },
    { m: 4, pattern: 'here', foundAt: 45, jumps: 13, jumpSum: 45, compares: 18, unread: 60 },
    { m: 6, pattern: 'nobody', foundAt: 50, jumps: 9, jumpSum: 50, compares: 15, unread: 62 },
    { m: 8, pattern: 'workshop', foundAt: 35, jumps: 6, jumpSum: 35, compares: 14, unread: 64 },
  ],
} as const;

const PHASES = ['bad-char', 'compare', 'found', 'shift', 'table'];

const LOCALES = ['en', 'ko', 'ja', 'zh', 'ar', 'es', 'fr', 'hi', 'id', 'pt'];

const TRANSPILERS = [
  cppTranspiler,
  csharpTranspiler,
  javaTranspiler,
  javascriptTranspiler,
  pythonTranspiler,
  typescriptTranspiler,
];

function freshData(): BoyerMooreData {
  return structuredClone(boyerMooreFacet.initialData) as unknown as BoyerMooreData;
}

const codesOf = (s: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) out.push(s.charCodeAt(i));
  return out;
};

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

/**
 * 알고리즘을 가짜 ReactiveContext 로 돌린다. 각본이 바닥나면 취소로 깨워
 * 끝낸다 — 메커니즘의 되감기가 하는 일과 같다.
 */
async function drive(script: ReactiveInputEvent[]): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const queue = [...script];
  let cancelled = false;
  const ctx = {
    data: freshData(),
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
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (next !== undefined) return next;
      cancelled = true;
      throw new Error('cancelled');
    },
  } as unknown as FacetContext<BoyerMooreData>;

  await boyerMooreAlgorithm(ctx);
  return { events, metrics };
}

type Run = {
  m: number;
  pattern: string;
  compares: number;
  jumps: number;
  jumpSum: number;
  looked: number;
  foundAt: number;
  verdict: Record<string, number>;
};

const rec = (e: FacetRuntimeEvent): Record<string, unknown> =>
  (e.payload ?? {}) as Record<string, unknown>;

/** `run-init` 을 경계로 판을 가른다. 한 판이 손잡이 한 값이다. */
function splitRuns(events: FacetRuntimeEvent[]): Run[] {
  const runs: Run[] = [];
  let cur: Run | null = null;
  const seen = new Set<number>();
  for (const e of events) {
    if (e.type === 'run-init') {
      const p = rec(e);
      cur = {
        m: p.patternLength as number,
        pattern: p.pattern as string,
        compares: 0,
        jumps: 0,
        jumpSum: 0,
        looked: 0,
        foundAt: -1,
        verdict: {},
      };
      seen.clear();
      runs.push(cur);
      continue;
    }
    if (!cur) continue;
    const p = rec(e);
    if (e.type === 'probe') {
      cur.compares += 1;
      seen.add(p.textIndex as number);
      cur.looked = seen.size;
    } else if (e.type === 'slide') {
      cur.jumps += 1;
      cur.jumpSum += p.shift as number;
    } else if (e.type === 'found') {
      cur.foundAt = p.at as number;
    } else if (e.type === 'verdict') {
      cur.verdict = p as Record<string, number>;
    }
  }
  return runs;
}

/** 네 손잡이 값을 한 번씩 지나가는 각본. 처음 판은 선언의 기본값이다. */
async function allFour(): Promise<Run[]> {
  const start = freshData().patternLength;
  const rest = [2, 4, 6, 8].filter((m) => m !== start);
  const script: ReactiveInputEvent[] = rest.map((value) => ({
    type: 'pattern-length',
    payload: { value, segmentIndex: 0 },
  }));
  const runs = splitRuns((await drive(script)).events);
  return runs.sort((a, b) => a.m - b.m);
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

/** IR 로 한 판을 돌린다. 배열 셋은 호출부가 만들어 넘긴다 (IR 에 배열 리터럴이 없다). */
function runWithIR(
  text: string,
  pattern: string,
): { foundAt: number; compares: number; jumps: number; jumpSum: number; looked: number; last: number[] } {
  const last = new Array<number>(BOYER_MOORE_ALPHABET).fill(0);
  runIR(boyerMooreImperativeIR, 'build_last', [codesOf(pattern), last]);
  const seen = new Array<number>(text.length).fill(0);
  const stats = [0, 0, 0];
  const foundAt = runIR(boyerMooreImperativeIR, 'find_pattern', [
    codesOf(text),
    codesOf(pattern),
    last,
    seen,
    stats,
  ]) as number;
  return {
    foundAt,
    compares: stats[0],
    jumps: stats[1],
    jumpSum: stats[2],
    looked: seen.filter((v) => v === 1).length,
    last,
  };
}

describe('손잡이가 논증을 진다', () => {
  it('패턴 길이 넷이 실제로 갈리고, 실측과 맞는다', async () => {
    const runs = await allFour();
    expect(runs.map((r) => r.m)).toEqual([2, 4, 6, 8]);

    for (let i = 0; i < runs.length; i += 1) {
      const r = runs[i];
      const spec = SPEC.rows[i];
      expect([r.m, r.pattern]).toEqual([spec.m, spec.pattern]);
      expect({
        foundAt: r.foundAt,
        jumps: r.jumps,
        jumpSum: r.jumpSum,
        compares: r.compares,
        unread: SPEC.textLength - r.looked,
      }).toEqual({
        foundAt: spec.foundAt,
        jumps: spec.jumps,
        jumpSum: spec.jumpSum,
        compares: spec.compares,
        unread: spec.unread,
      });
    }
  });

  it('평균 점프 거리와 안 본 글자가 넷에서 단조로 늘어난다', async () => {
    const runs = await allFour();
    const avg = runs.map((r) => r.jumpSum / r.jumps);
    const unread = runs.map((r) => SPEC.textLength - r.looked);
    for (let i = 1; i < runs.length; i += 1) {
      expect(avg[i], `평균 점프 m=${runs[i].m}`).toBeGreaterThan(avg[i - 1]);
      expect(unread[i], `안 본 글자 m=${runs[i].m}`).toBeGreaterThan(unread[i - 1]);
    }
    // 끝값 배율이 셋에 가깝게 벌어져야 손잡이가 읽힌다.
    expect(avg[3] / avg[0]).toBeGreaterThan(2.5);
  });

  it('verdict 이 화면 밖에서 다시 셈한 값과 같다', async () => {
    for (const r of await allFour()) {
      expect(r.verdict).toEqual({
        patternLength: r.m,
        jumpCount: r.jumps,
        jumpSum: r.jumpSum,
        compareCount: r.compares,
        unread: SPEC.textLength - r.looked,
        textLength: SPEC.textLength,
        foundAt: r.foundAt,
      });
    }
  });

  it('메트릭은 이번 판의 값만 보인다 — 손잡이를 밀어도 누적되지 않는다', async () => {
    const script: ReactiveInputEvent[] = [2, 4, 8].map((value) => ({
      type: 'pattern-length',
      payload: { value, segmentIndex: 0 },
    }));
    const { metrics } = await drive(script);
    const lastRun = SPEC.rows[3];
    expect(metrics['jump-count']).toBe(lastRun.jumps);
    expect(metrics['jump-sum']).toBe(lastRun.jumpSum);
    expect(metrics['compare-count']).toBe(lastRun.compares);
    expect(metrics['unread-count']).toBe(lastRun.unread);
  });
});

describe('코드 패널이 화면과 같은 답을 낸다', () => {
  it('IR 의 나쁜 문자 표가 algorithm 의 표와 같다 — 네 패턴 전부', () => {
    for (const row of SPEC.rows) {
      const { last } = runWithIR(freshData().text, row.pattern);
      expect(last, `표 m=${row.m}`).toEqual(buildBadCharTable(row.pattern, BOYER_MOORE_ALPHABET));
    }
  });

  it('IR 이 셈하는 값과 algorithm 이 셈하는 값이 네 손잡이 값 전부에서 같다', async () => {
    const text = freshData().text;
    for (const r of await allFour()) {
      const ir = runWithIR(text, r.pattern);
      expect(
        {
          foundAt: ir.foundAt,
          compares: ir.compares,
          jumps: ir.jumps,
          jumpSum: ir.jumpSum,
          looked: ir.looked,
        },
        `m=${r.m}`,
      ).toEqual({
        foundAt: r.foundAt,
        compares: r.compares,
        jumps: r.jumps,
        jumpSum: r.jumpSum,
        looked: r.looked,
      });
    }
  });

  it('phase 어휘가 algorithm 과 irs 에서 같은 집합이다', async () => {
    const { events } = await drive([]);
    const fromAlgorithm = new Set<string>();
    for (const e of events) {
      if (e.type !== 'phase') continue;
      expect(e.silent).toBe(true);
      fromAlgorithm.add((rec(e).phase as string) ?? '');
    }
    expect([...fromAlgorithm].sort()).toEqual(PHASES);
    expect([...irPhases(boyerMooreImperativeIR)].sort()).toEqual(PHASES);
  });

  it('여섯 언어가 IR 을 옮기고 phase 가 모두 살아 있다', () => {
    for (const t of TRANSPILERS) {
      const { lines } = t.transpile(boyerMooreImperativeIR);
      expect(lines.length, t.id).toBeGreaterThan(20);
      const phases = new Set(lines.map((l) => l.phase).filter((p): p is string => p !== null));
      expect([...phases].sort(), t.id).toEqual(PHASES);
      // 셈이 이름 붙인 호출 뒤로 숨지 않았는지 — 표를 짚는 자리가 소스에 보여야 한다.
      const src = lines.map((l) => l.code).join('\n');
      expect(src, t.id).toContain('last[');
    }
  });
});

describe('선언', () => {
  it('제목·설명·문안·라벨이 열 언어를 다 채운다', () => {
    const boxes: Array<[string, Record<string, unknown>]> = [
      ['title', boyerMooreFacet.title as Record<string, unknown>],
      ['description', boyerMooreFacet.description as Record<string, unknown>],
    ];
    for (const [key, value] of Object.entries(boyerMooreFacet.messages ?? {})) {
      boxes.push([`messages.${key}`, value as Record<string, unknown>]);
    }
    const controls = (boyerMooreFacet.blocks.controls as { controls: Array<Record<string, unknown>> })
      .controls;
    for (const c of controls) {
      if (c.label && typeof c.label === 'object') {
        boxes.push([`control.${String(c.action)}`, c.label as Record<string, unknown>]);
      }
    }
    const metrics = (boyerMooreFacet.blocks.controls as { metrics: Array<Record<string, unknown>> })
      .metrics;
    for (const m of metrics) boxes.push([`metric.${String(m.name)}`, m.label as Record<string, unknown>]);
    const panel = boyerMooreFacet.blocks.codePanel as { label: Record<string, unknown> };
    boxes.push(['codePanel', panel.label]);

    const missing: string[] = [];
    for (const [name, box] of boxes) {
      for (const loc of LOCALES) {
        if (typeof box[loc] !== 'string' || box[loc] === '') missing.push(`${name}.${loc}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('참조 문자열과 1차 데이터가 규약대로다', () => {
    expect(boyerMooreFacet.id).toBe('facet:boyerMoore');
    expect(boyerMooreFacet.algorithm).toBe('module:boyerMoore');
    expect(boyerMooreFacet.projector).toBe('module:boyerMooreProjector');
    expect(boyerMooreImperativeIR.id).toBe('boyer-moore-imperative');
    expect((boyerMooreFacet.blocks.codePanel as { ir: string }).ir).toBe(
      'ir:boyer-moore-imperative',
    );

    const data = freshData();
    expect(data.type).toBe('boyer-moore');
    expect(data.text.length).toBe(SPEC.textLength);
    expect(data.patterns.map((p) => p.length)).toEqual([2, 4, 6, 8]);
    // 패턴 넷은 모두 글 안에 실제로 있어야 한다 — 없으면 화면이 못 찾고 끝난다.
    for (const p of data.patterns) expect(data.text.indexOf(p), p).toBeGreaterThanOrEqual(0);

    const segments = (
      (boyerMooreFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls.find(
        (c) => c.widget === 'segmented-slider',
      ) as { segments: Array<{ value: number; label: unknown; default?: boolean }> }
    ).segments;
    expect(segments.map((s) => s.value)).toEqual([2, 4, 6, 8]);
    // 숫자 라벨은 열 언어로 쓰지 않고 문자열로 적는다.
    for (const s of segments) expect(typeof s.label).toBe('string');
    expect(segments.find((s) => s.default)?.value).toBe(data.patternLength);
  });
});

describe('화면과 선언이 어긋나지 않는다', () => {
  it('러너로 띄우면 그림이 서고 세로가 바뀌지 않는다', async () => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    registerBoyerMoore();

    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(boyerMooreFacet, container);
    try {
      await delay(400);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.childNodes.length ?? 0).toBeGreaterThan(0);
      // 세로가 재생 중에 바뀌면 글 안에 박힌 그림의 위아래 문단이 밀린다 (S-view).
      const before = svg?.getAttribute('viewBox');
      await delay(700);
      expect(svg?.getAttribute('viewBox')).toBe(before);
      expect(errors).toEqual([]);
    } finally {
      handle.destroy();
      console.error = original;
      container.remove();
    }
  });

  it('phase 가 코드 패널까지 닿고, 이벤트가 stage 메서드로 옮겨진다', async () => {
    const phases: Array<string | null> = [];
    const calls: string[] = [];
    const stage = new Proxy(
      {},
      {
        get: (_t, key) =>
          key === 'then'
            ? undefined
            : () => {
                calls.push(String(key));
              },
      },
    ) as unknown as ProjectorViews[string];
    const codePanel = {
      highlightPhase: (p: string | null) => {
        phases.push(p);
      },
      clearHighlight: () => undefined,
    } as unknown as ProjectorViews[string];

    const projector = boyerMooreProjector({ stage, codePanel }, undefined);
    const { events } = await drive([]);
    for (const e of events) await projector.onEvent(e);

    expect([...new Set(phases.filter((p): p is string => p !== null))].sort()).toEqual(PHASES);
    const names = new Set(calls);
    for (const m of [
      'initRun',
      'setReadout',
      'land',
      'probe',
      'mismatch',
      'slide',
      'found',
      'dimUnread',
      'setCaption',
    ]) {
      expect([...names], m).toContain(m);
    }
  });

  it('호출부의 en 원본이 선언의 en 과 글자까지 같다', () => {
    const CALL = /\b(?:tr|t)\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g;
    const un = (raw: string): string =>
      raw.replace(/\\(['"\\nt])/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
    const declared = (boyerMooreFacet.messages ?? {}) as Record<string, { en?: string }>;

    const drifted: string[] = [];
    const called = new Set<string>();
    for (const name of SOURCES) {
      for (const m of sourceOf(name).matchAll(CALL)) {
        const key = un(m[1]);
        const en = un(m[2]);
        called.add(key);
        const decl = declared[key];
        if (!decl) {
          drifted.push(`${name} :: ${key} — 선언에 없다`);
          continue;
        }
        if (decl.en !== en) {
          drifted.push(
            `${name} :: ${key}\n  호출부 ${JSON.stringify(en)}\n  선언   ${JSON.stringify(decl.en)}`,
          );
        }
      }
    }
    expect(drifted).toEqual([]);
    // 검사가 조용히 빈껍데기가 되지 않게 하는 하한.
    expect(called.size).toBeGreaterThan(10);
    // 선언해 놓고 아무도 부르지 않는 문안은 죽은 문안이다.
    expect(Object.keys(declared).filter((k) => !called.has(k))).toEqual([]);
  });

  it('facet 영역에 색 리터럴이 없다', () => {
    const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/g;
    const found: string[] = [];
    for (const name of SOURCES) {
      for (const m of sourceOf(name).matchAll(COLOR)) found.push(`${name} :: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });
});
