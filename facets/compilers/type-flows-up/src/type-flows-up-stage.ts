/**
 * type-flows-up 의 그림.
 *
 * 맨 아래에 줄 셋이 나란히 놓이고, 식의 연산마다 그 연산자 글자 위로 노드가 서서 나무가 위로 자란다
 * (높이 = 그 노드 아래 연산의 겹 수). 맨 위 띠가 이름 표다.
 * 타입 조각은 잎의 글자 바로 위에서 정해지고, 연산을 지날 때마다 두 아이의 조각이 가지를 타고 올라가
 * 부모 자리에서 하나로 합쳐진다. 뿌리의 조각은 이름 표까지 올라가 이름에 붙는다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import { layoutLine, TYPE_NAMES, type LineLayout, type Step, type TypeFlowsUpScene, type TypeName } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 16;
const BAND_TOP = 30;
const BAND_H = 28;
const SLOT_Y = BAND_TOP + BAND_H / 2;
const CODE_Y = 318;
const LINE_LABEL_Y = 338;
const CAPTION_Y = 366;
const CAPTION2_Y = 386;
const LEAF_CHIP_Y = CODE_Y - 26;
const ROOT_CHIP_MIN = 96;
const CHIP_H = 18;
const OP_BOX_H = 20;
const OP_CHIP_ABOVE = 20;
const LEVEL_MAX = 64;
const LINE_GAP_MIN = 24;
const LINE_GAP_MAX = 72;
/** 고정폭 글꼴의 글자 폭 / 글자 크기 */
const MONO_RATIO = 0.6;

const LEAF_RISE_MS = 300;
const MERGE_MS = 400;
const BIND_MS = 400;

type Geometry = {
  layouts: LineLayout[];
  lineX: number[];
  charW: number;
  codePx: number;
  level: number;
};

type Pt = { x: number; y: number };

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return out === 0 ? 0 : out;
}

function geometry(scene: TypeFlowsUpScene): Geometry {
  const layouts = scene.lines.map((line, i) => layoutLine(line, i));
  const n = layouts.length;
  const total = layouts.reduce((s, l) => s + l.width, 0);
  const inner = PIECE_CANVAS_W - 2 * MARGIN;
  const mdPx = parseFloat(fontSizes.md);
  const charW = total > 0 ? Math.min(mdPx * MONO_RATIO, (inner - Math.max(0, n - 1) * LINE_GAP_MIN) / total) : mdPx * MONO_RATIO;
  const gap = n > 1 ? Math.min(LINE_GAP_MAX, (inner - total * charW) / (n - 1)) : 0;
  const used = total * charW + Math.max(0, n - 1) * gap;
  let x = MARGIN + (inner - used) / 2;
  const lineX: number[] = [];
  for (const l of layouts) {
    lineX.push(x);
    x += l.width * charW + gap;
  }
  const maxH = layouts.reduce((m, l) => Math.max(m, ...l.nodes.map((nd) => nd.height)), 0);
  const level = maxH > 0 ? Math.min(LEVEL_MAX, (LEAF_CHIP_Y - OP_CHIP_ABOVE - ROOT_CHIP_MIN) / maxH) : LEVEL_MAX;
  return { layouts, lineX, charW, codePx: charW / MONO_RATIO, level };
}

function nodeX(g: Geometry, line: number, node: number): number {
  const nd = g.layouts[line]?.nodes[node];
  const x0 = g.lineX[line];
  if (nd === undefined || x0 === undefined) throw new Error(`type-flows-up: L${line + 1} 노드 ${node} 가 없다`);
  return x0 + nd.col * g.charW;
}

function opBoxY(g: Geometry, height: number): number {
  return LEAF_CHIP_Y - height * g.level;
}

function chipPt(g: Geometry, line: number, node: number): Pt {
  const nd = g.layouts[line]?.nodes[node];
  if (nd === undefined) throw new Error(`type-flows-up: L${line + 1} 노드 ${node} 가 없다`);
  const y = nd.leaf ? LEAF_CHIP_Y : opBoxY(g, nd.height) - OP_CHIP_ABOVE;
  return { x: nodeX(g, line, node), y };
}

