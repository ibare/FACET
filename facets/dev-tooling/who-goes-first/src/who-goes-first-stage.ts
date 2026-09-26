/**
 * who-goes-first 의 그림.
 *
 * 규칙 그래프를 요청한 대상에서의 거리로 층을 나눠 세운다 (층 셈은 알고리즘의 graphLayers).
 * 요구는 굵은 화살로 그 길을 따라 **내려가고**, 대상이 서면 화살이 제 윗대상으로 **거둬져
 * 올라가며** 세운 대상이 아래 "세운 차례" 칸으로 옮겨 간다. 이미 선 대상에 닿은 요구는
 * 내려갔다가 곧바로 돌아온다.
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
import { graphLayers } from './algorithm.js';
import type { WhoGoesFirstSceneState } from './scene.js';

const H = 360;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const ROW_TOP = 46; // 첫 층 가운데
const ROW_BOTTOM = 232; // 마지막 층 가운데의 상한
const ROW_GAP_MAX = 72;
const NODE_H = 28;
const NODE_W_MAX = 104;
const STUB_TOP = 4; // 요청이 들어오는 자리
const ORDER_LABEL_Y = 274;
const SLOT_Y = 298;
const SLOT_H = 28;
const CAPTION_Y = 342;
const MARGIN = 12;

const MOVE_MS = 520;
const BOUNCE_MS = 760;

type Pt = { x: number; y: number };

function r(n: number): number {
  const v = Math.round(n * 10) / 10;
  return v === 0 ? 0 : v;
}

function lerp(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  attrs: Record<string, string | number>,
): SVGElement {
  const node = el(
    'text',
    { x: r(x), y: r(y), 'dominant-baseline': 'central', 'text-anchor': 'middle', ...attrs },
    parent,
  );
  node.textContent = text;
  return node;
}

/** tip 을 끝으로 하고 from → tip 방향을 가리키는 화살촉. */
function headPoints(from: Pt, tip: Pt): string {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const len = Math.hypot(dx, dy);
  const ux = len > 0 ? dx / len : 0;
  const uy = len > 0 ? dy / len : 1;
  const bx = tip.x - ux * 9;
  const by = tip.y - uy * 9;
  const px = -uy * 5;
  const py = ux * 5;
  return `${r(tip.x)},${r(tip.y)} ${r(bx + px)},${r(by + py)} ${r(bx - px)},${r(by - py)}`;
}

/** a → b 방향을 가리키며 tip 에 앉는 화살촉 (선이 짧아져도 방향이 흔들리지 않게). */
function headAlong(a: Pt, b: Pt, tip: Pt): string {
  return headPoints({ x: tip.x - (b.x - a.x), y: tip.y - (b.y - a.y) }, tip);
}

type Layout = {
  pos: Map<string, Pt>;
  nodeW: number;
  slots: Pt[];
  slotW: number;
};

function layoutOf(scene: WhoGoesFirstSceneState): Layout | null {
  if (scene.goal === '' || scene.rules.length === 0) return null;
  const layers = graphLayers(scene.rules, scene.sources, scene.goal);
  const gap = layers.length > 1 ? Math.min(ROW_GAP_MAX, (ROW_BOTTOM - ROW_TOP) / (layers.length - 1)) : 0;
  const widest = Math.max(1, ...layers.map((row) => row.length));
  const nodeW = Math.min(NODE_W_MAX, W / widest - 24);
  const pos = new Map<string, Pt>();
  layers.forEach((row, lv) => {
    row.forEach((name, i) => {
      pos.set(name, { x: (W * (i + 0.5)) / row.length, y: ROW_TOP + lv * gap });
    });
  });
  const targets = layers.flat().filter((name) => !scene.sources.includes(name));
  const span = (W - 2 * MARGIN) / Math.max(1, targets.length);
  const slotW = Math.min(NODE_W_MAX + 16, span - 14);
  const slots = targets.map((_, i) => ({ x: MARGIN + span * (i + 0.5), y: SLOT_Y }));
  return { pos, nodeW, slots, slotW };
}

function posOf(layout: Layout, name: string): Pt {
  const p = layout.pos.get(name);
  if (p === undefined) throw new Error(`who-goes-first: ${name} 의 자리가 없다`);
  return p;
}

/** 요구가 윗대상(없으면 요청 자리)에서 name 으로 내려가는 선의 시작과 끝. */
function descentOf(layout: Layout, from: string | null, name: string): { a: Pt; b: Pt } {
  const to = posOf(layout, name);
  const b = { x: to.x, y: to.y - NODE_H / 2 };
  if (from === null) return { a: { x: to.x, y: STUB_TOP }, b };
  const f = posOf(layout, from);
  return { a: { x: f.x, y: f.y + NODE_H / 2 }, b };
}

