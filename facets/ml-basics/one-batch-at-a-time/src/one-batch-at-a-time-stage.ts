/**
 * one-batch-at-a-time 무대.
 *
 * 위: 점 여덟이 칸으로 서 있고, 걸음마다 묶음 두 점이 두 줄로 내려간다.
 * 가운데 두 줄: 미니배치 줄은 주머니(두 칸)가 차는 즉시 w 표식이 w 축 위를 호를 그리며 뛰어 옮기고,
 *   전체 줄은 주머니(여덟 칸)에 점이 쌓이기만 하다가 마지막 묶음에서 한 번 크게 뛴다.
 *   뛴 자국(호)이 줄에 남아 한 바퀴 동안 몇 번 옮겼는지가 그대로 보인다.
 * 오른쪽: 각 줄의 전체 손실 막대 (처음 손실을 가득으로).
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
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { axisTicks } from './algorithm.js';
import type { Lane, OneBatchScene } from './scene.js';

const H = 356;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 400;
/** 운동 앞쪽 몫 — 점이 주머니로 내려가는 동안. 나머지 몫에 w 가 뛴다 */
const FLIGHT_SHARE = 0.45;

const PAD = 16;
const CHIP_GAP = 8;
const CHIP_TOP = 26;
const CHIP_H = 44;
const LANE_TOP = [86, 192] as const;
const SLOT = 14;
const SLOT_GAP = 3;
const ARC_MAX = 30;

const XS_PX = parseFloat(fontSizes.xs);
const SM_PX = parseFloat(fontSizes.sm);
const MD_PX = parseFloat(fontSizes.md);

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return Object.is(n, -0) ? 0 : n;
}

function signed(v: number): string {
  return v.toFixed(2).replace('-', '−');
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/** 글자 폭 어림 — 넓은 글자(한글 · 한자 · 가나)는 1em, 나머지는 0.56em */
function approxWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? px : px * 0.56;
  return w;
}

