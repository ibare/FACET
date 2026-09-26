/**
 * column-oriented 의 stage.
 *
 * 위에 표가 있고, 아래에 두 담는 법의 쪽이 나란히 선다 — 왼쪽 줄 방향, 오른쪽 열 방향.
 * 쪽 하나는 칸이 세로로 쌓인 띠다. 칸의 바탕색은 그 칸의 열을 가리킨다 — 줄 방향 쪽은
 * 열이 섞여 줄무늬가 되고, 열 방향 쪽은 한 빛깔로 모인다.
 *
 * 동사:
 *   - 담기 — 표의 칸이 쪽의 자리로 날아간다. 줄 방향은 **줄째** 차례로, 열 방향은 **열째**
 *     차례로 떠난다 (줄에서 떼어져 열끼리 모인다).
 *   - 읽기 — 읽은 쪽이 통째로 위로 들려 올라온다. 제자리엔 빈 자리 테두리가 남는다.
 *     올라온 쪽에서 묻는 열의 칸만 또렷하고, 딸려 온 칸은 흐리다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { ColumnOrientedScene, ScenePage, SceneRead } from './scene.js';

const H = 480;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 16;
const GROUP_GAP = 36;
const PAGE_GAP = 12;
const MAX_CELL_W = 72;
const MAX_CELL_H = 17;
/** 쪽이 들려 올라가는 높이 */
const LIFT = 56;

const CAPTION_Y = 20;
const TABLE_TOP = 34;
const SQL_GAP = 22;
const SUM_GAP = 20;
const LIFT_GAP = 12;
/** 쪽 아래로 쪽 이름 · 담는 법 이름 · 셈 두 줄 */
const BELOW = [14, 20, 18, 16] as const;
const BOTTOM_PAD = 13;

const MOVE_MS = 500;
const ROW_STAGGER_MS = 70;
const COL_STAGGER_MS = 110;
const LIFT_MS = 600;
const FRAME_MS = 16;

type Side = 'rows' | 'cols';

interface Layout {
  cellW: number;
  cellH: number;
  tableX: number;
  sqlY: number;
  sumY: number;
  shelfTop: number;
  rowX: number;
  colX: number;
  rowGroupW: number;
  colGroupW: number;
}

/** 쪽 수는 쪽 목록이 오기 전에도 자리를 잡아야 해서 바탕(줄 · 열 · 쪽 크기)에서 센다. */
function pageCounts(s: ColumnOrientedScene): { rows: number; cols: number } {
  const R = s.rows.length;
  const C = s.columns.length;
  return { rows: Math.ceil((R * C) / s.pageCells), cols: C * Math.ceil(R / s.pageCells) };
}

function round(x: number): number {
  const v = Math.round(x * 10) / 10;
  return v === 0 ? 0 : v;
}

