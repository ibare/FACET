/**
 * pca-stage — PCA 완제품의 전용 시각화. 단일 SVG 캔버스 한 폭.
 *
 * 네 자리로 나뉜다.
 *
 *   왼쪽      산점도. **등방(isotropic) 축척**이라 화면의 각도가 곧 참 각도다.
 *             가로세로를 각각 상자에 맞춰 늘이면 −2.98° 가 −45° 처럼 보이므로
 *             이 완제품의 주장이 통째로 무너진다. 그래서 한 축척으로 그리고,
 *             원래 단위에서는 점들이 납작한 띠가 되는 것을 그대로 보인다.
 *   그 아래    두 축의 퍼짐(표준편차) 자. 가로 자와 세로 자의 **길이 차이**가
 *             16 배라는 것을 눈으로 잰다. 표준화하면 둘이 같아진다.
 *   오른쪽 위  거듭제곱 반복 다이얼. 곱하는 것(공분산 셋)과 곱해지는 것(지금
 *             벡터)을 나란히 두고, 단위원 위에 지나온 벡터의 부챗살을 남긴다.
 *             한 걸음에 멎는 것과 네 걸음 걸리는 것이 살의 수로 보인다.
 *   아래       두 틀이 낸 답을 나란히 쌓는 원장. 앞서 본 값을 지우지 않는다 —
 *             지우면 견줌이 안 된다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 캔버스 크기는 상수 하나로 고정이고
 * 걸음이 늘어도 자취 표가 마지막 다섯 줄만 보인다.
 *
 * 색은 전부 design-tokens 경유다 (S-view 결정 트리).
 *   축·발자국   accent        — 답을 가리키는 단일 강조
 *   곱한 방향   itemComparing — 알고리즘의 중간 상태
 *   지나온 자취 ghostOutline  — 유령
 *   멎은 표시   itemSorted    — 확정된 상태
 *   두 자      categorical(2) — x 와 y 라는 두 카테고리
 *
 * 화면 문자는 `params.t` 로만 조회한다 (C10). 수식 표기 (`σx = 25.99`,
 * `-2.98°`, `|S·v| = 675.94`) 는 표식이라 키를 만들지 않는다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type Palette,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 760;
const CANVAS_H = 448;

const PLOT = { x0: 64, y0: 46, x1: 442, y1: 300 };
const DIAL = { x0: 458, y0: 46, x1: 746, y1: 240, cx: 528, cy: 142, r: 58, textX: 612 };
const TRACE = { x0: 458, y0: 250, x1: 746, y1: 348 };
const LEDGER = { x0: 64, y0: 358, x1: 746, y1: 438 };
const TRACE_ROWS = 5;

/** x 와 y — 두 카테고리. 자의 색은 틀이 바뀌어도 그대로라 짝이 유지된다. */
const SIGMA_HUES = categorical(2, 'vivid');

export type PcaFrame = {
  standardized: boolean;
  xs: number[];
  ys: number[];
  cx: number;
  cy: number;
};

export type PcaCovariance = {
  sxx: number;
  sxy: number;
  syy: number;
  sdX: number;
  sdY: number;
  sdRatio: number;
};

export type PcaStretch = { step: number; wx: number; wy: number; wLen: number };
export type PcaVector = { step: number; vx: number; vy: number; angleDeg: number };
export type PcaTurn = { step: number; turn: number; converged: boolean };
export type PcaAxis = {
  axisIndex: number;
  ax: number;
  ay: number;
  angleDeg: number;
  share: number;
  t: number[];
};
export type PcaLedgerRow = {
  standardized: boolean;
  angleDeg: number;
  share: number;
  steps: number;
};

type TraceRow = { step: number; angleDeg: number; turn: number; settled: boolean };

type Box = { x0: number; y0: number; x1: number; y1: number };

function svg<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function textNode(
  content: string,
  x: number,
  y: number,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = svg('text', { x, y, ...attrs });
  node.textContent = content;
  return node;
}

/** 상자 안에 남는 직선 구간. 없으면 null (Liang-Barsky). */
function clipLine(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  box: Box,
): [number, number, number, number] | null {
  let t0 = -1e9;
  let t1 = 1e9;
  const p = [-dx, dx, -dy, dy];
  const q = [cx - box.x0, box.x1 - cx, cy - box.y0, box.y1 - cy];
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [cx + t0 * dx, cy + t0 * dy, cx + t1 * dx, cy + t1 * dy];
}

function deg(value: number): string {
  return `${value.toFixed(2)}°`;
}

