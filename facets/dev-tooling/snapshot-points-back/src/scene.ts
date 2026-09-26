/**
 * snapshot-points-back 의 장면.
 *
 * 바탕 — 커밋 목록(글자 · 변경 식별자 · 부모 글자). initialData 에서 베낀다.
 * 자취 — 커밋마다 적힌 부모 해시와 셈해진 해시. 커밋 차례와 같은 자리의 배열이다.
 * 이번 걸음 — 무엇이 일어났는가 (`start` · `write` · `hash`).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readCommits, type SnapshotCommit } from './algorithm.js';

export type SnapshotStep =
  | { kind: 'start'; commit: number }
  | { kind: 'write'; commit: number; parent: number }
  | { kind: 'hash'; commit: number };

export type SnapshotScene = {
  commits: readonly SnapshotCommit[];
  /** 커밋 안에 `parent` 로 적힌 부모 해시. 아직이면 null */
  written: readonly (string | null)[];
  /** 셈해진 커밋 해시. 아직이면 null */
  hashes: readonly (string | null)[];
  step: SnapshotStep | null;
};

function field(payload: unknown, key: string): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('snapshot-points-back: payload 가 객체가 아니다');
  }
  const v = (payload as Record<string, unknown>)[key];
  if (typeof v !== 'string') throw new Error(`snapshot-points-back: payload.${key} 가 글자가 아니다`);
  return v;
}

function indexOf(scene: SnapshotScene, id: string): number {
  const i = scene.commits.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`snapshot-points-back: 없는 커밋 ${id}`);
  return i;
}

function replaced<T>(list: readonly T[], i: number, value: T): T[] {
  const out = list.slice();
  out[i] = value;
  return out;
}

export const snapshotPointsBackScene: ScenePlan<SnapshotScene> = {
  initial(initialData: unknown): SnapshotScene {
    const commits = readCommits(initialData).map((c) => ({ ...c }));
    return {
      commits,
      written: commits.map(() => null),
      hashes: commits.map(() => null),
      step: null,
    };
  },

  reduce(scene: SnapshotScene, event: FacetRuntimeEvent): SnapshotScene {
    if (event.type === 'init') {
      const i = indexOf(scene, field(event.payload, 'commit'));
      const hash = field(event.payload, 'hash');
      return { ...scene, hashes: replaced(scene.hashes, i, hash), step: { kind: 'start', commit: i } };
    }
    if (event.type === 'parent-written') {
      const i = indexOf(scene, field(event.payload, 'commit'));
      const p = indexOf(scene, field(event.payload, 'parent'));
      const parentHash = field(event.payload, 'parentHash');
      return {
        ...scene,
        written: replaced(scene.written, i, parentHash),
        step: { kind: 'write', commit: i, parent: p },
      };
    }
    if (event.type === 'hash-computed') {
      const i = indexOf(scene, field(event.payload, 'commit'));
      const hash = field(event.payload, 'hash');
      return { ...scene, hashes: replaced(scene.hashes, i, hash), step: { kind: 'hash', commit: i } };
    }
    throw new Error(`snapshot-points-back: 모르는 이벤트 ${event.type}`);
  },
};
