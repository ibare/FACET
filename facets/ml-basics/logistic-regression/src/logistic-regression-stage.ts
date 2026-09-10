/**
 * logistic-regression-stage — 한 캔버스에 두 얼굴을 나란히 둔다.
 *
 *   왼쪽  평면. 점 열아홉과, 확률이 문턱을 넘나드는 자리에 놓인 선 하나.
 *         선의 양쪽은 "이쪽" 과 "저쪽" 으로 옅게 물든다.
 *   오른쪽 0~1 띠. 시그모이드 곡선 위에 점들이 z 에 따라 앉는다. 무한한 축이
 *         띠 안으로 접히는 것과, 문턱이 그 띠를 가로지르는 것이 한눈에 보인다.
 *
 * 조각 둘(squashToProbability · decisionBoundary)이 따로 말한 두 장면이다.
 * 조각은 고정된 무게로 한 장면을 보이고 멈추지만, 여기서는 **무게가 학습되며
 * 왼쪽의 선이 움직이고 오른쪽의 점들이 띠의 양 끝으로 밀린다.**
 *
 * ── 세로는 마운트 뒤 바뀌지 않는다 (S-view)
 *
 * viewBox 는 상수 하나로 고정이다. 내용이 늘어날 여지가 없다 — 점 수는
 * 고정이고 두 판의 자리도 고정이다. `setFrame` 은 안쪽 그림만 다시 그린다.
 *
 * ── z 축의 폭
 *
 * 학습이 나아갈수록 |z| 가 커지므로 폭을 매 프레임 다시 재면 그림이 떤다.
 * 그래서 폭은 **줄지 않는다** — `Z_SPAN_MIN` (시그모이드가 실질적으로 다
 * 접히는 폭. p(±6) = 0.0025 / 0.9975) 에서 시작해 필요할 때만 자란다.
 *
 * ── 뒷일
 *
 * 타이머도 옵서버도 두지 않는다. `destroy()` 는 캔버스 안에 만든 뿌리 `<g>`
 * 하나를 떼는 것으로 끝난다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  categorical,
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 판의 기하. 캔버스 620 × 330 안의 고정 자리.
const CANVAS_W = 620;
const CANVAS_H = 330;
const PANEL_TOP = 30;
const PANEL_BOT = 254;
/** 왼쪽 평면 판. 두 축의 눈금이 같도록 정사각으로 잡는다. */
const AX0 = 40;
const AX1 = 264;
/** 오른쪽 0~1 띠 판. */
const BX0 = 318;
const BX1 = 598;

/** 세로축 이름을 세워 두는 자리 — 눈금 숫자 열보다 바깥. */
const AXIS_NAME_X = 14;
const AXIS_NAME_Z = 292;
const PANEL_MID = (PANEL_TOP + PANEL_BOT) / 2;

const TITLE_Y = 20;
const READOUT_Y = 276;
const TALLY_Y = 298;
const CAPTION_Y = 320;
/** 집계 세 칸의 너비. */
const TALLY_SLOT_W = 176;

const DOT_R = 4.6;
const RIBBON_DOT_R = 3.4;
const WRONG_RING_R = 7.6;
const CURVE_SAMPLES = 96;

/** 시그모이드가 실질적으로 다 접히는 폭. 여기서 시작해 줄지 않는다. */
const Z_SPAN_MIN = 6;
/** 무게가 이보다 작으면 경계선이 서지 않는다 (학습 첫 프레임). */
const WEIGHT_EPS = 1e-6;
/** 데이터 영역에 두는 숨 여유. */
const DOMAIN_PAD = 1.12;

/** categorical(2) 안에서 이름표 0 / 1 이 쓰는 자리. */
const CLASS_LOW = 0;
const CLASS_HIGH = 1;

/** 도형에 새겨진 축 이름 — 번역하면 오히려 어긋난다 (C10 표식). */
const AXIS_X = 'x₁';
const AXIS_Y = 'x₂';
const AXIS_Z = 'z';
const AXIS_P = 'p';
const HALF_MARK = 'p = 0.5';

export type LogisticStagePoint = { x: number; y: number; label: number };

export type LogisticStageFrame = {
  step: number;
  w0: number;
  w1: number;
  bias: number;
  probs: number[];
  loss: number;
  threshold: number;
  hit: number;
  miss: number;
  falseAlarm: number;
  finished: boolean;
};

