/**
 * widest-margin stage — 띠가 벌어지다 닿아서 멈추는 그림.
 *
 * ── 화면을 어떻게 갈랐는가
 *
 * 산점도는 주인공이 아니라 무대다. 주인공은 **두께** 이므로, 두께를 점에서
 * 떼어 내 오른쪽 기록장으로 보낸다. 왼쪽에서 띠가 벌어지는 동안 오른쪽 막대가
 * 같은 속도로 자라고, 띠가 점에 닿아 멈추면 막대도 그 길이로 멈춰 남는다.
 * 후보를 다 훑고 나면 기록장에 여섯 줄이 쌓이고, 가장 긴 줄이 답이다 —
 * 견주는 일이 화면 한쪽에서 통째로 일어난다.
 *
 * ── 축척
 *
 * 그림판은 정사각이고 가로세로 눈금이 같다. 두께는 선에 수직인 거리라, 눈금이
 * 어긋나면 기울기가 다른 두 띠의 두께를 눈으로 견줄 수 없다. 기록장 막대의
 * 길이 눈금은 두 무리 사이 가장 가까운 점쌍의 거리에서 잡는다 — 마진은 그
 * 거리를 넘을 수 없으므로 막대가 자를 넘칠 일이 없다.
 *
 * ── 운동
 *
 * 점은 제 무리의 중심에서 자기 자리로 나오고, 후보 선은 왼쪽에서 오른쪽으로
 * 그어지고, 띠 가장자리는 중심선에서 양옆으로 **밀려난다**. 후보가 바뀔 때는
 * 띠가 접히고 선이 돌아간다. 마지막에 우승 길이를 가리키는 세로 눈금선이
 * 기록장을 타고 올라가 나머지가 모두 못 미친 것을 보인다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

// ─────────────────────────────────────────────────────────────────────────────
// 선언 읽기 — mount 와 projector 가 이 한 벌을 함께 쓴다 (C9 / S-piece).
// ─────────────────────────────────────────────────────────────────────────────

export type MarginPointModel = { x: number; y: number; group: string };

export type WidestMarginModel = {
  points: MarginPointModel[];
  /** 두께 기록장의 줄 수 = 견줄 후보 + 최적 하나. */
  rowCount: number;
};

export function readWidestMarginModel(raw: unknown): WidestMarginModel {
  const src = raw as { points?: unknown; candidateSlopes?: unknown } | undefined;
  const points: MarginPointModel[] = [];
  const rawPoints = src?.points;
  if (Array.isArray(rawPoints)) {
    for (const item of rawPoints) {
      const p = item as { x?: unknown; y?: unknown; group?: unknown };
      if (typeof p?.x !== 'number' || typeof p?.y !== 'number') continue;
      points.push({ x: p.x, y: p.y, group: typeof p.group === 'string' ? p.group : '' });
    }
  }
  const rawSlopes = src?.candidateSlopes;
  const slopeCount = Array.isArray(rawSlopes) ? rawSlopes.length : 0;
  return { points, rowCount: slopeCount + 1 };
}

