/**
 * t-digest stage — 분위 자로 나눈 뭉치와, δ 를 늘렸을 때의 상대 값 오차를 그린다.
 *
 * 세 층으로 읽힌다.
 *   1. 분위 자    뭉치를 q 폭에 비례해 늘어놓는다. 꼬리에서 좁고 가운데에서 넓은
 *                 것이 **폭 그 자체로** 보여야 한다.
 *   2. 질의 둘    q=0.99 와 q=0.50 에 답하고 참값과 견준다.
 *   3. δ 견주기   δ 넷의 값 오차를 나란히 세운다. "꼬리가 가운데보다 빠르게
 *                 준다" 는 한 δ 만 보아서는 읽을 수 없고 견주어야 읽힌다.
 *
 * 세로는 mount 에서 한 번 정하고 그 뒤로 바꾸지 않는다 (S-view). 뭉치가 δ=6 의
 * 셋에서 δ=48 의 스물넷으로 늘어도 가로로만 잘게 갈릴 뿐 높이는 그대로다.
 *
 * **타이머도 프레임 루프도 두지 않는다.** 모든 메서드는 받은 값으로 즉시 다시
 * 그리고 끝난다. 그래서 `destroy()` 가 거둘 뒷일이 없다 — 이 문장은 사실이어야
 * 하므로, 나중에 애니메이션을 넣는다면 이 주석부터 고쳐야 한다.
 */

import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
  type CanvasView,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 330;
const AXIS_L = 56;
const AXIS_R = 680;
const AXIS_W = AXIS_R - AXIS_L;

/** 뭉치 띠. */
const CELL_Y = 40;
const CELL_H = 40;
/** 질의 둘. */
const PROBE_Y = 116;
/** δ 견주기. */
const SWEEP_HEAD_Y = 212;
const SWEEP_COL_L = 150;
const SWEEP_COL_W = 130;
const BAR_MAX = 96;

/** 도형에 새겨진 표식 — 번역하면 화면과 어긋난다 (C10). */
const SYM_Q = 'q';
const SYM_DELTA = 'δ';
/** 아직 셈하기 전임을 뜻하는 자리표. 0 을 적으면 없는 상태를 주장하게 된다. */
const SYM_PENDING = '—';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(
  x: number,
  y: number,
  content: string,
  opts: { fill: string; size?: string; anchor?: string; weight?: string; mono?: boolean },
): SVGTextElement {
  const t = el('text', {
    x,
    y,
    fill: opts.fill,
    'font-size': opts.size ?? fontSizes.xs,
    'font-family': opts.mono ? fonts.mono : fonts.body,
    'text-anchor': opts.anchor ?? 'start',
  });
  if (opts.weight) t.setAttribute('font-weight', opts.weight);
  t.textContent = content;
  return t;
}

const qx = (q: number): number => AXIS_L + q * AXIS_W;
const fmtValue = (v: number): string => v.toFixed(1);
/** 오차는 백분율이라 사양표와 같은 소수 한 자리로 적는다. */
const fmtErr = (v: number): string => v.toFixed(1);

