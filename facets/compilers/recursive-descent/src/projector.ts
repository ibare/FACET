/**
 * recursive-descent projector — 판 머리 · 걸음 · phase 를 무대와 코드 패널에 옮긴다.
 *
 * 판 머리(`parse-round`)에서 코드 패널을 끈다 — 걸음 0 은 부름이 없어 켜질 줄이 없다.
 * 걸음(`parse-step`)마다 재생 속도를 그때그때 읽어 무대에 넘긴다 (운동 길이가 속도를 따른다).
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { readRoundPayload, readStepPayload, type RoundPayload, type StepPayload } from './algorithm.js';

/** 무대가 여는 표면 */
type RecursiveDescentStage = {
  setRound(r: RoundPayload): void;
  setStep(s: StepPayload, speed: number): void;
  reset(): void;
};

type CodePanel = { highlightPhase(phase: string | null): void };

export const recursiveDescentProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RecursiveDescentStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  return {
    onReset() {
      stage?.reset();
      code?.highlightPhase(null);
    },
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'parse-round': {
          stage?.setRound(readRoundPayload(event.payload));
          code?.highlightPhase(null);
          return;
        }
        case 'parse-step': {
          stage?.setStep(readStepPayload(event.payload), runtime?.getSpeed() ?? 1);
          return;
        }
        case 'phase': {
          const p = event.payload;
          const phase = typeof p === 'object' && p !== null ? (p as { phase?: unknown }).phase : undefined;
          if (typeof phase !== 'string') throw new Error('phase payload 에 phase 가 없다');
          code?.highlightPhase(phase);
          return;
        }
        default:
          throw new Error(`recursive-descent projector 가 모르는 이벤트: ${event.type}`);
      }
    },
  };
};
