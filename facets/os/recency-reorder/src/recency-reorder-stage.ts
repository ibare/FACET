/**
 * 최근 사용 갱신 — stage.
 *
 * 줄은 세로로 선다. 맨 위가 가장 최근에 쓴 페이지, 맨 아래가 다음에 나갈 페이지다.
 * 걸음마다 줄 한 벌이 오른쪽에 새로 서고, 지난 벌들은 옅게 남아 페이지마다 자리를 잇는
 * 선이 그려진다 — 한 번도 당겨지지 않은 페이지의 선은 아래로만 내려간다.
 *
 * 운동 (이번 걸음의 벌 안에서)
 *   적중 — 쓰인 페이지가 줄에서 옆으로 빠져나와 맨 위로 올라가고, 그 위에 있던 것들이 한 칸씩
 *          내려앉는다. 그리고 빈 맨 위 자리로 들어간다
 *   폴트 — 맨 아래 페이지가 찾는 셈 없이 그대로 아래로 떨어져 나가고, 나머지가 한 칸씩
 *          내려앉고, 참조한 새 페이지가 위에서 맨 위 자리로 내려온다
 */
import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { RecencyColumn, RecencyScene } from './scene.js';

const H = 392;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 한 번의 길이 (ms) */
const MOTION_MS = 1000;
/** 운동 프레임 간격 (ms) */
const TICK_MS = 16;

/** 상한들 — 실제 크기는 캔버스에서 역산한다 */
const LABEL_W_MAX = 112;
const CARD_W_MAX = 58;
const ROW_H_MAX = 48;

type Layout = {
  labelW: number;
  colW: number;
  cardW: number;
  cardH: number;
  rowH: number;
  rowTop: number;
  headY: number;
  outY: number;
  dividerY: number;
  countY: number;
  capY1: number;
  capY2: number;
  frames: number;
};

function layoutFor(scene: RecencyScene): Layout {
  const W = PIECE_CANVAS_W;
  const n = scene.refs.length + 1;
  const frames = Math.max(1, scene.frames);
  const labelW = Math.min(LABEL_W_MAX, W * 0.18);
  const colW = (W - labelW - 12) / n;
  const headY = 30;
  const rowTop = 56;
  const rowsSpace = 192;
  const rowH = Math.min(ROW_H_MAX, rowsSpace / frames);
  const cardW = Math.min(CARD_W_MAX, colW * 0.6);
  const cardH = Math.min(34, rowH * 0.74);
  const dividerY = rowTop + rowH * frames + 8;
  const outY = dividerY + 8 + rowH / 2;
  const countY = outY + rowH / 2 + 26;
  return {
    labelW,
    colW,
    cardW,
    cardH,
    rowH,
    rowTop,
    headY,
    outY,
    dividerY,
    countY,
    capY1: countY + 22,
    capY2: countY + 42,
    frames,
  };
}

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function colX(L: Layout, i: number): number {
  return L.labelW + L.colW * (i + 0.5);
}

function rowY(L: Layout, r: number): number {
  return L.rowTop + L.rowH * (r + 0.5);
}

