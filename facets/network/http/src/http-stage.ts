/**
 * http-stage — 30 초 시간 축 위, 서버 쪽에 쌓이는 메시지 더미와 그것을 비우는 요청 눈금.
 *
 * 위에서 아래로:
 * - 머리 줄 — 표식 풀이 (응답 상태 줄은 자료 그대로)
 * - 서버 줄 — 메시지가 태어난 자리의 점(움직이지 않는다), 그 위에 **지금 쌓여 있는 더미**가 시각 표식을 따라간다
 * - 요청 눈금 — 클라이언트 줄에서 서버 줄로 올라가는 세로 금. 폴링이면 눈금 떼, 웹소켓이면 맨 앞의 업그레이드 하나와
 *   가로로 이어진 연결 띠. 더미는 눈금이 오면 그 금을 타고 클라이언트 줄로 내려와 쌓인다
 * - 클라이언트 줄과 초 눈금
 * - 늦음 막대 일곱 — 메시지마다 태어난 자리에서 넘어간 자리까지. 앞 판의 막대는 점선 윤곽으로 남는다
 * - 캡션
 *
 * 손잡이를 돌리면: 앞 판의 요청 눈금이 새 간격의 자리로 미끄러져 모이고 남는 것은 걷힌다(웹소켓이면 맨 앞 하나로 모인다).
 * 창 하나를 재생하는 동안 시각 표식이 lo → hi 로 지나가며 그 사이의 탄생 · 폴링 · 틀이 시각 차례로 일어난다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 420;
const AXIS_X0 = 104;
const AXIS_X1 = 736;
const LEGEND_Y = 18;
const SERVER_Y = 132;
const CLIENT_Y = 222;
const AXIS_LABEL_Y = 240;
const BARS_TOP = 262;
const ROW_H = 16;
const CAPTION_Y = 402;
const BLOCK = 10;
const BLOCK_GAP = 2;
/** 창의 끝에 닿은 뒤 떨어지는 더미가 마저 내려앉는 시간 (모형 초) */
const TAIL_SEC = 0.8;
const DROP_SEC = 0.7;

export type HttpRunStartView = {
  receive: number;
  mode: 'poll' | 'websocket';
  periodSec: number;
  pollTimes: number[];
  births: number[];
  horizonSec: number;
  windowSec: number;
};

export type HttpUpgradeView = { requestBytes: number; responseBytes: number };

export type HttpHappeningView = { at: number; kind: 'birth' | 'poll-empty' | 'poll-deliver' | 'push'; ids: number[] };

export type HttpWindowView = {
  index: number;
  lo: number;
  hi: number;
  happenings: HttpHappeningView[];
  delivered: { id: number; born: number; at: number }[];
  pending: number[];
  requests: number;
  emptyResponses: number;
  delaySeconds: number;
  overheadBytes: number;
  wireBytes: number;
};

export type HttpStage = {
  startRun(p: HttpRunStartView, durationMs: number): Promise<void>;
  showUpgrade(p: HttpUpgradeView, durationMs: number): Promise<void>;
  playWindow(p: HttpWindowView, durationMs: number): Promise<void>;
  reset(): void;
  destroy(): void;
};

