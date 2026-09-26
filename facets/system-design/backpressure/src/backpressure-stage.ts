/**
 * 배압 무대 — 보내는 쪽 · 문 · 받는 쪽, 그리고 잃음이 쌓이는 네 무더기.
 *
 * 왼쪽에 보내는 쪽(요청 점이 태어나는 자리와 곁의 줄), 가운데에 받는 쪽의 문, 오른쪽 상자에 든 요청마다
 * 진행 막대(일의 조각 수만큼 칸)가 있다. 무더기는 잃음이 **어디에** 쌓이는지를 자리로 말한다 —
 * 보내는 쪽 곁(보내는 쪽 버림) · 문 앞(503) · 받는 쪽 뒤(제때 · 헛일).
 *
 * 운동: 일 걸음에서 막대가 몫만큼 차오르고, 끝난 막대는 뒤쪽 무더기로 날아가 작은 칸이 되며 남은 막대는
 * 앞을 메워 자리를 옮긴다. 도착 걸음에서 요청 점이 문으로 가 막대가 되거나, 문에서 503 으로 튕겨 무더기로
 * 떨어지거나, 보내는 쪽 줄에 서고 줄 머리에서 떨어져 나간다.
 *
 * 무대는 셈하지 않는다 — 몫 · 끝남 · 제때 여부 · 기한 넘김 · 줄의 차례는 payload 로 받고, 제 요소 목록과
 * 어긋나면 던진다. 자리 범위(가장 큰 든 수 · 가장 긴 줄)도 init 이 싣는다.
 */
import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type StageInit = {
  overflow: number;
  rate: number;
  ticks: number;
  workUnits: number;
  capacity: number;
  deadline: number;
  limit: number;
  rejectCode: string;
  peakHeld: number;
  peakQueue: number;
  motionMs: number;
};

export type StageWork = {
  tick: number;
  heldBefore: number;
  share: number;
  extra: number;
  jobs: { id: number; born: number; done: number; gain: number; overdue: boolean }[];
  finished: { id: number; born: number; onTime: boolean }[];
  onTime: number;
  late: number;
  made: number;
  onTimePct: number;
};

export type StageArrive = {
  tick: number;
  created: { id: number; born: number }[];
  admitted: { id: number; born: number; overdue: boolean }[];
  rejected: number[];
  dropped: number[];
  queue: number[];
  held: number;
  rejectedTotal: number;
  droppedTotal: number;
  made: number;
  onTimePct: number;
};

