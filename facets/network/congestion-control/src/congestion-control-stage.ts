/**
 * congestion-control stage — 왕복마다의 보냄 선 · 조이는 쪽 표지 · 이번 왕복의 두 창과 버퍼.
 *
 * 위: 보냄 선 (가로 왕복 1~20, 세로 0~16). 앞 판의 선은 옅은 자국으로 남고, 새 판의 점은
 *     왕복마다 자국 자리에서 새 값으로 오르내린다. 망 용량 선은 판 머리에서 새 자리로 옮긴다.
 * 가운데: 조이는 쪽 두 줄 (받는 창 · 망). 왕복마다 표지가 앞 판의 줄에서 새 줄로 넘어간다.
 * 아래: 이번 왕복의 혼잡 창 · 받는 창 막대와 받는 쪽 버퍼 칸. 작은 쪽 막대 앞에 표지가 서고
 *     보냄 선이 두 막대를 가로지른다. 버퍼는 전달로 차오르고 앱이 읽어 빠진다.
 *
 * stage 는 셈하지 않는다 — 창 · 보냄 · 전달 · 종류 · 조이는 쪽은 알고리즘이 실어 보낸다.
 */

import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 480;

/** 세로 축의 끝 — 받는 창의 최대(버퍼). 판마다 바꾸지 않는다 */
const AXIS_MAX = 16;
/** 가로 축의 끝 — 왕복 수 */
const AXIS_ROUNDS = 20;

const LEFT_X = 8;
const PLOT_X0 = 170;
const PLOT_X1 = 750;
const PLOT_TOP = 76;
const PLOT_BOT = 300;
const CAP1_Y = 22;
const CAP2_Y = 44;
const LANE_RECEIVER_Y = 338;
const LANE_NETWORK_Y = 362;
const ROW_CWND_Y = 398;
const ROW_RWND_Y = 422;
const ROW_BUF_Y = 446;
const ROW_H = 16;
const BAR_X0 = PLOT_X0;
const BAR_UNIT = 28;
const BAR_TEXT_X = BAR_X0 + AXIS_MAX * BAR_UNIT + 10;

const xOf = (round: number): number =>
  PLOT_X0 + ((round - 0.5) * (PLOT_X1 - PLOT_X0)) / AXIS_ROUNDS;
const yOf = (v: number): number => PLOT_BOT - (v * (PLOT_BOT - PLOT_TOP)) / AXIS_MAX;
const laneY = (limiter: Limiter): number =>
  limiter === 'receiver' ? LANE_RECEIVER_Y : LANE_NETWORK_Y;
const rowY = (limiter: Limiter): number => (limiter === 'receiver' ? ROW_RWND_Y : ROW_CWND_Y);

export type Limiter = 'receiver' | 'network';
export type StageKind = 'slow-start' | 'avoid' | 'receiver' | 'loss';

export type StageRunStart = {
  capacity: number;
  cwnd: number;
  ssthresh: number;
  window: number;
};

export type StageRound = {
  round: number;
  cwnd: number;
  ssthresh: number;
  nextSsthresh: number;
  window: number;
  send: number;
  delivered: number;
  kind: StageKind;
  limiter: Limiter;
  nextCwnd: number;
  unreadBefore: number;
  unreadFilled: number;
  read: number;
  unread: number;
};