function pct(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** 아주 작은 수는 지수로 적는다 — 0.0000 이 늘어서면 멎었다는 것이 안 보인다. */
function small(value: number): string {
  if (value === 0) return '0';
  return value < 0.001 ? value.toExponential(2) : value.toFixed(4);
}

export const pcaStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;
    canvas.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);

    const root = svg('g', {});
    canvas.appendChild(root);

    // ── 상태. 이벤트가 여기 쌓이고 render() 가 통째로 다시 그린다.
    let frame: PcaFrame | null = null;
    let cov: PcaCovariance | null = null;
    let stretch: PcaStretch | null = null;
    let vector: PcaVector | null = null;
    let turn: PcaTurn | null = null;
    let axis: PcaAxis | null = null;
    let trace: TraceRow[] = [];
    /** 지나온 단위 벡터들 — 부챗살로 남는다. */
    let fan: Array<{ vx: number; vy: number }> = [];
    /** 두 틀의 답. 지우지 않고 갈아 끼운다. */
    const ledger = new Map<string, PcaLedgerRow>();

    // 마운트 순간에도 빈 상자가 아니라 점들이 보여야 한다. 알고리즘의 첫 발신이
    // 곧 이 자리를 덮는다.
    // 열린 타입이라 단언 뒤에 원소마다 다시 본다 (C9) — 자료는 저작자가 쓰는
    // 선언에서 오므로 좌표가 아닌 것이 섞여 들어올 수 있다.
    const seed = params.initialData as { points?: unknown } | undefined;
    const seedPoints: Array<{ x: number; y: number }> = [];
    if (Array.isArray(seed?.points)) {
      for (const raw of seed.points) {
        if (typeof raw !== 'object' || raw === null) continue;
        const p = raw as { x?: unknown; y?: unknown };
        if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
        seedPoints.push({ x: p.x, y: p.y });
      }
    }
    let seedFrame: PcaFrame | null = null;
    if (seedPoints.length > 0) {
      const xs = seedPoints.map((p) => p.x);
      const ys = seedPoints.map((p) => p.y);
      seedFrame = {
        standardized: false,
        xs,
        ys,
        cx: xs.reduce((a, b) => a + b, 0) / xs.length,
        cy: ys.reduce((a, b) => a + b, 0) / ys.length,
      };
      frame = seedFrame;
    }

    const frameName = (std: boolean): string =>
      std ? tr('label.frameStd', 'Standardized') : tr('label.frameRaw', 'Original units');

    // ── 자료 좌표 → 화면 좌표. 한 축척(등방)이라 각도가 참값이다.
    function mapper(f: PcaFrame): { px(x: number): number; py(y: number): number } {
      const xs = f.xs.length > 0 ? f.xs : [0];
      const ys = f.ys.length > 0 ? f.ys : [0];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const spanX = Math.max(maxX - minX, 1e-9);
      const spanY = Math.max(maxY - minY, 1e-9);
      const scale = Math.min(
        (PLOT.x1 - PLOT.x0) / (spanX * 1.3),
        (PLOT.y1 - PLOT.y0) / (spanY * 1.3),
      );
      const ox = (minX + maxX) / 2;
      const oy = (minY + maxY) / 2;
      const mx = (PLOT.x0 + PLOT.x1) / 2;
      const my = (PLOT.y0 + PLOT.y1) / 2;
      return {
        px: (x: number) => mx + (x - ox) * scale,
        py: (y: number) => my - (y - oy) * scale,
      };
    }

    function panel(box: Box): SVGRectElement {
      return svg('rect', {
        x: box.x0,
        y: box.y0,
        width: box.x1 - box.x0,
        height: box.y1 - box.y0,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      });
    }

    function caption(content: string, x: number, y: number, anchor = 'start'): SVGTextElement {
      return textNode(content, x, y, {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'text-anchor': anchor,
        fill: colors.textMuted,
      });
    }

    function figure(
      content: string,
      x: number,
      y: number,
      anchor = 'start',
      fill = colors.text,
    ): SVGTextElement {
      return textNode(content, x, y, {
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        'text-anchor': anchor,
        fill,
      });
    }

    function arrowHead(
      tipX: number,
      tipY: number,
      ux: number,
      uy: number,
      fill: string,
    ): SVGPolygonElement {
      const nx = -uy;
      const ny = ux;
      const bx = tipX - ux * 10;
      const by = tipY - uy * 10;
      return svg('polygon', {
        points: `${tipX},${tipY} ${bx + nx * 4},${by + ny * 4} ${bx - nx * 4},${by - ny * 4}`,
        fill,
      });
    }

    // ── 산점도와 두 자
    function drawPlot(g: SVGGElement): void {
      g.appendChild(panel(PLOT));
      if (!frame) return;
      const m = mapper(frame);
      const cx = m.px(frame.cx);
      const cy = m.py(frame.cy);

      g.appendChild(caption(frameName(frame.standardized), PLOT.x0, 36));

      if (axis) {
        const line = clipLine(cx, cy, axis.ax, -axis.ay, PLOT);
        if (line) {
          g.appendChild(
            svg('line', {
              x1: line[0],
              y1: line[1],
              x2: line[2],
              y2: line[3],
              stroke: colors.accent,
              'stroke-width': 2.2,
            }),
          );
        }
        for (let i = 0; i < frame.xs.length && i < axis.t.length; i += 1) {
          const fx = m.px(frame.cx + axis.t[i] * axis.ax);
          const fy = m.py(frame.cy + axis.t[i] * axis.ay);
          g.appendChild(
            svg('line', {
              x1: m.px(frame.xs[i]),
              y1: m.py(frame.ys[i]),
              x2: fx,
              y2: fy,
              stroke: colors.ghostOutline,
              'stroke-width': 1,
              'stroke-dasharray': '2 2',
            }),
          );
          g.appendChild(
            svg('rect', { x: fx - 2.5, y: fy - 2.5, width: 5, height: 5, fill: colors.accent }),
          );
        }
      }

      for (let i = 0; i < frame.xs.length; i += 1) {
        g.appendChild(
          svg('circle', {
            cx: m.px(frame.xs[i]),
            cy: m.py(frame.ys[i]),
            r: 3.6,
            fill: colors.itemDefault,
            stroke: colors.text,
            'stroke-width': 1.3,
          }),
        );
      }

      if (cov) {
        g.appendChild(
          svg('circle', { cx, cy, r: 4, fill: 'none', stroke: colors.auxCursor, 'stroke-width': 1.4 }),
        );
        g.appendChild(svg('circle', { cx, cy, r: 1.3, fill: colors.auxCursor }));
      }

      if (axis) {
        const name =
          axis.axisIndex === 2
            ? tr('label.axis2', '2nd principal axis')
            : tr('label.axis1', '1st principal axis');
        g.appendChild(caption(name, PLOT.x1 - 8, PLOT.y0 + 18, 'end'));
        g.appendChild(
          figure(`${deg(axis.angleDeg)} · ${pct(axis.share)}`, PLOT.x1 - 8, PLOT.y0 + 34, 'end'),
        );
      }

      if (!cov) return;

      // 두 축의 퍼짐 자. 이 두 자의 길이 차이가 이 완제품의 주장이다.
      const unitX = m.px(frame.cx + 1) - cx;
      const unitY = cy - m.py(frame.cy + 1);
      const halfX = cov.sdX * unitX;
      const halfY = cov.sdY * unitY;

      const rulerY = PLOT.y1 + 12;
      g.appendChild(
        svg('line', {
          x1: cx - halfX,
          y1: rulerY,
          x2: cx + halfX,
          y2: rulerY,
          stroke: SIGMA_HUES[0],
          'stroke-width': 3,
        }),
      );
      for (const end of [cx - halfX, cx + halfX]) {
        g.appendChild(
          svg('line', {
            x1: end,
            y1: rulerY - 4,
            x2: end,
            y2: rulerY + 4,
            stroke: SIGMA_HUES[0],
            'stroke-width': 2,
          }),
        );
      }
      g.appendChild(
        figure(`σx = ${cov.sdX.toFixed(2)}`, cx + halfX + 8, rulerY + 4, 'start', SIGMA_HUES[0]),
      );

      const rulerX = PLOT.x0 - 14;
      g.appendChild(
        svg('line', {
          x1: rulerX,
          y1: cy - halfY,
          x2: rulerX,
          y2: cy + halfY,
          stroke: SIGMA_HUES[1],
          'stroke-width': 3,
        }),
      );
      for (const end of [cy - halfY, cy + halfY]) {
        g.appendChild(
          svg('line', {
            x1: rulerX - 4,
            y1: end,
            x2: rulerX + 4,
            y2: end,
            stroke: SIGMA_HUES[1],
            'stroke-width': 2,
          }),
        );
      }
      g.appendChild(
        figure(`σy = ${cov.sdY.toFixed(2)}`, 8, cy - halfY - 9, 'start', SIGMA_HUES[1]),
      );

      g.appendChild(
        caption(
          tr('label.spreadRatio', 'The spread in x is {n} times the spread in y.', {
            n: cov.sdRatio.toFixed(2),
          }),
          PLOT.x0,
          PLOT.y1 + 36,
        ),
      );
    }

    // ── 거듭제곱 반복 다이얼
    function drawDial(g: SVGGElement): void {
      g.appendChild(panel(DIAL));
      g.appendChild(caption(tr('label.dial', 'Power iteration'), DIAL.x0, 36));
      g.appendChild(
        svg('circle', {
          cx: DIAL.cx,
          cy: DIAL.cy,
          r: DIAL.r,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      g.appendChild(
        svg('line', {
          x1: DIAL.cx - DIAL.r,
          y1: DIAL.cy,
          x2: DIAL.cx + DIAL.r,
          y2: DIAL.cy,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        }),
      );
      g.appendChild(
        svg('line', {
          x1: DIAL.cx,
          y1: DIAL.cy - DIAL.r,
          x2: DIAL.cx,
          y2: DIAL.cy + DIAL.r,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        }),
      );

      for (const past of fan) {
        g.appendChild(
          svg('line', {
            x1: DIAL.cx,
            y1: DIAL.cy,
            x2: DIAL.cx + past.vx * DIAL.r,
            y2: DIAL.cy - past.vy * DIAL.r,
            stroke: colors.ghostOutline,
            'stroke-width': 1,
          }),
        );
      }

      if (stretch && stretch.wLen > 0) {
        const ux = stretch.wx / stretch.wLen;
        const uy = -stretch.wy / stretch.wLen;
        const reach = DIAL.r * 1.22;
        g.appendChild(
          svg('line', {
            x1: DIAL.cx,
            y1: DIAL.cy,
            x2: DIAL.cx + ux * reach,
            y2: DIAL.cy + uy * reach,
            stroke: colors.itemComparing,
            'stroke-width': 1.6,
            'stroke-dasharray': '4 3',
          }),
        );
        g.appendChild(
          arrowHead(DIAL.cx + ux * reach, DIAL.cy + uy * reach, ux, uy, colors.itemComparing),
        );
      }

      if (vector) {
        const ux = vector.vx;
        const uy = -vector.vy;
        const tipX = DIAL.cx + ux * DIAL.r;
        const tipY = DIAL.cy + uy * DIAL.r;
        const ink = turn?.converged === true ? colors.itemSorted : colors.accent;
        g.appendChild(
          svg('line', { x1: DIAL.cx, y1: DIAL.cy, x2: tipX, y2: tipY, stroke: ink, 'stroke-width': 2.4 }),
        );
        g.appendChild(arrowHead(tipX, tipY, ux, uy, ink));
      }

      // 곱하는 것과 곱해지는 것을 나란히. 이 여섯 줄이 "무엇을 곱하고 있는가" 다.
      const lines: Array<[string, string]> = [];
      if (cov) {
        lines.push([`sxx ${cov.sxx.toFixed(4)}`, colors.text]);
        lines.push([`sxy ${cov.sxy.toFixed(4)}`, colors.text]);
        lines.push([`syy ${cov.syy.toFixed(4)}`, colors.text]);
      }
      if (stretch) lines.push([`|S·v| = ${stretch.wLen.toFixed(2)}`, colors.itemComparing]);
      if (vector) {
        lines.push([`vx ${vector.vx.toFixed(4)}`, colors.accent]);
        lines.push([`vy ${vector.vy.toFixed(4)}`, colors.accent]);
      }
      const top = DIAL.cy - ((lines.length - 1) * 16) / 2;
      lines.forEach(([line, ink], i) => {
        g.appendChild(figure(line, DIAL.textX, top + i * 16, 'start', ink));
      });
    }

    // ── 걸음 자취
    function drawTrace(g: SVGGElement): void {
      g.appendChild(panel(TRACE));
      const headY = TRACE.y0 + 18;
      g.appendChild(caption(tr('label.colStep', 'Step'), TRACE.x0 + 12, headY));
      g.appendChild(caption(tr('label.colAngle', 'Angle'), TRACE.x0 + 62, headY));
      g.appendChild(caption(tr('label.colTurn', 'Turn'), TRACE.x0 + 152, headY));
      trace.slice(-TRACE_ROWS).forEach((row, i) => {
        const y = TRACE.y0 + 36 + i * 14;
        const ink = row.settled ? colors.itemSorted : colors.text;
        g.appendChild(figure(String(row.step), TRACE.x0 + 12, y, 'start', ink));
        g.appendChild(figure(deg(row.angleDeg), TRACE.x0 + 62, y, 'start', ink));
        g.appendChild(figure(small(row.turn), TRACE.x0 + 152, y, 'start', ink));
        if (row.settled) {
          g.appendChild(
            figure(tr('label.settled', 'settled'), TRACE.x1 - 12, y, 'end', colors.itemSorted),
          );
        }
      });
    }

    // ── 두 틀이 낸 답
    function drawLedger(g: SVGGElement): void {
      g.appendChild(panel(LEDGER));
      g.appendChild(
        caption(tr('label.ledger', 'What each frame answers'), LEDGER.x0 + 14, LEDGER.y0 + 18),
      );
      const colFrame = LEDGER.x0 + 14;
      const colAngle = LEDGER.x0 + 190;
      const colShare = LEDGER.x0 + 292;
      const colSteps = LEDGER.x0 + 394;
      const headY = LEDGER.y0 + 38;
      g.appendChild(caption(tr('label.colFrame', 'Frame'), colFrame, headY));
      g.appendChild(caption(tr('label.colAngle', 'Angle'), colAngle, headY));
      g.appendChild(caption(tr('label.colShare', 'Share'), colShare, headY));
      g.appendChild(caption(tr('label.colSteps', 'Moving steps'), colSteps, headY));

      ['raw', 'std'].forEach((key, i) => {
        const y = LEDGER.y0 + 56 + i * 18;
        const row = ledger.get(key);
        if (frame !== null && frame.standardized === (key === 'std')) {
          g.appendChild(
            svg('rect', { x: LEDGER.x0 + 6, y: y - 11, width: 4, height: 14, fill: colors.accent }),
          );
        }
        const ink = row ? colors.text : colors.textMuted;
        // 틀 이름은 수가 아니라 말이다 — 본문 서체로 둔다.
        g.appendChild(
          textNode(frameName(key === 'std'), colFrame, y, {
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: ink,
          }),
        );
        g.appendChild(figure(row ? deg(row.angleDeg) : '—', colAngle, y, 'start', ink));
        g.appendChild(figure(row ? pct(row.share) : '—', colShare, y, 'start', ink));
        g.appendChild(figure(row ? String(row.steps) : '—', colSteps, y, 'start', ink));
      });

      const raw = ledger.get('raw');
      const std = ledger.get('std');
      if (raw && std) {
        const delta = Math.abs(raw.angleDeg - std.angleDeg);
        g.appendChild(
          textNode(`Δ ${deg(delta)}`, LEDGER.x1 - 14, LEDGER.y0 + 44, {
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            'text-anchor': 'end',
            fill: colors.accent,
          }),
        );
        g.appendChild(
          caption(
            tr('label.deltaNote', 'Same twelve points — the axis turns {n} degrees.', {
              n: delta.toFixed(2),
            }),
            LEDGER.x1 - 14,
            LEDGER.y0 + 64,
            'end',
          ),
        );
      }
    }

    function render(): void {
      root.textContent = '';
      const g = svg('g', {});
      drawPlot(g);
      drawDial(g);
      drawTrace(g);
      drawLedger(g);
      root.appendChild(g);
    }

    render();

    return {
      destroy() {
        // 타이머도 프레임 루프도 없다 — 이 view 는 발신을 받을 때만 다시 그린다.
        root.remove();
      },
      setFrame(next: PcaFrame) {
        frame = next;
        cov = null;
        stretch = null;
        vector = null;
        turn = null;
        axis = null;
        trace = [];
        fan = [];
        render();
      },
      setCovariance(next: PcaCovariance) {
        cov = next;
        render();
      },
      setStretch(next: PcaStretch) {
        stretch = next;
        render();
      },
      setVector(next: PcaVector) {
        if (vector) fan = [...fan, { vx: vector.vx, vy: vector.vy }];
        vector = next;
        turn = null;
        render();
      },
      setTurn(next: PcaTurn) {
        turn = next;
        if (vector) {
          trace = [
            ...trace,
            { step: next.step, angleDeg: vector.angleDeg, turn: next.turn, settled: next.converged },
          ];
        }
        render();
      },
      setAxis(next: PcaAxis) {
        axis = next;
        render();
      },
      addLedgerRow(next: PcaLedgerRow) {
        ledger.set(next.standardized ? 'std' : 'raw', next);
        render();
      },
      reset() {
        // 되감기는 처음 자리로 돌린다 — 알고리즘이 다시 발신할 때까지 표준화한
        // 틀이 남아 있으면 손잡이(이미 '그대로' 로 돌아간)와 화면이 어긋난다.
        frame = seedFrame;
        cov = null;
        stretch = null;
        vector = null;
        turn = null;
        axis = null;
        trace = [];
        fan = [];
        ledger.clear();
        render();
      },
    };
  },
};
