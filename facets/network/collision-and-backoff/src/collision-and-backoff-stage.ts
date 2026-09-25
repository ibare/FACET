/**
 * collision-and-backoff 의 무대 — 시간 위의 한 선.
 *
 * 가로는 슬롯이 흐르는 시간이다. 가운데 띠가 함께 쓰는 선이고, 그 위아래에 스테이션의
 * 줄이 선다. 충돌 걸음에서는 두 스테이션의 신호가 제 줄에서 선으로 나가 한가운데서
 * 만나고, 선이 부딪힘으로 물든 뒤 둘 다 제 줄로 물러난다. 물러난 둘은 각자 다른 길이의
 * 기다림을 쥐고, 지금 시각의 선이 지나가며 그 기다림을 갉아먹는다.
 *
 * 정적 그리기 `drawFrame(scene, 1)` 이 정본이다. 운동은 같은 함수에 이번 걸음의
 * 진행률 p 를 넘겨 "아직 못 온 만큼" 으로 그린다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Translate,
} from '@ffacet/core/runtime';
import type { CollisionAndBackoffScene, LineCell, SlotStep } from './scene.js';

const H = 276;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 왼쪽 이름 칸과 오른쪽 여백. 슬롯 칸은 나머지 폭을 채운다. */
const GUTTER = 104;
const RIGHT_PAD = 14;
const COL_MAX = 96;

const CAPTION_Y1 = 22;
const CAPTION_Y2 = 42;
const LINE_Y = 144;
const LINE_H = 32;
const LANE_H = 26;
const LANE_GAP = 28;
const AXIS_Y = 262;

const MOTION_MS = 700;
const FRAME_MS = 16;

/** 충돌 걸음의 박자 — 나가 만나기 · 부딪힘 · 물러나기. */
const MEET_END = 0.45;
const CLASH_END = 0.6;
/** 혼자 보내기 시작할 때 신호가 줄에서 선으로 내려앉는 몫. */
const DROP_END = 0.3;
/** 찬 선을 두드려 보고 돌아오는 몫. */
const PROBE_HALF = 0.35;

