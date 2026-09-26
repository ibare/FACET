/**
 * basic-block 장면 — 이벤트를 잇기만 한다. 리더 · 블록의 셈은 알고리즘이 한다.
 *
 * 바탕: code (initialData 의 명령을 베낀 것)
 * 자취: marks (짚인 리더와 그 규칙, 짚인 차례) · blocks (자른 뒤에만)
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readCode } from './algorithm.js';
import type { BlockRange, Instruction, LeaderRule, RuleHit } from './algorithm.js';

export type LeaderMark = { line: number; rule: LeaderRule };

export type BasicBlockStep =
  | { kind: 'start' }
  | { kind: 'rule'; rule: LeaderRule; hits: RuleHit[]; again: number[]; leaders: number }
  | { kind: 'cut'; leaders: number[] };

export type BasicBlockScene = {
  code: Instruction[];
  marks: LeaderMark[];
  blocks: BlockRange[] | null;
  step: BasicBlockStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function readHits(v: unknown): RuleHit[] {
  if (!Array.isArray(v)) throw new Error('basic-block 장면: hits 가 목록이 아니다');
  return v.map((h: unknown) => {
    if (!isRecord(h) || !isIndex(h.line) || !Array.isArray(h.from)) {
      throw new Error('basic-block 장면: hit 모양을 모른다');
    }
    const from = h.from.map((f: unknown) => {
      if (!isIndex(f)) throw new Error('basic-block 장면: from 이 줄 차례가 아니다');
      return f;
    });
    return { line: h.line, from };
  });
}

function readRule(v: unknown): LeaderRule {
  if (v === 1 || v === 2 || v === 3) return v;
  throw new Error(`basic-block 장면: 규칙 ${String(v)} 을 모른다`);
}

export const basicBlockScene: ScenePlan<BasicBlockScene> = {
  initial(initialData: unknown): BasicBlockScene {
    if (!isRecord(initialData)) throw new Error('basic-block 장면: initialData 가 없다');
    const code = readCode(initialData.code);
    return { code, marks: [], blocks: null, step: { kind: 'start' } };
  },

  reduce(scene: BasicBlockScene, event: FacetRuntimeEvent): BasicBlockScene {
    const p = event.payload;
    if (event.type === 'rule') {
      if (!isRecord(p)) throw new Error('basic-block 장면: rule payload 가 없다');
      const rule = readRule(p.rule);
      const hits = readHits(p.hits);
      if (!Array.isArray(p.again) || !isIndex(p.leaders)) {
        throw new Error('basic-block 장면: rule payload 의 again · leaders 모양을 모른다');
      }
      const again = p.again.map((a: unknown) => {
        if (!isIndex(a)) throw new Error('basic-block 장면: again 이 줄 차례가 아니다');
        return a;
      });
      const marks = [...scene.marks, ...hits.map((h) => ({ line: h.line, rule }))];
      return { ...scene, marks, step: { kind: 'rule', rule, hits, again, leaders: p.leaders } };
    }
    if (event.type === 'cut') {
      if (!isRecord(p) || !Array.isArray(p.leaders) || !Array.isArray(p.blocks)) {
        throw new Error('basic-block 장면: cut payload 모양을 모른다');
      }
      const leaders = p.leaders.map((l: unknown) => {
        if (!isIndex(l)) throw new Error('basic-block 장면: 리더가 줄 차례가 아니다');
        return l;
      });
      const blocks = p.blocks.map((b: unknown) => {
        if (!isRecord(b) || !isIndex(b.start) || !isIndex(b.end) || b.end <= b.start) {
          throw new Error('basic-block 장면: 블록 모양을 모른다');
        }
        return { start: b.start, end: b.end };
      });
      return { ...scene, blocks, step: { kind: 'cut', leaders } };
    }
    throw new Error(`basic-block 장면: 모르는 이벤트 ${event.type}`);
  },
};