/** 입력 hex 는 토큰 경유. 순수 변환이라 view 에 둘 수 있다 (S-view Exception). */
function hexToRgba(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function svg<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function label(
  x: number,
  y: number,
  text: string,
  fill: string,
  size: string,
  anchor: 'start' | 'middle' | 'end',
  family: string,
): SVGTextElement {
  const node = svg('text', {
    x,
    y,
    fill,
    'font-size': size,
    'font-family': family,
    'text-anchor': anchor,
  });
  node.textContent = text;
  return node;
}

/** 세로축 이름. 눈금 숫자 열과 겹치지 않도록 판 왼쪽 바깥에 세워 둔다. */
function uprightLabel(
  x: number,
  y: number,
  text: string,
  fill: string,
  size: string,
  family: string,
): SVGTextElement {
  const node = label(x, y, text, fill, size, 'middle', family);
  node.setAttribute('transform', `rotate(-90 ${x} ${y})`);
  return node;
}

/**
 * 사각형을 affine 반평면 `f(px, py) >= 0` 으로 자른 다각형.
 * 잘려 나가면 빈 배열.
 */
function clipRect(
  corners: ReadonlyArray<readonly [number, number]>,
  f: (px: number, py: number) => number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < corners.length; i += 1) {
    const cur = corners[i];
    const nxt = corners[(i + 1) % corners.length];
    const fc = f(cur[0], cur[1]);
    const fn = f(nxt[0], nxt[1]);
    if (fc >= 0) out.push([cur[0], cur[1]]);
    if ((fc >= 0 && fn < 0) || (fc < 0 && fn >= 0)) {
      const t = fc / (fc - fn);
      out.push([cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t]);
    }
  }
  return out;
}

/** 사각형 안에서 직선 `A*px + B*py + C = 0` 이 지나는 두 점. 없으면 null. */
function clipLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  A: number,
  B: number,
  C: number,
): [[number, number], [number, number]] | null {
  const found: Array<[number, number]> = [];
  const tol = 1e-6;
  const push = (px: number, py: number): void => {
    if (px < x0 - tol || px > x1 + tol || py < y0 - tol || py > y1 + tol) return;
    for (const q of found) {
      if (Math.abs(q[0] - px) < 0.01 && Math.abs(q[1] - py) < 0.01) return;
    }
    found.push([px, py]);
  };
  if (Math.abs(B) > tol) {
    push(x0, -(A * x0 + C) / B);
    push(x1, -(A * x1 + C) / B);
  }
  if (Math.abs(A) > tol) {
    push(-(B * y0 + C) / A, y0);
    push(-(B * y1 + C) / A, y1);
  }
  if (found.length < 2) return null;
  return [found[0], found[1]];
}

