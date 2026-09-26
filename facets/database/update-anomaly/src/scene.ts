/**
 * update-anomaly 장면.
 *
 * 바탕 — 표 이름 · 열 · 기본 키 · 고치기 · 물음 (initialData 에서 한 번).
 * 자취 — 지금의 칸 값(`rows`), 사본 줄(`copies`), 고친 줄(`updated`) · 옛 값이 남은 줄(`stale`),
 *        물음의 답(`answers`).
 * 이번 걸음 — `step`. 흐름에 필요한 계기값(옛 값 `was`)을 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  readUpdateAnomalyData,
  type UpdateAnomalyAnswer,
  type UpdateAnomalyAsk,
  type UpdateAnomalyUpdate,
} from './algorithm.js';

export type UpdateAnomalyStep =
  | { readonly kind: 'table' }
  | { readonly kind: 'copies' }
  | {
      readonly kind: 'update';
      readonly column: number;
      readonly rows: readonly number[];
      readonly was: readonly string[];
    }
  | { readonly kind: 'ask' };

export type UpdateAnomalyScene = {
  readonly table: string;
  readonly columns: readonly string[];
  readonly key: string;
  readonly update: UpdateAnomalyUpdate;
  readonly ask: UpdateAnomalyAsk;
  /** 사본 열 값의 가장 긴 글자 수를 셀 때 쓰는 처음 값 — 걸음 사이 칸 폭이 흔들리지 않게. */
  readonly initialRows: readonly (readonly string[])[];
  readonly rows: readonly (readonly string[])[];
  readonly copies: readonly number[] | null;
  readonly updated: readonly number[] | null;
  readonly stale: readonly number[] | null;
  readonly answers: readonly UpdateAnomalyAnswer[] | null;
  readonly step: UpdateAnomalyStep;
};

function numberList(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`update-anomaly 장면: ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0) {
      throw new Error(`update-anomaly 장면: ${what} 에 줄 자리가 아닌 값`);
    }
    return x;
  });
}

function textList(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`update-anomaly 장면: ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`update-anomaly 장면: ${what} 에 글자가 아닌 값`);
    return x;
  });
}

function field(payload: unknown, name: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('update-anomaly 장면: payload 가 객체가 아니다');
  }
  return (payload as Record<string, unknown>)[name];
}

export const updateAnomalyScene: ScenePlan<UpdateAnomalyScene> = {
  initial(initialData: unknown): UpdateAnomalyScene {
    const d = readUpdateAnomalyData(initialData);
    const rows = d.rows.map((r) => [...r]);
    return {
      table: d.table,
      columns: [...d.columns],
      key: d.key,
      update: { ...d.update },
      ask: { ...d.ask },
      initialRows: rows.map((r) => [...r]),
      rows,
      copies: null,
      updated: null,
      stale: null,
      answers: null,
      step: { kind: 'table' },
    };
  },

  reduce(scene: UpdateAnomalyScene, event: FacetRuntimeEvent): UpdateAnomalyScene {
    switch (event.type) {
      case 'copies': {
        const rows = numberList(field(event.payload, 'rows'), 'copies.rows');
        return { ...scene, copies: rows, step: { kind: 'copies' } };
      }
      case 'update': {
        const hit = numberList(field(event.payload, 'rows'), 'update.rows');
        const column = field(event.payload, 'column');
        const value = field(event.payload, 'value');
        const was = textList(field(event.payload, 'was'), 'update.was');
        const stale = numberList(field(event.payload, 'stale'), 'update.stale');
        if (typeof column !== 'number' || !Number.isInteger(column) || column < 0) {
          throw new Error('update-anomaly 장면: update.column 이 열 자리가 아니다');
        }
        if (typeof value !== 'string') throw new Error('update-anomaly 장면: update.value 가 글자가 아니다');
        if (was.length !== hit.length) throw new Error('update-anomaly 장면: update.was 의 길이가 rows 와 다르다');
        const rows = scene.rows.map((r, i) =>
          hit.includes(i) ? r.map((cell, j) => (j === column ? value : cell)) : [...r],
        );
        return {
          ...scene,
          rows,
          updated: hit,
          stale,
          step: { kind: 'update', column, rows: hit, was },
        };
      }
      case 'ask': {
        const raw = field(event.payload, 'answers');
        if (!Array.isArray(raw)) throw new Error('update-anomaly 장면: ask.answers 가 배열이 아니다');
        const answers = raw.map((a) => {
          const value = field(a, 'value');
          if (typeof value !== 'string') throw new Error('update-anomaly 장면: 답의 value 가 글자가 아니다');
          return { value, rows: numberList(field(a, 'rows'), 'ask.answers.rows') };
        });
        return { ...scene, answers, step: { kind: 'ask' } };
      }
      default:
        throw new Error(`update-anomaly 장면: 모르는 이벤트 "${event.type}"`);
    }
  },
};