function wrap(s: string, px: number, maxW: number): string[] {
  const words = s.includes(' ') ? s.split(' ') : [...s];
  const joiner = s.includes(' ') ? ' ' : '';
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const cand = cur === '' ? word : cur + joiner + word;
    if (cur !== '' && approxWidth(cand, px) > maxW) {
      lines.push(cur);
      cur = word;
    } else {
      cur = cand;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

type Geo = {
  chipW: number;
  ax0: number;
  ax1: number;
  lossX: number;
  lossW: number;
};

function geometry(): Geo {
  const chipW = (W - 2 * PAD - 7 * CHIP_GAP) / 8;
  const slotsW = 8 * SLOT + 7 * SLOT_GAP;
  const ax0 = PAD + slotsW + 34;
  const lossX = W - PAD - Math.min(150, W * 0.24);
  const ax1 = lossX - 26;
  return { chipW, ax0, ax1, lossX, lossW: W - PAD - lossX };
}

export const oneBatchAtATimeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const laneColor = categorical(2, 'deep');
    const miniColor = laneColor[0];
    const fullColor = laneColor[1];
    if (miniColor === undefined || fullColor === undefined) throw new Error('one-batch-at-a-time-stage: 줄 색을 얻지 못했다');
    const geo = geometry();

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function put(
      parent: Element,
      x: number,
      y: number,
      s: string,
      o: { px: number; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; mono?: boolean },
    ): void {
      const node = el(parent, 'text', {
        x: r1(x),
        y: r1(y),
        'font-family': o.mono === true ? fonts.mono : fonts.body,
        'font-size': o.px,
        fill: o.fill,
        'text-anchor': o.anchor ?? 'start',
      });
      if (o.weight !== undefined) node.setAttribute('font-weight', String(o.weight));
      node.textContent = s;
    }

    function wx(w: number, lo: number, hi: number): number {
      if (w < lo || w > hi) throw new Error(`one-batch-at-a-time-stage: w ${w} 가 축 [${lo}, ${hi}] 밖이다`);
      return geo.ax0 + ((w - lo) / (hi - lo)) * (geo.ax1 - geo.ax0);
    }

    function chipCenter(i: number): { x: number; y: number } {
      return { x: PAD + i * (geo.chipW + CHIP_GAP) + geo.chipW / 2, y: CHIP_TOP + CHIP_H / 2 };
    }

    function slotCenter(laneTop: number, j: number): { x: number; y: number } {
      return { x: PAD + j * (SLOT + SLOT_GAP) + SLOT / 2, y: laneTop + 34 + SLOT / 2 };
    }

    function arcPoints(x0: number, x1: number, y: number, upTo: number): string {
      const h = Math.min(ARC_MAX, 6 + Math.abs(x1 - x0) * 0.25);
      const n = 20;
      const pts: string[] = [];
      for (let i = 0; i <= n; i += 1) {
        const s = (i / n) * upTo;
        pts.push(`${r1(x0 + (x1 - x0) * s)},${r1(y - Math.sin(Math.PI * s) * h)}`);
      }
      return pts.join(' ');
    }

    /** 장면 전체를 세운다. motion 이 null 이 아니면 이번 걸음의 운동 중 그 몫까지 온 모습이다. */
    function draw(scene: OneBatchScene | null, motion: number | null): void {
      svg.textContent = '';
      if (scene === null) return;
      const run = scene.run;
      const step = run?.step ?? null;
      const cur = step !== null && step.kind === 'batch' ? step : null;
      const flight = motion === null ? 1 : Math.min(1, motion / FLIGHT_SHARE);
      const hop = motion === null ? 1 : Math.max(0, (motion - FLIGHT_SHARE) / (1 - FLIGHT_SHARE));
      const landed = flight >= 1;

      // 위 — 점 여덟
      put(svg, PAD, 16, t('label.points', 'Points (x, y)'), { px: SM_PX, fill: colors.textMuted });
      put(svg, W - PAD, 16, t('label.rule', 'w ← w − η·g · η = {eta}', { eta: String(scene.eta) }), {
        px: SM_PX,
        fill: colors.textMuted,
        anchor: 'end',
      });
      const arrived = new Set(run?.arrived ?? []);
      const incoming = new Set(cur?.idx ?? []);
      scene.points.forEach((p, i) => {
        const x = PAD + i * (geo.chipW + CHIP_GAP);
        const isIn = incoming.has(i);
        const isSeen = arrived.has(i) && !isIn;
        el(svg, 'rect', {
          x: r1(x),
          y: CHIP_TOP,
          width: r1(geo.chipW),
          height: CHIP_H,
          rx: 4,
          fill: isIn ? colors.accent : isSeen ? colors.bgSubtle : colors.bg,
          stroke: isIn ? colors.accent : colors.border,
          'stroke-width': 1,
        });
        const ink = isIn ? colors.stateInk : isSeen ? colors.textMuted : colors.text;
        put(svg, x + 5, CHIP_TOP + 11, String(i), { px: XS_PX, fill: isIn ? colors.stateInk : colors.textMuted, mono: true });
        put(svg, x + geo.chipW / 2, CHIP_TOP + 26, `x ${p.x.toFixed(1)}`, { px: SM_PX, fill: ink, anchor: 'middle', mono: true });
        put(svg, x + geo.chipW / 2, CHIP_TOP + 39, `y ${p.y.toFixed(1)}`, { px: SM_PX, fill: ink, anchor: 'middle', mono: true });
      });

      if (run === null) return;

      const lanes: { key: 'mini' | 'full'; top: number; lane: Lane; color: string; slots: number; held: number[] }[] = [
        { key: 'mini', top: LANE_TOP[0], lane: run.mini, color: miniColor, slots: 2, held: run.pocket },
        { key: 'full', top: LANE_TOP[1], lane: run.full, color: fullColor, slots: 8, held: run.arrived },
      ];
      const ticks = axisTicks(run.axis);
      const ghosts: { from: { x: number; y: number }; to: { x: number; y: number }; i: number }[] = [];

      for (const L of lanes) {
        const g = el(svg, 'g', {});
        const top = L.top;
        const axisY = top + 62;
        el(g, 'line', { x1: PAD, y1: top - 6, x2: W - PAD, y2: top - 6, stroke: colors.border, 'stroke-width': 1 });

        // 이름
        if (L.key === 'mini') {
          put(g, PAD, top + 12, t('label.mini', 'Minibatch'), { px: MD_PX, fill: L.color, weight: 600 });
          put(g, PAD, top + 26, t('label.miniRule', 'updates after every batch'), { px: XS_PX, fill: colors.textMuted });
        } else {
          put(g, PAD, top + 12, t('label.full', 'Full batch'), { px: MD_PX, fill: L.color, weight: 600 });
          put(g, PAD, top + 26, t('label.fullRule', 'updates after all points'), { px: XS_PX, fill: colors.textMuted });
        }

        // 주머니 — 모은 점
        const fresh = new Set(cur?.idx ?? []);
        for (let j = 0; j < L.slots; j += 1) {
          const c = slotCenter(top, j);
          const who = L.held[j];
          const show = who !== undefined && (landed || !fresh.has(who));
          el(g, 'rect', {
            x: r1(c.x - SLOT / 2),
            y: r1(c.y - SLOT / 2),
            width: SLOT,
            height: SLOT,
            rx: 2,
            fill: show ? L.color : colors.bg,
            'fill-opacity': show ? 0.22 : 1,
            stroke: show ? L.color : colors.border,
            'stroke-dasharray': show ? 'none' : '2 2',
          });
          if (show) put(g, c.x, c.y + 4, String(who), { px: XS_PX, fill: colors.text, anchor: 'middle', mono: true });
          if (who !== undefined && fresh.has(who) && !landed) {
            ghosts.push({ from: chipCenter(who), to: c, i: who });
          }
        }
        put(g, PAD, top + 66, t('label.updates', 'Updates: {n}', { n: L.lane.hops.length }), {
          px: SM_PX,
          fill: colors.text,
        });
        put(g, PAD, top + 84, t('label.w', 'w = {w}', { w: signed(L.lane.w) }), { px: SM_PX, fill: colors.text, mono: true });

        // w 축
        el(g, 'line', { x1: r1(geo.ax0), y1: axisY, x2: r1(geo.ax1), y2: axisY, stroke: colors.textMuted, 'stroke-width': 1 });
        for (const v of ticks) {
          const x = wx(v, run.axis.lo, run.axis.hi);
          el(g, 'line', { x1: r1(x), y1: axisY, x2: r1(x), y2: axisY + 4, stroke: colors.textMuted, 'stroke-width': 1 });
          put(g, x, axisY + 16, v.toFixed(1), { px: XS_PX, fill: colors.textMuted, anchor: 'middle', mono: true });
        }
        put(g, geo.ax1 + 8, axisY + 4, 'w', { px: SM_PX, fill: colors.textMuted, mono: true });

        // 뛴 자국 — 이번 걸음의 뜀은 hop 몫까지만
        const movedNow = cur !== null && (L.key === 'mini' || cur.full.kind === 'move');
        L.lane.hops.forEach((h, hi) => {
          const isNow = movedNow && hi === L.lane.hops.length - 1;
          const upTo = isNow ? ease(hop) : 1;
          if (upTo <= 0) return;
          el(g, 'polyline', {
            points: arcPoints(wx(h.from, run.axis.lo, run.axis.hi), wx(h.to, run.axis.lo, run.axis.hi), axisY, upTo),
            fill: 'none',
            stroke: L.color,
            'stroke-width': isNow ? 2 : 1.5,
            'stroke-opacity': isNow ? 1 : 0.45,
            'stroke-linecap': 'round',
          });
        });

        // w 표식
        let mx = wx(L.lane.w, run.axis.lo, run.axis.hi);
        let my = axisY;
        const last = L.lane.hops[L.lane.hops.length - 1];
        if (movedNow && last !== undefined && hop < 1) {
          const e = ease(hop);
          const x0 = wx(last.from, run.axis.lo, run.axis.hi);
          const hgt = Math.min(ARC_MAX, 6 + Math.abs(mx - x0) * 0.25);
          mx = x0 + (mx - x0) * e;
          my = axisY - Math.sin(Math.PI * e) * hgt;
        }
        el(g, 'circle', { cx: r1(mx), cy: r1(my), r: 7, fill: L.color, stroke: colors.bg, 'stroke-width': 2 });

        // 손실 — 여덟 점 전체
        put(g, geo.lossX, top + 12, t('label.loss', 'Loss (all points)'), { px: XS_PX, fill: colors.textMuted });
        let loss = L.lane.loss;
        if (cur !== null) {
          const m = L.key === 'mini' ? cur.mini : cur.full.kind === 'move' ? cur.full : null;
          if (m !== null) loss = m.lossFrom + (m.lossTo - m.lossFrom) * ease(hop);
        }
        el(g, 'rect', { x: r1(geo.lossX), y: top + 22, width: r1(geo.lossW), height: 12, fill: colors.bgSubtle, stroke: colors.border });
        el(g, 'rect', {
          x: r1(geo.lossX),
          y: top + 22,
          width: r1((Math.min(loss, run.loss0) / run.loss0) * geo.lossW),
          height: 12,
          fill: L.color,
        });
        put(g, geo.lossX, top + 52, L.lane.loss.toFixed(2), { px: MD_PX, fill: colors.text, weight: 600, mono: true });
        if (cur !== null) {
          const gv = L.key === 'mini' ? cur.mini.g : cur.full.kind === 'move' ? cur.full.g : null;
          if (gv !== null) {
            put(g, geo.lossX, top + 72, t('label.g', 'g = {g}', { g: signed(gv) }), { px: SM_PX, fill: colors.text, mono: true });
          }
        }
      }

      // 내려가는 점
      for (const gh of ghosts) {
        const e = ease(flight);
        const x = gh.from.x + (gh.to.x - gh.from.x) * e;
        const y = gh.from.y + (gh.to.y - gh.from.y) * e;
        el(svg, 'rect', { x: r1(x - SLOT / 2), y: r1(y - SLOT / 2), width: SLOT, height: SLOT, rx: 2, fill: colors.accent });
        put(svg, x, y + 4, String(gh.i), { px: XS_PX, fill: colors.stateInk, anchor: 'middle', mono: true });
      }

      // 캡션
      const capTop = LANE_TOP[1] + 116;
      let body: string;
      if (cur === null) {
        body = t('caption.start', 'Same data, same starting w. One pass over the points begins.');
      } else {
        const head = t('caption.batch', 'Incoming batch: {k} / {n}', { k: cur.k, n: scene.batches.length });
        put(svg, PAD, capTop, head, { px: MD_PX, fill: colors.text, weight: 600 });
        body =
          cur.full.kind === 'wait'
            ? t('caption.wait', 'Minibatch updates w right away; full batch only collects the points.')
            : t('caption.move', 'Minibatch updates again; full batch has now seen every point and updates once.');
      }
      const first = cur === null ? 0 : 1;
      wrap(body, MD_PX, W - 2 * PAD)
        .slice(0, 2)
        .forEach((s, i) => put(svg, PAD, capTop + 18 * (first + i), s, { px: MD_PX, fill: colors.text }));
    }

    function animate(next: OneBatchScene, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const frame = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / MOTION_MS);
          if (p >= 1) {
            draw(next, null);
            wake();
            return;
          }
          draw(next, p);
          const id = setTimeout(() => {
            timers.delete(id);
            frame();
          }, 16);
          timers.add(id);
        };
        frame();
      });
    }

    return {
      render(next: OneBatchScene, prev: OneBatchScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const n = next.run;
        const p = prev?.run ?? null;
        const forward =
          n !== null && n.step.kind === 'batch' && p !== null && p.mini.hops.length === n.mini.hops.length - 1;
        if (!opts.animate || !forward) {
          draw(next, null);
          return;
        }
        return animate(next, mine).then(() => {
          if (mine === gen && !destroyed) draw(next, null);
        });
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
