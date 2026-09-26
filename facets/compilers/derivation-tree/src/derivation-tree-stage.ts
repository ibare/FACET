/**
 * derivation-tree stage — 펼친 기호 아래로 몸이 매달린다.
 *
 * 노드의 가로 자리는 그 노드가 끝내 덮는 토큰 자리의 가운데 (알고리즘이 준 from · to),
 * 세로 자리는 층. 그래서 한 번 놓인 노드는 끝까지 움직이지 않고, 왼쪽 재귀가 만든
 * `Expr` 사슬은 저절로 왼쪽 아래로 뻗는다. 새로 매단 자식은 부모 자리에서 떨어져
 * 제 자리로 내려온다. 끝 걸음에는 잎의 복제본이 토큰 줄 위로 떨어져 짝을 짓는다.
 */
import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { ruleText } from './algorithm.js';
import type { DerivationTreeScene, TreeNode } from './scene.js';

const H = 520;
const NS = 'http://www.w3.org/2000/svg';
const PAD_L = 64;
const PAD_R = 12;
const TREE_TOP = 100;
const LEVEL_GAP_MAX = 58;
const COL_MAX = 84;
const BOX_H = 22;
const HANG_MS = 380;
const DROP_MS = 400;
const DROP_EACH_MS = 220;
const FRAME_MS = 16;

function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r);
}

type Layout = {
  colW: number;
  gridL: number;
  gap: number;
  readY: number;
  kindY: number;
  textY: number;
  captionY: number;
  charW: number;
};

function layoutOf(scene: DerivationTreeScene): Layout {
  const n = Math.max(1, scene.tokens.length);
  const inner = PIECE_CANVAS_W - PAD_L - PAD_R;
  const colW = Math.min(COL_MAX, inner / n);
  const gridL = PAD_L + (inner - colW * n) / 2;
  const readY = H - 110;
  const deepest = scene.nodes.reduce((m, nd) => Math.max(m, nd.depth), 1);
  const levels = Math.max(scene.levels, deepest);
  const room = readY - 44 - TREE_TOP;
  const gap = levels > 1 ? Math.min(LEVEL_GAP_MAX, room / (levels - 1)) : LEVEL_GAP_MAX;
  return {
    colW,
    gridL,
    gap,
    readY,
    kindY: H - 84,
    textY: H - 66,
    captionY: H - 24,
    charW: parseFloat(fontSizes.sm) * 0.6,
  };
}

const nodeX = (L: Layout, nd: TreeNode): number => L.gridL + (L.colW * (nd.from + nd.to)) / 2;
const nodeY = (L: Layout, nd: TreeNode): number => TREE_TOP + (nd.depth - 1) * L.gap;

type Handle = { g: SVGGElement; edge: SVGLineElement | null; x: number; y: number; px: number; py: number };

