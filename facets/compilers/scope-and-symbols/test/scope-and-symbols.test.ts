// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  analyzeProgram,
  readProgram,
  resolveArgs,
  scopeAndSymbolsAlgorithm,
  type Program,
  type ScopeAndSymbolsData,
} from '../src/algorithm.js';
import { scopeAndSymbolsFacet } from '../src/facet.js';
import { scopeAndSymbolsImperativeIR } from '../src/irs.js';

const data = scopeAndSymbolsFacet.initialData as ScopeAndSymbolsData;
const prog = analyzeProgram(data.lines);

/** 사양 실측표 — 규칙마다 (sim.py `scope-and-symbols`) */
const SPEC = [
  {
    rule: 0,
    made: 4,
    height: 3,
    links: 11,
    errors: 1,
    targets: [3, 3, 5, 4, 3, 4, 4, null, 2, 3, 1, 2],
    declScope: [0, 0, 0, 1, 1, 2, 2, 3],
    accepted: [1, 1, 1, 1, 1, 1, 1, 1],
    scanned: [1, 1, 1, 2, 1, 1, 1, 2, 2, 1, 1, 1],
    phases: ['place', 'place', 'place', 'place', 'place', 'place', 'found', 'place', 'missing', 'found'],
  },
  {
    rule: 1,
    made: 2,
    height: 2,
    links: 12,
    errors: 1,
    targets: [3, 3, 5, 4, 3, 4, 4, 6, 5, 3, 1, 2],
    declScope: [0, 0, 0, 1, 1, 1, 1, 1],
    accepted: [1, 1, 1, 1, 1, 1, 1, 0],
    scanned: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    phases: ['place', 'place', 'place', 'place', 'place', 'place', 'found', 'reject', 'found', 'found'],
  },
  {
    rule: 2,
    made: 1,
    height: 1,
    links: 12,
    errors: 3,
    targets: [3, 3, 2, 1, 3, 1, 1, 6, 2, 3, 1, 2],
    declScope: [0, 0, 0, 0, 0, 0, 0, 0],
    accepted: [1, 1, 1, 1, 0, 0, 1, 0],
    scanned: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    phases: ['place', 'place', 'place', 'reject', 'reject', 'place', 'found', 'reject', 'found', 'found'],
  },
] as const;

/** 쓰임이 가리킨 선언의 줄 (없으면 null) */
const targetLines = (p: Program, target: number[]) =>
  target.map((d) => (d < 0 ? null : (p.decls[d] as { line: number }).line));

function irResolve(p: Program, rule: number) {
  const args = resolveArgs(p, rule) as (number | number[])[];
  const errors = runIR(scopeAndSymbolsImperativeIR, 'resolveAll', args);
  return {
    errors,
    declScope: args[9] as number[],
    accepted: args[10] as number[],
    target: args[11] as number[],
  };
}

describe('scope-and-symbols — 구조 셈', () => {
  it('스코프 넷 · 선언 여덟 · 쓰임 열둘이 사양의 대조와 같다', () => {
    expect(prog.scopes.map((s) => s.parent)).toEqual([-1, 0, 1, 1]);
    expect(prog.scopes.map((s) => s.kind)).toEqual([0, 1, 2, 2]);
    expect(prog.decls.map((d) => `${d.name}@L${d.line} s${d.home}`)).toEqual([
      'size@L1 s0', 'i@L2 s0', 'fill@L3 s0', 'n@L3 s1', 'size@L4 s1', 'i@L5 s2', 'last@L6 s2', 'size@L8 s3',
    ]);
    expect(prog.uses.map((u) => `${u.name}@L${u.line} s${u.scope}`)).toEqual([
      'n@L4 s1', 'n@L5 s1', 'i@L6 s2', 'size@L6 s2', 'n@L7 s1', 'size@L7 s1',
      'size@L9 s1', 'last@L9 s1', 'i@L9 s1', 'fill@L10 s0', 'size@L10 s0', 'i@L10 s0',
    ]);
    expect(prog.names).toEqual(['size', 'i', 'fill', 'n', 'last']);
  });

  it('구조에서 찍은 글자가 데이터 글자와 다르면 던진다', () => {
    const bad = data.lines.map((l, i) => (i === 3 ? { ...l, text: 'let size = n*2' } : l));
    expect(() => analyzeProgram(bad)).toThrow();
  });

  it('사다리가 손잡이 구간 값 · 규칙 목록과 같다', () => {
    const controls = (scopeAndSymbolsFacet.blocks.controls as { controls: { widget?: string; segments?: { value: number }[] }[] }).controls;
    const knob = controls.find((x) => x.widget === 'segmented-slider');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.scopeRuleLadder);
    expect(data.scopeRuleLadder).toEqual([0, 1, 2]);
    expect(data.scopeRules.map((r) => r.id)).toEqual(['block', 'function', 'single']);
    expect(data.lines.length).toBe(10);
  });
});

