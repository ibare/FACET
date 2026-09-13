/**
 * 쪼개서 번호로 — stage view.
 *
 * 동사는 **갈아탄다** 다. 토막은 값의 나열이 아니라 **평면 위의 점**이고, 그 점이
 * 대표 넷 중 가장 가까운 것으로 곡선을 그리며 옮겨 붙는다. 옮겨 붙고 나면 값이
 * 있던 칸은 비고 번호만 남는다.
 *
 * 화면은 둘로 나뉜다.
 *   왼쪽 원장  벡터 다섯이 줄로 서 있다. 값 칸 넷 · 번호 칸 둘 · 오차.
 *   오른쪽 평면 둘  앞 토막 자리와 뒤 토막 자리. 각 평면에 대표 넷이 놓여 있다.
 *
 * 원장의 값이 평면으로 날아가 점이 되고, 대표로 갈아탄 뒤, 번호가 되어 원장으로
 * 돌아온다. 잰 거리는 잰 그 자리(대표로 이어진 선) 곁에 남는다 (S-piece).
 *
 * 좌표는 전부 여기서 셈한다 — 선언에는 대표와 벡터의 값만 있다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';

const W = PIECE_CANVAS_W;
const H = 248;

// ── 가로 배치. 폭을 남기지 않고 원장과 평면 둘이 나눠 가진다 (S-piece).
const SIDE = 20;
const COL_GAP = 20;
const PLANE_GAP = 14;
const PLANE_MAX = 152;
const LEDGER_MIN = 236;
const INNER = W - SIDE * 2;
const PLANE_S = Math.min(PLANE_MAX, Math.floor((INNER - LEDGER_MIN - COL_GAP - PLANE_GAP) / 2));
const LEDGER_W = INNER - COL_GAP - PLANE_GAP - PLANE_S * 2;
const PLANE_X = [SIDE + LEDGER_W + COL_GAP, SIDE + LEDGER_W + COL_GAP + PLANE_S + PLANE_GAP];

// ── 세로 배치. 원장의 마지막 줄과 평면의 바닥이 같은 높이에서 끝난다.
const MARK_Y = 32;
const TOP = 40;
const ROW_H = 30;
const CELL_H = 21;
const CELL_DY = 4;
const BYTES_Y = 202;
const BYTES_LABEL_Y = 216;
const CAPTION_Y = 236;

// ── 원장 한 줄의 내부 칸. 값 넷 → 번호 둘 → 오차.
const CELL_GAP = 2;
const VALUE_SPAN = 136;
const CELL_W = Math.floor((VALUE_SPAN - CELL_GAP * 3) / 4);
const CELL_X = [0, 1, 2, 3].map((i) => SIDE + i * (CELL_W + CELL_GAP));
const VALUE_RIGHT = SIDE + VALUE_SPAN - CELL_GAP;
const CUT_X = CELL_X[1] + CELL_W + CELL_GAP / 2;
const BADGE_W = 23;
const BADGE_GAP = 5;
const ERROR_RIGHT = SIDE + LEDGER_W;
const BADGE_X = [ERROR_RIGHT - 46 - BADGE_W * 2 - BADGE_GAP, ERROR_RIGHT - 46 - BADGE_W];

/** 평면이 담는 값의 폭. 대표는 1~8 에 있으므로 0~9 면 가장자리에 숨이 남는다. */
const DOMAIN = 9;
const REP_R = 10;
const DOT_R = 5.5;
const PARK_R = 2.4;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

type Pt = { x: number; y: number };

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** 이차 베지에 위의 점. 갈아타는 궤적은 직선이 아니라 한 번 솟았다 내려앉는다. */
function quadAt(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  return lerp(lerp(p0, p1, t), lerp(p1, p2, t), t);
}

