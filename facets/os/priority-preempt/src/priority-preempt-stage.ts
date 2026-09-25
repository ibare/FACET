/**
 * priority-preempt 무대 — CPU 자리의 주인이 바뀌는 순간과 밀려난 것의 남은 양.
 *
 * 왼쪽에 아직 오지 않은 것, 가운데 CPU 자리와 그 아래 줄, 오른쪽에 끝난 것.
 * 도착한 것이 CPU 자리로 들어오며 돌던 것을 밀어내 줄로 내려보낸다. 밀어내지 못한 것은
 * 자리 앞에서 멈췄다가 줄로 내려앉는다. 카드의 칸은 남은 양이다 — 돈 만큼 비어 간다.
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
import {
  priorityPreemptSpot,
  type PriorityPreemptScene,
  type PriorityPreemptSpot,
} from './scene.js';

const H = 272;
const SVG = 'http://www.w3.org/2000/svg';
const MARGIN = 16;
const COL_GAP = 24;
const SLOT_GAP = 12;
const CARD_W_MAX = 150;
const CARD_H = 56;
const STACK_GAP = 8;
const TOP = 34;
const SEAT_PAD = 10;
const SEAT_Y = 30;
const SEAT_HEAD = 22;
const QUEUE_LABEL_Y = 144;
const QUEUE_Y = 152;
const CAPTION_Y = 240;
const CAPTION_GAP = 19;
const MOVE_MS = 1100;
const FRAME_MS = 16;
/** 한 운동 시계 위의 구간 — 남은 양이 먼저 줄고, 자리가 뒤에 바뀐다 */
const DRAIN_END = 0.3;
const MOVE_START = 0.28;
const PUSH_START = 0.55;

interface Geometry {
  cw: number;
  futureX: number;
  centerX: number;
  doneX: number;
  seatX: number;
  seatCardY: number;
}