describe('scope-and-symbols — 규칙마다 읽기', () => {
  for (const spec of SPEC) {
    it(`규칙 ${spec.rule}: 표 · 선 · 걸림 · 가리킨 선언이 사양과 같다`, () => {
      const r = readProgram(prog, spec.rule);
      expect(r.meters).toEqual({ made: spec.made, links: spec.links, errors: spec.errors });
      expect(r.maxHeight).toBe(spec.height);
      expect(targetLines(prog, r.target)).toEqual(spec.targets);
      expect(r.declScope).toEqual(spec.declScope);
      expect(r.accepted).toEqual(spec.accepted);
      expect(r.scanned).toEqual(spec.scanned);
      expect(r.steps.map((s) => s.phase)).toEqual(spec.phases);
      expect(r.steps.length + 1).toBe(11);
    });

    it(`규칙 ${spec.rule}: IR 이 알고리즘과 같은 답을 낸다`, () => {
      const r = readProgram(prog, spec.rule);
      const ir = irResolve(prog, spec.rule);
      expect(ir.errors).toBe(r.meters.errors);
      expect(ir.target).toEqual(r.target);
      expect(ir.accepted).toEqual(r.accepted);
      expect(ir.declScope).toEqual(r.declScope);
    });
  }

  it('phase 넷이 모든 규칙을 모아 닿는다', () => {
    const all = new Set(SPEC.flatMap((s) => readProgram(prog, s.rule).steps.map((x) => x.phase)));
    expect([...all].sort()).toEqual(['found', 'missing', 'place', 'reject']);
  });

  it('선언 차례 · 쓰임 차례 · 스코프 번호를 섞어도 IR 의 답이 같다 (서른 번)', () => {
    // 식까지 적힌 생성기 — 선형 합동
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const perm = (n: number) => {
      const a = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i -= 1) {
        const j = rnd(i + 1);
        [a[i], a[j]] = [a[j] as number, a[i] as number];
      }
      return a;
    };
    for (let trial = 0; trial < 30; trial += 1) {
      const dp = perm(prog.decls.length);
      const up = perm(prog.uses.length);
      const inner = perm(prog.scopes.length - 1).map((x) => x + 1);
      const sMap = [0, ...inner]; // 옛 번호 → 새 번호 (맨 바깥 0 은 둔다)
      const scopes = prog.scopes.map(() => ({ id: 0, kind: 0, parent: -1, headLine: 0, headName: '' }));
      prog.scopes.forEach((s, i) => {
        const ni = sMap[i] as number;
        scopes[ni] = { ...s, id: ni, parent: s.parent < 0 ? -1 : (sMap[s.parent] as number) };
      });
      const shuffled: Program = {
        ...prog,
        scopes,
        decls: dp.map((i) => {
          const d = prog.decls[i] as Program['decls'][number];
          return { ...d, home: sMap[d.home] as number };
        }),
        uses: up.map((i) => {
          const u = prog.uses[i] as Program['uses'][number];
          return { ...u, scope: sMap[u.scope] as number };
        }),
      };
      for (const spec of SPEC) {
        const base = readProgram(prog, spec.rule);
        const ir = irResolve(shuffled, spec.rule);
        expect(ir.errors).toBe(base.meters.errors);
        up.forEach((old, k) => {
          const got = ir.target[k] as number;
          const want = base.target[old] as number;
          expect(got < 0 ? -1 : dp[got]).toBe(want < 0 ? -1 : want);
        });
        dp.forEach((old, k) => {
          expect(ir.accepted[k]).toBe(base.accepted[old]);
          expect(ir.declScope[k]).toBe(sMap[base.declScope[old] as number]);
        });
      }
    }
  });
});

describe('scope-and-symbols — 회차별 계기', () => {
  it('손잡이를 블록 → 하나뿐 → 블록 으로 돌리면 회차마다 사양 값이 보인다', async () => {
    const inputs = [2, 0];
    const shown: Record<string, number> = {};
    const atRoundEnd: Record<string, number>[] = [];
    const events: FacetRuntimeEvent[] = [];
    let cancelled = false;
    const ctx = {
      data,
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        events.push(e);
      },
      metric(name: string, delta: number | 'inc') {
        shown[name] = (shown[name] ?? 0) + (delta === 'inc' ? 1 : delta);
      },
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        atRoundEnd.push({ ...shown });
        const v = inputs.shift();
        if (v === undefined) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return { type: 'scopeRule', payload: { value: v } };
      },
    };
    await scopeAndSymbolsAlgorithm(ctx as never);
    expect(atRoundEnd).toEqual([
      { 'tables-made': 4, links: 11, 'scope-errors': 1 },
      { 'tables-made': 1, links: 12, 'scope-errors': 3 },
      { 'tables-made': 4, links: 11, 'scope-errors': 1 },
    ]);
    // 회차마다 걸음 0 + 줄 열 = 11 걸음
    expect(events.filter((e) => e.type === 'round').length).toBe(3);
    expect(events.filter((e) => e.type === 'line').length).toBe(30);
  });
});
