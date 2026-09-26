/**
 * path-explosion 의 장면.
 *
 * 바탕: 결정의 식별자 줄 (initialData 에서 베낀다).
 * 자취: 지난 결정마다 그 뒤의 길 수 · 갈래 칸 수, 그리고 갈래를 채우는 시험들.
 * 이번 걸음: 처음 · k 번째 결정을 지남 · 끝.
 *
 * 셈은 알고리즘이 한다 — 장면은 이벤트의 값을 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { startPaths } from './algorithm.js';

export type PassedDecision = {
  id: string;
  /** 이 결정을 지난 뒤의 길 수 */
  paths: number;
  /** 이 결정까지의 갈래 칸 수 */
  branches: number;
};

export type PathExplosionStep =
  | { kind: 'start' }
  | { kind: 'pass'; k: number }
  | { kind: 'done'; paths: number; tests: number };

export type PathExplosionScene = {
  decisions: string[];
  /** 지금의 길 수 · 갈래 칸 수 · 갈래를 채우는 시험 수 */
  paths: number;
  branches: number;
  passed: PassedDecision[];
  /** 갈래를 채우는 시험들 — 시험마다 지나온 결정의 참거짓 */
  tests: boolean[][];
  step: PathExplosionStep;
};

function readDecisions(initialData: unknown): string[] {
  if (typeof initialData !== 'object' || initialData === null) {
    throw new Error('path-explosion 장면: initialData 가 객체가 아니다');
  }
  const raw = (initialData as Record<string, unknown>).decisions;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('path-explosion 장면: decisions 가 없거나 비었다');
  }
  const ids: string[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') throw new Error('path-explosion 장면: 결정 식별자가 글자가 아니다');
    ids.push(id);
  }
  return ids;
}

function readTests(raw: unknown): boolean[][] {
  if (!Array.isArray(raw)) throw new Error('path-explosion 장면: tests 가 배열이 아니다');
  return raw.map((test) => {
    if (!Array.isArray(test)) throw new Error('path-explosion 장면: 시험이 배열이 아니다');
    return test.map((b) => {
      if (typeof b !== 'boolean') throw new Error('path-explosion 장면: 시험의 갈래가 참거짓이 아니다');
      return b;
    });
  });
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`path-explosion 장면: ${key} 가 수가 아니다`);
  return v;
}

export const pathExplosionScene: ScenePlan<PathExplosionScene> = {
  initial(initialData: unknown): PathExplosionScene {
    return {
      decisions: readDecisions(initialData),
      paths: startPaths().length,
      branches: 0,
      passed: [],
      tests: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: PathExplosionScene, event: FacetRuntimeEvent): PathExplosionScene {
    const raw = event.payload;
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`path-explosion 장면: ${event.type} 의 payload 가 객체가 아니다`);
    }
    const p = raw as Record<string, unknown>;

    if (event.type === 'pass') {
      const k = num(p, 'k');
      const id = p.id;
      if (typeof id !== 'string') throw new Error('path-explosion 장면: id 가 글자가 아니다');
      const paths = num(p, 'paths');
      const branches = num(p, 'branches');
      return {
        ...scene,
        paths,
        branches,
        passed: [...scene.passed, { id, paths, branches }],
        tests: readTests(p.tests),
        step: { kind: 'pass', k },
      };
    }

    if (event.type === 'done') {
      return {
        ...scene,
        passed: [...scene.passed],
        tests: scene.tests.map((t) => [...t]),
        step: { kind: 'done', paths: num(p, 'paths'), tests: num(p, 'tests') },
      };
    }

    throw new Error(`path-explosion 장면: 모르는 이벤트 ${event.type}`);
  },
};
