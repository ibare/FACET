/**
 * 잔차 조각의 그림.
 *
 * 무대는 산점도지만 주인공은 **세로로 내려꽂히는 막대** 다. 축과 점은 그 동사가
 * 일어나는 자리일 뿐이므로 옅게 그리고, 막대만 굵고 진하게 간다.
 *
 * 대비를 세우는 장치가 둘이다.
 *  - 최단거리는 **점을 중심으로 자라는 원이 직선에 닿는 순간** 으로 보인다. 접점이
 *    수선의 발이고, 직각 표시가 그것을 못박는다.
 *  - 세로 막대는 그 원을 **뚫고 나가** 직선에 닿는다. 더 길다는 것이 눈에 보인다.
 *
 * 기각한 후보(원 · 수선)는 옅은 유령으로 남긴다. 지워 버리면 대비도 함께 사라진다.
 *
 * 좌표는 전부 여기서 셈한다 (S-piece). 선언에는 구조(계수 · 점)만 있다.
 * 세로 축척은 **직선의 시각 기울기** 를 지키려고 잡은 것이다 — 그림을 눕히면
 * 수선과 세로가 같은 방향으로 보여 조각의 주장 자체가 사라진다. 그래서 세로가
 * 이 조각에서 넉넉하다.
 *
 * 화면의 문자는 세 갈래인데 셋 다 번역 대상이 아니다 — 눈금 수 · 직선의 수식 ·
 * 잔차 값은 수식 표기(표식)이고, 캡션은 projector 가 해석해 문자열로 넘긴다 (C10).
 * 그래서 이 view 는 translator 를 받지 않는다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-view). */
const CANVAS_H = 380;

/** 그림틀. 왼쪽은 y 눈금 글자 자리, 아래는 x 눈금과 캡션 자리다. */
const PLOT_TOP = 20;
const PLOT_BOTTOM = 330;
const GUTTER_LEFT = 56;
/** 오른쪽에 남기는 폭 — 맨 오른쪽 점의 잔차 값이 여기 적힌다. 상한이 아니라 글자 자리다. */
const GUTTER_RIGHT = 40;
const XTICK_BASELINE = 348;
const CAPTION_BASELINE = 370;

/** 축척 여유. x 는 넉넉히, y 는 빠듯하게 — 직선을 눕히지 않으려는 것이다. */
const X_PAD_RATIO = 0.2;
const Y_PAD_RATIO = 0.08;

const POINT_R = 5;
const RING_R = 12;
const BAR_W = 5;
const DART = 6;
const RIGHT_ANGLE = 8;
const SWEEP_R = 26;

const RING_MS = 260;
const RING_MOVE_MS = 180;
const PROBE_MS = 420;
const TURN_MS = 560;
const DROP_MS = 420;
const LAND_MS = 130;
const DONE_MS = 340;

type Pt = { x: number; y: number };
type Scene = { slope: number; intercept: number; points: Pt[] };

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t;
const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

/** 눈금 간격 — 대여섯 칸이 되게 1 / 2 / 5 계열에서 고른다. */
function niceStep(span: number): number {
  const raw = span / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n >= 4.5 ? 5 : n >= 1.8 ? 2 : 1) * mag;
}

function tickText(v: number, step: number): string {
  return step < 1 ? v.toFixed(1) : String(Math.round(v));
}