export const tDigestStageView: CanvasView = {
  canvas: { width: W, height: H },

  mount(
    // 컨테이너에는 손대지 않는다 — 그릴 자리는 러너가 이미 붙여 준 캔버스다.
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었으므로 비우면
    // 그림이 통째로 사라진다 (S-view). 지울 것은 캔버스 안쪽뿐이다.
    const svg = params.canvas;
    svg.textContent = '';

    const colors: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    const init = (params.initialData ?? {}) as Record<string, unknown>;
    const initialDelta = typeof init.delta === 'number' ? init.delta : 0;
    const initialTotal = typeof init.count === 'number' ? init.count : 0;

    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }));

    // 층마다 제 무리를 두고, 갱신은 그 무리만 비우고 다시 그린다.
    const cellsG = el('g', {});
    const probeG = el('g', {});
    const sweepG = el('g', {});
    const headG = el('g', {});
    svg.append(headG, cellsG, probeG, sweepG);

    // bucketCount 가 null 이면 아직 첫 이벤트가 오기 전이다. 그때 0 을 적으면
    // "δ=12 인데 뭉치 0" 이라는 있지도 않은 상태를 화면이 주장하게 된다.
    function drawFrame(delta: number, total: number, bucketCount: number | null): void {
      headG.textContent = '';
      headG.appendChild(
        text(AXIS_L, 24, tr('label.axis', 'Quantile q'), {
          fill: colors.textMuted,
          size: fontSizes.sm,
        }),
      );
      headG.appendChild(
        text(
          AXIS_R,
          24,
          tr('label.digest', '{sym} = {delta}, buckets {count}', {
            sym: SYM_DELTA,
            delta,
            count: bucketCount ?? SYM_PENDING,
          }),
          { fill: colors.text, size: fontSizes.sm, anchor: 'end', weight: '600' },
        ),
      );
      // 분위 눈금 — 0 / 0.5 / 1 은 수식 표기라 표식이다.
      for (const q of [0, 0.5, 1]) {
        headG.appendChild(
          el('line', {
            x1: qx(q),
            y1: CELL_Y + CELL_H,
            x2: qx(q),
            y2: CELL_Y + CELL_H + 5,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        headG.appendChild(
          text(qx(q), CELL_Y + CELL_H + 17, q.toFixed(1), {
            fill: colors.textMuted,
            anchor: 'middle',
            mono: true,
          }),
        );
      }
      headG.appendChild(
        text(
          AXIS_R,
          CELL_Y + CELL_H + 17,
          tr('label.cellHint', 'each cell holds this many of {total} points', {
            total,
          }),
          { fill: colors.textMuted, anchor: 'end' },
        ),
      );
    }

    function drawCells(buckets: { q0: number; q1: number; weight: number }[]): void {
      cellsG.textContent = '';
      for (const b of buckets) {
        const x0 = qx(b.q0);
        const x1 = qx(b.q1);
        const w = Math.max(1, x1 - x0);
        cellsG.appendChild(
          el('rect', {
            x: x0,
            y: CELL_Y,
            width: w,
            height: CELL_H,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
            rx: 2,
          }),
        );
        // 좁은 칸에 숫자를 우겨넣으면 글자가 겹쳐 읽을 수 없게 된다.
        // 꼬리 칸이 좁다는 것은 폭으로 이미 말하고 있으므로 숫자는 생략한다.
        if (w >= 24) {
          cellsG.appendChild(
            text(x0 + w / 2, CELL_Y + CELL_H / 2 + 4, String(b.weight), {
              fill: colors.text,
              anchor: 'middle',
              mono: true,
            }),
          );
        }
      }
    }

    // en 원본은 **호출부에 리터럴로** 있어야 한다 (C10). 같은 문안을 질의 패널과
    // δ 견주기 두 곳에서 쓰므로 헬퍼로 묶어 리터럴이 한 번씩만 나오게 한다.
    const labelTail = () => tr('label.tail', 'Tail');
    const labelMiddle = () => tr('label.middle', 'Middle');

    /** 질의 둘의 자리를 잡아 둔다. 값은 showProbe 가 채운다. */
    const probeSlots = new Map<
      'tail' | 'middle',
      { x: number; accent: string; label: () => string }
    >([
      ['tail', { x: AXIS_L, accent: colors.accent, label: labelTail }],
      ['middle', { x: AXIS_L + 330, accent: colors.auxCursor, label: labelMiddle }],
    ]);
    const probeState = new Map<
      'tail' | 'middle',
      { q: number; estimate: number; truth: number; valueError: number }
    >();

    function drawProbes(): void {
      probeG.textContent = '';
      for (const [key, slot] of probeSlots) {
        const got = probeState.get(key);
        const x = slot.x;
        probeG.appendChild(
          el('rect', {
            x,
            y: PROBE_Y,
            width: 300,
            height: 72,
            fill: colors.bg,
            stroke: colors.border,
            'stroke-width': 1,
            rx: 4,
          }),
        );
        probeG.appendChild(
          el('rect', { x, y: PROBE_Y, width: 3, height: 72, fill: slot.accent }),
        );
        probeG.appendChild(
          text(x + 14, PROBE_Y + 19, slot.label(), {
            fill: colors.text,
            size: fontSizes.sm,
            weight: '600',
          }),
        );
        if (!got) continue;

        // `q = 0.99` 는 수식 표기라 표식이다 (C10).
        probeG.appendChild(
          text(x + 286, PROBE_Y + 19, `${SYM_Q} = ${got.q.toFixed(2)}`, {
            fill: colors.textMuted,
            anchor: 'end',
            mono: true,
          }),
        );
        probeG.appendChild(
          text(
            x + 14,
            PROBE_Y + 38,
            tr('label.answer', 'answers {value}', { value: fmtValue(got.estimate) }),
            { fill: colors.text },
          ),
        );
        probeG.appendChild(
          text(
            x + 286,
            PROBE_Y + 38,
            tr('label.truth', 'truth {value}', { value: fmtValue(got.truth) }),
            { fill: colors.textMuted, anchor: 'end' },
          ),
        );
        probeG.appendChild(
          text(
            x + 14,
            PROBE_Y + 60,
            tr('label.valueOff', 'off by {value}%', { value: fmtErr(got.valueError) }),
            { fill: slot.accent, size: fontSizes.sm, weight: '600' },
          ),
        );

        // 분위 자 위의 그 자리를 같이 짚는다.
        probeG.appendChild(
          el('line', {
            x1: qx(got.q),
            y1: CELL_Y - 8,
            x2: qx(got.q),
            y2: CELL_Y + CELL_H,
            stroke: slot.accent,
            'stroke-width': 2,
          }),
        );
      }
    }

    function drawSweep(
      current: number,
      rows: { delta: number; tailError: number; middleError: number }[],
    ): void {
      sweepG.textContent = '';
      sweepG.appendChild(
        text(AXIS_L, SWEEP_HEAD_Y, tr('label.sweep', 'Value error as {sym} grows', { sym: SYM_DELTA }), {
          fill: colors.text,
          size: fontSizes.sm,
          weight: '600',
        }),
      );

      let worst = 0;
      for (const r of rows) worst = Math.max(worst, r.tailError, r.middleError);
      const scale = worst > 0 ? BAR_MAX / worst : 0;

      const bands: {
        key: 'tail' | 'middle';
        y: number;
        pick: (r: { tailError: number; middleError: number }) => number;
        color: string;
        label: () => string;
      }[] = [
        {
          key: 'tail',
          y: SWEEP_HEAD_Y + 30,
          pick: (r) => r.tailError,
          color: colors.accent,
          label: labelTail,
        },
        {
          key: 'middle',
          y: SWEEP_HEAD_Y + 68,
          pick: (r) => r.middleError,
          color: colors.auxCursor,
          label: labelMiddle,
        },
      ];

      // δ 머리글 — 지금 고른 것에 칩을 씌운다.
      rows.forEach((r, i) => {
        const cx = SWEEP_COL_L + i * SWEEP_COL_W;
        const isCurrent = r.delta === current;
        if (isCurrent) {
          sweepG.appendChild(
            el('rect', {
              x: cx - 6,
              y: SWEEP_HEAD_Y - 13,
              width: 46,
              height: 18,
              fill: colors.accent,
              rx: 3,
            }),
          );
        }
        sweepG.appendChild(
          text(cx, SWEEP_HEAD_Y, `${SYM_DELTA} ${r.delta}`, {
            // accent 타일 위의 잉크는 stateInk 다 (design-tokens 의 표).
            fill: isCurrent ? colors.stateInk : colors.textMuted,
            mono: true,
            weight: isCurrent ? '600' : '400',
          }),
        );
      });

      for (const band of bands) {
        sweepG.appendChild(
          text(AXIS_L, band.y + 11, band.label(), {
            fill: colors.textMuted,
            size: fontSizes.sm,
          }),
        );
        rows.forEach((r, i) => {
          const cx = SWEEP_COL_L + i * SWEEP_COL_W;
          const v = band.pick(r);
          const len = Math.max(1, v * scale);
          sweepG.appendChild(
            el('rect', {
              x: cx,
              y: band.y,
              width: len,
              height: 14,
              fill: band.color,
              rx: 2,
              opacity: r.delta === current ? 1 : 0.45,
            }),
          );
          sweepG.appendChild(
            text(cx, band.y + 30, fmtErr(v), {
              fill: r.delta === current ? colors.text : colors.textMuted,
              mono: true,
              weight: r.delta === current ? '600' : '400',
            }),
          );
        });
      }

      sweepG.appendChild(
        text(
          AXIS_L,
          H - 10,
          tr(
            'caption.claim',
            'Raise {sym} and the tail sharpens faster than the middle — that is what crowding the tails buys.',
            { sym: SYM_DELTA },
          ),
          { fill: colors.textMuted },
        ),
      );
    }

    function resetToInitial(): void {
      probeState.clear();
      cellsG.textContent = '';
      probeG.textContent = '';
      sweepG.textContent = '';
      drawFrame(initialDelta, initialTotal, null);
      drawProbes();
    }

    resetToInitial();

    return {
      destroy() {
        // 타이머도 프레임 루프도 관찰자도 걸지 않았으므로 거둘 것이 없다.
        // 캔버스는 러너가 컨테이너째 걷어낸다.
        svg.textContent = '';
      },

      showDigest(d: { delta: number; total: number; buckets: { q0: number; q1: number; weight: number }[] }) {
        drawFrame(d.delta, d.total, d.buckets.length);
        drawCells(d.buckets);
        // δ 가 바뀌면 앞선 δ 의 답은 더 이상 이 그림의 것이 아니다.
        probeState.clear();
        drawProbes();
      },

      showProbe(p: {
        key: 'tail' | 'middle';
        q: number;
        estimate: number;
        truth: number;
        valueError: number;
      }) {
        probeState.set(p.key, {
          q: p.q,
          estimate: p.estimate,
          truth: p.truth,
          valueError: p.valueError,
        });
        drawProbes();
      },

      showSweep(s: {
        current: number;
        rows: { delta: number; tailError: number; middleError: number }[];
      }) {
        drawSweep(s.current, s.rows);
      },

      resetToInitial,
    };
  },
};
