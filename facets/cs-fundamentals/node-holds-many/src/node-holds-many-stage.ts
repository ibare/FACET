/**
 * node-holds-many-stage — 다분기 노드 하나가 키를 여럿 품고, 커서가 그 안을
 * 훑다가 틈을 골라 내려가는 그림.
 *
 * 빌트인 `tree-layout` 은 노드 하나에 라벨 하나만 얹으므로 "한 자리에 여럿을
 * 담는다" 는 이 조각의 동사를 표현할 수 없다 — 자리 하나를 키 칸 여럿으로
 * 나누고, 그 칸을 가로로 훑고, 칸 사이 틈에서 세로로 내려가는 커서 이동이
 * 이 그림의 본체다 (S-facet: 빌트인 어휘로 표현 불가능한 경우에만 stage 를 둔다).
 */

import type { CanvasView } from '@ffacet/core/runtime';
import { getColors, makeTranslator, fonts, fontSizes, radii, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const CELL_MAX_W = 72;
const CELL_H = 40;
const NODE_PAD = 10;
const SIDE_MIN = 24;
const INTER_NODE_GAP = 20;
const TOP_PAD = 48;
const ROOT_Y = TOP_PAD;
const ROW_GAP = 64;
const CHILDREN_Y = ROOT_Y + CELL_H + ROW_GAP;
const CAPTION_PAD = 30;
const CAPTION_Y = CHILDREN_Y + CELL_H + CAPTION_PAD;
const BOTTOM_PAD = 14;
export const STAGE_H = CAPTION_Y + BOTTOM_PAD;

const CURSOR_OFFSET = 12;
const GAP_DROP = 16;
const MOVE_MS = 260;
const DESCEND_MS = 220;

type Rect = { x: number; y: number; w: number };

type StageNode = { keys: number[]; children?: string[] };

/** projector 가 좁혀 넘기는 초기 데이터. */
export type StageInitData = {
  rootId: string;
  nodes: Record<string, StageNode>;
  target: number;
};

export type SweepPayload = { nodeId: string; keyIndex: number; key: number; cmp: 'lt' | 'gt' | 'eq' };
export type DescendPayload = { nodeId: string; gapIndex: number; childId?: string };
export type MarkPayload = { nodeId: string; keyIndex: number; key: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node as SVGElementTagNameMap[K];
}

function cellCenterX(rect: Rect, keyIndex: number, cellW: number): number {
  return rect.x + NODE_PAD + keyIndex * cellW + cellW / 2;
}

function gapX(rect: Rect, gapIndex: number, cellW: number): number {
  return rect.x + NODE_PAD + gapIndex * cellW;
}

export const nodeHoldsManyStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(_container, params) {
    // 컨테이너가 아니라 캔버스 안을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로, 컨테이너를 비우면 그 캔버스가 떨어져 나가 화면이 빈다.
    params.canvas.textContent = '';
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);

    svg.style.fontFamily = fonts.body;

    // ── 상단 두 줄 (target · 통계) ──────────────────────────────────────
    const targetLabel = el('text', {
      x: W / 2,
      y: 18,
      'text-anchor': 'middle',
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    const statLabel = el('text', {
      x: W / 2,
      y: 34,
      'text-anchor': 'middle',
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });

    // ── 캡션 ────────────────────────────────────────────────────────────
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-size': fontSizes.md,
      fill: colors.text,
    });

    // ── 커서 (내려가는 삼각 마커) ───────────────────────────────────────
    const cursor = el('path', {
      d: 'M -7 -9 L 7 -9 L 0 0 Z',
      fill: colors.risingMarker,
    });
    const cursorGroup = el('g', { opacity: '0' });
    cursorGroup.style.transition = `transform ${MOVE_MS}ms ease, opacity 120ms ease`;
    cursorGroup.appendChild(cursor);

    const edgeLayer = el('g');
    const nodeLayer = el('g');

    svg.appendChild(targetLabel);
    svg.appendChild(statLabel);
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);
    svg.appendChild(cursorGroup);
    svg.appendChild(caption);

    // ── mount 상태 (init 마다 새로 계산) ───────────────────────────────
    let rootIdRef = '';
    let targetRef = 0;
    let cellW = CELL_MAX_W;
    let rootRect: Rect = { x: 0, y: ROOT_Y, w: 0 };
    const childRects: Record<string, Rect> = {};
    const frameEls: Record<string, SVGRectElement> = {};
    const cellEls: Record<string, SVGRectElement[]> = {};
    const cellTextEls: Record<string, SVGTextElement[]> = {};
    const cellDefs: Record<string, StageNode> = {};
    const edgeEls: SVGLineElement[] = [];

    let activeNodeId: string | null = null;
    let activeCell: { nodeId: string; keyIndex: number } | null = null;

    function rectOf(nodeId: string): Rect {
      return nodeId === rootIdRef ? rootRect : (childRects[nodeId] ?? rootRect);
    }

    function setFrameState(nodeId: string, state: 'default' | 'active' | 'visited'): void {
      const frame = frameEls[nodeId];
      if (!frame) return;
      const stroke =
        state === 'active' ? colors.itemActive : state === 'visited' ? colors.itemSorted : colors.border;
      frame.setAttribute('stroke', stroke);
      frame.setAttribute('stroke-width', state === 'default' ? '1.5' : '2.5');
    }

    function setEdgeState(gapIndex: number, state: 'default' | 'active' | 'traversed'): void {
      const edge = edgeEls[gapIndex];
      if (!edge) return;
      const stroke =
        state === 'active' ? colors.itemActive : state === 'traversed' ? colors.itemSorted : colors.border;
      edge.setAttribute('stroke', stroke);
      edge.setAttribute('stroke-width', state === 'default' ? '1.5' : '2.5');
    }

    function setCellState(nodeId: string, keyIndex: number, state: 'default' | 'comparing' | 'matched'): void {
      const rect = cellEls[nodeId]?.[keyIndex];
      const text = cellTextEls[nodeId]?.[keyIndex];
      if (!rect || !text) return;
      const fill = state === 'matched' ? colors.itemPivot : state === 'comparing' ? colors.itemComparing : colors.itemDefault;
      const ink = state === 'default' ? colors.text : colors.stateInk;
      rect.setAttribute('fill', fill);
      text.setAttribute('fill', ink);
    }

    function setActiveNode(nodeId: string): void {
      if (activeNodeId === nodeId) return;
      if (activeNodeId) setFrameState(activeNodeId, 'visited');
      setFrameState(nodeId, 'active');
      activeNodeId = nodeId;
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    function moveCursor(x: number, y: number, ms: number): Promise<void> {
      cursorGroup.style.transitionDuration = `${ms}ms`;
      cursorGroup.setAttribute('opacity', '1');
      cursorGroup.setAttribute('transform', `translate(${x} ${y})`);
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function resetVisualState(): void {
      for (const id of Object.keys(frameEls)) setFrameState(id, 'default');
      for (const id of Object.keys(cellEls)) {
        cellEls[id]!.forEach((_, i) => setCellState(id, i, 'default'));
      }
      edgeEls.forEach((_, i) => setEdgeState(i, 'default'));
      activeNodeId = null;
      activeCell = null;
      setCaption('');

      // 커서를 뿌리 첫 키 위 쉼자리로 되돌린다 — 전환 없이 즉시. 그래야 다음
      // sweepKey 가 지난 위치에서 날아오는 대신 뿌리에서 다시 시작한다.
      cursorGroup.style.transitionDuration = '0s';
      cursorGroup.setAttribute('opacity', '0');
      cursorGroup.setAttribute(
        'transform',
        `translate(${cellCenterX(rootRect, 0, cellW)} ${rootRect.y - CURSOR_OFFSET})`,
      );
    }

    function buildStructure(data: StageInitData): void {
      edgeLayer.replaceChildren();
      nodeLayer.replaceChildren();
      for (const k of Object.keys(frameEls)) delete frameEls[k];
      for (const k of Object.keys(cellEls)) delete cellEls[k];
      for (const k of Object.keys(cellTextEls)) delete cellTextEls[k];
      for (const k of Object.keys(cellDefs)) delete cellDefs[k];
      for (const k of Object.keys(childRects)) delete childRects[k];
      edgeEls.length = 0;

      rootIdRef = data.rootId;
      targetRef = data.target;
      const root = data.nodes[data.rootId]!;
      const childIds = root.children ?? [];

      const totalCells = childIds.reduce((sum, id) => sum + (data.nodes[id]?.keys.length ?? 0), 0);
      const totalPad = childIds.length * NODE_PAD * 2;
      const totalGap = Math.max(0, childIds.length - 1) * INTER_NODE_GAP;
      const available = W - SIDE_MIN * 2 - totalPad - totalGap;
      cellW = Math.max(24, Math.min(CELL_MAX_W, totalCells > 0 ? Math.floor(available / totalCells) : CELL_MAX_W));

      const childWidths = childIds.map((id) => (data.nodes[id]?.keys.length ?? 0) * cellW + NODE_PAD * 2);
      const totalChildrenW = childWidths.reduce((a, b) => a + b, 0) + totalGap;
      let cx = Math.round((W - totalChildrenW) / 2);
      childIds.forEach((id, i) => {
        const w = childWidths[i]!;
        childRects[id] = { x: cx, y: CHILDREN_Y, w };
        cx += w + INTER_NODE_GAP;
      });

      const rootW = root.keys.length * cellW + NODE_PAD * 2;
      rootRect = { x: Math.round((W - rootW) / 2), y: ROOT_Y, w: rootW };

      function drawNode(id: string, node: StageNode, rect: Rect): void {
        cellDefs[id] = node;
        const frame = el('rect', {
          x: rect.x,
          y: rect.y,
          width: rect.w,
          height: CELL_H,
          rx: radii.md,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        frameEls[id] = frame;
        nodeLayer.appendChild(frame);

        const cells: SVGRectElement[] = [];
        const texts: SVGTextElement[] = [];
        node.keys.forEach((key, i) => {
          const cellRect = el('rect', {
            x: rect.x + NODE_PAD + i * cellW,
            y: rect.y,
            width: cellW,
            height: CELL_H,
            fill: colors.itemDefault,
            stroke: colors.border,
            'stroke-width': 1,
          });
          const cellText = el('text', {
            x: rect.x + NODE_PAD + i * cellW + cellW / 2,
            y: rect.y + CELL_H / 2 + 5,
            'text-anchor': 'middle',
            'font-size': fontSizes.md,
            'font-family': fonts.mono,
            fill: colors.text,
          });
          cellText.textContent = String(key);
          nodeLayer.appendChild(cellRect);
          nodeLayer.appendChild(cellText);
          cells.push(cellRect);
          texts.push(cellText);
        });
        cellEls[id] = cells;
        cellTextEls[id] = texts;
      }

      drawNode(data.rootId, root, rootRect);
      childIds.forEach((id) => drawNode(id, data.nodes[id]!, childRects[id]!));

      childIds.forEach((id, gapIndex) => {
        const childRect = childRects[id]!;
        const x1 = gapX(rootRect, gapIndex, cellW);
        const y1 = rootRect.y + CELL_H;
        const x2 = childRect.x + childRect.w / 2;
        const y2 = childRect.y;
        const edge = el('line', {
          x1,
          y1,
          x2,
          y2,
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        edgeLayer.appendChild(edge);
        edgeEls.push(edge);
      });

      const keysTotal = Object.values(data.nodes).reduce((sum, n) => sum + n.keys.length, 0);
      const nodesTotal = Object.keys(data.nodes).length;
      targetLabel.textContent = t('label.target', 'target {value}', { value: String(data.target) });
      statLabel.textContent = t('stat.keysInNodes', '{keys} keys in {nodes} nodes', {
        keys: keysTotal,
        nodes: nodesTotal,
      });

      resetVisualState();
    }

    return {
      destroy() {
        svg.replaceChildren();
      },

      init(rawData: unknown): void {
        const data = rawData as StageInitData;
        buildStructure(data);
      },

      async sweepKey(p: SweepPayload): Promise<void> {
        const { nodeId, keyIndex, cmp } = p;
        setActiveNode(nodeId);
        if (activeCell && (activeCell.nodeId !== nodeId || activeCell.keyIndex !== keyIndex)) {
          setCellState(activeCell.nodeId, activeCell.keyIndex, 'default');
        }
        setCellState(nodeId, keyIndex, 'comparing');
        activeCell = { nodeId, keyIndex };

        const rect = rectOf(nodeId);
        await moveCursor(cellCenterX(rect, keyIndex, cellW), rect.y - CURSOR_OFFSET, MOVE_MS);

        const key = cellDefs[nodeId]?.keys[keyIndex] ?? 0;
        const vars = { target: String(targetRef), key: String(key) };
        if (cmp === 'gt') setCaption(t('caption.sweepGt', '{target} > {key} → next key', vars));
        else if (cmp === 'lt') setCaption(t('caption.sweepLt', '{target} < {key} → into the gap before it', vars));
        else setCaption(t('caption.sweepEq', '{target} = {key}', vars));
      },

      async descend(p: DescendPayload): Promise<void> {
        const { nodeId, gapIndex, childId } = p;
        setEdgeState(gapIndex, 'active');
        const fromRect = rectOf(nodeId);
        await moveCursor(gapX(fromRect, gapIndex, cellW), fromRect.y + CELL_H + GAP_DROP, DESCEND_MS);
        setCaption(t('caption.descend', 'goes down one level'));
        if (!childId) return;
        const toRect = rectOf(childId);
        await moveCursor(toRect.x + NODE_PAD + cellW / 2, toRect.y - CURSOR_OFFSET, MOVE_MS);
        setEdgeState(gapIndex, 'traversed');
        setActiveNode(childId);
      },

      async markFound(p: MarkPayload): Promise<void> {
        const { nodeId, keyIndex, key } = p;
        setCellState(nodeId, keyIndex, 'matched');
        setCaption(t('caption.found', '{target} found', { target: String(key) }));
      },

      settle(): void {
        // 'done' 은 별도 시각 변화가 없다 — markFound 가 이미 종결 상태를 보였다.
      },

      rewind(): void {
        resetVisualState();
      },
    };
  },
};
