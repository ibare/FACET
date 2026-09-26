/**
 * 배압 무대 — 크레딧이 받는 쪽에서 보내는 쪽으로 되돌아가고, 그것을 쥐어야 통이 나간다.
 *
 * 크레딧은 자리 수만큼만 있고 사라지지도 생기지도 않는다. 보내는 쪽 지갑에 있거나
 * 받는 쪽 자리에 앉은 통 곁에 있다. 한 걸음(틱)의 운동은 한 시계로 흐른다 —
 * 앞 절반에 끝난 통이 빠지고 그 크레딧이 아래 길로 돌아오며, 뒤 절반에 다음 통이
 * 그 크레딧을 들고 위 길로 나간다. 크레딧이 없으면 맨 앞 통이 막대에 부딪혀 선다.
 * 아래 시간 줄은 보낸 틱과 그 간격을 쌓는다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SlowDownScene } from './scene.js';

const H = 316;
const DUR = 480;

const SX0 = 14;
const SX1 = 226;
const RX0 = 394;
const RX1 = 606;
const BOX_TOP = 44;
const BOX_BOTTOM = 184;
const MSG_Y = 84;
const MSG_H = 22;
const LOW_Y = 150;
const TOK_R = 8;
const SEAT_W = 42;
const SEAT_GAP = 12;
const DONE_Y = 164;

const TL_X0 = 96;
const TL_X1 = 594;
const GAP_Y = 212;
const SENT_Y = 226;
const AXIS_Y = 262;
const WAIT_Y = 270;
const TICK_Y = 300;

type Pt = { x: number; y: number };

const SVG_NS = 'http://www.w3.org/2000/svg';

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function make<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function write(
  parent: Element,
  x: number,
  y: number,
  s: string,
  opts: { fill: string; size: string; anchor?: string; weight?: string; mono?: boolean },
): SVGTextElement {
  const node = make(parent, 'text', {
    x,
    y,
    fill: opts.fill,
    'font-size': opts.size,
    'font-family': opts.mono === true ? fonts.mono : fonts.body,
    'text-anchor': opts.anchor ?? 'start',
    'dominant-baseline': 'middle',
  });
  if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
  node.textContent = s;
  return node;
}

/** 꺾은선 위에서 길이 비율 q 의 자리 */
function along(points: Pt[], q: number): Pt {
  const first = points[0];
  if (first === undefined) throw new Error('tell-them-to-slow-down-stage: 빈 길');
  if (points.length === 1 || q <= 0) return first;
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) throw new Error('tell-them-to-slow-down-stage: 길이 끊겼다');
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(len);
    total += len;
  }
  const lastPt = points[points.length - 1];
  if (lastPt === undefined) throw new Error('tell-them-to-slow-down-stage: 빈 길');
  if (q >= 1 || total === 0) return lastPt;
  let need = q * total;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const len = lens[i - 1];
    if (a === undefined || b === undefined || len === undefined) throw new Error('tell-them-to-slow-down-stage: 길이 끊겼다');
    if (need <= len) {
      const f = len === 0 ? 1 : need / len;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    need -= len;
  }
  return lastPt;
}

function ease(q: number): number {
  return q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
}

/** 구간 [a, b] 안의 진행 */
function within(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return ease((p - a) / (b - a));
}

type Mover = { node: SVGGElement; path: Pt[]; from: number; to: number; bump?: number };

