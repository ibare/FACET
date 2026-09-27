/**
 * vector-scale 무대 — 한 화살표의 머리가 제 방향의 곧은 줄 위를 미끄러진다.
 *
 * 왼쪽: 원점에서 v 방향으로 뻗은 곧은 줄(점선)과 화살표 kv 하나. 곱한 k 마다 줄 위에
 *       눈금이 남아 길이의 배수가 줄 위의 자리로 읽힌다. 원점의 호가 각을 잰다.
 * 오른쪽: 지금 k · 길이 · 길이 ÷ 처음 길이.
 *
 * 걸음이 오면 머리가 앞 자리(from)에서 새 자리로 줄을 따라 미끄러진다.
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
import { fixed, plain, type Vec2 } from './algorithm.js';
import type { VectorScaleScene } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 머리가 미끄러지는 시간 */
const SLIDE_MS = 700;
const FRAME_MS = 16;
/** 한 단위의 상한 (px) */
const MAX_UNIT = 90;
/** 곧은 줄은 가장 긴 머리보다 이만큼 더 뻗는다 */
const RAIL_OVER = 1.15;
const PANEL_W = 180;

type Frame = {
  /** 화살표 머리를 그릴 자리 (수학 좌표) */
  head: Vec2;
  /** 마지막 눈금을 아직 두지 않는가 (머리가 오는 중) */
  pending: boolean;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

function label(
  x: number,
  y: number,
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', { x: x.toFixed(1), y: y.toFixed(1), ...attrs });
  node.textContent = content;
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const vectorScaleStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function draw(scene: VectorScaleScene, frame: Frame | null): void {
      svg.textContent = '';
      const base = scene.base;
      const step = scene.step;
      if (!base || !step || !frame) return;

      // ── 축척: 원점 · 모든 머리 · 곧은 줄의 끝을 왼쪽 칸에 담는다
      const railLen = base.maxLength * RAIL_OVER;
      const railEnd: Vec2 = [base.unit[0] * railLen, base.unit[1] * railLen];
      const minX = Math.min(base.bounds.minX, railEnd[0], 0);
      const maxX = Math.max(base.bounds.maxX, railEnd[0], 0);
      const minY = Math.min(base.bounds.minY, railEnd[1], 0);
      const maxY = Math.max(base.bounds.maxY, railEnd[1], 0);
      const x0 = 36;
      const x1 = W - PANEL_W - 24;
      const y0 = 60;
      const y1 = H - 36;
      const spanX = Math.max(maxX - minX, 1e-9);
      const spanY = Math.max(maxY - minY, 1e-9);
      const unitPx = Math.min((x1 - x0) / spanX, (y1 - y0) / spanY, MAX_UNIT);
      const ox = x0 + ((x1 - x0) - spanX * unitPx) / 2 - minX * unitPx;
      const oy = y1 - ((y1 - y0) - spanY * unitPx) / 2 + minY * unitPx;
      const at = (p: Vec2): Vec2 => [ox + p[0] * unitPx, oy - p[1] * unitPx];

      // 화면 위의 방향과 그 왼쪽 법선
      const dir: Vec2 = [base.unit[0], -base.unit[1]];
      const nrm: Vec2 = [dir[1], -dir[0]];

      // ── 캡션: 지금 일어나는 일
      const sym = scene.scalarName;
      const value = plain(step.k);
      let caption: string;
      if (step.change === 'start') {
        caption = t('caption.start', 'Before multiplying: {sym} = {value}', { sym, value });
      } else if (step.change === 'grow') {
        caption = t('caption.grow', 'Length grows: {sym} = {value}', { sym, value });
      } else {
        caption = t('caption.shrink', 'Length shrinks: {sym} = {value}', { sym, value });
      }
      svg.appendChild(
        label(20, 30, caption, {
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 600,
          fill: colors.text,
        }),
      );

      // ── 각을 재는 가로 기준선과 호
      const refLen = Math.min(80, railLen * unitPx * 0.4);
      svg.appendChild(
        el('line', {
          x1: ox.toFixed(1),
          y1: oy.toFixed(1),
          x2: (ox + refLen).toFixed(1),
          y2: oy.toFixed(1),
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      const arcR = Math.min(34, refLen * 0.6);
      const rad = (step.angle * Math.PI) / 180;
      const arcEnd: Vec2 = [ox + arcR * Math.cos(rad), oy - arcR * Math.sin(rad)];
      svg.appendChild(
        el('path', {
          d: `M ${(ox + arcR).toFixed(1)} ${oy.toFixed(1)} A ${arcR} ${arcR} 0 0 ${step.angle >= 0 ? 0 : 1} ${arcEnd[0].toFixed(1)} ${arcEnd[1].toFixed(1)}`,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1.5,
        }),
      );
      svg.appendChild(
        label(ox + arcR + 6, step.angle >= 0 ? oy + smPx + 6 : oy - 8, `${fixed(step.angle, 1)}°`, {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        }),
      );

      // ── 곧은 줄
      const re = at(railEnd);
      svg.appendChild(
        el('line', {
          x1: ox.toFixed(1),
          y1: oy.toFixed(1),
          x2: re[0].toFixed(1),
          y2: re[1].toFixed(1),
          stroke: colors.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 5',
        }),
      );

      // ── 자취: 곱한 k 마다 줄 위의 눈금
      const marks = frame.pending ? scene.trail.slice(0, -1) : scene.trail;
      marks.forEach((m, i) => {
        const now = !frame.pending && i === marks.length - 1;
        const p = at(m.head);
        const half = now ? 8 : 6;
        svg.appendChild(
          el('line', {
            x1: (p[0] + nrm[0] * half).toFixed(1),
            y1: (p[1] + nrm[1] * half).toFixed(1),
            x2: (p[0] - nrm[0] * half).toFixed(1),
            y2: (p[1] - nrm[1] * half).toFixed(1),
            stroke: now ? colors.accent : colors.textMuted,
            'stroke-width': now ? 3 : 1.5,
          }),
        );
        svg.appendChild(
          label(p[0] - nrm[0] * 14 + 2, p[1] - nrm[1] * 14 + smPx * 0.4, `${sym} = ${plain(m.k)}`, {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: now ? colors.text : colors.textMuted,
            'font-weight': now ? 700 : 400,
          }),
        );
      });

      // ── 화살표 kv 하나
      const tip = at(frame.head);
      const shaftLen = Math.hypot(tip[0] - ox, tip[1] - oy);
      const headLen = Math.min(13, shaftLen * 0.5);
      const back: Vec2 = [tip[0] - dir[0] * headLen, tip[1] - dir[1] * headLen];
      svg.appendChild(
        el('line', {
          x1: ox.toFixed(1),
          y1: oy.toFixed(1),
          x2: back[0].toFixed(1),
          y2: back[1].toFixed(1),
          stroke: colors.primary,
          'stroke-width': 3.5,
          'stroke-linecap': 'round',
        }),
      );
      const wing = headLen * 0.45;
      svg.appendChild(
        el('polygon', {
          points: [
            `${tip[0].toFixed(1)},${tip[1].toFixed(1)}`,
            `${(back[0] + nrm[0] * wing).toFixed(1)},${(back[1] + nrm[1] * wing).toFixed(1)}`,
            `${(back[0] - nrm[0] * wing).toFixed(1)},${(back[1] - nrm[1] * wing).toFixed(1)}`,
          ].join(' '),
          fill: colors.primary,
        }),
      );
      svg.appendChild(el('circle', { cx: ox.toFixed(1), cy: oy.toFixed(1), r: 3.5, fill: colors.text }));

      // 머리의 좌표 — 멈춘 화면에서만 (흐르는 중에는 아직 도착하지 않았다)
      if (!frame.pending) {
        const text = `${sym}${scene.vectorName} = (${plain(step.head[0])}, ${plain(step.head[1])})`;
        // 고정폭 글자라 폭을 글자 수로 가늠한다. 머리가 원점 가까이 오면 왼쪽 끝에 붙인다
        const textW = text.length * smPx * 0.6;
        const hx = Math.max(tip[0] + nrm[0] * 16, textW + 8);
        const hy = tip[1] + nrm[1] * 16;
        svg.appendChild(
          label(hx, hy, text, {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'text-anchor': 'end',
            fill: colors.text,
          }),
        );
      }

      // ── 오른쪽: 길이의 수
      const px = W - PANEL_W;
      const rows: Array<[string, string, boolean]> = [
        [sym, plain(step.k), false],
        [t('label.length', 'length'), fixed(step.length, 2), true],
        [
          t('label.ratio', 'length ÷ original length'),
          `${fixed(step.length, 2)} ÷ ${fixed(base.len0, 2)} = ${plain(step.ratio)}`,
          false,
        ],
      ];
      svg.appendChild(
        el('line', {
          x1: px - 14,
          y1: 60,
          x2: px - 14,
          y2: H - 36,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      rows.forEach(([name, val, strong], i) => {
        const y = 78 + i * 60;
        svg.appendChild(
          label(px, y, name, {
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }),
        );
        svg.appendChild(
          label(px, y + 24, val, {
            'font-family': fonts.mono,
            'font-size': strong ? fontSizes.xl : fontSizes.lg,
            'font-weight': strong ? 700 : 400,
            fill: colors.text,
          }),
        );
      });
    }

    function drawStatic(scene: VectorScaleScene): void {
      draw(scene, scene.step ? { head: scene.step.head, pending: false } : null);
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function slide(scene: VectorScaleScene, from: Vec2, to: Vec2, mine: number): Promise<void> {
      const frames = Math.max(1, Math.round(SLIDE_MS / FRAME_MS));
      for (let i = 0; i <= frames; i += 1) {
        if (mine !== gen || destroyed) return;
        const e = ease(i / frames);
        draw(scene, { head: [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e], pending: true });
        if (i < frames) await wait(FRAME_MS);
      }
    }

    return {
      render(next: VectorScaleScene, _prev: VectorScaleScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        const step = next.step;
        if (!opts.animate || !step || !step.from) {
          drawStatic(next);
          return Promise.resolve();
        }
        const from = step.from;
        return (async () => {
          await slide(next, from, step.head, mine);
          if (mine !== gen || destroyed) return;
          drawStatic(next);
        })();
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
