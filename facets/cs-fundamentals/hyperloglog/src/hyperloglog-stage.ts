/**
 * hyperloglog-stage — 통 수를 미는 손잡이가 붙은 한 폭의 SVG.
 *
 * 세 층을 위에서 아래로 쌓는다.
 *   1. 열쇠 하나의 32비트 — 앞은 통 번호, 뒤는 앞자리 0 의 길이. 조각
 *      `leadingZerosTell` 이 말한 자리다.
 *   2. 통들 — 통마다 본 것 중 가장 긴 ρ 만 남긴다. 조각 `averageTheBuckets`
 *      가 말한 자리다.
 *   3. 답과 축 — 지금 통 수의 추정값, 그리고 통 수에 따른 오차 곡선. 독자가
 *      손잡이를 밀 때마다 점이 하나씩 채워진다. **이 축이 이 완제품의 까닭이다.**
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 통이 16 개까지 늘어도 자리는 처음부터
 * 열여섯 몫으로 잡아 두고 막대의 폭만 달라진다.
 *
 * **타이머도 프레임 루프도 없다.** 걸음의 간격은 알고리즘의 `ctx.sleep` 이 정하고
 * 이 view 의 메서드는 전부 동기로 즉시 그린다. 그래서 `destroy()` 가 풀어 줄
 * 기다림이 애초에 생기지 않는다 — 이 주석은 사실이어야 하므로, 나중에 여기에
 * 애니메이션을 들이면 이 문장부터 고쳐야 한다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

// ── 기하 (S-view: SVG 안의 좌표·반지름은 그림이 정한다) ─────────────────────
const W = 720;
const H = 384;
const PAD = 24;
const INNER = W - PAD * 2;

const HASH_BITS = 32;
const CELL_W = INNER / HASH_BITS;
const BITS_TOP = 32;
const BITS_H = 32;
const KEY_LABEL_Y = 22;
const BRACKET_Y = 80;

const BUCKETS_LABEL_Y = 104;
const BAR_BASE_Y = 240;
const BAR_MAX_H = 108;
/** 막대 높이의 기준. 통 수가 달라져도 같은 자로 재야 견줄 수 있다. */
const RHO_SCALE = 16;

const PANEL_LABEL_Y = 272;
const PANEL_VALUE_Y = 312;
const PANEL_TRUTH_Y = 334;

const CURVE_X0 = 380;
const CURVE_X1 = 690;
const CURVE_BASE_Y = 344;
const CURVE_TOP_Y = 288;
const CURVE_TICK_Y = 360;
/** 축의 위쪽 끝이 뜻하는 오차. 재 본 가장 큰 값이 78% 라 80 으로 잡는다. */
const CURVE_MAX_ERR = 80;

const CAPTION_Y = 376;

/** 축에 설 통 수. facet.ts 의 segments 와 같은 다섯이다. */
const AXIS_BUCKETS: readonly number[] = [1, 2, 4, 8, 16];

type Attrs = Record<string, string | number>;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function textEl(x: number, y: number, value: string, attrs: Attrs): SVGTextElement {
  const t = svgEl('text', { x, y, 'font-family': fonts.body, ...attrs });
  t.textContent = value;
  return t;
}

function clear(g: SVGGElement): void {
  while (g.firstChild) g.removeChild(g.firstChild);
}

/** 축에서 이 통 수가 설 자리. */
function axisX(m: number): number {
  const i = AXIS_BUCKETS.indexOf(m);
  const at = i < 0 ? 0 : i;
  return CURVE_X0 + (at * (CURVE_X1 - CURVE_X0)) / (AXIS_BUCKETS.length - 1);
}

function axisY(errPct: number): number {
  const capped = Math.max(0, Math.min(CURVE_MAX_ERR, errPct));
  return CURVE_BASE_Y - (capped / CURVE_MAX_ERR) * (CURVE_BASE_Y - CURVE_TOP_Y);
}

export type HyperLogLogKeyFrame = {
  key: string;
  bits: string;
  p: number;
  bucket: number;
  rho: number;
  raised: boolean;
  registers: number[];
};

