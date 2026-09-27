/**
 * eigen 무대 — 왼쪽은 한 화살표 v 의 궤적, 오른쪽은 곱마다 tan(틈) 을 로그 눈금에 찍은 자리.
 *
 * - 좌표평면: 두 고유 방향 줄(45° · 135°) · 길이 1 의 화살표 v · 곱마다 v 의 끝에 남는 자국과
 *   테두리의 방향 눈금 · 곱 뒤의 w (점선). 수학 좌표(위가 +y)를 픽셀로 옮긴다.
 * - 곱 하나의 운동: v 의 끝이 곧은 선으로 w 까지 늘어났다가 제 방향 그대로 길이 1 로 줄어든다.
 *   곧은 선이라 음수 λ₂ 판에서는 원점을 지나 반대쪽으로 뒤집힌다.
 * - 판 머리(board): 무대를 비우고 다시 짓는다 (멱등). 화살표는 앞 판의 끝 방향에서 새 출발 방향으로 돌아 옮겨 간다.
 * - 로그 눈금: 곱 k 마다 log10(tan 틈) 을 찍는다. 옆(외적 부호)은 채움 / 속 빈 점으로 가른다.
 *
 * 무대는 알고리즘의 셈을 다시 하지 않는다 — 모든 수(틈 · 각 · 배수 · tan 비 · 축 범위)는 payload 에서 온다.
 * 운동 중의 화살표는 도착 값 사이를 보간할 뿐이다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type EigenBoardView = {
  a: number[];
  big: number;
  small: number;
  ratioExpected: number;
  vx: number;
  vy: number;
  showRatio: boolean;
  first: number;
  products: number;
  planeMax: number;
  logMin: number;
  logMax: number;
  thresholdLog: number;
};

export type EigenRowView = {
  k: number;
  vx: number;
  vy: number;
  angle: number;
  gap: number;
  tanLog: number | null;
  side: number;
  inside: boolean;
  alignedNow: boolean;
  first: number;
  last: boolean;
};

export type EigenProductView = EigenRowView & {
  wx: number;
  wy: number;
  stretch: number;
  tanRatio: number | null;
  crossed: boolean;
};

export type EigenStage = {
  board(b: EigenBoardView, motionMs: number): void;
  origin(r: EigenRowView): void;
  product(r: EigenProductView, motionMs: number): void;
  reset(): void;
  destroy(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 820;
const H = 480;
/** 좌표평면 */
const CX = 225;
const CY = 262;
const R = 190;
/** 로그 눈금 */
const PX0 = 500;
const PX1 = 780;
const PY0 = 70;
const PY1 = 280;
/** 읽기 줄 */
const LX = 470;
const LY0 = 358;
const LINE = 21;

/** 표시 도우미 — 빼기는 U+2212, 반올림한 글자가 0 이면 부호를 뗀다 */
function fmt(x: number, digits: number): string {
  if (!Number.isFinite(x)) throw new Error(`eigen-stage: 표시할 수 없는 수 ${x}`);
  let s = x.toFixed(digits);
  if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
  return s.replace('-', '−');
}

const SUP: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

