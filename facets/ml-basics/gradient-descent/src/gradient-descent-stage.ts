/**
 * 경사 하강 무대 — 곡선 단면 하나 (가로 w · 세로 L) 위에서 **뛰는 점**.
 *
 * 갱신마다 점이 앞 자리에서 새 자리로 호를 그리며 건너뛰고, 그 호가 자국으로 남는다. 언덕을 넘는
 * 호는 강조색으로 남는다. 창 밖으로 간 자리는 창 가장자리 화살표와 w 값만 적는다. 끝 걸음에 선
 * 바닥이 표지를 받는다 (못 멈춤이면 오가는 두 자리, 곡선 밖이면 가장자리 화살표).
 *
 * 판 머리(`setup` · `begin`)에서 앞 판의 결론(자국 · 표지 · 캡션)을 걷고, 점만 제자리에서 새 출발
 * 자리로 곡선을 따라 미끄러진다.
 *
 * 셈은 하지 않는다 — 곡선 표본 · 바닥 · 언덕 · 창 범위 · 언덕 넘음 · 끝난 모양은 모두 payload 로 받는다.
 * 곡선을 따라 미끄러질 때의 높이도 받은 표본에서 찾아 읽는다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { fx, type Outcome, type Spot } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 640;
const H = 430;
const PLOT = { left: 56, right: 604, top: 60, bottom: 282 };
const L_PAD = 0.3;

export type StageSetup = {
  eta: number;
  start: number;
  window: { wMin: number; wMax: number; lMin: number; lMax: number };
  samples: [number, number][];
  deep: Spot;
  shallow: Spot;
  hump: Spot;
};
export type StageBegin = { w: number; loss: number; grad: number };
export type StageHop = {
  t: number;
  from: number;
  to: number;
  grad: number;
  loss: number;
  inWindow: boolean;
  crossed: boolean;
};
export type StageSettle = {
  outcome: Outcome;
  t: number;
  w: number;
  loss: number;
  absGrad: number;
  inWindow: boolean;
  pair: [Spot, Spot] | null;
  stopBelow: number;
};

export type GradientDescentStage = ViewInstance & {
  setup(p: StageSetup): void;
  begin(p: StageBegin, ms: number): void;
  hop(p: StageHop, ms: number): void;
  settle(p: StageSettle): void;
  reset(): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: SVGElement,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

let clipSeq = 0;

export const gradientDescentStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    const clipId = `gd-clip-${++clipSeq}`;
    const root = el('g', {}, svg);
    const defs = el('defs', {}, root);
    const clip = el('clipPath', { id: clipId }, defs);
    el('rect', { x: PLOT.left, y: PLOT.top, width: PLOT.right - PLOT.left, height: PLOT.bottom - PLOT.top }, clip);

    const staticLayer = el('g', {}, root);
    const trailLayer = el('g', {}, root);
    const markLayer = el('g', {}, root);
    const pointLayer = el('g', {}, root);
    const textLayer = el('g', {}, root);

    // 계속 쥐는 자리 — 점 (판을 건너 옮겨 간다)
    let dot: SVGCircleElement | null = null;
    let dotX = 0;
    let dotY = 0;
    /** 점이 창 안에 있을 때 그 w. 창 밖이거나 없으면 null */
    let dotW: number | null = null;

    let setupData: StageSetup | null = null;
    let lastTrail: SVGPathElement | null = null;
    let frame: number | null = null;
    let finish: (() => void) | null = null;
    let destroyed = false;

    const readout = el(
      'text',
      { x: PLOT.left, y: 358, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text },
      textLayer,
    );
    const caption = el(
      'text',
      { x: PLOT.left, y: 384, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text },
      textLayer,
    );
    const note = el(
      'text',
      { x: PLOT.left, y: 408, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.textMuted },
      textLayer,
    );

    const need = (): StageSetup => {
      if (!setupData) throw new Error('곡선을 받기 전에 그리라고 했다');
      return setupData;
    };
    const xOf = (w: number): number => {
      const s = need().window;
      return PLOT.left + ((w - s.wMin) / (s.wMax - s.wMin)) * (PLOT.right - PLOT.left);
    };
    const yOf = (loss: number): number => {
      const s = need().window;
      const lo = s.lMin - L_PAD;
      return PLOT.bottom - ((loss - lo) / (s.lMax - lo)) * (PLOT.bottom - PLOT.top);
    };
    /** 받은 표본에서 w 에 가장 가까운 자리의 L 을 읽는다 (셈이 아니라 찾아 읽기). */
    const sampleLoss = (w: number): number => {
      const s = need();
      const n = s.samples.length;
      const k = Math.round(((w - s.window.wMin) / (s.window.wMax - s.window.wMin)) * (n - 1));
      const hit = s.samples[Math.max(0, Math.min(n - 1, k))];
      if (!hit) throw new Error('곡선 표본이 비었다');
      return hit[1];
    };

    const stopMotion = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const f = finish;
      finish = null;
      if (f) f();
    };
    const animate = (ms: number, draw: (k: number) => void): void => {
      stopMotion();
      if (destroyed || isInstant() || ms <= 0) {
        draw(1);
        return;
      }
      const t0 = performance.now();
      finish = () => draw(1);
      const tick = (now: number): void => {
        if (destroyed) return;
        const k = Math.min(1, (now - t0) / ms);
        draw(k < 1 ? 1 - (1 - k) * (1 - k) : 1);
        if (k < 1) frame = requestAnimationFrame(tick);
        else {
          frame = null;
          finish = null;
        }
      };
      frame = requestAnimationFrame(tick);
    };
    params.onScrubStart?.(() => stopMotion());

    const clear = (g: SVGElement): void => {
      while (g.firstChild) g.removeChild(g.firstChild);
    };
    const setText = (node: SVGTextElement, text: string): void => {
      node.textContent = text;
    };
    const placeDot = (x: number, y: number): void => {
      if (!dot) {
        dot = el('circle', { r: 7, fill: c.primary, stroke: c.bg, 'stroke-width': 2 }, pointLayer);
      }
      dotX = x;
      dotY = y;
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
    };

    /** 창 가장자리 화살표와 w 값 — 창 밖으로 간 자리 */
    const edgeMark = (w: number, strong: boolean): { x: number; y: number } => {
      const s = need().window;
      const left = w < s.wMin;
      const x = left ? PLOT.left : PLOT.right;
      const y = PLOT.top + 12;
      const d = left ? -1 : 1;
      const size = strong ? 12 : 9;
      el(
        'polygon',
        {
          points: `${x + d * 4},${y - size / 2} ${x + d * (4 + size)},${y} ${x + d * 4},${y + size / 2}`,
          fill: c.danger,
        },
        markLayer,
      );
      const label = el(
        'text',
        {
          x: x - d * 14,
          y: y + 22,
          'text-anchor': left ? 'start' : 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': strong ? 700 : 400,
          fill: c.danger,
        },
        markLayer,
      );
      label.textContent = t('label.edge', 'w = {w}', { w: fx(w, 2) });
      return { x, y };
    };

    function setup(p: StageSetup): void {
      stopMotion();
      setupData = p;
      clear(staticLayer);
      clear(trailLayer);
      clear(markLayer);
      lastTrail = null;
      setText(readout, '');
      setText(caption, '');
      setText(note, '');

      const s = p.window;
      // 식과 손잡이 값
      const rule = el(
        'text',
        { x: PLOT.left, y: 26, 'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: c.text },
        staticLayer,
      );
      rule.textContent = t('label.rule', 'w ← w − η·g');
      const setting = el(
        'text',
        {
          x: PLOT.right,
          y: 26,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.textMuted,
        },
        staticLayer,
      );
      setting.textContent = t('label.setting', 'η = {eta} · w₀ = {start}', {
        eta: String(p.eta),
        start: fx(p.start, 2),
      });

      // 축
      el(
        'line',
        { x1: PLOT.left, y1: PLOT.bottom, x2: PLOT.right, y2: PLOT.bottom, stroke: c.border, 'stroke-width': 1 },
        staticLayer,
      );
      el(
        'line',
        { x1: PLOT.left, y1: PLOT.top, x2: PLOT.left, y2: PLOT.bottom, stroke: c.border, 'stroke-width': 1 },
        staticLayer,
      );
      for (let k = Math.ceil(s.wMin); k <= Math.floor(s.wMax); k++) {
        const x = xOf(k);
        el('line', { x1: x, y1: PLOT.bottom, x2: x, y2: PLOT.bottom + 4, stroke: c.border }, staticLayer);
        const tick = el(
          'text',
          {
            x,
            y: PLOT.bottom + 16,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          staticLayer,
        );
        tick.textContent = fx(k, 0);
      }
      const axisW = el(
        'text',
        {
          x: PLOT.right + 8,
          y: PLOT.bottom + 4,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.textMuted,
        },
        staticLayer,
      );
      axisW.textContent = t('label.axisW', 'w');
      const axisL = el(
        'text',
        {
          x: PLOT.left - 10,
          y: PLOT.top + 4,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: c.textMuted,
        },
        staticLayer,
      );
      axisL.textContent = t('label.axisL', 'L');

      // 곡선
      let d = '';
      p.samples.forEach(([w, loss], i) => {
        d += `${i === 0 ? 'M' : 'L'}${xOf(w).toFixed(1)},${yOf(loss).toFixed(1)}`;
      });
      el(
        'path',
        { d, fill: 'none', stroke: c.textMuted, 'stroke-width': 2, 'clip-path': `url(#${clipId})` },
        staticLayer,
      );

      // 언덕 — 두 바닥을 가르는 자리
      const hx = xOf(p.hump.w);
      const hy = yOf(p.hump.loss);
      el(
        'line',
        {
          x1: hx,
          y1: hy,
          x2: hx,
          y2: PLOT.bottom,
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        },
        staticLayer,
      );
      el('circle', { cx: hx, cy: hy, r: 3.5, fill: c.textMuted }, staticLayer);
      const humpLabel = el(
        'text',
        {
          x: hx,
          y: hy + 22,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        },
        staticLayer,
      );
      humpLabel.textContent = t('label.hump', 'hump · w {w}', { w: fx(p.hump.w, 2) });

      // 두 바닥
      const bottom = (spot: Spot, name: string): void => {
        const x = xOf(spot.w);
        const y = yOf(spot.loss);
        el('circle', { cx: x, cy: y, r: 4, fill: 'none', stroke: c.textMuted, 'stroke-width': 1.5 }, staticLayer);
        el(
          'line',
          { x1: x, y1: y + 5, x2: x, y2: PLOT.bottom, stroke: c.border, 'stroke-dasharray': '2 3' },
          staticLayer,
        );
        const label = el(
          'text',
          {
            x,
            y: PLOT.bottom + 32,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          },
          staticLayer,
        );
        label.textContent = name;
        const at = el(
          'text',
          {
            x,
            y: PLOT.bottom + 32 + smPx + 3,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          staticLayer,
        );
        at.textContent = t('label.bottomAt', 'w {w} · L {L}', { w: fx(spot.w, 2), L: fx(spot.loss, 2) });
      };
      bottom(p.deep, t('label.deep', 'deep valley'));
      bottom(p.shallow, t('label.shallow', 'shallow valley'));

      // 출발 자리 표지 (자리 — 결론이 아니다)
      const sx = xOf(p.start);
      el('line', { x1: sx, y1: PLOT.bottom - 6, x2: sx, y2: PLOT.bottom + 6, stroke: c.primary, 'stroke-width': 2 }, staticLayer);
      const w0 = el(
        'text',
        {
          x: sx,
          y: PLOT.bottom - 10,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.primary,
        },
        staticLayer,
      );
      w0.textContent = t('label.startMark', 'w₀');
    }

    function begin(p: StageBegin, ms: number): void {
      stopMotion();
      clear(trailLayer);
      clear(markLayer);
      lastTrail = null;
      setText(note, '');
      setText(readout, t('readout.inside', 'w {w}   L {L}', { w: fx(p.w, 2), L: fx(p.loss, 2) }));
      setText(caption, t('caption.start', 'Start · slope g = {g}', { g: fx(p.grad, 2) }));
      const tx = xOf(p.w);
      const ty = yOf(p.loss);
      const fromW = dotW;
      if (!dot || fromW === null) {
        placeDot(tx, ty);
      } else {
        // 곡선을 따라 새 출발 자리로 미끄러진다
        animate(ms, (k) => {
          const w = fromW + (p.w - fromW) * k;
          placeDot(xOf(w), k >= 1 ? ty : yOf(sampleLoss(w)));
        });
      }
      dotW = p.w;
    }

    function hop(p: StageHop, ms: number): void {
      stopMotion();
      clear(markLayer);
      if (lastTrail) {
        lastTrail.setAttribute('stroke-opacity', lastTrail.dataset.crossed === '1' ? '0.8' : '0.3');
      }
      const x0 = dotX;
      const y0 = dotY;
      let tx: number;
      let ty: number;
      if (p.inWindow) {
        tx = xOf(p.to);
        ty = yOf(p.loss);
      } else {
        const at = edgeMark(p.to, false);
        tx = at.x;
        ty = at.y;
      }
      const cx = (x0 + tx) / 2;
      const cy = Math.max(8, Math.min(y0, ty) - (0.3 * Math.abs(tx - x0) + 14));
      const trail = el(
        'path',
        {
          d: `M${x0},${y0}`,
          fill: 'none',
          stroke: p.crossed ? c.accent : c.primary,
          'stroke-width': p.crossed ? 2.5 : 1.5,
          'stroke-opacity': 0.9,
        },
        trailLayer,
      );
      trail.dataset.crossed = p.crossed ? '1' : '0';
      lastTrail = trail;
      animate(ms, (k) => {
        // 이차 베지어의 앞 k 몫 (de Casteljau)
        const qx = x0 + (cx - x0) * k;
        const qy = y0 + (cy - y0) * k;
        const bx = (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * cx + k * k * tx;
        const by = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * cy + k * k * ty;
        trail.setAttribute('d', `M${x0.toFixed(1)},${y0.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`);
        placeDot(bx, by);
      });
      dotW = p.inWindow ? p.to : null;

      if (p.inWindow) {
        setText(readout, t('readout.inside', 'w {w}   L {L}', { w: fx(p.to, 2), L: fx(p.loss, 2) }));
      } else {
        setText(readout, t('readout.outside', 'w {w}   (off the window)', { w: fx(p.to, 2) }));
      }
      setText(caption, t('caption.update', 'Update {t} · slope g = {g} · new w = {w}', {
        t: p.t,
        g: fx(p.grad, 2),
        w: fx(p.to, 2),
      }));
      setText(note, p.crossed ? t('caption.crossed', 'This jump went over the hump.') : '');
      note.setAttribute('fill', p.crossed ? c.text : c.textMuted);
    }

    function settle(p: StageSettle): void {
      stopMotion();
      clear(markLayer);
      const s = need();
      setText(note, '');
      if (p.outcome === 'deep' || p.outcome === 'shallow') {
        const spot = p.outcome === 'deep' ? s.deep : s.shallow;
        const x = xOf(p.w);
        const y = yOf(p.loss);
        el('circle', { cx: x, cy: y, r: 14, fill: 'none', stroke: c.primary, 'stroke-width': 2.5 }, markLayer);
        const tag = el(
          'text',
          {
            x: xOf(spot.w),
            y: y - 22,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': 700,
            fill: c.primary,
          },
          markLayer,
        );
        tag.textContent = t('label.stoodHere', 'stood here');
        setText(
          caption,
          p.outcome === 'deep'
            ? t('caption.settleDeep', 'Settled in the deep valley · |g| = {g} < {limit}', {
                g: fx(p.absGrad, 3),
                limit: String(p.stopBelow),
              })
            : t('caption.settleShallow', 'Settled in the shallow valley · |g| = {g} < {limit}', {
                g: fx(p.absGrad, 3),
                limit: String(p.stopBelow),
              }),
        );
      } else if (p.outcome === 'cap') {
        if (!p.pair) throw new Error('못 멈춤인데 오가는 두 자리가 없다');
        const [a, b] = p.pair;
        const ya = yOf(a.loss);
        const yb = yOf(b.loss);
        const xa = xOf(a.w);
        const xb = xOf(b.w);
        for (const [x, y] of [
          [xa, ya],
          [xb, yb],
        ] as const) {
          el('circle', { cx: x, cy: y, r: 10, fill: 'none', stroke: c.danger, 'stroke-width': 2 }, markLayer);
        }
        const top = Math.min(ya, yb) - 26;
        el(
          'line',
          { x1: xa, y1: top, x2: xb, y2: top, stroke: c.danger, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' },
          markLayer,
        );
        for (const x of [xa, xb]) {
          el('line', { x1: x, y1: top, x2: x, y2: top + 10, stroke: c.danger, 'stroke-width': 1.5 }, markLayer);
        }
        const tag = el(
          'text',
          {
            x: (xa + xb) / 2,
            y: top - 6,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': 700,
            fill: c.danger,
          },
          markLayer,
        );
        tag.textContent = t('label.swings', 'swings back and forth');
        setText(
          caption,
          t('caption.settleCap', 'No stop within {n} updates · swings {a} ↔ {b} · |g| = {g}', {
            n: p.t,
            a: fx(a.w, 2),
            b: fx(b.w, 2),
            g: fx(p.absGrad, 3),
          }),
        );
      } else {
        edgeMark(p.w, true);
        setText(caption, t('caption.settleBlowup', 'Left the curve · w = {w}', { w: fx(p.w, 2) }));
      }
    }

    function reset(): void {
      stopMotion();
      clear(staticLayer);
      clear(trailLayer);
      clear(markLayer);
      clear(pointLayer);
      dot = null;
      dotW = null;
      lastTrail = null;
      setupData = null;
      setText(readout, '');
      setText(caption, '');
      setText(note, '');
    }

    const instance: GradientDescentStage = {
      setup,
      begin,
      hop,
      settle,
      reset,
      destroy() {
        destroyed = true;
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        finish = null;
        root.remove();
      },
    };
    return instance;
  },
};
