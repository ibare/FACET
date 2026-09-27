/**
 * 큰 수의 법칙의 무대.
 *
 * 위: 앞면 비율의 축(0 · 참값 · 1) 위에 구슬 하나 — 비율이라는 수 하나가 던질 때마다 좌우로 흔들린다.
 * 아래: 걸음마다 한 줄씩 내려가는 비율의 길. 줄마다 그 구간의 흔들림의 폭(참값 ± 폭)을 띠로 깔아,
 * 줄이 내려갈수록 띠가 참값 둘레로 좁아진다. 줄의 높이는 구간마다 같고, 줄 안에서 던진 수가 아래로 흐른다.
 *
 * 운동: 새 구간의 던지기를 차례로 풀어 구슬과 길의 머리가 그 구간의 비율들을 지나가게 하고,
 * 띠는 앞 줄의 폭에서 이 줄의 폭으로 늘거나 줄어든다. 폭의 수는 도착한 뒤에 선다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { LawOfLargeNumbersScene } from './scene.js';

const H = 440;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 한 걸음의 운동 길이. 가장 긴 구간(700 번)도 이 안에 다 지나간다 */
const MOTION_MS = 600;
const FRAME_MS = 16;

const CAP1_Y = 22;
const CAP2_Y = 44;
const AXIS_Y = 102;
const HEAD_Y = 146;
const ROWS_TOP = 156;
const ROWS_BOTTOM = H - 8;
/** 축의 좌우 끝 — 왼쪽은 구간 이름, 오른쪽은 폭의 수를 위해 비운다 */
const AXIS_L = Math.round(W * 0.16);
const AXIS_R = W - Math.round(W * 0.17);