export const logisticRegressionStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const clsInk = categorical(2, 'vivid');
    const clsTint = categorical(2, 'pastel');
    const canvas = params.canvas;

    const root = svg('g', {});
    canvas.appendChild(root);

    /** 다시 그릴 때마다 비우는 층. 뿌리 `<g>` 는 그대로 둔다. */
    const layerStatic = svg('g', {});
    const layerA = svg('g', {});
    const layerB = svg('g', {});
    const layerText = svg('g', {});
    root.append(layerStatic, layerA, layerB, layerText);

    let points: LogisticStagePoint[] = [];
    let thresholds: number[] = [];
    let frame: LogisticStageFrame | null = null;
    let caption = '';
    let domain = 1;
    let zSpan = Z_SPAN_MIN;

    const panelH = PANEL_BOT - PANEL_TOP;
    const aW = AX1 - AX0;
    const bW = BX1 - BX0;

    // ── 자리 옮기개
    const ax = (v: number): number => AX0 + (v / domain) * aW;
    const ay = (v: number): number => PANEL_BOT - (v / domain) * panelH;
    const bx = (z: number): number => BX0 + ((z + zSpan) / (2 * zSpan)) * bW;
    const by = (p: number): number => PANEL_BOT - p * panelH;

    const fmt = (v: number, digits: number): string => v.toFixed(digits);

    function clear(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function drawStatic(): void {
      clear(layerStatic);
      const panelAttrs = {
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
        rx: 3,
      };
      layerStatic.appendChild(
        svg('rect', { x: AX0, y: PANEL_TOP, width: aW, height: panelH, ...panelAttrs }),
      );
      layerStatic.appendChild(
        svg('rect', { x: BX0, y: PANEL_TOP, width: bW, height: panelH, ...panelAttrs }),
      );

      layerStatic.appendChild(
        label(
          AX0,
          TITLE_Y,
          tr('panel.plane', 'the plane, and where the line lands'),
          colors.textMuted,
          fontSizes.xs,
          'start',
          fonts.body,
        ),
      );
      layerStatic.appendChild(
        label(
          BX0,
          TITLE_Y,
          tr('panel.ribbon', 'the 0–1 ribbon that every z folds into'),
          colors.textMuted,
          fontSizes.xs,
          'start',
          fonts.body,
        ),
      );

      // 왼쪽 판의 눈금 — 두 정수마다 옅은 선.
      for (let v = 2; v < domain; v += 2) {
        layerStatic.appendChild(
          svg('line', {
            x1: ax(v), y1: PANEL_TOP, x2: ax(v), y2: PANEL_BOT,
            stroke: colors.border, 'stroke-width': 1, opacity: 0.55,
          }),
        );
        layerStatic.appendChild(
          svg('line', {
            x1: AX0, y1: ay(v), x2: AX1, y2: ay(v),
            stroke: colors.border, 'stroke-width': 1, opacity: 0.55,
          }),
        );
        layerStatic.appendChild(
          label(ax(v), PANEL_BOT + 12, String(v), colors.textMuted, fontSizes.xs, 'middle', fonts.mono),
        );
        layerStatic.appendChild(
          label(AX0 - 6, ay(v) + 3.5, String(v), colors.textMuted, fontSizes.xs, 'end', fonts.mono),
        );
      }
      layerStatic.appendChild(
        label(AX1, PANEL_BOT + 12, AXIS_X, colors.textMuted, fontSizes.xs, 'end', fonts.mono),
      );
      layerStatic.appendChild(
        uprightLabel(AXIS_NAME_X, PANEL_MID, AXIS_Y, colors.textMuted, fontSizes.xs, fonts.mono),
      );

      // 오른쪽 판의 눈금 — 0 / 0.5 / 1.
      for (const p of [0, 0.5, 1]) {
        layerStatic.appendChild(
          label(BX0 - 6, by(p) + 3.5, fmt(p, 1), colors.textMuted, fontSizes.xs, 'end', fonts.mono),
        );
      }
      layerStatic.appendChild(
        uprightLabel(AXIS_NAME_Z, PANEL_MID, AXIS_P, colors.textMuted, fontSizes.xs, fonts.mono),
      );
      layerStatic.appendChild(
        label(BX1, PANEL_BOT + 12, AXIS_Z, colors.textMuted, fontSizes.xs, 'end', fonts.mono),
      );
      layerStatic.appendChild(
        label(bx(0), PANEL_BOT + 12, '0', colors.textMuted, fontSizes.xs, 'middle', fonts.mono),
      );
    }

    /** 왼쪽 평면 — 물든 반쪽, 경계선, 점. */
    function drawPlane(f: LogisticStageFrame): void {
      clear(layerA);
      const wrong = wrongSet(f);
      const norm = Math.hypot(f.w0, f.w1);

      if (norm > WEIGHT_EPS) {
        // 데이터 좌표의 판정식을 화면 좌표의 affine 식으로 옮긴다.
        const sx = aW / domain;
        const sy = panelH / domain;
        const logit = Math.log(f.threshold / (1 - f.threshold));
        const A = f.w0 / sx;
        const B = -f.w1 / sy;
        const C = f.bias - logit - (f.w0 * AX0) / sx + (f.w1 * PANEL_BOT) / sy;
        const corners: ReadonlyArray<readonly [number, number]> = [
          [AX0, PANEL_TOP],
          [AX1, PANEL_TOP],
          [AX1, PANEL_BOT],
          [AX0, PANEL_BOT],
        ];
        const said1 = clipRect(corners, (px, py) => A * px + B * py + C);
        const said0 = clipRect(corners, (px, py) => -(A * px + B * py + C));
        for (const [poly, tint] of [
          [said1, clsTint[CLASS_HIGH]],
          [said0, clsTint[CLASS_LOW]],
        ] as const) {
          if (poly.length < 3) continue;
          layerA.appendChild(
            svg('polygon', {
              points: poly.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' '),
              fill: hexToRgba(tint, 0.55),
            }),
          );
        }

        // 문턱이 0.5 가 아니면 반반의 자리를 점선으로 남겨 견주게 한다.
        if (Math.abs(f.threshold - 0.5) > 1e-9) {
          const halfC = f.bias - (f.w0 * AX0) / sx + (f.w1 * PANEL_BOT) / sy;
          const half = clipLine(AX0, PANEL_TOP, AX1, PANEL_BOT, A, B, halfC);
          if (half) {
            layerA.appendChild(
              svg('line', {
                x1: half[0][0], y1: half[0][1], x2: half[1][0], y2: half[1][1],
                stroke: colors.textMuted, 'stroke-width': 1,
                'stroke-dasharray': '4 4', opacity: 0.8,
              }),
            );
          }
        }

        const seg = clipLine(AX0, PANEL_TOP, AX1, PANEL_BOT, A, B, C);
        if (seg) {
          layerA.appendChild(
            svg('line', {
              x1: seg[0][0], y1: seg[0][1], x2: seg[1][0], y2: seg[1][1],
              stroke: colors.text, 'stroke-width': 2.2, 'stroke-linecap': 'round',
            }),
          );
        }
      }

      for (let i = 0; i < points.length; i += 1) {
        const pt = points[i];
        const cx = ax(pt.x);
        const cy = ay(pt.y);
        if (wrong.has(i)) {
          layerA.appendChild(
            svg('circle', {
              cx, cy, r: WRONG_RING_R,
              fill: 'none', stroke: colors.danger, 'stroke-width': 1.6,
            }),
          );
        }
        layerA.appendChild(
          svg('circle', {
            cx, cy, r: DOT_R,
            fill: clsInk[pt.label === 1 ? CLASS_HIGH : CLASS_LOW],
            stroke: colors.bg, 'stroke-width': 1.2,
          }),
        );
      }
    }

    /** 오른쪽 0~1 띠 — 문턱이 가른 두 구역, 시그모이드 곡선, 점. */
    function drawRibbon(f: LogisticStageFrame): void {
      clear(layerB);
      const wrong = wrongSet(f);
      const ty = by(f.threshold);

      layerB.appendChild(
        svg('rect', {
          x: BX0, y: PANEL_TOP, width: bW, height: Math.max(0, ty - PANEL_TOP),
          fill: hexToRgba(clsTint[CLASS_HIGH], 0.55),
        }),
      );
      layerB.appendChild(
        svg('rect', {
          x: BX0, y: ty, width: bW, height: Math.max(0, PANEL_BOT - ty),
          fill: hexToRgba(clsTint[CLASS_LOW], 0.55),
        }),
      );

      layerB.appendChild(
        svg('line', {
          x1: BX0, y1: by(0.5), x2: BX1, y2: by(0.5),
          stroke: colors.textMuted, 'stroke-width': 1,
          'stroke-dasharray': '2 4', opacity: 0.7,
        }),
      );
      layerB.appendChild(
        label(BX1 - 4, by(0.5) - 5, HALF_MARK, colors.textMuted, fontSizes.xs, 'end', fonts.mono),
      );

      const pts: string[] = [];
      for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
        const z = -zSpan + (2 * zSpan * i) / CURVE_SAMPLES;
        pts.push(`${bx(z).toFixed(2)},${by(1 / (1 + Math.exp(-z))).toFixed(2)}`);
      }
      layerB.appendChild(
        svg('polyline', {
          points: pts.join(' '),
          fill: 'none', stroke: colors.text, 'stroke-width': 1.8, 'stroke-linejoin': 'round',
        }),
      );

      // 고를 수 있는 문턱들 — 지금 것이 아닌 자리는 오른쪽 끝에 짧은 자국으로만.
      for (const th of thresholds) {
        if (Math.abs(th - f.threshold) < 1e-9) continue;
        layerB.appendChild(
          svg('line', {
            x1: BX1 - 16, y1: by(th), x2: BX1 - 2, y2: by(th),
            stroke: colors.textMuted, 'stroke-width': 1.4, opacity: 0.9,
          }),
        );
      }

      layerB.appendChild(
        svg('line', {
          x1: BX0, y1: ty, x2: BX1, y2: ty,
          stroke: colors.accent, 'stroke-width': 2.4,
        }),
      );
      const chipText = tr('label.threshold', 'threshold {th}', { th: fmt(f.threshold, 2) });
      layerB.appendChild(
        svg('rect', {
          x: BX0 + 6, y: ty - 9, width: 92, height: 18, rx: 3,
          fill: colors.accent, stroke: colors.text, 'stroke-width': 0.8,
        }),
      );
      const chip = label(
        BX0 + 12, ty + 4, chipText, colors.stateInk, fontSizes.xs, 'start', fonts.mono,
      );
      layerB.appendChild(chip);

      for (let i = 0; i < points.length; i += 1) {
        const z = f.w0 * points[i].x + f.w1 * points[i].y + f.bias;
        const cx = bx(Math.max(-zSpan, Math.min(zSpan, z)));
        const cy = by(f.probs[i] ?? 0.5);
        if (wrong.has(i)) {
          layerB.appendChild(
            svg('circle', {
              cx, cy, r: RIBBON_DOT_R + 3,
              fill: 'none', stroke: colors.danger, 'stroke-width': 1.4,
            }),
          );
        }
        layerB.appendChild(
          svg('circle', {
            cx, cy, r: RIBBON_DOT_R,
            fill: clsInk[points[i].label === 1 ? CLASS_HIGH : CLASS_LOW],
            stroke: colors.bg, 'stroke-width': 1,
          }),
        );
      }
    }

    /** 집계 한 칸 — 색동그라미 하나와 이미 풀린 문구 하나. */
    function tallyItem(slot: number, text: string, swatch: string): void {
      const tx = AX0 + slot * TALLY_SLOT_W;
      layerText.appendChild(svg('circle', { cx: tx + 4, cy: TALLY_Y - 4, r: 4, fill: swatch }));
      layerText.appendChild(
        label(tx + 14, TALLY_Y, text, colors.textMuted, fontSizes.xs, 'start', fonts.body),
      );
    }

    function drawText(f: LogisticStageFrame | null): void {
      clear(layerText);
      if (f) {
        layerText.appendChild(
          label(
            AX0,
            READOUT_Y,
            tr('readout.params', 'step {step} · w = ({w0}, {w1}) · b = {b} · log-loss {loss}', {
              step: f.step,
              w0: fmt(f.w0, 3),
              w1: fmt(f.w1, 3),
              b: fmt(f.bias, 3),
              loss: fmt(f.loss, 4),
            }),
            colors.text,
            fontSizes.sm,
            'start',
            fonts.mono,
          ),
        );

        // en 원본은 호출부에 리터럴로 둔다 — 손목록 배열에 담으면 추출기와
        // 전수 검사가 그 줄을 못 본다 (C10).
        tallyItem(0, tr('tally.hit', 'right {n}', { n: f.hit }), clsInk[CLASS_HIGH]);
        tallyItem(1, tr('tally.miss', 'missed {n}', { n: f.miss }), colors.danger);
        tallyItem(2, tr('tally.falseAlarm', 'false alarm {n}', { n: f.falseAlarm }), colors.danger);
      }
      if (caption) {
        layerText.appendChild(
          label(AX0, CAPTION_Y, caption, colors.text, fontSizes.sm, 'start', fonts.body),
        );
      }
    }

    function wrongSet(f: LogisticStageFrame): Set<number> {
      const out = new Set<number>();
      for (let i = 0; i < points.length; i += 1) {
        const said = (f.probs[i] ?? 0.5) >= f.threshold ? 1 : 0;
        if (said !== points[i].label) out.add(i);
      }
      return out;
    }

    function redraw(): void {
      drawStatic();
      if (frame) {
        drawPlane(frame);
        drawRibbon(frame);
      }
      drawText(frame);
    }

    redraw();

    return {
      destroy(): void {
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      setPoints(next: LogisticStagePoint[], candidates: number[]): void {
        points = next;
        thresholds = candidates;
        let m = 1;
        for (const p of next) m = Math.max(m, p.x, p.y);
        domain = Math.ceil(m * DOMAIN_PAD * 2) / 2;
        frame = null;
        caption = '';
        redraw();
      },
      setFrame(next: LogisticStageFrame): void {
        let maxAbsZ = 0;
        for (const p of points) {
          maxAbsZ = Math.max(maxAbsZ, Math.abs(next.w0 * p.x + next.w1 * p.y + next.bias));
        }
        // 폭은 줄지 않는다 — 매 프레임 다시 재면 그림이 떤다.
        zSpan = Math.max(zSpan, Math.ceil(maxAbsZ));
        frame = next;
        redraw();
      },
      setCaption(text: string): void {
        caption = text;
        drawText(frame);
      },
    };
  },
};
