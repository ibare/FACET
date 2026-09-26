/**
 * order-must-be-added 의 그림.
 *
 * 왼쪽은 자리(열) 셋 위에 놓인 줄 둘 — 첫 줄과, 거기서 두 토큰이 자리를 맞바꿔 내려앉은 줄.
 * 자리마다 위치 표시 PE(p) 가 머리에 붙고, 더할 때는 그 표시가 칸으로 내려온다.
 * 오른쪽은 따라가는 토큰의 결과가 찍히는 평면 — 두 줄의 결과가 한 점에 겹쳤다가 표시를 더하면 갈라진다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { RowId } from './algorithm.js';
import type { OrderExtent, OrderRow, OrderScene } from './scene.js';

const H = 348;
const MOTION_MS = 400;
const NS = 'http://www.w3.org/2000/svg';
const ROWS: RowId[] = ['first', 'second'];

type Attrs = Record<string, string | number>;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** 표시할 때만 둘째 자리. 셈에는 되돌려 넣지 않는다. */
function fmt(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function fmtVec(v: number[]): string {
  return `(${v.map(fmt).join(', ')})`;
}

function el(parent: Element, tag: string, attrs: Attrs, text?: string): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

export const orderMustBeAddedStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const rowColor = categorical(2);
    const W = PIECE_CANVAS_W;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // ── 자리 셈 (캔버스에서 역산) ─────────────────────────
    // 토큰 수와 평면 범위는 장면에서 온다 — 그림은 자료를 따로 읽지 않는다.
    const M = 16;
    const planeW = Math.min(200, W * 0.33);
    const planeLeft = W - M - planeW;
    const cellsRight = planeLeft - 28;
    const headY = 22;
    const chipY = 32;
    const chipH = 24;
    const cellH = 80;
    const rowLabelY: Record<RowId, number> = { first: 88, second: 200 };
    const rowY: Record<RowId, number> = { first: 96, second: 208 };
    const captionY = H - 12;
    const planeTop = 40;
    const planeSide = planeW;
    const planeBottom = planeTop + planeSide;

    type Columns = { colW: number; cellW: number; chipW: number };
    function columns(scene: OrderScene): Columns {
      const n = scene.rows.first.order.length;
      if (n === 0) throw new Error('order-must-be-added-stage: 줄이 비었다');
      const colW = (cellsRight - M) / n;
      return { colW, cellW: Math.min(150, colW - 10), chipW: colW - 6 };
    }
    let cols: Columns | null = null;
    const C = (): Columns => {
      if (!cols) throw new Error('order-must-be-added-stage: 칸 너비를 장면에서 셈하기 전에 그리려 했다');
      return cols;
    };
    const colX = (p: number): number => M + p * C().colW + (C().colW - C().cellW) / 2;
    const chipX = (p: number): number => M + p * C().colW + 3;

    type Plane = { toPx: (v: number[]) => [number, number]; xs: number[]; ys: number[] };
    function planeOf(extent: OrderExtent): Plane {
      const pad = 0.25;
      const x0 = extent.x0 - pad;
      const x1 = extent.x1 + pad;
      const y0 = extent.y0 - pad;
      const y1 = extent.y1 + pad;
      const s = Math.min(planeSide / (x1 - x0), planeSide / (y1 - y0));
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const mid = planeLeft + planeSide / 2;
      const midY = planeTop + planeSide / 2;
      const half = planeSide / 2 / s;
      const lines = (lo: number, hi: number): number[] => {
        const out: number[] = [];
        for (let g = Math.ceil(lo * 2) / 2; g <= hi + 1e-9; g += 0.5) out.push(round(g));
        return out;
      };
      return {
        toPx: (v) => [mid + (v[0]! - cx) * s, midY - (v[1]! - cy) * s],
        xs: lines(cx - half, cx + half),
        ys: lines(cy - half, cy + half),
      };
    }
    /** 지금 장면의 평면. init 이 오기 전(걸음 0 의 첫 그림)만 없고, 그때는 찍을 점도 없다 */
    let plane: Plane | null = null;
    const toPx = (v: number[]): [number, number] => {
      if (!plane) throw new Error('order-must-be-added-stage: 평면 범위(init)를 받기 전에 점을 찍으려 했다');
      return plane.toPx(v);
    };

    // ── 정적 그리기 (정본) ──────────────────────────────
    type Handles = {
      cells: Record<RowId, SVGElement[]>;
      bars: Record<RowId, SVGElement[]>;
      chips: SVGElement[];
      points: Record<RowId, SVGElement | null>;
      link: SVGElement | null;
      motion: SVGElement;
    };

    function drawRowLabel(row: RowId, scene: OrderScene): void {
      const y = rowLabelY[row];
      if (row === 'first') el(svg, 'circle', { cx: M + 5, cy: y - 4, r: 4, fill: rowColor[0]! });
      else el(svg, 'circle', { cx: M + 5, cy: y - 4, r: 4, fill: colors.bg, stroke: rowColor[1]!, 'stroke-width': 2 });
      const name = row === 'first' ? t('label.first', 'Original order') : t('label.second', 'Swapped order');
      el(svg, 'text', { x: M + 16, y, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600 }, name);
      el(
        svg,
        'text',
        { x: cellsRight, y, 'text-anchor': 'end', fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs },
        t('label.weightsFrom', 'Weights from {token}', { token: scene.track }),
      );
    }

    function drawCell(row: RowId, r: OrderRow, p: number, scene: OrderScene, h: Handles): void {
      const g = el(svg, 'g', {});
      const x = colX(p);
      const y = rowY[row];
      const id = r.order[p]!;
      const tracked = id === scene.track;
      el(g, 'rect', {
        x,
        y,
        width: C().cellW,
        height: cellH,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: tracked ? colors.text : colors.border,
        'stroke-width': tracked ? 2 : 1,
      });
      if (tracked) el(g, 'rect', { x: x + 6, y: y + 6, width: 26, height: 24, rx: 4, fill: colors.accent });
      el(
        g,
        'text',
        {
          x: x + 19,
          y: y + 24,
          'text-anchor': 'middle',
          fill: tracked ? colors.stateInk : colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 700,
        },
        id,
      );
      el(
        g,
        'text',
        { x: x + C().cellW - 8, y: y + 22, 'text-anchor': 'end', fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs },
        r.marked ? 'x + PE' : 'x',
      );
      el(
        g,
        'text',
        { x: x + 8, y: y + 48, fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm },
        fmtVec(r.inputs[p]!),
      );
      const barX = x + 8;
      const barW = C().cellW - 52;
      el(g, 'rect', { x: barX, y: y + 60, width: barW, height: 8, rx: 2, fill: colors.border });
      if (r.weights) {
        const w = r.weights[p]!;
        const bar = el(g, 'rect', { x: barX, y: y + 60, width: barW * w, height: 8, rx: 2, fill: rowColor[row === 'first' ? 0 : 1]! });
        h.bars[row][p] = bar;
        el(
          g,
          'text',
          { x: x + C().cellW - 8, y: y + 68, 'text-anchor': 'end', fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs },
          fmt(w),
        );
      }
      h.cells[row][p] = g;
    }

    function drawPlane(scene: OrderScene, h: Handles): void {
      el(
        svg,
        'text',
        { x: planeLeft, y: headY, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600 },
        t('label.result', 'Result for {token}', { token: scene.track }),
      );
      el(svg, 'rect', { x: planeLeft, y: planeTop, width: planeSide, height: planeSide, fill: colors.bg, stroke: colors.border });
      // init 앞의 첫 그림은 평면 틀만 선다 (drawStatic 이 그 경우를 걸음 0 으로만 허락한다)
      const gridXs = plane ? plane.xs : [];
      const gridYs = plane ? plane.ys : [];
      for (const gx of gridXs) {
        const [px] = toPx([gx, 0]);
        if (px < planeLeft || px > planeLeft + planeSide) continue;
        el(svg, 'line', { x1: px, y1: planeTop, x2: px, y2: planeBottom, stroke: colors.border, 'stroke-width': gx === 0 ? 1.5 : 0.5 });
        // 왼쪽 아래 모서리는 세로 눈금 글자의 자리라 비운다
        if (px < planeLeft + 24) continue;
        el(
          svg,
          'text',
          { x: px + 3, y: planeBottom - 4, fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs },
          String(gx),
        );
      }
      for (const gy of gridYs) {
        const [, py] = toPx([0, gy]);
        if (py < planeTop || py > planeBottom) continue;
        el(svg, 'line', { x1: planeLeft, y1: py, x2: planeLeft + planeSide, y2: py, stroke: colors.border, 'stroke-width': gy === 0 ? 1.5 : 0.5 });
        if (py < planeTop + 14) continue;
        el(
          svg,
          'text',
          { x: planeLeft + 3, y: py - 3, fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs },
          String(gy),
        );
      }

      // 표시를 더한 뒤에는 표시 없던 자리를 점선 고리로 남긴다
      const plains = new Set<string>();
      for (const row of ROWS) {
        const r = scene.rows[row];
        if (!r || !r.marked || !r.plain) continue;
        const key = fmtVec(r.plain);
        if (plains.has(key)) continue;
        plains.add(key);
        const [px, py] = toPx(r.plain);
        el(svg, 'circle', { cx: px, cy: py, r: 7, fill: 'none', stroke: colors.textMuted, 'stroke-width': 1, 'stroke-dasharray': '2 2' });
      }

      const a = scene.rows.first.result;
      const b = scene.rows.second?.result ?? null;
      if (scene.markedDiff !== null && a && b) {
        const [ax, ay] = toPx(a);
        const [bx, by] = toPx(b);
        h.link = el(svg, 'line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: colors.text, 'stroke-width': 2, 'stroke-dasharray': '5 3' });
        el(
          svg,
          'text',
          {
            x: (ax + bx) / 2 + 6,
            y: (ay + by) / 2 - 6,
            fill: colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 700,
          },
          fmt(scene.markedDiff),
        );
      }
      if (a) {
        const [px, py] = toPx(a);
        h.points.first = el(svg, 'circle', { cx: px, cy: py, r: 6, fill: rowColor[0]! });
      }
      if (b) {
        const [px, py] = toPx(b);
        h.points.second = el(svg, 'circle', { cx: px, cy: py, r: 9, fill: 'none', stroke: rowColor[1]!, 'stroke-width': 2.5 });
      }

      // 범례 — 줄 이름과 결과 벡터
      let ly = planeBottom + 20;
      for (const row of ROWS) {
        const r = scene.rows[row];
        if (!r || !r.result) continue;
        if (row === 'first') el(svg, 'circle', { cx: planeLeft + 5, cy: ly - 4, r: 4, fill: rowColor[0]! });
        else el(svg, 'circle', { cx: planeLeft + 5, cy: ly - 4, r: 4, fill: colors.bg, stroke: rowColor[1]!, 'stroke-width': 2 });
        el(
          svg,
          'text',
          { x: planeLeft + 16, y: ly, fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm },
          fmtVec(r.result),
        );
        ly += 18;
      }
    }

    function drawStatic(scene: OrderScene): Handles {
      if (!scene.extent && scene.step.kind !== 'start') {
        throw new Error(`order-must-be-added-stage: ${scene.step.kind} 걸음인데 평면 범위(init)가 장면에 없다`);
      }
      cols = columns(scene);
      plane = scene.extent ? planeOf(scene.extent) : null;
      svg.textContent = '';
      const h: Handles = {
        cells: { first: [], second: [] },
        bars: { first: [], second: [] },
        chips: [],
        points: { first: null, second: null },
        link: null,
        motion: svg,
      };
      el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });

      // 자리 머리 — 자리는 처음부터 있다. 표시는 marks 걸음부터 붙는다
      for (let p = 0; p < scene.rows.first.order.length; p += 1) {
        const cx = colX(p) + C().cellW / 2;
        el(
          svg,
          'text',
          { x: cx, y: headY, 'text-anchor': 'middle', fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs },
          t('label.position', 'Position {p}', { p }),
        );
        const m = scene.marks?.[p];
        if (m) {
          const g = el(svg, 'g', {});
          el(g, 'rect', { x: chipX(p), y: chipY, width: C().chipW, height: chipH, rx: 12, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.2 });
          el(
            g,
            'text',
            { x: cx, y: chipY + 16, 'text-anchor': 'middle', fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs },
            `PE ${fmtVec(m)}`,
          );
          h.chips[p] = g;
        }
      }

      for (const row of ROWS) {
        const r = scene.rows[row];
        if (!r) continue;
        drawRowLabel(row, scene);
        for (let p = 0; p < r.order.length; p += 1) drawCell(row, r, p, scene, h);
      }

      drawPlane(scene, h);
      el(
        svg,
        'text',
        { x: M, y: captionY, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md },
        caption(scene),
      );
      h.motion = el(svg, 'g', {});
      return h;
    }

    function caption(scene: OrderScene): string {
      const token = scene.track;
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'Order: {order}. No position marks yet.', { order: scene.rows.first.order.join(' ') });
        case 'attend': {
          const r = scene.rows.first;
          if (!r.result) throw new Error('order-must-be-added-stage: 첫 줄의 결과가 없다');
          return t('caption.attend', 'In order {order}, result for {token}: {vec}', {
            order: r.order.join(' '),
            token,
            vec: fmtVec(r.result),
          });
        }
        case 'swap': {
          const r = scene.rows.second;
          if (!r || !r.result || scene.plainDiff === null) throw new Error('order-must-be-added-stage: 뒤바꾼 줄이 없다');
          return t('caption.swap', 'Swapped to {order}. Result for {token}: {vec} · Difference: {d}', {
            order: r.order.join(' '),
            token,
            vec: fmtVec(r.result),
            d: fmt(scene.plainDiff),
          });
        }
        case 'marks':
          return t('caption.marks', 'Each position gets a mark {pe} = ({sin}, {cos})', { pe: 'PE(p)', sin: 'sin p', cos: 'cos p' });
        case 'addMarks': {
          const r = scene.rows[step.row];
          if (!r || !r.result) throw new Error('order-must-be-added-stage: 표시를 더한 줄이 없다');
          return t('caption.add', 'Marks added to {order}. Result for {token}: {vec}', {
            order: r.order.join(' '),
            token,
            vec: fmtVec(r.result),
          });
        }
        case 'distance': {
          if (scene.markedDiff === null || scene.plainDiff === null) throw new Error('order-must-be-added-stage: 차이가 없다');
          return t('caption.distance', 'Difference between the two results: {d} · Without marks: {was}', {
            d: fmt(scene.markedDiff),
            was: fmt(scene.plainDiff),
          });
        }
      }
    }

    // ── 운동 ─────────────────────────────────────────
    function tween(mine: number, frame: (e: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          const k = Math.min(1, (Date.now() - start) / MOTION_MS);
          frame(ease(k));
          if (k >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    const shift = (node: SVGElement | null | undefined, dx: number, dy: number): void => {
      if (!node) throw new Error('order-must-be-added-stage: 움직일 요소가 정적 그림에 없다');
      node.setAttribute('transform', `translate(${round(dx)} ${round(dy)})`);
    };

    /** 막대를 왼쪽 끝을 붙잡은 채 from → to 로 늘이고 줄인다 */
    const barTo = (bar: SVGElement | undefined, full: number, from: number, to: number, e: number): void => {
      if (!bar) throw new Error('order-must-be-added-stage: 늘일 무게 막대가 정적 그림에 없다');
      bar.setAttribute('width', String(round(full * (from + (to - from) * e))));
    };

    async function animate(next: OrderScene, h: Handles, mine: number): Promise<void> {
      const step = next.step;
      const barFull = C().cellW - 52;
      if (step.kind === 'attend' || step.kind === 'swap') {
        const row = step.row;
        const r = next.rows[row];
        if (!r || !r.result || !r.weights) throw new Error(`order-must-be-added-stage: ${step.kind} 걸음인데 ${row} 줄의 결과가 없다`);
        const start = r.inputs[r.order.indexOf(next.track)];
        if (!start) throw new Error(`order-must-be-added-stage: ${row} 줄에 ${next.track} 가 없다`);
        const [sx, sy] = toPx(start);
        const [ex, ey] = toPx(r.result);
        const weights = r.weights;
        // 뒤바꾼 줄은 첫 줄의 제 자리에서 내려와 맞바뀐 자리에 앉는다
        const from = next.rows.first.order;
        await tween(mine, (e) => {
          weights.forEach((w, p) => barTo(h.bars[row][p], barFull, 0, w, e));
          if (step.kind === 'swap') {
            r.order.forEach((id, p) => {
              const src = from.indexOf(id);
              const dx = colX(src) - colX(p);
              const dy = rowY.first - rowY.second;
              // 곧게 내려오지 않고 둥글게 — 맞바뀌는 둘이 서로 비켜 지나간다
              const lift = Math.sin(Math.PI * e) * (src === p ? 0 : 18 * (src < p ? -1 : 1));
              shift(h.cells.second[p], dx * (1 - e) + lift, dy * (1 - e));
            });
          }
          shift(h.points[row], (sx - ex) * (1 - e), (sy - ey) * (1 - e));
        });
        return;
      }
      if (step.kind === 'marks') {
        await tween(mine, (e) => {
          h.chips.forEach((c) => shift(c, 0, -(chipY + chipH) * (1 - e)));
        });
        return;
      }
      if (step.kind === 'addMarks') {
        const row = step.row;
        const r = next.rows[row];
        if (!r || !r.result || !r.weights) throw new Error(`order-must-be-added-stage: addMarks 걸음인데 ${row} 줄의 결과가 없다`);
        const marks = next.marks;
        if (!marks) throw new Error('order-must-be-added-stage: addMarks 걸음인데 위치 표시가 장면에 없다');
        // 표시의 복제본이 머리에서 칸으로 내려온다 — 머리의 표시는 그대로 남는다
        const drops = marks.map((m, p) => {
          const g = el(h.motion, 'g', {});
          el(g, 'rect', { x: chipX(p), y: chipY, width: C().chipW, height: chipH, rx: 12, fill: colors.accent });
          el(
            g,
            'text',
            { x: colX(p) + C().cellW / 2, y: chipY + 16, 'text-anchor': 'middle', fill: colors.stateInk, 'font-family': fonts.mono, 'font-size': fontSizes.xs },
            `+ ${fmtVec(m)}`,
          );
          return g;
        });
        const [fx, fy] = toPx(step.from);
        const [ex, ey] = toPx(r.result);
        const target = rowY[row] + 30 - chipY;
        const weights = r.weights;
        const was = step.fromWeights;
        await tween(mine, (e) => {
          const fall = Math.min(1, e * 1.4);
          drops.forEach((g) => shift(g, 0, target * fall));
          weights.forEach((w, p) => {
            const before = was[p];
            if (before === undefined) throw new Error(`order-must-be-added-stage: 자리 ${p} 의 앞 무게가 없다`);
            barTo(h.bars[row][p], barFull, before, w, e);
          });
          shift(h.points[row], (fx - ex) * (1 - e), (fy - ey) * (1 - e));
        });
        return;
      }
      if (step.kind === 'distance') {
        const link = h.link;
        const a = next.rows.first.result;
        const b = next.rows.second?.result;
        if (!link || !a || !b) throw new Error('order-must-be-added-stage: distance 걸음인데 두 결과나 잇는 선이 없다');
        const [ax, ay] = toPx(a);
        const [bx, by] = toPx(b);
        await tween(mine, (e) => {
          link.setAttribute('x2', String(round(ax + (bx - ax) * e)));
          link.setAttribute('y2', String(round(ay + (by - ay) * e)));
        });
      }
    }

    return {
      async render(next: OrderScene, _prev: OrderScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        await animate(next, h, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
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