/** projector 가 부르는 무대의 표면. */
export type BackpressureStage = ViewInstance & {
  init(p: StageInit): void;
  work(p: StageWork, speed: number): void;
  arrive(p: StageArrive, speed: number): void;
  reset(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
const W = 860;
const H = 440;

// 자리 — 보내는 쪽
const EMIT_X = 34;
const LANE_Y = 214;
const QUEUE_HEAD_X = 240;
const QUEUE_TAIL_X = 66;
const DOT_R = 5;
// 문
const DOOR_X = 266;
// 받는 쪽
const BOX_X = 284;
const BOX_Y = 70;
const BOX_W = 440;
const BOX_H = 356;
const GRID_X = BOX_X + 14;
const GRID_TOP = BOX_Y + 38;
const GRID_BOTTOM = BOX_Y + BOX_H - 12;
const GRID_COLS = 4;
const COL_PITCH = 106;
const BAR_W = 94;
// 무더기
const MARK = 7;
const MARK_PITCH = 9;
const PILE_PER_ROW = 10;
const DROP_PILE = { x: 20, y: 322 };
const REJECT_PILE = { x: 150, y: 322 };
const ON_TIME_PILE = { x: 740, y: 104 };
const LATE_PILE = { x: 740, y: 264 };

type Bar = { g: SVGGElement; fill: SVGRectElement; x: number; y: number; done: number; overdue: boolean };
type Dot = { c: SVGCircleElement; x: number; y: number };
type Anim = { start: number; dur: number; frame: (p: number) => void; end?: () => void; begun: boolean };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

export const backpressureStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);

    const text = (x: number, y: number, s: string, opts: { size?: string; fill?: string; anchor?: string; weight?: string } = {}) => {
      const node = el('text', {
        x, y, 'font-family': fonts.body, 'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? c.text, 'text-anchor': opts.anchor ?? 'start',
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = s;
      return node;
    };

    // ── 고정 틀 (마운트 때 한 번)
    const frame = el('g', {});
    const dyn = el('g', {});
    svg.appendChild(frame);
    svg.appendChild(dyn);

    frame.appendChild(el('rect', { x: BOX_X, y: BOX_Y, width: BOX_W, height: BOX_H, rx: 8, fill: c.bgSubtle, stroke: c.border }));
    frame.appendChild(el('rect', { x: DOOR_X - 3, y: BOX_Y, width: 6, height: BOX_H, rx: 2, fill: c.textMuted }));
    frame.appendChild(el('line', { x1: QUEUE_TAIL_X - 10, y1: LANE_Y + 12, x2: QUEUE_HEAD_X + 10, y2: LANE_Y + 12, stroke: c.border }));
    frame.appendChild(el('rect', { x: EMIT_X - 12, y: LANE_Y - 12, width: 24, height: 24, rx: 4, fill: c.bg, stroke: c.textMuted }));
    frame.appendChild(text(20, BOX_Y + 20, t('label.sender', 'Sender'), { weight: '600' }));
    const receiverLabel = text(BOX_X + 14, BOX_Y + 22, '', { weight: '600' });
    const limitLabel = text(DOOR_X, BOX_Y - 8, '', { anchor: 'middle', fill: c.textMuted, size: fontSizes.xs });
    frame.appendChild(receiverLabel);
    frame.appendChild(limitLabel);
    frame.appendChild(text(DROP_PILE.x, DROP_PILE.y - 10, t('label.senderDropped', 'Dropped by sender'), { size: fontSizes.xs, fill: c.textMuted }));
    const rejectLabel = text(REJECT_PILE.x, REJECT_PILE.y - 10, '', { size: fontSizes.xs, fill: c.textMuted });
    frame.appendChild(rejectLabel);
    frame.appendChild(text(ON_TIME_PILE.x, ON_TIME_PILE.y - 10, t('label.onTime', 'On time'), { size: fontSizes.xs, fill: c.textMuted }));
    frame.appendChild(text(LATE_PILE.x, LATE_PILE.y - 10, t('label.late', 'Wasted (late)'), { size: fontSizes.xs, fill: c.textMuted }));
    const caption = text(20, 22, '', { size: fontSizes.md, weight: '600' });
    const status = text(20, 44, '', { fill: c.textMuted });
    frame.appendChild(caption);
    frame.appendChild(status);

    // ── 판마다 바뀌는 것
    let init: StageInit | null = null;
    let rowPitch = 24;
    let barH = 12;
    let queuePitch = 16;
    const bars = new Map<number, Bar>();
    let order: number[] = [];
    const dots = new Map<number, Dot>();
    let queueOrder: number[] = [];
    const piles = { onTime: 0, late: 0, rejected: 0, dropped: 0 };

    // ── 운동 — rAF 하나가 모든 tween 을 돈다. 되짚기 · 새 걸음이 오면 끝 상태로 건너뛴다
    let anims: Anim[] = [];
    let raf = 0;
    const tickFrame = (now: number): void => {
      raf = 0;
      const live: Anim[] = [];
      for (const a of anims) {
        const p = (now - a.start) / a.dur;
        if (p < 0) { live.push(a); continue; }
        a.begun = true;
        if (p >= 1) { a.frame(1); a.end?.(); } else { a.frame(ease(p)); live.push(a); }
      }
      anims = live;
      if (anims.length > 0) raf = requestAnimationFrame(tickFrame);
    };
    const finishAll = (): void => {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      const pending = anims;
      anims = [];
      for (const a of pending) { a.frame(1); a.end?.(); }
    };
    const dropAll = (): void => {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      anims = [];
    };
    const animate = (dur: number, delay: number, frameFn: (p: number) => void, end?: () => void): void => {
      if (isInstant() || dur <= 0) { frameFn(1); end?.(); return; }
      anims.push({ start: performance.now() + delay, dur, frame: frameFn, end, begun: false });
      if (raf === 0) raf = requestAnimationFrame(tickFrame);
    };
    params.onScrubStart?.(() => finishAll());

    const need = (): StageInit => {
      if (init === null) throw new Error('backpressure-stage: init 전에 걸음이 왔다');
      return init;
    };
    const unitPx = (): number => BAR_W / need().workUnits;
    const slotXY = (i: number): { x: number; y: number } => ({
      x: GRID_X + (i % GRID_COLS) * COL_PITCH,
      y: GRID_TOP + Math.floor(i / GRID_COLS) * rowPitch,
    });
    const queueX = (i: number): number => QUEUE_HEAD_X - i * queuePitch;
    const pileXY = (base: { x: number; y: number }, i: number): { x: number; y: number } => ({
      x: base.x + (i % PILE_PER_ROW) * MARK_PITCH,
      y: base.y + Math.floor(i / PILE_PER_ROW) * MARK_PITCH,
    });
    const addMark = (base: { x: number; y: number }, i: number, fill: string, stroke: string): void => {
      const { x, y } = pileXY(base, i);
      dyn.appendChild(el('rect', { x, y, width: MARK, height: MARK, rx: 1.5, fill, stroke }));
    };
    const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
    const place = (bar: Bar, x: number, y: number, sx = 1): void => {
      bar.g.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${sx.toFixed(3)},1)`);
    };
    const barFill = (overdue: boolean): string => (overdue ? c.danger : c.primary);

    const makeBar = (id: number, x: number, y: number, overdue: boolean): Bar => {
      const g = el('g', {});
      g.appendChild(el('rect', { x: 0, y: 0, width: BAR_W, height: barH, rx: 2, fill: c.bg, stroke: c.border }));
      const fill = el('rect', { x: 0, y: 0, width: 0, height: barH, rx: 2, fill: barFill(overdue) });
      g.appendChild(fill);
      dyn.appendChild(g);
      const bar: Bar = { g, fill, x, y, done: 0, overdue };
      place(bar, x, y);
      bars.set(id, bar);
      return bar;
    };
    const makeDot = (x: number, y: number): Dot => {
      const circle = el('circle', { cx: x, cy: y, r: DOT_R, fill: c.primary });
      dyn.appendChild(circle);
      return { c: circle, x, y };
    };
    const moveDot = (d: Dot, x: number, y: number, p: number, fromX: number, fromY: number): void => {
      d.x = lerp(fromX, x, p);
      d.y = lerp(fromY, y, p);
      d.c.setAttribute('cx', d.x.toFixed(2));
      d.c.setAttribute('cy', d.y.toFixed(2));
    };

    const clearDynamic = (): void => {
      dropAll();
      while (dyn.firstChild) dyn.removeChild(dyn.firstChild);
      bars.clear();
      dots.clear();
      order = [];
      queueOrder = [];
      piles.onTime = 0;
      piles.late = 0;
      piles.rejected = 0;
      piles.dropped = 0;
    };

    const modeLabel = (overflow: number): string => {
      switch (overflow) {
        case 0: return t('label.overflow.accept', 'Accept all');
        case 1: return t('label.overflow.reject', 'Reject');
        case 2: return t('label.overflow.backpressure', 'Backpressure');
        default: throw new Error(`backpressure-stage: 모르는 넘칠 때 방식 ${overflow}`);
      }
    };
    const setStatus = (held: number, pct: number, made: number): void => {
      status.textContent = t('status.line', 'Held {held} · sender line {queue} · on time {pct}% of {made} made', {
        held, queue: queueOrder.length, pct, made,
      });
    };

    const instance: BackpressureStage = {
      init(p: StageInit): void {
        clearDynamic();
        if (p.peakHeld <= 0 || p.workUnits <= 0) throw new Error('backpressure-stage: init 의 peakHeld · workUnits 가 0 이다');
        init = p;
        const rows = Math.ceil(p.peakHeld / GRID_COLS);
        rowPitch = Math.min(26, (GRID_BOTTOM - GRID_TOP) / rows);
        barH = Math.max(4, Math.min(12, rowPitch - 8));
        queuePitch = p.peakQueue > 1 ? Math.min(16, (QUEUE_HEAD_X - QUEUE_TAIL_X) / (p.peakQueue - 1)) : 16;
        receiverLabel.textContent = t('label.receiver', 'Receiver · {capacity} units per tick', { capacity: p.capacity });
        limitLabel.textContent = p.overflow === 0 ? '' : t('label.limit', 'Limit {limit}', { limit: p.limit });
        rejectLabel.textContent = t('label.rejectPile', 'At the door: {code}', { code: p.rejectCode });
        caption.textContent = t('caption.ready', '{mode} · the sender makes {rate} per tick', { mode: modeLabel(p.overflow), rate: p.rate });
        status.textContent = '';
      },

      work(p: StageWork, speed: number): void {
        const cfg = need();
        finishAll();
        if (p.heldBefore !== order.length) {
          throw new Error(`backpressure-stage: 든 수 ${p.heldBefore} 와 막대 ${order.length} 가 어긋난다`);
        }
        const dur = cfg.motionMs / speed;
        const half = dur / 2;
        const px = unitPx();
        const leaving = new Set(p.finished.map((f) => f.id));
        const staying = order.filter((id) => !leaving.has(id));
        if (staying.length !== p.jobs.length || staying.some((id, i) => p.jobs[i]?.id !== id)) {
          throw new Error('backpressure-stage: 남은 일의 차례가 막대 차례와 어긋난다');
        }
        // 끝난 막대 — 끝까지 차오른 뒤 뒤쪽 무더기로 날아가 작은 칸이 된다
        for (const f of p.finished) {
          const bar = bars.get(f.id);
          if (bar === undefined) throw new Error(`backpressure-stage: 끝난 요청 ${f.id} 의 막대가 없다`);
          const from = bar.done * px;
          animate(half, 0, (q) => bar.fill.setAttribute('width', lerp(from, BAR_W, q).toFixed(2)));
          const base = f.onTime ? ON_TIME_PILE : LATE_PILE;
          const idx = f.onTime ? piles.onTime++ : piles.late++;
          const to = pileXY(base, idx);
          const fx = bar.x;
          const fy = bar.y;
          bars.delete(f.id);
          animate(half, half, (q) => place(bar, lerp(fx, to.x, q), lerp(fy, to.y, q), lerp(1, MARK / BAR_W, q)), () => {
            bar.g.remove();
            addMark(base, idx, f.onTime ? c.primary : c.danger, f.onTime ? c.primary : c.danger);
          });
        }
        if (piles.onTime !== p.onTime || piles.late !== p.late) {
          throw new Error(`backpressure-stage: 무더기(제때 ${piles.onTime} · 헛일 ${piles.late}) 와 누계(${p.onTime} · ${p.late}) 가 어긋난다`);
        }
        // 남은 막대 — 몫만큼 차오르고, 기한을 넘기면 헛일 빛으로 바뀌며, 앞을 메워 자리를 옮긴다
        p.jobs.forEach((job, i) => {
          const bar = bars.get(job.id);
          if (bar === undefined) throw new Error(`backpressure-stage: 요청 ${job.id} 의 막대가 없다`);
          if (job.done - job.gain !== bar.done) throw new Error(`backpressure-stage: 요청 ${job.id} 의 누적이 어긋난다`);
          const from = bar.done * px;
          const toW = job.done * px;
          bar.done = job.done;
          animate(half, 0, (q) => bar.fill.setAttribute('width', lerp(from, toW, q).toFixed(2)), () => {
            bar.overdue = job.overdue;
            bar.fill.setAttribute('fill', barFill(job.overdue));
          });
          const to = slotXY(i);
          const fx = bar.x;
          const fy = bar.y;
          bar.x = to.x;
          bar.y = to.y;
          if (fx !== to.x || fy !== to.y) animate(half, half, (q) => place(bar, lerp(fx, to.x, q), lerp(fy, to.y, q)));
        });
        order = p.jobs.map((j) => j.id);

        const finishedN = p.finished.length;
        const vars = { tick: p.tick, held: p.heldBefore, share: p.share, extra: p.extra, finished: finishedN };
        if (p.heldBefore === 0) caption.textContent = t('caption.workIdle', 'Tick {tick} · work: nothing held', vars);
        else if (p.extra > 0) {
          caption.textContent = t('caption.workExtra', 'Tick {tick} · work: split among {held} · {share} units each (+1 for the first {extra}) · finished {finished}', vars);
        } else caption.textContent = t('caption.work', 'Tick {tick} · work: split among {held} · {share} units each · finished {finished}', vars);
        setStatus(order.length, p.onTimePct, p.made);
      },

      arrive(p: StageArrive, speed: number): void {
        const cfg = need();
        finishAll();
        const dur = cfg.motionMs / speed;
        const half = dur / 2;
        const createdIds = new Set(p.created.map((r) => r.id));
        const takeDot = (id: number): Dot => {
          const queued = dots.get(id);
          if (queued !== undefined) { dots.delete(id); return queued; }
          if (!createdIds.has(id)) throw new Error(`backpressure-stage: 요청 ${id} 가 줄에도 새로 만든 것에도 없다`);
          return makeDot(EMIT_X, LANE_Y);
        };

        // 문 앞에서 503 — 문까지 갔다가 튕겨 문 앞 무더기로 떨어진다
        for (const id of p.rejected) {
          const d = takeDot(id);
          const idx = piles.rejected++;
          const to = pileXY(REJECT_PILE, idx);
          const sx = d.x;
          const sy = d.y;
          animate(half, 0, (q) => moveDot(d, DOOR_X - DOT_R - 2, LANE_Y, q, sx, sy));
          animate(half, half, (q) => moveDot(d, to.x + MARK / 2, to.y + MARK / 2, q, DOOR_X - DOT_R - 2, LANE_Y), () => {
            d.c.remove();
            addMark(REJECT_PILE, idx, c.itemComparing, c.itemComparing);
          });
        }
        // 보내는 쪽 곁에서 버림 — 줄 머리에서 떨어져 나간다
        for (const id of p.dropped) {
          const d = takeDot(id);
          const idx = piles.dropped++;
          const to = pileXY(DROP_PILE, idx);
          const sx = d.x;
          const sy = d.y;
          animate(dur, 0, (q) => moveDot(d, to.x + MARK / 2, to.y + MARK / 2, q, sx, sy), () => {
            d.c.remove();
            addMark(DROP_PILE, idx, c.bg, c.textMuted);
          });
        }
        if (piles.rejected !== p.rejectedTotal || piles.dropped !== p.droppedTotal) {
          throw new Error(`backpressure-stage: 무더기(${piles.rejected} · ${piles.dropped}) 와 누계(${p.rejectedTotal} · ${p.droppedTotal}) 가 어긋난다`);
        }
        // 받는 쪽에 듦 — 점이 문에 닿으면 막대가 되어 제 자리로 미끄러진다
        for (const a of p.admitted) {
          const d = takeDot(a.id);
          const slot = slotXY(order.length);
          order.push(a.id);
          const bar = makeBar(a.id, slot.x, slot.y, a.overdue);
          const sx = d.x;
          const sy = d.y;
          bar.g.setAttribute('visibility', 'hidden');
          animate(half, 0, (q) => moveDot(d, DOOR_X, LANE_Y, q, sx, sy), () => d.c.remove());
          animate(half, half, (q) => {
            bar.g.setAttribute('visibility', 'visible');
            place(bar, lerp(DOOR_X, slot.x, q), lerp(LANE_Y - barH / 2, slot.y, q));
          });
        }
        if (order.length !== p.held) throw new Error(`backpressure-stage: 든 수 ${p.held} 와 막대 ${order.length} 가 어긋난다`);
        if (cfg.overflow !== 0 && p.held > cfg.limit) throw new Error(`backpressure-stage: 든 수 ${p.held} 가 한도 ${cfg.limit} 를 넘었다`);
        // 보내는 쪽 줄 — 새로 선 점은 꼬리로, 남은 점은 머리 쪽으로 당겨진다
        const nextQueue: number[] = [];
        p.queue.forEach((id, i) => {
          const d = takeDot(id);
          dots.set(id, d);
          nextQueue.push(id);
          const sx = d.x;
          const sy = d.y;
          const tx = queueX(i);
          if (sx !== tx || sy !== LANE_Y) animate(dur, 0, (q) => moveDot(d, tx, LANE_Y, q, sx, sy));
        });
        if (dots.size !== nextQueue.length) throw new Error('backpressure-stage: 줄에 남은 점이 payload 의 줄과 어긋난다');
        queueOrder = nextQueue;

        const count = p.created.length;
        const taken = p.admitted.length;
        switch (cfg.overflow) {
          case 0:
            caption.textContent = t('caption.arriveAccept', 'Tick {tick} · {count} arrive: all taken in', { tick: p.tick, count });
            break;
          case 1:
            caption.textContent = t('caption.arriveReject', 'Tick {tick} · {count} arrive: taken {taken} · {code}: {rejected}', {
              tick: p.tick, count, taken, code: cfg.rejectCode, rejected: p.rejected.length,
            });
            break;
          case 2:
            caption.textContent = t('caption.arriveBack', 'Tick {tick} · {count} arrive: sent {taken} · waiting {queue} · dropped by sender {dropped}', {
              tick: p.tick, count, taken, queue: p.queue.length, dropped: p.dropped.length,
            });
            break;
          default:
            throw new Error(`backpressure-stage: 모르는 넘칠 때 방식 ${cfg.overflow}`);
        }
        setStatus(p.held, p.onTimePct, p.made);
      },

      reset(): void {
        clearDynamic();
        init = null;
        caption.textContent = '';
        status.textContent = '';
      },

      destroy(): void {
        dropAll();
        frame.remove();
        dyn.remove();
      },
    };
    return instance;
  },
};
