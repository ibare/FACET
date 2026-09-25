/**
 * echo-and-reply stage — 튕겨 돌아온다.
 *
 * 위에는 보내는 이와 상대가 한 선으로 이어져 있고, 아래에는 seq 마다 칸이 하나씩 비어 있다.
 * 한 걸음에 요청 카드 하나가 선을 따라 상대에게 가서 **뒤집혀**(type 만 바뀌고 식별자 · seq 는
 * 그대로) 돌아오고, 보낸 이 앞에서 제 seq 칸으로 떨어져 떠난 시각 → 돌아온 시각과 왕복 시간을
 * 남긴다. 보낸 이 아래의 시계가 그동안 흐른다. 도중에 사라지는 요청은 선 가운데서 스러지고,
 * 제 칸에서 시계가 기한까지 흐른 뒤 칸은 빈 채 "답 없음" 으로 남는다.
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
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { EchoAndReplyScene, EchoOutcome } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 여백 · 크기의 상한. 실제 값은 캔버스 폭에서 역산한다. */
const PAD = 16;
const NODE_W_MAX = 132;
const NODE_H = 56;
const NODE_TOP = 22;
const CARD_W = 136;
const CARD_H = 40;
const SLOT_TOP = 128;
const SLOT_H = 92;
const SLOT_GAP = 12;
const CAPTION_Y1 = 266;
const CAPTION_Y2 = 288;

/** 한 걸음의 운동 길이 (ms) */
const ECHO_MS = 1200;
const LOST_MS = 1150;

type Motion = {
  pendingSeq: number;
  reachedShown: boolean;
  clockMs: number;
  /** 기한을 기다리는 칸의 진행 (0–1) */
  sweep: number | null;
};

