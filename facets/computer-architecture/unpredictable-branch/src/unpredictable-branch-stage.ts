/**
 * 맞힐 수 없는 분기 — 맞힌 비율의 선 둘.
 *
 * 가로는 분기 차례, 세로는 지금까지 맞힌 비율(0..1). 두 예측기의 비율이 분기마다 한 점씩
 * 나아간다. 한 걸음의 운동은 선의 펜이 앞 점에서 새 점으로 긋고 나아가는 것 — 처음에는
 * 크게 오르내리다가 결과가 쌓일수록 한 점의 무게가 줄어 절반 선 언저리로 가라앉는다.
 * 선 끝의 이름표가 펜을 따라 움직인다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { SceneGuess, UnpredictableBranchScene } from './scene.js';

const H = 260;
const PAD_L = 72;
const PAD_R = 170;
const CAPTION_Y = 24;
const RATE_TITLE_Y = 50;
const CHART_TOP = 64;
const CHART_BOTTOM = 204;
const LETTER_Y = 226;
const MARK_R = 4;
const LABEL_GAP = 15;
const INIT_MS = 400;
const BRANCH_MS = 420;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Pt = { x: number; y: number };

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 지금까지 j 번째(1 부터)까지 맞힌 수 */
function hitsUpTo(trail: SceneGuess[], j: number): number {
  let h = 0;
  for (let q = 0; q < j; q += 1) if (trail[q].hit) h += 1;
  return h;
}

