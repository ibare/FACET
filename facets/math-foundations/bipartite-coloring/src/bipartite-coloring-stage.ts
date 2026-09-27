/**
 * bipartite-coloring 무대.
 *
 * 칠하기 걸음 — 앞 겹에서 색이 간선을 타고 흘러와 새 겹의 정점에 번진다. 정점은 번호 차례로
 * 둥글게 놓여 두 색이 번갈아 섞여 보인다.
 * 갈라서기 걸음 — 정점이 제자리에서 떠나 색대로 두 줄로 모이고, 간선이 그 사이를 건넌다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { formatSet, type Color } from './algorithm.js';
import type { BipartiteColoringScene } from './scene.js';

const H = 380;
const SVG_NS = 'http://www.w3.org/2000/svg';

const GRAPH_TOP = 22;
const GRAPH_BOTTOM = 298;
const CAPTION_Y1 = 334;
const CAPTION_Y2 = 360;

const PULSE_MS = 500;
const GROW_MS = 300;
const START_GROW_MS = 800;
const SPLIT_MS = 800;

type Point = { x: number; y: number };

function num(x: number): string {
  const r = Math.round(x * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: Point, b: Point, p: number): Point {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

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

function vertexRadius(): number {
  return Math.min(18, PIECE_CANVAS_W / 34);
}

/** 번호 차례로 둥글게 — 칠하는 동안의 자리. */
function ringPositions(vertices: readonly number[]): Map<number, Point> {
  const sorted = [...vertices].sort((a, b) => a - b);
  const cx = PIECE_CANVAS_W / 2;
  const cy = (GRAPH_TOP + GRAPH_BOTTOM) / 2;
  const radius = Math.min(130, (GRAPH_BOTTOM - GRAPH_TOP) / 2 - vertexRadius() - 8);
  const out = new Map<number, Point>();
  sorted.forEach((v, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sorted.length;
    out.set(v, { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  });
  return out;
}

/** 색대로 두 줄 — 갈라선 뒤의 자리. */
function columnPositions(sides: readonly [number[], number[]]): Map<number, Point> {
  const gap = Math.min(150, PIECE_CANVAS_W * 0.24);
  const xs = [PIECE_CANVAS_W / 2 - gap, PIECE_CANVAS_W / 2 + gap];
  const span = GRAPH_BOTTOM - GRAPH_TOP;
  const out = new Map<number, Point>();
  sides.forEach((side, s) => {
    const x = xs[s] as number;
    side.forEach((v, i) => {
      out.set(v, { x, y: GRAPH_TOP + ((i + 0.5) * span) / side.length });
    });
  });
  return out;
}

function positionsOf(scene: BipartiteColoringScene): Map<number, Point> {
  return scene.split === null ? ringPositions(scene.vertices) : columnPositions(scene.split.sides);
}

function pointOf(pos: Map<number, Point>, v: number): Point {
  const p = pos.get(v);
  if (p === undefined) throw new Error(`bipartite-coloring 무대: 정점 ${v} 의 자리가 없다`);
  return p;
}

/** 거리 표의 자리 — 둥글게 놓였을 땐 원 바깥, 갈라선 뒤엔 제 편의 바깥 쪽. */
function distOffset(scene: BipartiteColoringScene, at: Point, color: Color, reach: number): Point {
  if (scene.split !== null) return { x: color === 0 ? -reach : reach, y: 0 };
  const dx = at.x - PIECE_CANVAS_W / 2;
  const dy = at.y - (GRAPH_TOP + GRAPH_BOTTOM) / 2;
  const len = Math.hypot(dx, dy);
  if (len === 0) throw new Error('bipartite-coloring 무대: 정점이 원의 중심에 있다');
  return { x: (dx / len) * reach, y: (dy / len) * reach };
}

type VertexEls = { g: SVGGElement; body: SVGCircleElement; label: SVGTextElement; dist: SVGTextElement | null };
type EdgeEls = { a: number; b: number; line: SVGLineElement };
type Handles = {
  vertices: Map<number, VertexEls>;
  edges: EdgeEls[];
  fx: SVGGElement;
  divider: SVGLineElement | null;
};

type Renderer = ViewInstance & {
  render(next: BipartiteColoringScene, prev: BipartiteColoringScene | null, opts: { animate: boolean }): Promise<void>;
};

function mountStage(params: ViewMountParams & { canvas: SVGSVGElement }): Renderer {
  const canvas = params.canvas;
  const colors: Palette = getColors(params.theme);
  const t: Translate = params.t ?? makeTranslator(params.locale);
  const sideColors = categorical(2, 'vivid');
  const r = vertexRadius();

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const waiters = new Set<() => void>();
  let destroyed = false;
  let gen = 0;

  function colorFill(c: Color): string {
    const fill = sideColors[c];
    if (fill === undefined) throw new Error(`bipartite-coloring 무대: 색 ${c} 가 없다`);
    return fill;
  }

  function colorOf(scene: BipartiteColoringScene, v: number): Color | null {
    const p = scene.painted.find((x) => x.v === v);
    return p === undefined ? null : p.color;
  }

  function tween(ms: number, frame: (p: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      const t0 = Date.now();
      const done = (): void => {
        waiters.delete(done);
        resolve();
      };
      waiters.add(done);
      const tick = (): void => {
        if (destroyed) return done();
        const p = Math.min(1, (Date.now() - t0) / ms);
        frame(p);
        if (p >= 1) return done();
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, 16);
        timers.add(id);
      };
      tick();
    });
  }

  function caption(text: string, y: number, parent: Element): void {
    const node = el('text', {
      x: '40',
      y: num(y),
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
      'dominant-baseline': 'middle',
    }, parent);
    node.textContent = text;
  }

  function drawStatic(scene: BipartiteColoringScene): Handles {
    canvas.textContent = '';
    const pos = positionsOf(scene);
    const painted = new Set(scene.painted.map((x) => x.v));
    const current = new Set(scene.step?.kind === 'paint' ? scene.step.layer.map((e) => e.v) : []);

    let divider: SVGLineElement | null = null;
    if (scene.split !== null) {
      divider = el('line', {
        x1: num(PIECE_CANVAS_W / 2),
        y1: num(GRAPH_TOP - 6),
        x2: num(PIECE_CANVAS_W / 2),
        y2: num(GRAPH_BOTTOM + 6),
        stroke: colors.textMuted,
        'stroke-width': '1',
        'stroke-dasharray': '4 5',
      }, canvas);
    }

    const edgeLayer = el('g', {}, canvas);
    const edges: EdgeEls[] = scene.edges.map(([a, b]) => {
      const pa = pointOf(pos, a);
      const pb = pointOf(pos, b);
      const both = painted.has(a) && painted.has(b);
      const line = el('line', {
        x1: num(pa.x),
        y1: num(pa.y),
        x2: num(pb.x),
        y2: num(pb.y),
        stroke: both ? colors.text : colors.textMuted,
        'stroke-width': both ? '2' : '1.2',
      }, edgeLayer);
      return { a, b, line };
    });

    const vertexLayer = el('g', {}, canvas);
    const vertices = new Map<number, VertexEls>();
    for (const v of scene.vertices) {
      const p = pointOf(pos, v);
      const c = colorOf(scene, v);
      const g = el('g', { transform: `translate(${num(p.x)} ${num(p.y)})` }, vertexLayer);
      const body = el('circle', {
        cx: '0',
        cy: '0',
        r: num(r),
        fill: c === null ? colors.bg : colorFill(c),
        stroke: current.has(v) ? colors.text : colors.border,
        'stroke-width': current.has(v) ? '3' : '1.5',
      }, g);
      const label = el('text', {
        x: '0',
        y: '0',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': '600',
        fill: c === null ? colors.text : colors.stateInk,
      }, g);
      label.textContent = String(v);
      vertices.set(v, { g, body, label, dist: null });
    }

    // 거리 표 — 칠한 정점 곁, 그래프 바깥 쪽에 그 겹의 번호. 간선을 피하고 바탕색 테두리로 읽히게 한다
    const reach = r + parseFloat(fontSizes.xs) * 0.8;
    for (const pv of scene.painted) {
      const vEls = vertices.get(pv.v);
      if (vEls === undefined) throw new Error(`bipartite-coloring 무대: 정점 ${pv.v} 가 바탕에 없다`);
      const off = distOffset(scene, pointOf(pos, pv.v), pv.color, reach);
      const d = el('text', {
        x: num(off.x),
        y: num(off.y),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        stroke: colors.bg,
        'stroke-width': '3',
        'paint-order': 'stroke',
      }, vEls.g);
      d.textContent = String(pv.depth);
      vEls.dist = d;
    }

    const fx = el('g', {}, canvas);

    const cap = el('g', {}, canvas);
    const step = scene.step;
    if (step === null) {
      caption(
        t('caption.start', 'Vertices: {v} · Edges: {e} · Start: {s}', {
          v: scene.vertices.length,
          e: scene.edges.length,
          s: scene.start,
        }),
        CAPTION_Y1,
        cap,
      );
    } else if (step.kind === 'paint') {
      el('circle', {
        cx: '24',
        cy: num(CAPTION_Y1),
        r: '7',
        fill: colorFill(step.color),
        stroke: colors.border,
        'stroke-width': '1',
      }, cap);
      caption(
        t('caption.paint', 'Distance {d}: {set}', {
          d: step.depth,
          set: formatSet(step.layer.map((e) => e.v)),
        }),
        CAPTION_Y1,
        cap,
      );
      caption(
        t('caption.count', 'Painted: {n} / {total} · Same-color edges: {same}', {
          n: step.painted,
          total: scene.vertices.length,
          same: step.sameColor,
        }),
        CAPTION_Y2,
        cap,
      );
    } else {
      const split = scene.split;
      if (split === null) throw new Error('bipartite-coloring 무대: 갈라선 걸음인데 두 편이 없다');
      caption(
        t('caption.sides', 'Sides: {a} | {b}', {
          a: formatSet(split.sides[0]),
          b: formatSet(split.sides[1]),
        }),
        CAPTION_Y1,
        cap,
      );
      caption(
        t('caption.cross', 'Crossing edges: {cross} · Edges inside a side: {inside}', {
          cross: split.crossing,
          inside: split.inside,
        }),
        CAPTION_Y2,
        cap,
      );
    }

    return { vertices, edges, fx, divider };
  }

  function vertexEls(h: Handles, v: number): VertexEls {
    const x = h.vertices.get(v);
    if (x === undefined) throw new Error(`bipartite-coloring 무대: 정점 ${v} 의 손잡이가 없다`);
    return x;
  }

  /** 칠하기 — 앞 겹에서 색이 간선을 타고 흘러와 새 정점에 번진다. */
  async function animatePaint(next: BipartiteColoringScene, h: Handles, mine: number): Promise<void> {
    const step = next.step;
    if (step === null || step.kind !== 'paint') throw new Error('bipartite-coloring 무대: 칠하기 걸음이 아니다');
    const pos = positionsOf(next);
    const fill = colorFill(step.color);
    const fresh = new Set(step.layer.map((e) => e.v));

    // 아직 못 온 만큼 — 새 정점은 칠하지 않은 채, 새로 두 끝이 칠해진 간선은 옅게 시작한다
    for (const e of step.layer) {
      const vEls = vertexEls(h, e.v);
      vEls.body.setAttribute('fill', colors.bg);
      vEls.label.setAttribute('fill', colors.text);
      if (vEls.dist === null) throw new Error(`bipartite-coloring 무대: 정점 ${e.v} 의 거리 표가 없다`);
      vEls.dist.setAttribute('visibility', 'hidden');
    }
    const freshEdges = h.edges.filter((x) => fresh.has(x.a) || fresh.has(x.b));
    for (const x of freshEdges) {
      x.line.setAttribute('stroke', colors.textMuted);
      x.line.setAttribute('stroke-width', '1.2');
    }

    const pulses: { from: Point; to: Point; dot: SVGCircleElement }[] = [];
    for (const e of step.layer) {
      const to = pointOf(pos, e.v);
      for (const w of e.from) {
        const from = pointOf(pos, w);
        const dot = el('circle', {
          cx: num(from.x),
          cy: num(from.y),
          r: '6',
          fill,
          stroke: colors.text,
          'stroke-width': '1',
        }, h.fx);
        pulses.push({ from, to, dot });
      }
    }

    if (pulses.length > 0) {
      await tween(PULSE_MS, (p) => {
        if (mine !== gen || destroyed) return;
        const q = ease(p);
        for (const pl of pulses) {
          const at = lerp(pl.from, pl.to, q);
          pl.dot.setAttribute('cx', num(at.x));
          pl.dot.setAttribute('cy', num(at.y));
        }
      });
      if (mine !== gen || destroyed) return;
      for (const pl of pulses) pl.dot.remove();
      for (const x of freshEdges) {
        const bothPainted = next.painted.some((pv) => pv.v === x.a) && next.painted.some((pv) => pv.v === x.b);
        if (bothPainted) {
          x.line.setAttribute('stroke', colors.text);
          x.line.setAttribute('stroke-width', '2');
        }
      }
    }

    // 번짐 — 칠한 원이 정점 안에서 커진다
    const disks: SVGCircleElement[] = [];
    for (const e of step.layer) {
      const vEls = vertexEls(h, e.v);
      const disk = document.createElementNS(SVG_NS, 'circle');
      disk.setAttribute('cx', '0');
      disk.setAttribute('cy', '0');
      disk.setAttribute('r', '0');
      disk.setAttribute('fill', fill);
      vEls.g.insertBefore(disk, vEls.label);
      vEls.label.setAttribute('fill', colors.stateInk);
      disks.push(disk);
    }
    await tween(pulses.length > 0 ? GROW_MS : START_GROW_MS, (p) => {
      if (mine !== gen || destroyed) return;
      const rr = r * ease(p);
      for (const d of disks) d.setAttribute('r', num(rr));
    });
  }

  /** 갈라서기 — 둥근 자리에서 색대로 두 줄로 옮겨 간다. 간선은 끝을 따라 늘어진다. */
  async function animateSplit(next: BipartiteColoringScene, h: Handles, mine: number): Promise<void> {
    const split = next.split;
    if (split === null) throw new Error('bipartite-coloring 무대: 두 편이 없다');
    const from = ringPositions(next.vertices);
    const to = columnPositions(split.sides);
    const place = (p: number): void => {
      const now = new Map<number, Point>();
      for (const v of next.vertices) now.set(v, lerp(pointOf(from, v), pointOf(to, v), p));
      for (const [v, vEls] of h.vertices) {
        const at = pointOf(now, v);
        vEls.g.setAttribute('transform', `translate(${num(at.x)} ${num(at.y)})`);
      }
      for (const x of h.edges) {
        const a = pointOf(now, x.a);
        const b = pointOf(now, x.b);
        x.line.setAttribute('x1', num(a.x));
        x.line.setAttribute('y1', num(a.y));
        x.line.setAttribute('x2', num(b.x));
        x.line.setAttribute('y2', num(b.y));
      }
      if (h.divider !== null) h.divider.setAttribute('opacity', num(p));
    };
    place(0);
    await tween(SPLIT_MS, (p) => {
      if (mine !== gen || destroyed) return;
      place(ease(p));
    });
  }

  async function render(
    next: BipartiteColoringScene,
    _prev: BipartiteColoringScene | null,
    opts: { animate: boolean },
  ): Promise<void> {
    if (destroyed) return;
    const mine = (gen += 1);
    const h = drawStatic(next);
    if (!opts.animate || next.step === null) return;
    if (next.step.kind === 'paint') await animatePaint(next, h, mine);
    else await animateSplit(next, h, mine);
    if (mine === gen && !destroyed) drawStatic(next);
  }

  function destroy(): void {
    destroyed = true;
    gen += 1;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const wake of [...waiters]) wake();
    waiters.clear();
    canvas.textContent = '';
  }

  return { render, destroy };
}

export const bipartiteColoringStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    return mountStage(params);
  },
};
