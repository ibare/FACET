/**
 * tree-drops-syntax stage — 다 지어진 파스 나무가 걷혀 줄어든다.
 *
 * 토큰은 가로 자리(원문의 차례)를 지키고, 안쪽 노드는 자식들 한가운데 선다. 층은 깊이다.
 * 한 걸음에 노드 하나가 사라지면 그 아래 것이 빈자리로 한 층 올라오고, 괄호 잎은 아래
 * 원문 줄로 떨어져 나가며, 연산자 잎은 부모 자리로 올라가 그 노드가 된다.
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
import { countNodes, depthOf, ruleById, ruleText, tokensIn, type Token, type TreeNode } from './algorithm.js';
import type { TreeDropsSyntaxScene } from './scene.js';

const H = 470;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN_X = 48;
const CAPTION_Y = 24;
const CAPTION2_Y = 46;
const TREE_TOP = 82;
const TREE_BOTTOM = 372;
const LEVEL_GAP_MAX = 38;
const STRIP_Y = 414;
const COUNTER_Y = 452;
const NODE_H = 22;
const MOTION_MS = 400;
const FRAME_MS = 16;

const MONO_PX = parseFloat(fontSizes.md);
const RULE_PX = parseFloat(fontSizes.sm);
const CAPTION_PX = parseFloat(fontSizes.md);
const COUNTER_PX = parseFloat(fontSizes.sm);

type Pos = { x: number; y: number };

function round(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function columnX(tok: number, total: number): number {
  if (total <= 1) return PIECE_CANVAS_W / 2;
  return MARGIN_X + (tok * (PIECE_CANVAS_W - 2 * MARGIN_X)) / (total - 1);
}

/** 자리 셈 — 토큰 잎은 제 가로 자리, 자식이 있으면 자식들 한가운데. */
function layout(root: TreeNode, total: number, gap: number): Map<string, Pos> {
  const out = new Map<string, Pos>();
  const place = (n: TreeNode, depth: number): number => {
    let x: number;
    if (n.kids.length === 0) {
      if (n.tok === null) throw new Error(`tree-drops-syntax stage: 자식 없는 노드 ${n.id} 에 토큰이 없다`);
      x = columnX(n.tok, total);
    } else {
      const xs = n.kids.map((k) => place(k, depth + 1));
      x = xs.reduce((s, v) => s + v, 0) / xs.length;
    }
    out.set(n.id, { x, y: TREE_TOP + depth * gap });
    return x;
  };
  place(root, 0);
  return out;
}

function walkAll(n: TreeNode, visit: (node: TreeNode, parent: TreeNode | null) => void, parent: TreeNode | null = null): void {
  visit(n, parent);
  for (const k of n.kids) walkAll(k, visit, n);
}

function tokenOf(tokens: readonly Token[], i: number): Token {
  const t = tokens[i];
  if (t === undefined) throw new Error(`tree-drops-syntax stage: 없는 토큰 자리 ${i}`);
  return t;
}

