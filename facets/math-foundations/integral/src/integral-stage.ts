/**
 * integral 무대 — 왼쪽은 곡선 · 할선 · 넓이 조각, 오른쪽은 두 셈의 추정 · 오차 · 견주기.
 *
 * 운동 (재생 속도를 따른다 — projector 가 길이를 넘긴다):
 *   - 할선: 두 끝이 곡선 표본을 따라 새 자리로 미끄러지고, 축 끝까지 늘인 할선이 따라 돈다
 *   - 조각: 앞 판의 조각 틀에서 새 틀로 갈라지거나(폭을 줄임) 둘씩 합쳐진다(폭을 키움).
 *           재는 점이 조각 안에서 미끄러지고 높이가 따라 오르내린다
 *   - 합:   조각이 왼쪽부터 차례로 채워지며 합 글자가 partials 를 따라 오른다
 *   - 견주기: 폭 2h 의 오차 막대가 폭 h 의 오차 막대로 줄어든다
 *
 * 무대는 f 를 셈하지 않는다. 곡선 위의 자리는 init 의 곡선 표본 사이를 보간하고, 조각 높이 · 할선 · 합 ·
 * 오차 · 비 · 막대 축척은 payload 로 받는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 470;
// 그림 판
const PL = 52;
const PR = 420;
const PT = 22;
const PB = 396;
// 읽기 판
const RX = 452;
const RR = 706;
const BAR_X = 516;
const BAR_W = 120;
const CAPTION_Y = 446;

export type Pt = { x: number; y: number };
export type Seg = { x0: number; y0: number; x1: number; y1: number };

export type InitView = {
  rule: number;
  h: number;
  n: number;
  a: number;
  fa: number;
  lo: number;
  hi: number;
  terms: number[];
  axis: { xMin: number; xMax: number; yMin: number; yMax: number; xTicks: number[]; yTicks: number[] };
  curveX: number[];
  curveY: number[];
};
export type SecantView = {
  rule: number;
  h: number;
  p: Pt;
  q: Pt;
  line: Seg;
  tangent: Seg;
  estimate: number;
  error: number;
  trueSlope: number;
};
export type StripsView = { rule: number; n: number; w: number; x0s: number[]; sx: number[]; sy: number[] };
export type SumView = { n: number; partials: number[]; estimate: number; error: number; trueArea: number };
export type CompareView = {
  h: number;
  h2: number | null;
  slopeError: number;
  areaError: number;
  slopeError2: number | null;
  areaError2: number | null;
  slopeRatio: number | null;
  areaRatio: number | null;
  barMax: number;
};

export type IntegralStage = {
  begin(p: InitView): void;
  showSecant(p: SecantView, ms: number): void;
  showStrips(p: StripsView, ms: number): void;
  showSum(p: SumView, ms: number): void;
  showCompare(p: CompareView, ms: number): void;
  reset(): void;
  destroy(): void;
};

/**
 * 표시 도우미 — 반올림은 JS `toFixed` 한 곳에서. 빼기는 `−`(U+2212), 반올림한 글자가 0 이면 부호를 뗀다.
 * 정수는 정수로 (`digits` 를 주지 않으면 정수만 받는다).
 */
export function formatNumber(x: number, digits?: number): string {
  if (!Number.isFinite(x)) throw new Error(`integral: 표시할 수 없는 값 ${x}`);
  let s: string;
  if (digits === undefined) {
    if (!Number.isInteger(x)) throw new Error(`integral: 정수 자리에 실수 ${x}`);
    s = String(x);
  } else {
    s = x.toFixed(digits);
  }
  if (Number(s) === 0) s = s.replace('-', '');
  return s.replace('-', '−');
}

/** 폭 표시 — 1차 데이터의 글자 그대로 (1 · 1/2 · 1/4 …). */
export function formatWidth(h: number): string {
  if (Number.isInteger(h)) return formatNumber(h);
  const inv = 1 / h;
  if (!Number.isInteger(inv)) throw new Error(`integral: 폭 ${h} 를 1/n 꼴로 적을 수 없다`);
  return `1/${inv}`;
}

