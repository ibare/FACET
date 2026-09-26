/**
 * weight-penalty 무대 — 무게 여섯이 저마다의 수직선 위에서 0 쪽으로 미끄러진다.
 *
 * 한 줄 = 무게 하나. 가운데 세로선이 0, 빈 고리는 출발 자리 a, 찬 점이 지금 w, 고리에서 점까지의 선이
 * 벌점이 깎아 낸 거리다. L1 이면 0 둘레에 폭 ηλ 의 띠가 펴지고, 데이터 마디 h 가 띠 안에 들면 점이
 * 0 에 붙어 네모로 바뀐다. L2 에는 띠가 없고 오른쪽 w / a 열이 여섯 줄 모두 같은 수를 보인다.
 *
 * 운동 — 판 머리(start)에 점이 앞 판의 끝 자리에서 a 로 돌아가고 띠가 새 ηλ 폭으로 펴지거나 접힌다.
 * 갱신마다 점이 새 자리로 미끄러진다 (L1 은 h 를 거쳐 두 마디로). 길이는 projector 가 재생 속도로 준다.
 *
 * 무대는 셈하지 않는다 — 자리 · 비 · 0 개수 · 축 범위 · 붙은 갱신은 모두 payload 로 받는다.
 */
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { CanvasView, Palette, ViewInstance } from '@ffacet/core/runtime';

const W = 720;
const H = 420;
const SVG_NS = 'http://www.w3.org/2000/svg';

const AXIS_L = 72;
const AXIS_R = 540;
const ZERO_X = (AXIS_L + AXIS_R) / 2;
const HALF = (AXIS_R - AXIS_L) / 2 - 14;
const VALUE_X = 612;
const RATIO_X = 700;
const ROWS_TOP = 96;
const ROWS_BOTTOM = 340;

