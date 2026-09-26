/**
 * unreachable-snapshot 장면.
 *
 * 바탕: 커밋(치운 뒤에도 자리 셈을 위해 그대로 둔다) · 처음 이름.
 * 자취: 지금 이름표 · 표시 · 멈춘 길 · 치운 커밋.
 * 이번 걸음: step — 지나간 자리에서 출발하는 운동을 위해 계기값(at · from · via)을 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readHistory, type HistoryCommit, type HistoryName } from './algorithm.js';

export type UnreachableMark = { name: string; commit: string; via: string | null };
export type UnreachableHalt = { name: string; from: string; at: string };

export type UnreachableStep =
  | { kind: 'start' }
  | { kind: 'delete'; name: string; at: string }
  | { kind: 'move'; name: string; from: string; to: string }
  | { kind: 'mark'; name: string; commit: string; via: string | null; halt: string | null }
  | { kind: 'sweep'; gone: string[] };

export type UnreachableScene = {
  commits: HistoryCommit[];
  names: HistoryName[];
  marks: UnreachableMark[];
  halts: UnreachableHalt[];
  gone: string[];
  step: UnreachableStep;
};

function field(event: FacetRuntimeEvent, key: string): unknown {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`unreachable-snapshot: ${event.type} 의 payload 가 객체가 아니다`);
  }
  return (p as Record<string, unknown>)[key];
}

function str(event: FacetRuntimeEvent, key: string): string {
  const v = field(event, key);
  if (typeof v !== 'string') throw new Error(`unreachable-snapshot: ${event.type}.payload.${key} 가 글자가 아니다`);
  return v;
}

function strOrNull(event: FacetRuntimeEvent, key: string): string | null {
  const v = field(event, key);
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`unreachable-snapshot: ${event.type}.payload.${key} 가 글자도 null 도 아니다`);
  return v;
}

function needCommit(scene: UnreachableScene, event: FacetRuntimeEvent, key: string, id: string): string {
  if (!scene.commits.some((c) => c.id === id)) {
    throw new Error(`unreachable-snapshot: ${event.type}.payload.${key} 의 커밋 ${id} 가 장면에 없다`);
  }
  return id;
}

function strList(event: FacetRuntimeEvent, key: string): string[] {
  const v = field(event, key);
  if (!Array.isArray(v)) throw new Error(`unreachable-snapshot: ${event.type}.payload.${key} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`unreachable-snapshot: ${event.type}.payload.${key}[${i}] 가 글자가 아니다`);
    return x;
  });
}

export const unreachableSnapshotScene: ScenePlan<UnreachableScene> = {
  initial(initialData: unknown): UnreachableScene {
    const h = readHistory(initialData);
    return {
      commits: h.commits.map((c) => ({ id: c.id, parents: [...c.parents] })),
      names: h.names.map((n) => ({ name: n.name, at: n.at })),
      marks: [],
      halts: [],
      gone: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: UnreachableScene, event: FacetRuntimeEvent): UnreachableScene {
    switch (event.type) {
      case 'delete-name': {
        const name = str(event, 'name');
        const at = needCommit(scene, event, 'at', str(event, 'at'));
        if (!scene.names.some((n) => n.name === name && n.at === at)) {
          throw new Error(`unreachable-snapshot: delete-name 의 이름 ${name} (커밋 ${at}) 가 장면에 없다`);
        }
        return {
          ...scene,
          names: scene.names.filter((n) => n.name !== name),
          step: { kind: 'delete', name, at },
        };
      }
      case 'move-name': {
        const name = str(event, 'name');
        const from = needCommit(scene, event, 'from', str(event, 'from'));
        const to = needCommit(scene, event, 'to', str(event, 'to'));
        if (!scene.names.some((n) => n.name === name)) {
          throw new Error(`unreachable-snapshot: move-name 의 이름 ${name} 가 장면에 없다`);
        }
        return {
          ...scene,
          names: scene.names.map((n) => (n.name === name ? { name, at: to } : n)),
          step: { kind: 'move', name, from, to },
        };
      }
      case 'mark': {
        const name = str(event, 'name');
        const commit = needCommit(scene, event, 'commit', str(event, 'commit'));
        const viaRaw = strOrNull(event, 'via');
        const via = viaRaw === null ? null : needCommit(scene, event, 'via', viaRaw);
        const haltRaw = strOrNull(event, 'halt');
        const halt = haltRaw === null ? null : needCommit(scene, event, 'halt', haltRaw);
        return {
          ...scene,
          marks: [...scene.marks, { name, commit, via }],
          halts: halt === null ? scene.halts : [...scene.halts, { name, from: commit, at: halt }],
          step: { kind: 'mark', name, commit, via, halt },
        };
      }
      case 'sweep': {
        const gone = strList(event, 'gone').map((id, i) => needCommit(scene, event, `gone[${i}]`, id));
        return { ...scene, gone, step: { kind: 'sweep', gone } };
      }
      default:
        throw new Error(`unreachable-snapshot: 모르는 이벤트 ${event.type}`);
    }
  },
};
