/**
 * fast-forward 의 장면. 셈은 알고리즘이 하고, 장면은 이벤트를 잇기만 한다.
 *
 * - 바탕: 커밋 · HEAD · 합칠 쪽 / 받는 쪽 이름 (initialData 에서 베낀다)
 * - 자취: 이름표의 자리 · 거슬러 간 길 · 건넌 커밋 · 셈
 * - 이번 걸음: `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readFastForwardData, type FastForwardBranch, type FastForwardCommit } from './algorithm.js';

export type FastForwardStep =
  | { kind: 'start' }
  | { kind: 'judge' }
  | { kind: 'jump'; name: string; from: string; to: string }
  | { kind: 'tally' };

export type FastForwardTally = { made: number; moved: number; reach: number; before: number; after: number };

export type FastForwardScene = {
  commits: FastForwardCommit[];
  head: string;
  from: string;
  into: string;
  branches: FastForwardBranch[];
  walk: { path: string[]; base: string } | null;
  crossed: string[];
  tally: FastForwardTally | null;
  step: FastForwardStep;
};

function fail(where: string, what: string): never {
  throw new Error(`fast-forward scene: ${where} — ${what}`);
}

function field(payload: unknown, type: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) fail(`${type}.payload`, '객체가 아니다');
  return payload as Record<string, unknown>;
}

function str(o: Record<string, unknown>, key: string, type: string): string {
  const v = o[key];
  if (typeof v !== 'string') fail(`${type}.payload.${key}`, '글자가 아니다');
  return v;
}

function num(o: Record<string, unknown>, key: string, type: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${type}.payload.${key}`, '수가 아니다');
  return v;
}

function commitsIn(scene: FastForwardScene, ids: string[], where: string): string[] {
  for (const id of ids) if (!scene.commits.some((c) => c.id === id)) fail(where, `없는 커밋 ${id}`);
  return ids;
}

function strs(o: Record<string, unknown>, key: string, type: string): string[] {
  const v = o[key];
  if (!Array.isArray(v)) fail(`${type}.payload.${key}`, '배열이 아니다');
  return v.map((x: unknown, i: number) => {
    if (typeof x !== 'string') fail(`${type}.payload.${key}[${i}]`, '글자가 아니다');
    return x;
  });
}

export const fastForwardScene: ScenePlan<FastForwardScene> = {
  initial(initialData: unknown): FastForwardScene {
    const d = readFastForwardData(initialData);
    return {
      commits: d.commits.map((c) => ({ id: c.id, parents: [...c.parents] })),
      head: d.head,
      from: d.merge.from,
      into: d.merge.into,
      branches: d.branches.map((b) => ({ name: b.name, at: b.at })),
      walk: null,
      crossed: [],
      tally: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: FastForwardScene, event: FacetRuntimeEvent): FastForwardScene {
    const type = event.type;
    if (type === 'judge') {
      const p = field(event.payload, type);
      return {
        ...scene,
        walk: {
          path: commitsIn(scene, strs(p, 'path', type), 'judge.payload.path'),
          base: commitsIn(scene, [str(p, 'base', type)], 'judge.payload.base')[0] ?? fail('judge.payload.base', '비었다'),
        },
        step: { kind: 'judge' },
      };
    }
    if (type === 'jump') {
      const p = field(event.payload, type);
      const name = str(p, 'name', type);
      const from = str(p, 'from', type);
      const to = str(p, 'to', type);
      if (!scene.commits.some((c) => c.id === from)) fail('jump.payload.from', `없는 커밋 ${from}`);
      if (!scene.branches.some((b) => b.name === name)) fail('jump.payload.name', `없는 이름 ${name}`);
      if (!scene.commits.some((c) => c.id === to)) fail('jump.payload.to', `없는 커밋 ${to}`);
      return {
        ...scene,
        branches: scene.branches.map((b) => (b.name === name ? { name: b.name, at: to } : { ...b })),
        crossed: commitsIn(scene, strs(p, 'crossed', type), 'jump.payload.crossed'),
        step: { kind: 'jump', name, from, to },
      };
    }
    if (type === 'tally') {
      const p = field(event.payload, type);
      return {
        ...scene,
        tally: {
          made: num(p, 'made', type),
          moved: num(p, 'moved', type),
          reach: num(p, 'reach', type),
          before: num(p, 'before', type),
          after: num(p, 'after', type),
        },
        step: { kind: 'tally' },
      };
    }
    return fail('reduce', `모르는 이벤트 ${type}`);
  },
};
