/**
 * policy-gradient projector — 알고리즘 이벤트를 무대 메서드와 코드 패널 강조로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 운동 길이는 걸음 길이(payload.ms)를 지금 재생 속도로 나눠 그때그때 정한다.
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { PolicyGradientStage } from './policy-gradient-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

/** 운동이 걸음 길이 안에서 끝나도록 걸음의 이만큼만 쓴다. */
const MOTION_SHARE = 0.6;

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`policyGradientProjector: ${what} payload 가 없다`);
  return v as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`policyGradientProjector: ${key} 가 수가 아니다`);
  return v;
}

function nums(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) {
    throw new Error(`policyGradientProjector: ${key} 가 수의 목록이 아니다`);
  }
  return v.slice() as number[];
}

function matrix(p: Record<string, unknown>, key: string): number[][] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`policyGradientProjector: ${key} 가 목록이 아니다`);
  return v.map((row: unknown, i) => nums({ [`${key}[${i}]`]: row }, `${key}[${i}]`));
}

function strs(p: Record<string, unknown>, key: string): string[] {
  const v = p[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error(`policyGradientProjector: ${key} 가 문자열 목록이 아니다`);
  return v.slice() as string[];
}

export const policyGradientProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PolicyGradientStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;

  const motion = (ms: number): number => {
    const speed = runtime?.getSpeed() ?? 1;
    if (!(speed > 0)) throw new Error('policyGradientProjector: 재생 속도가 0 이하다');
    return (ms / speed) * MOTION_SHARE;
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase');
          const ph = p.phase;
          if (typeof ph !== 'string') throw new Error('policyGradientProjector: phase 가 문자열이 아니다');
          code?.highlightPhase(ph);
          return;
        }
        case 'pg-start': {
          const p = obj(event.payload, 'pg-start');
          stage?.start({
            actions: strs(p, 'actions'),
            rewards: nums(p, 'rewards'),
            gains: nums(p, 'gains'),
            pis: matrix(p, 'pis'),
            leaders: nums(p, 'leaders'),
            best: num(p, 'best'),
            total: num(p, 'total'),
            bestLeads: num(p, 'bestLeads'),
            otherLeads: num(p, 'otherLeads'),
            durationMs: motion(num(p, 'ms')),
          });
          return;
        }
        case 'pg-episode': {
          const p = obj(event.payload, 'pg-episode');
          stage?.episode({
            episode: num(p, 'episode'),
            total: num(p, 'total'),
            best: num(p, 'best'),
            pis: matrix(p, 'pis'),
            chosen: nums(p, 'chosen'),
            advantages: nums(p, 'advantages'),
            leaders: nums(p, 'leaders'),
            bestLeads: num(p, 'bestLeads'),
            otherLeads: num(p, 'otherLeads'),
            durationMs: motion(num(p, 'ms')),
          });
          return;
        }
        case 'pg-final': {
          const p = obj(event.payload, 'pg-final');
          stage?.final({
            total: num(p, 'total'),
            best: num(p, 'best'),
            pis: matrix(p, 'pis'),
            leaders: nums(p, 'leaders'),
            bestLeads: num(p, 'bestLeads'),
            otherLeads: num(p, 'otherLeads'),
            durationMs: motion(num(p, 'ms')),
          });
          return;
        }
        default:
          throw new Error(`policyGradientProjector: 모르는 이벤트 '${event.type}'`);
      }
    },
    onReset() {
      code?.highlightPhase(null);
    },
  };
};
