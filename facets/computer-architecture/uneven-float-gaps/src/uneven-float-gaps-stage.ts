/**
 * 고르지 않은 눈금 — 그림.
 *
 * 동사는 "벌어진다". 그런데 1 의 사이 거리와 65,536 의 사이 거리는 65,536 배
 * 차이라, 한 축척에 같이 올리면 한쪽이 점이 되어 아무 일도 일어나지 않는 화면이
 * 된다. 그래서 **카메라가 물러선다** — 걸음마다 지금 칸이 앞 눈금 하나 크기로
 * 줄어들고(물러섬), 새 지점의 이웃이 다시 화면 끝까지 달아난다(벌어짐).
 *
 * 한 걸음 안의 비율은 축척에 기대지 않는다. 앞 눈금 몇 개가 새 칸에 들어가는지를
 * **빗살로 세어 보인다** — 2 개, 8 개, 64 개, 64 개. 그 빗살이 "배로 멀어진다" 의
 * 증거이고, 축척이 걸음 사이에 바뀐다는 전제는 글이 밝힌다 (description.ts).
 *
 * 잰 값은 재는 자리에 남긴다 — 사이 거리는 두 눈금 사이의 자 위에, 값은 제 눈금
 * 아래에 붙는다. 옆의 계기로 날려 보내지 않는다 (S-piece).
 *
 * 세로는 이 파일이 정하고, 가로는 러너가 정한다 (PIECE_CANVAS_W).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 마운트한 뒤 바뀌지 않는다. 바뀌면 글 안의 위아래 문단이 밀린다 (S-view). */
const H = 288;

/** 기준 눈금이 서는 자리와 칸이 뻗는 끝. 남는 폭을 여백으로 버리지 않는다. */
const X0 = 56;
const X1 = W - 44;
const BAR = X1 - X0;

const BADGE_TOP = 30;
const BADGE_H = 24;
const BADGE_BASELINE = 47;
const GAP_TEXT_Y = 98;
const SPAN_Y = 122;
const SERIF = 6;
const VALUE_Y = 152;
const RAIL_Y = 176;
const TICK_TOP = 160;
const TICK_BOTTOM = 192;
const NEIGHBOUR_TOP = 164;
const NEIGHBOUR_BOTTOM = 188;
const COMB_TOP = 178;
const COMB_BOTTOM = 190;
const COMB_LABEL_Y = 212;
const OCTAVE_Y = 240;
const CAPTION_Y = 272;

const SWEEP_W = 72;
const SWEEP_TOP = 156;
const SWEEP_H = 38;

const FRAME_MS = 16;
const OPEN_MS = 700;
const PULL_BACK_MS = 340;
const RUN_AWAY_MS = 660;
const SWEEP_MS = 620;

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name) as SVGElementTagNameMap[K];
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 자리 구분은 쉼표로. */
function group(n: number): string {
  return n.toLocaleString('en-US');
}

function superscript(n: number): string {
  const digits = String(Math.abs(n))
    .split('')
    .map((d) => SUPERSCRIPT[Number(d)] ?? '')
    .join('');
  return (n < 0 ? '⁻' : '') + digits;
}

/**
 * 사이 거리 표기 — `2⁻²³ = 0.00000011920928955078125`.
 *
 * 수식 기호 표기라 문안이 아니다 (C10 의 표식 판정 3). 십진 전개는 `toFixed` 로
 * 얻는데, 2 의 음수 거듭제곱은 십진에서 정확히 끝나므로 |지수| 자리까지 펴면
 * 반올림 없이 그 수 자체가 된다.
 */
function notation(gap: number, gapExp: number): string {
  return `2${superscript(gapExp)} = ${gap.toFixed(Math.abs(gapExp))}`;
}

type Scene = { samples: number[] };

/** initialData 를 좁히는 자리는 mount 다 (S-piece). projector 는 다시 좁히지 않는다. */
function readScene(initialData: ViewMountParams['initialData']): Scene {
  const raw = (initialData ?? {}) as Record<string, unknown>;
  const samples = Array.isArray(raw.samples)
    ? raw.samples.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [];
  return { samples };
}

