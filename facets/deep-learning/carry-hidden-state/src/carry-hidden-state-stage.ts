/**
 * carry-hidden-state 의 stage — 방금 만든 h 가 다음 셀로 건너가 새 토큰과 섞인다.
 *
 * 펼친 셀이 토큰 차례대로 가로로 선다. 걸음마다 앞 셀 위에 남은 h 의 복제가 굽은 길을 따라
 * 다음 셀 안으로 건너가고(원본은 제자리에 남는다), 셀이 두 몫을 더한 뒤 새 h 가 셀 위로 올라선다.
 * 같은 토큰의 h 칸은 같은 색 테두리를 두르고, 이번 토큰과 같은 토큰의 칸은 테두리를 굵게 한다.
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
import type { CarryScene } from './scene.js';

const H = 330;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 세로 자리 (세로는 고정이다)
const LABEL_Y = 20;
const CHIP_Y = 44;
const CHIP_H = 26;
const CELL_TOP = 100;
const CELL_BOT = 202;
const RECV_Y = 122;
const RECV_H = 22;
const TERM_Y = 154;
const TERM_LABEL_Y = 170;
const SUM_Y = 190;
const TOKEN_Y = 238;
const TOKEN_H = 28;
const XLABEL_Y = 270;
const CAPTION_Y = 296;
const CAPTION2_Y = 318;

// 가로 상한 — 실제 크기는 캔버스 폭에서 역산한다
const MARGIN = 14;
const COL0_W = 64;
const CELL_W_MAX = 118;
const CHIP_W_MAX = 52;

// 운동 한 벌의 시계 (ms)
const MOVE_MS = 820;
const CARRY_END = 0.58;
const FORMULA_FROM = 0.52;
const RISE_FROM = 0.62;
const FRAME_MS = 16;

type Layout = {
  colW: number;
  cellW: number;
  chipW: number;
  cellX: (t: number) => number;
  recvX: (t: number) => number;
  outX: (t: number) => number;
};

function layoutFor(n: number): Layout {
  const colW = (PIECE_CANVAS_W - 2 * MARGIN - COL0_W) / n;
  const cellW = Math.min(CELL_W_MAX, colW - 14);
  const chipW = Math.min(CHIP_W_MAX, cellW / 2 - 4);
  const cellX = (t: number): number => MARGIN + COL0_W + colW * (t - 0.5);
  return {
    colW,
    cellW,
    chipW,
    cellX,
    recvX: (t) => cellX(t) - cellW / 4,
    outX: (t) => (t === 0 ? MARGIN + COL0_W / 2 : cellX(t) + cellW / 4),
  };
}

function round(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function fmt(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

type Handles = {
  recv: SVGGElement | null;
  formula: SVGGElement | null;
  out: SVGGElement | null;
  /** 도착 자리 (받은 h 칸의 가운데) */
  to: { x: number; y: number } | null;
};

