/**
 * 멱집합 무대 — 원소 하나를 들일 때마다 부분집합 하나하나가 둘로 갈라진다.
 *
 * 위 띠: 집합 S 의 원소 칩 (들이는 차례대로) · 오른쪽에 걸음마다의 모음 길이.
 * 아래 판: 모음의 부분집합 카드. i 번째 카드는 판의 i 번째 칸에 선다 (왼쪽에서 오른쪽, 위에서 아래).
 * 원소를 들이는 걸음에서 옛 카드는 제자리에 남고, 카드마다 사본이 떨어져 나와 뒤쪽 칸으로 미끄러진다.
 * 그다음 들이는 원소의 글자가 칩에서 날아와 사본마다 얹힌다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { PowerSetScene } from './scene.js';

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 20;
const TOP_Y = 30;
const CHIP = 28;
const CHIP_GAP = 8;
const GRID_TOP = 62;
const GRID_BOTTOM = H - 66;
const GAP_X = 12;
const GAP_Y = 12;
const CARD_W_MAX = 150;
const CARD_H_MAX = 44;
const CAPTION_Y1 = H - 36;
const CAPTION_Y2 = H - 14;

/** 한 걸음의 운동 길이 — 사본이 미끄러지고 글자가 얹힌다 */
const MOVE_MS = 780;
/** 미끄러짐이 끝나는 비율 · 글자가 날기 시작하는 비율 */
const SLIDE_END = 0.55;
const FLY_START = 0.45;
/** 고정폭 글꼴의 글자 폭 비율 */
const MONO_RATIO = 0.6;

type Pt = { x: number; y: number };

type CopyHandle = {
  group: SVGGElement;
  tail: SVGTSpanElement;
  /** 원본 칸 − 사본 칸 */
  dx: number;
  dy: number;
  /** 얹힐 글자의 끝 자리 (사본 칸 기준) */
  land: Pt;
};

type Drawn = {
  copies: CopyHandle[];
  chipCenter: Pt | null;
  tailSize: number;
};

