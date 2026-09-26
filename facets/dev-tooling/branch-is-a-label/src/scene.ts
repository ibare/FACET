/**
 * branch-is-a-label 의 장면.
 *
 * 바탕: 없다 — 처음 이력은 걸음 0 의 자취로 시작한다.
 * 자취: 커밋(늘기만 한다) · 이름(각자 커밋 하나를 가리킨다) · HEAD 가 가리키는 이름.
 * 이번 걸음(step): 무엇이 일어났는지와 그 계기값(`from`) — 그림이 어디서부터 흐르게 할지 고르는 데 쓴다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { parseHistoryData, startState } from './algorithm.js';

export type BranchScene = {
  commits: { id: string; parent: string | null }[];
  names: { name: string; commit: string }[];
  head: string;
  step:
    | null
    | { kind: 'name-create'; name: string; commit: string }
    | { kind: 'head-move'; from: string; to: string }
    | { kind: 'commit'; commit: string; parent: string; name: string; from: string };
};

function field(payload: unknown, key: string, event: string): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`branch-is-a-label 장면: ${event} 의 payload 가 객체가 아니다`);
  }
  const v = (payload as Record<string, unknown>)[key];
  if (typeof v !== 'string' || v === '') {
    throw new Error(`branch-is-a-label 장면: ${event}.payload.${key} 가 글이 아니다`);
  }
  return v;
}

export const branchIsALabelScene: ScenePlan<BranchScene> = {
  initial(initialData: unknown): BranchScene {
    const s = startState(parseHistoryData(initialData));
    return {
      commits: s.commits.map((c) => ({ ...c })),
      names: s.names.map((n) => ({ ...n })),
      head: s.head,
      step: null,
    };
  },

  reduce(scene: BranchScene, event: FacetRuntimeEvent): BranchScene {
    const commits = scene.commits.map((c) => ({ ...c }));
    const names = scene.names.map((n) => ({ ...n }));
    if (event.type === 'name-create') {
      const name = field(event.payload, 'name', event.type);
      const commit = field(event.payload, 'commit', event.type);
      if (names.some((n) => n.name === name)) throw new Error(`branch-is-a-label 장면: 이름 ${name} 이 이미 있다`);
      if (!commits.some((c) => c.id === commit)) throw new Error(`branch-is-a-label 장면: name-create.commit ${commit} 이 없는 커밋이다`);
      names.push({ name, commit });
      return { commits, names, head: scene.head, step: { kind: 'name-create', name, commit } };
    }
    if (event.type === 'head-move') {
      const from = field(event.payload, 'from', event.type);
      const to = field(event.payload, 'to', event.type);
      if (from !== scene.head) throw new Error(`branch-is-a-label 장면: head-move.from ${from} 이 지금 HEAD ${scene.head} 와 다르다`);
      if (!names.some((n) => n.name === to)) throw new Error(`branch-is-a-label 장면: 이름 ${to} 이 없다`);
      return { commits, names, head: to, step: { kind: 'head-move', from, to } };
    }
    if (event.type === 'commit') {
      const commit = field(event.payload, 'commit', event.type);
      const parent = field(event.payload, 'parent', event.type);
      const name = field(event.payload, 'name', event.type);
      const from = field(event.payload, 'from', event.type);
      const moved = names.find((n) => n.name === name);
      if (moved === undefined) throw new Error(`branch-is-a-label 장면: 옮길 이름 ${name} 이 없다`);
      if (name !== scene.head) throw new Error(`branch-is-a-label 장면: commit.name ${name} 이 지금 HEAD ${scene.head} 와 다르다`);
      if (!commits.some((c) => c.id === parent)) throw new Error(`branch-is-a-label 장면: commit.parent ${parent} 가 없는 커밋이다`);
      if (!commits.some((c) => c.id === from)) throw new Error(`branch-is-a-label 장면: commit.from ${from} 이 없는 커밋이다`);
      if (from !== moved.commit || parent !== moved.commit) {
        throw new Error(`branch-is-a-label 장면: commit 의 parent ${parent} · from ${from} 이 이름 ${name} 의 지금 커밋 ${moved.commit} 과 다르다`);
      }
      if (commits.some((c) => c.id === commit)) throw new Error(`branch-is-a-label 장면: 커밋 ${commit} 이 이미 있다`);
      commits.push({ id: commit, parent });
      moved.commit = commit;
      return { commits, names, head: scene.head, step: { kind: 'commit', commit, parent, name, from } };
    }
    throw new Error(`branch-is-a-label 장면: 모르는 이벤트 ${event.type}`);
  },
};
