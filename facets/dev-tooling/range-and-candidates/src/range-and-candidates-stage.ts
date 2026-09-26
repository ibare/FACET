/**
 * range-and-candidates 의 무대.
 *
 * 위에는 요구 하나, 그 아래 공개된 버전들이 한 줄로 기다린다. 범위가 풀리면 두 끝이 요구에서
 * 떨어져 나와 벽이 되고, 판 아래를 셋(아래로 벗어남 · 안 · 위로 벗어남)으로 가른다. 후보는
 * 하나씩 줄에서 내려와 두 끝의 머리 높이에서 제 칸으로 옮겨 가고, 그 칸에 쌓인다. 끝에 안 칸의
 * 가장 큰 것이 요구 옆으로 올라간다.
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
} from '@ffacet/core/runtime';
import type { RangeAndCandidatesScene } from './scene.js';
import type { Verdict } from './algorithm.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 요소 크기의 상한 — 실제 크기는 캔버스 폭에서 역산한다 */
const CHIP_W_MAX = 76;
const CHIP_H = 28;
const STACK_GAP = 6;
const TICK_MS = 16;
const BOUNDS_MS = 600;
const JUDGE_MS = 720;
const PICK_MS = 600;

type Geometry = {
  w: number;
  margin: number;
  chipW: number;
  captionY: number;
  reqY: number;
  rowY: number;
  gaugeY: number;
  endLabelY: number;
  endNoteY: number;
  wallTop: number;
  wallBottom: number;
  binBottom: number;
  binLabelY: number;
  slotX: (i: number) => number;
  wallX: [number, number];
  colX: Record<Verdict, number>;
  stackY: (k: number) => number;
  reqX: number;
};

function geometry(n: number): Geometry {
  const w = PIECE_CANVAS_W;
  const margin = 16;
  const inner = w - margin * 2;
  const slotW = inner / Math.max(1, n);
  const chipW = Math.min(CHIP_W_MAX, slotW - 8);
  const colW = inner / 3;
  const binBottom = H - 44;
  return {
    w,
    margin,
    chipW,
    captionY: 24,
    reqY: 62,
    rowY: 124,
    gaugeY: 152,
    endLabelY: 180,
    endNoteY: 194,
    wallTop: 204,
    wallBottom: H - 30,
    binBottom,
    binLabelY: H - 12,
    slotX: (i) => margin + slotW * (i + 0.5),
    wallX: [margin + colW, margin + colW * 2],
    colX: { below: margin + colW / 2, in: margin + colW * 1.5, above: margin + colW * 2.5 },
    stackY: (k) => binBottom - CHIP_H / 2 - k * (CHIP_H + STACK_GAP),
    reqX: margin + colW * 1.5,
  };
}

/** 요구 칩의 폭 — 범위 문자열 길이에서 */
function reqWidth(range: string, monoPx: number): number {
  return Math.max(64, range.length * monoPx * 0.62 + 24);
}

/** 뽑힌 버전이 서는 자리 — 요구 칩 오른쪽, 화살표 다음 */
function pickX(g: Geometry, range: string, monoPx: number): number {
  return g.reqX + reqWidth(range, monoPx) / 2 + 32 + g.chipW / 2;
}

function versionAt(scene: RangeAndCandidatesScene, i: number): string {
  const v = scene.published[i];
  if (v === undefined) throw new Error(`range-and-candidates 무대: 공개된 버전 ${i} 번째가 없다`);
  return v;
}

