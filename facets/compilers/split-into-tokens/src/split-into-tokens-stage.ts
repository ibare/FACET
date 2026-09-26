/**
 * split-into-tokens stage — 원문 글자 줄에서 덩이가 떨어져 나간다.
 *
 * 토큰 덩이는 글자째 아래로 내려가 토큰 열 끝에 맞붙는다. 빈칸 덩이는 토큰 열을 지나쳐
 * 바닥의 버림 칸으로 떨어진다. 원문 줄에는 끊은 자리의 금과 비어 버린 칸이 남는다.
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
import type { SplitChunk, SplitScene } from './scene.js';

const H = 290;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 칸 폭 상한 — 실제 폭은 캔버스에서 역산한다 */
const CELL_MAX = 30;
const SIDE = 16;
const SRC_TOP = 30;
const SRC_H = 34;
const TOK_TOP = 116;
const TOK_H = 34;
const DROP_TOP = 214;
const DROP_H = 26;
const CHIP_PAD = 5;
const DROP_GAP = 16;
const MOVE_MS = 450;

type Layout = { cell: number; x0: number };

function layoutFor(source: string): Layout {
  const n = Math.max(1, source.length);
  const cell = Math.min(CELL_MAX, Math.floor(((PIECE_CANVAS_W - SIDE * 2) / n) * 10) / 10);
  const x0 = Math.round((PIECE_CANVAS_W - cell * n) / 2);
  return { cell, x0 };
}

const r1 = (v: number): number => {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? 0 : x;
};

/** 토큰 종류 이름이 이름 · 수 · 연산자면 원문을 곁들이고, 키워드면 종류만 적는다 */
function tokenNotation(kind: string, text: string): string {
  return kind === 'NAME' || kind === 'NUM' || kind === 'OP' ? `${kind} ${text}` : kind;
}

type Handles = {
  moving: SVGGElement | null;
  from: { dx: number; dy: number };
  fall: boolean;
  /** 기울임의 중심 (끝 자리 기준) */
  pivot: { x: number; y: number };
};