/** 기울기 표기. 수식이라 번역하지 않는다 (C10 표식 판정 3). */
export function formatSlope(v: number): string {
  const s = v.toFixed(2);
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/** 두께 표기. 자릿수는 후보끼리 견주기에 충분한 만큼만. */
export function formatThickness(v: number): string {
  return v.toFixed(3);
}

// ─────────────────────────────────────────────────────────────────────────────
// 자리 — 캔버스에서 역산한다. 선언에 좌표를 두지 않는다 (S-piece).
// ─────────────────────────────────────────────────────────────────────────────

const STAGE_W = PIECE_CANVAS_W;
const STAGE_H = 356;

/** 오른쪽 여백. 왼쪽은 y 눈금 글자가 나갈 자리만큼 더 준다. */
const PAD = 26;
const CAPTION_BASELINE = 22;

const PLOT_X = 34;
const PLOT_TOP = 42;
const PLOT_SIDE_MAX = 292;
const RAIL_MIN_W = 232;
const COL_GAP = 26;

const PLOT_SIDE = Math.min(PLOT_SIDE_MAX, STAGE_W - PLOT_X - COL_GAP - RAIL_MIN_W - PAD);
const PLOT_BOTTOM = PLOT_TOP + PLOT_SIDE;
const RAIL_X = PLOT_X + PLOT_SIDE + COL_GAP;
const RAIL_W = STAGE_W - PAD - RAIL_X;

const RAIL_LABEL_W = 44;
const RAIL_VALUE_W = 42;
const RAIL_BAR_GAP = 8;
const BAR_X = RAIL_X + RAIL_LABEL_W + RAIL_BAR_GAP;
const BAR_MAX_W = RAIL_W - RAIL_LABEL_W - RAIL_BAR_GAP - RAIL_VALUE_W;
const BAR_H = 11;
const RAIL_HEADER_BASELINE = PLOT_TOP + 12;
const ROWS_TOP = PLOT_TOP + 24;

/** 데이터 범위 바깥으로 남기는 여백 (데이터 단위). */
const DOMAIN_MARGIN = 1;
/** 막대 자가 꽉 차 보이지 않게 두는 여유. */
const RAIL_HEADROOM = 1.04;

const POINT_R = 6;
const SQUARE_SIDE = 10.5;
const RING_R = 11;
/** 캘리퍼를 놓아 볼 자리 (그림판 가로의 비율). 점에서 가장 먼 곳을 고른다. */
const CALIPER_SPOTS: readonly number[] = [0.12, 0.26, 0.4, 0.55, 0.7, 0.85];
const CALIPER_TICK = 7;

// 걸음 하나는 여기 지속시간 + `stepMs` 다. 열한 걸음이라 이 수들이 곧 자동
// 재생의 길이를 정한다 — 읽을 시간은 stepMs 가 주고, 여기서는 운동이 눈에
// 보일 만큼만 쓴다 (S-piece).
const ENTER_MS = 460;
const DRAW_MS = 560;
const GROW_MS = 880;
const TOUCH_MS = 240;
const PIVOT_MS = 640;
const LOCK_MS = 460;
const CROWN_MS = 520;

/** band-grow 한 걸음의 세 구간 — 접힘 → 선 돌기 → 벌어짐. */
const PHASE_FOLD = 0.16;
const PHASE_TURN = 0.4;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** clipPath id 가 한 문서 안에서 겹치지 않게. 조각은 한 글에 여럿 박힌다. */
let mountSeq = 0;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** 여럿이 차례로 겹쳐 움직일 때 i 번째의 진행도. */
function staggered(t: number, i: number, n: number, overlap: number): number {
  if (n <= 1) return t;
  const span = 1 / (1 + (n - 1) * (1 - overlap));
  return clamp01((t - i * span * (1 - overlap)) / span);
}

/** 순수 변환 — 입력 hex 는 토큰에서 온다 (S-view Exception). */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function place<T extends SVGElement>(node: T, attrs: Record<string, string | number>): T {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  return place(document.createElementNS(SVG_NS, name), attrs);
}

// ─────────────────────────────────────────────────────────────────────────────

export type BandSpec = {
  row: number;
  slope: number;
  intercept: number;
  thickness: number;
  contacts: number[];
  best: boolean;
};

export type LockSpec = {
  contacts: number[];
  slope: number;
  intercept: number;
};

export const widestMarginStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 캔버스 **안쪽** 만 비운다. 컨테이너를 비우면 러너가 붙여 준 이 캔버스가
    // 떨어져 나가고 그림이 통째로 사라진다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    // 두 이름표를 가르는 색. 알고리즘 상태가 아니라 카테고리 식별이므로
    // categorical 시드에서 뽑는다 (S-view 결정 트리 3).
    const groupInk = categorical(2, 'vivid');
    const inkA = groupInk.at(0) ?? c.text;
    const inkB = groupInk.at(1) ?? c.textMuted;

    mountSeq += 1;
    const clipId = `widest-margin-plot-${mountSeq}`;

    // ── 기다림 관리 (S-piece). destroy 는 걸어 둔 프레임을 거두고 기다리던
    //    promise 를 전부 깨운다. 그러지 않으면 취소된 tick 이 아예 불리지 않아
    //    projector 가 영영 돌아오지 않는다.
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    const schedule = (fn: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(fn)
        : (setTimeout(fn, 16) as unknown as number);

    const unschedule = (id: number): void => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };

    function animate(duration: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          onFrame(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const t = clamp01((Date.now() - started) / duration);
          onFrame(t);
          if (t >= 1) {
            finish();
            return;
          }
          const id = schedule(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 뼈대
    const defs = el('defs', {});
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(
      el('rect', { x: PLOT_X, y: PLOT_TOP, width: PLOT_SIDE, height: PLOT_SIDE }),
    );
    defs.appendChild(clip);
    svg.appendChild(defs);

    const caption = el('text', {
      x: PAD,
      y: CAPTION_BASELINE,
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    svg.appendChild(caption);

    const legendG = el('g', {});
    svg.appendChild(legendG);

    const axisG = el('g', {});
    svg.appendChild(axisG);

    const clippedG = el('g', { 'clip-path': `url(#${clipId})` });
    svg.appendChild(clippedG);
    const pastG = el('g', {});
    const bandG = el('g', {});
    const supportG = el('g', {});
    clippedG.appendChild(pastG);
    clippedG.appendChild(bandG);
    clippedG.appendChild(supportG);

    const pointG = el('g', {});
    svg.appendChild(pointG);
    const ringG = el('g', {});
    svg.appendChild(ringG);

    const railG = el('g', {});
    svg.appendChild(railG);

    // ── 띠 (지금 재고 있는 것)
    const bandFill = el('polygon', {
      points: '',
      fill: hexToRgba(c.accent, 0.22),
      stroke: 'none',
    });
    const edgeLo = el('line', {
      stroke: c.accent,
      'stroke-width': 2.2,
      'stroke-linecap': 'round',
    });
    const edgeHi = el('line', {
      stroke: c.accent,
      'stroke-width': 2.2,
      'stroke-linecap': 'round',
    });
    const centerLine = el('line', {
      stroke: c.text,
      'stroke-width': 1.5,
      'stroke-dasharray': '6 4',
    });
        // 캘리퍼는 "두께가 선에 수직인 거리" 라는 것을 그림 안에서 말한다. 닿음을
    // 보이는 수선(검정 점선)과 헷갈리지 않게 옅은 회색 실선으로 둔다.
    const caliper = el('line', { stroke: c.textMuted, 'stroke-width': 1.1 });
    const caliperCapLo = el('line', { stroke: c.textMuted, 'stroke-width': 1.1 });
    const caliperCapHi = el('line', { stroke: c.textMuted, 'stroke-width': 1.1 });
    /** 띠 자체 — 두께가 0 이면 보이지 않는다. 중심선은 따로 다룬다. */
    const bandParts = [bandFill, edgeLo, edgeHi, caliper, caliperCapLo, caliperCapHi];
    for (const node of [centerLine, ...bandParts]) {
      node.setAttribute('opacity', '0');
      bandG.appendChild(node);
    }

    const recordLine = el('line', {
      stroke: c.text,
      'stroke-width': 1.2,
      'stroke-dasharray': '4 3',
      opacity: 0,
    });
    railG.appendChild(recordLine);

    // ── 모델에 따라 바뀌는 것
    let model: WidestMarginModel = { points: [], rowCount: 1 };
    let domainMin = 0;
    let domainSpan = 1;
    let unit = 1;
    let railUnit = 1;
    let rowHeight = 1;

    let pointNodes: SVGElement[] = [];
    let ringNodes: SVGCircleElement[] = [];
    let supportNodes: SVGLineElement[] = [];
    let barNodes: SVGRectElement[] = [];
    let barLabels: SVGTextElement[] = [];
    let barValues: SVGTextElement[] = [];
    const pastLines: SVGLineElement[] = [];

    let activeSlope = 0;
    let activeIntercept = 0;
    let activeHalf = 0;
    let lineShown = false;
    let caliperAt = CALIPER_SPOTS[Math.floor(CALIPER_SPOTS.length / 2)] ?? 0.5;

    const px = (x: number): number => PLOT_X + (x - domainMin) * unit;
    const py = (y: number): number => PLOT_BOTTOM - (y - domainMin) * unit;
    const rowCenter = (row: number): number => ROWS_TOP + rowHeight * (row + 0.5);

    function clearGroup(node: SVGElement): void {
      node.textContent = '';
    }

    function layoutFromPoints(points: MarginPointModel[]): void {
      if (points.length === 0) {
        domainMin = 0;
        domainSpan = 1;
        unit = PLOT_SIDE;
        railUnit = BAR_MAX_W;
        return;
      }
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const lo = Math.min(Math.min(...xs), Math.min(...ys)) - DOMAIN_MARGIN;
      const hi = Math.max(Math.max(...xs), Math.max(...ys)) + DOMAIN_MARGIN;
      // 가로세로 눈금을 같게 둔다 — 두께는 선에 수직인 거리라 축척이 어긋나면
      // 기울기가 다른 띠끼리 견줄 수 없다.
      domainMin = lo;
      domainSpan = Math.max(hi - lo, 1e-6);
      unit = PLOT_SIDE / domainSpan;

      // 마진은 서로 다른 무리의 가장 가까운 점쌍 거리를 넘을 수 없다. 그것을
      // 막대 자의 상한으로 삼으면 우승 막대가 자를 거의 채운다.
      let bound = Number.POSITIVE_INFINITY;
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const a = points[i];
          const b = points[j];
          if (a.group === b.group) continue;
          bound = Math.min(bound, Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      if (!Number.isFinite(bound) || bound <= 0) bound = domainSpan;
      railUnit = BAR_MAX_W / (bound * RAIL_HEADROOM);
    }

    function drawAxes(): void {
      clearGroup(axisG);
      axisG.appendChild(
        el('rect', {
          x: PLOT_X,
          y: PLOT_TOP,
          width: PLOT_SIDE,
          height: PLOT_SIDE,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      const first = Math.ceil(domainMin);
      const last = Math.floor(domainMin + domainSpan);
      for (let v = first; v <= last; v += 1) {
        const labelled = v % 2 === 0;
        axisG.appendChild(
          el('line', {
            x1: px(v),
            y1: PLOT_BOTTOM,
            x2: px(v),
            y2: PLOT_BOTTOM + (labelled ? 5 : 3),
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        axisG.appendChild(
          el('line', {
            x1: PLOT_X - (labelled ? 5 : 3),
            y1: py(v),
            x2: PLOT_X,
            y2: py(v),
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        if (!labelled) continue;
        const xLabel = el('text', {
          x: px(v),
          y: PLOT_BOTTOM + 17,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
        });
        xLabel.textContent = String(v);
        axisG.appendChild(xLabel);
        const yLabel = el('text', {
          x: PLOT_X - 8,
          y: py(v) + 4,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        });
        yLabel.textContent = String(v);
        axisG.appendChild(yLabel);
      }
    }

    function drawLegend(): void {
      clearGroup(legendG);
      const groups: string[] = [];
      for (const p of model.points) if (!groups.includes(p.group)) groups.push(p.group);
      if (groups.length === 0) return;
      const entryW = 24;
      const gap = 16;
      const total = groups.length * entryW + (groups.length - 1) * gap;
      const startX = STAGE_W - PAD - total;
      groups.forEach((name, i) => {
        const x = startX + i * (entryW + gap);
        const cy = CAPTION_BASELINE - 4;
        const ink = i === 0 ? inkA : inkB;
        legendG.appendChild(
          i === 0
            ? el('circle', { cx: x + 5, cy, r: 4.5, fill: ink })
            : el('rect', {
                x: x + 0.7,
                y: cy - 4.3,
                width: 8.6,
                height: 8.6,
                fill: ink,
              }),
        );
        // 이름표 글자는 데이터가 준다. 문안이 아니라 표식이다 (C10).
        const label = el('text', {
          x: x + 15,
          y: cy + 4,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        label.textContent = name;
        legendG.appendChild(label);
      });
    }

    function isFirstGroup(group: string): boolean {
      const first = model.points.at(0);
      return first !== undefined && group === first.group;
    }

    function groupInkOf(group: string): string {
      return isFirstGroup(group) ? inkA : inkB;
    }

    function setPointAt(index: number, x: number, y: number): void {
      const node = pointNodes.at(index);
      const p = model.points.at(index);
      if (node === undefined || p === undefined) return;
      if (isFirstGroup(p.group)) place(node, { cx: px(x), cy: py(y) });
      else
        place(node, {
          x: px(x) - SQUARE_SIDE / 2,
          y: py(y) - SQUARE_SIDE / 2,
        });
    }

    function buildPoints(): void {
      clearGroup(pointG);
      clearGroup(ringG);
      clearGroup(supportG);
      pointNodes = [];
      ringNodes = [];
      supportNodes = [];
      model.points.forEach((p) => {
        const ink = groupInkOf(p.group);
        const node = isFirstGroup(p.group)
          ? el('circle', {
              cx: 0,
              cy: 0,
              r: POINT_R,
              fill: ink,
              stroke: c.bg,
              'stroke-width': 1.6,
              opacity: 0,
            })
          : el('rect', {
              x: 0,
              y: 0,
              width: SQUARE_SIDE,
              height: SQUARE_SIDE,
              fill: ink,
              stroke: c.bg,
              'stroke-width': 1.6,
              opacity: 0,
            });
        pointG.appendChild(node);
        pointNodes.push(node);

        const ring = el('circle', {
          cx: 0,
          cy: 0,
          r: RING_R,
          fill: 'none',
          stroke: c.text,
          'stroke-width': 2,
          opacity: 0,
        });
        ringG.appendChild(ring);
        ringNodes.push(ring);

        const support = el('line', {
          stroke: c.text,
          'stroke-width': 1.2,
          'stroke-dasharray': '3 3',
          opacity: 0,
        });
        supportG.appendChild(support);
        supportNodes.push(support);
      });
    }

    function buildRail(): void {
      clearGroup(railG);
      railG.appendChild(recordLine);
      barNodes = [];
      barLabels = [];
      barValues = [];

      const header = el('text', {
        x: RAIL_X,
        y: RAIL_HEADER_BASELINE,
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
      header.textContent = tr('label.thickness', 'band thickness');
      railG.appendChild(header);

      rowHeight = (PLOT_BOTTOM - ROWS_TOP) / Math.max(1, model.rowCount);

      railG.appendChild(
        el('line', {
          x1: BAR_X - 4,
          y1: ROWS_TOP,
          x2: BAR_X - 4,
          y2: PLOT_BOTTOM,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );

      for (let row = 0; row < model.rowCount; row += 1) {
        const cy = rowCenter(row);
        railG.appendChild(
          el('line', {
            x1: BAR_X,
            y1: cy + BAR_H / 2 + 4,
            x2: RAIL_X + RAIL_W,
            y2: cy + BAR_H / 2 + 4,
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        const label = el('text', {
          x: RAIL_X + RAIL_LABEL_W,
          y: cy + 4,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        });
        railG.appendChild(label);
        barLabels.push(label);

        const bar = el('rect', {
          x: BAR_X,
          y: cy - BAR_H / 2,
          width: 0,
          height: BAR_H,
          rx: 2,
          fill: hexToRgba(c.text, 0.2),
        });
        railG.appendChild(bar);
        barNodes.push(bar);

        const value = el('text', {
          x: RAIL_X + RAIL_W,
          y: cy + 4,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        });
        railG.appendChild(value);
        barValues.push(value);
      }
    }

    /** 띠를 그린다. half 는 중심선에서 가장자리까지의 수직 거리. */
    function renderBand(slope: number, intercept: number, half: number): void {
      const norm = Math.hypot(slope, 1);
      const offset = half * norm;
      const xa = domainMin;
      const xb = domainMin + domainSpan;
      const at = (b: number, x: number): number => py(slope * x + b);

      const lo = intercept - offset;
      const hi = intercept + offset;
      bandFill.setAttribute(
        'points',
        [
          `${px(xa)},${at(lo, xa)}`,
          `${px(xb)},${at(lo, xb)}`,
          `${px(xb)},${at(hi, xb)}`,
          `${px(xa)},${at(hi, xa)}`,
        ].join(' '),
      );
      place(edgeLo, { x1: px(xa), y1: at(lo, xa), x2: px(xb), y2: at(lo, xb) });
      place(edgeHi, { x1: px(xa), y1: at(hi, xa), x2: px(xb), y2: at(hi, xb) });
      place(centerLine, {
        x1: px(xa),
        y1: at(intercept, xa),
        x2: px(xb),
        y2: at(intercept, xb),
      });

      // 캘리퍼 — 띠를 수직으로 가로질러 재는 자를 그린다.
      const cxData = xa + domainSpan * caliperAt;
      const cx = px(cxData);
      const cy = at(intercept, cxData);
      const nx = (slope / norm) * half * unit;
      const ny = (1 / norm) * half * unit;
      place(caliper, { x1: cx - nx, y1: cy - ny, x2: cx + nx, y2: cy + ny });
      const tx = (1 / norm) * CALIPER_TICK;
      const ty = (-slope / norm) * CALIPER_TICK;
      place(caliperCapLo, {
        x1: cx - nx - tx,
        y1: cy - ny - ty,
        x2: cx - nx + tx,
        y2: cy - ny + ty,
      });
      place(caliperCapHi, {
        x1: cx + nx - tx,
        y1: cy + ny - ty,
        x2: cx + nx + tx,
        y2: cy + ny + ty,
      });
      // 접혀 있는 동안은 띠가 아예 보이지 않아야 중심선이 노랗게 물들지 않는다.
      const shown = lineShown ? String(clamp01((half * unit) / 5)) : '0';
      for (const node of bandParts) node.setAttribute('opacity', shown);

      activeSlope = slope;
      activeIntercept = intercept;
      activeHalf = half;
    }

    /** 점 P 에서 선분 AB 까지의 거리. 캘리퍼 자리를 고르는 데만 쓴다. */
    function distToSegment(
      pxv: number,
      pyv: number,
      ax: number,
      ay: number,
      bx: number,
      by: number,
    ): number {
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : clamp01(((pxv - ax) * dx + (pyv - ay) * dy) / len2);
      return Math.hypot(pxv - (ax + dx * t), pyv - (ay + dy * t));
    }

    /**
     * 캘리퍼를 어디에 놓을지 고른다.
     *
     * 자가 점에 닿아 있으면 "이 점에서 뻗어 나온 선" 으로 읽혀 닿음을 보이는
     * 수선과 뒤섞인다. 그래서 후보 자리 가운데 어느 점에서도 가장 먼 곳을
     * 고른다 — 띠가 정해질 때 한 번만 셈하므로 프레임마다 흔들리지 않는다.
     */
    function pickCaliperSpot(slope: number, intercept: number, thickness: number): void {
      const norm = Math.hypot(slope, 1);
      const ox = (-slope / norm) * (thickness / 2);
      const oy = (1 / norm) * (thickness / 2);
      const hi = domainMin + domainSpan;
      let bestSpot = caliperAt;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const frac of CALIPER_SPOTS) {
        const x = domainMin + domainSpan * frac;
        const y = slope * x + intercept;
        const ax = x - ox;
        const ay = y - oy;
        const bx = x + ox;
        const by = y + oy;
        const inside =
          Math.min(ax, bx) >= domainMin &&
          Math.max(ax, bx) <= hi &&
          Math.min(ay, by) >= domainMin &&
          Math.max(ay, by) <= hi;
        let score = inside ? 0 : -10;
        let nearest = Number.POSITIVE_INFINITY;
        for (const p of model.points) {
          nearest = Math.min(nearest, distToSegment(p.x, p.y, ax, ay, bx, by));
        }
        score += Number.isFinite(nearest) ? nearest : 0;
        if (score > bestScore) {
          bestScore = score;
          bestSpot = frac;
        }
      }
      caliperAt = bestSpot;
    }

    /** 중심선을 켜고 끈다. 띠 자체의 드러남은 두께가 정한다. */
    function showLine(visible: boolean): void {
      lineShown = visible;
      centerLine.setAttribute('opacity', visible ? '1' : '0');
      if (!visible) for (const node of bandParts) node.setAttribute('opacity', '0');
    }

    function setBar(row: number, thickness: number, active: boolean): void {
      const bar = barNodes.at(row);
      const value = barValues.at(row);
      if (bar === undefined || value === undefined) return;
      bar.setAttribute('width', String(Math.max(0, thickness * railUnit)));
      bar.setAttribute('fill', active ? c.accent : hexToRgba(c.text, 0.24));
      value.textContent = formatThickness(thickness);
      value.setAttribute('fill', active ? c.text : c.textMuted);
    }

    function resetVisuals(): void {
      clearGroup(pastG);
      pastLines.length = 0;
      showLine(false);
      for (const node of pointNodes) node.setAttribute('opacity', '0');
      for (const node of ringNodes) node.setAttribute('opacity', '0');
      for (const node of supportNodes) node.setAttribute('opacity', '0');
      for (const bar of barNodes) {
        place(bar, { width: 0, fill: hexToRgba(c.text, 0.24), stroke: 'none' });
      }
      for (const label of barLabels) label.textContent = '';
      for (const value of barValues) value.textContent = '';
      recordLine.setAttribute('opacity', '0');
      activeHalf = 0;
    }

    function setModel(next: WidestMarginModel): void {
      model = next;
      layoutFromPoints(model.points);
      drawAxes();
      drawLegend();
      buildPoints();
      buildRail();
      resetVisuals();
      // 점은 제 무리 중심에 모여 있다가 자기 자리로 나온다.
      model.points.forEach((p, i) => {
        const centre = groupCentre(p.group);
        setPointAt(i, centre.x, centre.y);
      });
    }

    function groupCentre(group: string): { x: number; y: number } {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const p of model.points) {
        if (p.group !== group) continue;
        sx += p.x;
        sy += p.y;
        n += 1;
      }
      if (n === 0) return { x: domainMin + domainSpan / 2, y: domainMin + domainSpan / 2 };
      return { x: sx / n, y: sy / n };
    }

    setModel(readWidestMarginModel(params.initialData));

    // ── projector 가 부르는 것 ────────────────────────────────────────────

    const instance: ViewInstance = {
      setCaption(text: string): void {
        caption.textContent = text;
      },

      setModel(next: WidestMarginModel): void {
        setModel(next);
      },

      async placePoints(): Promise<void> {
        const n = model.points.length;
        const centres = model.points.map((p) => groupCentre(p.group));
        await animate(ENTER_MS, (t) => {
          model.points.forEach((p, i) => {
            const d = staggered(t, i, n, 0.65);
            const e = easeOut(d);
            const from = centres.at(i) ?? p;
            setPointAt(i, lerp(from.x, p.x, e), lerp(from.y, p.y, e));
            pointNodes[i]?.setAttribute('opacity', String(clamp01(d * 2.2)));
          });
        });
      },

      async drawCandidates(lines: Array<{ slope: number; intercept: number }>): Promise<void> {
        clearGroup(pastG);
        pastLines.length = 0;
        for (const line of lines) {
          const node = el('line', {
            stroke: c.textMuted,
            'stroke-width': 1.1,
            'stroke-dasharray': '5 4',
            opacity: 0.75,
            x1: px(domainMin),
            y1: py(line.slope * domainMin + line.intercept),
            x2: px(domainMin),
            y2: py(line.slope * domainMin + line.intercept),
          });
          pastG.appendChild(node);
          pastLines.push(node);
        }
        const xa = domainMin;
        const xb = domainMin + domainSpan;
        await animate(DRAW_MS, (t) => {
          lines.forEach((line, i) => {
            const d = easeOut(staggered(t, i, lines.length, 0.72));
            const x = lerp(xa, xb, d);
            pastLines[i]?.setAttribute('x2', String(px(x)));
            pastLines[i]?.setAttribute('y2', String(py(line.slope * x + line.intercept)));
          });
        });
      },

      async growBand(spec: BandSpec): Promise<void> {
        const fromSlope = lineShown ? activeSlope : spec.slope;
        const fromIntercept = lineShown ? activeIntercept : spec.intercept;
        const fromHalf = lineShown ? activeHalf : 0;
        const target = spec.thickness / 2;

        pickCaliperSpot(spec.slope, spec.intercept, spec.thickness);
        const label = barLabels.at(spec.row);
        if (label !== undefined) label.textContent = `m = ${formatSlope(spec.slope)}`;
        for (const ring of ringNodes) ring.setAttribute('opacity', '0');

        showLine(true);
        await animate(GROW_MS, (t) => {
          if (t < PHASE_FOLD) {
            // 앞서 재던 띠가 접힌다.
            renderBand(fromSlope, fromIntercept, fromHalf * (1 - t / PHASE_FOLD));
            return;
          }
          if (t < PHASE_TURN) {
            // 선이 다음 후보의 기울기로 돈다.
            const e = easeInOut((t - PHASE_FOLD) / (PHASE_TURN - PHASE_FOLD));
            renderBand(
              lerp(fromSlope, spec.slope, e),
              lerp(fromIntercept, spec.intercept, e),
              0,
            );
            return;
          }
          // 띠가 양쪽으로 밀려난다. 오른쪽 막대가 같은 값으로 자란다.
          const e = easeOut((t - PHASE_TURN) / (1 - PHASE_TURN));
          renderBand(spec.slope, spec.intercept, target * e);
          setBar(spec.row, spec.thickness * e, true);
        });

        // 닿았다 — 멈춘 자리를 점이 되받는다. 고리는 다음 후보가 시작될 때까지
        // 남아, 이 띠를 멈춘 것이 어느 점이었는지 읽을 시간을 준다.
        await animate(TOUCH_MS, (t) => {
          const e = easeOut(t);
          for (const i of spec.contacts) {
            const p = model.points.at(i);
            const ring = ringNodes.at(i);
            if (p === undefined || ring === undefined) continue;
            place(ring, {
              cx: px(p.x),
              cy: py(p.y),
              r: RING_R * lerp(1.7, 1, e),
              opacity: e,
            });
          }
        });
        setBar(spec.row, spec.thickness, spec.best);
      },

      async pivotLine(spec: { slope: number; intercept: number }): Promise<void> {
        const fromSlope = activeSlope;
        const fromIntercept = activeIntercept;
        const fromHalf = activeHalf;
        await animate(PIVOT_MS, (t) => {
          if (t < PHASE_FOLD) {
            renderBand(fromSlope, fromIntercept, fromHalf * (1 - t / PHASE_FOLD));
            return;
          }
          const e = easeInOut((t - PHASE_FOLD) / (1 - PHASE_FOLD));
          renderBand(lerp(fromSlope, spec.slope, e), lerp(fromIntercept, spec.intercept, e), 0);
        });
      },

      async lockContacts(spec: LockSpec): Promise<void> {
        // 닿은 점마다 중심선까지 수선을 내린다 — 넷 다 정확히 반 두께다.
        const norm = spec.slope * spec.slope + 1;
        const feet = spec.contacts.map((i) => {
          const p = model.points.at(i);
          if (p === undefined) return null;
          const f = (spec.slope * p.x - p.y + spec.intercept) / norm;
          return { p, fx: p.x - f * spec.slope, fy: p.y + f };
        });
        await animate(LOCK_MS, (t) => {
          spec.contacts.forEach((i, k) => {
            const foot = feet.at(k);
            const node = supportNodes.at(i);
            if (foot === undefined || foot === null || node === undefined) return;
            const e = easeOut(staggered(t, k, spec.contacts.length, 0.8));
            place(node, {
              x1: px(foot.p.x),
              y1: py(foot.p.y),
              x2: px(lerp(foot.p.x, foot.fx, e)),
              y2: py(lerp(foot.p.y, foot.fy, e)),
              opacity: clamp01(e * 2),
            });
          });
        });
      },

      async crownRow(row: number): Promise<void> {
        const bar = barNodes.at(row);
        const value = barValues.at(row);
        if (bar === undefined || value === undefined) return;
        place(bar, { stroke: c.text, 'stroke-width': 1.4 });
        value.setAttribute('fill', c.text);
        barNodes.forEach((other, i) => {
          if (i !== row) other.setAttribute('fill', hexToRgba(c.text, 0.16));
        });
        // 우승 길이를 가리키는 눈금선이 기록장을 타고 올라간다 — 나머지 막대가
        // 모두 그 선에 못 미치는 것이 한눈에 보인다.
        const x = BAR_X + Number(bar.getAttribute('width') ?? 0);
        const from = rowCenter(row) + BAR_H / 2;
        recordLine.setAttribute('opacity', '1');
        await animate(CROWN_MS, (t) => {
          const e = easeOut(t);
          place(recordLine, {
            x1: x,
            y1: from,
            x2: x,
            y2: lerp(from, ROWS_TOP - 4, e),
          });
        });
      },

      rewind(): void {
        caption.textContent = '';
        resetVisuals();
        model.points.forEach((p, i) => {
          const centre = groupCentre(p.group);
          setPointAt(i, centre.x, centre.y);
        });
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) unschedule(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };

    return instance;
  },
};
