/**
 * 누출 버킷 무대 — 위 시간 축에 몰려 온 요청, 왼쪽에 통, 아래 시간 축에 흘러나간 요청.
 *
 * 동사는 "흘러나간다". 한 초에 몰려 온 요청이 위 축에서 통 입구로 떨어져 들어차고,
 * 흘리는 초에는 통 머리가 바닥 구멍으로 빠져 아래 축의 그 초 자리로 간다. 남은 요청은
 * 한 칸씩 내려앉는다. 통이 찼을 때 온 요청은 테두리를 넘어 바깥으로 떨어진다.
 * 위 축의 간격은 들쭉날쭉하고 아래 축의 간격은 고르다 — 두 축의 간격 글자는 장면의 셈이다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { isLeakSecond } from './algorithm.js';
import type { LeakyBucketScene } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

const IN_MS = 450;
const OUT_MS = 560;

type Pt = { x: number; y: number };

type Geometry = {
  chipR: number;
  recR: number;
  topY: number;
  exitY: number;
  laneY: number;
  ax0: number;
  ax1: number;
  bx0: number;
  bx1: number;
  cx: number;
  by0: number;
  by1: number;
  slotH: number;
};

function geometry(capacity: number): Geometry {
  const W = PIECE_CANVAS_W;
  const by0 = 158;
  const room = 102;
  const slotH = Math.min(32, room / capacity);
  const chipR = Math.min(12, slotH / 2 - 2);
  if (chipR < 4) throw new Error(`leaky-bucket-stage: 용량 ${capacity} 은 통에 담기지 않는다`);
  const bw = Math.min(96, W * 0.15);
  const bx0 = Math.round(W * 0.11);
  const exitY = 300;
  return {
    chipR,
    recR: 11,
    topY: 112,
    exitY,
    laneY: exitY - 16,
    ax0: Math.round(W * 0.4),
    ax1: W - 30,
    bx0,
    bx1: bx0 + bw,
    cx: bx0 + bw / 2,
    by0,
    by1: by0 + capacity * slotH + 6,
    slotH,
  };
}

function round(n: number): number {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function narrowTheme(v: unknown): 'light' | 'dark' {
  return v === 'dark' ? 'dark' : 'light';
}

export const leakyBucketStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(narrowTheme(params.theme));
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    /** 정적 그리기가 매번 새로 짓는 손잡이 */
    let chips = new Map<string, SVGGElement>();
    let freshGap: SVGGElement | null = null;

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

    function label(parent: Element, x: number, y: number, text: string, attrs: Record<string, string | number>): SVGTextElement {
      const node = el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text, ...attrs }, parent);
      node.textContent = text;
      return node;
    }

    function xOf(g: Geometry, lastSec: number, sec: number): number {
      if (lastSec === 0) return g.ax0;
      return g.ax0 + ((g.ax1 - g.ax0) * sec) / lastSec;
    }

    function slotPt(g: Geometry, i: number): Pt {
      return { x: g.cx, y: g.by1 - 3 - g.slotH / 2 - i * g.slotH };
    }

    function spillPt(g: Geometry, i: number): Pt {
      return { x: g.bx0 - g.chipR - 18, y: g.by1 - g.chipR - i * (2 * g.chipR + 4) };
    }

    function recordPt(g: Geometry, scene: LeakyBucketScene, lastSec: number, id: string): Pt {
      const idx = scene.requests.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error(`leaky-bucket-stage: 요청 ${id} 가 바탕에 없다`);
      const at = scene.requests[idx].at;
      let k = 0;
      for (let i = 0; i < idx; i += 1) if (scene.requests[i].at === at) k += 1;
      return { x: xOf(g, lastSec, at), y: g.topY - g.recR - 4 - k * (2 * g.recR + 3) };
    }

    function exitPt(g: Geometry, lastSec: number, at: number): Pt {
      return { x: xOf(g, lastSec, at), y: g.laneY };
    }

    type ChipKind = 'wait' | 'out' | 'drop';

    function chip(parent: Element, g: Geometry, id: string, at: Pt, kind: ChipKind): SVGGElement {
      const node = el('g', { transform: `translate(${round(at.x)} ${round(at.y)})` }, parent);
      const fill = kind === 'out' ? colors.accent : colors.bg;
      const stroke = kind === 'drop' ? colors.danger : colors.text;
      const circle: Record<string, string | number> = { cx: 0, cy: 0, r: g.chipR, fill, stroke, 'stroke-width': 1.6 };
      if (kind === 'drop') circle['stroke-dasharray'] = '3 2';
      el('circle', circle, node);
      const ink = kind === 'out' ? colors.stateInk : kind === 'drop' ? colors.danger : colors.text;
      const txt = el(
        'text',
        {
          x: 0,
          y: smPx * 0.36,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: ink,
        },
        node,
      );
      txt.textContent = id;
      return node;
    }

    function drawStatic(scene: LeakyBucketScene): void {
      svg.textContent = '';
      chips = new Map();
      freshGap = null;
      const g = geometry(scene.capacity);
      const root = el('g', {}, svg);

      // 통 — 안쪽 바닥색, 벽, 바닥 가운데 구멍
      const holeHalf = g.chipR + 4;
      el('rect', { x: g.bx0, y: g.by0, width: g.bx1 - g.bx0, height: g.by1 - g.by0, fill: colors.bgSubtle }, root);
      el(
        'path',
        {
          d: `M ${round(g.bx0)} ${round(g.by0)} V ${round(g.by1)} H ${round(g.cx - holeHalf)} M ${round(g.cx + holeHalf)} ${round(g.by1)} H ${round(g.bx1)} V ${round(g.by0)}`,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 2.4,
          'stroke-linecap': 'round',
        },
        root,
      );
      label(root, g.bx1 + 10, g.by0 + 12, t('label.bucket', 'In bucket: {n} / {cap}', { n: scene.bucket.length, cap: scene.capacity }), {
        fill: colors.textMuted,
      });

      if (scene.lastSec === null || scene.arrivalGaps === null) return;
      const lastSec = scene.lastSec;
      const gaps = scene.arrivalGaps;

      // 지금 초의 세로줄
      if (scene.sec !== null) {
        const x = xOf(g, lastSec, scene.sec);
        el('line', { x1: x, y1: 20, x2: x, y2: g.exitY + 4, stroke: colors.border, 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, root);
      }

      // 위 축 — 들어온 시각
      el('line', { x1: g.ax0 - 6, y1: g.topY, x2: g.ax1 + 6, y2: g.topY, stroke: colors.textMuted, 'stroke-width': 1.2 }, root);
      label(root, g.ax0 - 16, g.topY + 4, t('label.arrive', 'Arrive'), { 'text-anchor': 'end', fill: colors.textMuted });
      for (let sec = 0; sec <= lastSec; sec += 1) {
        const x = xOf(g, lastSec, sec);
        el('line', { x1: x, y1: g.topY, x2: x, y2: g.topY + 4, stroke: colors.textMuted, 'stroke-width': 1 }, root);
      }
      scene.requests.forEach((r, i) => {
        const gap = gaps[i];
        if (gap === null || gap === 0) return;
        // 괄호 양 끝 요청이 모두 들어온 뒤에만 — 오기 전의 간격을 먼저 보이지 않는다
        if (!scene.arrived.includes(r.id) || !scene.arrived.includes(scene.requests[i - 1].id)) return;
        const x0 = xOf(g, lastSec, r.at - gap);
        const x1 = xOf(g, lastSec, r.at);
        const y = g.topY + 12;
        el('path', { d: `M ${round(x0)} ${y - 4} V ${y} H ${round(x1)} V ${y - 4}`, fill: 'none', stroke: colors.textMuted, 'stroke-width': 1 }, root);
        label(root, (x0 + x1) / 2, y + 14, t('label.gap', '{n} s', { n: gap }), {
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      });
      for (const r of scene.requests) {
        const p = recordPt(g, scene, lastSec, r.id);
        const came = scene.arrived.includes(r.id);
        const node = el('g', { transform: `translate(${round(p.x)} ${round(p.y)})` }, root);
        const circle: Record<string, string | number> = {
          cx: 0,
          cy: 0,
          r: g.recR,
          fill: came ? colors.bgSubtle : 'none',
          stroke: scene.dropped.includes(r.id) ? colors.danger : colors.textMuted,
          'stroke-width': 1.2,
        };
        if (!came) circle['stroke-dasharray'] = '3 2';
        el('circle', circle, node);
        const txt = el(
          'text',
          { x: 0, y: smPx * 0.33, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted },
          node,
        );
        txt.textContent = r.id;
      }

      // 아래 축 — 나간 시각. 흘리는 초의 눈금을 길게
      el('line', { x1: g.ax0 - 6, y1: g.exitY, x2: g.ax1 + 6, y2: g.exitY, stroke: colors.text, 'stroke-width': 1.4 }, root);
      label(root, g.ax0 - 16, g.exitY + 16, t('label.leave', 'Leave'), { 'text-anchor': 'end', fill: colors.textMuted });
      for (let sec = 0; sec <= lastSec; sec += 1) {
        const x = xOf(g, lastSec, sec);
        const leak = isLeakSecond(sec, scene.leakEvery);
        el('line', { x1: x, y1: g.exitY - (leak ? 6 : 0), x2: x, y2: g.exitY + 4, stroke: leak ? colors.text : colors.textMuted, 'stroke-width': leak ? 1.6 : 1 }, root);
        const now = scene.sec === sec;
        const num = label(root, x, g.exitY + 18, String(sec), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: now || leak ? colors.text : colors.textMuted,
        });
        if (now) num.setAttribute('font-weight', '700');
      }
      scene.exits.forEach((ex, i) => {
        if (ex.gap === null) return;
        const x0 = xOf(g, lastSec, ex.at - ex.gap) + g.chipR + 3;
        const x1 = xOf(g, lastSec, ex.at) - g.chipR - 3;
        const mid = (x0 + x1) / 2;
        const half = smPx * 1.3;
        const grp = el('g', {}, root);
        el('line', { x1: x0, y1: g.laneY, x2: mid - half, y2: g.laneY, stroke: colors.text, 'stroke-width': 1 }, grp);
        el('line', { x1: mid + half, y1: g.laneY, x2: x1, y2: g.laneY, stroke: colors.text, 'stroke-width': 1 }, grp);
        label(grp, mid, g.laneY + smPx * 0.36, t('label.gap', '{n} s', { n: ex.gap }), {
          'text-anchor': 'middle',
          'font-weight': 600,
        });
        if (i === scene.exits.length - 1) freshGap = grp;
      });

      // 요청 — 버린 것, 나간 것, 통 안
      scene.dropped.forEach((id, i) => chips.set(id, chip(root, g, id, spillPt(g, i), 'drop')));
      if (scene.dropped.length > 0) {
        const p = spillPt(g, 0);
        label(root, p.x, g.by1 + g.chipR + 10, t('label.dropped', 'Dropped'), { 'text-anchor': 'middle', fill: colors.danger, 'font-size': fontSizes.xs });
      }
      for (const ex of scene.exits) chips.set(ex.id, chip(root, g, ex.id, exitPt(g, lastSec, ex.at), 'out'));
      scene.bucket.forEach((id, i) => chips.set(id, chip(root, g, id, slotPt(g, i), 'wait')));

      // 캡션 — 이 초에 일어난 일
      const st = scene.step;
      if (st === null) return;
      const capY = 344;
      const lineH = 22;
      const capAttrs = { 'font-size': fontSizes.md };
      const ids = st.came.join(' ');
      let line1: string;
      if (st.came.length === 0) line1 = t('caption.noIn', 'Second {sec} · nothing arrives', { sec: st.sec });
      else if (st.dropped.length === 0) line1 = t('caption.in', 'Second {sec} · in: {ids}', { sec: st.sec, ids });
      else
        line1 = t('caption.inDrop', 'Second {sec} · in: {ids} · bucket full, dropped: {dropped}', {
          sec: st.sec,
          ids,
          dropped: st.dropped.join(' '),
        });
      label(root, 20, capY, line1, capAttrs);
      let line2: string;
      if (st.out !== null) {
        line2 =
          st.gap === null
            ? t('caption.outFirst', 'Leaks out: {id} · the first one', { id: st.out })
            : t('caption.out', 'Leaks out: {id} · gap since the last one: {gap} s', { id: st.out, gap: st.gap });
      } else if (isLeakSecond(st.sec, scene.leakEvery)) {
        line2 = t('caption.emptyTick', 'Leak second · bucket empty, nothing leaks');
      } else {
        line2 = t('caption.noTick', 'Not a leak second · nothing leaks');
      }
      label(root, 20, capY + lineH, line2, capAttrs);
      if (scene.sec === lastSec) {
        const ins = gaps.filter((x): x is number => x !== null).join(' ');
        const outs = scene.exits
          .map((ex) => ex.gap)
          .filter((x): x is number => x !== null)
          .join(' ');
        label(root, 20, capY + lineH * 2, t('caption.gaps', 'Gaps in (s): {ins} · gaps out (s): {outs}', { ins, outs }), {
          ...capAttrs,
          'font-weight': 600,
        });
      }
    }

    function place(node: SVGGElement, p: Pt): void {
      node.setAttribute('transform', `translate(${round(p.x)} ${round(p.y)})`);
    }

    /** 꺾인 길 위의 자리 — 길이 비율로 */
    function along(path: Pt[], p: number): Pt {
      if (path.length === 1) return path[0];
      const lens: number[] = [];
      let total = 0;
      for (let i = 1; i < path.length; i += 1) {
        const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
        lens.push(d);
        total += d;
      }
      if (total === 0) return path[path.length - 1];
      let left = p * total;
      for (let i = 0; i < lens.length; i += 1) {
        if (left <= lens[i] || i === lens.length - 1) {
          const k = lens[i] === 0 ? 1 : Math.min(1, left / lens[i]);
          return { x: path[i].x + (path[i + 1].x - path[i].x) * k, y: path[i].y + (path[i + 1].y - path[i].y) * k };
        }
        left -= lens[i];
      }
      return path[path.length - 1];
    }

    function ease(p: number): number {
      return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        let start: number | null = null;
        let id = 0;
        const wake = (): void => {
          waiters.delete(wake);
          frames.delete(id);
          resolve();
        };
        waiters.add(wake);
        const tick = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          if (start === null) start = now;
          const p = Math.min(1, (now - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            wake();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    function handle(id: string): SVGGElement {
      const node = chips.get(id);
      if (!node) throw new Error(`leaky-bucket-stage: 요청 ${id} 의 손잡이가 없다`);
      return node;
    }

    async function flow(next: LeakyBucketScene, mine: number): Promise<void> {
      const st = next.step;
      if (st === null || next.lastSec === null) throw new Error('leaky-bucket-stage: 흘릴 걸음이 없다');
      const lastSec = next.lastSec;
      const g = geometry(next.capacity);
      const mouth: Pt = { x: g.cx, y: g.by0 - g.chipR - 2 };
      const rim: Pt = { x: g.bx0 - g.chipR - 4, y: g.by0 - g.chipR - 6 };

      type Track = { id: string; node: SVGGElement; a: Pt[]; b: Pt[] };
      const tracks: Track[] = [];
      for (const id of st.came) {
        const from = recordPt(g, next, lastSec, id);
        if (st.dropped.includes(id)) {
          tracks.push({ id, node: handle(id), a: [from, rim, spillPt(g, next.dropped.indexOf(id))], b: [] });
        } else {
          const i = st.afterIn.indexOf(id);
          if (i < 0) throw new Error(`leaky-bucket-stage: 받은 요청 ${id} 가 통에 없다`);
          tracks.push({ id, node: handle(id), a: [from, mouth, slotPt(g, i)], b: [] });
        }
      }
      for (const id of st.before) {
        const i = st.afterIn.indexOf(id);
        if (i < 0) throw new Error(`leaky-bucket-stage: 통에 있던 ${id} 가 afterIn 에 없다`);
        tracks.push({ id, node: handle(id), a: [slotPt(g, i)], b: [] });
      }
      for (const tr of tracks) {
        const id = tr.id;
        const mid = tr.a[tr.a.length - 1];
        if (id === st.out) {
          const below: Pt = { x: g.cx, y: g.by1 + g.chipR + 4 };
          tr.b = [mid, below, { x: g.cx, y: g.laneY }, exitPt(g, lastSec, st.sec)];
        } else {
          const j = next.bucket.indexOf(id);
          tr.b = j < 0 ? [mid] : [mid, slotPt(g, j)];
        }
      }

      // 아직 못 온 만큼 — 출발 자리에 세운다
      for (const tr of tracks) place(tr.node, tr.a[0]);
      if (freshGap !== null && st.out !== null && st.gap !== null) freshGap.setAttribute('opacity', '0');

      if (st.came.length > 0) {
        await tween(IN_MS, mine, (p) => {
          for (const tr of tracks) place(tr.node, along(tr.a, p));
        });
        if (destroyed || mine !== gen) return;
      }
      for (const tr of tracks) place(tr.node, tr.b[0]);
      if (st.out !== null) {
        await tween(OUT_MS, mine, (p) => {
          for (const tr of tracks) place(tr.node, along(tr.b, p));
        });
      }
    }

    return {
      async render(next: LeakyBucketScene, prev: LeakyBucketScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        const st = next.step;
        const moves = st !== null && (st.came.length > 0 || st.out !== null);
        const joined = prev !== null && st !== null && prev.sec === st.sec - 1;
        if (!opts.animate || !moves || !joined) return;
        await flow(next, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
