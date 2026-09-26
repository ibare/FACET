import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { DecoupleScene } from './scene.js';

/**
 * 느슨한 결합의 무대.
 *
 * 왼쪽에 보내는 쪽 · 가운데 토픽 · 오른쪽에 구독자 후보. 후보는 "구독 안 함" 칸과 "구독자" 칸
 * 사이를 가로로 오간다 — 가입하면 토픽 쪽으로 들어오고, 탈퇴하면 받은 사본을 든 채 밖으로 나간다.
 * 보내는 쪽과 그 화살 하나는 어느 걸음에도 움직이지 않는다. 아래 기록 줄이 발행마다
 * 보내는 쪽이 아는 것의 수와 받은 곳의 수를 나란히 쌓는다.
 */

const H = 300;
const W = PIECE_CANVAS_W;
const PAD = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

const CAPTION_Y = 26;
const HEAD_Y = 52;
const ROW_TOP = 62;
const ROW_BOTTOM = 214;
const ROW_GAP = 8;
const ROW_H_MAX = 44;
const LEDGER_RULE_Y = 228;
const LEDGER_ROWS = [250, 270, 290] as const;

const JOIN_MS = 480;
const PUBLISH_MS = 560;
const PUBLISH_SPLIT = 0.45;
const TICK_MS = 16;

const SM = parseFloat(fontSizes.sm);
const XS = parseFloat(fontSizes.xs);

