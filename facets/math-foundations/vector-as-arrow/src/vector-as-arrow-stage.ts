/**
 * vector-as-arrow 의 무대.
 *
 * 왼쪽은 칸을 셀 수 있는 좌표평면이다. 원점에서 가로 다리 · 세로 다리를 걸어 머리가 찍히고,
 * 원점에서 머리까지 화살표가 뻗는다. 뒤 걸음마다 원점의 화살표가 모양 그대로 새 꼬리로
 * 미끄러져 가고, 그 자리에서 다시 가로 · 세로 다리가 칸 수를 보인다.
 * 오른쪽은 숫자쌍과, 놓인 화살표마다 꼬리 · 머리 · 머리 − 꼬리 를 적는 장부다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import type { Pt } from './algorithm.js';
import type { VectorAsArrowScene } from './scene.js';

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const CAPTION_Y = 24;
const PLANE_TOP = 44;
/** 오른쪽 장부의 폭 */
const PANEL_W = 196;
const PANEL_GAP = 20;
/** 눈금 수가 차지하는 왼쪽 폭 · 아래 높이 */
const TICK_W = 20;
const TICK_H = 16;
/** 한 칸의 상한 (px) */
const CELL_MAX = 48;
/** 운동 한 번의 길이 */
const MOTION_MS = 600;
const FRAME_MS = 16;
/** 화살촉 길이 · 반폭 */
const HEAD_LEN = 11;
const HEAD_HALF = 5.5;

type Px = { x: number; y: number };

type Frame = {
  cell: number;
  toPx(p: Pt): Px;
};

/** 수를 화면 글자로 — 음수는 빼기 기호, −0 은 0. */
function fmtNum(n: number): string {
  const v = Object.is(n, -0) ? 0 : n;
  return v < 0 ? `−${String(-v)}` : String(v);
}

function fmtPt(p: Pt): string {
  return `(${fmtNum(p[0])}, ${fmtNum(p[1])})`;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
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
  const node = el(parent, 'text', { x, y, ...attrs });
  node.textContent = text;
  return node;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 0..1 의 전체 진행에서 [a, b] 구간의 진행. */
function span(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return (p - a) / (b - a);
}

/** 화살 (자루 + 촉) 의 손잡이. */
type ArrowHandle = { shaft: SVGLineElement; tip: SVGPolygonElement };

/** 꼬리 · 끝 픽셀 자리로 화살을 세운다. 길이가 촉보다 짧으면 촉을 줄인다. */
function setArrow(h: ArrowHandle, from: Px, to: Px): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    h.shaft.setAttribute('x1', String(from.x));
    h.shaft.setAttribute('y1', String(from.y));
    h.shaft.setAttribute('x2', String(from.x));
    h.shaft.setAttribute('y2', String(from.y));
    h.tip.setAttribute('points', '');
    return;
  }
  const ux = dx / len;
  const uy = dy / len;
  const headLen = Math.min(HEAD_LEN, len);
  const half = HEAD_HALF * (headLen / HEAD_LEN);
  const bx = to.x - ux * headLen;
  const by = to.y - uy * headLen;
  h.shaft.setAttribute('x1', String(from.x));
  h.shaft.setAttribute('y1', String(from.y));
  h.shaft.setAttribute('x2', String(bx));
  h.shaft.setAttribute('y2', String(by));
  const pts = [
    [to.x, to.y],
    [bx - uy * half, by + ux * half],
    [bx + uy * half, by - ux * half],
  ]
    .map(([x, y]) => `${(x as number).toFixed(2)},${(y as number).toFixed(2)}`)
    .join(' ');
  h.tip.setAttribute('points', pts);
}

/** 정적 그리기가 운동에 넘겨주는 손잡이. */
type Handles = {
  frame: Frame;
  /** 걸음 1 의 가로 다리와 걷는 점 */
  walkLegX: SVGLineElement | null;
  walker: SVGCircleElement | null;
  /** 지금 화살표 */
  current: {
    group: SVGGElement;
    arrow: ArrowHandle;
    legX: SVGLineElement;
    legY: SVGLineElement;
  } | null;
  /** 운동 도중 가렸다가 끝나면 정적 그리기로 돌아오는 것 (자리 글자 · 장부의 새 줄) */
  settle: Element[];
};

