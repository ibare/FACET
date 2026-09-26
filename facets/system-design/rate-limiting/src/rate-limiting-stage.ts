/**
 * 레이트 리미팅 무대 — 요청 줄 · 제한기 · 서버 시간 축 세 줄.
 *
 * 위 줄은 틱마다 온 요청(빈 테두리는 그 요청이 온 자리로 늘 남는다). 가운데 띠는 제한기 — 지금 틱에 선
 * 문(세로선)과 b 칸(창 안 받은 수 · 토큰 · 통 안 요청)이 틱을 따라 오른쪽으로 옮겨 가고, 창 둘은 지금 창의
 * 틀을, 고정 창은 칸 경계선을 함께 보인다. 아래 줄은 뒤쪽 서버의 시간 축 — 지나간 요청이 그 틱에 떨어져
 * 쌓여 기둥 · 계단이 된다. 거절된 요청은 문에서 튕겨 제 자리로 돌아가 × 가 된다.
 *
 * 무대는 셈하지 않는다 — 지나간 틱 · 거절 · 칸 수 · 창 · 가장 붐빈 구간은 모두 payload 로 받는다.
 * 자리(쌓는 높이 · 칸 위치)만 스스로 정한다.
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
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type StageInit = {
  method: number;
  burst: number;
  axisEnd: number;
  maxStack: number;
  maxBurst: number;
  startFill: number;
  arriveTick: number[];
};

export type StageTick = {
  tick: number;
  arrived: number[];
  passed: number[];
  rejected: number[];
  queued: number[];
  bucket: number[];
  fill: number;
  window: { start: number; end: number } | null;
  peakStart: number;
};

export type RateLimitingStage = ViewInstance & {
  init(p: StageInit): void;
  tick(p: StageTick, durationMs: number): void;
  reset(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 800;
const H = 372;
const LEFT = 132;
const RIGHT = 20;
const Y_CAPTION = 20;
const Y_SUB = 40;
const Y_ARR = 124;
const BAND_TOP = 144;
const BAND_BOT = 226;
const Y_SRV = 306;
const Y_AXIS = 316;
const Y_AXIS_LABEL = 331;
const Y_SPAN = 343;
const Y_SPAN_LABEL = 360;
const STACK_ROOM = 48;
const R = 3.5;

type Pt = { x: number; y: number };
type ReqState = 'waiting' | 'bucket' | 'passed' | 'rejected';
type Req = {
  arrive: number;
  level: number;
  ghost: SVGCircleElement;
  dot: SVGCircleElement;
  cross: SVGGElement;
  pos: Pt;
  state: ReqState;
};

type Board = {
  init: StageInit;
  col: number;
  pitch: number;
  cellH: number;
  cellW: number;
  reqs: Req[];
  gate: SVGLineElement;
  gateX: number;
  cells: SVGRectElement[];
  frame: SVGRectElement;
  frameSpan: { x: number; w: number } | null;
  span: SVGGElement;
  spanBar: SVGPathElement;
  spanLabel: SVGTextElement;
  spanPos: { x: number; w: number } | null;
  caption: SVGTextElement;
  sub: SVGTextElement;
  landed: number;
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

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));

export const rateLimitingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): RateLimitingStage {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? ((): boolean => false);
    const root = el('g', {}, svg);
    let board: Board | null = null;
    let frameId = 0;
    let pending: Array<(u: number) => void> = [];

    const methodName = (m: number): string => {
      if (m === 0) return t('label.method.fixed', 'Fixed window');
      if (m === 1) return t('label.method.sliding', 'Sliding window');
      if (m === 2) return t('label.method.token', 'Token bucket');
      if (m === 3) return t('label.method.leaky', 'Leaky bucket');
      throw new Error(`rate-limiting-stage: 모르는 방식 ${m}`);
    };

    /** 걸려 있던 운동을 끝 상태로 마친다. */
    const finish = (): void => {
      if (frameId !== 0) cancelAnimationFrame(frameId);
      frameId = 0;
      const rest = pending;
      pending = [];
      for (const f of rest) f(1);
    };

    /** 걸려 있던 운동을 버린다 (판을 비울 때). */
    const drop = (): void => {
      if (frameId !== 0) cancelAnimationFrame(frameId);
      frameId = 0;
      pending = [];
    };

    const animate = (tweens: Array<(u: number) => void>, durationMs: number): void => {
      finish();
      if (durationMs <= 0 || isInstant()) {
        for (const f of tweens) f(1);
        return;
      }
      pending = tweens;
      const start = performance.now();
      const step = (now: number): void => {
        const u = Math.min(1, (now - start) / durationMs);
        const e = ease(u);
        for (const f of pending) f(e);
        if (u < 1) frameId = requestAnimationFrame(step);
        else {
          frameId = 0;
          pending = [];
        }
      };
      frameId = requestAnimationFrame(step);
    };

    params.onScrubStart?.(finish);

    const reset = (): void => {
      drop();
      while (root.firstChild) root.removeChild(root.firstChild);
      board = null;
    };

    const need = (): Board => {
      if (board === null) throw new Error('rate-limiting-stage: init 전에 tick 이 왔다');
      return board;
    };

    const X = (b: Board, tick: number): number => LEFT + b.col * (tick + 0.5);
    const arrivalPt = (b: Board, r: Req): Pt => ({ x: X(b, r.arrive), y: Y_ARR - r.level * b.pitch });
    const cellY = (b: Board, k: number): number => BAND_BOT - 4 - (k + 1) * b.cellH;
    const cellPt = (b: Board, gateX: number, k: number): Pt => ({ x: gateX, y: cellY(b, k) + (b.cellH - 2) / 2 });

    const placeDot = (r: Req, p: Pt): void => {
      r.pos = p;
      r.dot.setAttribute('cx', p.x.toFixed(2));
      r.dot.setAttribute('cy', p.y.toFixed(2));
    };

    const paintCells = (b: Board, fill: number, gateX: number): void => {
      const color = b.init.method === 0 || b.init.method === 1 ? c.primary : b.init.method === 2 ? c.accent : c.bg;
      b.cells.forEach((cell, k) => {
        cell.setAttribute('x', (gateX - b.cellW / 2).toFixed(2));
        cell.setAttribute('display', k < b.init.burst ? 'inline' : 'none');
        cell.setAttribute('fill', k < fill ? color : c.bg);
      });
    };

    const setSpan = (b: Board, x: number, w: number): void => {
      b.spanPos = { x, w };
      b.spanBar.setAttribute(
        'd',
        `M ${x.toFixed(2)} ${Y_SPAN - 4} V ${Y_SPAN} H ${(x + w).toFixed(2)} V ${Y_SPAN - 4}`,
      );
      b.spanLabel.setAttribute('x', (x + w / 2).toFixed(2));
    };

    const setFrame = (b: Board, x: number, w: number): void => {
      b.frameSpan = { x, w };
      b.frame.setAttribute('x', x.toFixed(2));
      b.frame.setAttribute('width', w.toFixed(2));
    };

    const init = (p: StageInit): void => {
      reset();
      if (p.axisEnd < 0 || p.maxStack < 1 || p.burst < 1 || p.burst > p.maxBurst) {
        throw new Error('rate-limiting-stage: init 의 축 · 쌓임 · b 가 어긋난다');
      }
      const col = (W - LEFT - RIGHT) / (p.axisEnd + 1);
      const pitch = Math.min(9, STACK_ROOM / Math.max(1, p.maxStack - 1));
      const cellH = Math.min(12, (BAND_BOT - BAND_TOP - 8) / p.maxBurst);
      const cellW = Math.min(16, col - 6);
      const sm = parseFloat(fontSizes.sm);

      const caption = el(
        'text',
        { x: 12, y: Y_CAPTION, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text },
        root,
      );
      caption.textContent = t('caption.ready', '{n} requests · ticks 0–{end} · b = {b}', {
        n: p.arriveTick.length,
        end: p.axisEnd,
        b: p.burst,
      });
      const sub = el(
        'text',
        { x: 12, y: Y_SUB, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
        root,
      );

      const gutter = (y: number, text: string, color: string, size: string): void => {
        const node = el('text', { x: 12, y, 'font-family': fonts.body, 'font-size': size, fill: color }, root);
        node.textContent = text;
      };
      gutter(Y_ARR - 16, t('label.arrivals', 'Arrivals'), c.text, fontSizes.sm);
      gutter((BAND_TOP + BAND_BOT) / 2 - 4, t('label.limiter', 'Limiter'), c.text, fontSizes.sm);
      gutter((BAND_TOP + BAND_BOT) / 2 + sm + 2, methodName(p.method), c.textMuted, fontSizes.xs);
      gutter(Y_SRV - 16, t('label.server', 'Server'), c.text, fontSizes.sm);
      gutter(Y_AXIS_LABEL, t('label.tick', 'tick'), c.textMuted, fontSizes.xs);

      // 줄의 바닥선 · 제한기 띠 · 서버 시간 축
      el('line', { x1: LEFT, x2: W - RIGHT, y1: Y_ARR + 7, y2: Y_ARR + 7, stroke: c.border }, root);
      el(
        'rect',
        { x: LEFT, y: BAND_TOP, width: W - LEFT - RIGHT, height: BAND_BOT - BAND_TOP, fill: c.bgSubtle, stroke: c.border, rx: 4 },
        root,
      );
      el('line', { x1: LEFT, x2: W - RIGHT, y1: Y_AXIS, y2: Y_AXIS, stroke: c.textMuted }, root);
      for (let k = 0; k <= p.axisEnd; k += 1) {
        const label = el(
          'text',
          {
            x: (LEFT + col * (k + 0.5)).toFixed(2),
            y: Y_AXIS_LABEL,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          root,
        );
        label.textContent = String(k);
      }

      // 고정 창의 칸 경계 — 창이 0 으로 돌아가는 자리
      if (p.method === 0) {
        for (let k = p.burst; k <= p.axisEnd; k += p.burst) {
          const x = LEFT + col * k;
          el(
            'line',
            {
              x1: x.toFixed(2),
              x2: x.toFixed(2),
              y1: Y_ARR - STACK_ROOM - 10,
              y2: BAND_BOT,
              stroke: c.textMuted,
              'stroke-dasharray': '2 3',
            },
            root,
          );
        }
      }

      const frame = el(
        'rect',
        {
          x: LEFT,
          y: BAND_TOP + 3,
          width: 0,
          height: BAND_BOT - BAND_TOP - 6,
          fill: 'none',
          stroke: c.primary,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 3',
          rx: 3,
          display: 'none',
        },
        root,
      );

      const gateX = LEFT + col * 0.5;
      const gate = el(
        'line',
        { x1: gateX, x2: gateX, y1: BAND_TOP, y2: BAND_BOT, stroke: c.text, 'stroke-width': 2 },
        root,
      );
      const cells: SVGRectElement[] = [];
      for (let k = 0; k < p.maxBurst; k += 1) {
        cells.push(
          el(
            'rect',
            {
              x: gateX - cellW / 2,
              y: (BAND_BOT - 4 - (k + 1) * cellH).toFixed(2),
              width: cellW,
              height: (cellH - 2).toFixed(2),
              rx: 2,
              stroke: c.textMuted,
              fill: c.bg,
            },
            root,
          ),
        );
      }

      const span = el('g', { display: 'none' }, root);
      const spanBar = el('path', { d: '', fill: 'none', stroke: c.text, 'stroke-width': 1.5 }, span);
      const spanLabel = el(
        'text',
        {
          x: 0,
          y: Y_SPAN_LABEL,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        },
        span,
      );
      spanLabel.textContent = t('label.span', 'busiest b ticks');

      const reqLayer = el('g', {}, root);
      const reqs: Req[] = p.arriveTick.map((arrive, i) => {
        // 같은 틱에 온 것끼리 번호 차례로 위로 쌓는다
        const level = p.arriveTick.slice(0, i).filter((a) => a === arrive).length;
        const x = LEFT + col * (arrive + 0.5);
        const y = Y_ARR - level * pitch;
        const ghost = el('circle', { cx: x, cy: y, r: R, fill: 'none', stroke: c.textMuted }, reqLayer);
        const cross = el('g', { display: 'none', stroke: c.danger, 'stroke-width': 1.6 }, reqLayer);
        el('line', { x1: x - 3.5, y1: y - 3.5, x2: x + 3.5, y2: y + 3.5 }, cross);
        el('line', { x1: x - 3.5, y1: y + 3.5, x2: x + 3.5, y2: y - 3.5 }, cross);
        const dot = el('circle', { cx: x, cy: y, r: R, fill: c.itemDefault, stroke: c.textMuted }, reqLayer);
        return { arrive, level, ghost, dot, cross, pos: { x, y }, state: 'waiting' };
      });

      board = {
        init: p,
        col,
        pitch,
        cellH,
        cellW,
        reqs,
        gate,
        gateX,
        cells,
        frame,
        frameSpan: null,
        span,
        spanBar,
        spanLabel,
        spanPos: null,
        caption,
        sub,
        landed: 0,
      };
      paintCells(board, p.startFill, gateX);
    };

    const tick = (p: StageTick, durationMs: number): void => {
      const b = need();
      finish();
      if (p.tick < 0 || p.tick > b.init.axisEnd) throw new Error(`rate-limiting-stage: 틱 ${p.tick} 이 축 밖이다`);
      const req = (r: number): Req => {
        const found = b.reqs[r];
        if (found === undefined) throw new Error(`rate-limiting-stage: 요청 r${r} 이 없다`);
        return found;
      };
      const tweens: Array<(u: number) => void> = [];
      const toX = X(b, p.tick);
      const fromX = b.gateX;
      const midY = (BAND_TOP + BAND_BOT) / 2;

      // 문이 지금 틱으로 옮겨 간다
      tweens.push((u) => {
        const x = lerp(fromX, toX, u).toFixed(2);
        b.gate.setAttribute('x1', x);
        b.gate.setAttribute('x2', x);
        paintCells(b, p.fill, lerp(fromX, toX, u));
        if (u >= 1) b.gateX = toX;
      });

      // 창 틀 — 창 둘만
      if (b.init.method === 0 || b.init.method === 1) {
        if (p.window === null) throw new Error('rate-limiting-stage: 창 방식인데 창이 없다');
        const x1 = LEFT + b.col * p.window.start;
        // 창이 축 끝을 넘으면 띠 안에서 자른다 (캡션은 창 그대로 말한다)
        const w1 = Math.min(b.col * (p.window.end - p.window.start + 1), W - RIGHT - x1);
        const from = b.frameSpan ?? { x: x1, w: w1 };
        b.frame.setAttribute('display', 'inline');
        tweens.push((u) => setFrame(b, lerp(from.x, x1, u), lerp(from.w, w1, u)));
      } else if (p.window !== null) {
        throw new Error('rate-limiting-stage: 창이 없는 방식에 창이 왔다');
      }

      // 지나간 요청 — 그 틱의 서버 축에 떨어져 쌓인다
      p.passed.forEach((r, j) => {
        const q = req(r);
        const start = q.pos;
        const end: Pt = { x: toX, y: Y_SRV - j * b.pitch };
        const via: Pt = { x: toX, y: midY };
        const fromBucket = q.state === 'bucket';
        q.state = 'passed';
        q.dot.setAttribute('fill', c.primary);
        q.dot.setAttribute('stroke', c.text);
        tweens.push((u) => {
          if (fromBucket) placeDot(q, { x: lerp(start.x, end.x, u), y: lerp(start.y, end.y, u) });
          else if (u < 0.5) placeDot(q, { x: lerp(start.x, via.x, u * 2), y: lerp(start.y, via.y, u * 2) });
          else placeDot(q, { x: via.x, y: lerp(via.y, end.y, (u - 0.5) * 2) });
        });
      });
      b.landed += p.passed.length;

      // 거절된 요청 — 문에서 튕겨 제 자리로 돌아가 × 가 된다
      p.rejected.forEach((r) => {
        const q = req(r);
        if (q.state !== 'waiting') throw new Error(`rate-limiting-stage: r${r} 은 이미 판정되었다`);
        const home = arrivalPt(b, q);
        const hit: Pt = { x: toX, y: BAND_TOP + 2 };
        q.state = 'rejected';
        tweens.push((u) => {
          if (u < 0.5) placeDot(q, { x: lerp(home.x, hit.x, u * 2), y: lerp(home.y, hit.y, u * 2) });
          else placeDot(q, { x: lerp(hit.x, home.x, (u - 0.5) * 2), y: lerp(hit.y, home.y, (u - 0.5) * 2) });
          if (u >= 1) {
            q.dot.setAttribute('fill', c.bg);
            q.dot.setAttribute('stroke', c.danger);
            q.cross.setAttribute('display', 'inline');
          }
        });
      });

      // 통 안 요청 — 문을 따라 옮겨 가며 머리부터 칸에 앉는다
      for (const r of p.queued) {
        const q = req(r);
        if (q.state !== 'waiting') throw new Error(`rate-limiting-stage: r${r} 은 이미 판정되었다`);
      }
      p.bucket.forEach((r, k) => {
        const q = req(r);
        if (q.state !== 'waiting' && q.state !== 'bucket') {
          throw new Error(`rate-limiting-stage: 통 안의 r${r} 이 이미 나갔다`);
        }
        q.state = 'bucket';
        q.dot.setAttribute('fill', c.itemComparing);
        q.dot.setAttribute('stroke', c.text);
        const start = q.pos;
        tweens.push((u) => {
          const end = cellPt(b, lerp(fromX, toX, u), k);
          placeDot(q, { x: lerp(start.x, end.x, u), y: lerp(start.y, end.y, u) });
        });
      });

      // 가장 붐빈 b 틱 구간
      if (b.landed > 0) {
        const x1 = LEFT + b.col * p.peakStart;
        const w1 = b.col * b.init.burst;
        const from = b.spanPos ?? { x: x1, w: w1 };
        b.span.setAttribute('display', 'inline');
        tweens.push((u) => setSpan(b, lerp(from.x, x1, u), lerp(from.w, w1, u)));
      }

      b.caption.textContent = t('caption.tick', 'Tick {tick}: arrived {arrived} · passed {passed} · rejected {rejected}', {
        tick: p.tick,
        arrived: p.arrived.length,
        passed: p.passed.length,
        rejected: p.rejected.length,
      });
      if (b.init.method === 0 || b.init.method === 1) {
        if (p.window === null) throw new Error('rate-limiting-stage: 창 방식인데 창이 없다');
        b.sub.textContent = t('caption.window', 'Window {start}–{end}: {fill} of {b} used', {
          start: p.window.start,
          end: p.window.end,
          fill: p.fill,
          b: b.init.burst,
        });
      } else if (b.init.method === 2) {
        b.sub.textContent = t('caption.token', 'Tokens: {fill} of {b}', { fill: p.fill, b: b.init.burst });
      } else {
        b.sub.textContent = t('caption.bucket', 'In the bucket: {fill} of {b}', { fill: p.fill, b: b.init.burst });
      }

      animate(tweens, durationMs);
    };

    return {
      init,
      tick,
      reset,
      destroy(): void {
        drop();
        root.remove();
        board = null;
      },
    };
  },
};