function r(x: number): number {
  const v = Math.round(x * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function ease(x: number): number {
  const c = clamp01(x);
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 표시용 수 — 정수면 그대로, 아니면 소수 둘째 자리까지 */
function fmt(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(2);
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', ...attrs }, parent);
  node.textContent = s;
  return node;
}

export const echoAndReplyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [requestColor = colors.primary, replyColor = colors.success] = categorical(2);

    const W = PIECE_CANVAS_W;
    const nodeW = Math.min(NODE_W_MAX, (W - 2 * PAD) * 0.22);
    const wireY = NODE_TOP + NODE_H / 2;
    const senderRight = PAD + nodeW;
    const targetLeft = W - PAD - nodeW;
    const cardStartX = senderRight + 8 + CARD_W / 2;
    const cardEndX = targetLeft - 8 - CARD_W / 2;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function slotBox(index: number, count: number): { x: number; w: number } {
      const w = (W - 2 * PAD - SLOT_GAP * (count - 1)) / count;
      return { x: PAD + index * (w + SLOT_GAP), w };
    }

    function outcomeOf(scene: EchoAndReplyScene, seq: number): EchoOutcome | undefined {
      return scene.trail.find((o) => o.seq === seq);
    }

    function endTime(o: EchoOutcome): number {
      return o.kind === 'reply' ? o.receivedAt : o.deadlineAt;
    }

    function drawNode(x: number, role: string, addr: string): void {
      el('rect', { x, y: NODE_TOP, width: nodeW, height: NODE_H, rx: 8, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1.5 }, svg);
      label(svg, x + nodeW / 2, NODE_TOP + 17, role, { fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs });
      label(svg, x + nodeW / 2, NODE_TOP + 37, addr, { fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 600 });
    }

    function drawCard(cx: number, cy: number, sx: number, s: number, reply: boolean, seq: number, scene: EchoAndReplyScene, opacity = 1): void {
      const b = scene.base;
      const g = el('g', { transform: `translate(${r(cx)} ${r(cy)}) scale(${r(sx * s)} ${r(s)})` }, svg);
      if (opacity < 1) g.setAttribute('opacity', String(r(opacity)));
      const color = reply ? replyColor : requestColor;
      el('rect', { x: -CARD_W / 2, y: -CARD_H / 2, width: CARD_W, height: CARD_H, rx: 6, fill: colors.bg, stroke: color, 'stroke-width': 2 }, g);
      label(g, 0, -8, t('label.icmp', 'type {type} · code {code}', {
        type: reply ? b.replyType : b.requestType,
        code: reply ? b.replyCode : b.requestCode,
      }), { fill: color, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700 });
      label(g, 0, 10, t('label.fields', 'id {id} · seq {seq}', { id: b.identifier, seq }), {
        fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
      });
    }

    function drawSlot(scene: EchoAndReplyScene, index: number, motion: Motion | null): void {
      const seq = scene.base.seqs[index];
      if (seq === undefined) return;
      const { x, w } = slotBox(index, scene.base.seqs.length);
      const cx = x + w / 2;
      const pending = motion !== null && motion.pendingSeq === seq;
      const o = pending ? undefined : outcomeOf(scene, seq);
      const step = scene.step;
      const current = (step.kind === 'echo' || step.kind === 'lost') && step.seq === seq;
      const summary = scene.summary;
      const isMin = summary !== null && summary.minSeq === seq;
      const isMax = summary !== null && summary.maxSeq === seq;

      let stroke = colors.border;
      let dash = '4 4';
      if (o?.kind === 'reply') { stroke = replyColor; dash = ''; }
      if (o?.kind === 'lost') { stroke = colors.danger; dash = '6 4'; }
      if (current || pending) stroke = o?.kind === 'lost' ? colors.danger : o?.kind === 'reply' ? replyColor : colors.itemActive;
      const box = el('rect', {
        x, y: SLOT_TOP, width: w, height: SLOT_H, rx: 8,
        fill: o?.kind === 'reply' ? colors.bgSubtle : colors.bg,
        stroke, 'stroke-width': current || pending ? 2.5 : 1.5,
      }, svg);
      if (dash !== '') box.setAttribute('stroke-dasharray', dash);

      if (isMin || isMax) {
        el('rect', { x: x + 10, y: SLOT_TOP - 3, width: w - 20, height: 6, rx: 3, fill: colors.accent }, svg);
      }

      label(svg, cx, SLOT_TOP + 18, t('label.seq', 'seq {seq}', { seq }), {
        fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
      });

      if (o?.kind === 'reply') {
        label(svg, cx, SLOT_TOP + 44, t('label.span', '{from} → {to} ms', { from: o.sentAt, to: o.receivedAt }), {
          fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
        });
        label(svg, cx, SLOT_TOP + 70, t('label.rtt', 'RTT {rtt} ms', { rtt: o.rtt }), {
          fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700,
        });
      } else if (o?.kind === 'lost') {
        label(svg, cx, SLOT_TOP + 44, t('label.deadline', 'deadline {at} ms', { at: o.deadlineAt }), {
          fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
        });
        label(svg, cx, SLOT_TOP + 70, t('label.noReply', 'no reply', {}), {
          fill: colors.danger, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700,
        });
      } else if (pending && motion !== null && motion.sweep !== null) {
        // 기한을 기다리는 중 — 칸 바닥의 막대가 기한까지 찬다
        const inner = w - 20;
        el('rect', { x: x + 10, y: SLOT_TOP + SLOT_H - 16, width: inner, height: 6, rx: 3, fill: colors.bgSubtle, stroke: colors.border }, svg);
        el('rect', { x: x + 10, y: SLOT_TOP + SLOT_H - 16, width: inner * clamp01(motion.sweep), height: 6, rx: 3, fill: colors.danger }, svg);
      }

      if (isMin || isMax) {
        label(svg, cx, SLOT_TOP + SLOT_H + 14, isMin ? t('label.min', 'min', {}) : t('label.max', 'max', {}), {
          fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 700,
        });
      }
    }

    function captions(scene: EchoAndReplyScene): [string, string] {
      const b = scene.base;
      const step = scene.step;
      if (step.kind === 'start') {
        return [
          t('caption.start', 'To {target}: echo requests with id {id}, one every {interval} ms', {
            target: b.target, id: b.identifier, interval: b.intervalMs,
          }),
          t('caption.startDeadline', 'Deadline: {timeout} ms after each send', { timeout: b.timeoutMs }),
        ];
      }
      if (step.kind === 'summary') {
        const s = scene.summary;
        if (s === null) return ['', ''];
        return [
          t('caption.summary', 'Sent: {sent} · received: {received} · lost: {loss}%', {
            sent: s.sent, received: s.received, loss: fmt(s.lossPercent),
          }),
          t('caption.summaryRtt', 'Over the replies — min {min} · avg {avg} · max {max} ms', {
            min: s.min, avg: s.avg.toFixed(2), max: s.max,
          }),
        ];
      }
      const o = outcomeOf(scene, step.seq);
      if (o === undefined) return ['', ''];
      if (o.kind === 'reply') {
        return [
          t('caption.echo', 'seq {seq}: sent at {sent} ms; the reply with the same id and seq arrived at {received} ms', {
            seq: o.seq, sent: o.sentAt, received: o.receivedAt,
          }),
          t('caption.rtt', 'Round trip: {received} − {sent} = {rtt} ms', { received: o.receivedAt, sent: o.sentAt, rtt: o.rtt }),
        ];
      }
      return [
        t('caption.lost', 'seq {seq}: sent at {sent} ms; nothing came back by the deadline, {deadline} ms', {
          seq: o.seq, sent: o.sentAt, deadline: o.deadlineAt,
        }),
        t('caption.lostWhy', 'Counted as lost — the sender cannot tell whether the request or the reply went missing', {}),
      ];
    }

    function drawStatic(scene: EchoAndReplyScene, motion: Motion | null = null): void {
      svg.textContent = '';
      const b = scene.base;
      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, svg);
      el('line', { x1: senderRight, y1: wireY, x2: targetLeft, y2: wireY, stroke: colors.border, 'stroke-width': 2 }, svg);
      drawNode(PAD, t('label.source', 'Sender', {}), b.source);
      drawNode(targetLeft, t('label.target', 'Target', {}), b.target);

      // 보내는 이의 시계
      const last = scene.trail[scene.trail.length - 1];
      const clockMs = motion !== null ? motion.clockMs : last !== undefined ? endTime(last) : 0;
      label(svg, PAD + nodeW / 2, NODE_TOP + NODE_H + 18, t('label.clock', 'now {ms} ms', { ms: Math.round(clockMs) }), {
        fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
      });

      // 상대가 되돌린 시각 — 이번 걸음이 돌아온 왕복일 때만
      const step = scene.step;
      if (step.kind === 'echo' && (motion === null || motion.reachedShown)) {
        const o = outcomeOf(scene, step.seq);
        if (o?.kind === 'reply') {
          label(svg, targetLeft + nodeW / 2, NODE_TOP + NODE_H + 18, t('label.reached', 'turned at {at} ms', { at: o.reachedAt }), {
            fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
          });
        }
      }

      for (let i = 0; i < b.seqs.length; i += 1) drawSlot(scene, i, motion);

      const [c1, c2] = captions(scene);
      label(svg, W / 2, CAPTION_Y1, c1, { fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md });
      label(svg, W / 2, CAPTION_Y2, c2, { fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm });
    }

    function play(duration: number, frame: (p: number) => void, mine: number): Promise<void> {
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
          if (destroyed || mine !== gen) { finish(); return; }
          const p = clamp01((Date.now() - start) / duration);
          frame(p);
          if (p >= 1) { finish(); return; }
          const id = setTimeout(() => { timers.delete(id); tick(); }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function slotCenter(scene: EchoAndReplyScene, seq: number): { x: number; y: number } {
      const index = scene.base.seqs.indexOf(seq);
      if (index < 0) throw new Error(`echo-and-reply: seq ${seq} 의 칸이 없다`);
      const { x, w } = slotBox(index, scene.base.seqs.length);
      return { x: x + w / 2, y: SLOT_TOP + SLOT_H / 2 };
    }

    /** 가서 뒤집혀 돌아와 제 칸으로 떨어진다. 한 시계로 흐른다. */
    function animateEcho(next: EchoAndReplyScene, o: Extract<EchoOutcome, { kind: 'reply' }>, mine: number): Promise<void> {
      const slot = slotCenter(next, o.seq);
      return play(ECHO_MS, (p) => {
        const go = clamp01(p / 0.3);
        const flip = clamp01((p - 0.3) / 0.15);
        const back = clamp01((p - 0.45) / 0.3);
        const drop = clamp01((p - 0.75) / 0.25);
        const reply = flip >= 0.5;
        const clockMs = p < 0.3
          ? lerp(o.sentAt, o.reachedAt, go)
          : lerp(o.reachedAt, o.receivedAt, back);
        drawStatic(next, { pendingSeq: o.seq, reachedShown: reply, clockMs, sweep: null });
        let cx: number;
        let cy = wireY;
        let s = 1;
        if (p < 0.3) cx = lerp(cardStartX, cardEndX, ease(go));
        else if (p < 0.45) cx = cardEndX;
        else if (p < 0.75) cx = lerp(cardEndX, cardStartX, ease(back));
        else {
          const e = ease(drop);
          cx = lerp(cardStartX, slot.x, e);
          cy = lerp(wireY, slot.y, e);
          s = lerp(1, 0.85, e);
        }
        // 뒤집기 — 가로로 접혔다가 답의 얼굴로 다시 펴진다
        const sx = flip > 0 && flip < 1 ? Math.max(0.02, Math.abs(Math.cos(Math.PI * flip))) : 1;
        drawCard(cx, cy, sx, s, reply, o.seq, next);
      }, mine);
    }

    /** 가다가 스러지고, 제 칸에서 시계가 기한까지 흐른다. */
    function animateLost(next: EchoAndReplyScene, o: Extract<EchoOutcome, { kind: 'lost' }>, mine: number): Promise<void> {
      const midX = (cardStartX + cardEndX) / 2;
      return play(LOST_MS, (p) => {
        const go = clamp01(p / 0.3);
        const fade = clamp01((p - 0.3) / 0.15);
        const wait = clamp01((p - 0.45) / 0.55);
        // 시계는 보낸 시각에서 기한까지 한 줄로 흐른다
        const clockMs = lerp(o.sentAt, o.deadlineAt, clamp01(p));
        drawStatic(next, { pendingSeq: o.seq, reachedShown: false, clockMs, sweep: p < 0.45 ? 0 : wait });
        if (fade < 1) {
          const cx = lerp(cardStartX, midX, ease(go));
          drawCard(cx, wireY, 1, lerp(1, 0.4, fade), false, o.seq, next, 1 - fade);
        }
      }, mine);
    }

    return {
      async render(next: EchoAndReplyScene, _prev: EchoAndReplyScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || step.kind === 'start' || step.kind === 'summary') {
          drawStatic(next);
          return;
        }
        const o = outcomeOf(next, step.seq);
        if (o === undefined) throw new Error(`echo-and-reply: seq ${step.seq} 의 결과가 장면에 없다`);
        if (o.kind === 'reply') await animateEcho(next, o, mine);
        else await animateLost(next, o, mine);
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
