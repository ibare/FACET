/**
 * crowd-the-tails stage — 자리가 꼬리로 몰리는 것을 그린다.
 *
 * ── 화면의 짜임 (위에서 아래로)
 *
 *   캡션
 *   k 자          눈금이 고른 간격으로 박힌 자. 자르는 쪽의 자리다.
 *   부채살        눈금 하나가 q 의 어디에 내려앉는지 잇는 선.
 *   q 선          분위 0…1 의 자. 그 아래가 그릇이다.
 *   그릇 여섯     경계 사이의 통. 폭이 곧 그 뭉치가 덮는 q 폭이다.
 *   점 예순       제 분위 자리에 선다. 담기면 그릇 바닥에 쌓인다.
 *   자국          뭉치마다 하나. 굵기는 그 뭉치가 삼킨 점의 수다.
 *
 * ── 무엇이 움직이는가
 *
 * 동사는 "몰린다" 다. 그래서 자르는 선이 **자리를 옮긴다** — 고르게 내려앉았던
 * 여섯이 척도를 거치며 저마다 가까운 끝으로 미끄러지고, 그릇의 폭이 그에 맞춰
 * 꼬리에서 좁아지고 가운데에서 벌어진다. 점은 제자리에 있고 그릇이 움직인다.
 * 담기는 걸음에서는 점이 제 그릇 바닥으로 쏟아져 기둥이 된다.
 *
 * ── 좌표
 *
 * 전부 여기서 셈한다. 선언에는 구조(점의 수)만 있고 자리는 그림의 몫이다
 * (S-piece). 가로는 러너가 PIECE_CANVAS_W 로 정하므로 적지 않고, 세로만 여기 둔다.
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 정한다 (S-view). */
const CANVAS_H = 274;

const LANE_X0 = 34;
const LANE_X1 = 594;
const LANE_W = LANE_X1 - LANE_X0;

const CAPTION_Y = 20;
const K_AXIS_Y = 57;
const K_TICK_H = 5;
const FAN_TOP = 63;
const Q_AXIS_Y = 126;
const PCT_Y = 141;
const DOTS_Y = 159;
const PILE_BASE = 236;
const PILE_PITCH = 4.2;
const FLOOR_Y = 244;
const COUNT_Y = 260;
const MARK_Y = 204;

const DOT_R = 2;
const MARK_R_BASE = 2.2;
const MARK_R_PER = 0.44;

const DROP_MS = 760;
const SLIDE_MS = 820;
const POUR_MS = 740;
const MERGE_MS = 640;
const FRAME_MS = 16;

const DEFAULT_COUNT = 60;

type Scene = { count: number };

