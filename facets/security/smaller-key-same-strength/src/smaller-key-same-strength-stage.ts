/**
 * smaller-key-same-strength 무대.
 *
 * 강도 단마다 한 줄. 줄마다 두 열쇠를 같은 축척의 막대로 왼쪽 끝을 맞춰 놓는다 —
 * 위가 RSA, 아래가 타원 곡선. 새 단이 드러나면 두 막대가 앞 단의 길이에서 출발해
 * 새 길이까지 **나란히 늘어나고**, 두 끝 사이의 차 괄호도 함께 늘어난다.
 * 드러난 단의 막대 끝을 잇는 두 줄이 아래로 내려가며 벌어진다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SmallerKeyScene } from './scene.js';

const H = 320;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MOTION_MS = 600;
const FRAME_MS = 16;

/** 캡션 · 머리줄 · 줄 영역의 세로 자리 */
const CAPTION_Y = 20;
const HEADER_Y = 50;
const ROWS_TOP = 64;
const ROWS_BOTTOM = H - 8;

/** 한 줄 안의 두 막대 */
const BAR_H = 14;
const BAR_GAP = 6;

const PAD = 8;

function round1(v: number): number {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function easeOut(k: number): number {
  return 1 - (1 - k) ** 3;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

type Grow = { readonly index: number; readonly k: number; readonly fromRsa: number; readonly fromEcc: number };

export const smallerKeySameStrengthStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const sides = categorical(2);
    const rsaColor = sides[0];
    const eccColor = sides[1];
    if (rsaColor === undefined || eccColor === undefined) {
      throw new Error('smaller-key-same-strength-stage: categorical(2) 가 두 색을 주지 않았다');
    }

    const smPx = parseFloat(fontSizes.sm);
    const digitW = smPx * 0.62;

    /** 열의 오른쪽 끝 */
    const GAP_RIGHT = W - PAD;
    const RATIO_RIGHT = W - PAD - Math.round(smPx * 6.5);
    /** 강도 열의 오른쪽 끝과 막대의 출발점 */
    const STRENGTH_RIGHT = Math.round(smPx * 4.2);
    const X0 = STRENGTH_RIGHT + 14;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      x: number,
      y: number,
      text: string,
      opts: { size: string; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; family?: string },
    ): void {
      const node = el('text', {
        x: round1(x),
        y: round1(y),
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size,
        fill: opts.fill,
        'text-anchor': opts.anchor ?? 'start',
        'font-weight': opts.weight ?? 400,
      });
      node.textContent = text;
    }

    function drawStatic(scene: SmallerKeyScene, grow: Grow | null): void {
      svg.textContent = '';
      const n = scene.table.length;
      if (n === 0) throw new Error('smaller-key-same-strength-stage: 강도 단이 없다');
      let maxBits = 0;
      for (const level of scene.table) maxBits = Math.max(maxBits, level.rsa);
      const maxDigits = String(maxBits).length;
      const barRight = RATIO_RIGHT - Math.round(smPx * 5) - Math.round(digitW * maxDigits) - 8;
      const scale = (barRight - X0) / maxBits;
      const rowH = (ROWS_BOTTOM - ROWS_TOP) / n;
      const rowPad = (rowH - (BAR_H * 2 + BAR_GAP)) / 2;
      if (rowPad < 1) throw new Error('smaller-key-same-strength-stage: 줄이 두 막대를 담기에 좁다');

      const rowTop = (i: number): number => ROWS_TOP + i * rowH + rowPad;
      const xOf = (bits: number): number => X0 + bits * scale;

      // 캡션 — 지금 일어난 일만
      const last = scene.rows[scene.rows.length - 1];
      let caption: string;
      if (last === undefined) {
        caption = t('caption.start', 'Strength levels to compare: {count}', { count: n });
      } else {
        const before = scene.rows[scene.rows.length - 2];
        caption =
          before === undefined
            ? t('caption.first', 'Strength {s}: ratio ×{ratio}, gap {gap} bits', {
                s: last.strength,
                ratio: last.ratio.toFixed(1),
                gap: last.gap,
              })
            : t('caption.widen', 'Strength {s}: ratio ×{fromRatio} → ×{ratio}, gap {fromGap} → {gap} bits', {
                s: last.strength,
                fromRatio: before.ratio.toFixed(1),
                ratio: last.ratio.toFixed(1),
                fromGap: before.gap,
                gap: last.gap,
              });
      }
      label(PAD, CAPTION_Y, caption, { size: fontSizes.md, fill: colors.text, weight: 600 });

      // 머리줄 — 열 이름과 두 쪽의 표시
      const xs = fontSizes.xs;
      label(STRENGTH_RIGHT, HEADER_Y, t('label.strength', 'Strength'), { size: xs, fill: colors.textMuted, anchor: 'end' });
      el('rect', { x: X0, y: HEADER_Y - 9, width: 10, height: 10, rx: 2, fill: rsaColor });
      label(X0 + 14, HEADER_Y, t('label.rsa', 'RSA'), { size: xs, fill: colors.text });
      const eccLegendX = X0 + Math.round(smPx * 7);
      el('rect', { x: eccLegendX, y: HEADER_Y - 9, width: 10, height: 10, rx: 2, fill: eccColor });
      label(eccLegendX + 14, HEADER_Y, t('label.ecc', 'Elliptic curve'), { size: xs, fill: colors.text });
      label(RATIO_RIGHT, HEADER_Y, t('label.ratio', 'Ratio'), { size: xs, fill: colors.textMuted, anchor: 'end' });
      label(GAP_RIGHT, HEADER_Y, t('label.gap', 'Gap'), { size: xs, fill: colors.textMuted, anchor: 'end' });
      el('line', {
        x1: PAD,
        y1: HEADER_Y + 6,
        x2: W - PAD,
        y2: HEADER_Y + 6,
        stroke: colors.border,
        'stroke-width': 1,
      });

      // 출발선 — 두 열쇠가 모두 여기서 잰다
      el('line', {
        x1: X0,
        y1: ROWS_TOP + 2,
        x2: X0,
        y2: ROWS_BOTTOM - 2,
        stroke: colors.border,
        'stroke-width': 1,
      });

      // 강도 열 — 단 목록은 처음부터 있다. 드러난 단만 진하게
      scene.table.forEach((level, i) => {
        const revealed = i < scene.rows.length;
        label(STRENGTH_RIGHT, rowTop(i) + BAR_H + BAR_GAP / 2 + smPx * 0.35, String(level.strength), {
          size: fontSizes.sm,
          fill: revealed ? colors.text : colors.textMuted,
          anchor: 'end',
          weight: revealed ? 600 : 400,
          family: fonts.mono,
        });
      });

      // 드러난 단의 두 길이 — 지금 늘어나는 단은 그 자리까지 아직 못 온 만큼으로
      const lengths = scene.rows.map((row, i) => {
        const moving = grow !== null && grow.index === i;
        const k = moving ? easeOut(grow.k) : 1;
        return {
          moving,
          rsaBits: moving ? lerp(grow.fromRsa, row.rsa, k) : row.rsa,
          eccBits: moving ? lerp(grow.fromEcc, row.ecc, k) : row.ecc,
          top: rowTop(i),
        };
      });

      // 벌어지는 두 줄 — 드러난 단의 막대 끝을 잇는다. 막대와 수 아래에 깐다
      if (lengths.length >= 2) {
        const rsaPts = lengths.map((e) => `${round1(xOf(e.rsaBits))},${round1(e.top + BAR_H / 2)}`).join(' ');
        const eccPts = lengths
          .map((e) => `${round1(xOf(e.eccBits))},${round1(e.top + BAR_H * 1.5 + BAR_GAP)}`)
          .join(' ');
        el('polyline', { points: rsaPts, fill: 'none', stroke: rsaColor, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' });
        el('polyline', { points: eccPts, fill: 'none', stroke: eccColor, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' });
      }

      scene.rows.forEach((row, i) => {
        const len = lengths[i];
        if (len === undefined) throw new Error(`smaller-key-same-strength-stage: rows[${i}] 의 길이가 없다`);
        const { moving, rsaBits, eccBits, top } = len;
        const current = i === scene.rows.length - 1;

        el('rect', { x: X0, y: round1(top), width: round1(rsaBits * scale), height: BAR_H, fill: rsaColor });
        el('rect', {
          x: X0,
          y: round1(top + BAR_H + BAR_GAP),
          width: round1(Math.max(eccBits * scale, 1)),
          height: BAR_H,
          fill: eccColor,
        });

        // 차 괄호 — 타원 곡선의 끝에서 RSA 의 끝까지
        const by = round1(top + BAR_H + BAR_GAP / 2);
        const bx1 = round1(xOf(eccBits));
        const bx2 = round1(xOf(rsaBits));
        const bracketColor = current ? colors.text : colors.textMuted;
        const bracketW = current ? 2 : 1;
        el('line', { x1: bx1, y1: by, x2: bx2, y2: by, stroke: bracketColor, 'stroke-width': bracketW });
        el('line', { x1: bx2, y1: by - 3, x2: bx2, y2: by + 3, stroke: bracketColor, 'stroke-width': bracketW });

        if (moving) return;
        // 길이 · 배율 · 차의 수 — 단이 선 뒤에 붙는다
        const weight = current ? 700 : 400;
        const ink = current ? colors.text : colors.textMuted;
        label(xOf(row.rsa) + 4, top + BAR_H - 3, String(row.rsa), {
          size: fontSizes.xs,
          fill: colors.text,
          family: fonts.mono,
          weight,
        });
        label(xOf(row.ecc) + 4, top + BAR_H * 2 + BAR_GAP - 3, String(row.ecc), {
          size: fontSizes.xs,
          fill: colors.text,
          family: fonts.mono,
          weight,
        });
        const midY = top + BAR_H + BAR_GAP / 2 + smPx * 0.35;
        label(RATIO_RIGHT, midY, `×${row.ratio.toFixed(1)}`, {
          size: fontSizes.sm,
          fill: ink,
          anchor: 'end',
          family: fonts.mono,
          weight,
        });
        label(GAP_RIGHT, midY, String(row.gap), { size: fontSizes.sm, fill: ink, anchor: 'end', family: fonts.mono, weight });
      });
    }


    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
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

    async function render(
      next: SmallerKeyScene,
      prev: SmallerKeyScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      const grows = opts.animate && step !== null && prev !== null && prev.rows.length === step.index;
      if (!grows || step === null) {
        drawStatic(next, null);
        return;
      }
      const start = Date.now();
      let k = 0;
      while (k < 1) {
        if (mine !== gen || destroyed) return;
        drawStatic(next, { index: step.index, k, fromRsa: step.fromRsa, fromEcc: step.fromEcc });
        await wait(FRAME_MS);
        k = Math.min(1, (Date.now() - start) / MOTION_MS);
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next, null);
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
        svg.textContent = '';
      },
    };
  },
};
