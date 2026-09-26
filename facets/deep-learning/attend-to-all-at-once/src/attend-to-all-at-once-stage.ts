/**
 * attend-to-all-at-once 의 무대.
 *
 * 위 줄은 열쇠 · 값으로서의 토큰, 아래 줄은 물음으로서의 토큰이다 (같은 다섯). 둘 사이에
 * 물음 하나마다 열쇠 모두로 가는 선이 있다 — 5 × 5 = 25. 그 아래 표는 선 하나마다 칸 하나.
 *
 * 동사 "한꺼번에 이어진다" 를 운동으로:
 *   층 1 — 25 선이 물음에서 열쇠로 **같은 시계로** 자란다. 거리 4 의 A–E 선도 곧게 선
 *          A–A 선과 같은 순간에 닿는다. 표의 25 칸이 함께 찬다.
 *   층 2 — 모든 선의 굵기가 한 번에 무게로 바뀐다. 표가 점수에서 무게로.
 *   층 3 — 모든 선을 따라 값이 열쇠에서 물음으로 한 번에 내려와 결과 다섯이 선다.
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
} from '@ffacet/core/runtime';
import type { AttendScene } from './scene.js';

const H = 470;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 (ms) — 층마다 한 번, 모두가 같은 시계로 */
const GROW_MS = 600;
const THICKEN_MS = 500;
const FLOW_MS = 700;
const FRAME_MS = 16;

/** 자리 */
const CAPTION_Y = 26;
const DETAIL_Y = 48;
const STATUS_Y = 70;
const VEC_Y = 98;
const KEY_Y = 124;
const QUERY_Y = 238;
const POS_Y = 272;
const RESULT_Y = 294;
const TABLE_HEAD_Y = 334;
const ROW_H = 24;
const TOKEN_R = 15;
const LEFT_LABEL_X = 14;

type Layout = { xs: number[]; colW: number; rowLabelX: number };

function layoutFor(n: number): Layout {
  const left = 150;
  const right = PIECE_CANVAS_W - 56;
  const gap = n > 1 ? (right - left) / (n - 1) : 0;
  const xs = Array.from({ length: n }, (_, j) => r2(left + gap * j));
  return { xs, colW: Math.min(gap - 10, 88), rowLabelX: left - Math.min(gap, 96) * 0.72 };
}

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

