/**
 * 온도와 표본 추출 — projector.
 *
 * 알고리즘 이벤트를 stage 메서드 호출로 옮기고, phase 를 코드 패널에 넘긴다.
 * 운동 길이는 재생 속도를 따라간다 — 걸음마다 payload 의 ms 를 지금 속도로 나눠 넘긴다.
 * payload 는 이름 붙은 타입으로 믿지 않고 typeof 로 좁힌다.
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { TemperatureSamplingStage } from './temperature-sampling-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

function rec(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : null;
}
function num(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}
function nums(x: unknown): number[] | null {
  if (!Array.isArray(x)) return null;
  const out: number[] = [];
  for (const v of x) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out.push(v);
  }
  return out;
}

export const temperatureSamplingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as TemperatureSamplingStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const pace = (ms: number | null): number => (ms ?? 0) / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onReset() {
      stage?.reset();
      code?.highlightPhase?.(null);
    },
    onEvent(event) {
      const p = rec(event.payload);
      switch (event.type) {
        case 'phase': {
          const name = p?.['phase'];
          if (typeof name === 'string') code?.highlightPhase?.(name);
          return;
        }
        case 'setup': {
          const used = nums(p?.['used']);
          const us = nums(p?.['us']);
          const draws = num(p?.['draws']);
          const seed = num(p?.['seed']);
          if (used && us && draws !== null && seed !== null) stage?.setup({ used, us, draws, seed });
          return;
        }
        case 'penalize': {
          const penalty = num(p?.['penalty']);
          const penalized = nums(p?.['penalized']);
          if (penalty !== null && penalized) stage?.penalize(penalty, penalized, pace(num(p?.['ms'])));
          return;
        }
        case 'scale': {
          const temperature = num(p?.['temperature']);
          const scaled = nums(p?.['scaled']);
          if (temperature !== null && scaled) stage?.scale(temperature, scaled, pace(num(p?.['ms'])));
          return;
        }
        case 'share': {
          const probs = nums(p?.['probs']);
          const top = num(p?.['top']);
          const topPercent = num(p?.['topPercent']);
          if (probs && top !== null && topPercent !== null) {
            stage?.share(probs, top, topPercent, pace(num(p?.['ms'])));
          }
          return;
        }
        case 'draw': {
          const n = num(p?.['n']);
          const u = num(p?.['u']);
          const pick = num(p?.['pick']);
          const count = num(p?.['count']);
          const repeat = p?.['repeat'];
          if (n !== null && u !== null && pick !== null && count !== null && typeof repeat === 'boolean') {
            stage?.drop(n, u, pick, count, repeat, pace(num(p?.['ms'])));
          }
          return;
        }
        case 'tally': {
          const counts = nums(p?.['counts']);
          const distinct = num(p?.['distinct']);
          const repeats = num(p?.['repeats']);
          const draws = num(p?.['draws']);
          if (counts && distinct !== null && repeats !== null && draws !== null) {
            stage?.tally(counts, distinct, repeats, draws);
          }
          return;
        }
        default:
          return;
      }
    },
    onDestroy() {
      code?.highlightPhase?.(null);
    },
  };
};
