/**
 * bayes projector — 알고리즘 이벤트를 bayes-stage 메서드와 코드 패널 강조로 옮긴다.
 *
 * 운동 길이 = payload 의 motionMs ÷ 지금 재생 속도 (걸음마다 그때그때 읽는다).
 * payload 는 typeof 가드로 읽고, 비거나 어긋나면 던진다.
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { BayesStage } from './bayes-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

function rec(payload: unknown, type: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error(`bayes projector: ${type} payload 가 없다`);
  return payload as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`bayes projector: ${type}.${key} 가 수가 아니다`);
  return v;
}

function numList(p: Record<string, unknown>, key: string, type: string): number[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(`bayes projector: ${type}.${key} 가 수 목록이 아니다`);
  }
  return v as number[];
}

export const bayesProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as BayesStage | undefined;
  if (stage === undefined) throw new Error('bayes projector: stage 가 없다');
  const panel = views.codePanel as unknown as CodePanel | undefined;

  const duration = (p: Record<string, unknown>, type: string): number => {
    const motion = num(p, 'motionMs', type);
    const speed = runtime?.getSpeed() ?? 1;
    if (!(speed > 0)) throw new Error('bayes projector: 재생 속도가 양수가 아니다');
    return motion / speed;
  };

  return {
    onReset() {
      stage.reset();
      panel?.highlightPhase?.(null);
    },
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          const phase = p.phase;
          if (typeof phase !== 'string') throw new Error('bayes projector: phase 이름이 없다');
          panel?.highlightPhase?.(phase);
          return;
        }
        case 'init': {
          const p = rec(event.payload, 'init');
          panel?.highlightPhase?.(null);
          void stage.showStart({
            population: num(p, 'population', 'init'),
            sick: num(p, 'sick', 'init'),
            healthy: num(p, 'healthy', 'init'),
            num: num(p, 'num', 'init'),
            den: num(p, 'den', 'init'),
            ppvPermille: num(p, 'ppvPermille', 'init'),
            healthyPermille: num(p, 'healthyPermille', 'init'),
            sickShare: num(p, 'sickShare', 'init'),
            healthyShare: num(p, 'healthyShare', 'init'),
            maxPositives: num(p, 'maxPositives', 'init'),
            durationMs: duration(p, 'init'),
          });
          return;
        }
        case 'multiply': {
          const p = rec(event.payload, 'multiply');
          void stage.showMultiply({
            i: num(p, 'i', 'multiply'),
            numBefore: num(p, 'numBefore', 'multiply'),
            num: num(p, 'num', 'multiply'),
            den: num(p, 'den', 'multiply'),
            ratio: num(p, 'ratio', 'multiply'),
            sensitivityPct: num(p, 'sensitivityPct', 'multiply'),
            falsePositivePct: num(p, 'falsePositivePct', 'multiply'),
            sickShare: num(p, 'sickShare', 'multiply'),
            healthyShare: num(p, 'healthyShare', 'multiply'),
            durationMs: duration(p, 'multiply'),
          });
          return;
        }
        case 'normalize': {
          const p = rec(event.payload, 'normalize');
          void stage.showNormalize({
            i: num(p, 'i', 'normalize'),
            num: num(p, 'num', 'normalize'),
            den: num(p, 'den', 'normalize'),
            ppvPermille: num(p, 'ppvPermille', 'normalize'),
            healthyPermille: num(p, 'healthyPermille', 'normalize'),
            sickShare: num(p, 'sickShare', 'normalize'),
            healthyShare: num(p, 'healthyShare', 'normalize'),
            durationMs: duration(p, 'normalize'),
          });
          return;
        }
        case 'cross': {
          const p = rec(event.payload, 'cross');
          stage.showCross({
            trail: numList(p, 'trail', 'cross'),
            firstOver: num(p, 'firstOver', 'cross'),
            maxPositives: num(p, 'maxPositives', 'cross'),
          });
          return;
        }
        default:
          throw new Error(`bayes projector: 모르는 이벤트 ${event.type}`);
      }
    },
  };
};
