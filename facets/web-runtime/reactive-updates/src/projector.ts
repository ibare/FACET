/**
 * reactive-updates 의 projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * `phase` 이벤트마다 코드 패널을 짚고, 같은 자리에서 phase 별 캡션도 세운다
 * (사양의 여섯 phase 와 1:1).
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { ReactiveUpdatesStageInstance } from './reactive-updates-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

/** 애니메이션 기준 길이(ms). 재생 속도로 나눠 그때그때 조정한다. */
const ANIM_BASE_MS = 480;

function captionOf(phase: string, t: (key: string, fallback: string) => string): string {
  switch (phase) {
    case 'read-init':
      return t('caption.readInit', 'Values draw a subscribe line to each view that reads them.');
    case 'write-sync':
      return t('caption.writeSync', 'A write follows its lines and re-renders those views right away.');
    case 'write-batch':
      return t('caption.writeBatch', 'A write is stashed in the batch box instead of rendering yet.');
    case 'flush-batch':
      return t('caption.flushBatch', 'The batch box empties and the stashed views render all at once.');
    case 'write-scan':
      return t('caption.writeScan', 'A write changes the value quietly — nobody is told yet.');
    case 'scan-round':
      return t('caption.scanRound', 'A cursor sweeps every value from start to end, looking for changes.');
    default:
      return '';
  }
}

export const reactiveUpdatesProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as ReactiveUpdatesStageInstance | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  const duration = (): number => Math.max(120, ANIM_BASE_MS / Math.max(0.01, runtime?.getSpeed() ?? 1));

  return {
    onEvent(event): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload;
          const phase = typeof p === 'object' && p !== null ? (p as Record<string, unknown>).phase : undefined;
          if (typeof phase !== 'string') return;
          codePanel?.highlightPhase(phase);
          stage?.setCaption(captionOf(phase, t));
          return;
        }
        case 'subscribe': {
          const p = event.payload;
          if (typeof p !== 'object' || p === null) return;
          const { value, view } = p as Record<string, unknown>;
          if (typeof value !== 'string' || typeof view !== 'string') return;
          stage?.subscribe(value, view, duration());
          return;
        }
        case 'render': {
          const p = event.payload;
          if (typeof p !== 'object' || p === null) return;
          const rec = p as Record<string, unknown>;
          const { view, text, mode, via } = rec;
          if (typeof view !== 'string' || typeof text !== 'string' || typeof mode !== 'string') return;
          if (mode !== 'init' && mode !== 'sync' && mode !== 'flush' && mode !== 'scan') return;
          stage?.renderView(view, text, mode, typeof via === 'string' ? via : undefined, duration());
          return;
        }
        case 'stash': {
          const p = event.payload;
          if (typeof p !== 'object' || p === null) return;
          const { name, value } = p as Record<string, unknown>;
          if (typeof name !== 'string' || typeof value !== 'string') return;
          stage?.stash(name, value, duration());
          return;
        }
        case 'flush': {
          const p = event.payload;
          if (typeof p !== 'object' || p === null) return;
          const { count } = p as Record<string, unknown>;
          if (typeof count !== 'number') return;
          stage?.flush(count, duration());
          return;
        }
        case 'scan-tick': {
          const p = event.payload;
          if (typeof p !== 'object' || p === null) return;
          const { index, name, changed } = p as Record<string, unknown>;
          if (typeof index !== 'number' || typeof name !== 'string' || typeof changed !== 'boolean') return;
          stage?.scanTick(index, name, changed, duration());
          return;
        }
        default:
          return;
      }
    },
  };
};
