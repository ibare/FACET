/**
 * 아호-코라식 완제품 검사.
 *
 * 이 facet 은 코드 패널을 달았고, 그 패널이 화면과 **같은 답**을 내야 한다.
 * 그러므로 검사의 중심은 하나다 — IR 이 셈한 실패 링크와 찾은 자리가 algorithm 의
 * 것과 **손잡이 다섯 값 전부에서** 같은가.
 *
 *  1. IR ↔ algorithm 전수 대조 (손잡이 1~5)
 *  2. 손잡이 실측 — 읽은 글자가 정말 고정인가, 그 옆의 수는 정말 느는가
 *  3. 여섯 언어 emit
 *  4. phase 어휘 일치 (C3) · 메트릭 이름 일치 (C5)
 *  5. 화면 — 띄워서 굴려도 던지지 않고 세로가 바뀌지 않는가
 *
 * 기대값은 상수로 박지 않는다. 고정이어야 하는 것(읽은 글자 = 글의 길이)만
 * 못박고 나머지는 실행 결과끼리 견준다.
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
import { runFacet, clearRegistry } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent, MetricDelta } from '@ffacet/core/runtime';
import type { IRStmt } from '@ffacet/core';

import {
  ahoAlphabet,
  ahoCorasickAlgorithm,
  ahoScan,
  buildAhoTrie,
  separateReadCount,
  AHO_PATTERN_COUNT_CHOICES,
  type AhoCorasickData,
} from '../src/algorithm.js';
import { ahoCorasickImperativeIR } from '../src/irs.js';
import { ahoCorasickFacet } from '../src/facet.js';
import { registerAhoCorasick } from '../src/index.js';

/** 사양이 정한 자료를 선언에서 그대로 읽어 온다 (검사가 자료를 다시 적지 않는다). */
const data = ahoCorasickFacet.initialData as unknown as AhoCorasickData;
const ALL = data.patterns;
const TEXT = data.text;
/** 알파벳은 패턴 전부에서 뽑는다 — 손잡이를 밀어도 열이 흔들리지 않게. */
const ALPHABET = ahoAlphabet(TEXT, ALL);

// ─────────────────────────────────────────────────────────────────────────────
// 1. IR ↔ algorithm 전수 대조
// ─────────────────────────────────────────────────────────────────────────────

type IrRun = { nodeCount: number; fail: number[]; pairs: Array<[number, number]> };

/** 손잡이 값 하나로 IR 세 함수를 실제로 돌린다. 배열은 밖에서 받는다. */
function runIrAt(k: number): IrRun {
  const patterns = ALL.slice(0, k);
  const alpha = ALPHABET.length;
  const codeOf = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));
  const cap = patterns.reduce((sum, p) => sum + p.length, 0) + 1;

  const next = new Array<number>(cap * alpha).fill(-1);
  const ends = new Array<number>(cap).fill(-1);
  const syms: number[] = [];
  const start: number[] = [];
  const span: number[] = [];
  for (const pattern of patterns) {
    start.push(syms.length);
    span.push(pattern.length);
    for (const ch of pattern) syms.push(codeOf.get(ch) ?? 0);
  }

  const nodeCount = runIR(ahoCorasickImperativeIR, 'build_trie', [
    next,
    ends,
    syms,
    start,
    span,
    alpha,
    patterns.length,
  ]) as number;

  const fail = new Array<number>(cap).fill(0);
  const order = new Array<number>(cap).fill(0);
  runIR(ahoCorasickImperativeIR, 'link_fails', [next, fail, order, alpha]);

  const textSyms = [...TEXT].map((ch) => codeOf.get(ch) ?? 0);
  const hits = new Array<number>(TEXT.length * ALL.length).fill(-1);
  const spots = new Array<number>(TEXT.length * ALL.length).fill(-1);
  const found = runIR(ahoCorasickImperativeIR, 'scan_text', [
    next,
    fail,
    ends,
    textSyms,
    alpha,
    hits,
    spots,
  ]) as number;

  return {
    nodeCount,
    fail: fail.slice(0, nodeCount),
    pairs: Array.from({ length: found }, (_, i) => [hits[i] ?? -1, spots[i] ?? -1]),
  };
}

/** algorithm 쪽의 같은 값. 마디 번호가 같은 차례로 붙으므로 곧바로 견줄 수 있다. */
function runTsAt(k: number): IrRun {
  const patterns = ALL.slice(0, k);
  const trie = buildAhoTrie(patterns, ALPHABET);
  const steps = ahoScan(trie, patterns, TEXT);
  const pairs: Array<[number, number]> = [];
  for (const step of steps) {
    for (const hit of step.hits) pairs.push([hit.patternIndex, hit.end]);
  }
  return { nodeCount: trie.nodeCount, fail: [...trie.fail], pairs };
}

