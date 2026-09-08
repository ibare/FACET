/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 이 조각은 배열 한 줄과 나무를 한
 * 캔버스에 같이 놓고 커서 하나가 두 그림을 오간다. 그 view 는 나무만 알고
 * 배열 쪽 짝을 그릴 자리가 없다. 더구나 이 조각의 주장이 "잇는 줄을 저장하지
 * 않는다" 라서 간선을 상시로 그리는 view 는 그림이 주장을 반박한다
 * (원칙 6 의 예외 조건).
 *
 * array-as-tree-stage — 한 화면에 배열 한 줄과 나무 한 그루를 같이 그린다.
 *
 * 위: 번호 순서로 늘어선 칸. 아래: 같은 값을 나무로 본 자리. 커서 하나가 두
 * 그림에 동시에 있고, 점선이 "지금 이 칸이 나무의 어느 자리인가" 를 잇는다.
 * 걸음마다 커서가 실제로 미끄러져 옮겨간다 — 칸에서 칸으로, 자리에서 자리로.
 * 자식이 칸 수를 넘으면 점선 유령 자리가 잠깐 나타났다 사라진다.
 *
 * Projector 계약 (동기/비동기 메서드):
 *   init(values)                                          동기. 기본 그림.
 *   jumpTo(toIndex, caption)                    Promise.   커서가 미끄러져 옮겨간다.
 *   showLeafMiss(atIndex, leftIndex, rightIndex, caption)  Promise. 유령 자리.
 *   showConclude(caption)                                  Promise. 마무리.
 *   clearCursor()                                          동기. 되감기 — 커서/유령 제거.
 */

import { fonts, fontSizes, getColors, PIECE_CANVAS_W, type CanvasView, type Theme } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const SIDE_MIN = 28;
const CELL_MAX_W = 84;
const ARRAY_TOP = 40;
const CELL_H = 56;
const TREE_GAP = 78;
const LEVEL_GAP = 76;
const NODE_R = 22;
const GHOST_R = 15;
const GHOST_DX = 44;
const GHOST_DY = 54;
const CAPTION_LINE_H = 18;
const CAPTION_MAX_LINES = 3;
const CAPTION_GAP = 20;
const BOTTOM_PAD = 18;
const CAPTION_MAX_CHARS = 60;

const JUMP_MS = 460;
const APPEAR_MS = 260;
const ARC_FADE_MS = 120;

type Point = { x: number; y: number };

function levelCount(n: number): number {
  return Math.floor(Math.log2(Math.max(1, n))) + 1;
}

function nodeLevel(i: number): number {
  return Math.floor(Math.log2(i + 1));
}

function treeTopY(): number {
  return ARRAY_TOP + CELL_H + TREE_GAP;
}

function lastLevelY(n: number): number {
  return treeTopY() + (levelCount(n) - 1) * LEVEL_GAP;
}

function captionTopY(n: number): number {
  const treeBottom = lastLevelY(n) + NODE_R;
  const ghostBottom = lastLevelY(n) + GHOST_DY + GHOST_R;
  return Math.max(treeBottom, ghostBottom) + CAPTION_GAP;
}

function canvasHeight(n: number): number {
  return captionTopY(n) + CAPTION_LINE_H * CAPTION_MAX_LINES + BOTTOM_PAD;
}

function cellGeom(n: number): { cellW: number; originX: number } {
  const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n));
  const originX = Math.round((W - n * cellW) / 2);
  return { cellW, originX };
}

function cellCenter(i: number, cellW: number, originX: number): Point {
  return { x: originX + cellW * (i + 0.5), y: ARRAY_TOP + CELL_H / 2 };
}

function nodePos(i: number): Point {
  const level = nodeLevel(i);
  const firstIdx = 2 ** level - 1;
  const posInLevel = i - firstIdx;
  const countInLevel = 2 ** level;
  const slotW = (W - SIDE_MIN * 2) / countInLevel;
  return {
    x: SIDE_MIN + slotW * (posInLevel + 0.5),
    y: treeTopY() + level * LEVEL_GAP,
  };
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
  if (durationMs <= 0) {
    onFrame(1);
    return Promise.resolve();
  }
  const start = Date.now();
  return new Promise<void>((resolve) => {
    function tick(): void {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      onFrame(t);
      if (t >= 1) {
        resolve();
        return;
      }
      setTimeout(tick, 16);
    }
    tick();
  });
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node;
}

export type ArrayAsTreeStageInstance = {
  destroy(): void;
  init(values: number[]): void;
  jumpTo(toIndex: number, caption: string): Promise<void>;
  showLeafMiss(atIndex: number, leftIndex: number, rightIndex: number, caption: string): Promise<void>;
  showConclude(caption: string): Promise<void>;
  clearCursor(): void;
};

