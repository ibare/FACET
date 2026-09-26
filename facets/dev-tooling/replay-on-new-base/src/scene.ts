/**
 * replay-on-new-base 장면.
 *
 * 바탕  — onto · branch 이름 (init 이 한 번 정한다)
 * 자취  — 커밋(옛 것은 그대로, 새 것이 뒤에 붙는다) · 이름 · 다시 놓을 목록
 * 이번 걸음 — step
 *
 * 해시 셈은 알고리즘의 것을 부른다 (hashCommits). 새 해시는 replay 이벤트가 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { hashCommits, readData, walkBack, type Commit, type NameSpec } from './algorithm.js';

export type ReplayStep =
  | { kind: 'start' }
  | { kind: 'plan' }
  | { kind: 'replay'; from: string; to: string }
  | { kind: 'move'; name: string; from: string; to: string };

export type ReplayOnNewBaseScene = {
  onto: string;
  branch: string;
  /** onto 쪽에 처음부터 있던 커밋 (윗줄에 선다) */
  ontoSide: string[];
  commits: Commit[];
  names: NameSpec[];
  todo: string[];
  step: ReplayStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function field(payload: unknown, name: string, type: string): string {
  if (!isRecord(payload)) throw new Error(`replay-on-new-base 장면: ${type} 의 payload 가 객체가 아니다`);
  const v = payload[name];
  if (typeof v !== 'string' || v === '') {
    throw new Error(`replay-on-new-base 장면: ${type}.payload.${name} 가 문자열이 아니다`);
  }
  return v;
}

export const replayOnNewBaseScene: ScenePlan<ReplayOnNewBaseScene> = {
  initial(initialData: unknown): ReplayOnNewBaseScene {
    const data = readData(initialData);
    const commits = hashCommits(data.commits);
    const ontoName = data.names.find((n) => n.name === data.rebase.onto);
    if (!ontoName) throw new Error(`replay-on-new-base 장면: 이름 ${data.rebase.onto} 가 없다`);
    return {
      onto: data.rebase.onto,
      branch: data.rebase.branch,
      ontoSide: walkBack(commits, ontoName.commit),
      commits,
      names: data.names.map((n) => ({ name: n.name, commit: n.commit })),
      todo: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: ReplayOnNewBaseScene, event: FacetRuntimeEvent): ReplayOnNewBaseScene {
    switch (event.type) {
      case 'plan': {
        const p = event.payload;
        if (!isRecord(p) || !Array.isArray(p['todo'])) {
          throw new Error('replay-on-new-base 장면: plan.payload.todo 가 배열이 아니다');
        }
        const todo = p['todo'].map((v, i) => {
          if (typeof v !== 'string') throw new Error(`replay-on-new-base 장면: plan.payload.todo[${i}] 가 문자열이 아니다`);
          if (!scene.commits.some((c) => c.id === v)) {
            throw new Error(`replay-on-new-base 장면: plan.payload.todo[${i}] 의 커밋 ${v} 가 없다`);
          }
          return v;
        });
        return { ...scene, todo, step: { kind: 'plan' } };
      }
      case 'replay': {
        const commit = field(event.payload, 'commit', 'replay');
        const copy = field(event.payload, 'copy', 'replay');
        const parent = field(event.payload, 'parent', 'replay');
        const hash = field(event.payload, 'hash', 'replay');
        const origin = scene.commits.find((c) => c.id === commit);
        if (!origin) throw new Error(`replay-on-new-base 장면: replay 의 커밋 ${commit} 가 없다`);
        if (!scene.commits.some((c) => c.id === parent)) {
          throw new Error(`replay-on-new-base 장면: replay 의 부모 ${parent} 가 없다`);
        }
        if (scene.commits.some((c) => c.id === copy)) {
          throw new Error(`replay-on-new-base 장면: replay.payload.copy 의 새 커밋 이름 ${copy} 가 이미 있다`);
        }
        const made: Commit = { id: copy, key: origin.key, parents: [parent], hash, origin: commit };
        return { ...scene, commits: [...scene.commits, made], step: { kind: 'replay', from: commit, to: copy } };
      }
      case 'move': {
        const name = field(event.payload, 'name', 'move');
        const from = field(event.payload, 'from', 'move');
        const to = field(event.payload, 'to', 'move');
        if (!scene.names.some((n) => n.name === name && n.commit === from)) {
          throw new Error(`replay-on-new-base 장면: move 의 이름 ${name} 가 ${from} 를 가리키지 않는다`);
        }
        const names = scene.names.map((n) => (n.name === name ? { name, commit: to } : { ...n }));
        return { ...scene, names, step: { kind: 'move', name, from, to } };
      }
      default:
        throw new Error(`replay-on-new-base 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
