/**
 * 낮추기 조각의 그림.
 *
 * 위 한 줄이 원시 식이고, 아래로 세 주소 줄이 쌓인다. 걸음마다 식 안에서 가장 먼저 끝나는 연산의 글자들이
 * 제자리에서 떨어져 아래 새 줄의 자리로 **내려앉고**, 괄호는 떨어지며 사라진다. 떼어진 자리에는 임시 이름이
 * 서고 남은 글자들이 그 틈을 좁혀 다가선다. 마지막 걸음은 `r =` 까지 함께 내려오고 `let` 만 남아 스러진다.
 * 대조 걸음은 줄마다의 값이 줄 끝으로 밀려 들어온다.
 *
 * 글자의 자리는 식 나무에서 찍어 낸 낱말 차례로 셈한다 (글자를 파싱하지 않는다).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
} from '@ffacet/core/runtime';
import { isNode, nodeAt, type Expr, type IrLine, type Leaf } from './algorithm.js';
import type { LowerScene } from './scene.js';

const H = 370;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 고정폭 글꼴의 글자 폭 / 글자 크기 */
const MONO_RATIO = 0.6;
const X0 = 60;
const RIGHT_PAD = 28;
const Y_LABEL_SRC = 24;
const Y_TOP = 60;
const Y_ENV = 90;
const Y_LABEL_IR = 124;
const Y_IR0 = 158;
const IR_GAP = 32;
const Y_CAPTION = H - 34;
const Y_COUNT = H - 12;
const MOVE_MS = 400;

type Kind = 'kw' | 'code' | 'temp' | 'paren';
type Tok = { key: string; text: string; kind: Kind };
type Placed = Tok & { col: number };

const PREC: Record<string, number> = {
  '<': 1, '<=': 1, '>': 1, '>=': 1, '==': 1, '!=': 1, '+': 2, '-': 2, '*': 3, '/': 3,
};

function numText(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  return String(Object.is(r, -0) ? 0 : r);
}

function leafText(l: Leaf): string {
  return 'var' in l ? l.var : numText(l.num);
}

/** 식 나무를 낱말로 — 우선순위 · 왼쪽 결합에 필요한 괄호만 단다. key 는 마디의 자리 글자에서 온다. */
function exprTokens(e: Expr, path: string, temps: Set<string>, parent = 0, right = false): Tok[] {
  if (!isNode(e)) {
    const text = leafText(e);
    return [{ key: `e${path}:v`, text, kind: 'var' in e && temps.has(e.var) ? 'temp' : 'code' }];
  }
  const p = PREC[e.op];
  if (p === undefined) throw new Error(`lower-to-simpler: 모르는 연산 ${e.op}`);
  const body = [
    ...exprTokens(e.l, `${path}l`, temps, p, false),
    { key: `e${path}:op`, text: e.op, kind: 'code' as const },
    ...exprTokens(e.r, `${path}r`, temps, p, true),
  ];
  if (p < parent || (right && p === parent)) {
    return [{ key: `e${path}:(`, text: '(', kind: 'paren' }, ...body, { key: `e${path}:)`, text: ')', kind: 'paren' }];
  }
  return body;
}

/** 낱말 차례를 글자 칸 자리로 — 여는 괄호 뒤와 닫는 괄호 앞은 붙인다. */
function place(toks: Tok[]): Placed[] {
  const out: Placed[] = [];
  let col = 0;
  toks.forEach((tk, i) => {
    if (i > 0 && toks[i - 1]!.text !== '(' && tk.text !== ')') col += 1;
    out.push({ ...tk, col });
    col += tk.text.length;
  });
  return out;
}

function width(row: Placed[]): number {
  const last = row[row.length - 1];
  return last === undefined ? 0 : last.col + last.text.length;
}

function tempsOf(scene: LowerScene): Set<string> {
  return new Set(scene.lines.map((l) => l.dst).filter((d) => d !== scene.dst));
}