function chipW(type: string): number {
  return type.length * parseFloat(fontSizes.xs) * MONO_RATIO + 14;
}

function slotBox(g: Geometry, line: number, name: string, type: string): { x: number; w: number; nameX: number; chipX: number } {
  const layout = g.layouts[line];
  if (layout === undefined) throw new Error(`type-flows-up: L${line + 1} 줄이 없다`);
  const nameW = name.length * parseFloat(fontSizes.sm) * MONO_RATIO;
  const cw = chipW(type);
  const w = nameW + cw + 22;
  const cx = nodeX(g, line, layout.root);
  const x = Math.min(PIECE_CANVAS_W - MARGIN - w, Math.max(MARGIN, cx - w / 2));
  return { x, w, nameX: x + 8, chipX: x + 8 + nameW + 6 + cw / 2 };
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const typeFlowsUpStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const typeColors = categorical(TYPE_NAMES.length, 'vivid');

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 정적 그리기가 남기는 손잡이 — 운동이 숨기고 흘릴 자리. 그릴 때마다 새로 만든다. */
    let chipEls = new Map<string, SVGGElement>();
    let slotEls = new Map<number, SVGGElement>();
    let layer: SVGGElement | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(parent: Element, x: number, y: number, text: string, attrs: Record<string, string | number>): SVGTextElement {
      const node = el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text, ...attrs }, parent);
      node.textContent = text;
      return node;
    }

    function typeColor(type: TypeName): string {
      const col = typeColors[TYPE_NAMES.indexOf(type)];
      if (col === undefined) throw new Error(`type-flows-up: 색이 없는 타입 ${type}`);
      return col;
    }

    function chip(parent: Element, at: Pt, type: TypeName): SVGGElement {
      const w = chipW(type);
      const g = el('g', { transform: `translate(${r1(at.x)} ${r1(at.y)})` }, parent);
      el('rect', { x: -w / 2, y: -CHIP_H / 2, width: w, height: CHIP_H, rx: CHIP_H / 2, fill: typeColor(type) }, g);
      label(g, 0, 0, type, {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        'font-weight': 600,
        fill: c.stateInk,
      });
      return g;
    }

    function ring(parent: Element, at: Pt, type: TypeName): void {
      const w = chipW(type) + 8;
      el(
        'rect',
        { x: at.x - w / 2, y: at.y - CHIP_H / 2 - 4, width: w, height: CHIP_H + 8, rx: (CHIP_H + 8) / 2, fill: 'none', stroke: c.accent, 'stroke-width': 2 },
        parent,
      );
    }

    function caption(scene: TypeFlowsUpScene, g: Geometry): [string, string] {
      const step = scene.step;
      const done = scene.lines.length > 0 && scene.names.length === scene.lines.length;
      const second = done ? t('caption.done', 'Inference done. Typed names: {n}.', { n: scene.names.length }) : '';
      if (step === null) return [t('caption.start', 'No type is written. No type is known yet.'), second];
      if (step.kind === 'leaf') {
        const nd = g.layouts[step.line]?.nodes[step.node];
        if (nd === undefined) throw new Error('type-flows-up: 잎 노드가 없다');
        if (step.source === 'literal') {
          return [t('caption.literal', 'Literal {text}: type {type}.', { text: nd.label, type: step.type }), second];
        }
        return [
          t('caption.name', 'Name {name}: type {type}, from the names row (L{line}).', { name: step.name, type: step.type, line: step.from + 1 }),
          second,
        ];
      }
      if (step.kind === 'op') {
        const nd = g.layouts[step.line]?.nodes[step.node];
        if (nd === undefined) throw new Error('type-flows-up: 연산 노드가 없다');
        const vars = { l: step.l, op: nd.label, r: step.r, type: step.type };
        if (step.change === 'keep') return [t('caption.keep', 'Rule {l} {op} {r} → {type}: the type rises unchanged.', vars), second];
        if (step.change === 'widen') {
          const from = step.widened;
          if (from === null) throw new Error('type-flows-up: 넓혀진 쪽이 없다');
          return [t('caption.widen', 'Rule {l} {op} {r} → {type}: {from} widens on the way up.', { ...vars, from }), second];
        }
        if (step.change === 'turn') return [t('caption.turn', 'Rule {l} {op} {r} → {type}: a type neither side had.', vars), second];
        return [t('caption.concat', 'Rule {l} {op} {r} → {type}: joined as text.', vars), second];
      }
      return [t('caption.bind', 'The root type rises to the name: {name} → {type}.', { name: step.name, type: step.type }), second];
    }

    function drawStatic(scene: TypeFlowsUpScene): Geometry {
      svg.textContent = '';
      chipEls = new Map();
      slotEls = new Map();
      const root = el('g', {}, svg);
      layer = root;
      const g = geometry(scene);
      const step = scene.step;

      label(root, MARGIN, 18, t('label.names', 'Names'), { 'font-size': fontSizes.xs, fill: c.textMuted });
      el('rect', { x: MARGIN, y: BAND_TOP, width: PIECE_CANVAS_W - 2 * MARGIN, height: BAND_H, rx: 4, fill: c.bgSubtle, stroke: c.border }, root);

      for (const entry of scene.names) {
        const box = slotBox(g, entry.line, entry.name, entry.type);
        const slot = el('g', {}, root);
        const focus = step !== null && ((step.kind === 'bind' && step.line === entry.line) || (step.kind === 'leaf' && step.source === 'name' && step.from === entry.line));
        el(
          'rect',
          { x: box.x, y: BAND_TOP + 3, width: box.w, height: BAND_H - 6, rx: 4, fill: c.bg, stroke: focus ? c.accent : c.border, 'stroke-width': focus ? 2 : 1 },
          slot,
        );
        label(slot, box.nameX, SLOT_Y, entry.name, { 'dominant-baseline': 'central', 'font-family': fonts.mono });
        chip(slot, { x: box.chipX, y: SLOT_Y }, entry.type);
        slotEls.set(entry.line, slot);
      }

      g.layouts.forEach((layout, li) => {
        const x0 = g.lineX[li];
        if (x0 === undefined) throw new Error('type-flows-up: 줄 자리가 없다');
        const types = scene.nodeTypes[li];
        if (types === undefined) throw new Error('type-flows-up: 줄의 타입 자취가 없다');

        // 가지 — 부모 노드 상자의 아래에서 아이의 타입 자리 위로
        layout.nodes.forEach((nd, ni) => {
          if (nd.leaf) return;
          const top = { x: nodeX(g, li, ni), y: opBoxY(g, nd.height) + OP_BOX_H / 2 };
          for (const kid of nd.kids) {
            const at = chipPt(g, li, kid);
            el('line', { x1: top.x, y1: top.y, x2: at.x, y2: at.y - CHIP_H / 2 - 2, stroke: c.border, 'stroke-width': 1.5 }, root);
          }
        });

        // 연산 노드 상자
        layout.nodes.forEach((nd, ni) => {
          if (nd.leaf) return;
          const x = nodeX(g, li, ni);
          const y = opBoxY(g, nd.height);
          const w = Math.max(24, nd.label.length * g.charW + 12);
          el('rect', { x: x - w / 2, y: y - OP_BOX_H / 2, width: w, height: OP_BOX_H, rx: 4, fill: c.bg, stroke: c.textMuted }, root);
          label(root, x, y, nd.label, { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': fonts.mono });
        });

        // 줄 글자
        for (const tok of layout.tokens) {
          const muted = tok.role === 'kw' || tok.role === 'punct';
          label(root, x0 + tok.col * g.charW, CODE_Y, tok.text, {
            'font-family': fonts.mono,
            'font-size': `${r1(g.codePx)}px`,
            fill: muted ? c.textMuted : c.text,
          });
        }
        label(root, x0, LINE_LABEL_Y, `L${li + 1}`, { 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted });

        // 정해진 타입
        types.forEach((type, ni) => {
          if (type === null) return;
          const at = chipPt(g, li, ni);
          if (step !== null && step.kind !== 'bind' && step.line === li && step.node === ni) ring(root, at, type);
          chipEls.set(`${li}:${ni}`, chip(root, at, type));
        });
      });

      // 이름 잎이 읽은 자리 — 이름 표의 칸에서 그 잎까지
      if (step !== null && step.kind === 'leaf' && step.source === 'name') {
        const entry = scene.names.find((e) => e.line === step.from);
        if (entry === undefined) throw new Error(`type-flows-up: 이름 표에 없는 ${step.name}`);
        const box = slotBox(g, entry.line, entry.name, entry.type);
        const at = chipPt(g, step.line, step.node);
        el(
          'path',
          {
            d: `M ${r1(box.chipX)} ${r1(BAND_TOP + BAND_H)} C ${r1(box.chipX)} ${r1(at.y - 80)} ${r1(at.x)} ${r1(at.y - 80)} ${r1(at.x)} ${r1(at.y - CHIP_H / 2 - 5)}`,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          },
          root,
        );
      }

      const [first, second] = caption(scene, g);
      label(root, MARGIN, CAPTION_Y, first, { 'font-size': fontSizes.md });
      if (second !== '') label(root, MARGIN, CAPTION2_Y, second, { 'font-size': fontSizes.sm, fill: c.textMuted });
      return g;
    }

    /** 한 시계로 p(0→1) 를 흘린다. 거둬지면 곧바로 풀린다. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = performance.now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (performance.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function moveTo(node: SVGGElement, at: Pt): void {
      node.setAttribute('transform', `translate(${r1(at.x)} ${r1(at.y)})`);
    }

    async function animateStep(scene: TypeFlowsUpScene, step: Step, g: Geometry, mine: number): Promise<void> {
      const host = layer;
      if (host === null) return;
      if (step.kind === 'leaf') {
        const target = chipEls.get(`${step.line}:${step.node}`);
        if (target === undefined) return;
        const end = chipPt(g, step.line, step.node);
        const rise = CODE_Y - 6 - end.y;
        moveTo(target, { x: end.x, y: end.y + rise });
        await tween(LEAF_RISE_MS, mine, (p) => moveTo(target, { x: end.x, y: end.y + rise * (1 - p) }));
        return;
      }
      if (step.kind === 'op') {
        const target = chipEls.get(`${step.line}:${step.node}`);
        const nd = g.layouts[step.line]?.nodes[step.node];
        const types = scene.nodeTypes[step.line];
        if (target === undefined || nd === undefined || types === undefined) return;
        const end = chipPt(g, step.line, step.node);
        target.setAttribute('opacity', '0');
        const ghosts = nd.kids.map((kid) => {
          const type = types[kid];
          if (type === undefined || type === null) throw new Error('type-flows-up: 아이의 타입이 아직 없다');
          const from = chipPt(g, step.line, kid);
          return { from, node: chip(host, from, type) };
        });
        await tween(MERGE_MS, mine, (p) => {
          for (const gh of ghosts) moveTo(gh.node, { x: gh.from.x + (end.x - gh.from.x) * p, y: gh.from.y + (end.y - gh.from.y) * p });
        });
        return;
      }
      const slot = slotEls.get(step.line);
      const layout = g.layouts[step.line];
      if (slot === undefined || layout === undefined) return;
      const from = chipPt(g, step.line, layout.root);
      const box = slotBox(g, step.line, step.name, step.type);
      const end = { x: box.chipX, y: SLOT_Y };
      slot.setAttribute('opacity', '0');
      const ghost = chip(host, from, step.type);
      await tween(BIND_MS, mine, (p) => moveTo(ghost, { x: from.x + (end.x - from.x) * p, y: from.y + (end.y - from.y) * p }));
    }

    return {
      async render(next: TypeFlowsUpScene, _prev: TypeFlowsUpScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const g = drawStatic(next);
        if (!opts.animate || next.step === null) return;
        await animateStep(next, next.step, g, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
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
