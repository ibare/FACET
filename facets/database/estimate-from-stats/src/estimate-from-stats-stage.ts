/**
 * estimate-from-stats 의 stage — 통에서 몫이 잘려 나와 추정치 쪽으로 모인다.
 *
 * 위는 SQL, 가운데는 열의 막대 통계(가로 = 값, 세로 = 줄 수)와 조건 범위의 띠, 아래는 추정치 막대
 * (전체 줄 수만큼의 홈). 통 하나를 볼 때마다 그 통에서 범위와 겹친 세로 띠가 잘려 올라갔다가
 * 추정치 막대의 누적 끝으로 날아가 몫만큼의 길이로 눕는다. 안 걸친 통은 그대로 남는다.
 * 마지막 걸음에서 누적 끝까지 괄호가 뻗어 추정치를 가리킨다. 표의 줄은 어디에도 그리지 않는다.
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
import type { EstimateCut, EstimateFromStatsScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 400;

const SIDE = 44;
const SQL_Y = 30;
const PLOT_TOP = 96;
const PLOT_BASE = 226;
const AXIS_LABEL_Y = PLOT_BASE + 18;
const BAND_TOP = 60;
const METER_Y = 290;
const METER_H = 24;
const BRACKET_Y = METER_Y + METER_H + 12;
const CAPTION_Y = 370;

const LIFT_MS = 220;
const FLY_MS = 560;
const GROW_MS = 620;
const LIFT_PX = 14;

type Box = { x: number; y: number; w: number; h: number };

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const estimateFromStatsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const monoPx = parseFloat(fontSizes.md);
    const bodyPx = parseFloat(fontSizes.sm);

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // ── 자리 셈 — 캔버스 폭에서 거꾸로 ──
    const x0 = SIDE;
    const x1 = PIECE_CANVAS_W - SIDE;

    function valueX(scene: EstimateFromStatsScene, v: number): number {
      const first = scene.buckets[0];
      const last = scene.buckets[scene.buckets.length - 1];
      if (first === undefined || last === undefined) throw new Error('estimate-from-stats: 통이 없다');
      return round(x0 + ((v - first.lo) / (last.hi - first.lo)) * (x1 - x0));
    }

    function barHeight(scene: EstimateFromStatsScene, rows: number): number {
      const most = Math.max(...scene.buckets.map((b) => b.rows));
      return most === 0 ? 0 : round((rows / most) * (PLOT_BASE - PLOT_TOP));
    }

    function rowsX(scene: EstimateFromStatsScene, rows: number): number {
      return round(x0 + (rows / scene.rows) * (x1 - x0));
    }

    /** 통에서 잘려 나오는 세로 띠 — 겹친 구간 폭 × 통의 높이 */
    function stripBox(scene: EstimateFromStatsScene, cut: EstimateCut): Box {
      const bucket = scene.buckets[cut.index];
      if (bucket === undefined) throw new Error(`estimate-from-stats: 없는 통 ${cut.index}`);
      const h = barHeight(scene, bucket.rows);
      const left = valueX(scene, cut.from);
      return { x: left, y: round(PLOT_BASE - h), w: round(valueX(scene, cut.to) - left), h };
    }

    /** 추정치 막대 안에서 그 몫이 눕는 자리 */
    function slotBox(scene: EstimateFromStatsScene, cut: EstimateCut): Box {
      const left = rowsX(scene, cut.before);
      return { x: left, y: METER_Y, w: round(rowsX(scene, cut.sum) - left), h: METER_H };
    }

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      body: string,
      style: { size: number; fill: string; anchor?: string; mono?: boolean; weight?: number },
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x,
        y,
        fill: style.fill,
        'font-size': style.size,
        'font-family': style.mono === true ? fonts.mono : fonts.body,
        'text-anchor': style.anchor ?? 'start',
      });
      if (style.weight !== undefined) node.setAttribute('font-weight', String(style.weight));
      node.textContent = body;
      return node;
    }

    type Drawn = { slots: Map<number, SVGGElement>; bracket: SVGGElement | null };

    function drawStatic(scene: EstimateFromStatsScene): Drawn {
      svg.textContent = '';
      const tints = categorical(scene.buckets.length, 'vivid');
      const tintOf = (i: number): string => tints[i] ?? colors.primary;
      const cutOf = new Map(scene.cuts.map((c) => [c.index, c]));
      const current = scene.step.kind === 'bucket' ? scene.step.index : -1;

      // SQL — 자료 그대로
      write(svg, PIECE_CANVAS_W / 2, SQL_Y, scene.sql, {
        size: monoPx,
        fill: colors.text,
        anchor: 'middle',
        mono: true,
      });

      // 조건 범위의 띠
      const bandL = valueX(scene, scene.range.lo);
      const bandR = valueX(scene, scene.range.hi);
      el(svg, 'rect', {
        x: bandL,
        y: BAND_TOP,
        width: round(bandR - bandL),
        height: PLOT_BASE - BAND_TOP,
        fill: colors.primary,
        'fill-opacity': 0.08,
      });
      for (const [x, v] of [
        [bandL, scene.range.lo],
        [bandR, scene.range.hi],
      ] as const) {
        el(svg, 'line', {
          x1: x,
          x2: x,
          y1: BAND_TOP,
          y2: PLOT_BASE,
          stroke: colors.primary,
          'stroke-width': 1.5,
          'stroke-dasharray': '4 3',
        });
        write(svg, x, BAND_TOP - 6, String(v), {
          size: bodyPx,
          fill: colors.primary,
          anchor: 'middle',
          weight: 600,
        });
      }

      // 막대 통계
      scene.buckets.forEach((bucket, i) => {
        const left = valueX(scene, bucket.lo);
        const right = valueX(scene, bucket.hi);
        const h = barHeight(scene, bucket.rows);
        const top = round(PLOT_BASE - h);
        const cut = cutOf.get(i);
        const tint = tintOf(i);
        const g = el(svg, 'g', {});
        if (cut === undefined || cut.to === cut.from) {
          // 아직 안 본 통 · 안 걸친 통 — 통째로 그대로
          el(g, 'rect', {
            x: left + 1,
            y: top,
            width: round(right - left - 2),
            height: h,
            fill: tint,
            'fill-opacity': cut === undefined ? 0.85 : 0.35,
          });
        } else {
          // 잘린 통 — 남은 쪽은 흐리게, 잘려 나간 자리는 빈 틀로
          const cutL = valueX(scene, cut.from);
          const cutR = valueX(scene, cut.to);
          for (const [a, b] of [
            [left + 1, cutL],
            [cutR, right - 1],
          ] as const) {
            if (b - a > 0.5) {
              el(g, 'rect', {
                x: round(a),
                y: top,
                width: round(b - a),
                height: h,
                fill: tint,
                'fill-opacity': 0.35,
              });
            }
          }
          el(g, 'rect', {
            x: round(cutL + 0.5),
            y: round(top + 0.5),
            width: round(Math.max(0, cutR - cutL - 1)),
            height: round(Math.max(0, h - 1)),
            fill: 'none',
            stroke: tint,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          });
        }
        if (i === current) {
          el(g, 'rect', {
            x: left,
            y: round(top - 1),
            width: round(right - left),
            height: h + 1,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 2.5,
          });
        }
        // 통 가운데는 범위 경계와 겹치기 쉽다 — 줄 수는 통의 왼쪽 위에 둔다
        write(svg, round(left + 4), top - 6, String(bucket.rows), {
          size: bodyPx,
          fill: i === current ? colors.text : colors.textMuted,
          weight: i === current ? 600 : 400,
        });
      });

      // 가로축 — 통 경계
      el(svg, 'line', {
        x1: x0,
        x2: x1,
        y1: PLOT_BASE,
        y2: PLOT_BASE,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const first = scene.buckets[0];
      if (first === undefined) throw new Error('estimate-from-stats: 통이 없다');
      const edges = [first.lo, ...scene.buckets.map((b) => b.hi)];
      for (const v of edges) {
        const x = valueX(scene, v);
        el(svg, 'line', { x1: x, x2: x, y1: PLOT_BASE, y2: PLOT_BASE + 4, stroke: colors.border });
        write(svg, x, AXIS_LABEL_Y, String(v), {
          size: bodyPx,
          fill: colors.textMuted,
          anchor: 'middle',
        });
      }
      write(svg, x1 + 8, PLOT_BASE + 4, scene.column, {
        size: bodyPx,
        fill: colors.textMuted,
        mono: true,
      });

      // 추정치 막대 — 전체 줄 수만큼의 홈
      write(svg, x0, METER_Y - 8, t('label.estimate', 'Estimate'), {
        size: bodyPx,
        fill: colors.text,
        weight: 600,
      });
      write(
        svg,
        x1,
        METER_Y - 8,
        t('label.tableRows', 'Rows in {table}: {rows}', { table: scene.table, rows: scene.rows }),
        { size: bodyPx, fill: colors.textMuted, anchor: 'end' },
      );
      el(svg, 'rect', {
        x: x0,
        y: METER_Y,
        width: x1 - x0,
        height: METER_H,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const slots = new Map<number, SVGGElement>();
      for (const cut of scene.cuts) {
        if (cut.share === 0) continue;
        const box = slotBox(scene, cut);
        const g = el(svg, 'g', {});
        el(g, 'rect', { x: box.x, y: box.y, width: box.w, height: box.h, fill: tintOf(cut.index) });
        if (box.w >= 26) {
          write(g, round(box.x + box.w / 2), box.y + box.h / 2 + bodyPx / 2 - 1, String(cut.share), {
            size: bodyPx,
            fill: colors.textInverse,
            anchor: 'middle',
            weight: 600,
          });
        }
        slots.set(cut.index, g);
      }

      // 끝 — 누적 끝까지 괄호
      let bracket: SVGGElement | null = null;
      if (scene.estimate !== null) {
        bracket = el(svg, 'g', {});
        drawBracket(bracket, x0, rowsX(scene, scene.estimate.total), String(scene.estimate.total));
      }

      // 캡션 — 지금 일어나는 일
      const [line1, line2] = captionOf(scene);
      write(svg, PIECE_CANVAS_W / 2, CAPTION_Y, line1, {
        size: parseFloat(fontSizes.md),
        fill: colors.text,
        anchor: 'middle',
        weight: 600,
      });
      if (line2 !== '') {
        write(svg, PIECE_CANVAS_W / 2, CAPTION_Y + 20, line2, {
          size: bodyPx,
          fill: colors.textMuted,
          anchor: 'middle',
        });
      }

      return { slots, bracket };
    }

    function drawBracket(parent: SVGGElement, from: number, to: number, label: string): void {
      const span = Math.max(0, round(to - from));
      el(parent, 'path', {
        d: `M ${from} ${BRACKET_Y - 6} V ${BRACKET_Y} H ${round(from + span)} V ${BRACKET_Y - 6}`,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 2,
      });
      write(parent, round(from + span / 2), BRACKET_Y + bodyPx + 6, label, {
        size: parseFloat(fontSizes.lg),
        fill: colors.text,
        anchor: 'middle',
        weight: 700,
      });
    }

    function captionOf(scene: EstimateFromStatsScene): [string, string] {
      const step = scene.step;
      if (step.kind === 'start') {
        return [
          t('caption.start', 'Only the statistics of {column} are at hand', { column: scene.column }),
          '',
        ];
      }
      if (step.kind === 'estimate') {
        const est = scene.estimate;
        if (est === null) throw new Error('estimate-from-stats: 추정 걸음인데 추정이 없다');
        // 추정 줄 수는 괄호가 이미 가리킨다 — 캡션은 선택도만 말한다
        return [
          t('caption.selectivity', 'Selectivity: {total} / {rows} = {sel}', {
            total: est.total,
            rows: scene.rows,
            sel: est.selectivity.toFixed(2),
          }),
          '',
        ];
      }
      const cut = scene.cuts.find((c) => c.index === step.index);
      const bucket = scene.buckets[step.index];
      if (cut === undefined || bucket === undefined) {
        throw new Error(`estimate-from-stats: 통 ${step.index} 의 몫이 장면에 없다`);
      }
      const width = bucket.hi - bucket.lo;
      const overlap = cut.to - cut.from;
      const vars = { lo: bucket.lo, hi: bucket.hi };
      const head =
        overlap === 0
          ? t('caption.none', 'Bucket [{lo}, {hi}) lies outside the range — it stays', vars)
          : overlap === width
            ? t('caption.full', 'Bucket [{lo}, {hi}) lies fully inside — all of it moves', vars)
            : t('caption.part', 'Bucket [{lo}, {hi}) is partly inside — only the overlap is cut', vars);
      return [
        head,
        t('caption.calc', 'Share: {n} × {ov}/{w} = {share}   ·   Total so far: {sum}', {
          n: bucket.rows,
          ov: overlap,
          w: width,
          share: cut.share,
          sum: cut.sum,
        }),
      ];
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function settle(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    async function cutAndGather(mine: number, scene: EstimateFromStatsScene, cut: EstimateCut, drawn: Drawn): Promise<void> {
      const slot = drawn.slots.get(cut.index);
      if (slot === undefined) return;
      // 끝 자리는 이미 서 있다 — 아직 못 온 몫은 비워 두고, 날아오는 띠로 그린다
      slot.setAttribute('visibility', 'hidden');
      const from = stripBox(scene, cut);
      const to = slotBox(scene, cut);
      const tint = categorical(scene.buckets.length, 'vivid')[cut.index] ?? colors.primary;
      const flyer = el(svg, 'rect', { x: from.x, y: from.y, width: from.w, height: from.h, fill: tint });
      const place = (b: Box): void => {
        flyer.setAttribute('x', String(round(b.x)));
        flyer.setAttribute('y', String(round(b.y)));
        flyer.setAttribute('width', String(round(b.w)));
        flyer.setAttribute('height', String(round(b.h)));
      };
      // 잘린다 — 제자리에서 들린다
      await tween(mine, LIFT_MS, (p) => place({ ...from, y: from.y - LIFT_PX * ease(p) }));
      if (mine !== gen || destroyed) return;
      // 모인다 — 누적 끝으로 날아가 몫만큼 눕는다
      const lifted = { ...from, y: from.y - LIFT_PX };
      await tween(mine, FLY_MS, (p) => {
        const q = ease(p);
        place({
          x: lifted.x + (to.x - lifted.x) * q,
          y: lifted.y + (to.y - lifted.y) * q,
          w: lifted.w + (to.w - lifted.w) * q,
          h: lifted.h + (to.h - lifted.h) * q,
        });
      });
    }

    async function reach(mine: number, scene: EstimateFromStatsScene, drawn: Drawn): Promise<void> {
      const est = scene.estimate;
      if (est === null || drawn.bracket === null) return;
      drawn.bracket.setAttribute('visibility', 'hidden');
      const g = el(svg, 'g', {});
      const end = rowsX(scene, est.total);
      await tween(mine, GROW_MS, (p) => {
        g.textContent = '';
        drawBracket(g, x0, round(x0 + (end - x0) * ease(p)), String(Math.round(est.total * ease(p))));
      });
    }

    async function render(
      next: EstimateFromStatsScene,
      _prev: EstimateFromStatsScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      settle();
      const mine = (gen += 1);
      if (destroyed) return;
      const drawn = drawStatic(next);
      if (!opts.animate) return;
      const step = next.step;
      if (step.kind === 'bucket') {
        const cut = next.cuts.find((c) => c.index === step.index);
        if (cut === undefined || cut.share === 0) return;
        await cutAndGather(mine, next, cut, drawn);
      } else if (step.kind === 'estimate') {
        await reach(mine, next, drawn);
      } else {
        return;
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        settle();
        svg.textContent = '';
      },
    };
  },
};