interface Pt {
  x: number;
  y: number;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(v: number): number {
  const u = clamp01(v);
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function lerp(a: Pt, b: Pt, u: number): Pt {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/** 여러 다리를 가진 길 — 다리마다 같은 몫의 시간을 쓴다 */
function along(path: Pt[], u: number): Pt {
  const first = path[0] as Pt;
  if (path.length < 2) return first;
  const legs = path.length - 1;
  const k = Math.min(legs - 1, Math.floor(clamp01(u) * legs));
  const local = clamp01(u) * legs - k;
  return lerp(path[k] as Pt, path[k + 1] as Pt, ease(local));
}

function geometry(n: number): Geometry {
  const qSlots = Math.max(1, n - 1);
  const room = PIECE_CANVAS_W - 2 * MARGIN - 2 * COL_GAP - (qSlots - 1) * SLOT_GAP;
  const cw = Math.min(CARD_W_MAX, Math.floor(room / (qSlots + 2)));
  const futureX = MARGIN;
  const doneX = PIECE_CANVAS_W - MARGIN - cw;
  const centerX = futureX + cw + COL_GAP;
  const centerW = doneX - COL_GAP - centerX;
  const seatX = centerX + (centerW - cw) / 2;
  return { cw, futureX, centerX, doneX, seatX, seatCardY: SEAT_Y + SEAT_HEAD };
}

function spotPoint(g: Geometry, s: PriorityPreemptSpot): Pt {
  switch (s.place) {
    case 'future':
      return { x: g.futureX, y: TOP + s.slot * (CARD_H + STACK_GAP) };
    case 'done':
      return { x: g.doneX, y: TOP + s.slot * (CARD_H + STACK_GAP) };
    case 'cpu':
      return { x: g.seatX, y: g.seatCardY };
    case 'queue':
      return { x: g.centerX + s.slot * (g.cw + SLOT_GAP), y: QUEUE_Y };
  }
}

function sameSpot(a: PriorityPreemptSpot, b: PriorityPreemptSpot): boolean {
  return a.place === b.place && a.slot === b.slot;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function writeText(
  parent: Element,
  x: number,
  y: number,
  body: string,
  opts: { size: string; fill: string; anchor?: string; weight?: number; family?: string },
): void {
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': opts.family ?? fonts.body,
    'font-size': opts.size,
    fill: opts.fill,
    'text-anchor': opts.anchor ?? 'start',
  });
  if (opts.weight !== undefined) node.setAttribute('font-weight', String(opts.weight));
  node.textContent = body;
}

export const priorityPreemptStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const canvas = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    /** 표시 이름이 있는 식별자는 리터럴 키로 부른다. 없으면 대문자 기호로 보인다 */
    function nameOf(id: string): string {
      switch (id) {
        case 'build':
          return t('label.build', 'Build');
        case 'audio':
          return t('label.audio', 'Audio playback');
        case 'mail':
          return t('label.mail', 'Mail check');
        default:
          return id.toUpperCase();
      }
    }

    function captionLines(s: PriorityPreemptScene): string[] {
      const step = s.step;
      if (step === null) return [t('caption.start', 'Nothing has arrived yet. The CPU is empty.')];
      const prio = (id: string): number => {
        const p = s.procs.find((q) => q.id === id);
        if (p === undefined) throw new Error(`priority-preempt 무대: 모르는 식별자 ${id}`);
        return p.prio;
      };
      const leftOf = (id: string): number => {
        const v = s.left[id];
        if (v === undefined) throw new Error(`priority-preempt 무대: 남은 양이 없다 ${id}`);
        return v;
      };
      const lines: string[] = [];
      if (step.finish !== null) {
        lines.push(t('caption.finish', 'Finished: {name}', { name: nameOf(step.finish) }));
      }
      for (const id of step.arrive) {
        if (step.preempt !== null && step.preempt.by === id) {
          const e = step.preempt;
          lines.push(
            t('caption.preempt', 'Arrived: {by}. Priority {p} > {q}, so {out} is pushed off the CPU.', {
              by: nameOf(e.by),
              p: prio(e.by),
              q: prio(e.out),
              out: nameOf(e.out),
            }),
          );
          lines.push(
            t('caption.pushedLeft', '{out} goes back to the queue holding the rest. Left: {left}', {
              out: nameOf(e.out),
              left: e.left,
            }),
          );
        } else if (step.held.includes(id) && step.owner !== null) {
          lines.push(
            t('caption.held', 'Arrived: {name}. Priority {p} ≤ {q}, so it cannot push and waits in the queue.', {
              name: nameOf(id),
              p: prio(id),
              q: prio(step.owner),
            }),
          );
        } else if (step.pick === id) {
          lines.push(t('caption.arriveEmpty', 'Arrived: {name}. The CPU is free, so it runs at once.', { name: nameOf(id) }));
        }
      }
      if (step.pick !== null && !step.arrive.includes(step.pick)) {
        if (step.resumed) {
          lines.push(
            t('caption.resume', 'Back on the CPU: {name}. It runs only the rest. Left: {left}', {
              name: nameOf(step.pick),
              left: leftOf(step.pick),
            }),
          );
        } else {
          lines.push(
            t('caption.pickTop', 'On the CPU: {name}, the highest in the queue. Priority: {p}', {
              name: nameOf(step.pick),
              p: prio(step.pick),
            }),
          );
        }
      }
      if (step.end) {
        lines.push(t('caption.end', 'All finished. Push-offs: {n}', { n: s.pushes }));
      }
      return lines;
    }

    /** u === null 이면 끝 자리 (정본). 아니면 운동 시계 0..1 위의 한 순간 */
    function draw(s: PriorityPreemptScene, u: number | null): void {
      canvas.textContent = '';
      const g = geometry(s.procs.length);
      const hues = categorical(s.procs.length);
      const smPx = fontSizes.sm;

      // 칸 머리
      writeText(canvas, g.futureX, 20, t('label.future', 'Not yet arrived'), {
        size: smPx,
        fill: c.textMuted,
      });
      writeText(canvas, g.doneX, 20, t('label.done', 'Done'), { size: smPx, fill: c.textMuted });
      if (s.tick !== null) {
        writeText(canvas, g.seatX + g.cw / 2, 20, t('label.tick', 'Tick: {tick}', { tick: s.tick }), {
          size: fontSizes.md,
          fill: c.text,
          anchor: 'middle',
          weight: 600,
          family: fonts.mono,
        });
      }

      // CPU 자리
      el(canvas, 'rect', {
        x: g.seatX - SEAT_PAD,
        y: SEAT_Y,
        width: g.cw + 2 * SEAT_PAD,
        height: SEAT_HEAD + CARD_H + 8,
        rx: 8,
        fill: c.bgSubtle,
        stroke: c.text,
        'stroke-width': 1.5,
      });
      writeText(canvas, g.seatX - SEAT_PAD + 8, SEAT_Y + 15, t('label.cpu', 'CPU'), {
        size: smPx,
        fill: c.text,
        weight: 700,
      });

      // 줄의 빈 자리
      writeText(canvas, g.centerX, QUEUE_LABEL_Y, t('label.queue', 'Queue'), { size: smPx, fill: c.textMuted });
      const slots = Math.max(1, s.procs.length - 1);
      for (let i = 0; i < slots; i += 1) {
        el(canvas, 'rect', {
          x: g.centerX + i * (g.cw + SLOT_GAP),
          y: QUEUE_Y,
          width: g.cw,
          height: CARD_H,
          rx: 6,
          fill: 'none',
          stroke: c.border,
          'stroke-dasharray': '4 4',
        });
      }

      const step = s.step;
      const drainU = u === null ? 1 : clamp01(u / DRAIN_END);

      // 움직이는 것을 나중에 그려 위에 오게 한다
      const order = s.procs.map((p, i) => ({ p, i }));
      const moving = (id: string): boolean =>
        step !== null && u !== null && !sameSpot(step.from[id] as PriorityPreemptSpot, priorityPreemptSpot(s, id));
      order.sort((a, b) => Number(moving(a.p.id)) - Number(moving(b.p.id)));

      for (const { p, i } of order) {
        const to = priorityPreemptSpot(s, p.id);
        const end = spotPoint(g, to);
        let at = end;
        if (step !== null && u !== null) {
          const fromSpot = step.from[p.id] as PriorityPreemptSpot;
          if (!sameSpot(fromSpot, to)) {
            const start = spotPoint(g, fromSpot);
            const seat = spotPoint(g, { place: 'cpu', slot: 0 });
            let path: Pt[] = [start, end];
            let window: [number, number] = [MOVE_START, 1];
            if (step.preempt !== null && step.preempt.out === p.id) {
              // 밀려난다 — 자리에서 비켜 밀린 뒤 줄로 내려앉는다
              path = [start, { x: seat.x + g.cw * 0.3, y: seat.y + CARD_H * 0.7 }, end];
              window = [PUSH_START, 1];
            } else if (step.held.includes(p.id) && step.owner !== null) {
              // 밀어내지 못한다 — 자리 앞에서 멈췄다가 줄로
              path = [start, { x: seat.x - g.cw * 0.45, y: seat.y }, end];
            }
            at = along(path, (u - window[0]) / (window[1] - window[0]));
          }
        }
        const was = step === null ? (s.left[p.id] as number) : (step.wasLeft[p.id] as number);
        const now = s.left[p.id] as number;
        const shown = was + (now - was) * drainU;
        drawCard(p, i, to, at, shown, s, g, hues[i] as string);
      }

      const lines = captionLines(s);
      lines.forEach((line, k) => {
        writeText(canvas, MARGIN, CAPTION_Y + k * CAPTION_GAP, line, { size: fontSizes.md, fill: c.text });
      });
    }

    function drawCard(
      p: { id: string; arrive: number; length: number; prio: number },
      _index: number,
      spot: PriorityPreemptSpot,
      at: Pt,
      shown: number,
      s: PriorityPreemptScene,
      g: Geometry,
      hue: string,
    ): void {
      const card = el(canvas, 'g', { transform: `translate(${round(at.x)} ${round(at.y)})` });
      const pushed = s.pushed.includes(p.id);
      const inCpu = spot.place === 'cpu';
      const isDone = spot.place === 'done';
      el(card, 'rect', {
        x: 0,
        y: 0,
        width: g.cw,
        height: CARD_H,
        rx: 6,
        fill: isDone ? c.bgSubtle : c.bg,
        stroke: pushed ? c.itemSwapping : inCpu ? c.text : c.border,
        'stroke-width': pushed || inCpu ? 2 : 1,
      });
      el(card, 'rect', { x: 0, y: 0, width: 4, height: CARD_H, rx: 2, fill: hue });
      writeText(card, 10, 16, nameOf(p.id), {
        size: fontSizes.sm,
        fill: isDone ? c.textMuted : c.text,
        weight: 600,
      });
      writeText(card, 10, 31, t('label.prio', 'Priority: {p}', { p: p.prio }), {
        size: fontSizes.xs,
        fill: c.textMuted,
      });
      const side =
        spot.place === 'future'
          ? t('label.arrive', 'Arrives: {tick}', { tick: p.arrive })
          : t('label.left', 'Left: {n}', { n: s.left[p.id] as number });
      writeText(card, g.cw - 8, 31, side, {
        size: fontSizes.xs,
        fill: pushed ? c.itemSwapping : c.textMuted,
        anchor: 'end',
        weight: pushed ? 600 : 400,
      });

      // 남은 양의 칸 — 채운 칸이 남은 양, 빈 칸은 이미 돈 틱
      const cellsX = 10;
      const cellsW = g.cw - 18;
      const cellW = cellsW / p.length;
      const cellH = 10;
      const cellY = 38;
      for (let k = 0; k < p.length; k += 1) {
        const x = cellsX + k * cellW;
        el(card, 'rect', {
          x: x + 1,
          y: cellY,
          width: Math.max(1, cellW - 2),
          height: cellH,
          fill: 'none',
          stroke: c.border,
        });
        const fill = clamp01(shown - k);
        if (fill > 0) {
          el(card, 'rect', {
            x: x + 1,
            y: cellY,
            width: Math.max(0, (cellW - 2) * fill),
            height: cellH,
            fill: hue,
          });
        }
      }
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

    function hasMotion(s: PriorityPreemptScene): boolean {
      const step = s.step;
      if (step === null) return false;
      return s.procs.some(
        (p) =>
          step.wasLeft[p.id] !== s.left[p.id] ||
          !sameSpot(step.from[p.id] as PriorityPreemptSpot, priorityPreemptSpot(s, p.id)),
      );
    }

    return {
      async render(next: PriorityPreemptScene, _prev: PriorityPreemptScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || !hasMotion(next)) {
          draw(next, null);
          return;
        }
        const started = Date.now();
        draw(next, 0);
        for (;;) {
          await wait(FRAME_MS);
          if (mine !== gen || destroyed) return;
          const u = (Date.now() - started) / MOVE_MS;
          if (u >= 1) break;
          draw(next, u);
        }
        draw(next, null);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
