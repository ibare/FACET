/**
 * traversal-order-stage — 순회 순서 조각의 전용 그림.
 *
 * 화면은 위에서 아래로 셋이다.
 *
 *   1. 나무 한 그루와 그 둘레를 도는 길. 길은 점선으로 처음부터 깔려 있고 세
 *      차례 내내 한 번도 바뀌지 않는다. 발은 그 위를 그대로 밟는다.
 *   2. 세는 순간 표식 — 노드마다 하나씩, 일곱 개. 차례가 바뀔 때 노드의
 *      왼쪽 → 아래 → 오른쪽으로 **자리를 옮긴다.** 이 조각이 하는 말이 이
 *      움직임 하나에 다 들어 있다.
 *   3. 결과 세 줄. 발이 세는 접점을 밟을 때마다 그 값이 나무에서 줄의 칸으로
 *      떨어진다. 세 줄이 다 차면 그대로 견주기가 된다.
 *
 * 메서드는 동기로 즉시 반영하고 사이는 CSS 전이가 잇는다. 걸음 간격은
 * algorithm 의 `ctx.sleep` 이 정하므로 (S-piece) view 가 Promise 로 러너를
 * 붙들지 않는다 — 붙들면 간격이 두 번 세어진다.
 *
 * 색 어휘 (S-view 결정 트리)
 *   accent      "제 자리를 밟는 순간" — 표식 · 룰 글리프의 점 · 밟힌 노드 ·
 *               떨어지는 값. 이 조각의 단일 강조다.
 *   itemActive  발이 지나는 중 — 발 · 지나온 자취 · 스쳐 가는 노드의 테두리.
 *   structural  나무 · 길 · 칸 · 글자.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { TraversalMoment } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 376;
const PAD = 14;

// ── 나무 ────────────────────────────────────────────────────────────────
const NODE_R = 17;
const ROOT_CY = 46;
const LEVEL_H = 62;
/** 노드 중심에서 접점까지. 세 접점은 왼쪽 · 아래 · 오른쪽에 놓인다. */
const TOUCH_OFF = NODE_R + 11;
/** 잎 간격의 **상한**. 실제 간격은 캔버스 폭에서 역산한다 (S-piece). */
const LEAF_GAP_MAX = 148;
const TREE_SIDE_MIN = 44;
const FOOT_R = 7;
const MARK_R = 4.5;

// ── 결과 줄 ─────────────────────────────────────────────────────────────
const ROWS_TOP = 216;
const ROW_H = 34;
const ROW_GAP = 10;
const CELL_H = 30;
/** 칸 사이 틈. 칸 폭은 남는 자리를 나눠 가진다. */
const CELL_INSET = 5;
const GLYPH_SLOT = 16;
const GLYPH_GAP = 4;
const GLYPH_X = 92;
const CELLS_X = 162;
const CAPTION_Y = 360;

const DEFAULT_STEP_MS = 480;

type Pt = { x: number; y: number };

type StageInitData = {
  values: number[];
  orders: TraversalMoment[];
  stepMs: number;
};

