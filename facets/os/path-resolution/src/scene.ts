/**
 * path-resolution 장면.
 *
 * 바탕 — 루트 번호 · 경로 마디 · 디렉터리 목록 (initialData 에서 베낀다. 걸음 0 이 이것이다)
 * 자취 — 내려간 걸음들 (`descend` 마다 하나)
 * 이번 걸음 — 방금 내려간 마디의 자리
 *
 * 장면은 셈을 다시 돌리지 않는다. 견준 수 · 닿은 번호 · 종류 · 합은 알고리즘이 payload 로 준다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneEntry = { name: string; inode: number };
export type SceneDir = { inode: number; entries: SceneEntry[] };

export type Descent = {
  seg: number;
  dir: number;
  compared: number;
  found: number;
  kind: 'dir' | 'file';
  total: number;
  dirs: number;
};

export type PathResolutionScene = {
  root: number;
  path: string[];
  dirs: SceneDir[];
  trail: Descent[];
  step: { kind: 'descend'; seg: number } | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readEntries(raw: unknown, where: string): SceneEntry[] {
  if (!Array.isArray(raw)) throw new Error(`pathResolutionScene: ${where} 의 entries 가 배열이 아니다`);
  return raw.map((e, i) => {
    if (!isRecord(e) || typeof e.name !== 'string' || typeof e.inode !== 'number') {
      throw new Error(`pathResolutionScene: ${where} 의 항목 ${i} 모양을 모른다`);
    }
    return { name: e.name, inode: e.inode };
  });
}

function readNumber(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`pathResolutionScene: descend 의 ${key} 가 수가 아니다`);
  return v;
}

export const pathResolutionScene: ScenePlan<PathResolutionScene> = {
  initial(initialData: unknown): PathResolutionScene {
    if (!isRecord(initialData)) throw new Error('pathResolutionScene: initialData 가 없다');
    const { root, path, dirs } = initialData;
    if (typeof root !== 'number') throw new Error('pathResolutionScene: root 가 수가 아니다');
    if (!Array.isArray(path) || !path.every((s): s is string => typeof s === 'string')) {
      throw new Error('pathResolutionScene: path 가 문자열 배열이 아니다');
    }
    if (!Array.isArray(dirs)) throw new Error('pathResolutionScene: dirs 가 배열이 아니다');
    return {
      root,
      path: [...path],
      dirs: dirs.map((d, i) => {
        if (!isRecord(d) || typeof d.inode !== 'number') {
          throw new Error(`pathResolutionScene: 디렉터리 ${i} 모양을 모른다`);
        }
        return { inode: d.inode, entries: readEntries(d.entries, `디렉터리 ${d.inode}`) };
      }),
      trail: [],
      step: null,
    };
  },

  reduce(scene: PathResolutionScene, event: FacetRuntimeEvent): PathResolutionScene {
    if (event.type !== 'descend') return scene;
    const p = event.payload;
    if (!isRecord(p)) throw new Error('pathResolutionScene: descend 에 payload 가 없다');
    const kind = p.kind;
    if (kind !== 'dir' && kind !== 'file') throw new Error('pathResolutionScene: descend 의 kind 를 모른다');
    const d: Descent = {
      seg: readNumber(p, 'seg'),
      dir: readNumber(p, 'dir'),
      compared: readNumber(p, 'compared'),
      found: readNumber(p, 'found'),
      kind,
      total: readNumber(p, 'total'),
      dirs: readNumber(p, 'dirs'),
    };
    return { ...scene, trail: [...scene.trail, d], step: { kind: 'descend', seg: d.seg } };
  },
};
