/**
 * finite-automata 무대 — 무늬 · NFA · 입력 글자 줄 · DFA 덩이 층 · 지금 자리 표시 · 판정.
 *
 * 운동:
 *   - k 가 오르면 무늬 끝에 `(a|b)` 조각이 붙고, NFA 끝 자리에서 새 자리가 미끄러져 나와 한 칸 붙는다 (받는 고리도 따라 옮는다)
 *   - DFA 는 층마다 줄(세로 칸)을 이룬다. 새 덩이는 제 부모 덩이 자리에서 **갈라져 나와** 제 칸으로 간다
 *   - k 가 바뀐 판의 걸음 0 에서 앞 판의 덩이는 **빈 자리**(점선)로 남고, 같은 번호가 다시 서면 그 자리에서 찬다.
 *     마지막 층까지 다시 서지 않은 빈 자리는 제 부모 쪽으로 **접혀 들어가** 사라진다
 *   - 걷기: 입력 글자가 제 칸에서 지금 자리 쪽으로 날아가 사라지고, 지금 자리 표시가 옮김을 따라 옮겨 간다
 *   - 판정: 멈춘 자리 위로 판정 표지가 내려앉는다
 *
 * 무대는 셈하지 않는다 — 덩이 · 옮김 · 층 칸 · 판정은 모두 projector 가 넘긴 값이다. 자리 배치(칸 좌표)만 여기서 정한다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { nodeText } from './algorithm.js';

export type StageArc = { from: number; to: number; label: string };
export type StageNode = {
  id: number;
  set: number[];
  accepting: boolean;
  parent: number | null;
  letter: string | null;
  layer: number;
  slot: number;
  slots: number;
};
export type StageMove = { from: number; letter: string; to: number; fresh: boolean };

export type FiniteAutomataStage = ViewInstance & {
  start(a: {
    rebuild: boolean;
    /** 이번 판 DFA 의 덩이 수 — 번호가 이 수 이상인 앞 판 덩이는 걸음 0 에서 접는다 */
    dfaSlots: number;
    pieces: string[];
    alphabet: string[];
    nfaStates: number;
    accept: number;
    arcs: StageArc[];
    word: string;
    caption: string;
    dur: number;
  }): Promise<void>;
  layer(a: { fresh: StageNode[]; moves: StageMove[]; last: boolean; caption: string; dur: number }): Promise<void>;
  move(a: { at: number; letter: string; from: number; to: number; caption: string; dur: number }): Promise<void>;
  verdict(a: { stop: number; accepted: boolean; caption: string; dur: number }): Promise<void>;
  /** 되감기 — 덩이 · 옮김 · 표지 · 자리 표시 · 입력 · 무늬 · NFA 를 모두 비운다 */
  reset(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 820;
const H = 600;

// 자리 배치
const PATTERN_Y = 30;
const PATTERN_X = 110;
const NFA_Y = 96;
const NFA_X0 = 126;
const NFA_DX = 74;
const NFA_R = 15;
const INPUT_X0 = 578;
const INPUT_Y = 80;
const CELL = 34;
const DFA_TOP = 164;
const DFA_H = 376;
const COL_X0 = 16;
const COL_DX = 162;
const NODE_W = 150;
const NODE_H = 38;
const CAPTION_Y = 578;

type NodeEl = {
  data: StageNode;
  g: SVGGElement;
  box: SVGRectElement;
  ring: SVGRectElement;
  name: SVGTextElement;
  tr: SVGTextElement[];
  edge: SVGPathElement | null;
  edgeLabel: SVGTextElement | null;
  x: number;
  y: number;
  solid: boolean;
};

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): FiniteAutomataStage {
  void container;
  const t = params.t ?? makeTranslator(params.locale);
  const c: Palette = getColors(params.theme);
  const svg = params.canvas;
  const isInstant = params.isInstant ?? (() => false);
  const monoPx = parseFloat(fontSizes.md);
  const smPx = parseFloat(fontSizes.sm);
  const charW = monoPx * 0.6;
  const smCharW = smPx * 0.6;

  const frames = new Set<number>();
  const waiters = new Set<() => void>();
  let destroyed = false;

  const el = <K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number>,
    parent: Element,
    text?: string,
  ): SVGElementTagNameMap[K] => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    parent.appendChild(e);
    return e;
  };

  const tween = (ms: number, fn: (p: number) => void): Promise<void> =>
    new Promise<void>((resolve) => {
      if (destroyed || ms <= 0 || isInstant()) {
        fn(1);
        resolve();
        return;
      }
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        waiters.delete(finish);
        resolve();
      };
      waiters.add(finish);
      const t0 = performance.now();
      const tick = (now: number): void => {
        if (done) return;
        if (destroyed || isInstant()) {
          fn(1);
          finish();
          return;
        }
        const p = Math.min(1, Math.max(0, (now - t0) / ms));
        fn(ease(p));
        if (p < 1) {
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        } else finish();
      };
      const id = requestAnimationFrame((n) => {
        frames.delete(id);
        tick(n);
      });
      frames.add(id);
    });

  const stopAll = (): void => {
    for (const id of frames) cancelAnimationFrame(id);
    frames.clear();
    for (const w of [...waiters]) w();
    waiters.clear();
  };
  params.onScrubStart?.(stopAll);

  // ── 층
  const root = el('g', {}, svg);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, root);
  const labelAttrs = { 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted };
  el('text', { ...labelAttrs, x: 16, y: PATTERN_Y + 5 }, root, t('label.pattern', 'Pattern'));
  el('text', { ...labelAttrs, x: 16, y: NFA_Y + 5 }, root, t('label.nfa', 'NFA'));
  el('text', { ...labelAttrs, x: INPUT_X0 - 62, y: INPUT_Y + 21 }, root, t('label.input', 'Input'));
  el('text', { ...labelAttrs, x: 16, y: DFA_TOP - 12 }, root, t('label.dfa', 'DFA'));
  el('line', { x1: 16, x2: W - 16, y1: DFA_TOP - 30, y2: DFA_TOP - 30, stroke: c.border, 'stroke-width': 1 }, root);

  const gPattern = el('g', {}, root);
  const gNfa = el('g', {}, root);
  const gInput = el('g', {}, root);
  const gEdges = el('g', {}, root);
  const gNodes = el('g', {}, root);
  const gMarker = el('g', {}, root);
  const gFly = el('g', {}, root);
  const gBadge = el('g', {}, root);
  const caption = el(
    'text',
    { x: 16, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text },
    root,
    '',
  );

  // ── 무늬
  const pieces: SVGTextElement[] = [];
  const pieceX = (texts: readonly string[], i: number): number => {
    let n = 0;
    for (let j = 0; j < i; j += 1) n += (texts[j] ?? '').length;
    return PATTERN_X + n * charW;
  };

  // ── NFA — 자리 좌표를 들고 프레임마다 다시 그린다
  let nfaXs: number[] = [];
  let nfaAcceptX: number | null = null;
  let nfaArcs: StageArc[] = [];
  const drawNfa = (xs: readonly number[], alpha: readonly number[], acceptX: number | null): void => {
    while (gNfa.firstChild) gNfa.removeChild(gNfa.firstChild);
    const first = xs[0];
    if (first === undefined) return;
    // 시작 화살
    el('line', { x1: first - NFA_R - 26, x2: first - NFA_R - 3, y1: NFA_Y, y2: NFA_Y, stroke: c.textMuted, 'stroke-width': 1.5 }, gNfa);
    el('path', { d: `M ${first - NFA_R - 2} ${NFA_Y} l -6 -4 l 0 8 z`, fill: c.textMuted }, gNfa);
    for (const a of nfaArcs) {
      const x1 = xs[a.from];
      const x2 = xs[a.to];
      if (x1 === undefined || x2 === undefined) throw new Error(`NFA 옮김 ${a.from} → ${a.to} 의 자리 좌표가 없다`);
      const op = Math.min(alpha[a.from] ?? 1, alpha[a.to] ?? 1);
      const lab = { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted, 'text-anchor': 'middle', opacity: op };
      if (a.from === a.to) {
        el('path', { d: `M ${x1 - 7} ${NFA_Y - NFA_R + 2} C ${x1 - 18} ${NFA_Y - 44}, ${x1 + 18} ${NFA_Y - 44}, ${x1 + 7} ${NFA_Y - NFA_R + 2}`, fill: 'none', stroke: c.textMuted, 'stroke-width': 1.3, opacity: op }, gNfa);
        el('text', { ...lab, x: x1, y: NFA_Y - 38 }, gNfa, a.label);
      } else {
        const sx = x1 + NFA_R;
        const ex = x2 - NFA_R;
        if (ex - sx < 2) continue;
        el('line', { x1: sx, x2: ex - 5, y1: NFA_Y, y2: NFA_Y, stroke: c.textMuted, 'stroke-width': 1.3, opacity: op }, gNfa);
        el('path', { d: `M ${ex} ${NFA_Y} l -7 -4 l 0 8 z`, fill: c.textMuted, opacity: op }, gNfa);
        el('text', { ...lab, x: (sx + ex) / 2, y: NFA_Y - 7 }, gNfa, a.label);
      }
    }
    xs.forEach((x, i) => {
      const op = alpha[i] ?? 1;
      el('circle', { cx: x, cy: NFA_Y, r: NFA_R, fill: c.bgSubtle, stroke: c.text, 'stroke-width': 1.5, opacity: op }, gNfa);
      el('text', { x, y: NFA_Y + 5, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text, opacity: op }, gNfa, String(i));
    });
    if (acceptX !== null) {
      el('circle', { cx: acceptX, cy: NFA_Y, r: NFA_R + 4, fill: 'none', stroke: c.text, 'stroke-width': 1.5 }, gNfa);
    }
  };

  // ── 입력
  let cells: { box: SVGRectElement; glyph: SVGTextElement; letter: string }[] = [];

  // ── DFA
  const nodes = new Map<number, NodeEl>();
  let alphabet: string[] = [];
  const slotPos = (n: StageNode): { x: number; y: number } => {
    if (n.slots <= 0 || n.slot < 0 || n.slot >= n.slots) throw new Error(`덩이 D${n.id} 의 칸이 잘못됐다`);
    const row = DFA_H / n.slots;
    return { x: COL_X0 + n.layer * COL_DX, y: DFA_TOP + (n.slot + 0.5) * row - NODE_H / 2 };
  };
  const edgePath = (px: number, py: number, cx: number, cy: number): string => {
    const x1 = px + NODE_W;
    const y1 = py + NODE_H / 2;
    const x2 = cx;
    const y2 = cy + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  };
  const placeNode = (n: NodeEl, x: number, y: number): void => {
    n.x = x;
    n.y = y;
    n.g.setAttribute('transform', `translate(${x} ${y})`);
    const parent = n.data.parent === null ? undefined : nodes.get(n.data.parent);
    if (n.edge && parent) {
      n.edge.setAttribute('d', edgePath(parent.x, parent.y, x, y));
      n.edgeLabel?.setAttribute('x', String((parent.x + NODE_W + x) / 2));
      n.edgeLabel?.setAttribute('y', String((parent.y + y) / 2 + NODE_H / 2 - 4));
    }
  };
  const styleNode = (n: NodeEl): void => {
    const solid = n.solid;
    n.box.setAttribute('stroke-dasharray', solid ? '' : '4 3');
    n.box.setAttribute('stroke', solid ? c.text : c.border);
    n.box.setAttribute('fill', solid ? c.bgSubtle : c.bg);
    n.name.setAttribute('fill', solid ? c.text : c.textMuted);
    n.ring.setAttribute('visibility', solid && n.data.accepting ? 'visible' : 'hidden');
    if (n.edge) {
      n.edge.setAttribute('stroke', solid ? c.textMuted : c.border);
      n.edge.setAttribute('stroke-dasharray', solid ? '' : '4 3');
    }
    n.edgeLabel?.setAttribute('fill', solid ? c.textMuted : c.border);
  };
  const createNode = (d: StageNode): NodeEl => {
    const g = el('g', {}, gNodes);
    const box = el('rect', { x: 0, y: 0, width: NODE_W, height: NODE_H, rx: 6, 'stroke-width': 1.5 }, g);
    const ring = el('rect', { x: 3, y: 3, width: NODE_W - 6, height: NODE_H - 6, rx: 4, fill: 'none', stroke: c.text, 'stroke-width': 1 }, g);
    const name = el('text', { x: 8, y: 15, 'font-family': fonts.mono, 'font-size': fontSizes.sm }, g, nodeText(d.id, d.set));
    const tr = [0, 1].map((i) =>
      el('text', { x: 8 + i * 70, y: 31, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, g, ''),
    );
    let edge: SVGPathElement | null = null;
    let edgeLabel: SVGTextElement | null = null;
    if (d.parent !== null) {
      edge = el('path', { d: '', fill: 'none', 'stroke-width': 1.3 }, gEdges);
      edgeLabel = el('text', { 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'text-anchor': 'middle' }, gEdges, d.letter ?? '');
    }
    const n: NodeEl = { data: d, g, box, ring, name, tr, edge, edgeLabel, x: 0, y: 0, solid: true };
    nodes.set(d.id, n);
    return n;
  };
  const removeNode = (n: NodeEl): void => {
    n.g.remove();
    n.edge?.remove();
    n.edgeLabel?.remove();
    nodes.delete(n.data.id);
  };
  const nodeAt = (id: number): NodeEl => {
    const n = nodes.get(id);
    if (!n) throw new Error(`무대에 D${id} 가 없다`);
    return n;
  };

  // ── 지금 자리 표시 · 판정
  let marker: SVGRectElement | null = null;
  const clearWalk = (): void => {
    while (gMarker.firstChild) gMarker.removeChild(gMarker.firstChild);
    while (gFly.firstChild) gFly.removeChild(gFly.firstChild);
    while (gBadge.firstChild) gBadge.removeChild(gBadge.firstChild);
    marker = null;
    for (const n of nodes.values()) {
      n.box.setAttribute('stroke-width', '1.5');
      for (const x of n.tr) x.setAttribute('fill', c.textMuted);
    }
  };
  const placeMarker = (x: number, y: number): void => {
    if (!marker) {
      marker = el('rect', { width: NODE_W + 10, height: NODE_H + 10, rx: 9, fill: 'none', stroke: c.primary, 'stroke-width': 3 }, gMarker);
    }
    marker.setAttribute('x', String(x - 5));
    marker.setAttribute('y', String(y - 5));
  };

  const setCaption = (s: string): void => {
    caption.textContent = s;
  };

  const inst: FiniteAutomataStage = {
    async start(a) {
      alphabet = [...a.alphabet];
      setCaption(a.caption);
      clearWalk();

      // 무늬 — 붙는 조각은 오른쪽에서 미끄러져 들어오고, 떨어지는 조각은 오른쪽으로 빠진다
      const keep = Math.min(pieces.length, a.pieces.length);
      for (let i = 0; i < keep; i += 1) {
        const p = pieces[i];
        if (p && p.textContent !== a.pieces[i]) p.textContent = a.pieces[i] ?? '';
      }
      const added: SVGTextElement[] = [];
      for (let i = keep; i < a.pieces.length; i += 1) {
        const p = el('text', { x: pieceX(a.pieces, i), y: PATTERN_Y + 5, 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text, 'xml:space': 'preserve' }, gPattern, a.pieces[i]);
        pieces.push(p);
        added.push(p);
      }
      const dropped = pieces.splice(a.pieces.length);

      // NFA — 새 자리는 끝 자리에서 나와 제 칸으로, 떨어지는 자리는 새 끝 자리로 접힌다
      const oldXs = nfaXs;
      const targetXs = Array.from({ length: a.nfaStates }, (_, i) => NFA_X0 + i * NFA_DX);
      const fromXs = targetXs.map((x, i) => oldXs[i] ?? oldXs[oldXs.length - 1] ?? x);
      const goneXs = oldXs.slice(a.nfaStates);
      const lastTarget = targetXs[targetXs.length - 1] ?? NFA_X0;
      const accTarget = targetXs[a.accept];
      if (accTarget === undefined) throw new Error(`NFA 받는 자리 ${a.accept} 가 자리 밖`);
      const accFrom = nfaAcceptX ?? accTarget;
      nfaArcs = a.arcs;

      // 입력 — 새 글자 줄이 오른쪽에서 들어온다
      while (gInput.firstChild) gInput.removeChild(gInput.firstChild);
      cells = [...a.word].map((letter, i) => {
        const x = INPUT_X0 + i * CELL;
        const box = el('rect', { x, y: INPUT_Y, width: CELL - 4, height: CELL - 4, rx: 4, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1 }, gInput);
        const glyph = el('text', { x: x + (CELL - 4) / 2, y: INPUT_Y + 21, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.text }, gInput, letter);
        return { box, glyph, letter };
      });

      // DFA — 지을 판이면 앞 판의 덩이는 이름 · 옮김을 걷은 빈 자리로 남는다.
      // 이번 판에 서지 않을 번호(≥ dfaSlots)는 남는 조상 자리로 곧바로 접혀 들어간다
      const fold: { n: NodeEl; fx: number; fy: number; tx: number; ty: number }[] = [];
      if (a.rebuild) {
        for (const n of nodes.values()) {
          n.solid = false;
          n.name.textContent = '';
          for (const x of n.tr) x.textContent = '';
          styleNode(n);
          if (n.data.id < a.dfaSlots) continue;
          let anc: NodeEl = n;
          while (anc.data.id >= a.dfaSlots) {
            if (anc.data.parent === null) throw new Error(`D${n.data.id} 를 접을 조상 자리가 없다`);
            anc = nodeAt(anc.data.parent);
          }
          fold.push({ n, fx: n.x, fy: n.y, tx: anc.x, ty: anc.y });
        }
      }

      await tween(a.dur, (p) => {
        added.forEach((e, i) => {
          e.setAttribute('transform', `translate(${(1 - p) * 40} 0)`);
          e.setAttribute('opacity', String(p));
          void i;
        });
        for (const e of dropped) {
          e.setAttribute('transform', `translate(${p * 40} 0)`);
          e.setAttribute('opacity', String(1 - p));
        }
        const xs = targetXs.map((x, i) => (fromXs[i] ?? x) + (x - (fromXs[i] ?? x)) * p);
        const alpha = targetXs.map((_, i) => (i < oldXs.length ? 1 : p));
        const gone = goneXs.map((x) => x + (lastTarget - x) * p);
        drawNfa([...xs, ...gone], [...alpha, ...gone.map(() => 1 - p)], accFrom + (accTarget - accFrom) * p);
        const shift = (1 - p) * 60;
        gInput.setAttribute('transform', `translate(${shift} 0)`);
        gInput.setAttribute('opacity', String(p));
        for (const f of fold) {
          f.n.g.setAttribute('transform', `translate(${f.fx + (f.tx - f.fx) * p} ${f.fy + (f.ty - f.fy) * p})`);
          f.n.g.setAttribute('opacity', String(1 - p));
          f.n.edge?.setAttribute('opacity', String(1 - p));
          f.n.edgeLabel?.setAttribute('opacity', String(1 - p));
        }
      });
      for (const f of fold) removeNode(f.n);
      for (const e of dropped) e.remove();
      nfaXs = targetXs;
      nfaAcceptX = accTarget;
      drawNfa(nfaXs, nfaXs.map(() => 1), nfaAcceptX);
    },

    async layer(a) {
      setCaption(a.caption);
      for (const n of nodes.values()) for (const x of n.tr) x.setAttribute('fill', c.textMuted);
      // 새로 서는 덩이 — 빈 자리가 있으면 그 자리에서 차고, 없으면 부모 자리에서 갈라져 나온다
      const glide: { n: NodeEl; fx: number; fy: number; tx: number; ty: number }[] = [];
      for (const d of a.fresh) {
        const to = slotPos(d);
        let n = nodes.get(d.id);
        if (n) {
          n.data = d;
          n.name.textContent = nodeText(d.id, d.set);
          n.solid = true;
          styleNode(n);
          placeNode(n, to.x, to.y);
          continue;
        }
        n = createNode(d);
        styleNode(n);
        // 부모가 있는 덩이는 부모 자리에서 갈라져 나온다. 시작 덩이 D0 (부모 없음) 는 시작 화살 쪽 왼편에서 들어온다
        const from = d.parent === null ? { x: to.x - 40, y: to.y } : nodeAt(d.parent);
        const fx = from.x;
        const fy = from.y;
        placeNode(n, fx, fy);
        glide.push({ n, fx, fy, tx: to.x, ty: to.y });
      }
      // 옮김 — 부른 덩이 안에 글자마다 간 곳을 적는다
      for (const m of a.moves) {
        const src = nodeAt(m.from);
        const li = alphabet.indexOf(m.letter);
        const slot = src.tr[li];
        if (li < 0 || !slot) throw new Error(`글자 모임에 없는 옮김 글자: ${m.letter}`);
        slot.textContent = `${m.letter}→D${m.to}`;
        slot.setAttribute('fill', c.accent);
      }
      // 마지막 층 — 빈 자리가 남아 있으면 걸음 0 의 접기와 층이 어긋난 것이다
      if (a.last) {
        for (const n of nodes.values()) if (!n.solid) throw new Error(`마지막 층 뒤에도 D${n.data.id} 가 빈 자리로 남았다`);
      }
      await tween(a.dur, (p) => {
        for (const g of glide) {
          placeNode(g.n, g.fx + (g.tx - g.fx) * p, g.fy + (g.ty - g.fy) * p);
          g.n.g.setAttribute('opacity', String(0.3 + 0.7 * p));
        }
      });
      for (const g of glide) g.n.g.setAttribute('opacity', '1');
    },

    async move(a) {
      setCaption(a.caption);
      const from = nodeAt(a.from);
      const to = nodeAt(a.to);
      const cell = cells[a.at];
      if (!cell) throw new Error(`입력 칸 ${a.at} 가 없다`);
      if (!marker) placeMarker(from.x, from.y);
      for (const n of nodes.values()) for (const x of n.tr) x.setAttribute('fill', c.textMuted);
      const li = alphabet.indexOf(a.letter);
      const slot = from.tr[li];
      if (li < 0 || !slot) throw new Error(`글자 모임에 없는 글자: ${a.letter}`);
      slot.setAttribute('fill', c.primary);
      // 글자가 제 칸에서 나와 옮겨 가는 자리로 날아간다
      const bx = Number(cell.box.getAttribute('x')) + (CELL - 4) / 2;
      const by = INPUT_Y + 21;
      const fly = el('text', { x: bx, y: by, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: c.primary }, gFly, a.letter);
      cell.glyph.setAttribute('fill', c.border);
      cell.box.setAttribute('stroke-dasharray', '3 3');
      cell.box.setAttribute('fill', c.bg);
      const tx = to.x + NODE_W / 2;
      const ty = to.y + NODE_H / 2 + 5;
      const same = a.from === a.to;
      await tween(a.dur, (p) => {
        const hop = same ? Math.sin(Math.PI * p) * 14 : 0;
        placeMarker(from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p - hop);
        fly.setAttribute('x', String(bx + (tx - bx) * p));
        fly.setAttribute('y', String(by + (ty - by) * p));
        fly.setAttribute('opacity', String(1 - p));
      });
      fly.remove();
      placeMarker(to.x, to.y);
    },

    async verdict(a) {
      setCaption(a.caption);
      const n = nodeAt(a.stop);
      if (!marker) placeMarker(n.x, n.y);
      n.box.setAttribute('stroke-width', '2.5');
      while (gBadge.firstChild) gBadge.removeChild(gBadge.firstChild);
      const label = a.accepted ? t('label.accepted', 'Accepted') : t('label.rejected', 'Not accepted');
      const bw = Math.max(64, label.length * smCharW + 20);
      const g = el('g', {}, gBadge);
      el(
        'rect',
        a.accepted
          ? { x: 0, y: 0, width: bw, height: 20, rx: 10, fill: c.primary, stroke: c.primary, 'stroke-width': 1.5 }
          : { x: 0, y: 0, width: bw, height: 20, rx: 10, fill: c.bg, stroke: c.danger, 'stroke-width': 1.5, 'stroke-dasharray': '4 2' },
        g,
      );
      el(
        'text',
        { x: bw / 2, y: 14, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: a.accepted ? c.textInverse : c.danger },
        g,
        `${a.accepted ? '✓' : '✗'} ${label}`,
      );
      const bx = Math.min(W - bw - 4, n.x + NODE_W - bw + 10);
      const byEnd = n.y - 14;
      await tween(a.dur, (p) => {
        g.setAttribute('transform', `translate(${bx} ${byEnd - (1 - p) * 40})`);
        g.setAttribute('opacity', String(p));
      });
    },

    reset() {
      stopAll();
      clearWalk();
      for (const n of [...nodes.values()]) removeNode(n);
      while (gInput.firstChild) gInput.removeChild(gInput.firstChild);
      gInput.removeAttribute('transform');
      cells = [];
      for (const e of pieces) e.remove();
      pieces.length = 0;
      nfaXs = [];
      nfaAcceptX = null;
      nfaArcs = [];
      while (gNfa.firstChild) gNfa.removeChild(gNfa.firstChild);
      setCaption('');
    },

    destroy() {
      destroyed = true;
      stopAll();
      root.remove();
    },
  };
  return inst;
}

export const finiteAutomataStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount,
};
