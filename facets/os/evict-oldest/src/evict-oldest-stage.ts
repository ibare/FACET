/**
 * evict-oldest 무대 — 들어온 차례의 줄.
 *
 * 동사는 "밀려 나간다". 줄의 왼쪽 끝이 맨 처음 들어온 페이지이고, 새 페이지는 오른쪽에서
 * 들어와 끝에 붙는다. 자리가 모자라면 왼쪽 끝 카드가 줄 밖으로 밀려 나가 아래 "내보낸 페이지"
 * 로 떨어지고, 남은 카드가 한 칸씩 당겨진다. 적중한 카드는 들썩였다가 제자리에 선다 —
 * 쓰였다는 표시(쓰임)만 바뀌고 자리는 꿈쩍하지 않는다.
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
import type { EvictOldestCard, EvictOldestOut, EvictOldestScene } from './scene.js';

const NS = 'http://www.w3.org/2000/svg';
const H = 310;
const W = PIECE_CANVAS_W;

/** 걸음 운동 길이 (ms) */
const MS_IN = 600;
const MS_HIT = 700;
const MS_EVICT = 1200;

const PAD = 20;
const LANE_X = 150;
const LANE_Y = 98;
const CARD_MAX_W = 130;
const CARD_H = 84;
const CARD_GAP = 16;
const LANE_PAD = 10;
const PILE_Y = 262;
const PILE_W = 64;
const PILE_H = 36;
const PILE_GAP = 8;

type Layout = { cardW: number; slotX: (i: number) => number };

function layoutFor(nFrames: number): Layout {
  const laneW = W - PAD - LANE_X;
  const fit = (laneW - LANE_PAD * 2 - CARD_GAP * (nFrames - 1)) / nFrames;
  const cardW = Math.min(CARD_MAX_W, Math.floor(fit));
  const used = cardW * nFrames + CARD_GAP * (nFrames - 1);
  const x0 = LANE_X + (laneW - used) / 2;
  return { cardW, slotX: (i) => Math.round(x0 + i * (cardW + CARD_GAP)) };
}

function pileX(i: number): number {
  return PAD + i * (PILE_W + PILE_GAP);
}

function r1(v: number): number {
  const x = Math.round(v * 10) / 10;
  return x === 0 ? 0 : x;
}

function ease(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
}

/** p 를 [a, b] 구간의 0..1 로 */
function span(p: number, a: number, b: number): number {
  return ease((p - a) / (b - a));
}

type Handles = {
  cards: Map<number, SVGGElement>;
  pile: SVGGElement[];
  flight: SVGGElement;
};

