/**
 * 앞질러 가져오기 — stage.
 *
 * 줄기(프리페치 없음 · 다음 줄 프리페치)마다 위에 메모리의 줄들, 아래에 캐시 칸들,
 * 그 밑에 읽기 커서와 사이클 띠를 둔다. 부른 줄은 메모리에서 **복제본이 내려와** 캐시
 * 제자리에 닿는다 — 가는 데 지연 사이클만큼 걸린다. 커서는 원소를 읽는 동안 칸을
 * 가로질러 나아가고, 줄이 아직 안 왔으면 줄 경계에 서서 기다린다.
 *
 * 화면 전체가 (장면, 시계) 의 함수다. 운동은 이번 걸음의 사이클 구간 [from, to) 를
 * 한 시계로 흘리며 그 시계로 화면을 다시 세운다 — 떠나는 줄과 나아가는 커서가 같은
 * 시계를 탄다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

import type { Policy } from './algorithm.js';
import type { FetchAheadBase, FetchAheadScene, LaneTrace } from './scene.js';

const H = 400;
const W = PIECE_CANVAS_W;
const NS = 'http://www.w3.org/2000/svg';

/** 한 사이클이 흐르는 벽시계 ms */
const MS_PER_CYCLE = 250;
/** 한 프레임 간격 */
const FRAME_MS = 16;

const TOP = 36;
const LEFT = 78;
const RIGHT = 14;
const LINE_GAP = 8;
const CELL_MAX = 40;
const CELL_H = 22;

/** 줄기 안의 세로 자리 (줄기 윗변에서) */
const Y_HEAD = 14;
const Y_MEM = 26;
const Y_CACHE = 104;
const Y_CURSOR = CELL_H + 4;
const Y_BAND = 150;
const BAND_H = 12;

function r(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  content: string,
  opts: { fill: string; size: string; anchor?: string; weight?: string; mono?: boolean },
): void {
  const node = el(
    'text',
    {
      x,
      y,
      fill: opts.fill,
      'font-size': opts.size,
      'font-family': opts.mono ? fonts.mono : fonts.body,
      'text-anchor': opts.anchor ?? 'start',
      'dominant-baseline': 'middle',
      ...(opts.weight ? { 'font-weight': opts.weight } : {}),
    },
    parent,
  );
  node.textContent = content;
}

/** 넘겨받은 자료가 이 조각의 것인지 좁힌다. 틀리면 기본값. */
function narrow(data: Record<string, unknown> | undefined): { policies: Policy[] } {
  const raw = data?.['policies'];
  const policies = Array.isArray(raw)
    ? raw.filter((p): p is Policy => p === 'none' || p === 'nextLine')
    : [];
  return { policies: policies.length > 0 ? policies : ['none', 'nextLine'] };
}

type Geometry = {
  lines: number;
  cellW: number;
  cellX(e: number): number;
  lineX(l: number): number;
  lineW: number;
  bandX: number;
  bandW: number;
  laneTop(i: number): number;
};

function geometry(base: FetchAheadBase, laneCount: number): Geometry {
  const lines = Math.ceil(base.n / base.lineSize);
  const room = W - LEFT - RIGHT - (lines - 1) * LINE_GAP;
  const cellW = Math.min(CELL_MAX, room / base.n);
  const cellX = (e: number): number => LEFT + e * cellW + Math.floor(e / base.lineSize) * LINE_GAP;
  const lineW = base.lineSize * cellW;
  const laneH = (H - TOP) / Math.max(1, laneCount);
  return {
    lines,
    cellW,
    cellX,
    lineX: (l: number) => cellX(l * base.lineSize),
    lineW,
    bandX: LEFT,
    bandW: cellX(base.n - 1) + cellW - LEFT,
    laneTop: (i: number) => TOP + i * laneH,
  };
}

/** 시계 c 에서 커서가 나아간 만큼 — 읽기마다 제 사이클 동안 0 에서 1 로 찬다. */
function progress(lane: LaneTrace, c: number): number {
  let p = 0;
  for (const q of lane.reads) p += clamp01(c - q.at);
  return p;
}

