import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  axisRange,
  foldOrder,
  narrowRotateTheFoldData,
  type FoldFit,
  type FoldItem,
  type FoldResult,
} from './algorithm.js';

/** 한 폴드가 시험지 자리에 앉았던 기록 — 자취. */
export type FoldRecord = FoldFit & {
  fold: number;
  results: FoldResult[];
  correct: number;
  total: number;
};

export type RotateStep =
  | { kind: 'start' }
  /** fromFold · was 는 자리를 비운 폴드와 그때의 맞춤 — 운동의 출발값이다. */
  | { kind: 'fold'; fold: number; fromFold: number | null; was: FoldFit | null }
  | {
      kind: 'summary';
      fromFold: number;
      correct: number;
      total: number;
      accuracy: number;
      seatMin: number;
      seatMax: number;
    };

export type RotateTheFoldScene = {
  /** 바탕 */
  items: FoldItem[];
  folds: number[];
  axis: { lo: number; hi: number };
  /** 자취 */
  trail: FoldRecord[];
  /** 이번 걸음 */
  step: RotateStep;
};

function bad(path: string, why: string): never {
  throw new Error(`rotateTheFoldScene: ${path} — ${why}`);
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${type}.payload.${key}`, '유한한 수가 아니다');
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) bad(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

function readResults(raw: unknown, testIds: readonly string[]): FoldResult[] {
  if (!Array.isArray(raw)) bad('fold.payload.results', '배열이 아니다');
  const out: FoldResult[] = raw.map((r: unknown, i: number) => {
    const at = `fold.payload.results[${i}]`;
    if (typeof r !== 'object' || r === null) bad(at, '객체가 아니다');
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string') bad(`${at}.id`, '문자열이 아니다');
    if (o.predicted !== 0 && o.predicted !== 1) bad(`${at}.predicted`, '0 또는 1 이 아니다');
    if (typeof o.right !== 'boolean') bad(`${at}.right`, '참거짓이 아니다');
    return { id: o.id, predicted: o.predicted, right: o.right };
  });
  const got = out.map((r) => r.id).sort();
  const want = [...testIds].sort();
  if (got.length !== want.length || got.some((id, i) => id !== want[i])) {
    bad('fold.payload.results', `시험지 항목과 맞지 않는다: ${got.join(',')} ≠ ${want.join(',')}`);
  }
  return out;
}

export const rotateTheFoldScene: ScenePlan<RotateTheFoldScene> = {
  initial(initialData: unknown): RotateTheFoldScene {
    const data = narrowRotateTheFoldData(initialData);
    const items = data.items.map((it) => ({ ...it }));
    return {
      items,
      folds: foldOrder(items),
      axis: axisRange(items),
      trail: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: RotateTheFoldScene, event: FacetRuntimeEvent): RotateTheFoldScene {
    switch (event.type) {
      case 'fold': {
        const p = payloadOf(event);
        const fold = num(p, 'fold', 'fold');
        const expected = scene.folds[scene.trail.length];
        if (expected === undefined) bad('fold.payload.fold', '모든 폴드가 이미 앉았다');
        if (fold !== expected) bad('fold.payload.fold', `차례는 폴드 ${expected} 인데 ${fold} 가 왔다`);
        const testIds = scene.items.filter((it) => it.fold === fold).map((it) => it.id);
        const results = readResults(p.results, testIds);
        const record: FoldRecord = {
          fold,
          mean0: num(p, 'mean0', 'fold'),
          mean1: num(p, 'mean1', 'fold'),
          split: num(p, 'split', 'fold'),
          results,
          correct: num(p, 'correct', 'fold'),
          total: num(p, 'total', 'fold'),
        };
        if (record.total !== testIds.length) bad('fold.payload.total', '시험지 항목 수와 다르다');
        if (record.correct !== results.filter((r) => r.right).length) {
          bad('fold.payload.correct', 'results 의 맞음 수와 다르다');
        }
        const last = scene.trail[scene.trail.length - 1];
        return {
          ...scene,
          trail: [...scene.trail, record],
          step: {
            kind: 'fold',
            fold,
            fromFold: last ? last.fold : null,
            was: last ? { mean0: last.mean0, mean1: last.mean1, split: last.split } : null,
          },
        };
      }
      case 'summary': {
        const p = payloadOf(event);
        if (scene.trail.length !== scene.folds.length) {
          bad('summary', `앉은 폴드 ${scene.trail.length} · 전체 폴드 ${scene.folds.length}`);
        }
        const last = scene.trail[scene.trail.length - 1];
        if (!last) bad('summary', '자취가 비었다');
        return {
          ...scene,
          step: {
            kind: 'summary',
            fromFold: last.fold,
            correct: num(p, 'correct', 'summary'),
            total: num(p, 'total', 'summary'),
            accuracy: num(p, 'accuracy', 'summary'),
            seatMin: num(p, 'seatMin', 'summary'),
            seatMax: num(p, 'seatMax', 'summary'),
          },
        };
      }
      default:
        throw new Error(`rotateTheFoldScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