/** projector 가 부르는 stage 표면 */
export type CongestionControlStage = {
  startRun(p: StageRunStart, ms: number): Promise<void>;
  showRound(p: StageRound, ms: number): Promise<void>;
  clear(): void;
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function checkRange(name: string, v: number): number {
  if (!Number.isFinite(v) || v < 0 || v > AXIS_MAX) {
    throw new Error(`${name} 값 ${v} 이 축(0~${AXIS_MAX}) 밖이다`);
  }
  return v;
}

export const congestionControlStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const root = params.canvas;
    const isInstant = params.isInstant ?? (() => false);

    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    /** p 0 → 1 로 draw 를 부른다. 되짚기 · 파괴 · 0 길이면 끝 상태로 건너뛴다 */
    const tween = (ms: number, draw: (p: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
          draw(1);
          resolve();
          return;
        }
        const start = performance.now();
        const finish = () => {
          waiters.delete(finish);
          draw(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number) => {
          if (!waiters.has(finish)) return;
          if (destroyed || isInstant()) return finish();
          const p = Math.min(1, (now - start) / ms);
          const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          if (p >= 1) return finish();
          draw(eased);
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        tick(start);
      });
    const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

    const text = (
      x: number,
      y: number,
      content: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
      parent: Element = root,
    ) => {
      const node = svg(
        'text',
        {
          x,
          y,
          fill: opts.fill ?? c.text,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = content;
      return node;
    };

    // ── 캡션
    const cap1 = text(LEFT_X, CAP1_Y, '', { size: fontSizes.md, weight: '600' });
    const cap2 = text(LEFT_X, CAP2_Y, '', { size: fontSizes.sm, fill: c.textMuted });

    // ── 보냄 그림: 눈금 · 축
    for (let v = 0; v <= AXIS_MAX; v += 4) {
      svg('line', {
        x1: PLOT_X0,
        x2: PLOT_X1,
        y1: yOf(v),
        y2: yOf(v),
        stroke: c.border,
        'stroke-width': v === 0 ? 1.2 : 0.6,
      }, root);
      text(PLOT_X0 - 8, yOf(v), String(v), { size: fontSizes.xs, fill: c.textMuted, anchor: 'end', mono: true });
    }
    for (const r of [1, 5, 10, 15, 20]) {
      text(xOf(r), PLOT_BOT + 16, String(r), { size: fontSizes.xs, fill: c.textMuted, anchor: 'middle', mono: true });
    }
    text(LEFT_X, PLOT_BOT + 16, t('label.roundAxis', 'Round'), { size: fontSizes.xs, fill: c.textMuted });

    // 범례 — 왼쪽 칸
    const legend = svg('g', {}, root);
    svg('line', { x1: LEFT_X, x2: LEFT_X + 22, y1: PLOT_TOP + 6, y2: PLOT_TOP + 6, stroke: c.primary, 'stroke-width': 2 }, legend);
    svg('circle', { cx: LEFT_X + 11, cy: PLOT_TOP + 6, r: 3.5, fill: c.primary }, legend);
    text(LEFT_X + 30, PLOT_TOP + 6, t('label.sent', 'Sent'), { size: fontSizes.xs }, legend);
    svg('line', {
      x1: LEFT_X,
      x2: LEFT_X + 22,
      y1: PLOT_TOP + 26,
      y2: PLOT_TOP + 26,
      stroke: c.textMuted,
      'stroke-width': 1.5,
      'stroke-dasharray': '3 3',
    }, legend);
    text(LEFT_X + 30, PLOT_TOP + 26, t('label.previous', 'Previous run'), { size: fontSizes.xs, fill: c.textMuted }, legend);

    // 망 용량 선
    const capGroup = svg('g', { visibility: 'hidden' }, root);
    svg('line', {
      x1: PLOT_X0,
      x2: PLOT_X1,
      y1: 0,
      y2: 0,
      stroke: c.danger,
      'stroke-width': 1.5,
      'stroke-dasharray': '7 4',
    }, capGroup);
    const capLabel = text(PLOT_X1, -8, '', { size: fontSizes.xs, fill: c.danger, anchor: 'end' }, capGroup);
    let capShown: number | null = null;
    const placeCap = (v: number) => capGroup.setAttribute('transform', `translate(0 ${yOf(v)})`);

    // 앞 판 자국 · 이번 판 선과 점
    const ghostLine = svg('polyline', {
      points: '',
      fill: 'none',
      stroke: c.textMuted,
      'stroke-width': 1.5,
      'stroke-dasharray': '3 3',
      opacity: 0.8,
    }, root);
    const liveLine = svg('polyline', {
      points: '',
      fill: 'none',
      stroke: c.primary,
      'stroke-width': 2,
      'stroke-linejoin': 'round',
    }, root);
    const pointLayer = svg('g', {}, root);

    // ── 조이는 쪽 두 줄
    text(LEFT_X, LANE_RECEIVER_Y, t('label.laneReceiver', 'Receive window limits'), { size: fontSizes.xs });
    text(LEFT_X, LANE_NETWORK_Y, t('label.laneNetwork', 'Network limits'), { size: fontSizes.xs });
    for (const y of [LANE_RECEIVER_Y, LANE_NETWORK_Y]) {
      svg('line', { x1: PLOT_X0, x2: PLOT_X1, y1: y, y2: y, stroke: c.border, 'stroke-width': 0.6 }, root);
    }
    const laneLayer = svg('g', {}, root);

    // ── 이번 왕복: 두 창 막대와 버퍼
    const rowLabel = (y: number, s: string) => text(LEFT_X, y, s, { size: fontSizes.xs });
    rowLabel(ROW_CWND_Y, t('label.cwnd', 'Congestion window'));
    rowLabel(ROW_RWND_Y, t('label.rwnd', 'Receive window'));
    rowLabel(ROW_BUF_Y, t('label.buffer', 'Receiver buffer'));
    for (const y of [ROW_CWND_Y, ROW_RWND_Y]) {
      svg('rect', {
        x: BAR_X0,
        y: y - ROW_H / 2,
        width: AXIS_MAX * BAR_UNIT,
        height: ROW_H,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 0.6,
      }, root);
    }
    const cwndBar = svg('rect', { x: BAR_X0, y: ROW_CWND_Y - ROW_H / 2, width: 0, height: ROW_H, fill: c.primary, opacity: 0.85 }, root);
    const rwndBar = svg('rect', { x: BAR_X0, y: ROW_RWND_Y - ROW_H / 2, width: 0, height: ROW_H, fill: c.accent, opacity: 0.85 }, root);
    const cwndVal = text(BAR_X0 + 6, ROW_CWND_Y, '', { size: fontSizes.xs, mono: true, weight: '600' });
    const rwndVal = text(BAR_X0 + 6, ROW_RWND_Y, '', { size: fontSizes.xs, mono: true, weight: '600' });
    const threshTick = svg('line', {
      x1: 0,
      x2: 0,
      y1: ROW_CWND_Y - ROW_H / 2 - 4,
      y2: ROW_CWND_Y + ROW_H / 2 + 2,
      stroke: c.text,
      'stroke-width': 2,
      visibility: 'hidden',
    }, root);
    const threshLabel = text(BAR_TEXT_X, ROW_CWND_Y, '', { size: fontSizes.xs, fill: c.textMuted });

    // 버퍼 칸 — 안 읽은 조각이 왼쪽부터 찬다
    const bufFill = svg('rect', { x: BAR_X0, y: ROW_BUF_Y - ROW_H / 2, width: 0, height: ROW_H, fill: c.itemActive }, root);
    for (let i = 0; i < AXIS_MAX; i++) {
      svg('rect', {
        x: BAR_X0 + i * BAR_UNIT,
        y: ROW_BUF_Y - ROW_H / 2,
        width: BAR_UNIT,
        height: ROW_H,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 1,
      }, root);
    }
    const bufLabel = text(BAR_X0, ROW_BUF_Y + 20, '', { size: fontSizes.xs, fill: c.textMuted });

    // 보냄 선 — 두 막대를 가로지른다
    const sendGroup = svg('g', { visibility: 'hidden' }, root);
    svg('line', {
      x1: 0,
      x2: 0,
      y1: ROW_CWND_Y - ROW_H / 2 - 8,
      y2: ROW_RWND_Y + ROW_H / 2 + 4,
      stroke: c.text,
      'stroke-width': 1.5,
      'stroke-dasharray': '4 2',
    }, sendGroup);
    const sendLabel = text(4, ROW_CWND_Y - ROW_H / 2 - 12, '', { size: fontSizes.xs, weight: '600' }, sendGroup);

    // 작은 쪽 표지 — 막대 앞의 삼각형
    const smallMark = svg('path', {
      d: `M ${BAR_X0 - 14} -6 L ${BAR_X0 - 4} 0 L ${BAR_X0 - 14} 6 Z`,
      fill: c.text,
      visibility: 'hidden',
    }, root);

    // ── 판 상태
    type Point = { g: SVGGElement; value: number; lane: SVGGElement; limiter: Limiter };
    let points: Point[] = [];
    let lastSends: number[] = [];
    let lastLimiters: Limiter[] = [];
    let cwndShown = 0;
    let rwndShown = 0;
    let sendShown: number | null = null;
    let unreadShown = 0;
    let markShown: Limiter | null = null;

    const setBars = (cw: number, rw: number) => {
      cwndBar.setAttribute('width', String(cw * BAR_UNIT));
      rwndBar.setAttribute('width', String(rw * BAR_UNIT));
      cwndVal.setAttribute('x', String(BAR_X0 + cw * BAR_UNIT + 6));
      rwndVal.setAttribute('x', String(BAR_X0 + rw * BAR_UNIT + 6));
    };
    const setBuffer = (u: number) => bufFill.setAttribute('width', String(u * BAR_UNIT));
    const setSend = (s: number) => sendGroup.setAttribute('transform', `translate(${BAR_X0 + s * BAR_UNIT} 0)`);
    const setMark = (y: number) => smallMark.setAttribute('transform', `translate(0 ${y})`);
    const setThreshold = (th: number) => {
      threshTick.setAttribute('x1', String(BAR_X0 + th * BAR_UNIT));
      threshTick.setAttribute('x2', String(BAR_X0 + th * BAR_UNIT));
      threshTick.setAttribute('visibility', 'visible');
      threshLabel.textContent = t('label.threshold', 'threshold: {th}', { th });
    };
    const redrawLive = (lastY?: number) => {
      liveLine.setAttribute(
        'points',
        points
          .map((pt, i) => {
            const y = i === points.length - 1 && lastY !== undefined ? lastY : yOf(pt.value);
            return `${xOf(i + 1)},${y}`;
          })
          .join(' '),
      );
    };

    const clear = () => {
      pointLayer.replaceChildren();
      laneLayer.replaceChildren();
      points = [];
      lastSends = [];
      lastLimiters = [];
      liveLine.setAttribute('points', '');
      ghostLine.setAttribute('points', '');
      capGroup.setAttribute('visibility', 'hidden');
      capShown = null;
      sendGroup.setAttribute('visibility', 'hidden');
      smallMark.setAttribute('visibility', 'hidden');
      threshTick.setAttribute('visibility', 'hidden');
      threshLabel.textContent = '';
      sendShown = null;
      markShown = null;
      cwndShown = 0;
      rwndShown = 0;
      unreadShown = 0;
      setBars(0, 0);
      setBuffer(0);
      cwndVal.textContent = '';
      rwndVal.textContent = '';
      bufLabel.textContent = '';
      cap1.textContent = '';
      cap2.textContent = '';
    };

    const startRun = async (p: StageRunStart, ms: number): Promise<void> => {
      checkRange('capacity', p.capacity);
      checkRange('cwnd', p.cwnd);
      checkRange('window', p.window);
      checkRange('ssthresh', p.ssthresh);
      // 앞 판을 자국으로
      ghostLine.setAttribute(
        'points',
        lastSends.map((s, i) => `${xOf(i + 1)},${yOf(s)}`).join(' '),
      );
      pointLayer.replaceChildren();
      laneLayer.replaceChildren();
      points = [];
      liveLine.setAttribute('points', '');
      sendGroup.setAttribute('visibility', 'hidden');
      smallMark.setAttribute('visibility', 'hidden');
      sendShown = null;
      markShown = null;

      cap1.textContent = t(
        'caption.head',
        'Round 0 — congestion window: {cwnd} · threshold: {th} · receive window: {rwnd}',
        { cwnd: p.cwnd, th: p.ssthresh, rwnd: p.window },
      );
      cap2.textContent = '';
      capLabel.textContent = t('label.capacityLine', 'Link capacity: {c}', { c: p.capacity });
      cwndVal.textContent = String(p.cwnd);
      rwndVal.textContent = String(p.window);
      setThreshold(p.ssthresh);
      bufLabel.textContent = t('label.bufferHead', 'unread: {u}', { u: 0 });
      capGroup.setAttribute('visibility', 'visible');

      const capFrom = capShown ?? p.capacity;
      const cw0 = cwndShown;
      const rw0 = rwndShown;
      const u0 = unreadShown;
      capShown = p.capacity;
      cwndShown = p.cwnd;
      rwndShown = p.window;
      unreadShown = 0;
      await tween(ms, (k) => {
        placeCap(lerp(capFrom, p.capacity, k));
        setBars(lerp(cw0, p.cwnd, k), lerp(rw0, p.window, k));
        setBuffer(lerp(u0, 0, k));
      });
    };

    const showRound = async (p: StageRound, ms: number): Promise<void> => {
      checkRange('cwnd', p.cwnd);
      checkRange('window', p.window);
      checkRange('send', p.send);
      checkRange('unread', p.unread);
      checkRange('unreadFilled', p.unreadFilled);
      if (p.round !== points.length + 1) {
        throw new Error(`왕복 ${p.round} 이 차례를 벗어났다 (그려진 왕복 ${points.length})`);
      }
      const idx = p.round - 1;
      const fromValue = lastSends[idx] ?? 0;
      const fromLimiter = lastLimiters[idx] ?? p.limiter;

      // 점
      const g = svg('g', {}, pointLayer);
      if (p.kind === 'loss') {
        svg('path', { d: 'M -5 -5 L 5 5 M -5 5 L 5 -5', stroke: c.danger, 'stroke-width': 2.4 }, g);
      } else {
        svg('circle', { cx: 0, cy: 0, r: 4, fill: c.primary }, g);
      }
      // 조이는 쪽 표지 — 받는 창은 네모, 망은 동그라미, 잃음은 가위표
      const lane = svg('g', {}, laneLayer);
      if (p.kind === 'loss') {
        svg('path', { d: 'M -5 -5 L 5 5 M -5 5 L 5 -5', stroke: c.danger, 'stroke-width': 2.4 }, lane);
      } else if (p.limiter === 'receiver') {
        svg('rect', { x: -5, y: -5, width: 10, height: 10, fill: c.accent, stroke: c.text, 'stroke-width': 1 }, lane);
      } else {
        svg('circle', { cx: 0, cy: 0, r: 5, fill: 'none', stroke: c.primary, 'stroke-width': 2 }, lane);
      }
      points.push({ g, value: p.send, lane, limiter: p.limiter });
      lastSends[idx] = p.send;
      lastLimiters[idx] = p.limiter;

      // 글
      cap1.textContent = t(
        'caption.round',
        'Round {n} — congestion window: {cwnd} · receive window: {rwnd} · sent: {send}',
        { n: p.round, cwnd: p.cwnd, rwnd: p.window, send: p.send },
      );
      if (p.kind === 'slow-start') {
        cap2.textContent = t('caption.slowStart', 'Slow start · next congestion window: {next}', { next: p.nextCwnd });
      } else if (p.kind === 'avoid') {
        cap2.textContent = t('caption.avoid', 'Congestion avoidance · next congestion window: {next}', { next: p.nextCwnd });
      } else if (p.kind === 'receiver') {
        cap2.textContent = t('caption.receiver', 'Receive window is smaller · congestion window stays: {next}', { next: p.nextCwnd });
      } else {
        cap2.textContent = t(
          'caption.loss',
          'Lost round · delivered: {got} · threshold: {th} · next congestion window: {next}',
          { got: p.delivered, th: p.nextSsthresh, next: p.nextCwnd },
        );
      }
      cwndVal.textContent = String(p.cwnd);
      rwndVal.textContent = String(p.window);
      sendLabel.textContent = t('label.sendLine', 'sent: {n}', { n: p.send });
      setThreshold(p.ssthresh);
      bufLabel.textContent = t('label.bufferState', 'unread: {u} · app read: {r}', { u: p.unread, r: p.read });
      sendGroup.setAttribute('visibility', 'visible');
      smallMark.setAttribute('visibility', 'visible');

      const cw0 = cwndShown;
      const rw0 = rwndShown;
      const s0 = sendShown ?? 0;
      const m0 = markShown === null ? rowY(p.limiter) : rowY(markShown);
      const u0 = p.unreadBefore;
      cwndShown = p.cwnd;
      rwndShown = p.window;
      sendShown = p.send;
      markShown = p.limiter;
      unreadShown = p.unread;
      const x = xOf(p.round);
      const yFrom = yOf(fromValue);
      const yTo = yOf(p.send);
      const lFrom = laneY(fromLimiter);
      const lTo = laneY(p.limiter);
      await tween(ms, (k) => {
        const y = lerp(yFrom, yTo, k);
        g.setAttribute('transform', `translate(${x} ${y})`);
        redrawLive(y);
        lane.setAttribute('transform', `translate(${x} ${lerp(lFrom, lTo, k)})`);
        setBars(lerp(cw0, p.cwnd, k), lerp(rw0, p.window, k));
        setSend(lerp(s0, p.send, k));
        setMark(lerp(m0, rowY(p.limiter), k));
        // 버퍼: 앞 절반에 전달로 차오르고, 뒤 절반에 앱이 읽어 빠진다
        const u = k < 0.5 ? lerp(u0, p.unreadFilled, k * 2) : lerp(p.unreadFilled, p.unread, (k - 0.5) * 2);
        setBuffer(u);
      });
    };

    clear();

    const api: CongestionControlStage & { destroy(): void } = {
      startRun,
      showRound,
      clear,
      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
      },
    };
    return api as unknown as ViewInstance;
  },
};