/** 위 한 줄 — 아직 떼어지지 않은 식. `was` 를 주면 떼기 전의 줄을 찍는다. */
function topRow(scene: LowerScene, e: Expr | null): Placed[] {
  if (e === null) return [];
  return place([
    { key: 'let', text: 'let', kind: 'kw' },
    { key: 'dst', text: scene.dst, kind: 'code' },
    { key: 'eq', text: '=', kind: 'code' },
    ...exprTokens(e, '', tempsOf(scene)),
  ]);
}

function irRow(line: IrLine, i: number, temps: Set<string>): Placed[] {
  const leafKind = (l: Leaf): Kind => ('var' in l && temps.has(l.var) ? 'temp' : 'code');
  return place([
    { key: `L${i}:d`, text: line.dst, kind: temps.has(line.dst) ? 'temp' : 'code' },
    { key: `L${i}:eq`, text: '=', kind: 'code' },
    { key: `L${i}:l`, text: leafText(line.l), kind: leafKind(line.l) },
    { key: `L${i}:op`, text: line.op, kind: 'code' },
    { key: `L${i}:r`, text: leafText(line.r), kind: leafKind(line.r) },
  ]);
}

function sourceRow(scene: LowerScene): Placed[] {
  return place(exprTokens(scene.source, '', new Set()).map((tk) => ({ ...tk, key: `s${tk.key}` })));
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function r2(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

type Drawn = {
  top: Map<string, SVGTextElement>;
  ir: Map<string, SVGTextElement>;
  pills: SVGGElement[];
  fade: SVGElement[];
  hl: SVGElement | null;
  ghosts: SVGGElement;
};

export const lowerToSimplerStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const capPx = parseFloat(fontSizes.xl);
    const labelPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      parent: Element,
      attrs: Record<string, string>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      parent.appendChild(node);
      return node;
    }

    function label(parent: Element, x: number, y: number, s: string, size: string, fill: string, anchor = 'start') {
      const n = el('text', parent, {
        x: r2(x), y: r2(y), fill, 'font-family': fonts.body, 'font-size': size, 'text-anchor': anchor,
      });
      n.textContent = s;
      return n;
    }

    /** 글자 폭 — 가장 긴 줄이 캔버스 폭 안에 들도록 역산하고, 상한은 토큰 크기. */
    function charW(scene: LowerScene): number {
      const initial = topRow(scene, scene.source);
      const src = width(sourceRow(scene)) + 8;
      const cols = Math.max(width(initial), src, 1);
      return Math.min(capPx * MONO_RATIO, (W - X0 - RIGHT_PAD) / cols);
    }

    function colorOf(kind: Kind): string {
      if (kind === 'temp') return c.itemActive;
      if (kind === 'kw') return c.textMuted;
      if (kind === 'paren') return c.textMuted;
      return c.text;
    }

    function drawRow(parent: Element, row: Placed[], y: number, cw: number, out: Map<string, SVGTextElement>) {
      const px = cw / MONO_RATIO;
      for (const tk of row) {
        const n = el('text', parent, {
          x: r2(X0 + tk.col * cw), y: r2(y), fill: colorOf(tk.kind),
          'font-family': fonts.mono, 'font-size': `${r2(px)}px`,
        });
        n.textContent = tk.text;
        out.set(tk.key, n);
      }
    }

    function pill(parent: Element, x: number, y: number, s: string, cw: number, strong: boolean): SVGGElement {
      const g = el('g', parent, {});
      const px = cw / MONO_RATIO;
      const w = s.length * cw + 16;
      el('rect', g, {
        x: r2(x), y: r2(y - px * 0.95), width: r2(w), height: r2(px * 1.3), rx: '4',
        fill: strong ? c.accent : c.bgSubtle, stroke: strong ? c.accent : c.border,
      });
      const n = el('text', g, {
        x: r2(x + 8), y: r2(y), fill: strong ? c.stateInk : c.text,
        'font-family': fonts.mono, 'font-size': `${r2(px)}px`,
      });
      n.textContent = s;
      return g;
    }

    function caption(scene: LowerScene): [string, string] {
      const count = t('caption.count', 'Lines: {lines} · Operations left in the source: {left}', {
        lines: scene.lines.length,
        left: scene.left,
      });
      const st = scene.step;
      if (st.kind === 'start') {
        return [t('caption.start', 'One line, operations nested inside: {n}', { n: scene.left }), count];
      }
      if (st.kind === 'peel') {
        const line = scene.lines[st.line];
        if (line === undefined) throw new Error('lower-to-simpler: 걸음의 줄이 없다');
        const expr = `${leafText(line.l)} ${line.op} ${leafText(line.r)}`;
        if (st.path === '') {
          return [t('caption.last', 'Outermost operation, no temporary — written straight into: {dst}', { dst: scene.dst }), count];
        }
        return [
          t('caption.peel', 'Finishes first, drops to its own line: {expr} · left in its place: {name}', { expr, name: st.name }),
          count,
        ];
      }
      const ck = scene.check;
      if (ck === null) throw new Error('lower-to-simpler: 대조 값이 없다');
      const last = ck.values[ck.values.length - 1];
      if (last === undefined) throw new Error('lower-to-simpler: 대조할 줄이 없다');
      return [
        t('caption.check', 'Same inputs — source: {src} · last line: {ir}', { src: numText(ck.source), ir: numText(last) }),
        t('caption.lines', 'Lines: {lines}', { lines: scene.lines.length }),
      ];
    }

    function drawStatic(scene: LowerScene): Drawn {
      svg.textContent = '';
      const cw = charW(scene);
      const px = cw / MONO_RATIO;
      const temps = tempsOf(scene);
      const d: Drawn = { top: new Map(), ir: new Map(), pills: [], fade: [], hl: null, ghosts: el('g', svg, {}) };

      label(svg, X0, Y_LABEL_SRC, t('label.source', 'Source line'), fontSizes.sm, c.textMuted);
      label(svg, X0, Y_LABEL_IR, t('label.ir', 'Three-address code'), fontSizes.sm, c.textMuted);
      el('line', svg, {
        x1: r2(X0), x2: r2(W - RIGHT_PAD), y1: r2(Y_LABEL_IR - labelPx - 6), y2: r2(Y_LABEL_IR - labelPx - 6),
        stroke: c.border, 'stroke-width': '1',
      });

      const st = scene.step;
      // 이번 걸음에 생긴 줄 — 바탕을 깔아 둔다 (되짚어도 남는다)
      if (st.kind === 'peel') {
        const line = scene.lines[st.line];
        if (line !== undefined) {
          const y = Y_IR0 + st.line * IR_GAP;
          const w = width(irRow(line, st.line, temps)) * cw;
          const g = el('g', svg, {});
          el('rect', g, { x: r2(X0 - 10), y: r2(y - px * 1.0), width: r2(w + 20), height: r2(px * 1.4), rx: '4', fill: c.bgSubtle });
          el('rect', g, { x: r2(X0 - 10), y: r2(y - px * 1.0), width: '3', height: r2(px * 1.4), fill: c.accent });
          d.hl = g;
        }
      }

      // 줄 번호
      scene.lines.forEach((_line, i) => {
        label(svg, X0 - 18, Y_IR0 + i * IR_GAP, String(i + 1), fontSizes.sm, c.textMuted, 'end');
      });

      const topLayer = el('g', svg, {});
      if (scene.check === null) {
        drawRow(topLayer, topRow(scene, scene.rest), Y_TOP, cw, d.top);
        // 떼어진 자리에 남은 이름에 밑줄
        if (st.kind === 'peel' && st.path !== '') {
          const n = d.top.get(`e${st.path}:v`);
          const row = topRow(scene, scene.rest);
          const tk = row.find((r) => r.key === `e${st.path}:v`);
          if (n !== undefined && tk !== undefined) {
            const u = el('line', topLayer, {
              x1: r2(X0 + tk.col * cw), x2: r2(X0 + (tk.col + tk.text.length) * cw),
              y1: r2(Y_TOP + 6), y2: r2(Y_TOP + 6), stroke: c.accent, 'stroke-width': '3', 'stroke-linecap': 'butt',
            });
            d.fade.push(u);
          }
        }
      } else {
        const src = sourceRow(scene);
        drawRow(topLayer, src, Y_TOP, cw, d.top);
        const eqCol = width(src) + 1;
        const eq = el('text', topLayer, {
          x: r2(X0 + eqCol * cw), y: r2(Y_TOP), fill: c.text, 'font-family': fonts.mono, 'font-size': `${r2(px)}px`,
        });
        eq.textContent = '=';
        d.fade.push(eq);
        d.pills.push(pill(topLayer, X0 + (eqCol + 2) * cw - 4, Y_TOP, numText(scene.check.source), cw, true));
        const env = scene.env.map(([k, v]) => `${k} = ${numText(v)}`).join('   ');
        const envText = el('text', topLayer, {
          x: r2(X0), y: r2(Y_ENV), fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.md,
        });
        envText.textContent = env;
        d.fade.push(envText);
      }

      const irLayer = el('g', svg, {});
      let maxCols = 0;
      scene.lines.forEach((line, i) => {
        const row = irRow(line, i, temps);
        maxCols = Math.max(maxCols, width(row));
        drawRow(irLayer, row, Y_IR0 + i * IR_GAP, cw, d.ir);
      });
      if (scene.check !== null) {
        const ck = scene.check;
        const xv = X0 + (maxCols + 3) * cw;
        ck.values.forEach((v, i) => {
          d.pills.push(pill(irLayer, xv, Y_IR0 + i * IR_GAP, numText(v), cw, i === ck.values.length - 1));
        });
      }

      const [cap, count] = caption(scene);
      label(svg, X0, Y_CAPTION, cap, fontSizes.md, c.text);
      label(svg, X0, Y_COUNT, count, fontSizes.sm, c.textMuted);
      svg.appendChild(d.ghosts);
      return d;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        let start = -1;
        const finish = () => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number) => {
          frames.delete(id);
          if (destroyed || mine !== gen) return finish();
          if (start < 0) start = now;
          const p = clamp01((now - start) / ms);
          frame(p);
          if (p >= 1) return finish();
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        let id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    function setMove(n: Element, dx: number, dy: number, op: number | null) {
      n.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
      if (op !== null) n.setAttribute('opacity', r2(op));
    }

    async function animatePeel(next: LowerScene, d: Drawn, mine: number) {
      const st = next.step;
      if (st.kind !== 'peel') return;
      const cw = charW(next);
      const px = cw / MONO_RATIO;
      const i = st.line;
      const yLine = Y_IR0 + i * IR_GAP;
      const was = topRow(next, st.was);
      const wasAt = new Map(was.map((tk) => [tk.key, tk]));
      const nextTop = new Map(topRow(next, next.rest).map((tk) => [tk.key, tk]));
      const irAt = new Map(irRow(next.lines[i]!, i, tempsOf(next)).map((tk) => [tk.key, tk]));
      const P = st.path;
      const node = nodeAt(st.was, P);
      if (!isNode(node)) return;

      // 떨어지는 글자: 앞 줄의 자리 → 새 줄의 자리
      const falls: Array<[string, string]> = [
        [`e${P}l:v`, `L${i}:l`],
        [`e${P}:op`, `L${i}:op`],
        [`e${P}r:v`, `L${i}:r`],
      ];
      if (P === '') falls.push(['dst', `L${i}:d`], ['eq', `L${i}:eq`]);
      const moving = falls.flatMap(([from, to]) => {
        const a = wasAt.get(from);
        const b = irAt.get(to);
        const n = d.ir.get(to);
        if (a === undefined || b === undefined || n === undefined) return [];
        return [{ n, dx: (a.col - b.col) * cw, dy: Y_TOP - yLine }];
      });

      // 새 줄의 머리(`t1 =`) — 떨어진 글자를 맞으러 선다
      const heads = P === '' ? [] : [d.ir.get(`L${i}:d`), d.ir.get(`L${i}:eq`)].filter((n) => n !== undefined);

      // 위 줄에 남은 글자: 틈을 좁혀 다가선다
      const slides: Array<{ n: Element; dx: number }> = [];
      for (const [key, tk] of nextTop) {
        const a = wasAt.get(key);
        const n = d.top.get(key);
        if (a !== undefined && n !== undefined) slides.push({ n, dx: (a.col - tk.col) * cw });
      }
      const hole = P === '' ? undefined : d.top.get(`e${P}:v`);

      // 사라지는 글자 (괄호 · 마지막 걸음의 let) — 자취 없이 운동 층에만 둔다
      const ghostFall: Array<{ g: SVGTextElement; dy: number }> = [];
      for (const key of [`e${P}:(`, `e${P}:)`, ...(P === '' ? ['let'] : [])]) {
        const a = wasAt.get(key);
        if (a === undefined) continue;
        const g = el('text', d.ghosts, {
          x: r2(X0 + a.col * cw), y: r2(Y_TOP), fill: colorOf(a.kind),
          'font-family': fonts.mono, 'font-size': `${r2(px)}px`,
        });
        g.textContent = a.text;
        ghostFall.push({ g, dy: key === 'let' ? -10 : (yLine - Y_TOP) * 0.5 });
      }

      const frame = (p: number) => {
        const e = ease(p);
        for (const m of moving) {
          // 떼어져 살짝 들렸다가 내려앉는다
          const lift = p < 0.5 ? -8 * Math.sin(Math.PI * p * 2) : 0;
          setMove(m.n, m.dx * (1 - e), m.dy * (1 - e) + lift, null);
        }
        for (const n of heads) n.setAttribute('opacity', r2(clamp01((p - 0.5) * 2)));
        for (const s of slides) setMove(s.n, s.dx * (1 - e), 0, null);
        if (hole !== undefined) setMove(hole, 0, 10 * (1 - e), clamp01((p - 0.3) / 0.7));
        for (const g of ghostFall) setMove(g.g, 0, g.dy * e, 1 - clamp01(p * 1.4));
        if (d.hl !== null) d.hl.setAttribute('opacity', r2(clamp01((p - 0.6) / 0.4)));
        for (const f of d.fade) f.setAttribute('opacity', r2(clamp01((p - 0.6) / 0.4)));
      };
      frame(0);
      await tween(MOVE_MS, mine, frame);
    }

    async function animateCheck(d: Drawn, mine: number) {
      const n = d.pills.length;
      const frame = (p: number) => {
        d.pills.forEach((g, k) => {
          // 줄 값이 위에서부터 차례로, 원시 식의 값은 맨 끝에 밀려 들어온다
          const order = k === 0 ? n - 1 : k - 1;
          const q = clamp01((p - order * (0.5 / Math.max(1, n - 1))) / 0.5);
          setMove(g, -18 * (1 - ease(q)), 0, q);
        });
        for (const f of d.fade) f.setAttribute('opacity', r2(p));
        for (const tx of d.top.values()) tx.setAttribute('opacity', r2(p));
      };
      frame(0);
      await tween(MOVE_MS, mine, frame);
    }

    async function render(next: LowerScene, prev: LowerScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      if (destroyed) return;
      const d = drawStatic(next);
      if (!opts.animate || prev === null) return;
      if (next.step.kind === 'peel' && prev.lines.length === next.lines.length - 1) {
        await animatePeel(next, d, mine);
      } else if (next.step.kind === 'check' && prev.check === null) {
        await animateCheck(d, mine);
      } else {
        return;
      }
      if (mine === gen && !destroyed) drawStatic(next);
    }

    function destroy() {
      destroyed = true;
      gen += 1;
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