/** 표시만 둘째 자리. 셈에는 되넣지 않는다. */
function fmt(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function fmtInt(v: number): string {
  return Number.isInteger(v) ? String(v) : fmt(v);
}

function vecText(vals: readonly number[], f: (v: number) => string): string {
  return `(${vals.map(f).join(', ')})`;
}

function lineWidth(w: number): number {
  return r2(0.6 + 7 * w);
}

const BASE_WIDTH = 1.2;

type Handles = {
  lines: SVGLineElement[][];
  cellTexts: SVGTextElement[][];
  resultTexts: SVGTextElement[];
  flow: SVGGElement;
};

export const attendToAllAtOnceStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function put<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
      if (text !== undefined) el.textContent = text;
      parent.appendChild(el);
      return el;
    }

    function drawStatic(scene: AttendScene): Handles {
      svg.textContent = '';
      const n = scene.tokens.length;
      const ids = scene.tokens.map((tok) => tok.id);
      const hue = categorical(n);
      const { xs, colW, rowLabelX } = layoutFor(n);
      const pairs = scene.pairs;
      const focus = scene.focus;

      // 캡션 — 지금 일어나는 일만
      const cap = put(svg, 'text', {
        x: LEFT_LABEL_X, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.md,
        'font-weight': 600, fill: c.text,
      });
      const det = put(svg, 'text', {
        x: LEFT_LABEL_X, y: DETAIL_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text,
      });
      const kind = scene.step.kind;
      if (kind === 'start') {
        cap.textContent = t('caption.start', 'Tokens: {n}. No pair scored yet.', { n });
      } else if (kind === 'scores') {
        cap.textContent = t('caption.scores', 'Every pair scored in a single step. Pairs: {pairs}', { pairs });
      } else if (kind === 'weights') {
        cap.textContent = t('caption.weights', 'Every row turned into weights in a single step. Rows: {rows}', { rows: n });
      } else {
        cap.textContent = t('caption.results', 'Every result mixed in a single step. Results: {n}', { n });
      }
      if (kind === 'weights' || kind === 'results') {
        const wts = scene.weights;
        if (!focus || !wts) throw new Error(`attend-to-all-at-once 무대: ${kind} 걸음에 무게 · 초점이 없다`);
        if (kind === 'weights') {
          det.textContent = t(
            'detail.weights',
            '{q} weighs {k} most: position {pos}, distance {dist}, weight {w} · adjacent {nb}: {nw}',
            {
              q: ids[focus.query]!, k: ids[focus.key]!, pos: focus.key + 1, dist: focus.distance,
              w: fmt(wts[focus.query]![focus.key]!),
              nb: ids[focus.neighbor]!, nw: fmt(wts[focus.query]![focus.neighbor]!),
            },
          );
        } else {
          const reach = scene.reach;
          if (!reach) throw new Error('attend-to-all-at-once 무대: results 걸음에 reach 가 없다');
          det.textContent = t(
            'detail.results',
            'Layers to reach the farthest pair {q}–{far}: {farLayer} · the adjacent pair {q}–{nb}: {nearLayer}',
            {
              q: ids[focus.query]!, far: ids[reach.farKey]!, farLayer: reach.far,
              nb: ids[focus.neighbor]!, nearLayer: reach.near,
            },
          );
        }
      }

      // 셈 계기
      put(svg, 'text', {
        x: LEFT_LABEL_X, y: STATUS_Y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
      }, t('status.line', 'Pairs scored: {pairs} · Layers done: {layer}', { pairs, layer: scene.layer }));

      // 줄 이름
      const roleAttrs = { x: LEFT_LABEL_X, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted };
      put(svg, 'text', { ...roleAttrs, y: KEY_Y + 4 }, t('label.keys', 'Key · value'));
      put(svg, 'text', { ...roleAttrs, y: QUERY_Y + 4 }, t('label.queries', 'Query'));
      put(svg, 'text', { ...roleAttrs, y: POS_Y }, t('label.position', 'Position'));
      if (scene.results) put(svg, 'text', { ...roleAttrs, y: RESULT_Y }, t('label.result', 'Result'));

      // 선 — 물음 i 에서 열쇠 j 로
      const lineLayer = put(svg, 'g', {});
      const lines: SVGLineElement[][] = [];
      const order: [number, number][] = [];
      for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) order.push([i, j]);
      if (focus) {
        // 가장 크게 보는 짝을 맨 위에 그린다
        const at = order.findIndex(([i, j]) => i === focus.query && j === focus.key);
        order.push(order.splice(at, 1)[0]!);
      }
      for (let i = 0; i < n; i += 1) lines.push([]);
      if (scene.scores) {
        for (const [i, j] of order) {
          const isFocus = focus !== null && i === focus.query && j === focus.key;
          const w = scene.weights ? scene.weights[i]![j]! : null;
          const ln = put(lineLayer, 'line', {
            x1: xs[i]!, y1: QUERY_Y - TOKEN_R, x2: xs[j]!, y2: KEY_Y + TOKEN_R,
            stroke: isFocus ? c.accent : hue[i]!,
            'stroke-width': w === null ? BASE_WIDTH : lineWidth(w),
            'stroke-opacity': isFocus ? 1 : 0.7,
            'stroke-linecap': 'butt',
          });
          lines[i]![j] = ln;
        }
      }

      // 토큰 — 위(열쇠 · 값)와 아래(물음)
      scene.tokens.forEach((tok, j) => {
        const x = xs[j]!;
        put(svg, 'text', {
          x, y: VEC_Y, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted,
        }, vecText(tok.x, fmtInt));
        for (const y of [KEY_Y, QUERY_Y]) {
          put(svg, 'circle', { cx: x, cy: y, r: TOKEN_R, fill: c.bg, stroke: hue[j]!, 'stroke-width': 2 });
          put(svg, 'text', {
            x, y: y + 5, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md,
            'font-weight': 700, fill: c.text,
          }, tok.id);
        }
        put(svg, 'text', {
          x, y: POS_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
        }, String(j + 1));
      });

      // 결과
      const resultTexts: SVGTextElement[] = [];
      if (scene.results) {
        scene.results.forEach((vec, i) => {
          resultTexts.push(put(svg, 'text', {
            x: xs[i]!, y: RESULT_Y, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs,
            'font-weight': 600, fill: c.text,
          }, vecText(vec, fmt)));
        });
      }

      // 표 — 줄 = 묻는 토큰, 칸 = 답하는 토큰
      const table = scene.weights ?? scene.scores;
      put(svg, 'text', {
        x: LEFT_LABEL_X, y: TABLE_HEAD_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600,
        fill: c.text,
      }, scene.weights ? t('label.weights', 'Weight') : t('label.scores', 'Score'));
      ids.forEach((id, j) => {
        put(svg, 'text', {
          x: xs[j]!, y: TABLE_HEAD_Y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm,
          'font-weight': 700, fill: c.textMuted,
        }, id);
      });
      const cellTexts: SVGTextElement[][] = [];
      ids.forEach((id, i) => {
        const cy = TABLE_HEAD_Y + ROW_H * (i + 1);
        put(svg, 'text', {
          x: r2(rowLabelX), y: cy, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm,
          'font-weight': 700, fill: hue[i]!,
        }, id);
        const row: SVGTextElement[] = [];
        ids.forEach((_, j) => {
          const isArg = scene.argmax !== null && scene.argmax[i] === j;
          const isFocus = focus !== null && i === focus.query && j === focus.key;
          const isNeighbor = focus !== null && i === focus.query && j === focus.neighbor;
          put(svg, 'rect', {
            x: r2(xs[j]! - colW / 2), y: cy - ROW_H + 7, width: r2(colW), height: ROW_H - 3, rx: 3,
            fill: isFocus ? c.accent : c.bgSubtle,
            stroke: isArg || isNeighbor ? c.text : c.border,
            'stroke-width': isArg ? 1.5 : 1,
            ...(isNeighbor ? { 'stroke-dasharray': '3 2' } : {}),
          });
          row.push(put(svg, 'text', {
            x: xs[j]!, y: cy + 1, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm,
            'font-weight': isArg ? 700 : 400, fill: isFocus ? c.stateInk : table ? c.text : c.textMuted,
          }, table ? fmt(table[i]![j]!) : '·'));
        });
        cellTexts.push(row);
      });

      const flow = put(svg, 'g', {});
      return { lines, cellTexts, resultTexts, flow };
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

    /** 한 시계로 0 → 1. 세대가 바뀌면 멈춘다. */
    async function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      frame(0);
      for (;;) {
        if (destroyed || mine !== gen) return false;
        await wait(FRAME_MS);
        if (destroyed || mine !== gen) return false;
        const raw = Math.min(1, (Date.now() - start) / ms);
        const p = raw < 0.5 ? 2 * raw * raw : 1 - 2 * (1 - raw) * (1 - raw);
        frame(p);
        if (raw >= 1) return true;
      }
    }

    async function render(next: AttendScene, prev: AttendScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || prev === null || prev.step.kind === next.step.kind) return;
      const n = next.tokens.length;
      const { xs } = layoutFor(n);
      const kind = next.step.kind;

      if (kind === 'scores') {
        // 25 선이 같은 시계로 자란다 — 먼 짝도 옆 짝도 같은 순간에 닿는다
        await tween(GROW_MS, mine, (p) => {
          for (let i = 0; i < n; i += 1) {
            for (let j = 0; j < n; j += 1) {
              const ln = h.lines[i]![j];
              if (!ln) throw new Error(`attend-to-all-at-once 무대: 선 ${i}–${j} 가 그려지지 않았다`);
              const x1 = xs[i]!;
              const y1 = QUERY_Y - TOKEN_R;
              ln.setAttribute('x2', String(r2(x1 + (xs[j]! - x1) * p)));
              ln.setAttribute('y2', String(r2(y1 + (KEY_Y + TOKEN_R - y1) * p)));
            }
          }
          for (const row of h.cellTexts) for (const tx of row) tx.setAttribute('opacity', String(r2(p)));
        });
      } else if (kind === 'weights') {
        const wts = next.weights;
        if (!wts) throw new Error('attend-to-all-at-once 무대: weights 걸음에 무게가 없다');
        await tween(THICKEN_MS, mine, (p) => {
          for (let i = 0; i < n; i += 1) {
            for (let j = 0; j < n; j += 1) {
              const ln = h.lines[i]![j];
              if (!ln) throw new Error(`attend-to-all-at-once 무대: 선 ${i}–${j} 가 그려지지 않았다`);
              ln.setAttribute('stroke-width', String(r2(BASE_WIDTH + (lineWidth(wts[i]![j]!) - BASE_WIDTH) * p)));
            }
          }
        });
      } else if (kind === 'results') {
        // 모든 선을 따라 값이 열쇠에서 물음으로 한 번에 내려온다
        const wts = next.weights;
        if (!wts) throw new Error('attend-to-all-at-once 무대: results 걸음에 무게가 없다');
        const dots: { el: SVGCircleElement; i: number; j: number }[] = [];
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < n; j += 1) {
            const el = document.createElementNS(SVG_NS, 'circle');
            el.setAttribute('r', String(r2(1.2 + 6 * Math.sqrt(wts[i]![j]!))));
            el.setAttribute('fill', c.text);
            h.flow.appendChild(el);
            dots.push({ el, i, j });
          }
        }
        for (const tx of h.resultTexts) tx.setAttribute('opacity', '0');
        await tween(FLOW_MS, mine, (p) => {
          for (const d of dots) {
            const x0 = xs[d.j]!;
            const y0 = KEY_Y + TOKEN_R;
            d.el.setAttribute('cx', String(r2(x0 + (xs[d.i]! - x0) * p)));
            d.el.setAttribute('cy', String(r2(y0 + (QUERY_Y - TOKEN_R - y0) * p)));
          }
          for (const tx of h.resultTexts) tx.setAttribute('opacity', String(r2(p >= 0.85 ? (p - 0.85) / 0.15 : 0)));
        });
      }
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
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
