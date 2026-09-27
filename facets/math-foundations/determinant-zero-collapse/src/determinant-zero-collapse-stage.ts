/**
 * determinant-zero-collapse 무대.
 *
 * 왼쪽은 수학 좌표평면(위가 +y). 점이 제 자리에서 A p 로 날아가 이미 와 있던 점 위에
 * 동전처럼 포개진다. 오른쪽은 도착 자리마다의 더미 — 그 자리에 온 점이 어디서 왔는지가
 * 칩으로 쌓인다. 마지막 걸음에 도착 자리가 모두 놓인 직선이 원점에서 뻗는다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
} from '@ffacet/core/runtime';
import { formatNum, formatPt, type Pt } from './algorithm.js';
import type { CollapseScene } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 한 칸의 상한(px) — 크기는 캔버스에서 역산한다 */
const UNIT_MAX = 40;
/** 평면이 차지할 가로 몫의 상한 */
const PLANE_SHARE = 0.36;
const EDGE = 16;
const PLANE_TOP = 18;
const PLANE_BOTTOM_GAP = 48;
/** 포개진 동전 사이의 세로 어긋남(px) */
const COIN_LIFT = 5;
const MOVE_MS = 400;
const LINE_MS = 400;
const TICK_MS = 16;
/** 칩이 더미 위로 떨어지는 높이(px) */
const CHIP_FALL = 120;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 자리 k 에 온 점의 수. init 뒤엔 counts 가 자리 수만큼 있으니 없으면 모양이 어긋난 것이다 */
function countAt(scene: CollapseScene, k: number): number {
  const n = scene.counts[k];
  if (n === undefined) throw new Error(`determinant-zero-collapse-stage: counts[${k}] 가 없다`);
  return n;
}

type Layout = {
  u: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  left: number;
  top: number;
  px(x: number): number;
  py(y: number): number;
  coinR: number;
  panelLeft: number;
  panelRight: number;
};

function layoutOf(scene: CollapseScene): Layout {
  const setup = scene.setup;
  if (setup === null) throw new Error('determinant-zero-collapse-stage: 바탕 없이 평면을 셀 수 없다');
  const b = setup.bounds;
  const x0 = b.minX - 1;
  const x1 = b.maxX + 1.6;
  const y0 = b.minY - 0.6;
  const y1 = b.maxY + 0.8;
  const planeH = H - PLANE_TOP - PLANE_BOTTOM_GAP;
  const planeWMax = PIECE_CANVAS_W * PLANE_SHARE;
  const u = Math.min(UNIT_MAX, planeH / (y1 - y0), planeWMax / (x1 - x0));
  const left = EDGE;
  const top = PLANE_TOP + (planeH - (y1 - y0) * u) / 2;
  const planeRight = left + (x1 - x0) * u;
  return {
    u,
    x0,
    x1,
    y0,
    y1,
    left,
    top,
    px: (x) => r2(left + (x - x0) * u),
    py: (y) => r2(top + (y1 - y) * u),
    coinR: Math.min(8, u * 0.22),
    panelLeft: planeRight + 28,
    panelRight: PIECE_CANVAS_W - EDGE,
  };
}

/** 원점을 지나는 방향 d 의 직선이 평면 틀과 만나는 두 끝 (수학 좌표) */
function clipLine(lay: Layout, d: Pt): [Pt, Pt] {
  const [dx, dy] = d;
  let lo = -Infinity;
  let hi = Infinity;
  const slab = (v: number, a: number, b: number): void => {
    if (v === 0) {
      if (a > 0 || b < 0) throw new Error('determinant-zero-collapse-stage: 직선이 틀 밖이다');
      return;
    }
    const t1 = a / v;
    const t2 = b / v;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  };
  slab(dx, lay.x0, lay.x1);
  slab(dy, lay.y0, lay.y1);
  if (!(lo <= hi)) throw new Error('determinant-zero-collapse-stage: 직선이 틀을 지나지 않는다');
  return [
    [lo * dx, lo * dy],
    [hi * dx, hi * dy],
  ];
}

/** 운동이 만질 요소와 그 끝자리 — 끝자리는 정적 그리기가 셈한 값을 그대로 넘긴다 */
type Handles = {
  mover: { node: SVGCircleElement; from: Pt; to: Pt } | null;
  trail: SVGLineElement | null;
  chip: { node: SVGGElement; x: number; y: number } | null;
  line: { node: SVGLineElement; ends: readonly [number, number, number, number]; origin: Pt } | null;
};