export const hyperloglogStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    // 컨테이너는 손대지 않는다 — 러너가 캔버스를 거기 먼저 붙여 두었고, 비우면
    // 그 캔버스가 떨어져 나간다 (S-view). 그릴 자리는 `params.canvas` 안쪽이다.
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;

    const root = svgEl('g', {});
    const gBits = svgEl('g', {});
    const gBuckets = svgEl('g', {});
    const gPanel = svgEl('g', {});
    const gCurve = svgEl('g', {});
    const gCaption = svgEl('g', {});
    root.append(gBits, gBuckets, gPanel, gCurve, gCaption);
    canvas.appendChild(root);

    // ── 초기 데이터 좁히기 (C9). 좁히는 자리는 여기 한 곳이다.
    const initial = params.initialData ?? {};
    const initialBuckets =
      typeof initial['bucketCount'] === 'number' ? initial['bucketCount'] : 4;
    const initialKeys = Array.isArray(initial['keys']) ? initial['keys'].length : 0;

    let m = initialBuckets;
    let prefixBits = 0;
    let keyCount = initialKeys;
    let registers: number[] = new Array<number>(m).fill(0);
    let activeBucket = -1;
    let activeRaised = false;
    /** 독자가 지금까지 밀어 본 통 수와 그때의 오차. 축이 이것으로 채워진다. */
    const visited = new Map<number, number>();

    // ── 열쇠의 비트 ──────────────────────────────────────────────────────
    function drawBits(frame: HyperLogLogKeyFrame | null): void {
      clear(gBits);

      const p = frame ? frame.p : prefixBits;

      gBits.appendChild(
        textEl(PAD, KEY_LABEL_Y, frame ? frame.key : '', {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        }),
      );
      if (frame) {
        const rhoText = textEl(W - PAD, KEY_LABEL_Y, `ρ = ${frame.rho}`, {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'end',
          fill: colors.text,
        });
        gBits.appendChild(rhoText);
      }

      for (let i = 0; i < HASH_BITS; i += 1) {
        const x = PAD + i * CELL_W;
        const isPrefix = i < p;
        const j = i - p;
        const isZeroRun = !isPrefix && frame !== null && j < frame.rho - 1;
        const isFirstOne = !isPrefix && frame !== null && j === frame.rho - 1;

        let fill = colors.bg;
        let ink = colors.textMuted;
        if (isPrefix) {
          // 영역 tint — 통 번호가 사는 자리 (S-view 결정 트리 8).
          fill = colors.subtreeShadeLeft;
          ink = colors.text;
        } else if (isZeroRun) {
          // 알고리즘 상태 — 지금 세고 있는 0 들 (결정 트리 1).
          fill = colors.itemComparing;
          ink = colors.stateInk;
        } else if (isFirstOne) {
          // 셈을 끝내는 한 자리. pivot 과 같은 뜻이라 같은 토큰을 쓴다.
          fill = colors.itemPivot;
          ink = colors.stateInk;
        }

        gBits.appendChild(
          svgEl('rect', {
            x,
            y: BITS_TOP,
            width: CELL_W - 1,
            height: BITS_H,
            rx: 2,
            fill,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        gBits.appendChild(
          textEl(x + (CELL_W - 1) / 2, BITS_TOP + BITS_H / 2 + 4, frame ? frame.bits.charAt(i) : '', {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            fill: ink,
          }),
        );
      }

      if (p > 0) {
        gBits.appendChild(
          textEl(PAD + (p * CELL_W) / 2, BRACKET_Y, tr('label.prefix', 'bucket number'), {
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            fill: colors.textMuted,
          }),
        );
      }
      gBits.appendChild(
        textEl(PAD + p * CELL_W + ((HASH_BITS - p) * CELL_W) / 2, BRACKET_Y, tr('label.rest', 'run of zeros'), {
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          fill: colors.textMuted,
        }),
      );
    }

    // ── 통들 ─────────────────────────────────────────────────────────────
    function drawBuckets(): void {
      clear(gBuckets);

      gBuckets.appendChild(
        textEl(PAD, BUCKETS_LABEL_Y, tr('label.buckets', 'buckets · largest run kept'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );

      gBuckets.appendChild(
        svgEl('line', {
          x1: PAD,
          y1: BAR_BASE_Y,
          x2: W - PAD,
          y2: BAR_BASE_Y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      const slotW = INNER / m;
      const barW = Math.min(slotW - 8, 64);
      for (let i = 0; i < m; i += 1) {
        const value = registers[i] ?? 0;
        const h = Math.max(2, Math.min(1, value / RHO_SCALE) * BAR_MAX_H);
        const x = PAD + i * slotW + (slotW - barW) / 2;
        const y = BAR_BASE_Y - h;

        let fill = colors.itemDefault;
        if (i === activeBucket) fill = activeRaised ? colors.itemSwapping : colors.itemActive;

        gBuckets.appendChild(
          svgEl('rect', {
            x,
            y,
            width: barW,
            height: h,
            rx: 3,
            fill,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        gBuckets.appendChild(
          textEl(x + barW / 2, y - 6, String(value), {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            fill: i === activeBucket ? colors.text : colors.textMuted,
          }),
        );
        if (slotW >= 30) {
          gBuckets.appendChild(
            textEl(x + barW / 2, BAR_BASE_Y + 14, String(i), {
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              'text-anchor': 'middle',
              fill: colors.textMuted,
            }),
          );
        }
      }
    }

    // ── 답 ───────────────────────────────────────────────────────────────
    function drawPanel(estimate: number | null, truth: number, errPct: number | null): void {
      clear(gPanel);

      gPanel.appendChild(
        textEl(PAD, PANEL_LABEL_Y, tr('label.estimate', 'estimate'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
      gPanel.appendChild(
        textEl(PAD, PANEL_VALUE_Y, estimate === null ? '—' : estimate.toFixed(1), {
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          'font-weight': '600',
          fill: colors.text,
        }),
      );
      if (errPct !== null) {
        gPanel.appendChild(
          textEl(PAD + 120, PANEL_VALUE_Y, `${errPct}%`, {
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            fill: colors.accent,
          }),
        );
      }
      gPanel.appendChild(
        textEl(PAD, PANEL_TRUTH_Y, tr('label.truth', 'true count {n}', { n: truth }), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
    }

    // ── 축 ───────────────────────────────────────────────────────────────
    function drawCurve(): void {
      clear(gCurve);

      gCurve.appendChild(
        textEl(CURVE_X0, PANEL_LABEL_Y, tr('label.error', 'relative error by bucket count'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
      gCurve.appendChild(
        svgEl('line', {
          x1: CURVE_X0 - 8,
          y1: CURVE_BASE_Y,
          x2: CURVE_X1 + 8,
          y2: CURVE_BASE_Y,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      const seen = AXIS_BUCKETS.filter((b) => visited.has(b));
      if (seen.length >= 2) {
        const points = seen.map((b) => `${axisX(b)},${axisY(visited.get(b) ?? 0)}`).join(' ');
        gCurve.appendChild(
          svgEl('polyline', {
            points,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1.5,
          }),
        );
      }

      for (const b of AXIS_BUCKETS) {
        const x = axisX(b);
        const err = visited.get(b);
        if (err === undefined) {
          // 아직 안 밀어 본 자리. 유령 외곽선이 "여기 갈 수 있다" 를 말한다.
          gCurve.appendChild(
            svgEl('circle', {
              cx: x,
              cy: CURVE_BASE_Y,
              r: 3,
              fill: 'none',
              stroke: colors.ghostOutline,
              'stroke-width': 1,
              'stroke-dasharray': '2 2',
            }),
          );
        } else {
          const y = axisY(err);
          const current = b === m;
          gCurve.appendChild(
            svgEl('circle', {
              cx: x,
              cy: y,
              r: current ? 5 : 3.5,
              fill: current ? colors.itemPivot : colors.text,
              stroke: colors.border,
              'stroke-width': 1,
            }),
          );
          gCurve.appendChild(
            textEl(x, y - 10, `${err}%`, {
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              'text-anchor': 'middle',
              fill: current ? colors.text : colors.textMuted,
            }),
          );
        }
        gCurve.appendChild(
          textEl(x, CURVE_TICK_Y, String(b), {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            'font-weight': b === m ? '600' : '400',
            fill: b === m ? colors.text : colors.textMuted,
          }),
        );
      }
    }

    function drawCaption(text: string): void {
      clear(gCaption);
      gCaption.appendChild(
        textEl(W / 2, CAPTION_Y, text, {
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: colors.text,
        }),
      );
    }

    // 첫 그림. 알고리즘이 곧 hll-config 로 덮지만, 그 전에도 화면은 비어 있지 않다.
    drawBits(null);
    drawBuckets();
    drawPanel(null, keyCount, null);
    drawCurve();
    drawCaption('');

    return {
      destroy(): void {
        // 타이머도 프레임 루프도 구독도 없다 — 붙인 노드만 거둔다.
        if (root.parentNode) root.parentNode.removeChild(root);
      },

      setLayout(info: { m: number; p: number; keyCount: number }): void {
        m = info.m;
        prefixBits = info.p;
        keyCount = info.keyCount;
        registers = new Array<number>(m).fill(0);
        activeBucket = -1;
        activeRaised = false;
        drawBits(null);
        drawBuckets();
        drawPanel(null, keyCount, null);
        drawCurve();
      },

      showKey(frame: HyperLogLogKeyFrame): void {
        prefixBits = frame.p;
        registers = frame.registers;
        activeBucket = frame.bucket;
        activeRaised = frame.raised;
        drawBits(frame);
        drawBuckets();
      },

      showEstimate(info: { m: number; estimate: number; truth: number; errPct: number }): void {
        activeBucket = -1;
        activeRaised = false;
        visited.set(info.m, info.errPct);
        keyCount = info.truth;
        drawBuckets();
        drawPanel(info.estimate, info.truth, info.errPct);
        drawCurve();
      },

      setCaption(text: string): void {
        drawCaption(text);
      },

      resetAll(): void {
        m = initialBuckets;
        prefixBits = 0;
        keyCount = initialKeys;
        registers = new Array<number>(m).fill(0);
        activeBucket = -1;
        activeRaised = false;
        visited.clear();
        drawBits(null);
        drawBuckets();
        drawPanel(null, keyCount, null);
        drawCurve();
        drawCaption('');
      },
    };
  },
};