function round(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

/** 부분집합 표기를 앞부분과 마지막 원소로 나눈다 — 마지막 원소가 이번에 얹힌 것이다. */
function subsetParts(s: readonly string[]): { head: string; tail: string; close: string } {
  if (s.length === 0) return { head: '∅', tail: '', close: '' };
  const last = s[s.length - 1];
  if (last === undefined) throw new Error('powerSetStage: 부분집합의 마지막 원소가 없다');
  const rest = s.slice(0, -1);
  return { head: rest.length === 0 ? '{' : `{${rest.join(', ')}, `, tail: last, close: '}' };
}

function subsetChars(s: readonly string[]): number {
  const p = subsetParts(s);
  return p.head.length + p.tail.length + p.close.length;
}

export const powerSetStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const mdPx = parseFloat(fontSizes.md);
    const lgPx = parseFloat(fontSizes.lg);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function tween(ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let t0: number | null = null;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (now: number): void => {
          if (destroyed) return;
          if (t0 === null) t0 = now;
          const p = clamp01((now - t0) / ms);
          frame(p);
          if (p >= 1) {
            done();
            return;
          }
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tick(n);
        });
        frames.add(id);
      });
    }

    function gridOf(total: number): { cols: number; rows: number; cardW: number; cardH: number; left: number } {
      let cols = 1;
      while (cols * cols < total) cols *= 2;
      const rows = Math.ceil(total / cols);
      const cardW = Math.min(CARD_W_MAX, (W - 2 * MARGIN - (cols - 1) * GAP_X) / cols);
      const cardH = Math.min(CARD_H_MAX, (GRID_BOTTOM - GRID_TOP - (rows - 1) * GAP_Y) / rows);
      const width = cols * cardW + (cols - 1) * GAP_X;
      return { cols, rows, cardW, cardH, left: (W - width) / 2 };
    }

    function drawStatic(scene: PowerSetScene): Drawn {
      svg.textContent = '';
      const step = scene.step;
      const current = step.kind === 'take' ? step.index : -1;

      // 위 띠 — 집합 이름과 원소 칩
      const nameText = el(
        'text',
        {
          x: MARGIN,
          y: TOP_Y,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': 700,
          fill: colors.text,
        },
        svg,
      );
      nameText.textContent = `${scene.name} =`;
      const chipLeft = MARGIN + (scene.name.length + 2) * lgPx * MONO_RATIO + 8;
      let chipCenter: Pt | null = null;
      scene.elements.forEach((e, i) => {
        const x = chipLeft + i * (CHIP + CHIP_GAP);
        const isCurrent = i === current;
        const isTaken = i < scene.taken;
        el(
          'rect',
          {
            x: round(x),
            y: TOP_Y - CHIP / 2,
            width: CHIP,
            height: CHIP,
            rx: 6,
            fill: isCurrent ? colors.accent : isTaken ? colors.bgSubtle : 'none',
            stroke: isCurrent ? colors.accent : isTaken ? colors.border : colors.textMuted,
            'stroke-width': 1.5,
            ...(isTaken ? {} : { 'stroke-dasharray': '3 3' }),
          },
          svg,
        );
        const label = el(
          'text',
          {
            x: round(x + CHIP / 2),
            y: TOP_Y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'font-weight': isCurrent ? 700 : 400,
            fill: isCurrent ? colors.stateInk : isTaken ? colors.text : colors.textMuted,
          },
          svg,
        );
        label.textContent = e;
        if (isCurrent) chipCenter = { x: round(x + CHIP / 2), y: TOP_Y };
      });

      // 위 띠 오른쪽 — 걸음마다의 모음 길이
      if (scene.counts.length > 0) {
        const chain = el(
          'text',
          {
            x: W - MARGIN,
            y: TOP_Y,
            'text-anchor': 'end',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
          },
          svg,
        );
        scene.counts.forEach((n, i) => {
          const last = i === scene.counts.length - 1;
          if (i > 0) {
            const arrow = el('tspan', { fill: colors.textMuted }, chain);
            arrow.textContent = ' → ';
          }
          const num = el(
            'tspan',
            {
              fill: last ? colors.text : colors.textMuted,
              'font-weight': last ? 700 : 400,
              ...(last ? { 'font-size': fontSizes.lg } : {}),
            },
            chain,
          );
          num.textContent = String(n);
        });
      }

      const drawn: Drawn = { copies: [], chipCenter, tailSize: mdPx };
      if (scene.total === null) return drawn;

      // 판 — 부분집합 카드
      const g = gridOf(scene.total);
      const maxChars = subsetChars(scene.elements);
      const px = Math.min(mdPx, (g.cardW - 12) / (maxChars * MONO_RATIO));
      const cw = px * MONO_RATIO;
      drawn.tailSize = px;
      const slot = (i: number): Pt => ({
        x: g.left + (i % g.cols) * (g.cardW + GAP_X),
        y: GRID_TOP + Math.floor(i / g.cols) * (g.cardH + GAP_Y),
      });
      if (scene.subsets.length > scene.total) {
        throw new Error('powerSetStage: 모음이 판의 칸 수보다 많다');
      }

      const from = step.kind === 'take' ? step.from : scene.subsets.length;
      const cards = el('g', {}, svg);
      scene.subsets.forEach((s, i) => {
        const isCopy = i >= from;
        const p = slot(i);
        const group = el('g', {}, cards);
        el(
          'rect',
          {
            x: round(p.x),
            y: round(p.y),
            width: round(g.cardW),
            height: round(g.cardH),
            rx: 8,
            fill: isCopy ? colors.accent : colors.bgSubtle,
            stroke: isCopy ? colors.accent : colors.border,
            'stroke-width': 1.5,
          },
          group,
        );
        const parts = subsetParts(s);
        const chars = parts.head.length + parts.tail.length + parts.close.length;
        const startX = p.x + g.cardW / 2 - (chars * cw) / 2;
        const cy = p.y + g.cardH / 2;
        const text = el(
          'text',
          {
            x: round(startX),
            y: round(cy),
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': round(px),
            fill: isCopy ? colors.stateInk : colors.text,
            'xml:space': 'preserve',
          },
          group,
        );
        const head = el('tspan', {}, text);
        head.textContent = parts.head;
        const tail = el('tspan', { 'font-weight': isCopy ? 700 : 400 }, text);
        tail.textContent = parts.tail;
        const close = el('tspan', {}, text);
        close.textContent = parts.close;

        if (isCopy) {
          const origin = slot(i - from);
          drawn.copies.push({
            group,
            tail,
            dx: origin.x - p.x,
            dy: origin.y - p.y,
            land: { x: startX + (parts.head.length + 0.5) * cw, y: cy },
          });
        }
      });

      // 캡션 — 지금 일어나는 일
      const line1 = el(
        'text',
        {
          x: MARGIN,
          y: CAPTION_Y1,
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        svg,
      );
      const line2 = el(
        'text',
        {
          x: MARGIN,
          y: CAPTION_Y2,
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: colors.text,
        },
        svg,
      );
      if (step.kind === 'start') {
        line1.textContent = t(
          'caption.start',
          'No element taken yet — the only subset is the empty set.',
        );
        line2.textContent = t('caption.count', 'Subsets: {n}', { n: scene.subsets.length });
      } else {
        line1.textContent = t(
          'caption.take',
          'Take {x}: every subset stays as it is, and its copy gets {x}.',
          { x: step.element },
        );
        if (scene.taken === scene.elements.length) {
          line2.textContent = t('caption.done', 'Subsets: {from} → {to} · Elements taken: {n}', {
            from: step.from,
            to: step.to,
            n: scene.taken,
          });
        } else {
          line2.textContent = t('caption.grow', 'Subsets: {from} → {to}', {
            from: step.from,
            to: step.to,
          });
        }
      }
      return drawn;
    }

    function place(drawn: Drawn, flyers: SVGTextElement[], p: number): void {
      const s = ease(clamp01(p / SLIDE_END));
      const f = ease(clamp01((p - FLY_START) / (1 - FLY_START)));
      const from = drawn.chipCenter;
      if (from === null) throw new Error('powerSetStage: 들이는 원소의 칩이 없다');
      drawn.copies.forEach((c, i) => {
        const ox = c.dx * (1 - s);
        const oy = c.dy * (1 - s);
        c.group.setAttribute('transform', `translate(${round(ox)} ${round(oy)})`);
        const flyer = flyers[i];
        if (flyer === undefined) throw new Error(`powerSetStage: 날아갈 글자 ${i} 가 없다`);
        const tx = c.land.x + ox;
        const ty = c.land.y + oy;
        flyer.setAttribute('x', String(round(from.x + (tx - from.x) * f)));
        flyer.setAttribute('y', String(round(from.y + (ty - from.y) * f)));
        if (f >= 1) {
          flyer.setAttribute('opacity', '0');
          c.tail.removeAttribute('opacity');
        } else {
          c.tail.setAttribute('opacity', '0');
        }
      });
    }

    async function render(
      next: PowerSetScene,
      _prev: PowerSetScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const drawn = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step.kind !== 'take') return;
      if (drawn.copies.length !== step.to - step.from) {
        throw new Error('powerSetStage: 사본 카드 수가 걸음과 맞지 않다');
      }

      // 날아갈 글자 — 사본마다 하나, 들이는 원소의 칩에서 떠난다
      const overlay = el('g', {}, svg);
      const flyers = drawn.copies.map(() => {
        const f = el(
          'text',
          {
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': round(drawn.tailSize),
            'font-weight': 700,
            fill: colors.text,
          },
          overlay,
        );
        f.textContent = step.element;
        return f;
      });
      place(drawn, flyers, 0);

      await tween(MOVE_MS, (p) => {
        if (mine !== gen || destroyed) return;
        place(drawn, flyers, p);
      });
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
