/**
 * parse-tree-to-ast 무대 — 원시 · 토큰 열 · 문법 다섯 줄 · 파스 나무 → AST · 값.
 *
 * 운동: 파스 나무가 뿌리에서 아래로 **매달리고**, 걷는 걸음마다 걷힐 마디가 굵어졌다가 줄어 사라지며
 * 자식이 빈자리로 **올라오고**, 괄호 잎은 **떨어져 나가고**, 연산자 잎은 부모 자리로 **올라가** 마디가 된다.
 * 나무의 자리는 나무 모양에서만 정한다 — 모양이 같은 AST 는 앞 판과 같은 자리에 내려앉는다
 * (op 걸음에서 앞 판 AST 의 자리를 점선 틀로 보인다 — 결론이 아니라 자리다).
 *
 * 무대는 셈하지 않는다 — 마디 수 · 층 · 값 · 걷힌 마디 · 버린 잎은 모두 payload 로 받는다.
 * 자리 잡기(layout)만 무대의 일이다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { TreeOut, TreeOutNode } from './algorithm.js';

const W = 760;
const H = 596;
const SVG_NS = 'http://www.w3.org/2000/svg';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** 나무 자리 — 가장 큰 파스 나무(마디 19 · 층 9 · 잎 9)가 들어간다 */
const TREE_CX = 262;
const TREE_TOP = 142;
const ROW = 44;
const LEAF_GAP = 50;
const RULE_W = 46;
const RULE_H = 24;
const TOKEN_R = 14;

/** 문법 판 */
const GRAMMAR_X = 520;
const GRAMMAR_Y = 128;
const GRAMMAR_ROW = 26;

export type StageToken = { kind: string; text: string };
export type StageRule = { name: string; lhs: string; rhs: string[]; conv: string };
export type StageRound = { source: string; tokens: StageToken[]; tokenCount: number; rules: StageRule[] };
export type StageParse = { tree: TreeOut; total: number; inner: number; leaves: number; levels: number };
export type StageWalk = {
  conv: string;
  count: number;
  removed: string[];
  dropped: string[];
  droppedNow: number;
  risen: string[];
  tree: TreeOut;
  remaining: number;
  droppedTotal: number;
};
export type StageValue = {
  ast: string;
  value: number;
  astNodes: number;
  astLevels: number;
  values: { id: string; value: number }[];
};

/** projector 가 부르는 무대의 표면 */
export type ParseTreeToAstStage = {
  showRound(r: StageRound, ms: number): Promise<void>;
  showParseTree(p: StageParse, ms: number): Promise<void>;
  walk(w: StageWalk, ms: number): Promise<void>;
  showValue(v: StageValue, ms: number): Promise<void>;
  reset(): void;
};

type Pos = { x: number; y: number };
type Vis = {
  node: TreeOutNode;
  g: SVGGElement;
  from: Pos;
  to: Pos;
  pos: Pos;
};

const CONVS = ['op', 'pass', 'paren', 'leaf'] as const;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

/** 빈칸을 접지 않는 글자 토막 (원시 · 문법 글자) */
function preText(attrs: Record<string, string | number>, text: string, parent: Element): SVGTextElement {
  const e = el('text', attrs, parent);
  e.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  e.style.whiteSpace = 'pre';
  e.textContent = text;
  return e;
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

/** 나무 모양에서만 자리를 정한다 — 잎은 왼쪽부터 같은 간격, 안쪽 마디는 첫 자식과 끝 자식 가운데 */
export function layoutTree(tree: TreeOut): Map<string, Pos> {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const leaves: string[] = [];
  const walk = (id: string, d: number): void => {
    const n = byId.get(id);
    if (n === undefined) throw new Error(`parse-tree-to-ast-stage: 나무에 없는 마디 ${id}`);
    depth.set(id, d);
    if (n.kids.length === 0) leaves.push(id);
    for (const k of n.kids) walk(k, d + 1);
  };
  walk(tree.root, 0);
  const out = new Map<string, Pos>();
  leaves.forEach((id, k) => {
    out.set(id, { x: TREE_CX + (k - (leaves.length - 1) / 2) * LEAF_GAP, y: TREE_TOP + depth.get(id)! * ROW });
  });
  const place = (id: string): Pos => {
    const hit = out.get(id);
    if (hit !== undefined) return hit;
    const n = byId.get(id)!;
    const kidPos = n.kids.map(place);
    const first = kidPos[0]!;
    const last = kidPos[kidPos.length - 1]!;
    const p = { x: (first.x + last.x) / 2, y: TREE_TOP + depth.get(id)! * ROW };
    out.set(id, p);
    return p;
  };
  place(tree.root);
  return out;
}

function parentsOf(tree: TreeOut): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of tree.nodes) for (const k of n.kids) out.set(k, n.id);
  return out;
}

