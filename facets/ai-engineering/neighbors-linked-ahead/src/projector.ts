/**
 * 걸음 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 넘긴다 (C9). stage 는 필수 필드 타입으로
 * 받으므로 event.payload 를 그대로 전달하지 않는다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 내주는 표면. 없는 메서드에 대비해 전부 optional 로 받는다 (C9). */
type NeighborsStage = {
  setGraph?(links: ReadonlyArray<readonly [number, number]>, start: number): void | Promise<void>;
  probe?(from: number, candidates: number[], best: number | null): void | Promise<void>;
  stepTo?(from: number, to: number): void | Promise<void>;
  settle?(at: number): void | Promise<void>;
  rewind?(): void;
  setCaption?(text: string): void;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function int(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function intArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function linkArray(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  const out: [number, number][] = [];
  for (const entry of value) {
    if (!Array.isArray(entry)) continue;
    const a = int(entry[0]);
    const b = int(entry[1]);
    if (a === null || b === null) continue;
    out.push([a, b]);
  }
  return out;
}

export const neighborsLinkedAheadProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as NeighborsStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      const payload = record(event.payload);

      switch (event.type) {
        case 'graph-ready': {
          const links = linkArray(payload?.links);
          const start = int(payload?.start) ?? 0;
          const k = int(payload?.k) ?? 0;
          stage.setCaption?.(
            tr('caption.begin', 'Every dot is already linked to its {k} nearest. Stand on one.', { k }),
          );
          await stage.setGraph?.(links, start);
          break;
        }
        case 'probe': {
          const from = int(payload?.from);
          if (from === null) break;
          const candidates = intArray(payload?.candidates);
          const best = int(payload?.best);
          stage.setCaption?.(tr('caption.probe', 'Look only at the neighbours of where you stand.'));
          await stage.probe?.(from, candidates, best);
          break;
        }
        case 'step-to': {
          const from = int(payload?.from);
          const to = int(payload?.to);
          if (from === null || to === null) break;
          stage.setCaption?.(tr('caption.move', 'One of them sits closer to the query. Step onto it.'));
          await stage.stepTo?.(from, to);
          break;
        }
        case 'settle': {
          const at = int(payload?.at);
          if (at === null) break;
          stage.setCaption?.(tr('caption.settle', 'No neighbour is closer. The walk stops here.'));
          await stage.settle?.(at);
          break;
        }
        case 'rewind': {
          stage.rewind?.();
          break;
        }
        default:
          // 그 밖의 이벤트는 이 조각이 쓰지 않는다 — 조용히 흘린다 (C2).
          break;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