export type WeightPenaltyStage = {
  init(p: { ids: string[]; start: number[]; extent: number; ratioSymbol: string }): void;
  start(
    p: {
      penalty: string;
      lamText: string;
      etaText: string;
      etaLam: number;
      etaLamText: string;
      formula: string;
      weights: number[];
      valueTexts: string[];
    },
    durMs: number,
  ): void;
  update(
    p: {
      h: number[] | null;
      weights: number[];
      valueTexts: string[];
      ratioTexts: string[];
      pinnedAt: (number | null)[];
      zeroCount: number;
      total: number;
    },
    durMs: number,
  ): void;
  count(p: { zeroCount: number; total: number }): void;
  setCaption(text: string): void;
  reset(): void;
  destroy(): void;
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

type Row = {
  ghost: SVGCircleElement;
  trail: SVGLineElement;
  band: SVGRectElement;
  dot: SVGCircleElement;
  pin: SVGRectElement;
  value: SVGTextElement;
  ratio: SVGTextElement;
  note: SVGTextElement;
  y: number;
};

export const weightPenaltyStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);

    const root = el('g', {});
    svg.appendChild(root);

    let rows: Row[] = [];
    let extent = 1;
    let ids: string[] = [];
    let total = 0;
    /** 지금 화면에 놓인 점의 값 (운동의 기억) */
    let shown: number[] = [];
    let startVals: number[] = [];
    let bandShown = 0;
    const frames = new Set<number>();

    // 머리 — 식 · 매개변수 · 0 개수 뱃지 · 캡션 · 범례
    const formula = el('text', { x: 16, y: 26, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text });
    formula.setAttribute('xml:space', 'preserve');
    const paramLine = el('text', { x: 16, y: 48, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted });
    paramLine.setAttribute('xml:space', 'preserve');
    const badge = el('text', { x: W - 16, y: 48, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.lg, 'font-weight': 600, fill: c.text });
    const caption = el('text', { x: 16, y: H - 44, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text });
    const legend = el('g', {});
    const grid = el('g', {});
    const rowsG = el('g', {});
    root.append(formula, paramLine, badge, grid, rowsG, caption, legend);

    const xOf = (v: number) => ZERO_X + (v / extent) * HALF;

    function cancelFrames(): void {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
    }
    params.onScrubStart?.(() => {
      cancelFrames();
      place(shownTarget, bandTarget);
    });

    let shownTarget: number[] = [];
    let bandTarget = 0;

    function place(vals: readonly number[], band: number): void {
      shown = vals.slice();
      bandShown = band;
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i];
        const x = xOf(vals[i]);
        r.dot.setAttribute('cx', String(x));
        r.pin.setAttribute('x', String(x - 6));
        r.trail.setAttribute('x2', String(x));
        const bw = (band / extent) * HALF;
        r.band.setAttribute('x', String(ZERO_X - bw));
        r.band.setAttribute('width', String(Math.max(0, 2 * bw)));
      }
    }

    /** 앞 자리 → 목표 자리로 미끄러진다. via 가 있으면 두 마디 (앞 → via → 목표). */
    function glide(to: readonly number[], band: number, durMs: number, via: readonly number[] | null): void {
      cancelFrames();
      shownTarget = to.slice();
      bandTarget = band;
      const from = shown.slice();
      const bandFrom = bandShown;
      if (isInstant() || durMs <= 0 || from.length !== to.length) {
        place(to, band);
        return;
      }
      const t0 = performance.now();
      const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
      const frame = (now: number) => {
        const u = Math.min(1, (now - t0) / durMs);
        const vals: number[] = [];
        for (let i = 0; i < to.length; i += 1) {
          if (via === null) vals.push(from[i] + (to[i] - from[i]) * ease(u));
          else if (u < 0.5) vals.push(from[i] + (via[i] - from[i]) * ease(u * 2));
          else vals.push(via[i] + (to[i] - via[i]) * ease(u * 2 - 1));
        }
        place(vals, bandFrom + (band - bandFrom) * ease(u));
        if (u < 1) {
          const id = requestAnimationFrame(frame);
          frames.add(id);
        }
      };
      frames.add(requestAnimationFrame(frame));
    }

    function drawLegend(showBand: boolean): void {
      legend.replaceChildren();
      const y = H - 16;
      legend.append(
        el('circle', { cx: 22, cy: y - 4, r: 5, fill: 'none', stroke: c.textMuted, 'stroke-width': 1.5 }),
        textAt(32, y, t('legend.start', 'start a')),
        el('circle', { cx: 142, cy: y - 4, r: 5, fill: c.primary }),
        textAt(152, y, t('legend.now', 'now w')),
      );
      if (showBand) {
        legend.append(
          el('rect', { x: 260, y: y - 9, width: 10, height: 10, fill: c.accent, stroke: c.text, 'stroke-width': 1 }),
          textAt(276, y, t('legend.pinned', 'stuck at 0')),
          el('rect', { x: 400, y: y - 10, width: 22, height: 12, fill: c.accent, 'fill-opacity': 0.22, stroke: c.accent, 'stroke-dasharray': '3 2' }),
          textAt(428, y, t('legend.band', 'band |h| ≤ ηλ — lands at 0')),
        );
      }
    }

    function textAt(x: number, y: number, s: string): SVGTextElement {
      const n = el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted });
      n.textContent = s;
      return n;
    }

    function clearConclusions(): void {
      badge.textContent = '';
      caption.textContent = '';
      for (const r of rows) {
        r.value.textContent = '';
        r.ratio.textContent = '';
        r.note.textContent = '';
        r.pin.setAttribute('visibility', 'hidden');
        r.dot.setAttribute('visibility', 'visible');
      }
    }

    const api: WeightPenaltyStage = {
      init(p) {
        cancelFrames();
        ids = p.ids.slice();
        total = ids.length;
        extent = p.extent;
        startVals = p.start.slice();
        grid.replaceChildren();
        rowsG.replaceChildren();
        rows = [];
        const pitch = (ROWS_BOTTOM - ROWS_TOP) / Math.max(1, total - 1);
        // 0 의 세로선 · 축 눈금
        grid.append(el('line', { x1: ZERO_X, y1: ROWS_TOP - 22, x2: ZERO_X, y2: ROWS_BOTTOM + 16, stroke: c.text, 'stroke-width': 1.5 }));
        for (const v of [-extent, extent]) {
          const tick = el('text', { x: xOf(v), y: ROWS_TOP - 26, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted });
          tick.textContent = v.toFixed(2);
          grid.append(tick);
        }
        const zero = el('text', { x: ZERO_X, y: ROWS_TOP - 26, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.text });
        zero.textContent = '0';
        const hv = el('text', { x: VALUE_X, y: ROWS_TOP - 26, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted });
        hv.textContent = 'w';
        const hr = el('text', { x: RATIO_X, y: ROWS_TOP - 26, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted });
        hr.setAttribute('xml:space', 'preserve');
        hr.textContent = p.ratioSymbol;
        grid.append(zero, hv, hr);

        for (let i = 0; i < total; i += 1) {
          const y = ROWS_TOP + pitch * i;
          const g = el('g', {});
          const label = el('text', { x: 24, y: y + 4, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text });
          label.textContent = ids[i];
          const axis = el('line', { x1: AXIS_L, y1: y, x2: AXIS_R, y2: y, stroke: c.border, 'stroke-width': 1 });
          const band = el('rect', { x: ZERO_X, y: y - 10, width: 0, height: 20, fill: c.accent, 'fill-opacity': 0.22, stroke: c.accent, 'stroke-dasharray': '3 2' });
          const ax = xOf(startVals[i]);
          const trail = el('line', { x1: ax, y1: y, x2: ax, y2: y, stroke: c.primary, 'stroke-width': 3, 'stroke-opacity': 0.35, 'stroke-linecap': 'round' });
          const ghost = el('circle', { cx: ax, cy: y, r: 7, fill: 'none', stroke: c.textMuted, 'stroke-width': 1.5 });
          const dot = el('circle', { cx: ax, cy: y, r: 6, fill: c.primary });
          const pin = el('rect', { x: ZERO_X - 6, y: y - 6, width: 12, height: 12, fill: c.accent, stroke: c.text, 'stroke-width': 1, visibility: 'hidden' });
          const value = el('text', { x: VALUE_X, y: y + 4, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text });
          const ratio = el('text', { x: RATIO_X, y: y + 4, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted });
          const note = el('text', { x: ZERO_X + 12, y: y - 9, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted });
          g.append(label, axis, band, trail, ghost, dot, pin, value, ratio, note);
          rowsG.appendChild(g);
          rows.push({ ghost, trail, band, dot, pin, value, ratio, note, y });
        }
        shown = startVals.slice();
        shownTarget = startVals.slice();
        bandShown = 0;
        bandTarget = 0;
        formula.textContent = '';
        paramLine.textContent = '';
        legend.replaceChildren();
        clearConclusions();
        place(shown, 0);
      },

      start(p, durMs) {
        if (rows.length === 0) throw new Error('weight-penalty-stage: init 전에 start 가 왔다');
        clearConclusions();
        formula.textContent = p.formula;
        paramLine.textContent = `η = ${p.etaText}   λ = ${p.lamText}   ηλ = ${p.etaLamText}`;
        badge.textContent = t('stage.zeros', 'At 0: {z} / {n}', { z: 0, n: total });
        drawLegend(p.penalty === 'L1');
        for (let i = 0; i < rows.length; i += 1) rows[i].value.textContent = p.valueTexts[i];
        glide(p.weights, p.penalty === 'L1' ? p.etaLam : 0, durMs, null);
      },

      update(p, durMs) {
        if (rows.length === 0) throw new Error('weight-penalty-stage: init 전에 update 가 왔다');
        for (let i = 0; i < rows.length; i += 1) {
          const r = rows[i];
          r.value.textContent = p.valueTexts[i];
          r.ratio.textContent = p.ratioTexts[i];
          const k = p.pinnedAt[i];
          if (k === null) {
            r.note.textContent = '';
            r.pin.setAttribute('visibility', 'hidden');
            r.dot.setAttribute('visibility', 'visible');
          } else {
            r.note.textContent = t('stage.pinned', '0 since update {k}', { k });
            r.pin.setAttribute('visibility', 'visible');
            r.dot.setAttribute('visibility', 'hidden');
          }
        }
        badge.textContent = t('stage.zeros', 'At 0: {z} / {n}', { z: p.zeroCount, n: p.total });
        glide(p.weights, bandTarget, durMs, p.h);
      },

      count(p) {
        badge.textContent = t('stage.zeros', 'At 0: {z} / {n}', { z: p.zeroCount, n: p.total });
      },

      setCaption(text) {
        caption.textContent = text;
      },

      reset() {
        cancelFrames();
        if (rows.length > 0) {
          place(startVals, 0);
          shownTarget = startVals.slice();
          bandTarget = 0;
        }
        formula.textContent = '';
        paramLine.textContent = '';
        legend.replaceChildren();
        clearConclusions();
      },

      destroy() {
        cancelFrames();
        root.remove();
      },
    };
    return api as unknown as ViewInstance;
  },
};
