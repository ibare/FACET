/**
 * point-add-on-curve 무대.
 *
 * 왼쪽은 좌표 평면 — 곡선 · P · Q 를 곧은 선이 **잇고**, 표지가 선을 따라 미끄러져 곡선을
 * 셋째로 **만나고**, 그 점이 x 축 너머로 **뒤집혀** 내려앉는다. 오른쪽은 걸음마다 쌓이는 셈 줄이다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { curveRhs } from './algorithm.js';
import type { PointAddBase, PointAddScene, ScenePoint } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 400;
const W = PIECE_CANVAS_W;
const MOTION_MS = 800;

const CAPTION_Y = 30;
const PLOT_TOP = 58;
const PLOT_BOTTOM = H - 18;
const PLOT_LEFT = 20;
/** 평면이 차지하는 가로 몫의 상한 — 나머지는 셈 줄 */
const PLOT_SHARE = 0.56;
const PANEL_GAP = 34;
/** 곡선 끝 · 점 둘레의 여유 (좌표 단위). 왼쪽은 점 이름표 자리를 더 둔다 */
const PAD_LEFT = 2.4;
const PAD_RIGHT = 1;
const PAD_Y = 1;

const MINUS = '−';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

/** 정수 표기 — 음수는 빼기 기호 */
function numStr(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n);
}

/** 식 안에 들어갈 수 — 음수면 괄호로 싼다 */
function paren(n: number): string {
  return n < 0 ? `(${numStr(n)})` : numStr(n);
}

/** 부호 붙은 항 — "− 7x" · "+ 10". 계수가 0 이면 빈 글자 */
function signedTerm(coef: number, suffix: string): string {
  if (coef === 0) return '';
  return `${coef < 0 ? MINUS : '+'} ${Math.abs(coef)}${suffix}`;
}

type Frame = {
  xLo: number;
  xHi: number;
  yLim: number;
  scale: number;
  ox: number;
  oy: number;
  plotW: number;
};

function makeFrame(base: PointAddBase): Frame {
  const xLo = base.frame.xMin - PAD_LEFT;
  const xHi = base.frame.xMax + PAD_RIGHT;
  const yLim = base.frame.yAbs + PAD_Y;
  const plotH = PLOT_BOTTOM - PLOT_TOP;
  const scale = Math.min(plotH / (2 * yLim), (W * PLOT_SHARE) / (xHi - xLo));
  const plotW = (xHi - xLo) * scale;
  return { xLo, xHi, yLim, scale, ox: PLOT_LEFT - xLo * scale, oy: (PLOT_TOP + PLOT_BOTTOM) / 2, plotW };
}

function sx(f: Frame, x: number): number {
  return r2(f.ox + x * f.scale);
}
function sy(f: Frame, y: number): number {
  return r2(f.oy - y * f.scale);
}

/** 곡선 한 가지(위 또는 아래)를 근에서 시작해 창 끝(또는 y 한계)까지 표본으로 잇는다. */
function curvePaths(base: PointAddBase, f: Frame): string[] {
  const { a, b, roots } = base;
  const out: string[] = [];
  // f(x) ≥ 0 인 구간: 근 사이에서 부호로 가른다
  const edges = [...roots];
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i < edges.length; i += 1) {
    const lo = edges[i];
    if (lo === undefined) throw new Error('point-add-on-curve 무대: 근이 비었다');
    const hi = Math.min(edges[i + 1] ?? f.xHi, f.xHi);
    if (!(hi > lo)) continue;
    if (curveRhs(a, b, (lo + hi) / 2) > 0) intervals.push([lo, hi]);
  }
  if (intervals.length === 0) throw new Error('point-add-on-curve 무대: 그릴 곡선 구간이 없다');
  const N = 240;
  for (const [lo, hi] of intervals) {
    for (const sign of [1, -1]) {
      const pts: string[] = [];
      let prev: { x: number; y: number } | null = null;
      for (let i = 0; i <= N; i += 1) {
        const x = lo + ((hi - lo) * i) / N;
        const v = Math.max(0, curveRhs(a, b, x));
        const y = sign * Math.sqrt(v);
        if (Math.abs(y) > f.yLim) {
          if (prev !== null) {
            // y 한계에서 끊는다 — 앞 표본과 이 표본 사이를 곧게 좁힌다
            const lim = sign * f.yLim;
            const k = (lim - prev.y) / (y - prev.y);
            const xe = prev.x + (x - prev.x) * k;
            pts.push(`${sx(f, xe)},${sy(f, lim)}`);
          }
          break;
        }
        pts.push(`${sx(f, x)},${sy(f, y)}`);
        prev = { x, y };
      }
      if (pts.length > 1) out.push(`M${pts.join(' L')}`);
    }
  }
  return out;
}

