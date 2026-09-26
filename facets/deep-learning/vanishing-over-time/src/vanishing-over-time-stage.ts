/**
 * vanishing-over-time stage — 펼친 셀 줄 위에 기울기 막대를 세운다.
 *
 * 동사는 "줄어든다". 한 걸음 거슬러 갈 때마다 기울기 막대의 복제가 셀 하나 왼쪽으로
 * 미끄러지며 곱한 몫만큼 키가 준다. 지나온 막대는 제자리에 남아 거리에 따라 낮아지는 줄을
 * 이루고, 건넌 틈마다 곱한 몫이 남는다. 틈마다 놓인 w_h 는 같은 하나다.
 */
import {
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
import type { VanishingOverTimeScene, VanishingReach, VanishingSceneSymbols } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 400;

const MARGIN_X = 28;
const CAPTION_Y = 26;
const FORMULA_Y = 52;
const BAR_TOP_Y = 96;
const BAR_BASE_Y = 222;
const CELL_TOP_Y = 234;
const CELL_H = 40;
const CELL_W_MAX = 48;
const BAR_W_MAX = 30;
const ARC_DROP = 20;
const FACTOR_Y = 306;
const STATUS_Y = 330;

type Symbols = VanishingSceneSymbols;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function fx2(v: number): string {
  return v.toFixed(2);
}

function fx3(v: number): string {
  return v.toFixed(3);
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, typeof value === 'number' ? String(round(value)) : value);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  content: string,
  style: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': style.mono === true ? fonts.mono : fonts.body,
    'font-size': style.size,
    fill: style.fill,
    'text-anchor': style.anchor ?? 'middle',
  });
  if (style.weight !== undefined) node.setAttribute('font-weight', style.weight);
  node.textContent = content;
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const vanishingOverTimeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const palette: Palette = getColors(params.theme);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const layout = (n: number) => {
      const colW = (PIECE_CANVAS_W - 2 * MARGIN_X) / n;
      const cellW = Math.min(CELL_W_MAX, colW * 0.58);
      const barW = Math.min(BAR_W_MAX, colW * 0.42);
      const cx = (k: number): number => MARGIN_X + colW * (k - 0.5);
      const barH = (g: number): number => Math.max(1, (BAR_BASE_Y - BAR_TOP_Y) * g);
      return { colW, cellW, barW, cx, barH };
    };

    const hName = (sym: Symbols, k: number): string => [sym.hidden, String(k)].join('');
    const gradName = (sym: Symbols, last: number, k: number): string =>
      [sym.partial, hName(sym, last), '/', sym.partial, hName(sym, k)].join('');

    /** 장면 하나의 화면 전체. 운동이 만질 손잡이를 돌려준다. */
    // 바탕이 없는 장면은 init 앞의 첫 장면뿐이다 — 빈 캔버스로 둔다
    function drawStatic(scene: VanishingOverTimeScene): {
      bar: SVGRectElement;
      value: SVGTextElement;
      arc: SVGPathElement | null;
    } | null {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return null;
      const symbols = base.symbols;
      const n = base.hs.length;
      const { cellW, barW, cx, barH } = layout(n);
      const last = n;
      const step = scene.step;
      const current: VanishingReach | undefined = scene.reached[scene.reached.length - 1];
      const currentK = current === undefined ? last : current.k;
      const currentGrad = current === undefined ? base.start : current.grad;

      // 캡션 — 지금 일어나는 일
      const caption =
        step !== null && step.kind === 'back' && current !== undefined
          ? t('caption.back', 'One step back, reaching {h}. Factor multiplied in: {factor}.', {
              h: hName(symbols, current.k),
              factor: fx2(current.factor),
            })
          : t('caption.start', 'The gradient starts at the last hidden state.');
      label(svg, PIECE_CANVAS_W / 2, CAPTION_Y, caption, { size: fontSizes.md, fill: palette.text });

      // 식 한 줄 — 곱한 몫과 닿은 기울기
      const gradLine = t('formula.grad', '{grad} = {g}', {
        grad: gradName(symbols, last, currentK),
        g: fx3(currentGrad),
      });
      if (current !== undefined) {
        const factorLine = t('formula.factor', '{wh} {whv} × {slope} {slopev} = {factor}', {
          wh: symbols.wh,
          whv: fx2(base.wh),
          slope: symbols.slope,
          slopev: fx2(current.slope),
          factor: fx2(current.factor),
        });
        label(svg, MARGIN_X, FORMULA_Y, factorLine, {
          size: fontSizes.sm,
          fill: palette.text,
          anchor: 'start',
          mono: true,
        });
        label(svg, PIECE_CANVAS_W - MARGIN_X, FORMULA_Y, gradLine, {
          size: fontSizes.sm,
          fill: palette.itemActive,
          anchor: 'end',
          mono: true,
          weight: '600',
        });
      } else {
        label(svg, PIECE_CANVAS_W / 2, FORMULA_Y, gradLine, {
          size: fontSizes.sm,
          fill: palette.itemActive,
          mono: true,
          weight: '600',
        });
      }

      // 출발 기울기의 높이 — 점선 기준
      el(svg, 'line', {
        x1: MARGIN_X,
        x2: PIECE_CANVAS_W - MARGIN_X,
        y1: BAR_BASE_Y - barH(base.start),
        y2: BAR_BASE_Y - barH(base.start),
        stroke: palette.ghostOutline,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
      });
      label(svg, MARGIN_X, BAR_BASE_Y - barH(base.start) - 8, t('label.gradient', 'Gradient'), {
        size: fontSizes.xs,
        fill: palette.textMuted,
        anchor: 'start',
      });
      el(svg, 'line', {
        x1: MARGIN_X,
        x2: PIECE_CANVAS_W - MARGIN_X,
        y1: BAR_BASE_Y,
        y2: BAR_BASE_Y,
        stroke: palette.border,
        'stroke-width': 1,
      });

      // 셀 줄과 틈 (앞으로 흐르는 w_h)
      const passed = new Map<number, VanishingReach>();
      for (const r of scene.reached) passed.set(r.k, r);
      for (let k = 1; k <= n; k += 1) {
        const h = base.hs[k - 1];
        if (h === undefined) throw new Error(`vanishing-over-time 그림: h${k} 가 없다`);
        const isCurrent = k === currentK;
        el(svg, 'rect', {
          x: cx(k) - cellW / 2,
          y: CELL_TOP_Y,
          width: cellW,
          height: CELL_H,
          rx: 6,
          fill: palette.bg,
          stroke: isCurrent ? palette.itemActive : palette.border,
          'stroke-width': isCurrent ? 2 : 1,
        });
        label(svg, cx(k), CELL_TOP_Y + 15, hName(symbols, k), {
          size: fontSizes.xs,
          fill: palette.textMuted,
        });
        label(svg, cx(k), CELL_TOP_Y + 31, fx2(h), {
          size: fontSizes.sm,
          fill: palette.text,
          mono: true,
        });
        if (k < n) {
          const gx = (cx(k) + cx(k + 1)) / 2;
          const x1 = cx(k) + cellW / 2 + 2;
          const x2 = cx(k + 1) - cellW / 2 - 2;
          const crossing = current !== undefined && step?.kind === 'back' && current.k === k;
          const ink = crossing ? palette.itemActive : palette.textMuted;
          el(svg, 'line', {
            x1,
            x2,
            y1: CELL_TOP_Y + CELL_H - 12,
            y2: CELL_TOP_Y + CELL_H - 12,
            stroke: ink,
            'stroke-width': 1,
          });
          el(svg, 'path', {
            d: `M ${round(x2 - 4)} ${CELL_TOP_Y + CELL_H - 15} L ${round(x2)} ${CELL_TOP_Y + CELL_H - 12} L ${round(x2 - 4)} ${CELL_TOP_Y + CELL_H - 9}`,
            fill: 'none',
            stroke: ink,
            'stroke-width': 1,
          });
          const wl = label(svg, gx, CELL_TOP_Y + 16, symbols.wh, {
            size: fontSizes.xs,
            fill: ink,
            mono: true,
          });
          if (crossing) wl.setAttribute('font-weight', '700');
        }
      }

      // 건넌 틈마다 거슬러 가는 호와 곱한 몫
      let arcOut: SVGPathElement | null = null;
      for (const r of scene.reached) {
        const from = r.k + 1;
        const isNow = current !== undefined && r.k === current.k && step?.kind === 'back';
        const ink = isNow ? palette.itemActive : palette.textMuted;
        const xa = cx(from);
        const xb = cx(r.k);
        const y0 = CELL_TOP_Y + CELL_H + 2;
        const arc = el(svg, 'path', {
          d: `M ${round(xa)} ${y0} Q ${round((xa + xb) / 2)} ${y0 + ARC_DROP * 2} ${round(xb + 4)} ${y0 + 4}`,
          fill: 'none',
          stroke: ink,
          'stroke-width': isNow ? 2 : 1,
        });
        el(svg, 'path', {
          d: `M ${round(xb + 2)} ${y0 + 10} L ${round(xb + 4)} ${y0 + 4} L ${round(xb + 10)} ${y0 + 6}`,
          fill: 'none',
          stroke: ink,
          'stroke-width': isNow ? 2 : 1,
        });
        label(svg, (xa + xb) / 2, FACTOR_Y, t('label.factor', '× {factor}', { factor: fx2(r.factor) }), {
          size: fontSizes.xs,
          fill: ink,
          mono: true,
          weight: isNow ? '700' : '400',
        });
        if (isNow) arcOut = arc;
      }

      // 기울기 막대 — 출발(hN)과 닿은 자리마다
      const bars: { k: number; g: number }[] = [{ k: last, g: base.start }];
      for (const r of scene.reached) bars.push({ k: r.k, g: r.grad });
      let barOut: SVGRectElement | null = null;
      let valueOut: SVGTextElement | null = null;
      for (const b of bars) {
        const isNow = b.k === currentK;
        const bh = barH(b.g);
        const bar = el(svg, 'rect', {
          x: cx(b.k) - barW / 2,
          y: BAR_BASE_Y - bh,
          width: barW,
          height: bh,
          fill: isNow ? palette.itemActive : palette.itemSorted,
        });
        const value = label(svg, cx(b.k), BAR_BASE_Y - bh - 6, fx3(b.g), {
          size: fontSizes.xs,
          fill: isNow ? palette.itemActive : palette.textMuted,
          mono: true,
          weight: isNow ? '700' : '400',
        });
        if (isNow) {
          barOut = bar;
          valueOut = value;
        }
      }

      // 거리와 출발 대비
      const distance = current === undefined ? 0 : current.distance;
      label(svg, MARGIN_X, STATUS_Y, t('status.distance', 'Distance: {d}', { d: distance }), {
        size: fontSizes.sm,
        fill: palette.text,
        anchor: 'start',
      });
      label(
        svg,
        PIECE_CANVAS_W - MARGIN_X,
        STATUS_Y,
        t('status.share', 'Share of the start: {p}%', { p: ((currentGrad / base.start) * 100).toFixed(1) }),
        { size: fontSizes.sm, fill: palette.text, anchor: 'end' },
      );

      if (barOut === null || valueOut === null) {
        throw new Error(`vanishing-over-time 그림: 지금 기울기 막대(h${currentK})가 그려지지 않았다`);
      }
      return { bar: barOut, value: valueOut, arc: arcOut };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    /** 한 걸음 거슬러 — 막대의 복제가 왼쪽 셀로 미끄러지며 곱한 몫만큼 키가 준다. */
    async function slideBack(
      scene: VanishingOverTimeScene,
      handles: { bar: SVGRectElement; value: SVGTextElement; arc: SVGPathElement | null },
      mine: number,
    ): Promise<void> {
      const base = scene.base;
      const step = scene.step;
      const current = scene.reached[scene.reached.length - 1];
      if (base === null || step === null || step.kind !== 'back' || current === undefined) {
        throw new Error('vanishing-over-time 그림: 거슬러 가는 운동은 back 걸음에서만 흐른다');
      }
      const { barW, cx, barH } = layout(base.hs.length);
      const xFrom = cx(step.k + 1);
      const xTo = cx(step.k);
      const hFrom = barH(step.from);
      const hTo = barH(current.grad);
      if (handles.arc !== null) {
        handles.arc.setAttribute('pathLength', '1');
        handles.arc.setAttribute('stroke-dasharray', '1');
      }
      const frame = (p: number): void => {
        const e = ease(p);
        const x = xFrom + (xTo - xFrom) * e;
        const h = hFrom + (hTo - hFrom) * e;
        handles.bar.setAttribute('x', String(round(x - barW / 2)));
        handles.bar.setAttribute('y', String(round(BAR_BASE_Y - h)));
        handles.bar.setAttribute('height', String(round(h)));
        handles.value.setAttribute('x', String(round(x)));
        handles.value.setAttribute('y', String(round(BAR_BASE_Y - h - 6)));
        handles.arc?.setAttribute('stroke-dashoffset', String(round(1 - e)));
      };
      const start = Date.now();
      frame(0);
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / MOVE_MS);
        frame(p);
        if (p >= 1) break;
        await wait(16);
      }
    }

    return {
      async render(
        next: VanishingOverTimeScene,
        prev: VanishingOverTimeScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate || handles === null) return;
        // 바로 앞 장면에서 한 걸음 온 때만 흐르게 한다
        const oneStep =
          prev !== null &&
          next.step?.kind === 'back' &&
          prev.reached.length === next.reached.length - 1;
        if (!oneStep) return;
        await slideBack(next, handles, mine);
        if (mine !== gen || destroyed) return;
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
