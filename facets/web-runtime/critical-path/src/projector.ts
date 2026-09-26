/**
 * critical-path 의 번역기 — algorithm 의 'timeline'/'phase' 이벤트를 stage 메서드 호출과
 * 코드 패널 하이라이트로 옮긴다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';

type StageHandle = {
  applyTimeline(kind: string, payload: Record<string, unknown>, speedMul: number): void;
};

type CodePanelHandle = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

export const criticalPathProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as StageHandle | undefined;
  const codePanel = views.codePanel as unknown as CodePanelHandle | undefined;

  return {
    onEvent(event) {
      const speed = runtime?.getSpeed() ?? 1;
      switch (event.type) {
        case 'timeline': {
          const payload = event.payload;
          if (typeof payload !== 'object' || payload === null) return;
          const p = payload as Record<string, unknown>;
          const kind = typeof p.kind === 'string' ? p.kind : undefined;
          if (kind) stage?.applyTimeline(kind, p, speed);
          return;
        }
        case 'phase': {
          const payload = event.payload;
          const phase =
            typeof payload === 'object' && payload !== null && typeof (payload as { phase?: unknown }).phase === 'string'
              ? (payload as { phase: string }).phase
              : null;
          codePanel?.highlightPhase(phase);
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      codePanel?.clearHighlight();
    },
  };
};
