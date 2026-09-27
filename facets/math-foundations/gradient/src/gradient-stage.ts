/**
 * gradient 무대 — 왼쪽은 등고선 지도(점 p · 자르는 선 · s·u 끝 · ∇f 화살표 · ∇f 를 지름으로 하는 원),
 * 오른쪽 위는 단면 창 g(t) = f(p + t·u) 와 t 0 접선, 오른쪽 아래는 s 막대와 |∇f| 막대(같은 축척).
 *
 * 운동:
 *   showBoard   — 점이 앞 자리에서 새 자리로 미끄러지고 자르는 선이 따라 옮겨 간다 (방향은 그대로)
 *   showCut     — 자르는 선이 앞 방향에서 새 방향으로 짧은 쪽으로 돌고, 단면 곡선이 새 표본으로 바뀌어 간다
 *   showSlope   — 접선이 수평에서 기울기 s 로 기울고, 지도 위 s·u 끝과 s 막대가 자라난다
 *   showGradient — ∇f 화살표가 점에서 자라 나오고 원이 퍼지며 |∇f| 막대가 s 막대 옆에 선다
 *
 * 무대는 셈하지 않는다 — 표본 · 끝점 · 범위 · 축척 · 글자는 모두 payload 로 받아 그 사이를 보간한다.
 * 도는 선의 사잇 프레임만 각을 보간해 그린다 (그리기의 좌표 변환).
 */
