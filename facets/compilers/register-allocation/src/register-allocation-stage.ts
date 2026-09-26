/**
 * register-allocation 무대 — 왼쪽은 명령 열(줄마다 산 값 점과 K 선), 오른쪽 위는 레지스터 칸 K 개와 스택 칸,
 * 아래는 간섭 그래프(선 17 · 색 4 — 손잡이와 무관하게 그대로).
 *
 * 운동: 손잡이를 돌리면 레지스터 칸이 줄거나 늘고(폭), 앞 판에서 끼어든 줄이 접히며 원래 줄이 제자리로 올라온다.
 * 판 안에서는 값 알갱이가 줄에서 빈 칸으로 들어앉고, 모자라면 스택 칸으로 밀려났다가 되불려 오며, 끼어드는 줄이
 * 아래 줄을 밀어낸다. 마지막으로 읽힌 값은 그 줄로 빨려 들어가 사라진다.
 *
 * 무대는 할당을 셈하지 않는다 — 어느 값이 어디로 가는지 · 끼어드는 자리 · 글자는 모두 payload 로 받는다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

// ─────────────────────────────────────────── projector 와 맞추는 표면

export type RaFreedView = { value: string; reg: number };
export type RaComparedView = { value: string; last: number };
export type RaRoundView = {
  k: number;
  lines: { line: number; text: string; liveAfter: number; fit: number }[];
  values: { name: string; color: number }[];
  edges: [string, string][];
  colors: number;
  maxLive: number;
  total: number;
};
export type RaTakeView = { line: number; value: string; reg: number; freed: RaFreedView[]; text: string; total: number; inserted: number; done: boolean };
export type RaEvictView = RaTakeView & {
  victim: string;
  slotIndex: number;
  slotText: string;
  compared: RaComparedView[];
  storeAt: number;
  storeText: string;
};
export type RaSpillView = { victim: string; reg: number; slotIndex: number; slotText: string; compared: RaComparedView[]; storeAt: number; storeText: string };
export type RaReloadView = {
  line: number;
  value: string;
  slotIndex: number;
  slotText: string;
  reg: number;
  loadAt: number;
  loadText: string;
  spill: RaSpillView | null;
  total: number;
  inserted: number;
};
export type RaFreeView = { line: number; freed: RaFreedView[]; text: string; total: number; inserted: number; done: boolean };

export type RaStage = {
  round(p: RaRoundView, ms: number): Promise<void>;
  take(p: RaTakeView, ms: number): Promise<void>;
  evict(p: RaEvictView, ms: number): Promise<void>;
  reload(p: RaReloadView, ms: number): Promise<void>;
  free(p: RaFreeView, ms: number): Promise<void>;
  clear(): void;
};

// ─────────────────────────────────────────── 자리 (사다리 끝 K 5 · 가장 긴 열 22 줄 · 스택 칸 5 를 처음부터 잡는다)

const W = 900;
const H = 530;
const MAX_ROWS = 22;
const MAX_REGS = 5;
const MAX_SLOTS = 5;

const LX = 16; // 명령 열 왼쪽
const ROW_Y0 = 46;
const ROW_H = 19;
const ROW_W = 330;
const POS_X = 20; // 결과 자리 번호 (오른쪽 맞춤)
const TAG_X = 28;
const CODE_X = 92;
const DOT_X0 = 252;
const DOT_STEP = 14;

const RX = 390; // 오른쪽 판
const CELL_Y = 40;
const CELL_W = 88;
const CELL_H = 38;
const CELL_STEP = 98;
const SLOT_Y = 112;

const GRAPH_CX = 630;
const GRAPH_CY = 326;
const GRAPH_R = 118;
const NODE_R = 15;

const CAP_Y = 494;

const SVG = 'http://www.w3.org/2000/svg';

type Row = {
  g: SVGGElement;
  bg: SVGRectElement;
  pos: SVGTextElement;
  tag: SVGTextElement;
  code: SVGTextElement;
  kind: 'orig' | 'store' | 'load';
  line: number | null;
  y: number;
  dx: number;
};
type Cell = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement; ghost: SVGTextElement; w: number };
type Token = { g: SVGGElement; x: number; y: number; s: number };

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const regAllocStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);

    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number> = {}): SVGTextElement => {
      const node = el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text, ...attrs }, parent);
      node.textContent = s;
      return node;
    };

    // 한 걸음의 운동 — 모은 그리기를 한 번의 시간에 태운다
    const run = (ms: number, draws: ((p: number) => void)[], after: (() => void)[] = []): Promise<void> => {
      const finish = (): void => {
        for (const d of draws) d(1);
        for (const a of after) a();
      };
      const raf = globalThis.requestAnimationFrame;
      if (destroyed || isInstant() || ms <= 0 || typeof raf !== 'function') {
        finish();
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        let done = false;
        let id = 0;
        const wake = (): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          frames.delete(id);
          finish();
          resolve();
        };
        waiters.add(wake);
        const t0 = performance.now();
        const tick = (now: number): void => {
          frames.delete(id);
          if (done) return;
          if (destroyed || isInstant()) return wake();
          const p = Math.min(1, (now - t0) / ms);
          if (p >= 1) return wake();
          for (const d of draws) d(ease(p));
          id = raf(tick);
          frames.add(id);
        };
        id = raf(tick);
        frames.add(id);
      });
    };

    // ── 바탕
    const root = el('g', {}, svg);
    text(root, LX, 22, t('label.program', 'Instructions'), { 'font-weight': 600 });
    const countText = text(root, LX + ROW_W, 22, '', { 'text-anchor': 'end', fill: c.textMuted });
    text(root, DOT_X0 - 4, 38, t('label.live', 'Live'), { 'font-size': fontSizes.xs, fill: c.textMuted });
    const rowLayer = el('g', {}, root);
    const kLine = el('line', { y1: ROW_Y0 - 4, y2: ROW_Y0, stroke: c.danger, 'stroke-width': 1.5, 'stroke-dasharray': '3 3', opacity: 0 }, root);
    let kLineX = 0;

    text(root, RX, 22, t('label.registers', 'Registers'), { 'font-weight': 600 });
    text(root, RX, SLOT_Y - 8, t('label.stack', 'Stack slots'), { 'font-weight': 600 });
    const makeCell = (x: number, y: number, label: string): Cell => {
      const g = el('g', { transform: `translate(${x} ${y})` }, root);
      const rect = el('rect', { x: 0, y: 0, width: 0, height: CELL_H, rx: 5, fill: c.bgSubtle, stroke: c.border }, g);
      const lab = text(g, 4, 11, label, { 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted, opacity: 0 });
      const ghost = text(g, CELL_W / 2, CELL_H / 2 + 8, '', { 'font-family': fonts.mono, 'text-anchor': 'middle', fill: c.textMuted, opacity: 0 });
      return { g, rect, label: lab, ghost, w: 0 };
    };
    const regs: Cell[] = [];
    for (let i = 0; i < MAX_REGS; i += 1) regs.push(makeCell(RX + i * CELL_STEP, CELL_Y, `r${i + 1}`));
    const slots: Cell[] = [];
    for (let i = 0; i < MAX_SLOTS; i += 1) slots.push(makeCell(RX + i * CELL_STEP, SLOT_Y, ''));
    const threshold = el('g', { opacity: 0 }, root);
    const thresholdLine = el('line', { x1: 0, x2: 0, y1: CELL_Y - 8, y2: CELL_Y + CELL_H + 8, stroke: c.danger, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, threshold);
    const thresholdText = text(threshold, 0, CELL_Y + CELL_H + 20, '', { 'font-size': fontSizes.xs, fill: c.danger, 'text-anchor': 'middle' });

    const graphLayer = el('g', {}, root);
    const tokenLayer = el('g', {}, root);
    const caption = text(root, LX, CAP_Y, '', { 'font-size': fontSizes.md });
    const caption2 = text(root, LX, CAP_Y + 22, '', { fill: c.textMuted });

    let rows: Row[] = [];
    let tokens = new Map<string, Token>();
    let nodes = new Map<string, SVGCircleElement>();
    let k = 0;
    let usedSlots = 0;

    const cellCenter = (cells: Cell[], i: number, y: number): { x: number; y: number } => {
      if (i < 0 || i >= cells.length) throw new Error(`칸 번호가 자리를 넘는다: ${i}`);
      return { x: RX + i * CELL_STEP + CELL_W / 2, y: y + CELL_H - 12 };
    };
    const rowY = (i: number): number => ROW_Y0 + i * ROW_H;

    // ── 줄
    const makeRow = (kind: Row['kind'], line: number | null, tagText: string, code: string, index: number): Row => {
      const y = rowY(index);
      const g = el('g', { transform: `translate(${LX} ${y})` }, rowLayer);
      const bg = el('rect', { x: 0, y: 0, width: ROW_W, height: ROW_H - 2, rx: 3, fill: kind === 'orig' ? 'none' : c.bgSubtle, stroke: 'none' }, g);
      const pos = text(g, POS_X, 13, '', { 'text-anchor': 'end', 'font-size': fontSizes.xs, fill: c.textMuted });
      const tag = text(g, TAG_X, 13, tagText, {
        'font-size': fontSizes.xs,
        fill: kind === 'store' ? c.danger : kind === 'load' ? c.primary : c.textMuted,
        'font-weight': kind === 'orig' ? 400 : 600,
      });
      const codeEl = text(g, CODE_X, 13, code, { 'font-family': fonts.mono, 'font-weight': kind === 'orig' ? 400 : 600 });
      return { g, bg, pos, tag, code: codeEl, kind, line, y, dx: 0 };
    };
    const place = (r: Row): void => r.g.setAttribute('transform', `translate(${LX + r.dx} ${r.y})`);
    const renumber = (): void => {
      rows.forEach((r, i) => {
        r.pos.textContent = String(i + 1);
      });
      if (rows.length > MAX_ROWS) throw new Error(`명령 열이 자리(${MAX_ROWS} 줄)를 넘는다: ${rows.length}`);
    };
    /** 모든 줄을 제 자리로 미끄러뜨린다 */
    const slideRows = (draws: ((p: number) => void)[]): void => {
      rows.forEach((r, i) => {
        const y0 = r.y;
        const x0 = r.dx;
        const y1 = rowY(i);
        if (y0 === y1 && x0 === 0) return;
        draws.push((p) => {
          r.y = lerp(y0, y1, p);
          r.dx = lerp(x0, 0, p);
          place(r);
        });
      });
    };
    const origRow = (line: number): Row => {
      const r = rows.find((x) => x.kind === 'orig' && x.line === line);
      if (!r) throw new Error(`L${line} 줄이 무대에 없다`);
      return r;
    };
    const focus = (r: Row | null): void => {
      for (const x of rows) {
        x.bg.setAttribute('stroke', x === r ? c.accent : 'none');
        x.bg.setAttribute('stroke-width', x === r ? '2' : '0');
      }
    };
    const insertRow = (kind: 'store' | 'load', at: number, code: string, draws: ((p: number) => void)[]): Row => {
      if (at < 0 || at > rows.length) throw new Error(`끼어들 자리가 열 밖이다: ${at}`);
      const tag = kind === 'store' ? t('label.spill', 'spill') : t('label.reload', 'reload');
      const r = makeRow(kind, null, tag, code, at);
      r.dx = 40;
      r.g.setAttribute('opacity', '0');
      place(r);
      rows.splice(at, 0, r);
      draws.push((p) => r.g.setAttribute('opacity', String(p)));
      return r;
    };

    // ── 알갱이 (값)
    const makeToken = (name: string, x: number, y: number, s: number): Token => {
      const g = el('g', {}, tokenLayer);
      el('rect', { x: -26, y: -11, width: 52, height: 20, rx: 10, fill: c.primary }, g);
      text(g, 0, 4, name, { 'font-family': fonts.mono, 'text-anchor': 'middle', fill: c.textInverse, 'font-weight': 600 });
      const tok = { g, x, y, s };
      drawToken(tok);
      return tok;
    };
    const drawToken = (tok: Token): void => {
      tok.g.setAttribute('transform', `translate(${tok.x} ${tok.y}) scale(${tok.s})`);
    };
    const moveToken = (tok: Token, x: number, y: number, s: number, draws: ((p: number) => void)[]): void => {
      const { x: x0, y: y0, s: s0 } = tok;
      draws.push((p) => {
        tok.x = lerp(x0, x, p);
        tok.y = lerp(y0, y, p);
        tok.s = lerp(s0, s, p);
        drawToken(tok);
      });
    };
    const tokenOf = (name: string): Token => {
      const tok = tokens.get(name);
      if (!tok) throw new Error(`${name} 알갱이가 무대에 없다`);
      return tok;
    };
    /** 줄의 글자 끝 — 알갱이가 나오고 빨려 드는 자리 (줄이 옮겨 가는 중이면 가 닿을 자리) */
    const rowAnchor = (r: Row): { x: number; y: number } => {
      const index = rows.indexOf(r);
      if (index < 0) throw new Error('줄이 열에 없다');
      return { x: LX + CODE_X + 150, y: rowY(index) + 9 };
    };
    /** 마지막으로 읽힌 값 — 그 줄로 빨려 들어가 사라진다 */
    const consume = (freed: RaFreedView[], r: Row, draws: ((p: number) => void)[], after: (() => void)[]): void => {
      const a = rowAnchor(r);
      for (const f of freed) {
        const tok = tokenOf(f.value);
        tokens.delete(f.value);
        moveToken(tok, a.x, a.y, 0.2, draws);
        after.push(() => tok.g.remove());
      }
    };
    const arrive = (name: string, r: Row, reg: number, draws: ((p: number) => void)[]): void => {
      if (reg < 1 || reg > k) throw new Error(`레지스터 번호가 K 를 넘는다: r${reg}`);
      const a = rowAnchor(r);
      const tok = makeToken(name, a.x, a.y, 0.4);
      tokens.set(name, tok);
      const to = cellCenter(regs, reg - 1, CELL_Y);
      moveToken(tok, to.x, to.y, 1, draws);
    };
    const openSlot = (i: number, label: string, draws: ((p: number) => void)[]): void => {
      if (i < 0 || i >= MAX_SLOTS) throw new Error(`스택 칸이 자리(${MAX_SLOTS})를 넘는다: ${i + 1}`);
      const cell = slots[i]!;
      cell.label.textContent = label;
      cell.ghost.setAttribute('opacity', '0');
      if (cell.w === CELL_W) return;
      const w0 = cell.w;
      usedSlots = Math.max(usedSlots, i + 1);
      draws.push((p) => {
        cell.w = lerp(w0, CELL_W, p);
        cell.rect.setAttribute('width', String(cell.w));
        cell.label.setAttribute('opacity', String(p));
      });
    };
    const toSlot = (victim: string, slotIndex: number, slotLabel: string, draws: ((p: number) => void)[]): void => {
      openSlot(slotIndex, slotLabel, draws);
      const tok = tokenOf(victim);
      const to = cellCenter(slots, slotIndex, SLOT_Y);
      moveToken(tok, to.x, to.y, 1, draws);
    };
    const highlightNode = (name: string | null): void => {
      for (const [v, circle] of nodes) {
        circle.setAttribute('stroke', v === name ? c.text : c.bg);
        circle.setAttribute('stroke-width', v === name ? '3' : '1.5');
      }
    };
    const setCaption = (main: string, sub: string): void => {
      caption.textContent = main;
      caption2.textContent = sub;
    };
    const freedText = (freed: RaFreedView[]): string => freed.map((f) => `${f.value} (r${f.reg})`).join(' · ');
    const comparedText = (cmp: RaComparedView[]): string => cmp.map((x) => `${x.value} L${x.last}`).join(' · ');
    const tail = (freed: RaFreedView[], done: boolean, total: number, inserted: number): string => {
      const parts: string[] = [];
      if (freed.length > 0) parts.push(t('caption.freed', 'Freed: {list}', { list: freedText(freed) }));
      if (done) parts.push(t('caption.result', 'Result. Instructions: {n} · inserted: {m}', { n: total, m: inserted }));
      return parts.join('   ');
    };
    const setCount = (n: number): void => {
      countText.textContent = t('label.count', 'Instructions: {n}', { n });
    };

    const drawGraph = (p: RaRoundView): void => {
      while (graphLayer.firstChild) graphLayer.firstChild.remove();
      nodes = new Map();
      text(graphLayer, RX, GRAPH_CY - GRAPH_R - 26, t('label.graph', 'Interference graph'), { 'font-weight': 600 });
      text(graphLayer, RX, GRAPH_CY - GRAPH_R - 8, t('label.colors', 'Colors: {n}', { n: p.colors }), { fill: c.textMuted });
      const palette = categorical(p.colors);
      const at = new Map<string, { x: number; y: number }>();
      p.values.forEach((v, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / p.values.length;
        at.set(v.name, { x: GRAPH_CX + GRAPH_R * Math.cos(a), y: GRAPH_CY + GRAPH_R * Math.sin(a) });
      });
      const pos = (name: string): { x: number; y: number } => {
        const q = at.get(name);
        if (!q) throw new Error(`간섭 선의 끝 ${name} 이 마디에 없다`);
        return q;
      };
      for (const [a, b] of p.edges) {
        const pa = pos(a);
        const pb = pos(b);
        el('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: c.border, 'stroke-width': 1.2 }, graphLayer);
      }
      for (const v of p.values) {
        const q = pos(v.name);
        const fill = palette[v.color - 1];
        if (fill === undefined) throw new Error(`${v.name} 의 색 번호가 색 수를 넘는다: ${v.color}`);
        const circle = el('circle', { cx: q.x, cy: q.y, r: NODE_R, fill, stroke: c.bg, 'stroke-width': 1.5 }, graphLayer);
        nodes.set(v.name, circle);
        text(graphLayer, q.x, q.y + 4, v.name, { 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'text-anchor': 'middle', fill: c.stateInk, 'font-weight': 600 });
      }
    };

    const kLineAt = (kk: number): number => LX + DOT_X0 + (kk - 0.5) * DOT_STEP + 3;
    const regWidths = (kk: number, draws: ((p: number) => void)[]): void => {
      regs.forEach((cell, i) => {
        const w0 = cell.w;
        const w1 = i < kk ? CELL_W : 0;
        if (w0 === w1) return;
        draws.push((p) => {
          cell.w = lerp(w0, w1, p);
          cell.rect.setAttribute('width', String(cell.w));
          cell.label.setAttribute('opacity', String(cell.w / CELL_W));
        });
      });
    };

    const stage: RaStage & ViewInstance = {
      async round(p, ms) {
        const draws: ((p: number) => void)[] = [];
        const after: (() => void)[] = [];
        // 앞 판의 결론을 걷는다 — 알갱이 · 끼어든 줄의 글자 · 스택 칸 글자는 곧바로, 자리는 운동으로
        for (const tok of tokens.values()) tok.g.remove();
        tokens = new Map();
        const fresh = rows.length === 0;
        const kept: Row[] = [];
        for (const r of rows) {
          if (r.kind === 'orig') {
            kept.push(r);
            continue;
          }
          r.code.textContent = '';
          r.tag.textContent = '';
          const x0 = r.dx;
          draws.push((q) => {
            r.dx = lerp(x0, -30, q);
            r.g.setAttribute('opacity', String(1 - q));
            place(r);
          });
          after.push(() => r.g.remove());
        }
        if (fresh) {
          p.lines.forEach((ln, i) => kept.push(makeRow('orig', ln.line, `L${ln.line}`, ln.text, i)));
        } else if (kept.length !== p.lines.length) {
          throw new Error(`원래 줄 수가 판마다 다르다: ${kept.length} · ${p.lines.length}`);
        }
        rows = kept;
        p.lines.forEach((ln, i) => {
          const r = rows[i]!;
          if (r.line !== ln.line) throw new Error(`줄 차례가 어긋난다: ${r.tag.textContent} · L${ln.line}`);
          r.code.textContent = ln.text;
          // 산 값 점 — K 를 넘는 몫은 danger
          r.g.querySelectorAll('circle').forEach((d) => d.remove());
          for (let j = 1; j <= ln.liveAfter; j += 1) {
            el('circle', { cx: DOT_X0 + (j - 1) * DOT_STEP + 3, cy: 9, r: 4, fill: j <= ln.fit ? c.textMuted : c.danger }, r.g);
          }
        });
        renumber();
        slideRows(draws);
        focus(null);
        // 스택 칸을 접는다
        for (const cell of slots) {
          cell.label.textContent = '';
          cell.ghost.textContent = '';
          const w0 = cell.w;
          if (w0 === 0) continue;
          draws.push((q) => {
            cell.w = lerp(w0, 0, q);
            cell.rect.setAttribute('width', String(cell.w));
          });
        }
        usedSlots = 0;
        // 레지스터 칸이 K 로 줄거나 는다 · 명령 열의 K 선이 옮겨 간다
        k = p.k;
        if (k < 1 || k > MAX_REGS) throw new Error(`K 가 자리(${MAX_REGS})를 넘는다: ${k}`);
        regWidths(k, draws);
        const kx0 = fresh ? kLineAt(k) : kLineX;
        const kx1 = kLineAt(k);
        kLine.setAttribute('y2', String(rowY(p.lines.length) - 2));
        kLine.setAttribute('opacity', '1');
        draws.push((q) => {
          kLineX = lerp(kx0, kx1, q);
          kLine.setAttribute('x1', String(kLineX));
          kLine.setAttribute('x2', String(kLineX));
        });
        // 문턱 — 산 값 최대 = 색 수 (손잡이와 무관)
        const tx = RX + p.maxLive * CELL_STEP - (CELL_STEP - CELL_W) / 2;
        thresholdLine.setAttribute('x1', String(tx));
        thresholdLine.setAttribute('x2', String(tx));
        thresholdText.setAttribute('x', String(tx));
        thresholdText.textContent = t('label.threshold', 'Max live: {n}', { n: p.maxLive });
        threshold.setAttribute('opacity', '1');
        drawGraph(p);
        highlightNode(null);
        setCount(p.total);
        setCaption(t('caption.start', 'Before allocation. Instructions: {n} · registers: {k} · max live: {m}', { n: p.total, k, m: p.maxLive }), '');
        await run(ms, draws, after);
      },

      async take(p, ms) {
        const draws: ((p: number) => void)[] = [];
        const after: (() => void)[] = [];
        const r = origRow(p.line);
        focus(r);
        consume(p.freed, r, draws, after);
        r.code.textContent = p.text;
        arrive(p.value, r, p.reg, draws);
        highlightNode(p.value);
        setCount(p.total);
        setCaption(t('caption.take', 'L{line}: {value} → r{reg}', { line: p.line, value: p.value, reg: p.reg }), tail(p.freed, p.done, p.total, p.inserted));
        await run(ms, draws, after);
      },

      async evict(p, ms) {
        const draws: ((p: number) => void)[] = [];
        const after: (() => void)[] = [];
        insertRow('store', p.storeAt, p.storeText, draws);
        renumber();
        slideRows(draws);
        const r = origRow(p.line);
        focus(r);
        toSlot(p.victim, p.slotIndex, p.slotText, draws);
        consume(p.freed, r, draws, after);
        r.code.textContent = p.text;
        arrive(p.value, r, p.reg, draws);
        highlightNode(p.value);
        setCount(p.total);
        setCaption(
          t('caption.evict', 'L{line}: no free register. Last reads: {cmp} · spill {victim} → {slot} · {value} → r{reg}', {
            line: p.line,
            cmp: comparedText(p.compared),
            victim: p.victim,
            slot: p.slotText,
            value: p.value,
            reg: p.reg,
          }),
          tail(p.freed, p.done, p.total, p.inserted),
        );
        await run(ms, draws, after);
      },

      async reload(p, ms) {
        const draws: ((p: number) => void)[] = [];
        let sub = '';
        if (p.spill !== null) {
          insertRow('store', p.spill.storeAt, p.spill.storeText, draws);
          toSlot(p.spill.victim, p.spill.slotIndex, p.spill.slotText, draws);
          sub = t('caption.reloadSpill', 'No free register. Last reads: {cmp} · spill {victim} → {slot}', {
            cmp: comparedText(p.spill.compared),
            victim: p.spill.victim,
            slot: p.spill.slotText,
          });
        }
        const lr = insertRow('load', p.loadAt, p.loadText, draws);
        renumber();
        slideRows(draws);
        focus(lr);
        // 값이 스택 칸에서 레지스터로 — 칸에는 메모리의 사본이 흐리게 남는다
        if (p.reg < 1 || p.reg > k) throw new Error(`레지스터 번호가 K 를 넘는다: r${p.reg}`);
        const tok = tokenOf(p.value);
        const to = cellCenter(regs, p.reg - 1, CELL_Y);
        moveToken(tok, to.x, to.y, 1, draws);
        if (p.slotIndex < 0 || p.slotIndex >= usedSlots) throw new Error(`되불러올 스택 칸이 열리지 않았다: ${p.slotText}`);
        const cell = slots[p.slotIndex]!;
        cell.ghost.textContent = p.value;
        draws.push((q) => cell.ghost.setAttribute('opacity', String(q * 0.6)));
        highlightNode(p.value);
        setCount(p.total);
        setCaption(t('caption.reload', 'Before L{line}: reload {slot} → r{reg} ({value})', { line: p.line, value: p.value, slot: p.slotText, reg: p.reg }), sub);
        await run(ms, draws);
      },

      async free(p, ms) {
        const draws: ((p: number) => void)[] = [];
        const after: (() => void)[] = [];
        const r = origRow(p.line);
        focus(r);
        consume(p.freed, r, draws, after);
        r.code.textContent = p.text;
        highlightNode(null);
        setCount(p.total);
        setCaption(t('caption.free', 'L{line}: no new value', { line: p.line }), tail(p.freed, p.done, p.total, p.inserted));
        await run(ms, draws, after);
      },

      clear() {
        for (const wake of [...waiters]) wake();
        for (const r of rows) r.g.remove();
        rows = [];
        for (const tok of tokens.values()) tok.g.remove();
        tokens = new Map();
        while (graphLayer.firstChild) graphLayer.firstChild.remove();
        nodes = new Map();
        for (const cell of [...regs, ...slots]) {
          cell.w = 0;
          cell.rect.setAttribute('width', '0');
          cell.label.setAttribute('opacity', '0');
          cell.ghost.textContent = '';
        }
        for (const cell of slots) cell.label.textContent = '';
        usedSlots = 0;
        k = 0;
        kLine.setAttribute('opacity', '0');
        threshold.setAttribute('opacity', '0');
        countText.textContent = '';
        setCaption('', '');
      },

      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        root.remove();
      },
    };
    return stage;
  },
};
