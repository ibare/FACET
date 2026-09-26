/**
 * origin-pull 무대 — 빈 엣지에 온 요청들이 가는 중인 가져오기 하나에 매달렸다가 한꺼번에 풀린다.
 *
 * 왼쪽 줄: 요청마다 한 줄(도착 ms · 받은 뒤 기다림 ms). 가운데: 엣지와 그 아래 매달린 줄.
 * 오른쪽: 오리진과 엣지 ↔ 오리진 왕복 길. 가져오기는 그 길 위를 시각만큼 나아가는 점이다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { fetchProgress } from './algorithm.js';
import type { OriginPullScene } from './scene.js';

const H = 320;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const CHIP_W = 40;
const CHIP_H = 20;
const ROW_TOP = 52;
const ROW_BOTTOM = 232;

const EDGE_X = Math.round(W * 0.38);
const EDGE_W = Math.round(W * 0.24);
const BOX_Y = 40;
const BOX_H = 70;
const ORIGIN_W = Math.round(W * 0.19);
const ORIGIN_X = W - PAD - ORIGIN_W;
const TRACK_OUT_Y = 62;
const TRACK_BACK_Y = 88;
const QUEUE_X = EDGE_X + 8;
const QUEUE_TOP = BOX_Y + BOX_H + 18;
const QUEUE_BOTTOM = 270;

const MOVE_MS = 450;
const JOIN_MS = 550;
const HIT_HALF_MS = 330;
const RESP_A_MS = 300;
const RESP_B_MS = 400;

type Pt = { x: number; y: number };

type Handles = {
  chips: Map<string, SVGGElement>;
  rowNotes: Map<string, SVGTextElement>;
  marker: SVGGElement | null;
  slot: SVGGElement;
  clock: SVGTextElement;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return out === 0 ? 0 : out;
}

function lerp(a: Pt, b: Pt, p: number): Pt {
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function placeAt(g: SVGGElement, p: Pt): void {
  g.setAttribute('transform', `translate(${r1(p.x)} ${r1(p.y)})`);
}

/** 왕복 길 위의 자리 — 앞 절반은 엣지 → 오리진(위 길), 뒤 절반은 오리진 → 엣지(아래 길). */
function trackPoint(progress: number): Pt {
  const x0 = EDGE_X + EDGE_W;
  const x1 = ORIGIN_X;
  if (progress <= 0.5) return { x: x0 + (x1 - x0) * (progress / 0.5), y: TRACK_OUT_Y };
  return { x: x1 - (x1 - x0) * ((progress - 0.5) / 0.5), y: TRACK_BACK_Y };
}

