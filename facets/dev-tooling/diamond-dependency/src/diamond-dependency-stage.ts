/**
 * diamond-dependency 의 그림 — 부름(간선)이 뻗어 나가 꾸러미에 닿는다.
 *
 * 동사는 "모인다". 뿌리에서 두 갈래로 벌어진 부름이 한 층 아래에서 같은 이름으로 다시 모인다.
 * 풀리는 부름은 그 걸음에 화살이 실제로 뻗어 나가 과녁에 닿는다. 새로 고르는 부름은 닿는 순간
 * 꾸러미가 선다. 다시 쓰는 부름은 이미 선 꾸러미에 닿고, 그 자리에 "범위 안 — 다시 씀" 이 붙는다.
 * 끝 걸음에는 모인 이름으로 들어오는 부름들을 따라 점이 동시에 흘러 한 점으로 모인다.
 *
 * 자리는 이름의 층(부름 구조에서 정해진다)으로 셈한다 — 층마다 한 줄, 줄 안에서는 너비 우선 차례.
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
} from '@ffacet/core/runtime';
import type { DiamondDependencyScene, DiamondEdge } from './scene.js';

const H = 380;
const SVG = 'http://www.w3.org/2000/svg';

/** 줄 두 개짜리 캡션 자리. */
const CAPTION_Y1 = 26;
const CAPTION_Y2 = 50;
/** 첫 층 · 끝 층 꾸러미의 가운데. 층이 몇이든 그 사이를 고루 나눈다. */
const ROW_TOP = 108;
const ROW_BOTTOM = H - 48;
/** 꾸러미 상자 — 폭은 캔버스에서 역산하되 이 값을 넘지 않는다. */
const NODE_W_MAX = 132;
const NODE_H = 44;
/** 아직 안 푼 부름은 과녁 쪽으로 이만큼만 뻗은 점선이다. */
const STUB_FRAC = 0.42;

/** 운동 길이. */
const GROW_MS = 520;
const POP_MS = 180;
const FLOW_MS = 640;

type Pt = { x: number; y: number };

function rd(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  content: string,
  style: { size: string; fill: string; family: string; weight?: string; anchor?: string },
): SVGTextElement {
  const node = el(parent, 'text', {
    x: rd(x),
    y: rd(y),
    'font-family': style.family,
    'font-size': style.size,
    'font-weight': style.weight ?? 'normal',
    'text-anchor': style.anchor ?? 'middle',
    'dominant-baseline': 'middle',
    fill: style.fill,
  });
  node.textContent = content;
  return node;
}

/** 이름 → 상자 가운데. */
function layout(scene: DiamondDependencyScene): Map<string, Pt> {
  const out = new Map<string, Pt>();
  const maxLevel = scene.levels.reduce((m, x) => Math.max(m, x.level), 0);
  const byLevel = new Map<number, string[]>();
  for (const x of scene.levels) byLevel.set(x.level, [...(byLevel.get(x.level) ?? []), x.name]);
  const W = PIECE_CANVAS_W;
  for (const [level, names] of byLevel) {
    const y = maxLevel === 0 ? ROW_TOP : ROW_TOP + ((ROW_BOTTOM - ROW_TOP) * level) / maxLevel;
    const k = names.length;
    const spread = k > 1 ? Math.min(W * 0.5, (W - nodeWidth(scene) - 24) / (k - 1)) : 0;
    names.forEach((name, i) => {
      out.set(name, { x: rd(W / 2 + (i - (k - 1) / 2) * spread), y: rd(y) });
    });
  }
  return out;
}

function nodeWidth(scene: DiamondDependencyScene): number {
  const widest = scene.levels.reduce((m, x) => {
    let k = 0;
    for (const y of scene.levels) if (y.level === x.level) k += 1;
    return Math.max(m, k);
  }, 1);
  return Math.min(NODE_W_MAX, (PIECE_CANVAS_W - 24) / widest - 16);
}

/** 부름의 두 끝 — 부른 쪽 상자의 아래 가운데에서 과녁 상자의 위 가운데로. */
function anchors(from: Pt, to: Pt): { a: Pt; b: Pt } {
  return { a: { x: from.x, y: from.y + NODE_H / 2 }, b: { x: to.x, y: to.y - NODE_H / 2 } };
}

