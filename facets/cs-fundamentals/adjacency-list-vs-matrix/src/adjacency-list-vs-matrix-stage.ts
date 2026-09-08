/**
 * 빌트인 `graph-layout` 을 쓰지 않은 이유: 이 조각이 그리는 것은 그래프가
 * 아니라 **그래프를 담는 두 그릇**이다. 목록이 자라는 것과 표가 채워지는 것을
 * 나란히 놓아야 하는데, 그 view 는 정점과 간선을 그릴 뿐 담는 자료구조 자체를
 * 그릴 어휘가 없다 (원칙 6 의 예외 조건).
 *
 * adjacency-list-vs-matrix-stage — 두 그릇을 나란히 그리는 조각 전용 view.
 *
 * 왼쪽: 인접 리스트. 정점마다 빈 줄로 시작해 간선이 생길 때마다 칸이 하나씩
 * **실제로 폭이 자라며** 옆에 붙는다 (`addEdge`) — 든 만큼만 자리를 쓴다.
 *
 * 오른쪽: 인접 행렬. 처음부터 정점 수 × 정점 수 칸을 전부 그려 두고, 간선이
 * 생기면 이미 있던 칸의 값만 0→1 로 뒤집는다 — 자리는 처음부터 다 잡혀 있다.
 *
 * 두 물음(`scanCell`)은 커서(테두리 사각형)가 **실제로 이동하며** 칸을 하나씩
 * 짚는다. 커서가 멈추는 횟수 자체가 그 물음의 비용이다 — 같은 A 라는 정점을
 * 스캔해도 리스트 쪽은 목록 길이만큼, 행렬 쪽은 물음에 따라 1번 또는 행 전체를
 * 짚어, 싸고 비싼 쪽이 물음마다 뒤바뀌는 것을 걸음 수 자체로 보인다.
 */

import type { CanvasView, Theme, Translate, ViewInstance } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator, PIECE_CANVAS_W, radii } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = PIECE_CANVAS_W;
const CELL_RADIUS = Number.parseInt(radii.sm, 10) || 3;

/** stage 가 받는 초기 데이터. algorithm 의 타입을 import 하지 않고 동형 선언 (S-piece). */
export type AdjacencyStageData = {
  vertices: string[];
  edges: [string, string][];
};

export type AdjacencyScanArgs = {
  side: 'list' | 'matrix';
  cellIndex: number;
  cellVertex: string;
  count: number;
  matched: boolean;
};

export type AdjacencyResultArgs = {
  question: 1 | 2;
  listCost: number;
  matrixCost: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node;
}

/**
 * 속성을 실제로 변화시키는 애니메이션. CSS transition 을 건 뒤 다음 tick 에
 * 목표값을 적용해 "전" 상태가 등록되게 한다. 애니메이션이 재생되지 않는
 * 환경(happy-dom 등)에서도 목표값은 즉시 반영되고, 반환하는 Promise 는
 * 지정한 시간 뒤 항상 resolve 한다.
 */
function animate(node: SVGElement, attrs: Record<string, string | number>, ms: number): Promise<void> {
  const props = Object.keys(attrs);
  node.style.transition = props.map((p) => `${p} ${ms}ms ease`).join(', ');
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    }, 0);
    setTimeout(resolve, ms + 40);
  });
}

type LayoutState = {
  vertices: string[];
  indexOf: Map<string, number>;
  queryVertex: string;
  targetVertex: string;
  listRowY: Map<string, number>;
  listStartX: Map<string, number>;
  listCellW: number;
  listCellH: number;
  matrixOriginX: number;
  matrixOriginY: number;
  matrixCellSize: number;
  matrixCells: Map<string, { rect: SVGRectElement; text: SVGTextElement }>;
};