export const vectorAsArrowStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function frameOf(scene: VectorAsArrowScene): Frame {
      if (!scene.base) throw new Error('vector-as-arrow stage: 바탕 없이 틀을 셈할 수 없다');
      const b = scene.base.bounds;
      // 가장 바깥 좌표 둘레로 한 칸씩 여유를 둔다.
      const gxMin = b.xMin - 1;
      const gxMax = b.xMax + 1;
      const gyMin = b.yMin - 1;
      const gyMax = b.yMax + 1;
      // 눈금 수는 평면의 왼쪽 · 아래 가장자리 바깥에 둔다 — 축 위에 두면 원점의 글자와 부딪힌다.
      const planeW = W - PAD - TICK_W - PANEL_W - PANEL_GAP;
      const planeH = H - PLANE_TOP - PAD - TICK_H;
      const cell = Math.min(planeW / (gxMax - gxMin), planeH / (gyMax - gyMin), CELL_MAX);
      const left = PAD + TICK_W + (planeW - cell * (gxMax - gxMin)) / 2;
      const top = PLANE_TOP + (planeH - cell * (gyMax - gyMin)) / 2;
      return {
        cell,
        toPx: (p) => ({ x: left + (p[0] - gxMin) * cell, y: top + (gyMax - p[1]) * cell }),
      };
    }

    function drawPlane(root: Element, scene: VectorAsArrowScene, frame: Frame): void {
      if (!scene.base) throw new Error('vector-as-arrow stage: 바탕 없이 평면을 그릴 수 없다');
      const b = scene.base.bounds;
      const gxMin = b.xMin - 1;
      const gxMax = b.xMax + 1;
      const gyMin = b.yMin - 1;
      const gyMax = b.yMax + 1;
      const g = el(root, 'g', {});
      const tl = frame.toPx([gxMin, gyMax]);
      const br = frame.toPx([gxMax, gyMin]);
      el(g, 'rect', {
        x: tl.x,
        y: tl.y,
        width: br.x - tl.x,
        height: br.y - tl.y,
        fill: colors.bgSubtle,
      });
      for (let x = gxMin; x <= gxMax; x += 1) {
        const a = frame.toPx([x, gyMin]);
        const z = frame.toPx([x, gyMax]);
        el(g, 'line', { x1: a.x, y1: a.y, x2: z.x, y2: z.y, stroke: colors.border, 'stroke-width': 1 });
      }
      for (let y = gyMin; y <= gyMax; y += 1) {
        const a = frame.toPx([gxMin, y]);
        const z = frame.toPx([gxMax, y]);
        el(g, 'line', { x1: a.x, y1: a.y, x2: z.x, y2: z.y, stroke: colors.border, 'stroke-width': 1 });
      }
      // 축
      const o = scene.base.origin;
      const ax0 = frame.toPx([gxMin, o[1]]);
      const ax1 = frame.toPx([gxMax, o[1]]);
      const ay0 = frame.toPx([o[0], gyMin]);
      const ay1 = frame.toPx([o[0], gyMax]);
      el(g, 'line', { x1: ax0.x, y1: ax0.y, x2: ax1.x, y2: ax1.y, stroke: colors.textMuted, 'stroke-width': 1.5 });
      el(g, 'line', { x1: ay0.x, y1: ay0.y, x2: ay1.x, y2: ay1.y, stroke: colors.textMuted, 'stroke-width': 1.5 });
      // 눈금 수 — 칸을 세어 좌표를 읽는다
      const tick = { fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs };
      for (let x = gxMin + 1; x < gxMax; x += 1) {
        const p = frame.toPx([x, gyMin]);
        label(g, p.x, p.y + 13, fmtNum(x), { ...tick, 'text-anchor': 'middle' });
      }
      for (let y = gyMin + 1; y < gyMax; y += 1) {
        const p = frame.toPx([gxMin, y]);
        label(g, p.x - 5, p.y + 4, fmtNum(y), { ...tick, 'text-anchor': 'end' });
      }
      // 원점
      const op = frame.toPx(o);
      el(g, 'circle', { cx: op.x, cy: op.y, r: 3.5, fill: colors.text });
    }

    /** 가로 · 세로 다리 (점선) 와 칸 수. */
    function drawLeg(
      root: Element,
      from: Px,
      to: Px,
      n: number,
      side: 'below' | 'above' | 'right' | 'left',
    ): { line: SVGLineElement; count: SVGTextElement } {
      const line = el(root, 'line', {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        stroke: colors.itemComparing,
        'stroke-width': 2.5,
        'stroke-dasharray': '5 4',
        'stroke-linecap': 'butt',
      });
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      const off = { below: [0, 18], above: [0, -8], right: [9, 5], left: [-9, 5] }[side];
      const anchor = side === 'right' ? 'start' : side === 'left' ? 'end' : 'middle';
      const count = label(root, mx + (off[0] as number), my + (off[1] as number), fmtNum(n), {
        fill: colors.itemComparing,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        'font-weight': 700,
        'text-anchor': anchor,
      });
      return { line, count };
    }

    function drawArrow(root: Element, from: Px, to: Px, current: boolean): ArrowHandle {
      const color = current ? colors.primary : colors.textMuted;
      const shaft = el(root, 'line', {
        stroke: color,
        'stroke-width': current ? 3 : 2,
        'stroke-linecap': 'round',
      });
      const tip = el(root, 'polygon', { fill: color });
      const h = { shaft, tip };
      setArrow(h, from, to);
      return h;
    }

    function drawPanel(root: Element, scene: VectorAsArrowScene): Element[] {
      if (!scene.base) throw new Error('vector-as-arrow stage: 바탕 없이 장부를 그릴 수 없다');
      const x0 = W - PANEL_W;
      const settle: Element[] = [];
      label(root, x0, PLANE_TOP + 30, `${scene.base.name} = ${fmtPt(scene.base.v)}`, {
        fill: colors.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': 700,
      });
      const col = [x0, x0 + 64, x0 + 128];
      const headY = PLANE_TOP + 72;
      const muted = { fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs };
      label(root, col[0] as number, headY, t('label.tail', 'tail'), muted);
      label(root, col[1] as number, headY, t('label.head', 'head'), muted);
      label(root, col[2] as number, headY, t('label.diff', 'head − tail'), muted);
      el(root, 'line', {
        x1: x0,
        y1: headY + 7,
        x2: W - PAD / 2,
        y2: headY + 7,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const rowH = 28;
      scene.arrows.forEach((a, i) => {
        const y = headY + 30 + i * rowH;
        const isLast = i === scene.arrows.length - 1;
        const row = el(root, 'g', {});
        if (isLast) {
          el(row, 'rect', {
            x: x0 - 6,
            y: y - 17,
            width: W - PAD / 2 - x0 + 6,
            height: rowH - 4,
            rx: 4,
            fill: colors.bgSubtle,
            stroke: colors.border,
          });
        }
        const mono = { 'font-family': fonts.mono, 'font-size': fontSizes.sm };
        label(row, col[0] as number, y, fmtPt(a.tail), { ...mono, fill: colors.text });
        label(row, col[1] as number, y, fmtPt(a.head), { ...mono, fill: colors.text });
        label(row, col[2] as number, y, fmtPt(a.diff), {
          ...mono,
          fill: colors.primary,
          'font-weight': 700,
        });
        if (isLast && scene.step !== null && scene.step.kind !== 'walk-x') settle.push(row);
      });
      return settle;
    }

    function caption(scene: VectorAsArrowScene): string {
      if (!scene.base) throw new Error('vector-as-arrow stage: 바탕 없이 캡션을 셈할 수 없다');
      const step = scene.step;
      if (step === null) {
        return t('caption.start', 'Pair {pair} · start: origin {origin}', {
          pair: fmtPt(scene.base.v),
          origin: fmtPt(scene.base.origin),
        });
      }
      if (step.kind === 'walk-x') {
        if (!scene.legX) throw new Error('vector-as-arrow stage: walk-x 장면에 가로 다리가 없다');
        return t('caption.walkX', 'Horizontal: {n} · {from} → {to}', {
          n: fmtNum(scene.legX.n),
          from: fmtPt(scene.legX.from),
          to: fmtPt(scene.legX.to),
        });
      }
      const a = scene.arrows[scene.arrows.length - 1];
      if (!a) throw new Error('vector-as-arrow stage: 화살표 걸음에 화살표가 없다');
      if (step.kind === 'walk-y') {
        return t('caption.walkY', 'Vertical: {n} · {from} → {to} · arrow {tail} → {head}', {
          n: fmtNum(a.diff[1]),
          from: fmtPt(a.corner),
          to: fmtPt(a.head),
          tail: fmtPt(a.tail),
          head: fmtPt(a.head),
        });
      }
      return t('caption.place', 'Moved · tail {tail} · head {head} · head − tail = {diff}', {
        tail: fmtPt(a.tail),
        head: fmtPt(a.head),
        diff: fmtPt(a.diff),
      });
    }

    /** 자리 글자 — 지금 화살표의 꼬리 · 머리 좌표. */
    function pointLabel(root: Element, at: Px, text: string, below: boolean, settle: Element[]): void {
      settle.push(
        label(root, at.x, at.y + (below ? 18 : -10), text, {
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          stroke: colors.bg,
          'stroke-width': 3,
          'paint-order': 'stroke',
        }),
      );
    }

    function drawStatic(scene: VectorAsArrowScene): Handles | null {
      svg.textContent = '';
      if (!scene.base) return null;
      const frame = frameOf(scene);
      const settle: Element[] = [];

      label(svg, PAD, CAPTION_Y, caption(scene), {
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });

      drawPlane(svg, scene, frame);

      // 앞서 놓인 화살표 — 모양 그대로 나란하다
      const past = el(svg, 'g', {});
      scene.arrows.slice(0, -1).forEach((a) => {
        drawArrow(past, frame.toPx(a.tail), frame.toPx(a.head), false);
        const tp = frame.toPx(a.tail);
        el(past, 'circle', { cx: tp.x, cy: tp.y, r: 2.5, fill: colors.textMuted });
      });

      let walkLegX: SVGLineElement | null = null;
      let walker: SVGCircleElement | null = null;
      let current: Handles['current'] = null;

      const last = scene.arrows[scene.arrows.length - 1];
      if (!last && scene.legX) {
        // 걸음 1 — 가로 다리만 걸었다
        const leg = scene.legX;
        const upward = scene.base.v[1] >= 0;
        const drawn = drawLeg(svg, frame.toPx(leg.from), frame.toPx(leg.to), leg.n, upward ? 'above' : 'below');
        walkLegX = drawn.line;
        settle.push(drawn.count);
        const wp = frame.toPx(leg.to);
        walker = el(svg, 'circle', {
          cx: wp.x,
          cy: wp.y,
          r: 5,
          fill: colors.itemComparing,
          stroke: colors.bg,
          'stroke-width': 1.5,
        });
      }
      if (last) {
        const group = el(svg, 'g', {});
        const tp = frame.toPx(last.tail);
        const cp = frame.toPx(last.corner);
        const hp = frame.toPx(last.head);
        const upward = last.diff[1] >= 0;
        const rightward = last.diff[0] >= 0;
        const legX = drawLeg(group, tp, cp, last.diff[0], upward ? 'above' : 'below');
        const legY = drawLeg(group, cp, hp, last.diff[1], rightward ? 'right' : 'left');
        // 가로 다리는 walk-y 에서 이미 걸어 둔 것이라 그 칸 수는 가리지 않는다
        if (scene.step?.kind === 'place') settle.push(legX.count);
        settle.push(legY.count);
        const arrow = drawArrow(group, tp, hp, true);
        el(group, 'circle', {
          cx: tp.x,
          cy: tp.y,
          r: 4,
          fill: colors.bg,
          stroke: colors.primary,
          'stroke-width': 2,
        });
        pointLabel(group, tp, fmtPt(last.tail), upward, settle);
        pointLabel(group, hp, fmtPt(last.head), !upward, settle);
        current = { group, arrow, legX: legX.line, legY: legY.line };
      }

      settle.push(...drawPanel(svg, scene));
      return { frame, walkLegX, walker, current, settle };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
      });
    }

    /** 한 시계로 흘린다. 세대가 바뀌거나 거두면 멈추고 돌아온다. */
    async function run(mine: number, ms: number, frameFn: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const p = Math.min(1, (Date.now() - start) / ms);
        frameFn(p);
        if (p >= 1) return true;
        await wait(FRAME_MS);
      }
    }

    function hide(nodes: readonly Element[]): void {
      for (const n of nodes) n.setAttribute('opacity', '0');
    }

    function setLine(line: SVGLineElement, from: Px, to: Px): void {
      line.setAttribute('x1', String(from.x));
      line.setAttribute('y1', String(from.y));
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y));
    }

    async function animate(scene: VectorAsArrowScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      const { frame } = h;
      hide(h.settle);

      if (step.kind === 'walk-x') {
        const leg = scene.legX;
        if (!leg || !h.walkLegX || !h.walker) {
          throw new Error('vector-as-arrow stage: walk-x 운동의 손잡이가 없다');
        }
        const a = frame.toPx(leg.from);
        const b = frame.toPx(leg.to);
        const line = h.walkLegX;
        const walker = h.walker;
        await run(mine, MOTION_MS, (p) => {
          const e = ease(p);
          const at = { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) };
          setLine(line, a, at);
          walker.setAttribute('cx', String(at.x));
          walker.setAttribute('cy', String(at.y));
        });
        return;
      }

      const cur = h.current;
      const last = scene.arrows[scene.arrows.length - 1];
      if (!cur || !last) throw new Error('vector-as-arrow stage: 화살표 운동의 손잡이가 없다');
      const tp = frame.toPx(last.tail);
      const cp = frame.toPx(last.corner);
      const hp = frame.toPx(last.head);

      if (step.kind === 'walk-y') {
        // 가로 다리는 이미 걸었다. 세로로 걸어 머리에 닿고, 원점에서 머리까지 화살이 뻗는다.
        const walker = el(cur.group, 'circle', {
          cx: cp.x,
          cy: cp.y,
          r: 5,
          fill: colors.itemComparing,
          stroke: colors.bg,
          'stroke-width': 1.5,
        });
        setLine(cur.legY, cp, cp);
        setArrow(cur.arrow, tp, tp);
        await run(mine, MOTION_MS, (p) => {
          const w = ease(span(p, 0, 0.5));
          const at = { x: lerp(cp.x, hp.x, w), y: lerp(cp.y, hp.y, w) };
          setLine(cur.legY, cp, at);
          walker.setAttribute('cx', String(at.x));
          walker.setAttribute('cy', String(at.y));
          const g = ease(span(p, 0.5, 1));
          setArrow(cur.arrow, tp, { x: lerp(tp.x, hp.x, g), y: lerp(tp.y, hp.y, g) });
        });
        return;
      }

      // place — 원점의 화살표 자리에서 새 꼬리로 모양 그대로 미끄러진다. 닿으면 다리가 칸 수를 보인다.
      const first = scene.arrows[0];
      if (!first) throw new Error('vector-as-arrow stage: 원점의 화살표가 없다');
      const op = frame.toPx(first.tail);
      const dx = op.x - tp.x;
      const dy = op.y - tp.y;
      setLine(cur.legX, tp, tp);
      setLine(cur.legY, cp, cp);
      await run(mine, MOTION_MS, (p) => {
        const s = 1 - ease(span(p, 0, 0.65));
        cur.group.setAttribute('transform', `translate(${(dx * s).toFixed(2)},${(dy * s).toFixed(2)})`);
        const lx = ease(span(p, 0.65, 0.83));
        const ly = ease(span(p, 0.83, 1));
        setLine(cur.legX, tp, { x: lerp(tp.x, cp.x, lx), y: lerp(tp.y, cp.y, lx) });
        setLine(cur.legY, cp, { x: lerp(cp.x, hp.x, ly), y: lerp(cp.y, hp.y, ly) });
      });
    }

    async function render(
      next: VectorAsArrowScene,
      _prev: VectorAsArrowScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      if (!opts.animate || !handles || next.step === null) return;
      await animate(next, handles, mine);
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