type Poll = { at: number; kind: 'poll-empty' | 'poll-deliver' | 'push'; ids: number[] };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function set(node: Element, attrs: Record<string, string | number>): void {
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/** 응답 상태 줄 묶음의 첫 줄. initialData 가 있는데 그 자리가 글자가 아니면 던진다 (C6). */
function firstLine(data: Record<string, unknown>, key: string): string {
  const lines = data[key];
  if (!Array.isArray(lines)) throw new Error(`http-stage: initialData.${key} 가 배열이 아니다`);
  const first: unknown = lines[0];
  if (typeof first !== 'string') throw new Error(`http-stage: initialData.${key} 의 첫 줄이 글자가 아니다`);
  return first;
}

export const httpStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(container, params): ViewInstance {
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('font-family', fonts.body);

    const root = el('g');
    svg.appendChild(root);

    // ── 고정 바탕 ─────────────────────────────────────────────
    const windowRect = el('rect', { x: AXIS_X0, y: SERVER_Y - 100, width: 0, height: CLIENT_Y - SERVER_Y + 108, fill: c.bgSubtle, rx: 4 });
    root.appendChild(windowRect);
    const laneServer = el('line', { x1: AXIS_X0, x2: AXIS_X1, y1: SERVER_Y, y2: SERVER_Y, stroke: c.border, 'stroke-width': 2 });
    const laneClient = el('line', { x1: AXIS_X0, x2: AXIS_X1, y1: CLIENT_Y, y2: CLIENT_Y, stroke: c.border, 'stroke-width': 2 });
    root.append(laneServer, laneClient);

    const label = (text: string, x: number, y: number, extra: Record<string, string | number> = {}): SVGTextElement => {
      const node = el('text', { x, y, fill: c.textMuted, 'font-size': fontSizes.sm, 'dominant-baseline': 'middle', ...extra });
      node.textContent = text;
      root.appendChild(node);
      return node;
    };
    label(t('label.server', 'Server'), 8, SERVER_Y, { fill: c.text });
    label(t('label.client', 'Client'), 8, CLIENT_Y, { fill: c.text });
    label(t('label.delay', 'Delay'), 8, BARS_TOP + ROW_H / 2);

    const axisGroup = el('g');
    root.appendChild(axisGroup);
    const bandRect = el('rect', { x: AXIS_X0, y: (SERVER_Y + CLIENT_Y) / 2 - 6, width: 0, height: 12, rx: 6, fill: c.bgSubtle, stroke: c.primary, 'stroke-width': 1.5, display: 'none' });
    root.appendChild(bandRect);
    const tickGroup = el('g');
    const birthGroup = el('g');
    const barGroup = el('g');
    const blockGroup = el('g');
    root.append(tickGroup, birthGroup, barGroup, blockGroup);
    const cursor = el('line', { y1: SERVER_Y - 100, y2: CLIENT_Y + 8, stroke: c.accent, 'stroke-width': 2, display: 'none' });
    root.appendChild(cursor);
    const handshake = el('rect', { width: BLOCK, height: BLOCK, rx: 2, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5, display: 'none' });
    root.appendChild(handshake);
    const caption = el('text', { x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: c.text, 'font-size': fontSizes.md });
    root.appendChild(caption);

    // 머리 줄 표식 — 글자는 자료(응답 상태 줄)라 번역하지 않는다
    const legendItems: { draw: (x: number) => void; text: string }[] = [];
    // initialData 없이 마운트하는 전수 검사에서는 표식을 두지 않는다 — 있으면 세 줄 모두 있어야 한다
    const data = params.initialData;
    if (data !== undefined) {
      const emptyLine = firstLine(data, 'emptyResponseLines');
      const fullLine = firstLine(data, 'fullResponseHeadLines');
      const upgradeLine = firstLine(data, 'upgradeResponseLines');
      legendItems.push({ text: emptyLine, draw: (x) => root.appendChild(el('circle', { cx: x, cy: LEGEND_Y, r: 4, fill: c.bg, stroke: c.textMuted, 'stroke-width': 1.5 })) });
      legendItems.push({ text: fullLine, draw: (x) => root.appendChild(el('rect', { x: x - BLOCK / 2, y: LEGEND_Y - BLOCK / 2, width: BLOCK, height: BLOCK, rx: 2, fill: c.primary })) });
      legendItems.push({ text: upgradeLine, draw: (x) => root.appendChild(el('rect', { x: x - 8, y: LEGEND_Y - 5, width: 16, height: 10, rx: 5, fill: c.bgSubtle, stroke: c.primary, 'stroke-width': 1.5 })) });
    }
    {
      const charW = parseFloat(fontSizes.xs) * 0.6;
      let x = AXIS_X0 + 8;
      for (const item of legendItems) {
        item.draw(x);
        const node = el('text', { x: x + 12, y: LEGEND_Y, fill: c.textMuted, 'font-size': fontSizes.xs, 'font-family': fonts.mono, 'dominant-baseline': 'middle' });
        node.textContent = item.text;
        root.appendChild(node);
        x += 12 + item.text.length * charW + 24;
      }
    }

    // ── 판 상태 ───────────────────────────────────────────────
    let horizon = 30;
    let windowSec = 5;
    let births: number[] = [];
    let mode: 'poll' | 'websocket' | null = null;
    let pollTimes: number[] = [];
    /** 판이 바뀔 때 눈금이 떠나는 자리 (초) */
    let fromTicks: number[] = [];
    let morph = 1;
    /** 앞 판의 메시지별 늦음 (초) — 점선 윤곽 */
    let ghost: (number | null)[] = [];
    let polls: Poll[] = [];
    let deliveredAt = new Map<number, { at: number; slot: number; pileSlot: number }>();
    let clock = 0;
    let win: { lo: number; hi: number } | null = null;
    let upgraded = 0; // 0..1 업그레이드 진행
    let destroyed = false;

    const xOf = (sec: number): number => AXIS_X0 + ((AXIS_X1 - AXIS_X0) * sec) / horizon;
    const pxPerSec = (): number => (AXIS_X1 - AXIS_X0) / horizon;

    const drawAxis = (): void => {
      while (axisGroup.firstChild) axisGroup.removeChild(axisGroup.firstChild);
      for (let sec = 0; sec <= horizon; sec += windowSec) {
        axisGroup.appendChild(el('line', { x1: xOf(sec), x2: xOf(sec), y1: CLIENT_Y, y2: CLIENT_Y + 5, stroke: c.textMuted }));
        const node = el('text', { x: xOf(sec), y: AXIS_LABEL_Y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: c.textMuted, 'font-size': fontSizes.xs });
        node.textContent = t('label.seconds', '{n} s', { n: sec });
        axisGroup.appendChild(node);
      }
    };
    drawAxis();

    const pool = <K extends keyof SVGElementTagNameMap>(group: SVGGElement, tag: K) => {
      const items: SVGElementTagNameMap[K][] = [];
      let used = 0;
      return {
        begin(): void {
          used = 0;
        },
        take(): SVGElementTagNameMap[K] {
          let node = items[used];
          if (node === undefined) {
            node = el(tag);
            items.push(node);
            group.appendChild(node);
          }
          node.removeAttribute('display');
          used += 1;
          return node;
        },
        end(): void {
          for (let i = used; i < items.length; i++) items[i]?.setAttribute('display', 'none');
        },
      };
    };
    const tickLines = pool(tickGroup, 'line');
    const tickMarks = pool(tickGroup, 'circle');
    const birthDots = pool(birthGroup, 'circle');
    const bars = pool(barGroup, 'rect');
    const barTexts = pool(barGroup, 'text');
    const blocks = pool(blockGroup, 'rect');

    const pollAt = (sec: number): Poll | undefined => polls.find((p) => p.at === sec);

    const render = (): void => {
      if (destroyed) return;
      const cursorSec = win === null ? clock : Math.min(clock, win.hi);
      // 창
      if (win === null) set(windowRect, { width: 0 });
      else set(windowRect, { x: xOf(win.lo), width: xOf(win.hi) - xOf(win.lo) });
      // 시각 표식
      if (mode === null || (win === null && upgraded === 0)) set(cursor, { display: 'none' });
      else {
        cursor.removeAttribute('display');
        set(cursor, { x1: xOf(cursorSec), x2: xOf(cursorSec) });
      }

      // 요청 눈금 — 판이 바뀌면 앞 자리에서 새 자리로 미끄러진다
      tickLines.begin();
      tickMarks.begin();
      const targets = mode === 'websocket' ? [0] : pollTimes;
      const count = Math.max(fromTicks.length, targets.length);
      const p = ease(morph);
      for (let i = 0; i < count; i++) {
        const from = fromTicks[i];
        const to = targets[i];
        let sec: number;
        let scale: number;
        if (from !== undefined && to !== undefined) {
          sec = lerp(from, to, p);
          scale = 1;
        } else if (to !== undefined) {
          sec = to;
          scale = p;
        } else if (from !== undefined) {
          // 걷히는 눈금 — 새 판의 마지막 눈금 쪽으로 모이며 줄어든다
          const last = targets[targets.length - 1] ?? 0;
          sec = lerp(from, last, p);
          scale = 1 - p;
        } else continue;
        if (scale <= 0.001) continue;
        const x = xOf(sec);
        const line = tickLines.take();
        const top = lerp(CLIENT_Y, SERVER_Y, scale);
        const poll = to !== undefined && morph >= 1 ? (mode === 'websocket' ? null : pollAt(to)) : undefined;
        const revealed = mode === 'websocket' ? upgraded > 0 && i === 0 && morph >= 1 : poll !== undefined && poll !== null && clock >= poll.at;
        set(line, {
          x1: x, x2: x, y1: CLIENT_Y, y2: top,
          stroke: revealed ? c.text : c.textMuted,
          'stroke-width': mode === 'websocket' && i === 0 && revealed ? 3 : 1.5,
          'stroke-dasharray': revealed ? 'none' : '3 3',
          opacity: revealed ? 1 : 0.7,
        });
        if (revealed && mode === 'poll' && poll !== undefined && poll !== null && poll.kind === 'poll-empty') {
          const mark = tickMarks.take();
          set(mark, { cx: x, cy: CLIENT_Y, r: 4, fill: c.bg, stroke: c.textMuted, 'stroke-width': 1.5 });
        }
      }
      tickLines.end();
      tickMarks.end();

      // 웹소켓 연결 띠
      if (mode === 'websocket' && upgraded > 0) {
        bandRect.removeAttribute('display');
        const end = Math.max(xOf(cursorSec), xOf(0) + 12 * upgraded);
        set(bandRect, { width: end - xOf(0) });
      } else set(bandRect, { display: 'none' });

      // 업그레이드 요청 · 응답이 첫 금을 타고 오간다
      if (mode === 'websocket' && upgraded > 0 && upgraded < 1) {
        handshake.removeAttribute('display');
        const up = upgraded < 0.5 ? upgraded * 2 : 1;
        const down = upgraded < 0.5 ? 0 : (upgraded - 0.5) * 2;
        const y = upgraded < 0.5 ? lerp(CLIENT_Y, SERVER_Y, ease(up)) : lerp(SERVER_Y, CLIENT_Y, ease(down));
        set(handshake, { x: xOf(0) - BLOCK / 2, y: y - BLOCK / 2 });
      } else set(handshake, { display: 'none' });

      // 태어난 자리 — 움직이지 않는다
      birthDots.begin();
      births.forEach((b) => {
        if (mode === null || clock < b) return;
        const grow = clamp01((clock - b) / 0.4);
        set(birthDots.take(), { cx: xOf(b), cy: SERVER_Y, r: 5 * grow, fill: c.bg, stroke: c.text, 'stroke-width': 1.5 });
      });
      birthDots.end();

      // 더미 — 쌓여 있으면 시각 표식을 따라가고, 눈금이 오면 금을 타고 내려앉는다
      blocks.begin();
      const isWaiting = (b: number, id: number): boolean => {
        if (mode === null || clock < b) return false;
        const d = deliveredAt.get(id);
        return d === undefined || clock < d.at;
      };
      const waitingCount = births.filter((b, id) => isWaiting(b, id)).length;
      for (let k = 0; k < waitingCount; k++) {
        const node = blocks.take();
        set(node, {
          x: xOf(cursorSec) - BLOCK / 2,
          y: SERVER_Y - 10 - (k + 1) * (BLOCK + BLOCK_GAP),
          width: BLOCK, height: BLOCK, rx: 2, fill: c.primary, opacity: 1,
        });
      }
      for (const [id, d] of deliveredAt) {
        if (clock < d.at) continue;
        const b = births[id];
        if (b === undefined) throw new Error(`http-stage: 없는 메시지 ${id}`);
        const q = ease(clamp01((clock - d.at) / DROP_SEC));
        const yFrom = SERVER_Y - 10 - (d.pileSlot + 1) * (BLOCK + BLOCK_GAP);
        const yTo = CLIENT_Y - 6 - (d.slot + 1) * (BLOCK + BLOCK_GAP);
        const node = blocks.take();
        set(node, { x: xOf(d.at) - BLOCK / 2, y: lerp(yFrom, yTo, q), width: BLOCK, height: BLOCK, rx: 2, fill: c.primary, opacity: 1 });
      }
      blocks.end();

      // 늦음 막대
      bars.begin();
      barTexts.begin();
      births.forEach((b, id) => {
        const y = BARS_TOP + id * ROW_H + 3;
        const hBar = ROW_H - 6;
        const old = ghost[id];
        if (old !== undefined && old !== null) {
          set(bars.take(), {
            x: xOf(b), y, width: Math.max(2, old * pxPerSec()), height: hBar, rx: 2,
            fill: 'none', stroke: c.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 2', opacity: 1,
          });
        }
        if (mode === null || clock < b) return;
        const d = deliveredAt.get(id);
        const endSec = d !== undefined && clock >= d.at ? d.at : Math.max(b, cursorSec);
        set(bars.take(), {
          x: xOf(b), y, width: Math.max(2, (endSec - b) * pxPerSec()), height: hBar, rx: 2,
          fill: c.accent, stroke: 'none', 'stroke-dasharray': 'none', opacity: 1,
        });
        if (d !== undefined && clock >= d.at) {
          const node = barTexts.take();
          set(node, { x: xOf(d.at) + 6, y: y + hBar / 2, 'dominant-baseline': 'middle', fill: c.text, 'font-size': fontSizes.xs });
          node.textContent = t('label.seconds', '{n} s', { n: d.at - b });
        }
      });
      bars.end();
      barTexts.end();
    };

    // ── 애니메이션 ───────────────────────────────────────────
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const animate = (durationMs: number, draw: (p: number) => void): Promise<void> =>
      new Promise((resolve) => {
        const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
        if (destroyed || isInstant() || raf === null || durationMs <= 0) {
          draw(1);
          resolve();
          return;
        }
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          if (!destroyed) draw(1);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const frame = (now: number): void => {
          frames.delete(id);
          if (done) return;
          const p = clamp01((now - start) / durationMs);
          draw(p);
          if (p >= 1) finish();
          else id = raf(frame);
          frames.add(id);
        };
        let id = raf(frame);
        frames.add(id);
      });
    const settle = (): void => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };
    params.onScrubStart?.(settle);

    const setCaption = (text: string): void => {
      caption.textContent = text;
    };

    const stage: HttpStage = {
      async startRun(p, durationMs) {
        settle();
        // 앞 판의 결과가 점선 윤곽으로 남고, 눈금은 지금 자리에서 떠난다
        if (mode !== null) {
          ghost = births.map((b, id) => {
            const d = deliveredAt.get(id);
            return d !== undefined && clock >= d.at ? d.at - b : null;
          });
          fromTicks = mode === 'websocket' ? (upgraded > 0 ? [0] : []) : [...pollTimes];
        } else {
          ghost = [];
          fromTicks = [];
        }
        horizon = p.horizonSec;
        windowSec = p.windowSec;
        births = [...p.births];
        mode = p.mode;
        pollTimes = [...p.pollTimes];
        polls = [];
        deliveredAt = new Map();
        clock = 0;
        win = null;
        upgraded = 0;
        drawAxis();
        if (p.mode === 'poll') {
          setCaption(t('caption.startPoll', 'Ask every {period} s · requests scheduled: {count} · time axis: {horizon} s', {
            period: p.periodSec, count: p.pollTimes.length, horizon: p.horizonSec,
          }));
        } else {
          setCaption(t('caption.startSocket', 'Upgrade once and keep the connection open · time axis: {horizon} s', { horizon: p.horizonSec }));
        }
        morph = 0;
        await animate(durationMs, (q) => {
          morph = q;
          render();
        });
      },
      async showUpgrade(p, durationMs) {
        settle();
        if (mode !== 'websocket') throw new Error('http-stage: 웹소켓 판이 아닌데 업그레이드가 왔다');
        polls.push({ at: 0, kind: 'push', ids: [] });
        setCaption(t('caption.upgrade', 'Upgrade request: {req} bytes · response: {res} bytes', { req: p.requestBytes, res: p.responseBytes }));
        await animate(durationMs, (q) => {
          upgraded = Math.max(0.001, q);
          render();
        });
      },
      async playWindow(p, durationMs) {
        settle();
        if (mode === null) throw new Error('http-stage: 판이 시작되지 않았는데 창이 왔다');
        for (const h of p.happenings) {
          if (h.kind === 'birth') continue;
          polls.push({ at: h.at, kind: h.kind, ids: [...h.ids] });
          h.ids.forEach((id, k) => {
            // 폴링이면 더미 속 차례 그대로, 웹소켓이면 틀 하나씩
            deliveredAt.set(id, { at: h.at, slot: k, pileSlot: h.kind === 'push' ? 0 : k });
          });
        }
        win = { lo: p.lo, hi: p.hi };
        setCaption(t('caption.window', 'Window ({lo} s, {hi} s] · delivered here: {delivered} · waiting on the server: {pending}', {
          lo: p.lo, hi: p.hi, delivered: p.delivered.length, pending: p.pending.length,
        }));
        const from = p.lo;
        const to = p.hi + TAIL_SEC;
        await animate(durationMs, (q) => {
          clock = lerp(from, to, q);
          render();
        });
      },
      reset() {
        settle();
        mode = null;
        pollTimes = [];
        fromTicks = [];
        ghost = [];
        polls = [];
        deliveredAt = new Map();
        clock = 0;
        win = null;
        upgraded = 0;
        morph = 1;
        setCaption('');
        render();
      },
      destroy() {
        settle();
        destroyed = true;
        svg.removeChild(root);
      },
    };
    render();
    void container;
    return stage as unknown as ViewInstance;
  },
};
