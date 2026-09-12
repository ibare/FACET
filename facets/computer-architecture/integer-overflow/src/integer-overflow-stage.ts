/**
 * integer-overflow-stage — 그릇 · 걸음 · 값 읽기의 세 층으로 넘침을 보인다.
 *
 * 위에서 아래로 —
 *   1. 그릇        폭이 담는 최대값을 가로 막대로. 오른쪽 끝이 전(rim)이다.
 *                  지금 값이 로그 눈금으로 차오르고, 넘치면 전을 넘어 삐져나간다.
 *   2. 걸음        한 항이 한 칸. 담긴 칸은 채워지고, 넘친 칸 하나만 danger 다.
 *   3. 값 읽기     지금 항의 값. 넘친 뒤에는 **기계에 실제로 남는 값**을 보인다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 칸의 간격은 걸음 상한으로 미리
 * 나누어 두므로 항이 늘어도 자리가 밀리지 않는다.
 *
 * 로그 눈금을 쓰는 까닭: 값이 1 에서 30억까지 가므로 선형 눈금에서는 마지막
 * 한 걸음 말고는 전부 바닥에 붙어 아무것도 보이지 않는다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 820;
const CANVAS_H = 300;
const PAD = 24;
const TRACK_W = CANVAS_W - PAD * 2;

/** 그릇 막대. */
const VESSEL_Y = 46;
const VESSEL_H = 44;
/** 걸음 칸. */
const STEP_Y = 126;
const STEP_H = 26;
/** 값 읽기. */
const READOUT_Y = 196;
/** 캡션 두 줄. */
const CAPTION_Y = 250;
const CAPTION_LINE = 22;