export const unevenFloatGapsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 러너가 먼저 붙여 둔 캔버스가
    // 통째로 떨어져 나가고, 예외도 안 나면서 그림만 사라진다 (S-view).
    svg.textContent = '';

    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

    const sweep = el('rect', {
      x: X0,
      y: SWEEP_TOP,
      width: SWEEP_W,
      height: SWEEP_H,
      fill: colors.accent,
      opacity: 0,
    });
    const rail = el('line', {
      x1: X0,
      y1: RAIL_Y,
      x2: X1,
      y2: RAIL_Y,
      stroke: colors.border,
      'stroke-width': 2,
    });
    const comb = el('g', {});
    const anchorTick = el('line', {
      x1: X0,
      y1: TICK_TOP,
      x2: X0,
      y2: TICK_BOTTOM,
      stroke: colors.text,
      'stroke-width': 3,
    });
    const neighbourTick = el('line', {
      x1: X0,
      y1: NEIGHBOUR_TOP,
      x2: X0,
      y2: NEIGHBOUR_BOTTOM,
      stroke: colors.itemActive,
      'stroke-width': 3,
    });
    const spanLine = el('line', {
      x1: X0,
      y1: SPAN_Y,
      x2: X0,
      y2: SPAN_Y,
      stroke: colors.itemActive,
      'stroke-width': 1.5,
    });
    const spanLeft = el('line', {
      x1: X0,
      y1: SPAN_Y - SERIF,
      x2: X0,
      y2: SPAN_Y + SERIF,
      stroke: colors.itemActive,
      'stroke-width': 1.5,
    });
    const spanRight = el('line', {
      x1: X0,
      y1: SPAN_Y - SERIF,
      x2: X0,
      y2: SPAN_Y + SERIF,
      stroke: colors.itemActive,
      'stroke-width': 1.5,
    });

    const gapText = el('text', {
      x: (X0 + X1) / 2,
      y: GAP_TEXT_Y,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    const valueText = el('text', {
      x: X0,
      y: VALUE_Y,
      'text-anchor': 'start',
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    const nextText = el('text', {
      x: X0,
      y: VALUE_Y,
      'text-anchor': 'end',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: colors.itemActive,
    });
    const combLabel = el('text', {
      x: (X0 + X1) / 2,
      y: COMB_LABEL_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    const octaveLabel = el('text', {
      x: (X0 + X1) / 2,
      y: OCTAVE_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    const badgeRect = el('rect', {
      x: X1,
      y: BADGE_TOP,
      width: 0,
      height: BADGE_H,
      rx: 5,
      fill: colors.accent,
      opacity: 0,
    });
    const badgeText = el('text', {
      x: X1,
      y: BADGE_BASELINE,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      // 고정 타일(accent) 위의 잉크는 테마를 따라 뒤집지 않는다 (design-tokens).
      fill: colors.stateInk,
    });
    const badgeLabel = el('text', {
      x: X1,
      y: BADGE_BASELINE,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    const captionText = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });

    for (const node of [
      sweep,
      rail,
      comb,
      anchorTick,
      neighbourTick,
      spanLine,
      spanLeft,
      spanRight,
      gapText,
      valueText,
      nextText,
      combLabel,
      octaveLabel,
      badgeRect,
      badgeText,
      badgeLabel,
      captionText,
    ]) {
      svg.appendChild(node);
    }

    let gapPx = 0;
    let teeth: Array<{ node: SVGLineElement; x: number }> = [];

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
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

    async function tween(ms: number, apply: (progress: number) => void): Promise<void> {
      const frames = Math.max(1, Math.round(ms / FRAME_MS));
      for (let i = 1; i <= frames; i += 1) {
        await wait(FRAME_MS);
        if (destroyed) return;
        const p = i / frames;
        apply(1 - (1 - p) ** 3);
      }
    }

    /** 이웃 눈금이 선 자리에 맞춰 자·빗살·값을 다시 앉힌다. */
    function paint(): void {
      const nx = X0 + gapPx;
      neighbourTick.setAttribute('x1', String(nx));
      neighbourTick.setAttribute('x2', String(nx));
      spanLine.setAttribute('x2', String(nx));
      spanRight.setAttribute('x1', String(nx));
      spanRight.setAttribute('x2', String(nx));
      nextText.setAttribute('x', String(nx));
      for (const tooth of teeth) {
        // 이웃이 지나간 자리에만 빗살이 남는다 — 지나가며 눈금을 새기는 셈이다.
        tooth.node.setAttribute('opacity', tooth.x <= nx + 0.5 ? '1' : '0');
      }
    }

    function setComb(k: number): void {
      comb.textContent = '';
      teeth = [];
      combLabel.textContent = '';
      if (k < 2) return;
      const unit = BAR / k;
      for (let j = 1; j <= k; j += 1) {
        const x = X0 + unit * j;
        const node = el('line', {
          x1: x,
          y1: COMB_TOP,
          x2: x,
          y2: COMB_BOTTOM,
          stroke: colors.textMuted,
          'stroke-width': 1,
          opacity: 0,
        });
        comb.appendChild(node);
        teeth.push({ node, x });
      }
      combLabel.textContent = t('label.notches', '{k} × the previous notch', { k: group(k) });
    }

    function setBadge(cumulative: number | null): void {
      if (cumulative === null) {
        badgeRect.setAttribute('opacity', '0');
        badgeText.textContent = '';
        badgeLabel.textContent = '';
        return;
      }
      // 배수 표기 — 수식 기호라 문안이 아니다 (C10).
      const stamp = `×${group(cumulative)}`;
      const width = stamp.length * 8 + 20;
      badgeText.textContent = stamp;
      badgeText.setAttribute('x', String(X1 - width / 2));
      badgeRect.setAttribute('x', String(X1 - width));
      badgeRect.setAttribute('width', String(width));
      badgeRect.setAttribute('opacity', '1');
      badgeLabel.textContent = t('label.times', 'vs. the first notch');
      badgeLabel.setAttribute('x', String(X1 - width - 10));
    }

    function reset(): void {
      gapPx = 0;
      setComb(0);
      setBadge(null);
      octaveLabel.textContent = '';
      nextText.textContent = '';
      gapText.textContent = '';
      valueText.textContent = scene.samples.length > 0 ? group(scene.samples[0]) : '';
      sweep.setAttribute('opacity', '0');
      paint();
    }

    reset();

    return {
      setCaption(value: string): void {
        captionText.textContent = value;
      },

      /** 첫 칸을 연다 — 이웃이 기준 눈금에서 화면 끝까지 나아간다. */
      async showAnchor(p: {
        value: number;
        next: number;
        gap: number;
        gapExp: number;
      }): Promise<void> {
        reset();
        valueText.textContent = group(p.value);
        gapText.textContent = notation(p.gap, p.gapExp);
        await tween(OPEN_MS, (q) => {
          gapPx = BAR * q;
          paint();
        });
        if (destroyed) return;
        nextText.textContent = String(p.next);
      },

      /**
       * 다음 지점으로 간다. 두 몸짓이다 —
       * 카메라가 물러서고(지금 칸이 앞 눈금 하나로 줄고), 새 이웃이 달아난다.
       */
      async widen(p: {
        value: number;
        next: number;
        gap: number;
        gapExp: number;
        k: number;
        cumulative: number;
      }): Promise<void> {
        const k = Math.max(2, Math.round(p.k));
        setComb(0);
        nextText.textContent = '';

        const stub = BAR / k;
        const from = gapPx;
        await tween(PULL_BACK_MS, (q) => {
          gapPx = from + (stub - from) * q;
          paint();
        });
        if (destroyed) return;

        valueText.textContent = group(p.value);
        gapText.textContent = notation(p.gap, p.gapExp);
        setComb(k);
        setBadge(p.cumulative);
        paint();

        await tween(RUN_AWAY_MS, (q) => {
          gapPx = stub + (BAR - stub) * q;
          paint();
        });
        if (destroyed) return;
        nextText.textContent = String(p.next);
      },

      /** 이런 칸이 몇 개 모여 한 구간이 되는지 — 칸 위를 한 번 훑는다. */
      async showOctave(p: { count: number; from: number; to: number }): Promise<void> {
        octaveLabel.textContent = t(
          'label.octave',
          '{count} such gaps fill one span: {from} to {to}',
          { count: group(p.count), from: group(p.from), to: group(p.to) },
        );
        sweep.setAttribute('opacity', '0.18');
        await tween(SWEEP_MS, (q) => {
          sweep.setAttribute('x', String(X0 + (BAR - SWEEP_W) * q));
        });
        if (destroyed) return;
        sweep.setAttribute('opacity', '0');
      },

      rewind(): void {
        reset();
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