describe('IR 과 algorithm 이 같은 답을 낸다', () => {
  it.each(AHO_PATTERN_COUNT_CHOICES.map((k) => [k] as const))(
    '패턴 %i 개 — 마디 · 실패 링크 · 찾은 자리가 모두 같다',
    (k) => {
      const ir = runIrAt(k);
      const ts = runTsAt(k);
      expect(ir.nodeCount).toBe(ts.nodeCount);
      expect(ir.fail).toEqual(ts.fail);
      expect(ir.pairs).toEqual(ts.pairs);
      // 견줄 것이 실제로 있었는지 본다 — 둘 다 비면 위 단언이 공허하게 통과한다.
      expect(ir.pairs.length).toBeGreaterThan(0);
      expect(ir.fail.some((f) => f !== 0)).toBe(true);
    },
  );

  it('찾은 자리가 글에서 실제로 그 패턴이다', () => {
    for (const k of AHO_PATTERN_COUNT_CHOICES) {
      for (const [patternIndex, end] of runIrAt(k).pairs) {
        const pattern = ALL[patternIndex] ?? '';
        expect(TEXT.slice(end - pattern.length + 1, end + 1)).toBe(pattern);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 손잡이 실측 — 움직이지 않는 수가 정말 움직이지 않는가
// ─────────────────────────────────────────────────────────────────────────────

type Run = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

/** 한 판을 끝까지 굴리고 이벤트와 메트릭을 걷는다. */
async function play(patternCount: number): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  let finished = false;
  const ctx = {
    data: { ...data, patternCount },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
      if (event.type === 'done') finished = true;
    },
    metric(name: string, delta: MetricDelta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    get cancelled() {
      // 한 판이 끝나면 취소된 것으로 본다 — 그래야 입력을 기다리지 않고 돌아온다.
      return finished;
    },
    async sleep() {
      return !finished;
    },
    async waitForInput(): Promise<never> {
      throw new Error('cancelled');
    },
  };
  await ahoCorasickAlgorithm(ctx as unknown as FacetContext<AhoCorasickData>);
  return { events, metrics };
}

describe('손잡이', () => {
  it('패턴을 더 넣어도 읽은 글자는 글의 길이 그대로다', async () => {
    const read: number[] = [];
    for (const k of AHO_PATTERN_COUNT_CHOICES) {
      const run = await play(k);
      read.push(run.metrics['chars-read'] ?? -1);
      // 읽기 이벤트도 글자마다 하나씩이다 — 되읽은 것이 없다.
      expect(run.events.filter((e) => e.type === 'read').length).toBe(TEXT.length);
    }
    expect(read).toEqual(AHO_PATTERN_COUNT_CHOICES.map(() => TEXT.length));
  });

  it('그 옆의 수는 손잡이를 따라 오른다', async () => {
    const separate: number[] = [];
    const matches: number[] = [];
    const nodes: number[] = [];
    for (const k of AHO_PATTERN_COUNT_CHOICES) {
      const run = await play(k);
      separate.push(run.metrics['separate-reads'] ?? 0);
      matches.push(run.metrics['match-count'] ?? 0);
      nodes.push(run.metrics['node-count'] ?? 0);
    }
    for (let i = 1; i < separate.length; i += 1) {
      expect(separate[i], `따로 훑기 ${i}`).toBeGreaterThan(separate[i - 1] ?? 0);
      expect(matches[i], `찾은 것 ${i}`).toBeGreaterThan(matches[i - 1] ?? 0);
      expect(nodes[i], `마디 ${i}`).toBeGreaterThan(nodes[i - 1] ?? 0);
    }
    // 끝에서 갈리는 폭이 눈에 보일 만큼은 되어야 화면이 말을 한다.
    expect((separate.at(-1) ?? 0) / TEXT.length).toBeGreaterThan(3);
  });

  it('따로 훑기는 셈이지 박아 둔 수가 아니다', () => {
    for (const k of AHO_PATTERN_COUNT_CHOICES) {
      const used = ALL.slice(0, k);
      // 한 패턴씩 더해 가면 그만큼씩 는다 — 합이 곧 전체다.
      const sum = used.reduce((acc, p) => acc + separateReadCount([p], TEXT), 0);
      expect(separateReadCount(used, TEXT)).toBe(sum);
    }
  });

  it('한 마디에서 둘이 함께 걸리는 장면이 손잡이를 밀면 나타난다', async () => {
    const many = async (k: number): Promise<number> => {
      const run = await play(k);
      return run.events.filter(
        (e) => e.type === 'match' && ((e.payload as { hits?: unknown[] }).hits ?? []).length > 1,
      ).length;
    };
    expect(await many(1)).toBe(0);
    expect(await many(2)).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 여섯 언어
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
    const out = t.transpile(ahoCorasickImperativeIR);
    expect(out.lines.length).toBeGreaterThan(40);
    for (const line of out.lines) {
      expect(line.code).not.toContain('undefined');
      expect(line.code).not.toContain('\r');
    }
  });

  it('여섯 언어 모두 다섯 phase 를 낸다', () => {
    for (const t of transpilers) {
      const phases = new Set(
        t.transpile(ahoCorasickImperativeIR).lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...phases].sort(), t.id).toEqual(['extend', 'hit', 'link', 'read', 'slide']);
    }
  });

  it('예약어를 식별자로 쓰지 않는다', () => {
    // `goto` 는 C++ · C# · Java 의 예약어이고 `out` · `base` · `ref` 는 C# 것이다.
    // transpiler 는 이름을 고쳐 주지 않는다 (S-transpiler).
    const banned = ['goto', 'out', 'base', 'ref', 'params', 'lock', 'event', 'string', 'object'];
    const names: string[] = [];
    for (const fn of ahoCorasickImperativeIR.functions) {
      for (const p of fn.params) names.push(p.name);
      const walk = (stmts: IRStmt[]): void => {
        for (const s of stmts) {
          if (s.kind === 'var') names.push(s.name);
          if (s.kind === 'for-range') {
            names.push(s.var);
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
    expect(names.filter((n) => banned.includes(n))).toEqual([]);
  });

  it('이름 붙인 호출이 하나도 없다 — 셈이 전부 펼쳐져 있다', () => {
    const calls: string[] = [];
    const walkExpr = (e: unknown): void => {
      if (typeof e !== 'object' || e === null) return;
      const node = e as { kind?: string; fn?: string } & Record<string, unknown>;
      if (node.kind === 'call' && typeof node.fn === 'string') calls.push(node.fn);
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(walkExpr);
        else walkExpr(v);
      }
    };
    for (const fn of ahoCorasickImperativeIR.functions) fn.body.forEach(walkExpr);
    expect(calls).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. phase 어휘 (C3) · 메트릭 (C5) · 선언 정합
// ─────────────────────────────────────────────────────────────────────────────

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

describe('어휘 정합', () => {
  it('irs.ts 와 algorithm.ts 의 phase 집합이 같다', async () => {
    const fromIR = new Set<string>();
    for (const fn of ahoCorasickImperativeIR.functions) irPhases(fn.body, fromIR);

    const fromAlgorithm = new Set<string>();
    for (const k of AHO_PATTERN_COUNT_CHOICES) {
      for (const e of (await play(k)).events) {
        if (e.type !== 'phase') continue;
        const p = e.payload as { phase?: unknown };
        if (typeof p.phase === 'string') fromAlgorithm.add(p.phase);
      }
    }

    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
    // 한쪽만 비어도 위 단언이 통과하지 않도록 실제 어휘를 못박는다.
    expect([...fromIR].sort()).toEqual(['extend', 'hit', 'link', 'read', 'slide']);
  });

  it('phase 이벤트는 모두 silent 다 (C2)', async () => {
    for (const e of (await play(5)).events) {
      if (e.type === 'phase') expect(e.silent).toBe(true);
    }
  });

  it('메트릭 이름이 facet.ts 선언과 같다 (C5)', async () => {
    const controls = ahoCorasickFacet.blocks.controls as { metrics?: { name: string }[] };
    const declared = (controls.metrics ?? []).map((m) => m.name).sort();
    expect(Object.keys((await play(5)).metrics).sort()).toEqual(declared);
  });

  it('손잡이의 칸이 알고리즘이 받는 값과 같다', () => {
    const controls = ahoCorasickFacet.blocks.controls as {
      controls?: Array<{ action?: string; segments?: Array<{ value: number }> }>;
    };
    const slider = (controls.controls ?? []).find((c) => c.action === 'patterns');
    expect((slider?.segments ?? []).map((s) => s.value)).toEqual([...AHO_PATTERN_COUNT_CHOICES]);
    // 손잡이의 끝이 패턴 목록의 끝과 같아야 한다 — 더 밀어도 쓸 패턴이 없으면
    // 그 칸은 앞 칸과 같은 화면을 보인다.
    expect(AHO_PATTERN_COUNT_CHOICES.at(-1)).toBe(ALL.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. 화면
// ─────────────────────────────────────────────────────────────────────────────

describe('화면', () => {
  it('띄워서 굴려도 던지지 않고 세로가 바뀌지 않는다', async () => {
    clearRegistry();
    registerAhoCorasick();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const original = console.error;
    const errors: string[] = [];
    console.error = (...a: unknown[]) => {
      errors.push(a.map(String).join(' '));
    };

    const handle = runFacet(ahoCorasickFacet, container);
    try {
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const box = svg?.getAttribute('viewBox');
      expect(svg?.childNodes.length ?? 0).toBeGreaterThan(0);

      // reactive 라 마운트하면 스스로 굴러간다. 잠깐 굴려 본다.
      await new Promise((r) => setTimeout(r, 1_200));

      expect(errors).toEqual([]);
      expect(svg?.getAttribute('viewBox')).toBe(box);
      // 글자 칸이 실제로 그려졌다.
      expect(svg?.textContent ?? '').toContain(TEXT.slice(0, 1));
    } finally {
      handle.destroy();
      container.remove();
      console.error = original;
    }
  }, 20_000);
});