/** 축 눈금 글자 — 정수는 정수로, 아니면 있는 그대로. */
function formatTick(x: number): string {
  return Number.isInteger(x) ? formatNumber(x) : String(x).replace('-', '−');
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** 평평한 항 목록 → `y = x³` 같은 식 글자. */
function formatPoly(terms: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < terms.length; i += 2) {
    const c = terms[i];
    const p = terms[i + 1];
    if (c === undefined || p === undefined) throw new Error('integral: 항 목록이 비었다');
    if (c === 0) continue;
    const mag = Math.abs(c);
    const xs = p === 0 ? '' : p === 1 ? 'x' : `x${[...String(p)].map((d) => SUP[d]).join('')}`;
    const body = xs === '' ? String(mag) : mag === 1 ? xs : `${mag}${xs}`;
    if (parts.length === 0) parts.push(c < 0 ? `−${body}` : body);
    else parts.push(c < 0 ? `− ${body}` : `+ ${body}`);
  }
  return `y = ${parts.length === 0 ? '0' : parts.join(' ')}`;
}

/** 마운트마다 자르개 id 를 가른다 (한 문서에 둘 이상 뜰 때). */
let mountSerial = 0;

const ease = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

type StripGeom = { x0: number; x1: number; sx: number; sy: number };
type StripEls = { frame: SVGRectElement; fill: SVGRectElement; dot: SVGCircleElement };

