/**
 * bad-estimate-bad-plan stage — 짐작과 실제의 비용 차례가 뒤집힌다.
 *
 * 위: SQL · 통계 · 표의 줄 띠. 추정은 띠를 값 수만큼 고르게 자르고, 실제 분포가 들어오면
 *     찾는 값의 칸이 넓어지고 나머지 칸이 좁아진다.
 * 아래: 길마다 한 줄. 읽는 페이지 하나가 칸 하나다. 적게 읽는 길이 위에 선다.
 *     실제 줄 수로 다시 셈하면 고른 길의 칸이 불어나고 두 줄의 자리가 바뀐다.
 *     고른 길의 표지는 그 길에 붙은 채 함께 내려간다.
 */
import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { BadEstimateScene, ScenePathCost } from './scene.js';

const H = 372;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 20;
const SQL_Y = 26;
const STATS_Y = 54;
const STRIP_Y = 72;
const STRIP_H = 24;
const STRIP_LABEL_Y = 116;
const LANE_HEAD_Y = 150;
const LANE_Y0 = 162;
const SLOT_H = 84;
const LANE_LABEL_W = 130;
const COST_W = 84;
const TILE_BOX_H = 56;
const CAPTION_Y = H - 14;

const MS_ESTIMATE = 700;
const MS_FILL = 600;
const MS_BADGE = 300;
const MS_ACTUAL = 800;
const MS_GROW = 550;
const MS_SWAP = 450;

const px = (s: string): number => parseFloat(s);

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

type Attrs = Record<string, string | number>;

function el(parent: Element, tag: string, attrs: Attrs, content?: string): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  }
  if (content !== undefined) node.textContent = content;
  parent.appendChild(node);
  return node;
}

/** 띠의 칸 하나 — 줄 수 기준 가로 자리 */
interface Slice {
  x: number;
  w: number;
}

/** 줄 수들을 띠 폭에 나눠 놓는다 */
function slicesOf(counts: number[], total: number): Slice[] {
  const span = W - PAD * 2;
  const out: Slice[] = [];
  let acc = 0;
  for (const c of counts) {
    out.push({ x: PAD + (acc / total) * span, w: (c / total) * span });
    acc += c;
  }
  return out;
}

/** 고르게 본 칸 (추정) — 찾는 값이 첫 칸 */
function estimateSlices(s: BadEstimateScene, est: number): Slice[] {
  return slicesOf(new Array<number>(s.base.distinct).fill(est), s.base.rows);
}

/** 실제 분포의 칸 — 찾는 값이 첫 칸, 나머지 값들은 이름 없이 */
function actualSlices(s: BadEstimateScene, actual: number): Slice[] {
  const counts = [actual, ...new Array<number>(s.base.otherValues).fill(s.base.rowsPerOther)];
  return slicesOf(counts, s.base.rows);
}

/** 칸 한 변과 한 줄에 드는 칸 수 — 가장 많이 읽을 수 있는 수(인덱스 + 표의 줄 전부)가 상자에 들게 */
function tileGrid(s: BadEstimateScene): { pitch: number; perRow: number } {
  const boxW = W - PAD - LANE_LABEL_W - COST_W;
  const most = s.base.descent + s.base.rows;
  let pitch = 12;
  while (pitch > 3 && Math.floor(boxW / pitch) * Math.floor(TILE_BOX_H / pitch) < most) pitch -= 1;
  return { pitch, perRow: Math.floor(boxW / pitch) };
}

/** 지금 비용으로 선 차례 — 적게 읽는 길이 위. 같으면 앞에 적힌 길 */
function rankOf(costs: ScenePathCost[], paths: string[]): string[] {
  return [...costs]
    .sort((a, b) => a.pages - b.pages || paths.indexOf(a.path) - paths.indexOf(b.path))
    .map((c) => c.path);
}

function slotY(rank: number): number {
  return LANE_Y0 + rank * SLOT_H;
}

/** 이 걸음에 있어야 할 값 — 없으면 장면이 틀린 것이라 던진다 */
function need<T>(v: T | null, what: string): T {
  if (v === null) throw new Error(`bad-estimate-bad-plan stage: 장면에 ${what} 이 없다`);
  return v;
}

interface Handles {
  slices: SVGElement[];
  lanes: Map<string, SVGElement>;
  /** 길마다 칸 요소 (순서대로) */
  tiles: Map<string, SVGElement[]>;
  badge: SVGElement | null;
}