/** 선 y = λx + c 를 창 안으로 자른 두 끝 (좌표 단위) */
function clipLine(lambda: number, c: number, f: Frame): [ScenePoint, ScenePoint] {
  let lo = f.xLo;
  let hi = f.xHi;
  if (lambda !== 0) {
    const xa = (-f.yLim - c) / lambda;
    const xb = (f.yLim - c) / lambda;
    lo = Math.max(lo, Math.min(xa, xb));
    hi = Math.min(hi, Math.max(xa, xb));
  }
  if (!(hi > lo)) throw new Error('point-add-on-curve 무대: 잇는 선이 창 안에 없다');
  return [
    { x: lo, y: lambda * lo + c },
    { x: hi, y: lambda * hi + c },
  ];
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
}

type Handles = {
  line: SVGLineElement | null;
  third: SVGCircleElement | null;
  thirdLabel: SVGTextElement | null;
  guide: SVGLineElement | null;
  sumDot: SVGCircleElement | null;
  sumLabel: SVGTextElement | null;
  frame: Frame | null;
};

export const pointAddOnCurveStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const bodyPx = parseFloat(fontSizes.md);
    const smallPx = parseFloat(fontSizes.sm);
    const rowH = Math.round(bodyPx * 1.65);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function drawStatic(scene: PointAddScene): Handles {
      svg.textContent = '';
      const h: Handles = {
        line: null,
        third: null,
        thirdLabel: null,
        guide: null,
        sumDot: null,
        sumLabel: null,
        frame: null,
      };
      const base = scene.base;
      if (base === null) return h;
      const f = makeFrame(base);
      h.frame = f;
      const { p, q } = base;
      const sumName = t('label.sumName', '{p} + {q}', { p: p.name, q: q.name });

      // 캡션 — 지금 일어나는 일
      let caption: string;
      switch (scene.step) {
        case 'start':
          caption = t('caption.start', 'Two points on the curve: {p} and {q}', { p: p.name, q: q.name });
          break;
        case 'connect':
          caption = t('caption.connect', 'A straight line joins {p} and {q}', { p: p.name, q: q.name });
          break;
        case 'meet':
          caption = t('caption.meet', 'The line meets the curve a third time');
          break;
        case 'flip':
          caption = t('caption.flip', 'Flip that point across the x axis: {sum}', { sum: sumName });
          break;
      }
      el('text', {
        x: PLOT_LEFT,
        y: CAPTION_Y,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-weight': 600,
      }, svg).textContent = caption;

      // 좌표 평면 — 축
      const plot = el('g', {}, svg);
      const left = sx(f, f.xLo);
      const right = sx(f, f.xHi);
      el('line', { x1: left, y1: sy(f, 0), x2: right, y2: sy(f, 0), stroke: colors.textMuted, 'stroke-width': 1.2 }, plot);
      el('line', {
        x1: sx(f, 0),
        y1: sy(f, f.yLim),
        x2: sx(f, 0),
        y2: sy(f, -f.yLim),
        stroke: colors.border,
        'stroke-width': 1,
      }, plot);
      for (let x = Math.ceil(f.xLo); x <= Math.floor(f.xHi); x += 1) {
        if (x === 0) continue;
        el('line', { x1: sx(f, x), y1: sy(f, 0) - 3, x2: sx(f, x), y2: sy(f, 0) + 3, stroke: colors.border }, plot);
      }
      for (let y = -Math.floor(f.yLim); y <= Math.floor(f.yLim); y += 1) {
        if (y === 0) continue;
        el('line', { x1: sx(f, 0) - 3, y1: sy(f, y), x2: sx(f, 0) + 3, y2: sy(f, y), stroke: colors.border }, plot);
      }
      el('text', {
        x: right - 2,
        y: sy(f, 0) - 6,
        'text-anchor': 'end',
        fill: colors.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-style': 'italic',
      }, plot).textContent = 'x';

      // 곡선
      for (const d of curvePaths(base, f)) {
        el('path', { d, fill: 'none', stroke: colors.text, 'stroke-width': 2, 'stroke-linejoin': 'round' }, plot);
      }

      // 잇는 선
      if (scene.line !== null) {
        const [e0, e1] = clipLine(scene.line.lambda, scene.line.intercept, f);
        h.line = el('line', {
          x1: sx(f, e0.x),
          y1: sy(f, e0.y),
          x2: sx(f, e1.x),
          y2: sy(f, e1.y),
          stroke: colors.itemComparing,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }, plot);
      }

      // 뒤집기의 자취 — 셋째 점에서 P + Q 까지 세로 점선
      if (scene.sum !== null) {
        h.guide = el('line', {
          x1: sx(f, scene.sum.from.x),
          y1: sy(f, scene.sum.from.y),
          x2: sx(f, scene.sum.to.x),
          y2: sy(f, scene.sum.to.y),
          stroke: colors.textMuted,
          'stroke-width': 1.4,
          'stroke-dasharray': '4 4',
        }, plot);
      }

      // P · Q
      const pointLabel = (name: string, x: number, y: number): string =>
        t('label.point', '{name} ({x}, {y})', { name, x: numStr(x), y: numStr(y) });
      // 이름표는 점의 오른쪽 아래(곡선 고리 안쪽). 평면 오른쪽 끝을 넘으면 왼쪽 위로
      const plotRight = PLOT_LEFT + f.plotW;
      for (const pt of [p, q]) {
        const label = pointLabel(pt.name, pt.x, pt.y);
        const px = sx(f, pt.x);
        const py = sy(f, pt.y);
        el('circle', { cx: px, cy: py, r: 5.5, fill: colors.primary, stroke: colors.bg, 'stroke-width': 1.5 }, plot);
        const overflow = px + 9 + label.length * smallPx * 0.62 > plotRight;
        el('text', {
          x: overflow ? px - 10 : px + 9,
          y: overflow ? py - 8 : py + 28,
          'text-anchor': overflow ? 'end' : 'start',
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
        }, plot).textContent = label;
      }

      // 셋째 점 — 속이 빈 고리 (뒤집힌 뒤에도 자리로 남는다)
      if (scene.third !== null) {
        const th = scene.third;
        h.third = el('circle', {
          cx: sx(f, th.x),
          cy: sy(f, th.y),
          r: 6.5,
          fill: colors.bg,
          stroke: colors.itemComparing,
          'stroke-width': 2.2,
        }, plot);
        h.thirdLabel = el('text', {
          x: sx(f, th.x) - 12,
          y: sy(f, th.y) + 5,
          'text-anchor': 'end',
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        }, plot);
        h.thirdLabel.textContent = t('label.coord', '({x}, {y})', { x: numStr(th.x), y: numStr(th.y) });
      }

      // P + Q
      if (scene.sum !== null) {
        const s = scene.sum.to;
        h.sumDot = el('circle', {
          cx: sx(f, s.x),
          cy: sy(f, s.y),
          r: 7,
          fill: colors.accent,
          stroke: colors.text,
          'stroke-width': 1.8,
        }, plot);
        h.sumLabel = el('text', {
          x: sx(f, s.x) - 12,
          y: sy(f, s.y) + 5,
          'text-anchor': 'end',
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 700,
        }, plot);
        h.sumLabel.textContent = pointLabel(sumName, s.x, s.y);
      }

      // 셈 줄 — 걸음마다 한 묶음씩 쌓인다. 이번 걸음 묶음만 진하게
      const panelX = PLOT_LEFT + f.plotW + PANEL_GAP;
      let rowY = PLOT_TOP + bodyPx;
      const panel = el('g', {}, svg);
      const row = (text: string, now: boolean, weight = 400): void => {
        el('text', {
          x: panelX,
          y: rowY,
          fill: now ? colors.text : colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': weight,
        }, panel).textContent = text;
        rowY += rowH;
      };
      const gap = (): void => {
        rowY += Math.round(smallPx * 0.8);
      };

      const nowStart = scene.step === 'start';
      row(t('calc.curve', 'y² = x³ {ax} {b}', { ax: signedTerm(base.a, 'x'), b: signedTerm(base.b, '') }), nowStart);
      row(t('calc.point', '{name} = ({x}, {y})', { name: p.name, x: numStr(p.x), y: numStr(p.y) }), nowStart);
      row(t('calc.point', '{name} = ({x}, {y})', { name: q.name, x: numStr(q.x), y: numStr(q.y) }), nowStart);

      if (scene.line !== null) {
        gap();
        row(
          t('calc.slope', 'λ = ({y2} − {y1}) / ({x2} − {x1}) = {slope}', {
            y2: numStr(q.y),
            y1: paren(p.y),
            x2: numStr(q.x),
            x1: paren(p.x),
            slope: numStr(scene.line.lambda),
          }),
          scene.step === 'connect',
        );
      }
      if (scene.line !== null && scene.third !== null) {
        const now = scene.step === 'meet';
        gap();
        row(
          t('calc.x3', 'x = {slope}² − {x1} − {x2} = {x3}', {
            slope: paren(scene.line.lambda),
            x1: paren(p.x),
            x2: paren(q.x),
            x3: numStr(scene.third.x),
          }),
          now,
        );
        row(
          t('calc.y3', 'y = {slope} · ({x3} − {x1}) + {y1} = {y}', {
            slope: paren(scene.line.lambda),
            x3: numStr(scene.third.x),
            x1: paren(p.x),
            y1: paren(p.y),
            y: numStr(scene.third.y),
          }),
          now,
        );
      }
      if (scene.sum !== null) {
        const s = scene.sum;
        const now = scene.step === 'flip';
        gap();
        row(t('calc.point', '{name} = ({x}, {y})', { name: sumName, x: numStr(s.to.x), y: numStr(s.to.y) }), now, 700);
        row(t('calc.checkLeft', 'y² = {y}² = {lhs}', { y: paren(s.to.y), lhs: numStr(s.lhs) }), now);
        row(
          t('calc.checkRight', 'x³ {ax} {b} = {x}³ {axv} {b} = {rhs}', {
            ax: signedTerm(base.a, 'x'),
            b: signedTerm(base.b, ''),
            x: paren(s.to.x),
            axv: signedTerm(base.a, `·${paren(s.to.x)}`),
            rhs: numStr(s.rhs),
          }),
          now,
        );
      }
      return h;
    }

    function tween(mine: number, ms: number, onFrame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let start: number | null = null;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          if (start === null) start = now;
          const u = Math.min(1, (now - start) / ms);
          onFrame(ease(u));
          if (u >= 1) {
            done();
            return;
          }
          const id = requestAnimationFrame((ts) => {
            frames.delete(id);
            tick(ts);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((ts) => {
          frames.delete(id);
          tick(ts);
        });
        frames.add(id);
      });
    }

    function need<T>(v: T | null, what: string): T {
      if (v === null) throw new Error(`point-add-on-curve 무대: ${what} 손잡이가 없다`);
      return v;
    }

    async function animateConnect(mine: number, scene: PointAddScene, h: Handles): Promise<void> {
      const base = need(scene.base, '바탕');
      const ln = need(scene.line, '잇는 선 장면');
      const f = need(h.frame, '범위');
      const line = need(h.line, '잇는 선');
      const [e0, e1] = clipLine(ln.lambda, ln.intercept, f);
      const { p, q } = base;
      const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
      // 앞 절반: P 에서 Q 로 긋는다 · 뒤 절반: 두 끝이 창 끝까지 뻗는다
      const setAt = (u: number): void => {
        let a0: ScenePoint;
        let a1: ScenePoint;
        if (u < 0.55) {
          const k = u / 0.55;
          a0 = p;
          a1 = { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) };
        } else {
          const k = (u - 0.55) / 0.45;
          const lowEnd = p.x < q.x ? e0 : e1;
          const highEnd = p.x < q.x ? e1 : e0;
          a0 = { x: lerp(p.x, lowEnd.x, k), y: lerp(p.y, lowEnd.y, k) };
          a1 = { x: lerp(q.x, highEnd.x, k), y: lerp(q.y, highEnd.y, k) };
        }
        line.setAttribute('x1', String(sx(f, a0.x)));
        line.setAttribute('y1', String(sy(f, a0.y)));
        line.setAttribute('x2', String(sx(f, a1.x)));
        line.setAttribute('y2', String(sy(f, a1.y)));
      };
      setAt(0);
      await tween(mine, MOTION_MS, setAt);
    }

    async function animateMeet(mine: number, scene: PointAddScene, h: Handles): Promise<void> {
      const base = need(scene.base, '바탕');
      const ln = need(scene.line, '잇는 선 장면');
      const th = need(scene.third, '셋째 점 장면');
      const f = need(h.frame, '범위');
      const ring = need(h.third, '셋째 점');
      const label = need(h.thirdLabel, '셋째 점 이름표');
      // 표지는 Q 에서 출발해 선을 따라 P 를 지나 셋째 점까지 미끄러진다
      const x0 = base.q.x;
      label.setAttribute('opacity', '0');
      const setAt = (u: number): void => {
        const x = x0 + (th.x - x0) * u;
        ring.setAttribute('cx', String(sx(f, x)));
        ring.setAttribute('cy', String(sy(f, ln.lambda * x + ln.intercept)));
      };
      setAt(0);
      await tween(mine, MOTION_MS, setAt);
    }

    async function animateFlip(mine: number, scene: PointAddScene, h: Handles): Promise<void> {
      const s = need(scene.sum, 'P + Q 장면');
      const f = need(h.frame, '범위');
      const dot = need(h.sumDot, 'P + Q 점');
      const guide = need(h.guide, '뒤집기 점선');
      const label = need(h.sumLabel, 'P + Q 이름표');
      label.setAttribute('opacity', '0');
      // 점이 셋째 점 자리에서 x 축을 넘어 반대편으로 옮겨 앉는다
      const setAt = (u: number): void => {
        const y = s.from.y + (s.to.y - s.from.y) * u;
        dot.setAttribute('cy', String(sy(f, y)));
        guide.setAttribute('y2', String(sy(f, y)));
      };
      setAt(0);
      await tween(mine, MOTION_MS, setAt);
    }

    return {
      render(next: PointAddScene, prev: PointAddScene | null, opts: { animate: boolean }): Promise<void> | void {
        if (destroyed) return;
        const mine = (gen += 1);
        const h = drawStatic(next);
        const moved = prev === null || prev.step !== next.step;
        if (!opts.animate || !moved) return;
        let motion: Promise<void>;
        switch (next.step) {
          case 'start':
            return;
          case 'connect':
            motion = animateConnect(mine, next, h);
            break;
          case 'meet':
            motion = animateMeet(mine, next, h);
            break;
          case 'flip':
            motion = animateFlip(mine, next, h);
            break;
        }
        return motion.then(() => {
          if (destroyed || mine !== gen) return;
          drawStatic(next);
        });
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
