import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { toFontSwapData } from './algorithm.js';

export type FontSwapPhase = 'blank' | 'fallback' | 'brand';

export type FontSwapStep =
  | { kind: 'blank' }
  | { kind: 'firstPaint'; atMs: number }
  | { kind: 'fontRequested'; atMs: number }
  | { kind: 'fontArrived'; atMs: number }
  | { kind: 'repaint'; atMs: number };

/**
 * 바탕(낱말 · 글자 폭 · 상자 폭)은 `initialData` 에 고정이라 stage 가 mount 때
 * 제 몫으로 다시 읽는다 — 장면은 걸음이 쌓는 자취(무엇이 왔는지)와 이번 걸음만 쥔다.
 */
export interface FontSwapScene {
  phase: FontSwapPhase;
  fontRequested: boolean;
  fontArrived: boolean;
  step: FontSwapStep;
}

function atMsOf(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('font-swap scene: payload 가 없다');
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.atMs !== 'number') throw new Error('font-swap scene: payload.atMs 가 수가 아니다');
  return p.atMs;
}

export const fontSwapScene: ScenePlan<FontSwapScene> = {
  initial(initialData: unknown): FontSwapScene {
    // 모양만 확인한다 — 값은 stage 가 mount 때 제 몫으로 다시 읽는다.
    toFontSwapData(initialData);
    return { phase: 'blank', fontRequested: false, fontArrived: false, step: { kind: 'blank' } };
  },
  reduce(scene: FontSwapScene, event: FacetRuntimeEvent): FontSwapScene {
    switch (event.type) {
      case 'first-paint':
        return { ...scene, phase: 'fallback', step: { kind: 'firstPaint', atMs: atMsOf(event.payload) } };
      case 'font-requested':
        return { ...scene, fontRequested: true, step: { kind: 'fontRequested', atMs: atMsOf(event.payload) } };
      case 'font-arrived':
        return { ...scene, fontArrived: true, step: { kind: 'fontArrived', atMs: atMsOf(event.payload) } };
      case 'repaint':
        return { ...scene, phase: 'brand', step: { kind: 'repaint', atMs: atMsOf(event.payload) } };
      default:
        throw new Error(`font-swap scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