/** 이차 베지에의 앞부분(0..t)만 남긴 path. 궤적이 자라는 것을 그린다. */
function quadHead(p0: Pt, p1: Pt, p2: Pt, t: number): string {
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(a, b, t);
  return `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q ${a.x.toFixed(1)} ${a.y.toFixed(1)} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/** 구간 [from, to] 안에서의 진행도. 한 애니메이션 안에 여러 몸짓을 겹칠 때 쓴다. */
function phase(p: number, from: number, to: number): number {
  if (p <= from) return 0;
  if (p >= to) return 1;
  return (p - from) / (to - from);
}

function fmt2(n: number): string {
  return n.toFixed(2);
}

type Scene = {
  subDim: number;
  books: number[][][];
  vectors: number[][];
};

/**
 * 선언을 좁힌다. `mount` 가 받는 자리가 여기이고, 좁히는 규칙은 한 벌뿐이다
 * (S-piece). 모자라면 빈 무대로 떨어져 던지지 않는다.
 */
function readScene(raw: unknown): Scene {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const rows = (v: unknown): number[][] =>
    Array.isArray(v)
      ? v
          .filter((r): r is unknown[] => Array.isArray(r))
          .map((r) => r.filter((n): n is number => typeof n === 'number'))
      : [];
  const subDim = typeof d.subDim === 'number' && d.subDim > 0 ? d.subDim : 2;
  return {
    subDim,
    books: [rows(d.frontBook), rows(d.backBook)],
    vectors: rows(d.vectors),
  };
}

type RowNodes = {
  cells: SVGRectElement[];
  texts: SVGTextElement[];
  badges: SVGRectElement[];
  badgeTexts: SVGTextElement[];
  error: SVGTextElement;
};

export type SplitPayload = { row: number; front: number[]; back: number[] };
export type AssignPayload = {
  row: number;
  frontCode: number;
  backCode: number;
  frontDists: number[];
  backDists: number[];
  error: number;
};
export type SummaryPayload = { plainBytes: number; codeBytes: number };

export const splitAndNumberStageView: CanvasView = {
  canvas: { height: H },

  // 캔버스는 러너가 만들어 붙여 준 것을 받는다. 컨테이너는 건드리지 않는다 —
  // 비우면 그 캔버스가 떨어져 나간다 (S-view).
  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const svg = params.canvas;
    const scene = readScene(params.initialData);
    const codeColors = categorical(Math.max(1, scene.books[0]?.length ?? 4), 'vivid');

    const root = el('g');
    svg.appendChild(root);

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();

    /**
     * 되짚는 중인가. 러너가 `params` 로 흘린다 (`ViewMountParams.isInstant`).
     *
     * 참이면 진행률을 그리지 않고 끝 상태로 건너뛴다. 스크럽이 뒤로 갈 때 러너는
     * 목표까지의 발신을 한 묶음으로 몰아 먹이는데, 그때 걸음마다 tween 이 하나씩
     * 떠서 같은 요소에 서로 다른 값을 쓰면 화면이 엉킨다 — 되짚은 직후가 아니라
     * 1 초쯤 뒤에 무너지므로 눈으로도 늦게야 잡힌다.
     */
    const isInstant = params.isInstant ?? ((): boolean => false);
    // 되짚기 직전에 걸어 둔 것을 거둔다 (S-piece 의 destroy 규약과 같은 모양).
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    function animate(ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || isInstant()) {
          draw(1);
          return resolve();
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        let id = 0;
        const step = (): void => {
          frames.delete(id);
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          draw(easeInOut(p));
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(step);
          frames.add(id);
        };
        id = requestAnimationFrame(step);
        frames.add(id);
      });
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || isInstant()) return resolve();
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

    // ── 평면 좌표. 값을 픽셀로 옮긴다.
    const px = (plane: number, v: number): number =>
      (PLANE_X[plane] ?? 0) + (v / DOMAIN) * PLANE_S;
    const py = (v: number): number => TOP + PLANE_S - (v / DOMAIN) * PLANE_S;
    const repAt = (plane: number, code: number): Pt => {
      const p = scene.books[plane]?.[code] ?? [0, 0];
      return { x: px(plane, p[0] ?? 0), y: py(p[1] ?? 0) };
    };
    const subAt = (plane: number, sub: number[]): Pt => ({
      x: px(plane, sub[0] ?? 0),
      y: py(sub[1] ?? 0),
    });
    /** 원장에서 그 토막이 앉아 있던 자리. 점은 거기서 떠난다. */
    const originAt = (row: number, plane: number): Pt => {
      const first = plane * scene.subDim;
      const a = CELL_X[first] ?? SIDE;
      const b = CELL_X[first + 1] ?? a;
      return { x: (a + b + CELL_W) / 2, y: TOP + row * ROW_H + ROW_H / 2 };
    };

    // ── 정적인 무대 ────────────────────────────────────────────────────────
    const plane1Label = t('label.frontHalf', 'front half');
    const plane2Label = t('label.backHalf', 'back half');

    for (let plane = 0; plane < 2; plane += 1) {
      const x0 = PLANE_X[plane] ?? 0;
      const g = el('g');
      root.appendChild(g);

      g.appendChild(
        el('text', {
          x: x0 + PLANE_S / 2,
          y: MARK_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        }),
      ).textContent = plane === 0 ? plane1Label : plane2Label;

      g.appendChild(
        el('rect', {
          x: x0,
          y: TOP,
          width: PLANE_S,
          height: PLANE_S,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );

      // 눈금 — 값이 어디쯤인지 가늠하는 옅은 격자.
      for (let k = 1; k <= 3; k += 1) {
        const f = (k / 4) * PLANE_S;
        g.appendChild(
          el('path', {
            d: `M ${x0 + f} ${TOP} L ${x0 + f} ${TOP + PLANE_S}`,
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 4',
            fill: 'none',
          }),
        );
        g.appendChild(
          el('path', {
            d: `M ${x0} ${TOP + f} L ${x0 + PLANE_S} ${TOP + f}`,
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 4',
            fill: 'none',
          }),
        );
      }

      // 대표 넷. 번호가 곧 정체성이라 색을 번호에 맨다.
      const book = scene.books[plane] ?? [];
      for (let code = 0; code < book.length; code += 1) {
        const at = repAt(plane, code);
        g.appendChild(
          el('circle', {
            cx: at.x,
            cy: at.y,
            r: REP_R,
            fill: codeColors[code % codeColors.length] ?? c.itemDefault,
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        g.appendChild(
          el('text', {
            x: at.x,
            y: at.y + 3.5,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.stateInk,
          }),
        ).textContent = String(code);
      }
    }

    // 원장의 칸 이름. 소문자 한 단어짜리 도식 라벨이라 표식으로 둔다 (C10).
    const markCode = 'code';
    const markError = 'error';
    root.appendChild(
      el('text', {
        x: (BADGE_X[0] ?? 0) + BADGE_W + BADGE_GAP / 2,
        y: MARK_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      }),
    ).textContent = markCode;
    root.appendChild(
      el('text', {
        x: ERROR_RIGHT,
        y: MARK_Y,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      }),
    ).textContent = markError;

    const rowNodes: RowNodes[] = [];
    for (let row = 0; row < scene.vectors.length; row += 1) {
      const vector = scene.vectors[row] ?? [];
      const top = TOP + row * ROW_H;
      const g = el('g');
      root.appendChild(g);

      const cells: SVGRectElement[] = [];
      const texts: SVGTextElement[] = [];
      for (let i = 0; i < 4; i += 1) {
        const x = CELL_X[i] ?? SIDE;
        const rect = el('rect', {
          x,
          y: top + CELL_DY,
          width: CELL_W,
          height: CELL_H,
          rx: 4,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1,
        });
        g.appendChild(rect);
        const text = el('text', {
          x: x + CELL_W / 2,
          y: top + CELL_DY + CELL_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        text.textContent = String(vector[i] ?? '');
        g.appendChild(text);
        cells.push(rect);
        texts.push(text);
      }

      // 값에서 번호로 건너가는 자리. 글자가 아니라 꺾쇠로 둔다.
      g.appendChild(
        el('path', {
          d: `M ${VALUE_RIGHT + 4} ${top + ROW_H / 2 - 4} L ${VALUE_RIGHT + 9} ${top + ROW_H / 2} L ${VALUE_RIGHT + 4} ${top + ROW_H / 2 + 4}`,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1.4,
        }),
      );

      const badges: SVGRectElement[] = [];
      const badgeTexts: SVGTextElement[] = [];
      for (let i = 0; i < 2; i += 1) {
        const x = BADGE_X[i] ?? 0;
        const rect = el('rect', {
          x,
          y: top + CELL_DY,
          width: BADGE_W,
          height: CELL_H,
          rx: 4,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
        g.appendChild(rect);
        const text = el('text', {
          x: x + BADGE_W / 2,
          y: top + CELL_DY + CELL_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.stateInk,
        });
        g.appendChild(text);
        badges.push(rect);
        badgeTexts.push(text);
      }

      const error = el('text', {
        x: ERROR_RIGHT,
        y: top + CELL_DY + CELL_H / 2 + 4,
        'text-anchor': 'end',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      g.appendChild(error);

      rowNodes.push({ cells, texts, badges, badgeTexts, error });
    }

    const caption = el('text', {
      x: SIDE,
      y: CAPTION_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.text,
    });
    root.appendChild(caption);

    // ── 걸음마다 갈아 치우는 것들 ────────────────────────────────────────────
    let transient: SVGElement[] = [];
    let parked: SVGElement[] = [];
    let byteMarks: SVGElement[] = [];

    function keep(node: SVGElement): SVGElement {
      transient.push(node);
      root.appendChild(node);
      return node;
    }

    function clearTransient(): void {
      for (const n of transient) n.remove();
      transient = [];
    }

    function markActive(row: number, on: boolean): void {
      const nodes = rowNodes[row];
      if (!nodes) return;
      for (const cell of nodes.cells) {
        cell.setAttribute('stroke', on ? c.itemActive : c.border);
        cell.setAttribute('stroke-width', on ? '1.6' : '1');
      }
    }

    // ── 걸음 1. 쪼갠다 — 값이 평면 위의 점이 되어 날아간다.
    function splitRow(p: SplitPayload): Promise<void> {
      clearTransient();
      const nodes = rowNodes[p.row];
      if (!nodes) return Promise.resolve();
      markActive(p.row, true);

      const top = TOP + p.row * ROW_H;
      const cut = keep(
        el('path', {
          d: `M ${CUT_X} ${top + ROW_H / 2} L ${CUT_X} ${top + ROW_H / 2}`,
          stroke: c.itemActive,
          'stroke-width': 1.6,
          'stroke-dasharray': '3 3',
          fill: 'none',
        }),
      );

      const halves = [p.front, p.back];
      const dots: SVGCircleElement[] = [];
      const trails: SVGPathElement[] = [];
      const legs: { from: Pt; ctrl: Pt; to: Pt }[] = [];

      for (let plane = 0; plane < 2; plane += 1) {
        const from = originAt(p.row, plane);
        const to = subAt(plane, halves[plane] ?? []);
        const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 46 };
        legs.push({ from, ctrl, to });
        trails.push(
          keep(
            el('path', {
              d: `M ${from.x} ${from.y}`,
              stroke: c.itemActive,
              'stroke-width': 1.2,
              'stroke-dasharray': '3 4',
              fill: 'none',
              opacity: 0.55,
            }),
          ) as SVGPathElement,
        );
        dots.push(
          keep(
            el('circle', {
              cx: from.x,
              cy: from.y,
              r: 0,
              fill: c.itemActive,
              stroke: c.bg,
              'stroke-width': 1.5,
            }),
          ) as SVGCircleElement,
        );
      }

      return animate(420, (p2) => {
        const grow = phase(p2, 0, 0.28);
        cut.setAttribute(
          'd',
          `M ${CUT_X} ${top + ROW_H / 2 - (ROW_H / 2 - 1) * grow} L ${CUT_X} ${top + ROW_H / 2 + (ROW_H / 2 - 1) * grow}`,
        );
        const fly = phase(p2, 0.2, 1);
        for (let plane = 0; plane < 2; plane += 1) {
          const leg = legs[plane];
          const dot = dots[plane];
          const trail = trails[plane];
          if (!leg || !dot || !trail) continue;
          const at = quadAt(leg.from, leg.ctrl, leg.to, fly);
          dot.setAttribute('cx', at.x.toFixed(1));
          dot.setAttribute('cy', at.y.toFixed(1));
          dot.setAttribute('r', (DOT_R * Math.min(1, fly * 4)).toFixed(2));
          trail.setAttribute('d', quadHead(leg.from, leg.ctrl, leg.to, fly));
        }
      });
    }

    // ── 걸음 2. 갈아탄다 — 대표 넷까지 재고, 가장 가까운 것으로 옮겨 붙는다.
    async function assignRow(p: AssignPayload): Promise<void> {
      const nodes = rowNodes[p.row];
      if (!nodes) return;

      const halves = [
        { code: p.frontCode, dists: p.frontDists },
        { code: p.backCode, dists: p.backDists },
      ];
      const dots = transient.filter((n): n is SVGCircleElement => n.tagName === 'circle');
      const spokes: SVGPathElement[][] = [[], []];
      const froms: Pt[] = [];

      for (let plane = 0; plane < 2; plane += 1) {
        const dot = dots[plane];
        const from: Pt = {
          x: Number(dot?.getAttribute('cx') ?? 0),
          y: Number(dot?.getAttribute('cy') ?? 0),
        };
        froms.push(from);
        const book = scene.books[plane] ?? [];
        for (let code = 0; code < book.length; code += 1) {
          spokes[plane]?.push(
            keep(
              el('path', {
                d: `M ${from.x} ${from.y}`,
                stroke: c.textMuted,
                'stroke-width': 1,
                'stroke-dasharray': '2 3',
                fill: 'none',
                opacity: 0.75,
              }),
            ) as SVGPathElement,
          );
        }
      }

      // 재기 — 대표 넷까지 선을 뻗는다.
      await animate(260, (p2) => {
        for (let plane = 0; plane < 2; plane += 1) {
          const from = froms[plane];
          if (!from) continue;
          const book = scene.books[plane] ?? [];
          for (let code = 0; code < book.length; code += 1) {
            const to = repAt(plane, code);
            const at = lerp(from, to, p2);
            spokes[plane]?.[code]?.setAttribute(
              'd',
              `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} L ${at.x.toFixed(1)} ${at.y.toFixed(1)}`,
            );
          }
        }
      });

      // 고른 것만 남기고, 잰 거리를 그 선 곁에 적는다 (S-piece).
      const distLabels: SVGTextElement[] = [];
      for (let plane = 0; plane < 2; plane += 1) {
        const chosen = halves[plane]?.code ?? 0;
        const book = scene.books[plane] ?? [];
        for (let code = 0; code < book.length; code += 1) {
          const spoke = spokes[plane]?.[code];
          if (!spoke) continue;
          if (code === chosen) {
            spoke.setAttribute('stroke', c.itemActive);
            spoke.setAttribute('stroke-width', '1.8');
            spoke.setAttribute('stroke-dasharray', 'none');
          } else {
            spoke.setAttribute('opacity', '0.18');
          }
        }
        const label = keep(
          el('text', {
            x: froms[plane]?.x ?? 0,
            y: froms[plane]?.y ?? 0,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.text,
          }),
        ) as SVGTextElement;
        label.textContent = fmt2(halves[plane]?.dists[halves[plane]?.code ?? 0] ?? 0);
        distLabels.push(label);
      }

      // 갈아타기 — 점이 곡선을 그리며 대표 위로 옮겨 붙는다.
      const hops: { from: Pt; ctrl: Pt; to: Pt }[] = [];
      for (let plane = 0; plane < 2; plane += 1) {
        const from = froms[plane] ?? { x: 0, y: 0 };
        const to = repAt(plane, halves[plane]?.code ?? 0);
        const mid = lerp(from, to, 0.5);
        const nx = -(to.y - from.y);
        const ny = to.x - from.x;
        const len = Math.hypot(nx, ny) || 1;
        hops.push({ from, ctrl: { x: mid.x + (nx / len) * 16, y: mid.y + (ny / len) * 16 }, to });
      }

      await animate(400, (p2) => {
        for (let plane = 0; plane < 2; plane += 1) {
          const hop = hops[plane];
          const dot = dots[plane];
          if (!hop || !dot) continue;
          const at = quadAt(hop.from, hop.ctrl, hop.to, p2);
          dot.setAttribute('cx', at.x.toFixed(1));
          dot.setAttribute('cy', at.y.toFixed(1));
          const label = distLabels[plane];
          const anchor = quadAt(hop.from, hop.ctrl, hop.to, 0.5);
          label?.setAttribute('x', (anchor.x + 14).toFixed(1));
          label?.setAttribute('y', (anchor.y - 8).toFixed(1));
        }
      });

      // 번호만 남기기 — 값 칸이 비고 번호 칸이 찬다.
      for (let plane = 0; plane < 2; plane += 1) {
        const at = repAt(plane, halves[plane]?.code ?? 0);
        const angle = (-70 + p.row * 26) * (Math.PI / 180);
        const park = el('circle', {
          cx: at.x + Math.cos(angle) * (REP_R + 5),
          cy: at.y + Math.sin(angle) * (REP_R + 5),
          r: PARK_R,
          fill: c.textMuted,
        });
        root.appendChild(park);
        parked.push(park);
      }

      await animate(180, (p2) => {
        for (let i = 0; i < 4; i += 1) {
          const cell = nodes.cells[i];
          const text = nodes.texts[i];
          if (!cell || !text) continue;
          cell.setAttribute('fill-opacity', String(1 - p2));
          cell.setAttribute('stroke-dasharray', '3 3');
          text.setAttribute('opacity', String(1 - p2));
        }
        for (let plane = 0; plane < 2; plane += 1) {
          const badge = nodes.badges[plane];
          const badgeText = nodes.badgeTexts[plane];
          const dot = dots[plane];
          if (!badge || !badgeText) continue;
          badge.setAttribute('fill', codeColors[(halves[plane]?.code ?? 0) % codeColors.length] ?? c.itemDefault);
          badge.setAttribute('fill-opacity', String(p2));
          badge.setAttribute('stroke-dasharray', p2 > 0.5 ? 'none' : '3 3');
          badgeText.textContent = String(halves[plane]?.code ?? 0);
          badgeText.setAttribute('opacity', String(p2));
          dot?.setAttribute('r', (DOT_R * (1 - p2) + PARK_R * p2).toFixed(2));
        }
        nodes.error.textContent = fmt2(p.error);
        nodes.error.setAttribute('opacity', String(p2));
      });

      markActive(p.row, false);
    }

    // ── 마지막 걸음. 값의 자리와 번호의 자리를 견준다.
    async function showSummary(p: SummaryPayload): Promise<void> {
      clearTransient();
      const bracket = (x0: number, x1: number, label: string): {
        path: SVGPathElement;
        text: SVGTextElement;
      } => {
        const path = el('path', {
          d: `M ${x0} ${BYTES_Y} L ${x0} ${BYTES_Y}`,
          stroke: c.text,
          'stroke-width': 1.4,
          fill: 'none',
        });
        root.appendChild(path);
        const text = el('text', {
          x: (x0 + x1) / 2,
          y: BYTES_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.text,
          opacity: 0,
        });
        text.textContent = label;
        root.appendChild(text);
        byteMarks.push(path, text);
        return { path, text };
      };

      const plain = bracket(SIDE, VALUE_RIGHT, t('label.bytes', '{n} bytes', { n: p.plainBytes }));
      const code = bracket(
        BADGE_X[0] ?? 0,
        (BADGE_X[1] ?? 0) + BADGE_W,
        t('label.bytes', '{n} bytes', { n: p.codeBytes }),
      );

      await animate(320, (p2) => {
        const draw = (
          node: { path: SVGPathElement; text: SVGTextElement },
          x0: number,
          x1: number,
        ): void => {
          const w = (x1 - x0) * p2;
          node.path.setAttribute(
            'd',
            `M ${x0} ${BYTES_Y + 5} L ${x0} ${BYTES_Y} L ${(x0 + w).toFixed(1)} ${BYTES_Y} L ${(x0 + w).toFixed(1)} ${BYTES_Y + 5}`,
          );
          node.text.setAttribute('opacity', String(p2));
        };
        draw(plain, SIDE, VALUE_RIGHT);
        draw(code, BADGE_X[0] ?? 0, (BADGE_X[1] ?? 0) + BADGE_W);
      });
      await wait(60);
    }

    // ── 처음으로 되감는다.
    function rewind(): void {
      clearTransient();
      for (const n of parked) n.remove();
      parked = [];
      for (const n of byteMarks) n.remove();
      byteMarks = [];
      for (let row = 0; row < rowNodes.length; row += 1) {
        const nodes = rowNodes[row];
        const vector = scene.vectors[row] ?? [];
        if (!nodes) continue;
        markActive(row, false);
        for (let i = 0; i < 4; i += 1) {
          nodes.cells[i]?.setAttribute('fill-opacity', '1');
          nodes.cells[i]?.setAttribute('stroke-dasharray', 'none');
          const text = nodes.texts[i];
          if (!text) continue;
          text.setAttribute('opacity', '1');
          text.textContent = String(vector[i] ?? '');
        }
        for (let i = 0; i < 2; i += 1) {
          nodes.badges[i]?.setAttribute('fill', 'none');
          nodes.badges[i]?.setAttribute('fill-opacity', '1');
          nodes.badges[i]?.setAttribute('stroke-dasharray', '3 3');
          const badgeText = nodes.badgeTexts[i];
          if (badgeText) badgeText.textContent = '';
        }
        nodes.error.textContent = '';
      }
    }

    function setCaption(text: string): void {
      caption.textContent = text;
    }

    return {
      splitRow,
      assignRow,
      showSummary,
      rewind,
      setCaption,

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