export const adjacencyListVsMatrixStageView: CanvasView = {
  canvas: { height: 400 },
  mount(_container, params) {
    const theme: Theme = params.theme ?? 'light';
    const colors = getColors(theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;

    const bg = el('rect', { x: 0, y: 0, width: W, height: 400, fill: colors.bg });
    svg.appendChild(bg);
    const captionText = el('text', {
      x: W / 2,
      y: 24,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    svg.appendChild(captionText);
    const content = el('g');
    svg.appendChild(content);

    let s: LayoutState | null = null;
    let cursor: SVGRectElement | null = null;
    let cursorCount: SVGTextElement | null = null;
    let lastData: AdjacencyStageData | null = null;

    function setCaption(key: string, fallback: string, vars?: Record<string, string | number>): void {
      captionText.textContent = t(key, fallback, vars);
    }

    function build(data: AdjacencyStageData): void {
      lastData = data;
      while (content.firstChild) content.removeChild(content.firstChild);
      cursor = null;
      cursorCount = null;

      const { vertices, edges } = data;
      const indexOf = new Map(vertices.map((v, i) => [v, i]));
      const queryVertex = vertices[0] ?? '';
      const targetVertex = vertices[vertices.length - 1] ?? '';

      const degree = new Map<string, number>();
      for (const v of vertices) degree.set(v, 0);
      for (const [a, b] of edges) {
        degree.set(a, (degree.get(a) ?? 0) + 1);
        degree.set(b, (degree.get(b) ?? 0) + 1);
      }
      const maxDegree = Math.max(1, ...vertices.map((v) => degree.get(v) ?? 0));

      const SIDE = 16;
      const GAP = 20;
      const panelW = Math.floor((W - SIDE * 2 - GAP) / 2);
      const listX = SIDE;
      const matrixX = SIDE + panelW + GAP;
      const CAPTION_H = 40;
      const TITLE_H = 20;
      const panelTop = CAPTION_H + 14;

      // 리스트 패널 — 든 만큼만 쓸 자리를, 실제로 쓰일 최대 폭까지 채운다.
      const ROW_H = 34;
      const CHIP_R = 12;
      const chipAreaW = CHIP_R * 2 + 10;
      const LIST_CELL_MAX = 46;
      const listCellW = Math.min(
        LIST_CELL_MAX,
        Math.max(24, Math.floor((panelW - chipAreaW - 8) / maxDegree)),
      );
      const listCellH = ROW_H - 12;

      // 행렬 패널 — 정점 수 × 정점 수 칸을 처음부터 다 잡는다.
      const HEADER = 20;
      const MATRIX_CELL_MAX = 46;
      const n = vertices.length;
      const matrixCellSize = Math.min(MATRIX_CELL_MAX, Math.max(20, Math.floor((panelW - HEADER - 8) / n)));

      const listPanelH = TITLE_H + vertices.length * ROW_H;
      const matrixPanelH = TITLE_H + HEADER + n * matrixCellSize;
      const panelsH = Math.max(listPanelH, matrixPanelH);
      const resultY = panelTop + panelsH + 22;
      const totalH = resultY + 40;

      svg.setAttribute('viewBox', `0 0 ${W} ${totalH}`);
      bg.setAttribute('height', String(totalH));

      // ── 리스트 패널 그리기
      content.appendChild(
        el('text', {
          x: listX,
          y: panelTop - 4,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        }),
      ).textContent = t('label.list', 'Adjacency list');

      const listRowY = new Map<string, number>();
      const listStartX = new Map<string, number>();
      vertices.forEach((v, i) => {
        const rowY = panelTop + TITLE_H + i * ROW_H + ROW_H / 2;
        listRowY.set(v, rowY);
        const chipCx = listX + CHIP_R + 2;
        const chip = el('circle', {
          cx: chipCx,
          cy: rowY,
          r: CHIP_R,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        });
        content.appendChild(chip);
        const chipLabel = el('text', {
          x: chipCx,
          y: rowY + 4,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        chipLabel.textContent = v;
        content.appendChild(chipLabel);
        listStartX.set(v, listX + chipAreaW + 4);
      });

      // ── 행렬 패널 그리기 — 스물다섯 칸 전부 지금 그린다.
      content.appendChild(
        el('text', {
          x: matrixX,
          y: panelTop - 4,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        }),
      ).textContent = t('label.matrix', 'Adjacency matrix');

      const gridX = matrixX + HEADER;
      const gridY = panelTop + TITLE_H + HEADER;
      vertices.forEach((v, j) => {
        const headerLabel = el('text', {
          x: gridX + j * matrixCellSize + matrixCellSize / 2,
          y: panelTop + TITLE_H + HEADER / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        headerLabel.textContent = v;
        content.appendChild(headerLabel);
      });
      const matrixCells = new Map<string, { rect: SVGRectElement; text: SVGTextElement }>();
      vertices.forEach((rowV, i) => {
        const rowLabel = el('text', {
          x: matrixX + HEADER / 2,
          y: gridY + i * matrixCellSize + matrixCellSize / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        rowLabel.textContent = rowV;
        content.appendChild(rowLabel);

        vertices.forEach((colV, j) => {
          const cx = gridX + j * matrixCellSize;
          const cy = gridY + i * matrixCellSize;
          const rect = el('rect', {
            x: cx,
            y: cy,
            width: matrixCellSize - 2,
            height: matrixCellSize - 2,
            rx: CELL_RADIUS,
            fill: colors.itemDefault,
            stroke: colors.border,
            'stroke-width': 1,
          });
          content.appendChild(rect);
          const text = el('text', {
            x: cx + (matrixCellSize - 2) / 2,
            y: cy + (matrixCellSize - 2) / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
          });
          text.textContent = '0';
          content.appendChild(text);
          matrixCells.set(`${rowV}-${colV}`, { rect, text });
        });
      });

      s = {
        vertices,
        indexOf,
        queryVertex,
        targetVertex,
        listRowY,
        listStartX,
        listCellW,
        listCellH,
        matrixOriginX: gridX,
        matrixOriginY: gridY,
        matrixCellSize,
        matrixCells,
      };

      const totalCells = vertices.length * vertices.length;
      setCaption(
        'caption.init',
        'The list starts with no cells; the matrix already holds {cells} reserved cells.',
        { cells: totalCells },
      );
    }

    function ensureCursor(): { cursor: SVGRectElement; count: SVGTextElement } {
      if (!cursor || !cursorCount) {
        cursor = el('rect', {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          fill: 'none',
          stroke: colors.itemComparing,
          'stroke-width': 2,
          rx: CELL_RADIUS,
        });
        content.appendChild(cursor);
        cursorCount = el('text', {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        content.appendChild(cursorCount);
      }
      return { cursor, count: cursorCount };
    }

    return {
      init(data: AdjacencyStageData) {
        build(data);
      },

      async addEdge(a: string, b: string, aIndex: number, bIndex: number): Promise<void> {
        if (!s) return;
        const jobs: Promise<void>[] = [];

        for (const [owner, neighbor, idx] of [
          [a, b, aIndex],
          [b, a, bIndex],
        ] as const) {
          const rowY = s.listRowY.get(owner);
          const startX = s.listStartX.get(owner);
          if (rowY === undefined || startX === undefined) continue;
          const cellX = startX + idx * s.listCellW;
          const cellY = rowY - s.listCellH / 2;
          const rect = el('rect', {
            x: cellX,
            y: cellY,
            width: 0,
            height: s.listCellH,
            rx: CELL_RADIUS,
            fill: colors.primary,
          });
          content.appendChild(rect);
          const label = el('text', {
            x: cellX,
            y: rowY + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textInverse,
            opacity: 0,
          });
          label.textContent = neighbor;
          content.appendChild(label);
          jobs.push(
            animate(rect, { width: s.listCellW - 3 }, 260).then(() => {
              label.setAttribute('x', String(cellX + (s?.listCellW ?? 0) / 2));
              label.setAttribute('opacity', '1');
            }),
          );
        }

        const aCell = s.matrixCells.get(`${a}-${b}`);
        const bCell = s.matrixCells.get(`${b}-${a}`);
        for (const cell of [aCell, bCell]) {
          if (!cell) continue;
          cell.text.textContent = '1';
          cell.text.setAttribute('fill', colors.textInverse);
          jobs.push(animate(cell.rect, { fill: colors.primary }, 260));
        }

        await Promise.all(jobs);
      },

      setQuestion(question: 1 | 2) {
        if (!s) return;
        if (question === 1) {
          setCaption('caption.q1', 'Are {a} and {b} neighbors?', {
            a: s.queryVertex,
            b: s.targetVertex,
          });
        } else {
          setCaption('caption.q2', 'List all of {a}’s neighbors.', { a: s.queryVertex });
        }
      },

      async scanCell(args: AdjacencyScanArgs): Promise<void> {
        if (!s) return;
        const { cursor: cursorNode, count } = ensureCursor();
        cursorNode.setAttribute('stroke', args.matched ? colors.accent : colors.itemComparing);

        let x: number;
        let y: number;
        let w: number;
        let h: number;
        if (args.side === 'list') {
          const rowY = s.listRowY.get(s.queryVertex) ?? 0;
          const startX = s.listStartX.get(s.queryVertex) ?? 0;
          x = startX + args.cellIndex * s.listCellW;
          y = rowY - s.listCellH / 2;
          w = s.listCellW - 3;
          h = s.listCellH;
        } else {
          x = s.matrixOriginX + args.cellIndex * s.matrixCellSize;
          y = s.matrixOriginY + (s.indexOf.get(s.queryVertex) ?? 0) * s.matrixCellSize;
          w = s.matrixCellSize - 2;
          h = s.matrixCellSize - 2;
        }

        count.textContent = String(args.count);
        count.setAttribute('x', String(x + w / 2));
        count.setAttribute('y', String(y - 6));

        await animate(cursorNode, { x, y, width: w, height: h }, 240);
      },

      showResult(args: AdjacencyResultArgs) {
        if (!s) return;
        setCaption('caption.result', 'List touched {list} cell(s) · Matrix touched {matrix} cell(s).', {
          list: args.listCost,
          matrix: args.matrixCost,
        });

        const SIDE = 16;
        const GAP = 20;
        const panelW = Math.floor((W - SIDE * 2 - GAP) / 2);
        const listX = SIDE;
        const matrixX = SIDE + panelW + GAP;
        const n = s.vertices.length;
        const HEADER = 20;
        const MATRIX_CELL_MAX = 46;
        const matrixPanelBottom =
          40 + 14 + 20 + HEADER + n * Math.min(MATRIX_CELL_MAX, s.matrixCellSize);
        const badgeY = matrixPanelBottom + 22;

        const cheaperIsList = args.listCost < args.matrixCost;
        const badge = (x: number, label: string, cost: number, cheaper: boolean): void => {
          const w = panelW;
          const rect = el('rect', {
            x,
            y: badgeY,
            width: w,
            height: 26,
            rx: CELL_RADIUS,
            fill: cheaper ? colors.accent : colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          });
          content.appendChild(rect);
          const text = el('text', {
            x: x + w / 2,
            y: badgeY + 17,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: cheaper ? colors.stateInk : colors.textMuted,
          });
          text.textContent = t(`badge.${label}`, `${label} {n}`, { n: cost });
          content.appendChild(text);
        };
        badge(listX, 'list', args.listCost, cheaperIsList);
        badge(matrixX, 'matrix', args.matrixCost, !cheaperIsList);
      },

      resetView() {
        if (lastData) build(lastData);
      },

      destroy(): void {
        // animate() 가 거는 setTimeout 둘은 한 번만 울리고 끝나며, 깨어나도 이미
      // 떨어져 나간 자기 노드만 건드린다. 스스로 다음 회차를 예약하는 루프는
      // 없다 (S-view).
      },
    } satisfies ViewInstance & {
      init(data: AdjacencyStageData): void;
      addEdge(a: string, b: string, aIndex: number, bIndex: number): Promise<void>;
      setQuestion(question: 1 | 2): void;
      scanCell(args: AdjacencyScanArgs): Promise<void>;
      showResult(args: AdjacencyResultArgs): void;
      resetView(): void;
    };
  },
};