type Attrs = Record<string, string | number>;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(q: number): number {
  const c = Math.max(0, Math.min(1, q));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

function span(p: number, from: number, to: number): number {
  return Math.max(0, Math.min(1, (p - from) / (to - from)));
}

type Lane = { id: string; index: number; above: boolean; top: number; mid: number };

/** 스테이션 줄의 자리 — 앞 절반은 선 위, 나머지는 선 아래로 쌓는다. */
function laneLayout(stations: string[]): Lane[] {
  const aboveCount = Math.ceil(stations.length / 2);
  return stations.map((id, index) => {
    const above = index < aboveCount;
    const depth = above ? aboveCount - 1 - index : index - aboveCount;
    const offset = LINE_H / 2 + LANE_GAP + depth * (LANE_H + 8);
    const top = above ? LINE_Y - offset - LANE_H : LINE_Y + offset;
    return { id, index, above, top, mid: top + LANE_H / 2 };
  });
}

export const collisionAndBackoffStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function node(tag: string, attrs: Attrs, parent: Element): SVGElement {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        e.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(e);
      return e;
    }

    function words(s: string, attrs: Attrs, parent: Element): void {
      const e = node('text', { 'font-family': fonts.body, ...attrs }, parent);
      e.textContent = s;
    }

    function stationName(id: string): string {
      if (id === 'a') return t('label.a', 'Station A');
      if (id === 'b') return t('label.b', 'Station B');
      return t('label.station', 'Station');
    }

    function captionLines(s: CollisionAndBackoffScene): [string, string] {
      const step = s.step;
      if (step === null) {
        return [
          t('caption.ready', 'Next: slot {slot}. Stations with a frame ready: {n}', { slot: s.now, n: s.ready }),
          t('caption.frame', 'Frame length in slots: {n}', { n: s.frameSlots }),
        ];
      }
      if (step.collision) {
        return [
          t('caption.collide', 'Slot {slot}: collision. Started together on an idle line: {n}', {
            slot: step.slot,
            n: step.heard.filter((h) => !h.busy && step.senders.includes(h.id)).length,
          }),
          t('caption.backoff', 'Stopped, each backing off to its own mark: {n}', { n: step.picks.length }),
        ];
      }
      return [firstLine(step), secondLine(s, step)];
    }

    function firstLine(step: SlotStep): string {
      const sender = step.senders[0];
      if (sender === undefined) return '';
      const name = stationName(sender);
      if (step.doneBy === sender) {
        return t('caption.last', 'Slot {slot}: {name} sends its last slot and is done.', {
          slot: step.slot,
          name,
        });
      }
      if (step.heard.some((h) => h.id === sender && !h.busy)) {
        return t('caption.start', 'Slot {slot}: {name} hears an idle line and sends.', {
          slot: step.slot,
          name,
        });
      }
      return t('caption.hold', 'Slot {slot}: {name} holds the line.', { slot: step.slot, name });
    }

    function secondLine(s: CollisionAndBackoffScene, step: SlotStep): string {
      const deferred = step.heard.find((h) => h.busy);
      if (deferred !== undefined) {
        return t('caption.defer', '{name} hears a busy line and keeps listening.', {
          name: stationName(deferred.id),
        });
      }
      if (step.finished) return t('caption.end', 'Collisions: {n}', { n: s.collisions });
      const waiting = step.waitLeft[0];
      if (waiting !== undefined) {
        return t('caption.wait', '{name} — slots of waiting left: {n}', {
          name: stationName(waiting.id),
          n: waiting.left,
        });
      }
      if (step.left !== null && step.doneBy === null) {
        return t('caption.left', 'Frame slots left: {n}', { n: step.left });
      }
      return '';
    }

    /** 장면 하나를 이번 걸음의 진행률 p 까지 그린다. p = 1 이 정적 그리기다. */
    function drawFrame(s: CollisionAndBackoffScene, p: number): void {
      svg.textContent = '';
      const [line1, line2] = captionLines(s);
      words(line1, { x: PIECE_CANVAS_W / 2, y: CAPTION_Y1, 'text-anchor': 'middle', fill: colors.text, 'font-size': fontSizes.md }, svg);
      words(line2, { x: PIECE_CANVAS_W / 2, y: CAPTION_Y2, 'text-anchor': 'middle', fill: colors.textMuted, 'font-size': fontSizes.sm }, svg);

      if (s.stations.length === 0 || s.slots <= 0) return;

      const room = PIECE_CANVAS_W - GUTTER - RIGHT_PAD;
      const colW = Math.min(COL_MAX, room / s.slots);
      const x0 = GUTTER + (room - colW * s.slots) / 2;
      const xAt = (slot: number): number => x0 + slot * colW;
      const lanes = laneLayout(s.stations);
      const laneOf = new Map(lanes.map((l) => [l.id, l]));
      const tones = categorical(s.stations.length);
      const toneOf = (id: string): string => {
        const lane = laneOf.get(id);
        return lane === undefined ? colors.textMuted : tones[lane.index] ?? colors.textMuted;
      };
      const top = Math.min(...lanes.map((l) => l.top), LINE_Y - LINE_H / 2);
      const bottom = Math.max(...lanes.map((l) => l.top + LANE_H), LINE_Y + LINE_H / 2);

      const step = s.step;
      const cur = (slot: number): boolean => step !== null && step.slot === slot && p < 1;
      const nowX = step === null ? xAt(s.now) : xAt(step.slot + Math.min(1, p));
      const nowSlot = step === null ? s.now : step.slot + Math.min(1, p);

      // 이름 칸
      for (const lane of lanes) {
        words(stationName(lane.id), { x: GUTTER - 12, y: lane.mid + smPx / 3, 'text-anchor': 'end', fill: colors.text, 'font-size': fontSizes.sm }, svg);
      }
      words(t('label.line', 'Shared line'), { x: GUTTER - 12, y: LINE_Y + smPx / 3, 'text-anchor': 'end', fill: colors.textMuted, 'font-size': fontSizes.sm }, svg);
      words(t('label.slot', 'Slot'), { x: GUTTER - 12, y: AXIS_Y, 'text-anchor': 'end', fill: colors.textMuted, 'font-size': fontSizes.xs }, svg);

      // 선 띠와 슬롯 눈금
      node('rect', { x: x0, y: LINE_Y - LINE_H / 2, width: colW * s.slots, height: LINE_H, rx: 4, fill: colors.bgSubtle, stroke: colors.border }, svg);
      for (let i = 0; i <= s.slots; i += 1) {
        node('line', { x1: xAt(i), y1: top - 4, x2: xAt(i), y2: bottom + 4, stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '2 4' }, svg);
      }
      for (let i = 0; i < s.slots; i += 1) {
        words(String(i), { x: xAt(i) + colW / 2, y: AXIS_Y, 'text-anchor': 'middle', fill: colors.textMuted, 'font-size': fontSizes.xs, 'font-family': fonts.mono }, svg);
      }

      // 쥔 기다림 — 지금 시각이 지나간 몫은 사라진다
      for (const w of s.waits) {
        const lane = laneOf.get(w.id);
        if (lane === undefined) continue;
        const born = step !== null && step.collision && w.from === step.slot + 1 && p < 1;
        const grow = born ? ease(span(p, CLASH_END, 1)) : 1;
        const start = Math.max(w.from, nowSlot);
        const end = born ? w.from + (w.until - w.from) * grow : w.until;
        if (end > start) {
          node('rect', { x: xAt(start) + 2, y: lane.top + 4, width: Math.max(0, xAt(end) - xAt(start) - 4), height: LANE_H - 8, rx: 3, fill: toneOf(w.id), 'fill-opacity': 0.18, stroke: colors.textMuted, 'stroke-dasharray': '3 3' }, svg);
        }
        if (born && p < CLASH_END) continue;
        drawMark(lane, xAt(w.until), w.k, w.hi, born ? ease(span(p, CLASH_END, 1)) : 1, toneOf(w.id));
      }

      // 찬 선을 듣고 미룬 슬롯
      for (const d of s.deferrals) {
        const lane = laneOf.get(d.id);
        if (lane === undefined) continue;
        const now = cur(d.slot);
        const width = (colW - 6) * (now ? p : 1);
        node('rect', { x: xAt(d.slot) + 3, y: lane.top, width, height: LANE_H, rx: 4, fill: 'none', stroke: toneOf(d.id), 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
        if (!now || p > PROBE_HALF * 2) {
          words(t('label.listen', 'listening'), { x: xAt(d.slot) + colW / 2, y: lane.mid + parseFloat(fontSizes.xs) / 3, 'text-anchor': 'middle', fill: colors.textMuted, 'font-size': fontSizes.xs }, svg);
        }
        if (now && p < PROBE_HALF * 2) {
          // 선을 두드려 보고 돌아온다 — 찬 선에 부딪혀 되튄다
          const reach = p < PROBE_HALF ? ease(p / PROBE_HALF) : ease(1 - (p - PROBE_HALF) / PROBE_HALF);
          const from = lane.above ? lane.top + LANE_H : lane.top;
          const to = lane.above ? LINE_Y - LINE_H / 2 : LINE_Y + LINE_H / 2;
          node('circle', { cx: xAt(d.slot) + colW / 2, cy: from + (to - from) * reach, r: 5, fill: toneOf(d.id) }, svg);
        }
      }

      // 선이 슬롯마다 겪은 일
      for (const c of s.cells) drawCell(c, cur(c.slot) ? p : 1);

      // 지금 시각
      node('line', { x1: nowX, y1: top - 10, x2: nowX, y2: bottom + 10, stroke: colors.primary, 'stroke-width': 2 }, svg);

      function drawMark(lane: Lane, x: number, k: number, hi: number, q: number, tone: string): void {
        const edge = lane.above ? lane.top : lane.top + LANE_H;
        const dir = lane.above ? -1 : 1;
        const lift = (1 - q) * 10;
        const tip = edge + dir * (2 + lift);
        const base = edge + dir * (12 + lift);
        node('path', { d: `M ${round(x)} ${round(tip)} L ${round(x - 6)} ${round(base)} L ${round(x + 6)} ${round(base)} Z`, fill: tone }, svg);
        node('line', { x1: x, y1: lane.top, x2: x, y2: lane.top + LANE_H, stroke: tone, 'stroke-width': 2 }, svg);
        words(t('label.k', 'k = {k} (0–{hi})', { k, hi }), { x: x + 9, y: base + dir * 2 + (lane.above ? 0 : parseFloat(fontSizes.xs) - 2), fill: colors.text, 'font-size': fontSizes.xs, 'font-family': fonts.mono }, svg);
      }

      function drawCell(c: LineCell, q: number): void {
        const cx = xAt(c.slot);
        const inner = colW - 6;
        if (c.collision) {
          drawCollision(c, cx, inner, q);
          return;
        }
        const id = c.senders[0];
        if (id === undefined) return;
        const lane = laneOf.get(id);
        if (lane === undefined) return;
        const tone = toneOf(id);
        const width = inner * q;
        node('rect', { x: cx + 3, y: lane.top, width, height: LANE_H, rx: 4, fill: tone }, svg);
        const started = step !== null && step.slot === c.slot && step.heard.some((h) => h.id === id && !h.busy);
        if (started && q < 1 && q < DROP_END) {
          // 줄에서 선으로 신호가 내려앉는다
          const d = ease(q / DROP_END);
          const toY = LINE_Y - LINE_H / 2 + 3;
          const y = lane.top + (toY - lane.top) * d;
          node('rect', { x: cx + 3, y, width: Math.max(8, inner * 0.25), height: LINE_H - 6, rx: 4, fill: tone }, svg);
          return;
        }
        node('rect', { x: cx + 3, y: LINE_Y - LINE_H / 2 + 3, width, height: LINE_H - 6, rx: 4, fill: tone }, svg);
      }

      function drawCollision(c: LineCell, cx: number, inner: number, q: number): void {
        const clash = q >= 1 ? 1 : span(q, MEET_END, CLASH_END);
        if (clash > 0) {
          node('rect', { x: cx + 3, y: LINE_Y - LINE_H / 2 + 3, width: inner, height: LINE_H - 6, rx: 4, fill: colors.danger, 'fill-opacity': clash }, svg);
          const zig = [0, 1, 2, 3, 4].map((i) => {
            const zx = cx + 3 + (inner * i) / 4;
            const zy = LINE_Y + (i % 2 === 0 ? -6 : 6);
            return `${i === 0 ? 'M' : 'L'} ${round(zx)} ${round(zy)}`;
          });
          node('path', { d: zig.join(' '), fill: 'none', stroke: colors.textInverse, 'stroke-width': 2, 'stroke-opacity': clash }, svg);
        }
        for (const id of c.senders) {
          const lane = laneOf.get(id);
          if (lane === undefined) continue;
          const tone = toneOf(id);
          if (q >= 1) {
            // 헛것이 된 신호 — 제 줄로 물러나 남은 자국
            node('rect', { x: cx + 3, y: lane.top, width: inner, height: LANE_H, rx: 4, fill: tone, 'fill-opacity': 0.25, stroke: colors.danger, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
            continue;
          }
          // 두 신호가 한가운데서 만난다 — 위의 것은 아랫변이, 아래의 것은 윗변이 선의 중심에 닿는다
          const meetTop = lane.above ? LINE_Y - LANE_H : LINE_Y;
          const go = ease(span(q, 0, MEET_END));
          const back = ease(span(q, CLASH_END, 1));
          const reach = q < CLASH_END ? go : 1 - back;
          const y = lane.top + (meetTop - lane.top) * reach;
          const fade = 1 - 0.75 * back;
          node('rect', { x: cx + 3, y, width: inner, height: LANE_H, rx: 4, fill: tone, 'fill-opacity': fade, stroke: back > 0 ? colors.danger : 'none', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
        }
      }
    }

    function tick(mine: number): Promise<boolean> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve(mine === gen && !destroyed);
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, FRAME_MS);
        timers.add(id);
        waiters.add(wake);
      });
    }

    return {
      async render(
        next: CollisionAndBackoffScene,
        _prev: CollisionAndBackoffScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step === null) {
          drawFrame(next, 1);
          return;
        }
        const frames = Math.ceil(MOTION_MS / FRAME_MS);
        for (let i = 0; i < frames; i += 1) {
          if (mine !== gen || destroyed) return;
          drawFrame(next, i / frames);
          if (!(await tick(mine))) return;
        }
        if (mine !== gen || destroyed) return;
        drawFrame(next, 1);
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