import {
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import { mapToScreen } from './algorithm.js';

const W = 760;
const H = 420;
const SVG = 'http://www.w3.org/2000/svg';

/** 지도 칸 */
const MAP_BOX = { x: 16, y: 58, w: 420, h: 300 };
/** 단면 창 */
const SEC_BOX = { x: 492, y: 70, w: 250, h: 170 };
/** 막대 칸 */
const BAR_BOX = { x: 492, y: 300, w: 250, h: 90 };

type Pt = [number, number];
type Bounds = { xMin: number; xMax: number; yMin: number; yMax: number };

export type GradientBoard = {
  p: Pt;
  pText: string;
  fText: string;
  contours: { level: number; levelText: string; pts: Pt[] }[];
  mapBounds: Bounds;
  sectionT: Pt;
  sectionTicks: { t: number; text: string; origin: boolean }[];
  sectionRange: Pt;
  barMax: number;
};
export type GradientCut = { deg: number; degText: string; cutHalf: number; cutEnds: [Pt, Pt]; section: Pt[] };
export type GradientSlope = { s: number; sText: string; tangent: [Pt, Pt]; tip: Pt };
export type GradientGrad = {
  gradText: string;
  mag: number;
  magText: string;
  angleText: string;
  s: number;
  sText: string;
  axis: 'x' | 'y' | 'none';
  partialText: string | null;
  arrowTip: Pt;
  circle: { cx: number; cy: number; r: number };
};

export type GradientStage = {
  reset(): void;
  showBoard(b: GradientBoard, durMs: number): void;
  showCut(c: GradientCut, durMs: number): void;
  showSlope(s: GradientSlope, durMs: number): void;
  showGradient(g: GradientGrad, durMs: number): void;
};

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 한 문서에 무대가 여럿일 때 clipPath id 가 부딪히지 않게 */
let mountCount = 0;

export const gradientStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) => {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const set = (node: Element, attrs: Record<string, string | number>) => {
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    };
    const text = (attrs: Record<string, string | number>, parent: Element, body = '') => {
      const node = el('text', { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text, ...attrs }, parent);
      node.textContent = body;
      return node;
    };

    // ── 뼈대 (마운트에서 한 번 — 이후 요소 수가 늘지 않는다) ──
    const root = el('g', { 'data-role': 'gradient-root' }, svg);
    const caption = text({ x: 16, y: 26, 'font-size': fontSizes.md, 'font-weight': 600 }, root);
    text({ x: MAP_BOX.x, y: MAP_BOX.y - 14, fill: c.textMuted }, root, t('label.map', 'Contour map of f = x² + 3y²'));
    mountCount += 1;
    const clipId = `gradient-map-clip-${mountCount}`;
    const clipRect = el('rect', { x: MAP_BOX.x, y: MAP_BOX.y, width: MAP_BOX.w, height: MAP_BOX.h }, el('clipPath', { id: clipId }, el('defs', {}, root)));
    const contourLayer = el('g', { 'data-role': 'contours' }, root);
    const circle = el('circle', { fill: 'none', stroke: c.textMuted, 'stroke-dasharray': '3 3', 'stroke-width': 1, visibility: 'hidden' }, root);
    const cutLine = el('line', { stroke: c.itemComparing, 'stroke-width': 1.5, 'stroke-dasharray': '6 4', visibility: 'hidden', 'clip-path': `url(#${clipId})` }, root);
    const cutHead = el('polygon', { fill: c.itemComparing, visibility: 'hidden' }, root);
    const cutHeadLabel = text({ fill: c.itemComparing, 'font-family': fonts.mono, 'font-size': fontSizes.xs, visibility: 'hidden' }, root, '+t');
    const tipLine = el('line', { stroke: c.itemComparing, 'stroke-width': 3, 'stroke-linecap': 'round', visibility: 'hidden' }, root);
    const tipDot = el('circle', { r: 4, fill: c.itemComparing, visibility: 'hidden' }, root);
    const gradLine = el('line', { stroke: c.primary, 'stroke-width': 3, 'stroke-linecap': 'round', visibility: 'hidden' }, root);
    const gradHead = el('polygon', { fill: c.primary, visibility: 'hidden' }, root);
    const gradLabel = text({ 'font-family': fonts.mono, visibility: 'hidden' }, root);
    const pointDot = el('circle', { r: 5, fill: c.text, stroke: c.bg, 'stroke-width': 1.5, visibility: 'hidden' }, root);
    const pointLabel = text({ 'font-family': fonts.mono, visibility: 'hidden' }, root);

    text({ x: SEC_BOX.x, y: SEC_BOX.y - 12, fill: c.textMuted }, root, t('label.section', 'Section g(t) = f(p + t·u)'));
    const secFrame = el('g', { 'data-role': 'section-frame' }, root);
    const secCurve = el('polyline', { fill: 'none', stroke: c.itemComparing, 'stroke-width': 2, visibility: 'hidden' }, root);
    const tangent = el('line', { stroke: c.text, 'stroke-width': 1.5, visibility: 'hidden' }, root);
    const secDot = el('circle', { r: 4, fill: c.text, visibility: 'hidden' }, root);
    const sLabel = text({ 'font-family': fonts.mono, visibility: 'hidden' }, root);

    text({ x: BAR_BOX.x, y: BAR_BOX.y - 14, fill: c.textMuted }, root, t('label.compare', 'Slope s and length |∇f| on one scale'));
    const barZero = el('line', { stroke: c.border, 'stroke-width': 1 }, root);
    const sBarName = text({ x: BAR_BOX.x, 'font-family': fonts.mono }, root, 's');
    const gBarName = text({ x: BAR_BOX.x, 'font-family': fonts.mono }, root, '|∇f|');
    const sBar = el('rect', { height: 16, fill: c.itemComparing, visibility: 'hidden' }, root);
    const gBar = el('rect', { height: 16, fill: c.primary, visibility: 'hidden' }, root);
    const gBarGhost = el('rect', { height: 16, fill: 'none', stroke: c.primary, 'stroke-dasharray': '3 2', visibility: 'hidden' }, root);
    const sBarText = text({ 'font-family': fonts.mono, visibility: 'hidden' }, root);
    const gBarText = text({ 'font-family': fonts.mono, visibility: 'hidden' }, root);
    const partialText = text({ 'font-family': fonts.mono, fill: c.textMuted, visibility: 'hidden' }, root);
    const gradInfo = text({ x: MAP_BOX.x, y: MAP_BOX.y + MAP_BOX.h + 28, 'font-family': fonts.mono, visibility: 'hidden' }, root);

    const BAR_LABEL_W = 44;
    const barRow = (i: number) => BAR_BOX.y + 8 + i * 34;
    const barZeroX = BAR_BOX.x + BAR_LABEL_W + (BAR_BOX.w - BAR_LABEL_W) / 2;
    set(barZero, { x1: barZeroX, x2: barZeroX, y1: BAR_BOX.y, y2: BAR_BOX.y + 70 });
    set(sBarName, { y: barRow(0) + 12 });
    set(gBarName, { y: barRow(1) + 12 });

    // ── 상태 ──
    let board: GradientBoard | null = null;
    let fit: { x: number; y: number; w: number; h: number } | null = null;
    /** 지금 보이는 자리 (운동의 출발점) */
    let shownP: Pt | null = null;
    let shownDeg: number | null = null;
    let shownCutHalf = 0;
    let shownSection: Pt[] | null = null;

    const frames = new Map<string, number>();
    const cancelAll = () => {
      for (const id of frames.values()) cancelAnimationFrame(id);
      frames.clear();
    };
    params.onScrubStart?.(cancelAll);
    const tween = (key: string, durMs: number, draw: (k: number) => void) => {
      const prev = frames.get(key);
      if (prev !== undefined) cancelAnimationFrame(prev);
      frames.delete(key);
      if (isInstant() || durMs <= 0 || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / durMs);
        draw(ease(k));
        if (k < 1) frames.set(key, requestAnimationFrame(step));
        else frames.delete(key);
      };
      draw(0);
      frames.set(key, requestAnimationFrame(step));
    };

    const need = <T>(v: T | null, what: string): T => {
      if (v === null) throw new Error(`gradient-stage: ${what} 이 아직 없다 — showBoard 가 먼저 와야 한다`);
      return v;
    };
    const toMap = (x: number, y: number): Pt => {
      const b = need(board, '판');
      return mapToScreen(x, y, b.mapBounds, need(fit, '지도 틀'));
    };
    const toSec = (tt: number, g: number): Pt => {
      const b = need(board, '판');
      const [t0, t1] = b.sectionT;
      const [g0, g1] = b.sectionRange;
      return [SEC_BOX.x + ((tt - t0) / (t1 - t0)) * SEC_BOX.w, SEC_BOX.y + ((g1 - g) / (g1 - g0)) * SEC_BOX.h];
    };
    /** 값 글자 칸 — 가장 긴 막대(barMax)의 끝 바깥, 고정 자리 */
    const valueX = () => barZeroX + barPx(need(board, '판').barMax) + 8;
    const barPx = (v: number) => (v / need(board, '판').barMax) * ((BAR_BOX.w - BAR_LABEL_W) / 2 - 36);

    const hide = (...nodes: Element[]) => nodes.forEach((n) => n.setAttribute('visibility', 'hidden'));
    const show = (...nodes: Element[]) => nodes.forEach((n) => n.setAttribute('visibility', 'visible'));

    const drawPoint = (p: Pt) => {
      const [sx, sy] = toMap(p[0], p[1]);
      set(pointDot, { cx: sx, cy: sy });
      set(pointLabel, { x: sx + 9, y: sy + smPx + 8 });
    };
    const drawCut = (p: Pt, deg: number, half: number) => {
      const r = (deg * Math.PI) / 180;
      const [ax, ay] = toMap(p[0] - half * Math.cos(r), p[1] - half * Math.sin(r));
      const [bx, by] = toMap(p[0] + half * Math.cos(r), p[1] + half * Math.sin(r));
      set(cutLine, { x1: ax, y1: ay, x2: bx, y2: by });
      // +t 쪽 화살촉 — p 에서 u 쪽으로 조금 앞 (화면 픽셀로 잡는다)
      const [px, py] = toMap(p[0], p[1]);
      const len = Math.hypot(bx - ax, by - ay);
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      const hx = px + ux * 58;
      const hy = py + uy * 58;
      set(cutHead, { points: `${hx + ux * 9},${hy + uy * 9} ${hx - uy * 5},${hy + ux * 5} ${hx + uy * 5},${hy - ux * 5}` });
      set(cutHeadLabel, { x: hx + 8, y: hy - 8 });
      show(cutHead, cutHeadLabel);
    };
    const drawSection = (pts: Pt[]) => {
      set(secCurve, { points: pts.map(([tt, g]) => toSec(tt, g).join(',')).join(' ') });
    };
    const drawBar = (rect: Element, row: number, v: number) => {
      const w = barPx(v);
      set(rect, { x: w >= 0 ? barZeroX : barZeroX + w, y: barRow(row), width: Math.abs(w) });
    };
    const drawArrow = (from: Pt, to: Pt) => {
      const [x1, y1] = toMap(from[0], from[1]);
      const [x2, y2] = toMap(to[0], to[1]);
      set(gradLine, { x1, y1, x2, y2 });
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 1) {
        set(gradHead, { points: '' });
        return;
      }
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      const hx = x2 + ux * 8;
      const hy = y2 + uy * 8;
      set(gradHead, { points: `${hx},${hy} ${x2 - uy * 5},${y2 + ux * 5} ${x2 + uy * 5},${y2 - ux * 5}` });
    };

    /** 이 판의 결론을 걷는다 — 자리(점 · 자르는 선 · 단면)는 남긴다 */
    const clearConclusions = () => {
      hide(tangent, secDot, sLabel, tipLine, tipDot, gradLine, gradHead, gradLabel, circle, sBar, gBar, gBarGhost, sBarText, gBarText, partialText, gradInfo);
    };

    const api: GradientStage & ViewInstance = {
      reset() {
        cancelAll();
        board = null;
        fit = null;
        shownP = null;
        shownDeg = null;
        shownCutHalf = 0;
        shownSection = null;
        contourLayer.replaceChildren();
        secFrame.replaceChildren();
        caption.textContent = '';
        clearConclusions();
        hide(cutLine, cutHead, cutHeadLabel, pointDot, pointLabel, secCurve);
      },

      showBoard(b, durMs) {
        cancelAll();
        board = b;
        // 지도 틀 — 가로세로 같은 축척으로 칸 안에 맞춘다
        const xr = b.mapBounds.xMax - b.mapBounds.xMin;
        const yr = b.mapBounds.yMax - b.mapBounds.yMin;
        const scale = Math.min(MAP_BOX.w / xr, MAP_BOX.h / yr);
        fit = { x: MAP_BOX.x + (MAP_BOX.w - xr * scale) / 2, y: MAP_BOX.y + (MAP_BOX.h - yr * scale) / 2, w: xr * scale, h: yr * scale };

        set(clipRect, { x: fit.x, y: fit.y, width: fit.w, height: fit.h });
        // 바탕 (멱등 — 비우고 다시 짓는다)
        contourLayer.replaceChildren();
        const [ox, oy] = toMap(0, 0);
        el('line', { x1: fit.x, x2: fit.x + fit.w, y1: oy, y2: oy, stroke: c.border, 'stroke-width': 1 }, contourLayer);
        el('line', { x1: ox, x2: ox, y1: fit.y, y2: fit.y + fit.h, stroke: c.border, 'stroke-width': 1 }, contourLayer);
        text({ x: fit.x + fit.w - 10, y: oy - 6, fill: c.textMuted, 'font-family': fonts.mono }, contourLayer, 'x');
        text({ x: ox + 6, y: fit.y + 12, fill: c.textMuted, 'font-family': fonts.mono }, contourLayer, 'y');
        b.contours.forEach((ct, i) => {
          el('polygon', { points: ct.pts.map(([x, y]) => toMap(x, y).join(',')).join(' '), fill: 'none', stroke: c.textMuted, 'stroke-width': 1, opacity: 0.6 }, contourLayer);
          // 수준 글자는 번갈아 가장 위 · 가장 아래 표본 곁에 (겹치지 않게)
          const up = i % 2 === 0;
          let edge = ct.pts[0] as Pt;
          for (const q of ct.pts) if (up ? q[1] > edge[1] : q[1] < edge[1]) edge = q;
          const [lx, ly] = toMap(edge[0], edge[1]);
          text({ x: lx + 3, y: up ? ly - 3 : ly + smPx, fill: c.textMuted, 'font-size': fontSizes.xs, 'font-family': fonts.mono }, contourLayer, ct.levelText);
        });

        secFrame.replaceChildren();
        const [sx0, sy0] = toSec(b.sectionT[0], b.sectionRange[0]);
        const [sx1, sy1] = toSec(b.sectionT[1], b.sectionRange[1]);
        el('rect', { x: sx0, y: sy1, width: sx1 - sx0, height: sy0 - sy1, fill: 'none', stroke: c.border }, secFrame);
        text({ x: sx1 + 4, y: sy0 + 14, fill: c.textMuted, 'font-family': fonts.mono }, secFrame, 't');
        // 눈금 — 자리와 글자 모두 payload 에서 (p 자리 눈금에는 세로 점선)
        b.sectionTicks.forEach((tk, i) => {
          const [tx] = toSec(tk.t, b.sectionRange[0]);
          if (tk.origin) el('line', { x1: tx, x2: tx, y1: sy1, y2: sy0, stroke: c.border, 'stroke-dasharray': '2 3' }, secFrame);
          const anchor = i === 0 ? 'start' : i === b.sectionTicks.length - 1 ? 'end' : 'middle';
          text({ x: tx, y: sy0 + 14, fill: c.textMuted, 'font-size': fontSizes.xs, 'font-family': fonts.mono, 'text-anchor': anchor }, secFrame, tk.text);
        });

        clearConclusions();
        caption.textContent = t('caption.board', 'Point p {point} · height f(p) = {f}', { point: b.pText, f: b.fText });
        pointLabel.textContent = `p ${b.pText} · f(p) = ${b.fText}`;
        show(pointDot, pointLabel);
        // 앞 판의 단면은 자리로만 남긴다 (흐리게) — 걸음 1 이 새 단면으로 바꿔 간다
        if (shownSection) set(secCurve, { opacity: 0.35 });

        const from = shownP ?? b.p;
        const to = b.p;
        const deg = shownDeg;
        const half = shownCutHalf;
        tween('point', durMs, (k) => {
          const p: Pt = [lerp(from[0], to[0], k), lerp(from[1], to[1], k)];
          shownP = p;
          drawPoint(p);
          if (deg !== null) drawCut(p, deg, half);
          if (shownSection) drawSection(shownSection);
        });
      },

      showCut(cut, durMs) {
        const b = need(board, '판');
        const p = b.p;
        const fromDeg = shownDeg ?? cut.deg;
        const delta = ((((cut.deg - fromDeg) % 360) + 540) % 360) - 180; // 짧은 쪽으로
        const fromSec: Pt[] = shownSection && shownSection.length === cut.section.length ? shownSection : cut.section.map(([tt]) => [tt, (cut.section[(cut.section.length - 1) / 2] as Pt)[1]] as Pt);
        caption.textContent = t('caption.cut', 'Cut through p · direction {deg}', { deg: cut.degText });
        show(cutLine, secCurve);
        set(secCurve, { opacity: 1 });
        shownCutHalf = cut.cutHalf;
        tween('cut', durMs, (k) => {
          const d = fromDeg + delta * k;
          shownDeg = d;
          drawCut(p, d, cut.cutHalf);
          const pts = cut.section.map(([tt, g], i) => [tt, lerp((fromSec[i] as Pt)[1], g, k)] as Pt);
          shownSection = pts;
          drawSection(pts);
          if (k === 1) {
            shownDeg = cut.deg;
            const [a0, a1] = cut.cutEnds;
            const [x1, y1] = toMap(a0[0], a0[1]);
            const [x2, y2] = toMap(a1[0], a1[1]);
            set(cutLine, { x1, y1, x2, y2 });
            shownSection = cut.section;
          }
        });
      },

      showSlope(sl, durMs) {
        const b = need(board, '판');
        const p = b.p;
        const [e0, e1] = sl.tangent;
        const mid = (e0[1] + e1[1]) / 2;
        caption.textContent = t('caption.slope', 'Slope of the section at t = 0 · s = {s}', { s: sl.sText });
        const [dx, dy] = toSec(0, mid);
        set(secDot, { cx: dx, cy: dy });
        show(tangent, secDot, tipLine, tipDot, sBar, sBarText);
        sBarText.textContent = sl.sText;
        sLabel.textContent = `s = ${sl.sText}`;
        tween('slope', durMs, (k) => {
          const [ax, ay] = toSec(e0[0], lerp(mid, e0[1], k));
          const [bx, by] = toSec(e1[0], lerp(mid, e1[1], k));
          set(tangent, { x1: ax, y1: ay, x2: bx, y2: by });
          const tip: Pt = [lerp(p[0], sl.tip[0], k), lerp(p[1], sl.tip[1], k)];
          const [px0, py0] = toMap(p[0], p[1]);
          const [tx, ty] = toMap(tip[0], tip[1]);
          set(tipLine, { x1: px0, y1: py0, x2: tx, y2: ty });
          set(tipDot, { cx: tx, cy: ty });
          const sv = lerp(0, sl.s, k);
          drawBar(sBar, 0, sv);
          set(sBarText, { x: valueX(), y: barRow(0) + 12 });
          if (k === 1) {
            set(sLabel, { x: bx + 4, y: by - 4 });
            show(sLabel);
          }
        });
      },

      showGradient(g, durMs) {
        const b = need(board, '판');
        const p = b.p;
        let partial: string | null = null;
        if (g.axis !== 'none') {
          if (g.partialText === null) throw new Error('gradient-stage: 0° · 90° 칸에 편미분 글자가 없다');
          partial = g.partialText;
        }
        caption.textContent =
          partial !== null && g.axis === 'x'
            ? t('caption.gradientX', 's = {s} · ∂f/∂x = {partial} · |∇f| = {mag}', { s: g.sText, partial, mag: g.magText })
            : partial !== null && g.axis === 'y'
              ? t('caption.gradientY', 's = {s} · ∂f/∂y = {partial} · |∇f| = {mag}', { s: g.sText, partial, mag: g.magText })
              : t('caption.gradient', 's = {s} · |∇f| = {mag}', { s: g.sText, mag: g.magText });
        gradInfo.textContent = `∇f = ${g.gradText} · |∇f| = ${g.magText} · ${t('label.angle', 'angle of ∇f')} ${g.angleText}`;
        gradLabel.textContent = '∇f';
        gBarText.textContent = g.magText;
        if (partial !== null) {
          partialText.textContent = `${g.axis === 'x' ? '∂f/∂x' : '∂f/∂y'} = ${partial}`;
          set(partialText, { x: BAR_BOX.x, y: barRow(2) + 8 });
          show(partialText);
        }
        show(gradLine, gradHead, gradLabel, circle, gBar, gBarGhost, gBarText, gradInfo);
        // s 줄에 −|∇f| ~ |∇f| 틀을 점선으로 — s 막대가 그 틀과 같은 축척으로 견주어진다
        const gw = barPx(g.mag);
        set(gBarGhost, { x: barZeroX - gw, y: barRow(0), width: 2 * gw });
        tween('gradient', durMs, (k) => {
          const tip: Pt = [lerp(p[0], g.arrowTip[0], k), lerp(p[1], g.arrowTip[1], k)];
          drawArrow(p, tip);
          const [lx, ly] = toMap(tip[0], tip[1]);
          set(gradLabel, { x: lx + 8, y: ly - 6 });
          const [cx, cy] = toMap(g.circle.cx, g.circle.cy);
          const [rx] = toMap(g.circle.cx + g.circle.r * k, g.circle.cy);
          set(circle, { cx, cy, r: Math.max(0, rx - cx) });
          const mv = lerp(0, g.mag, k);
          drawBar(gBar, 1, mv);
          set(gBarText, { x: valueX(), y: barRow(1) + 12 });
        });
      },

      destroy() {
        cancelAll();
        root.remove();
      },
    };
    return api;
  },
};
