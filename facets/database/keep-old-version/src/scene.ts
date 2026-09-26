import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Version } from './algorithm.js';

/** 이번 걸음 — 무엇이 일어났는지 종류와 인자만. */
export type KeepOldVersionStep =
  | { kind: 'write'; tick: number; txn: string; value: number; index: number }
  | { kind: 'commit'; tick: number; txn: string; ended: number; started: number };

export type KeepOldVersionScene = {
  /** 바탕 — 줄 이름. */
  row: string;
  /** 자취 — 지금까지 쌓인 판 사슬 (붙은 차례). */
  versions: Version[];
  /** 지금 틱. 걸음 0 은 첫 사건 앞 틱. */
  tick: number;
  step: KeepOldVersionStep | null;
};

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`keep-old-version 장면: ${what} 이 수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`keep-old-version 장면: ${what} 이 글자가 아니다`);
  return v;
}

function tickOrNull(v: unknown, what: string): number | null {
  return v === null ? null : num(v, what);
}

function readChain(raw: unknown): Version[] {
  if (!Array.isArray(raw)) throw new Error('keep-old-version 장면: chain 이 배열이 아니다');
  return raw.map((item: unknown, i) => {
    if (typeof item !== 'object' || item === null) throw new Error(`keep-old-version 장면: chain[${i}] 이 객체가 아니다`);
    const o = item as Record<string, unknown>;
    return {
      value: num(o.value, `chain[${i}].value`),
      start: tickOrNull(o.start, `chain[${i}].start`),
      end: tickOrNull(o.end, `chain[${i}].end`),
      txn: o.txn === null ? null : str(o.txn, `chain[${i}].txn`),
    };
  });
}

function record(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`keep-old-version 장면: ${what} 이 객체가 아니다`);
  return v as Record<string, unknown>;
}

export const keepOldVersionScene: ScenePlan<KeepOldVersionScene> = {
  initial(initialData: unknown): KeepOldVersionScene {
    const d = record(initialData, 'initialData');
    const raw = d.versions;
    if (!Array.isArray(raw)) throw new Error('keep-old-version 장면: initialData.versions 가 배열이 아니다');
    const versions: Version[] = raw.map((item: unknown, i) => {
      const o = record(item, `versions[${i}]`);
      return {
        value: num(o.value, `versions[${i}].value`),
        start: num(o.start, `versions[${i}].start`),
        end: tickOrNull(o.end, `versions[${i}].end`),
        txn: null,
      };
    });
    return {
      row: str(d.row, 'initialData.row'),
      versions,
      tick: num(d.firstTick, 'initialData.firstTick') - 1,
      step: null,
    };
  },

  reduce(scene: KeepOldVersionScene, event: FacetRuntimeEvent): KeepOldVersionScene {
    if (event.type === 'write') {
      const p = record(event.payload, 'write payload');
      const tick = num(p.tick, 'write.tick');
      return {
        row: scene.row,
        versions: readChain(p.chain),
        tick,
        step: {
          kind: 'write',
          tick,
          txn: str(p.txn, 'write.txn'),
          value: num(p.value, 'write.value'),
          index: num(p.index, 'write.index'),
        },
      };
    }
    if (event.type === 'commit') {
      const p = record(event.payload, 'commit payload');
      const tick = num(p.tick, 'commit.tick');
      return {
        row: scene.row,
        versions: readChain(p.chain),
        tick,
        step: {
          kind: 'commit',
          tick,
          txn: str(p.txn, 'commit.txn'),
          ended: num(p.ended, 'commit.ended'),
          started: num(p.started, 'commit.started'),
        },
      };
    }
    return scene;
  },
};
