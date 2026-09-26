/**
 * rotate-the-fold 무대.
 *
 * 위: 폴드 카드 다섯이 "배우는 쪽" 줄에 서 있고, 시험지 자리(테두리)가 한 칸씩 옆으로
 * 옮겨 간다. 자리가 닿은 카드는 위 줄로 올라가고, 자리를 비운 카드는 아래로 돌아온다.
 * 아래: 수직선. 시험지에 앉은 항목은 선 위로 들려 있고, 나머지로 배운 가름점이
 * 앞 폴드의 자리에서 새 자리로 미끄러진다. 지나간 가름점은 아래 띠에 눈금으로 남는다.
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
import type { FoldItem } from './algorithm.js';
import type { FoldRecord, RotateTheFoldScene } from './scene.js';

const H = 372;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const LABEL_COL = 84;
const PAD_R = 20;
const CARD_H = 50;
const CARD_W_MAX = 110;
const SEAT_Y = 26;
const REST_Y = 94;
const SCORE_Y = 170;
const SPLIT_TOP = 204;
const LINE_Y = 262;
const LIFT = 40;
const DOT_R = 6;
const AXIS_LABEL_Y = LINE_Y + 30;
const TRAIL_Y = LINE_Y + 44;
const CAPTION_Y = 342;
const MOVE_MS = 600;
const FRAME_MS = 16;

function fix2(v: number): string {
  const s = (Math.round(v * 100) / 100).toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return out === 0 ? 0 : out;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const rotateTheFoldStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const classColor = categorical(2, 'vivid');
    const cls0 = classColor[0];
    const cls1 = classColor[1];
    if (cls0 === undefined || cls1 === undefined) throw new Error('rotate-the-fold: 부류 색이 없다');
    const tintOf = (c: 0 | 1): string => (c === 0 ? cls0 : cls1);
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el(
      tag: string,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): void {
      el(
        'text',
        {
          x: r1(x),
          y: r1(y),
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'font-weight': opts.weight ?? 'normal',
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'middle',
        },
        parent,
        text,
      );
    }

    /** 이번 걸음에서 폴드가 위 줄로 들린 정도 (0 배우는 쪽 · 1 시험지 자리). */
    function liftOf(scene: RotateTheFoldScene, fold: number, p: number): number {
      const s = scene.step;
      if (s.kind === 'fold') {
        if (fold === s.fold) return p;
        if (fold === s.fromFold) return 1 - p;
        return 0;
      }
      if (s.kind === 'summary') return fold === s.fromFold ? 1 - p : 0;
      return 0;
    }

    function recordOf(scene: RotateTheFoldScene, fold: number): FoldRecord | undefined {
      return scene.trail.find((r) => r.fold === fold);
    }

    function draw(scene: RotateTheFoldScene, p: number): void {
      svg.textContent = '';
      const n = scene.folds.length;
      const colW = (W - LABEL_COL - PAD_R) / n;
      const cardW = Math.min(colW - 14, CARD_W_MAX);
      const colIndex = (fold: number): number => {
        const i = scene.folds.indexOf(fold);
        if (i < 0) throw new Error(`rotate-the-fold stage: 폴드 ${fold} 가 바탕에 없다`);
        return i;
      };
      const colX = (fold: number): number => LABEL_COL + colW * (colIndex(fold) + 0.5);
      const { lo, hi } = scene.axis;
      const lineL = LABEL_COL;
      const lineR = W - PAD_R;
      const xAt = (v: number): number => lineL + ((v - lo) / (hi - lo)) * (lineR - lineL);
      const step = scene.step;
      const settled = p >= 1;
      const current = step.kind === 'fold' ? recordOf(scene, step.fold) : undefined;
      if (step.kind === 'fold' && current === undefined) {
        throw new Error(`rotate-the-fold stage: 폴드 ${step.fold} 의 기록이 자취에 없다`);
      }

      // ── 줄 이름 ──
      label(svg, 12, SEAT_Y + CARD_H / 2, t('label.seat', 'Test seat'), {
        anchor: 'start',
        fill: colors.textMuted,
      });
      label(svg, 12, REST_Y + CARD_H / 2, t('label.learn', 'Learning'), {
        anchor: 'start',
        fill: colors.textMuted,
      });
      label(svg, 12, SCORE_Y, t('label.correct', 'Correct'), {
        anchor: 'start',
        fill: colors.textMuted,
      });

      // ── 시험지 자리 ──
      if (step.kind === 'fold') {
        const to = colX(step.fold);
        const from = step.fromFold === null ? to : colX(step.fromFold);
        const sx = lerp(from, to, p);
        el(
          'rect',
          {
            x: r1(sx - cardW / 2 - 6),
            y: SEAT_Y - 6,
            width: r1(cardW + 12),
            height: CARD_H + 12,
            rx: 8,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 2.5,
          },
          svg,
        );
      }

      // ── 폴드 카드 ──
      for (const fold of scene.folds) {
        const cx = colX(fold);
        const y = lerp(REST_Y, SEAT_Y, liftOf(scene, fold, p));
        const g = el('g', { transform: `translate(${r1(cx - cardW / 2)},${r1(y)})` }, svg);
        const seated = step.kind === 'fold' && step.fold === fold;
        el(
          'rect',
          {
            x: 0,
            y: 0,
            width: r1(cardW),
            height: CARD_H,
            rx: 6,
            fill: colors.bg,
            stroke: seated ? colors.text : colors.border,
            'stroke-width': seated ? 1.5 : 1,
          },
          g,
        );
        label(g, cardW / 2, 14, t('label.fold', 'Fold {k}', { k: fold }), {
          weight: '600',
        });
        const members = scene.items.filter((it) => it.fold === fold).sort((a, b) => a.x - b.x);
        members.forEach((it, i) => {
          const mx = (cardW * (i + 0.5)) / members.length;
          el('circle', { cx: r1(mx - smPx), cy: 34, r: 4.5, fill: tintOf(it.cls) }, g);
          label(g, mx - smPx / 2 + 2, 34, it.x.toFixed(1), {
            mono: true,
            size: fontSizes.xs,
            fill: colors.textMuted,
            anchor: 'start',
          });
        });

        // 맞힌 수 — 이번 걸음의 것은 자리가 선 뒤에
        const rec = recordOf(scene, fold);
        if (rec && (settled || !seated)) {
          label(svg, cx, SCORE_Y, `${rec.correct}/${rec.total}`, {
            mono: true,
            size: fontSizes.lg,
            weight: '600',
          });
        }
      }

      // ── 수직선 ──
      const legend: [0 | 1, string][] = [
        [0, t('label.class0', 'Class 0')],
        [1, t('label.class1', 'Class 1')],
      ];
      legend.forEach(([c, text], i) => {
        const ly = LINE_Y - 22 + i * 20;
        el('circle', { cx: 18, cy: ly, r: 4.5, fill: tintOf(c) }, svg);
        label(svg, 28, ly, text, { anchor: 'start', size: fontSizes.xs, fill: colors.textMuted });
      });

      // 가름점과 두 쪽 — 이번 걸음의 맞춤
      if (step.kind === 'fold' && current) {
        const split = step.was ? lerp(step.was.split, current.split, p) : current.split;
        const sx = xAt(split);
        el(
          'rect',
          { x: lineL, y: SPLIT_TOP, width: r1(sx - lineL), height: LINE_Y - SPLIT_TOP, fill: cls0, 'fill-opacity': 0.1 },
          svg,
        );
        el(
          'rect',
          { x: r1(sx), y: SPLIT_TOP, width: r1(lineR - sx), height: LINE_Y - SPLIT_TOP, fill: cls1, 'fill-opacity': 0.1 },
          svg,
        );
        el(
          'line',
          { x1: r1(sx), x2: r1(sx), y1: SPLIT_TOP, y2: LINE_Y + 8, stroke: colors.text, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' },
          svg,
        );
        label(svg, sx, SPLIT_TOP - 10, t('label.split', 'Split: {v}', { v: fix2(split) }), {
          mono: true,
          weight: '600',
        });
        // 두 부류 평균 — 가름점은 이 둘의 가운데
        const means: [0 | 1, number, number][] = [
          [0, step.was ? step.was.mean0 : current.mean0, current.mean0],
          [1, step.was ? step.was.mean1 : current.mean1, current.mean1],
        ];
        for (const [c, from, to] of means) {
          const mx = xAt(lerp(from, to, p));
          el(
            'path',
            { d: `M${r1(mx)},${LINE_Y + 8} l-5,9 l10,0 z`, fill: tintOf(c) },
            svg,
          );
        }
      }

      el('line', { x1: lineL, x2: lineR, y1: LINE_Y, y2: LINE_Y, stroke: colors.border, 'stroke-width': 1.5 }, svg);
      for (let v = lo; v <= hi; v += 1) {
        const tx = xAt(v);
        el('line', { x1: r1(tx), x2: r1(tx), y1: LINE_Y - 3, y2: LINE_Y + 3, stroke: colors.border }, svg);
        label(svg, tx, AXIS_LABEL_Y, String(v), { mono: true, size: fontSizes.xs, fill: colors.textMuted });
      }

      // 항목 — 시험지에 앉은 폴드의 것은 선 위로 들린다
      const results = current ? new Map(current.results.map((r) => [r.id, r])) : null;
      const drawItem = (it: FoldItem): void => {
        const lift = liftOf(scene, it.fold, p);
        const ix = xAt(it.x);
        const iy = LINE_Y - LIFT * lift;
        const res = results?.get(it.id);
        if (res && settled && !res.right) {
          el('circle', { cx: r1(ix), cy: r1(iy), r: DOT_R + 4, fill: 'none', stroke: colors.danger, 'stroke-width': 2 }, svg);
        }
        el(
          'circle',
          {
            cx: r1(ix),
            cy: r1(iy),
            r: DOT_R,
            fill: tintOf(it.cls),
            stroke: lift > 0 ? colors.text : colors.bg,
            'stroke-width': lift > 0 ? 1.5 : 1,
          },
          svg,
        );
        if (res && settled) {
          label(
            svg,
            ix,
            iy - 18,
            res.right ? t('label.right', 'right') : t('label.wrong', 'wrong'),
            { size: fontSizes.xs, weight: '600', fill: res.right ? colors.text : colors.danger },
          );
        }
      };
      // 들린 항목을 나중에 그려 위에 오게
      const byLift = [...scene.items].sort(
        (a, b) => liftOf(scene, a.fold, p) - liftOf(scene, b.fold, p) || a.x - b.x,
      );
      for (const it of byLift) drawItem(it);

      // 지나간 가름점 — 폴드마다 한 눈금
      if (scene.trail.length > 0) {
        label(svg, 12, TRAIL_Y, t('label.trail', 'Splits so far'), {
          anchor: 'start',
          size: fontSizes.xs,
          fill: colors.textMuted,
        });
      }
      for (const rec of scene.trail) {
        const isNow = step.kind === 'fold' && rec.fold === step.fold;
        if (isNow && !settled) continue;
        const kx = xAt(rec.split);
        el(
          'line',
          {
            x1: r1(kx),
            x2: r1(kx),
            y1: TRAIL_Y - 5,
            y2: TRAIL_Y + 5,
            stroke: isNow ? colors.text : colors.textMuted,
            'stroke-width': isNow ? 2.5 : 1.5,
          },
          svg,
        );
      }

      // ── 캡션 ──
      const lines: string[] = [];
      if (step.kind === 'start') {
        lines.push(
          t('caption.start', 'Items: {n} · number of folds: {k}. The test seat is empty.', {
            n: scene.items.length,
            k: n,
          }),
        );
      } else if (step.kind === 'fold' && current) {
        lines.push(
          t('caption.fold', 'Test seat: fold {k} · split learned from the rest: {split}', {
            k: step.fold,
            split: fix2(current.split),
          }),
        );
        lines.push(
          t('caption.foldScore', 'Correct on the test seat: {c}/{n}', {
            c: current.correct,
            n: current.total,
          }),
        );
      } else if (step.kind === 'summary') {
        lines.push(
          t('caption.sum', 'Total correct: {c}/{n} · mean accuracy: {acc}', {
            c: step.correct,
            n: step.total,
            acc: fix2(step.accuracy),
          }),
        );
        lines.push(
          t('caption.seats', 'Times on the test seat per item — fewest: {min} · most: {max}', {
            min: step.seatMin,
            max: step.seatMax,
          }),
        );
      }
      lines.forEach((line, i) => {
        label(svg, W / 2, CAPTION_Y + i * 20, line, {
          size: i === 0 ? fontSizes.md : fontSizes.sm,
          fill: i === 0 ? colors.text : colors.textMuted,
          weight: i === 0 ? '600' : 'normal',
        });
      });
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

    async function move(scene: RotateTheFoldScene, mine: number): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / MOVE_MS);
        if (p >= 1) return;
        draw(scene, ease(p));
        await wait(FRAME_MS);
      }
    }

    return {
      async render(next: RotateTheFoldScene, _prev: RotateTheFoldScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step.kind === 'start') {
          draw(next, 1);
          return;
        }
        draw(next, 0);
        await move(next, mine);
        if (mine !== gen || destroyed) return;
        draw(next, 1);
      },
      destroy() {
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