function lerp(a: Pt, b: Pt, u: number): Pt {
  return { x: rd(a.x + (b.x - a.x) * u), y: rd(a.y + (b.y - a.y) * u) };
}

function headPoints(a: Pt, tip: Pt): string {
  const dx = tip.x - a.x;
  const dy = tip.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const back = { x: tip.x - ux * 9, y: tip.y - uy * 9 };
  const l = { x: back.x - uy * 4.5, y: back.y + ux * 4.5 };
  const r = { x: back.x + uy * 4.5, y: back.y - ux * 4.5 };
  return [tip, l, r].map((p) => `${rd(p.x)},${rd(p.y)}`).join(' ');
}

/** 간선 옆 글자 자리 — 가운데에서 바깥쪽(수직)으로 비켜 둔다. */
function sideOf(a: Pt, b: Pt, u: number, off: number): Pt {
  const m = lerp(a, b, u);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // 캔버스 가운데에서 먼 쪽으로 민다.
  let nx = -dy / len;
  let ny = dx / len;
  if ((m.x - PIECE_CANVAS_W / 2) * nx < 0) {
    nx = -nx;
    ny = -ny;
  }
  if (Math.abs(dx) < 1) {
    nx = 1;
    ny = 0;
  }
  return { x: rd(m.x + nx * off), y: rd(m.y + ny * off) };
}

type Handles = {
  edges: Map<string, { line: SVGLineElement; head: SVGPolygonElement; a: Pt; b: Pt }>;
  nodes: Map<string, SVGGElement>;
  stubs: Map<string, SVGGElement>;
  tags: Map<string, SVGGElement>;
  flow: SVGGElement;
};

const edgeKey = (from: string, name: string) => `${from}>${name}`;

