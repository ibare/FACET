/**
 * match-on-key 무대.
 *
 * 왼쪽 표 · 결과 · 오른쪽 표를 한 줄로 놓는다. 걸음마다 왼쪽 줄의 열쇠가 칩이 되어
 * 오른쪽 표로 건너가 같은 열쇠의 줄을 찾는다. 찾으면 그 줄의 칸이 **복사본**으로 떨어져
 * 가운데로 오고, 왼쪽 줄의 칸도 가운데로 와 둘이 결과 한 줄이 된다. 오른쪽 줄은 제자리에
 * 남아 다음 줄이 또 찾아올 수 있다.
 *
 * 그림은 장면만 본다. 표와 SQL 은 장면의 바탕에서, 결과 줄은 자취에서 세운다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, Translate, ViewInstance } from '@ffacet/core/runtime';
import type { Cell, TableData } from './algorithm.js';
import type { MatchOnKeyScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 — 칩이 찾아가는 데 앞 몫, 복사본이 붙는 데 뒤 몫 */
const MOTION_MS = 1000;
const SEEK_SHARE = 0.45;
const FRAME_MS = 16;

const MARGIN = 14;
const GAP_MIN = 40;
const ROW_H_MAX = 32;
const CELL_PAD = 14;
const CHIP_PAD = 6;

type Box = { x: number; y: number; w: number; h: number };

type Layout = {
  sqlX: number;
  sqlY: number[];
  titleY: number;
  headY: number;
  rowH: number;
  /** 표마다 열의 x 와 폭 */
  leftCols: { x: number; w: number }[];
  resultCols: { x: number; w: number }[];
  rightCols: { x: number; w: number }[];
  captionY: [number, number];
  chipW: number;
  chipH: number;
};

