/**
 * accept-state 무대.
 *
 * 위는 기계(자리 동그라미 · 옮김 화살), 아래는 먹은 글자와 선 자리가 놓이는 줄.
 * 글자 하나를 먹을 때마다 지금 자리 표시(노란 원판)가 옮김 화살을 따라 실제로 건너가고,
 * 선 자리의 발자국이 기계에서 떨어져 아래 줄의 제 칸에 내려앉는다.
 * 다 먹으면 판정 고리가 멈춘 자리로 좁혀 들며 판정 표가 그 아래로 떨어진다 — 이때 앞서
 * 밟은 받는 자리 발자국은 흐려진다 (판정에 끼지 못한다).
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { isAccepting, matcherLabel, type AcceptStateFacetData } from './algorithm.js';
import type { AcceptStateScene } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MACHINE_Y = 122;
const STRIP_Y = 232;
const CAPTION_Y = 272;
const MACHINE_LEFT = 76;
const MACHINE_RIGHT = 50;
const STRIP_SIDE = 44;
/** 자리 동그라미 반지름의 상한 — 실제 크기는 간격에서 역산한다 */
const STATE_R_MAX = 26;
const SLOT_R_MAX = 16;
const MOVE_MS = 720;
const VERDICT_MS = 720;
const FRAME_MS = 16;
/** 판정에 끼지 못한 발자국의 흐림 */
const PASSED_DIM = 0.32;
/** 받는 자리 표시(겹 동그라미 + 이름)가 오른쪽 끝에서 차지하는 폭 */
const LEGEND_W = 160;

type Pt = { x: number; y: number };

type EdgeGeom =
  | { kind: 'loop'; p0: Pt; c1: Pt; c2: Pt; p3: Pt; label: Pt; center: Pt }
  | { kind: 'arc'; a: Pt; c: Pt; b: Pt; label: Pt; from: Pt; to: Pt };

type Layout = {
  stateR: number;
  slotR: number;
  statePos: Map<string, Pt>;
  edges: EdgeGeom[];
  slotPos: Pt[];
};

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/** 전체 u 가운데 [a, b] 구간의 진행률 */
function span(u: number, a: number, b: number): number {
  if (u <= a) return 0;
  if (u >= b) return 1;
  return (u - a) / (b - a);
}

function unit(dx: number, dy: number): Pt {
  const len = Math.hypot(dx, dy);
  if (len === 0) throw new Error('accept-state stage: 길이 0 인 옮김');
  return { x: dx / len, y: dy / len };
}

function layout(base: AcceptStateFacetData): Layout {
  const n = base.states.length;
  const gap = n > 1 ? (PIECE_CANVAS_W - MACHINE_LEFT - MACHINE_RIGHT) / (n - 1) : 0;
  const stateR = n > 1 ? Math.min(STATE_R_MAX, gap * 0.2) : STATE_R_MAX;
  const statePos = new Map<string, Pt>();
  base.states.forEach((s, i) => {
    const x = n > 1 ? MACHINE_LEFT + i * gap : PIECE_CANVAS_W / 2;
    statePos.set(s, { x, y: MACHINE_Y });
  });
  const at = (s: string): Pt => {
    const p = statePos.get(s);
    if (!p) throw new Error(`accept-state stage: 자리 ${s} 가 없다`);
    return p;
  };

  const edges = base.edges.map((e): EdgeGeom => {
    const p = at(e.from);
    const q = at(e.to);
    const R = stateR;
    if (e.from === e.to) {
      const p0 = { x: p.x - R * 0.5, y: p.y - R * 0.87 };
      const p3 = { x: p.x + R * 0.5, y: p.y - R * 0.87 };
      const c1 = { x: p.x - R * 1.5, y: p.y - R * 2.9 };
      const c2 = { x: p.x + R * 1.5, y: p.y - R * 2.9 };
      return { kind: 'loop', p0, c1, c2, p3, center: p, label: { x: p.x, y: p.y - R * 2.4 - 7 } };
    }
    const iFrom = base.states.indexOf(e.from);
    const iTo = base.states.indexOf(e.to);
    const reverse = base.edges.some((o) => o.from === e.to && o.to === e.from);
    const far = Math.abs(iFrom - iTo) > 1;
    // 이웃이고 맞옮김이 없으면 곧은 화살, 아니면 가는 쪽 기준 오른쪽으로 휜다
    const bend = far || reverse ? 0.28 * Math.hypot(q.x - p.x, q.y - p.y) : 0;
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const nrm = unit(-(q.y - p.y), q.x - p.x);
    const c = { x: mid.x - nrm.x * bend, y: mid.y - nrm.y * bend };
    const da = unit(c.x - p.x, c.y - p.y);
    const db = unit(c.x - q.x, c.y - q.y);
    const a = { x: p.x + da.x * R, y: p.y + da.y * R };
    const b = { x: q.x + db.x * R, y: q.y + db.y * R };
    const top = { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 };
    return { kind: 'arc', a, c, b, from: p, to: q, label: { x: top.x, y: top.y - 8 } };
  });

  const slots = base.input.length + 1;
  const slotGap = slots > 1 ? (PIECE_CANVAS_W - 2 * STRIP_SIDE) / (slots - 1) : 0;
  const slotR = slots > 1 ? Math.min(SLOT_R_MAX, slotGap * 0.16) : SLOT_R_MAX;
  const slotPos: Pt[] = [];
  for (let k = 0; k < slots; k += 1) {
    slotPos.push({ x: slots > 1 ? STRIP_SIDE + k * slotGap : PIECE_CANVAS_W / 2, y: STRIP_Y });
  }
  return { stateR, slotR, statePos, edges, slotPos };
}

