/**
 * bst-compare-and-go 조각 projector.
 *
 * algorithm 의 compare / fold / rewind / done 을 bst-compare-and-go-stage 의
 * 메서드 호출로 번역한다 (이벤트 목록 + payload 스키마는 algorithm.ts 참조, C2).
 */

import type { FacetRuntimeEvent, ProjectorFactory, ViewInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type BstTreeNode = {
  id: string;
  value: number;
  left: BstTreeNode | null;
  right: BstTreeNode | null;
};

/** stage 가 노출하는 메서드 계약 (C9) — projector 는 이 형태로만 view 를 다룬다. */
type BstStage = ViewInstance & {
  setTree?(root: BstTreeNode): void;
  moveCursor?(nodeId: string): Promise<void>;
  setMatched?(nodeId: string): void;
  foldSide?(rootId: string, side: 'L' | 'R', nodeIds: string[]): Promise<void>;
  setCaption?(text: string): void;
  reset?(): void;
};

type RawNode = { value: number; left: string | null; right: string | null };

function isRawNode(v: unknown): v is RawNode {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.value === 'number' &&
    (o.left === null || typeof o.left === 'string') &&
    (o.right === null || typeof o.right === 'string')
  );
}

function buildTree(nodes: Record<string, unknown>, id: string | null): BstTreeNode | null {
  if (!id) return null;
  const raw = nodes[id];
  if (!isRawNode(raw)) return null;
  return { id, value: raw.value, left: buildTree(nodes, raw.left), right: buildTree(nodes, raw.right) };
}

export const bstCompareAndGoProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as BstStage;
  const tr = runtime?.t ?? makeTranslator();
  let needle = 0;

  function targetCaption(): string {
    return tr('caption.target', 'Looking for {needle}', { needle });
  }

  function onInit(initialData: unknown): void {
    const data = initialData as { nodes?: unknown; rootId?: unknown; needle?: unknown } | undefined;
    if (
      !data ||
      typeof data.rootId !== 'string' ||
      typeof data.needle !== 'number' ||
      typeof data.nodes !== 'object' ||
      data.nodes === null
    ) {
      return;
    }
    needle = data.needle;
    const tree = buildTree(data.nodes as Record<string, unknown>, data.rootId);
    if (tree) stage.setTree?.(tree);
    stage.setCaption?.(targetCaption());
  }

  function onReset(): void {
    stage.reset?.();
  }

  async function onEvent(event: FacetRuntimeEvent): Promise<void> {
    switch (event.type) {
      case 'compare': {
        const p = event.payload as
          | { nodeId?: unknown; nodeValue?: unknown; needle?: unknown; result?: unknown }
          | undefined;
        if (
          typeof p?.nodeId !== 'string' ||
          typeof p?.nodeValue !== 'number' ||
          typeof p?.needle !== 'number' ||
          (p.result !== 'lt' && p.result !== 'gt' && p.result !== 'eq')
        ) {
          return;
        }
        await stage.moveCursor?.(p.nodeId);
        if (p.result === 'lt') {
          stage.setCaption?.(
            tr('caption.compareLt', '{needle} < {nodeValue} — smaller, go left', {
              needle: p.needle,
              nodeValue: p.nodeValue,
            }),
          );
        } else if (p.result === 'gt') {
          stage.setCaption?.(
            tr('caption.compareGt', '{needle} > {nodeValue} — bigger, go right', {
              needle: p.needle,
              nodeValue: p.nodeValue,
            }),
          );
        } else {
          stage.setMatched?.(p.nodeId);
          stage.setCaption?.(
            tr('caption.compareEq', '{needle} = {nodeValue} — found', {
              needle: p.needle,
              nodeValue: p.nodeValue,
            }),
          );
        }
        return;
      }
      case 'fold': {
        const p = event.payload as
          | { rootId?: unknown; side?: unknown; nodes?: unknown; remaining?: unknown }
          | undefined;
        if (
          typeof p?.rootId !== 'string' ||
          (p.side !== 'L' && p.side !== 'R') ||
          !Array.isArray(p.nodes) ||
          typeof p.remaining !== 'number'
        ) {
          return;
        }
        const nodeIds = p.nodes.filter((n): n is string => typeof n === 'string');
        await stage.foldSide?.(p.rootId, p.side, nodeIds);
        stage.setCaption?.(tr('caption.narrowed', 'Narrowed to {n} candidates', { n: p.remaining }));
        return;
      }
      case 'rewind': {
        stage.reset?.();
        stage.setCaption?.(targetCaption());
        return;
      }
      case 'done': {
        // 시각 변화 없음 — 마지막 compare('eq') 가 이미 "찾음" 을 보여줬다.
        return;
      }
      default:
        // 이 facet 이 발신하지 않는 이벤트는 조용히 무시한다 (C2).
        return;
    }
  }

  return { onInit, onEvent, onReset };
};
