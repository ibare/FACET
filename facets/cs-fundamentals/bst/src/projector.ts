/**
 * BST Projector — 알고리즘 이벤트를 tree-layout (binary-ordered + subtree-shade +
 * fold-collapse + inorder-projection + cursor + aux-cursor + ghost-probe) +
 * 비교 HUD / 기울기 게이지 / 코드 패널에 매핑.
 *
 * 시각적 정체성 (기획 5항):
 *   1. 좌소우대 색지       — tree-layout features:['subtree-shade'] + layoutMode:'binary-ordered'.
 *                             projector 는 관여하지 않음 (view 자동).
 *   2. 반을 접는 폴드       — `fold` 이벤트 시 view.foldSubtree. duration 은
 *                             runtime.getSpeed() 로 140ms 기준 비례. operation 끝
 *                             `op-reset` 에서 setTree 로 일괄 해제.
 *   3. 경로 조명           — compare/descend 시 state-changed 로 visited 누적.
 *                             `op-reset` 에서 초기화.
 *   4. 정렬된 바닥선        — tree-layout features:['inorder-projection'] (view 자동).
 *   5. 기울기 게이지        — projector 가 구조 변화마다 h / log2(n+1) 계산해
 *                             text-display 에 갱신.
 *
 * shadow tree 전략:
 *   projector 는 자기 BST shadow 를 유지한다. 구조 이벤트(append/remove-node/
 *   value-move) 를 받으면 shadow 를 갱신하고 view.setTree(shadow) 로 재렌더.
 *   algorithm 과 동일한 id 부여 규칙을 공유해 id 가 어긋나지 않는다.
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import type { TreeNode } from '@facet/core/runtime';
import { parseTarget } from '@facet/core/runtime';
import { computeInitialBst, type BstInitialData } from './algorithm.js';

export const BST_CANVAS = { width: 560, height: 320, stripH: 44 } as const;

type TreeLayoutHandle = {
  setTree(node: TreeNode): void;
  setNodeState(id: string, state: 'default' | 'visited' | 'active' | 'matched'): void;
  setEdgeState(p: string, c: string, state: 'default' | 'active' | 'traversed'): void;
  addNode(parentId: string, child: TreeNode): void;
  removeNode(id: string): void;
  replaceNodeLabel(id: string, label: string): void;
  setLayoutMode(mode: 'bfs-width' | 'binary-ordered'): void;
  setCursor(id: string | null): void;
  setAuxCursor(id: string | null): void;
  foldSubtree(rootId: string, side: 'L' | 'R', durationMs?: number): Promise<void>;
  unfoldSubtree(rootId: string, side?: 'L' | 'R', durationMs?: number): Promise<void>;
  unfoldAll(): void;
  setGhostProbe(parentId: string, side: 'L' | 'R', label: string): void;
  clearGhostProbe(): void;
  reset(): void;
};

type TextDisplay = {
  setText(s: string): void;
  reset(): void;
};

type CodePanel = {
  highlightPhase(phase: string | null): void;
  clearHighlight(): void;
};

type ShadowNode = {
  id: string;
  value: number;
  left: ShadowNode | null;
  right: ShadowNode | null;
};

function toTreeNode(n: ShadowNode | null): TreeNode | null {
  if (!n) return null;
  const l = toTreeNode(n.left);
  const r = toTreeNode(n.right);
  return {
    id: n.id,
    label: String(n.value),
    children: [l ?? null, r ?? null],
  };
}

function findShadow(n: ShadowNode | null, id: string): ShadowNode | null {
  if (!n) return null;
  if (n.id === id) return n;
  return findShadow(n.left, id) ?? findShadow(n.right, id);
}

function findShadowParent(
  n: ShadowNode | null,
  id: string,
): { parent: ShadowNode; side: 'L' | 'R' } | null {
  if (!n) return null;
  if (n.left?.id === id) return { parent: n, side: 'L' };
  if (n.right?.id === id) return { parent: n, side: 'R' };
  return findShadowParent(n.left, id) ?? findShadowParent(n.right, id);
}

function heightOf(n: ShadowNode | null): number {
  if (!n) return 0;
  return 1 + Math.max(heightOf(n.left), heightOf(n.right));
}

function sizeOf(n: ShadowNode | null): number {
  if (!n) return 0;
  return 1 + sizeOf(n.left) + sizeOf(n.right);
}

/** 기울기 지표: `h / log2(n+1)` — 1.0 = 균형, ≥2.0 = 편향, ≥3.0 = 사다리. */
function tiltRatio(n: ShadowNode | null): number {
  const size = sizeOf(n);
  if (size === 0) return 1;
  const h = heightOf(n);
  const ideal = Math.log2(size + 1);
  return ideal > 0 ? h / ideal : h;
}