export const integralStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const t = params.t ?? makeTranslator(params.locale);
    const pal = getColors(params.theme);
    const [slopeColor, areaColor] = categorical(2, 'deep');
    if (slopeColor === undefined || areaColor === undefined) throw new Error('integral: 범주 색이 없다');
    const isInstant = params.isInstant ?? (() => false);
    const SM = parseFloat(fontSizes.sm);
    const XS = parseFloat(fontSizes.xs);

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (x: number, y: number, s: string, parent: Element, opts: Record<string, string | number> = {}): SVGTextElement => {
      const node = el('text', { x, y, 'font-family': fonts.body, 'font-size': SM, fill: pal.text, ...opts }, parent);
      node.textContent = s;
      return node;
    };

    // 그림판을 벗어나는 할선 · 접선을 자른다
    const defs = el('defs', {}, svg);
    mountSerial += 1;
    const clipId = `integral-clip-${mountSerial}`;
    const clip = el('clipPath', { id: clipId }, defs);
    el('rect', { x: PL, y: PT, width: PR - PL, height: PB - PT }, clip);

    const gBack = el('g', {}, svg);
    const gStrips = el('g', {}, svg);
    const gCurve = el('g', {}, svg);
    const gLines = el('g', { 'clip-path': `url(#${clipId})` }, svg);
    const gDots = el('g', {}, svg);
    const gPanel = el('g', {}, svg);
    const caption = text(20, CAPTION_Y, '', svg, { fill: pal.text });

    // ── 상태 ──
    let axis: InitView['axis'] | null = null;
    let curveX: number[] = [];
    let curveY: number[] = [];
    let pointA: Pt | null = null;
    let secant: { p: Pt; q: Pt; line: Seg } | null = null;
    let secantEls: { line: SVGLineElement; chord: SVGLineElement; p: SVGCircleElement; q: SVGCircleElement } | null = null;
    let tangentEl: SVGLineElement | null = null;
    let strips: StripGeom[] = [];
    let stripEls: StripEls[] = [];
    let destroyed = false;

    // ── 운동 ──
    const frames = new Map<string, number>();
    const finishers = new Map<string, () => void>();
    const finish = (key: string): void => {
      const id = frames.get(key);
      if (id !== undefined) cancelAnimationFrame(id);
      frames.delete(key);
      const fin = finishers.get(key);
      finishers.delete(key);
      if (fin) fin();
    };
    const finishAll = (): void => {
      for (const key of [...finishers.keys()]) finish(key);
    };
    const cancelAll = (): void => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
      finishers.clear();
    };
    const tween = (key: string, ms: number, draw: (u: number) => void): void => {
      finish(key);
      if (ms <= 0 || destroyed || isInstant()) {
        draw(1);
        return;
      }
      const t0 = performance.now();
      finishers.set(key, () => draw(1));
      const step = (now: number): void => {
        const u = Math.min(1, (now - t0) / ms);
        if (u >= 1) {
          frames.delete(key);
          finishers.delete(key);
          draw(1);
          return;
        }
        draw(ease(u));
        frames.set(key, requestAnimationFrame(step));
      };
      frames.set(key, requestAnimationFrame(step));
    };
    params.onScrubStart?.(() => finishAll());

    // ── 좌표 ──
    const needAxis = (): InitView['axis'] => {
      if (!axis) throw new Error('integral: init 전에 그리라는 요청이 왔다');
      return axis;
    };
    const X = (x: number): number => {
      const ax = needAxis();
      return PL + ((x - ax.xMin) / (ax.xMax - ax.xMin)) * (PR - PL);
    };
    const Y = (y: number): number => {
      const ax = needAxis();
      return PB - ((y - ax.yMin) / (ax.yMax - ax.yMin)) * (PB - PT);
    };
    /** 곡선 표본 사이 보간 — 미끄러지는 점이 곡선을 따라가게 (무대는 f 를 셈하지 않는다). */
    const onCurve = (x: number): number => {
      const n = curveX.length;
      const first = curveX[0];
      const last = curveX[n - 1];
      if (first === undefined || last === undefined || x < first - 1e-12 || x > last + 1e-12) throw new Error(`integral: 곡선 표본 밖의 x ${x}`);
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        const xm = curveX[mid];
        if (xm === undefined) throw new Error('integral: 곡선 표본이 비었다');
        if (xm <= x) lo = mid;
        else hi = mid;
      }
      const x0 = curveX[lo];
      const x1 = curveX[hi];
      const y0 = curveY[lo];
      const y1 = curveY[hi];
      if (x0 === undefined || x1 === undefined || y0 === undefined || y1 === undefined) throw new Error('integral: 곡선 표본이 비었다');
      return x1 === x0 ? y0 : lerp(y0, y1, (x - x0) / (x1 - x0));
    };

    // ── 읽기 판 ──
    type Row = { value: SVGTextElement };
    const makeRow = (y: number, labelKey: 'estimate' | 'error' | 'true'): Row => {
      const label =
        labelKey === 'estimate'
          ? t('label.estimate', 'Estimate')
          : labelKey === 'error'
            ? t('label.error', 'Error')
            : t('label.trueValue', 'True value');
      text(RX + 12, y, label, gPanel, { fill: pal.textMuted });
      return { value: text(RR, y, '', gPanel, { 'text-anchor': 'end', 'font-family': fonts.mono }) };
    };
    text(RX, 34, t('label.slope', 'Slope'), gPanel, { 'font-weight': 600, fill: slopeColor });
    const slopeEst = makeRow(56, 'estimate');
    const slopeErr = makeRow(76, 'error');
    const slopeTrue = makeRow(96, 'true');
    text(RX, 132, t('label.area', 'Area'), gPanel, { 'font-weight': 600, fill: areaColor });
    const areaEst = makeRow(154, 'estimate');
    const areaErr = makeRow(174, 'error');
    const areaTrue = makeRow(194, 'true');
    el('line', { x1: RX, y1: 212, x2: RR, y2: 212, stroke: pal.border }, gPanel);
    text(RX, 232, t('label.compare', 'Error, width 2h → h'), gPanel, { 'font-weight': 600 });

    type CompareRow = {
      ratio: SVGTextElement;
      wide: { label: SVGTextElement; bar: SVGRectElement; value: SVGTextElement };
      narrow: { label: SVGTextElement; bar: SVGRectElement; value: SVGTextElement };
    };
    const makeCompare = (y: number, title: string, color: string): CompareRow => {
      text(RX, y, title, gPanel, { fill: color });
      text(RR - 44, y, t('label.ratio', 'Ratio'), gPanel, { 'text-anchor': 'end', fill: pal.textMuted });
      const ratio = text(RR, y, '', gPanel, { 'text-anchor': 'end', 'font-family': fonts.mono });
      const line = (yy: number, solid: boolean) => ({
        label: text(RX + 12, yy + 10, '', gPanel, { 'font-size': XS, fill: pal.textMuted }),
        bar: el(
          'rect',
          solid
            ? { x: BAR_X, y: yy, width: 0, height: 12, fill: color }
            : { x: BAR_X, y: yy, width: 0, height: 12, fill: 'none', stroke: pal.ghostOutline, 'stroke-dasharray': '3 2' },
          gPanel,
        ),
        value: text(RR, yy + 10, '', gPanel, { 'text-anchor': 'end', 'font-size': XS, 'font-family': fonts.mono }),
      });
      return { ratio, wide: line(y + 8, false), narrow: line(y + 26, true) };
    };
    const cmpSlope = makeCompare(266, t('label.slopeError', 'Slope error'), slopeColor);
    const cmpArea = makeCompare(330, t('label.areaError', 'Area error'), areaColor);

    const setText = (node: SVGTextElement, s: string): void => {
      node.textContent = s;
    };

    const clearConclusions = (): void => {
      for (const r of [slopeEst, slopeErr, slopeTrue, areaEst, areaErr, areaTrue]) setText(r.value, '');
      for (const c of [cmpSlope, cmpArea]) {
        setText(c.ratio, '');
        for (const side of [c.wide, c.narrow]) {
          setText(side.label, '');
          setText(side.value, '');
          side.bar.setAttribute('width', '0');
        }
      }
      for (const s of stripEls) {
        s.fill.setAttribute('height', '0');
        s.fill.setAttribute('y', String(PB));
      }
      if (tangentEl) {
        tangentEl.remove();
        tangentEl = null;
      }
    };

    // ── 조각 ──
    const drawStrip = (els: StripEls, g: StripGeom): void => {
      const y0 = Y(0);
      const yt = Y(g.sy);
      const left = X(g.x0);
      const wpx = Math.max(0, X(g.x1) - left);
      els.frame.setAttribute('x', String(left));
      els.frame.setAttribute('width', String(wpx));
      els.frame.setAttribute('y', String(Math.min(y0, yt)));
      els.frame.setAttribute('height', String(Math.abs(y0 - yt)));
      els.dot.setAttribute('cx', String(X(g.sx)));
      els.dot.setAttribute('cy', String(yt));
      els.dot.setAttribute('r', String(Math.max(1.4, Math.min(3.5, wpx / 3))));
    };
    const makeStripEls = (): StripEls => ({
      fill: el('rect', { x: 0, y: PB, width: 0, height: 0, fill: areaColor, 'fill-opacity': 0.35 }, gStrips),
      frame: el('rect', { x: 0, y: PB, width: 0, height: 0, fill: 'none', stroke: areaColor, 'stroke-width': 1 }, gStrips),
      dot: el('circle', { cx: 0, cy: PB, r: 2, fill: areaColor }, gDots),
    });
    const removeStripEls = (s: StripEls): void => {
      s.fill.remove();
      s.frame.remove();
      s.dot.remove();
    };

    // ── 할선 ──
    const drawSecant = (s: { p: Pt; q: Pt; line: Seg }): void => {
      if (!secantEls) {
        secantEls = {
          line: el('line', { stroke: slopeColor, 'stroke-width': 1.5 }, gLines),
          chord: el('line', { stroke: slopeColor, 'stroke-width': 3.5, 'stroke-linecap': 'round' }, gLines),
          p: el('circle', { r: 4.5, fill: pal.bg, stroke: slopeColor, 'stroke-width': 2 }, gDots),
          q: el('circle', { r: 4.5, fill: pal.bg, stroke: slopeColor, 'stroke-width': 2 }, gDots),
        };
      }
      const e = secantEls;
      e.line.setAttribute('x1', String(X(s.line.x0)));
      e.line.setAttribute('y1', String(Y(s.line.y0)));
      e.line.setAttribute('x2', String(X(s.line.x1)));
      e.line.setAttribute('y2', String(Y(s.line.y1)));
      e.chord.setAttribute('x1', String(X(s.p.x)));
      e.chord.setAttribute('y1', String(Y(s.p.y)));
      e.chord.setAttribute('x2', String(X(s.q.x)));
      e.chord.setAttribute('y2', String(Y(s.q.y)));
      e.p.setAttribute('cx', String(X(s.p.x)));
      e.p.setAttribute('cy', String(Y(s.p.y)));
      e.q.setAttribute('cx', String(X(s.q.x)));
      e.q.setAttribute('cy', String(Y(s.q.y)));
    };

    const wipeAll = (): void => {
      cancelAll();
      while (gBack.firstChild) gBack.firstChild.remove();
      while (gStrips.firstChild) gStrips.firstChild.remove();
      while (gCurve.firstChild) gCurve.firstChild.remove();
      while (gLines.firstChild) gLines.firstChild.remove();
      while (gDots.firstChild) gDots.firstChild.remove();
      secantEls = null;
      tangentEl = null;
      secant = null;
      strips = [];
      stripEls = [];
      axis = null;
      curveX = [];
      curveY = [];
      pointA = null;
      clearConclusions();
      setText(caption, '');
    };

    const api: IntegralStage & ViewInstance = {
      begin(p) {
        // 앞 판의 운동을 끝 자리로 붙이고, 결론(글자 · 합 채움 · 접선)은 걷는다. 자리(할선 · 조각 틀)는 남긴다
        finishAll();
        clearConclusions();
        axis = p.axis;
        curveX = p.curveX;
        curveY = p.curveY;
        pointA = { x: p.a, y: p.fa };
        // 바탕은 들어올 때마다 비우고 다시 짓는다 (멱등)
        while (gBack.firstChild) gBack.firstChild.remove();
        while (gCurve.firstChild) gCurve.firstChild.remove();
        const ax = p.axis;
        for (const yv of ax.yTicks) {
          el('line', { x1: PL, y1: Y(yv), x2: PR, y2: Y(yv), stroke: pal.border }, gBack);
          text(PL - 6, Y(yv) + 4, formatTick(yv), gBack, { 'text-anchor': 'end', 'font-size': XS, fill: pal.textMuted });
        }
        for (const xv of ax.xTicks) {
          el('line', { x1: X(xv), y1: PB, x2: X(xv), y2: PB + 4, stroke: pal.textMuted }, gBack);
          text(X(xv), PB + 16, formatTick(xv), gBack, { 'text-anchor': 'middle', 'font-size': XS, fill: pal.textMuted });
        }
        el('line', { x1: PL, y1: Y(0), x2: PR, y2: Y(0), stroke: pal.textMuted }, gBack);
        el('line', { x1: PL, y1: PT, x2: PL, y2: PB, stroke: pal.textMuted }, gBack);
        // 넓이 구간 [lo, hi] 표지
        el('line', { x1: X(p.lo), y1: PB + 24, x2: X(p.hi), y2: PB + 24, stroke: areaColor, 'stroke-width': 2 }, gBack);
        // 점 a 의 세로 안내선
        el('line', { x1: X(p.a), y1: PT, x2: X(p.a), y2: PB, stroke: pal.ghostOutline, 'stroke-dasharray': '2 3' }, gBack);
        // 곡선
        const d = p.curveX
          .map((x, i) => {
            const y = p.curveY[i];
            if (y === undefined) throw new Error('integral: 곡선 표본의 길이가 어긋났다');
            return `${i === 0 ? 'M' : 'L'}${X(x).toFixed(2)},${Y(y).toFixed(2)}`;
          })
          .join(' ');
        el('path', { d, fill: 'none', stroke: pal.text, 'stroke-width': 2 }, gCurve);
        const lastX = p.curveX[p.curveX.length - 1];
        const lastY = p.curveY[p.curveY.length - 1];
        if (lastX === undefined || lastY === undefined) throw new Error('integral: 곡선 표본이 비었다');
        text(X(lastX) - 6, Math.max(PT + 12, Y(lastY) + 4), formatPoly(p.terms), gCurve, { 'text-anchor': 'end', 'font-family': fonts.mono });
        el('circle', { cx: X(p.a), cy: Y(p.fa), r: 4, fill: pal.text }, gCurve);
        // 남은 자리는 새 축척으로 다시 놓는다
        if (secant) drawSecant(secant);
        strips.forEach((g, i) => {
          const els = stripEls[i];
          if (els) drawStrip(els, g);
        });
        setText(caption, t('caption.init', 'Slope at the point, area over the interval · width h = {h}', { h: formatWidth(p.h) }));
      },

      showSecant(p, ms) {
        const a = pointA;
        if (!a) throw new Error('integral: init 전에 할선이 왔다');
        const from = secant ?? { p: a, q: a, line: p.tangent };
        const to = { p: p.p, q: p.q, line: p.line };
        secant = to;
        // 참 기울기의 접선 — 기준선
        if (tangentEl) tangentEl.remove();
        tangentEl = el(
          'line',
          { x1: X(p.tangent.x0), y1: Y(p.tangent.y0), x2: X(p.tangent.x1), y2: Y(p.tangent.y1), stroke: pal.textMuted, 'stroke-dasharray': '6 4' },
          gLines,
        );
        tween('secant', ms, (u) => {
          if (u >= 1) {
            drawSecant(to);
            return;
          }
          const px = lerp(from.p.x, to.p.x, u);
          const qx = lerp(from.q.x, to.q.x, u);
          const pp = { x: px, y: onCurve(px) };
          const qq = { x: qx, y: onCurve(qx) };
          // 늘인 할선은 지금 두 점을 지나는 직선을 그림판 끝까지 긋는다 (두 점을 지나는 선의 그리기 — 좌표 셈).
          // 두 점이 겹치는 첫 프레임(첫 할선이 점 a 에서 출발)만 두 끝을 보간한다
          const ax = needAxis();
          let line: Seg;
          if (Math.abs(qq.x - pp.x) < 1e-9) {
            line = {
              x0: lerp(from.line.x0, to.line.x0, u),
              y0: lerp(from.line.y0, to.line.y0, u),
              x1: lerp(from.line.x1, to.line.x1, u),
              y1: lerp(from.line.y1, to.line.y1, u),
            };
          } else {
            const k = (qq.y - pp.y) / (qq.x - pp.x);
            line = { x0: ax.xMin, y0: pp.y + k * (ax.xMin - pp.x), x1: ax.xMax, y1: pp.y + k * (ax.xMax - pp.x) };
          }
          drawSecant({ p: pp, q: qq, line });
        });
        setText(slopeEst.value, formatNumber(p.estimate, 4));
        setText(slopeErr.value, formatNumber(p.error, 4));
        setText(slopeTrue.value, Number.isInteger(p.trueSlope) ? formatNumber(p.trueSlope) : formatNumber(p.trueSlope, 4));
        const vars = { est: formatNumber(p.estimate, 4) };
        if (p.rule === 0) setText(caption, t('caption.secant.left', 'Backward difference (f(a) − f(a − h)) / h · slope estimate {est}', vars));
        else if (p.rule === 1) setText(caption, t('caption.secant.right', 'Forward difference (f(a + h) − f(a)) / h · slope estimate {est}', vars));
        else if (p.rule === 2) setText(caption, t('caption.secant.mid', 'Central difference (f(a + h) − f(a − h)) / 2h · slope estimate {est}', vars));
        else throw new Error(`integral: 모르는 잡는 자리 ${p.rule}`);
      },

      showStrips(p, ms) {
        const next: StripGeom[] = p.x0s.map((x0, i) => {
          const sx = p.sx[i];
          const sy = p.sy[i];
          if (sx === undefined || sy === undefined) throw new Error('integral: 조각 틀의 길이가 어긋났다');
          return { x0, x1: x0 + p.w, sx, sy };
        });
        const prev = strips;
        const nOld = prev.length;
        const nNew = next.length;
        // 짝 짓기 — 늘 때는 새 조각 i 가 그것을 품은 앞 조각에서 갈라져 나오고, 줄 때는 앞 조각 i 가 품기는 새 조각으로 합쳐진다
        const pairs: { els: StripEls; from: StripGeom; to: StripGeom }[] = [];
        if (nOld === 0) {
          for (const g of next) {
            const els = makeStripEls();
            stripEls.push(els);
            pairs.push({ els, from: { ...g, sy: 0 }, to: g });
          }
        } else if (nNew >= nOld) {
          while (stripEls.length < nNew) stripEls.push(makeStripEls());
          next.forEach((g, i) => {
            const src = prev[Math.floor((i * nOld) / nNew)];
            const els = stripEls[i];
            if (!src || !els) throw new Error('integral: 조각 짝이 없다');
            pairs.push({ els, from: src, to: g });
          });
        } else {
          prev.forEach((g, i) => {
            const dst = next[Math.floor((i * nNew) / nOld)];
            const els = stripEls[i];
            if (!dst || !els) throw new Error('integral: 조각 짝이 없다');
            pairs.push({ els, from: g, to: dst });
          });
        }
        strips = next;
        tween('strips', ms, (u) => {
          for (const pr of pairs) {
            drawStrip(pr.els, {
              x0: lerp(pr.from.x0, pr.to.x0, u),
              x1: lerp(pr.from.x1, pr.to.x1, u),
              sx: lerp(pr.from.sx, pr.to.sx, u),
              sy: lerp(pr.from.sy, pr.to.sy, u),
            });
          }
          if (u >= 1) {
            // 합쳐진 뒤 남는 요소를 걷는다
            while (stripEls.length > nNew) {
              const extra = stripEls.pop();
              if (extra) removeStripEls(extra);
            }
          }
        });
        const vars = { n: formatNumber(p.n) };
        if (p.rule === 0) setText(caption, t('caption.strips.left', "Height measured at each strip's left end · strips {n}", vars));
        else if (p.rule === 1) setText(caption, t('caption.strips.right', "Height measured at each strip's right end · strips {n}", vars));
        else if (p.rule === 2) setText(caption, t('caption.strips.mid', "Height measured at each strip's midpoint · strips {n}", vars));
        else throw new Error(`integral: 모르는 잡는 자리 ${p.rule}`);
      },

      showSum(p, ms) {
        if (p.partials.length !== strips.length) throw new Error('integral: 합의 조각 수가 틀과 어긋났다');
        finish('strips');
        const n = strips.length;
        const y0 = Y(0);
        const fillTo = (k: number, frac: number): void => {
          const g = strips[k];
          const els = stripEls[k];
          if (!g || !els) throw new Error('integral: 채울 조각이 없다');
          const yt = lerp(y0, Y(g.sy), frac);
          els.fill.setAttribute('x', String(X(g.x0)));
          els.fill.setAttribute('width', String(Math.max(0, X(g.x1) - X(g.x0))));
          els.fill.setAttribute('y', String(Math.min(y0, yt)));
          els.fill.setAttribute('height', String(Math.abs(y0 - yt)));
        };
        const sumText = (k: number): void => {
          const v = k < 0 ? 0 : p.partials[k];
          if (v === undefined) throw new Error('integral: 부분합이 없다');
          setText(areaEst.value, formatNumber(v, 4));
        };
        tween('sum', ms, (u) => {
          const pos = u * n;
          const whole = Math.floor(pos);
          for (let k = 0; k < n; k += 1) fillTo(k, k < whole ? 1 : k === whole ? pos - whole : 0);
          if (u >= 1) {
            setText(areaEst.value, formatNumber(p.estimate, 4));
            setText(areaErr.value, formatNumber(p.error, 4));
          } else {
            sumText(whole - 1);
          }
        });
        setText(areaTrue.value, Number.isInteger(p.trueArea) ? formatNumber(p.trueArea) : formatNumber(p.trueArea, 4));
        setText(caption, t('caption.sum', 'Add height × width strip by strip · area estimate {est}', { est: formatNumber(p.estimate, 4) }));
      },

      showCompare(p, ms) {
        if (!(p.barMax > 0)) throw new Error('integral: 막대 축척이 없다');
        const scale = BAR_W / p.barMax;
        const hText = t('label.width', 'width {h}', { h: formatWidth(p.h) });
        const rows: [CompareRow, number, number | null, number | null][] = [
          [cmpSlope, p.slopeError, p.slopeError2, p.slopeRatio],
          [cmpArea, p.areaError, p.areaError2, p.areaRatio],
        ];
        const moves: { row: CompareRow; from: number; to: number }[] = [];
        for (const [row, err, err2, ratio] of rows) {
          setText(row.narrow.label, hText);
          setText(row.narrow.value, formatNumber(err, 4));
          const to = Math.abs(err) * scale;
          if (p.h2 === null || err2 === null || ratio === null) {
            setText(row.wide.label, '');
            setText(row.wide.value, '—');
            row.wide.bar.setAttribute('width', '0');
            setText(row.ratio, '—');
            moves.push({ row, from: to, to });
          } else {
            const wide = Math.abs(err2) * scale;
            setText(row.wide.label, t('label.width', 'width {h}', { h: formatWidth(p.h2) }));
            setText(row.wide.value, formatNumber(err2, 4));
            row.wide.bar.setAttribute('width', String(wide));
            setText(row.ratio, formatNumber(ratio, 3));
            moves.push({ row, from: wide, to });
          }
        }
        tween('compare', ms, (u) => {
          for (const m of moves) {
            m.row.narrow.bar.setAttribute('width', String(lerp(m.from, m.to, u)));
          }
        });
        if (p.h2 === null || p.slopeRatio === null || p.areaRatio === null) {
          setText(caption, t('caption.compareNone', 'Width {h} · no wider rung 2h to compare', { h: formatWidth(p.h) }));
        } else {
          setText(
            caption,
            t('caption.compare', 'Width {h2} → {h} · slope error ratio {rs} · area error ratio {ra}', {
              h2: formatWidth(p.h2),
              h: formatWidth(p.h),
              rs: formatNumber(p.slopeRatio, 3),
              ra: formatNumber(p.areaRatio, 3),
            }),
          );
        }
      },

      reset() {
        wipeAll();
      },

      destroy() {
        destroyed = true;
        cancelAll();
      },
    };
    return api;
  },
};
