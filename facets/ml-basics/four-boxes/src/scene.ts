/**
 * four-boxes 장면.
 *
 * 바탕 — 항목 열 (데이터 차례). 자취 — 떨어진 항목과 그 칸 · 쌓인 자리, 네 칸의 수.
 * 이번 걸음 — 방금 떨어진 항목 (`was` 는 떨어지기 전 그 칸의 수).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  BOX_KEYS,
  boxOf,
  narrowFourBoxesData,
  type BinaryClass,
  type BoxCounts,
  type BoxKey,
  type FourBoxesItem,
  type FourBoxesSummary,
} from './algorithm.js';

export type FourBoxesLanded = { id: string; box: BoxKey; slot: number };

export type FourBoxesStep = {
  kind: 'drop';
  index: number;
  id: string;
  actual: BinaryClass;
  predicted: BinaryClass;
  box: BoxKey;
  was: number;
};

export type FourBoxesScene = {
  /** 바탕 — 데이터 차례의 항목 */
  items: FourBoxesItem[];
  /** 네 칸의 수. silent init 이 연다 */
  counts: BoxCounts | null;
  /** 자취 — 떨어진 차례대로 */
  landed: FourBoxesLanded[];
  step: FourBoxesStep | null;
  summary: FourBoxesSummary | null;
};

function field(rec: Record<string, unknown>, key: string, path: string): unknown {
  if (!(key in rec)) throw new Error(`four-boxes 장면: ${path}.${key} 가 없다`);
  return rec[key];
}

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`four-boxes 장면: ${path} 가 수가 아니다`);
  }
  return value;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`four-boxes 장면: ${path} 가 객체가 아니다`);
  }
  return value as Record<string, unknown>;
}

function readCounts(value: unknown, path: string): BoxCounts {
  const rec = record(value, path);
  return {
    TP: num(field(rec, 'TP', path), `${path}.TP`),
    FN: num(field(rec, 'FN', path), `${path}.FN`),
    FP: num(field(rec, 'FP', path), `${path}.FP`),
    TN: num(field(rec, 'TN', path), `${path}.TN`),
  };
}

function readSummary(value: unknown, path: string): FourBoxesSummary {
  const rec = record(value, path);
  return {
    right: num(field(rec, 'right', path), `${path}.right`),
    wrong: num(field(rec, 'wrong', path), `${path}.wrong`),
    fp: num(field(rec, 'fp', path), `${path}.fp`),
    fn: num(field(rec, 'fn', path), `${path}.fn`),
    accuracy: num(field(rec, 'accuracy', path), `${path}.accuracy`),
  };
}

function reduceInit(scene: FourBoxesScene, payload: unknown): FourBoxesScene {
  if (scene.counts !== null) throw new Error('four-boxes 장면: init 이 두 번 왔다');
  const rec = record(payload, 'init.payload');
  const counts = readCounts(field(rec, 'counts', 'init.payload'), 'init.payload.counts');
  for (const k of BOX_KEYS) {
    if (counts[k] !== 0) throw new Error(`four-boxes 장면: init.payload.counts.${k} 가 0 이 아니다`);
  }
  return { ...scene, counts, landed: [], step: null, summary: null };
}

function reduceDrop(scene: FourBoxesScene, payload: unknown): FourBoxesScene {
  const before = scene.counts;
  if (before === null) throw new Error('four-boxes 장면: init 앞에 drop 이 왔다');
  const p = 'drop.payload';
  const rec = record(payload, p);
  const index = num(field(rec, 'index', p), `${p}.index`);
  if (index !== scene.landed.length) {
    throw new Error(`four-boxes 장면: ${p}.index ${index} 가 떨어진 수 ${scene.landed.length} 와 다르다`);
  }
  const item = scene.items[index];
  if (item === undefined) throw new Error(`four-boxes 장면: ${p}.index ${index} 인 항목이 없다`);
  const id = field(rec, 'id', p);
  if (id !== item.id) throw new Error(`four-boxes 장면: ${p}.id 가 바탕의 '${item.id}' 와 다르다`);
  const actual = field(rec, 'actual', p);
  const predicted = field(rec, 'predicted', p);
  if (actual !== item.actual) throw new Error(`four-boxes 장면: ${p}.actual 이 바탕과 다르다`);
  if (predicted !== item.predicted) throw new Error(`four-boxes 장면: ${p}.predicted 가 바탕과 다르다`);
  const box = field(rec, 'box', p);
  const expected = boxOf(item.actual, item.predicted);
  if (box !== expected) throw new Error(`four-boxes 장면: ${p}.box 가 ${expected} 가 아니다`);
  const was = num(field(rec, 'was', p), `${p}.was`);
  if (was !== before[expected]) {
    throw new Error(`four-boxes 장면: ${p}.was ${was} 가 지금 칸의 수 ${before[expected]} 와 다르다`);
  }
  const counts = readCounts(field(rec, 'counts', p), `${p}.counts`);
  for (const k of BOX_KEYS) {
    const want = k === expected ? before[k] + 1 : before[k];
    if (counts[k] !== want) throw new Error(`four-boxes 장면: ${p}.counts.${k} 가 ${want} 가 아니다`);
  }
  const last = index === scene.items.length - 1;
  const rawSummary = field(rec, 'summary', p);
  let summary: FourBoxesSummary | null = null;
  if (last) {
    if (rawSummary === null) throw new Error(`four-boxes 장면: 마지막 항목의 ${p}.summary 가 없다`);
    summary = readSummary(rawSummary, `${p}.summary`);
  } else if (rawSummary !== null) {
    throw new Error(`four-boxes 장면: 마지막이 아닌 항목에 ${p}.summary 가 왔다`);
  }
  return {
    items: scene.items,
    counts,
    landed: [...scene.landed, { id: item.id, box: expected, slot: was }],
    step: {
      kind: 'drop',
      index,
      id: item.id,
      actual: item.actual,
      predicted: item.predicted,
      box: expected,
      was,
    },
    summary,
  };
}

export const fourBoxesScene: ScenePlan<FourBoxesScene> = {
  initial(initialData: unknown): FourBoxesScene {
    const data = narrowFourBoxesData(initialData);
    return {
      items: data.items.map((it) => ({ id: it.id, actual: it.actual, predicted: it.predicted })),
      counts: null,
      landed: [],
      step: null,
      summary: null,
    };
  },
  reduce(scene: FourBoxesScene, event: FacetRuntimeEvent): FourBoxesScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event.payload);
      case 'drop':
        return reduceDrop(scene, event.payload);
      default:
        throw new Error(`four-boxes 장면: 모르는 이벤트 '${event.type}'`);
    }
  },
};
