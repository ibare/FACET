/**
 * carry-hidden-state 의 장면.
 *
 * 바탕 — 토큰 차례 · 토큰의 입력값 · 처음 h0 · 기호 (initialData 에서 initial() 이 세운다)
 * 자취 — 셈을 마친 셀들 (걸음마다 하나씩 붙는다)
 * 이번 걸음 — 몇째 셀에 h 가 넘겨졌는가 · 이 토큰 뒤의 h 목록
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { inputOf, readCarryData, type CarrySymbols } from './algorithm.js';

export type CarryCell = {
  token: string;
  x: number;
  prev: number;
  termX: number;
  termH: number;
  sum: number;
  h: number;
};

export type CarryStep = {
  kind: 'carry';
  /** 걸음 번호 (1 부터) — 자취의 t-1 번째 셀 */
  t: number;
  token: string;
  sameToken: number[];
};

export type CarryScene = {
  base: {
    tokens: string[];
    xs: number[];
    /** 토큰 종류 — 데이터에 처음 나온 차례. 색 번호가 된다 */
    kinds: string[];
    h0: number;
    symbols: CarrySymbols;
  };
  cells: CarryCell[];
  step: CarryStep | null;
};

function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`carryHiddenStateScene: step.${name} 는 수여야 한다`);
  }
  return v;
}

export const carryHiddenStateScene: ScenePlan<CarryScene> = {
  initial(initialData: unknown): CarryScene {
    const data = readCarryData(initialData);
    const kinds: string[] = [];
    for (const tok of data.tokens) if (!kinds.includes(tok)) kinds.push(tok);
    return {
      base: {
        tokens: [...data.tokens],
        xs: data.tokens.map((tok) => inputOf(data, tok)),
        kinds,
        h0: data.h0,
        symbols: { ...data.symbols },
      },
      cells: [],
      step: null,
    };
  },

  reduce(scene: CarryScene, event: FacetRuntimeEvent): CarryScene {
    if (event.type !== 'step') {
      throw new Error(`carryHiddenStateScene: 모르는 이벤트 ${event.type}`);
    }
    const p = event.payload;
    if (typeof p !== 'object' || p === null) {
      throw new Error('carryHiddenStateScene: step 에 payload 가 없다');
    }
    const r = p as Record<string, unknown>;
    const t = num(r.t, 't');
    if (t !== scene.cells.length + 1) {
      throw new Error(`carryHiddenStateScene: 걸음 ${t} 가 차례를 벗어났다`);
    }
    if (typeof r.token !== 'string') {
      throw new Error('carryHiddenStateScene: step.token 은 글자여야 한다');
    }
    if (!Array.isArray(r.sameToken)) {
      throw new Error('carryHiddenStateScene: step.sameToken 은 배열이어야 한다');
    }
    const sameToken = r.sameToken.map((v, i) => num(v, `sameToken[${i}]`));
    const cell: CarryCell = {
      token: r.token,
      x: num(r.x, 'x'),
      prev: num(r.prev, 'prev'),
      termX: num(r.termX, 'termX'),
      termH: num(r.termH, 'termH'),
      sum: num(r.sum, 'sum'),
      h: num(r.h, 'h'),
    };
    return {
      base: scene.base,
      cells: [...scene.cells, cell],
      step: { kind: 'carry', t, token: r.token, sameToken },
    };
  },
};
