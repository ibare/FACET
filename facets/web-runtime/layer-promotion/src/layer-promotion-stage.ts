/**
 * layer-promotion stage — 한 페이지 위의 두 배지.
 *
 * 페이지 장에 함께 칠해진 배지는 떠난 자리 · 들어간 자리에서 겹친 요소가 하나씩 다시
 * 칠해지며(켜지며) 옮겨지고, 제 장에 떼어 둔 배지는 합성 걸음에 장째 미끄러진다.
 * 오른쪽 칸은 배지마다 그 옮김으로 다시 칠한 서로 다른 요소를 센다.
 *
 * 요소의 자리는 겹침 자료에서 셈한다 — 모든 자리가 함께 겹치는 요소는 바탕(페이지 전체),
 * 나머지는 옛 자리 → 새 자리의 차례로 열을, 옮기는 요소의 차례로 줄을 얻는다.
 */

import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { LayerBase, LayerScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 340;
const W = PIECE_CANVAS_W;

const MARGIN = 16;
const CAPTION_TOP = 20;
const CAPTION_LINE = 18;
const PAGE_TOP = 78;
const PAGE_BOTTOM = H - 14;
/** 페이지가 가로에서 차지하는 몫 — 나머지가 셈 칸 */
const PAGE_SHARE = 0.62;
const GRID_PAD = 12;
const ITEM_INSET = 6;
const BADGE_W_MAX = 84;
const BADGE_H_MAX = 30;
const SHEET_PAD = 6;

const CHANGE_MS = 400;
const REPAINT_MS = 600;
const SLIDE_MS = 600;
const TICK_MS = 16;

const PX_XS = parseFloat(fontSizes.xs);
const PX_SM = parseFloat(fontSizes.sm);
const PX_MD = parseFloat(fontSizes.md);
const PX_XL = parseFloat(fontSizes.xl);

type Rect = { x: number; y: number; w: number; h: number };

type Layout = {
  backdrop: string | null;
  /** 바탕이 아닌 페이지 요소의 자리 */
  items: Map<string, Rect>;
  /** 옮기는 요소의 옛 자리 · 새 자리 */
  badges: Map<string, { before: Rect; after: Rect }>;
  page: Rect;
};

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

/** 겹침 자료에서 요소의 자리를 셈한다. 그릴 수 없는 모양이면 던진다. */
function layoutOf(base: LayerBase, page: Rect): Layout {
  const layout: Layout = { backdrop: null, items: new Map(), badges: new Map(), page };
  if (base.moves.length === 0) return layout;

  const spots = base.moves.flatMap((m) => [m.before, m.after]);
  const common = spots.reduce<string[]>((acc, s) => acc.filter((x) => s.includes(x)), [...spots[0]!]);
  if (common.length > 1) {
    throw new Error(`layer-promotion stage: 모든 자리와 겹치는 요소가 둘 이상이다 — ${common.join(', ')}`);
  }
  const backdrop = common.length === 1 ? common[0]! : null;
  layout.backdrop = backdrop;

  const only = (spot: string[], id: string): string => {
    const rest = spot.filter((x) => x !== backdrop);
    if (rest.length !== 1) {
      throw new Error(`layer-promotion stage: ${id} 의 한 자리가 바탕 말고 요소 하나와 겹쳐야 그릴 수 있다 — ${rest.join(', ')}`);
    }
    return rest[0]!;
  };
  const pairs = base.moves.map((m) => ({ id: m.id, from: only(m.before, m.id), to: only(m.after, m.id) }));

  // 열: 옛 자리 → 새 자리 를 잇는 가장 긴 길
  const names: string[] = [];
  for (const p of pairs) for (const n of [p.from, p.to]) if (!names.includes(n)) names.push(n);
  const col = new Map<string, number>(names.map((n) => [n, 0]));
  let settled = false;
  for (let round = 0; round <= names.length; round += 1) {
    let moved = false;
    for (const p of pairs) {
      const need = (col.get(p.from) ?? 0) + 1;
      if ((col.get(p.to) ?? 0) < need) {
        col.set(p.to, need);
        moved = true;
      }
    }
    if (!moved) {
      settled = true;
      break;
    }
  }
  if (!settled) throw new Error('layer-promotion stage: 옛 자리 → 새 자리 가 고리를 이룬다');
  const cols = Math.max(...names.map((n) => col.get(n) ?? 0)) + 1;
  const rows = pairs.length;

  // 줄: 요소가 나오는 옮김의 차례
  const span = new Map<string, { lo: number; hi: number }>();
  pairs.forEach((p, row) => {
    for (const n of [p.from, p.to]) {
      const s = span.get(n);
      span.set(n, s === undefined ? { lo: row, hi: row } : { lo: Math.min(s.lo, row), hi: Math.max(s.hi, row) });
    }
  });

  const moveIds = new Set(base.moves.map((m) => m.id));
  for (const id of base.page) {
    if (id === backdrop || moveIds.has(id)) continue;
    if (!col.has(id)) throw new Error(`layer-promotion stage: 어느 자리와도 겹치지 않아 놓을 곳이 없다 — ${id}`);
  }

  const gx = page.x + GRID_PAD;
  const gy = page.y + GRID_PAD;
  const cw = (page.w - GRID_PAD * 2) / cols;
  const ch = (page.h - GRID_PAD * 2) / rows;

  for (const n of names) {
    const c = col.get(n) ?? 0;
    const s = span.get(n) ?? { lo: 0, hi: 0 };
    for (const other of names) {
      if (other === n || col.get(other) !== c) continue;
      const o = span.get(other) ?? { lo: 0, hi: 0 };
      if (o.lo <= s.hi && s.lo <= o.hi) {
        throw new Error(`layer-promotion stage: ${n} · ${other} 가 같은 칸에 겹친다`);
      }
    }
    layout.items.set(n, {
      x: r2(gx + c * cw + ITEM_INSET),
      y: r2(gy + s.lo * ch + ITEM_INSET),
      w: r2(cw - ITEM_INSET * 2),
      h: r2((s.hi - s.lo + 1) * ch - ITEM_INSET * 2),
    });
  }

  const bw = Math.min(BADGE_W_MAX, cw * 0.55);
  const bh = Math.min(BADGE_H_MAX, ch * 0.34);
  const badgeAt = (c: number, row: number): Rect => ({
    x: r2(gx + c * cw + (cw - bw) / 2),
    y: r2(gy + row * ch + ch * 0.58 - bh / 2),
    w: r2(bw),
    h: r2(bh),
  });
  pairs.forEach((p, row) => {
    layout.badges.set(p.id, {
      before: badgeAt(col.get(p.from) ?? 0, row),
      after: badgeAt(col.get(p.to) ?? 0, row),
    });
  });
  return layout;
}

/** 글자 폭 어림 — 한글 · 한자권 · 데바나가리 글자는 넓게 */
function textWidth(s: string, px: number, mono: boolean): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (mono) w += px * 0.6;
    else if (code >= 0x1100) w += px * 0.95;
    else if (code >= 0x0900) w += px * 0.62;
    else w += px * 0.55;
  }
  return w;
}

