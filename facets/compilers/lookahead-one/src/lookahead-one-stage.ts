/**
 * lookahead-one 의 그림.
 *
 * 위: 원문 줄마다 묶인 토큰 칸 줄. 먹힌 칸은 가라앉고, 읽는 자리에 표지가 선다. 칸 아래 점은 그 토큰을 들여다본 횟수.
 * 가운데: 갈래가 여럿인 비단말마다 갈림 하나 — 비단말 상자에서 갈래 줄이 뻗고, 줄 들머리에 그 갈래가 받는 단말 칩이 선다.
 * 걸음: 읽는 자리 토큰의 사본(문법이 보는 단말)이 칸을 떠나 고르는 비단말로 내려오고, 그 단말을 받는 갈래의 칩에 들어앉는다.
 * 받지 않는 갈래들은 들머리에 빗장이 질러져 닫힌다. 원래 토큰 칸은 먹히지 않은 채 제자리에 남는다.
 */
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import { ruleText, type LookaheadRule } from './algorithm.js';
import type { LookaheadOneScene } from './scene.js';

const H = 396;
const W = PIECE_CANVAS_W;
const SVG = 'http://www.w3.org/2000/svg';

const M = 16;
const SRC_Y = 16;
const TILE_Y = 26;
const TILE_H = 40;
const TILE_MAX_W = 64;
const GAP_IN = 4;
const GAP_OUT = 16;
const SINK = 7;
const IDX_Y = TILE_Y + TILE_H + SINK + 12;
const DOT_Y = IDX_Y + 9;
const CURSOR_Y = DOT_Y + 6;

const FORK_TOP = 124;
const ROW = 30;
const FORK_GAP = 18;
const BOX_W = 90;
const BOX_H = 26;
const GATE_X = M + BOX_W + 34;
const CHIP_X = GATE_X + 14;
const CHIP_H = 22;
const CHIP_GAP = 4;
const BAR_HALF = 11;

const STRIP_Y = 322;
const CAP1_Y = 360;
const CAP2_Y = 382;

const DUR = 400;
const FRAME = 16;

const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);
const LG = parseFloat(fontSizes.lg);
const MONO_W = 0.6;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function chipW(term: string, size: number): number {
  return r2(term.length * size * MONO_W + 12);
}

interface TileBox {
  x: number;
  w: number;
}

/** 토큰 칸 자리 — 원문 줄마다 묶는다. EOF(line -1)는 끝에 따로. */
function tileBoxes(scene: LookaheadOneScene): { boxes: TileBox[]; groups: { line: number; from: number; to: number }[] } {
  const n = scene.tokens.length;
  const groups: { line: number; from: number; to: number }[] = [];
  scene.tokens.forEach((tk, i) => {
    const g = groups[groups.length - 1];
    if (g && g.line === tk.line) g.to = i;
    else groups.push({ line: tk.line, from: i, to: i });
  });
  if (n === 0) return { boxes: [], groups };
  const gaps = (n - groups.length) * GAP_IN + (groups.length - 1) * GAP_OUT;
  const w = Math.min(TILE_MAX_W, (W - 2 * M - gaps) / n);
  const total = n * w + gaps;
  let x = (W - total) / 2;
  const boxes: TileBox[] = [];
  groups.forEach((g, gi) => {
    if (gi > 0) x += GAP_OUT - GAP_IN;
    for (let i = g.from; i <= g.to; i += 1) {
      boxes.push({ x: r2(x), w: r2(w) });
      x += w + GAP_IN;
    }
  });
  return { boxes, groups };
}

interface ForkRow {
  rule: LookaheadRule;
  y: number;
  terms: string[];
}

interface Fork {
  nt: string;
  cy: number;
  rows: ForkRow[];
}

/** 갈래가 둘 이상인 비단말마다 갈림 하나, 규칙에 처음 나온 차례대로. */
function forks(scene: LookaheadOneScene): Fork[] {
  const order: string[] = [];
  for (const r of scene.rules) if (!order.includes(r.lhs)) order.push(r.lhs);
  const out: Fork[] = [];
  let y = FORK_TOP;
  for (const nt of order) {
    const alts = scene.rules.filter((r) => r.lhs === nt);
    if (alts.length < 2) continue;
    const rows = alts.map((rule, i) => {
      let terms: string[] = [];
      if (scene.accept !== null) {
        const a = scene.accept.find((x) => x.rule === rule.id);
        if (!a) throw new Error(`lookahead-one 그림: 규칙 ${rule.id} 의 받는 단말이 없다`);
        terms = a.terms;
      }
      return { rule, y: y + ROW * i + ROW / 2, terms };
    });
    out.push({ nt, cy: y + (ROW * alts.length) / 2, rows });
    y += ROW * alts.length + FORK_GAP;
  }
  return out;
}

