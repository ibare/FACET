/**
 * gc-reachable-from-root 의 무대.
 *
 * 동사: 표시가 번지고, 훑는 손이 표시 없는 것을 거둔다.
 *   - 표시 걸음 — 표시 점 하나가 뿌리(또는 이미 표시된 객체)에서 가리킴을 따라 실제로 건너가
 *     다음 객체에 내려앉는다. 이미 표시된 것을 다시 만나면 점이 그 문턱까지 갔다가 사그라든다.
 *   - 훑음 걸음 — 손(칸을 두르는 틀)이 힙을 놓인 차례로 한 칸씩 옮겨 간다. 표시가 있으면 점이
 *     떠나고 객체는 남는다. 없으면 객체가 그 자리에서 오그라들어 빈 자리의 윤곽만 남는다.
 *     거둔 객체에서 나가던 가리킴은 끊긴 선으로 남겨, 거둬진 것이 가리킴을 받고 있었다는 것과
 *     남은 것이 거둬진 것에게서 가리킴을 받았다는 것이 끝 화면에 함께 보이게 한다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';
import { hasMark, isReaped, pointersInto, type GcScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 290;

const MARGIN = 20;
const GUTTER = 64;
const BOX_W_MAX = 60;
const BOX_H = 46;
const CHIP_W = 34;
const CHIP_H = 24;
const CHIP_Y = 24;
const ROW_Y = 88;
const ARC_BASE = 14;
const ARC_STEP = 14;
const MARK_R = 5;
const TALLY_Y = 222;
const CAPTION_Y = 246;
const SUB_Y = 268;

const TRAVEL_MS = 380;
const AGAIN_MS = 300;
const HAND_MS = 200;
const EFFECT_MS = 200;

type Pt = { x: number; y: number };

type Layout = {
  pitch: number;
  boxW: number;
  cx: (name: string) => number;
  arcs: { from: string; to: string; pts: Pt[]; head: [Pt, Pt] }[];
  chips: { name: string; to: string; x: number }[];
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function quad(a: Pt, c: Pt, b: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i += 1) {
    const s = i / n;
    const u = 1 - s;
    out.push({ x: u * u * a.x + 2 * u * s * c.x + s * s * b.x, y: u * u * a.y + 2 * u * s * c.y + s * s * b.y });
  }
  return out;
}

/** 꺾은선 위 비율 p 의 점 — 길이로 나눈다 */
function along(pts: readonly Pt[], p: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    lens.push(lens[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = lens[lens.length - 1]!;
  if (total === 0) return pts[0]!;
  const want = Math.max(0, Math.min(1, p)) * total;
  for (let i = 1; i < pts.length; i += 1) {
    if (lens[i]! >= want) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const seg = lens[i]! - lens[i - 1]!;
      const s = seg === 0 ? 0 : (want - lens[i - 1]!) / seg;
      return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
    }
  }
  return pts[pts.length - 1]!;
}

function layout(scene: GcScene): Layout {
  const n = Math.max(1, scene.heap.length);
  const left = MARGIN + GUTTER;
  const pitch = (PIECE_CANVAS_W - MARGIN - left) / n;
  const boxW = Math.min(BOX_W_MAX, pitch - 12);
  const index = new Map<string, number>();
  scene.heap.forEach((h, i) => index.set(h, i));
  const cx = (name: string): number => left + pitch * ((index.get(name) ?? 0) + 0.5);
  const bottom = ROW_Y + BOX_H;

  // 한 객체의 아래 변에 드나드는 선의 발을 겹치지 않게 벌린다
  const feet = new Map<string, { edge: number; x: number }[]>();
  scene.edges.forEach((e, k) => {
    for (const end of [e.from, e.to]) {
      const other = end === e.from ? e.to : e.from;
      const list = feet.get(end) ?? [];
      list.push({ edge: k * 2 + (end === e.from ? 0 : 1), x: cx(other) });
      feet.set(end, list);
    }
  });
  const footX = (name: string, edgeKey: number): number => {
    const list = [...(feet.get(name) ?? [])].sort((a, b) => a.x - b.x || a.edge - b.edge);
    const k = list.findIndex((f) => f.edge === edgeKey);
    const spread = Math.min(12, (boxW - 16) / Math.max(1, list.length - 1));
    return cx(name) + (k - (list.length - 1) / 2) * spread;
  };

  const arcs = scene.edges.map((e, k) => {
    const a = { x: footX(e.from, k * 2), y: bottom };
    const b = { x: footX(e.to, k * 2 + 1), y: bottom };
    const span = Math.abs((index.get(e.to) ?? 0) - (index.get(e.from) ?? 0));
    const depth = ARC_BASE + ARC_STEP * span;
    const c = { x: (a.x + b.x) / 2, y: bottom + depth * 2 };
    const pts = quad(a, c, b, 24);
    const dx = b.x - c.x;
    const dy = b.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const back = { x: b.x - ux * 7, y: b.y - uy * 7 };
    const head: [Pt, Pt] = [
      { x: back.x - uy * 4, y: back.y + ux * 4 },
      { x: back.x + uy * 4, y: back.y - ux * 4 },
    ];
    return { from: e.from, to: e.to, pts, head };
  });

  // 뿌리 칩은 가리키는 객체 위에 선다. 한 객체를 여럿이 가리키면 옆으로 벌린다
  const byTarget = new Map<string, string[]>();
  for (const r of scene.roots) {
    const list = byTarget.get(r.to) ?? [];
    list.push(r.name);
    byTarget.set(r.to, list);
  }
  const chips = scene.roots.map((r) => {
    const list = byTarget.get(r.to) ?? [r.name];
    const k = list.indexOf(r.name);
    return { name: r.name, to: r.to, x: cx(r.to) + (k - (list.length - 1) / 2) * (CHIP_W + 6) };
  });

  return { pitch, boxW, cx, arcs, chips };
}

function markPos(L: Layout, name: string): Pt {
  return { x: L.cx(name), y: ROW_Y + BOX_H - 13 };
}

/** 표시 점이 건너가는 길 — 뿌리 칩 아래에서, 또는 앞 객체의 점에서 가리킴 선을 타고 */
function travelPath(L: Layout, via: string, viaRoot: boolean, to: string, stopShort: boolean): Pt[] {
  const end = markPos(L, to);
  if (viaRoot) {
    const chip = L.chips.find((c) => c.name === via && c.to === to);
    const x = chip ? chip.x : end.x;
    return [{ x, y: CHIP_Y + CHIP_H }, { x: end.x, y: ROW_Y }, end];
  }
  const arc = L.arcs.find((a) => a.from === via && a.to === to);
  if (!arc) return [markPos(L, via), end];
  const pts = [markPos(L, via), ...arc.pts];
  return stopShort ? pts : [...pts, end];
}

type Handles = {
  dots: Map<string, SVGCircleElement>;
  boxes: Map<string, SVGGElement>;
  hand: SVGRectElement | null;
  overlay: SVGGElement;
};

export const gcReachableFromRootStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
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

    /** ms 동안 p 를 0→1 로 흘린다. 프레임은 짧은 타이머로 — 걸음이 끝나면 멎는다 */
    async function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      for (;;) {
        if (destroyed || mine !== gen) return false;
        const p = Math.min(1, (Date.now() - start) / ms);
        frame(p);
        if (p >= 1) return true;
        await wait(16);
      }
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size,
        fill: opts.fill,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'middle',
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      return node;
    }

    function drawStatic(scene: GcScene): Handles {
      svg.textContent = '';
      const dots = new Map<string, SVGCircleElement>();
      const boxes = new Map<string, SVGGElement>();
      if (scene.heap.length === 0) {
        return { dots, boxes, hand: null, overlay: el(svg, 'g', {}) };
      }
      const L = layout(scene);

      // 머리말 두 줄 — 뿌리 줄과 힙 줄
      text(svg, MARGIN, CHIP_Y + CHIP_H / 2, t('label.roots', 'Roots'), {
        size: fontSizes.sm,
        fill: colors.textMuted,
      });
      text(svg, MARGIN, ROW_Y + BOX_H / 2, t('label.heap', 'Heap'), {
        size: fontSizes.sm,
        fill: colors.textMuted,
      });

      // 가리킴 — 힙 줄 아래로 휘는 선. 거둔 객체에서 나가던 것은 끊긴 선으로
      const arcLayer = el(svg, 'g', {});
      for (const a of L.arcs) {
        const dead = isReaped(scene, a.from);
        const stroke = dead ? colors.textMuted : colors.text;
        el(arcLayer, 'polyline', {
          points: a.pts.map((p) => `${round(p.x)},${round(p.y)}`).join(' '),
          fill: 'none',
          stroke,
          'stroke-width': 1.5,
          ...(dead ? { 'stroke-dasharray': '4 3' } : {}),
        });
        const tip = a.pts[a.pts.length - 1]!;
        el(arcLayer, 'polygon', {
          points: [tip, a.head[0], a.head[1]].map((p) => `${round(p.x)},${round(p.y)}`).join(' '),
          fill: stroke,
        });
      }

      // 뿌리 — 칩과 곧은 화살
      for (const c of L.chips) {
        el(svg, 'line', {
          x1: c.x,
          y1: CHIP_Y + CHIP_H,
          x2: L.cx(c.to),
          y2: ROW_Y - 6,
          stroke: colors.text,
          'stroke-width': 1.5,
        });
        const tx = L.cx(c.to);
        el(svg, 'polygon', {
          points: `${round(tx)},${ROW_Y} ${round(tx - 4)},${ROW_Y - 7} ${round(tx + 4)},${ROW_Y - 7}`,
          fill: colors.text,
        });
        el(svg, 'rect', {
          x: c.x - CHIP_W / 2,
          y: CHIP_Y,
          width: CHIP_W,
          height: CHIP_H,
          rx: 4,
          fill: colors.bg,
          stroke: colors.text,
          'stroke-width': 1.5,
        });
        text(svg, c.x, CHIP_Y + CHIP_H / 2, c.name, { size: fontSizes.md, fill: colors.text, anchor: 'middle', mono: true });
      }

      // 힙 — 놓인 차례의 칸. 거둔 것은 빈 자리의 윤곽만
      for (const name of scene.heap) {
        const x = L.cx(name) - L.boxW / 2;
        const reaped = isReaped(scene, name);
        const kept = scene.swept.some((s) => s.name === name && s.kept);
        if (reaped) {
          el(svg, 'rect', {
            x,
            y: ROW_Y,
            width: L.boxW,
            height: BOX_H,
            rx: 6,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          });
          text(svg, L.cx(name), ROW_Y + 16, name, { size: fontSizes.md, fill: colors.textMuted, anchor: 'middle', mono: true });
          continue;
        }
        const g = el(svg, 'g', {});
        el(g, 'rect', {
          x,
          y: ROW_Y,
          width: L.boxW,
          height: BOX_H,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: kept ? colors.success : colors.text,
          'stroke-width': kept ? 2.5 : 1.5,
        });
        text(g, L.cx(name), ROW_Y + 16, name, { size: fontSizes.md, fill: colors.text, anchor: 'middle', mono: true, weight: '600' });
        boxes.set(name, g);
        if (hasMark(scene, name)) {
          const m = markPos(L, name);
          dots.set(name, el(svg, 'circle', { cx: m.x, cy: m.y, r: MARK_R, fill: colors.itemActive }));
        }
      }

      // 훑는 손 — 마지막으로 훑은 칸을 두른다
      let hand: SVGRectElement | null = null;
      const last = scene.swept[scene.swept.length - 1];
      if (last) {
        hand = el(svg, 'rect', {
          x: L.cx(last.name) - L.boxW / 2 - 5,
          y: ROW_Y - 5,
          width: L.boxW + 10,
          height: BOX_H + 10,
          rx: 8,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 3,
        });
      }

      // 글 — 셈 한 줄, 이번 걸음 한 줄, 곁말 한 줄
      const step = scene.step;
      let tally = '';
      if (scene.swept.length > 0) {
        tally = t('tally.sweep', 'Sweep · kept: {kept} · reaped: {reaped}', {
          kept: scene.swept.filter((s) => s.kept).length,
          reaped: scene.swept.filter((s) => !s.kept).length,
        });
      } else if (scene.marked.length > 0) {
        tally = t('tally.mark', 'Mark · marked: {n}', { n: scene.marked.length });
      } else {
        tally = t('tally.start', 'Objects on the heap: {n}', { n: scene.heap.length });
      }
      text(svg, MARGIN, TALLY_Y, tally, { size: fontSizes.sm, fill: colors.textMuted });

      let caption = '';
      let sub = '';
      if (step?.kind === 'start') {
        caption = t('caption.start', 'Collection begins. Nothing is marked yet.');
      } else if (step?.kind === 'mark') {
        caption = step.viaRoot
          ? t('caption.markRoot', 'Mark {name}: root {via} points to it.', { name: step.name, via: step.via })
          : t('caption.markFrom', 'Mark {name}: reached from {via}.', { name: step.name, via: step.via });
        const again = step.again[0];
        if (again) {
          sub = t('caption.again', '{from} → {to}: already marked, not entered again.', {
            from: again.from,
            to: again.to,
          });
        }
      } else if (step?.kind === 'sweep') {
        const i = scene.heap.indexOf(step.name) + 1;
        caption = step.kept
          ? t('caption.keep', 'Sweep {i}/{n}: {name} has a mark. Kept, mark cleared.', {
              i,
              n: scene.heap.length,
              name: step.name,
            })
          : t('caption.reap', 'Sweep {i}/{n}: {name} has no mark. Reaped where it lies.', {
              i,
              n: scene.heap.length,
              name: step.name,
            });
        const into = pointersInto(scene, step.name);
        sub = t('caption.into', 'Pointed to by: {list}', {
          list: into.length > 0 ? into.join(', ') : t('label.none', 'none'),
        });
      }
      if (caption) text(svg, MARGIN, CAPTION_Y, caption, { size: fontSizes.md, fill: colors.text, weight: '600' });
      if (sub) text(svg, MARGIN, SUB_Y, sub, { size: fontSizes.sm, fill: colors.textMuted });

      const overlay = el(svg, 'g', {});
      return { dots, boxes, hand, overlay };
    }

    async function animateStep(scene: GcScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (!step || step.kind === 'start') return;
      const L = layout(scene);

      if (step.kind === 'mark') {
        // 끝 자리의 점은 아직 오지 않았다 — 건너오는 점이 내려앉을 때까지 숨긴다
        const landed = h.dots.get(step.name);
        landed?.setAttribute('r', '0');
        const path = travelPath(L, step.via, step.viaRoot, step.name, false);
        const start = path[0]!;
        const mover = el(h.overlay, 'circle', { cx: start.x, cy: start.y, r: MARK_R, fill: colors.itemActive });
        const ok = await tween(TRAVEL_MS, mine, (p) => {
          const e = 1 - (1 - p) * (1 - p);
          const q = along(path, e);
          mover.setAttribute('cx', String(round(q.x)));
          mover.setAttribute('cy', String(round(q.y)));
        });
        if (!ok) return;
        mover.remove();
        landed?.setAttribute('r', String(MARK_R));
        for (const again of step.again) {
          const back = travelPath(L, again.from, false, again.to, true);
          const s0 = back[0]!;
          const ghost = el(h.overlay, 'circle', { cx: s0.x, cy: s0.y, r: MARK_R, fill: colors.itemActive });
          const done = await tween(AGAIN_MS, mine, (p) => {
            const q = along(back, Math.min(1, p / 0.8));
            ghost.setAttribute('cx', String(round(q.x)));
            ghost.setAttribute('cy', String(round(q.y)));
            const shrink = p <= 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
            ghost.setAttribute('r', String(round(MARK_R * shrink)));
          });
          if (!done) return;
          ghost.remove();
        }
        return;
      }

      // 훑음 — 손이 앞 칸에서 이 칸으로 옮겨 온다 (첫 칸이면 힙 줄의 왼쪽 문턱에서)
      const at = scene.heap.indexOf(step.name);
      const toX = L.cx(step.name) - L.boxW / 2 - 5;
      const fromX = at > 0 ? toX - L.pitch : MARGIN + GUTTER - L.boxW / 2 - 5;
      const hand = h.hand;
      hand?.setAttribute('x', String(round(fromX)));
      const ok = await tween(HAND_MS, mine, (p) => {
        const e = p * p * (3 - 2 * p);
        hand?.setAttribute('x', String(round(fromX + (toX - fromX) * e)));
      });
      if (!ok) return;

      const m = markPos(L, step.name);
      if (step.kept) {
        // 표시가 떠난다 — 위로 떠오르며 오그라든다
        const lift = el(h.overlay, 'circle', { cx: m.x, cy: m.y, r: MARK_R, fill: colors.itemActive });
        await tween(EFFECT_MS, mine, (p) => {
          lift.setAttribute('cy', String(round(m.y - 26 * p)));
          lift.setAttribute('r', String(round(MARK_R * (1 - p))));
        });
        return;
      }
      // 거둔다 — 객체가 그 자리에서 오그라들어 빈 윤곽만 남긴다
      const x = L.cx(step.name) - L.boxW / 2;
      const body = el(h.overlay, 'g', {});
      el(body, 'rect', {
        x,
        y: ROW_Y,
        width: L.boxW,
        height: BOX_H,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.text,
        'stroke-width': 1.5,
      });
      text(body, L.cx(step.name), ROW_Y + 16, step.name, {
        size: fontSizes.md,
        fill: colors.text,
        anchor: 'middle',
        mono: true,
        weight: '600',
      });
      const cx = L.cx(step.name);
      const cy = ROW_Y + BOX_H / 2;
      await tween(EFFECT_MS, mine, (p) => {
        const s = 1 - p;
        body.setAttribute(
          'transform',
          `translate(${round(cx)} ${round(cy + 10 * p)}) scale(${round(s)}) translate(${round(-cx)} ${round(-cy)})`,
        );
      });
    }

    return {
      async render(next: GcScene, _prev: GcScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        await animateStep(next, h, mine);
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