export const originPullStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const fsXs = parseFloat(fontSizes.xs);
    const fsSm = parseFloat(fontSizes.sm);
    const fsMd = parseFloat(fontSizes.md);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function rowPos(i: number, n: number): Pt {
      const step = n > 1 ? Math.min(34, (ROW_BOTTOM - ROW_TOP) / (n - 1)) : 0;
      return { x: PAD, y: ROW_TOP + i * step };
    }

    function queuePos(k: number, n: number): Pt {
      const step = Math.min(CHIP_H + 6, (QUEUE_BOTTOM - QUEUE_TOP) / Math.max(1, n));
      return { x: QUEUE_X, y: QUEUE_TOP + k * step };
    }

    const doorPos: Pt = { x: EDGE_X + 4, y: BOX_Y + BOX_H / 2 - CHIP_H / 2 };

    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      o: { size?: number; fill?: string; anchor?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r1(x),
          y: r1(y),
          'font-family': o.mono ? fonts.mono : fonts.body,
          'font-size': o.size ?? fsSm,
          fill: o.fill ?? colors.text,
          'text-anchor': o.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (o.weight) node.setAttribute('font-weight', o.weight);
      node.textContent = s;
      return node;
    }

    function chip(parent: Element, id: string, state: 'ahead' | 'waiting' | 'served', at: Pt): SVGGElement {
      const g = el('g', {}, parent);
      placeAt(g, at);
      const fill = state === 'waiting' ? colors.itemComparing : state === 'served' ? colors.primary : colors.bg;
      const ink = state === 'waiting' ? colors.stateInk : state === 'served' ? colors.textInverse : colors.textMuted;
      const box = el('rect', { x: 0, y: 0, width: CHIP_W, height: CHIP_H, rx: 4, fill }, g);
      if (state === 'ahead') {
        box.setAttribute('stroke', colors.textMuted);
        box.setAttribute('stroke-dasharray', '3 2');
      }
      text(g, CHIP_W / 2, CHIP_H / 2, id, { mono: true, fill: ink, anchor: 'middle', weight: '600' });
      return g;
    }

    function drawStatic(scene: OriginPullScene): Handles {
      svg.textContent = '';
      const n = scene.requests.length;

      // 시각
      const clock = text(svg, PAD, 22, scene.now === null ? '' : t('gauge.time', 'Time: {t} ms', { t: scene.now }), {
        size: fsMd,
        weight: '600',
      });

      // 왕복 길 — 가져오기가 가는 중이면 짙게
      const live = scene.fetch !== null;
      const trackInk = live ? colors.textMuted : colors.border;
      const x0 = EDGE_X + EDGE_W;
      const x1 = ORIGIN_X;
      el('line', { x1: x0, y1: TRACK_OUT_Y, x2: x1, y2: TRACK_OUT_Y, stroke: trackInk, 'stroke-width': 1.5 }, svg);
      el('line', { x1: x1, y1: TRACK_BACK_Y, x2: x0, y2: TRACK_BACK_Y, stroke: trackInk, 'stroke-width': 1.5 }, svg);
      el('path', { d: `M ${x1 - 7} ${TRACK_OUT_Y - 4} L ${x1} ${TRACK_OUT_Y} L ${x1 - 7} ${TRACK_OUT_Y + 4} Z`, fill: trackInk }, svg);
      el('path', { d: `M ${x0 + 7} ${TRACK_BACK_Y - 4} L ${x0} ${TRACK_BACK_Y} L ${x0 + 7} ${TRACK_BACK_Y + 4} Z`, fill: trackInk }, svg);
      text(svg, (x0 + x1) / 2, BOX_Y - 12, t('gauge.fetch', 'Fetch: {n} ms', { n: scene.fetchMs }), {
        size: fsXs,
        fill: colors.textMuted,
        anchor: 'middle',
      });

      // 가져오기 점과 거기 매달린 줄 — 줄은 점 아래에 그린다
      let marker: SVGGElement | null = null;
      if (scene.fetch !== null) {
        if (scene.now === null) throw new Error('origin-pull-stage: 가져오기가 있는데 시각이 없다');
        const p = trackPoint(fetchProgress(scene.now, scene.fetch.start, scene.fetch.end));
        marker = el('g', {}, svg);
        placeAt(marker, p);
        const head = queuePos(0, n);
        el(
          'line',
          {
            x1: 0,
            y1: 0,
            x2: r1(head.x + CHIP_W - p.x),
            y2: r1(head.y - p.y),
            stroke: colors.itemComparing,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          },
          marker,
        );
        el('circle', { cx: 0, cy: 0, r: 7, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 }, marker);
      }

      // 엣지
      el(
        'rect',
        { x: EDGE_X, y: BOX_Y, width: EDGE_W, height: BOX_H, rx: 6, fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5 },
        svg,
      );
      text(svg, EDGE_X + EDGE_W / 2, BOX_Y + 14, t('label.edge', 'Edge'), { anchor: 'middle', weight: '600' });
      const slot = el('g', {}, svg);
      const sx = EDGE_X + 10;
      const sy = BOX_Y + 28;
      const sw = EDGE_W - 20;
      const sh = 30;
      if (scene.cached === true) {
        el('rect', { x: sx, y: sy, width: sw, height: sh, rx: 4, fill: colors.accent }, slot);
        text(slot, sx + sw / 2, sy + sh / 2, scene.path, { mono: true, size: fsXs, fill: colors.stateInk, anchor: 'middle' });
      } else {
        el('rect', { x: sx, y: sy, width: sw, height: sh, rx: 4, fill: 'none', stroke: colors.border, 'stroke-dasharray': '4 3' }, slot);
        text(slot, sx + sw / 2, sy + sh / 2, t('label.empty', 'empty'), { size: fsXs, fill: colors.textMuted, anchor: 'middle' });
      }

      // 오리진
      el(
        'rect',
        { x: ORIGIN_X, y: BOX_Y, width: ORIGIN_W, height: BOX_H, rx: 6, fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5 },
        svg,
      );
      text(svg, ORIGIN_X + ORIGIN_W / 2, BOX_Y + BOX_H / 2, t('label.origin', 'Origin'), { anchor: 'middle', weight: '600' });
      if (scene.originCalls !== null) {
        text(
          svg,
          ORIGIN_X + ORIGIN_W / 2,
          BOX_Y + BOX_H + 18,
          t('gauge.originCalls', 'Origin requests: {n}', { n: scene.originCalls }),
          { anchor: 'middle', weight: '600' },
        );
      }

      // 매달린 줄의 수
      if (scene.fetch !== null || scene.queue.length > 0) {
        const qx = QUEUE_X + CHIP_W + 12;
        text(svg, qx, QUEUE_TOP + 44, t('gauge.waiting', 'Waiting: {n}', { n: scene.queue.length }), {
          fill: colors.text,
          weight: '600',
        });
      }

      // 요청 줄
      const chips = new Map<string, SVGGElement>();
      const rowNotes = new Map<string, SVGTextElement>();
      scene.requests.forEach((r, i) => {
        const rp = rowPos(i, n);
        const noteX = rp.x + CHIP_W + 8;
        const noteY = rp.y + CHIP_H / 2;
        if (r.state === 'served') {
          if (r.wait === null) throw new Error(`origin-pull-stage: 받은 요청 ${r.id} 에 기다림이 없다`);
          chips.set(r.id, chip(svg, r.id, 'served', rp));
          rowNotes.set(r.id, text(svg, noteX, noteY, t('row.wait', 'Wait: {n} ms', { n: r.wait }), { fill: colors.text }));
        } else {
          rowNotes.set(
            r.id,
            text(svg, noteX, noteY, t('row.arrives', 'Arrives: {n} ms', { n: r.at }), { fill: colors.textMuted }),
          );
          if (r.state === 'ahead') {
            chips.set(r.id, chip(svg, r.id, 'ahead', rp));
          } else {
            el(
              'rect',
              { x: rp.x, y: rp.y, width: CHIP_W, height: CHIP_H, rx: 4, fill: 'none', stroke: colors.border, 'stroke-dasharray': '3 2' },
              svg,
            );
          }
        }
      });
      scene.queue.forEach((id, k) => {
        chips.set(id, chip(svg, id, 'waiting', queuePos(k, n)));
      });

      // 캡션 — 지금 일어나는 일만
      const step = scene.step;
      let caption = '';
      if (step === null || step.kind === 'init') caption = t('caption.start', 'Nothing at the edge yet');
      else if (step.kind === 'miss') caption = t('caption.miss', 'Miss: {id}. The edge opens a fetch to the origin', { id: step.id });
      else if (step.kind === 'join') caption = t('caption.join', 'Miss: {id}. It joins the fetch already on its way', { id: step.id });
      else if (step.kind === 'hit') caption = t('caption.hit', 'Hit: {id}. Served straight from the edge', { id: step.id });
      else caption = t('caption.response', 'Origin response arrives. Kept at the edge and handed out together. Delivered: {n}', { n: step.ids.length });
      text(svg, PAD, H - 16, caption, { size: fsMd });

      return { chips, rowNotes, marker, slot, clock };
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
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

    function need<T>(v: T | undefined | null, what: string): T {
      if (v === undefined || v === null) throw new Error(`origin-pull-stage: 손잡이가 없다 — ${what}`);
      return v;
    }

    function live(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    async function animate(scene: OriginPullScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null || step.kind === 'init') return;
      const n = scene.requests.length;
      const indexOf = (id: string): number => {
        const i = scene.requests.findIndex((r) => r.id === id);
        if (i < 0) throw new Error(`origin-pull-stage: 바탕에 없는 요청 ${id}`);
        return i;
      };
      const nowTo = need(scene.now, 'now');
      const setClock = (p: number): void => {
        h.clock.textContent = t('gauge.time', 'Time: {t} ms', { t: Math.round(step.was + (nowTo - step.was) * p) });
      };

      if (step.kind === 'miss' || step.kind === 'join') {
        const g = need(h.chips.get(step.id), `chip ${step.id}`);
        const k = scene.queue.indexOf(step.id);
        if (k < 0) throw new Error(`origin-pull-stage: 줄에 없는 요청 ${step.id}`);
        const from = rowPos(indexOf(step.id), n);
        const to = queuePos(k, n);
        const fetch = need(scene.fetch, 'fetch');
        const marker = need(h.marker, 'marker');
        const pFrom = fetchProgress(Math.max(step.was, fetch.start), fetch.start, fetch.end);
        const pTo = fetchProgress(nowTo, fetch.start, fetch.end);
        await tween(step.kind === 'miss' ? MOVE_MS : JOIN_MS, mine, (p) => {
          placeAt(g, lerp(from, to, p));
          placeAt(marker, trackPoint(pFrom + (pTo - pFrom) * p));
          setClock(p);
        });
        return;
      }

      if (step.kind === 'hit') {
        const g = need(h.chips.get(step.id), `chip ${step.id}`);
        const note = need(h.rowNotes.get(step.id), `note ${step.id}`);
        const home = rowPos(indexOf(step.id), n);
        note.setAttribute('opacity', '0');
        await tween(HIT_HALF_MS, mine, (p) => {
          placeAt(g, lerp(home, doorPos, p));
          setClock(p);
        });
        if (!live(mine)) return;
        await tween(HIT_HALF_MS, mine, (p) => placeAt(g, lerp(doorPos, home, p)));
        if (!live(mine)) return;
        note.removeAttribute('opacity');
        return;
      }

      // response — 점이 엣지로 돌아와 자리를 채우고, 매달린 요청들이 한꺼번에 풀린다
      const back = step.ids.map((id, k) => ({
        g: need(h.chips.get(id), `chip ${id}`),
        note: need(h.rowNotes.get(id), `note ${id}`),
        from: queuePos(k, n),
        to: rowPos(indexOf(id), n),
      }));
      for (const b of back) {
        placeAt(b.g, b.from);
        b.note.setAttribute('opacity', '0');
      }
      h.slot.setAttribute('opacity', '0');
      const pFrom = fetchProgress(step.was, step.fetchStart, nowTo);
      const dot = el('g', {}, svg);
      el('circle', { cx: 0, cy: 0, r: 7, fill: colors.accent, stroke: colors.text, 'stroke-width': 1 }, dot);
      await tween(RESP_A_MS, mine, (p) => {
        placeAt(dot, trackPoint(pFrom + (1 - pFrom) * p));
        setClock(p);
      });
      if (!live(mine)) return;
      dot.remove();
      h.slot.removeAttribute('opacity');
      await tween(RESP_B_MS, mine, (p) => {
        for (const b of back) placeAt(b.g, lerp(b.from, b.to, p));
      });
      if (!live(mine)) return;
      for (const b of back) b.note.removeAttribute('opacity');
    }

    return {
      async render(next: OriginPullScene, prev: OriginPullScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null) return;
        await animate(next, h, mine);
        if (live(mine)) drawStatic(next);
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