export const bstProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as TreeLayoutHandle | undefined;
  const compareHud = views.compareHud as unknown as TextDisplay | undefined;
  const tiltGauge = views.tiltGauge as unknown as TextDisplay | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;

  let shadow: ShadowNode | null = null;
  const visitedIds = new Set<string>();
  const foldedSet: { rootId: string; side: 'L' | 'R' }[] = [];

  function buildShadow(data: BstInitialData): void {
    // computeInitialBst returns `BstNode` (from algorithm.ts) whose shape
    // matches ShadowNode — 같은 필드 구성. cast 로 공유.
    const init = computeInitialBst(data.initialValues);
    shadow = init.root as ShadowNode | null;
  }

  function refreshTilt(): void {
    if (!tiltGauge) return;
    const size = sizeOf(shadow);
    if (size === 0) {
      tiltGauge.setText('트리 비어있음');
      return;
    }
    const ratio = tiltRatio(shadow);
    tiltGauge.setText(`h / log₂(n+1) = ${ratio.toFixed(2)}`);
  }

  function refreshView(): void {
    if (!stage) return;
    const tn = toTreeNode(shadow);
    if (tn) stage.setTree(tn);
    else stage.reset();
    refreshTilt();
  }

  function resetOperationState(): void {
    if (stage) {
      // setTree 로 재렌더 — folded/cursors/ghost/visited 시각이 모두 초기화.
      const tn = toTreeNode(shadow);
      if (tn) stage.setTree(tn);
      else stage.reset();
    }
    visitedIds.clear();
    foldedSet.length = 0;
    compareHud?.setText('—');
  }

  return {
    onInit(initialData) {
      const data = initialData as BstInitialData;
      buildShadow(data);
      visitedIds.clear();
      foldedSet.length = 0;
      refreshView();
      compareHud?.setText('—');
    },

    async onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: string } | undefined;
          const phase = typeof p?.phase === 'string' ? p.phase : null;
          codePanel?.highlightPhase(phase);
          break;
        }

        case 'mark': {
          if (!stage) break;
          const kind = (event.payload as { kind?: string } | undefined)?.kind;
          const t = Array.isArray(event.target) ? event.target[0] : event.target;
          if (typeof t !== 'string') break;
          const parsed = parseTarget(t);
          if (parsed?.prefix !== 'node') break;
          const id = parsed.id;
          if (kind === 'cursor') {
            stage.setCursor(id);
          } else if (kind === 'aux-cursor') {
            stage.setAuxCursor(id);
          } else if (kind === 'cursor-clear') {
            stage.setCursor(null);
          } else if (kind === 'aux-cursor-clear') {
            stage.setAuxCursor(null);
          } else if (kind === 'matched') {
            stage.setNodeState(id, 'matched');
          }
          break;
        }

        case 'state-changed': {
          if (!stage) break;
          const state = (event.payload as { state?: string } | undefined)?.state;
          const t = Array.isArray(event.target) ? event.target[0] : event.target;
          if (typeof t !== 'string') break;
          const parsed = parseTarget(t);
          if (parsed?.prefix !== 'node') break;
          const id = parsed.id;
          if (state === 'visited') {
            stage.setNodeState(id, 'visited');
            visitedIds.add(id);
          } else if (state === 'default') {
            stage.setNodeState(id, 'default');
          } else if (state === 'active') {
            stage.setNodeState(id, 'active');
          } else if (state === 'matched') {
            stage.setNodeState(id, 'matched');
          }
          break;
        }

        case 'highlight': {
          if (!stage) break;
          const payload = event.payload as { from?: string; to?: string } | undefined;
          if (!payload?.from || !payload?.to) break;
          stage.setEdgeState(payload.from, payload.to, 'traversed');
          break;
        }

        case 'fold': {
          if (!stage) break;
          const p = event.payload as { rootId?: string; side?: 'L' | 'R' } | undefined;
          if (!p?.rootId || (p.side !== 'L' && p.side !== 'R')) break;
          const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);
          const duration = 140 / speed;
          foldedSet.push({ rootId: p.rootId, side: p.side });
          await stage.foldSubtree(p.rootId, p.side, duration);
          break;
        }

        case 'unfold': {
          if (!stage) break;
          const p = event.payload as { rootId?: string; side?: 'L' | 'R' } | undefined;
          if (!p?.rootId) break;
          const speed = Math.max(0.01, runtime?.getSpeed() ?? 1);
          const duration = 140 / speed;
          await stage.unfoldSubtree(p.rootId, p.side, duration);
          break;
        }

        case 'append': {
          const p = event.payload as
            | { parentId?: string | null; side?: 'L' | 'R' | null; id?: string; value?: number }
            | undefined;
          if (!p?.id || typeof p.value !== 'number') break;
          const newShadow: ShadowNode = { id: p.id, value: p.value, left: null, right: null };
          if (!shadow || p.parentId === null || p.parentId === undefined) {
            shadow = newShadow;
          } else {
            const parent = findShadow(shadow, p.parentId);
            if (parent) {
              if (p.side === 'L') parent.left = newShadow;
              else if (p.side === 'R') parent.right = newShadow;
            }
          }
          refreshView();
          break;
        }

        case 'remove-node': {
          const p = event.payload as { id?: string; replacedBy?: string | null } | undefined;
          if (!p?.id) break;
          if (!shadow) break;
          const target = findShadow(shadow, p.id);
          if (!target) break;
          const replace: ShadowNode | null =
            p.replacedBy === null || p.replacedBy === undefined
              ? null
              : findShadow(shadow, p.replacedBy);
          // target 을 shadow 에서 분리 후 replace 로 치환.
          if (shadow.id === p.id) {
            shadow = replace;
          } else {
            const loc = findShadowParent(shadow, p.id);
            if (loc) {
              if (loc.side === 'L') loc.parent.left = replace;
              else loc.parent.right = replace;
            }
          }
          refreshView();
          break;
        }

        case 'value-move': {
          const p = event.payload as { fromId?: string; toId?: string; value?: string } | undefined;
          if (!p?.toId || typeof p.value !== 'string') break;
          const target = findShadow(shadow, p.toId);
          if (target) {
            const parsed = Number(p.value);
            if (!Number.isNaN(parsed)) target.value = parsed;
          }
          stage?.replaceNodeLabel(p.toId, p.value);
          refreshTilt();
          break;
        }

        case 'compare': {
          const p = event.payload as
            | { key?: string; nodeValue?: string; result?: '<' | '>' | '=' }
            | undefined;
          if (!p?.key || !p.nodeValue) break;
          const sym = p.result ?? '?';
          compareHud?.setText(`[키 ${p.key}] ${sym} [노드 ${p.nodeValue}]`);
          break;
        }

        case 'probe': {
          if (!stage) break;
          const p = event.payload as
            | { parentId?: string; side?: 'L' | 'R'; key?: string }
            | undefined;
          if (!p?.parentId || (p.side !== 'L' && p.side !== 'R')) break;
          stage.setGhostProbe(p.parentId, p.side, p.key ?? '?');
          break;
        }

        case 'clear-probe': {
          stage?.clearGhostProbe();
          break;
        }

        case 'op-reset': {
          resetOperationState();
          break;
        }

        case 'done': {
          codePanel?.clearHighlight();
          compareHud?.setText('완료');
          break;
        }
      }
    },

    onReset() {
      // runner 가 reset 후 onInit 을 재호출하므로 shadow/view 는 그쪽에서 재구성.
      // 보조 뷰만 정리.
      visitedIds.clear();
      foldedSet.length = 0;
      compareHud?.reset();
      tiltGauge?.reset();
      codePanel?.clearHighlight();
    },
  };
};
