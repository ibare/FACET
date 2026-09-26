/**
 * internal-state-carries 의 장면.
 *
 * 바탕 — M · X 글자, IV, M ‖ pad(M) 의 칸과 덩어리 (init)
 * 자취 — holder 의 상태 줄, 건너간 것(carry), extender 의 상태 줄, 통째 접기(whole)
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { IV, narrowInternalStateCarriesData, type Cell } from './algorithm.js';

export type Carried = {
  d: number;
  mLen: number;
  prefixCells: Cell[];
  cells: Cell[];
  chunks: number[];
};

export type Whole = {
  msgLen: number;
  cells: Cell[];
  chunks: number[];
  states: number[];
  match: boolean[];
  equal: boolean;
};

export type InternalStateCarriesStep =
  | { kind: 'start' }
  | { kind: 'foldHolder' }
  | { kind: 'carry' }
  | { kind: 'extend'; index: number; last: boolean }
  | { kind: 'whole' };

export type InternalStateCarriesScene = {
  m: string;
  x: string;
  iv: number;
  holderCells: Cell[] | null;
  holderChunks: number[] | null;
  /** 상태 칸 수 — 통째 접기의 상태 수 (init) */
  columns: number | null;
  /** IV 로 시작한다. 접은 뒤 넷 */
  holderStates: number[];
  carried: Carried | null;
  /** 건너간 D 로 시작한다 */
  extStates: number[];
  whole: Whole | null;
  step: InternalStateCarriesStep;
};

function rec(p: unknown, where: string): Record<string, unknown> {
  if (typeof p !== 'object' || p === null) throw new Error(`${where}: 객체가 아니다`);
  return p as Record<string, unknown>;
}

function u16(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 0xffff) throw new Error(`${where}: 16 비트 정수가 아니다`);
  return v;
}

function u16s(v: unknown, where: string): number[] {
  if (!Array.isArray(v)) throw new Error(`${where}: 배열이 아니다`);
  return v.map((x, i) => u16(x, `${where}[${i}]`));
}

function cells(v: unknown, where: string): Cell[] {
  if (!Array.isArray(v)) throw new Error(`${where}: 배열이 아니다`);
  return v.map((c, i) => {
    const o = rec(c, `${where}[${i}]`);
    const kind = o.kind;
    if (kind === 'unknown') {
      if (o.v !== null) throw new Error(`${where}[${i}].v: 모르는 칸인데 값이 있다`);
      return { v: null, kind };
    }
    if (kind !== 'char' && kind !== 'pad') throw new Error(`${where}[${i}].kind: 모르는 종류 ${String(kind)}`);
    const b = o.v;
    if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b > 0xff) throw new Error(`${where}[${i}].v: 바이트가 아니다`);
    return { v: b, kind };
  });
}