export const carryHiddenStateStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const root = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);
    const monoCharW = smPx * 0.6;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function node<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        e.setAttribute(k, typeof v === 'number' ? round(v) : v);
      }
      parent.appendChild(e);
      return e;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      str: string,
      opts: { size: string; fill: string; family?: string; weight?: string; anchor?: string },
    ): SVGTextElement {
      const e = node(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'middle',
          'font-family': opts.family ?? fonts.body,
          'font-size': opts.size,
          'font-weight': opts.weight ?? '400',
          fill: opts.fill,
        },
        parent,
      );
      e.textContent = str;
      return e;
    }

    /** 기호에 아래 첨자 번호를 단다 — h 와 0 · 1 · 2 … */
    function subscripted(parent: Element, x: number, y: number, sym: string, idx: number, fill: string): void {
      const e = node(
        'text',
        {
          x,
          y,
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-style': 'italic',
          fill,
        },
        parent,
      );
      const a = node('tspan', {}, e);
      a.textContent = sym;
      const b = node('tspan', { dy: 4, 'font-size': fontSizes.xs, 'font-style': 'normal' }, e);
      b.textContent = String(idx);
    }

    function arrowDown(parent: Element, x: number, y: number, fill: string): void {
      node('path', { d: `M${round(x - 4)} ${round(y - 6)} L${round(x + 4)} ${round(y - 6)} L${round(x)} ${round(y)} Z`, fill }, parent);
    }

    function arrowUp(parent: Element, x: number, y: number, fill: string): void {
      node('path', { d: `M${round(x - 4)} ${round(y + 6)} L${round(x + 4)} ${round(y + 6)} L${round(x)} ${round(y)} Z`, fill }, parent);
    }

    /** 앞 h 칸에서 다음 셀의 받은 h 칸으로 가는 굽은 길 — 그리는 선과 복제가 걷는 길이 같다 */
    function carryCurve(lay: Layout, to: number): { p0: [number, number]; c: [number, number]; p2: [number, number] } {
      return {
        p0: [lay.outX(to - 1), CHIP_Y],
        c: [lay.recvX(to), CHIP_Y],
        p2: [lay.recvX(to), RECV_Y],
      };
    }

    function onCurve(
      k: { p0: [number, number]; c: [number, number]; p2: [number, number] },
      u: number,
    ): { x: number; y: number } {
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const c = u * u;
      return {
        x: a * k.p0[0] + b * k.c[0] + c * k.p2[0],
        y: a * k.p0[1] + b * k.c[1] + c * k.p2[1],
      };
    }

    function drawStatic(scene: CarryScene): Handles {
      root.textContent = '';
      const handles: Handles = { recv: null, formula: null, out: null, to: null };
      const { tokens, xs, kinds, h0, symbols } = scene.base;
      const n = tokens.length;
      const lay = layoutFor(n);
      const kindColors = categorical(kinds.length, 'vivid');
      const colorOf = (tok: string): string => {
        const c = kindColors[kinds.indexOf(tok)];
        if (c === undefined) throw new Error(`carry-hidden-state-stage: 모르는 토큰 ${tok}`);
        return c;
      };
      const done = scene.cells.length;
      const cur = scene.step?.t ?? 0;
      const curToken = scene.step?.token ?? null;
      const halfChip = lay.chipW / 2;

      node('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: pal.bg }, root);

      const body = node('g', {}, root);
      // 넘겨지는 길은 셀 위에 얹는다 — 화살 끝이 셀 안의 받은 h 칸을 가리킨다
      const paths = node('g', {}, root);
      const movers = node('g', {}, root);

      // 처음 h0
      subscripted(body, lay.outX(0), LABEL_Y, symbols.h, 0, pal.textMuted);
      node(
        'rect',
        {
          x: lay.outX(0) - halfChip,
          y: CHIP_Y - CHIP_H / 2,
          width: lay.chipW,
          height: CHIP_H,
          rx: 5,
          fill: pal.bgSubtle,
          stroke: pal.textMuted,
          'stroke-width': 1.5,
        },
        body,
      );
      label(body, lay.outX(0), CHIP_Y, fmt(h0), { size: fontSizes.sm, fill: pal.text, family: fonts.mono });

      for (let i = 1; i <= n; i += 1) {
        const tok = tokens[i - 1];
        const x = xs[i - 1];
        if (tok === undefined || x === undefined) {
          throw new Error(`carry-hidden-state-stage: ${i} 째 토큰이 없다`);
        }
        const cx = lay.cellX(i);
        const ox = lay.outX(i);
        const rx = lay.recvX(i);
        const cell = i <= done ? scene.cells[i - 1] : undefined;
        const isCur = i === cur;
        const tokColor = colorOf(tok);

        // 넘겨지는 길 — 앞 h 칸에서 이 셀의 받은 h 칸으로
        const k = carryCurve(lay, i);
        const start = { x: k.p0[0] + halfChip, y: k.p0[1] };
        const end = { x: k.p2[0], y: RECV_Y - RECV_H / 2 - 2 };
        const pathColor = isCur ? pal.accent : cell ? pal.textMuted : pal.border;
        node(
          'path',
          {
            d: `M${round(start.x)} ${round(start.y)} Q${round(k.c[0])} ${round(k.c[1])} ${round(end.x)} ${round(end.y)}`,
            fill: 'none',
            stroke: pathColor,
            'stroke-width': isCur ? 2.5 : 1.5,
            ...(cell ? {} : { 'stroke-dasharray': '4 4' }),
          },
          paths,
        );
        arrowDown(paths, end.x, end.y, pathColor);

        // 셀
        node(
          'rect',
          {
            x: cx - lay.cellW / 2,
            y: CELL_TOP,
            width: lay.cellW,
            height: CELL_BOT - CELL_TOP,
            rx: 8,
            fill: cell ? pal.bgSubtle : pal.bg,
            stroke: isCur ? pal.accent : cell ? pal.text : pal.border,
            'stroke-width': isCur ? 2.5 : 1.2,
            ...(cell ? {} : { 'stroke-dasharray': '5 4' }),
          },
          body,
        );

        // 셀에서 나온 h 로 오르는 화살과 tanh
        node(
          'line',
          {
            x1: ox,
            y1: CELL_TOP,
            x2: ox,
            y2: CHIP_Y + CHIP_H / 2 + 6,
            stroke: cell ? pal.textMuted : pal.border,
            'stroke-width': 1.2,
          },
          body,
        );
        arrowUp(body, ox, CHIP_Y + CHIP_H / 2 + 1, cell ? pal.textMuted : pal.border);
        label(body, ox + 5, (CELL_TOP + CHIP_Y + CHIP_H / 2) / 2 + 3, symbols.act, {
          size: fontSizes.xs,
          fill: pal.textMuted,
          family: fonts.mono,
          anchor: 'start',
        });

        // 토큰과 입력값
        node(
          'line',
          { x1: cx, y1: TOKEN_Y - TOKEN_H / 2, x2: cx, y2: CELL_BOT + 6, stroke: pal.textMuted, 'stroke-width': 1.2 },
          body,
        );
        arrowUp(body, cx, CELL_BOT + 1, pal.textMuted);
        node(
          'rect',
          {
            x: cx - TOKEN_H * 0.7,
            y: TOKEN_Y - TOKEN_H / 2,
            width: TOKEN_H * 1.4,
            height: TOKEN_H,
            rx: 6,
            fill: tokColor,
            stroke: isCur ? pal.text : 'none',
            'stroke-width': 2,
          },
          body,
        );
        label(body, cx, TOKEN_Y + 1, tok, { size: fontSizes.lg, fill: pal.stateInk, weight: '700' });
        const xl = node(
          'text',
          {
            x: cx,
            y: XLABEL_Y,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: pal.textMuted,
          },
          body,
        );
        const xa = node('tspan', { 'font-style': 'italic' }, xl);
        xa.textContent = symbols.x;
        const xb = node('tspan', { dx: 6, fill: pal.text }, xl);
        xb.textContent = String(x);

        // 나온 h 칸
        subscripted(body, ox, LABEL_Y, symbols.h, i, cell ? pal.textMuted : pal.border);
        const out = node('g', {}, body);
        const same = cell !== undefined && curToken !== null && cell.token === curToken;
        node(
          'rect',
          {
            x: ox - halfChip,
            y: CHIP_Y - CHIP_H / 2,
            width: lay.chipW,
            height: CHIP_H,
            rx: 5,
            fill: cell ? pal.bg : 'none',
            stroke: cell ? tokColor : pal.border,
            'stroke-width': cell ? (same ? 3.5 : 1.5) : 1.2,
            ...(cell ? {} : { 'stroke-dasharray': '4 3' }),
          },
          out,
        );

        if (cell) {
          label(out, ox, CHIP_Y, fmt(cell.h), {
            size: fontSizes.sm,
            fill: pal.text,
            family: fonts.mono,
            weight: same ? '700' : '400',
          });

          // 넘겨받은 h
          const recv = node('g', {}, isCur ? movers : body);
          node(
            'rect',
            {
              x: rx - halfChip,
              y: RECV_Y - RECV_H / 2,
              width: lay.chipW,
              height: RECV_H,
              rx: 5,
              fill: isCur ? pal.accent : pal.bg,
              stroke: isCur ? pal.accent : pal.textMuted,
              'stroke-width': 1.2,
            },
            recv,
          );
          label(recv, rx, RECV_Y + 1, fmt(cell.prev), {
            size: fontSizes.sm,
            fill: isCur ? pal.stateInk : pal.text,
            family: fonts.mono,
          });

          // 두 몫과 합
          const formula = node('g', {}, body);
          const tx = fmt(cell.termX);
          const th = fmt(cell.termH);
          // 두 몫은 '+' 를 사이에 두고 벌린다 — 벌림은 긴 쪽 글자 폭에서 셈한다
          const spread = monoCharW * 1.4 + (Math.max(tx.length, th.length) * monoCharW) / 2;
          const termLeftX = cx - spread;
          const termRightX = cx + spread;
          label(formula, termLeftX, TERM_Y, tx, { size: fontSizes.sm, fill: pal.text, family: fonts.mono });
          label(formula, cx, TERM_Y, '+', { size: fontSizes.sm, fill: pal.textMuted, family: fonts.mono });
          label(formula, termRightX, TERM_Y, th, { size: fontSizes.sm, fill: pal.text, family: fonts.mono });
          label(formula, termLeftX, TERM_LABEL_Y, symbols.termX, {
            size: fontSizes.xs,
            fill: pal.textMuted,
            family: fonts.mono,
          });
          label(formula, termRightX, TERM_LABEL_Y, symbols.termH, {
            size: fontSizes.xs,
            fill: pal.textMuted,
            family: fonts.mono,
          });
          label(formula, cx, SUM_Y, `= ${fmt(cell.sum)}`, {
            size: fontSizes.sm,
            fill: pal.text,
            family: fonts.mono,
            weight: '700',
          });

          if (isCur) {
            handles.recv = recv;
            handles.formula = formula;
            handles.out = out;
            handles.to = { x: rx, y: RECV_Y };
          }
        }
      }

      // 캡션 — 지금 일어나는 일만
      const step = scene.step;
      if (step === null) {
        label(root, PIECE_CANVAS_W / 2, CAPTION_Y, t('caption.start', 'Nothing seen yet — h: {h}', { h: fmt(h0) }), {
          size: fontSizes.md,
          fill: pal.text,
        });
      } else {
        const cell = scene.cells[step.t - 1];
        if (cell === undefined) throw new Error(`carry-hidden-state-stage: ${step.t} 째 셀이 없다`);
        label(
          root,
          PIECE_CANVAS_W / 2,
          CAPTION_Y,
          t('caption.step', 'Step {t}: token {token} · carried-in h: {prev} · new h: {h}', {
            t: step.t,
            token: step.token,
            prev: fmt(cell.prev),
            h: fmt(cell.h),
          }),
          { size: fontSizes.md, fill: pal.text },
        );
        label(
          root,
          PIECE_CANVAS_W / 2,
          CAPTION2_Y,
          t('caption.same', 'h after token {token}: {list}', {
            token: step.token,
            list: step.sameToken.map(fmt).join(' · '),
          }),
          { size: fontSizes.md, fill: pal.text, weight: '700' },
        );
      }
      return handles;
    }

    function frames(mine: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let elapsed = 0;
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, elapsed / MOVE_MS);
          onFrame(p);
          if (p >= 1) {
            finish();
            return;
          }
          elapsed += FRAME_MS;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: CarryScene, prev: CarryScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      // 한 셀이 막 셈해졌을 때만 흘린다 — prev 는 무엇을 흐르게 할지 고르는 데만 쓴다
      const fresh = prev !== null && next.step !== null && prev.cells.length + 1 === next.cells.length;
      if (!opts.animate || !fresh) return;
      const { recv, formula, out, to } = h;
      if (recv === null || formula === null || out === null || to === null) return;
      const lay = layoutFor(next.base.tokens.length);
      const k = carryCurve(lay, next.cells.length);

      const apply = (p: number): void => {
        const u = ease(clamp01(p / CARRY_END));
        const at = onCurve(k, u);
        recv.setAttribute('transform', `translate(${round(at.x - to.x)} ${round(at.y - to.y)})`);
        formula.setAttribute('opacity', round(clamp01((p - FORMULA_FROM) / (RISE_FROM - FORMULA_FROM))));
        const r = ease(clamp01((p - RISE_FROM) / (1 - RISE_FROM)));
        out.setAttribute('transform', `translate(0 ${round((1 - r) * (SUM_Y - CHIP_Y))})`);
        out.setAttribute('opacity', round(clamp01(r * 2)));
      };
      // 첫 프레임부터 아직 못 온 자리에 둔다
      apply(0);
      await frames(mine, apply);
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
        for (const w of [...waiters]) w();
        waiters.clear();
        root.textContent = '';
      },
    };
  },
};