function decadeLabel(n: number): string {
  if (n === 0) return '1';
  if (n === 1) return '10';
  return '10' + String(n)
    .split('')
    .map((c) => {
      const s = SUP[c];
      if (s === undefined) throw new Error(`eigen-stage: 지수 글자 ${c}`);
      return s;
    })
    .join('');
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

export const eigenStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const bodyFont = fonts.body;
    const monoFont = fonts.mono;
    const sm = fontSizes.sm;
    const md = fontSizes.md;

    let root: SVGGElement | null = null;
    let board: EigenBoardView | null = null;
    /** 화살표 끝 — 수학 좌표(단위 = 길이 1) */
    let tip: { x: number; y: number } | null = null;
    let raf = 0;
    let pending: { finish(): void } | null = null;

    // 판마다 새로 짓는 요소들
    let arrowLine: SVGLineElement | null = null;
    let arrowHead: SVGPolygonElement | null = null;
    let arrowLabel: SVGTextElement | null = null;
    let ray: SVGLineElement | null = null;
    let ghost: SVGGElement | null = null;
    let trail: SVGGElement | null = null;
    let points: SVGGElement | null = null;
    let polyline: SVGPolylineElement | null = null;
    /** 로그 눈금에 찍은 점 자리 — 선이 이 목록을 잇는다 */
    let plotted: string[] = [];
    let lines: SVGTextElement[] = [];
    let unitPx = 1;

    const px = (x: number): number => CX + x * unitPx;
    const py = (y: number): number => CY - y * unitPx;
    const plotX = (k: number): number => {
      if (!board) throw new Error('eigen-stage: 판이 아직 없다');
      return PX0 + ((PX1 - PX0) * k) / board.products;
    };
    const plotY = (lg: number): number => {
      if (!board) throw new Error('eigen-stage: 판이 아직 없다');
      return PY0 + ((PY1 - PY0) * (board.logMax - lg)) / (board.logMax - board.logMin);
    };

    function cancelMotion(): void {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pending = null;
    }

    function finishMotion(): void {
      const job = pending;
      if (job) job.finish();
    }

    /** 진행률 u ∈ [0, 1] 을 그리는 운동. 새 운동이 오면 앞 것은 끝 자리로 마친다 */
    function animate(ms: number, draw: (u: number) => void, done: () => void): void {
      finishMotion();
      if (ms <= 0 || isInstant()) {
        draw(1);
        done();
        return;
      }
      const start = performance.now();
      const job = {
        finish: () => {
          if (raf) cancelAnimationFrame(raf);
          raf = 0;
          pending = null;
          draw(1);
          done();
        },
      };
      pending = job;
      const tick = (now: number): void => {
        if (pending !== job) return;
        const u = Math.min(1, (now - start) / ms);
        if (u >= 1 || isInstant()) {
          job.finish();
          return;
        }
        draw(u);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    function clearAll(): void {
      cancelMotion();
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      root = null;
      arrowLine = null;
      arrowHead = null;
      arrowLabel = null;
      ray = null;
      ghost = null;
      trail = null;
      points = null;
      polyline = null;
      plotted = [];
      lines = [];
    }

    function drawArrow(x: number, y: number): void {
      if (!arrowLine || !arrowHead || !arrowLabel || !ray) throw new Error('eigen-stage: 화살표가 없다');
      tip = { x, y };
      const tx = px(x);
      const ty = py(y);
      arrowLine.setAttribute('x2', String(tx));
      arrowLine.setAttribute('y2', String(ty));
      const lenPx = Math.hypot(tx - CX, ty - CY);
      if (lenPx < 4) {
        arrowHead.setAttribute('points', '');
        ray.setAttribute('visibility', 'hidden');
        arrowLabel.setAttribute('visibility', 'hidden');
        return;
      }
      const ux = (tx - CX) / lenPx;
      const uy = (ty - CY) / lenPx;
      const hl = 13;
      const hw = 6.5;
      const bx = tx - ux * hl;
      const by = ty - uy * hl;
      arrowHead.setAttribute(
        'points',
        `${tx},${ty} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}`,
      );
      ray.setAttribute('visibility', 'visible');
      ray.setAttribute('x2', String(CX + ux * R));
      ray.setAttribute('y2', String(CY + uy * R));
      arrowLabel.setAttribute('visibility', 'visible');
      arrowLabel.setAttribute('x', String(tx + ux * 12 - 4));
      arrowLabel.setAttribute('y', String(ty + uy * 12 + 4));
    }

    function setLine(i: number, text: string): void {
      const line = lines[i];
      if (!line) throw new Error(`eigen-stage: 읽기 줄 ${i} 이 없다`);
      line.textContent = text;
    }

    function buildBoard(b: EigenBoardView): void {
      clearAll();
      board = b;
      unitPx = R / b.planeMax;
      root = el(svg, 'g', {});
      const g = root;

      // ── 행렬 A ──
      el(g, 'text', { x: 20, y: 34, fill: c.text, 'font-family': monoFont, 'font-size': md }, 'A =');
      const mx = 62;
      el(g, 'path', {
        d: `M ${mx + 6} 16 H ${mx} V 60 H ${mx + 6} M ${mx + 70} 16 H ${mx + 76} V 60 H ${mx + 70}`,
        fill: 'none',
        stroke: c.text,
        'stroke-width': 1.2,
      });
      b.a.forEach((cell, i) => {
        el(
          g,
          'text',
          {
            x: mx + 22 + (i % 2) * 32,
            y: 33 + Math.floor(i / 2) * 20,
            'text-anchor': 'middle',
            fill: c.text,
            'font-family': monoFont,
            'font-size': md,
          },
          fmt(cell, 0),
        );
      });

      // ── 좌표평면 ──
      el(g, 'circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: c.border, 'stroke-dasharray': '2 4' });
      el(g, 'line', { x1: CX - R, y1: CY, x2: CX + R, y2: CY, stroke: c.border });
      el(g, 'line', { x1: CX, y1: CY - R, x2: CX, y2: CY + R, stroke: c.border });
      el(g, 'text', { x: CX + R + 4, y: CY + 4, fill: c.textMuted, 'font-family': bodyFont, 'font-size': sm }, 'x');
      el(g, 'text', { x: CX + 4, y: CY - R - 4, fill: c.textMuted, 'font-family': bodyFont, 'font-size': sm }, 'y');
      el(g, 'circle', { cx: CX, cy: CY, r: unitPx, fill: 'none', stroke: c.border });
      el(
        g,
        'text',
        { x: CX + R - 2, y: CY + 16, 'text-anchor': 'end', fill: c.textMuted, 'font-family': monoFont, 'font-size': sm },
        fmt(b.planeMax, 0),
      );
      const d = R / Math.SQRT2;
      // 두 고유 방향 줄 — 45° (λ₁) · 135° (λ₂)
      el(g, 'line', { x1: CX - d, y1: CY + d, x2: CX + d, y2: CY - d, stroke: c.accent, 'stroke-width': 1.5 });
      el(g, 'line', {
        x1: CX + d,
        y1: CY + d,
        x2: CX - d,
        y2: CY - d,
        stroke: c.textMuted,
        'stroke-width': 1.5,
        'stroke-dasharray': '6 4',
      });
      el(
        g,
        'text',
        { x: CX - d - 6, y: CY + d + 4, 'text-anchor': 'end', fill: c.accent, 'font-family': monoFont, 'font-size': md },
        `λ₁ = ${fmt(b.big, 0)}`,
      );
      el(
        g,
        'text',
        { x: CX - d - 4, y: CY - d - 4, 'text-anchor': 'end', fill: c.textMuted, 'font-family': monoFont, 'font-size': md },
        `λ₂ = ${fmt(b.small, 0)}`,
      );

      trail = el(g, 'g', {});
      ghost = el(g, 'g', {});
      ray = el(g, 'line', {
        x1: CX,
        y1: CY,
        x2: CX,
        y2: CY,
        stroke: c.primary,
        'stroke-opacity': 0.35,
        'stroke-dasharray': '3 3',
      });
      arrowLine = el(g, 'line', { x1: CX, y1: CY, x2: CX, y2: CY, stroke: c.primary, 'stroke-width': 3.5 });
      arrowHead = el(g, 'polygon', { points: '', fill: c.primary });
      arrowLabel = el(
        g,
        'text',
        { x: CX, y: CY, fill: c.primary, 'font-family': monoFont, 'font-size': md, 'font-weight': 600 },
        'v',
      );

      // ── 로그 눈금 ──
      el(
        g,
        'text',
        { x: PX0, y: PY0 - 26, fill: c.text, 'font-family': bodyFont, 'font-size': md, 'font-weight': 600 },
        t('plot.title', 'tan(gap) after each product · log scale'),
      );
      const thY = plotY(b.thresholdLog);
      el(g, 'rect', { x: PX0, y: thY, width: PX1 - PX0, height: PY1 - thY, fill: c.bgSubtle });
      el(g, 'rect', { x: PX0, y: PY0, width: PX1 - PX0, height: PY1 - PY0, fill: 'none', stroke: c.border });
      for (let e = b.logMin; e <= b.logMax; e++) {
        const y = plotY(e);
        el(g, 'line', { x1: PX0, y1: y, x2: PX1, y2: y, stroke: c.border, 'stroke-opacity': 0.6 });
        el(
          g,
          'text',
          { x: PX0 - 6, y: y + 4, 'text-anchor': 'end', fill: c.textMuted, 'font-family': monoFont, 'font-size': sm },
          decadeLabel(e),
        );
      }
      for (let k = 0; k <= b.products; k++) {
        el(
          g,
          'text',
          { x: plotX(k), y: PY1 + 15, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': monoFont, 'font-size': sm },
          fmt(k, 0),
        );
      }
      el(
        g,
        'text',
        { x: PX1, y: PY1 + 31, 'text-anchor': 'end', fill: c.textMuted, 'font-family': bodyFont, 'font-size': sm },
        t('plot.axis', 'product k'),
      );
      el(g, 'line', {
        x1: PX0,
        y1: thY,
        x2: PX1,
        y2: thY,
        stroke: c.accent,
        'stroke-width': 1.5,
        'stroke-dasharray': '5 3',
      });
      el(g, 'text', { x: PX1 + 5, y: thY + 4, fill: c.accent, 'font-family': monoFont, 'font-size': sm }, '1°');
      polyline = el(g, 'polyline', { points: '', fill: 'none', stroke: c.primary, 'stroke-opacity': 0.5 });
      points = el(g, 'g', {});

      // 옆의 범례 — 채움 · 속 빈 점
      const ly = PY1 + 31;
      el(g, 'circle', { cx: PX0 - 20, cy: ly - 4, r: 4, fill: c.primary });
      el(
        g,
        'text',
        { x: PX0 - 12, y: ly, fill: c.textMuted, 'font-family': bodyFont, 'font-size': sm },
        t('legend.ccw', 'above the 45° line (y > x)'),
      );
      el(g, 'circle', { cx: PX0 - 20, cy: ly + 12, r: 4, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5 });
      el(
        g,
        'text',
        { x: PX0 - 12, y: ly + 16, fill: c.textMuted, 'font-family': bodyFont, 'font-size': sm },
        t('legend.cw', 'below the 45° line (y < x)'),
      );

      // ── 읽기 줄 ──
      lines = [];
      for (let i = 0; i < 6; i++) {
        lines.push(
          el(g, 'text', {
            x: LX,
            y: LY0 + i * LINE,
            fill: i === 0 ? c.text : c.textMuted,
            'font-family': i === 0 ? bodyFont : monoFont,
            'font-size': i === 0 ? md : sm,
            'font-weight': i === 0 ? 600 : 400,
          }),
        );
      }
      setLine(5, t('readout.expected', 'compare |λ₂| ÷ λ₁ = {q}', { q: fmt(b.ratioExpected, 3) }));
    }

    function plotPoint(r: EigenRowView): void {
      if (!points || !polyline) throw new Error('eigen-stage: 눈금이 없다');
      if (!board) throw new Error('eigen-stage: 판이 아직 없다');
      if (r.tanLog === null) {
        // 비를 두지 않는 판(출발이 고유 방향 줄 위)에서만 찍지 않는다
        if (board.showRatio) throw new Error(`eigen-stage: 곱 ${r.k} 의 tan(틈) 이 비었다`);
        return;
      }
      const x = plotX(r.k);
      const y = plotY(r.tanLog);
      if (r.side < 0) el(points, 'circle', { cx: x, cy: y, r: 4, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5 });
      else el(points, 'circle', { cx: x, cy: y, r: 4, fill: c.primary });
      if (r.alignedNow) el(points, 'circle', { cx: x, cy: y, r: 8, fill: 'none', stroke: c.accent, 'stroke-width': 2 });
      plotted.push(`${x},${y}`);
      polyline.setAttribute('points', plotted.join(' '));
    }

    function markTrail(x: number, y: number): void {
      if (!trail) throw new Error('eigen-stage: 궤적 자리가 없다');
      for (const old of Array.from(trail.children)) old.setAttribute('opacity', '0.45');
      // 궤적 자국은 화살표(primary)와 다른 톤으로 — 원점 가까이에서 v 와 겹쳐 읽히지 않게
      el(trail, 'circle', { cx: px(x), cy: py(y), r: 2, fill: c.textMuted });
      const len = Math.hypot(x, y);
      el(trail, 'line', {
        x1: CX + (x / len) * R * 0.93,
        y1: CY - (y / len) * R * 0.93,
        x2: CX + (x / len) * R,
        y2: CY - (y / len) * R,
        stroke: c.primary,
        'stroke-width': 2,
      });
    }

    function readouts(r: EigenRowView, extra: EigenProductView | null): void {
      if (!board) throw new Error('eigen-stage: 판이 아직 없다');
      const head =
        r.k === 0
          ? t('readout.start', 'Start — before the first product')
          : t('readout.product', 'Product {k} of {n}', { k: r.k, n: board.products });
      setLine(0, head);
      const vLine = `v (${fmt(r.vx, 2)}, ${fmt(r.vy, 2)}) · ${fmt(r.angle, 1)}°`;
      setLine(1, vLine);
      setLine(
        2,
        extra
          ? `w (${fmt(extra.wx, 2)}, ${fmt(extra.wy, 2)}) · ${t('readout.stretch', 'stretched ×{s}', { s: fmt(extra.stretch, 2) })}`
          : '',
      );
      let gapLine = t('readout.gap', 'gap {g}°', { g: fmt(r.gap, 2) });
      if (!board.showRatio) gapLine += ` · ${t('readout.noRatio', 'no tan ratio at this gap')}`;
      else if (extra) {
        if (extra.tanRatio === null) throw new Error('eigen-stage: tan 비가 비었다');
        gapLine += ` · ${t('readout.ratio', 'tan ratio {r}', { r: fmt(extra.tanRatio, 3) })}`;
      }
      setLine(3, gapLine);
      let alignLine = '';
      if (r.last) {
        alignLine =
          r.first === -1
            ? t('readout.never', 'first product within 1°: none')
            : t('readout.firstAligned', 'first product within 1°: {k}', { k: r.first });
      } else if (r.first !== -1 && r.k >= r.first && r.inside) {
        alignLine = t('readout.alignedAt', 'within 1° since product {k}', { k: r.first });
      }
      setLine(4, alignLine);
    }

    const stage: EigenStage = {
      board(b, motionMs) {
        const prev = tip;
        buildBoard(b);
        const toA = Math.atan2(b.vy, b.vx);
        if (!prev || (prev.x === 0 && prev.y === 0)) {
          drawArrow(b.vx, b.vy);
          return;
        }
        const fromA = Math.atan2(prev.y, prev.x);
        let delta = toA - fromA;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        const fromLen = Math.hypot(prev.x, prev.y);
        animate(
          motionMs,
          (u) => {
            const a = fromA + delta * u;
            const len = fromLen + (1 - fromLen) * u;
            if (u >= 1) drawArrow(b.vx, b.vy);
            else drawArrow(Math.cos(a) * len, Math.sin(a) * len);
          },
          () => undefined,
        );
      },
      origin(r) {
        finishMotion();
        if (!board) throw new Error('eigen-stage: 판 머리 없이 걸음 0 이 왔다');
        drawArrow(r.vx, r.vy);
        markTrail(r.vx, r.vy);
        plotPoint(r);
        readouts(r, null);
      },
      product(r, motionMs) {
        if (!board || !ghost) throw new Error('eigen-stage: 판 머리 없이 곱이 왔다');
        finishMotion();
        const from = tip;
        if (!from) throw new Error('eigen-stage: 화살표의 앞 자리가 없다');
        const g = ghost;
        while (g.firstChild) g.removeChild(g.firstChild);
        animate(
          motionMs,
          (u) => {
            if (u < 0.5) {
              const s = u * 2;
              drawArrow(from.x + (r.wx - from.x) * s, from.y + (r.wy - from.y) * s);
            } else {
              const s = (u - 0.5) * 2;
              drawArrow(r.wx + (r.vx - r.wx) * s, r.wy + (r.vy - r.wy) * s);
            }
          },
          () => {
            el(g, 'line', {
              x1: CX,
              y1: CY,
              x2: px(r.wx),
              y2: py(r.wy),
              stroke: c.textMuted,
              'stroke-width': 1.5,
              'stroke-dasharray': '4 3',
            });
            el(g, 'circle', { cx: px(r.wx), cy: py(r.wy), r: 3, fill: c.textMuted });
            el(
              g,
              'text',
              { x: px(r.wx) + 6, y: py(r.wy) - 6, fill: c.textMuted, 'font-family': monoFont, 'font-size': md },
              'w',
            );
            markTrail(r.vx, r.vy);
            plotPoint(r);
            readouts(r, r);
          },
        );
      },
      reset() {
        clearAll();
        board = null;
        tip = null;
      },
      destroy() {
        clearAll();
      },
    };

    params.onScrubStart?.(() => cancelMotion());

    return stage as unknown as ViewInstance;
  },
};