function cubic(p0: Pt, c1: Pt, c2: Pt, p3: Pt, u: number): Pt {
  const v = 1 - u;
  return {
    x: v * v * v * p0.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * p3.x,
    y: v * v * v * p0.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * p3.y,
  };
}

function quad(a: Pt, c: Pt, b: Pt, u: number): Pt {
  const v = 1 - u;
  return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y };
}

/** 지금 자리 원판이 옮김을 따라 u 만큼 갔을 때의 자리 — 중심에서 나가 중심으로 든다 */
function puckAt(g: EdgeGeom, u: number): Pt {
  if (g.kind === 'loop') {
    if (u < 0.15) {
      const w = u / 0.15;
      return { x: lerp(g.center.x, g.p0.x, w), y: lerp(g.center.y, g.p0.y, w) };
    }
    if (u > 0.85) {
      const w = (u - 0.85) / 0.15;
      return { x: lerp(g.p3.x, g.center.x, w), y: lerp(g.p3.y, g.center.y, w) };
    }
    return cubic(g.p0, g.c1, g.c2, g.p3, (u - 0.15) / 0.7);
  }
  return quad(g.from, g.c, g.to, u);
}

function arrowHead(tip: Pt, dir: Pt, size: number): string {
  const back = { x: tip.x - dir.x * size, y: tip.y - dir.y * size };
  const side = { x: -dir.y * size * 0.5, y: dir.x * size * 0.5 };
  return [tip, { x: back.x + side.x, y: back.y + side.y }, { x: back.x - side.x, y: back.y - side.y }]
    .map((p) => `${round(p.x)},${round(p.y)}`)
    .join(' ');
}

type Handles = {
  puck: SVGCircleElement | null;
  slot: SVGGElement | null;
  /** 판정 고리와 그릴 때 준 반지름 — 운동이 그 값으로 좁혀 든다 */
  verdictRings: { ring: SVGCircleElement; r: number }[];
  verdictTag: SVGGElement | null;
  passedSlots: SVGGElement[];
};