export const evictOldestStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const lineMdPx = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: number; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r1(x),
          y: r1(y),
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    const tick = (n: number): string => t('label.tick', 't{n}', { n });

    /** 줄 위의 카드 한 장 — 원점 (0,0) 에 그리고 자리는 transform 으로 */
    function drawCard(
      parent: Element,
      card: EvictOldestCard,
      cardW: number,
      stroke: string,
      usedMark: boolean,
    ): SVGGElement {
      const g = el('g', {}, parent);
      el('rect', { x: 0, y: 0, width: cardW, height: CARD_H, rx: 6, fill: c.bg, stroke, 'stroke-width': 2 }, g);
      const cx = cardW / 2;
      label(g, cx, 28, String(card.page), { size: fontSizes.xl, anchor: 'middle', weight: 700, mono: true });
      label(g, cx, 46, t('label.frame', 'Frame {f}', { f: card.frame.toString(16).toUpperCase() }), {
        size: fontSizes.xs,
        fill: c.textMuted,
        anchor: 'middle',
      });
      label(g, cx, 62, t('label.in', 'In: {t}', { t: tick(card.inAt) }), {
        size: fontSizes.xs,
        fill: c.text,
        anchor: 'middle',
      });
      if (usedMark) el('rect', { x: 8, y: 67, width: cardW - 16, height: 14, rx: 3, fill: c.accent }, g);
      label(g, cx, 77, t('label.used', 'Used: {t}', { t: tick(card.usedAt) }), {
        size: fontSizes.xs,
        fill: usedMark ? c.stateInk : c.textMuted,
        anchor: 'middle',
        weight: usedMark ? 700 : 400,
      });
      return g;
    }

    function drawPileCard(parent: Element, o: EvictOldestOut, stroke: string, dashed: boolean): SVGGElement {
      const g = el('g', {}, parent);
      const box: Record<string, string | number> = { x: 0, y: 0, width: PILE_W, height: PILE_H, rx: 4, fill: c.bgSubtle, stroke, 'stroke-width': 1.5 };
      if (dashed) box['stroke-dasharray'] = '4 3';
      el('rect', box, g);
      label(g, PILE_W / 2, 15, String(o.page), { size: fontSizes.md, anchor: 'middle', weight: 700, mono: true });
      label(g, PILE_W / 2, 29, t('label.out', 'Out: {t}', { t: tick(o.outAt) }), {
        size: fontSizes.xs,
        fill: c.textMuted,
        anchor: 'middle',
      });
      return g;
    }

    function captions(scene: EvictOldestScene): [string, string] {
      const s = scene.step;
      if (s === null) return [t('caption.start', 'Frames: {n} · all empty', { n: scene.nFrames }), ''];
      if (s.kind === 'hit') {
        const card = scene.cards[s.pos];
        if (card === undefined) throw new Error('evict-oldest-stage: 적중한 카드가 없다');
        return [
          t('caption.hit', 'Reference {t}: page {page} · hit', { t: tick(s.t), page: s.page }),
          t('detail.hit', 'Place in line: {pos} of {n} · last used: {used}', {
            pos: s.pos + 1,
            n: scene.cards.length,
            used: tick(card.usedAt),
          }),
        ];
      }
      const head =
        s.again === null
          ? t('caption.fault', 'Reference {t}: page {page} · fault', { t: tick(s.t), page: s.page })
          : t('caption.faultAgain', 'Reference {t}: page {page} · fault · evicted at {out}', {
              t: tick(s.t),
              page: s.page,
              out: tick(s.again.outAt),
            });
      const frame = s.frame.toString(16).toUpperCase();
      const detail =
        s.victim === null
          ? t('detail.free', 'Into free frame {frame} · end of the line', { frame })
          : t('detail.evict', 'Out: page {victim}, first in line, last used {used} · into frame {frame}', {
              victim: s.victim.page,
              used: tick(s.victim.usedAt),
              frame,
            });
      return [head, detail];
    }

    function drawStatic(scene: EvictOldestScene): Handles {
      svg.textContent = '';
      const lay = layoutFor(scene.nFrames);
      const s = scene.step;

      const [head, detail] = captions(scene);
      label(svg, PAD, 28, head, { size: fontSizes.md, weight: 600 });
      if (detail !== '') label(svg, PAD, 50, detail, { size: fontSizes.sm, fill: c.textMuted });

      // 줄의 두 끝
      label(svg, lay.slotX(0), LANE_Y - 8, t('label.front', 'First in · out next'), {
        size: fontSizes.xs,
        fill: c.textMuted,
      });
      label(svg, W - PAD, LANE_Y - 8, t('label.back', 'New pages join here'), {
        size: fontSizes.xs,
        fill: c.textMuted,
        anchor: 'end',
      });
      el(
        'rect',
        {
          x: LANE_X,
          y: LANE_Y,
          width: W - PAD - LANE_X,
          height: CARD_H + LANE_PAD * 2,
          rx: 8,
          fill: c.bgSubtle,
          stroke: c.border,
        },
        svg,
      );
      // 줄 밖으로 나가는 길 — 왼쪽 끝에서 아래 '내보낸 페이지' 로
      const midY = LANE_Y + LANE_PAD + CARD_H / 2;
      const exitX = PAD + PILE_W / 2;
      el(
        'path',
        {
          d: `M ${LANE_X - 6} ${midY} L ${exitX} ${midY} L ${exitX} ${PILE_Y - 32}`,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        },
        svg,
      );
      el('path', { d: `M ${exitX} ${PILE_Y - 22} l -5 -8 l 10 0 z`, fill: c.border }, svg);
      // 들어온 차례의 화살표
      const ay = LANE_Y + CARD_H + LANE_PAD * 2 + 16;
      el('line', { x1: LANE_X + 8, y1: ay, x2: W - PAD - 8, y2: ay, stroke: c.textMuted, 'stroke-width': 1.5 }, svg);
      el(
        'path',
        { d: `M ${W - PAD - 8} ${ay} l -8 -4 l 0 8 z`, fill: c.textMuted },
        svg,
      );
      label(svg, (LANE_X + W - PAD) / 2, ay + 16, t('label.order', 'Arrival order'), {
        size: fontSizes.xs,
        fill: c.textMuted,
        anchor: 'middle',
      });

      // 빈 칸
      for (let i = scene.cards.length; i < scene.nFrames; i += 1) {
        el(
          'rect',
          {
            x: lay.slotX(i),
            y: LANE_Y + LANE_PAD,
            width: lay.cardW,
            height: CARD_H,
            rx: 6,
            fill: 'none',
            stroke: c.border,
            'stroke-dasharray': '4 4',
          },
          svg,
        );
      }

      const cards = new Map<number, SVGGElement>();
      scene.cards.forEach((card, i) => {
        const hit = s !== null && s.kind === 'hit' && s.pos === i;
        const fresh = s !== null && s.kind === 'load' && s.page === card.page;
        const stroke = hit ? c.accent : fresh ? c.primary : c.border;
        const g = drawCard(svg, card, lay.cardW, stroke, hit);
        g.setAttribute('transform', `translate(${lay.slotX(i)} ${LANE_Y + LANE_PAD})`);
        cards.set(card.page, g);
      });

      // 내보낸 페이지
      label(svg, PAD, PILE_Y - 8, t('label.evicted', 'Evicted'), { size: fontSizes.xs, fill: c.textMuted });
      const pile: SVGGElement[] = [];
      scene.out.forEach((o, i) => {
        const justOut = s !== null && s.kind === 'load' && s.victim !== null && i === scene.out.length - 1;
        const back = s !== null && s.kind === 'load' && s.again !== null && s.again.outAt === o.outAt;
        const stroke = justOut ? c.danger : back ? c.primary : c.border;
        const g = drawPileCard(svg, o, stroke, back);
        g.setAttribute('transform', `translate(${pileX(i)} ${PILE_Y})`);
        pile.push(g);
      });

      // 센 수
      label(svg, W - PAD, PILE_Y + 14, t('label.faults', 'Faults: {n}', { n: scene.faults }), {
        size: fontSizes.md,
        anchor: 'end',
        weight: 600,
      });
      label(svg, W - PAD, PILE_Y + 14 + lineMdPx + 6, t('label.hits', 'Hits: {n}', { n: scene.hits }), {
        size: fontSizes.md,
        anchor: 'end',
        weight: 600,
      });

      const flight = el('g', {}, svg);
      return { cards, pile, flight };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
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

    /** 한 시계로 흘린다. frame(p) 는 0..1 */
    async function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      frame(0);
      for (;;) {
        if (destroyed || mine !== gen) return false;
        await wait(16);
        if (destroyed || mine !== gen) return false;
        const p = Math.min(1, (Date.now() - start) / ms);
        frame(p);
        if (p >= 1) return true;
      }
    }

    function place(g: SVGGElement, x: number, y: number, s = 1): void {
      g.setAttribute('transform', s === 1 ? `translate(${r1(x)} ${r1(y)})` : `translate(${r1(x)} ${r1(y)}) scale(${r1(s * 100) / 100})`);
    }

    async function render(
      next: EvictOldestScene,
      _prev: EvictOldestScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      const s = next.step;
      if (!opts.animate || s === null) return;

      const lay = layoutFor(next.nFrames);
      const cy = LANE_Y + LANE_PAD;

      if (s.kind === 'hit') {
        const g = h.cards.get(s.page);
        if (g === undefined) return;
        const x = lay.slotX(s.pos);
        // 들썩였다가 제자리 — 자리는 바뀌지 않는다
        const ok = await tween(MS_HIT, mine, (p) => place(g, x, cy - 18 * Math.sin(Math.PI * p)));
        if (ok && !destroyed && mine === gen) drawStatic(next);
        return;
      }

      const fresh = h.cards.get(s.page);
      if (fresh === undefined) return;
      const tail = next.cards.length - 1;
      const tailX = lay.slotX(tail);

      if (s.victim === null) {
        const ok = await tween(MS_IN, mine, (p) => place(fresh, W + (tailX - W) * ease(p), cy));
        if (ok && !destroyed && mine === gen) drawStatic(next);
        return;
      }

      // 맨 앞이 줄 밖으로 밀려 나가 아래로 떨어지고, 남은 것이 한 칸씩 당겨지고, 새 페이지가 끝에 붙는다
      const pileIdx = next.out.length - 1;
      const pileCard = h.pile[pileIdx];
      if (pileCard !== undefined) pileCard.setAttribute('opacity', '0');
      const victimCard: EvictOldestCard = {
        page: s.victim.page,
        frame: s.victim.frame,
        inAt: s.victim.inAt,
        usedAt: s.victim.usedAt,
      };
      const flying = drawCard(h.flight, victimCard, lay.cardW, c.danger, false);
      const x0 = lay.slotX(0);
      const exitX = PAD;
      const px = pileX(pileIdx);
      const shrink = PILE_W / lay.cardW;
      const others = next.cards.slice(0, tail);

      const ok = await tween(MS_EVICT, mine, (p) => {
        const a = span(p, 0, 0.35);
        const b = span(p, 0.35, 0.75);
        const x = x0 + (exitX - x0) * a + (px - exitX) * b;
        const y = cy + (PILE_Y - cy) * b;
        place(flying, x, y, 1 + (shrink - 1) * b);
        const sh = span(p, 0.3, 0.7);
        others.forEach((card, i) => {
          const g = h.cards.get(card.page);
          if (g !== undefined) place(g, lay.slotX(i + 1) + (lay.slotX(i) - lay.slotX(i + 1)) * sh, cy);
        });
        place(fresh, W + (tailX - W) * span(p, 0.55, 1), cy);
      });
      if (ok && !destroyed && mine === gen) drawStatic(next);
    }

    return {
      render: render as (next: unknown, prev: unknown, opts: { animate: boolean }) => Promise<void>,
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