export const treeDropsSyntaxStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    }

    function label(n: TreeNode, scene: TreeDropsSyntaxScene): string {
      if (n.tok !== null) return tokenOf(scene.tokens, n.tok).text;
      if (n.rule === null) throw new Error(`tree-drops-syntax stage: 노드 ${n.id} 에 규칙도 토큰도 없다`);
      return ruleById(scene.rules, n.rule).lhs;
    }

    function levelGap(scene: TreeDropsSyntaxScene): number {
      const depth = Math.max(depthOf(scene.tree), scene.step === null ? 1 : depthOf(scene.step.before));
      return depth <= 1 ? LEVEL_GAP_MAX : Math.min(LEVEL_GAP_MAX, (TREE_BOTTOM - TREE_TOP) / (depth - 1));
    }

    function drawNode(
      layer: Element,
      n: TreeNode,
      scene: TreeDropsSyntaxScene,
      p: Pos,
      opts: { opacity: number; scale: number; lit: boolean },
    ): void {
      const text = label(n, scene);
      const isToken = n.tok !== null;
      const px = isToken ? MONO_PX : RULE_PX;
      const w = Math.max(NODE_H + 4, text.length * px * 0.62 + 16) * opts.scale;
      const h = NODE_H * opts.scale;
      const g = el('g', {}, layer);
      if (opts.opacity < 1) g.setAttribute('opacity', String(round(opts.opacity * 100) / 100));
      const rect = el(
        'rect',
        {
          x: round(p.x - w / 2),
          y: round(p.y - h / 2),
          width: round(w),
          height: round(h),
          rx: isToken ? round(h / 2) : 4,
          fill: opts.lit ? c.accent : isToken ? c.bgSubtle : c.bg,
          stroke: isToken ? c.text : c.border,
          'stroke-width': isToken ? 1.4 : 1,
        },
        g,
      );
      if (!isToken) rect.setAttribute('stroke-dasharray', '3 3');
      const tx = el(
        'text',
        {
          x: round(p.x),
          y: round(p.y + px * 0.35 * opts.scale),
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': round(px * opts.scale),
          fill: opts.lit ? c.stateInk : isToken ? c.text : c.textMuted,
        },
        g,
      );
      tx.textContent = text;
    }

    function drawEdge(layer: Element, a: Pos, b: Pos, opacity: number): void {
      const line = el(
        'line',
        {
          x1: round(a.x),
          y1: round(a.y + NODE_H / 2),
          x2: round(b.x),
          y2: round(b.y - NODE_H / 2),
          stroke: c.textMuted,
          'stroke-width': 1.2,
        },
        layer,
      );
      if (opacity < 1) line.setAttribute('opacity', String(round(opacity * 100) / 100));
    }

    function captionFor(scene: TreeDropsSyntaxScene): string {
      const s = scene.step;
      if (s === null) {
        return t(
          'caption.start',
          'The parse tree as the parser built it — a node for every rule used, a leaf for every token.',
        );
      }
      const rule = ruleText(ruleById(scene.rules, s.rule));
      const risen = findNode(scene.tree, s.lift);
      if (s.kind === 'leaf') {
        if (risen.tok === null) throw new Error(`tree-drops-syntax stage: 오른 ${s.lift} 가 토큰이 아니다`);
        const tok = tokenOf(scene.tokens, risen.tok);
        return t('caption.leaf', '{rule} — the node goes, and its token rises into the empty place: {token}', {
          rule,
          token: `${tok.kind} ${tok.text}`,
        });
      }
      if (s.kind === 'pass') {
        return t('caption.pass', '{rule} — a node with a single child goes, and what stood below rises one level.', {
          rule,
        });
      }
      if (s.kind === 'paren') {
        return t('caption.paren', '{rule} — both parenthesis leaves fall away, and the middle rises into the place.', {
          rule,
        });
      }
      if (s.kind === 'op') {
        return t('caption.op', '{rule} — the operator leaf rises and becomes the node itself: {op}', {
          rule,
          op: label(risen, scene),
        });
      }
      throw new Error(`tree-drops-syntax stage: 모르는 규약 ${String(s.kind)}`);
    }

    function findNode(root: TreeNode, id: string): TreeNode {
      const look = (n: TreeNode): TreeNode | null => {
        if (n.id === id) return n;
        for (const k of n.kids) {
          const got = look(k);
          if (got !== null) return got;
        }
        return null;
      };
      const found = look(root);
      if (found === null) throw new Error(`tree-drops-syntax stage: 나무에 ${id} 가 없다`);
      return found;
    }

    function hasRuleNode(root: TreeNode): boolean {
      let any = false;
      walkAll(root, (n) => {
        if (n.rule !== null) any = true;
      });
      return any;
    }

    function drawChrome(scene: TreeDropsSyntaxScene, layer: Element): void {
      const cap = el(
        'text',
        { x: MARGIN_X - 24, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': CAPTION_PX, fill: c.text },
        layer,
      );
      cap.textContent = captionFor(scene);
      if (!hasRuleNode(scene.tree)) {
        const first = scene.tree.kids[0];
        if (first === undefined) throw new Error('tree-drops-syntax stage: 뿌리에 자식이 없다');
        const done = el(
          'text',
          {
            x: MARGIN_X - 24,
            y: CAPTION2_Y,
            'font-family': fonts.body,
            'font-size': CAPTION_PX,
            'font-weight': 600,
            fill: c.text,
          },
          layer,
        );
        done.textContent = t(
          'caption.done',
          'Dropped tokens: {dropped} · First child of {outer}: {inner}',
          { dropped: scene.dropped.length, outer: label(scene.tree, scene), inner: label(first, scene) },
        );
      }

      // 원문 줄 — 토큰 자리마다 그 글자. 버린 것은 흐리게.
      const total = scene.tokens.length;
      for (const [i, tok] of scene.tokens.entries()) {
        const x = columnX(i, total);
        const gone = scene.dropped.includes(i);
        const g = el(
          'text',
          {
            x: round(x),
            y: STRIP_Y,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': MONO_PX,
            fill: gone ? c.textMuted : c.text,
          },
          layer,
        );
        g.textContent = tok.text;
        // 버린 글자는 흐리게만 둔다 — 가로로 그으면 괄호가 + 처럼 읽힌다.
        if (gone) g.setAttribute('opacity', '0.3');
      }
      el(
        'line',
        {
          x1: MARGIN_X - 24,
          y1: STRIP_Y - MONO_PX - 8,
          x2: PIECE_CANVAS_W - MARGIN_X + 24,
          y2: STRIP_Y - MONO_PX - 8,
          stroke: c.border,
          'stroke-width': 1,
        },
        layer,
      );

      const kept = tokensIn(scene.tree).length;
      const parts = [
        t('label.nodes', 'Nodes: {n}', { n: countNodes(scene.tree) }),
        t('label.levels', 'Levels: {n}', { n: depthOf(scene.tree) }),
        t('label.kept', 'Tokens kept: {k} / {total}', { k: kept, total }),
      ];
      const slot = (PIECE_CANVAS_W - 2 * (MARGIN_X - 24)) / parts.length;
      for (const [i, s] of parts.entries()) {
        const tx = el(
          'text',
          {
            x: round(MARGIN_X - 24 + i * slot),
            y: COUNTER_Y,
            'font-family': fonts.body,
            'font-size': COUNTER_PX,
            fill: c.textMuted,
          },
          layer,
        );
        tx.textContent = s;
      }
    }

    /** 그 장면의 화면 전체. p 가 1 보다 작으면 이번 걸음의 운동 도중. */
    function draw(scene: TreeDropsSyntaxScene, p: number): void {
      svg.textContent = '';
      const total = scene.tokens.length;
      const gap = levelGap(scene);
      const next = layout(scene.tree, total, gap);
      const step = scene.step;
      const lit = step === null ? null : step.lift;
      const edges = el('g', {}, svg);
      const nodes = el('g', {}, svg);

      if (p >= 1 || step === null) {
        walkAll(scene.tree, (n, parent) => {
          const pos = next.get(n.id);
          if (pos === undefined) throw new Error(`tree-drops-syntax stage: ${n.id} 의 자리가 없다`);
          if (parent !== null) {
            const pp = next.get(parent.id);
            if (pp === undefined) throw new Error(`tree-drops-syntax stage: ${parent.id} 의 자리가 없다`);
            drawEdge(edges, pp, pos, 1);
          }
          drawNode(nodes, n, scene, pos, { opacity: 1, scale: 1, lit: n.id === lit });
        });
        drawChrome(scene, svg);
        return;
      }

      const e = ease(p);
      const before = layout(step.before, total, gap);
      const at = (id: string): Pos => {
        const b = before.get(id);
        const a = next.get(id);
        if (b !== undefined && a !== undefined) return { x: lerp(b.x, a.x, e), y: lerp(b.y, a.y, e) };
        if (a !== undefined) return a;
        if (b === undefined) throw new Error(`tree-drops-syntax stage: ${id} 의 자리가 없다`);
        const fallen = step.dropped.some((k) => `t${k}` === id);
        // 떨어져 나가는 괄호는 아래 원문 줄까지 내려간다. 사라지는 노드는 제자리에서 오그라든다.
        return fallen ? { x: b.x, y: lerp(b.y, STRIP_Y - MONO_PX, e) } : b;
      };

      // 앞 나무에만 있던 이음은 흐려지며 끊긴다.
      const nextEdges = new Set<string>();
      walkAll(scene.tree, (n, parent) => {
        if (parent !== null) nextEdges.add(`${parent.id}>${n.id}`);
      });
      walkAll(step.before, (n, parent) => {
        if (parent !== null && !nextEdges.has(`${parent.id}>${n.id}`)) drawEdge(edges, at(parent.id), at(n.id), 1 - e);
      });
      walkAll(scene.tree, (n, parent) => {
        if (parent !== null) drawEdge(edges, at(parent.id), at(n.id), 1);
      });

      walkAll(step.before, (n) => {
        if (next.has(n.id)) return;
        const fallen = n.tok !== null && step.dropped.includes(n.tok);
        drawNode(nodes, n, scene, at(n.id), {
          opacity: 1 - e,
          scale: fallen ? 1 : 1 - 0.5 * e,
          lit: false,
        });
      });
      walkAll(scene.tree, (n) => {
        drawNode(nodes, n, scene, at(n.id), { opacity: 1, scale: 1, lit: n.id === lit });
      });
      drawChrome(scene, svg);
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

    async function render(next: TreeDropsSyntaxScene, _prev: TreeDropsSyntaxScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      if (!opts.animate || next.step === null) {
        draw(next, 1);
        return;
      }
      const frames = Math.ceil(MOTION_MS / FRAME_MS);
      for (let i = 0; i < frames; i += 1) {
        if (mine !== gen || destroyed) return;
        draw(next, i / frames);
        await wait(FRAME_MS);
      }
      if (mine !== gen || destroyed) return;
      draw(next, 1);
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