function layoutOf(s: ColumnOrientedScene): Layout {
  const W = PIECE_CANVAS_W;
  const n = pageCounts(s);
  const gaps = (n.rows - 1 + n.cols - 1) * PAGE_GAP;
  const byPages = (W - 2 * MARGIN - GROUP_GAP - gaps) / (n.rows + n.cols);
  const byTable = (W - 2 * MARGIN) / Math.max(1, s.columns.length);
  const cellW = Math.floor(Math.min(MAX_CELL_W, byPages, byTable));

  const fixed = TABLE_TOP + SQL_GAP + SUM_GAP + LIFT_GAP + LIFT + BELOW.reduce((a, b) => a + b, 0) + BOTTOM_PAD;
  const cellH = Math.min(MAX_CELL_H, (H - fixed) / (s.rows.length + 1 + s.pageCells));

  const tableX = (W - cellW * s.columns.length) / 2;
  const tableBottom = TABLE_TOP + (s.rows.length + 1) * cellH;
  const sqlY = tableBottom + SQL_GAP;
  const sumY = sqlY + SUM_GAP;
  const shelfTop = sumY + LIFT_GAP + LIFT;

  const rowGroupW = n.rows * cellW + (n.rows - 1) * PAGE_GAP;
  const colGroupW = n.cols * cellW + (n.cols - 1) * PAGE_GAP;
  const rowX = (W - rowGroupW - GROUP_GAP - colGroupW) / 2;
  const colX = rowX + rowGroupW + GROUP_GAP;
  return { cellW, cellH, tableX, sqlY, sumY, shelfTop, rowX, colX, rowGroupW, colGroupW };
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el(parent, 'text', { x, y, 'dominant-baseline': 'middle', ...attrs });
  node.textContent = text;
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 칸 하나가 흘러갈 길: 표의 자리에서 출발한다. */
interface CellFlight {
  node: SVGGElement;
  dx: number;
  dy: number;
  delay: number;
}

interface Drawn {
  flights: { rows: CellFlight[]; cols: CellFlight[] };
  pages: { rows: SVGGElement[]; cols: SVGGElement[] };
}

export const columnOrientedStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const tone = params.theme === 'dark' ? 'deep' : 'pastel';

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function colFill(s: ColumnOrientedScene, c: number): string {
      const fill = categorical(s.columns.length, tone)[c];
      if (fill === undefined) throw new Error(`열 ${c + 1} 이 표에 없다`);
      return fill;
    }

    function valueAt(s: ColumnOrientedScene, r: number, c: number): string {
      const row = s.rows[r];
      const v = row?.[c];
      if (v === undefined) throw new Error(`줄 ${r + 1} 에 열 ${c + 1} 이 없다`);
      return String(v);
    }

    function caption(s: ColumnOrientedScene): string {
      const col = (read: SceneRead | null): string => {
        const name = read === null ? undefined : s.columns[read.column];
        if (name === undefined) throw new Error('읽은 열이 표에 없다');
        return name;
      };
      switch (s.step.kind) {
        case 'table':
          return t('caption.table', 'Table {table}. Rows: {rows} · Columns: {cols}', {
            table: s.table,
            rows: s.rows.length,
            cols: s.columns.length,
          });
        case 'store-rows':
          if (s.rowPages === null) throw new Error('store-rows 걸음에 줄 방향 쪽이 없다');
          return t('caption.storeRows', 'Row-oriented: each row is written whole, one after another. Pages: {pages}', {
            pages: s.rowPages.length,
          });
        case 'store-columns':
          if (s.colPages === null) throw new Error('store-columns 걸음에 열 방향 쪽이 없다');
          return t('caption.storeColumns', 'Column-oriented: values leave their rows and gather by column. Pages: {pages}', {
            pages: s.colPages.length,
          });
        case 'read-rows':
          return t('caption.readRows', 'Row-oriented: every page holding {col} comes up whole.', { col: col(s.rowRead) });
        case 'read-columns':
          return t('caption.readColumns', 'Column-oriented: only the pages of {col} come up.', { col: col(s.colRead) });
        case 'done': {
          if (s.rowRead === null || s.colRead === null || s.sum === null) throw new Error('두 읽기가 끝나기 전에 끝이 왔다');
          return t('caption.done', 'Sum: {sum} · Cells brought up — row-oriented: {a} · column-oriented: {b}', {
            sum: s.sum,
            a: s.rowRead.brought,
            b: s.colRead.brought,
          });
        }
      }
    }

    function drawTable(root: Element, s: ColumnOrientedScene, L: Layout): void {
      const g = el(root, 'g', {});
      label(g, L.tableX - 8, TABLE_TOP + L.cellH / 2, s.table, {
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: colors.text,
      });
      s.columns.forEach((name, c) => {
        const x = L.tableX + c * L.cellW;
        el(g, 'rect', { x, y: TABLE_TOP, width: L.cellW, height: L.cellH, fill: colFill(s, c), stroke: colors.border });
        label(g, x + L.cellW / 2, TABLE_TOP + L.cellH / 2, name, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: colors.text,
        });
      });
      s.rows.forEach((row, r) => {
        const y = TABLE_TOP + (r + 1) * L.cellH;
        row.forEach((_, c) => {
          const x = L.tableX + c * L.cellW;
          el(g, 'rect', { x, y, width: L.cellW, height: L.cellH, fill: colFill(s, c), stroke: colors.border });
          label(g, x + L.cellW / 2, y + L.cellH / 2, valueAt(s, r, c), {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
          });
        });
      });
    }

    /** 쪽 하나. 읽혔으면 들려 있고 제자리엔 빈 테두리가 남는다. 돌려주는 것은 들리는 묶음과 칸들. */
    function drawPage(
      root: Element,
      s: ColumnOrientedScene,
      L: Layout,
      page: ScenePage,
      x: number,
      read: SceneRead | null,
      index: number,
      flights: CellFlight[],
      stagger: (r: number, c: number) => number,
    ): SVGGElement {
      const lifted = read !== null && read.pages.includes(index);
      const height = s.pageCells * L.cellH;
      if (lifted) {
        el(root, 'rect', {
          x,
          y: L.shelfTop,
          width: L.cellW,
          height,
          fill: 'none',
          stroke: colors.border,
          'stroke-dasharray': '4 3',
        });
      }
      const top = L.shelfTop - (lifted ? LIFT : 0);
      const g = el(root, 'g', {});
      el(g, 'rect', {
        x: x - 2,
        y: top - 2,
        width: L.cellW + 4,
        height: height + 4,
        fill: colors.bg,
        stroke: lifted ? colors.itemActive : colors.textMuted,
        'stroke-width': lifted ? 2 : 1,
      });
      for (let i = 0; i < s.pageCells; i += 1) {
        const y = top + i * L.cellH;
        const cell = page.cells[i];
        if (cell === undefined) {
          el(g, 'rect', {
            x: x + 3,
            y: y + 2,
            width: L.cellW - 6,
            height: L.cellH - 4,
            fill: 'none',
            stroke: colors.border,
            'stroke-dasharray': '2 2',
          });
          continue;
        }
        const [r, c] = cell;
        const used = read !== null && lifted && c === read.column;
        const carried = lifted && !used;
        const cg = el(g, 'g', carried ? { opacity: 0.4 } : {});
        el(cg, 'rect', {
          x,
          y,
          width: L.cellW,
          height: L.cellH,
          fill: colFill(s, c),
          stroke: used ? colors.accent : colors.border,
          'stroke-width': used ? 2 : 1,
        });
        label(cg, x + L.cellW / 2, y + L.cellH / 2, valueAt(s, r, c), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': used ? 700 : 400,
          fill: colors.text,
        });
        flights.push({
          node: cg,
          dx: L.tableX + c * L.cellW - x,
          dy: TABLE_TOP + (r + 1) * L.cellH - y,
          delay: stagger(r, c),
        });
      }
      return g;
    }

    function drawSide(
      root: Element,
      s: ColumnOrientedScene,
      L: Layout,
      side: Side,
      drawn: Drawn,
    ): void {
      const pages = side === 'rows' ? s.rowPages : s.colPages;
      const read = side === 'rows' ? s.rowRead : s.colRead;
      const x0 = side === 'rows' ? L.rowX : L.colX;
      const groupW = side === 'rows' ? L.rowGroupW : L.colGroupW;
      const mid = x0 + groupW / 2;
      const bottom = L.shelfTop + s.pageCells * L.cellH;
      const g = el(root, 'g', {});

      el(g, 'line', { x1: x0 - 6, y1: bottom + 4, x2: x0 + groupW + 6, y2: bottom + 4, stroke: colors.textMuted });
      const titleY = bottom + BELOW[0] + BELOW[1];
      label(
        g,
        mid,
        titleY,
        side === 'rows' ? t('label.rowStore', 'Row-oriented') : t('label.colStore', 'Column-oriented'),
        { 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700, fill: colors.text },
      );
      if (pages === null) return;
      const expected = side === 'rows' ? pageCounts(s).rows : pageCounts(s).cols;
      if (pages.length !== expected) throw new Error(`쪽 수 ${pages.length} 가 자리 ${expected} 와 다르다`);

      const stagger =
        side === 'rows'
          ? (r: number): number => r * ROW_STAGGER_MS
          : (_r: number, c: number): number => c * COL_STAGGER_MS;
      pages.forEach((page, p) => {
        const x = x0 + p * (L.cellW + PAGE_GAP);
        drawn.pages[side].push(drawPage(g, s, L, page, x, read, p, drawn.flights[side], stagger));
        const name = page.col === null ? t('label.page', 'P{n}', { n: p + 1 }) : s.columns[page.col];
        if (name === undefined) throw new Error(`쪽 ${p + 1} 의 열이 표에 없다`);
        label(g, x + L.cellW / 2, bottom + BELOW[0], name, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      });

      const countStyle = {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      };
      const line1Y = titleY + BELOW[2];
      if (read === null) {
        label(g, mid, line1Y, t('label.pages', 'Pages: {n}', { n: pages.length }), countStyle);
      } else {
        label(g, mid, line1Y, t('label.read', 'Pages read: {read} / {pages}', { read: read.pages.length, pages: pages.length }), {
          ...countStyle,
          fill: colors.text,
        });
        label(
          g,
          mid,
          line1Y + BELOW[3],
          t('label.brought', 'Cells brought: {brought} · Used: {used}', { brought: read.brought, used: read.used }),
          { ...countStyle, fill: colors.text },
        );
      }
      if (s.sum !== null && read !== null) {
        label(g, mid, L.sumY, t('label.sum', 'Sum: {sum}', { sum: read.sum }), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: colors.success,
        });
      }
    }

    function drawStatic(s: ColumnOrientedScene): Drawn {
      svg.textContent = '';
      const drawn: Drawn = { flights: { rows: [], cols: [] }, pages: { rows: [], cols: [] } };
      const L = layoutOf(s);
      const root = el(svg, 'g', {});
      label(root, PIECE_CANVAS_W / 2, CAPTION_Y, caption(s), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      drawTable(root, s, L);
      if (s.rowRead !== null) {
        label(root, PIECE_CANVAS_W / 2, L.sqlY, s.sql, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: colors.primary,
        });
      }
      drawSide(root, s, L, 'rows', drawn);
      drawSide(root, s, L, 'cols', drawn);
      return drawn;
    }

    /** 한 시계로 흘린다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(mine: number, total: number, frame: (ms: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const ms = Math.min(total, performance.now() - start);
          frame(ms);
          if (ms >= total) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    /** 칸이 표의 자리에서 쪽의 자리로 — 아직 못 온 만큼만 비켜 그린다. */
    function fly(mine: number, flights: CellFlight[]): Promise<void> {
      const total = Math.max(0, ...flights.map((f) => f.delay)) + MOVE_MS;
      return tween(mine, total, (ms) => {
        for (const f of flights) {
          const p = ease(Math.min(1, Math.max(0, (ms - f.delay) / MOVE_MS)));
          const left = 1 - p;
          f.node.setAttribute('transform', `translate(${round(f.dx * left)} ${round(f.dy * left)})`);
        }
      });
    }

    /** 읽힌 쪽이 제자리에서 들려 올라온다. */
    function lift(mine: number, pages: SVGGElement[], read: SceneRead): Promise<void> {
      const moving = read.pages.map((p) => {
        const node = pages[p];
        if (node === undefined) throw new Error(`읽은 쪽 ${p + 1} 이 그려지지 않았다`);
        return node;
      });
      return tween(mine, LIFT_MS, (ms) => {
        const left = 1 - ease(ms / LIFT_MS);
        for (const node of moving) node.setAttribute('transform', `translate(0 ${round(LIFT * left)})`);
      });
    }

    async function render(
      next: ColumnOrientedScene,
      prev: ColumnOrientedScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const drawn = drawStatic(next);
      if (!opts.animate || prev === null) return;
      const kind = next.step.kind;
      if (kind === 'store-rows' && prev.rowPages === null) {
        await fly(mine, drawn.flights.rows);
      } else if (kind === 'store-columns' && prev.colPages === null) {
        await fly(mine, drawn.flights.cols);
      } else if (kind === 'read-rows' && prev.rowRead === null && next.rowRead !== null) {
        await lift(mine, drawn.pages.rows, next.rowRead);
      } else if (kind === 'read-columns' && prev.colRead === null && next.colRead !== null) {
        await lift(mine, drawn.pages.cols, next.colRead);
      } else {
        return;
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
