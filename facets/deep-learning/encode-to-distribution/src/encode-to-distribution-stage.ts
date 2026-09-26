/**
 * encode-to-distribution 의 그림.
 *
 * 위에 입력 칸들, 가운데에 잠재 축 하나, 아래에 입력마다 μ±σ 띠 한 줄.
 * 동사는 "번진다" — 점이 입력에서 축 위 μ 로 내려앉고(place), 그 점이 σ 만큼 양옆으로 벌어져
 * 종 모양과 띠가 된다(spread). 번진 폭이 앞선 띠와 겹치면 그 구간이 칠해진다.
 * 마지막 걸음은 가운데 자리 z 의 선이 위에서 내려오며 곡선 · 띠와 만나는 자리를 짚는다.
 */
import {
  categorical,
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
import { normalDensity } from './algorithm.js';
import type { EncodeToDistributionScene, SceneAxis, SceneStep } from './scene.js';

const H = 470;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 400;
const FRAME_MS = 16;

const SIDE = 44;
const CELL_MAX = 26;
const CARD_LABEL_Y = 20;
const CELL_TOP = 30;
const PLOT_TOP = 122;
const AXIS_Y = 284;
const LANE_TOP = AXIS_Y + 50;
const LANE_GAP_MAX = 22;
const CAPTION_Y1 = H - 30;
const CAPTION_Y2 = H - 11;
const CURVE_SAMPLES = 140;

type Motion =
  | { kind: 'place'; index: number; p: number }
  | { kind: 'spread'; index: number; p: number }
  | { kind: 'probe'; p: number };

type Layout = {
  vMin: number;
  vMax: number;
  /** 밀도 1 이 몇 px 인가 */
  densityPx: number;
  cell: number;
  laneGap: number;
};

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function fmt(v: number, digits: number): string {
  const s = v.toFixed(digits);
  const clean = Number(s) === 0 ? s.replace('-', '') : s;
  return clean.replace('-', '−');
}

/** 알고리즘이 보낸 축의 바탕을 그림의 자리로 — 범위를 0.5 단위로 바깥으로 올린다 */
function makeLayout(axis: SceneAxis, inputCount: number): Layout {
  return {
    vMin: Math.floor(axis.lo * 2) / 2,
    vMax: Math.ceil(axis.hi * 2) / 2,
    densityPx: (AXIS_Y - PLOT_TOP - 22) / axis.peak,
    cell: CELL_MAX,
    laneGap: Math.min(LANE_GAP_MAX, (CAPTION_Y1 - 40 - LANE_TOP) / Math.max(1, inputCount - 1)),
  };
}

/** 입력 번호의 식별자 — 없으면 장면이 어긋난 것이라 던진다 */
function idOf(scene: EncodeToDistributionScene, i: number): string {
  const input = scene.inputs[i];
  if (input === undefined) {
    throw new Error(`encode-to-distribution 그림: 입력 ${i} 가 장면에 없다`);
  }
  return input.id;
}

export const encodeToDistributionStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();


    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { anchor?: string; size?: string; fill?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      return el(
        parent,
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'font-weight': opts.weight ?? 'normal',
          fill: opts.fill ?? colors.text,
        },
        text,
      );
    }

    function draw(scene: EncodeToDistributionScene, motion: Motion | null): void {
      svg.textContent = '';
      // 축의 바탕(init) 이 오기 전에는 그릴 것이 없다
      if (scene.axis === null) return;
      const n = scene.inputs.length;
      const L = makeLayout(scene.axis, n);
      const hues = categorical(n, 'vivid');
      const x0 = SIDE;
      const x1 = W - SIDE;
      const xOf = (v: number): number => x0 + ((v - L.vMin) / (L.vMax - L.vMin)) * (x1 - x0);
      const laneY = (i: number): number => LANE_TOP + i * L.laneGap;
      const hue = (i: number): string => {
        const c = hues[i];
        if (c === undefined) throw new Error(`encode-to-distribution 그림: 입력 ${i} 의 색이 없다`);
        return c;
      };

      el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });

      // 입력 칸 — 슬롯 가운데에 하나씩
      const slot = W / n;
      const cardBottom = CELL_TOP + L.cell;
      scene.inputs.forEach((input, i) => {
        const cx = slot * (i + 0.5);
        const cols = input.x.length;
        const cell = Math.min(L.cell, (slot - 24) / cols);
        const left = cx - (cell * cols) / 2;
        el(svg, 'rect', { x: cx - 16, y: CARD_LABEL_Y - 9, width: 8, height: 8, rx: 2, fill: hue(i) });
        label(svg, cx - 4, CARD_LABEL_Y, input.id, { anchor: 'start', weight: 'bold', size: fontSizes.md });
        input.x.forEach((v, c) => {
          const on = v !== 0;
          el(svg, 'rect', {
            x: left + c * cell + 1,
            y: CELL_TOP,
            width: cell - 2,
            height: cell - 2,
            rx: 3,
            fill: on ? colors.text : colors.bgSubtle,
            stroke: on ? colors.text : colors.border,
          });
          label(svg, left + c * cell + cell / 2, CELL_TOP + cell / 2 + 3, String(v), {
            fill: on ? colors.textInverse : colors.textMuted,
            mono: true,
            size: fontSizes.sm,
          });
        });
        const enc = scene.encodings[i];
        if (enc !== null && enc !== undefined) {
          label(svg, cx, cardBottom + 20, `μ ${fmt(enc.mu, 2)}`, { mono: true });
          if (enc.spread !== null) {
            label(svg, cx, cardBottom + 36, `σ ${fmt(enc.spread.sigma, 2)}`, { mono: true });
          }
        }
      });

      // 잠재 축
      el(svg, 'line', { x1: x0, y1: AXIS_Y, x2: x1, y2: AXIS_Y, stroke: colors.textMuted, 'stroke-width': 1.5 });
      for (let v = Math.ceil(L.vMin); v <= Math.floor(L.vMax); v += 1) {
        el(svg, 'line', { x1: xOf(v), y1: AXIS_Y, x2: xOf(v), y2: AXIS_Y + 5, stroke: colors.textMuted });
        label(svg, xOf(v), AXIS_Y + 18, fmt(v, 0), { fill: colors.textMuted, size: fontSizes.xs, mono: true });
      }
      label(svg, x0, AXIS_Y + 36, t('label.axis', 'latent axis'), {
        anchor: 'start',
        fill: colors.textMuted,
        size: fontSizes.xs,
      });

      // 겹침 — 띠 둘 사이를 칠한다. 이번 걸음에 번지는 입력의 겹침은 지금의 폭으로 자른다
      const spreading = motion?.kind === 'spread' ? motion : null;
      const halfNow = (i: number): number | null => {
        const enc = scene.encodings[i];
        if (enc === null || enc === undefined || enc.spread === null) return null;
        if (spreading !== null && spreading.index === i) return enc.spread.sigma * ease(spreading.p);
        return enc.spread.sigma;
      };
      scene.overlaps.forEach((o) => {
        const ea = scene.encodings[o.a];
        const eb = scene.encodings[o.b];
        const ha = halfNow(o.a);
        const hb = halfNow(o.b);
        if (ea === null || ea === undefined || eb === null || eb === undefined || ha === null || hb === null) {
          throw new Error(`encode-to-distribution 그림: 겹침 ${o.a}·${o.b} 의 입력이 아직 번지지 않았다`);
        }
        const lo = Math.max(ea.mu - ha, eb.mu - hb);
        const hi = Math.min(ea.mu + ha, eb.mu + hb);
        if (!(hi > lo)) return;
        const top = laneY(Math.min(o.a, o.b)) - 7;
        const bottom = laneY(Math.max(o.a, o.b)) + 7;
        el(svg, 'rect', {
          x: xOf(lo),
          y: top,
          width: xOf(hi) - xOf(lo),
          height: bottom - top,
          fill: colors.accent,
          'fill-opacity': 0.45,
        });
        if (spreading === null || spreading.index !== o.b || spreading.p >= 1) {
          label(svg, (xOf(lo) + xOf(hi)) / 2, laneY(n - 1) + 22, fmt(o.width, 2), {
            mono: true,
            size: fontSizes.xs,
            weight: 'bold',
          });
        }
      });

      // 입력마다 — 종 모양(번진 뒤) · 축 위의 μ 점 · 띠
      scene.encodings.forEach((enc, i) => {
        if (enc === null || enc === undefined) return;
        const color = hue(i);
        const placing = motion?.kind === 'place' && motion.index === i ? motion : null;
        if (placing !== null && placing.p < 1) {
          const e = ease(placing.p);
          const fromX = slot * (i + 0.5);
          const fromY = cardBottom + 4;
          el(svg, 'circle', {
            cx: fromX + (xOf(enc.mu) - fromX) * e,
            cy: fromY + (AXIS_Y - fromY) * e,
            r: 6,
            fill: color,
            stroke: colors.text,
          });
          return;
        }
        const half = halfNow(i);
        if (half !== null && half > 1e-3 && enc.spread !== null) {
          // 번지는 동안 높이는 끝 봉우리 그대로 두고 폭만 벌린다
          const peakPx = normalDensity(enc.mu, enc.mu, enc.spread.sigma) * L.densityPx;
          const pts: string[] = [];
          for (let k = 0; k <= CURVE_SAMPLES; k += 1) {
            const v = L.vMin + ((L.vMax - L.vMin) * k) / CURVE_SAMPLES;
            const d = v - enc.mu;
            const y = AXIS_Y - peakPx * Math.exp(-(d * d) / (2 * half * half));
            pts.push(`${round(xOf(v))},${round(y)}`);
          }
          el(svg, 'path', {
            d: `M${round(x0)},${AXIS_Y} L${pts.join(' L')} L${round(x1)},${AXIS_Y} Z`,
            fill: color,
            'fill-opacity': 0.16,
            stroke: 'none',
          });
          el(svg, 'path', { d: `M${pts.join(' L')}`, fill: 'none', stroke: color, 'stroke-width': 2 });
        }
        el(svg, 'circle', { cx: xOf(enc.mu), cy: AXIS_Y, r: 5, fill: color, stroke: colors.text });

        // 띠: 번지기 전엔 점, 번진 뒤엔 μ±σ
        const y = laneY(i);
        label(svg, xOf(enc.mu - (half ?? 0)) - 10, y + 4, idOf(scene, i), {
          anchor: 'end',
          weight: 'bold',
        });
        if (half !== null && half > 1e-3) {
          const a = xOf(enc.mu - half);
          const b = xOf(enc.mu + half);
          el(svg, 'line', { x1: a, y1: y, x2: b, y2: y, stroke: color, 'stroke-width': 4 });
          el(svg, 'line', { x1: a, y1: y - 6, x2: a, y2: y + 6, stroke: color, 'stroke-width': 2 });
          el(svg, 'line', { x1: b, y1: y - 6, x2: b, y2: y + 6, stroke: color, 'stroke-width': 2 });
          if (enc.spread !== null && (spreading === null || spreading.index !== i || spreading.p >= 1)) {
            label(svg, b + 8, y + 4, `${fmt(enc.spread.lo, 2)} .. ${fmt(enc.spread.hi, 2)}`, {
              anchor: 'start',
              mono: true,
              size: fontSizes.xs,
              fill: colors.textMuted,
            });
          }
        }
        el(svg, 'circle', { cx: xOf(enc.mu), cy: y, r: 4, fill: color, stroke: colors.text });
      });

      // 가운데 자리 z — 위에서 내려오는 선
      const probe = scene.probe;
      if (probe !== null) {
        const p = motion?.kind === 'probe' ? ease(motion.p) : 1;
        const zx = xOf(probe.z);
        const top = PLOT_TOP - 8;
        const bottom = laneY(n - 1) + 10;
        const reach = top + (bottom - top) * p;
        el(svg, 'line', {
          x1: zx,
          y1: top,
          x2: zx,
          y2: reach,
          stroke: colors.text,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        });
        label(svg, zx, top - 6, `z ${fmt(probe.z, 2)}`, { mono: true, weight: 'bold' });
        probe.densities.forEach((dens, i) => {
          const dy = AXIS_Y - dens * L.densityPx;
          if (dy <= reach) {
            el(svg, 'circle', { cx: zx, cy: dy, r: 4, fill: hue(i), stroke: colors.text });
          }
          const ly = laneY(i);
          if (ly <= reach) {
            const inside = probe.inside.includes(i);
            el(svg, 'circle', {
              cx: zx,
              cy: ly,
              r: 5,
              fill: inside ? hue(i) : colors.bg,
              stroke: inside ? colors.text : colors.textMuted,
              'stroke-width': inside ? 1.5 : 1,
            });
          }
        });
        if (p >= 1) {
          const bx = zx + 10;
          const rowH = 15;
          const by = PLOT_TOP - 2;
          el(svg, 'rect', {
            x: bx - 4,
            y: by - 12,
            width: 64,
            height: rowH * n + 6,
            rx: 4,
            fill: colors.bg,
            'fill-opacity': 0.9,
            stroke: colors.border,
          });
          probe.densities.forEach((dens, i) => {
            const ry = by + i * rowH;
            el(svg, 'rect', { x: bx, y: ry - 7, width: 7, height: 7, rx: 1, fill: hue(i) });
            label(svg, bx + 11, ry, `${idOf(scene, i)} ${fmt(dens, 3)}`, {
              anchor: 'start',
              mono: true,
              size: fontSizes.xs,
            });
          });
        }
      }

      drawCaption(scene, scene.step);
    }

    function idList(indices: number[], scene: EncodeToDistributionScene): string {
      if (indices.length === 0) return t('label.none', 'none');
      return indices.map((i) => idOf(scene, i)).join(' · ');
    }

    function drawCaption(scene: EncodeToDistributionScene, step: SceneStep): void {
      let line1 = '';
      let line2 = '';
      if (step.kind === 'start') {
        line1 = t('caption.start', 'Inputs: {n}. The latent axis is still empty.', { n: scene.inputs.length });
      } else if (step.kind === 'place') {
        const enc = scene.encodings[step.index];
        if (enc === null || enc === undefined) throw new Error('encode-to-distribution 그림: place 걸음에 μ 가 없다');
        line1 = t('caption.place', 'Mean head — {id}: μ = {mu}', {
          id: idOf(scene, step.index),
          mu: fmt(enc.mu, 2),
        });
      } else if (step.kind === 'spread') {
        const enc = scene.encodings[step.index];
        if (enc === null || enc === undefined || enc.spread === null) {
          throw new Error('encode-to-distribution 그림: spread 걸음에 σ 가 없다');
        }
        line1 = t('caption.spread', 'Spread head — {id}: log σ² = {logVar} · σ = {sigma} · μ±σ: {lo} .. {hi}', {
          id: idOf(scene, step.index),
          logVar: fmt(enc.spread.logVar, 2),
          sigma: fmt(enc.spread.sigma, 2),
          lo: fmt(enc.spread.lo, 2),
          hi: fmt(enc.spread.hi, 2),
        });
        const parts = step.overlaps.map((k) => {
          const o = scene.overlaps[k];
          if (o === undefined) throw new Error(`encode-to-distribution 그림: 겹침 ${k} 가 장면에 없다`);
          return t('caption.overlap', 'Overlap {a}·{b}: {width}', {
            a: idOf(scene, o.a),
            b: idOf(scene, o.b),
            width: fmt(o.width, 2),
          });
        });
        line2 = parts.join('   ');
      } else {
        const probe = scene.probe;
        if (probe === null) throw new Error('encode-to-distribution 그림: probe 걸음에 셈이 없다');
        const list = probe.densities
          .map((d, i) => `${idOf(scene, i)} ${fmt(d, 3)}`)
          .join(' · ');
        line1 = t('caption.probe', 'Midpoint z = {z} — density: {list}', { z: fmt(probe.z, 2), list });
        line2 = t('caption.probe.hits', 'Inside μ±σ: {inside} · On a μ point: {points}', {
          inside: idList(probe.inside, scene),
          points: idList(probe.onPoint, scene),
        });
      }
      label(svg, W / 2, CAPTION_Y1, line1, { size: fontSizes.md });
      if (line2 !== '') label(svg, W / 2, CAPTION_Y2, line2, { fill: colors.textMuted });
    }

    function motionOf(step: SceneStep, p: number): Motion | null {
      if (step.kind === 'place') return { kind: 'place', index: step.index, p };
      if (step.kind === 'spread') return { kind: 'spread', index: step.index, p };
      if (step.kind === 'probe') return { kind: 'probe', p };
      return null;
    }

    function run(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
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
          const p = Math.min(1, (Date.now() - start) / MOTION_MS);
          frame(p);
          if (p >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(
        next: EncodeToDistributionScene,
        _prev: EncodeToDistributionScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const first = motionOf(next.step, 0);
        if (!opts.animate || first === null || next.axis === null) {
          draw(next, null);
          return;
        }
        await run(mine, (p) => draw(next, motionOf(next.step, p)));
        if (mine === gen && !destroyed) draw(next, null);
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