function ease(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function span(u: number, a: number, b: number): number {
  return ease((u - a) / (b - a));
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  opts: { size: string; fill: string; anchor?: string; weight?: string; family?: string },
): SVGTextElement {
  const node = el(
    'text',
    {
      x,
      y,
      'font-family': opts.family ?? fonts.body,
      'font-size': opts.size,
      fill: opts.fill,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'central',
    },
    parent,
  );
  if (opts.weight) node.setAttribute('font-weight', opts.weight);
  node.textContent = text;
  return node;
}

/** 이번 걸음의 운동 전 자리 — 끝 자리에서 얼마나 떨어져 있는가 */
type Offset = { page: number; dx: (u: number) => number; dy: (u: number) => number };

function offsetsFor(L: Layout, prev: RecencyColumn, cur: RecencyColumn): Offset[] {
  const out: Offset[] = [];
  if (cur.kind === 'hit') {
    const f = cur.from;
    const lift = L.colW * 0.55;
    const rise = rowY(L, f) - rowY(L, 0);
    out.push({
      page: cur.page,
      dx: (u) => lift * (u < 0.3 ? span(u, 0, 0.3) : 1 - span(u, 0.75, 1)),
      dy: (u) => rise * (1 - span(u, 0.3, 0.75)),
    });
    for (let j = 0; j < f; j += 1) {
      const page = prev.order[j];
      if (page === undefined) throw new Error(`recency-reorder: 앞 줄에 자리 ${j} 가 없다`);
      out.push({ page, dx: () => 0, dy: (u) => -L.rowH * (1 - span(u, 0.3, 0.75)) });
    }
  } else if (cur.kind === 'fault') {
    const back = prev.order.length - 1;
    out.push({
      page: cur.out,
      dx: () => 0,
      dy: (u) => (rowY(L, back) - L.outY) * (1 - span(u, 0, 0.35)),
    });
    for (let j = 0; j < back; j += 1) {
      const page = prev.order[j];
      if (page === undefined) throw new Error(`recency-reorder: 앞 줄에 자리 ${j} 가 없다`);
      out.push({ page, dx: () => 0, dy: (u) => -L.rowH * (1 - span(u, 0.3, 0.7)) });
    }
    out.push({
      page: cur.page,
      dx: () => 0,
      dy: (u) => (L.headY - rowY(L, 0)) * (1 - span(u, 0.55, 1)),
    });
  }
  return out;
}

export const recencyReorderStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 이번 걸음 벌의 카드 — 운동이 옮길 손잡이 */
    let moving = new Map<number, SVGGElement>();
    let stepLines: SVGGElement | null = null;

    function card(
      parent: Element,
      x: number,
      y: number,
      L: Layout,
      page: number,
      look: 'past' | 'now' | 'moved' | 'outNow' | 'outPast',
    ): SVGGElement {
      const g = el('g', {}, parent);
      const fill =
        look === 'moved' ? c.itemActive : look === 'outNow' ? c.danger : look === 'now' ? c.bg : c.bgSubtle;
      const stroke =
        look === 'moved'
          ? c.itemActive
          : look === 'outNow' || look === 'outPast'
            ? c.danger
            : look === 'now'
              ? c.text
              : c.border;
      const ink =
        look === 'moved' || look === 'outNow' ? c.stateInk : look === 'now' ? c.text : c.textMuted;
      const rect = el(
        'rect',
        {
          x: x - L.cardW / 2,
          y: y - L.cardH / 2,
          width: L.cardW,
          height: L.cardH,
          rx: 6,
          fill,
          stroke,
          'stroke-width': look === 'past' || look === 'outPast' ? 1 : 1.5,
        },
        g,
      );
      if (look === 'outPast') rect.setAttribute('stroke-dasharray', '4 3');
      label(g, x, y, String(page), {
        size: look === 'past' || look === 'outPast' ? fontSizes.md : fontSizes.lg,
        fill: ink,
        anchor: 'middle',
        weight: look === 'past' || look === 'outPast' ? '400' : '600',
        family: fonts.mono,
      });
      return g;
    }

    function drawStatic(scene: RecencyScene): void {
      svg.textContent = '';
      moving = new Map();
      stepLines = null;
      if (scene.columns.length === 0) return;
      const L = layoutFor(scene);
      const W = PIECE_CANVAS_W;
      const last = scene.columns.length - 1;
      const back = L.frames - 1;

      // 다음에 나갈 자리 — 맨 아래 줄의 띠
      el(
        'rect',
        {
          x: L.labelW - 6,
          y: L.rowTop + L.rowH * back + 2,
          width: W - L.labelW,
          height: L.rowH - 4,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
        },
        svg,
      );
      el(
        'line',
        {
          x1: L.labelW - 6,
          y1: L.dividerY,
          x2: W - 6,
          y2: L.dividerY,
          stroke: c.border,
          'stroke-dasharray': '4 4',
        },
        svg,
      );

      // 왼쪽 이름표
      const lx = L.labelW - 14;
      const muted = { size: fontSizes.xs, fill: c.textMuted, anchor: 'end' };
      label(svg, lx, L.headY, t('label.ref', 'Reference'), muted);
      label(svg, lx, rowY(L, 0), t('label.front', 'Most recent'), muted);
      label(svg, lx, rowY(L, back), t('label.back', 'Next out'), muted);
      label(svg, lx, L.outY, t('label.out', 'Evicted'), muted);

      // 머리 — 참조 차례
      for (let i = 0; i <= scene.refs.length; i += 1) {
        const x = colX(L, i);
        if (i === 0) {
          label(svg, x, L.headY, t('label.start', 'Start'), {
            size: fontSizes.xs,
            fill: i === last ? c.text : c.textMuted,
            anchor: 'middle',
          });
          continue;
        }
        const ref = scene.refs[i - 1];
        if (ref === undefined) throw new Error(`recency-reorder: 참조 ${i - 1} 이 없다`);
        const col = scene.columns[i];
        const shown = col !== undefined;
        const fault = col?.kind === 'fault';
        const chipW = Math.min(30, L.colW * 0.4);
        const chip = el(
          'rect',
          {
            x: x - chipW / 2,
            y: L.headY - 11,
            width: chipW,
            height: 22,
            rx: 11,
            fill: c.bg,
            stroke: !shown ? c.ghostOutline : fault ? c.danger : c.text,
            'stroke-width': i === last ? 2 : 1,
          },
          svg,
        );
        if (!shown) chip.setAttribute('stroke-dasharray', '3 3');
        label(svg, x, L.headY, String(ref), {
          size: fontSizes.sm,
          fill: !shown ? c.textMuted : fault ? c.danger : c.text,
          anchor: 'middle',
          weight: i === last ? '600' : '400',
          family: fonts.mono,
        });
      }

      // 자리를 잇는 선
      for (let i = 1; i <= last; i += 1) {
        const prev = scene.columns[i - 1];
        const cur = scene.columns[i];
        if (prev === undefined || cur === undefined) throw new Error(`recency-reorder: 줄 ${i} 가 없다`);
        const layer = el('g', {}, svg);
        if (i === last) stepLines = layer;
        const x1 = colX(L, i - 1) + L.cardW / 2;
        const x2 = colX(L, i) - L.cardW / 2;
        const mid = (x1 + x2) / 2;
        prev.order.forEach((page, r1) => {
          const r2i = cur.order.indexOf(page);
          const gone = cur.kind === 'fault' && cur.out === page;
          if (r2i < 0 && !gone) {
            throw new Error(`recency-reorder: 페이지 ${page} 가 다음 줄에도, 내보낸 자리에도 없다`);
          }
          const y1 = rowY(L, r1);
          const y2 = gone ? L.outY : rowY(L, r2i);
          const pulled = cur.kind === 'hit' && cur.page === page;
          el(
            'path',
            {
              d: `M ${r2(x1)} ${r2(y1)} C ${r2(mid)} ${r2(y1)}, ${r2(mid)} ${r2(y2)}, ${r2(x2)} ${r2(y2)}`,
              fill: 'none',
              stroke: pulled ? c.itemActive : gone ? c.danger : c.ghostOutline,
              'stroke-width': pulled || gone ? 2 : 1.25,
            },
            layer,
          );
        });
      }

      // 줄들
      scene.columns.forEach((col, i) => {
        const x = colX(L, i);
        const now = i === last;
        const layer = el('g', {}, svg);
        col.order.forEach((page, r) => {
          const moved = col.kind !== 'start' && col.page === page;
          const g = card(layer, x, rowY(L, r), L, page, now ? (moved ? 'moved' : 'now') : 'past');
          if (now) moving.set(page, g);
        });
        if (col.kind === 'fault') {
          const g = card(layer, x, L.outY, L, col.out, now ? 'outNow' : 'outPast');
          if (now) moving.set(col.out, g);
        }
      });

      // 센 수
      let hits = 0;
      let faults = 0;
      for (const col of scene.columns) {
        if (col.kind === 'hit') hits += 1;
        if (col.kind === 'fault') faults += 1;
      }
      label(svg, 16, L.countY, t('label.hits', 'Hits: {n}', { n: hits }), {
        size: fontSizes.sm,
        fill: c.text,
        family: fonts.mono,
      });
      label(svg, 120, L.countY, t('label.faults', 'Faults: {n}', { n: faults }), {
        size: fontSizes.sm,
        fill: faults > 0 ? c.danger : c.text,
        family: fonts.mono,
      });

      // 캡션 — 지금 일어난 일
      const cur = scene.columns[last];
      if (cur === undefined) return;
      const main = { size: fontSizes.md, fill: c.text };
      const sub = { size: fontSizes.sm, fill: c.textMuted };
      if (cur.kind === 'start') {
        label(svg, 16, L.capY1, t('caption.start', 'Every frame is full. The line runs from last used to next out.'), main);
      } else if (cur.kind === 'hit') {
        label(svg, 16, L.capY1, t('caption.hit', 'Page {page}: hit. It is pulled to the front.', { page: cur.page }), main);
        label(svg, 16, L.capY2, t('caption.shift', 'Pushed back one place: {n}', { n: cur.from }), sub);
      } else {
        label(svg, 16, L.capY1, t('caption.fault', 'Page {page}: fault. The new page goes to the front.', { page: cur.page }), main);
        label(svg, 16, L.capY2, t('caption.evict', 'Leaves from the back, no search: page {out}', { out: cur.out }), sub);
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          timers.delete(id);
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(wake, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function move(mine: number, offsets: Offset[]): Promise<void> {
      const pose = (u: number): void => {
        for (const o of offsets) {
          const g = moving.get(o.page);
          if (g === undefined) throw new Error(`recency-reorder: 이번 줄에 페이지 ${o.page} 가 없다`);
          g.setAttribute('transform', `translate(${r2(o.dx(u))} ${r2(o.dy(u))})`);
        }
      };
      // 끝 자리가 번쩍이지 않게 첫 자세를 곧바로 둔다
      pose(0);
      if (stepLines) stepLines.setAttribute('opacity', '0');
      const frames = Math.ceil(MOTION_MS / TICK_MS);
      for (let k = 1; k <= frames; k += 1) {
        await wait(TICK_MS);
        if (mine !== gen || destroyed) return;
        pose(k / frames);
      }
    }

    return {
      async render(next: RecencyScene, prev: RecencyScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        const k = next.columns.length - 1;
        if (!opts.animate || prev === null || prev.columns.length !== k || k < 1) return;
        const before = next.columns[k - 1];
        const cur = next.columns[k];
        if (before === undefined || cur === undefined) return;
        const L = layoutFor(next);
        await move(mine, offsetsFor(L, before, cur));
        if (mine !== gen || destroyed) return;
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