/** 부호를 앞에 세운 잔차 표기. 음수는 하이픈이 아니라 뺄셈 기호를 쓴다. */
function signedText(v: number): string {
  return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}`;
}

/** `y = 1.5x + 1` 꼴의 수식 표기. 절편이 음수면 부호를 갈아 끼운다. */
function equationText(slope: number, intercept: number): string {
  const sign = intercept < 0 ? '−' : '+';
  return `y = ${slope}x ${sign} ${Math.abs(intercept)}`;
}

export const residualDistanceStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const c = getColors(params.theme);
    const svg = params.canvas;

    // 부호는 두 갈래를 가르는 식별색이다 — 상태 어휘에 "선 위 / 선 아래" 가 없으므로
    // categorical 두 칸을 쓴다 (S-view 결정 트리 3번). 따뜻한 쪽이 위, 찬 쪽이 아래.
    const signColors = categorical(2, 'vivid');
    const ABOVE = signColors[0];
    const BELOW = signColors[1];

    const viewBox = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    const W = Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : PIECE_CANVAS_W;

    const plotL = GUTTER_LEFT;
    const plotR = W - GUTTER_RIGHT;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      return node;
    }

    function textNode(attrs: Record<string, string | number>, content: string): SVGTextElement {
      const node = el('text', { 'font-family': fonts.mono, ...attrs });
      node.textContent = content;
      return node;
    }

    // 층 — 뒤에서 앞으로. 점은 막대 위에 놓여야 가려지지 않는다.
    const gridLayer = el('g', {});
    const lineLayer = el('g', {});
    const ghostLayer = el('g', {});
    const barLayer = el('g', {});
    const pointLayer = el('g', {});
    const ringLayer = el('g', {});
    for (const g of [gridLayer, lineLayer, ghostLayer, barLayer, pointLayer, ringLayer]) {
      svg.appendChild(g);
    }

    const caption = textNode(
      {
        x: W / 2,
        y: CAPTION_BASELINE,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      },
      '',
    );
    svg.appendChild(caption);

    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    function animate(ms: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          onFrame(1);
          resolve();
          return;
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        function schedule(): void {
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            step();
          });
          frames.add(id);
        }
        function step(): void {
          if (destroyed) {
            finish();
            return;
          }
          const t = Math.min(1, (Date.now() - start) / ms);
          onFrame(t);
          if (t >= 1) {
            finish();
            return;
          }
          schedule();
        }
        schedule();
      });
    }

    // ── 무대 상태 ────────────────────────────────────────────────────────
    let scene: Scene | null = null;
    let kx = 1;
    let ky = 1;
    let domX0 = 0;
    let domX1 = 1;
    let domY1 = 1;
    /** 직선 방향의 단위 벡터 (화면 좌표). 수선의 발을 셈하는 데 쓴다. */
    let dirX = 1;
    let dirY = 0;
    let ring: SVGCircleElement | null = null;
    let probeCircle: SVGCircleElement | null = null;
    let probeRadius: SVGLineElement | null = null;
    let probeAngle: SVGPolylineElement | null = null;
    const bars: SVGLineElement[] = [];

    const px = (x: number): number => plotL + (x - domX0) * kx;
    const py = (y: number): number => PLOT_TOP + (domY1 - y) * ky;
    const lineAt = (x: number): number =>
      scene === null ? 0 : scene.slope * x + scene.intercept;

    function clearLayer(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function drawScene(next: Scene): void {
      scene = next;
      const xs = next.points.map((p) => p.x);
      const xLo = Math.min(...xs);
      const xHi = Math.max(...xs);
      const xSpan = xHi - xLo || 1;
      domX0 = xLo - xSpan * X_PAD_RATIO;
      domX1 = xHi + xSpan * X_PAD_RATIO;
      kx = (plotR - plotL) / (domX1 - domX0);

      // 직선의 양 끝도 y 범위에 넣는다 — 넣지 않으면 직선이 틀 밖으로 나간다.
      const ys = [...next.points.map((p) => p.y), lineAt(domX0), lineAt(domX1)];
      const yLo = Math.min(...ys);
      const yHi = Math.max(...ys);
      const ySpan = yHi - yLo || 1;
      const domY0 = yLo - ySpan * Y_PAD_RATIO;
      domY1 = yHi + ySpan * Y_PAD_RATIO;
      ky = (PLOT_BOTTOM - PLOT_TOP) / (domY1 - domY0);

      const len = Math.hypot(kx, ky * next.slope);
      dirX = kx / len;
      dirY = (-ky * next.slope) / len;

      clearLayer(gridLayer);
      clearLayer(lineLayer);
      clearLayer(pointLayer);
      clearGhostAndBars();

      // 가로 눈금선 — 세로로 잰다는 것을 읽게 하는 바탕이다.
      const yStep = niceStep(domY1 - domY0);
      for (let v = Math.ceil(domY0 / yStep) * yStep; v <= domY1 + 1e-9; v += yStep) {
        const gy = py(v);
        gridLayer.appendChild(
          el('line', { x1: plotL, y1: gy, x2: plotR, y2: gy, stroke: c.border, 'stroke-width': 1 }),
        );
        gridLayer.appendChild(
          textNode(
            {
              x: plotL - 8,
              y: gy + 4,
              'text-anchor': 'end',
              'font-size': fontSizes.sm,
              fill: c.textMuted,
            },
            tickText(v, yStep),
          ),
        );
      }

      // 틀 — 왼쪽과 아래만. 원점 축이 아니라 눈금이 붙는 자리다.
      gridLayer.appendChild(
        el('line', {
          x1: plotL, y1: PLOT_TOP, x2: plotL, y2: PLOT_BOTTOM,
          stroke: c.border, 'stroke-width': 1,
        }),
      );
      gridLayer.appendChild(
        el('line', {
          x1: plotL, y1: PLOT_BOTTOM, x2: plotR, y2: PLOT_BOTTOM,
          stroke: c.border, 'stroke-width': 1,
        }),
      );

      const xStep = niceStep(domX1 - domX0);
      for (let v = Math.ceil(domX0 / xStep) * xStep; v <= domX1 + 1e-9; v += xStep) {
        gridLayer.appendChild(
          textNode(
            {
              x: px(v),
              y: XTICK_BASELINE,
              'text-anchor': 'middle',
              'font-size': fontSizes.sm,
              fill: c.textMuted,
            },
            tickText(v, xStep),
          ),
        );
      }
      gridLayer.appendChild(
        textNode(
          { x: plotR + 10, y: PLOT_BOTTOM + 4, 'font-size': fontSizes.xs, fill: c.textMuted },
          'x',
        ),
      );
      gridLayer.appendChild(
        textNode(
          {
            x: plotL, y: PLOT_TOP - 7, 'text-anchor': 'middle',
            'font-size': fontSizes.xs, fill: c.textMuted,
          },
          'y',
        ),
      );

      lineLayer.appendChild(
        el('line', {
          x1: px(domX0), y1: py(lineAt(domX0)),
          x2: px(domX1), y2: py(lineAt(domX1)),
          stroke: c.text, 'stroke-width': 2,
        }),
      );
      lineLayer.appendChild(
        textNode(
          { x: plotL + 10, y: PLOT_BOTTOM - 10, 'font-size': fontSizes.sm, fill: c.textMuted },
          equationText(next.slope, next.intercept),
        ),
      );

      for (const p of next.points) {
        pointLayer.appendChild(
          el('circle', {
            cx: px(p.x), cy: py(p.y), r: POINT_R,
            fill: c.bg, stroke: c.text, 'stroke-width': 1.6,
          }),
        );
      }
    }

    function clearGhostAndBars(): void {
      clearLayer(ghostLayer);
      clearLayer(barLayer);
      clearLayer(ringLayer);
      ring = null;
      probeCircle = null;
      probeRadius = null;
      probeAngle = null;
      bars.length = 0;
    }

    function pointAt(index: number): Pt | null {
      if (scene === null || index < 0 || index >= scene.points.length) return null;
      return scene.points[index];
    }

    /** 잔차 막대와 그 끝의 쐐기, 그리고 값. 잰 방향이 곧 부호다. */
    function land(x: number, yFrom: number, yTo: number, residual: number): SVGLineElement {
      const tone = residual >= 0 ? ABOVE : BELOW;
      const down = yTo > yFrom ? 1 : -1;
      const bar = el('line', {
        x1: x, y1: yFrom, x2: x, y2: yTo,
        stroke: tone, 'stroke-width': BAR_W, 'stroke-linecap': 'butt',
      });
      barLayer.appendChild(bar);
      barLayer.appendChild(
        el('polygon', {
          points: [
            `${x},${yTo}`,
            `${x - DART * 0.75},${yTo - DART * down}`,
            `${x + DART * 0.75},${yTo - DART * down}`,
          ].join(' '),
          fill: tone,
        }),
      );
      const label = textNode(
        {
          x: x + 10,
          y: (yFrom + yTo) / 2 + 4,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: tone,
          stroke: c.bg,
          'stroke-width': 3,
          'stroke-linejoin': 'round',
          'paint-order': 'stroke',
        },
        signedText(residual),
      );
      barLayer.appendChild(label);
      bars.push(bar);
      return bar;
    }

    /** 막대가 자리를 잡는 순간의 짧은 두께 반동. 꽂혔다는 신호다. */
    function impact(bar: SVGLineElement): Promise<void> {
      return animate(LAND_MS, (t) => {
        const w = BAR_W + (1 - Math.abs(t * 2 - 1)) * 3;
        bar.setAttribute('stroke-width', String(w));
      });
    }

    function moveRing(toX: number, toY: number, ms: number): Promise<void> {
      if (ring === null) {
        ring = el('circle', {
          cx: toX, cy: toY, r: RING_R,
          fill: 'none', stroke: c.accent, 'stroke-width': 2,
        });
        ringLayer.appendChild(ring);
        return Promise.resolve();
      }
      const node = ring;
      const fromX = Number(node.getAttribute('cx'));
      const fromY = Number(node.getAttribute('cy'));
      return animate(ms, (t) => {
        const e = easeInOut(t);
        node.setAttribute('cx', String(fromX + (toX - fromX) * e));
        node.setAttribute('cy', String(fromY + (toY - fromY) * e));
      });
    }

    // ── projector 가 부르는 표면 ──────────────────────────────────────────
    const api = {
      setScene(next: Scene): void {
        drawScene(next);
      },

      setCaption(textValue: string): void {
        caption.textContent = textValue;
      },

      /** 한 점을 짚는다. 고리가 점 위에서 오므라들며 자리를 잡는다. */
      async focusPoint(index: number): Promise<void> {
        const p = pointAt(index);
        if (p === null) return;
        const cx = px(p.x);
        const cy = py(p.y);
        const node = el('circle', {
          cx, cy, r: RING_R * 2.4,
          fill: 'none', stroke: c.accent, 'stroke-width': 2,
        });
        ringLayer.appendChild(node);
        ring = node;
        await animate(RING_MS, (t) => {
          const e = easeOut(t);
          node.setAttribute('r', String(RING_R * 2.4 + (RING_R - RING_R * 2.4) * e));
        });
      },

      /**
       * 최단거리를 보인다. 점을 중심으로 원이 자라 직선에 **닿는** 순간 멈추고,
       * 그 접점이 수선의 발이다. 직각 표시로 못박는다.
       */
      async probePerpendicular(index: number): Promise<void> {
        const p = pointAt(index);
        if (p === null) return;
        const cx = px(p.x);
        const cy = py(p.y);
        const fy = py(lineAt(p.x));
        // 점에서 직선에 내린 수선의 발 — 직선 위 발끝에서 직선 방향으로 사영한다.
        const proj = -(fy - cy) * dirY;
        const gx = cx + proj * dirX;
        const gy = fy + proj * dirY;
        const r = Math.hypot(gx - cx, gy - cy);

        const circle = el('circle', {
          cx, cy, r: 0,
          fill: 'none', stroke: c.ghostOutline, 'stroke-width': 1.2, 'stroke-dasharray': '4 4',
        });
        const radius = el('line', {
          x1: cx, y1: cy, x2: cx, y2: cy,
          stroke: c.ghostOutline, 'stroke-width': 2, 'stroke-dasharray': '5 4',
        });
        ghostLayer.appendChild(circle);
        ghostLayer.appendChild(radius);
        probeCircle = circle;
        probeRadius = radius;

        await animate(PROBE_MS, (t) => {
          const e = easeOut(t);
          circle.setAttribute('r', String(r * e));
          radius.setAttribute('x2', String(cx + (gx - cx) * e));
          radius.setAttribute('y2', String(cy + (gy - cy) * e));
        });
        if (destroyed) return;

        // 직각 표시 — 직선 방향과 수선 방향으로 한 칸씩 낸 작은 네모.
        const nx = (cx - gx) / (r || 1);
        const ny = (cy - gy) / (r || 1);
        const mark = el('polyline', {
          points: [
            `${gx + dirX * RIGHT_ANGLE},${gy + dirY * RIGHT_ANGLE}`,
            `${gx + (dirX + nx) * RIGHT_ANGLE},${gy + (dirY + ny) * RIGHT_ANGLE}`,
            `${gx + nx * RIGHT_ANGLE},${gy + ny * RIGHT_ANGLE}`,
          ].join(' '),
          fill: 'none', stroke: c.ghostOutline, 'stroke-width': 1.4,
        });
        ghostLayer.appendChild(mark);
        probeAngle = mark;
      },

      /**
       * 수선을 세로로 돌려세운다. 막대가 점을 축으로 회전하면서 길어져 원을
       * 뚫고 나가 직선에 닿는다 — 최단거리보다 길다는 것이 그때 보인다.
       */
      async turnToVertical(index: number, predicted: number, residual: number): Promise<void> {
        const p = pointAt(index);
        if (p === null) return;
        const cx = px(p.x);
        const cy = py(p.y);
        const fy = py(predicted);

        if (probeAngle !== null) {
          probeAngle.remove();
          probeAngle = null;
        }
        if (probeCircle !== null) probeCircle.setAttribute('stroke-opacity', '0.55');

        const gx = probeRadius === null ? cx : Number(probeRadius.getAttribute('x2'));
        const gy = probeRadius === null ? fy : Number(probeRadius.getAttribute('y2'));
        const r0 = Math.hypot(gx - cx, gy - cy);
        const r1 = Math.abs(fy - cy);
        const a0 = Math.atan2(gy - cy, gx - cx);
        const a1 = Math.atan2(fy - cy, 0);
        let sweep = a1 - a0;
        while (sweep > Math.PI) sweep -= Math.PI * 2;
        while (sweep < -Math.PI) sweep += Math.PI * 2;

        const swing = el('line', {
          x1: cx, y1: cy, x2: gx, y2: gy,
          stroke: c.ghostOutline, 'stroke-width': 2, 'stroke-dasharray': '5 4',
        });
        const arc = el('path', {
          d: '', fill: 'none', stroke: c.ghostOutline, 'stroke-width': 1.2,
        });
        ghostLayer.appendChild(arc);
        ghostLayer.appendChild(swing);

        await animate(TURN_MS, (t) => {
          const e = easeInOut(t);
          const a = a0 + sweep * e;
          const r = r0 + (r1 - r0) * e;
          swing.setAttribute('x2', String(cx + Math.cos(a) * r));
          swing.setAttribute('y2', String(cy + Math.sin(a) * r));
          arc.setAttribute(
            'd',
            [
              `M ${cx + Math.cos(a0) * SWEEP_R} ${cy + Math.sin(a0) * SWEEP_R}`,
              `A ${SWEEP_R} ${SWEEP_R} 0 0 ${sweep > 0 ? 1 : 0}`,
              `${cx + Math.cos(a) * SWEEP_R} ${cy + Math.sin(a) * SWEEP_R}`,
            ].join(' '),
          );
        });

        swing.remove();
        arc.remove();
        if (destroyed) return;
        // 기각한 후보는 원과 수선으로 남는다. 지우면 대비도 사라진다.
        const bar = land(cx, cy, fy, residual);
        await impact(bar);
      },

      /** 점에서 직선까지 세로로 내려꽂는다. 고리가 먼저 그 점으로 옮겨 간다. */
      async dropResidual(index: number, predicted: number, residual: number): Promise<void> {
        const p = pointAt(index);
        if (p === null) return;
        const cx = px(p.x);
        const cy = py(p.y);
        const fy = py(predicted);
        await moveRing(cx, cy, RING_MOVE_MS);
        if (destroyed) return;

        const shaft = el('line', {
          x1: cx, y1: cy, x2: cx, y2: cy,
          stroke: residual >= 0 ? ABOVE : BELOW,
          'stroke-width': BAR_W, 'stroke-linecap': 'butt',
        });
        barLayer.appendChild(shaft);
        await animate(DROP_MS, (t) => {
          shaft.setAttribute('y2', String(cy + (fy - cy) * easeIn(t)));
        });
        shaft.remove();
        if (destroyed) return;
        const bar = land(cx, cy, fy, residual);
        await impact(bar);
      },

      /** 다 꽂혔다. 고리를 거두고 다섯을 함께 한 번 두드린다. */
      async markDone(): Promise<void> {
        if (ring !== null) {
          ring.remove();
          ring = null;
        }
        const settled = [...bars];
        await animate(DONE_MS, (t) => {
          const w = BAR_W + (1 - Math.abs(t * 2 - 1)) * 3;
          for (const bar of settled) bar.setAttribute('stroke-width', String(w));
        });
      },

      /** 처음으로 되감는다. 무대(축 · 직선 · 점)는 그대로 두고 잰 것만 거둔다. */
      rewind(): void {
        clearGhostAndBars();
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const g of [gridLayer, lineLayer, ghostLayer, barLayer, pointLayer, ringLayer]) {
          g.remove();
        }
        caption.remove();
      },
    };

    return api;
  },
};
