/**
 * chain-rule-multiply 무대 — 세 자리(입력 · 가운데 · 출력)의 눈금 막대와 그 사이의 두 함수 문.
 *
 * 움직임은 한 축척의 막대 길이다. 입력을 밀면 입력 막대가 솟고, 그 막대가 문을 건너며
 * 늘어나 다음 자리에 선다. 세 막대가 같은 축척이라 두 번 불어난 것이 길이로 보인다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { fmtNum, formatTerms } from './algorithm.js';
import type { ChainMove, ChainRuleMultiplyScene } from './scene.js';

const H = 360;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 (ms) */
const GROW_MS = 500;
const CROSS_MS = 600;
const BRACKET_MS = 600;
const SETTLE_MS = 450;

type Layout = {
  gauge: [number, number, number];
  gate: [number, number];
  gateW: number;
  top: number;
  base: number;
  maxBar: number;
  barW: number;
  rowY: number;
  bracketY: number;
  bracketLabelY: number;
  captionY: number;
};

function layout(): Layout {
  const W = PIECE_CANVAS_W;
  const base = H - 110;
  const top = 58;
  return {
    gauge: [W * 0.11, W * 0.5, W * 0.89],
    gate: [W * 0.305, W * 0.695],
    gateW: Math.min(104, W * 0.17),
    top,
    base,
    maxBar: base - top,
    barW: Math.min(22, W * 0.036),
    rowY: base + 24,
    bracketY: base + 46,
    bracketLabelY: base + 68,
    captionY: H - 16,
  };
}

function r2(v: number): string {
  const s = String(Math.round(v * 100) / 100);
  return s === '-0' ? '0' : s;
}

type Handles = {
  bars: [SVGRectElement | null, SVGRectElement | null, SVGRectElement | null];
  barLabels: [SVGGElement | null, SVGGElement | null, SVGGElement | null];
  ratios: [SVGGElement | null, SVGGElement | null];
  bracketLine: SVGLineElement | null;
  bracketEnd: SVGLineElement | null;
  bracketLabel: SVGGElement | null;
  /** 민 폭 → 0 의 값 — 문 안 둘과 통째 배 옆 하나. 걸음 4 의 배는 그대로 남는다 */
  limits: SVGGElement[];
};