export const splitIntoTokensStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & {
    render(next: SplitScene, prev: SplitScene | null, opts: { animate: boolean }): Promise<void>;
  } {
    const svg = params.canvas;
    const doc = svg.ownerDocument;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const monoPx = parseFloat(fontSizes.lg);
    const smallPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = doc.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(parent: Element, x: number, y: number, text: string, opts: {
      size: string; fill: string; family?: string; anchor?: string; weight?: string;
    }): SVGTextElement {
      const node = el('text', {
        x: r1(x),
        y: r1(y),
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size,
        fill: opts.fill,
        'text-anchor': opts.anchor ?? 'start',
      }, parent);
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
      return node;
    }

    /** 빈칸 표시 — 칸 바닥의 작은 받침 */
    function blankMark(parent: Element, x: number, top: number, h: number, cell: number, color: string): void {
      const y = top + h * 0.7;
      const a = x + cell * 0.25;
      const b = x + cell * 0.75;
      el('path', {
        d: `M${r1(a)} ${r1(y - 4)}V${r1(y)}H${r1(b)}V${r1(y - 4)}`,
        fill: 'none',
        stroke: color,
        'stroke-width': 1.2,
      }, parent);
    }

    function drawStatic(scene: SplitScene): Handles {
      svg.textContent = '';
      const handles: Handles = { moving: null, from: { dx: 0, dy: 0 }, fall: false, pivot: { x: 0, y: 0 } };
      const { source, chunks, step } = scene;
      if (source.length === 0) return handles;
      const { cell, x0 } = layoutFor(source);
      const consumed = chunks.length > 0 ? chunks[chunks.length - 1]!.to : 0;
      const current = step.kind === 'start' ? -1 : step.index;

      const tokens = chunks.filter((k) => k.kind !== null);
      const drops = chunks.filter((k) => k.kind === null);
      const droppedChars = drops.reduce((s, k) => s + (k.to - k.from), 0);

      // 원문 줄
      label(svg, x0, SRC_TOP - 10, t('label.source', 'Source'), { size: fontSizes.sm, fill: c.textMuted });
      for (let i = 0; i < source.length; i += 1) {
        const x = x0 + i * cell;
        const ch = source.charAt(i);
        const gone = i < consumed;
        el('rect', {
          x: r1(x + 1), y: SRC_TOP, width: r1(cell - 2), height: SRC_H, rx: 3,
          fill: gone ? 'none' : ch === ' ' ? c.bgSubtle : c.bg,
          stroke: c.border,
          ...(gone || ch === ' ' ? { 'stroke-dasharray': '2 3' } : {}),
        }, svg);
        if (gone) continue;
        if (ch === ' ') {
          blankMark(svg, x, SRC_TOP, SRC_H, cell, c.textMuted);
        } else {
          label(svg, x + cell / 2, SRC_TOP + SRC_H / 2 + monoPx * 0.35, ch, {
            size: fontSizes.lg, fill: c.text, family: fonts.mono, anchor: 'middle',
          });
        }
      }
      // 끊은 자리의 금 — 방금 끊은 자리는 굵게
      chunks.forEach((k, idx) => {
        if (k.to >= source.length) return;
        const x = x0 + k.to * cell;
        el('line', {
          x1: r1(x), y1: SRC_TOP - 5, x2: r1(x), y2: SRC_TOP + SRC_H + 5,
          stroke: idx === current ? c.primary : c.textMuted,
          'stroke-width': idx === current ? 2 : 1,
        }, svg);
      });

      // 토큰 열
      label(svg, x0, TOK_TOP - 10, t('label.tokens', 'Tokens: {n}', { n: tokens.length }), {
        size: fontSizes.sm, fill: c.textMuted,
      });
      let tx = x0;
      chunks.forEach((k, idx) => {
        if (k.kind === null) return;
        const len = k.to - k.from;
        const kindW = k.kind.length * smallPx * 0.62 + 6;
        const w = Math.max(len * cell + CHIP_PAD * 2, kindW);
        const inner = (w - len * cell) / 2;
        const hot = idx === current;
        const g = el('g', {}, svg);
        el('rect', {
          x: r1(tx), y: TOK_TOP, width: r1(w), height: TOK_H,
          fill: hot ? c.accent : c.bgSubtle, stroke: c.text, 'stroke-width': 1,
        }, g);
        for (let m = 0; m < len; m += 1) {
          label(g, tx + inner + m * cell + cell / 2, TOK_TOP + TOK_H / 2 + monoPx * 0.35, source.charAt(k.from + m), {
            size: fontSizes.lg, fill: hot ? c.stateInk : c.text, family: fonts.mono, anchor: 'middle',
          });
        }
        label(g, tx + w / 2, TOK_TOP + TOK_H + smallPx + 4, k.kind, {
          size: fontSizes.xs, fill: hot ? c.text : c.textMuted, family: fonts.mono, anchor: 'middle',
          weight: hot ? '600' : '400',
        });
        if (hot) {
          handles.moving = g;
          handles.from = { dx: x0 + k.from * cell - (tx + inner), dy: SRC_TOP - TOK_TOP };
          handles.fall = false;
        }
        tx += w;
      });

      // 버림 칸
      label(svg, x0, DROP_TOP - 10, t('label.dropped', 'Dropped characters: {n}', { n: droppedChars }), {
        size: fontSizes.sm, fill: c.textMuted,
      });
      let dx = x0;
      chunks.forEach((k, idx) => {
        if (k.kind !== null) return;
        const len = k.to - k.from;
        const hot = idx === current;
        const g = el('g', {}, svg);
        for (let m = 0; m < len; m += 1) {
          const x = dx + m * cell;
          el('rect', {
            x: r1(x + 1), y: DROP_TOP, width: r1(cell - 2), height: DROP_H, rx: 3,
            fill: c.bgSubtle, stroke: hot ? c.text : c.border, 'stroke-dasharray': '2 3',
          }, g);
          blankMark(g, x, DROP_TOP, DROP_H, cell, c.textMuted);
        }
        if (hot) {
          handles.moving = g;
          handles.from = { dx: x0 + k.from * cell - dx, dy: SRC_TOP - DROP_TOP };
          handles.fall = true;
          handles.pivot = { x: dx + (len * cell) / 2, y: DROP_TOP + DROP_H / 2 };
        }
        dx += len * cell + DROP_GAP;
      });

      // 캡션 — 지금 일어난 일
      label(svg, PIECE_CANVAS_W / 2, H - 16, caption(scene, current), {
        size: fontSizes.md, fill: c.text, anchor: 'middle',
      });
      return handles;
    }

    function caption(scene: SplitScene, current: number): string {
      if (current < 0) return t('caption.start', 'Cut the line from the left, one chunk at a time.');
      const k: SplitChunk = scene.chunks[current]!;
      if (k.kind === null) {
        return t('caption.drop', 'Cut [{from},{to}) — a blank run, length {n}. Dropped; it never reaches the token row.', {
          from: k.from, to: k.to, n: k.to - k.from,
        });
      }
      return t('caption.cut', 'Cut [{from},{to}) — token {token}. It joins the end of the token row.', {
        from: k.from, to: k.to, token: tokenNotation(k.kind, scene.source.slice(k.from, k.to)),
      });
    }

    function tween(ms: number, frame: (p: number) => void, mine: number): Promise<void> {
      return new Promise((resolve) => {
        let start = -1;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) return done();
          if (start < 0) start = now;
          const p = Math.min(1, (now - start) / ms);
          frame(p);
          if (p >= 1) return done();
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

    async function render(next: SplitScene, prev: SplitScene | null, opts: { animate: boolean }): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const h = drawStatic(next);
      const grew = prev !== null && prev.source === next.source && prev.chunks.length + 1 === next.chunks.length;
      if (!opts.animate || !grew || h.moving === null) return;
      const g = h.moving;
      const { dx, dy } = h.from;
      const place = (p: number): void => {
        // 토큰은 부드럽게 내려앉고, 빈칸은 점점 빨라지며 떨어진다
        const ex = h.fall ? p : 1 - (1 - p) * (1 - p) * (1 - p);
        const ey = h.fall ? p * p : ex;
        const x = r1(dx * (1 - ex));
        const y = r1(dy * (1 - ey));
        const tilt = h.fall ? r1(-10 * p * (1 - p) * 4) : 0;
        g.setAttribute('transform', tilt === 0 ? `translate(${x} ${y})` : `translate(${x} ${y}) rotate(${tilt} ${r1(h.pivot.x)} ${r1(h.pivot.y)})`);
      };
      place(0);
      await tween(MOVE_MS, place, mine);
      if (destroyed || mine !== gen) return;
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
