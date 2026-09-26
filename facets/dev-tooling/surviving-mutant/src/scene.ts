/**
 * surviving-mutant 장면 — 바탕(코드 · 시험 · 변이) · 자취(칸마다 결과, 변이마다 판정) · 이번 걸음.
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Mutant, TestCase, Verdict } from './algorithm.js';

/** 한 사본에 한 시험을 돌린 결과. */
export type SlotResult = { got: string; pass: boolean };

export type SurvivingMutantStep =
  | { kind: 'start' }
  | { kind: 'run'; copy: number; test: number; got: string; want: string; pass: boolean; verdict: Verdict }
  | { kind: 'score'; killed: number; total: number };

export type SurvivingMutantScene = {
  code: string[];
  tests: TestCase[];
  mutants: Mutant[];
  /** slots[copy][test] — copy 0 은 원본. 아직 안 돌렸으면 null */
  slots: (SlotResult | null)[][];
  /** verdicts[m] — mutants[m] 의 판정. 아직이면 'none' */
  verdicts: Verdict[];
  step: SurvivingMutantStep;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`surviving-mutant: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`surviving-mutant: ${what} 가 글자가 아니다`);
  return v;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`surviving-mutant: ${what} 가 수가 아니다`);
  return v;
}

function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`surviving-mutant: ${what} 가 목록이 아니다`);
  return v;
}

function verdictOf(v: unknown): Verdict {
  if (v === 'none' || v === 'killed' || v === 'survived') return v;
  throw new Error(`surviving-mutant: 모르는 판정 '${String(v)}'`);
}

export const survivingMutantScene: ScenePlan<SurvivingMutantScene> = {
  initial(initialData: unknown): SurvivingMutantScene {
    const d = rec(initialData, 'initialData');
    const code = list(d.code, 'code').map((l, i) => str(l, `code[${i}]`));
    const tests = list(d.tests, 'tests').map((raw, i) => {
      const t = rec(raw, `tests[${i}]`);
      return { id: str(t.id, `tests[${i}].id`), text: str(t.text, `tests[${i}].text`) };
    });
    const mutants = list(d.mutants, 'mutants').map((raw, i) => {
      const m = rec(raw, `mutants[${i}]`);
      return {
        id: str(m.id, `mutants[${i}].id`),
        line: num(m.line, `mutants[${i}].line`),
        text: str(m.text, `mutants[${i}].text`),
      };
    });
    return {
      code,
      tests,
      mutants,
      slots: Array.from({ length: mutants.length + 1 }, () => tests.map(() => null)),
      verdicts: mutants.map(() => 'none' as Verdict),
      step: { kind: 'start' },
    };
  },

  reduce(scene: SurvivingMutantScene, event: FacetRuntimeEvent): SurvivingMutantScene {
    if (event.type === 'run') {
      const p = rec(event.payload, 'run payload');
      const copy = num(p.copy, 'copy');
      const test = num(p.test, 'test');
      const got = str(p.got, 'got');
      const want = str(p.want, 'want');
      if (typeof p.pass !== 'boolean') throw new Error('surviving-mutant: pass 가 참거짓이 아니다');
      const pass = p.pass;
      const verdict = verdictOf(p.verdict);
      const row = scene.slots[copy];
      if (!row || test < 0 || test >= row.length) {
        throw new Error(`surviving-mutant: 칸 (${copy}, ${test}) 이 장면 밖이다`);
      }
      const slots = scene.slots.map((r, ci) =>
        ci === copy ? r.map((s, ti) => (ti === test ? { got, pass } : s)) : r,
      );
      const verdicts =
        copy > 0 && verdict !== 'none'
          ? scene.verdicts.map((v, mi) => (mi === copy - 1 ? verdict : v))
          : scene.verdicts;
      return { ...scene, slots, verdicts, step: { kind: 'run', copy, test, got, want, pass, verdict } };
    }
    if (event.type === 'score') {
      const p = rec(event.payload, 'score payload');
      return {
        ...scene,
        step: { kind: 'score', killed: num(p.killed, 'killed'), total: num(p.total, 'total') },
      };
    }
    throw new Error(`surviving-mutant: 모르는 이벤트 '${event.type}'`);
  },
};
