import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { MergedFrom, MergedLine, Side } from './algorithm.js';

/** 한 쪽이 손댄 자리 — base 줄과 그쪽 파일의 짝 없는 줄 (0 기반). */
export type Touch = { base: number[]; own: number[] };

export type BothTouchedSameLineScene = {
  /** 바탕 — 세 파일. */
  base: string[];
  ours: string[];
  theirs: string[];
  /** 자취 — 걸음이 쌓는 것. */
  touched: { ours: Touch | null; theirs: Touch | null };
  overlap: { lines: number[]; versions: number } | null;
  result: { lines: MergedLine[]; conflicts: number } | null;
  /** 이번 걸음. */
  step: 'start' | 'ours' | 'theirs' | 'overlap' | 'merged';
};

function strings(v: unknown, path: string): string[] {
  if (!Array.isArray(v) || !v.every((x): x is string => typeof x === 'string')) {
    throw new Error(`${path} 는 글자 배열이어야 한다`);
  }
  return [...v];
}

function ints(v: unknown, path: string): number[] {
  if (!Array.isArray(v) || !v.every((x): x is number => typeof x === 'number' && Number.isInteger(x))) {
    throw new Error(`${path} 는 정수 배열이어야 한다`);
  }
  return [...v];
}

function record(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`${path} 는 객체여야 한다`);
  return v as Record<string, unknown>;
}

const FROMS: readonly MergedFrom[] = ['base', 'ours', 'theirs', 'open', 'mid', 'close'];

function mergedLines(v: unknown, path: string): MergedLine[] {
  if (!Array.isArray(v)) throw new Error(`${path} 는 배열이어야 한다`);
  return v.map((x, k) => {
    const r = record(x, `${path}[${k}]`);
    const text = r.text;
    const from = r.from;
    const row = r.row;
    if (typeof text !== 'string') throw new Error(`${path}[${k}].text 는 글자여야 한다`);
    const hit = FROMS.find((f) => f === from);
    if (hit === undefined) throw new Error(`${path}[${k}].from 을 모른다: ${String(from)}`);
    if (typeof row !== 'number' || !Number.isInteger(row)) throw new Error(`${path}[${k}].row 는 정수여야 한다`);
    return { text, from: hit, row };
  });
}

export const bothTouchedSameLineScene: ScenePlan<BothTouchedSameLineScene> = {
  initial(initialData: unknown): BothTouchedSameLineScene {
    const d = record(initialData, 'initialData');
    return {
      base: strings(d.base, 'initialData.base'),
      ours: strings(d.ours, 'initialData.ours'),
      theirs: strings(d.theirs, 'initialData.theirs'),
      touched: { ours: null, theirs: null },
      overlap: null,
      result: null,
      step: 'start',
    };
  },

  reduce(scene: BothTouchedSameLineScene, event: FacetRuntimeEvent): BothTouchedSameLineScene {
    const p = record(event.payload, `${event.type}.payload`);
    if (event.type === 'touched') {
      const side = p.side;
      if (side !== 'ours' && side !== 'theirs') throw new Error(`touched.payload.side 를 모른다: ${String(side)}`);
      const touch: Touch = { base: ints(p.base, 'touched.payload.base'), own: ints(p.own, 'touched.payload.own') };
      const s: Side = side;
      return {
        ...scene,
        touched: s === 'ours' ? { ...scene.touched, ours: touch } : { ...scene.touched, theirs: touch },
        step: s,
      };
    }
    if (event.type === 'overlap') {
      const versions = p.versions;
      if (typeof versions !== 'number') throw new Error('overlap.payload.versions 는 수여야 한다');
      return { ...scene, overlap: { lines: ints(p.lines, 'overlap.payload.lines'), versions }, step: 'overlap' };
    }
    if (event.type === 'merged') {
      const conflicts = p.conflicts;
      if (typeof conflicts !== 'number') throw new Error('merged.payload.conflicts 는 수여야 한다');
      return {
        ...scene,
        result: { lines: mergedLines(p.lines, 'merged.payload.lines'), conflicts },
        step: 'merged',
      };
    }
    throw new Error(`모르는 이벤트: ${event.type}`);
  },
};
