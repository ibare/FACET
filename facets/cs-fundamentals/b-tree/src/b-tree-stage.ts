/**
 * b-tree-stage — 한 자리에 키를 여럿 담는 나무를 그린다.
 *
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 그 view 는 자리 하나에 라벨 하나를
 * 얹는다. B-트리는 자리 하나가 키를 여럿 담고 그 **키 사이의 틈**마다 아래로
 * 갈 길이 열리는데, 그 틈이 이 자료구조의 짜임이라 그릴 어휘가 있어야 한다
 * (원칙 6 의 예외 조건).
 *
 * 조각 `nodeHoldsMany` 가 세운 어휘를 그대로 쓴다 — 바깥 상자 안에 키 칸을
 * 네 변 모두 물려 넣고, 간선은 키 사이의 틈에서 나간다. 코드를 공유하지 않고
 * 어휘만 맞춘다 (S-piece PREFER).
 *
 * 세로는 고정이다. 층이 잡아 둔 자리를 넘으면 층 간격을 줄여 담는다 —
 * 재생 중에 viewBox 를 다시 재면 글 안에 박혔을 때 위아래 문단이 밀린다 (S-view).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  radii,
  type CanvasView,
  type Palette,
  type Theme,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const SIDE = 16;
const TOP = 26;
const LEVEL_GAP = 78;
const CELL_MAX_W = 44;
const CELL_MIN_W = 20;
const CELL_H = 28;
/** 상자와 키 칸 사이의 물림. 네 변에 고르게 준다 (nodeHoldsMany 와 같은 어휘). */
const NODE_PAD = 7;
const NODE_H = CELL_H + NODE_PAD * 2;
const NODE_GAP = 12;
const CAPTION_PAD = 26;

/** 미리 잡아 두는 층. 넘치면 간격을 줄여 담고 높이는 그대로 둔다. */
const RESERVE_LEVELS = 3;
const STAGE_H = TOP + RESERVE_LEVELS * LEVEL_GAP + NODE_H + CAPTION_PAD;

const MOVE_MS = 220;

/** stage 가 받는 자리 모양. algorithm 의 타입을 참조하지 않는다 (원칙 1). */
export type StageNode = { id: string; keys: number[]; children: string[] };

