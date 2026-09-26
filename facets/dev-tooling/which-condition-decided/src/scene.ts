/**
 * which-condition-decided 의 장면.
 *
 * 바탕 — 코드 줄 · 조건 · 시험 (initialData 에서 베낀다)
 * 자취 — 돌린 시험의 조건값 · 결정값, 조건마다의 짝 찾기 결과
 * 이번 걸음 — 처음 · 시험 하나를 돌림 · 조건 하나의 짝 찾기
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneCondition = { id: string; text: string };
export type SceneTest = { id: string; args: (number | boolean)[] };
export type SceneRun = { conds: boolean[]; decision: boolean };

export type PairState =
  | { state: 'found'; first: number; second: number }
  | { state: 'none'; same: boolean | null };

export type WcdStep =
  | { kind: 'start' }
  | { kind: 'run'; test: number }
  | { kind: 'pair'; cond: number };

export type WhichConditionDecidedScene = {
  code: string[];
  conditions: SceneCondition[];
  tests: SceneTest[];
  /** 시험 자리마다 — 아직 안 돌렸으면 null */
  runs: (SceneRun | null)[];
  /** 조건 자리마다 — 아직 짝을 찾지 않았으면 null */
  pairs: (PairState | null)[];
  step: WcdStep;
};

function fail(msg: string): never {
  throw new Error(`which-condition-decided 장면: ${msg}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readConditions(v: unknown): SceneCondition[] {
  if (!Array.isArray(v)) fail('conditions 가 목록이 아니다');
  return v.map((c, i) => {
    if (!isRecord(c) || typeof c.id !== 'string' || typeof c.text !== 'string') {
      fail(`conditions[${i}] 모양이 틀렸다`);
    }
    return { id: c.id, text: c.text };
  });
}

function readTests(v: unknown): SceneTest[] {
  if (!Array.isArray(v)) fail('tests 가 목록이 아니다');
  return v.map((t, i) => {
    if (!isRecord(t) || typeof t.id !== 'string' || !Array.isArray(t.args)) {
      fail(`tests[${i}] 모양이 틀렸다`);
    }
    const args = t.args.map((a: unknown) => {
      if (typeof a !== 'number' && typeof a !== 'boolean') fail(`tests[${i}] 의 인자가 수 · 참거짓이 아니다`);
      return a;
    });
    return { id: t.id, args };
  });
}

function readCode(v: unknown): string[] {
  if (!Array.isArray(v)) fail('code 가 목록이 아니다');
  return v.map((line, i) => {
    if (typeof line !== 'string') fail(`code[${i}] 가 글자가 아니다`);
    return line;
  });
}

function readIndex(v: unknown, size: number, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= size) fail(`${what} 자리가 틀렸다`);
  return v;
}

/** 지금까지 나온 결정 결과의 가짓수 (참 · 거짓 가운데). */
export function outcomesSeen(scene: WhichConditionDecidedScene): number {
  const seen = new Set<boolean>();
  for (const r of scene.runs) if (r !== null) seen.add(r.decision);
  return seen.size;
}

/** 가름이 확인된 조건 수. */
export function confirmedCount(scene: WhichConditionDecidedScene): number {
  return scene.pairs.filter((p) => p !== null && p.state === 'found').length;
}

export const whichConditionDecidedScene: ScenePlan<WhichConditionDecidedScene> = {
  initial(initialData: unknown): WhichConditionDecidedScene {
    if (!isRecord(initialData)) fail('initialData 가 없다');
    const conditions = readConditions(initialData.conditions);
    const tests = readTests(initialData.tests);
    return {
      code: readCode(initialData.code),
      conditions,
      tests,
      runs: tests.map(() => null),
      pairs: conditions.map(() => null),
      step: { kind: 'start' },
    };
  },

  reduce(scene, event: FacetRuntimeEvent): WhichConditionDecidedScene {
    const p = event.payload;
    if (event.type === 'run') {
      if (!isRecord(p)) fail('run 의 payload 가 없다');
      const test = readIndex(p.test, scene.tests.length, 'run.test');
      if (!Array.isArray(p.conds) || p.conds.length !== scene.conditions.length) fail('run.conds 모양이 틀렸다');
      const conds = p.conds.map((c: unknown) => {
        if (typeof c !== 'boolean') fail('run.conds 에 참거짓이 아닌 값');
        return c;
      });
      if (typeof p.decision !== 'boolean') fail('run.decision 이 참거짓이 아니다');
      const runs = scene.runs.map((r, i) => (i === test ? { conds, decision: p.decision as boolean } : r));
      return { ...scene, runs, step: { kind: 'run', test } };
    }
    if (event.type === 'pair') {
      if (!isRecord(p)) fail('pair 의 payload 가 없다');
      const cond = readIndex(p.cond, scene.conditions.length, 'pair.cond');
      let next: PairState;
      if (p.found === true) {
        const first = readIndex(p.first, scene.tests.length, 'pair.first');
        const second = readIndex(p.second, scene.tests.length, 'pair.second');
        next = { state: 'found', first, second };
      } else if (p.found === false) {
        const same = p.same;
        if (same !== null && typeof same !== 'boolean') fail('pair.same 모양이 틀렸다');
        next = { state: 'none', same };
      } else {
        fail('pair.found 가 참거짓이 아니다');
      }
      const pairs = scene.pairs.map((q, i) => (i === cond ? next : q));
      return { ...scene, pairs, step: { kind: 'pair', cond } };
    }
    fail(`모르는 이벤트 — ${event.type}`);
  },
};
