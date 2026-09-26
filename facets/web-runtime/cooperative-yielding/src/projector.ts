/**
 * cooperative-yielding — algorithm 이벤트를 stage · 코드 패널 메서드 호출로 옮긴다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';

type Stage = {
  startRound(p: { chunkSize: number; via: number; numChunks: number; chunkMs: number }, speed: number): void;
  growDom(dom: number, speed: number): void;
  renderScreen(dom: number, speed: number): void;
  clickEvent(p: { id: string; arrivalMs: number; waitMs: number }, speed: number): void;
  markDone(atMs: number): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

export const cooperativeYieldingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const speed = (): number => runtime?.getSpeed() ?? 1;

  return {
    onEvent(event: FacetRuntimeEvent): void {
      const p = event.payload as Record<string, unknown> | undefined;
      switch (event.type) {
        case 'phase': {
          const phase = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase(phase);
          return;
        }
        case 'round-start': {
          codePanel?.clearHighlight();
          if (
            typeof p?.chunkSize === 'number' &&
            typeof p.via === 'number' &&
            typeof p.numChunks === 'number' &&
            typeof p.chunkMs === 'number'
          ) {
            stage?.startRound({ chunkSize: p.chunkSize, via: p.via, numChunks: p.numChunks, chunkMs: p.chunkMs }, speed());
          }
          return;
        }
        case 'chunk': {
          if (typeof p?.dom === 'number') stage?.growDom(p.dom, speed());
          return;
        }
        case 'render': {
          if (typeof p?.dom === 'number') stage?.renderScreen(p.dom, speed());
          return;
        }
        case 'click': {
          if (typeof p?.id === 'string' && typeof p.arrivalMs === 'number' && typeof p.waitMs === 'number') {
            stage?.clickEvent({ id: p.id, arrivalMs: p.arrivalMs, waitMs: p.waitMs }, speed());
          }
          return;
        }
        case 'done': {
          if (typeof p?.atMs === 'number') stage?.markDone(p.atMs);
          return;
        }
        default:
          // 그 밖의 이벤트는 없다 — 조용히 무시(위 switch 가 algorithm 이 보내는 전부다).
          return;
      }
    },
  };
};