/** 선언을 좁힌다. 러너 밖에서 config 없이 띄우는 경로도 견딘다 (S-view). */
function readScene(initialData: Record<string, unknown> | undefined): Scene {
  const raw = initialData as { count?: unknown } | undefined;
  const count =
    typeof raw?.count === 'number' && raw.count >= 1 ? Math.floor(raw.count) : DEFAULT_COUNT;
  return { count };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(p: number): number {
  const t = clamp01(p);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clear(group: SVGGElement): void {
  while (group.firstChild) group.removeChild(group.firstChild);
}

export const crowdTheTailsStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 (S-view).
    svg.textContent = '';

    const scene = readScene(params.initialData);

    let destroyed = false;
    /** 되감을 때마다 오른다. 지난 판의 애니메이션이 새 화면에 손대지 못하게 한다. */
    let epoch = 0;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    async function tween(ms: number, apply: (p: number) => void): Promise<void> {
      const mine = epoch;
      const started = Date.now();
      for (;;) {
        if (destroyed || mine !== epoch) return;
        const p = clamp01((Date.now() - started) / ms);
        apply(p);
        if (p >= 1) return;
        await wait(FRAME_MS);
      }
    }

    // ── 층. 그리는 순서가 곧 겹치는 순서다.
    const gAxis = el('g', {});
    const gRuler = el('g', {});
    const gVessel = el('g', {});
    const gCuts = el('g', {});
    const gDots = el('g', {});
    const gMarks = el('g', {});
    const gCounts = el('g', {});
    const gCaption = el('g', {});
    for (const g of [gAxis, gRuler, gVessel, gCuts, gDots, gMarks, gCounts, gCaption]) {
      svg.appendChild(g);
    }

    function label(
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        fill,
        'font-family': fonts.body,
        'font-size': size,
        'text-anchor': anchor,
      });
    }

    function xOf(q: number): number {
      return LANE_X0 + q * LANE_W;
    }

    /** i 번째 눈금의 자리. 자 위에서는 언제나 고른 간격이다. */
    function kxOf(i: number, total: number): number {
      return total <= 1 ? LANE_X0 : LANE_X0 + (LANE_W * i) / (total - 1);
    }

    // ── 처음부터 서 있는 것: q 자와 점.
    gAxis.appendChild(
      el('line', {
        x1: LANE_X0,
        y1: Q_AXIS_Y,
        x2: LANE_X1,
        y2: Q_AXIS_Y,
        stroke: c.text,
        'stroke-width': 1.2,
      }),
    );
    // 'q' / 'k' 는 도형에 새긴 기호다 — 번역하지 않는다 (C10).
    const qGlyph = label(LANE_X0 - 10, Q_AXIS_Y + 4, fontSizes.sm, c.textMuted, 'end');
    qGlyph.textContent = 'q';
    gAxis.appendChild(qGlyph);

    const dots: SVGCircleElement[] = [];
    const dotHome: number[] = [];
    for (let i = 0; i < scene.count; i += 1) {
      const x = xOf((i + 0.5) / scene.count);
      dotHome.push(x);
      const dot = el('circle', { cx: x, cy: DOTS_Y, r: DOT_R, fill: c.textMuted });
      dots.push(dot);
      gDots.appendChild(dot);
    }

    const caption = label(PIECE_CANVAS_W / 2, CAPTION_Y, fontSizes.md, c.text, 'middle');
    gCaption.appendChild(caption);

    // ── 걸음이 만드는 것.
    type Cut = { fan: SVGLineElement; wall: SVGLineElement; pct: SVGTextElement };
    type Vessel = { body: SVGRectElement; floor: SVGLineElement };

    let cuts: Cut[] = [];
    let vessels: Vessel[] = [];
    let countLabels: SVGTextElement[] = [];
    let bounds: number[] = [];
    let counts: number[] = [];

    /** k 자 — 눈금은 언제나 고른 간격이다. 자르는 쪽에서는 아무것도 몰리지 않는다. */
    function buildRuler(total: number): void {
      clear(gRuler);
      gRuler.appendChild(
        el('line', {
          x1: LANE_X0,
          y1: K_AXIS_Y,
          x2: LANE_X1,
          y2: K_AXIS_Y,
          stroke: c.textMuted,
          'stroke-width': 1,
        }),
      );
      for (let i = 0; i < total; i += 1) {
        const x = kxOf(i, total);
        gRuler.appendChild(
          el('line', {
            x1: x,
            y1: K_AXIS_Y - K_TICK_H,
            x2: x,
            y2: K_AXIS_Y + K_TICK_H,
            stroke: c.textMuted,
            'stroke-width': 1.4,
          }),
        );
      }
      const kGlyph = label(LANE_X0 - 10, K_AXIS_Y + 4, fontSizes.sm, c.textMuted, 'end');
      kGlyph.textContent = 'k';
      gRuler.appendChild(kGlyph);
    }

    function buildCuts(total: number): void {
      clear(gCuts);
      cuts = [];
      for (let i = 0; i < total; i += 1) {
        const fan = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: c.border, 'stroke-width': 1 });
        const wall = el('line', {
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 0,
          stroke: c.itemActive,
          'stroke-width': 1.6,
        });
        const pct = label(0, PCT_Y, fontSizes.xs, c.textMuted, 'middle');
        pct.setAttribute('opacity', '0');
        gCuts.appendChild(fan);
        gCuts.appendChild(wall);
        gCuts.appendChild(pct);
        cuts.push({ fan, wall, pct });
      }
    }

    function buildVessels(parts: number): void {
      clear(gVessel);
      vessels = [];
      for (let i = 0; i < parts; i += 1) {
        const body = el('rect', {
          x: 0,
          y: Q_AXIS_Y,
          width: 0,
          height: 0,
          fill: c.bgSubtle,
        });
        const floor = el('line', {
          x1: 0,
          y1: FLOOR_Y,
          x2: 0,
          y2: FLOOR_Y,
          stroke: c.border,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        gVessel.appendChild(body);
        gVessel.appendChild(floor);
        vessels.push({ body, floor });
      }
    }

    /**
     * 자르는 선을 놓는다.
     *
     * `drop` 은 눈금에서 바닥까지 내려온 정도다. 부채살은 q 자까지, 벽은 그 아래로
     * 이어진다 — 한 번의 내려옴이 자르는 일이자 그릇을 세우는 일이다.
     */
    function layoutCuts(bs: number[], drop: number): void {
      const total = cuts.length;
      const tip = FAN_TOP + clamp01(drop) * (FLOOR_Y - FAN_TOP);
      const fanEnd = Math.min(tip, Q_AXIS_Y);
      const u = (fanEnd - FAN_TOP) / (Q_AXIS_Y - FAN_TOP);
      for (let i = 0; i < total; i += 1) {
        const cut = cuts[i];
        const kx = kxOf(i, total);
        const cx = xOf(bs[i] ?? 0);
        cut.fan.setAttribute('x1', String(kx));
        cut.fan.setAttribute('y1', String(FAN_TOP));
        cut.fan.setAttribute('x2', String(kx + (cx - kx) * u));
        cut.fan.setAttribute('y2', String(fanEnd));
        const wallBottom = Math.max(Q_AXIS_Y, tip);
        cut.wall.setAttribute('x1', String(cx));
        cut.wall.setAttribute('y1', String(Q_AXIS_Y));
        cut.wall.setAttribute('x2', String(cx));
        cut.wall.setAttribute('y2', String(wallBottom));
        cut.pct.setAttribute('x', String(cx));
        cut.pct.setAttribute('opacity', tip > Q_AXIS_Y ? '1' : '0');
        cut.pct.textContent = `${Math.round((bs[i] ?? 0) * 100)}%`;
      }
    }

    function layoutVessels(bs: number[], drop: number, grow: number): void {
      const tip = FAN_TOP + clamp01(drop) * (FLOOR_Y - FAN_TOP);
      const height = Math.max(0, Math.min(FLOOR_Y, tip) - Q_AXIS_Y);
      for (let i = 0; i < vessels.length; i += 1) {
        const x0 = xOf(bs[i] ?? 0);
        const w = Math.max(0, xOf(bs[i + 1] ?? 0) - x0);
        const v = vessels[i];
        v.body.setAttribute('x', String(x0));
        v.body.setAttribute('width', String(w));
        v.body.setAttribute('height', String(height));
        v.floor.setAttribute('x1', String(x0));
        v.floor.setAttribute('x2', String(x0 + w * clamp01(grow)));
      }
    }

    function centerOf(b: number): number {
      return (xOf(bounds[b] ?? 0) + xOf(bounds[b + 1] ?? 0)) / 2;
    }

    function setCount(b: number, value: number): void {
      let node = countLabels[b];
      if (!node) {
        node = label(0, COUNT_Y, fontSizes.xs, c.text, 'middle');
        countLabels[b] = node;
        gCounts.appendChild(node);
      }
      node.setAttribute('x', String(centerOf(b)));
      node.textContent = String(value);
    }

    function clearCounts(): void {
      clear(gCounts);
      countLabels = [];
    }

    /** 담긴 그릇은 바닥을 짙게 — 셈이 끝난 자리다. */
    function markFilled(b: number): void {
      vessels[b]?.floor.setAttribute('stroke', c.text);
    }

    /** b 번 그릇에 드는 점의 번호 구간. 점은 분위 순으로 서 있다. */
    function firstIndexOf(b: number): number {
      let from = 0;
      for (let i = 0; i < b; i += 1) from += counts[i] ?? 0;
      return from;
    }

    type Job = { dot: SVGCircleElement; x0: number; y0: number; x1: number; y1: number; order: number };

    function jobsFor(b: number, toX: number, toY: (m: number) => number): Job[] {
      const from = firstIndexOf(b);
      const n = counts[b] ?? 0;
      const out: Job[] = [];
      for (let m = 0; m < n; m += 1) {
        const dot = dots[from + m];
        if (!dot) continue;
        out.push({
          dot,
          x0: Number(dot.getAttribute('cx') ?? 0),
          y0: Number(dot.getAttribute('cy') ?? 0),
          x1: toX,
          y1: toY(m),
          order: m,
        });
      }
      return out;
    }

    /** 한꺼번에 쏟지 않고 조금씩 어긋나게 — 쏟아지는 것으로 보이게 한다. */
    function runJobs(jobs: Job[], p: number): void {
      const n = jobs.length;
      const span = 0.5;
      const step = n > 1 ? span / (n - 1) : 0;
      for (const job of jobs) {
        const u = ease(clamp01((p - job.order * step) / (1 - span)));
        job.dot.setAttribute('cx', String(job.x0 + (job.x1 - job.x0) * u));
        job.dot.setAttribute('cy', String(job.y0 + (job.y1 - job.y0) * u));
      }
    }

    // ── projector 가 부르는 것.

    async function cutEvenly(bs: number[], evenCounts: number[]): Promise<void> {
      if (bs.length < 2) return;
      const parts = bs.length - 1;
      bounds = bs.slice();
      counts = evenCounts.slice();
      buildRuler(bs.length);
      buildCuts(bs.length);
      buildVessels(parts);
      clearCounts();
      caption.textContent = t(
        'caption.even',
        'Cut the quantile line into {parts} equal buckets: {count} points in each.',
        { parts, count: evenCounts[0] ?? 0 },
      );
      layoutCuts(bs, 0);
      layoutVessels(bs, 0, 0);
      await tween(DROP_MS, (p) => {
        layoutCuts(bs, ease(Math.min(1, p / 0.72)));
        layoutVessels(bs, ease(Math.min(1, p / 0.72)), clamp01((p - 0.58) / 0.42));
      });
      for (let b = 0; b < parts; b += 1) setCount(b, evenCounts[b] ?? 0);
    }

    async function cutByScale(bs: number[], scaledCounts: number[]): Promise<void> {
      if (bs.length < 2 || cuts.length !== bs.length) return;
      caption.textContent = t(
        'caption.scale',
        'Cut k in equal steps instead: near the ends one step covers far less of q.',
        {},
      );
      clearCounts();
      const from = bounds.slice();
      await tween(SLIDE_MS, (p) => {
        const e = ease(p);
        const now = from.map((q, i) => q + ((bs[i] ?? q) - q) * e);
        layoutCuts(now, 1);
        layoutVessels(now, 1, 1);
      });
      bounds = bs.slice();
      counts = scaledCounts.slice();
      layoutCuts(bounds, 1);
      layoutVessels(bounds, 1, 1);
    }

    async function fillPair(
      left: number,
      right: number,
      leftCount: number,
      rightCount: number,
    ): Promise<void> {
      const parts = vessels.length;
      if (parts === 0) return;
      const middle = Math.floor((parts - 1) / 2);
      caption.textContent =
        left === 0
          ? t('caption.fillTail', 'Each tail bucket holds only {count}.', { count: leftCount })
          : left === middle
            ? t(
                'caption.fillMiddle',
                'The middle buckets swallow {count} points each — coarse, and no harm done.',
                { count: leftCount },
              )
            : t('caption.fillOuter', 'The next pair out holds {count} each.', {
                count: leftCount,
              });

      const targets = left === right ? [left] : [left, right];
      const jobs: Job[] = [];
      for (const b of targets) {
        jobs.push(...jobsFor(b, centerOf(b), (m) => PILE_BASE - m * PILE_PITCH));
      }
      await tween(POUR_MS, (p) => runJobs(jobs, p));
      for (const job of jobs) job.dot.setAttribute('fill', c.text);
      for (const b of targets) markFilled(b);
      setCount(left, leftCount);
      setCount(right, rightCount);
    }

    async function formDigest(
      qs: number[],
      finalCounts: number[],
      tailCount: number,
      middleCount: number,
      ratio: number,
    ): Promise<void> {
      if (vessels.length === 0) return;
      caption.textContent = t(
        'caption.digest',
        'One mark per bucket: {middle} points in the middle, {tail} at the tails — {ratio}x finer.',
        { middle: middleCount, tail: tailCount, ratio: ratio.toFixed(1) },
      );

      clear(gMarks);
      const jobs: Job[] = [];
      const marks: Array<{ node: SVGCircleElement; r: number }> = [];
      for (let b = 0; b < vessels.length; b += 1) {
        const q = qs[b];
        const x = typeof q === 'number' ? xOf(q) : centerOf(b);
        jobs.push(...jobsFor(b, x, () => MARK_Y));
        const node = el('circle', { cx: x, cy: MARK_Y, r: 0, fill: c.text });
        gMarks.appendChild(node);
        marks.push({ node, r: MARK_R_BASE + (finalCounts[b] ?? 0) * MARK_R_PER });
      }

      await tween(MERGE_MS, (p) => {
        runJobs(jobs, p);
        const e = ease(p);
        for (const m of marks) m.node.setAttribute('r', String(m.r * e));
      });
      // 뭉치가 남기는 것은 자국 하나다 — 삼킨 점은 더 이상 따로 서 있지 않는다.
      for (const job of jobs) job.dot.setAttribute('opacity', '0');
    }

    function rewind(): void {
      epoch += 1;
      clear(gRuler);
      clear(gVessel);
      clear(gCuts);
      clear(gMarks);
      clearCounts();
      cuts = [];
      vessels = [];
      bounds = [];
      counts = [];
      caption.textContent = '';
      for (let i = 0; i < dots.length; i += 1) {
        const dot = dots[i];
        dot.setAttribute('cx', String(dotHome[i] ?? 0));
        dot.setAttribute('cy', String(DOTS_Y));
        dot.setAttribute('fill', c.textMuted);
        dot.setAttribute('opacity', '1');
      }
    }

    return {
      cutEvenly,
      cutByScale,
      fillPair,
      formDigest,
      rewind,

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
