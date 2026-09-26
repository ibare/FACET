/**
 * publish-to-many stage — 보내는 쪽 · 토픽 · 구독자를 왼쪽에서 오른쪽으로 두고,
 * 한 메시지가 토픽까지 **하나로** 간 뒤 토픽에서 구독자 수만큼 **갈라져** 흩어지는 것을 그린다.
 * 아래 두 줄 셈판이 보낸 것과 받은 사본을 같은 눈금으로 쌓아 두 수가 벌어지는 것을 보인다.
 *
 * 그림은 장면만 읽는다. 자리는 캔버스 폭에서 셈한다.
 */
import {
  categorical,
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
import type { PublishToManyScene } from './scene.js';

const H = 320;
const NS = 'http://www.w3.org/2000/svg';
const SEND_MS = 500;
const FAN_MS = 600;

const PAD = 20;
const CHIP_H = 24;
const CHIP_W_MAX = 64;
const MARK_PITCH_MAX = 24;

type Pt = { x: number; y: number };

type Layout = {
  sender: { x: number; y: number; w: number; h: number };
  pendingSlot: (i: number) => Pt;
  topic: { cx: number; cy: number; w: number; h: number };
  topicRest: Pt;
  subLabelX: number;
  inboxX: number;
  inboxW: number;
  rowY: (i: number) => Pt['y'];
  inboxSlot: (row: number, k: number) => Pt;
  chipW: number;
  counterY: [number, number];
  markX0: number;
  markPitch: number;
};

function round(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

function layout(scene: PublishToManyScene): Layout {
  const W = PIECE_CANVAS_W;
  const m = scene.messages.length;
  const n = scene.subscribers.length;
  const top = 56;
  const bottom = 226;

  const senderW = Math.min(124, W * 0.2);
  const sender = { x: PAD, y: top, w: senderW, h: bottom - top };

  const topicW = Math.min(136, W * 0.22);
  const topic = { cx: W * 0.4, cy: (top + bottom) / 2, w: topicW, h: 78 };

  const subLabelX = W * 0.6;
  const inboxX = subLabelX + Math.min(72, W * 0.12);
  const inboxW = W - PAD - inboxX;
  const gap = 6;
  const chipW = Math.min(CHIP_W_MAX, (inboxW - 12 - gap * (m - 1)) / m, senderW - 24);
  if (!(chipW > 16)) {
    throw new Error(`publish-to-many stage: 메시지 ${m} 개가 받는 칸에 들어가지 않는다`);
  }

  const slotTop = top + 34;
  const slotSpan = bottom - 10 - slotTop;
  const pendingSlot = (i: number): Pt => ({
    x: sender.x + sender.w / 2,
    y: slotTop + (i + 0.5) * (slotSpan / m),
  });

  const rowY = (i: number): number => top + (i + 0.5) * ((bottom - top) / n);
  const inboxSlot = (row: number, k: number): Pt => ({
    x: inboxX + 6 + chipW / 2 + k * (chipW + gap),
    y: rowY(row),
  });

  const markX0 = 200;
  // 눈금의 상한은 바탕의 칸 수(구독자 × 메시지) — 받는 칸 모두가 차도 한 줄에 담긴다
  const markPitch = Math.min(MARK_PITCH_MAX, (W - PAD - markX0) / (m * n));

  return {
    sender,
    pendingSlot,
    topic,
    topicRest: { x: topic.cx, y: topic.cy + 14 },
    subLabelX,
    inboxX,
    inboxW,
    rowY,
    inboxSlot,
    chipW,
    counterY: [bottom + 38, bottom + 72],
    markX0,
    markPitch,
  };
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const publishToManyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

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

    function label(text: string, x: number, y: number, parent: Element, opts: {
      size?: string; color?: string; anchor?: string; mono?: boolean; weight?: number;
    } = {}): SVGTextElement {
      const node = el('text', {
        x: round(x),
        y: round(y),
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.color ?? colors.text,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'middle',
      }, parent);
      if (opts.weight !== undefined) node.setAttribute('font-weight', String(opts.weight));
      node.textContent = text;
      return node;
    }

    function subscriberName(id: string): string {
      switch (id) {
        case 'email': return t('label.email', 'Email');
        case 'stock': return t('label.stock', 'Stock');
        case 'stats': return t('label.stats', 'Stats');
        default: throw new Error(`publish-to-many stage: 표시 이름이 없는 구독자 ${id}`);
      }
    }

    function messageColor(scene: PublishToManyScene, message: number): string {
      const i = scene.messages.indexOf(message);
      if (i < 0) throw new Error(`publish-to-many stage: 보낼 메시지에 없는 ${message}`);
      const c = categorical(scene.messages.length)[i];
      if (c === undefined) throw new Error(`publish-to-many stage: ${message} 의 색이 없다`);
      return c;
    }

    function chip(scene: PublishToManyScene, message: number, at: Pt, w: number, parent: Element): SVGGElement {
      const g = el('g', { transform: `translate(${round(at.x)},${round(at.y)})` }, parent);
      el('rect', {
        x: round(-w / 2), y: -CHIP_H / 2, width: round(w), height: CHIP_H, rx: 5,
        fill: messageColor(scene, message),
      }, g);
      label(String(message), 0, 1, g, { mono: true, color: colors.stateInk, anchor: 'middle', weight: 600 });
      return g;
    }

    type Drawn = {
      topicChip: SVGGElement | null;
      inboxChips: Map<string, SVGGElement>;
      sentMarks: SVGRectElement[];
      copyMarks: SVGRectElement[];
    };

    function caption(scene: PublishToManyScene): string {
      const step = scene.step;
      if (step === null) {
        return t('caption.ready', 'Topic {topic}. Subscribers: {n}.', {
          topic: scene.topic,
          n: scene.subscribers.length,
        });
      }
      if (step.kind === 'send') {
        return t('caption.send', 'The sender publishes to the topic: {message}.', { message: step.message });
      }
      return t('caption.fanOut', 'The topic puts a copy in every subscriber: {message}. New copies: {n}.', {
        message: step.message,
        n: step.to.length,
      });
    }

    function drawStatic(scene: PublishToManyScene): Drawn {
      svg.textContent = '';
      const L = layout(scene);
      const root = el('g', {}, svg);

      label(caption(scene), PAD, 24, root, { size: fontSizes.md, weight: 600 });

      // 보내는 쪽 — 보낼 메시지가 차례로 앉아 있고, 보낸 자리는 빈 테두리로 남는다
      el('rect', {
        x: round(L.sender.x), y: L.sender.y, width: round(L.sender.w), height: L.sender.h, rx: 8,
        fill: colors.bgSubtle, stroke: colors.border,
      }, root);
      label(t('label.sender', 'Sender'), L.sender.x + L.sender.w / 2, L.sender.y + 16, root, {
        anchor: 'middle', color: colors.textMuted,
      });
      scene.messages.forEach((m, i) => {
        const at = L.pendingSlot(i);
        if (scene.sentMessages.includes(m)) {
          el('rect', {
            x: round(at.x - L.chipW / 2), y: round(at.y - CHIP_H / 2), width: round(L.chipW), height: CHIP_H,
            rx: 5, fill: 'none', stroke: colors.border, 'stroke-dasharray': '3 3',
          }, root);
        } else {
          chip(scene, m, at, L.chipW, root);
        }
      });

      // 토픽
      const tp = L.topic;
      const lineLayer = el('g', {}, root);
      el('line', {
        x1: round(L.sender.x + L.sender.w + 6), y1: round(tp.cy), x2: round(tp.cx - tp.w / 2 - 6), y2: round(tp.cy),
        stroke: scene.step?.kind === 'send' ? colors.text : colors.border, 'stroke-width': 1.5,
      }, lineLayer);
      const fanned = scene.step?.kind === 'fanOut' ? scene.step.to : [];
      scene.subscribers.forEach((id, i) => {
        el('line', {
          x1: round(tp.cx + tp.w / 2 + 6), y1: round(tp.cy),
          x2: round(L.subLabelX - 8), y2: round(L.rowY(i)),
          stroke: fanned.includes(id) ? colors.text : colors.border, 'stroke-width': 1.5,
        }, lineLayer);
      });
      el('rect', {
        x: round(tp.cx - tp.w / 2), y: round(tp.cy - tp.h / 2), width: round(tp.w), height: tp.h, rx: 8,
        fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5,
      }, root);
      label(t('label.topic', 'Topic'), tp.cx, tp.cy - tp.h / 2 - 12, root, {
        anchor: 'middle', color: colors.textMuted,
      });
      label(scene.topic, tp.cx, tp.cy - 18, root, { anchor: 'middle', mono: true });
      el('rect', {
        x: round(L.topicRest.x - L.chipW / 2), y: round(L.topicRest.y - CHIP_H / 2),
        width: round(L.chipW), height: CHIP_H, rx: 5,
        fill: 'none', stroke: colors.border, 'stroke-dasharray': '3 3',
      }, root);
      const topicChip = scene.atTopic === null ? null : chip(scene, scene.atTopic, L.topicRest, L.chipW, root);

      // 구독자 — 받은 사본이 받은 차례로 쌓인다
      const inboxChips = new Map<string, SVGGElement>();
      const inboxLayer = el('g', {}, root);
      scene.inbox.forEach((box, row) => {
        const y = L.rowY(row);
        label(subscriberName(box.id), L.subLabelX, y, inboxLayer, { weight: 600 });
        el('rect', {
          x: round(L.inboxX), y: round(y - CHIP_H / 2 - 5), width: round(L.inboxW), height: CHIP_H + 10, rx: 6,
          fill: colors.bgSubtle, stroke: colors.border,
        }, inboxLayer);
        box.got.forEach((m, k) => {
          inboxChips.set(`${box.id}:${m}`, chip(scene, m, L.inboxSlot(row, k), L.chipW, inboxLayer));
        });
      });

      // 셈판 — 같은 눈금으로 보낸 것과 받은 사본을 쌓는다
      const sentMarks: SVGRectElement[] = [];
      const copyMarks: SVGRectElement[] = [];
      if (scene.counts !== null) {
        const rows: { key: 'sent' | 'copies'; y: number; value: number; seq: number[]; out: SVGRectElement[] }[] = [
          {
            key: 'sent', y: L.counterY[0], value: scene.counts.sent,
            seq: scene.sentMessages, out: sentMarks,
          },
          {
            key: 'copies', y: L.counterY[1], value: scene.counts.copies,
            seq: scene.messages.flatMap((m) => scene.inbox.filter((b) => b.got.includes(m)).map(() => m)),
            out: copyMarks,
          },
        ];
        for (const r of rows) {
          if (r.seq.length !== r.value) {
            throw new Error(`publish-to-many stage: ${r.key} 셈 ${r.value} 와 화면의 수 ${r.seq.length} 가 다르다`);
          }
          label(
            r.key === 'sent' ? t('label.sent', 'Sent') : t('label.copies', 'Copies received'),
            PAD, r.y, root, { color: colors.textMuted },
          );
          label(String(r.value), L.markX0 - 16, r.y, root, {
            anchor: 'end', mono: true, size: fontSizes.lg, weight: 700,
          });
          const size = Math.max(4, L.markPitch - 5);
          r.seq.forEach((m, k) => {
            r.out.push(el('rect', {
              x: round(L.markX0 + k * L.markPitch), y: round(r.y - size / 2),
              width: round(size), height: round(size), rx: 2,
              fill: messageColor(scene, m),
            }, root));
          });
        }
      }

      return { topicChip, inboxChips, sentMarks, copyMarks };
    }

    function frame(mine: number, ms: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          onFrame(ease(p));
          if (p >= 1) {
            wake();
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

    function place(g: SVGGElement, at: Pt): void {
      g.setAttribute('transform', `translate(${round(at.x)},${round(at.y)})`);
    }

    function lerp(a: Pt, b: Pt, p: number): Pt {
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
    }

    function showNew(marks: SVGRectElement[], count: number, p: number): void {
      for (const mk of marks.slice(marks.length - count)) mk.setAttribute('opacity', String(round(p)));
    }

    async function animateSend(mine: number, next: PublishToManyScene, drawn: Drawn, message: number): Promise<void> {
      const L = layout(next);
      const g = drawn.topicChip;
      if (g === null) throw new Error('publish-to-many stage: 보낸 메시지가 토픽에 그려지지 않았다');
      const from = L.pendingSlot(next.messages.indexOf(message));
      const to = L.topicRest;
      await frame(mine, SEND_MS, (p) => {
        place(g, lerp(from, to, p));
        showNew(drawn.sentMarks, 1, p);
      });
    }

    async function animateFanOut(
      mine: number, next: PublishToManyScene, drawn: Drawn, message: number, to: string[],
    ): Promise<void> {
      const L = layout(next);
      const moves = to.map((id) => {
        const row = next.subscribers.indexOf(id);
        const box = next.inbox[row];
        if (box === undefined) throw new Error(`publish-to-many stage: 구독자 ${id} 의 받는 칸이 없다`);
        const g = drawn.inboxChips.get(`${id}:${message}`);
        if (g === undefined) throw new Error(`publish-to-many stage: ${id} 에 ${message} 사본이 그려지지 않았다`);
        return { g, end: L.inboxSlot(row, box.got.length - 1) };
      });
      for (const mv of moves) {
        place(mv.g, L.topicRest);
      }
      await frame(mine, FAN_MS, (p) => {
        for (const mv of moves) place(mv.g, lerp(L.topicRest, mv.end, p));
        showNew(drawn.copyMarks, to.length, p);
      });
    }

    return {
      async render(next: PublishToManyScene, _prev: PublishToManyScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        const drawn = drawStatic(next);
        if (!opts.animate || next.step === null) return;
        const step = next.step;
        if (step.kind === 'send') await animateSend(mine, next, drawn, step.message);
        else await animateFanOut(mine, next, drawn, step.message, step.to);
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
