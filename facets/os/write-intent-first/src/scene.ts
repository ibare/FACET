/**
 * 저널 선기록의 장면.
 *
 * 바탕 — 바꿀 블록들과 묶음 번호 (initialData 에서 베낀다. 걸음 0 이 이것으로 선다)
 * 자취 — 저널에 쌓인 기록, 제자리 블록의 상태, 쓰기 수
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readWriteIntentFirstData } from './algorithm.js';

export type JournalEntry =
  | { kind: 'begin'; tx: number; write: number }
  | { kind: 'block'; block: string; write: number }
  | { kind: 'end'; tx: number; write: number };

export type HomeBlock = { block: string; state: 'old' | 'new'; write: number | null };

export type WriteIntentFirstStep =
  | { kind: 'start'; changed: number }
  | { kind: 'begin'; tx: number }
  | { kind: 'block'; block: string }
  | { kind: 'end'; tx: number }
  | { kind: 'home'; block: string; slot: number }
  | { kind: 'clear'; tx: number; home: number; was: JournalEntry[] };

export type WriteIntentFirstScene = {
  /** 바탕: 바꿀 블록, 쓰는 차례대로 */
  blocks: string[];
  /** 바탕: 묶음 번호 */
  tx: number;
  /** 저널에 지금 남은 기록 */
  journal: JournalEntry[];
  /** 제자리 블록, blocks 와 같은 차례 */
  home: HomeBlock[];
  journalWrites: number;
  homeWrites: number;
  /** 묶음이 비워졌는가 */
  cleared: boolean;
  step: WriteIntentFirstStep;
};

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`write-intent-first: ${event.type} 에 payload 가 없다`);
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`write-intent-first: ${type}.${key} 가 정수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string, type: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`write-intent-first: ${type}.${key} 가 문자열이 아니다`);
  return v;
}

export const writeIntentFirstScene: ScenePlan<WriteIntentFirstScene> = {
  initial(initialData: unknown): WriteIntentFirstScene {
    const d = readWriteIntentFirstData(initialData);
    return {
      blocks: [...d.blocks],
      tx: d.tx,
      journal: [],
      home: d.blocks.map((block) => ({ block, state: 'old', write: null })),
      journalWrites: 0,
      homeWrites: 0,
      cleared: false,
      step: { kind: 'start', changed: d.blocks.length },
    };
  },

  reduce(scene: WriteIntentFirstScene, event: FacetRuntimeEvent): WriteIntentFirstScene {
    switch (event.type) {
      case 'journal-begin': {
        const p = payloadOf(event);
        const tx = num(p, 'tx', event.type);
        const write = num(p, 'write', event.type);
        return {
          ...scene,
          journal: [...scene.journal, { kind: 'begin', tx, write }],
          journalWrites: scene.journalWrites + 1,
          step: { kind: 'begin', tx },
        };
      }
      case 'journal-block': {
        const p = payloadOf(event);
        const block = str(p, 'block', event.type);
        const write = num(p, 'write', event.type);
        if (!scene.blocks.includes(block)) throw new Error(`write-intent-first: 모르는 블록 ${block}`);
        return {
          ...scene,
          journal: [...scene.journal, { kind: 'block', block, write }],
          journalWrites: scene.journalWrites + 1,
          step: { kind: 'block', block },
        };
      }
      case 'journal-end': {
        const p = payloadOf(event);
        const tx = num(p, 'tx', event.type);
        const write = num(p, 'write', event.type);
        return {
          ...scene,
          journal: [...scene.journal, { kind: 'end', tx, write }],
          journalWrites: scene.journalWrites + 1,
          step: { kind: 'end', tx },
        };
      }
      case 'home-write': {
        const p = payloadOf(event);
        const block = str(p, 'block', event.type);
        const slot = num(p, 'slot', event.type);
        const write = num(p, 'write', event.type);
        const src = scene.journal[slot];
        if (src === undefined || src.kind !== 'block' || src.block !== block) {
          throw new Error(`write-intent-first: 저널 자리 ${slot} 에 ${block} 가 없다`);
        }
        const at = scene.home.findIndex((h) => h.block === block);
        if (at < 0) throw new Error(`write-intent-first: 제자리에 없는 블록 ${block}`);
        return {
          ...scene,
          home: scene.home.map((h, i) => (i === at ? { block, state: 'new', write } : { ...h })),
          homeWrites: scene.homeWrites + 1,
          step: { kind: 'home', block, slot },
        };
      }
      case 'journal-clear': {
        const p = payloadOf(event);
        const tx = num(p, 'tx', event.type);
        const home = num(p, 'home', event.type);
        return {
          ...scene,
          journal: [],
          cleared: true,
          step: { kind: 'clear', tx, home, was: scene.journal.map((e) => ({ ...e })) },
        };
      }
      default:
        throw new Error(`write-intent-first: 모르는 이벤트 ${event.type}`);
    }
  },
};
