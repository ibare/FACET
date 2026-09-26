/**
 * frame-budget projector — algorithm 의 'phase'·'beat' 이벤트를 stage · 코드 패널 호출로 옮긴다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import type { FrameBudgetBeatPayload } from './frame-budget-stage.js';

type FrameBudgetStage = {
  onBeat(payload: FrameBudgetBeatPayload, speedMul: number): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

export const frameBudgetProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as FrameBudgetStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          codePanel?.highlightPhase(typeof p?.phase === 'string' ? p.phase : null);
          return;
        }
        case 'beat': {
          const p = event.payload as Record<string, unknown> | undefined;
          const beat = typeof p?.beat === 'number' ? p.beat : undefined;
          const position = typeof p?.position === 'number' ? p.position : undefined;
          const isNewFrame = typeof p?.isNewFrame === 'boolean' ? p.isNewFrame : undefined;
          const newFrames = typeof p?.newFrames === 'number' ? p.newFrames : undefined;
          const repeats = typeof p?.repeats === 'number' ? p.repeats : undefined;
          const fps = typeof p?.fps === 'number' ? p.fps : undefined;
          const frameCost = typeof p?.frameCost === 'number' ? p.frameCost : undefined;
          const prop = typeof p?.prop === 'number' ? p.prop : undefined;
          const boxCount = typeof p?.boxCount === 'number' ? p.boxCount : undefined;
          if (
            beat === undefined ||
            position === undefined ||
            isNewFrame === undefined ||
            newFrames === undefined ||
            repeats === undefined ||
            fps === undefined ||
            frameCost === undefined ||
            prop === undefined ||
            boxCount === undefined
          ) {
            throw new Error("'beat' 이벤트 payload 모양이 예상과 다르다");
          }
          stage?.onBeat({ beat, position, isNewFrame, newFrames, repeats, fps, frameCost, prop, boxCount }, runtime?.getSpeed() ?? 1);
          return;
        }
        default:
          return;
      }
    },
  };
};
