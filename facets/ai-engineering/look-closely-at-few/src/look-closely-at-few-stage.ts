/**
 * 몇 개만 다시 보기 — 무대.
 *
 * 가로 자리가 곧 등수다 (왼쪽이 1 등). 후보 여덟은 처음에 아래 줄에 1차 차례로 선다.
 * 가로선이 문턱이다 — 앞 넷만 그 선을 넘어 위 줄로 올라간다. 올라간 넷은 하나씩
 * 왼쪽 위의 재순위 자리로 끌려가 질의 곁에 서고, 그 자리에서 재순위 막대가 찬다.
 * 넷이 다 다녀오면 위 줄 안에서 재순위 점수 차례로 자리를 바꾼다. 아래 줄의 넷은
 * 끝까지 움직이지 않고 재순위 막대가 빈 채로 남는다 — 셈하지 않았다는 것이 곧 사실이다.
 *
 * 후보 하나 = 식별자 + 막대 둘 (1차 점수 · 재순위 점수). 글은 질의와 맞대어 있는
 * 동안에만 보인다. 문턱 밖의 글은 한 번도 뜨지 않는다.
 *
 * 점수는 둘 다 예로 정한 값이다. 그 전제는 설명 글이 밝힌다 — 화면에 각주를 두지 않는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { LookCloselyAtFewScene } from './scene.js';

const SVG = 'http://www.w3.org/2000/svg';
const H = 440;
const W = PIECE_CANVAS_W;

/** 가장자리. */
const EDGE = 16;
/** 한 줄의 자리 수 상한 — 자리 폭은 캔버스에서 역산한다. */
const CARD_W_MAX = 64;
const CARD_H = 100;
/** 막대 영역. 카드 안쪽 기준. */
const BAR_TOP = 26;
const BAR_H = 52;
const BAR_GAP = 6;

/** 재순위 자리 (왼쪽 위). */
const MEET_Y = 12;
/** 문턱을 넘은 줄과 아직 아래 있는 줄. */
const UPPER_Y = 148;
const LOWER_Y = 288;
/** 문턱 가로선. */
const LINE_Y = 272;

const MS_LIFT = 700;
const MS_MEET = 500;
const MS_FILL = 500;
const MS_BACK = 450;
const MS_SWAP = 900;

type Renderer = ViewInstance & SceneRenderer<LookCloselyAtFewScene>;

type Pos = { x: number; y: number };

type CardHandle = { g: SVGGElement; bar: SVGRectElement | null; num: SVGTextElement | null };

