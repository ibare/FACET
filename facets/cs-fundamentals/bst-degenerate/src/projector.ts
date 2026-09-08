/**
 * bst-degenerate — 편향 트리 조각(piece) projector.
 *
 * algorithm.ts 가 내는 확장 이벤트(`tree-insert` / `tree-compare` /
 * `tree-search-compare` / `tree-search-done` / `tree-conclusion` / `rewind`)
 * 를 stage view 호출로 번역한다. 캡션은 "문제 → 장치 → 결과" 세 단계 서사로만
 * 바뀐다 — 걸음마다 새 문장을 붙이지 않는다 (S-piece: 상시 캡션 금지, 다만
 * 논증 단계 캡션은 허용).
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory, type ProjectorRuntime, type ProjectorViews } from '@ffacet/core/runtime';

type TreeId = 'a' | 'b';
type Side = 'left' | 'right';

/** stage view 가 노출하는 메서드 계약 (C9) — payload 를 좁힌 뒤 이 형태로만 호출한다. */
type BstDegenerateStage = {
  insertNode(
    tree: TreeId,
    id: string,
    value: number,
    parentId: string | null,
    side: Side | null,
    depth: number,
  ): Promise<void>;
  compareNode(tree: TreeId, nodeId: string, direction: Side): Promise<void>;
  searchCompareNode(tree: TreeId, nodeId: string, direction: Side | 'match'): Promise<void>;
  showResult(tree: TreeId, text: string): Promise<void>;
  conclude(): Promise<void>;
  setCaption(text: string): void;
  rewind(): void;
};

function asTree(v: unknown): TreeId | null {
  return v === 'a' || v === 'b' ? v : null;
}

function asSide(v: unknown): Side | null {
  return v === 'left' || v === 'right' ? v : null;
}

export const bstDegenerateProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
) => {
  const stage = views.stage as unknown as BstDegenerateStage;
  const t = runtime?.t ?? makeTranslator();

  // 논증 단계 추적 — 걸음마다가 아니라 단계 전환마다만 캡션을 바꾼다.
  let growingShown = false;
  let searchingShown = false;
  const results = { heightA: 0, comparisonsA: 0, heightB: 0, comparisonsB: 0 };

  function resetNarrative(): void {
    growingShown = false;
    searchingShown = false;
    results.heightA = 0;
    results.comparisonsA = 0;
    results.heightB = 0;
    results.comparisonsB = 0;
    stage.setCaption(t('caption.problem', 'The same six values, inserted in two different orders.'));
  }

  return {
    onInit() {
      resetNarrative();
    },

    onReset() {
      stage.rewind();
      resetNarrative();
    },

    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'tree-insert': {
          const p = event.payload as
            | { tree?: unknown; id?: unknown; value?: unknown; parentId?: unknown; side?: unknown; depth?: unknown }
            | undefined;
          const tree = asTree(p?.tree);
          if (tree === null || typeof p?.id !== 'string' || typeof p?.value !== 'number' || typeof p?.depth !== 'number') return;
          const parentId = typeof p.parentId === 'string' ? p.parentId : null;
          const side = asSide(p.side);
          await stage.insertNode(tree, p.id, p.value, parentId, side, p.depth);
          return;
        }
        case 'tree-compare': {
          const p = event.payload as { tree?: unknown; nodeId?: unknown; direction?: unknown } | undefined;
          const tree = asTree(p?.tree);
          const direction = asSide(p?.direction);
          if (tree === null || direction === null || typeof p?.nodeId !== 'string') return;
          if (!growingShown) {
            growingShown = true;
            stage.setCaption(t('caption.growing', 'Every insertion compares first, then goes left or right.'));
          }
          await stage.compareNode(tree, p.nodeId, direction);
          return;
        }
        case 'tree-search-compare': {
          const p = event.payload as { tree?: unknown; nodeId?: unknown; direction?: unknown; target?: unknown } | undefined;
          const tree = asTree(p?.tree);
          const direction = p?.direction === 'match' ? 'match' : asSide(p?.direction);
          if (tree === null || direction === null || typeof p?.nodeId !== 'string') return;
          if (!searchingShown) {
            searchingShown = true;
            const value = typeof p.target === 'number' ? p.target : 0;
            stage.setCaption(t('caption.searching', 'Both trees are built. Now look for {value} in each.', { value }));
          }
          await stage.searchCompareNode(tree, p.nodeId, direction);
          return;
        }
        case 'tree-search-done': {
          const p = event.payload as { tree?: unknown; comparisons?: unknown; height?: unknown } | undefined;
          const tree = asTree(p?.tree);
          if (tree === null || typeof p?.comparisons !== 'number' || typeof p?.height !== 'number') return;
          if (tree === 'a') {
            results.heightA = p.height;
            results.comparisonsA = p.comparisons;
          } else {
            results.heightB = p.height;
            results.comparisonsB = p.comparisons;
          }
          const text = t('label.result', 'height {height} · {comparisons} compares', {
            height: p.height,
            comparisons: p.comparisons,
          });
          await stage.showResult(tree, text);
          return;
        }
        case 'tree-conclusion': {
          await stage.conclude();
          stage.setCaption(
            t(
              'caption.result',
              'A: height {heightA}, {comparisonsA} compares. B: height {heightB}, {comparisonsB} compares — same values, different cost.',
              results,
            ),
          );
          return;
        }
        case 'rewind': {
          stage.rewind();
          resetNarrative();
          return;
        }
        default:
          // 표준 이벤트를 쓰지 않으므로 그 외 타입은 조용히 무시한다 (C2).
          return;
      }
    },
  };
};