type Layout = {
  senderX: number;
  boxW: number;
  topicX: number;
  subX: number;
  outX: number;
  cardW: number;
  boxTop: number;
  boxH: number;
  midY: number;
  rowH: number;
  rowY: (i: number) => number;
  ledgerX: number;
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function layoutFor(rows: number): Layout {
  const boxW = Math.min(140, round(W * 0.2));
  const gapArrow = round(W * 0.07);
  const gapWire = round(W * 0.08);
  const gapOut = round(W * 0.045);
  const senderX = PAD;
  const topicX = senderX + boxW + gapArrow;
  const subX = topicX + boxW + gapWire;
  const cardW = Math.min(140, round((W - PAD - subX - gapOut) / 2));
  const outX = W - PAD - cardW;
  const area = ROW_BOTTOM - ROW_TOP;
  const rowH = Math.min(ROW_H_MAX, round((area - ROW_GAP * (rows - 1)) / rows));
  const used = rows * rowH + (rows - 1) * ROW_GAP;
  const firstY = ROW_TOP + (area - used) / 2;
  const midY = round(ROW_TOP + area / 2);
  const boxH = Math.min(area, 96);
  return {
    senderX,
    boxW,
    topicX,
    subX,
    outX,
    cardW,
    boxTop: round(midY - boxH / 2),
    boxH,
    midY,
    rowH,
    rowY: (i: number) => round(firstY + i * (rowH + ROW_GAP)),
    ledgerX: round(PAD + boxW + gapArrow / 2),
  };
}

/** 카드 안 j 번째 사본 칸 — 정적 그리기와 운동이 같은 셈을 쓴다. */
function chipBox(L: Layout, x: number, rowIndex: number, count: number, j: number): { x: number; y: number; w: number; h: number } {
  const h = Math.min(16, L.rowH - SM - 12);
  const w = Math.min(36, (L.cardW - 16 - (count - 1) * 4) / count);
  return { x: x + 8 + j * (w + 4), y: L.rowY(rowIndex) + L.rowH - h - 5, w, h };
}

const DROP_W = 44;
const DROP_H = 18;

/** 버려진 메시지 칸 — 토픽 아래. */
function dropBox(L: Layout): { x: number; y: number } {
  return { x: L.topicX + L.boxW / 2 - DROP_W / 2, y: L.boxTop + L.boxH + 8 };
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

type Handles = {
  cards: Map<string, SVGGElement>;
  wires: Map<string, SVGLineElement>;
  fresh: Map<string, SVGGElement>;
  dropped: SVGGElement | null;
  ledgerNew: SVGGElement | null;
  layer: SVGGElement;
};

export const decoupleSenderReceiverStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function nameOf(id: string): string {
      switch (id) {
        case 'cart':
          return t('label.cart', 'Cart');
        case 'search':
          return t('label.search', 'Search');
        case 'alert':
          return t('label.alert', 'Alerts');
        default:
          throw new Error(`decouple-sender-receiver-stage: 표시 이름이 없는 구독자 ${id}`);
      }
    }

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(
      text: string,
      x: number,
      y: number,
      opt: { size: number; fill: string; anchor?: string; mono?: boolean; weight?: number },
      parent: Element,
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          fill: opt.fill,
          'font-family': opt.mono ? fonts.mono : fonts.body,
          'font-size': opt.size,
          'text-anchor': opt.anchor ?? 'start',
          'font-weight': opt.weight ?? 400,
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function chip(
      value: string,
      x: number,
      y: number,
      w: number,
      h: number,
      style: 'plain' | 'hot' | 'lost',
      parent: Element,
    ): SVGGElement {
      const g = el('g', {}, parent);
      el(
        'rect',
        {
          x,
          y,
          width: w,
          height: h,
          rx: 3,
          fill: style === 'hot' ? colors.accent : colors.bgSubtle,
          stroke: style === 'lost' ? colors.danger : style === 'hot' ? colors.accent : colors.border,
          'stroke-width': 1,
          ...(style === 'lost' ? { 'stroke-dasharray': '3 2' } : {}),
        },
        g,
      );
      label(
        value,
        x + w / 2,
        y + h / 2 + XS * 0.36,
        { size: XS, fill: style === 'hot' ? colors.stateInk : style === 'lost' ? colors.textMuted : colors.text, anchor: 'middle', mono: true },
        g,
      );
      return g;
    }

    function drawStatic(scene: DecoupleScene): Handles {
      svg.textContent = '';
      const L = layoutFor(scene.candidates.length);
      const layer = el('g', {}, svg);
      const handles: Handles = {
        cards: new Map(),
        wires: new Map(),
        fresh: new Map(),
        dropped: null,
        ledgerNew: null,
        layer,
      };
      const live = scene.live;
      const step = scene.step;
      const subscribers = live ? live.subscribers : [];

      // 캡션 — 지금 일어나는 일만
      let caption = '';
      if (!live) {
        caption = '';
      } else if (!step) {
        caption = t('caption.start', 'Before any event. Subscribers: {n}', { n: subscribers.length });
      } else if (step.kind === 'publish') {
        caption =
          step.reached.length === 0
            ? t('caption.dropped', 'Published: {value}. Reached: {n}. Dropped at the topic.', {
                value: step.value,
                n: step.reached.length,
              })
            : t('caption.publish', 'Published: {value}. Reached: {n}', { value: step.value, n: step.reached.length });
      } else if (step.kind === 'join') {
        caption = t('caption.join', 'Joined: {name}. Subscribers: {n}', { name: nameOf(step.id), n: subscribers.length });
      } else {
        caption = t('caption.leave', 'Left: {name}. Subscribers: {n}', { name: nameOf(step.id), n: subscribers.length });
      }
      label(caption, PAD, CAPTION_Y, { size: parseFloat(fontSizes.md), fill: colors.text, weight: 600 }, layer);

      // 칸 머리
      label(t('label.subscribers', 'Subscribers'), L.subX + L.cardW / 2, HEAD_Y, { size: XS, fill: colors.text, anchor: 'middle', weight: 600 }, layer);
      label(t('label.outside', 'Not subscribed'), L.outX + L.cardW / 2, HEAD_Y, { size: XS, fill: colors.textMuted, anchor: 'middle' }, layer);

      // 보내는 쪽 — 어느 걸음에도 같은 자리, 같은 모양
      el('rect', { x: L.senderX, y: L.boxTop, width: L.boxW, height: L.boxH, rx: 8, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, layer);
      label(t('label.sender', 'Sender'), L.senderX + L.boxW / 2, L.boxTop + 22, { size: SM, fill: colors.text, anchor: 'middle', weight: 600 }, layer);
      if (live) {
        live.known.forEach((name, i) => {
          chip(name, L.senderX + 10, L.boxTop + 34 + i * 22, L.boxW - 20, 18, 'plain', layer);
        });
        label(
          t('label.knows', 'Knows: {n}', { n: live.known.length }),
          L.senderX + L.boxW / 2,
          L.boxTop + L.boxH - 12,
          { size: XS, fill: colors.textMuted, anchor: 'middle' },
          layer,
        );
      }

      // 보내는 쪽 → 토픽 화살 하나
      const arrowX0 = L.senderX + L.boxW;
      const arrowX1 = L.topicX - 2;
      el('line', { x1: arrowX0, y1: L.midY, x2: arrowX1 - 6, y2: L.midY, stroke: colors.text, 'stroke-width': 1.5 }, layer);
      el('polygon', { points: `${round(arrowX1)},${L.midY} ${round(arrowX1 - 8)},${L.midY - 4} ${round(arrowX1 - 8)},${L.midY + 4}`, fill: colors.text }, layer);

      // 토픽
      el('rect', { x: L.topicX, y: L.boxTop, width: L.boxW, height: L.boxH, rx: 8, fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5 }, layer);
      label(t('label.topic', 'Topic'), L.topicX + L.boxW / 2, L.boxTop + 22, { size: SM, fill: colors.text, anchor: 'middle', weight: 600 }, layer);
      label(scene.topic, L.topicX + L.boxW / 2, L.midY + 6, { size: SM, fill: colors.text, anchor: 'middle', mono: true }, layer);

      // 토픽 → 지금 구독자 선
      const wireX0 = L.topicX + L.boxW;
      scene.candidates.forEach((id, i) => {
        if (!subscribers.includes(id)) return;
        const y = L.rowY(i) + L.rowH / 2;
        const wire = el('line', { x1: wireX0, y1: L.midY, x2: L.subX, y2: y, stroke: colors.text, 'stroke-width': 1.2 }, layer);
        handles.wires.set(id, wire);
      });

      // 구독자 후보 카드 — 받은 사본을 품고 다닌다
      scene.candidates.forEach((id, i) => {
        const inside = subscribers.includes(id);
        const x = inside ? L.subX : L.outX;
        const y = L.rowY(i);
        const moving = step && (step.kind === 'join' || step.kind === 'leave') && step.id === id;
        const g = el('g', {}, layer);
        el(
          'rect',
          {
            x,
            y,
            width: L.cardW,
            height: L.rowH,
            rx: 6,
            fill: inside ? colors.bg : colors.bgSubtle,
            stroke: moving ? colors.accent : inside ? colors.text : colors.textMuted,
            'stroke-width': moving ? 2.5 : 1,
            ...(inside ? {} : { 'stroke-dasharray': '4 3' }),
          },
          g,
        );
        label(nameOf(id), x + 8, y + SM + 3, { size: SM, fill: inside ? colors.text : colors.textMuted, weight: 600 }, g);
        const row = live ? live.inbox.find((r) => r.id === id) : undefined;
        if (live && !row) throw new Error(`decouple-sender-receiver-stage: 받은 칸이 없는 후보 ${id}`);
        const got = row ? row.got : [];
        const isFresh = step && step.kind === 'publish' && step.reached.includes(id);
        got.forEach((v, j) => {
          const hot = Boolean(isFresh) && j === got.length - 1;
          const b = chipBox(L, x, i, got.length, j);
          const c = chip(String(v), b.x, b.y, b.w, b.h, hot ? 'hot' : 'plain', g);
          if (hot) handles.fresh.set(id, c);
        });
        handles.cards.set(id, g);
      });

      // 버려진 메시지 — 그 걸음에만 토픽 아래 남는다
      if (step && step.kind === 'publish' && step.reached.length === 0) {
        const b = dropBox(L);
        handles.dropped = chip(String(step.value), b.x, b.y, DROP_W, DROP_H, 'lost', layer);
      }

      // 기록 줄 — 발행마다 아는 것의 수와 받은 곳의 수
      el('line', { x1: PAD, y1: LEDGER_RULE_Y, x2: W - PAD, y2: LEDGER_RULE_Y, stroke: colors.border, 'stroke-width': 1 }, layer);
      const rowStyle = { size: XS, fill: colors.textMuted };
      label(t('label.published', 'Published'), PAD, LEDGER_ROWS[0], rowStyle, layer);
      label(t('label.known', 'Sender knows'), PAD, LEDGER_ROWS[1], rowStyle, layer);
      label(t('label.reached', 'Reached'), PAD, LEDGER_ROWS[2], rowStyle, layer);
      if (live) {
        const slots = live.publishTotal;
        if (slots < 1) throw new Error('decouple-sender-receiver-stage: 발행 수가 0');
        const slotW = (W - PAD - L.ledgerX) / slots;
        live.ledger.forEach((rec) => {
          const cx = L.ledgerX + (rec.nth - 1) * slotW + slotW / 2;
          const current = step && step.kind === 'publish' && step.nth === rec.nth;
          const col = el('g', {}, layer);
          if (current) {
            el('rect', { x: cx - slotW / 2 + 4, y: LEDGER_RULE_Y + 6, width: slotW - 8, height: H - LEDGER_RULE_Y - 8, rx: 4, fill: 'none', stroke: colors.accent, 'stroke-width': 2 }, col);
            handles.ledgerNew = col;
          }
          label(String(rec.value), cx, LEDGER_ROWS[0], { size: SM, fill: colors.text, anchor: 'middle', mono: true }, col);
          label(String(rec.knownCount), cx, LEDGER_ROWS[1], { size: SM, fill: colors.text, anchor: 'middle', weight: 600 }, col);
          label(String(rec.reached.length), cx, LEDGER_ROWS[2], { size: SM, fill: rec.reached.length === 0 ? colors.danger : colors.text, anchor: 'middle', weight: 600 }, col);
        });
      }
      return handles;
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, TICK_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function need<T>(v: T | null | undefined, what: string): T {
      if (v === null || v === undefined) throw new Error(`decouple-sender-receiver-stage: 운동 손잡이 없음 — ${what}`);
      return v;
    }

    async function moveCard(mine: number, scene: DecoupleScene, id: string, joining: boolean, h: Handles): Promise<void> {
      const L = layoutFor(scene.candidates.length);
      const card = need(h.cards.get(id), `card ${id}`);
      const i = scene.candidates.indexOf(id);
      if (i < 0) throw new Error(`decouple-sender-receiver-stage: 후보에 없는 ${id}`);
      const finalX = joining ? L.subX : L.outX;
      const dx = joining ? L.outX - L.subX : L.subX - L.outX;
      const y = L.rowY(i) + L.rowH / 2;
      const wire = joining
        ? need(h.wires.get(id), `wire ${id}`)
        : el('line', { x1: L.topicX + L.boxW, y1: L.midY, x2: L.subX, y2: y, stroke: colors.text, 'stroke-width': 1.2 }, h.layer);
      await tween(mine, JOIN_MS, (p) => {
        const e = ease(p);
        card.setAttribute('transform', `translate(${round(dx * (1 - e))},0)`);
        wire.setAttribute('x2', String(round(finalX + dx * (1 - e))));
        wire.setAttribute('opacity', String(round(joining ? e : 1 - e)));
      });
    }

    async function publishFlight(mine: number, scene: DecoupleScene, reached: string[], value: number, h: Handles): Promise<void> {
      const L = layoutFor(scene.candidates.length);
      const fromX = L.senderX + L.boxW / 2;
      const toX = L.topicX + L.boxW / 2;
      const flyer = chip(String(value), fromX - DROP_W / 2, L.midY - DROP_H / 2, DROP_W, DROP_H, 'hot', h.layer);
      const live = need(scene.live, 'live');
      const fresh = reached.map((id) => {
        const i = scene.candidates.indexOf(id);
        if (i < 0) throw new Error(`decouple-sender-receiver-stage: 후보에 없는 ${id}`);
        const g = need(h.fresh.get(id), `fresh chip ${id}`);
        const row = need(live.inbox.find((r) => r.id === id), `inbox ${id}`);
        const b = chipBox(L, L.subX, i, row.got.length, row.got.length - 1);
        return { g, dx: toX - (b.x + b.w / 2), dy: L.midY - (b.y + b.h / 2) };
      });
      const dropped = reached.length === 0 ? need(h.dropped, 'dropped chip') : null;
      const dropDy = L.midY - (dropBox(L).y + DROP_H / 2);
      const ledger = h.ledgerNew;
      for (const f of fresh) f.g.setAttribute('opacity', '0');
      if (dropped) dropped.setAttribute('opacity', '0');
      if (ledger) ledger.setAttribute('opacity', '0');

      await tween(mine, PUBLISH_MS, (p) => {
        if (p < PUBLISH_SPLIT) {
          const e = ease(p / PUBLISH_SPLIT);
          flyer.setAttribute('transform', `translate(${round((toX - fromX) * e)},0)`);
          return;
        }
        const e = ease((p - PUBLISH_SPLIT) / (1 - PUBLISH_SPLIT));
        flyer.setAttribute('transform', `translate(${round(toX - fromX)},0)`);
        flyer.setAttribute('opacity', String(round(1 - e)));
        for (const f of fresh) {
          f.g.setAttribute('opacity', '1');
          f.g.setAttribute('transform', `translate(${round(f.dx * (1 - e))},${round(f.dy * (1 - e))})`);
        }
        if (dropped) {
          dropped.setAttribute('opacity', String(round(e)));
          dropped.setAttribute('transform', `translate(0,${round(dropDy * (1 - e))})`);
        }
        if (ledger) ledger.setAttribute('opacity', String(round(e)));
      });
    }

    return {
      async render(next: DecoupleScene, _prev: DecoupleScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        const step = next.step;
        if (!opts.animate || !step || !next.live) return;
        if (step.kind === 'publish') {
          await publishFlight(mine, next, step.reached, step.value, h);
        } else {
          await moveCard(mine, next, step.id, step.kind === 'join', h);
        }
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