export const derivationTreeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const root = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function svg<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      body?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      if (body !== undefined) node.textContent = body;
      parent.appendChild(node);
      return node;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    /** 한 시계로 0→1 을 흘린다. 세대가 바뀌면 멈춘다. */
    async function flow(ms: number, mine: number, frame: (elapsed: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
      for (let i = 1; i <= frames; i += 1) {
        if (mine !== gen || destroyed) return false;
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return false;
        frame((ms * i) / frames);
      }
      return true;
    }

    function drawStatic(scene: DerivationTreeScene): Map<number, Handle> {
      root.textContent = '';
      const L = layoutOf(scene);
      const handles = new Map<number, Handle>();
      const step = scene.step;
      const freshKids = new Set(step.kind === 'hang' ? step.kids : []);
      const activeParent = step.kind === 'hang' ? step.parent : null;
      const activeRule = step.kind === 'hang' ? step.rule : null;
      const byId = new Map(scene.nodes.map((nd) => [nd.id, nd]));

      // 문법 — 왼쪽 위. 이번 걸음에 쓴 규칙 한 줄을 밝힌다.
      const lineH = parseFloat(fontSizes.sm) + 4;
      scene.rules.forEach((rule, i) => {
        const y = 20 + i * lineH;
        const on = rule.id === activeRule;
        if (on) {
          const w = (rule.id.length + 2 + ruleText(rule).length) * L.charW + 10;
          svg(root, 'rect', { x: 6, y: y - lineH + 4, width: w, height: lineH, rx: 3, fill: colors.accent });
        }
        svg(root, 'text', { x: 11, y, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: on ? colors.stateInk : colors.textMuted }, rule.id);
        svg(
          root,
          'text',
          { x: 11 + (rule.id.length + 2) * L.charW, y, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: on ? colors.stateInk : colors.text },
          ruleText(rule),
        );
      });

      // 원문 — 오른쪽 위
      svg(
        root,
        'text',
        { x: PIECE_CANVAS_W - PAD_R, y: 20, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text },
        scene.source,
      );

      // 가지 — 노드보다 먼저 깐다
      const edges = svg(root, 'g', {});
      const boxes = svg(root, 'g', {});
      for (const nd of scene.nodes) {
        const x = nodeX(L, nd);
        const y = nodeY(L, nd);
        let edge: SVGLineElement | null = null;
        let px = x;
        let py = y;
        if (nd.parent !== null) {
          const parent = byId.get(nd.parent);
          if (parent === undefined) throw new Error(`derivation-tree stage: 없는 부모 ${nd.parent}`);
          px = nodeX(L, parent);
          py = nodeY(L, parent);
          const fresh = freshKids.has(nd.id);
          edge = svg(edges, 'line', {
            x1: px,
            y1: py + BOX_H / 2,
            x2: x,
            y2: y - BOX_H / 2,
            stroke: fresh ? colors.primary : colors.textMuted,
            'stroke-width': fresh ? 1.8 : 1,
          });
        }
        const g = svg(boxes, 'g', {});
        const w = nd.sym.length * L.charW + 14;
        const isActive = nd.id === activeParent;
        if (!nd.terminal) {
          const expanded = nd.rule !== null;
          svg(g, 'rect', {
            x: x - w / 2,
            y: y - BOX_H / 2,
            width: w,
            height: BOX_H,
            rx: 4,
            fill: isActive ? colors.accent : expanded ? colors.bgSubtle : colors.bg,
            stroke: isActive ? colors.accent : expanded ? colors.border : colors.textMuted,
            'stroke-width': 1.2,
            ...(expanded || isActive ? {} : { 'stroke-dasharray': '3 3' }),
          });
        }
        svg(
          g,
          'text',
          {
            x,
            y: y + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': nd.terminal ? 'bold' : 'normal',
            fill: isActive ? colors.stateInk : colors.text,
          },
          nd.sym,
        );
        handles.set(nd.id, { g, edge, x, y, px, py });
      }

      // 잎 읽기 — 잎의 복제본이 토큰 줄 위 칸에 내려앉아 있다
      if (scene.pairs.length > 0) {
        svg(root, 'text', { x: 8, y: L.readY + 4, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, t('label.leaves', 'Leaves'));
        const drops = svg(root, 'g', {});
        for (const pair of scene.pairs) {
          const leaf = byId.get(pair.node);
          if (leaf === undefined) throw new Error(`derivation-tree stage: 없는 잎 ${pair.node}`);
          const x = L.gridL + L.colW * (pair.token + 0.5);
          const ly = nodeY(L, leaf);
          const line = svg(drops, 'line', {
            x1: x,
            y1: ly + 8,
            x2: x,
            y2: L.readY - BOX_H / 2,
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '2 3',
          });
          const g = svg(drops, 'g', {});
          const w = Math.min(L.colW - 6, leaf.sym.length * L.charW + 14);
          svg(g, 'rect', { x: x - w / 2, y: L.readY - BOX_H / 2, width: w, height: BOX_H, rx: 4, fill: colors.accent });
          svg(
            g,
            'text',
            { x, y: L.readY + 4, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 'bold', fill: colors.stateInk },
            leaf.sym,
          );
          handles.set(-1 - pair.token, { g, edge: line, x, y: L.readY, px: x, py: ly });
        }
      }

      // 토큰 줄 — 바닥
      svg(root, 'line', { x1: PAD_L - 4, y1: L.kindY - 16, x2: PIECE_CANVAS_W - PAD_R, y2: L.kindY - 16, stroke: colors.border, 'stroke-width': 1 });
      svg(root, 'text', { x: 8, y: L.textY, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, t('label.tokens', 'Tokens'));
      scene.tokens.forEach((tk, i) => {
        const x = L.gridL + L.colW * (i + 0.5);
        svg(root, 'text', { x, y: L.kindY, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted }, tk.kind);
        svg(root, 'text', { x, y: L.textY, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text }, tk.text);
      });

      // 캡션 — 지금 일어나는 일만
      let caption: string;
      let meter: string;
      if (step.kind === 'start') {
        const top = byId.get(0);
        if (top === undefined) throw new Error('derivation-tree stage: 뿌리가 없다');
        caption = t('caption.start', 'Start symbol: {sym}', { sym: top.sym });
        meter = t('meter.nodes', 'Nodes: {n}', { n: scene.nodes.length });
      } else if (step.kind === 'hang') {
        const parent = byId.get(step.parent);
        if (parent === undefined) throw new Error(`derivation-tree stage: 없는 부모 ${step.parent}`);
        caption = t('caption.hang', 'Rule {rule}: hang its body under {sym}', { rule: step.rule, sym: parent.sym });
        meter = t('meter.nodes', 'Nodes: {n}', { n: scene.nodes.length });
      } else {
        const leaves = scene.pairs.map((pair) => {
          const leaf = byId.get(pair.node);
          if (leaf === undefined) throw new Error(`derivation-tree stage: 없는 잎 ${pair.node}`);
          return leaf.sym;
        });
        caption = t('caption.read', 'Leaves, left to right: {leaves}', { leaves: leaves.join(' ') });
        meter = t('meter.matched', 'Tokens matched: {n} / {m}', { n: step.matched, m: scene.tokens.length });
      }
      svg(root, 'text', { x: 12, y: L.captionY, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text }, caption);
      svg(
        root,
        'text',
        { x: PIECE_CANVAS_W - PAD_R, y: L.captionY, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted },
        meter,
      );
      return handles;
    }

    const ease = (p: number): number => 1 - (1 - p) * (1 - p) * (1 - p);

    /** 새 자식이 부모 자리에서 떨어져 제 자리로 내려온다. 아직 못 온 만큼 위로 당겨 그린다. */
    function placeHang(handles: Map<number, Handle>, kids: readonly number[], p: number): void {
      const q = 1 - ease(p);
      for (const id of kids) {
        const h = handles.get(id);
        if (h === undefined) throw new Error(`derivation-tree stage: 매단 자식 ${id} 가 그려지지 않았다`);
        const dx = (h.px - h.x) * q;
        const dy = (h.py - h.y) * q;
        h.g.setAttribute('transform', `translate(${num(dx)} ${num(dy)})`);
        if (h.edge !== null) {
          h.edge.setAttribute('x2', num(h.x + dx));
          h.edge.setAttribute('y2', num(h.y - BOX_H / 2 + dy));
        }
      }
    }

    /** 잎의 복제본이 왼쪽부터 차례로 떨어진다. */
    function placeDrop(handles: Map<number, Handle>, count: number, elapsed: number): void {
      const lag = count > 1 ? (DROP_MS - DROP_EACH_MS) / (count - 1) : 0;
      for (let i = 0; i < count; i += 1) {
        const h = handles.get(-1 - i);
        if (h === undefined) throw new Error(`derivation-tree stage: 잎 복제 #${i} 가 그려지지 않았다`);
        const p = Math.min(1, Math.max(0, (elapsed - i * lag) / DROP_EACH_MS));
        const dy = (h.py - h.y) * (1 - ease(p));
        h.g.setAttribute('transform', `translate(0 ${num(dy)})`);
        if (h.edge !== null) h.edge.setAttribute('y2', num(h.y - BOX_H / 2 + dy));
      }
    }

    async function render(next: DerivationTreeScene, prev: DerivationTreeScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      if (!opts.animate || prev === null) return;
      const step = next.step;
      if (step.kind === 'hang') {
        placeHang(handles, step.kids, 0);
        const done = await flow(HANG_MS, mine, (ms) => placeHang(handles, step.kids, ms / HANG_MS));
        if (!done) return;
      } else if (step.kind === 'read') {
        const count = next.pairs.length;
        placeDrop(handles, count, 0);
        const done = await flow(DROP_MS, mine, (ms) => placeDrop(handles, count, ms));
        if (!done) return;
      } else {
        return;
      }
      if (mine === gen && !destroyed) drawStatic(next);
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
        root.textContent = '';
      },
    };
  },
};
