/**
 * repaint-cost projector — algorithm 의 이벤트를 stage/code-view 호출로 옮긴다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type { Rect, RoundSummary } from './algorithm.js';
import type { RepaintCostStageInstance } from './repaint-cost-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

function isRectRecord(v: unknown): v is Record<string, Rect> {
  if (typeof v !== 'object' || v === null) return false;
  return Object.values(v as Record<string, unknown>).every(
    (r) =>
      typeof r === 'object' &&
      r !== null &&
      typeof (r as Rect).x === 'number' &&
      typeof (r as Rect).y === 'number' &&
      typeof (r as Rect).w === 'number' &&
      typeof (r as Rect).h === 'number',
  );
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isSummary(v: unknown): v is RoundSummary {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.chain === 'string' &&
    typeof s.renderTreeChange === 'number' &&
    typeof s.boxesRemeasured === 'number' &&
    typeof s.repaintedCount === 'number' &&
    typeof s.repaintedList === 'string' &&
    typeof s.layers === 'number'
  );
}

export const repaintCostProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RepaintCostStageInstance | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  // 문안은 stage 가 자기 t(params.t)로 그린다 — projector 는 배선만 하고 문안을 만들지 않는다.

  return {
    onEvent(event: FacetRuntimeEvent): void {
      const speed = runtime?.getSpeed() ?? 1;
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          if (typeof p?.phase === 'string') code?.highlightPhase?.(p.phase);
          return;
        }
        case 'reset-round': {
          const p = event.payload as { property?: unknown; cardLayer?: unknown } | undefined;
          if (typeof p?.property === 'number' && typeof p.cardLayer === 'number') {
            code?.clearHighlight?.();
            stage?.resetRound(p.property, p.cardLayer);
          }
          return;
        }
        case 'stage': {
          const p = event.payload as { stage?: unknown } | undefined;
          switch (p?.stage) {
            case 'style':
              stage?.runStyle(speed);
              return;
            case 'layout': {
              const rects = (p as { rects?: unknown }).rects;
              const removed = (p as { removed?: unknown }).removed;
              if (isRectRecord(rects) && isStringArray(removed)) {
                stage?.runLayout(rects, removed, speed);
              }
              return;
            }
            case 'paint': {
              const id = (p as { id?: unknown }).id;
              if (typeof id === 'string') stage?.runPaint(id, speed);
              return;
            }
            case 'composite': {
              const dx = (p as { dx?: unknown }).dx;
              const summary = (p as { summary?: unknown }).summary;
              if (typeof dx === 'number' && isSummary(summary)) {
                stage?.runComposite(dx, summary, speed);
              }
              return;
            }
            default:
              return;
          }
        }
        default:
          return;
      }
    },
  };
};
