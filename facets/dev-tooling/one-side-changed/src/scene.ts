/**
 * one-side-changed 의 장면.
 *
 * - 바탕: 세 파일의 줄 (initialData 에서 베낀다)
 * - 자취: 결과로 옮겨 온 줄 — 어느 쪽의 몇 번째 줄인지
 * - 이번 걸음: 옮겨 간 덩이와, 옮기기 전 결과의 줄 수(계기값 `from`)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readFacetData, takenSide, type ChunkKind, type Side } from './algorithm';

export type SceneRange = readonly [number, number];

export interface ResultLine {
  side: Side;
  /** 그 쪽 파일의 줄 자리 (0 기반) */
  at: number;
}

export interface TakeStep {
  kind: ChunkKind;
  side: Side;
  base: SceneRange;
  ours: SceneRange;
  theirs: SceneRange;
  /** 옮기기 전 결과의 줄 수 — 이번에 옮겨 온 줄은 from 부터 */
  from: number;
}

export interface OneSideChangedScene {
  files: { base: readonly string[]; ours: readonly string[]; theirs: readonly string[] };
  result: readonly ResultLine[];
  step: TakeStep | null;
  /** 마지막 덩이까지 옮겼는가 */
  done: boolean;
}

function readRange(value: unknown, path: string, size: number): SceneRange {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`one-side-changed: ${path} 가 [from, to] 가 아니다`);
  const a: unknown = value[0];
  const b: unknown = value[1];
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isInteger(a) || !Number.isInteger(b)) {
    throw new Error(`one-side-changed: ${path} 가 정수 둘이 아니다`);
  }
  if (a < 0 || b < a || b > size) throw new Error(`one-side-changed: ${path} [${a}, ${b}] 가 파일 밖이다 (줄 ${size})`);
  return [a, b];
}

function readKind(value: unknown): ChunkKind {
  if (value === 'stable' || value === 'ours' || value === 'theirs' || value === 'same' || value === 'conflict') return value;
  throw new Error(`one-side-changed: take.payload.kind '${String(value)}'`);
}

export const oneSideChangedScene: ScenePlan<OneSideChangedScene> = {
  initial(initialData: unknown): OneSideChangedScene {
    const data = readFacetData(initialData);
    return {
      files: { base: [...data.base], ours: [...data.ours], theirs: [...data.theirs] },
      result: [],
      step: null,
      done: false,
    };
  },

  reduce(scene: OneSideChangedScene, event: FacetRuntimeEvent): OneSideChangedScene {
    if (event.type !== 'take') throw new Error(`one-side-changed: 모르는 이벤트 '${event.type}'`);
    const p = event.payload;
    if (typeof p !== 'object' || p === null) throw new Error('one-side-changed: take.payload 가 객체가 아니다');
    const r = p as Record<string, unknown>;
    const kind = readKind(r.kind);
    const side = takenSide(kind);
    const base = readRange(r.base, 'take.payload.base', scene.files.base.length);
    const ours = readRange(r.ours, 'take.payload.ours', scene.files.ours.length);
    const theirs = readRange(r.theirs, 'take.payload.theirs', scene.files.theirs.length);
    const index: unknown = r.index;
    const total: unknown = r.total;
    if (typeof index !== 'number' || typeof total !== 'number' || index < 0 || index >= total) {
      throw new Error('one-side-changed: take.payload.index · total 이 맞지 않다');
    }
    const range = side === 'base' ? base : side === 'ours' ? ours : theirs;
    const moved: ResultLine[] = [];
    for (let at = range[0]; at < range[1]; at += 1) moved.push({ side, at });
    return {
      files: scene.files,
      result: [...scene.result, ...moved],
      step: { kind, side, base, ours, theirs, from: scene.result.length },
      done: index === total - 1,
    };
  },
};
