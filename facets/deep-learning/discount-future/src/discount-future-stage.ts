/**
 * discount-future 무대 — 오른쪽 상의 줄에서 상 하나가 왼쪽 "지금" 자리로 당겨져 온다.
 *
 * 당겨 오는 동안 채운 조각은 γ 를 거리만큼 곱해 줄어들고(할인 합 기둥으로),
 * 테두리만 있는 복제는 제 크기 그대로 날 합 기둥으로 간다. 두 기둥의 높이 차가 할인이다.
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
import { scaleCeiling } from './algorithm';
import type { DiscountFutureScene } from './scene';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 400;
const TICK_MS = 16;

type Attrs = Record<string, string | number>;

function el(tag: string, attrs: Attrs, parent: Element): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  parent.appendChild(node);
  return node;
}

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 자리 셈 — 캔버스 폭에서 역산한다. */
function layout(scene: DiscountFutureScene) {
  const W = PIECE_CANVAS_W;
  const pad = 20;
  const nowW = Math.round(W * 0.26);
  const rawX = pad + nowW * 0.27;
  const discX = pad + nowW * 0.72;
  const colW = Math.min(44, nowW * 0.34);
  const dividerX = pad + nowW + 6;
  const slotX0 = dividerX + 18;
  const n = scene.rewards.length;
  const pitch = (W - pad - slotX0) / n;
  const barW = Math.min(44, pitch * 0.6);
  const capY1 = 24;
  const capY2 = 46;
  const plotTop = 84;
  const base = H - 72;
  const rows = [base + 18, base + 36, base + 54] as const;
  const unit = (base - plotTop) / scaleCeiling(scene.rewards);
  const slotX = (i: number) => slotX0 + pitch * (i + 0.5);
  return { W, pad, nowW, rawX, discX, colW, dividerX, pitch, barW, capY1, capY2, plotTop, base, rows, unit, slotX };
}

type Layout = ReturnType<typeof layout>;