export const parseTreeToAstStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const p: Palette = getColors(params.theme);
    const convColor = new Map<string, string>(CONVS.map((c, i) => [c, categorical(CONVS.length, 'vivid')[i]!]));
    const smPx = parseFloat(fontSizes.sm);
    const charW = smPx * 0.62;
    const isInstant = params.isInstant ?? (() => false);

    let destroyed = false;
    const frames = new Set<number>();
    const finishers = new Set<() => void>();
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const fin of [...finishers]) fin();
      finishers.clear();
    });

    /** 시간에 걸친 운동 — 되짚기 · 파괴 때는 끝 모습으로 건너뛴다 */
    const tween = (ms: number, frame: (u: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0) {
          frame(1);
          resolve();
          return;
        }
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          finishers.delete(finish);
          frame(1);
          resolve();
        };
        finishers.add(finish);
        const t0 = performance.now();
        const tick = (now: number): void => {
          if (done) return;
          const u = Math.min(1, (now - t0) / ms);
          if (u >= 1 || destroyed) {
            finish();
            return;
          }
          frame(ease(u));
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        tick(t0);
      });

    const root = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: p.bg }, root);

    const labelAttrs = { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: p.textMuted };
    const monoAttrs = { 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: p.text };

    // 원시
    el('text', { x: 24, y: 34, ...labelAttrs }, root).textContent = t('label.source', 'Source');
    const sourceText = preText(
      { x: 96, y: 35, 'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: p.text, 'font-weight': 600 },
      '',
      root,
    );
    // 토큰 열
    const tokensLabel = el('text', { x: 24, y: 72, ...labelAttrs }, root);
    const tokensG = el('g', {}, root);

    // 문법
    el('text', { x: GRAMMAR_X, y: GRAMMAR_Y - 26, ...labelAttrs }, root).textContent = t('label.grammar', 'Grammar');
    const grammarG = el('g', {}, root);
    let grammarRows: { rule: StageRule; bg: SVGRectElement; text: SVGTextElement }[] = [];

    // 나무
    const treeLabel = el('text', { x: 24, y: TREE_TOP - 26, ...labelAttrs }, root);
    const ghostG = el('g', {}, root);
    const edgeG = el('g', {}, root);
    const nodeG = el('g', {}, root);
    const valueG = el('g', {}, root);

    // 캡션 · 값
    const caption = el('text', { x: 24, y: H - 56, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: p.text }, root);
    const valueLine = preText(
      { x: 24, y: H - 22, 'font-family': fonts.mono, 'font-size': fontSizes.lg, fill: p.text, 'font-weight': 700 },
      '',
      root,
    );

    let vis = new Map<string, Vis>();
    let edges = new Map<string, SVGLineElement>();
    let tree: TreeOut | null = null;
    /** 앞 판 AST 의 자리 (모양만) */
    let lastAst: { nodes: Pos[]; edges: [Pos, Pos][] } | null = null;

    const drawNodeBody = (g: SVGGElement, n: TreeOutNode): void => {
      while (g.firstChild) g.removeChild(g.firstChild);
      if (n.kind === 'rule') {
        const c = n.conv === null ? undefined : convColor.get(n.conv);
        if (c === undefined) throw new Error(`parse-tree-to-ast-stage: 규약 색이 없다 ${String(n.conv)}`);
        el(
          'rect',
          { x: -RULE_W / 2, y: -RULE_H / 2, width: RULE_W, height: RULE_H, rx: 5, fill: p.bg, stroke: c, 'stroke-width': 2, 'data-role': 'shape' },
          g,
        );
        el('text', { ...monoAttrs, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g).textContent = n.label;
      } else if (n.kind === 'op') {
        el('circle', { r: TOKEN_R + 2, fill: p.primary, stroke: p.primary, 'stroke-width': 2, 'data-role': 'shape' }, g);
        el(
          'text',
          { ...monoAttrs, fill: p.textInverse, 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central' },
          g,
        ).textContent = n.label;
      } else {
        el('circle', { r: TOKEN_R, fill: p.bgSubtle, stroke: p.border, 'stroke-width': 1.5, 'data-role': 'shape' }, g);
        el('text', { ...monoAttrs, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g).textContent = n.label;
      }
    };

    const placeVis = (v: Vis, scale = 1, opacity = 1): void => {
      v.g.setAttribute('transform', `translate(${v.pos.x.toFixed(1)},${v.pos.y.toFixed(1)}) scale(${scale.toFixed(3)})`);
      v.g.setAttribute('opacity', opacity.toFixed(3));
    };

    const setEdge = (kid: string, a: Pos, b: Pos, opacity = 1): void => {
      let line = edges.get(kid);
      if (line === undefined) {
        line = el('line', { stroke: p.border, 'stroke-width': 1.5 }, edgeG);
        edges.set(kid, line);
      }
      line.setAttribute('x1', a.x.toFixed(1));
      line.setAttribute('y1', a.y.toFixed(1));
      line.setAttribute('x2', b.x.toFixed(1));
      line.setAttribute('y2', b.y.toFixed(1));
      line.setAttribute('opacity', opacity.toFixed(3));
    };

    const clearTree = (): void => {
      while (nodeG.firstChild) nodeG.removeChild(nodeG.firstChild);
      while (edgeG.firstChild) edgeG.removeChild(edgeG.firstChild);
      while (valueG.firstChild) valueG.removeChild(valueG.firstChild);
      vis = new Map();
      edges = new Map();
      tree = null;
    };

    const clearGhost = (): void => {
      while (ghostG.firstChild) ghostG.removeChild(ghostG.firstChild);
    };

    const drawGhost = (): void => {
      clearGhost();
      if (lastAst === null) return;
      for (const [a, b] of lastAst.edges) {
        el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: p.border, 'stroke-width': 1, 'stroke-dasharray': '3 3' }, ghostG);
      }
      for (const q of lastAst.nodes) {
        el('circle', { cx: q.x, cy: q.y, r: TOKEN_R + 2, fill: p.bg, stroke: p.border, 'stroke-dasharray': '3 3' }, ghostG);
      }
    };

    const highlightGrammar = (conv: string | null): void => {
      for (const row of grammarRows) {
        const on = conv !== null && row.rule.conv === conv;
        row.bg.setAttribute('fill', on ? p.bgSubtle : p.bg);
        row.bg.setAttribute('stroke', on ? p.accent : p.bg);
        row.text.setAttribute('font-weight', on ? '700' : '400');
      }
    };

    const instance: ParseTreeToAstStage & ViewInstance = {
      async showRound(r, ms) {
        clearTree();
        clearGhost();
        highlightGrammar(null);
        treeLabel.textContent = '';
        caption.textContent = t('caption.start', 'Source cut into tokens. Tokens: {n}', { n: r.tokenCount });
        valueLine.textContent = '';
        sourceText.textContent = r.source;
        tokensLabel.textContent = t('label.tokens', 'Tokens');

        // 문법 다섯 줄
        while (grammarG.firstChild) grammarG.removeChild(grammarG.firstChild);
        grammarRows = r.rules.map((rule, i) => {
          const y = GRAMMAR_Y + i * GRAMMAR_ROW;
          const bg = el('rect', { x: GRAMMAR_X - 6, y: y - 16, width: W - GRAMMAR_X - 2, height: 22, rx: 4, fill: p.bg, stroke: p.bg }, grammarG);
          const c = convColor.get(rule.conv);
          if (c === undefined) throw new Error(`parse-tree-to-ast-stage: 모르는 규약 ${rule.conv}`);
          el('rect', { x: GRAMMAR_X, y: y - 10, width: 9, height: 9, rx: 2, fill: c }, grammarG);
          el('text', { x: GRAMMAR_X + 14, y, ...monoAttrs, fill: p.textMuted }, grammarG).textContent = rule.name;
          const text = preText({ x: GRAMMAR_X + 38, y, ...monoAttrs }, `${rule.lhs} → ${rule.rhs.join(' ')}`, grammarG);
          el('text', { x: W - 12, y, ...monoAttrs, fill: p.textMuted, 'text-anchor': 'end' }, grammarG).textContent = rule.conv;
          return { rule, bg, text };
        });

        // 토큰 열 — 원시 아래에서 제자리로 미끄러져 온다
        while (tokensG.firstChild) tokensG.removeChild(tokensG.firstChild);
        const chips: { g: SVGGElement; x: number }[] = [];
        let x = 96;
        const chip = (label: string, dashed: boolean): void => {
          const w = label.length * charW + 14;
          const g = el('g', {}, tokensG);
          el(
            'rect',
            {
              x: 0, y: -13, width: w, height: 22, rx: 4,
              fill: dashed ? p.bg : p.bgSubtle, stroke: p.border,
              ...(dashed ? { 'stroke-dasharray': '3 2' } : {}),
            },
            g,
          );
          preText({ x: 7, y: 3, ...monoAttrs, fill: dashed ? p.textMuted : p.text }, label, g);
          chips.push({ g, x });
          x += w + 6;
        };
        for (const tk of r.tokens) chip(`${tk.kind} ${tk.text}`, false);
        chip('EOF', true);
        await tween(ms, (u) => {
          chips.forEach((c, i) => {
            const lag = Math.min(1, Math.max(0, u * 1.6 - i * 0.06));
            c.g.setAttribute('transform', `translate(${(c.x - 30 * (1 - lag)).toFixed(1)},${(72 - 18 * (1 - lag)).toFixed(1)})`);
            c.g.setAttribute('opacity', lag.toFixed(3));
          });
        });
      },

      async showParseTree(pt, ms) {
        clearTree();
        tree = pt.tree;
        treeLabel.textContent = t('label.parseTree', 'Parse tree');
        caption.textContent = t(
          'caption.parse',
          'Parse tree: nodes {total} (inner {inner} + leaves {leaves}) · levels {levels} · expansions {inner}',
          { total: pt.total, inner: pt.inner, leaves: pt.leaves, levels: pt.levels },
        );
        const at = layoutTree(pt.tree);
        const rootPos = at.get(pt.tree.root)!;
        for (const n of pt.tree.nodes) {
          const g = el('g', {}, nodeG);
          drawNodeBody(g, n);
          const to = at.get(n.id)!;
          vis.set(n.id, { node: n, g, from: { ...rootPos }, to, pos: { ...rootPos } });
        }
        const parent = parentsOf(pt.tree);
        await tween(ms, (u) => {
          for (const v of vis.values()) {
            v.pos = { x: lerp(v.from.x, v.to.x, u), y: lerp(v.from.y, v.to.y, u) };
            placeVis(v, 1, Math.min(1, 0.2 + u));
          }
          for (const [kid, par] of parent) setEdge(kid, vis.get(par)!.pos, vis.get(kid)!.pos, u);
        });
      },

      async walk(w, ms) {
        if (tree === null) throw new Error('parse-tree-to-ast-stage: 걸을 나무가 없다');
        highlightGrammar(w.conv);
        // AST 가 이루어지는 걸음에서 앞 판 AST 의 자리를 점선 틀로 보인다 — 모양이 같으면 그 위에 내려앉는다
        if (w.conv === 'op') drawGhost();
        treeLabel.textContent = w.conv === 'op' ? t('label.ast', 'AST') : t('label.walking', 'Walking the parse tree');
        if (w.conv === 'paren') {
          caption.textContent = t(
            'caption.walkParen',
            '{conv}: nodes removed {count}, parentheses dropped {dropped} → nodes left {remaining}',
            { conv: w.conv, count: w.count, dropped: w.droppedNow, remaining: w.remaining },
          );
        } else if (w.conv === 'op') {
          caption.textContent = t(
            'caption.walkOp',
            '{conv}: operators rising into their nodes {count} → nodes left {remaining}',
            { conv: w.conv, count: w.count, remaining: w.remaining },
          );
        } else {
          caption.textContent = t('caption.walk', '{conv}: nodes removed {count} → nodes left {remaining}', {
            conv: w.conv,
            count: w.count,
            remaining: w.remaining,
          });
        }
        const oldParent = parentsOf(tree);
        const newParent = parentsOf(w.tree);
        const at = layoutTree(w.tree);
        const removed = new Set(w.removed);
        const dropped = new Set(w.dropped);
        const risen = new Set(w.risen);
        const nextById = new Map(w.tree.nodes.map((n) => [n.id, n]));
        for (const v of vis.values()) {
          v.from = { ...v.pos };
          const target = at.get(v.node.id);
          if (target !== undefined) v.to = target;
          else if (dropped.has(v.node.id)) v.to = { x: v.pos.x + (v.pos.x < TREE_CX ? -24 : 24), y: v.pos.y + 56 };
          else if (removed.has(v.node.id)) v.to = { ...v.pos };
          else throw new Error(`parse-tree-to-ast-stage: 새 나무에서 빠진 마디 ${v.node.id} 가 걷힘 목록에 없다`);
        }
        const HOLD = 0.3;
        await tween(ms, (u) => {
          const m = u <= HOLD ? 0 : ease((u - HOLD) / (1 - HOLD));
          for (const v of vis.values()) {
            const id = v.node.id;
            v.pos = { x: lerp(v.from.x, v.to.x, m), y: lerp(v.from.y, v.to.y, m) };
            if (removed.has(id)) {
              // 걷힐 마디가 굵어졌다가 줄어 사라진다
              const swell = u <= HOLD ? 1 + 0.25 * Math.sin((u / HOLD) * Math.PI) : 1 - m;
              placeVis(v, Math.max(0, swell), u <= HOLD ? 1 : 1 - m);
            } else if (dropped.has(id)) {
              placeVis(v, 1, 1 - m);
            } else {
              if (risen.has(id) && m > 0.5 && v.node.kind !== 'op') {
                const nn = nextById.get(id)!;
                v.node = nn;
                drawNodeBody(v.g, nn);
              }
              placeVis(v, 1, 1);
            }
          }
          for (const kid of edges.keys()) {
            const par = newParent.get(kid) ?? oldParent.get(kid);
            if (par === undefined) throw new Error(`parse-tree-to-ast-stage: 선의 자식 ${kid} 에 부모가 없다`);
            const kv = vis.get(kid);
            if (kv === undefined) throw new Error(`parse-tree-to-ast-stage: 선의 자식 마디가 화면에 없다 ${kid}`);
            const pv = vis.get(par);
            if (pv === undefined) throw new Error(`parse-tree-to-ast-stage: 선의 부모 마디가 화면에 없다 ${par}`);
            const leaving = removed.has(kid) || dropped.has(kid) || (removed.has(par) && !newParent.has(kid));
            setEdge(kid, pv.pos, kv.pos, leaving ? 1 - m : 1);
          }
        });
        // 걷힌 것을 거둔다
        for (const id of [...removed, ...dropped]) {
          const v = vis.get(id);
          if (v === undefined) throw new Error(`parse-tree-to-ast-stage: 걷을 마디가 화면에 없다 ${id}`);
          v.g.remove();
          vis.delete(id);
        }
        for (const [kid, line] of [...edges]) {
          const par = newParent.get(kid);
          if (par === undefined) {
            line.remove();
            edges.delete(kid);
          } else {
            setEdge(kid, vis.get(par)!.pos, vis.get(kid)!.pos, 1);
          }
        }
        for (const n of w.tree.nodes) {
          const v = vis.get(n.id);
          if (v === undefined) throw new Error(`parse-tree-to-ast-stage: 새 나무의 마디가 화면에 없다 ${n.id}`);
          if (v.node.kind !== n.kind) drawNodeBody(v.g, n);
          v.node = n;
        }
        tree = w.tree;
      },

      async showValue(val, ms) {
        if (tree === null) throw new Error('parse-tree-to-ast-stage: 값을 셈할 AST 가 없다');
        highlightGrammar(null);
        clearGhost();
        treeLabel.textContent = t('label.ast', 'AST');
        caption.textContent = t('caption.value', 'AST nodes {nodes} · levels {levels} · value {value}', {
          nodes: val.astNodes,
          levels: val.astLevels,
          value: val.value,
        });
        valueLine.textContent = `${val.ast} = ${val.value}`;
        // 이 AST 의 자리를 다음 판의 점선 틀로 남긴다
        const par = parentsOf(tree);
        lastAst = {
          nodes: [...vis.values()].map((v) => ({ ...v.pos })),
          edges: [...par].map(([kid, pa]) => [{ ...vis.get(pa)!.pos }, { ...vis.get(kid)!.pos }]),
        };
        // 마디마다의 값이 마디 오른쪽 아래에서 솟는다
        while (valueG.firstChild) valueG.removeChild(valueG.firstChild);
        const tags = val.values.map((entry) => {
          const v = vis.get(entry.id);
          if (v === undefined) throw new Error(`parse-tree-to-ast-stage: 값을 달 마디가 없다 ${entry.id}`);
          const g = el('g', {}, valueG);
          el('text', { ...monoAttrs, 'font-weight': 700 }, g).textContent = `= ${entry.value}`;
          return { g, at: v.pos, leaf: v.node.kind === 'token' };
        });
        await tween(ms, (u) => {
          for (const tag of tags) {
            // 잎은 아래에, 연산 마디는 오른쪽에 — 이웃 잎과 겹치지 않게
            const dx = tag.leaf ? -10 : 20;
            const dy = tag.leaf ? 44 - 12 * u : 16 - 12 * u;
            tag.g.setAttribute('transform', `translate(${(tag.at.x + dx).toFixed(1)},${(tag.at.y + dy).toFixed(1)})`);
            tag.g.setAttribute('opacity', u.toFixed(3));
          }
        });
      },

      reset() {
        clearTree();
        clearGhost();
        lastAst = null;
        highlightGrammar(null);
        caption.textContent = '';
        valueLine.textContent = '';
        treeLabel.textContent = '';
      },

      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const fin of [...finishers]) fin();
        finishers.clear();
        root.remove();
      },
    };
    return instance;
  },
};