export const badEstimateBadPlanStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const XS = px(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          const k = Math.min(1, (Date.now() - start) / ms);
          frame(k);
          if (k >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function drawStatic(s: BadEstimateScene): Handles {
      svg.textContent = '';
      const b = s.base;

      // SQL — 자료 그대로
      el(svg, 'text', {
        x: PAD, y: SQL_Y, fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.md,
      }, b.sql);

      // 통계 — 옵티마이저가 가진 것
      const statsItems = [
        b.table,
        t('label.rows', 'Rows: {n}', { n: b.rows }),
        t('label.pages', 'Pages: {n}', { n: b.pages }),
        t('label.distinct', 'Distinct {col}: {n}', { col: b.column, n: b.distinct }),
      ];
      const statW = (W - PAD * 2) / statsItems.length;
      statsItems.forEach((txt, i) => {
        el(svg, 'text', {
          x: PAD + i * statW, y: STATS_Y,
          fill: i === 0 ? colors.text : colors.textMuted,
          'font-family': i === 0 ? fonts.mono : fonts.body, 'font-size': fontSizes.sm,
        }, txt);
      });

      // 표의 줄 띠
      const slices: SVGElement[] = [];
      const lay = s.actualRows !== null
        ? actualSlices(s, s.actualRows)
        : s.est !== null ? estimateSlices(s, s.est) : null;
      if (lay === null) {
        el(svg, 'rect', {
          x: PAD, y: STRIP_Y, width: W - PAD * 2, height: STRIP_H,
          fill: colors.bgSubtle, stroke: colors.border,
        });
      } else {
        lay.forEach((sl, i) => {
          slices.push(el(svg, 'rect', {
            x: sl.x, y: STRIP_Y, width: sl.w, height: STRIP_H,
            fill: i === 0 ? colors.accent : colors.bgSubtle, stroke: colors.border, 'stroke-width': 0.75,
          }));
        });
        if (s.actualRows !== null && s.est !== null) {
          // 짐작한 폭이 남아 실제 폭과 견준다
          const estW = estimateSlices(s, s.est)[0]!.w;
          el(svg, 'rect', {
            x: PAD, y: STRIP_Y - 4, width: estW, height: STRIP_H + 8,
            fill: 'none', stroke: colors.text, 'stroke-width': 1.5, 'stroke-dasharray': '3 2',
          });
        }
      }
      if (s.est !== null) {
        el(svg, 'text', {
          x: PAD, y: STRIP_LABEL_Y, fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
          'font-weight': 600,
        }, `'${b.value}'`);
        el(svg, 'text', {
          x: PAD + 90, y: STRIP_LABEL_Y, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm,
        }, t('label.estimate', 'Estimate: {n}', { n: s.est }));
        el(svg, 'text', {
          x: W - PAD, y: STRIP_LABEL_Y, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm,
          'text-anchor': 'end',
        }, t('label.others', 'Other values'));
      }
      if (s.actualRows !== null) {
        el(svg, 'text', {
          x: PAD + 210, y: STRIP_LABEL_Y, fill: colors.danger, 'font-family': fonts.body, 'font-size': fontSizes.sm,
          'font-weight': 600,
        }, t('label.actual', 'Actual: {n}', { n: s.actualRows }));
      }

      // 길 — 읽는 페이지 하나가 칸 하나
      const lanes = new Map<string, SVGElement>();
      const tiles = new Map<string, SVGElement[]>();
      let badge: SVGElement | null = null;
      if (s.estCosts !== null) {
        el(svg, 'text', {
          x: PAD, y: LANE_HEAD_Y, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs,
        }, t('label.order', 'Fewer pages on top'));
        // 범례 — 인덱스 페이지 · 표 페이지
        const legend: [string, string][] = [
          [colors.primary, t('label.indexPage', 'Index page')],
          [colors.textMuted, t('label.tablePage', 'Table page')],
        ];
        if (s.actCosts !== null) legend.push([colors.danger, t('label.extraPage', 'Beyond estimate')]);
        legend.forEach(([fill, txt], i) => {
          const lx = PAD + LANE_LABEL_W + i * 110;
          el(svg, 'rect', { x: lx, y: LANE_HEAD_Y - 7, width: 7, height: 7, fill });
          el(svg, 'text', {
            x: lx + 11, y: LANE_HEAD_Y, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs,
          }, txt);
        });
        el(svg, 'text', {
          x: W - PAD, y: LANE_HEAD_Y, fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs,
          'text-anchor': 'end',
        }, s.actCosts !== null
          ? t('label.costHeadBoth', 'Estimate → Actual')
          : t('label.costHead', 'Estimate'));

        const now = s.actCosts ?? s.estCosts;
        const order = rankOf(now, b.paths);
        const grid = tileGrid(s);
        const size = Math.max(2, grid.pitch - 2);
        for (const path of b.paths) {
          const est = s.estCosts.find((c) => c.path === path);
          if (est === undefined) throw new Error(`bad-estimate-bad-plan stage: 추정 비용에 없는 길 "${path}"`);
          const act = s.actCosts?.find((c) => c.path === path) ?? null;
          if (s.actCosts !== null && act === null) {
            throw new Error(`bad-estimate-bad-plan stage: 실제 비용에 없는 길 "${path}"`);
          }
          const cost = act ?? est;
          const g = el(svg, 'g', { transform: `translate(0 ${round(slotY(order.indexOf(path)))})` });
          lanes.set(path, g);
          if (order.indexOf(path) > 0) {
            el(g, 'line', {
              x1: PAD, x2: W - PAD, y1: -6, y2: -6, stroke: colors.border, 'stroke-width': 1,
            });
          }
          el(g, 'text', {
            x: PAD, y: 16, fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.md,
          }, path);
          if (path === s.pick) {
            badge = el(g, 'g', {});
            const bw = Math.max(52, t('label.picked', 'Picked').length * XS * 0.62 + 16);
            el(badge, 'rect', { x: PAD, y: 26, width: bw, height: 18, rx: 9, fill: colors.accent });
            el(badge, 'text', {
              x: PAD + bw / 2, y: 39, fill: colors.stateInk, 'font-family': fonts.body, 'font-size': fontSizes.xs,
              'text-anchor': 'middle', 'font-weight': 600,
            }, t('label.picked', 'Picked'));
          }
          const list: SVGElement[] = [];
          const x0 = PAD + LANE_LABEL_W;
          for (let i = 0; i < cost.pages; i++) {
            const col = i % grid.perRow;
            const row = Math.floor(i / grid.perRow);
            const isIndex = i < cost.indexPages;
            const extra = act !== null && i >= est.pages;
            list.push(el(g, 'rect', {
              x: x0 + col * grid.pitch, y: 6 + row * grid.pitch, width: size, height: size,
              fill: extra ? colors.danger : isIndex ? colors.primary : colors.textMuted,
            }));
          }
          tiles.set(path, list);
          el(g, 'text', {
            x: W - PAD, y: 16, fill: act !== null && act.pages !== est.pages ? colors.danger : colors.text,
            'font-family': fonts.body, 'font-size': fontSizes.md, 'text-anchor': 'end', 'font-weight': 600,
          }, act !== null
            ? t('label.costChange', '{from} → {to}', { from: est.pages, to: act.pages })
            : String(est.pages));
        }
      }

      // 캡션 — 지금 일어나는 일
      el(svg, 'text', {
        x: PAD, y: CAPTION_Y, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md,
      }, caption(s));

      return { slices, lanes, tiles, badge };
    }

    function other(s: BadEstimateScene, costs: ScenePathCost[]): ScenePathCost {
      const o = costs.find((c) => c.path !== s.pick);
      if (o === undefined) throw new Error('bad-estimate-bad-plan stage: 고른 길 말고 다른 길이 없다');
      return o;
    }

    function pickCost(s: BadEstimateScene, costs: ScenePathCost[]): ScenePathCost {
      const c = costs.find((x) => x.path === s.pick);
      if (c === undefined) throw new Error('bad-estimate-bad-plan stage: 고른 길의 비용이 없다');
      return c;
    }

    function caption(s: BadEstimateScene): string {
      const b = s.base;
      switch (s.step.kind) {
        case 'start':
          return t('caption.start', 'Only statistics — rows per {col} value are not in them.', { col: b.column });
        case 'estimate':
          return t('caption.estimate', 'Estimate per value: {rows} ÷ {distinct} = {est}', {
            rows: b.rows, distinct: b.distinct, est: need(s.est, 'est'),
          });
        case 'estimatedCost': {
          const costs = need(s.estCosts, 'estCosts');
          const o = other(s, costs);
          return t('caption.pick', 'Estimated pages — {pick}: {cp} · {other}: {co}. Picked: {pick}', {
            pick: need(s.pick, 'pick'), cp: pickCost(s, costs).pages, other: o.path, co: o.pages,
          });
        }
        case 'actual':
          return t('caption.actual', 'Actual rows for {value}: {actual}. Estimated: {est}', {
            value: b.value, actual: need(s.actualRows, 'actualRows'), est: need(s.est, 'est'),
          });
        case 'actualCost': {
          const costs = need(s.actCosts, 'actCosts');
          const o = other(s, costs);
          return t('caption.actualCost', 'Actual pages — {pick}: {cp} · {other}: {co}. Plan stays: {pick}', {
            pick: need(s.pick, 'pick'), cp: pickCost(s, costs).pages, other: o.path, co: o.pages,
          });
        }
      }
    }

    async function animate(s: BadEstimateScene, h: Handles, mine: number): Promise<void> {
      const kind = s.step.kind;
      if (kind === 'estimate') {
        // 칸 경계가 위에서 내려앉는다 — 띠가 값 수만큼 고르게 잘린다
        const n = h.slices.length;
        await tween(MS_ESTIMATE, mine, (k) => {
          h.slices.forEach((r, i) => {
            const local = Math.max(0, Math.min(1, (k * (n + 6) - i) / 6));
            const off = (1 - ease(local)) * -STRIP_Y * 0.5;
            r.setAttribute('transform', `translate(0 ${round(off)})`);
            r.setAttribute('opacity', String(round(local)));
          });
        });
        return;
      }
      if (kind === 'estimatedCost') {
        // 읽을 페이지가 칸으로 차오른다
        const all = [...h.tiles.values()];
        await tween(MS_FILL, mine, (k) => {
          for (const list of all) {
            const shown = Math.round(ease(k) * list.length);
            list.forEach((r, i) => r.setAttribute('visibility', i < shown ? 'visible' : 'hidden'));
          }
          if (h.badge !== null) h.badge.setAttribute('visibility', 'hidden');
        });
        if (h.badge !== null) {
          const badge = h.badge;
          await tween(MS_BADGE, mine, (k) => {
            badge.setAttribute('visibility', 'visible');
            badge.setAttribute('transform', `translate(${round(-40 * (1 - ease(k)))} 0)`);
            badge.setAttribute('opacity', String(round(k)));
          });
        }
        return;
      }
      if (kind === 'actual') {
        // 찾는 값의 칸이 넓어지고 나머지 칸이 좁아진다 — 고르게 본 자리에서 실제 자리로
        if (s.est === null || s.actualRows === null) return;
        const from = estimateSlices(s, s.est);
        const to = actualSlices(s, s.actualRows);
        await tween(MS_ACTUAL, mine, (k) => {
          const e = ease(k);
          h.slices.forEach((r, i) => {
            const a = from[i];
            const z = to[i];
            if (a === undefined || z === undefined) return;
            r.setAttribute('x', String(round(a.x + (z.x - a.x) * e)));
            r.setAttribute('width', String(round(a.w + (z.w - a.w) * e)));
          });
        });
        return;
      }
      if (kind === 'actualCost') {
        if (s.estCosts === null || s.actCosts === null) return;
        const before = rankOf(s.estCosts, s.base.paths);
        const after = rankOf(s.actCosts, s.base.paths);
        const shift = (path: string, e: number): void => {
          const g = h.lanes.get(path);
          if (g === undefined) return;
          const y = slotY(before.indexOf(path)) + (slotY(after.indexOf(path)) - slotY(before.indexOf(path))) * e;
          g.setAttribute('transform', `translate(0 ${round(y)})`);
        };
        // 1. 고른 길의 칸이 실제 줄 수만큼 불어난다 (자리는 아직 짐작의 차례)
        const growth = new Map<string, SVGElement[]>();
        for (const c of s.estCosts) {
          const list = h.tiles.get(c.path) ?? [];
          growth.set(c.path, list.slice(c.pages));
        }
        await tween(MS_GROW, mine, (k) => {
          for (const path of s.base.paths) shift(path, 0);
          for (const list of growth.values()) {
            const shown = Math.round(k * list.length);
            list.forEach((r, i) => r.setAttribute('visibility', i < shown ? 'visible' : 'hidden'));
          }
        });
        // 2. 두 길의 자리가 바뀐다 — 고른 표지는 길에 붙은 채 따라간다
        await tween(MS_SWAP, mine, (k) => {
          const e = ease(k);
          for (const path of s.base.paths) shift(path, e);
        });
      }
    }

    return {
      async render(next: BadEstimateScene, _prev: BadEstimateScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate) return;
        await animate(next, h, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
