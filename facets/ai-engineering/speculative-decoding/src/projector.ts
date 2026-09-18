/**
 * 사색적 디코딩 projector — 알고리즘 이벤트를 stage 호출로 옮긴다.
 *
 * 운동 길이는 재생 속도를 따른다 (걸음 길이 stepMs ÷ 속도의 일부). 요소를 만들 때 한 번 박지 않는다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorViews } from '@ffacet/core/runtime';
import { splitTokens } from './algorithm.js';
import type { SpeculativeDecodingStage, SpeculativeDecodingStageData } from './speculative-decoding-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

const num = (o: Record<string, unknown>, key: string): number | null =>
  typeof o[key] === 'number' ? (o[key] as number) : null;

function narrowData(raw: unknown): (SpeculativeDecodingStageData & { stepMs: number }) | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.target !== 'string' || typeof o.guess !== 'string') return null;
  if (!Array.isArray(o.ladder) || !o.ladder.every((v) => typeof v === 'number')) return null;
  const draftCost = num(o, 'draftCost');
  const checkCost = num(o, 'checkCost');
  if (draftCost === null || checkCost === null) return null;
  const target = splitTokens(o.target);
  const guess = splitTokens(o.guess);
  const ladder = o.ladder as number[];
  return { target, guess, ladder, draftCost, checkCost, stepMs: num(o, 'stepMs') ?? 1000 };
}

export const speculativeDecodingProjector: ProjectorFactory = (views: ProjectorViews, runtime) => {
  const stage = views.stage as unknown as SpeculativeDecodingStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  let stepMs = 1000;

  const dur = (share: number) => (stepMs * share) / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onInit(initialData: unknown) {
      const data = narrowData(initialData);
      if (!data) return;
      stepMs = data.stepMs;
      stage?.setup(data);
      panel?.clearHighlight?.();
    },
    onEvent(event: FacetRuntimeEvent) {
      const p = (typeof event.payload === 'object' && event.payload !== null ? event.payload : {}) as Record<string, unknown>;
      switch (event.type) {
        case 'phase': {
          panel?.highlightPhase?.(typeof p.phase === 'string' ? p.phase : null);
          return;
        }
        case 'run-start': {
          const gamma = num(p, 'gamma');
          const index = num(p, 'index');
          const maxCost = num(p, 'maxCost');
          if (gamma === null || index === null || maxCost === null) return;
          stage?.startRun(gamma, index, maxCost, dur(0.7));
          return;
        }
        case 'draft': {
          const round = num(p, 'round');
          const from = num(p, 'from');
          const k = num(p, 'k');
          if (round === null || from === null || k === null) return;
          stage?.draft(round, from, k, dur(0.7));
          return;
        }
        case 'verify': {
          const round = num(p, 'round');
          const from = num(p, 'from');
          const k = num(p, 'k');
          const accepted = num(p, 'accepted');
          if (round === null || from === null || k === null || accepted === null) return;
          stage?.verify(round, from, k, accepted, dur(0.8));
          return;
        }
        case 'run-end': {
          const gamma = num(p, 'gamma');
          const index = num(p, 'index');
          const checks = num(p, 'checks');
          const drafted = num(p, 'drafted');
          const rejected = num(p, 'rejected');
          const cost = num(p, 'cost');
          const perCheckX100 = num(p, 'perCheckX100');
          if (
            gamma === null || index === null || checks === null || drafted === null ||
            rejected === null || cost === null || perCheckX100 === null
          ) return;
          stage?.endRun({ gamma, index, checks, drafted, rejected, cost, perCheckX100 }, dur(0.5));
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      panel?.clearHighlight?.();
    },
  };
};