export const unpredictableBranchStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<UnpredictableBranchScene> {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const [counterColor, tableColor] = categorical(2, 'vivid');

    const W = PIECE_CANVAS_W;
    const left = PAD_L;
    const right = W - PAD_R;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function put(
      tag: string,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElement {
      const node = document.createElementNS(SVG_NS, tag) as SVGElement;
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function colX(n: number, j: number): number {
      const w = (right - left) / Math.max(1, n);
      return left + (j - 0.5) * w;
    }

    function rateY(r: number): number {
      return CHART_BOTTOM - r * (CHART_BOTTOM - CHART_TOP);
    }

    function point(n: number, trail: SceneGuess[], j: number): Pt {
      return { x: colX(n, j), y: rateY(hitsUpTo(trail, j) / j) };
    }

    /** 두 이름표의 세로 자리 — 선이 겹쳐도 글자가 겹치지 않게 벌린다 */
    function labelYs(yc: number, yt: number): [number, number] {
      if (Math.abs(yc - yt) >= LABEL_GAP) return [yc, yt];
      const mid = (yc + yt) / 2;
      return yc >= yt
        ? [mid + LABEL_GAP / 2, mid - LABEL_GAP / 2]
        : [mid - LABEL_GAP / 2, mid + LABEL_GAP / 2];
    }

    type LineHandles = { seg: SVGElement | null; head: SVGElement | null; label: SVGElement | null };
    type Handles = {
      half: SVGElement;
      cursor: SVGElement | null;
      letter: SVGElement | null;
      counter: LineHandles;
      table: LineHandles;
    };

    function drawLine(
      scene: UnpredictableBranchScene,
      trail: SceneGuess[],
      color: string,
      layer: Element,
    ): LineHandles {
      const k = trail.length;
      const out: LineHandles = { seg: null, head: null, label: null };
      if (k === 0) return out;
      if (k >= 3) {
        const pts: string[] = [];
        for (let j = 1; j <= k - 1; j += 1) {
          const p = point(scene.n, trail, j);
          pts.push(`${round(p.x)},${round(p.y)}`);
        }
        put(
          'polyline',
          { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' },
          layer,
        );
      }
      if (k >= 2) {
        const a = point(scene.n, trail, k - 1);
        const b = point(scene.n, trail, k);
        out.seg = put(
          'line',
          { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, 'stroke-width': 2 },
          layer,
        );
      }
      for (let j = 1; j <= k; j += 1) {
        const p = point(scene.n, trail, j);
        const hit = trail[j - 1].hit;
        const m = put(
          'circle',
          {
            cx: p.x,
            cy: p.y,
            r: MARK_R,
            fill: hit ? color : c.bg,
            stroke: color,
            'stroke-width': 1.5,
          },
          layer,
        );
        if (j === k) out.head = m;
      }
      return out;
    }

    function captionText(scene: UnpredictableBranchScene): string {
      const k = scene.seen.length;
      const word = (o: 'T' | 'N'): string =>
        o === 'T' ? t('word.taken', 'taken') : t('word.notTaken', 'not taken');
      if (scene.step.kind === 'init') {
        return t('caption.init', '{n} outcomes from a coin toss. Each predictor guesses before one lands.', {
          n: scene.n,
        });
      }
      if (scene.step.kind === 'branch' && k > 0) {
        if (k === scene.n) {
          return t('caption.done', 'All {n} in: counter {c}/{n}, history table {h}/{n}. Half is {half}.', {
            n: scene.n,
            c: hitsUpTo(scene.counter, k),
            h: hitsUpTo(scene.table, k),
            half: round(scene.n / 2),
          });
        }
        return t('caption.branch', 'Branch {i}/{n}: {outcome} · counter guessed {cg} · table guessed {tg}', {
          i: k,
          n: scene.n,
          outcome: word(scene.seen[k - 1]),
          cg: word(scene.counter[k - 1].guess),
          tg: word(scene.table[k - 1].guess),
        });
      }
      return '';
    }

    function drawStatic(scene: UnpredictableBranchScene): Handles {
      svg.textContent = '';
      const k = scene.seen.length;
      const n = scene.n;

      put('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      }).textContent = captionText(scene);

      // 축
      put('text', {
        x: left,
        y: RATE_TITLE_Y,
        'text-anchor': 'start',
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      }).textContent = t('axis.rate', 'share guessed right');
      put('line', { x1: left, y1: CHART_TOP, x2: left, y2: CHART_BOTTOM, stroke: c.border, 'stroke-width': 1 });
      put('line', { x1: left, y1: CHART_BOTTOM, x2: right, y2: CHART_BOTTOM, stroke: c.border, 'stroke-width': 1 });
      const tick = (r: number, text: string): void => {
        put('text', {
          x: left - 8,
          y: rateY(r),
          'text-anchor': 'end',
          'dominant-baseline': 'central',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        }).textContent = text;
      };
      tick(1, '1');
      tick(0, '0');
      tick(0.5, t('axis.half', 'half'));

      const half = put('line', {
        x1: left,
        y1: rateY(0.5),
        x2: right,
        y2: rateY(0.5),
        stroke: c.textMuted,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
      });

      put('text', {
        x: left - 8,
        y: LETTER_Y,
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      }).textContent = t('axis.outcome', 'outcome');

      // 결과 자리 — 아직 안 나온 자리는 점으로
      let letter: SVGElement | null = null;
      for (let j = 1; j <= n; j += 1) {
        if (j <= k) {
          const o = scene.seen[j - 1];
          const node = put('text', {
            x: colX(n, j),
            y: LETTER_Y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
          });
          node.textContent = o === 'T' ? t('axis.taken', 'T') : t('axis.notTaken', 'N');
          if (j === k) letter = node;
        } else {
          put('circle', { cx: colX(n, j), cy: LETTER_Y, r: 1.5, fill: c.border });
        }
      }

      const cursor =
        k > 0
          ? put('line', {
              x1: colX(n, k),
              y1: CHART_TOP,
              x2: colX(n, k),
              y2: CHART_BOTTOM,
              stroke: c.border,
              'stroke-width': 1,
            })
          : null;

      const layer = put('g', {});
      const table = drawLine(scene, scene.table, tableColor, layer);
      const counter = drawLine(scene, scene.counter, counterColor, layer);

      if (k > 0) {
        const pc = point(n, scene.counter, k);
        const pt = point(n, scene.table, k);
        const [yc, yt] = labelYs(pc.y, pt.y);
        const label = (y: number, color: string): SVGElement =>
          put('text', {
            x: pc.x + 10,
            y,
            'text-anchor': 'start',
            'dominant-baseline': 'central',
            fill: color,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 600,
          });
        counter.label = label(yc, counterColor);
        counter.label.textContent = t('label.counter', '2-bit counter {hit}/{i}', {
          hit: hitsUpTo(scene.counter, k),
          i: k,
        });
        table.label = label(yt, tableColor);
        table.label.textContent = t('label.table', 'history table {hit}/{i}', {
          hit: hitsUpTo(scene.table, k),
          i: k,
        });
      }

      return { half, cursor, letter, counter, table };
    }

    /** 한 시계 — 프레임 수로 센다. 세대가 바뀌거나 거두면 곧바로 풀린다 */
    function flow(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const total = Math.max(1, Math.round(ms / FRAME_MS));
        let count = 0;
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          frame(ease(count / total));
          if (count >= total) return finish();
          count += 1;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function flowInit(h: Handles, mine: number): Promise<void> {
      const y = rateY(0.5);
      await flow(INIT_MS, mine, (p) => {
        h.half.setAttribute('x2', String(round(lerp(left, right, p))));
        h.half.setAttribute('y2', String(round(y)));
      });
    }

    async function flowBranch(scene: UnpredictableBranchScene, h: Handles, mine: number): Promise<void> {
      const k = scene.seen.length;
      const n = scene.n;
      const toC = point(n, scene.counter, k);
      const toT = point(n, scene.table, k);
      const fromC = k >= 2 ? point(n, scene.counter, k - 1) : toC;
      const fromT = k >= 2 ? point(n, scene.table, k - 1) : toT;
      const [lyc1, lyt1] = labelYs(toC.y, toT.y);
      const [lyc0, lyt0] = labelYs(fromC.y, fromT.y);
      const cursorFrom = k >= 2 ? colX(n, k - 1) : left;
      const cursorTo = colX(n, k);

      const moveLine = (lh: LineHandles, from: Pt, to: Pt, ly0: number, ly1: number, p: number): void => {
        const x = round(lerp(from.x, to.x, p));
        const y = round(lerp(from.y, to.y, p));
        if (lh.seg) {
          lh.seg.setAttribute('x2', String(x));
          lh.seg.setAttribute('y2', String(y));
        }
        if (lh.head) {
          lh.head.setAttribute('cx', String(x));
          lh.head.setAttribute('cy', String(y));
          if (k === 1) lh.head.setAttribute('r', String(round(MARK_R * p)));
        }
        if (lh.label) {
          lh.label.setAttribute('x', String(round(lerp(from.x, to.x, p) + 10)));
          lh.label.setAttribute('y', String(round(lerp(ly0, ly1, p))));
        }
      };

      await flow(BRANCH_MS, mine, (p) => {
        moveLine(h.counter, fromC, toC, lyc0, lyc1, p);
        moveLine(h.table, fromT, toT, lyt0, lyt1, p);
        if (h.cursor) {
          const cx = String(round(lerp(cursorFrom, cursorTo, p)));
          h.cursor.setAttribute('x1', cx);
          h.cursor.setAttribute('x2', cx);
        }
        if (h.letter) h.letter.setAttribute('y', String(round(LETTER_Y + 10 * (1 - p))));
      });
    }

    function render(
      next: UnpredictableBranchScene,
      _prev: UnpredictableBranchScene | null,
      opts: { animate: boolean },
    ): void | Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate) return;
      if (next.step.kind === 'init') {
        return flowInit(h, mine).then(() => {
          if (mine === gen && !destroyed) drawStatic(next);
        });
      }
      if (next.step.kind === 'branch' && next.seen.length > 0) {
        return flowBranch(next, h, mine).then(() => {
          if (mine === gen && !destroyed) drawStatic(next);
        });
      }
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