type CellEls = { rect: SVGElement; text: SVGElement };
type RowEls = { group: SVGElement; cells: CellEls[] };

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function translate(p: Pt): string {
  return `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
}

function pathOf(points: Pt[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
}

/**
 * 완전 이진 트리의 노드 중심 좌표.
 *
 * 잎을 캔버스 폭에 고르게 펴고 부모는 제 잎들의 한가운데에 놓는다. 간격을
 * 상수로 못박지 않고 폭에서 역산하므로 좌우로 버리는 자리가 없다.
 */
function computeNodePositions(count: number): Pt[] {
  if (count <= 0) return [];
  const depth = Math.floor(Math.log2(count));
  const leaves = 2 ** depth;
  const gap =
    leaves > 1 ? Math.min(LEAF_GAP_MAX, Math.floor((W - TREE_SIDE_MIN * 2) / (leaves - 1))) : 0;
  const x0 = Math.round((W - gap * (leaves - 1)) / 2);
  const points: Pt[] = [];
  for (let i = 0; i < count; i += 1) {
    const level = Math.floor(Math.log2(i + 1));
    const posInLevel = i + 1 - 2 ** level;
    const span = 2 ** (depth - level);
    points.push({
      x: x0 + (posInLevel * span + (span - 1) / 2) * gap,
      y: ROOT_CY + level * LEVEL_H,
    });
  }
  return points;
}

/** 룰 글리프 세 칸의 내용. 제 자리(점)가 몇 번째 칸인가가 곧 차례의 정의다. */
function glyphSlots(order: TraversalMoment): ('self' | 'left' | 'right')[] {
  if (order === 'pre') return ['self', 'left', 'right'];
  if (order === 'in') return ['left', 'self', 'right'];
  return ['left', 'right', 'self'];
}

export const traversalOrderStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;
    const cellRadius = Number.parseFloat(radii.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const after = (ms: number, fn: () => void): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const clearTimers = (): void => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };

    const layers = {
      guide: el('g', {}),
      trail: el('g', {}),
      edges: el('g', {}),
      nodes: el('g', {}),
      marks: el('g', {}),
      foot: el('g', {}),
      rows: el('g', {}),
      drops: el('g', {}),
      caption: el('g', {}),
    };
    for (const layer of Object.values(layers)) svg.appendChild(layer);

    let data: StageInitData = { values: [], orders: [], stepMs: DEFAULT_STEP_MS };
    let nodePos: Pt[] = [];
    let startPt: Pt = { x: W / 2, y: ROOT_CY - NODE_R - 20 };
    let cellW = 0;
    let footMs = Math.round(DEFAULT_STEP_MS * 0.2);
    let dropMs = Math.round(DEFAULT_STEP_MS * 0.45);
    let markMs = Math.round(DEFAULT_STEP_MS * 0.62);

    const indexOfValue = new Map<number, number>();
    const nodeCircles = new Map<number, SVGElement>();
    const marks: SVGElement[] = [];
    const rows: RowEls[] = [];
    let foot: SVGElement | null = null;
    let trailPath: SVGElement | null = null;
    let captionText: SVGElement | null = null;
    let trailPts: Pt[] = [];
    let lastTouched: number | null = null;

    function touchPoint(index: number, moment: TraversalMoment): Pt {
      const p = nodePos[index];
      if (p === undefined) return startPt;
      if (moment === 'pre') return { x: p.x - TOUCH_OFF, y: p.y };
      if (moment === 'in') return { x: p.x, y: p.y + TOUCH_OFF };
      return { x: p.x + TOUCH_OFF, y: p.y };
    }

    /** 나무가 정하는 한 바퀴. 순서가 무엇이든 이 길은 같다. */
    function routePoints(count: number): Pt[] {
      const points: Pt[] = [startPt];
      const walk = (i: number): void => {
        if (i >= count) return;
        points.push(touchPoint(i, 'pre'));
        walk(i * 2 + 1);
        points.push(touchPoint(i, 'in'));
        walk(i * 2 + 2);
        points.push(touchPoint(i, 'post'));
      };
      walk(0);
      points.push(startPt);
      return points;
    }

    function rowTop(index: number): number {
      return ROWS_TOP + index * (ROW_H + ROW_GAP);
    }

    function cellCenter(rowIndex: number, slot: number): Pt {
      return {
        x: CELLS_X + slot * cellW + (cellW - CELL_INSET) / 2,
        y: rowTop(rowIndex) + (ROW_H - CELL_H) / 2 + CELL_H / 2,
      };
    }

    function labelOf(order: TraversalMoment): string {
      if (order === 'pre') return tr('label.preorder', 'preorder');
      if (order === 'in') return tr('label.inorder', 'inorder');
      return tr('label.postorder', 'postorder');
    }

    function paintNode(value: number, state: 'idle' | 'passing' | 'stamped'): void {
      const circle = nodeCircles.get(value);
      if (circle === undefined) return;
      if (state === 'stamped') {
        circle.setAttribute('fill', palette.accent);
        circle.setAttribute('stroke', palette.text);
        circle.setAttribute('stroke-width', '2.5');
      } else if (state === 'passing') {
        circle.setAttribute('fill', palette.bgSubtle);
        circle.setAttribute('stroke', palette.itemActive);
        circle.setAttribute('stroke-width', '2.5');
      } else {
        circle.setAttribute('fill', palette.itemDefault);
        circle.setAttribute('stroke', palette.border);
        circle.setAttribute('stroke-width', '1.5');
      }
    }

    function moveFoot(p: Pt): void {
      if (foot === null) return;
      foot.style.transform = translate(p);
    }

    function pushTrail(p: Pt): void {
      trailPts.push(p);
      trailPath?.setAttribute('d', pathOf(trailPts));
    }

    function clearCell(cell: CellEls): void {
      cell.rect.setAttribute('fill', 'none');
      cell.rect.setAttribute('stroke', palette.border);
      cell.rect.setAttribute('stroke-dasharray', '3 4');
      cell.text.textContent = '';
    }

    function fillCell(cell: CellEls, value: number): void {
      cell.rect.setAttribute('fill', palette.bgSubtle);
      cell.rect.setAttribute('stroke', palette.text);
      cell.rect.removeAttribute('stroke-dasharray');
      cell.text.textContent = String(value);
    }

    /** 값이 나무에서 칸으로 떨어진다 — 세었다는 것이 곧 자리를 얻는 일이다. */
    function drop(from: Pt, to: Pt, value: number, onLand: () => void): void {
      const token = el('g', {});
      token.style.transform = translate(from);
      token.appendChild(
        el('circle', { r: NODE_R - 3, fill: palette.accent, stroke: palette.text, 'stroke-width': 1.5 }),
      );
      const label = el('text', {
        x: 0,
        y: 6,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: palette.text,
      });
      label.textContent = String(value);
      token.appendChild(label);
      layers.drops.appendChild(token);

      after(16, () => {
        token.style.transition = `transform ${dropMs}ms cubic-bezier(0.4, 0, 0.6, 1)`;
        token.style.transform = translate(to);
      });
      after(dropMs + 40, () => {
        token.remove();
        onLand();
      });
    }

    function buildTree(): void {
      const { values } = data;
      for (let i = 0; i < values.length; i += 1) {
        const p = nodePos[i];
        const parent = nodePos[Math.floor((i - 1) / 2)];
        if (p === undefined) continue;
        if (i > 0 && parent !== undefined) {
          layers.edges.appendChild(
            el('line', {
              x1: parent.x,
              y1: parent.y,
              x2: p.x,
              y2: p.y,
              stroke: palette.border,
              'stroke-width': 1.5,
            }),
          );
        }
      }
      for (let i = 0; i < values.length; i += 1) {
        const p = nodePos[i];
        const value = values[i];
        if (p === undefined || value === undefined) continue;
        const group = el('g', {});
        const circle = el('circle', {
          cx: p.x,
          cy: p.y,
          r: NODE_R,
          fill: palette.itemDefault,
          stroke: palette.border,
          'stroke-width': 1.5,
        });
        circle.style.transition = 'fill 140ms linear, stroke 140ms linear';
        const label = el('text', {
          x: p.x,
          y: p.y + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          fill: palette.text,
        });
        label.textContent = String(value);
        group.append(circle, label);
        layers.nodes.appendChild(group);
        nodeCircles.set(value, circle);

        // 세는 순간 표식. 처음에는 감춰 두고, 차례가 시작될 때 그 차례의
        // 접점으로 옮기며 나타난다.
        const mark = el('circle', {
          r: MARK_R,
          fill: palette.accent,
          stroke: palette.text,
          'stroke-width': 1.2,
        });
        mark.style.opacity = '0';
        mark.style.transform = translate(touchPoint(i, 'pre'));
        layers.marks.appendChild(mark);
        marks.push(mark);
      }
    }

    function buildRows(): void {
      const { values, orders } = data;
      cellW = values.length > 0 ? Math.floor((W - PAD - CELLS_X) / values.length) : 0;

      for (let r = 0; r < orders.length; r += 1) {
        const order = orders[r];
        if (order === undefined) continue;
        const top = rowTop(r);
        const group = el('g', {});
        group.style.transition = 'opacity 260ms linear';
        group.style.opacity = '0.4';

        const label = el('text', {
          x: PAD,
          y: top + ROW_H / 2 + 4,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: palette.text,
        });
        label.textContent = labelOf(order);
        group.appendChild(label);

        const slots = glyphSlots(order);
        for (let s = 0; s < slots.length; s += 1) {
          const gx = GLYPH_X + s * (GLYPH_SLOT + GLYPH_GAP);
          const gy = top + (ROW_H - GLYPH_SLOT) / 2;
          group.appendChild(
            el('rect', {
              x: gx,
              y: gy,
              width: GLYPH_SLOT,
              height: GLYPH_SLOT,
              rx: cellRadius,
              fill: palette.bg,
              stroke: palette.border,
              'stroke-width': 1,
            }),
          );
          const kind = slots[s];
          if (kind === 'self') {
            group.appendChild(
              el('circle', {
                cx: gx + GLYPH_SLOT / 2,
                cy: gy + GLYPH_SLOT / 2,
                r: 4.5,
                fill: palette.accent,
                stroke: palette.text,
                'stroke-width': 1.2,
              }),
            );
          } else if (kind === 'left') {
            // 왼쪽으로 드리운 가지.
            group.appendChild(
              el('path', {
                d: `M${gx + 12.5},${gy + 3.5} L${gx + 12.5},${gy + 12.5} L${gx + 3},${gy + 12.5} Z`,
                fill: palette.textMuted,
              }),
            );
          } else {
            group.appendChild(
              el('path', {
                d: `M${gx + 3.5},${gy + 3.5} L${gx + 13},${gy + 12.5} L${gx + 3.5},${gy + 12.5} Z`,
                fill: palette.textMuted,
              }),
            );
          }
        }

        const cells: CellEls[] = [];
        for (let s = 0; s < values.length; s += 1) {
          const rect = el('rect', {
            x: CELLS_X + s * cellW,
            y: top + (ROW_H - CELL_H) / 2,
            width: Math.max(0, cellW - CELL_INSET),
            height: CELL_H,
            rx: cellRadius,
            fill: 'none',
            stroke: palette.border,
            'stroke-dasharray': '3 4',
            'stroke-width': 1.2,
          });
          const center = cellCenter(r, s);
          const text = el('text', {
            x: center.x,
            y: center.y + 6,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            fill: palette.text,
          });
          group.append(rect, text);
          cells.push({ rect, text });
        }

        layers.rows.appendChild(group);
        rows.push({ group, cells });
      }
    }

    function render(): void {
      clearTimers();
      for (const layer of Object.values(layers)) {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
      }
      indexOfValue.clear();
      nodeCircles.clear();
      marks.length = 0;
      rows.length = 0;
      foot = null;
      trailPath = null;
      captionText = null;
      trailPts = [];
      lastTouched = null;

      const { values, stepMs } = data;
      footMs = Math.max(60, Math.round(stepMs * 0.2));
      dropMs = Math.max(120, Math.round(stepMs * 0.45));
      markMs = Math.max(160, Math.round(stepMs * 0.62));

      nodePos = computeNodePositions(values.length);
      const root = nodePos[0];
      startPt = { x: root?.x ?? W / 2, y: ROOT_CY - NODE_R - 20 };
      for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (value !== undefined) indexOfValue.set(value, i);
      }

      // 나무가 정하는 한 바퀴. 세 차례가 이 위를 그대로 다시 밟는다.
      layers.guide.appendChild(
        el('path', {
          d: pathOf(routePoints(values.length)),
          fill: 'none',
          stroke: palette.border,
          'stroke-width': 1.2,
          'stroke-dasharray': '4 5',
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        }),
      );

      trailPath = el('path', {
        d: '',
        fill: 'none',
        stroke: palette.itemActive,
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        opacity: 0.35,
      });
      layers.trail.appendChild(trailPath);

      buildTree();
      buildRows();

      const footGroup = el('g', {});
      footGroup.appendChild(
        el('circle', {
          r: FOOT_R,
          fill: palette.itemActive,
          stroke: palette.bg,
          'stroke-width': 2,
        }),
      );
      footGroup.style.transform = translate(startPt);
      footGroup.style.opacity = '0';
      layers.foot.appendChild(footGroup);
      foot = footGroup;

      captionText = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: palette.textMuted,
      });
      layers.caption.appendChild(captionText);

      // 제자리 배치가 끝난 다음 프레임에 전이를 켠다. 첫 배치까지 미끄러지면
      // 나무가 흘러 들어오는 것처럼 보인다.
      after(16, () => {
        footGroup.style.transition = `transform ${footMs}ms linear, opacity 200ms linear`;
        for (const mark of marks) {
          mark.style.transition = `transform ${markMs}ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms linear`;
        }
      });
    }

    return {
      destroy(): void {
        clearTimers();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },

      init(next: StageInitData): void {
        data = {
          values: [...next.values],
          orders: [...next.orders],
          stepMs: next.stepMs,
        };
        render();
      },

      /** 한 차례가 시작된다. 표식 일곱이 이번 차례의 접점으로 옮겨 간다. */
      beginOrder(order: TraversalMoment, index: number): void {
        if (lastTouched !== null) {
          paintNode(lastTouched, 'idle');
          lastTouched = null;
        }
        trailPts = [startPt];
        trailPath?.setAttribute('d', pathOf(trailPts));
        moveFoot(startPt);
        if (foot !== null) foot.style.opacity = '1';

        for (let i = 0; i < marks.length; i += 1) {
          const mark = marks[i];
          if (mark === undefined) continue;
          mark.style.opacity = '1';
          mark.style.transform = translate(touchPoint(i, order));
        }

        for (let r = 0; r < rows.length; r += 1) {
          const row = rows[r];
          if (row === undefined) continue;
          row.group.style.opacity = r === index ? '1' : r < index ? '0.8' : '0.4';
          if (r === index) for (const cell of row.cells) clearCell(cell);
        }
      },

      /** 발이 접점 하나에 닿았다. */
      touch(value: number, moment: TraversalMoment, counted: boolean): void {
        const index = indexOfValue.get(value);
        if (index === undefined) return;
        const p = touchPoint(index, moment);
        moveFoot(p);
        pushTrail(p);
        if (lastTouched !== null && lastTouched !== value) paintNode(lastTouched, 'idle');
        paintNode(value, counted ? 'stamped' : 'passing');
        lastTouched = value;
      },

      /** 세는 접점이었으므로 값이 그 줄의 칸으로 떨어진다. */
      record(order: TraversalMoment, slot: number, value: number): void {
        const rowIndex = data.orders.indexOf(order);
        const row = rows[rowIndex];
        const cell = row?.cells[slot];
        const index = indexOfValue.get(value);
        if (cell === undefined || index === undefined) return;
        const from = nodePos[index];
        if (from === undefined) return;
        const to = cellCenter(rowIndex, slot);
        // 발이 닿고 나서 떨어지도록 한 박자 늦춘다.
        after(footMs, () => drop(from, to, value, () => fillCell(cell, value)));
      },

      /** 한 차례를 마치고 발이 들어온 자리로 돌아간다. 한 바퀴가 닫힌다. */
      endOrder(index: number): void {
        if (lastTouched !== null) {
          paintNode(lastTouched, 'idle');
          lastTouched = null;
        }
        moveFoot(startPt);
        pushTrail(startPt);
        const row = rows[index];
        if (row !== undefined) row.group.style.opacity = '0.85';
      },

      /** 세 줄을 나란히 놓는다. 견주는 것이 이 조각의 결론이다. */
      finish(): void {
        for (const row of rows) row.group.style.opacity = '1';
        for (const mark of marks) mark.style.opacity = '0';
        if (foot !== null) foot.style.opacity = '0';
        trailPath?.setAttribute('opacity', '0');
      },

      rewind(): void {
        render();
      },

      setCaption(text: string): void {
        if (captionText !== null) captionText.textContent = text;
      },
    };
  },
};
