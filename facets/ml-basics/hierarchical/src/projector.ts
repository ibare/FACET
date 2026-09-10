/**
 * 계층 군집화 Projector — 알고리즘 이벤트를 stage 와 코드 패널의 메서드로 옮긴다.
 *
 * 옮기는 것은 다섯뿐이다 (algorithm.ts 머리말의 어휘와 같다).
 *
 *   'phase'        → codePanel.highlightPhase(...)
 *   'merge-made'   → stage.setTree / setActivePair / setCut   (한 걸음씩 자라는 나무)
 *   'tree-built'   → stage.setTree / setActivePair(null)      (다 지어진 나무)
 *   'cut-changed'  → stage.setCut(...)
 *   'done'         → stage.record(...) + stage.setCaption(...)
 *
 * 문안은 `facet.ts` 의 `messages` 에 있고 여기에는 키와 en 원본만 있다 (C10).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
  ViewInstance,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type StageMerge = { into: number; gone: number; height: number };

/** stage view 의 구조적 계약 (C9 — 오픈 타입을 한 곳에서만 좁힌다). */
type HierarchicalStage = ViewInstance & {
  setScene?(scene: {
    points: Array<{ id: string; x: number; y: number }>;
    bridgeIds: string[];
    cutHeights: number[];
    axisMax: number;
  }): void;
  setTree?(merges: StageMerge[], linkIndex: number): void;
  setActivePair?(pair: { into: number; gone: number } | null): void;
  setCut?(cut: {
    cutIndex: number;
    cutHeight: number;
    groups: number[];
    clusterCount: number;
  }): void;
  record?(row: { linkIndex: number; cutIndex: number; clusterCount: number }): void;
  setCaption?(lines: string[]): void;
  reset?(): void;
};

type CodePanel = ViewInstance & {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const v of value) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out.push(v);
  }
  return out;
}

function mergeArray(value: unknown): StageMerge[] | null {
  if (!Array.isArray(value)) return null;
  const out: StageMerge[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return null;
    const m = raw as Record<string, unknown>;
    if (
      typeof m.into !== 'number' ||
      typeof m.gone !== 'number' ||
      typeof m.height !== 'number'
    ) {
      return null;
    }
    out.push({ into: m.into, gone: m.gone, height: m.height });
  }
  return out;
}

export const hierarchicalProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as HierarchicalStage | undefined;
  const codePanel = views.codePanel as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 지어지는 중인 나무. `merge-made` 의 step 0 에서 비운다. */
  let merges: StageMerge[] = [];
  let linkIndex = 0;
  let cutIndex = 0;
  let cutHeight = 0;

  const linkName = (index: number): string => {
    if (index === 0) return tr('link.single', 'single');
    if (index === 1) return tr('link.complete', 'complete');
    return tr('link.average', 'average');
  };

  return {
    onInit(initialData: unknown): void {
      const d = initialData as Record<string, unknown> | undefined;
      if (!d) return;
      const points = Array.isArray(d.points)
        ? (d.points as Array<Record<string, unknown>>)
            .filter((p) => typeof p.id === 'string')
            .map((p) => ({
              id: String(p.id),
              x: numberOf(p.x, 0),
              y: numberOf(p.y, 0),
            }))
        : [];
      const bridgeIds = Array.isArray(d.bridgeIds)
        ? (d.bridgeIds as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];
      const cutHeights = numberArray(d.cutHeights) ?? [];
      linkIndex = numberOf(d.initialLinkIndex, 0);
      cutIndex = numberOf(d.initialCutIndex, 0);
      cutHeight = cutHeights[cutIndex] ?? 0;
      merges = [];
      stage?.setScene?.({
        points,
        bridgeIds,
        cutHeights,
        axisMax: numberOf(d.axisMax, 1),
      });
    },

    onEvent(event: FacetRuntimeEvent): void {
      const p = event.payload as Record<string, unknown> | undefined;
      switch (event.type) {
        case 'phase': {
          const name = p?.phase;
          if (typeof name === 'string') codePanel?.highlightPhase?.(name);
          return;
        }
        case 'merge-made': {
          if (!p) return;
          const step = numberOf(p.step, -1);
          const into = numberOf(p.into, -1);
          const gone = numberOf(p.gone, -1);
          const height = numberOf(p.height, 0);
          if (into < 0 || gone < 0) return;
          if (step === 0) merges = [];
          merges = [...merges, { into, gone, height }];
          stage?.setTree?.(merges, linkIndex);
          stage?.setActivePair?.({ into, gone });
          const groups = numberArray(p.groups);
          if (groups) {
            stage?.setCut?.({
              cutIndex,
              cutHeight,
              groups,
              clusterCount: numberOf(p.clusterCount, groups.length),
            });
          }
          return;
        }
        case 'tree-built': {
          if (!p) return;
          const built = mergeArray(p.merges);
          linkIndex = numberOf(p.linkIndex, linkIndex);
          if (built) merges = built;
          stage?.setTree?.(merges, linkIndex);
          stage?.setActivePair?.(null);
          return;
        }
        case 'cut-changed': {
          if (!p) return;
          const groups = numberArray(p.groups);
          if (!groups) return;
          cutIndex = numberOf(p.cutIndex, cutIndex);
          cutHeight = numberOf(p.cutHeight, cutHeight);
          stage?.setCut?.({
            cutIndex,
            cutHeight,
            groups,
            clusterCount: numberOf(p.clusterCount, groups.length),
          });
          return;
        }
        case 'done': {
          if (!p) return;
          const clusterCount = numberOf(p.clusterCount, 0);
          const chained = p.chained === true;
          const textKey = typeof p.textKey === 'string' ? p.textKey : '';
          stage?.record?.({ linkIndex, cutIndex, clusterCount });
          const head = tr('caption.answer', '{link} linkage, cut at {h} — groups: {k}', {
            link: linkName(linkIndex),
            h: cutHeight.toFixed(1),
            k: clusterCount,
          });
          // 알고리즘은 키만 보내고 문안은 여기서 고른다 (C10).
          const tail =
            textKey === 'caption.chained' || chained
              ? tr(
                  'caption.chained',
                  'The two blobs end up in the same group — the pair in the middle links them.',
                )
              : tr(
                  'caption.separate',
                  'The two blobs stay apart — the pair in the middle does not join them.',
                );
          stage?.setCaption?.([head, tail]);
          codePanel?.clearHighlight?.();
          return;
        }
        default:
          // 이 facet 이 발신하지 않는 어휘다 — 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      merges = [];
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