export const determinantZeroCollapseStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const monoPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function text(parent: Element, x: number, y: number, s: string, attrs: Attrs = {}): SVGTextElement {
      const node = el(parent, 'text', {
        x: r2(x),
        y: r2(y),
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
        ...attrs,
      });
      node.textContent = s;
      return node;
    }

    function drawMatrix(scene: CollapseScene, root: Element, lay: Layout | null): void {
      const [a, b, c, d] = scene.matrix;
      const left = lay === null ? PIECE_CANVAS_W / 2 - 60 : lay.panelLeft;
      const g = el(root, 'g', {});
      const label = t('label.matrix', 'A =');
      text(g, left, 58, label, { 'font-family': fonts.mono, 'font-size': fontSizes.lg });
      const bx = left + label.length * parseFloat(fontSizes.lg) * 0.62 + 10;
      const colW = monoPx * 3.2;
      const topY = 26;
      const botY = 76;
      const brace = (x: number, dir: 1 | -1): void => {
        el(g, 'path', {
          d: `M ${r2(x + dir * 6)} ${topY} L ${r2(x)} ${topY} L ${r2(x)} ${botY} L ${r2(x + dir * 6)} ${botY}`,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 1.5,
        });
      };
      brace(bx, 1);
      brace(bx + colW * 2 + 12, -1);
      const cells: [number, number, number][] = [
        [a, 0, 0],
        [b, 1, 0],
        [c, 0, 1],
        [d, 1, 1],
      ];
      for (const [v, col, row] of cells) {
        text(g, bx + 6 + colW * (col + 0.5), 46 + row * 22, formatNum(v), {
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'text-anchor': 'middle',
        });
      }
    }

    function drawCaption(scene: CollapseScene, root: Element): void {
      const step = scene.step;
      const setup = scene.setup;
      if (step === null || setup === null) return;
      let s: string;
      if (step.kind === 'start') {
        s = t('caption.start', 'Points: {n} · spots: {m}', {
          n: scene.points.length,
          m: setup.sourceSpots,
        });
      } else if (step.kind === 'move') {
        const from = scene.points[step.i];
        const to = setup.images[step.i];
        if (from === undefined || to === undefined) {
          throw new Error(`determinant-zero-collapse-stage: 점 ${step.i} 가 바탕에 없다`);
        }
        s = t('caption.move', '{from} → {to} · arrived here: {n}', {
          from: formatPt(from),
          to: formatPt(to),
          n: step.count,
        });
      } else {
        const [a, b, c, d] = scene.matrix;
        s = t('caption.done', 'Points {n} → spots {m} · det = {a}·{d} − {b}·{c} = {det}', {
          n: step.points,
          m: step.spots,
          a: formatNum(a),
          b: formatNum(b),
          c: formatNum(c),
          d: formatNum(d),
          det: formatNum(step.det),
        });
      }
      text(root, PIECE_CANVAS_W / 2, H - 16, s, { 'font-size': fontSizes.md, 'text-anchor': 'middle' });
    }

    /** 장면 하나의 화면 전체. 운동이 만질 손잡이를 돌려준다. */
    function drawStatic(scene: CollapseScene): Handles {
      svg.textContent = '';
      const handles: Handles = { mover: null, trail: null, chip: null, line: null };
      const root = el(svg, 'g', {});
      const setup = scene.setup;
      if (setup === null) {
        drawMatrix(scene, root, null);
        return handles;
      }
      const lay = layoutOf(scene);
      const pointColors = categorical(scene.points.length, 'vivid');
      const colorOf = (i: number): string => {
        const col = pointColors[i];
        if (col === undefined) throw new Error(`determinant-zero-collapse-stage: 점 ${i} 의 색이 없다`);
        return col;
      };
      const step = scene.step;
      const current = step !== null && step.kind === 'move' ? step.i : -1;

      // ── 평면: 축과 눈금
      const plane = el(root, 'g', {});
      el(plane, 'line', {
        x1: lay.px(lay.x0), y1: lay.py(0), x2: lay.px(lay.x1), y2: lay.py(0),
        stroke: colors.border, 'stroke-width': 1,
      });
      el(plane, 'line', {
        x1: lay.px(0), y1: lay.py(lay.y0), x2: lay.px(0), y2: lay.py(lay.y1),
        stroke: colors.border, 'stroke-width': 1,
      });
      for (let x = Math.ceil(lay.x0); x <= lay.x1; x += 1) {
        if (x === 0) continue;
        el(plane, 'line', {
          x1: lay.px(x), y1: lay.py(0) - 3, x2: lay.px(x), y2: lay.py(0) + 3,
          stroke: colors.border, 'stroke-width': 1,
        });
      }
      for (let y = Math.ceil(lay.y0); y <= lay.y1; y += 1) {
        if (y === 0) continue;
        el(plane, 'line', {
          x1: lay.px(0) - 3, y1: lay.py(y), x2: lay.px(0) + 3, y2: lay.py(y),
          stroke: colors.border, 'stroke-width': 1,
        });
      }

      // ── 마지막 걸음: 도착 자리가 모두 놓인 직선
      if (step !== null && step.kind === 'done') {
        const [p, q] = clipLine(lay, setup.line);
        const ends = [lay.px(p[0]), lay.py(p[1]), lay.px(q[0]), lay.py(q[1])] as const;
        const node = el(plane, 'line', {
          x1: ends[0], y1: ends[1], x2: ends[2], y2: ends[3],
          stroke: colors.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '6 4',
        });
        handles.line = { node, ends, origin: [lay.px(0), lay.py(0)] };
      }

      // ── 동전 자리: 자리마다 도착 차례대로 위로 쌓는다
      const slotOf = new Map<number, Pt>();
      const stackIndex = setup.spots.map(() => 0);
      for (const i of scene.arrived) {
        const k = setup.spotOf[i];
        const spot = k === undefined ? undefined : setup.spots[k];
        if (k === undefined || spot === undefined) {
          throw new Error(`determinant-zero-collapse-stage: 점 ${i} 의 도착 자리가 없다`);
        }
        const level = stackIndex[k] as number;
        stackIndex[k] = level + 1;
        slotOf.set(i, [lay.px(spot[0]), r2(lay.py(spot[1]) - level * COIN_LIFT)]);
      }

      // ── 지나온 길: 떠난 자리에서 도착 자리까지
      const trails = el(plane, 'g', {});
      for (const i of scene.arrived) {
        const src = scene.points[i];
        const slot = slotOf.get(i);
        if (src === undefined || slot === undefined) {
          throw new Error(`determinant-zero-collapse-stage: 점 ${i} 의 길을 그릴 수 없다`);
        }
        const line = el(trails, 'line', {
          x1: lay.px(src[0]), y1: lay.py(src[1]), x2: slot[0], y2: slot[1],
          stroke: colorOf(i), 'stroke-width': 1.2, 'stroke-dasharray': '3 3', 'stroke-opacity': 0.6,
        });
        if (i === current) handles.trail = line;
      }

      // ── 떠나기 전 자리: 아직이면 채운 점, 떠났으면 빈 고리
      const moved = new Set(scene.arrived);
      scene.points.forEach((p, i) => {
        const cx = lay.px(p[0]);
        const cy = lay.py(p[1]);
        if (moved.has(i)) {
          el(plane, 'circle', {
            cx, cy, r: r2(lay.coinR - 1), fill: colors.bg, stroke: colorOf(i), 'stroke-width': 1.5,
          });
        } else {
          el(plane, 'circle', { cx, cy, r: r2(lay.coinR), fill: colorOf(i) });
        }
        text(plane, cx + lay.coinR + 4, cy + 4, formatPt(p), {
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted,
        });
      });

      // ── 도착 자리 이름
      setup.spots.forEach((s, k) => {
        if (countAt(scene, k) === 0) return;
        text(plane, lay.px(s[0]) + lay.coinR + 5, lay.py(s[1]) + 4, formatPt(s), {
          'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.text, 'font-weight': 600,
        });
      });

      // ── 포개진 동전 (도착 차례 = 아래에서 위로)
      for (const i of scene.arrived) {
        const slot = slotOf.get(i);
        if (slot === undefined) throw new Error(`determinant-zero-collapse-stage: 점 ${i} 의 동전 자리가 없다`);
        const coin = el(plane, 'circle', {
          cx: slot[0], cy: slot[1], r: r2(lay.coinR), fill: colorOf(i), stroke: colors.bg, 'stroke-width': 1.5,
        });
        if (i === current) {
          const src = scene.points[i];
          if (src === undefined) throw new Error(`determinant-zero-collapse-stage: 점 ${i} 가 없다`);
          handles.mover = { node: coin, from: [lay.px(src[0]), lay.py(src[1])], to: slot };
        }
      }

      // ── 오른쪽: 행렬과 자리마다의 더미
      drawMatrix(scene, root, lay);
      const ledgerTop = 112;
      const floorY = H - 72;
      const nSpots = setup.spots.length;
      const colW = Math.min(190, (lay.panelRight - lay.panelLeft) / nSpots);
      const maxTotal = Math.max(...setup.totals);
      const chipGap = 6;
      const chipH = Math.min(30, (floorY - ledgerTop - 24 - chipGap * maxTotal) / maxTotal);
      const chipW = colW - 22;
      const ledger = el(root, 'g', {});
      const levels = setup.spots.map(() => 0);
      setup.spots.forEach((s, k) => {
        const count = countAt(scene, k);
        if (count === 0) return;
        const cx = lay.panelLeft + colW * k;
        const isNow = step !== null && step.kind === 'move' && step.spot === k;
        text(ledger, cx, ledgerTop, t('label.spot', 'At {p}', { p: formatPt(s) }), {
          'font-weight': 600,
        });
        el(ledger, 'line', {
          x1: r2(cx), y1: floorY, x2: r2(cx + chipW), y2: floorY, stroke: colors.border, 'stroke-width': 1.5,
        });
        text(ledger, cx, floorY + 22, t('label.arrived', 'Arrived: {n}', { n: count }), {
          'font-size': fontSizes.md,
          'font-weight': isNow ? 700 : 400,
          fill: isNow ? colors.text : colors.textMuted,
        });
      });
      for (const i of scene.arrived) {
        const k = setup.spotOf[i];
        const src = scene.points[i];
        if (k === undefined || src === undefined) {
          throw new Error(`determinant-zero-collapse-stage: 점 ${i} 의 칩을 놓을 수 없다`);
        }
        const level = levels[k] as number;
        levels[k] = level + 1;
        const x = lay.panelLeft + colW * k;
        const y = floorY - chipGap / 2 - (level + 1) * (chipH + chipGap) + chipGap;
        const chip = el(ledger, 'g', { transform: `translate(${r2(x)} ${r2(y)})` });
        el(chip, 'rect', {
          x: 0, y: 0, width: r2(chipW), height: r2(chipH), rx: 5,
          fill: colors.bg, stroke: colorOf(i), 'stroke-width': 1.5,
        });
        el(chip, 'circle', { cx: 14, cy: r2(chipH / 2), r: 5, fill: colorOf(i) });
        text(chip, 28, chipH / 2 + monoPx * 0.35, formatPt(src), {
          'font-family': fonts.mono, 'font-size': fontSizes.sm,
        });
        if (i === current) handles.chip = { node: chip, x: r2(x), y: r2(y) };
      }

      drawCaption(scene, root);
      return handles;
    }

    function tween(mine: number, ms: number, apply: (e: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = performance.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          apply(ease(p));
          if (p >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, TICK_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function animateMove(mine: number, h: Handles): Promise<void> {
      const { mover, trail, chip } = h;
      if (mover === null || trail === null || chip === null) {
        throw new Error('determinant-zero-collapse-stage: 옮길 점의 손잡이를 못 찾았다');
      }
      const [sx, sy] = mover.from;
      const [ex, ey] = mover.to;
      await tween(mine, MOVE_MS, (e) => {
        const x = r2(sx + (ex - sx) * e);
        const y = r2(sy + (ey - sy) * e);
        mover.node.setAttribute('cx', String(x));
        mover.node.setAttribute('cy', String(y));
        trail.setAttribute('x2', String(x));
        trail.setAttribute('y2', String(y));
        chip.node.setAttribute('transform', `translate(${chip.x} ${r2(chip.y - CHIP_FALL * (1 - e))})`);
      });
    }

    async function animateLine(mine: number, h: Handles): Promise<void> {
      const line = h.line;
      if (line === null) throw new Error('determinant-zero-collapse-stage: 직선의 손잡이를 못 찾았다');
      const [ox, oy] = line.origin;
      const [x1, y1, x2, y2] = line.ends;
      await tween(mine, LINE_MS, (e) => {
        line.node.setAttribute('x1', String(r2(ox + (x1 - ox) * e)));
        line.node.setAttribute('y1', String(r2(oy + (y1 - oy) * e)));
        line.node.setAttribute('x2', String(r2(ox + (x2 - ox) * e)));
        line.node.setAttribute('y2', String(r2(oy + (y2 - oy) * e)));
      });
    }

    const renderer: SceneRenderer<CollapseScene> = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step === null || step.kind === 'start') return;
        if (step.kind === 'move') await animateMove(mine, handles);
        else await animateLine(mine, handles);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