export const acceptStateStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const monoPx = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let cachedBase: AcceptStateFacetData | null = null;
    let cachedLayout: Layout | null = null;

    function geom(base: AcceptStateFacetData): Layout {
      if (cachedBase !== base || !cachedLayout) {
        cachedBase = base;
        cachedLayout = layout(base);
      }
      return cachedLayout;
    }

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      str: string,
      opts: { size: string; fill: string; mono?: boolean; anchor?: string; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'central',
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = str;
      return node;
    }

    function drawMachine(scene: AcceptStateScene, L: Layout, root: SVGGElement, h: Handles): void {
      const { base } = scene;
      const R = L.stateR;
      const current = scene.trail[scene.trail.length - 1] as string;
      const g = el('g', {}, root);

      // 옮김
      base.edges.forEach((e, i) => {
        const eg = L.edges[i] as EdgeGeom;
        const txt = matcherLabel(e.on);
        if (eg.kind === 'loop') {
          el(
            'path',
            {
              d: `M${round(eg.p0.x)},${round(eg.p0.y)} C${round(eg.c1.x)},${round(eg.c1.y)} ${round(eg.c2.x)},${round(eg.c2.y)} ${round(eg.p3.x)},${round(eg.p3.y)}`,
              fill: 'none',
              stroke: colors.textMuted,
              'stroke-width': 1.5,
            },
            g,
          );
          const dir = unit(eg.p3.x - eg.c2.x, eg.p3.y - eg.c2.y);
          el('polygon', { points: arrowHead(eg.p3, dir, 8), fill: colors.textMuted }, g);
        } else {
          el(
            'path',
            {
              d: `M${round(eg.a.x)},${round(eg.a.y)} Q${round(eg.c.x)},${round(eg.c.y)} ${round(eg.b.x)},${round(eg.b.y)}`,
              fill: 'none',
              stroke: colors.textMuted,
              'stroke-width': 1.5,
            },
            g,
          );
          const dir = unit(eg.b.x - eg.c.x, eg.b.y - eg.c.y);
          el('polygon', { points: arrowHead(eg.b, dir, 8), fill: colors.textMuted }, g);
        }
        label(g, eg.label.x, eg.label.y, txt, { size: fontSizes.sm, fill: colors.text, mono: true });
      });

      // 시작 화살
      const s0 = L.statePos.get(base.start) as Pt;
      const startTip = { x: s0.x - R, y: s0.y };
      el('line', { x1: startTip.x - 40, y1: s0.y, x2: startTip.x - 8, y2: s0.y, stroke: colors.textMuted, 'stroke-width': 1.5 }, g);
      el('polygon', { points: arrowHead(startTip, { x: 1, y: 0 }, 8), fill: colors.textMuted }, g);
      label(g, startTip.x - 26, s0.y - 12, t('label.start', 'start'), { size: fontSizes.xs, fill: colors.textMuted });

      // 자리 바탕
      for (const s of base.states) {
        const p = L.statePos.get(s) as Pt;
        el('circle', { cx: p.x, cy: p.y, r: R, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, g);
      }

      // 지금 자리 원판 — 자리 글자 밑, 받는 자리 안쪽 고리 밑
      const cp = L.statePos.get(current) as Pt;
      h.puck = el('circle', { cx: cp.x, cy: cp.y, r: R - 7, fill: colors.accent }, g);

      for (const s of base.states) {
        const p = L.statePos.get(s) as Pt;
        if (isAccepting(base, s)) {
          el('circle', { cx: p.x, cy: p.y, r: R - 4, fill: 'none', stroke: colors.text, 'stroke-width': 1.5 }, g);
        }
        label(g, p.x, p.y, s, {
          size: fontSizes.md,
          fill: s === current ? colors.stateInk : colors.text,
          mono: true,
          weight: '600',
        });
      }
    }

    function drawSlot(parent: Element, base: AcceptStateFacetData, state: string, r: number): SVGGElement {
      const g = el('g', {}, parent);
      el('circle', { cx: 0, cy: 0, r, fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5 }, g);
      if (isAccepting(base, state)) {
        el('circle', { cx: 0, cy: 0, r: r - 3.5, fill: 'none', stroke: colors.text, 'stroke-width': 1.2 }, g);
      }
      label(g, 0, 0, state, { size: fontSizes.sm, fill: colors.text, mono: true, weight: '600' });
      return g;
    }

    function drawStrip(scene: AcceptStateScene, L: Layout, root: SVGGElement, h: Handles): void {
      const { base } = scene;
      const r = L.slotR;
      const g = el('g', {}, root);
      label(g, STRIP_SIDE - r, STRIP_Y - r - 22, t('label.trail', 'Characters read · positions stood on'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'start',
      });

      const eaten = scene.trail.length - 1;
      // 글자 — 먹은 것은 화살 위에 진하게, 남은 것은 흐린 점선 위에
      for (let i = 0; i < base.input.length; i += 1) {
        const a = L.slotPos[i] as Pt;
        const b = L.slotPos[i + 1] as Pt;
        const done = i < eaten;
        el(
          'line',
          {
            x1: a.x + r + 4,
            y1: a.y,
            x2: b.x - r - 6,
            y2: b.y,
            stroke: done ? colors.text : colors.border,
            'stroke-width': 1.5,
            ...(done ? {} : { 'stroke-dasharray': '3 4' }),
          },
          g,
        );
        if (done) el('polygon', { points: arrowHead({ x: b.x - r - 2, y: b.y }, { x: 1, y: 0 }, 7), fill: colors.text }, g);
        label(g, (a.x + b.x) / 2, a.y - 13, base.input.charAt(i), {
          size: fontSizes.md,
          fill: done ? colors.text : colors.textMuted,
          mono: true,
          weight: done ? '600' : '400',
        });
      }

      // 아직 서지 않은 칸
      for (let k = scene.trail.length; k < L.slotPos.length; k += 1) {
        const p = L.slotPos[k] as Pt;
        el('circle', { cx: p.x, cy: p.y, r, fill: 'none', stroke: colors.border, 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }, g);
      }

      // 선 자리 발자국
      const last = scene.trail.length - 1;
      scene.trail.forEach((state, k) => {
        const p = L.slotPos[k] as Pt;
        const slot = drawSlot(g, base, state, r);
        slot.setAttribute('transform', `translate(${round(p.x)},${round(p.y)})`);
        if (k === last) h.slot = slot;
        // 판정 뒤: 멈춘 자리 말고 앞서 선 받는 자리는 흐려진다
        if (scene.verdict && k > 0 && k < last && isAccepting(base, state)) {
          slot.setAttribute('opacity', String(PASSED_DIM));
          h.passedSlots.push(slot);
        }
      });
    }

    function drawVerdict(scene: AcceptStateScene, L: Layout, root: SVGGElement, h: Handles): void {
      const v = scene.verdict;
      if (!v) return;
      const color = v.accepted ? colors.primary : colors.danger;
      const sp = L.statePos.get(v.state) as Pt;
      const lastSlot = L.slotPos[L.slotPos.length - 1] as Pt;
      const g = el('g', {}, root);
      const stateRing = L.stateR + 7;
      const slotRing = L.slotR + 6;
      h.verdictRings.push({
        ring: el('circle', { cx: sp.x, cy: sp.y, r: stateRing, fill: 'none', stroke: color, 'stroke-width': 3 }, g),
        r: stateRing,
      });
      h.verdictRings.push({
        ring: el('circle', { cx: lastSlot.x, cy: lastSlot.y, r: slotRing, fill: 'none', stroke: color, 'stroke-width': 3 }, g),
        r: slotRing,
      });
      const word = v.accepted ? t('label.accept', 'accepted') : t('label.reject', 'rejected');
      const tag = el('g', {}, g);
      const tagW = Math.max(64, word.length * monoPx * 0.9 + 24);
      const tagY = sp.y + L.stateR + 26;
      el('rect', { x: -tagW / 2, y: -13, width: tagW, height: 26, rx: 4, fill: colors.bg, stroke: color, 'stroke-width': 2 }, tag);
      label(tag, 0, 0, word, { size: fontSizes.md, fill: color, weight: '700' });
      tag.setAttribute('transform', `translate(${round(sp.x)},${round(tagY)})`);
      h.verdictTag = tag;
    }

    function drawCaption(scene: AcceptStateScene, root: SVGGElement): void {
      const { base, step } = scene;
      const left = base.input.length - (scene.trail.length - 1);
      const lines: string[] = [];
      if (step.kind === 'start') {
        lines.push(t('caption.start', 'Start at {state}. Characters to read: {n}', { state: base.start, n: left }));
      } else if (step.kind === 'move') {
        const vars = { ch: step.ch, from: step.from, to: step.to, n: left };
        lines.push(
          isAccepting(base, step.to)
            ? t('caption.moveAccepting', "Read '{ch}': {from} → {to}, an accepting state. Characters left: {n}", vars)
            : t('caption.move', "Read '{ch}': {from} → {to}. Characters left: {n}", vars),
        );
      } else {
        const v = scene.verdict;
        if (!v) throw new Error('accept-state stage: 판정 걸음에 판정이 없다');
        lines.push(
          v.accepted
            ? t('caption.verdictAccept', 'Input used up. Stopped at {state}, an accepting state: accepted', { state: v.state })
            : t('caption.verdictReject', 'Input used up. Stopped at {state}, not an accepting state: rejected', { state: v.state }),
        );
        if (v.passed > 0) {
          lines.push(t('caption.passed', 'Steps that stood on an accepting state before the stop: {k}. They do not count', { k: v.passed }));
        }
      }
      lines.forEach((line, i) => {
        label(root, PIECE_CANVAS_W / 2, CAPTION_Y + i * 18, line, { size: fontSizes.md, fill: colors.text });
      });
    }

    function drawHeader(scene: AcceptStateScene, root: SVGGElement): void {
      label(root, 16, 20, t('label.pattern', 'Pattern'), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'start' });
      label(root, 16, 38, scene.base.pattern, { size: fontSizes.md, fill: colors.text, mono: true, anchor: 'start' });
      // 겹 동그라미 = 받는 자리 — 동그라미를 앞에 박고 글자는 그 뒤로 흘린다 (글자 폭을 셈하지 않는다)
      const legend = el('g', {}, root);
      const cx = PIECE_CANVAS_W - LEGEND_W;
      el('circle', { cx, cy: 24, r: 8, fill: 'none', stroke: colors.text, 'stroke-width': 1.2 }, legend);
      el('circle', { cx, cy: 24, r: 5, fill: 'none', stroke: colors.text, 'stroke-width': 1.2 }, legend);
      label(legend, cx + 14, 24, t('label.accepting', 'accepting state'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'start',
      });
    }

    function drawStatic(scene: AcceptStateScene): Handles {
      svg.textContent = '';
      const h: Handles = { puck: null, slot: null, verdictRings: [], verdictTag: null, passedSlots: [] };
      const L = geom(scene.base);
      const root = el('g', {}, svg);
      drawHeader(scene, root);
      drawMachine(scene, L, root, h);
      drawStrip(scene, L, root, h);
      drawVerdict(scene, L, root, h);
      drawCaption(scene, root);
      return h;
    }

    /** 한 시계로 frame(u) 를 0 → 1 까지 흘린다. destroy 되면 곧바로 풀린다. */
    function run(ms: number, mine: number, frame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const total = Math.max(1, Math.ceil(ms / FRAME_MS));
        let i = 0;
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return wake();
          i += 1;
          frame(Math.min(1, i / total));
          if (i >= total) return wake();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    async function animateMove(scene: AcceptStateScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'move') return;
      const L = geom(scene.base);
      const eg = L.edges[step.edge] as EdgeGeom;
      const from = L.statePos.get(step.to) as Pt;
      const to = L.slotPos[scene.trail.length - 1] as Pt;
      const scale0 = L.stateR / L.slotR;
      await run(MOVE_MS, mine, (u) => {
        if (h.puck) {
          const p = puckAt(eg, ease(span(u, 0, 0.62)));
          h.puck.setAttribute('cx', String(round(p.x)));
          h.puck.setAttribute('cy', String(round(p.y)));
        }
        if (h.slot) {
          // 발자국은 옮긴 자리에서 떨어져 나와 아래 줄 제 칸으로 내려앉는다
          const w = ease(span(u, 0.45, 1));
          const x = lerp(from.x, to.x, w);
          const y = lerp(from.y, to.y, w);
          const s = lerp(scale0, 1, w);
          h.slot.setAttribute('transform', `translate(${round(x)},${round(y)}) scale(${round(s)})`);
        }
      });
    }

    async function animateVerdict(scene: AcceptStateScene, h: Handles, mine: number): Promise<void> {
      if (!scene.verdict) return;
      const L = geom(scene.base);
      const sp = L.statePos.get(scene.verdict.state) as Pt;
      const tagY = sp.y + L.stateR + 26;
      await run(VERDICT_MS, mine, (u) => {
        const w = ease(u);
        for (const { ring, r } of h.verdictRings) ring.setAttribute('r', String(round(lerp(r * 2.6, r, w))));
        if (h.verdictTag) {
          const y = lerp(tagY - 70, tagY, ease(span(u, 0.2, 1)));
          h.verdictTag.setAttribute('transform', `translate(${round(sp.x)},${round(y)})`);
        }
        for (const slot of h.passedSlots) slot.setAttribute('opacity', String(round(lerp(1, PASSED_DIM, w))));
      });
    }

    return {
      async render(next: AcceptStateScene, _prev: AcceptStateScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        if (next.step.kind === 'move') await animateMove(next, h, mine);
        else if (next.step.kind === 'verdict') await animateVerdict(next, h, mine);
        else return;
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