function round1(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

/** 소수 셋째 자리 · 빼기는 U+2212 */
function fmt3(v: number): string {
  const s = v.toFixed(3);
  if (s === '-0.000') return '0.000';
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

function xOf(ratio: number): number {
  return round1(AXIS_L + ratio * (AXIS_R - AXIS_L));
}

type MotionFrame = { index: number; revealed: number; width: number };

export const lawOfLargeNumbersStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const canvas = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function shape(tag: string, attrs: Record<string, string | number>, parent: Element = canvas): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      content: string,
      x: number,
      y: number,
      opts: { anchor?: string; size?: string; fill?: string; mono?: boolean; weight?: string },
    ): SVGElement {
      const node = shape('text', {
        x: round1(x),
        y: round1(y),
        'text-anchor': opts.anchor ?? 'start',
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'font-weight': opts.weight ?? 'normal',
        fill: opts.fill ?? colors.text,
      });
      node.textContent = content;
      return node;
    }

    function rowGeometry(scene: LawOfLargeNumbersScene, index: number): { top: number; h: number } {
      const rows = scene.checkpoints.length - 1;
      const h = (ROWS_BOTTOM - ROWS_TOP) / rows;
      return { top: ROWS_TOP + (index - 1) * h, h };
    }

    /** n 번째 던지기의 세로 자리 — 그 구간의 줄 안에서 위에서 아래로 흐른다 */
    function yOfToss(scene: LawOfLargeNumbersScene, n: number): number {
      for (let i = 1; i < scene.checkpoints.length; i += 1) {
        const from = scene.checkpoints[i - 1]! + 1;
        const to = scene.checkpoints[i]!;
        if (n >= from && n <= to) {
          const { top, h } = rowGeometry(scene, i);
          return round1(top + (h * (n - from + 0.5)) / (to - from + 1));
        }
      }
      throw new Error(`law-of-large-numbers-stage: 던진 수 ${n} 이 수열의 어느 구간에도 없다`);
    }

    function drawScene(scene: LawOfLargeNumbersScene, partial: MotionFrame | null): void {
      canvas.textContent = '';
      const pValue = scene.p.num / scene.p.den;
      const pText = `${scene.p.num}/${scene.p.den}`;
      const intervals = scene.intervals;
      const last = intervals[intervals.length - 1];

      // 캡션 — 지금 일어난 일
      if (!last) {
        label(t('caption.start', 'No tosses yet. Heads probability: {p}.', { p: pText }), W / 2, CAP1_Y, {
          anchor: 'middle',
          size: fontSizes.md,
        });
      } else {
        if (last.from === last.to) {
          const face = scene.faces[last.to - 1];
          if (face === undefined) throw new Error(`law-of-large-numbers-stage: faces[${last.to - 1}] 가 없다`);
          const faceName = face === 1 ? t('label.heads', 'heads') : t('label.tails', 'tails');
          label(t('caption.one', 'Toss {n}: {face}.', { n: last.to, face: faceName }), W / 2, CAP1_Y, {
            anchor: 'middle',
            size: fontSizes.md,
          });
        } else {
          label(
            t('caption.span', 'Tosses {from}–{to}: farthest from {p} was {w}.', {
              from: last.from,
              to: last.to,
              p: pText,
              w: fmt3(last.width),
            }),
            W / 2,
            CAP1_Y,
            { anchor: 'middle', size: fontSizes.md },
          );
        }
        label(
          t('caption.readout', 'Tosses {n} · heads {h} · ratio − {p} = {d}', {
            n: last.to,
            h: last.heads,
            p: pText,
            d: fmt3(last.diff),
          }),
          W / 2,
          CAP2_Y,
          { anchor: 'middle', fill: colors.textMuted, mono: true },
        );
      }

      // 축
      const pX = xOf(pValue);
      shape('line', { x1: AXIS_L, y1: AXIS_Y, x2: AXIS_R, y2: AXIS_Y, stroke: colors.border, 'stroke-width': 2 });
      for (const [v, txt] of [
        [0, '0'],
        [pValue, pText],
        [1, '1'],
      ] as const) {
        const x = xOf(v);
        shape('line', { x1: x, y1: AXIS_Y - 5, x2: x, y2: AXIS_Y + 5, stroke: colors.textMuted, 'stroke-width': 1 });
        label(txt, x, AXIS_Y + 20, {
          anchor: 'middle',
          mono: true,
          fill: v === pValue ? colors.text : colors.textMuted,
          weight: v === pValue ? 'bold' : 'normal',
        });
      }
      label(t('label.axis', 'Heads ratio'), AXIS_L - 14, AXIS_Y + 4, { anchor: 'end', fill: colors.textMuted });

      // 머리줄
      label(t('label.tosses', 'Tosses'), AXIS_L - 14, HEAD_Y, { anchor: 'end', fill: colors.textMuted, size: fontSizes.xs });
      label(t('label.swing', 'Widest swing'), AXIS_R + 14, HEAD_Y, { anchor: 'start', fill: colors.textMuted, size: fontSizes.xs });

      // 줄마다: 구간 이름 · 폭의 띠 · 폭의 수
      const current = scene.step ? scene.step.index : 0;
      for (let i = 1; i < scene.checkpoints.length; i += 1) {
        const from = scene.checkpoints[i - 1]! + 1;
        const to = scene.checkpoints[i]!;
        const { top, h } = rowGeometry(scene, i);
        const reached = i <= intervals.length;
        const name = from === to ? String(to) : `${from}–${to}`;
        label(name, AXIS_L - 14, top + h / 2 + 4, {
          anchor: 'end',
          mono: true,
          fill: reached ? colors.text : colors.textMuted,
        });
        if (!reached) continue;
        const iv = intervals[i - 1]!;
        const moving = partial !== null && partial.index === i;
        const w = moving ? partial.width : iv.width;
        const x1 = xOf(pValue - w);
        const x2 = xOf(pValue + w);
        shape('rect', {
          x: x1,
          y: round1(top + 3),
          width: round1(Math.max(0, x2 - x1)),
          height: round1(h - 6),
          rx: 3,
          fill: colors.bgSubtle,
          stroke: i === current ? colors.itemActive : colors.border,
          'stroke-width': i === current ? 1.5 : 1,
        });
        if (!moving) {
          label(fmt3(iv.width), AXIS_R + 14, top + h / 2 + 4, {
            anchor: 'start',
            mono: true,
            fill: i === current ? colors.text : colors.textMuted,
            weight: i === current ? 'bold' : 'normal',
          });
        }
      }

      // 참값의 세로줄 — 축에서 맨 아래 줄까지. 띠 위에 그어 가려지지 않게
      shape('line', {
        x1: pX,
        y1: AXIS_Y + 26,
        x2: pX,
        y2: ROWS_BOTTOM,
        stroke: colors.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
      });

      // 비율의 길 — 던진 수 1 부터 지금 드러난 던지기까지
      let shown = scene.ratios.length;
      if (partial !== null) {
        const iv = intervals[partial.index - 1];
        if (!iv) throw new Error(`law-of-large-numbers-stage: 운동할 구간 ${partial.index} 이 장면에 없다`);
        shown = iv.from - 1 + partial.revealed;
      }
      if (shown > 0) {
        const pts: string[] = [];
        for (let n = 1; n <= shown; n += 1) {
          pts.push(`${xOf(scene.ratios[n - 1]!)},${yOfToss(scene, n)}`);
        }
        shape('polyline', {
          points: pts.join(' '),
          fill: 'none',
          stroke: colors.primary,
          'stroke-width': 1.5,
          'stroke-linejoin': 'round',
        });
        const headRatio = scene.ratios[shown - 1]!;
        const hx = xOf(headRatio);
        shape('circle', { cx: hx, cy: yOfToss(scene, shown), r: 3.5, fill: colors.itemActive });

        // 수 하나 — 축 위의 구슬과 그 값
        shape('circle', {
          cx: hx,
          cy: AXIS_Y,
          r: 8,
          fill: colors.itemActive,
          stroke: colors.bg,
          'stroke-width': 2,
        });
        label(fmt3(headRatio), hx, AXIS_Y - 16, { anchor: 'middle', mono: true, weight: 'bold', size: fontSizes.md });
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function moveToss(next: LawOfLargeNumbersScene, index: number, mine: number): Promise<void> {
      const iv = next.intervals[index - 1];
      if (!iv) throw new Error(`law-of-large-numbers-stage: 걸음 ${index} 의 구간이 장면에 없다`);
      const before = next.intervals[index - 2];
      const fromWidth = before ? before.width : 0;
      const length = iv.to - iv.from + 1;
      const frames = Math.ceil(MOTION_MS / FRAME_MS);
      for (let f = 0; f <= frames; f += 1) {
        if (mine !== gen || destroyed) return;
        const q = f / frames;
        const eased = 1 - (1 - q) * (1 - q);
        drawScene(next, {
          index,
          revealed: Math.max(1, Math.ceil(q * length)),
          width: fromWidth + (iv.width - fromWidth) * eased,
        });
        if (f < frames) await wait(FRAME_MS);
      }
    }

    async function render(
      next: LawOfLargeNumbersScene,
      _prev: LawOfLargeNumbersScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      if (!opts.animate || next.step === null) {
        drawScene(next, null);
        return;
      }
      await moveToss(next, next.step.index, mine);
      if (mine !== gen || destroyed) return;
      drawScene(next, null);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
