/**
 * gradient-through-layers 무대.
 *
 * 한 줄 사슬 h_0 … h_4 가 가로로 놓이고, 마디 사이에 층 상자(곱하는 수 w_k)가 있다.
 * 마디 위의 막대 높이 = |∂L/∂h_k|. 기울기 막대 하나가 오른쪽(출력)에서 나서 층 상자를
 * 하나씩 거슬러 건너고, 상자를 지나는 동안 높이가 w_k 배로 늘거나 준다. 지나온 마디에는
 * 그때의 막대가 흐리게 남아 오르내림의 자취가 된다. 점선은 출력 바로 뒤(h_3)의 크기다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { LAYER_COUNT } from './algorithm.js';
import type { GradientThroughLayersScene } from './scene.js';

const H = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 450;
const FRAME_MS = 16;

/** 마디 이름 — 기호는 자료다 (번역하지 않는다). */
const NODE_SYMBOLS = ['h₀', 'h₁', 'h₂', 'h₃', 'h₄'];
const SUBSCRIPTS = ['₀', '₁', '₂', '₃', '₄'];

function fmt(v: number, digits: number): string {
  const s = v.toFixed(digits);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s.replace('-', '−');
}

type Layout = {
  nodeX: number[];
  boxX: number[];
  boxW: number;
  barW: number;
  baseY: number;
  barMax: number;
  nodeY: number;
  nodeR: number;
};

function layout(): Layout {
  const W = PIECE_CANVAS_W;
  const margin = Math.min(48, W * 0.075);
  const gap = (W - 2 * margin) / LAYER_COUNT;
  const nodeX = Array.from({ length: LAYER_COUNT + 1 }, (_, k) => margin + k * gap);
  const boxX = Array.from({ length: LAYER_COUNT }, (_, i) => margin + (i + 0.5) * gap);
  return {
    nodeX,
    boxX,
    boxW: Math.min(64, gap * 0.46),
    barW: Math.min(30, gap * 0.22),
    baseY: 206,
    barMax: 120,
    nodeY: 238,
    nodeR: Math.min(16, gap * 0.12),
  };
}

function at(arr: number[], i: number, what: string): number {
  const v = arr[i];
  if (v === undefined) throw new Error(`gradient-through-layers-stage: ${what}[${i}] 가 없다`);
  return v;
}

function symbolAt(list: string[], i: number): string {
  const s = list[i];
  if (s === undefined) throw new Error(`gradient-through-layers-stage: 기호 ${i} 가 없다`);
  return s;
}