function num(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 낱말을 끊지 않고 한 줄 글자 수에 맞춰 줄을 나눈다. */
function wrap(text: string, perLine: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur === '' ? word : `${cur} ${word}`;
    if (next.length > perLine && cur !== '') {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

export const lookCloselyAtFewStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): Renderer {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    const pitch = (W - 2 * EDGE) / 8;
    const cardW = Math.min(pitch - 10, CARD_W_MAX);
    const barW = (cardW - 3 * BAR_GAP) / 2;
    const meet: Pos = { x: EDGE, y: MEET_Y };
    const boxX = EDGE + cardW + 12;
    const boxW = W - EDGE - boxX;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? num(v) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function slotX(i: number): number {
      return EDGE + pitch * i + (pitch - cardW) / 2;
    }

    function place(g: SVGGElement, p: Pos): void {
      g.setAttribute('transform', `translate(${num(p.x)} ${num(p.y)})`);
    }

    /** 장면이 정하는 한 후보의 자리. */
    function restPos(s: LookCloselyAtFewScene, id: string): Pos {
      if (s.facing === id) return meet;
      const i = s.order.indexOf(id);
      return { x: slotX(i), y: s.lifted.includes(id) ? UPPER_Y : LOWER_Y };
    }

    function barHeight(score: number): number {
      return (BAR_H * Math.max(0, Math.min(100, score))) / 100;
    }

    /** 그 장면의 화면 전체를 세운다. */
    function drawStatic(s: LookCloselyAtFewScene): Map<string, CardHandle> {
      svg.textContent = '';
      const handles = new Map<string, CardHandle>();
      const base = s.base;
      if (!base) return handles;

      const cut = s.step !== null && s.step.kind !== 'init';
      const scores = new Map(s.scores);

      // 재순위 자리 — 맞대어 볼 후보가 서는 곳
      el(
        'rect',
        {
          x: meet.x,
          y: meet.y,
          width: cardW,
          height: CARD_H,
          rx: 6,
          fill: 'none',
          stroke: c.ghostOutline,
          'stroke-dasharray': '4 3',
        },
        svg,
      );
      label(svg, meet.x + cardW / 2, meet.y + CARD_H + 16, t('label.reranker', 'reranker'), {
        size: fontSizes.xs,
        fill: c.textMuted,
        anchor: 'middle',
      });

      // 질의
      el('rect', { x: boxX, y: MEET_Y, width: boxW, height: 30, rx: 4, fill: c.bgSubtle, stroke: c.border }, svg);
      label(svg, boxX + 10, MEET_Y + 19, t('label.query', 'query'), { size: fontSizes.xs, fill: c.textMuted });
      label(svg, boxX + 80, MEET_Y + 20, base.query, { size: fontSizes.md, weight: '600' });

      // 맞대어 있는 후보의 글
      const facing = s.facing === null ? undefined : base.cards.find((card) => card.id === s.facing);
      if (facing) {
        const top = MEET_Y + 38;
        el(
          'rect',
          { x: boxX, y: top, width: boxW, height: CARD_H - 38, rx: 4, fill: c.bg, stroke: c.itemComparing, 'stroke-width': 1.5 },
          svg,
        );
        const perLine = Math.max(20, Math.floor((boxW - 20) / 7.4));
        const lines = wrap(facing.text, perLine);
        lines.forEach((line, i) => {
          label(svg, boxX + 10, top + 22 + i * 20, line, { size: fontSizes.md });
        });
      }

      // 범례
      const legendY = MEET_Y + CARD_H + 12;
      el('rect', { x: boxX, y: legendY, width: 10, height: 10, fill: c.textMuted }, svg);
      label(svg, boxX + 16, legendY + 9, t('label.first', 'first-pass score'), { size: fontSizes.xs, fill: c.textMuted });
      el('rect', { x: boxX + 200, y: legendY, width: 10, height: 10, fill: c.itemComparing }, svg);
      label(svg, boxX + 216, legendY + 9, t('label.rerank', 'rerank score'), { size: fontSizes.xs, fill: c.textMuted });

      // 문턱
      el('line', { x1: EDGE, y1: LINE_Y, x2: W - EDGE, y2: LINE_Y, stroke: c.primary, 'stroke-width': 1.5 }, svg);
      // 칼자리 — 1차 등수 n 과 n+1 사이
      const cutX = EDGE + pitch * base.n;
      el(
        'line',
        { x1: cutX, y1: LINE_Y, x2: cutX, y2: LOWER_Y + CARD_H, stroke: c.primary, 'stroke-dasharray': '4 3' },
        svg,
      );
      label(svg, cutX - 6, LINE_Y - 7, t('label.cut', 'top {n}', { n: base.n }), {
        size: fontSizes.xs,
        fill: c.primary,
        anchor: 'end',
        weight: '600',
      });

      // 등수 눈금 — 가로 자리가 곧 등수
      for (let i = 0; i < base.cards.length; i += 1) {
        label(svg, slotX(i) + cardW / 2, LOWER_Y + CARD_H + 18, String(i + 1), {
          size: fontSizes.xs,
          fill: c.textMuted,
          anchor: 'middle',
        });
      }

      // 후보
      for (const card of base.cards) {
        const lifted = s.lifted.includes(card.id);
        const isFacing = s.facing === card.id;
        const g = el('g', {}, svg);
        place(g, restPos(s, card.id));
        el(
          'rect',
          {
            x: 0,
            y: 0,
            width: cardW,
            height: CARD_H,
            rx: 6,
            fill: c.bg,
            stroke: isFacing ? c.itemComparing : lifted ? c.primary : c.border,
            'stroke-width': isFacing ? 2 : lifted ? 1.5 : 1,
          },
          g,
        );
        const dim = cut && !lifted;
        label(g, cardW / 2, 17, card.id, {
          size: fontSizes.md,
          weight: '700',
          mono: true,
          anchor: 'middle',
          fill: dim ? c.textMuted : c.text,
        });

        const firstH = barHeight(card.first);
        const bx1 = BAR_GAP;
        const bx2 = BAR_GAP * 2 + barW;
        const barBottom = BAR_TOP + BAR_H;
        el('rect', { x: bx1, y: barBottom - firstH, width: barW, height: firstH, fill: c.textMuted }, g);
        label(g, bx1 + barW / 2, CARD_H - 8, String(card.first), {
          size: fontSizes.xs,
          fill: c.textMuted,
          anchor: 'middle',
        });

        // 재순위 막대 자리 — 셈하지 않은 동안은 빈 테두리
        el(
          'rect',
          {
            x: bx2,
            y: BAR_TOP,
            width: barW,
            height: BAR_H,
            fill: 'none',
            stroke: c.ghostOutline,
            'stroke-dasharray': '3 2',
          },
          g,
        );
        const score = scores.get(card.id);
        let bar: SVGRectElement | null = null;
        let numText: SVGTextElement | null = null;
        if (score !== undefined) {
          const rh = barHeight(score);
          bar = el('rect', { x: bx2, y: barBottom - rh, width: barW, height: rh, fill: c.itemComparing }, g);
          numText = label(g, bx2 + barW / 2, CARD_H - 8, String(score), {
            size: fontSizes.xs,
            fill: c.itemComparing,
            anchor: 'middle',
            weight: '700',
          });
        }
        handles.set(card.id, { g, bar, num: numText });
      }

      // 캡션 — 지금 일어난 일만
      const caption = captionOf(s);
      if (caption !== '') label(svg, EDGE, H - 16, caption, { size: fontSizes.sm });
      return handles;
    }

    function captionOf(s: LookCloselyAtFewScene): string {
      const base = s.base;
      const step = s.step;
      if (!base || !step) return '';
      const total = base.cards.length;
      switch (step.kind) {
        case 'init':
          return t('caption.init', 'First pass: {total} candidates, in order of first-pass score.', { total });
        case 'cut':
          return t('caption.cut', 'Only the top {n} cross the line. The other {rest} never reach the reranker.', {
            n: step.picked.length,
            rest: total - step.picked.length,
          });
        case 'score': {
          const card = base.cards.find((x) => x.id === step.id);
          return t('caption.score', 'Reranker reads {id} next to the query: {score} (first pass {first}).', {
            id: step.id,
            score: step.score,
            first: card ? card.first : 0,
          });
        }
        case 'reorder': {
          const topId = s.order[0] ?? '';
          return t('caption.reorder', 'Re-sorted by rerank score: {top} moves from {from} to the front. Looked at {n} of {total}.', {
            top: topId,
            from: step.from.indexOf(topId) + 1,
            n: s.scores.length,
            total,
          });
        }
      }
    }

    /** 한 시계로 흐르는 운동. 첫 값을 곧바로 적어 끝 자리가 번쩍이지 않게 한다. */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        frame(0);
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let start = -1;
        const tick = (now: number): void => {
          frames.delete(handle);
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          if (start < 0) start = now;
          const p = Math.min(1, (now - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          handle = requestAnimationFrame(tick);
          frames.add(handle);
        };
        let handle = requestAnimationFrame(tick);
        frames.add(handle);
      });
    }

    function lerp(a: Pos, b: Pos, p: number): Pos {
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
    }

    const alive = (mine: number): boolean => mine === gen && !destroyed;

    async function flow(next: LookCloselyAtFewScene, cards: Map<string, CardHandle>, mine: number): Promise<void> {
      const step = next.step;
      if (!step || !next.base) return;

      if (step.kind === 'cut') {
        const moving = step.picked
          .map((id) => ({ h: cards.get(id), to: restPos(next, id) }))
          .filter((m): m is { h: CardHandle; to: Pos } => m.h !== undefined);
        await tween(MS_LIFT, mine, (p) => {
          for (const m of moving) place(m.h.g, lerp({ x: m.to.x, y: LOWER_Y }, m.to, p));
        });
        return;
      }

      if (step.kind === 'score') {
        const goer = cards.get(step.id);
        const back = step.was === null ? undefined : cards.get(step.was);
        const from: Pos = { x: slotX(next.order.indexOf(step.id)), y: UPPER_Y };
        const backTo = step.was === null ? meet : restPos(next, step.was);
        const bar = goer?.bar ?? null;
        const full = barHeight(step.score);
        const bottom = BAR_TOP + BAR_H;
        const setBar = (p: number): void => {
          if (!bar) return;
          const hgt = full * p;
          bar.setAttribute('height', num(hgt));
          bar.setAttribute('y', num(bottom - hgt));
        };
        if (goer?.num) goer.num.setAttribute('visibility', 'hidden');
        setBar(0);
        await tween(MS_MEET, mine, (p) => {
          if (goer) place(goer.g, lerp(from, meet, p));
          if (back) place(back.g, lerp(meet, backTo, p));
        });
        if (!alive(mine)) return;
        await tween(MS_FILL, mine, setBar);
        if (!alive(mine)) return;
        if (goer?.num) goer.num.removeAttribute('visibility');
        return;
      }

      if (step.kind === 'reorder') {
        const was = step.was === null ? undefined : cards.get(step.was);
        const moving = next.lifted
          .map((id) => ({
            h: cards.get(id),
            a: { x: slotX(step.from.indexOf(id)), y: UPPER_Y },
            b: restPos(next, id),
            id,
          }))
          .filter((m): m is { h: CardHandle; a: Pos; b: Pos; id: string } => m.h !== undefined);
        // 모두 먼저 옛 자리에 세운다 — 맞대어 있던 것은 재순위 자리에서 출발한다
        for (const m of moving) place(m.h.g, m.a);
        if (was && step.was !== null) {
          const wasTo: Pos = { x: slotX(step.from.indexOf(step.was)), y: UPPER_Y };
          await tween(MS_BACK, mine, (p) => place(was.g, lerp(meet, wasTo, p)));
          if (!alive(mine)) return;
        }
        await tween(MS_SWAP, mine, (p) => {
          const bump = Math.sin(Math.PI * p);
          for (const m of moving) {
            const pos = lerp(m.a, m.b, p);
            const dx = m.b.x - m.a.x;
            const lift = dx < 0 ? -28 * bump : dx > 0 ? 12 * bump : 0;
            place(m.h.g, { x: pos.x, y: pos.y + lift });
          }
        });
      }
    }

    return {
      async render(next, prev, opts): Promise<void> {
        const mine = (gen += 1);
        const cards = drawStatic(next);
        if (!opts.animate || destroyed) return;
        // prev 는 흘릴지 고르는 데만 — 같은 장면이면 흘리지 않는다
        if (prev === next) return;
        await flow(next, cards, mine);
        if (!alive(mine)) return;
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
