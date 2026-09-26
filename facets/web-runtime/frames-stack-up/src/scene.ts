/**
 * frames-stack-up 의 장면.
 *
 * 바탕(initial 이 한 번 정하는 것) — code · lineOf.
 * 자취(걸음이 쌓는 것) — stack · queue.
 * 이번 걸음 — step (그림이 무엇을 움직일지 고르는 자리).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { FramesStackUpFacetData } from './algorithm.js';

export type FramesStackUpStep =
  | { kind: 'push'; id: string; from: 'queue' | 'call' }
  | { kind: 'schedule'; id: string }
  | { kind: 'pop'; id: string };

export type FramesStackUpScene = {
  /** 실제 자바스크립트 코드 다섯 줄 (자료). */
  code: string[];
  /** 프레임 id → 코드 줄 번호 (1-based). */
  lineOf: Record<string, number>;
  /** 지금 쌓인 프레임 id, 바닥부터 위 순서. */
  stack: string[];
  /** 지금 태스크 줄에 선 프레임 id, 앞부터 순서. */
  queue: string[];
  /** 이번 걸음에 일어난 일. 걸음 0 은 null. */
  step: FramesStackUpStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export const framesStackUpScene: ScenePlan<FramesStackUpScene> = {
  initial(initialData: unknown): FramesStackUpScene {
    if (!isRecord(initialData)) {
      throw new Error('frames-stack-up: initialData 가 객체가 아니다');
    }
    const data = initialData as unknown as FramesStackUpFacetData;
    const lineOf: Record<string, number> = {};
    for (const frame of data.chain) lineOf[frame.id] = frame.line;
    lineOf[data.callback.id] = data.callback.line;
    return {
      code: [...data.code],
      lineOf,
      stack: [],
      queue: [data.chain[0].id],
      step: null,
    };
  },

  reduce(scene: FramesStackUpScene, event: FacetRuntimeEvent): FramesStackUpScene {
    if (!isRecord(event.payload)) {
      throw new Error(`frames-stack-up: ${event.type} payload 가 객체가 아니다`);
    }
    const { id } = event.payload;
    if (typeof id !== 'string') {
      throw new Error(`frames-stack-up: ${event.type} payload.id 가 문자열이 아니다`);
    }

    if (event.type === 'push') {
      const { from } = event.payload;
      if (from !== 'queue' && from !== 'call') {
        throw new Error(`frames-stack-up: push payload.from 이 올바르지 않다 (${String(from)})`);
      }
      if (from === 'queue') {
        if (scene.queue[0] !== id) {
          throw new Error(`frames-stack-up: 태스크 줄 맨 앞이 ${id} 가 아니다 (${String(scene.queue[0])})`);
        }
        return {
          ...scene,
          stack: [...scene.stack, id],
          queue: scene.queue.slice(1),
          step: { kind: 'push', id, from },
        };
      }
      return { ...scene, stack: [...scene.stack, id], step: { kind: 'push', id, from } };
    }

    if (event.type === 'schedule') {
      return { ...scene, queue: [...scene.queue, id], step: { kind: 'schedule', id } };
    }

    if (event.type === 'pop') {
      if (scene.stack[scene.stack.length - 1] !== id) {
        throw new Error(`frames-stack-up: 스택 꼭대기가 ${id} 가 아니다 (${String(scene.stack[scene.stack.length - 1])})`);
      }
      return { ...scene, stack: scene.stack.slice(0, -1), step: { kind: 'pop', id } };
    }

    throw new Error(`frames-stack-up: 모르는 이벤트 ${event.type}`);
  },
};