export const arrayAsTreeStageView: CanvasView = {
  canvas: { height: canvasHeight(7) },

  mount(_container, params): ArrayAsTreeStageInstance {
    const canvas = params.canvas;
    const theme: Theme | undefined = params.theme;
    const palette = getColors(theme);

    canvas.textContent = '';

    let n = 0;
    let cellW = 0;
    let originX = 0;
    let currentIndex: number | null = null;

    const root = el('g');
    canvas.appendChild(root);

    const cellsG = el('g');
    const treeG = el('g');
    const jumpArcG = el('g');
    const twinLinkG = el('g');
    const ghostG = el('g');
    const cursorG = el('g');
    const captionG = el('g');
    root.append(cellsG, treeG, jumpArcG, twinLinkG, ghostG, cursorG, captionG);

    const cellRects: SVGRectElement[] = [];
    const nodeCircles: SVGCircleElement[] = [];

    const twinLink = el('line', {
      stroke: palette.itemActive,
      'stroke-width': 1.5,
      'stroke-dasharray': '3,4',
      opacity: 0,
    });
    twinLinkG.appendChild(twinLink);

    const jumpArc = el('line', {
      stroke: palette.itemActive,
      'stroke-width': 2,
      'stroke-dasharray': '5,5',
      opacity: 0,
    });
    jumpArcG.appendChild(jumpArc);

    const arrayRing = el('rect', {
      fill: 'none',
      stroke: palette.itemActive,
      'stroke-width': 3,
      rx: 6,
      ry: 6,
      opacity: 0,
    });
    const treeRing = el('circle', {
      fill: 'none',
      stroke: palette.itemActive,
      'stroke-width': 3,
      r: NODE_R + 4,
      opacity: 0,
    });
    cursorG.append(arrayRing, treeRing);

    const captionText = el('text', {
      x: W / 2,
      'text-anchor': 'middle',
      fill: palette.text,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
    });
    captionG.appendChild(captionText);

    function positionArrayRing(p: Point): void {
      arrayRing.setAttribute('x', String(p.x - cellW / 2 - 3));
      arrayRing.setAttribute('y', String(p.y - CELL_H / 2 - 3));
      arrayRing.setAttribute('width', String(cellW + 6));
      arrayRing.setAttribute('height', String(CELL_H + 6));
    }

    function positionTreeRing(p: Point): void {
      treeRing.setAttribute('cx', String(p.x));
      treeRing.setAttribute('cy', String(p.y));
    }

    function setLine(line: SVGLineElement, from: Point, to: Point): void {
      line.setAttribute('x1', String(from.x));
      line.setAttribute('y1', String(from.y));
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y));
    }

    function setCaption(text: string): void {
      captionText.textContent = '';
      const lines = text ? wrapText(text, CAPTION_MAX_CHARS).slice(0, CAPTION_MAX_LINES) : [];
      const top = captionTopY(n) + CAPTION_LINE_H;
      lines.forEach((line, idx) => {
        const tspan = el('tspan', { x: W / 2, y: top + idx * CAPTION_LINE_H });
        tspan.textContent = line;
        captionText.appendChild(tspan);
      });
    }

    function clearGhosts(): void {
      ghostG.textContent = '';
    }

    function resetTint(): void {
      for (const r of cellRects) r.setAttribute('stroke', palette.border);
      for (const c of nodeCircles) c.setAttribute('stroke', palette.border);
    }

    function buildGhost(at: Point, target: Point, label: number): void {
      const line = el('line', {
        x1: at.x,
        y1: at.y,
        x2: target.x,
        y2: target.y,
        stroke: palette.ghostOutline,
        'stroke-width': 1.5,
        'stroke-dasharray': '2,4',
      });
      const circle = el('circle', {
        cx: target.x,
        cy: target.y,
        r: GHOST_R,
        fill: 'none',
        stroke: palette.ghostOutline,
        'stroke-width': 1.5,
        'stroke-dasharray': '3,3',
      });
      const d = GHOST_R * 0.55;
      const crossA = el('line', {
        x1: target.x - d,
        y1: target.y - d,
        x2: target.x + d,
        y2: target.y + d,
        stroke: palette.ghostOutline,
        'stroke-width': 1.5,
      });
      const crossB = el('line', {
        x1: target.x - d,
        y1: target.y + d,
        x2: target.x + d,
        y2: target.y - d,
        stroke: palette.ghostOutline,
        'stroke-width': 1.5,
      });
      const text = el('text', {
        x: target.x,
        y: target.y + GHOST_R + 13,
        'text-anchor': 'middle',
        fill: palette.textMuted,
        'font-size': fontSizes.xs,
      });
      text.textContent = String(label);
      ghostG.append(line, circle, crossA, crossB, text);
    }

    return {
      destroy(): void {
        canvas.textContent = '';
      },

      init(values: number[]): void {
        n = values.length;
        const geom = cellGeom(n);
        cellW = geom.cellW;
        originX = geom.originX;
        currentIndex = null;

        canvas.setAttribute('viewBox', `0 0 ${W} ${canvasHeight(n)}`);

        cellsG.textContent = '';
        treeG.textContent = '';
        clearGhosts();
        cellRects.length = 0;
        nodeCircles.length = 0;

        for (let i = 0; i < n; i += 1) {
          const c = cellCenter(i, cellW, originX);
          const rect = el('rect', {
            x: c.x - cellW / 2,
            y: ARRAY_TOP,
            width: cellW,
            height: CELL_H,
            rx: 4,
            ry: 4,
            fill: palette.itemDefault,
            stroke: palette.border,
            'stroke-width': 1.5,
          });
          const idxLabel = el('text', {
            x: c.x,
            y: ARRAY_TOP - 8,
            'text-anchor': 'middle',
            fill: palette.textMuted,
            'font-size': fontSizes.xs,
          });
          idxLabel.textContent = String(i);
          const valLabel = el('text', {
            x: c.x,
            y: ARRAY_TOP + CELL_H / 2 + 5,
            'text-anchor': 'middle',
            fill: palette.text,
            'font-size': fontSizes.lg,
            'font-weight': 600,
          });
          valLabel.textContent = String(values[i]);
          cellsG.append(rect, idxLabel, valLabel);
          cellRects.push(rect);
        }

        for (let i = 0; i < n; i += 1) {
          const p = nodePos(i);
          const circle = el('circle', {
            cx: p.x,
            cy: p.y,
            r: NODE_R,
            fill: palette.itemDefault,
            stroke: palette.border,
            'stroke-width': 1.5,
          });
          const valLabel = el('text', {
            x: p.x,
            y: p.y + 5,
            'text-anchor': 'middle',
            fill: palette.text,
            'font-size': fontSizes.md,
            'font-weight': 600,
          });
          valLabel.textContent = String(values[i]);
          const idxLabel = el('text', {
            x: p.x,
            y: p.y + NODE_R + 13,
            'text-anchor': 'middle',
            fill: palette.textMuted,
            'font-size': fontSizes.xs,
          });
          idxLabel.textContent = String(i);
          treeG.append(circle, valLabel, idxLabel);
          nodeCircles.push(circle);
        }

        twinLink.setAttribute('opacity', '0');
        jumpArc.setAttribute('opacity', '0');
        arrayRing.setAttribute('opacity', '0');
        treeRing.setAttribute('opacity', '0');
        setCaption('');
      },

      async jumpTo(toIndex: number, caption: string): Promise<void> {
        clearGhosts();
        resetTint();
        const arrTo = cellCenter(toIndex, cellW, originX);
        const treeTo = nodePos(toIndex);

        if (currentIndex === null) {
          positionArrayRing(arrTo);
          positionTreeRing(treeTo);
          await tween(APPEAR_MS, (t) => {
            arrayRing.setAttribute('opacity', String(t));
            treeRing.setAttribute('opacity', String(t));
          });
        } else {
          const arrFrom = cellCenter(currentIndex, cellW, originX);
          const treeFrom = nodePos(currentIndex);
          twinLink.setAttribute('opacity', '0');
          setLine(jumpArc, treeFrom, treeTo);
          await tween(JUMP_MS, (t) => {
            jumpArc.setAttribute('opacity', String(t < 0.5 ? t * 2 : 1));
            positionArrayRing({ x: arrFrom.x + (arrTo.x - arrFrom.x) * t, y: arrFrom.y });
            positionTreeRing({
              x: treeFrom.x + (treeTo.x - treeFrom.x) * t,
              y: treeFrom.y + (treeTo.y - treeFrom.y) * t,
            });
          });
          await tween(ARC_FADE_MS, (t) => {
            jumpArc.setAttribute('opacity', String(1 - t));
          });
        }

        currentIndex = toIndex;
        setLine(twinLink, arrTo, treeTo);
        twinLink.setAttribute('opacity', '1');
        setCaption(caption);
      },

      async showLeafMiss(
        atIndex: number,
        leftIndex: number,
        rightIndex: number,
        caption: string,
      ): Promise<void> {
        clearGhosts();
        const at = nodePos(atIndex);
        const gL: Point = { x: at.x - GHOST_DX, y: at.y + GHOST_DY };
        const gR: Point = { x: at.x + GHOST_DX, y: at.y + GHOST_DY };
        buildGhost(at, gL, leftIndex);
        buildGhost(at, gR, rightIndex);
        ghostG.setAttribute('opacity', '0');
        await tween(220, (t) => {
          ghostG.setAttribute('opacity', String(t));
        });
        setCaption(caption);
      },

      async showConclude(caption: string): Promise<void> {
        clearGhosts();
        arrayRing.setAttribute('opacity', '0');
        treeRing.setAttribute('opacity', '0');
        twinLink.setAttribute('opacity', '0');
        for (const r of cellRects) r.setAttribute('stroke', palette.itemActive);
        for (const c of nodeCircles) c.setAttribute('stroke', palette.itemActive);
        setCaption(caption);
      },

      clearCursor(): void {
        currentIndex = null;
        clearGhosts();
        resetTint();
        arrayRing.setAttribute('opacity', '0');
        treeRing.setAttribute('opacity', '0');
        twinLink.setAttribute('opacity', '0');
        jumpArc.setAttribute('opacity', '0');
        setCaption('');
      },
    };
  },
};
