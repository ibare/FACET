/**
 * 장면 — 이벤트를 "지금 화면이 무엇이어야 하는가" 로 잇는다 (S-scene).
 *
 *   바탕     결과 열 · 처음 이력 · 칸 이름. init 이 한 번 정한다
 *   자취     표의 칸(값 · 한 번이라도 찾아 들어갔는가) · 지금 이력 · 드러난 분기의 짐작과 맞음
 *   이번 걸음 step — 시작 · 분기 하나 · 끝
 *
 * 좌표도 문안도 없다. 칸 이름은 T/N 의 줄이고 표시 이름은 stage 가 문안에서 얻는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { historyKeys, type Bit } from './algorithm.js';

export interface TableCell {
  key: string;
  bit: Bit;
  /** 한 번이라도 이 칸으로 찾아 들어갔는가 */
  visited: boolean;
}

export interface BranchResult {
  guess: Bit;
  hit: boolean;
}

export type PatternStep =
  | { kind: 'start'; initialBit: Bit }
  | { kind: 'branch'; index: number; key: string; guess: Bit; outcome: Bit; hit: boolean }
  | { kind: 'done'; miss: number; total: number; streak: number };

export interface PatternFromHistoryScene {
  /** 바탕 — init 전에는 null */
  base: { outcomes: Bit[]; start: Bit[]; keys: string[] } | null;
  table: TableCell[];
  history: Bit[];
  /** 드러난 분기 — 길이가 곧 지나간 분기 수 */
  results: BranchResult[];
  step: PatternStep | null;
}

function isBit(v: unknown): v is Bit {
  return v === 'T' || v === 'N';
}

function bits(v: unknown): Bit[] | null {
  if (!Array.isArray(v)) return null;
  const out: Bit[] = [];
  for (const b of v) {
    if (!isBit(b)) return null;
    out.push(b);
  }
  return out;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function empty(): PatternFromHistoryScene {
  return { base: null, table: [], history: [], results: [], step: null };
}

export const patternFromHistoryScene: ScenePlan<PatternFromHistoryScene> = {
  initial(): PatternFromHistoryScene {
    return empty();
  },

  reduce(scene: PatternFromHistoryScene, event: FacetRuntimeEvent): PatternFromHistoryScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    if (event.type === 'init') {
      const outcomes = bits(p.outcomes);
      const start = bits(p.history);
      const initialBit = p.initialBit;
      if (!outcomes || !start || !isBit(initialBit)) return scene;
      const keys = historyKeys(start.length);
      return {
        base: { outcomes, start, keys },
        table: keys.map((key) => ({ key, bit: initialBit, visited: false })),
        history: [...start],
        results: [],
        step: { kind: 'start', initialBit },
      };
    }

    if (event.type === 'branch') {
      const index = num(p.index);
      const key = p.key;
      const { guess, outcome, hit } = p;
      const history = bits(p.history);
      if (
        !scene.base ||
        index === null ||
        typeof key !== 'string' ||
        !isBit(guess) ||
        !isBit(outcome) ||
        typeof hit !== 'boolean' ||
        !history
      ) {
        return scene;
      }
      return {
        base: scene.base,
        table: scene.table.map((c) => (c.key === key ? { key: c.key, bit: outcome, visited: true } : { ...c })),
        history,
        results: [...scene.results.map((r) => ({ ...r })), { guess, hit }],
        step: { kind: 'branch', index, key, guess, outcome, hit },
      };
    }

    if (event.type === 'done') {
      const miss = num(p.miss);
      const total = num(p.total);
      const streak = num(p.streak);
      if (miss === null || total === null || streak === null) return scene;
      return {
        base: scene.base,
        table: scene.table.map((c) => ({ ...c })),
        history: [...scene.history],
        results: scene.results.map((r) => ({ ...r })),
        step: { kind: 'done', miss, total, streak },
      };
    }

    return scene;
  },
};
