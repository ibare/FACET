/**
 * momentum 무대 — 시간 자취(가로 갱신 번호 · 세로 w) 위 세 구간 띠 + 바닥 줄 · 가라앉음 띠, 곁에 움직임 두 토막 막대.
 *
 * 주인공은 자취의 모양(평지에 눕는가 · 바닥 줄 위아래로 출렁이는가)이다. 갱신마다 자취가 한 칸 자라고 점이 새 w 로
 * 옮겨 가며, 막대는 앞 움직임 v 가 β·v 로 줄어든 토막(이어 받은 몫) 위에 −η·g 토막(새로 민 몫)이 쌓이는 모양으로 바뀐다.
 * v · 두 몫은 수로 찍지 않는다 (0 곁에서 -0.00 이 뜬다) — 막대 길이 · 방향으로만.
 *
 * 무대는 셈하지 않는다 — 구간 · 손실 · 두 몫 · 가장 멀리 · 가라앉음@ · 축 범위 모두 payload 로 받는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { MomentumStart, MomentumStep, Zone } from './algorithm.js';

export type MomentumStageApi = {
  start(p: MomentumStart): void;
  update(p: MomentumStep, ms: number): void;
  reset(): void;
};

const W = 760;
const H = 400;
const X0 = 64;
const X1 = 548;
const YT = 70;
const YB = 318;
const BAR_X = 652;
const BAR_W = 30;
const BAR_MID = (YT + YB) / 2;
const BAR_HALF = 118;
const NS = 'http://www.w3.org/2000/svg';

const fx = (x: number): string => x.toFixed(2);

export const momentumStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const bands = categorical(3, 'pastel');
    const isInstant = params.isInstant ?? (() => false);

    let root: SVGGElement | null = null;
    let frame: number | null = null;
    let finishAnim: (() => void) | null = null;

    type Board = {
      start: MomentumStart;
      xOf: (t: number) => number;
      yOf: (w: number) => number;
      mOf: (m: number) => number;
      points: [number, number][];
      trace: SVGPolylineElement;
      dot: SVGCircleElement;
      carried: SVGRectElement;
      pushed: SVGRectElement;
      net: SVGLineElement;
      readout: SVGTextElement;
      summary: SVGTextElement;
      caption: SVGTextElement;
      marks: SVGGElement;
      lastV: number;
    };
    let board: Board | null = null;

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (x: number, y: number, s: string, parent: Element, extra: Record<string, string | number> = {}) => {
      const node = el('text', { x, y, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, ...extra }, parent);
      node.textContent = s;
      return node;
    };

    const stopAnim = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const f = finishAnim;
      finishAnim = null;
      if (f) f();
    };

    const clear = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      finishAnim = null;
      if (root) root.remove();
      root = null;
      board = null;
    };

    params.onScrubStart?.(() => stopAnim());

    const setBar = (b: Board, carried: number, pushed: number): void => {
      const y0 = b.mOf(0);
      const y1 = b.mOf(carried);
      const y2 = b.mOf(carried + pushed);
      b.carried.setAttribute('y', String(Math.min(y0, y1)));
      b.carried.setAttribute('height', String(Math.abs(y1 - y0)));
      b.pushed.setAttribute('y', String(Math.min(y1, y2)));
      b.pushed.setAttribute('height', String(Math.abs(y2 - y1)));
      b.net.setAttribute('y1', String(y2));
      b.net.setAttribute('y2', String(y2));
    };

    const setTrace = (b: Board): void => {
      b.trace.setAttribute('points', b.points.map(([x, y]) => `${x},${y}`).join(' '));
      const last = b.points[b.points.length - 1];
      if (last === undefined) throw new Error('momentum-stage: 자취가 비었다');
      b.dot.setAttribute('cx', String(last[0]));
      b.dot.setAttribute('cy', String(last[1]));
    };

    // 평지에서 이어 받은 몫이 0 이면(β 0) w 는 서 있다 — 움직인다고 말하지 않는다. 판정은 payload 의 carried 그대로.
    const zoneCaption = (zone: Zone, carried: number): string => {
      if (zone === 'slope') return t('caption.slope', 'Slope — the new push adds to what is carried over');
      if (zone === 'flat' && carried === 0) return t('caption.flatStill', 'Plateau — g = 0, no new push · carried part 0');
      if (zone === 'flat') return t('caption.flat', 'Plateau — g = 0, only the carried part moves w');
      return t('caption.bowl', 'Bowl — the new push points toward the bottom');
    };

    const start = (p: MomentumStart): void => {
      clear();
      const g = el('g', {}, svg);
      root = g;
      const xOf = (k: number) => X0 + (k / p.steps) * (X1 - X0);
      const yOf = (w: number) => YB - (w / p.axisTop) * (YB - YT);
      const mOf = (m: number) => BAR_MID - (m / p.moveScale) * BAR_HALF;

      // 식 · 손잡이 값
      // SVG 는 빈칸을 접으므로 식 둘 · 값 둘을 따로 찍는다
      text(16, 26, 'v ← β·v − η·g', g, { 'font-size': fontSizes.lg });
      text(150, 26, 'w ← w + v', g, { 'font-size': fontSizes.lg });
      text(W - 90, 26, `β = ${String(p.beta)}`, g, { 'text-anchor': 'end', 'font-size': fontSizes.lg });
      text(W - 16, 26, `η = ${String(p.eta)}`, g, { 'text-anchor': 'end', 'font-size': fontSizes.lg });

      // 세 구간 띠
      const zones: [number, number, string][] = [
        [0, p.flatFrom, t('label.slope', 'Slope  g = −1')],
        [p.flatFrom, p.bowlFrom, t('label.flat', 'Plateau  g = 0')],
        [p.bowlFrom, p.axisTop, t('label.bowl', 'Bowl')],
      ];
      zones.forEach(([lo, hi, name], i) => {
        const fill = bands[i];
        if (fill === undefined) throw new Error('momentum-stage: 띠 색이 모자라다');
        el('rect', { x: X0, y: yOf(hi), width: X1 - X0, height: yOf(lo) - yOf(hi), fill, 'fill-opacity': 0.55 }, g);
        text(X1 - 6, yOf(lo) - 6, name, g, { 'text-anchor': 'end', fill: c.textMuted, 'font-size': fontSizes.xs });
      });

      // 가라앉음 띠 · 바닥 줄
      el('rect', {
        x: X0,
        y: yOf(p.bottom + p.settleBand),
        width: X1 - X0,
        height: yOf(p.bottom - p.settleBand) - yOf(p.bottom + p.settleBand),
        fill: c.accent,
        'fill-opacity': 0.6,
      }, g);
      el('line', { x1: X0, x2: X1, y1: yOf(p.bottom), y2: yOf(p.bottom), stroke: c.text, 'stroke-dasharray': '5 4', 'stroke-width': 1 }, g);
      text(X1 + 6, yOf(p.bottom) + 4, t('label.bottom', 'Bottom {w}', { w: String(p.bottom) }), g, { 'font-size': fontSizes.xs });

      // 축
      el('line', { x1: X0, x2: X0, y1: YT, y2: YB, stroke: c.border }, g);
      el('line', { x1: X0, x2: X1, y1: YB, y2: YB, stroke: c.border }, g);
      for (let w = 0; w <= p.axisTop + 1e-9; w += 1) {
        text(X0 - 8, yOf(w) + 4, String(w), g, { 'text-anchor': 'end', fill: c.textMuted, 'font-size': fontSizes.xs });
      }
      text(X0 - 8, YT - 12, 'w', g, { 'text-anchor': 'end', 'font-size': fontSizes.md });
      for (let k = 0; k <= p.steps; k += 10) {
        el('line', { x1: xOf(k), x2: xOf(k), y1: YB, y2: YB + 4, stroke: c.border }, g);
        text(xOf(k), YB + 16, String(k), g, { 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs });
      }
      text((X0 + X1) / 2, YB + 32, t('label.updateAxis', 'Update'), g, { 'text-anchor': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs });

      const marks = el('g', {}, g);
      const trace = el('polyline', { fill: 'none', stroke: c.primary, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
      const dot = el('circle', { r: 5, fill: c.itemComparing, stroke: c.bg, 'stroke-width': 1.5 }, g);

      // 움직임 막대
      text(BAR_X + BAR_W / 2, YT - 12, t('label.move', 'Movement v'), g, { 'text-anchor': 'middle', 'font-size': fontSizes.md });
      el('line', { x1: BAR_X - 26, x2: BAR_X + BAR_W + 26, y1: mOf(0), y2: mOf(0), stroke: c.border }, g);
      text(BAR_X - 30, mOf(0) + 4, '0', g, { 'text-anchor': 'end', fill: c.textMuted, 'font-size': fontSizes.xs });
      text(BAR_X - 30, BAR_MID - BAR_HALF + 4, '+', g, { 'text-anchor': 'end', fill: c.textMuted });
      text(BAR_X - 30, BAR_MID + BAR_HALF + 4, '−', g, { 'text-anchor': 'end', fill: c.textMuted });
      const carried = el('rect', { x: BAR_X, y: mOf(0), width: BAR_W, height: 0, fill: c.itemSorted }, g);
      const pushed = el('rect', { x: BAR_X, y: mOf(0), width: BAR_W, height: 0, fill: c.itemComparing }, g);
      const net = el('line', { x1: BAR_X - 10, x2: BAR_X + BAR_W + 10, y1: mOf(0), y2: mOf(0), stroke: c.text, 'stroke-width': 2 }, g);
      el('rect', { x: 614, y: YB + 6, width: 10, height: 10, fill: c.itemSorted }, g);
      text(630, YB + 15, t('label.carried', 'Carried β·v'), g, { 'font-size': fontSizes.xs });
      el('rect', { x: 614, y: YB + 21, width: 10, height: 10, fill: c.itemComparing }, g);
      text(630, YB + 30, t('label.pushed', 'New push −η·g'), g, { 'font-size': fontSizes.xs });

      const readout = text(16, 366, t('readout.now', 'Update {n} · w {w} · L {L}', { n: 0, w: fx(p.w0), L: fx(p.loss0) }), g, { 'font-size': fontSizes.md });
      const summary = text(W - 16, 366, '', g, { 'text-anchor': 'end', 'font-size': fontSizes.md });
      const caption = text(16, 391, t('caption.start', 'Start — w {w}, v {v}', { w: fx(p.w0), v: fx(p.v0) }), g, { fill: c.textMuted, 'font-size': fontSizes.md });

      board = {
        start: p, xOf, yOf, mOf, points: [[xOf(0), yOf(p.w0)]], trace, dot, carried, pushed, net, readout, summary, caption, marks,
        lastV: p.v0,
      };
      setTrace(board);
      setBar(board, 0, 0);
    };

    const showFinal = (b: Board, p: MomentumStep): void => {
      const s = p.summary;
      if (s === undefined) throw new Error('momentum-stage: 끝 걸음에 summary 가 없다');
      const fxp = b.xOf(s.farAt);
      const fyp = b.yOf(s.farW);
      el('circle', { cx: fxp, cy: fyp, r: 9, fill: 'none', stroke: c.danger, 'stroke-width': 2 }, b.marks);
      text(fxp, fyp - 14, t('label.far', 'Farthest {w}', { w: fx(s.farW) }), b.marks, { 'text-anchor': 'middle', 'font-size': fontSizes.xs });
      if (s.settleAt !== null) {
        const sx = b.xOf(s.settleAt);
        el('line', { x1: sx, x2: sx, y1: YT, y2: YB, stroke: c.textMuted, 'stroke-dasharray': '3 3' }, b.marks);
        text(sx, YT - 4, t('label.settle', 'Settled from update {n}', { n: s.settleAt }), b.marks, { 'text-anchor': 'middle', 'font-size': fontSizes.xs });
      }
      b.summary.textContent =
        s.overshoot === null
          ? t('summary.noOver', 'Farthest {far} · never past the bottom', { far: fx(s.farW) })
          : t('summary.over', 'Farthest {far} · overshoot {over}', { far: fx(s.farW), over: fx(s.overshoot) });
      if (s.crossAt === null) {
        b.caption.textContent = t('caption.stuck', 'Did not cross the plateau — w {w} after update {n}', { w: fx(s.endW), n: p.t });
      } else if (s.settleAt !== null) {
        b.caption.textContent = t('caption.settled', 'Crossed at update {cross}, stays in the bottom band from update {settle}', {
          cross: s.crossAt,
          settle: s.settleAt,
        });
      } else {
        b.caption.textContent = t('caption.unsettled', 'Crossed at update {cross}, not settled in the bottom band by update {n} · final w {w}', {
          cross: s.crossAt,
          n: p.t,
          w: fx(s.endW),
        });
      }
    };

    const update = (p: MomentumStep, ms: number): void => {
      const b = board;
      if (b === null) throw new Error('momentum-stage: start 전에 update 가 왔다');
      stopAnim();
      const from: [number, number] = [b.xOf(p.t - 1), b.yOf(p.wPrev)];
      const to: [number, number] = [b.xOf(p.t), b.yOf(p.w)];
      const vPrev = b.lastV;
      b.lastV = p.v;
      b.points.push([from[0], from[1]]);
      b.readout.textContent = t('readout.now', 'Update {n} · w {w} · L {L}', { n: p.t, w: fx(p.w), L: fx(p.loss) });
      b.caption.textContent = zoneCaption(p.zone, p.carried);
      if (p.final) showFinal(b, p);

      const draw = (k: number): void => {
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        b.points[b.points.length - 1] = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
        setTrace(b);
        // 앞 움직임 v 가 이어 받은 몫 β·v 로 줄고(앞 절반), 그 위에 새로 민 몫이 쌓인다(뒤 절반)
        const a = Math.min(1, k / 0.5);
        const q = Math.max(0, (k - 0.5) / 0.5);
        setBar(b, vPrev + (p.carried - vPrev) * a, p.pushed * q);
      };
      if (isInstant() || ms <= 0) {
        draw(1);
        return;
      }
      const t0 = performance.now();
      finishAnim = () => draw(1);
      const tick = (now: number): void => {
        const k = Math.min(1, (now - t0) / ms);
        draw(k);
        if (k < 1 && !isInstant()) frame = requestAnimationFrame(tick);
        else {
          if (k < 1) draw(1);
          frame = null;
          finishAnim = null;
        }
      };
      frame = requestAnimationFrame(tick);
    };

    const api: MomentumStageApi = { start, update, reset: clear };
    return {
      ...api,
      destroy: () => {
        clear();
      },
    };
  },
};