export const gradientThroughLayersStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const L = layout();
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(Math.round(v * 100) / 100 || 0) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; color?: string; anchor?: string; mono?: boolean; weight?: string } = {},
    ): SVGElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.color ?? colors.text,
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function barHeight(scene: GradientThroughLayersScene, g: number): number {
      if (scene.forward === null) throw new Error('gradient-through-layers-stage: 축척(gradMax) 이 없는데 막대를 그리려 한다');
      return (Math.abs(g) / scene.forward.gradMax) * L.barMax;
    }

    /** 이번 걸음에 새로 닿은 마디 — 자취에서 파생한다 (가장 왼쪽의 채워진 마디). */
    function frontIndex(scene: GradientThroughLayersScene): number | null {
      for (let k = 0; k <= LAYER_COUNT; k += 1) if (scene.grads[k] !== null) return k;
      return null;
    }

    function drawCaption(scene: GradientThroughLayersScene, root: Element): void {
      const f = scene.forward;
      if (f === null) return;
      const step = scene.step;
      const lines: string[] = [];
      if (step === null) {
        lines.push(t('caption.forward', 'Forward pass done. ŷ: {yHat} · L: {loss}', {
          yHat: fmt(f.yHat, 2),
          loss: fmt(f.loss, 4),
        }));
      } else if (step.kind === 'output') {
        lines.push(t('caption.output', 'Gradient at the output: ∂L/∂h₄ = ŷ − y = {g}', { g: fmt(step.g, 3) }));
      } else {
        const vars = { k: step.layer, w: fmt(step.factor, 1), from: fmt(step.from, 3), to: fmt(step.to, 3) };
        if (Math.abs(step.to) > Math.abs(step.from)) {
          lines.push(t('caption.grow', 'Layer {k} multiplies by {w}. The size grows: {from} → {to}', vars));
        } else {
          lines.push(t('caption.shrink', 'Layer {k} multiplies by {w}. The size shrinks: {from} → {to}', vars));
        }
        lines.push(t('caption.product', 'Product of the multipliers so far: {p}', { p: fmt(step.product, 2) }));
        const front = scene.grads[0];
        const near = scene.grads[LAYER_COUNT - 1];
        if (front !== null && front !== undefined && near !== null && near !== undefined) {
          lines.push(t('caption.compare', 'Size at the front: {front} · right after the output: {near}', {
            front: fmt(Math.abs(front), 3),
            near: fmt(Math.abs(near), 3),
          }));
        }
      }
      lines.forEach((line, i) => {
        label(root, PIECE_CANVAS_W / 2, 24 + i * 20, line, {
          size: i === 0 ? fontSizes.md : fontSizes.sm,
          color: i === 0 ? colors.text : colors.textMuted,
        });
      });
    }

    function drawChain(scene: GradientThroughLayersScene, root: Element): void {
      const firstX = at(L.nodeX, 0, 'nodeX');
      const lastX = at(L.nodeX, LAYER_COUNT, 'nodeX');
      el('line', { x1: firstX, y1: L.nodeY, x2: lastX, y2: L.nodeY, stroke: colors.border, 'stroke-width': 1.5 }, root);
      const step = scene.step;
      const crossing = step !== null && step.kind === 'cross' ? step.layer : null;

      for (let i = 0; i < LAYER_COUNT; i += 1) {
        const k = i + 1;
        const bx = at(L.boxX, i, 'boxX');
        const w = at(scene.base.weights, i, 'weights');
        const active = crossing === k;
        el('rect', {
          x: bx - L.boxW / 2,
          y: L.nodeY - 13,
          width: L.boxW,
          height: 26,
          rx: 4,
          fill: colors.bg,
          stroke: active ? colors.accent : colors.border,
          'stroke-width': active ? 2.5 : 1.2,
        }, root);
        label(root, bx, L.nodeY + smPx * 0.35, '×' + fmt(w, 1), { mono: true, weight: active ? 'bold' : 'normal' });
        label(root, bx, L.nodeY - 19, t('label.layer', 'Layer {k}', { k }), { size: fontSizes.xs, color: colors.textMuted });
        const wg = scene.wgrads[i];
        if (wg !== null && wg !== undefined) {
          label(root, bx, L.nodeY + 56, t('label.wgrad', '∂L/∂w{k}: {v}', { k: symbolAt(SUBSCRIPTS, k), v: fmt(wg, 3) }), {
            size: fontSizes.xs,
            color: colors.textMuted,
            mono: true,
          });
        }
      }

      for (let k = 0; k <= LAYER_COUNT; k += 1) {
        const nx = at(L.nodeX, k, 'nodeX');
        el('circle', { cx: nx, cy: L.nodeY, r: L.nodeR, fill: colors.bgSubtle, stroke: colors.textMuted, 'stroke-width': 1.2 }, root);
        label(root, nx, L.nodeY + smPx * 0.35, symbolAt(NODE_SYMBOLS, k), { mono: true });
        if (scene.forward !== null) {
          label(root, nx, L.nodeY + 36, fmt(at(scene.forward.h, k, 'h'), 2), { mono: true, color: colors.text });
        }
      }
      label(root, at(L.nodeX, 0, 'nodeX'), L.nodeY + 56, 'x', { mono: true, color: colors.textMuted });
      label(root, lastX, L.nodeY + 56, 'ŷ', { mono: true, color: colors.textMuted });
      label(root, lastX, L.nodeY + 74, t('label.target', 'Target y: {y}', { y: fmt(scene.base.y, 2) }), {
        size: fontSizes.xs,
        color: colors.textMuted,
        anchor: 'end',
      });
    }

    function drawBar(root: Element, x: number, h: number, current: boolean): SVGElement {
      return el('rect', {
        x: x - L.barW / 2,
        y: L.baseY - h,
        width: L.barW,
        height: Math.max(h, 0),
        rx: 2,
        fill: current ? colors.accent : colors.textMuted,
        'fill-opacity': current ? 1 : 0.4,
      }, root);
    }

    function drawBars(scene: GradientThroughLayersScene, root: Element, hideFront: boolean): void {
      if (scene.forward === null) return;
      const front = frontIndex(scene);
      const near = scene.grads[LAYER_COUNT - 1];
      if (near !== null && near !== undefined) {
        const y = L.baseY - barHeight(scene, near);
        el('line', {
          x1: at(L.nodeX, 0, 'nodeX') - L.barW,
          y1: y,
          x2: at(L.nodeX, LAYER_COUNT - 1, 'nodeX') + L.barW / 2,
          y2: y,
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '4 4',
        }, root);
      }
      for (let k = 0; k <= LAYER_COUNT; k += 1) {
        const g = scene.grads[k];
        if (g === null || g === undefined) continue;
        const current = k === front;
        if (current && hideFront) continue;
        const nx = at(L.nodeX, k, 'nodeX');
        const h = barHeight(scene, g);
        drawBar(root, nx, h, current);
        const value = label(root, nx, L.baseY - h - 6, fmt(g, 3), {
          mono: true,
          size: current ? fontSizes.sm : fontSizes.xs,
          color: current ? colors.text : colors.textMuted,
          weight: current ? 'bold' : 'normal',
        });
        // 점선 위에 얹혀도 읽히게 바탕색 테를 두른다
        value.setAttribute('stroke', colors.bg);
        value.setAttribute('stroke-width', '3');
        value.setAttribute('paint-order', 'stroke');
      }
    }

    function drawStatic(scene: GradientThroughLayersScene, hideFront = false): SVGElement {
      svg.textContent = '';
      const root = el('g', {}, svg);
      drawCaption(scene, root);
      drawChain(scene, root);
      drawBars(scene, root, hideFront);
      return root;
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
    const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

    async function animateOutput(next: GradientThroughLayersScene, mine: number, g: number): Promise<void> {
      const root = drawStatic(next, true);
      const x = at(L.nodeX, LAYER_COUNT, 'nodeX');
      const full = barHeight(next, g);
      const bar = drawBar(root, x, 0, true);
      await tween(mine, MOTION_MS * 0.9, (p) => {
        const h = full * ease(p);
        bar.setAttribute('y', String(L.baseY - h));
        bar.setAttribute('height', String(h));
      });
    }

    async function animateCross(
      next: GradientThroughLayersScene,
      mine: number,
      layer: number,
      from: number,
      to: number,
    ): Promise<void> {
      const root = drawStatic(next, true);
      const startX = at(L.nodeX, layer, 'nodeX');
      const endX = at(L.nodeX, layer - 1, 'nodeX');
      const bx = at(L.boxX, layer - 1, 'boxX');
      const inX = bx + L.boxW / 2;
      const outX = bx - L.boxW / 2;
      const h0 = barHeight(next, from);
      const h1 = barHeight(next, to);
      const bar = drawBar(root, startX, h0, true);
      await tween(mine, MOTION_MS, (raw) => {
        const p = ease(raw);
        let x: number;
        let h: number;
        if (p < 0.3) {
          x = lerp(startX, inX, p / 0.3);
          h = h0;
        } else if (p < 0.7) {
          const q = (p - 0.3) / 0.4;
          x = lerp(inX, outX, q);
          h = lerp(h0, h1, q);
        } else {
          x = lerp(outX, endX, (p - 0.7) / 0.3);
          h = h1;
        }
        bar.setAttribute('x', String(Math.round((x - L.barW / 2) * 100) / 100));
        bar.setAttribute('y', String(Math.round((L.baseY - h) * 100) / 100));
        bar.setAttribute('height', String(Math.round(h * 100) / 100));
      });
    }

    return {
      async render(next: GradientThroughLayersScene, prev: GradientThroughLayersScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        const moved = opts.animate && step !== null && prev !== null && prev.step !== step;
        if (!moved || step === null) {
          drawStatic(next);
          return;
        }
        if (step.kind === 'output') await animateOutput(next, mine, step.g);
        else await animateCross(next, mine, step.layer, step.from, step.to);
        if (destroyed || mine !== gen) return;
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
