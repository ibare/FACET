/**
 * bad-estimate-bad-plan 장면 — 이벤트를 잇기만 한다. 셈(추정 · 비용 · 고르기)은 알고리즘이 한다.
 *
 * 바탕: SQL · 통계 · 분포 · 길 이름 (initialData 에서 베낀다 — 걸음 0 이 곧 이 화면)
 * 자취: 추정 · 추정 비용과 고른 길 · 실제 줄 수 · 실제 비용
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export interface ScenePathCost {
  path: string;
  indexPages: number;
  tablePages: number;
  pages: number;
}

export interface BadEstimateBase {
  sql: string;
  table: string;
  column: string;
  value: string;
  rows: number;
  pages: number;
  distinct: number;
  descent: number;
  otherValues: number;
  rowsPerOther: number;
  paths: string[];
}

export type BadEstimateStep =
  | { kind: 'start' }
  | { kind: 'estimate' }
  | { kind: 'estimatedCost' }
  | { kind: 'actual' }
  | { kind: 'actualCost' };

export interface BadEstimateScene {
  base: BadEstimateBase;
  est: number | null;
  estCosts: ScenePathCost[] | null;
  pick: string | null;
  actualRows: number | null;
  actCosts: ScenePathCost[] | null;
  step: BadEstimateStep;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`bad-estimate-bad-plan 장면: ${what} 이 수가 아니다`);
  }
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`bad-estimate-bad-plan 장면: ${what} 이 글자가 아니다`);
  return v;
}

function readCosts(v: unknown): ScenePathCost[] {
  if (!Array.isArray(v)) throw new Error('bad-estimate-bad-plan 장면: costs 가 배열이 아니다');
  return v.map((c, i) => {
    if (!isRecord(c)) throw new Error(`bad-estimate-bad-plan 장면: costs[${i}] 모양이 틀렸다`);
    return {
      path: str(c.path, `costs[${i}].path`),
      indexPages: num(c.indexPages, `costs[${i}].indexPages`),
      tablePages: num(c.tablePages, `costs[${i}].tablePages`),
      pages: num(c.pages, `costs[${i}].pages`),
    };
  });
}

function readBase(data: unknown): BadEstimateBase {
  if (!isRecord(data)) throw new Error('bad-estimate-bad-plan 장면: initialData 가 없다');
  const stats = data.stats;
  const actual = data.actual;
  const paths = data.paths;
  if (!isRecord(stats) || !isRecord(actual) || !Array.isArray(paths)) {
    throw new Error('bad-estimate-bad-plan 장면: stats · actual · paths 모양이 틀렸다');
  }
  return {
    sql: str(data.sql, 'sql'),
    table: str(data.table, 'table'),
    column: str(data.column, 'column'),
    value: str(data.value, 'value'),
    rows: num(stats.rows, 'stats.rows'),
    pages: num(stats.pages, 'stats.pages'),
    distinct: num(stats.distinct, 'stats.distinct'),
    descent: num(data.descent, 'descent'),
    otherValues: num(actual.otherValues, 'actual.otherValues'),
    rowsPerOther: num(actual.rowsPerOther, 'actual.rowsPerOther'),
    paths: paths.map((p, i) => str(p, `paths[${i}]`)),
  };
}

export const badEstimateBadPlanScene: ScenePlan<BadEstimateScene> = {
  initial(initialData: unknown): BadEstimateScene {
    return {
      base: readBase(initialData),
      est: null,
      estCosts: null,
      pick: null,
      actualRows: null,
      actCosts: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: BadEstimateScene, event: FacetRuntimeEvent): BadEstimateScene {
    const p = event.payload;
    if (!isRecord(p)) {
      throw new Error(`bad-estimate-bad-plan 장면: ${event.type} 의 payload 가 객체가 아니다`);
    }
    switch (event.type) {
      case 'estimate':
        return { ...scene, est: num(p.est, 'est'), step: { kind: 'estimate' } };
      case 'estimatedCost':
        return {
          ...scene,
          estCosts: readCosts(p.costs),
          pick: str(p.pick, 'pick'),
          step: { kind: 'estimatedCost' },
        };
      case 'actual':
        return { ...scene, actualRows: num(p.rows, 'rows'), step: { kind: 'actual' } };
      case 'actualCost':
        return { ...scene, actCosts: readCosts(p.costs), step: { kind: 'actualCost' } };
      default:
        throw new Error(`bad-estimate-bad-plan 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
