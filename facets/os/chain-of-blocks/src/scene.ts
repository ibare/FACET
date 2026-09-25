/**
 * chain-of-blocks 장면 — 이벤트를 잇기만 한다. 사슬을 다시 따라가지 않는다.
 *
 * - 바탕: FAT 칸 값 · 디렉터리 항목 · 따라갈 파일 (initial 이 initialData 에서 베낀다)
 * - 자취: 지금까지 읽은 칸의 차례 `path` · 사슬이 끝났는가 `ended`
 * - 이번 걸음: `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { DirectoryEntry, FatValue } from './algorithm.js';

export type ChainStep =
  | { kind: 'ready' }
  | { kind: 'start'; file: string; first: number }
  | {
      kind: 'read';
      piece: number;
      block: number;
      next: number | 'END';
      readBefore: number;
      /** 이번에 건너오기 전의 자리 — 앞 칸 번호, 또는 디렉터리 */
      from: number | 'dir';
    };

export interface ChainScene {
  fat: FatValue[];
  entries: DirectoryEntry[];
  follow: string;
  /** 디렉터리에서 첫 번호를 얻었는가 */
  started: boolean;
  path: number[];
  ended: boolean;
  step: ChainStep;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function copyFat(raw: unknown): FatValue[] {
  if (!Array.isArray(raw)) throw new Error('chain-of-blocks: fat 이 배열이 아니다');
  return raw.map((v, i): FatValue => {
    if (v === null || v === 'END') return v;
    if (typeof v === 'number' && Number.isInteger(v)) return v;
    throw new Error(`chain-of-blocks: fat[${i}] 의 모르는 값 ${String(v)}`);
  });
}

function copyEntries(raw: unknown): DirectoryEntry[] {
  if (!Array.isArray(raw)) throw new Error('chain-of-blocks: directory 가 배열이 아니다');
  return raw.map((e, i) => {
    if (!isRecord(e) || typeof e.id !== 'string' || typeof e.first !== 'number') {
      throw new Error(`chain-of-blocks: directory[${i}] 의 모양이 틀렸다`);
    }
    return { id: e.id, first: e.first };
  });
}

export const chainOfBlocksScene: ScenePlan<ChainScene> = {
  initial(initialData: unknown): ChainScene {
    if (!isRecord(initialData)) throw new Error('chain-of-blocks: initialData 가 없다');
    const follow = initialData.follow;
    if (typeof follow !== 'string') throw new Error('chain-of-blocks: follow 가 없다');
    return {
      fat: copyFat(initialData.fat),
      entries: copyEntries(initialData.directory),
      follow,
      started: false,
      path: [],
      ended: false,
      step: { kind: 'ready' },
    };
  },

  reduce(scene: ChainScene, event: FacetRuntimeEvent): ChainScene {
    const p: unknown = event.payload;
    if (event.type === 'start') {
      if (!isRecord(p) || typeof p.file !== 'string' || typeof p.first !== 'number') {
        throw new Error('chain-of-blocks: start 의 payload 가 틀렸다');
      }
      return { ...scene, started: true, step: { kind: 'start', file: p.file, first: p.first } };
    }
    if (event.type === 'read') {
      if (
        !isRecord(p) ||
        typeof p.piece !== 'number' ||
        typeof p.block !== 'number' ||
        typeof p.readBefore !== 'number' ||
        !(typeof p.next === 'number' || p.next === 'END')
      ) {
        throw new Error('chain-of-blocks: read 의 payload 가 틀렸다');
      }
      const last = scene.path[scene.path.length - 1];
      return {
        ...scene,
        path: [...scene.path, p.block],
        ended: p.next === 'END',
        step: {
          kind: 'read',
          piece: p.piece,
          block: p.block,
          next: p.next,
          readBefore: p.readBefore,
          from: last === undefined ? 'dir' : last,
        },
      };
    }
    return scene;
  },
};
