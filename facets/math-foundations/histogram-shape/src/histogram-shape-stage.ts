/**
 * histogram-shape 무대 — 뽑힌 큰 눈이 제 칸으로 떨어져 쌓인다.
 *
 * 동사 "쌓인다": 표본 하나가 칸 위에서 떨어져 그 칸을 한 개만큼 높인다. 처음 세 걸음은 두 주사위를
 * 제 눈의 칸 위에 두고 큰 눈의 복제가 떨어진다. 뒤 걸음은 여럿이 차례로 쏟아지고, 한 개가 너무 얇아지면
 * 칸마다 더해진 몫이 한 덩어리로 떨어진다. 세로 축척은 가장 높은 칸에 맞춰 걸음마다 다시 잡는다 —
 * 보이는 것은 개수의 크기가 아니라 칸들 사이의 차례다.
 */

import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
} from '@ffacet/core/runtime';
import type { HistogramShapeScene, HistogramShapeStep } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 404;

const PAD_L = 40;
const PAD_R = 40;
const PLOT_TOP = 112;
const PLOT_BOT = 300;
/** 한 칸의 세로 축척 하한 — 표본이 몇 개 없을 때 한 개가 칸 전체를 채우지 않게 */
const MIN_SCALE = 4;
/** 한 개를 낱개로 떨어뜨릴 수 있는 가장 얇은 두께(px). 이보다 얇으면 칸마다 한 덩어리로 */
const MIN_UNIT_PX = 4;
const MOTION_MS = 400;
/** 운동의 앞 몫 동안 축척을 앞 걸음 것에서 이번 걸음 것으로 옮긴다 */
const RESCALE_SHARE = 0.4;

type Frame = { step: HistogramShapeStep; p: number };

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function scaleOf(bins: readonly number[]): number {
  return Math.max(MIN_SCALE, ...bins);
}

function easeOut(q: number): number {
  return 1 - (1 - q) * (1 - q);
}

function easeIn(q: number): number {
  return q * q;
}

function clamp01(q: number): number {
  return q < 0 ? 0 : q > 1 ? 1 : q;
}