export const tellThemToSlowDownStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const small = fontSizes.xs;
    const body = fontSizes.sm;
    const msgPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let handles = new Map<string, SVGGElement>();

    // ── 자리 셈 (장면의 바탕에서만)
    function msgW(n: number): number {
      const avail = SX1 - SX0 - 28;
      return Math.min(26, (avail - (n - 1) * 5) / n);
    }
    function pendingPos(s: SlowDownScene, id: string): Pt {
      const i = s.messages.indexOf(id);
      if (i < 0) throw new Error(`tell-them-to-slow-down-stage: 통 ${id} 가 바탕에 없다`);
      const w = msgW(s.messages.length);
      return { x: SX1 - 14 - w - i * (w + 5), y: MSG_Y };
    }
    function seatX(k: number): number {
      return RX1 - 16 - SEAT_W - k * (SEAT_W + SEAT_GAP);
    }
    function seatMsg(s: SlowDownScene, k: number): Pt {
      const w = msgW(s.messages.length);
      return { x: seatX(k) + (SEAT_W - w) / 2, y: MSG_Y };
    }
    function seatTok(k: number): Pt {
      return { x: seatX(k) + SEAT_W / 2, y: MSG_Y + MSG_H + 16 };
    }
    function walletPos(k: number): Pt {
      return { x: SX1 - 24 - k * (TOK_R * 2 + 10), y: LOW_Y };
    }
    function donePos(s: SlowDownScene, k: number): Pt {
      const w = msgW(s.messages.length);
      const x0 = RX0 + 58;
      const step = Math.min(w + 5, (RX1 - 12 - x0 - w) / Math.max(1, s.messages.length - 1));
      return { x: x0 + k * step, y: DONE_Y - MSG_H / 2 };
    }
    function colX(s: SlowDownScene, tick: number): number {
      if (s.lastTick === null || s.lastTick === 0) return TL_X0;
      return TL_X0 + (tick * (TL_X1 - TL_X0)) / s.lastTick;
    }
    function colW(s: SlowDownScene): number {
      if (s.lastTick === null || s.lastTick === 0) return TL_X1 - TL_X0;
      return (TL_X1 - TL_X0) / s.lastTick;
    }

    function place(node: SVGGElement, p: Pt): void {
      node.setAttribute('transform', `translate(${r2(p.x)} ${r2(p.y)})`);
    }

    function msgGroup(parent: Element, s: SlowDownScene, id: string, look: 'wait' | 'held' | 'busy' | 'done'): SVGGElement {
      const w = msgW(s.messages.length);
      const g = make(parent, 'g', {});
      const fill = look === 'busy' ? colors.itemActive : look === 'done' ? colors.bgSubtle : colors.bg;
      const stroke = look === 'done' ? colors.border : look === 'busy' ? colors.itemActive : colors.primary;
      const ink = look === 'busy' ? colors.stateInk : look === 'done' ? colors.textMuted : colors.text;
      make(g, 'rect', { x: 0, y: 0, width: w, height: MSG_H, rx: 3, fill, stroke, 'stroke-width': 1.2 });
      write(g, w / 2, MSG_H / 2 + 0.5, id, { fill: ink, size: w < 22 ? `${msgPx - 2}px` : small, anchor: 'middle', mono: true });
      return g;
    }

    function tokenGroup(parent: Element): SVGGElement {
      const g = make(parent, 'g', {});
      make(g, 'circle', { cx: 0, cy: 0, r: TOK_R, fill: colors.accent, stroke: colors.stateInk, 'stroke-width': 1 });
      return g;
    }

    // ── 정적 그리기: 이 장면의 화면 전체
    function drawStatic(s: SlowDownScene): void {
      svg.textContent = '';
      handles = new Map();
      const step = s.step;

      // 캡션 — 지금 일어나는 일만
      let caption: string;
      if (step.kind === 'start') {
        caption = t('caption.start', 'Messages to send: {n} · Credits held by the sender: {c}', {
          n: s.pending.length,
          c: s.credits,
        });
      } else if (step.tick === s.lastTick && step.returned !== null) {
        const firstGap = s.sends[1]?.gap;
        const lastGap = s.sends[s.sends.length - 1]?.gap;
        if (firstGap === undefined || firstGap === null || lastGap === undefined || lastGap === null) {
          throw new Error('tell-them-to-slow-down-stage: 간격을 말할 보낸 기록이 모자라다');
        }
        caption = t('caption.end', 'Tick {tick}: {done} finished. Delivered: {n} · Lost: {lost} · Send gap (ticks): {first} → {last}', {
          tick: step.tick,
          done: step.returned,
          n: s.done.length,
          lost: s.messages.length - s.done.length,
          first: firstGap,
          last: lastGap,
        });
      } else if (step.returned !== null && step.sent !== null) {
        caption = t('caption.returnSend', 'Tick {tick}: {done} finished — its credit came back and {sent} went out on it at once.', {
          tick: step.tick,
          done: step.returned,
          sent: step.sent,
        });
      } else if (step.sent !== null) {
        caption = t('caption.send', 'Tick {tick}: sent {sent}, spending a credit. Credits left: {c}', {
          tick: step.tick,
          sent: step.sent,
          c: s.credits,
        });
      } else if (step.waited) {
        const next = s.pending[0];
        if (next === undefined) throw new Error('tell-them-to-slow-down-stage: 멈춘 틱에 보낼 통이 없다');
        caption = t('caption.wait', 'Tick {tick}: no credit — the sender stops. Next to send: {next}', {
          tick: step.tick,
          next,
        });
      } else if (step.returned !== null) {
        caption = t('caption.return', 'Tick {tick}: {done} finished — a credit went back. Messages left to send: {n}', {
          tick: step.tick,
          done: step.returned,
          n: s.pending.length,
        });
      } else {
        if (s.busy === null) throw new Error(`tell-them-to-slow-down-stage: 틱 ${step.tick} 에 아무 일도 없다`);
        caption = t('caption.work', 'Tick {tick}: the receiver keeps working on {id}. Credits: {c}', {
          tick: step.tick,
          id: s.busy.id,
          c: s.credits,
        });
      }
      write(svg, SX0, 20, caption, { fill: colors.text, size: fontSizes.md, weight: '600' });

      // 두 상자
      make(svg, 'rect', { x: SX0, y: BOX_TOP, width: SX1 - SX0, height: BOX_BOTTOM - BOX_TOP, rx: 8, fill: colors.bgSubtle, stroke: colors.border });
      make(svg, 'rect', { x: RX0, y: BOX_TOP, width: RX1 - RX0, height: BOX_BOTTOM - BOX_TOP, rx: 8, fill: colors.bgSubtle, stroke: colors.border });
      write(svg, SX0 + 10, BOX_TOP + 16, t('label.sender', 'Sender'), { fill: colors.text, size: body, weight: '600' });
      write(svg, RX0 + 10, BOX_TOP + 16, t('label.receiver', 'Receiver'), { fill: colors.text, size: body, weight: '600' });
      write(svg, SX1 - 10, BOX_TOP + 16, t('label.credits', 'Credits: {n}', { n: s.credits }), {
        fill: s.credits === 0 ? colors.danger : colors.text,
        size: small,
        anchor: 'end',
        weight: '600',
      });
      write(svg, RX1 - 10, BOX_TOP + 16, t('label.held', 'Held: {n} / {seats}', { n: s.held.length, seats: s.seats }), {
        fill: colors.text,
        size: small,
        anchor: 'end',
        weight: '600',
      });

      // 두 길 — 위는 통이 가는 길, 아래는 크레딧이 돌아오는 길
      const upY = MSG_Y + MSG_H / 2;
      make(svg, 'line', { x1: SX1 + 6, y1: upY, x2: RX0 - 10, y2: upY, stroke: colors.border, 'stroke-width': 2 });
      make(svg, 'path', { d: `M ${RX0 - 10} ${upY - 5} L ${RX0 - 2} ${upY} L ${RX0 - 10} ${upY + 5} Z`, fill: colors.border });
      write(svg, (SX1 + RX0) / 2, upY - 14, t('label.laneMessages', 'messages'), { fill: colors.textMuted, size: small, anchor: 'middle' });
      make(svg, 'line', { x1: RX0 - 6, y1: LOW_Y, x2: SX1 + 10, y2: LOW_Y, stroke: colors.accent, 'stroke-width': 2, 'stroke-dasharray': '5 4' });
      make(svg, 'path', { d: `M ${SX1 + 10} ${LOW_Y - 5} L ${SX1 + 2} ${LOW_Y} L ${SX1 + 10} ${LOW_Y + 5} Z`, fill: colors.accent });
      write(svg, (SX1 + RX0) / 2, LOW_Y + 16, t('label.laneCredits', 'credits'), { fill: colors.textMuted, size: small, anchor: 'middle' });

      // 지갑 — 자리 수만큼의 칸, 쥔 크레딧만 찬다
      for (let k = 0; k < s.seats; k += 1) {
        const p = walletPos(k);
        make(svg, 'circle', {
          cx: p.x,
          cy: p.y,
          r: TOK_R + 2,
          fill: 'none',
          stroke: s.credits === 0 ? colors.danger : colors.border,
          'stroke-dasharray': '3 3',
        });
      }
      // 받는 쪽 자리
      for (let k = 0; k < s.seats; k += 1) {
        make(svg, 'rect', {
          x: seatX(k),
          y: MSG_Y - 6,
          width: SEAT_W,
          height: MSG_H + 36,
          rx: 5,
          fill: colors.bg,
          stroke: colors.border,
          'stroke-dasharray': '4 3',
        });
      }
      // 처리 진행 — 맨 앞 자리 아래, 처리 틱만큼의 마디
      const busy = s.busy;
      const barY = MSG_Y + MSG_H + 34;
      const segW = (SEAT_W - (s.serviceTicks - 1) * 2) / s.serviceTicks;
      for (let k = 0; k < s.serviceTicks; k += 1) {
        make(svg, 'rect', { x: seatX(0) + k * (segW + 2), y: barY, width: segW, height: 5, rx: 1, fill: colors.border });
      }
      if (busy !== null && s.tick !== null) {
        const filled = s.tick - busy.startedAt + 1;
        if (filled < 1 || filled > s.serviceTicks) {
          throw new Error(`tell-them-to-slow-down-stage: ${busy.id} 처리 마디 ${filled} 가 범위 밖이다`);
        }
        const bar = make(svg, 'g', {});
        for (let k = 0; k < filled; k += 1) {
          make(bar, 'rect', { x: seatX(0) + k * (segW + 2), y: barY, width: segW, height: 5, rx: 1, fill: colors.itemActive });
        }
        handles.set('bar', bar);
      }

      // 멈춤 막대
      if (step.kind === 'tick' && step.waited) {
        make(svg, 'line', { x1: SX1 - 5, y1: MSG_Y - 10, x2: SX1 - 5, y2: MSG_Y + MSG_H + 10, stroke: colors.danger, 'stroke-width': 3, 'stroke-linecap': 'round' });
        write(svg, SX1 - 10, MSG_Y + MSG_H + 22, t('label.stopped', 'Stopped'), { fill: colors.danger, size: small, anchor: 'end', weight: '600' });
      }

      // 끝난 통
      write(svg, RX0 + 10, DONE_Y, t('label.done', 'Done'), { fill: colors.textMuted, size: small });
      s.done.forEach((id, k) => {
        const g = msgGroup(svg, s, id, 'done');
        place(g, donePos(s, k));
        handles.set(`msg:${id}`, g);
      });

      // 보내는 쪽에 남은 통
      for (const id of s.pending) {
        const g = msgGroup(svg, s, id, 'wait');
        place(g, pendingPos(s, id));
        handles.set(`msg:${id}`, g);
      }
      // 받는 쪽이 쥔 통과 그 곁의 크레딧
      s.held.forEach((id, k) => {
        const tok = tokenGroup(svg);
        place(tok, seatTok(k));
        handles.set(`tok:${id}`, tok);
        const g = msgGroup(svg, s, id, busy !== null && busy.id === id ? 'busy' : 'held');
        place(g, seatMsg(s, k));
        handles.set(`msg:${id}`, g);
      });
      // 지갑의 크레딧
      for (let k = 0; k < s.credits; k += 1) {
        const tok = tokenGroup(svg);
        place(tok, walletPos(k));
        handles.set(`wallet:${k}`, tok);
      }

      drawTimeline(s);
    }

    function drawTimeline(s: SlowDownScene): void {
      if (s.lastTick === null) return;
      const cw = colW(s);
      // 지금 틱의 기둥
      if (s.tick !== null) {
        const cur = make(svg, 'g', {});
        make(cur, 'rect', { x: -cw / 2 + 1, y: GAP_Y - 12, width: cw - 2, height: TICK_Y - GAP_Y + 22, rx: 4, fill: colors.bgSubtle, stroke: colors.border });
        place(cur, { x: colX(s, s.tick), y: 0 });
        handles.set('cursor', cur);
      }
      write(svg, SX0, GAP_Y, t('label.gap', 'Gap'), { fill: colors.textMuted, size: small });
      write(svg, SX0, SENT_Y + 10, t('label.sent', 'Sent'), { fill: colors.textMuted, size: small });
      write(svg, SX0, WAIT_Y + 8, t('label.stopped', 'Stopped'), { fill: colors.textMuted, size: small });
      write(svg, SX0, TICK_Y, t('label.tick', 'Tick'), { fill: colors.textMuted, size: small });

      make(svg, 'line', { x1: TL_X0 - cw / 2, y1: AXIS_Y, x2: TL_X1 + cw / 2, y2: AXIS_Y, stroke: colors.border, 'stroke-width': 1.5 });
      for (let k = 0; k <= s.lastTick; k += 1) {
        const x = colX(s, k);
        make(svg, 'line', { x1: x, y1: AXIS_Y - 3, x2: x, y2: AXIS_Y + 3, stroke: colors.border });
        write(svg, x, TICK_Y, String(k), {
          fill: k === s.tick ? colors.text : colors.textMuted,
          size: small,
          anchor: 'middle',
          weight: k === s.tick ? '700' : '400',
        });
      }
      const mw = Math.min(30, cw - 6);
      s.sends.forEach((snd, i) => {
        const x = colX(s, snd.tick);
        make(svg, 'rect', { x: x - mw / 2, y: SENT_Y, width: mw, height: 20, rx: 3, fill: colors.primary });
        write(svg, x, SENT_Y + 10.5, snd.id, { fill: colors.textInverse, size: small, anchor: 'middle', mono: true });
        make(svg, 'line', { x1: x, y1: SENT_Y + 20, x2: x, y2: AXIS_Y, stroke: colors.primary });
        const before = s.sends[i - 1];
        if (before !== undefined && snd.gap !== null) {
          const xa = colX(s, before.tick);
          make(svg, 'path', {
            d: `M ${r2(xa)} ${GAP_Y + 6} L ${r2(xa)} ${GAP_Y} L ${r2(x)} ${GAP_Y} L ${r2(x)} ${GAP_Y + 6}`,
            fill: 'none',
            stroke: colors.textMuted,
          });
          const mid = (xa + x) / 2;
          make(svg, 'rect', { x: mid - 8, y: GAP_Y - 8, width: 16, height: 16, rx: 3, fill: colors.bg });
          write(svg, mid, GAP_Y + 0.5, String(snd.gap), { fill: colors.text, size: body, anchor: 'middle', weight: '700' });
        }
      });
      for (const w of s.waits) {
        const x = colX(s, w);
        make(svg, 'rect', { x: x - mw / 2, y: WAIT_Y, width: mw, height: 16, rx: 3, fill: 'none', stroke: colors.danger, 'stroke-width': 1.5 });
        make(svg, 'line', { x1: x - mw / 2 + 5, y1: WAIT_Y + 8, x2: x + mw / 2 - 5, y2: WAIT_Y + 8, stroke: colors.danger, 'stroke-width': 3, 'stroke-linecap': 'round' });
      }
    }

    function need(key: string): SVGGElement {
      const node = handles.get(key);
      if (node === undefined) throw new Error(`tell-them-to-slow-down-stage: 움직일 ${key} 가 화면에 없다`);
      return node;
    }

    // ── 이번 걸음의 운동 목록 (출발 자리는 step 이 말한다)
    function movers(s: SlowDownScene): Mover[] {
      const step = s.step;
      if (step.kind !== 'tick') return [];
      const out: Mover[] = [];
      const upY = MSG_Y;
      const hasA = step.returned !== null || step.startedFromSeat !== null;
      const b0 = hasA ? 0.5 : 0;
      // 뒤 절반에 할 일(보냄 · 멈춤)이 없으면 앞 운동이 걸음 전체를 쓴다
      const aEnd = step.sent !== null || step.waited ? 0.5 : 1;

      if (step.returned !== null) {
        const k = s.done.indexOf(step.returned);
        if (k < 0) throw new Error(`tell-them-to-slow-down-stage: 끝난 ${step.returned} 가 끝난 줄에 없다`);
        out.push({ node: need(`msg:${step.returned}`), path: [seatMsg(s, 0), donePos(s, k)], from: 0, to: aEnd });
      }
      if (step.startedFromSeat !== null && step.started !== null) {
        const now = s.held.indexOf(step.started);
        if (now < 0) throw new Error(`tell-them-to-slow-down-stage: 처리에 든 ${step.started} 가 자리에 없다`);
        out.push({ node: need(`msg:${step.started}`), path: [seatMsg(s, step.startedFromSeat), seatMsg(s, now)], from: 0, to: aEnd });
        out.push({ node: need(`tok:${step.started}`), path: [seatTok(step.startedFromSeat), seatTok(now)], from: 0, to: aEnd });
      }
      // 돌아오는 크레딧의 길: 맨 앞 자리 → 아래 길 → 지갑 칸
      const back: Pt[] = [];
      if (step.returned !== null) {
        if (step.walletSlot === null) throw new Error('tell-them-to-slow-down-stage: 돌아온 크레딧의 지갑 칸이 없다');
        const from = seatTok(0);
        const to = walletPos(step.walletSlot);
        back.push(from, { x: from.x, y: LOW_Y }, to);
      }
      if (step.sent !== null) {
        const seat = s.held.indexOf(step.sent);
        if (seat < 0) throw new Error(`tell-them-to-slow-down-stage: 보낸 ${step.sent} 가 자리에 없다`);
        if (step.walletSlot === null) throw new Error('tell-them-to-slow-down-stage: 나간 크레딧의 지갑 칸이 없다');
        const start = pendingPos(s, step.sent);
        const end = seatMsg(s, seat);
        out.push({
          node: need(`msg:${step.sent}`),
          path: [start, { x: SX1 + 2, y: upY }, { x: RX0 - 4, y: upY }, end],
          from: b0,
          to: 1,
        });
        const w = walletPos(step.walletSlot);
        const tokEnd = seatTok(seat);
        const ride: Pt[] = [w, { x: SX1 + 14, y: upY + MSG_H + 16 }, { x: RX0 - 4, y: upY + MSG_H + 16 }, tokEnd];
        if (back.length > 0) {
          // 앞 절반에 돌아오고 뒤 절반에 곧바로 다시 나간다 — 같은 크레딧 하나
          out.push({ node: need(`tok:${step.sent}`), path: back, from: 0, to: 0.5 });
          out.push({ node: need(`tok:${step.sent}`), path: ride, from: 0.5, to: 1 });
        } else {
          out.push({ node: need(`tok:${step.sent}`), path: ride, from: b0, to: 1 });
        }
      } else if (back.length > 0) {
        if (step.walletSlot === null) throw new Error('tell-them-to-slow-down-stage: 돌아온 크레딧의 지갑 칸이 없다');
        out.push({ node: need(`wallet:${step.walletSlot}`), path: back, from: 0, to: aEnd });
      }
      if (step.waited) {
        const head = s.pending[0];
        if (head === undefined) throw new Error('tell-them-to-slow-down-stage: 멈춘 틱에 맨 앞 통이 없다');
        const at = pendingPos(s, head);
        const w = msgW(s.messages.length);
        out.push({ node: need(`msg:${head}`), path: [at], from: 0, to: 1, bump: SX1 - 8 - (at.x + w) });
      }
      return out;
    }

    function frameAt(s: SlowDownScene, list: Mover[], p: number): void {
      // 같은 손잡이를 두 구간이 나눠 쓰면 지금 구간(또는 아직 시작 전이면 첫 구간)이 자리를 정한다
      const byNode = new Map<SVGGElement, Mover[]>();
      for (const m of list) {
        const arr = byNode.get(m.node) ?? [];
        arr.push(m);
        byNode.set(m.node, arr);
      }
      for (const [node, arr] of byNode) {
        let pick = arr[0];
        for (const m of arr) if (p >= m.from) pick = m;
        if (pick === undefined) throw new Error('tell-them-to-slow-down-stage: 빈 운동 묶음');
        const q = within(p, pick.from, pick.to);
        const pos = along(pick.path, q);
        if (pick.bump !== undefined) {
          place(node, { x: pos.x + Math.sin(Math.PI * q) * pick.bump, y: pos.y });
        } else {
          place(node, pos);
        }
      }
      // 시간 줄 기둥과 처리 마디
      const step = s.step;
      if (step.kind === 'tick') {
        const cur = handles.get('cursor');
        if (cur !== undefined && step.tick > 0) {
          const x = colX(s, step.tick - 1) + (colX(s, step.tick) - colX(s, step.tick - 1)) * ease(p);
          place(cur, { x, y: 0 });
        }
        const bar = handles.get('bar');
        if (bar !== undefined && s.busy !== null) {
          const segs = Array.from(bar.children);
          const last = segs[segs.length - 1];
          if (last === undefined) throw new Error('tell-them-to-slow-down-stage: 처리 마디가 비었다');
          const segW = (SEAT_W - (s.serviceTicks - 1) * 2) / s.serviceTicks;
          last.setAttribute('width', String(r2(segW * ease(p))));
        }
      }
    }

    function sleepFrame(): Promise<number> {
      return new Promise((resolve) => {
        let id = 0;
        const wake = (): void => {
          frames.delete(id);
          waiters.delete(done);
          resolve(performance.now());
        };
        const done = (): void => {
          cancelAnimationFrame(id);
          frames.delete(id);
          waiters.delete(done);
          resolve(performance.now());
        };
        waiters.add(done);
        id = requestAnimationFrame(wake);
        frames.add(id);
      });
    }

    async function play(s: SlowDownScene, mine: number): Promise<void> {
      const list = movers(s);
      frameAt(s, list, 0);
      const t0 = performance.now();
      for (;;) {
        const now = await sleepFrame();
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (now - t0) / DUR);
        frameAt(s, list, p);
        if (p >= 1) break;
      }
      if (mine !== gen || destroyed) return;
      drawStatic(s);
    }

    const renderer: SceneRenderer<SlowDownScene> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step.kind !== 'tick') return;
        // 바로 앞 틱에서 온 걸음만 흘린다 — 건너뛴 걸음은 곧바로 선다
        const prevTick = prev === null ? null : prev.tick;
        const expected = next.step.tick === 0 ? null : next.step.tick - 1;
        if (prev === null || prevTick !== expected) return;
        await play(next, mine);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer as unknown as ViewInstance;
  },
};