type Handles = {
  pathLines: Map<string, { line: SVGElement; head: SVGElement; a: Pt; b: Pt }>;
  slotChips: SVGElement[];
  motion: SVGElement;
};

export const whoGoesFirstStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function captionOf(scene: WhoGoesFirstSceneState): string {
      const step = scene.step;
      if (step === null) return t('caption.start', 'Requested: {name}', { name: scene.goal });
      if (step.kind === 'descend') {
        const rule = scene.rules.find((x) => x.target === step.target);
        if (rule === undefined) throw new Error(`who-goes-first: ${step.target} 의 규칙이 없다`);
        return t('caption.descend', 'Waiting: {name} ← {inputs}', {
          name: step.target,
          inputs: rule.inputs.join(' · '),
        });
      }
      if (step.kind === 'build') {
        return t('caption.build', 'Built: {name} · order {n}', { name: step.target, n: step.order });
      }
      return t('caption.already', 'Already built: {name} — not built again', { name: step.target });
    }

    function drawArrow(parent: Element, a: Pt, tip: Pt, color: string, width: number): { line: SVGElement; head: SVGElement } {
      const line = el(
        'line',
        { x1: r(a.x), y1: r(a.y), x2: r(tip.x), y2: r(tip.y), stroke: color, 'stroke-width': width },
        parent,
      );
      const head = el('polygon', { points: headPoints(a, tip), fill: color }, parent);
      return { line, head };
    }

    function drawStatic(scene: WhoGoesFirstSceneState): Handles | null {
      svg.textContent = '';
      const layout = layoutOf(scene);
      if (layout === null) return null;
      const { pos, nodeW } = layout;
      const bodySize = parseFloat(fontSizes.sm);

      // 규칙의 화살 — 대상이 제 입력을 가리킨다
      const edges = el('g', {}, svg);
      for (const rule of scene.rules) {
        if (!pos.has(rule.target)) continue; // 요청한 대상에서 닿지 않는 규칙은 그리지 않는다
        for (const input of rule.inputs) {
          const { a, b } = descentOf(layout, rule.target, input);
          drawArrow(edges, a, b, pal.border, 1.5);
        }
      }

      // 요구가 내려간 길 — 기다리는 줄
      const pathLayer = el('g', {}, svg);
      const pathLines = new Map<string, { line: SVGElement; head: SVGElement; a: Pt; b: Pt }>();
      scene.path.forEach((name, i) => {
        const from = i === 0 ? null : (scene.path[i - 1] ?? null);
        const { a, b } = descentOf(layout, from, name);
        const arrow = drawArrow(pathLayer, a, b, pal.itemComparing, 3);
        pathLines.set(name, { ...arrow, a, b });
      });

      // 이름들
      const nodes = el('g', {}, svg);
      const step = scene.step;
      for (const [name, p] of pos) {
        const isSource = scene.sources.includes(name);
        const builtAt = scene.built.indexOf(name);
        const askedAt = scene.asked.indexOf(name);
        const waiting = scene.path.includes(name);
        const g = el('g', {}, nodes);
        if (step !== null && step.kind === 'already' && step.target === name) {
          el(
            'rect',
            {
              x: r(p.x - nodeW / 2 - 5),
              y: r(p.y - NODE_H / 2 - 5),
              width: r(nodeW + 10),
              height: NODE_H + 10,
              rx: 8,
              fill: 'none',
              stroke: pal.primary,
              'stroke-width': 2,
              'stroke-dasharray': '5 3',
            },
            g,
          );
        }
        const fill = isSource ? pal.bgSubtle : builtAt >= 0 ? pal.accent : pal.bg;
        const stroke = isSource ? pal.border : builtAt >= 0 ? pal.accent : waiting ? pal.itemComparing : pal.border;
        const box: Record<string, string | number> = {
          x: r(p.x - nodeW / 2),
          y: r(p.y - NODE_H / 2),
          width: r(nodeW),
          height: NODE_H,
          rx: 5,
          fill,
          stroke,
          'stroke-width': waiting ? 2.5 : 1.5,
        };
        if (isSource) box['stroke-dasharray'] = '4 3';
        el('rect', box, g);
        label(g, p.x, p.y, name, {
          fill: isSource ? pal.textMuted : builtAt >= 0 ? pal.stateInk : pal.text,
          'font-family': fonts.mono,
          'font-size': bodySize,
          'font-weight': builtAt >= 0 ? 600 : 400,
        });
        if (isSource) {
          label(g, p.x, p.y + NODE_H / 2 + 10, t('label.source', 'source'), {
            fill: pal.textMuted,
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
          });
        }
        if (askedAt >= 0) {
          label(g, p.x - nodeW / 2 - 10, p.y, `↓${askedAt + 1}`, {
            'text-anchor': 'end',
            fill: pal.itemComparing,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          });
        }
        if (builtAt >= 0) {
          label(g, p.x + nodeW / 2 + 10, p.y, `↑${builtAt + 1}`, {
            'text-anchor': 'start',
            fill: pal.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'font-weight': 600,
          });
        }
      }

      // 세운 차례
      label(svg, MARGIN, ORDER_LABEL_Y, t('label.order', 'Build order'), {
        'text-anchor': 'start',
        fill: pal.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
      const slotChips: SVGElement[] = [];
      layout.slots.forEach((s, i) => {
        const name = scene.built[i];
        const g = el('g', {}, svg);
        el(
          'rect',
          {
            x: r(s.x - layout.slotW / 2),
            y: r(s.y - SLOT_H / 2),
            width: r(layout.slotW),
            height: SLOT_H,
            rx: 5,
            fill: name === undefined ? pal.bg : pal.accent,
            stroke: name === undefined ? pal.border : pal.accent,
            'stroke-width': 1.5,
            ...(name === undefined ? { 'stroke-dasharray': '4 3' } : {}),
          },
          g,
        );
        label(g, s.x - layout.slotW / 2 + 8, s.y, String(i + 1), {
          'text-anchor': 'start',
          fill: name === undefined ? pal.textMuted : pal.stateInk,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        if (name !== undefined) {
          label(g, s.x + 6, s.y, name, {
            fill: pal.stateInk,
            'font-family': fonts.mono,
            'font-size': bodySize,
            'font-weight': 600,
          });
        }
        slotChips.push(g);
      });

      label(svg, W / 2, CAPTION_Y, captionOf(scene), {
        fill: pal.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });

      const motion = el('g', {}, svg);
      return { pathLines, slotChips, motion };
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function play(scene: WhoGoesFirstSceneState, handles: Handles, mine: number): Promise<void> {
      const step = scene.step;
      const layout = layoutOf(scene);
      if (step === null || layout === null) return;

      if (step.kind === 'descend') {
        // 요구의 화살 끝이 윗대상에서 이 대상으로 내려온다
        const h = handles.pathLines.get(step.target);
        if (h === undefined) return;
        await tween(MOVE_MS, mine, (p) => {
          const tip = lerp(h.a, h.b, p);
          h.line.setAttribute('x2', String(r(tip.x)));
          h.line.setAttribute('y2', String(r(tip.y)));
          h.head.setAttribute('points', headAlong(h.a, h.b, tip));
        });
        return;
      }

      if (step.kind === 'build') {
        // 요구의 화살이 윗대상으로 거둬져 올라가고, 세운 대상이 제 차례 칸으로 옮겨 간다
        const { a, b } = descentOf(layout, step.from, step.target);
        const back = drawArrow(handles.motion, a, b, pal.itemComparing, 3);
        const chip = handles.slotChips[step.order - 1];
        const slot = layout.slots[step.order - 1];
        if (chip === undefined || slot === undefined) {
          throw new Error(`who-goes-first: 세운 차례 ${step.order} 의 칸이 없다`);
        }
        const node = posOf(layout, step.target);
        const off = { x: node.x - slot.x, y: node.y - slot.y };
        await tween(MOVE_MS, mine, (p) => {
          const tip = lerp(b, a, p);
          back.line.setAttribute('x2', String(r(tip.x)));
          back.line.setAttribute('y2', String(r(tip.y)));
          back.head.setAttribute('points', headAlong(a, b, tip));
          chip.setAttribute('transform', `translate(${r(off.x * (1 - p))},${r(off.y * (1 - p))})`);
        });
        return;
      }

      // 이미 선 대상 — 요구가 내려갔다가 세우지 않고 곧바로 돌아온다
      const { a, b } = descentOf(layout, step.from, step.target);
      const probe = drawArrow(handles.motion, a, a, pal.itemComparing, 3);
      await tween(BOUNCE_MS, mine, (p) => {
        const tip = p < 0.5 ? lerp(a, b, p * 2) : lerp(b, a, (p - 0.5) * 2);
        probe.line.setAttribute('x2', String(r(tip.x)));
        probe.line.setAttribute('y2', String(r(tip.y)));
        probe.head.setAttribute('points', headAlong(a, b, tip));
      });
    }

    return {
      async render(
        next: WhoGoesFirstSceneState,
        _prev: WhoGoesFirstSceneState | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        if (!opts.animate || handles === null || next.step === null) return;
        await play(next, handles, mine);
        if (mine === gen && !destroyed) drawStatic(next);
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
