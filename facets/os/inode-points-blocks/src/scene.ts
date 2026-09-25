/**
 * inode-points-blocks 의 장면.
 *
 * - 바탕: 파일 이름, 디스크 블록의 주인 · 글자, inode 의 칸 (initialData 에서 `initial()` 이 한 번 세운다)
 * - 자취: 모인 글자 (칸 차례로 쌓인다)
 * - 이번 걸음: 처음 보이기, 또는 칸 하나를 짚어 블록 하나를 읽은 것
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { diskOf, readInodeData, type DiskBlock } from './algorithm.js';

export type InodeStep = { kind: 'show' } | { kind: 'read'; slot: number; block: number };

export type InodePointsBlocksScene = {
  /** 파일 이름 — 번역하지 않는 자료. */
  file: string;
  disk: DiskBlock[];
  slots: number[];
  gathered: string[];
  step: InodeStep;
};

export const inodePointsBlocksScene: ScenePlan<InodePointsBlocksScene> = {
  initial(initialData: unknown): InodePointsBlocksScene {
    const data = readInodeData(initialData);
    const disk = diskOf(data).map((b) => ({ owner: b.owner, letter: b.letter }));
    return { file: data.file, disk, slots: [...data.slots], gathered: [], step: { kind: 'show' } };
  },

  reduce(scene: InodePointsBlocksScene, event: FacetRuntimeEvent): InodePointsBlocksScene {
    if (event.type !== 'read') return scene;
    const p = event.payload;
    if (typeof p !== 'object' || p === null) throw new Error('inode-points-blocks: read 의 payload 가 없다');
    const slot = 'slot' in p ? p.slot : undefined;
    const block = 'block' in p ? p.block : undefined;
    const letter = 'letter' in p ? p.letter : undefined;
    if (typeof slot !== 'number' || typeof block !== 'number' || typeof letter !== 'string') {
      throw new Error('inode-points-blocks: read 의 payload 모양이 틀렸다');
    }
    if (slot !== scene.gathered.length) {
      throw new Error(`inode-points-blocks: 칸 ${slot} 가 차례를 벗어났다`);
    }
    if (scene.slots[slot] !== block) {
      throw new Error(`inode-points-blocks: 칸 ${slot} 에 적힌 번호가 ${block} 가 아니다`);
    }
    return {
      file: scene.file,
      disk: scene.disk,
      slots: scene.slots,
      gathered: [...scene.gathered, letter],
      step: { kind: 'read', slot, block },
    };
  },
};
