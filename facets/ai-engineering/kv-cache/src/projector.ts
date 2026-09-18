/**
 * KV 캐시 projector — 알고리즘 이벤트를 stage 호출로 옮긴다.
 *
 * 운동의 길이는 걸음 간격(`stepMs`)을 재생 속도로 나눈 값의 0.8 배라, 속도를 올려도
 * 운동이 걸음 경계를 넘지 않는다. 운동은 기다리지 않는다 — 걸음 사이의 머묾(`sleep`)
 * 안에서 흐르고, 다음 호출이 오면 stage 가 끝자리로 곧바로 보낸다.
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { KvCacheStage } from './kv-cache-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const flag = (v: unknown): 0 | 1 => (v === 1 ? 1 : 0);
const rec = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;

export const kvCacheProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as KvCacheStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let stepMs = 600;

  const animMs = () => {
    const speed = runtime ? runtime.getSpeed() : 1;
    return (stepMs * 0.8) / Math.max(0.01, speed);
  };

  return {
    onInit(initialData) {
      const d = rec(initialData);
      stepMs = num(d?.stepMs, 600);
      stage?.clear();
      code?.highlightPhase?.(null);
    },
    onEvent(event) {
      const p = rec(event.payload);
      switch (event.type) {
        case 'phase': {
          const phase = p && typeof p.phase === 'string' ? p.phase : null;
          code?.highlightPhase?.(phase);
          return;
        }
        case 'board': {
          if (!p) return;
          const plan = Array.isArray(p.plan) ? p.plan.map((x) => num(x)) : [];
          stage?.startBoard(
            {
              cache: flag(p.cache),
              steps: num(p.steps),
              plan,
              cacheFinal: num(p.cacheFinal),
              maxSteps: num(p.maxSteps),
              maxCells: num(p.maxCells),
              tokens: Array.isArray(p.tokens)
                ? p.tokens.filter((x): x is string => typeof x === 'string')
                : [],
            },
            animMs(),
          );
          return;
        }
        case 'step': {
          if (!p) return;
          stage?.showStep(
            {
              t: num(p.t, 1),
              cache: flag(p.cache),
              computed: num(p.computed),
              cachedBefore: num(p.cachedBefore),
              read: num(p.read),
              length: num(p.length),
            },
            animMs(),
          );
          return;
        }
        case 'finish': {
          if (!p) return;
          stage?.showFinish({
            cache: flag(p.cache),
            kv: num(p.kv),
            cacheSize: num(p.cacheSize),
            kvWithout: num(p.kvWithout),
            savedPct: num(p.savedPct),
          });
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.clear();
      code?.highlightPhase?.(null);
    },
  };
};