type Placed = {
  frame: SVGRectElement;
  cells: SVGRectElement[];
  texts: SVGTextElement[];
  x: number;
  y: number;
  w: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const bTreeStageView: CanvasView = {
  // 세로는 고정이다. 재생 중에 바꾸지 않는다 (S-view).
  canvas: { height: STAGE_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 붙인 이 캔버스가 떨어져
    // 나간다 (S-view).
    svg.textContent = '';

    const theme: Theme = params.theme ?? 'light';
    const colors: Palette = getColors(theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const edgeLayer = el('g');
    const nodeLayer = el('g');
    const captionText = el('text', {
      x: W / 2,
      y: STAGE_H - 9,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    svg.append(edgeLayer, nodeLayer, captionText);

    const placed = new Map<string, Placed>();
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const later = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    };

    /**
     * 나무를 통째로 다시 그린다.
     *
     * 층마다 그 층의 자리들을 폭에 맞춰 나눈다. 자리의 폭은 담긴 키 수에
     * 비례하므로, 어느 자리가 꽉 찼는지가 폭으로 바로 읽힌다.
     */
    function render(list: StageNode[], rootId: string): void {
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      placed.clear();
      if (list.length === 0) return;

      const byId = new Map(list.map((n) => [n.id, n]));
      // 층별로 자리를 모은다. 뿌리에서 너비 우선으로 내려간다.
      const levels: string[][] = [];
      let frontier = byId.has(rootId) ? [rootId] : [list[0]!.id];
      let guard = 0;
      while (frontier.length > 0 && guard < 32) {
        levels.push(frontier);
        const next: string[] = [];
        for (const id of frontier) {
          for (const c of byId.get(id)?.children ?? []) if (byId.has(c)) next.push(c);
        }
        frontier = next;
        guard += 1;
      }

      // 잡아 둔 층을 넘으면 간격을 줄인다. 높이는 늘리지 않는다.
      const deepest = Math.max(0, levels.length - 1);
      const levelGap =
        deepest > RESERVE_LEVELS ? (RESERVE_LEVELS * LEVEL_GAP) / deepest : LEVEL_GAP;

      // 칸 폭은 가장 붐비는 층에서 역산한다 — 한 층만 넘쳐도 전체가 눌린다.
      let maxCells = 1;
      for (const row of levels) {
        let cells = 0;
        for (const id of row) cells += byId.get(id)?.keys.length ?? 0;
        const need = cells + row.length * (NODE_PAD * 2 + NODE_GAP) / CELL_MAX_W;
        if (need > maxCells) maxCells = need;
      }
      const cellW = Math.max(
        CELL_MIN_W,
        Math.min(CELL_MAX_W, Math.floor((W - SIDE * 2) / Math.max(1, maxCells))),
      );

      const widthOf = (id: string): number =>
        (byId.get(id)?.keys.length ?? 0) * cellW + NODE_PAD * 2;

      const center = new Map<string, number>();
      levels.forEach((row, d) => {
        const total =
          row.reduce((sum, id) => sum + widthOf(id), 0) + NODE_GAP * Math.max(0, row.length - 1);
        let x = (W - total) / 2;
        for (const id of row) {
          const w = widthOf(id);
          center.set(id, x + w / 2);
          const y = TOP + d * levelGap;
          drawNode(byId.get(id)!, x, y, w, cellW);
          x += w + NODE_GAP;
        }
      });

      // 간선은 키 사이의 틈에서 나간다 — 그 틈이 B-트리의 짜임이다.
      for (const n of list) {
        const p = placed.get(n.id);
        if (!p) continue;
        n.children.forEach((childId, i) => {
          const c = placed.get(childId);
          const cx = center.get(childId);
          if (!c || cx === undefined) return;
          const gapX = p.x + NODE_PAD + i * cellW;
          edgeLayer.appendChild(
            el('line', {
              x1: gapX,
              y1: p.y + NODE_H,
              x2: cx,
              y2: c.y,
              stroke: colors.border,
              'stroke-width': 1.5,
            }),
          );
        });
      }
    }

    function drawNode(n: StageNode, x: number, y: number, w: number, cellW: number): void {
      const frame = el('rect', {
        x,
        y,
        width: w,
        height: NODE_H,
        rx: radii.sm,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1.5,
      });
      nodeLayer.appendChild(frame);

      const cells: SVGRectElement[] = [];
      const texts: SVGTextElement[] = [];
      n.keys.forEach((key, i) => {
        const cell = el('rect', {
          x: x + NODE_PAD + i * cellW,
          y: y + NODE_PAD,
          width: cellW,
          height: CELL_H,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1,
        });
        cell.style.transition = `fill ${MOVE_MS}ms ease`;
        const text = el('text', {
          x: x + NODE_PAD + i * cellW + cellW / 2,
          y: y + NODE_PAD + CELL_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        text.textContent = String(key);
        nodeLayer.append(cell, text);
        cells.push(cell);
        texts.push(text);
      });
      placed.set(n.id, { frame, cells, texts, x, y, w });
    }

    /** 타일과 잉크는 늘 짝으로 바꾼다 (design-tokens 의 결정표). */
    function flashCell(id: string, keyIndex: number, tile: string, ink: string, ms: number): void {
      const p = placed.get(id);
      const cell = p?.cells[keyIndex];
      const text = p?.texts[keyIndex];
      if (!cell || !text) return;
      cell.setAttribute('fill', tile);
      text.setAttribute('fill', ink);
      later(() => {
        cell.setAttribute('fill', colors.itemDefault);
        text.setAttribute('fill', colors.text);
      }, ms);
    }

    function flashFrame(id: string, stroke: string, ms: number): void {
      const p = placed.get(id);
      if (!p) return;
      p.frame.setAttribute('stroke', stroke);
      p.frame.setAttribute('stroke-width', '2.5');
      later(() => {
        p.frame.setAttribute('stroke', colors.border);
        p.frame.setAttribute('stroke-width', '1.5');
      }, ms);
    }

    return {
      setTree(list: StageNode[], rootId: string): void {
        if (destroyed) return;
        render(list, rootId);
      },

      enter(id: string, caption: string): void {
        if (destroyed) return;
        flashFrame(id, colors.accent, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      compare(id: string, keyIndex: number, caption: string): void {
        if (destroyed) return;
        flashCell(id, keyIndex, colors.itemComparing, colors.stateInk, MOVE_MS * 2);
        captionText.textContent = caption;
      },

      settle(id: string, keyIndex: number, caption: string): void {
        if (destroyed) return;
        flashCell(id, keyIndex, colors.itemPivot, colors.stateInk, MOVE_MS * 4);
        captionText.textContent = caption;
      },

      /** 쪼개지거나 합쳐지거나 빌려 왔다 — 자리 전체가 바뀐 순간. */
      restructure(id: string, caption: string): void {
        if (destroyed) return;
        flashFrame(id, colors.itemSwapping, MOVE_MS * 4);
        captionText.textContent = caption;
      },

      miss(id: string, caption: string): void {
        if (destroyed) return;
        flashFrame(id, colors.danger, MOVE_MS * 3);
        captionText.textContent = caption;
      },

      caption(text: string): void {
        if (destroyed) return;
        captionText.textContent = text;
      },

      empty(): void {
        if (destroyed) return;
        captionText.textContent = t('caption.empty', 'Nothing here yet.');
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        svg.textContent = '';
      },
    } satisfies ViewInstance & Record<string, unknown>;
  },
};

/** projector 가 부르는 메서드 묶음. */
export type BTreeStage = {
  setTree(list: StageNode[], rootId: string): void;
  enter(id: string, caption: string): void;
  compare(id: string, keyIndex: number, caption: string): void;
  settle(id: string, keyIndex: number, caption: string): void;
  restructure(id: string, caption: string): void;
  miss(id: string, caption: string): void;
  caption(text: string): void;
};