export const histogramShapeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function node<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      if (text !== undefined) e.textContent = text;
      parent.appendChild(e);
      return e;
    }

    function binGeom(faces: number, k: number): { cx: number; w: number; x: number } {
      const binW = (PIECE_CANVAS_W - PAD_L - PAD_R) / faces;
      const cx = PAD_L + binW * (k + 0.5);
      const w = binW * 0.62;
      return { cx, w, x: cx - w / 2 };
    }

    /** 주사위 한 면 — 제 눈의 칸 위에 선다 */
    function die(parent: Element, cx: number, top: number, size: number, value: number, chosen: boolean): void {
      node(parent, 'rect', {
        x: cx - size / 2,
        y: top,
        width: size,
        height: size,
        rx: size * 0.18,
        fill: chosen ? colors.accent : colors.bg,
        stroke: chosen ? colors.primary : colors.textMuted,
        'stroke-width': chosen ? 2 : 1.5,
      });
      const ink = chosen ? colors.stateInk : colors.textMuted;
      const off = size * 0.27;
      const spots: Record<number, Array<[number, number]>> = {
        1: [[0, 0]],
        2: [[-1, -1], [1, 1]],
        3: [[-1, -1], [0, 0], [1, 1]],
        4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
        6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
      };
      const pips = spots[value];
      if (pips === undefined) {
        // 여섯 면이 아닌 주사위는 눈을 수로 적는다
        node(parent, 'text', {
          x: cx,
          y: top + size / 2 + smPx * 0.36,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: ink,
        }, String(value));
        return;
      }
      for (const [dx, dy] of pips) {
        node(parent, 'circle', { cx: cx + dx * off, cy: top + size / 2 + dy * off, r: size * 0.085, fill: ink });
      }
    }

    function dieSize(faces: number): number {
      const binW = (PIECE_CANVAS_W - PAD_L - PAD_R) / faces;
      return Math.min(34, binW * 0.4);
    }

    /** 두 주사위의 자리. 같은 눈이면 한 칸 위에 나란히 */
    function dicePlaces(faces: number, roll: { a: number; b: number }): { a: number; b: number } {
      const ga = binGeom(faces, roll.a - 1);
      const gb = binGeom(faces, roll.b - 1);
      if (roll.a !== roll.b) return { a: ga.cx, b: gb.cx };
      const s = dieSize(faces);
      return { a: ga.cx - s * 0.62, b: gb.cx + s * 0.62 };
    }

    const DICE_TOP = 50;

    function paint(scene: HistogramShapeScene, frame: Frame | null): void {
      svg.textContent = '';
      const faces = scene.faces;
      const plotH = PLOT_BOT - PLOT_TOP;
      const step = scene.step;

      // 축척 — 운동 중에는 앞 걸음의 축척에서 이번 걸음의 축척으로 옮겨 간다
      const scaleAfter = scaleOf(scene.bins);
      let scale = scaleAfter;
      if (frame !== null) {
        const scaleBefore = scaleOf(frame.step.before);
        scale = scaleBefore + (scaleAfter - scaleBefore) * easeOut(clamp01(frame.p / RESCALE_SHARE));
      }
      const u = plotH / scale;

      node(svg, 'text', {
        x: PAD_L,
        y: 26,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': 600,
        fill: colors.text,
      }, t('label.samples', 'Samples: {n}', { n: frame !== null ? frame.step.from : scene.samples }));

      // 떨어지는 것 — 운동 중에만
      const shown: number[] = frame !== null ? frame.step.before.slice() : scene.bins.slice();
      const falling: Array<{ x: number; y: number; w: number; h: number }> = [];
      if (frame !== null) {
        const fs = frame.step;
        const unitMode = plotH / scaleAfter >= MIN_UNIT_PX;
        const land = frame.p;
        if (unitMode) {
          const n = fs.drops.length;
          const seen = new Array<number>(faces).fill(0);
          fs.drops.forEach((d, i) => {
            const k = d - 1;
            const slot = fs.before[k]! + seen[k]!;
            seen[k]! += 1;
            const t0 = n === 1 ? 0 : (i / n) * 0.5;
            const dur = n === 1 ? 1 : 0.5;
            const q = clamp01((land - t0) / dur);
            if (q <= 0) return;
            const g = binGeom(faces, k);
            const restY = PLOT_BOT - (slot + 1) * u;
            let startY = PLOT_TOP - u - 24;
            if (fs.roll !== null) startY = DICE_TOP + dieSize(faces) - u;
            if (q >= 1) {
              shown[k]! += 1;
              falling.push({ x: g.x, y: restY, w: g.w, h: u });
            } else {
              falling.push({ x: g.x, y: startY + (restY - startY) * easeIn(q), w: g.w, h: u });
            }
          });
        } else {
          const q = clamp01(land);
          fs.added.forEach((a, k) => {
            if (a === 0) return;
            const g = binGeom(faces, k);
            const h = a * u;
            const restY = PLOT_BOT - (fs.before[k]! + a) * u;
            const startY = PLOT_TOP - h - 12;
            if (q >= 1) shown[k] = fs.before[k]! + a;
            falling.push({ x: g.x, y: startY + (restY - startY) * easeIn(q), w: g.w, h });
          });
        }
      }

      // 칸의 막대 — 정적 화면에서는 이번 걸음에 더해진 몫을 강조로 남긴다
      const order = frame === null ? scene.order : null;
      const marked = new Set<number>();
      if (order !== null && order.kind !== 'ordered') {
        marked.add(order.taller - 1);
        marked.add(order.shorter - 1);
      }
      for (let k = 0; k < faces; k += 1) {
        const g = binGeom(faces, k);
        // 쌓기 전 몫은 장면의 before — 걸음이 없으면(걸음 0) 지금 칸이 곧 전부다
        const base = frame !== null ? frame.step.before[k]! : step !== null ? step.before[k]! : scene.bins[k]!;
        if (base > 0) {
          node(svg, 'rect', { x: g.x, y: PLOT_BOT - base * u, width: g.w, height: base * u, fill: colors.primary });
        }
        if (frame === null && step !== null && step.added[k]! > 0) {
          const a = step.added[k]!;
          node(svg, 'rect', {
            x: g.x,
            y: PLOT_BOT - (base + a) * u,
            width: g.w,
            height: a * u,
            fill: colors.accent,
            stroke: colors.primary,
            'stroke-width': 1,
          });
        }
        let labelY = PLOT_BOT - shown[k]! * u - 6;
        // 어긴 짝의 선이 낮은 칸의 수를 가리지 않게 그 선 위로 올린다
        if (order !== null && order.kind !== 'ordered' && k === order.shorter - 1) {
          labelY = Math.min(labelY, PLOT_BOT - scene.bins[order.taller - 1]! * u - 6);
        }
        node(svg, 'text', {
          x: g.cx,
          y: labelY,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': marked.has(k) ? 700 : 400,
          fill: marked.has(k) ? colors.danger : colors.text,
        }, String(shown[k]!));
        node(svg, 'text', {
          x: g.cx,
          y: PLOT_BOT + 20,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.text,
        }, String(k + 1));
      }
      for (const f of falling) {
        node(svg, 'rect', {
          x: f.x,
          y: f.y,
          width: f.w,
          height: Math.max(f.h, 1),
          fill: colors.accent,
          stroke: colors.primary,
          'stroke-width': 1,
        });
      }

      node(svg, 'line', {
        x1: PAD_L - 8,
        y1: PLOT_BOT,
        x2: PIECE_CANVAS_W - PAD_R + 8,
        y2: PLOT_BOT,
        stroke: colors.border,
        'stroke-width': 1.5,
      });
      node(svg, 'text', {
        x: PIECE_CANVAS_W / 2,
        y: PLOT_BOT + 40,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      }, t('label.axis', 'Larger of two dice', {}));

      // 차례를 어긴 짝 — 작은 눈의 칸 높이에서 큰 눈의 칸까지 선을 긋는다
      if (order !== null && order.kind !== 'ordered') {
        const gt = binGeom(faces, order.taller - 1);
        const gs = binGeom(faces, order.shorter - 1);
        const y = PLOT_BOT - scene.bins[order.taller - 1]! * u;
        node(svg, 'line', {
          x1: gt.x,
          y1: y,
          x2: gs.x + gs.w,
          y2: y,
          stroke: colors.danger,
          'stroke-width': 2,
          'stroke-dasharray': '6 4',
        });
      }

      // 두 주사위 — 이번 걸음이 표본 하나일 때
      if (step !== null && step.roll !== null) {
        const roll = step.roll;
        const s = dieSize(faces);
        const at = dicePlaces(faces, roll);
        // 떨어진 눈(drops[0])과 같은 쪽을 고른다. 두 눈이 같으면 첫째
        const dropped = step.drops[0]!;
        if (roll.a !== dropped && roll.b !== dropped) throw new Error('histogram-shape 무대: 떨어진 눈이 두 주사위 어느 쪽과도 다르다');
        const aChosen = roll.a === dropped;
        die(svg, at.a, DICE_TOP, s, roll.a, aChosen);
        die(svg, at.b, DICE_TOP, s, roll.b, !aChosen);
      }

      // 캡션 — 지금 일어나는 일
      const capX = PIECE_CANVAS_W / 2;
      let line1: string;
      if (step === null) {
        line1 = t('caption.empty', 'No samples yet — every bin is empty.', {});
      } else if (step.roll !== null) {
        line1 = t('caption.single', 'Dice show {a} and {b}; the larger, {m}, drops into its bin.', {
          a: step.roll.a,
          b: step.roll.b,
          m: step.drops[0]!,
        });
      } else {
        line1 = t('caption.batch', 'Samples {from} → {to}: {k} more pour in at once.', {
          from: step.from,
          to: step.to,
          k: step.drops.length,
        });
      }
      node(svg, 'text', {
        x: capX,
        y: 372,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      }, line1);

      if (order !== null) {
        let line2: string;
        if (order.kind === 'ordered') {
          line2 = t('order.ordered', 'Heights rise in order: {list}.', { list: scene.bins.join(' < ') });
        } else if (order.kind === 'inverted') {
          line2 = t('order.inverted', 'Not yet in order: bin {taller} holds {tc}, more than bin {shorter} with {sc}.', {
            taller: order.taller,
            shorter: order.shorter,
            tc: scene.bins[order.taller - 1]!,
            sc: scene.bins[order.shorter - 1]!,
          });
        } else {
          line2 = t('order.level', 'Not yet in order: bins {taller} and {shorter} are level at {c}.', {
            taller: order.taller,
            shorter: order.shorter,
            c: scene.bins[order.taller - 1]!,
          });
        }
        node(svg, 'text', {
          x: capX,
          y: 394,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: order.kind === 'ordered' ? colors.text : colors.danger,
          'font-weight': order.kind === 'ordered' ? 600 : 400,
        }, line2);
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          timers.delete(id);
          clearTimeout(id);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    const renderer: SceneRenderer<HistogramShapeScene> = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (!opts.animate || next.step === null) {
          paint(next, null);
          return;
        }
        const step = next.step;
        const start = performance.now();
        paint(next, { step, p: 0 });
        for (;;) {
          if (mine !== gen || destroyed) return;
          await wait(16);
          if (mine !== gen || destroyed) return;
          const p = Math.min(1, (performance.now() - start) / MOTION_MS);
          if (p >= 1) break;
          paint(next, { step, p });
        }
        paint(next, null);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