function wrap(s: string, px: number, max: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && textWidth(next, px, false) > max) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

type Handles = {
  /** 이번 걸음에 켜지는 요소 — 켜짐 표시 (차례대로) */
  lit: { id: string; el: SVGElement }[];
  brush: SVGRectElement | null;
  brushW: number;
  arrows: { line: SVGLineElement; head: SVGElement; x1: number; x2: number }[];
  sheets: Map<string, { g: SVGGElement; dx: number }>;
};

export const layerPromotionStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

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

    function write(
      parent: Element,
      s: string,
      x: number,
      y: number,
      o: { px: number; fill: string; mono?: boolean; weight?: number; anchor?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          fill: o.fill,
          'font-family': o.mono === true ? fonts.mono : fonts.body,
          'font-size': o.px,
          'font-weight': o.weight ?? 400,
          'text-anchor': o.anchor ?? 'start',
        },
        parent,
      );
      node.textContent = s;
      return node;
    }

    function captionOf(scene: LayerScene): string {
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'Page sheet: {page}. Own sheet: {own}.', {
            page: scene.base.page.join(' · '),
            own: scene.base.promoted.map((p) => p.id).join(' · '),
          });
        case 'change':
          return t('caption.change', 'Changed once on {ids}: {decl}', {
            ids: step.ids.join(' · '),
            decl: scene.base.change,
          });
        case 'repaint':
          return step.spot === 'before'
            ? t('caption.repaintBefore', 'Page sheet, old spot of {id}. Repainting: {items}', {
                id: step.id,
                items: step.items.join(' · '),
              })
            : t('caption.repaintAfter', 'Page sheet, new spot of {id}. Repainting: {items}', {
                id: step.id,
                items: step.items.join(' · '),
              });
        case 'composite': {
          const n = scene.repainted
            .filter((r) => step.slid.includes(r.id))
            .reduce((sum, r) => sum + r.items.length, 0);
          return t('caption.composite', 'Composite: the sheet of {id} is only placed anew. Repainted for it: {n}', {
            id: step.slid.join(' · '),
            n,
          });
        }
      }
    }

    function drawStatic(scene: LayerScene): Handles {
      svg.textContent = '';
      const handles: Handles = { lit: [], brush: null, brushW: 0, arrows: [], sheets: new Map() };
      const base = scene.base;
      if (base.moves.length === 0) return handles;

      // 캡션
      const capLines = wrap(captionOf(scene), PX_MD, W - MARGIN * 2).slice(0, 2);
      capLines.forEach((line, i) => {
        write(svg, line, MARGIN, CAPTION_TOP + i * CAPTION_LINE, { px: PX_MD, fill: c.text });
      });

      const pageW = Math.round((W - MARGIN * 2) * PAGE_SHARE);
      const page: Rect = { x: MARGIN, y: PAGE_TOP, w: pageW, h: PAGE_BOTTOM - PAGE_TOP };
      const lay = layoutOf(base, page);

      const step = scene.step;
      const litAll = new Set(scene.repainted.flatMap((r) => r.items));
      const litNow = step.kind === 'repaint' ? step.items : [];
      const own = new Set(base.promoted.map((p) => p.id));

      // 페이지 장
      write(svg, t('label.pageSheet', 'Page sheet'), page.x, page.y - 8, { px: PX_SM, fill: c.textMuted });
      const pageG = el('g', {}, svg);
      el('rect', { x: page.x, y: page.y, width: page.w, height: page.h, rx: 6, fill: c.bg, stroke: c.border }, pageG);
      if (lay.backdrop !== null) {
        write(pageG, lay.backdrop, page.x + 8, page.y + page.h - 8, { px: PX_XS, fill: c.textMuted, mono: true });
      }
      for (const [id, r] of lay.items) {
        el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 4, fill: c.bgSubtle, stroke: c.border }, pageG);
        write(pageG, id, r.x + 6, r.y + PX_XS + 4, { px: PX_XS, fill: c.textMuted, mono: true });
      }

      // 페이지 장에 함께 칠해진 배지 — 지금 칠해진 자리에
      const litRect = (id: string): Rect | null => {
        if (id === lay.backdrop) return { x: page.x + 2, y: page.y + 2, w: page.w - 4, h: page.h - 4 };
        const item = lay.items.get(id);
        if (item !== undefined) return item;
        const b = lay.badges.get(id);
        if (b !== undefined && scene.placed.includes(id)) return b.after;
        return null;
      };
      const drawBadge = (parent: Element, id: string, r: Rect): SVGGElement => {
        const g = el('g', {}, parent);
        el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.h / 2, fill: c.primary }, g);
        write(g, id, r.x + r.w / 2, r.y + r.h / 2 + PX_XS * 0.35, {
          px: PX_XS,
          fill: c.textInverse,
          mono: true,
          anchor: 'middle',
        });
        return g;
      };
      const pageBadgeGroups = new Map<string, SVGGElement>();
      for (const m of base.moves) {
        if (own.has(m.id)) continue;
        const b = lay.badges.get(m.id);
        if (b === undefined) continue;
        if (scene.placed.includes(m.id)) pageBadgeGroups.set(m.id, drawBadge(pageG, m.id, b.after));
        else if (!scene.erased.includes(m.id)) pageBadgeGroups.set(m.id, drawBadge(pageG, m.id, b.before));
      }

      // 다시 칠하는 자리 — 이번 걸음의 더러운 자리와 붓
      if (step.kind === 'repaint') {
        const b = lay.badges.get(step.id);
        if (b !== undefined) {
          const s = step.spot === 'before' ? b.before : b.after;
          const d: Rect = { x: s.x - 4, y: s.y - 4, w: s.w + 8, h: s.h + 8 };
          handles.brush = el(
            'rect',
            { x: d.x, y: d.y, width: d.w, height: d.h, fill: c.itemComparing, 'fill-opacity': 0.25 },
            pageG,
          );
          handles.brushW = d.w;
          el('rect', {
            x: d.x,
            y: d.y,
            width: d.w,
            height: d.h,
            fill: 'none',
            stroke: c.itemComparing,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 3',
          }, pageG);
          write(
            pageG,
            step.spot === 'before' ? t('label.oldSpot', 'old spot') : t('label.newSpot', 'new spot'),
            d.x + d.w / 2,
            d.y - 5,
            { px: PX_XS, fill: c.itemComparing, anchor: 'middle', weight: 600 },
          );
        }
      }

      // 다시 칠한 요소 — 자취는 가는 테, 이번 걸음은 굵은 테
      for (const id of litAll) {
        const r = litRect(id);
        if (r === null) continue;
        const now = litNow.includes(id);
        const ring = el('rect', {
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          rx: id === lay.backdrop ? 5 : lay.badges.has(id) ? r.h / 2 : 4,
          fill: 'none',
          stroke: c.itemComparing,
          'stroke-width': now ? 3 : 1.75,
        }, pageG);
        if (now) handles.lit.push({ id, el: ring });
      }
      // 켜지는 차례는 이번 걸음이 칠한 차례
      handles.lit.sort((a, b) => litNow.indexOf(a.id) - litNow.indexOf(b.id));
      for (const h of handles.lit) {
        const g = pageBadgeGroups.get(h.id);
        if (g !== undefined) h.el = wrapPair(g, h.el);
      }

      // 바뀜 — 가야 할 자리(점선)와 화살
      for (const m of base.moves) {
        const b = lay.badges.get(m.id);
        if (b === undefined || !scene.changed) continue;
        const arrived = own.has(m.id) ? scene.slid.includes(m.id) : scene.placed.includes(m.id);
        if (arrived) continue;
        el('rect', {
          x: b.after.x,
          y: b.after.y,
          width: b.after.w,
          height: b.after.h,
          rx: b.after.h / 2,
          fill: 'none',
          stroke: c.textMuted,
          'stroke-dasharray': '4 3',
        }, svg);
        const y = r2(b.before.y + b.before.h / 2);
        const dir = b.after.x >= b.before.x ? 1 : -1;
        const x1 = r2(dir > 0 ? b.before.x + b.before.w + 4 : b.before.x - 4);
        const x2 = r2(dir > 0 ? b.after.x - 6 : b.after.x + b.after.w + 6);
        const line = el('line', { x1, y1: y, x2, y2: y, stroke: c.textMuted, 'stroke-width': 1.5 }, svg);
        const head = el('polygon', {
          points: `${x2},${r2(y - 4)} ${r2(x2 + dir * 6)},${y} ${x2},${r2(y + 4)}`,
          fill: c.textMuted,
        }, svg);
        handles.arrows.push({ line, head, x1, x2 });
      }

      // 제 장 — 장째 위에 얹힌다
      for (const p of base.promoted) {
        const b = lay.badges.get(p.id);
        if (b === undefined) continue;
        const at = scene.slid.includes(p.id) ? b.after : b.before;
        const g = el('g', {}, svg);
        const s: Rect = { x: at.x - SHEET_PAD, y: at.y - SHEET_PAD, w: at.w + SHEET_PAD * 2, h: at.h + SHEET_PAD * 2 };
        el('rect', {
          x: r2(s.x + 3),
          y: r2(s.y + 3),
          width: r2(s.w),
          height: r2(s.h),
          rx: 5,
          fill: c.border,
          'fill-opacity': 0.5,
        }, g);
        el('rect', {
          x: r2(s.x),
          y: r2(s.y),
          width: r2(s.w),
          height: r2(s.h),
          rx: 5,
          fill: c.bg,
          'fill-opacity': 0.35,
          stroke: c.primary,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 3',
        }, g);
        drawBadge(g, p.id, at);
        write(g, t('label.ownSheet', 'Own sheet'), r2(s.x + s.w / 2), r2(s.y + s.h + PX_XS + 3), {
          px: PX_XS,
          fill: c.primary,
          anchor: 'middle',
          weight: 600,
        });
        handles.sheets.set(p.id, { g, dx: r2(b.before.x - b.after.x) });
      }

      drawTally(scene, page);
      return handles;
    }

    /** 배지 무리와 테를 한 손잡이로 — 켜질 때 함께 나타난다 */
    function wrapPair(badge: SVGGElement, ring: SVGElement): SVGElement {
      const g = document.createElementNS(SVG_NS, 'g');
      ring.parentNode?.insertBefore(g, ring);
      g.appendChild(badge);
      g.appendChild(ring);
      return g;
    }

    function drawTally(scene: LayerScene, page: Rect): void {
      const x0 = page.x + page.w + 22;
      const x1 = W - MARGIN;
      const own = new Map(scene.base.promoted.map((p) => [p.id, p.decl]));
      const n = scene.repainted.length;
      const blockH = page.h / Math.max(1, n);
      scene.repainted.forEach((r, i) => {
        const y0 = page.y + i * blockH;
        const g = el('g', {}, svg);
        if (i > 0) el('line', { x1: x0, y1: r2(y0), x2: x1, y2: r2(y0), stroke: c.border }, g);
        write(g, r.id, x0, y0 + 20, { px: PX_MD, fill: c.text, mono: true, weight: 600 });
        const decl = own.get(r.id);
        write(g, decl === undefined ? t('label.pageSheet', 'Page sheet') : t('label.ownSheet', 'Own sheet'), x0, y0 + 38, {
          px: PX_XS,
          fill: decl === undefined ? c.textMuted : c.primary,
        });
        if (decl !== undefined) write(g, decl, x0, y0 + 53, { px: PX_XS, fill: c.textMuted, mono: true });
        write(g, t('label.repainted', 'Repainted'), x0, y0 + 76, { px: PX_SM, fill: c.textMuted });
        write(g, String(r.items.length), x1, y0 + 80, {
          px: PX_XL,
          fill: r.items.length > 0 ? c.itemComparing : c.text,
          weight: 700,
          anchor: 'end',
        });
        // 다시 칠한 요소의 딱지
        let cx = x0;
        let cy = y0 + 90;
        const chipH = PX_XS + 8;
        for (const item of r.items) {
          const w = r2(textWidth(item, PX_XS, true) + 10);
          if (cx + w > x1) {
            cx = x0;
            cy += chipH + 4;
          }
          el('rect', {
            x: r2(cx),
            y: r2(cy),
            width: w,
            height: chipH,
            rx: 3,
            fill: 'none',
            stroke: c.itemComparing,
          }, g);
          write(g, item, cx + 5, cy + chipH - 5, { px: PX_XS, fill: c.text, mono: true });
          cx += w + 4;
        }
      });
    }

    /** 한 시계 — 정해진 틱만큼 흐르고 풀린다. 새 render · destroy 가 오면 곧바로 풀린다 */
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
        const total = Math.max(1, Math.round(ms / TICK_MS));
        let k = 0;
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          k += 1;
          const p = Math.min(1, k / total);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, TICK_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, TICK_MS);
        timers.add(id);
      });
    }

    function stopAll(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2);

    async function render(next: LayerScene, prev: LayerScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      stopAll();
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate || prev === null) return;

      const step = next.step;
      if (step.kind === 'change' && h.arrows.length > 0) {
        await tween(CHANGE_MS, mine, (p) => {
          const q = ease(p);
          for (const a of h.arrows) {
            a.line.setAttribute('x2', String(r2(a.x1 + (a.x2 - a.x1) * q)));
            if (p < 1) a.head.setAttribute('visibility', 'hidden');
            else a.head.removeAttribute('visibility');
          }
        });
      } else if (step.kind === 'repaint') {
        const n = h.lit.length;
        await tween(REPAINT_MS, mine, (p) => {
          if (h.brush !== null) h.brush.setAttribute('width', String(r2(h.brushW * p)));
          h.lit.forEach((l, i) => {
            if (p >= (i + 1) / (n + 1)) l.el.removeAttribute('visibility');
            else l.el.setAttribute('visibility', 'hidden');
          });
        });
      } else if (step.kind === 'composite' && h.sheets.size > 0) {
        await tween(SLIDE_MS, mine, (p) => {
          const q = ease(p);
          for (const id of step.slid) {
            const s = h.sheets.get(id);
            if (s === undefined) continue;
            const left = r2(s.dx * (1 - q));
            if (left === 0) s.g.removeAttribute('transform');
            else s.g.setAttribute('transform', `translate(${left},0)`);
          }
        });
      } else {
        return;
      }
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        stopAll();
        svg.textContent = '';
      },
    };
  },
};