export const diamondDependencyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = () => {
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

    /** ms 동안 u 를 0→1 로 흘린다. 멎으면 false. */
    async function tween(ms: number, mine: number, fn: (u: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.round(ms / 16));
      for (let i = 1; i <= frames; i += 1) {
        await wait(ms / frames);
        if (mine !== gen || destroyed) return false;
        const u = i / frames;
        fn(1 - (1 - u) * (1 - u));
      }
      return true;
    }

    function caption(scene: DiamondDependencyScene): void {
      const s = scene.step;
      const big = { size: fontSizes.md, fill: c.text, family: fonts.body, weight: '600' };
      const small = { size: fontSizes.sm, fill: c.textMuted, family: fonts.body };
      if (s.kind === 'start') {
        label(svg, PIECE_CANVAS_W / 2, CAPTION_Y1, scene.root, { ...big, family: fonts.mono });
        label(svg, PIECE_CANVAS_W / 2, CAPTION_Y2, t('caption.start', 'Its calls are resolved one at a time, breadth first.'), small);
        return;
      }
      if (s.kind === 'pick' || s.kind === 'reuse') {
        label(
          svg,
          PIECE_CANVAS_W / 2,
          CAPTION_Y1,
          t('caption.call', '{from} → {name} {range}', { from: s.from, name: s.name, range: s.range }),
          { ...big, family: fonts.mono },
        );
        const line =
          s.kind === 'pick'
            ? t('caption.pick', 'Not installed yet — pick the highest in range: {version}', { version: s.version })
            : t('caption.reuse', 'Already chosen: {version} — inside this range, so it is reused, not picked again.', {
                version: s.version,
              });
        label(svg, PIECE_CANVAS_W / 2, CAPTION_Y2, line, small);
        return;
      }
      if (s.kind !== 'done') return;
      label(svg, PIECE_CANVAS_W / 2, CAPTION_Y1, t('caption.joined', '{name} {version}', { name: s.name, version: s.version }), {
        ...big,
        family: fonts.mono,
      });
      label(
        svg,
        PIECE_CANVAS_W / 2,
        CAPTION_Y2,
        t('caption.done', 'Callers: {callers} · Copies: {copies} · Installed packages: {installed}', {
          callers: s.callers,
          copies: s.copies,
          installed: s.installed,
        }),
        small,
      );
    }

    function drawStatic(scene: DiamondDependencyScene): Handles {
      svg.textContent = '';
      const h: Handles = { edges: new Map(), nodes: new Map(), stubs: new Map(), tags: new Map(), flow: el(svg, 'g', {}) };
      if (scene.root === '') return h;
      const pos = layout(scene);
      const w = nodeWidth(scene);
      const s = scene.step;
      const current = s.kind === 'pick' || s.kind === 'reuse' ? edgeKey(s.from, s.name) : null;
      const joined = s.kind === 'done' ? s.name : null;

      const edgeLayer = el(svg, 'g', {});
      const nodeLayer = el(svg, 'g', {});
      svg.appendChild(h.flow);

      // 아직 안 푼 부름 — 과녁 쪽으로 반쯤 뻗은 점선과 그 이름 · 범위
      for (const p of scene.pending) {
        const from = pos.get(p.from);
        const to = pos.get(p.name);
        if (!from || !to) throw new Error(`diamond-dependency: ${p.from} → ${p.name} 의 자리가 없다`);
        const { a, b } = anchors(from, to);
        const end = lerp(a, b, STUB_FRAC);
        const key = `stubs:${p.from}`;
        const group = h.stubs.get(key) ?? el(edgeLayer, 'g', {});
        h.stubs.set(key, group);
        el(group, 'line', {
          x1: a.x,
          y1: a.y,
          x2: end.x,
          y2: end.y,
          stroke: c.textMuted,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 4',
        });
        label(group, end.x, rd(end.y + 12), t('label.call', '{name} {range}', { name: p.name, range: p.range }), {
          size: fontSizes.sm,
          fill: c.textMuted,
          family: fonts.mono,
        });
      }

      // 푼 부름
      for (const e of scene.edges) {
        const from = pos.get(e.from);
        const to = pos.get(e.name);
        if (!from || !to) throw new Error(`diamond-dependency: ${e.from} → ${e.name} 의 자리가 없다`);
        const { a, b } = anchors(from, to);
        const key = edgeKey(e.from, e.name);
        const hot = key === current || (joined !== null && e.name === joined);
        const stroke = hot ? c.itemActive : c.text;
        const line = el(edgeLayer, 'line', {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke,
          'stroke-width': hot ? 2.5 : 1.5,
        });
        const head = el(edgeLayer, 'polygon', { points: headPoints(a, b), fill: stroke });
        h.edges.set(key, { line, head, a, b });
        const at = sideOf(a, b, 0.5, 16);
        label(edgeLayer, at.x, at.y, e.range, {
          size: fontSizes.sm,
          fill: hot ? c.text : c.textMuted,
          family: fonts.mono,
          weight: hot ? '600' : 'normal',
        });
        if (e.kind === 'reuse') tagReuse(edgeLayer, e, a, b, w, h);
      }

      // 꾸러미
      const placed = new Map(scene.placed.map((p) => [p.name, p.version]));
      for (const x of scene.levels) {
        const p = pos.get(x.name) as Pt;
        const isRoot = x.name === scene.root;
        const version = placed.get(x.name);
        if (!isRoot && version === undefined) continue;
        const g = el(nodeLayer, 'g', {});
        const isJoined = x.name === joined;
        const isTarget = s.kind === 'pick' || s.kind === 'reuse' ? s.name === x.name : false;
        el(g, 'rect', {
          x: rd(p.x - w / 2),
          y: rd(p.y - NODE_H / 2),
          width: rd(w),
          height: NODE_H,
          rx: 8,
          fill: isJoined ? c.accent : isRoot ? c.bgSubtle : c.bg,
          stroke: isTarget || isJoined ? c.itemActive : c.text,
          'stroke-width': isTarget || isJoined ? 2.5 : 1.5,
        });
        const ink = isJoined ? c.stateInk : c.text;
        if (version === undefined) {
          label(g, p.x, p.y, x.name, { size: fontSizes.md, fill: ink, family: fonts.mono, weight: '600' });
        } else {
          label(g, p.x, p.y - 8, x.name, { size: fontSizes.md, fill: ink, family: fonts.mono, weight: '600' });
          label(g, p.x, p.y + 11, version, { size: fontSizes.sm, fill: ink, family: fonts.mono });
        }
        h.nodes.set(x.name, g);
      }

      caption(scene);
      return h;
    }

    /** 다시 쓴 부름의 판정 — 과녁 상자 옆, 부름이 들어온 쪽에 붙인다. */
    function tagReuse(layer: SVGGElement, e: DiamondEdge, a: Pt, b: Pt, w: number, h: Handles): void {
      const side = a.x < b.x ? -1 : 1;
      const g = el(layer, 'g', {});
      label(g, b.x + side * (w / 2 + 10), b.y + NODE_H / 2, t('label.reuse', 'in range — reused'), {
        size: fontSizes.sm,
        fill: c.text,
        family: fonts.body,
        weight: '600',
        anchor: side > 0 ? 'start' : 'end',
      });
      h.tags.set(edgeKey(e.from, e.name), g);
    }

    async function animate(next: DiamondDependencyScene, mine: number): Promise<void> {
      const h = drawStatic(next);
      const s = next.step;
      if (s.kind === 'pick' || s.kind === 'reuse') {
        const edge = h.edges.get(edgeKey(s.from, s.name));
        if (!edge) return;
        const node = h.nodes.get(s.name);
        const stubs = h.stubs.get(`stubs:${s.name}`);
        const tag = h.tags.get(edgeKey(s.from, s.name));
        // 아직 못 온 만큼 — 화살은 부른 쪽에서 막 나섰고, 새 꾸러미 · 그 부름 · 판정은 아직 없다
        const place = (u: number) => {
          const tip = lerp(edge.a, edge.b, u);
          edge.line.setAttribute('x2', String(tip.x));
          edge.line.setAttribute('y2', String(tip.y));
          edge.head.setAttribute('points', headPoints(edge.a, tip));
        };
        place(0.02);
        if (s.kind === 'pick' && node) node.setAttribute('opacity', '0');
        if (s.kind === 'pick' && stubs) stubs.setAttribute('opacity', '0');
        if (tag) tag.setAttribute('opacity', '0');
        if (!(await tween(GROW_MS, mine, (u) => place(0.02 + 0.98 * u)))) return;
        const target = s.kind === 'pick' ? node : tag;
        if (target) {
          const p = s.kind === 'pick' ? layout(next).get(s.name) : null;
          const ok = await tween(POP_MS, mine, (u) => {
            target.setAttribute('opacity', String(rd(u)));
            if (p) {
              const k = rd(0.6 + 0.4 * u);
              target.setAttribute('transform', `translate(${rd(p.x * (1 - k))} ${rd(p.y * (1 - k))}) scale(${k})`);
            }
          });
          if (!ok) return;
        }
        if (s.kind === 'pick' && stubs) {
          const ok = await tween(POP_MS, mine, (u) => stubs.setAttribute('opacity', String(rd(u))));
          if (!ok) return;
        }
        return;
      }
      if (s.kind === 'done') {
        // 모인 이름으로 들어오는 부름마다 점 하나 — 동시에 흘러 한 점에서 만난다
        const into = next.edges.filter((e) => e.name === s.name);
        const dots = into.map((e) => {
          const edge = h.edges.get(edgeKey(e.from, e.name));
          if (!edge) throw new Error(`diamond-dependency: ${e.from} → ${e.name} 간선이 없다`);
          const dot = el(h.flow, 'circle', { cx: edge.a.x, cy: edge.a.y, r: 5, fill: c.itemActive });
          return { dot, edge };
        });
        await tween(FLOW_MS, mine, (u) => {
          for (const { dot, edge } of dots) {
            const p = lerp(edge.a, edge.b, u);
            dot.setAttribute('cx', String(p.x));
            dot.setAttribute('cy', String(p.y));
          }
        });
      }
    }

    return {
      async render(next: DiamondDependencyScene, prev: DiamondDependencyScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || prev === null || next.step === prev.step || next.step.kind === 'start') {
          drawStatic(next);
          return;
        }
        await animate(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy() {
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
