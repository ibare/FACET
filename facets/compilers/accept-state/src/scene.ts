/**
 * accept-state 장면.
 *
 * - 바탕 `base` — 기계 · 무늬 · 입력 (initialData 에서 베낀다)
 * - 자취 `trail` — 지나온 자리 (시작 자리 포함, 먹은 글자 수 + 1 개)
 * - 자취 `verdict` — 판정 (다 먹은 뒤 한 번)
 * - 이번 걸음 `step`
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readAcceptStateData, type AcceptStateFacetData } from './algorithm.js';

export type AcceptVerdict = { state: string; accepted: boolean; passed: number };

export type AcceptStep =
  | { kind: 'start' }
  | { kind: 'move'; index: number; ch: string; edge: number; from: string; to: string }
  | { kind: 'verdict' };

export type AcceptStateScene = {
  base: AcceptStateFacetData;
  trail: string[];
  verdict: AcceptVerdict | null;
  step: AcceptStep;
};

function fail(msg: string): never {
  throw new Error(`accept-state scene: ${msg}`);
}

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) fail(`payload 가 없다 (${key})`);
  return (payload as Record<string, unknown>)[key];
}

function str(payload: unknown, key: string): string {
  const v = field(payload, key);
  if (typeof v !== 'string') fail(`payload.${key} 가 글자가 아니다`);
  return v;
}

function num(payload: unknown, key: string): number {
  const v = field(payload, key);
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(`payload.${key} 가 0 이상의 정수가 아니다`);
  return v;
}

function bool(payload: unknown, key: string): boolean {
  const v = field(payload, key);
  if (typeof v !== 'boolean') fail(`payload.${key} 가 참거짓이 아니다`);
  return v;
}

export const acceptStateScene: ScenePlan<AcceptStateScene> = {
  initial(initialData: unknown): AcceptStateScene {
    const base = readAcceptStateData(initialData);
    return { base, trail: [base.start], verdict: null, step: { kind: 'start' } };
  },

  reduce(scene: AcceptStateScene, event: FacetRuntimeEvent): AcceptStateScene {
    if (event.type === 'move') {
      const p = event.payload;
      const index = num(p, 'index');
      const ch = str(p, 'ch');
      const edge = num(p, 'edge');
      const from = str(p, 'from');
      const to = str(p, 'to');
      if (scene.verdict !== null) fail('판정 뒤에 옮김이 왔다');
      if (index !== scene.trail.length - 1) fail(`글자 자리 ${index} 가 차례가 아니다`);
      if (scene.trail[scene.trail.length - 1] !== from) fail(`옮김의 출발 ${from} 가 지금 자리가 아니다`);
      if (edge >= scene.base.edges.length) fail(`옮김 번호 ${edge} 가 없다`);
      return {
        base: scene.base,
        trail: [...scene.trail, to],
        verdict: null,
        step: { kind: 'move', index, ch, edge, from, to },
      };
    }
    if (event.type === 'verdict') {
      const p = event.payload;
      const verdict: AcceptVerdict = {
        state: str(p, 'state'),
        accepted: bool(p, 'accepted'),
        passed: num(p, 'passed'),
      };
      if (scene.trail.length !== scene.base.input.length + 1) fail('글자를 다 먹기 전에 판정이 왔다');
      if (scene.trail[scene.trail.length - 1] !== verdict.state) fail(`판정 자리 ${verdict.state} 가 멈춘 자리가 아니다`);
      return { base: scene.base, trail: scene.trail, verdict, step: { kind: 'verdict' } };
    }
    return fail(`모르는 이벤트 — ${event.type}`);
  },
};
