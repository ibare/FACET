/**
 * kruskalMstProjector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 여기서 하는 일은 번역뿐이다. 좌표도 색도 문안도 stage 가 가지고 있고,
 * 이 파일은 payload 를 좁혀 넘기는 것만 한다 (원칙 5 · C9).
 *
 * `phase` 는 `silent: true` 로 오지만 **projector 에는 온다.** 코드 패널의 줄
 * 맞춤이 여기를 지나므로 빠뜨리면 재생 내내 아무 줄도 짚지 않는다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance, ProjectorViews } from '@ffacet/core/runtime';

/** stage 가 노출하는 표면. 없는 메서드는 `?.()` 로 건너뛴다. */
type KruskalStage = {
  setup?(data: unknown): void;
  makeSet?(roots: number[]): void;
  swapSlots?(a: number, b: number): void;
  focusEdge?(slot: number, id: number): void;
  showRoots?(rootU: number, rootV: number): void;
  judge?(same: boolean, rootU: number, rootV: number): void;
  linkEdge?(id: number): void;
  dropEdge?(id: number): void;
  setGroups?(roots: number[]): void;
  finish?(picked: number, dropped: number, total: number): void;
  resetAll?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

const numList = (x: unknown): number[] | null =>
  Array.isArray(x) && x.every((n) => typeof n === 'number') ? (x as number[]) : null;

export const kruskalMstProjector: ProjectorFactory = (views: ProjectorViews): ProjectorInstance => {
  const stage = views.stage as unknown as KruskalStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  /** 마지막으로 받은 phase. `state-changed` 가 무리를 처음 세우는 것인지 합치는 것인지 가른다. */
  let phase: string | null = null;
  /** 마지막으로 찾은 뿌리 둘. 견주는 이벤트가 뒤따라 오므로 여기 담아 둔다. */
  let rootU = -1;
  let rootV = -1;

  return {
    onInit(initialData: unknown): void {
      stage?.setup?.(initialData);
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = (event.payload as { phase?: unknown } | undefined)?.phase;
          phase = typeof p === 'string' ? p : null;
          codePanel?.highlightPhase?.(phase);
          return;
        }

        case 'sort-swap': {
          const p = event.payload as { a?: unknown; b?: unknown } | undefined;
          const a = num(p?.a);
          const b = num(p?.b);
          if (a === null || b === null) return;
          stage?.swapSlots?.(a, b);
          return;
        }

        case 'state-changed': {
          const roots = numList((event.payload as { roots?: unknown } | undefined)?.roots);
          if (!roots) return;
          // 무리를 처음 세우는 자리와 둘을 합치는 자리는 같은 지도를 보내지만
          // 화면에서 하는 말이 다르다. 그것을 가르는 것이 phase 다.
          if (phase === 'make-set') stage?.makeSet?.(roots);
          else stage?.setGroups?.(roots);
          return;
        }

        case 'highlight': {
          const p = event.payload as { slot?: unknown; id?: unknown } | undefined;
          const slot = num(p?.slot);
          const id = num(p?.id);
          if (slot === null || id === null) return;
          stage?.focusEdge?.(slot, id);
          return;
        }

        case 'roots-found': {
          const p = event.payload as { rootU?: unknown; rootV?: unknown } | undefined;
          const a = num(p?.rootU);
          const b = num(p?.rootV);
          if (a === null || b === null) return;
          rootU = a;
          rootV = b;
          stage?.showRoots?.(a, b);
          return;
        }

        case 'mark': {
          const same = (event.payload as { same?: unknown } | undefined)?.same;
          if (typeof same !== 'boolean' || rootU < 0 || rootV < 0) return;
          stage?.judge?.(same, rootU, rootV);
          return;
        }

        case 'edge-linked': {
          const id = num((event.payload as { id?: unknown } | undefined)?.id);
          if (id === null) return;
          stage?.linkEdge?.(id);
          return;
        }

        case 'edge-dropped': {
          const id = num((event.payload as { id?: unknown } | undefined)?.id);
          if (id === null) return;
          stage?.dropEdge?.(id);
          return;
        }

        case 'done': {
          const p = event.payload as { picked?: unknown; dropped?: unknown; total?: unknown } | undefined;
          stage?.finish?.(num(p?.picked) ?? 0, num(p?.dropped) ?? 0, num(p?.total) ?? 0);
          return;
        }

        default:
          // 이 알고리즘이 보내는 이벤트는 위가 전부다. 다른 것이 오면 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      phase = null;
      rootU = -1;
      rootV = -1;
      codePanel?.clearHighlight?.();
      stage?.resetAll?.();
    },
  };
};
