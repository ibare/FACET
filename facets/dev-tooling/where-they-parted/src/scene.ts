/**
 * where-they-parted 의 장면.
 *
 * - 바탕: 커밋(식별 · 부모 · 시각)과 이름. `initial()` 이 자료에서 베낀다.
 * - 자취: 커밋마다 가진 표시 · 꺼낸 커밋들(차례대로) · 꺼낼 줄.
 * - 이번 걸음: `step` — 처음 · 꺼내 넘김 · 두 표시가 모인 커밋.
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트가 실어 온 결과를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readWhereTheyPartedData, startState } from './algorithm.js';

export type SceneCommit = { id: string; parent: string | null; time: number };
export type SceneName = { name: string; commit: string };
export type Distance = { name: string; steps: number; path: string[] };
export type Given = { parent: string; added: string[] };

export type WhereTheyPartedStep =
  | { kind: 'start' }
  | { kind: 'take'; commit: string; from: string | null; given: Given[] }
  | { kind: 'found'; commit: string; from: string | null; distances: Distance[]; taken: number };

export type WhereTheyPartedScene = {
  commits: SceneCommit[];
  names: SceneName[];
  /** commits 와 같은 차례. 커밋마다 가진 표시 (이름 차례). */
  marks: string[][];
  taken: string[];
  queue: string[];
  step: WhereTheyPartedStep;
};

function fail(what: string): never {
  throw new Error(`where-they-parted scene: ${what}`);
}

function strings(v: unknown, path: string): string[] {
  if (!Array.isArray(v)) fail(`${path} 가 배열이 아니다`);
  return v.map((x: unknown, i: number) => {
    if (typeof x !== 'string') fail(`${path}[${i}] 가 문자열이 아니다`);
    return x;
  });
}

function record(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) fail(`${path} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(`${path} 가 문자열이 아니다`);
  return v;
}

/** 줄의 커밋이 모두 바탕에 있는지 하나씩 대조한다 — 없으면 던진다 (C6). */
function queueOf(scene: WhereTheyPartedScene, v: unknown, path: string): string[] {
  const q = strings(v, path);
  q.forEach((id, i) => indexOf(scene, id, `${path}[${i}]`));
  return q;
}

function indexOf(scene: WhereTheyPartedScene, id: string, path: string): number {
  const i = scene.commits.findIndex((c) => c.id === id);
  if (i < 0) fail(`${path} — 없는 커밋 ${id}`);
  return i;
}

export const whereTheyPartedScene: ScenePlan<WhereTheyPartedScene> = {
  initial(initialData: unknown): WhereTheyPartedScene {
    const data = readWhereTheyPartedData(initialData);
    const { marks, line } = startState(data.commits, data.names);
    return {
      commits: data.commits.map((c) => ({ id: c.id, parent: c.parents[0] ?? null, time: c.time })),
      names: data.names.map((n) => ({ name: n.name, commit: n.commit })),
      marks: data.commits.map((c) => [...(marks.get(c.id) ?? fail(`표시 없음 ${c.id}`))]),
      taken: [],
      queue: [...line],
      step: { kind: 'start' },
    };
  },

  reduce(scene: WhereTheyPartedScene, event: FacetRuntimeEvent): WhereTheyPartedScene {
    const p = record(event.payload, `${event.type}.payload`);
    const from = scene.taken.length > 0 ? scene.taken[scene.taken.length - 1]! : null;

    if (event.type === 'take') {
      const commit = str(p.commit, 'take.payload.commit');
      indexOf(scene, commit, 'take.payload.commit');
      if (!Array.isArray(p.given)) fail('take.payload.given 가 배열이 아니다');
      const marks = scene.marks.map((m) => [...m]);
      const given: Given[] = p.given.map((g: unknown, i: number) => {
        const r = record(g, `take.payload.given[${i}]`);
        const parent = str(r.parent, `take.payload.given[${i}].parent`);
        marks[indexOf(scene, parent, `take.payload.given[${i}].parent`)] = strings(r.has, `take.payload.given[${i}].has`);
        return { parent, added: strings(r.added, `take.payload.given[${i}].added`) };
      });
      return {
        commits: scene.commits,
        names: scene.names,
        marks,
        taken: [...scene.taken, commit],
        queue: queueOf(scene, p.queue, 'take.payload.queue'),
        step: { kind: 'take', commit, from, given },
      };
    }

    if (event.type === 'found') {
      const commit = str(p.commit, 'found.payload.commit');
      indexOf(scene, commit, 'found.payload.commit');
      if (!Array.isArray(p.distances)) fail('found.payload.distances 가 배열이 아니다');
      const distances: Distance[] = p.distances.map((d: unknown, i: number) => {
        const r = record(d, `found.payload.distances[${i}]`);
        if (typeof r.steps !== 'number') fail(`found.payload.distances[${i}].steps 가 수가 아니다`);
        return {
          name: str(r.name, `found.payload.distances[${i}].name`),
          steps: r.steps,
          path: strings(r.path, `found.payload.distances[${i}].path`),
        };
      });
      if (typeof p.taken !== 'number') fail('found.payload.taken 가 수가 아니다');
      return {
        commits: scene.commits,
        names: scene.names,
        marks: scene.marks.map((m) => [...m]),
        taken: [...scene.taken, commit],
        queue: queueOf(scene, p.queue, 'found.payload.queue'),
        step: { kind: 'found', commit, from, distances, taken: p.taken },
      };
    }

    return fail(`모르는 이벤트 ${event.type}`);
  },
};
