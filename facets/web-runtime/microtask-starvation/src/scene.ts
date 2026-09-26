/**
 * microtask-starvation 의 장면 — 바탕(코드 · 상수) · 자취(DOM · 화면 · 지난 경계) ·
 * 이번 걸음을 가른다. 셈(경계 판정 · 렌더 여부)은 algorithm 이 이미 마쳐 이벤트에
 * 실어 보낸다 — 여기서는 잇기만 한다.
 */
import type { ScenePlan } from '@ffacet/core/runtime';
import type { BoundaryMark } from './algorithm.js';

export type MicrotaskStarvationStep =
  | { readonly kind: 'initial' }
  | { readonly kind: 'click' }
  | { readonly kind: 'step'; readonly n: number; readonly queued: boolean; readonly justPassed: readonly BoundaryMark[] }
  | { readonly kind: 'render' };

export type MicrotaskStarvationScene = {
  // 바탕
  readonly code: readonly string[];
  readonly workMs: number;
  readonly count: number;
  // 자취
  readonly dom: number;
  readonly screen: number;
  readonly queued: boolean;
  readonly passed: readonly BoundaryMark[];
  readonly renderedBoundaries: readonly BoundaryMark[] | null;
  // 이번 걸음
  readonly step: MicrotaskStarvationStep;
};

function readBoundaryMark(v: unknown): BoundaryMark {
  if (typeof v !== 'object' || v === null) {
    throw new TypeError('microtaskStarvationScene: 경계 표시가 객체가 아니다');
  }
  const r = v as Record<string, unknown>;
  if (typeof r.index !== 'number' || typeof r.ms !== 'number') {
    throw new TypeError('microtaskStarvationScene: 경계 표시의 index/ms 가 수가 아니다');
  }
  return { index: r.index, ms: r.ms };
}

function readBoundaryMarks(v: unknown): BoundaryMark[] {
  if (!Array.isArray(v)) {
    throw new TypeError('microtaskStarvationScene: 경계 표시 목록이 배열이 아니다');
  }
  return v.map(readBoundaryMark);
}

function readInitialData(data: unknown): { code: string[]; workMs: number; count: number } {
  if (typeof data !== 'object' || data === null) {
    throw new TypeError('microtaskStarvationScene.initial: initialData 가 객체가 아니다');
  }
  const d = data as Record<string, unknown>;
  const code = d.code;
  if (!Array.isArray(code) || !code.every((line) => typeof line === 'string')) {
    throw new TypeError('microtaskStarvationScene.initial: code 가 문자열 배열이 아니다');
  }
  if (typeof d.workMs !== 'number') {
    throw new TypeError('microtaskStarvationScene.initial: workMs 가 수가 아니다');
  }
  if (typeof d.count !== 'number') {
    throw new TypeError('microtaskStarvationScene.initial: count 가 수가 아니다');
  }
  return { code: [...(code as string[])], workMs: d.workMs, count: d.count };
}

export const microtaskStarvationScene: ScenePlan<MicrotaskStarvationScene> = {
  initial(initialData) {
    const { code, workMs, count } = readInitialData(initialData);
    return {
      code,
      workMs,
      count,
      dom: 0,
      screen: 0,
      queued: false,
      passed: [],
      renderedBoundaries: null,
      step: { kind: 'initial' },
    };
  },

  reduce(scene, event) {
    switch (event.type) {
      case 'click': {
        return { ...scene, queued: true, step: { kind: 'click' } };
      }
      case 'step': {
        const payload = event.payload;
        if (typeof payload !== 'object' || payload === null) {
          throw new TypeError('microtaskStarvationScene.reduce(step): payload 가 객체가 아니다');
        }
        const p = payload as Record<string, unknown>;
        if (typeof p.n !== 'number') {
          throw new TypeError('microtaskStarvationScene.reduce(step): n 이 수가 아니다');
        }
        if (typeof p.queued !== 'boolean') {
          throw new TypeError('microtaskStarvationScene.reduce(step): queued 가 불이 아니다');
        }
        const passed = readBoundaryMarks(p.passed);
        const justPassed = readBoundaryMarks(p.justPassed);
        return {
          ...scene,
          dom: p.n,
          queued: p.queued,
          passed,
          step: { kind: 'step', n: p.n, queued: p.queued, justPassed },
        };
      }
      case 'render': {
        const payload = event.payload;
        if (typeof payload !== 'object' || payload === null) {
          throw new TypeError('microtaskStarvationScene.reduce(render): payload 가 객체가 아니다');
        }
        const p = payload as Record<string, unknown>;
        if (typeof p.screen !== 'number') {
          throw new TypeError('microtaskStarvationScene.reduce(render): screen 이 수가 아니다');
        }
        const covered = readBoundaryMarks(p.covered);
        return {
          ...scene,
          screen: p.screen,
          passed: [],
          renderedBoundaries: covered,
          step: { kind: 'render' },
        };
      }
      default:
        throw new Error(`microtaskStarvationScene.reduce: 모르는 이벤트 ${event.type}`);
    }
  },
};
