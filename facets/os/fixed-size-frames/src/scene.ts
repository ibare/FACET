/**
 * fixed-size-frames 장면.
 *
 * 바탕  — 칸 수 · 칸 크기 · 칸마다 주인(없으면 null) · 실을 프로세스 (initialData 에서 베낌)
 * 자취  — 잘린 조각들 (cut 이 한 번 정함) · 칸에 들어간 페이지들 (place 가 쌓음)
 * 이번 걸음 — step
 *
 * 셈(자르기 · 빈 칸 고르기)은 알고리즘이 한다. 장면은 이벤트만 잇는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export interface FramePiece {
  page: number;
  loKib: number;
  hiKib: number;
}

export type FixedSizeFramesStep =
  | { kind: 'start' }
  | { kind: 'cut' }
  | { kind: 'place'; page: number; frame: number };

export interface FixedSizeFramesScene {
  frameCount: number;
  pageKib: number;
  /** 칸마다 이미 쥔 다른 프로세스 id, 비었으면 null */
  owners: (string | null)[];
  processId: string;
  sizeKib: number;
  pieces: FramePiece[];
  /** 들어간 차례대로 */
  placed: { page: number; frame: number }[];
  step: FixedSizeFramesStep;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function int(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`fixed-size-frames 장면: ${what} 이 정수가 아니다`);
  }
  return v;
}

export function readSceneBase(initialData: unknown): Omit<FixedSizeFramesScene, 'pieces' | 'placed' | 'step'> {
  if (!isRecord(initialData)) throw new Error('fixed-size-frames 장면: initialData 가 없다');
  const frameCount = int(initialData.frameCount, 'frameCount');
  const pageKib = int(initialData.pageKib, 'pageKib');
  const proc = initialData.process;
  if (!isRecord(proc) || typeof proc.id !== 'string') {
    throw new Error('fixed-size-frames 장면: process 가 없다');
  }
  const sizeKib = int(proc.sizeKib, 'process.sizeKib');
  const owners: (string | null)[] = [];
  for (let f = 0; f < frameCount; f += 1) owners.push(null);
  const occ = initialData.occupied;
  if (!Array.isArray(occ)) throw new Error('fixed-size-frames 장면: occupied 가 배열이 아니다');
  for (const o of occ) {
    if (!isRecord(o) || typeof o.owner !== 'string') {
      throw new Error('fixed-size-frames 장면: occupied 항목 모양이 틀렸다');
    }
    const frame = int(o.frame, 'occupied.frame');
    if (frame < 0 || frame >= frameCount) {
      throw new Error(`fixed-size-frames 장면: 찬 칸 ${frame} 이 범위 밖이다`);
    }
    owners[frame] = o.owner;
  }
  return { frameCount, pageKib, owners, processId: proc.id, sizeKib };
}

export const fixedSizeFramesScene: ScenePlan<FixedSizeFramesScene> = {
  initial(initialData: unknown): FixedSizeFramesScene {
    return { ...readSceneBase(initialData), pieces: [], placed: [], step: { kind: 'start' } };
  },

  reduce(scene: FixedSizeFramesScene, event: FacetRuntimeEvent): FixedSizeFramesScene {
    const p = event.payload;
    if (event.type === 'cut') {
      if (!isRecord(p) || !Array.isArray(p.pieces)) {
        throw new Error('fixed-size-frames 장면: cut 의 pieces 가 없다');
      }
      const pieces: FramePiece[] = p.pieces.map((raw: unknown) => {
        if (!isRecord(raw)) throw new Error('fixed-size-frames 장면: 조각 모양이 틀렸다');
        return {
          page: int(raw.page, 'page'),
          loKib: int(raw.loKib, 'loKib'),
          hiKib: int(raw.hiKib, 'hiKib'),
        };
      });
      return { ...scene, owners: [...scene.owners], pieces, placed: [], step: { kind: 'cut' } };
    }
    if (event.type === 'place') {
      if (!isRecord(p)) throw new Error('fixed-size-frames 장면: place 의 payload 가 없다');
      const page = int(p.page, 'page');
      const frame = int(p.frame, 'frame');
      if (!scene.pieces.some((x) => x.page === page)) {
        throw new Error(`fixed-size-frames 장면: 잘리지 않은 페이지 ${page}`);
      }
      return {
        ...scene,
        owners: [...scene.owners],
        pieces: scene.pieces.map((x) => ({ ...x })),
        placed: [...scene.placed.map((x) => ({ ...x })), { page, frame }],
        step: { kind: 'place', page, frame },
      };
    }
    return scene;
  },
};