function round(n: number): number {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function cellText(c: Cell): string {
  return String(c);
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
  parent.appendChild(node);
  return node;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function clamp01(p: number): number {
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** 열마다 담을 글자 수 — 머리 이름과 칸 값 중 긴 것 */
function widestChars(table: TableData): number[] {
  return table.columns.map((name, j) =>
    Math.max(name.length, ...table.rows.map((row) => cellText(row[j]!).length)),
  );
}

function layOut(scene: MatchOnKeyScene): Layout {
  const { base } = scene;
  const monoPx = parseFloat(fontSizes.md);
  const charW = monoPx * 0.62;
  const lineH = monoPx * 1.4;

  const sqlY = base.sql.map((_, i) => MARGIN + monoPx + i * lineH);
  const titleY = (sqlY[sqlY.length - 1] ?? MARGIN) + lineH + 14;
  const headY = titleY + 8;
  const captionY: [number, number] = [H - 30, H - 10];
  const band = captionY[0] - parseFloat(fontSizes.md) - 10 - headY;
  const rowsNeeded = 1 + Math.max(base.left.rows.length, base.right.rows.length);
  const rowH = Math.min(ROW_H_MAX, band / rowsNeeded);

  // 결과 열의 폭 — 고른 열의 머리와 값에서
  const resultChars: number[] = [
    widestChars(base.left)[base.cols.leftShow]!,
    widestChars(base.right)[base.cols.rightShow]!,
  ].map((n, i) => Math.max(n, base.heads[i]!.length));

  const natural = (chars: number[]): number[] => chars.map((n) => n * charW + CELL_PAD * 2);
  const leftW = natural(widestChars(base.left));
  const resultW = natural(resultChars);
  const rightW = natural(widestChars(base.right));
  const sum = [...leftW, ...resultW, ...rightW].reduce((a, b) => a + b, 0);
  // 폭을 채운다 — 사이 둘을 GAP_MIN 으로 두고 남는 폭을 칸에 나눈다.
  const scale = (PIECE_CANVAS_W - MARGIN * 2 - GAP_MIN * 2) / sum;

  const place = (ws: number[], x0: number): { x: number; w: number }[] => {
    let x = x0;
    return ws.map((w) => {
      const c = { x, w: w * scale };
      x += w * scale;
      return c;
    });
  };
  const leftCols = place(leftW, MARGIN);
  const leftEnd = MARGIN + leftW.reduce((a, b) => a + b, 0) * scale;
  const resultCols = place(resultW, leftEnd + GAP_MIN);
  const resultEnd = leftEnd + GAP_MIN + resultW.reduce((a, b) => a + b, 0) * scale;
  const rightCols = place(rightW, resultEnd + GAP_MIN);

  return {
    sqlX: MARGIN,
    sqlY,
    titleY,
    headY,
    rowH,
    leftCols,
    resultCols,
    rightCols,
    captionY,
    chipW: Math.min(GAP_MIN - 8, Math.max(...base.left.rows.map((r) => cellText(r[base.cols.leftKey]!).length)) * charW + CHIP_PAD * 2),
    chipH: rowH - 10,
  };
}

/** 표의 몇 번 줄(0 = 머리 아래 첫 줄) 칸 상자 */
function cellBox(L: Layout, cols: { x: number; w: number }[], col: number, row: number): Box {
  const c = cols[col]!;
  return { x: c.x, y: L.headY + L.rowH * (row + 1), w: c.w, h: L.rowH };
}

function rowBox(L: Layout, cols: { x: number; w: number }[], row: number): Box {
  const first = cols[0]!;
  const last = cols[cols.length - 1]!;
  return { x: first.x, y: L.headY + L.rowH * (row + 1), w: last.x + last.w - first.x, h: L.rowH };
}

/** 칩이 쉬는 자리 — 오른쪽 표 바로 왼쪽 틈, 그 줄 높이 */
function chipRest(L: Layout, row: number): { x: number; y: number } {
  const first = L.rightCols[0]!;
  return { x: first.x - L.chipW - 4, y: L.headY + L.rowH * (row + 1) + (L.rowH - L.chipH) / 2 };
}

type Colors = { pal: Palette; tints: readonly string[] };

export const matchOnKeyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal = getColors(params.theme);
    const monoPx = parseFloat(fontSizes.md);
    const smallPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function text(parent: Element, x: number, y: number, s: string, opts: {
      size?: number; fill?: string; anchor?: string; weight?: string; family?: string;
    } = {}): SVGTextElement {
      const node = el('text', {
        x, y,
        'font-family': opts.family ?? fonts.mono,
        'font-size': opts.size ?? monoPx,
        fill: opts.fill ?? pal.text,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'central',
      }, parent);
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      return node;
    }

    /** 칸 하나 — 사각과 가운데 글자 */
    function cell(parent: Element, b: Box, s: string, fill: string, fillOpacity: number): SVGGElement {
      const g = el('g', {}, parent);
      el('rect', {
        x: b.x, y: b.y, width: b.w, height: b.h,
        fill, 'fill-opacity': fillOpacity, stroke: pal.border, 'stroke-width': 1,
      }, g);
      text(g, b.x + b.w / 2, b.y + b.h / 2, s, { anchor: 'middle' });
      return g;
    }

    function outline(parent: Element, b: Box, color: string): void {
      el('rect', {
        x: b.x, y: b.y, width: b.w, height: b.h,
        fill: 'none', stroke: color, 'stroke-width': 2.5, rx: 2,
      }, parent);
    }

    function chip(parent: Element, x: number, y: number, L: Layout, s: string): SVGGElement {
      const g = el('g', { transform: `translate(${round(x)} ${round(y)})` }, parent);
      el('rect', {
        x: 0, y: 0, width: L.chipW, height: L.chipH, rx: L.chipH / 2,
        fill: pal.itemActive, stroke: 'none',
      }, g);
      text(g, L.chipW / 2, L.chipH / 2, s, { anchor: 'middle', fill: pal.textInverse, size: smallPx, weight: '600' });
      return g;
    }

    function drawTable(
      parent: Element, L: Layout, table: TableData, cols: { x: number; w: number }[],
      title: string, tintOf: (row: number) => { fill: string; op: number },
    ): void {
      text(parent, cols[0]!.x, L.titleY, title, { size: smallPx, weight: '700' });
      table.columns.forEach((name, j) => {
        const c = cols[j]!;
        text(parent, c.x + c.w / 2, L.headY + L.rowH / 2, name, { anchor: 'middle', size: smallPx, fill: pal.textMuted });
      });
      table.rows.forEach((row, i) => {
        const tint = tintOf(i);
        row.forEach((v, j) => cell(parent, cellBox(L, cols, j, i), cellText(v), tint.fill, tint.op));
      });
    }

    /**
     * 장면의 화면 전체. `pending` 이면 이번 걸음이 운동으로 데려올 것(칩 · 찾은 줄 테 ·
     * 새 결과 줄)을 비워 둔다 — 운동이 그 자리를 채운다.
     */
    function drawStatic(scene: MatchOnKeyScene, pending: boolean): Layout {
      svg.textContent = '';
      const { base, step } = scene;
      const L = layOut(scene);
      const colors: Colors = { pal, tints: categorical(base.right.rows.length, 'vivid') };
      const root = el('g', {}, svg);

      // SQL — 보이기용 글자
      base.sql.forEach((line, i) => text(root, L.sqlX, L.sqlY[i]!, line, { fill: pal.text }));

      const plain = (): { fill: string; op: number } => ({ fill: pal.bgSubtle, op: 1 });
      const tinted = (i: number): { fill: string; op: number } => ({ fill: colors.tints[i]!, op: 0.28 });
      drawTable(root, L, base.left, L.leftCols, base.left.name, plain);
      drawTable(root, L, base.right, L.rightCols, base.right.name, tinted);

      // 결과 표 — 머리는 SELECT 가 고른 열, 줄은 자취에서
      text(root, L.resultCols[0]!.x, L.titleY, t('label.result', 'Result'), { size: smallPx, weight: '700' });
      base.heads.forEach((name, j) => {
        const c = L.resultCols[j]!;
        text(root, c.x + c.w / 2, L.headY + L.rowH / 2, name, { anchor: 'middle', size: smallPx, fill: pal.textMuted });
      });
      const shown = pending ? scene.results.length - 1 : scene.results.length;
      for (let i = 0; i < shown; i += 1) {
        const r = scene.results[i]!;
        cell(root, cellBox(L, L.resultCols, 0, i), r.values[0], pal.bgSubtle, 1);
        cell(root, cellBox(L, L.resultCols, 1, i), r.values[1], colors.tints[r.right]!, 0.28);
      }

      // 이번 걸음의 머무는 강조
      if (step) {
        outline(root, rowBox(L, L.leftCols, step.left), pal.itemActive);
        if (!pending) {
          outline(root, rowBox(L, L.rightCols, step.right), pal.itemActive);
          outline(root, rowBox(L, L.resultCols, scene.results.length - 1), pal.accent);
          const rest = chipRest(L, step.right);
          chip(root, rest.x, rest.y, L, step.key);
        }
      }

      drawCaption(root, scene, L);
      return L;
    }

    function drawCaption(parent: Element, scene: MatchOnKeyScene, L: Layout): void {
      const { base, step } = scene;
      const cap = (y: number, s: string): void => {
        text(parent, PIECE_CANVAS_W / 2, y, s, { anchor: 'middle', family: fonts.body, fill: pal.text });
      };
      if (!step) {
        cap(L.captionY[1], t('caption.start', 'Rows in {left}: {e} · rows in {right}: {d}', {
          left: base.left.name, e: base.left.rows.length,
          right: base.right.name, d: base.right.rows.length,
        }));
        return;
      }
      const leftRow = base.left.rows[step.left]!;
      const rightRow = base.right.rows[step.right]!;
      cap(L.captionY[0], t('caption.seek', '{name} looks for {right}.{col} = {key}.', {
        name: cellText(leftRow[base.cols.leftShow]!),
        right: base.right.name,
        col: base.right.columns[base.cols.rightKey]!,
        key: step.key,
      }));
      cap(L.captionY[1], t('caption.join', 'Result rows: {n} · copies of {dname}: {c}', {
        n: step.total,
        dname: cellText(rightRow[base.cols.rightShow]!),
        c: step.copies,
      }));
    }

    /** 한 시계 — 0 에서 1 로 흐르며 frame 을 부른다. 거두면 곧바로 풀린다. */
    function run(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = clamp01((Date.now() - start) / MOTION_MS);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => { timers.delete(id); tick(); }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: MatchOnKeyScene, prev: MatchOnKeyScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      const forward = step !== null && prev !== null && next.results.length === prev.results.length + 1;
      if (!opts.animate || !forward || step === null) {
        drawStatic(next, false);
        return;
      }

      const L = drawStatic(next, true);
      const { base } = next;
      const tints = categorical(base.right.rows.length, 'vivid');
      const layer = el('g', {}, svg);

      // 칩: 왼쪽 열쇠 칸 → 오른쪽 표 첫 줄 곁 → 찾은 줄까지 내려간다 (안쪽 루프가 차례로 견준다)
      const keyCell = cellBox(L, L.leftCols, base.cols.leftKey, step.left);
      const p0 = { x: keyCell.x + (keyCell.w - L.chipW) / 2, y: keyCell.y + (L.rowH - L.chipH) / 2 };
      const p1 = chipRest(L, 0);
      const p2 = chipRest(L, step.right);
      const legA = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const legB = Math.abs(p2.y - p1.y);
      const chipNode = chip(layer, p0.x, p0.y, L, step.key);

      // 복사본 둘: 찾은 줄의 칸과 왼쪽 줄의 칸이 결과 줄 자리로
      const row = next.results.length - 1;
      const fromRight = cellBox(L, L.rightCols, base.cols.rightShow, step.right);
      const fromLeft = cellBox(L, L.leftCols, base.cols.leftShow, step.left);
      const toRight = cellBox(L, L.resultCols, 1, row);
      const toLeft = cellBox(L, L.resultCols, 0, row);
      const result = next.results[row]!;
      let copyR: SVGGElement | null = null;
      let copyL: SVGGElement | null = null;
      let found: SVGGElement | null = null;

      const place = (g: SVGGElement, from: Box, to: Box, q: number): void => {
        const e = easeInOut(q);
        // 칸은 이미 끝 자리 기준으로 그려져 있다 — 아직 못 온 만큼 되돌려 둔다.
        g.setAttribute('transform', `translate(${round((from.x - to.x) * (1 - e))} ${round((from.y - to.y) * (1 - e))})`);
      };

      await run(mine, (p) => {
        const a = clamp01(p / SEEK_SHARE);
        const along = easeInOut(a) * (legA + legB);
        const pos = along <= legA || legB === 0
          ? { x: p0.x + (p1.x - p0.x) * (legA === 0 ? 1 : Math.min(1, along / legA)), y: p0.y + (p1.y - p0.y) * (legA === 0 ? 1 : Math.min(1, along / legA)) }
          : { x: p1.x, y: p1.y + (p2.y - p1.y) * ((along - legA) / legB) };
        chipNode.setAttribute('transform', `translate(${round(pos.x)} ${round(pos.y)})`);

        if (p < SEEK_SHARE) return;
        if (!found) {
          found = el('g', {}, layer);
          outline(found, rowBox(L, L.rightCols, step.right), pal.itemActive);
          copyR = cell(layer, toRight, result.values[1], tints[step.right]!, 0.28);
          copyL = cell(layer, toLeft, result.values[0], pal.bgSubtle, 1);
        }
        const b = clamp01((p - SEEK_SHARE) / (1 - SEEK_SHARE));
        if (copyR) place(copyR, fromRight, toRight, b);
        if (copyL) place(copyL, fromLeft, toLeft, b);
      });

      if (destroyed || mine !== gen) return;
      drawStatic(next, false);
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