function bools(v: unknown, where: string): boolean[] {
  if (!Array.isArray(v)) throw new Error(`${where}: 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'boolean') throw new Error(`${where}[${i}]: 참거짓이 아니다`);
    return x;
  });
}

function last(xs: readonly number[], where: string): number {
  const v = xs[xs.length - 1];
  if (v === undefined) throw new Error(`${where}: 비어 있다`);
  return v;
}

export const internalStateCarriesScene: ScenePlan<InternalStateCarriesScene> = {
  initial(initialData: unknown): InternalStateCarriesScene {
    const data = narrowInternalStateCarriesData(initialData);
    return {
      m: data.m,
      x: data.x,
      iv: IV,
      holderCells: null,
      holderChunks: null,
      columns: null,
      holderStates: [IV],
      carried: null,
      extStates: [],
      whole: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: InternalStateCarriesScene, event: FacetRuntimeEvent): InternalStateCarriesScene {
    const p = rec(event.payload, `${event.type}.payload`);
    switch (event.type) {
      case 'init': {
        const holderCells = cells(p.holderCells, 'init.payload.holderCells');
        const holderChunks = u16s(p.holderChunks, 'init.payload.holderChunks');
        if (holderCells.length !== holderChunks.length * 2) throw new Error('init.payload: 칸 수가 덩어리 수의 두 배가 아니다');
        const columns = p.columns;
        if (typeof columns !== 'number' || !Number.isInteger(columns) || columns <= holderChunks.length + 1) {
          throw new Error('init.payload.columns: holder 칸보다 많은 정수여야 한다');
        }
        return { ...scene, holderCells, holderChunks, columns, step: { kind: 'start' } };
      }
      case 'foldHolder': {
        if (scene.holderChunks === null) throw new Error('foldHolder: init 이 먼저 와야 한다');
        const states = u16s(p.states, 'foldHolder.payload.states');
        if (states.length !== scene.holderChunks.length + 1) throw new Error('foldHolder.payload.states: 덩어리 수 + 1 개가 아니다');
        if (states[0] !== scene.iv) throw new Error('foldHolder.payload.states[0]: IV 가 아니다');
        return { ...scene, holderStates: states, step: { kind: 'foldHolder' } };
      }
      case 'carry': {
        if (scene.holderChunks === null || scene.holderStates.length !== scene.holderChunks.length + 1) {
          throw new Error('carry: holder 가 아직 다 접지 않았다');
        }
        const d = u16(p.d, 'carry.payload.d');
        if (d !== last(scene.holderStates, 'holderStates')) throw new Error('carry.payload.d: holder 의 끝 상태가 아니다');
        const mLen = p.mLen;
        if (typeof mLen !== 'number' || !Number.isInteger(mLen) || mLen !== scene.m.length) {
          throw new Error('carry.payload.mLen: M 의 길이와 다르다');
        }
        const carried: Carried = {
          d,
          mLen,
          prefixCells: cells(p.prefixCells, 'carry.payload.prefixCells'),
          cells: cells(p.cells, 'carry.payload.cells'),
          chunks: u16s(p.chunks, 'carry.payload.chunks'),
        };
        if (carried.cells.length !== carried.chunks.length * 2) throw new Error('carry.payload: 칸 수가 덩어리 수의 두 배가 아니다');
        if (scene.columns === null || scene.holderChunks.length + carried.chunks.length + 1 !== scene.columns) {
          throw new Error('carry.payload.chunks: 두 토막의 덩어리 수가 init 의 칸 수와 맞지 않다');
        }
        if (carried.prefixCells.length !== scene.holderChunks.length * 2) throw new Error('carry.payload.prefixCells: holder 칸 수와 다르다');
        return { ...scene, carried, extStates: [d], step: { kind: 'carry' } };
      }
      case 'extend': {
        const c = scene.carried;
        if (c === null) throw new Error('extend: carry 가 먼저 와야 한다');
        const index = p.index;
        if (typeof index !== 'number' || index !== scene.extStates.length - 1) {
          throw new Error(`extend.payload.index: ${String(index)} — 다음 차례는 ${scene.extStates.length - 1}`);
        }
        const from = u16(p.from, 'extend.payload.from');
        if (from !== last(scene.extStates, 'extStates')) throw new Error('extend.payload.from: 지금 상태가 아니다');
        const chunk = u16(p.chunk, 'extend.payload.chunk');
        if (chunk !== c.chunks[index]) throw new Error(`extend.payload.chunk: 덩어리 ${index} 와 다르다`);
        const to = u16(p.to, 'extend.payload.to');
        return {
          ...scene,
          extStates: [...scene.extStates, to],
          step: { kind: 'extend', index, last: index === c.chunks.length - 1 },
        };
      }
      case 'whole': {
        const c = scene.carried;
        if (c === null || scene.extStates.length !== c.chunks.length + 1) throw new Error('whole: extender 가 아직 다 접지 않았다');
        const msgLen = p.msgLen;
        if (typeof msgLen !== 'number' || !Number.isInteger(msgLen) || msgLen <= 0) throw new Error('whole.payload.msgLen: 양의 정수가 아니다');
        const w: Whole = {
          msgLen,
          cells: cells(p.cells, 'whole.payload.cells'),
          chunks: u16s(p.chunks, 'whole.payload.chunks'),
          states: u16s(p.states, 'whole.payload.states'),
          match: bools(p.match, 'whole.payload.match'),
          equal: (() => {
            if (typeof p.equal !== 'boolean') throw new Error('whole.payload.equal: 참거짓이 아니다');
            return p.equal;
          })(),
        };
        const cols = scene.holderStates.length + scene.extStates.length - 1;
        if (cols !== scene.columns) throw new Error('whole: 두 토막의 칸 수가 init 의 칸 수와 다르다');
        if (w.states.length !== cols || w.match.length !== cols) throw new Error(`whole.payload: 상태 · 견줌이 칸 ${cols} 개가 아니다`);
        if (w.cells.length !== w.chunks.length * 2 || w.chunks.length !== cols - 1) throw new Error('whole.payload: 칸 · 덩어리 수가 상태와 맞지 않다');
        return { ...scene, whole: w, step: { kind: 'whole' } };
      }
      default:
        throw new Error(`internalStateCarriesScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