/** 자리 구분은 쉼표로 한다. */
function groupDigits(value: number): string {
  const neg = value < 0;
  const body = Math.abs(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg ? `-${body}` : body;
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

type Run = {
  width: number;
  limit: number;
  sequence: string;
  maxSteps: number;
  /** 담긴 항 — 자리 번호와 값. */
  kept: { index: number; value: number }[];
  /** 넘친 항. 아직 안 넘었으면 null. */
  burst: { index: number; truth: number; wrapped: number } | null;
  /** 다 보였는가. */
  ended: boolean;
};

export const integerOverflowStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 러너가 캔버스를 먼저 붙여 두었고,
    // 컨테이너를 비우면 그것이 떨어져 나간다 (S-view).
    const canvas = params.canvas;
    canvas.textContent = '';

    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    const root = el('g', {});
    canvas.appendChild(root);

    let run: Run = {
      width: 0,
      limit: 0,
      sequence: 'factorial',
      maxSteps: 1,
      kept: [],
      burst: null,
      ended: false,
    };

    const seqName = (id: string): string =>
      id === 'fibonacci'
        ? t('label.fibonacci', 'Fibonacci')
        : t('label.factorial', 'Factorial');

    /** `4!` · `F6` 은 수식 표기라 표식이다 — 키를 만들지 않는다 (C10 판정 3). */
    const termMark = (index: number): string =>
      run.sequence === 'fibonacci' ? `F${index}` : `${index}!`;

    function text(
      x: number,
      y: number,
      content: string,
      opts: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): void {
      const node = el('text', {
        x,
        y,
        'font-family': opts.mono === true ? fonts.mono : fonts.body,
        'font-size': opts.size,
        fill: opts.fill,
        'text-anchor': opts.anchor ?? 'start',
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = content;
      root.appendChild(node);
    }

    /** 로그 눈금에서의 채움 비율. 값이 1 에서 수십억까지 가므로 선형은 못 쓴다. */
    function fillFraction(value: number, limit: number): number {
      if (limit <= 1) return 1;
      const f = Math.log(Math.max(1, value) + 1) / Math.log(limit + 1);
      return Math.max(0, Math.min(1, f));
    }

    function draw(): void {
      root.textContent = '';
      if (run.width === 0) return;

      const burst = run.burst;
      const last = run.kept.length > 0 ? run.kept[run.kept.length - 1] : undefined;

      // ── 1. 그릇 ────────────────────────────────────────────────
      text(
        PAD,
        VESSEL_Y - 12,
        t('caption.vessel', 'Signed {width}-bit holds at most {limit}', {
          width: run.width,
          limit: groupDigits(run.limit),
        }),
        { size: fontSizes.sm, fill: colors.textMuted },
      );

      root.appendChild(
        el('rect', {
          x: PAD,
          y: VESSEL_Y,
          width: TRACK_W,
          height: VESSEL_H,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      const shown = burst !== null ? run.limit : (last?.value ?? 0);
      const frac = burst !== null ? 1 : fillFraction(shown, run.limit);
      if (frac > 0) {
        root.appendChild(
          el('rect', {
            x: PAD + 1,
            y: VESSEL_Y + 1,
            width: Math.max(2, (TRACK_W - 2) * frac),
            height: VESSEL_H - 2,
            rx: 5,
            fill: burst !== null ? colors.danger : colors.itemActive,
          }),
        );
      }

      // 전(rim) — 그릇의 오른쪽 끝.
      root.appendChild(
        el('line', {
          x1: PAD + TRACK_W,
          y1: VESSEL_Y - 6,
          x2: PAD + TRACK_W,
          y2: VESSEL_Y + VESSEL_H + 6,
          stroke: burst !== null ? colors.danger : colors.text,
          'stroke-width': 3,
        }),
      );

      // 넘친 것은 전 너머로 삐져나간다.
      if (burst !== null) {
        const tip = PAD + TRACK_W;
        root.appendChild(
          el('polygon', {
            points: `${tip + 4},${VESSEL_Y + 8} ${tip + 18},${VESSEL_Y + VESSEL_H / 2} ${tip + 4},${VESSEL_Y + VESSEL_H - 8}`,
            fill: colors.danger,
          }),
        );
      }

      // ── 2. 걸음 칸 ─────────────────────────────────────────────
      text(PAD, STEP_Y - 10, t('label.kept', 'Steps so far'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });

      const pitch = TRACK_W / run.maxSteps;
      const cell = Math.max(3, pitch - 3);

      root.appendChild(
        el('line', {
          x1: PAD,
          y1: STEP_Y + STEP_H + 6,
          x2: PAD + TRACK_W,
          y2: STEP_Y + STEP_H + 6,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      for (const item of run.kept) {
        root.appendChild(
          el('rect', {
            x: PAD + pitch * (item.index - 1),
            y: STEP_Y,
            width: cell,
            height: STEP_H,
            rx: 2,
            fill: colors.itemSorted,
          }),
        );
      }
      if (burst !== null) {
        root.appendChild(
          el('rect', {
            x: PAD + pitch * (burst.index - 1),
            y: STEP_Y - 4,
            width: cell,
            height: STEP_H + 8,
            rx: 2,
            fill: colors.danger,
          }),
        );
      }

      // ── 3. 값 읽기 ─────────────────────────────────────────────
      const markIndex = burst !== null ? burst.index : (last?.index ?? 1);
      text(PAD, READOUT_Y - 18, `${seqName(run.sequence)}   ${termMark(markIndex)}`, {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });

      if (burst !== null) {
        text(PAD, READOUT_Y + 12, groupDigits(burst.wrapped), {
          size: fontSizes.xl,
          fill: colors.danger,
          mono: true,
          weight: '700',
        });
      } else if (last !== undefined) {
        text(PAD, READOUT_Y + 12, groupDigits(last.value), {
          size: fontSizes.xl,
          fill: colors.text,
          mono: true,
          weight: '700',
        });
      }

      // ── 4. 캡션 두 줄 ──────────────────────────────────────────
      if (burst !== null) {
        text(
          PAD,
          CAPTION_Y,
          t(
            'caption.overflow',
            'Step {step} overflows. True value {truth}, what remains {wrapped}',
            {
              step: burst.index,
              truth: groupDigits(burst.truth),
              wrapped: groupDigits(burst.wrapped),
            },
          ),
          { size: fontSizes.sm, fill: colors.text },
        );
        const verdict =
          burst.wrapped < 0
            ? t('caption.wentNegative', 'A positive number turned negative.')
            : t('caption.wentSmaller', 'The number suddenly got smaller.');
        text(
          PAD,
          CAPTION_Y + CAPTION_LINE,
          `${verdict}  ${run.ended ? t('caption.silent', 'Nothing warned you.') : ''}`.trim(),
          { size: fontSizes.sm, fill: colors.textMuted },
        );
      } else if (last !== undefined) {
        text(
          PAD,
          CAPTION_Y,
          t('caption.fits', 'Step {step} fits — {value}', {
            step: last.index,
            value: groupDigits(last.value),
          }),
          { size: fontSizes.sm, fill: colors.textMuted },
        );
      }
    }

    draw();

    return {
      destroy() {
        // 타이머도 관찰자도 두지 않는다 — 걸음의 박자는 알고리즘의 sleep 이 진다.
        if (root.parentNode) root.parentNode.removeChild(root);
      },

      /** 한 회차의 시작. 손잡이가 바뀌면 여기부터 다시 그린다. */
      setVessel(width: number, limit: number, sequence: string, maxSteps: number) {
        run = { width, limit, sequence, maxSteps, kept: [], burst: null, ended: false };
        draw();
      },

      /** 그릇에 담긴 항 하나. */
      setStep(index: number, value: number) {
        run.kept.push({ index, value });
        draw();
      },

      /** 넘치는 항. `wrapped` 는 기계에 실제로 남는 값이다. */
      setOverflow(index: number, truth: number, wrapped: number) {
        run.burst = { index, truth, wrapped };
        draw();
      },

      /** 다 보였다. */
      setDone() {
        run.ended = true;
        draw();
      },
    };
  },
};

export { CANVAS_W, CANVAS_H, groupDigits };