export const discountFutureStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const canvas = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function text(parent: Element, x: number, y: number, s: string, extra: Attrs = {}): SVGElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: pal.text,
          ...extra,
        },
        parent,
      );
      node.textContent = s;
      return node;
    }

    /**
     * 장면 전체를 세운다. `holding` 이 참이면 이번 걸음의 상은 아직 오는 중이라
     * 두 기둥과 그 칸의 도착 표시를 앞 걸음의 것으로 둔다.
     */
    function drawStatic(scene: DiscountFutureScene, holding: boolean): Layout {
      canvas.textContent = '';
      const L = layout(scene);
      const colors = categorical(scene.rewards.length, 'vivid');
      const colorOf = (i: number) => colors[i] ?? pal.primary;
      const last = scene.pulled[scene.pulled.length - 1];
      const arrived = holding ? scene.pulled.slice(0, -1) : scene.pulled;
      const discShown = holding && scene.step ? scene.step.discBefore : scene.disc;
      const rawShown = holding && scene.step ? scene.step.rawBefore : scene.raw;

      // 이번에 당긴 칸의 띠 — 머무는 강조
      if (last !== undefined) {
        el(
          'rect',
          {
            x: r2(L.slotX(last.k) - L.pitch / 2 + 3),
            y: L.plotTop - 30,
            width: r2(L.pitch - 6),
            height: r2(L.rows[2] + 10 - (L.plotTop - 30)),
            rx: 6,
            fill: pal.accent,
            'fill-opacity': 0.2,
          },
          canvas,
        );
      }

      // 캡션
      if (scene.step === null || last === undefined) {
        text(canvas, L.pad, L.capY1, t('caption.start', 'Rewards ahead: {n}', {
          n: scene.rewards.length,
        }), { 'font-size': fontSizes.md, 'font-weight': 600 });
      } else {
        text(canvas, L.pad, L.capY1, t('caption.pull', 'Reward: {r} · k: {k} · γ^k: {w} · Value now: {v}', {
          r: last.reward.toFixed(0),
          k: last.k,
          w: last.weight.toFixed(2),
          v: last.value.toFixed(2),
        }), { 'font-size': fontSizes.md, 'font-weight': 600 });
        if (scene.step !== null && scene.disc === scene.step.discBefore) {
          text(canvas, L.pad, L.capY2, t('caption.zero', 'Discounted sum unchanged: {disc}', {
            disc: scene.disc.toFixed(2),
          }), { fill: pal.textMuted });
        } else {
          text(canvas, L.pad, L.capY2, t('caption.kept', 'Share of its size kept: {pct}%', {
            pct: (last.weight * 100).toFixed(1),
          }), { fill: pal.textMuted });
        }
      }

      // γ
      text(canvas, L.W - L.pad, L.capY1, t('label.gamma', 'γ: {g}', { g: scene.gamma.toFixed(2) }), {
        'text-anchor': 'end',
        fill: pal.textMuted,
      });

      // 바닥 줄과 칸막이
      el('line', { x1: L.pad, y1: L.base, x2: L.W - L.pad, y2: L.base, stroke: pal.border, 'stroke-width': 1 }, canvas);
      el(
        'line',
        {
          x1: r2(L.dividerX),
          y1: L.plotTop - 30,
          x2: r2(L.dividerX),
          y2: L.rows[2] + 10,
          stroke: pal.border,
          'stroke-dasharray': '4 4',
        },
        canvas,
      );

      // 지금 자리의 두 기둥
      let rawTop = L.base;
      let discTop = L.base;
      for (const p of arrived) {
        const rh = p.reward * L.unit;
        const dh = p.value * L.unit;
        if (rh > 0) {
          el(
            'rect',
            {
              x: r2(L.rawX - L.colW / 2),
              y: r2(rawTop - rh),
              width: r2(L.colW),
              height: r2(rh),
              fill: 'none',
              stroke: colorOf(p.k),
              'stroke-width': 1.5,
              'stroke-dasharray': '4 3',
            },
            canvas,
          );
          rawTop -= rh;
        }
        if (dh > 0) {
          el(
            'rect',
            {
              x: r2(L.discX - L.colW / 2),
              y: r2(discTop - dh),
              width: r2(L.colW),
              height: r2(dh),
              fill: colorOf(p.k),
              stroke: pal.bg,
              'stroke-width': 1,
            },
            canvas,
          );
          discTop -= dh;
        }
      }
      text(canvas, L.rawX, rawTop - 6, rawShown.toFixed(0), { 'text-anchor': 'middle', fill: pal.textMuted });
      text(canvas, L.discX, discTop - 6, discShown.toFixed(2), { 'text-anchor': 'middle', 'font-weight': 700 });
      text(canvas, L.rawX, L.rows[0], t('label.raw', 'Raw sum'), {
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: pal.textMuted,
      });
      text(canvas, L.discX, L.rows[0], t('label.disc', 'Discounted'), {
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
      });
      text(canvas, (L.rawX + L.discX) / 2, L.rows[2], t('label.now', 'Now'), {
        'text-anchor': 'middle',
        'font-weight': 700,
      });

      // 앞으로 받을 상의 줄
      scene.rewards.forEach((reward, i) => {
        const cx = L.slotX(i);
        const got = scene.pulled.find((p) => p.k === i);
        const h = reward * L.unit;
        const x = r2(cx - L.barW / 2);
        if (h > 0) {
          el(
            'rect',
            got === undefined
              ? { x, y: r2(L.base - h), width: r2(L.barW), height: r2(h), fill: colorOf(i) }
              : {
                  x,
                  y: r2(L.base - h),
                  width: r2(L.barW),
                  height: r2(h),
                  fill: 'none',
                  stroke: colorOf(i),
                  'stroke-width': 1.5,
                  'stroke-dasharray': '4 3',
                  'stroke-opacity': 0.7,
                },
            canvas,
          );
        } else {
          el(
            'rect',
            {
              x,
              y: L.base - 2,
              width: r2(L.barW),
              height: 2,
              fill: got === undefined ? pal.text : pal.textMuted,
              'fill-opacity': got === undefined ? 1 : 0.4,
            },
            canvas,
          );
        }
        text(canvas, cx, L.base - h - 6, reward.toFixed(0), {
          'text-anchor': 'middle',
          fill: got === undefined ? pal.text : pal.textMuted,
          'font-weight': got === undefined ? 700 : 400,
        });
        text(canvas, cx, L.rows[0], t('label.k', 'k = {k}', { k: i }), {
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: pal.textMuted,
        });
        const shown = got !== undefined && !(holding && got === last);
        if (shown) {
          text(canvas, cx, L.rows[1], t('label.weight', '× {w}', { w: got.weight.toFixed(2) }), {
            'text-anchor': 'middle',
          });
          text(canvas, cx, L.rows[2], t('label.arrived', '→ {v}', { v: got.value.toFixed(2) }), {
            'text-anchor': 'middle',
            'font-weight': 700,
          });
        }
      });
      return L;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = () => {
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

    /** 이번 걸음의 상을 지금 자리로 당긴다 — 채운 조각은 줄고, 테두리 복제는 그대로 간다. */
    async function pull(scene: DiscountFutureScene, mine: number): Promise<void> {
      const step = scene.step;
      const got = scene.pulled[scene.pulled.length - 1];
      if (step === null || got === undefined) return;
      const L = drawStatic(scene, true);
      const colors = categorical(scene.rewards.length, 'vivid');
      const color = colors[got.k] ?? pal.primary;
      const fromX = L.slotX(got.k);
      const discBottom = L.base - step.discBefore * L.unit;
      const rawBottom = L.base - step.rawBefore * L.unit;

      const layer = el('g', {}, canvas);
      const ghost = el('rect', { fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, layer);
      const piece = el('rect', { fill: color, stroke: pal.bg, 'stroke-width': 1 }, layer);
      const label = text(layer, fromX, L.base, '', { 'text-anchor': 'middle', 'font-weight': 700 });
      const labelH = smPx;

      const frame = (p: number) => {
        const e = ease(p);
        // 지금까지 지나온 거리만큼 γ 를 곱한다 — 끝에서 정확히 γ^k
        const factor = p >= 1 ? got.weight : Math.pow(scene.gamma, got.k * e);
        const w = L.barW + (L.colW - L.barW) * e;
        const rh = got.reward * L.unit;
        const dh = got.reward * factor * L.unit;
        const rx = fromX + (L.rawX - fromX) * e;
        const dx = fromX + (L.discX - fromX) * e;
        const rb = L.base + (rawBottom - L.base) * e;
        const db = L.base + (discBottom - L.base) * e;
        ghost.setAttribute('x', String(r2(rx - w / 2)));
        ghost.setAttribute('y', String(r2(rb - rh)));
        ghost.setAttribute('width', String(r2(w)));
        ghost.setAttribute('height', String(r2(rh)));
        piece.setAttribute('x', String(r2(dx - w / 2)));
        piece.setAttribute('y', String(r2(db - dh)));
        piece.setAttribute('width', String(r2(w)));
        piece.setAttribute('height', String(r2(dh)));
        label.setAttribute('x', String(r2(dx)));
        label.setAttribute('y', String(r2(db - dh - labelH * 0.5)));
        label.textContent = (got.reward * factor).toFixed(2);
      };

      frame(0);
      const ticks = Math.max(1, Math.round(MOVE_MS / TICK_MS));
      for (let i = 1; i <= ticks; i += 1) {
        await wait(TICK_MS);
        if (mine !== gen || destroyed) return;
        frame(i / ticks);
      }
    }

    const renderer = {
      async render(next: DiscountFutureScene, prev: DiscountFutureScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const moved = prev !== null && next.pulled.length === prev.pulled.length + 1;
        if (opts.animate && moved && next.step !== null) {
          await pull(next, mine);
          if (mine !== gen || destroyed) return;
        }
        drawStatic(next, false);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };

    // 걸음 0 은 러너가 render(initial, null) 로 세운다. 마운트는 빈 캔버스로 둔다 —
    // initialData 없이 마운트되어도 던지지 않는다.
    return renderer;
  },
};