export const fetchAheadStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<FetchAheadScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const fallback = narrow(params.initialData);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function laneTitle(policy: Policy): string {
      return policy === 'nextLine'
        ? t('lane.nextLine', 'Next-line prefetch')
        : t('lane.none', 'No prefetch');
    }

    function status(base: FetchAheadBase, lane: LaneTrace, c: number): { text: string; waiting: boolean } {
      const k = Math.floor(c);
      const current = lane.reads.find((q) => q.at <= c && c < q.at + 1);
      if (current) return { text: t('status.read', 'Reading element {e}.', { e: current.elem }), waiting: false };
      const next = lane.reads.filter((q) => q.at + 1 <= c).length;
      if (next >= base.n && lane.done && c >= lane.done.total) {
        return {
          text: t('status.done', 'Done: {total} cycles, {waited} of them waiting.', {
            total: lane.done.total,
            waited: lane.done.waited,
          }),
          waiting: false,
        };
      }
      const line = Math.floor(next / base.lineSize);
      const req = lane.requests.find((q) => q.line === line);
      if (req && req.arrive <= k) {
        return { text: t('status.read', 'Reading element {e}.', { e: next }), waiting: false };
      }
      return { text: t('status.wait', 'Waiting for line {l}.', { l: line }), waiting: true };
    }

    function drawLane(g: Geometry, base: FetchAheadBase, policy: Policy, lane: LaneTrace, top: number, c: number): void {
      const layer = el('g', {}, svg);
      const st = status(base, lane, c);

      // 머리 — 줄기 이름과 지금 일어나는 일
      label(layer, 8, top + Y_HEAD, laneTitle(policy), {
        fill: colors.text,
        size: fontSizes.sm,
        weight: '600',
      });
      label(layer, W - RIGHT, top + Y_HEAD, st.text, {
        fill: st.waiting ? colors.itemComparing : colors.textMuted,
        size: fontSizes.sm,
        anchor: 'end',
      });

      // 줄 이름 칸
      label(layer, LEFT - 8, top + Y_MEM + CELL_H / 2, t('label.memory', 'memory'), {
        fill: colors.textMuted,
        size: fontSizes.xs,
        anchor: 'end',
      });
      label(layer, LEFT - 8, top + Y_CACHE + CELL_H / 2, t('label.cache', 'cache'), {
        fill: colors.textMuted,
        size: fontSizes.xs,
        anchor: 'end',
      });
      label(layer, LEFT - 8, top + Y_BAND + BAND_H / 2, t('label.cycles', 'cycles'), {
        fill: colors.textMuted,
        size: fontSizes.xs,
        anchor: 'end',
      });

      const arrived = (line: number): boolean => {
        const q = lane.requests.find((x) => x.line === line);
        return q !== undefined && q.arrive <= c;
      };

      // 메모리 — 원본은 늘 제자리에 있다
      for (let l = 0; l < g.lines; l += 1) {
        const x = g.lineX(l);
        el('rect', {
          x,
          y: top + Y_MEM,
          width: g.lineW,
          height: CELL_H,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: colors.border,
        }, layer);
        for (let j = 0; j < base.lineSize; j += 1) {
          const e = l * base.lineSize + j;
          if (e >= base.n) break;
          label(layer, g.cellX(e) + g.cellW / 2, top + Y_MEM + CELL_H / 2, String(e), {
            fill: colors.textMuted,
            size: fontSizes.xs,
            anchor: 'middle',
            mono: true,
          });
        }
        label(layer, x + g.lineW / 2, top + Y_MEM + CELL_H + 12, t('label.line', 'line {l}', { l }), {
          fill: colors.textMuted,
          size: fontSizes.xs,
          anchor: 'middle',
        });
      }

      // 캐시 칸 — 줄이 닿아야 찬다
      for (let e = 0; e < base.n; e += 1) {
        const line = Math.floor(e / base.lineSize);
        const here = arrived(line);
        const read = lane.reads.find((q) => q.elem === e);
        let fill = colors.bg;
        if (here) fill = colors.itemDefault;
        if (read && read.at <= c) fill = c < read.at + 1 ? colors.itemActive : colors.itemSorted;
        el('rect', {
          x: g.cellX(e) + 1,
          y: top + Y_CACHE,
          width: g.cellW - 2,
          height: CELL_H,
          rx: 2,
          fill,
          stroke: colors.border,
          ...(here ? {} : { 'stroke-dasharray': '3 2' }),
        }, layer);
        if (here) {
          label(layer, g.cellX(e) + g.cellW / 2, top + Y_CACHE + CELL_H / 2, String(e), {
            fill: colors.text,
            size: fontSizes.xs,
            anchor: 'middle',
            mono: true,
          });
        }
      }

      // 오는 중인 줄 — 복제본이 메모리에서 캐시 제자리로 내려온다
      for (const q of lane.requests) {
        if (!(q.at <= c && c < q.arrive)) continue;
        const f = clamp01((c - q.at) / (q.arrive - q.at));
        const y = top + Y_MEM + f * (Y_CACHE - Y_MEM);
        const x = g.lineX(q.line);
        el('rect', {
          x,
          y,
          width: g.lineW,
          height: CELL_H,
          rx: 3,
          fill: colors.primary,
        }, layer);
        for (let j = 0; j < base.lineSize; j += 1) {
          const e = q.line * base.lineSize + j;
          if (e >= base.n) break;
          label(layer, g.cellX(e) + g.cellW / 2, y + CELL_H / 2, String(e), {
            fill: colors.textInverse,
            size: fontSizes.xs,
            anchor: 'middle',
            mono: true,
          });
        }
      }

      // 커서 — 읽는 동안 나아가고, 기다리는 동안 선다
      const p = progress(lane, c);
      const e = Math.min(Math.floor(p), base.n - 1);
      const x0 = g.cellX(e);
      const x1 = e + 1 < base.n ? g.cellX(e + 1) : g.cellX(e) + g.cellW;
      const cx = x0 + (p - e) * (x1 - x0);
      const cursorColor = st.waiting ? colors.itemComparing : colors.accent;
      const cy = top + Y_CACHE + Y_CURSOR;
      el('line', {
        x1: cx,
        y1: top + Y_CACHE - 4,
        x2: cx,
        y2: cy,
        stroke: cursorColor,
        'stroke-width': 2,
      }, layer);
      el('path', {
        d: `M ${r(cx)} ${r(cy)} l -6 9 l 12 0 z`,
        fill: cursorColor,
      }, layer);

      // 사이클 띠 — 읽은 사이클과 기다린 사이클
      const seg = g.bandW / base.horizon;
      const end = lane.done ? lane.done.total : Infinity;
      for (let k = 0; k < base.horizon; k += 1) {
        const x = g.bandX + k * seg;
        el('rect', {
          x: x + 0.5,
          y: top + Y_BAND,
          width: seg - 1,
          height: BAND_H,
          fill: colors.bgSubtle,
        }, layer);
        const f = clamp01(c - k);
        if (f <= 0 || k >= end) continue;
        const didRead = lane.reads.some((q) => q.at === k);
        el('rect', {
          x: x + 0.5,
          y: top + Y_BAND,
          width: (seg - 1) * f,
          height: BAND_H,
          fill: didRead ? colors.itemSorted : colors.itemComparing,
        }, layer);
      }
    }

    function draw(scene: FetchAheadScene, c: number): void {
      svg.textContent = '';
      const base = scene.base;
      if (!base) return;
      const policies = base.policies.length > 0 ? base.policies : fallback.policies;
      const g = geometry(base, policies.length);
      label(svg, W / 2, 18, t('label.clock', 'cycle {c}', { c: Math.floor(c) }), {
        fill: colors.text,
        size: fontSizes.md,
        anchor: 'middle',
        mono: true,
      });
      policies.forEach((policy, i) => {
        const lane = scene.lanes[i];
        if (lane) drawLane(g, base, policy, lane, g.laneTop(i), c);
      });
    }

    function drawStatic(scene: FetchAheadScene): void {
      draw(scene, scene.clock);
    }

    function flow(scene: FetchAheadScene, from: number, to: number, mine: number): Promise<void> {
      const duration = (to - from) * MS_PER_CYCLE;
      return new Promise<void>((resolve) => {
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = Date.now();
        const frame = (): void => {
          if (mine !== gen || destroyed) {
            finish();
            return;
          }
          const k = clamp01((Date.now() - start) / duration);
          draw(scene, from + (to - from) * k);
          if (k >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            frame();
          }, FRAME_MS);
          timers.add(id);
        };
        draw(scene, from);
        const id = setTimeout(() => {
          timers.delete(id);
          frame();
        }, FRAME_MS);
        timers.add(id);
      });
    }

    return {
      async render(next, _prev, opts): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || !next.base || !step || step.to <= step.from) {
          drawStatic(next);
          return;
        }
        await flow(next, step.from, step.to, mine);
        if (mine !== gen || destroyed) return;
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