export const chainRuleMultiplyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const L = layout();
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size: string; fill: string; weight?: string; anchor?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          'font-family': fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'middle',
          'font-weight': opts.weight ?? '400',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    /** 배 뱃지 — 끝 걸음(민 폭 → 0)의 값은 강조 채움으로 가른다. */
    function badge(parent: Element, x: number, y: number, text: string, settled: boolean): SVGGElement {
      const g = el('g', {}, parent);
      if (settled) {
        const w = text.length * smPx * 0.62 + 14;
        el(
          'rect',
          {
            x: r2(x - w / 2),
            y: r2(y - smPx - 3),
            width: r2(w),
            height: r2(smPx + 9),
            rx: '4',
            fill: colors.accent,
            stroke: colors.text,
            'stroke-width': '1',
          },
          g,
        );
      }
      label(g, x, y, text, {
        size: fontSizes.sm,
        fill: settled ? colors.stateInk : colors.primary,
        weight: '700',
      });
      return g;
    }

    function barLen(delta: number, span: number): number {
      if (delta < 0) throw new Error('chain-rule-multiply 무대: 음의 움직임은 그리지 않는다');
      return (delta / span) * L.maxBar;
    }

    function drawStatic(scene: ChainRuleMultiplyScene): Handles {
      svg.textContent = '';
      const h: Handles = {
        bars: [null, null, null],
        barLabels: [null, null, null],
        ratios: [null, null],
        bracketLine: null,
        bracketEnd: null,
        bracketLabel: null,
        limits: [],
      };
      const caption = captionOf(scene);
      if (caption !== null) {
        label(svg, PIECE_CANVAS_W / 2, L.captionY, caption, { size: fontSizes.md, fill: colors.text });
      }
      const base = scene.base;
      if (!base) return h;
      const [sIn, sMid, sOut] = base.symbols;
      const starts = [base.x0, base.u0, base.y0];

      // 두 함수 문
      const gates: Array<{ word: string; name: string; expr: string }> = [
        { word: t('label.inner', 'inner function'), name: sMid, expr: formatTerms(base.inner, sIn) },
        { word: t('label.outer', 'outer function'), name: sOut, expr: formatTerms(base.outer, sMid) },
      ];
      gates.forEach((g, i) => {
        const cx = L.gate[i];
        if (cx === undefined) throw new Error(`무대: 문 자리 ${i} 가 없다`);
        el(
          'rect',
          {
            x: r2(cx - L.gateW / 2),
            y: r2(L.top),
            width: r2(L.gateW),
            height: r2(L.base - L.top),
            rx: '6',
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': '1',
          },
          svg,
        );
        label(svg, cx, L.top - 26, g.word, { size: fontSizes.xs, fill: colors.textMuted });
        label(svg, cx, L.top - 9, t('label.formula', '{name} = {expr}', { name: g.name, expr: g.expr }), {
          size: fontSizes.md,
          fill: colors.text,
          weight: '600',
        });
      });

      // 세 자리의 눈금
      [sIn, sMid, sOut].forEach((sym, i) => {
        const gx = L.gauge[i];
        const v0 = starts[i];
        if (gx === undefined || v0 === undefined) throw new Error(`무대: 자리 ${i} 가 없다`);
        el(
          'line',
          {
            x1: r2(gx),
            y1: r2(L.base),
            x2: r2(gx),
            y2: r2(L.top - 34),
            stroke: colors.border,
            'stroke-width': '1',
            'stroke-dasharray': '2 4',
          },
          svg,
        );
        el(
          'line',
          {
            x1: r2(gx - 20),
            y1: r2(L.base),
            x2: r2(gx + 20),
            y2: r2(L.base),
            stroke: colors.textMuted,
            'stroke-width': '2',
          },
          svg,
        );
        label(svg, gx, L.rowY, t('label.value', '{name} {v}', { name: sym, v: fmtNum(v0, 2) }), {
          size: fontSizes.md,
          fill: colors.text,
          weight: '600',
        });
      });

      // 움직임 막대 — 셋이 한 축척
      scene.moves.forEach((m: ChainMove | null, i) => {
        if (!m) return;
        const gx = L.gauge[i];
        const sym = base.symbols[i];
        if (gx === undefined || sym === undefined) throw new Error(`무대: 자리 ${i} 가 없다`);
        const len = barLen(m.delta, base.span);
        h.bars[i] = el(
          'rect',
          {
            x: r2(gx - L.barW / 2),
            y: r2(L.base - len),
            width: r2(L.barW),
            height: r2(len),
            fill: colors.accent,
            stroke: colors.text,
            'stroke-width': '1',
          },
          svg,
        );
        const g = el('g', {}, svg);
        const topY = L.base - len;
        label(g, gx, topY - 24, t('label.value', '{name} {v}', { name: sym, v: fmtNum(m.to, i === 0 ? 2 : 4) }), {
          size: fontSizes.sm,
          fill: colors.textMuted,
        });
        label(g, gx, topY - 8, t('label.delta', 'Δ{name} {v}', { name: sym, v: fmtNum(m.delta, 4) }), {
          size: fontSizes.sm,
          fill: colors.text,
          weight: '700',
        });
        h.barLabels[i] = g;
      });

      // 단계의 배 — 문 아래 줄
      const lim = scene.limit;
      [scene.moves[1], scene.moves[2]].forEach((m, i) => {
        if (!m) return;
        const cx = L.gate[i];
        if (cx === undefined) throw new Error(`무대: 문 자리 ${i} 가 없다`);
        if (m.ratio === null) throw new Error(`무대: 단계 ${i} 의 배가 없다`);
        h.ratios[i] = badge(svg, cx, L.rowY, t('label.ratio', '×{r}', { r: fmtNum(m.ratio, 2) }), false);
        // 민 폭 → 0 의 배는 문 안 바닥에 따로 선다 — 잰 배와 한 화면에서 견준다
        if (lim) {
          const d = i === 0 ? lim.d1 : lim.d2;
          h.limits.push(badge(svg, cx, L.base - 14, t('label.ratio', '×{r}', { r: fmtNum(d, 2) }), true));
        }
      });

      // 통째 배 — 입력에서 출력까지 걸친 꺾쇠
      if (scene.whole) {
        const x0 = L.gauge[0];
        const x2 = L.gauge[2];
        const stroke = { stroke: colors.primary, 'stroke-width': '1.5' };
        el('line', { x1: r2(x0), y1: r2(L.bracketY - 7), x2: r2(x0), y2: r2(L.bracketY), ...stroke }, svg);
        h.bracketLine = el('line', { x1: r2(x0), y1: r2(L.bracketY), x2: r2(x2), y2: r2(L.bracketY), ...stroke }, svg);
        h.bracketEnd = el('line', { x1: r2(x2), y1: r2(L.bracketY - 7), x2: r2(x2), y2: r2(L.bracketY), ...stroke }, svg);
        const cx = (x0 + x2) / 2;
        h.bracketLabel = badge(svg, cx, L.bracketLabelY, t('label.ratio', '×{r}', { r: fmtNum(scene.whole.ratio, 2) }), false);
        if (lim) {
          // 잰 통째 배 옆에 화살과 함께 한계값이 선다
          const g = el('g', {}, svg);
          const ay = L.bracketLabelY - smPx * 0.35;
          el('line', { x1: r2(cx + 30), y1: r2(ay), x2: r2(cx + 52), y2: r2(ay), stroke: colors.textMuted, 'stroke-width': '1.5' }, g);
          el('path', { d: `M ${r2(cx + 52)} ${r2(ay)} l -6 -4 v 8 z`, fill: colors.textMuted }, g);
          badge(g, cx + 88, L.bracketLabelY, t('label.ratio', '×{r}', { r: fmtNum(lim.d, 2) }), true);
          h.limits.push(g);
        }
      }
      return h;
    }

    function captionOf(scene: ChainRuleMultiplyScene): string | null {
      const base = scene.base;
      if (!base) return null;
      const [sIn, sMid, sOut] = base.symbols;
      const [m0, m1, m2] = scene.moves;
      switch (scene.step) {
        case 'start':
          return t('caption.start', 'Nothing has moved yet.');
        case 'push': {
          if (!m0) throw new Error('무대: push 걸음에 입력의 움직임이 없다');
          return t('caption.push', 'Push {in} by {dx}.', { in: sIn, dx: String(m0.delta) });
        }
        case 'inner': {
          if (!m1 || m1.ratio === null) throw new Error('무대: inner 걸음에 가운데 움직임이 없다');
          return t('caption.inner', 'Across the inner function: Δ{mid} = {d} · ratio ×{r}', {
            mid: sMid,
            d: fmtNum(m1.delta, 4),
            r: fmtNum(m1.ratio, 2),
          });
        }
        case 'outer': {
          if (!m2 || m2.ratio === null) throw new Error('무대: outer 걸음에 출력 움직임이 없다');
          return t('caption.outer', 'Across the outer function: Δ{out} = {d} · ratio ×{r}', {
            out: sOut,
            d: fmtNum(m2.delta, 4),
            r: fmtNum(m2.ratio, 2),
          });
        }
        case 'whole': {
          const w = scene.whole;
          if (!w) throw new Error('무대: whole 걸음에 통째 배가 없다');
          return t('caption.whole', 'Whole ratio Δ{out}/Δ{in} = {w} = {r1} × {r2}', {
            out: sOut,
            in: sIn,
            w: fmtNum(w.ratio, 2),
            r1: fmtNum(w.r1, 2),
            r2: fmtNum(w.r2, 2),
          });
        }
        case 'limit': {
          const l = scene.limit;
          if (!l) throw new Error('무대: limit 걸음에 도함수가 없다');
          return t('caption.limit', 'Push width → 0: d{mid}/d{in} = {d1} · d{out}/d{mid} = {d2} · product {d}', {
            mid: sMid,
            in: sIn,
            out: sOut,
            d1: fmtNum(l.d1, 2),
            d2: fmtNum(l.d2, 2),
            d: fmtNum(l.d, 2),
          });
        }
      }
    }

    /** 한 시계 — p 를 0 에서 1 로. 취소되면 false. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        const started = Date.now();
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish(false);
          const p = Math.min(1, (Date.now() - started) / ms);
          frame(p);
          if (p >= 1) return finish(true);
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

    function need<T>(v: T | null | undefined, what: string): T {
      if (v === null || v === undefined) throw new Error(`chain-rule-multiply 무대: 운동의 손잡이가 없다 — ${what}`);
      return v;
    }

    /** 입력 막대가 밑줄에서 솟는다. */
    async function grow(h: Handles, mine: number): Promise<void> {
      const bar = need(h.bars[0], 'bars[0]');
      const tag = need(h.barLabels[0], 'barLabels[0]');
      const full = Number(bar.getAttribute('height'));
      tag.setAttribute('opacity', '0');
      await tween(GROW_MS, mine, (p) => {
        const len = full * ease(p);
        bar.setAttribute('height', r2(len));
        bar.setAttribute('y', r2(L.base - len));
      });
    }

    /** 앞 자리의 막대가 문을 건너며 늘어나 다음 자리에 선다. */
    async function cross(h: Handles, to: 1 | 2, fromLen: number, mine: number): Promise<void> {
      const bar = need(h.bars[to], `bars[${to}]`);
      const tag = need(h.barLabels[to], `barLabels[${to}]`);
      const ratio = need(h.ratios[to - 1], `ratios[${to - 1}]`);
      const fromX = need(L.gauge[to - 1], 'gauge from');
      const toX = need(L.gauge[to], 'gauge to');
      const full = Number(bar.getAttribute('height'));
      tag.setAttribute('opacity', '0');
      ratio.setAttribute('opacity', '0');
      await tween(CROSS_MS, mine, (p) => {
        const e = ease(p);
        const cx = fromX + (toX - fromX) * e;
        // 문 안(가운데 셋째 토막)에서만 늘어난다
        const q = Math.min(1, Math.max(0, (p - 0.3) / 0.4));
        const len = fromLen + (full - fromLen) * q;
        bar.setAttribute('x', r2(cx - L.barW / 2));
        bar.setAttribute('height', r2(len));
        bar.setAttribute('y', r2(L.base - len));
      });
    }

    /** 통째 배의 꺾쇠가 입력에서 출력으로 뻗는다. */
    async function reach(h: Handles, mine: number): Promise<void> {
      const line = need(h.bracketLine, 'bracketLine');
      const end = need(h.bracketEnd, 'bracketEnd');
      const tag = need(h.bracketLabel, 'bracketLabel');
      const x0 = need(L.gauge[0], 'gauge 0');
      const x2 = need(L.gauge[2], 'gauge 2');
      end.setAttribute('opacity', '0');
      tag.setAttribute('opacity', '0');
      await tween(BRACKET_MS, mine, (p) => {
        line.setAttribute('x2', r2(x0 + (x2 - x0) * ease(p)));
      });
    }

    /** 민 폭 → 0 의 값이 제자리로 내려앉는다. */
    async function settle(h: Handles, mine: number): Promise<void> {
      if (h.limits.length !== 3) throw new Error(`chain-rule-multiply 무대: 한계값 손잡이가 셋이 아니다 (${h.limits.length})`);
      const items = h.limits;
      await tween(SETTLE_MS, mine, (p) => {
        const dy = -16 * (1 - ease(p));
        for (const g of items) g.setAttribute('transform', `translate(0 ${r2(dy)})`);
      });
    }

    function render(
      next: ChainRuleMultiplyScene,
      prev: ChainRuleMultiplyScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return Promise.resolve();
      const h = drawStatic(next);
      if (!opts.animate || !next.base || !prev || prev.step === next.step) return Promise.resolve();
      const run = async (): Promise<void> => {
        switch (next.step) {
          case 'push':
            await grow(h, mine);
            break;
          case 'inner': {
            const m0 = need(next.moves[0], 'moves[0]');
            await cross(h, 1, barLen(m0.delta, need(next.base, 'base').span), mine);
            break;
          }
          case 'outer': {
            const m1 = need(next.moves[1], 'moves[1]');
            await cross(h, 2, barLen(m1.delta, need(next.base, 'base').span), mine);
            break;
          }
          case 'whole':
            await reach(h, mine);
            break;
          case 'limit':
            await settle(h, mine);
            break;
          case 'start':
            return;
        }
        if (mine === gen && !destroyed) drawStatic(next);
      };
      return run();
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
        svg.textContent = '';
      },
    };
  },
};