function r(x: number): string {
  const v = Math.round(x * 10) / 10;
  return String(Object.is(v, -0) ? 0 : v);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

type ChipLook = { fill: string; stroke: string; ink: string; dash: boolean; weight: number };

/** 한 판 위의 손잡이 — 정적 그리기가 매번 새로 짓는다 */
type Handles = {
  ends: { group: SVGGElement; line: SVGLineElement; x: number }[];
  binChips: Map<number, SVGGElement>;
  pickChip: SVGGElement | null;
};

export const rangeAndCandidatesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const monoPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function node<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      parent.appendChild(e);
      return e;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const e = node(
        'text',
        {
          x: r(x),
          y: r(y),
          'text-anchor': opts.anchor ?? 'middle',
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          ...(opts.weight ? { 'font-weight': opts.weight } : {}),
        },
        parent,
      );
      e.textContent = content;
      return e;
    }

    /** 가운데 (0,0) 에 세운 버전 칩. 자리는 group 의 transform 이 정한다 */
    function chip(parent: Element, cx: number, cy: number, width: number, text: string, look: ChipLook): SVGGElement {
      const g = node('g', { transform: `translate(${r(cx)},${r(cy)})` }, parent);
      node(
        'rect',
        {
          x: r(-width / 2),
          y: r(-CHIP_H / 2),
          width: r(width),
          height: String(CHIP_H),
          rx: '6',
          fill: look.fill,
          stroke: look.stroke,
          'stroke-width': String(look.weight),
          ...(look.dash ? { 'stroke-dasharray': '4 3' } : {}),
        },
        g,
      );
      label(g, 0, monoPx * 0.36, text, { size: fontSizes.sm, fill: look.ink, mono: true });
      return g;
    }

    function lookOf(verdict: Verdict | null, picked: boolean, current: boolean): ChipLook {
      const weight = current ? 2.5 : 1.2;
      if (picked) return { fill: colors.accent, stroke: colors.accent, ink: colors.stateInk, dash: false, weight };
      if (verdict === 'in') return { fill: colors.bg, stroke: colors.primary, ink: colors.text, dash: false, weight: current ? 2.5 : 1.6 };
      if (verdict === 'below' || verdict === 'above') {
        return { fill: colors.bg, stroke: colors.textMuted, ink: colors.textMuted, dash: true, weight };
      }
      return { fill: colors.bgSubtle, stroke: colors.border, ink: colors.text, dash: false, weight };
    }

    function caption(scene: RangeAndCandidatesScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        return t('caption.start', 'Requirement {range}. Published versions: {n}.', {
          range: scene.range,
          n: scene.published.length,
        });
      }
      if (step.kind === 'bounds' && scene.ends) {
        return t('caption.bounds', 'Lower end {lo}, included. Upper end {hi}, excluded.', {
          lo: scene.ends.lo,
          hi: scene.ends.hi,
        });
      }
      if (step.kind === 'judge' && scene.ends) {
        const vars = { v: versionAt(scene, step.index), lo: scene.ends.lo, hi: scene.ends.hi };
        const verdict = scene.verdicts[step.index];
        if (verdict === 'below') return t('caption.below', '{v} < {lo} — below the range.', vars);
        if (verdict === 'above') return t('caption.above', '{v} ≥ {hi} — above the range.', vars);
        return t('caption.in', '{lo} ≤ {v} < {hi} — inside.', vars);
      }
      if (step.kind === 'pick' && scene.pick) {
        return t('caption.pick', 'Inside: {n}. Largest: {v}.', { n: step.inside, v: scene.pick });
      }
      return '';
    }

    function drawStatic(scene: RangeAndCandidatesScene): Handles {
      svg.textContent = '';
      const g = geometry(scene.published.length);
      const handles: Handles = { ends: [], binChips: new Map(), pickChip: null };
      const currentIndex = scene.step.kind === 'judge' ? scene.step.index : -1;

      label(svg, g.margin, g.captionY, caption(scene), {
        size: fontSizes.md,
        fill: colors.text,
        anchor: 'start',
      });

      // 요구 하나
      const reqW = reqWidth(scene.range, monoPx);
      label(svg, g.reqX - reqW / 2 - 10, g.reqY + monoPx * 0.36, t('label.requirement', 'Requirement'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'end',
      });
      chip(svg, g.reqX, g.reqY, reqW, scene.range, {
        fill: colors.bg,
        stroke: colors.text,
        ink: colors.text,
        dash: false,
        weight: 1.6,
      });
      if (scene.pick) {
        const arrowX = g.reqX + reqW / 2 + 16;
        label(svg, arrowX, g.reqY + monoPx * 0.4, '→', { size: fontSizes.lg, fill: colors.text });
        handles.pickChip = chip(svg, pickX(g, scene.range, monoPx), g.reqY, g.chipW, scene.pick, lookOf('in', true, false));
      }

      // 공개된 버전들 — 아직 기다리는 것만 줄에 선다. 떠난 자리는 빈 틀로 남는다
      label(svg, g.margin, g.rowY - CHIP_H / 2 - 6, t('label.published', 'Published'), {
        size: fontSizes.xs,
        fill: colors.textMuted,
        anchor: 'start',
      });
      scene.published.forEach((v, i) => {
        const x = g.slotX(i);
        if (i < scene.verdicts.length) {
          node(
            'rect',
            {
              x: r(x - g.chipW / 2),
              y: r(g.rowY - CHIP_H / 2),
              width: r(g.chipW),
              height: String(CHIP_H),
              rx: '6',
              fill: 'none',
              stroke: colors.border,
              'stroke-dasharray': '2 3',
            },
            svg,
          );
        } else {
          chip(svg, x, g.rowY, g.chipW, v, lookOf(null, false, false));
        }
      });

      // 두 끝 — 벽이 되어 판 아래를 셋으로 가른다
      if (scene.ends) {
        const ends: { v: string; note: string; x: number; dash: boolean }[] = [
          { v: scene.ends.lo, note: t('label.included', 'included'), x: g.wallX[0], dash: false },
          { v: scene.ends.hi, note: t('label.excluded', 'excluded'), x: g.wallX[1], dash: true },
        ];
        for (const end of ends) {
          const head = node('g', { transform: 'translate(0,0)' }, svg);
          label(head, end.x, g.endLabelY, end.v, {
            size: fontSizes.md,
            fill: colors.text,
            mono: true,
            weight: '600',
          });
          label(head, end.x, g.endNoteY, end.note, { size: fontSizes.xs, fill: colors.textMuted });
          const line = node(
            'line',
            {
              x1: r(end.x),
              x2: r(end.x),
              y1: r(g.wallTop),
              y2: r(g.wallBottom),
              stroke: colors.text,
              'stroke-width': '2',
              ...(end.dash ? { 'stroke-dasharray': '6 4' } : {}),
            },
            svg,
          );
          handles.ends.push({ group: head, line, x: end.x });
        }
        label(svg, g.colX.below, g.binLabelY, t('label.below', 'Below'), { size: fontSizes.xs, fill: colors.textMuted });
        label(svg, g.colX.in, g.binLabelY, t('label.inside', 'Inside'), { size: fontSizes.xs, fill: colors.text, weight: '600' });
        label(svg, g.colX.above, g.binLabelY, t('label.above', 'Above'), { size: fontSizes.xs, fill: colors.textMuted });
      }

      // 칸에 쌓인 후보들 — 도착한 차례대로 아래부터
      const filled: Record<Verdict, number> = { below: 0, in: 0, above: 0 };
      scene.verdicts.forEach((verdict, i) => {
        const v = versionAt(scene, i);
        const k = filled[verdict];
        filled[verdict] += 1;
        const look = lookOf(verdict, scene.pick === v, i === currentIndex);
        handles.binChips.set(i, chip(svg, g.colX[verdict], g.stackY(k), g.chipW, v, look));
      });

      return handles;
    }

    /** 걸음 하나의 운동. p 는 0..1. alive 가 거짓이면 손대지 않고 물러난다 */
    function tween(ms: number, alive: () => boolean, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let done = false;
        let ticks = 0;
        const total = Math.max(1, Math.round(ms / TICK_MS));
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive()) return finish();
          ticks += 1;
          const p = Math.min(1, ticks / total);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, TICK_MS);
          timers.add(id);
        };
        frame(0);
        const id = setTimeout(() => {
          timers.delete(id);
          tick();
        }, TICK_MS);
        timers.add(id);
      });
    }

    function place(el: SVGGElement, x: number, y: number): void {
      el.setAttribute('transform', `translate(${r(x)},${r(y)})`);
    }

    async function render(
      next: RangeAndCandidatesScene,
      _prev: RangeAndCandidatesScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const handles = drawStatic(next);
      if (!opts.animate) return;
      const alive = (): boolean => mine === gen && !destroyed;
      const g = geometry(next.published.length);
      const step = next.step;

      if (step.kind === 'bounds') {
        // 두 끝이 요구에서 떨어져 나와 제 자리로 가고, 벽이 아래로 자란다
        await tween(BOUNDS_MS, alive, (p) => {
          const e = ease(p);
          for (const end of handles.ends) {
            const dx = (g.reqX - end.x) * (1 - e);
            const dy = (g.reqY - g.endLabelY) * (1 - e);
            end.group.setAttribute('transform', `translate(${r(dx)},${r(dy)})`);
            end.line.setAttribute('y2', r(lerp(g.wallTop, g.wallBottom, e)));
          }
        });
      } else if (step.kind === 'judge') {
        // 후보가 줄에서 내려와 두 끝의 머리 높이를 지나 제 칸으로 옮겨 가 쌓인다
        const el = handles.binChips.get(step.index);
        if (el) {
          const verdict = next.verdicts[step.index]!;
          const k = next.verdicts.slice(0, step.index).filter((v) => v === verdict).length;
          const x0 = g.slotX(step.index);
          const x1 = g.colX[verdict];
          const y1 = g.stackY(k);
          await tween(JUDGE_MS, alive, (p) => {
            if (p < 0.3) {
              place(el, x0, lerp(g.rowY, g.gaugeY, ease(p / 0.3)));
            } else if (p < 0.65) {
              place(el, lerp(x0, x1, ease((p - 0.3) / 0.35)), g.gaugeY);
            } else {
              place(el, x1, lerp(g.gaugeY, y1, ease((p - 0.65) / 0.35)));
            }
          });
        }
      } else if (step.kind === 'pick' && handles.pickChip) {
        // 안 칸의 가장 큰 것이 요구 옆으로 올라간다
        const i = next.pick === null ? -1 : next.published.indexOf(next.pick);
        const verdict = next.verdicts[i];
        const src = handles.binChips.get(i);
        const dst = handles.pickChip;
        if (src && verdict) {
          const k = next.verdicts.slice(0, i).filter((v) => v === verdict).length;
          const x0 = g.colX[verdict];
          const y0 = g.stackY(k);
          const x1 = pickX(g, next.range, monoPx);
          await tween(PICK_MS, alive, (p) => {
            const e = ease(p);
            place(dst, lerp(x0, x1, e), lerp(y0, g.reqY, e));
          });
        }
      }

      if (alive()) drawStatic(next);
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
