/**
 * cell-carries-long 의 장면.
 *
 * 바탕  — 입력 차례 · 처음 c0 · h0 · 기호 (initial 이 initialData 에서 베낀다)
 * 자취  — 마친 걸음마다의 기록 (문 넷 · 남긴 몫 · 들인 몫 · 새 c · 새 h)
 * 이번 걸음 — 무엇이 막 일어났는가 ('start' | 'carry')
 *
 * 셈은 알고리즘이 한다. 장면은 이벤트에 실린 값을 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { gateSet, narrowCellCarriesLongData } from './algorithm';

export type CarryRecord = {
  k: number;
  x: number;
  f: number;
  i: number;
  g: number;
  o: number;
  cPrev: number;
  kept: number;
  added: number;
  c: number;
  h: number;
};

export type CarrySummary = {
  c1: number;
  cN: number;
  ratio: number;
  fProd: number;
  hMax: number;
  hMin: number;
};

export type CellCarriesLongScene = {
  base: {
    names: { input: string; cell: string; hidden: string; squash: string };
    gateIds: { f: string; i: string; g: string; o: string };
    xs: number[];
    c0: number;
    h0: number;
  };
  trail: CarryRecord[];
  summary: CarrySummary | null;
  step: { kind: 'start' } | { kind: 'carry'; k: number };
};

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`cell-carries-long 장면: carry.${key} 가 수가 아니다`);
  }
  return v;
}

function readSummary(raw: unknown): CarrySummary | null {
  if (raw === null) return null;
  if (typeof raw !== 'object') {
    throw new Error('cell-carries-long 장면: carry.last 가 객체도 null 도 아니다');
  }
  const r = raw as Record<string, unknown>;
  return {
    c1: num(r, 'c1'),
    cN: num(r, 'cN'),
    ratio: num(r, 'ratio'),
    fProd: num(r, 'fProd'),
    hMax: num(r, 'hMax'),
    hMin: num(r, 'hMin'),
  };
}

export const cellCarriesLongScene: ScenePlan<CellCarriesLongScene> = {
  initial(initialData: unknown): CellCarriesLongScene {
    const d = narrowCellCarriesLongData(initialData);
    const gs = gateSet(d.gates);
    const ids = { f: gs.f.id, i: gs.i.id, g: gs.g.id, o: gs.o.id };
    return {
      base: {
        names: { ...d.names },
        gateIds: ids,
        xs: [...d.xs],
        c0: d.c0,
        h0: d.h0,
      },
      trail: [],
      summary: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: CellCarriesLongScene, event: FacetRuntimeEvent): CellCarriesLongScene {
    if (event.type !== 'carry') {
      throw new Error(`cell-carries-long 장면: 모르는 이벤트 — ${event.type}`);
    }
    const p = event.payload;
    if (typeof p !== 'object' || p === null) {
      throw new Error('cell-carries-long 장면: carry 에 payload 가 없다');
    }
    const r = p as Record<string, unknown>;
    const rec: CarryRecord = {
      k: num(r, 'k'),
      x: num(r, 'x'),
      f: num(r, 'f'),
      i: num(r, 'i'),
      g: num(r, 'g'),
      o: num(r, 'o'),
      cPrev: num(r, 'cPrev'),
      kept: num(r, 'kept'),
      added: num(r, 'added'),
      c: num(r, 'c'),
      h: num(r, 'h'),
    };
    if (rec.k !== scene.trail.length + 1) {
      throw new Error(`cell-carries-long 장면: 걸음 ${rec.k} 가 차례를 벗어났다`);
    }
    return {
      base: scene.base,
      trail: [...scene.trail, rec],
      summary: readSummary(r.last),
      step: { kind: 'carry', k: rec.k },
    };
  },
};