interface Handles {
  ghost: SVGGElement | null;
  ghostEnd: { x: number; y: number } | null;
  ghostStart: { x: number; y: number } | null;
  ghostMid: { x: number; y: number } | null;
  sinking: SVGGElement[];
  cursor: SVGPolygonElement | null;
  cursorShift: number;
  bars: { line: SVGLineElement; y: number }[];
}

export const lookaheadOneStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      o: { size: number; fill: string; anchor?: string; weight?: number; mono?: boolean },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          fill: o.fill,
          'font-size': o.size,
          'font-family': o.mono ? fonts.mono : fonts.body,
          'text-anchor': o.anchor ?? 'start',
          'font-weight': o.weight ?? 400,
        },
        parent,
      );
      node.setAttribute('xml:space', 'preserve');
      node.textContent = s;
      return node;
    }

    function drawStatic(scene: LookaheadOneScene): Handles {
      svg.textContent = '';
      const h: Handles = {
        ghost: null,
        ghostEnd: null,
        ghostStart: null,
        ghostMid: null,
        sinking: [],
        cursor: null,
        cursorShift: 0,
        bars: [],
      };
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
      const last = scene.picks[scene.picks.length - 1];
      const pos = last ? last.pos : 0;
      const step = scene.step;

      // ── 토큰 줄
      const { boxes, groups } = tileBoxes(scene);
      for (const g of groups) {
        if (g.line < 0) continue;
        const src = scene.source[g.line];
        if (src === undefined) throw new Error(`lookahead-one 그림: 원문 줄 ${g.line} 이 없다`);
        const a = boxes[g.from]!;
        const b = boxes[g.to]!;
        text(svg, (a.x + b.x + b.w) / 2, SRC_Y, src, { size: SM, fill: c.textMuted, anchor: 'middle', mono: true });
      }
      const looks = new Map<number, number>();
      for (const p of scene.picks) looks.set(p.pos, (looks.get(p.pos) ?? 0) + 1);
      scene.tokens.forEach((tk, i) => {
        const b = boxes[i]!;
        const eaten = i < pos;
        const g = el('g', { transform: `translate(0,${eaten ? SINK : 0})` }, svg);
        const reading = i === pos && scene.tokens.length > 0;
        el(
          'rect',
          {
            x: b.x,
            y: TILE_Y,
            width: b.w,
            height: TILE_H,
            rx: 4,
            fill: eaten ? c.bgSubtle : c.bg,
            stroke: reading ? c.accent : c.border,
            'stroke-width': reading ? 2.5 : 1,
          },
          g,
        );
        text(g, b.x + b.w / 2, TILE_Y + 13, tk.kind, {
          size: parseFloat(fontSizes.xs),
          fill: c.textMuted,
          anchor: 'middle',
          mono: true,
        });
        if (tk.text !== '') {
          text(g, b.x + b.w / 2, TILE_Y + 31, tk.text, {
            size: MD,
            fill: eaten ? c.textMuted : c.text,
            anchor: 'middle',
            weight: 600,
            mono: true,
          });
        }
        if (step && eaten && i >= step.from) h.sinking.push(g);
        text(svg, b.x + b.w / 2, IDX_Y, '#' + String(i), {
          size: parseFloat(fontSizes.xs),
          fill: reading ? c.text : c.textMuted,
          anchor: 'middle',
          mono: true,
        });
        const k = looks.get(i) ?? 0;
        for (let d = 0; d < k; d += 1) {
          el('circle', { cx: r2(b.x + b.w / 2 + (d - (k - 1) / 2) * 8), cy: DOT_Y, r: 2.5, fill: c.text }, svg);
        }
      });
      const cur = boxes[pos];
      if (cur) {
        const cx = cur.x + cur.w / 2;
        h.cursor = el(
          'polygon',
          { points: `${r2(cx - 6)},${CURSOR_Y + 8} ${r2(cx + 6)},${CURSOR_Y + 8} ${r2(cx)},${CURSOR_Y}`, fill: c.accent },
          svg,
        );
        const was = boxes[step ? step.from : pos];
        if (was) h.cursorShift = r2(was.x + was.w / 2 - cx);
      }

      // ── 갈림
      const fs = forks(scene);
      let chipsEnd = CHIP_X;
      for (const f of fs) {
        for (const row of f.rows) {
          let x = CHIP_X;
          for (const term of row.terms) x += chipW(term, MD) + CHIP_GAP;
          chipsEnd = Math.max(chipsEnd, x);
        }
      }
      const ruleX = r2(chipsEnd + 22);
      for (const f of fs) {
        const active = last !== undefined && last.nt === f.nt;
        el(
          'rect',
          {
            x: M,
            y: r2(f.cy - BOX_H / 2),
            width: BOX_W,
            height: BOX_H,
            rx: 4,
            fill: active ? c.accent : c.bgSubtle,
            stroke: active ? c.accent : c.border,
          },
          svg,
        );
        text(svg, M + BOX_W / 2, f.cy + 5, f.nt, {
          size: MD,
          fill: active ? c.stateInk : c.text,
          anchor: 'middle',
          weight: 600,
          mono: true,
        });
        for (const row of f.rows) {
          const chosen = active && last.rule === row.rule.id;
          const closed = active && !chosen;
          const lane = chosen ? c.text : c.border;
          const lw = chosen ? 2 : 1;
          el('path', { d: `M${M + BOX_W},${r2(f.cy)} C${GATE_X - 18},${r2(f.cy)} ${GATE_X - 18},${r2(row.y)} ${GATE_X},${r2(row.y)}`, fill: 'none', stroke: lane, 'stroke-width': lw }, svg);
          let x = CHIP_X;
          el('line', { x1: GATE_X, y1: r2(row.y), x2: CHIP_X, y2: r2(row.y), stroke: lane, 'stroke-width': lw }, svg);
          for (const term of row.terms) {
            const w = chipW(term, MD);
            el('rect', { x: r2(x), y: r2(row.y - CHIP_H / 2), width: w, height: CHIP_H, rx: 3, fill: c.bg, stroke: closed ? c.border : c.textMuted }, svg);
            text(svg, x + w / 2, row.y + 5, term, { size: MD, fill: closed ? c.textMuted : c.text, anchor: 'middle', mono: true });
            if (chosen && term === last.term) {
              h.ghostEnd = { x: r2(x), y: r2(row.y - CHIP_H / 2) };
            }
            x += w + CHIP_GAP;
          }
          el('line', { x1: r2(x), y1: r2(row.y), x2: r2(ruleX - 8), y2: r2(row.y), stroke: lane, 'stroke-width': lw, 'stroke-dasharray': closed ? '3 3' : 'none' }, svg);
          text(svg, ruleX, row.y + 5, row.rule.id, { size: MD, fill: closed ? c.textMuted : c.text, weight: 700, mono: true });
          text(svg, ruleX + 34, row.y + 6, ruleText(row.rule), {
            size: LG,
            fill: closed ? c.textMuted : c.text,
            weight: chosen ? 700 : 400,
            mono: true,
          });
          if (closed) {
            const bx = GATE_X + 5;
            const line = el('line', { x1: bx, y1: r2(row.y - BAR_HALF), x2: bx, y2: r2(row.y + BAR_HALF), stroke: c.text, 'stroke-width': 3, 'stroke-linecap': 'butt' }, svg);
            h.bars.push({ line, y: row.y });
          }
        }
        if (active && step && step.nt === f.nt) {
          h.ghostMid = { x: M + BOX_W / 2, y: f.cy };
        }
      }

      // ── 자취 · 셈
      const picksLabel = t('label.picks', 'Picks');
      text(svg, M, STRIP_Y + 4, picksLabel, { size: SM, fill: c.textMuted });
      let sx = r2(M + Math.max(56, picksLabel.length * SM * 0.62 + 12));
      scene.picks.forEach((p, i) => {
        const isLast = i === scene.picks.length - 1;
        const w = chipW(p.rule, SM);
        el('rect', { x: r2(sx), y: STRIP_Y - 11, width: w, height: CHIP_H, rx: 3, fill: isLast ? c.accent : c.bgSubtle, stroke: isLast ? c.accent : c.border }, svg);
        text(svg, sx + w / 2, STRIP_Y + 4, p.rule, { size: SM, fill: isLast ? c.stateInk : c.text, anchor: 'middle', mono: true });
        sx += w + CHIP_GAP;
      });
      text(svg, W - M, STRIP_Y + 4, t('label.eaten', 'Eaten: {n}', { n: pos }), { size: SM, fill: c.text, anchor: 'end', weight: 600 });
      text(svg, W - M - 96, STRIP_Y + 4, t('label.looked', 'Looked: {n}', { n: scene.picks.length }), { size: SM, fill: c.text, anchor: 'end', weight: 600 });

      // ── 캡션
      if (!step) {
        if (scene.tokens.length > 0) {
          text(svg, M, CAP1_Y, t('caption.start', 'Start. Reading position: #{pos}', { pos }), { size: MD, fill: c.text });
        }
      } else {
        const tk = scene.tokens[step.pos];
        if (!tk) throw new Error(`lookahead-one 그림: 자리 ${step.pos} 에 토큰이 없다`);
        const tok = tk.text === '' ? tk.kind : tk.kind + ' ' + tk.text;
        text(
          svg,
          M,
          CAP1_Y,
          t('caption.pick', '{nt}: the next token at #{pos} is {tok}. Branch: {rule}', {
            nt: step.nt,
            pos: step.pos,
            tok,
            rule: step.rule,
          }),
          { size: MD, fill: c.text },
        );
        const rule = scene.rules.find((r) => r.id === step.rule);
        if (!rule) throw new Error(`lookahead-one 그림: 규칙 ${step.rule} 이 없다`);
        let line2 = '';
        if (rule.rhs.length === 0) {
          line2 = t('caption.empty', 'Empty branch: {nt} ends here.', { nt: step.nt });
        } else if (scene.picks.length >= 2) {
          line2 = t('caption.ate', 'Eaten since the last look: {n}', { n: step.pos - step.from });
        }
        if (line2 !== '') text(svg, M, CAP2_Y, line2, { size: SM, fill: c.textMuted });
      }

      // ── 사본 (들여다본 토큰) — 마지막에 그려 맨 위에 선다
      if (last && h.ghostEnd) {
        const w = chipW(last.term, MD);
        const g = el('g', {}, svg);
        el('rect', { x: h.ghostEnd.x, y: h.ghostEnd.y, width: w, height: CHIP_H, rx: 3, fill: c.accent, stroke: c.accent }, g);
        text(g, h.ghostEnd.x + w / 2, h.ghostEnd.y + CHIP_H / 2 + 5, last.term, { size: MD, fill: c.stateInk, anchor: 'middle', weight: 700, mono: true });
        h.ghost = g;
        const b = boxes[last.pos];
        if (b) h.ghostStart = { x: r2(b.x + b.w / 2 - w / 2), y: TILE_Y + TILE_H / 2 - CHIP_H / 2 };
        if (h.ghostMid) h.ghostMid = { x: r2(h.ghostMid.x - w / 2), y: r2(h.ghostMid.y - CHIP_H / 2) };
      }
      return h;
    }

    function frame(h: Handles, p: number): void {
      const pa = ease(Math.min(1, p / 0.5));
      const pb = ease(Math.max(0, (p - 0.5) / 0.5));
      for (const g of h.sinking) g.setAttribute('transform', `translate(0,${r2(SINK * pa)})`);
      if (h.cursor) h.cursor.setAttribute('transform', `translate(${r2(h.cursorShift * (1 - pa))},0)`);
      for (const b of h.bars) {
        b.line.setAttribute('y1', String(r2(b.y - BAR_HALF * pb)));
        b.line.setAttribute('y2', String(r2(b.y + BAR_HALF * pb)));
      }
      if (h.ghost && h.ghostEnd && h.ghostStart && h.ghostMid) {
        const from = p < 0.5 ? h.ghostStart : h.ghostMid;
        const to = p < 0.5 ? h.ghostMid : h.ghostEnd;
        const q = p < 0.5 ? pa : pb;
        const x = from.x + (to.x - from.x) * q;
        const y = from.y + (to.y - from.y) * q;
        h.ghost.setAttribute('transform', `translate(${r2(x - h.ghostEnd.x)},${r2(y - h.ghostEnd.y)})`);
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          timers.delete(id);
          resolve();
        };
        const id = setTimeout(done, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    async function render(next: LookaheadOneScene, _prev: LookaheadOneScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || !next.step) return;
      frame(h, 0);
      const t0 = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - t0) / DUR);
        frame(h, p);
        if (p >= 1) break;
        await wait(FRAME);
      }
      if (mine !== gen || destroyed) return;
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
        svg.textContent = '';
      },
    };
  },
};
