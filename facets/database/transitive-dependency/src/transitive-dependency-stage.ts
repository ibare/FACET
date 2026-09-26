/**
 * transitive-dependency 의 stage.
 *
 * 열 머리 위에 열마다 매듭을 두고, 선언된 종속을 매듭 사이 고리(곡선)로 잇는다.
 * 정해짐은 열쇠 매듭에서 출발해 고리를 타고 건너간다 — 두 번째 고리는 열쇠가 아닌 열의 매듭을
 * 지나서야 닿는다. 매듭 안의 수가 열쇠에서 건넌 고리 수다.
 * 끊기는 걸음에서 가운데 고리는 그 열의 사본과 함께 표 밖으로 끌려 나가고, 원래 자리에는 끊긴
 * 끝만 남는다. 떼어 내는 걸음에서 끌려 나간 줄들이 같은 값끼리 포개져 새 표가 된다.
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
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { TransitiveDependencyScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 380;
const W = PIECE_CANVAS_W;

const MARGIN = 16;
const TABLE_GAP = 48;
const COL_MAX = 132;
const CAPTION_Y = 24;
const DECL_Y = 50;
const DECL_LINE = 17;
const KNOT_Y = 150;
const KNOT_R = 9;
const ARC_BASE = 14;
const ARC_PER_COL = 16;
const HEAD_TOP = 164;
const HEAD_H = 26;
const ROWS_TOP = 196;
const ROWS_BOTTOM = 346;
const ROW_MAX = 32;
const NAME_Y = 366;
const STUB_T = 0.42;
const MOTION_MS = 700;
const TICK_MS = 16;

type Pt = { x: number; y: number };
type Motion = { p: number } | null;

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 두 매듭 사이 곡선의 세 점 (시작 · 조절 · 끝). */
function arcCtrl(x0: number, x1: number, colW: number): [Pt, Pt, Pt] {
  const y0 = KNOT_Y - KNOT_R;
  const span = Math.abs(x1 - x0) / colW;
  const h = ARC_BASE + ARC_PER_COL * span;
  return [
    { x: x0, y: y0 },
    { x: (x0 + x1) / 2, y: y0 - 2 * h },
    { x: x1, y: y0 },
  ];
}

function bez(c: [Pt, Pt, Pt], t: number): Pt {
  const [a, b, d] = c;
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * b.x + t * t * d.x, y: u * u * a.y + 2 * u * t * b.y + t * t * d.y };
}

/** 곡선의 [0, t] 조각 경로. */
function partPath(c: [Pt, Pt, Pt], t: number): string {
  const [a, b] = c;
  const q = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  const e = bez(c, t);
  return `M ${r2(a.x)} ${r2(a.y)} Q ${r2(q.x)} ${r2(q.y)} ${r2(e.x)} ${r2(e.y)}`;
}

function mk<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = mk(parent, 'text', { x, y, 'dominant-baseline': 'central', ...attrs });
  node.textContent = s;
  return node;
}

export const transitiveDependencyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);
    const monoCharW = smPx * 0.6;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tick(): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, TICK_MS);
        timers.add(id);
        waiters.add(wake);
      });
    }

    function list(xs: string[]): string {
      const sep = t('label.sep', ', ');
      return xs.join(sep);
    }

    function hopColor(h: number): string {
      if (h <= 0) return colors.text;
      if (h === 1) return colors.primary;
      return colors.itemComparing;
    }

    function draw(s: TransitiveDependencyScene, m: Motion): void {
      svg.textContent = '';
      const step = s.step;
      const p = m === null ? 1 : ease(m.p);
      const maxLhs = Math.max(...s.fds.map((f) => f.lhs.length));
      const slots = s.columns.length + maxLhs;
      const colW = Math.min(COL_MAX, (W - 2 * MARGIN - TABLE_GAP) / slots);
      const rh = Math.min(ROW_MAX, (ROWS_BOTTOM - ROWS_TOP) / s.rows.length);
      const colIdx = (c: string): number => s.columns.indexOf(c);
      const cut = s.cut;
      const split = s.split;

      // 왼쪽 표의 열 자리 (끊긴 뒤에는 떠난 열을 뺀 차례)
      const leftCols = cut === null ? s.columns : s.columns.filter((c) => !cut.to.includes(c));
      const preX = (c: string): number => MARGIN + colIdx(c) * colW;
      const leftX = (c: string): number => {
        const after = MARGIN + leftCols.indexOf(c) * colW;
        return step.kind === 'cut' && m !== null ? lerp(preX(c), after, p) : after;
      };
      // 오른쪽 무리 (끌려 나간 사본 + 떠난 열)
      const rightCols = cut === null ? [] : [...cut.via, ...cut.to];
      const rightX = (c: string): number => {
        const k = rightCols.indexOf(c);
        const after = W - MARGIN - (rightCols.length - k) * colW;
        return step.kind === 'cut' && m !== null ? lerp(preX(c), after, p) : after;
      };

      const hopOf = new Map(s.reached.map((r) => [r.col, r]));

      // --- 캡션
      let caption = '';
      if (step.kind === 'start') caption = t('caption.start', 'Start from the key: {key}', { key: list(s.key) });
      else if (step.kind === 'reach' && step.hops < 2)
        caption = t('caption.reach', '{fd} applied. Reached: {cols}. Links from the key: {hops}', {
          fd: t('label.fd', 'FD{n}', { n: step.fd + 1 }),
          cols: list(step.added),
          hops: step.hops,
        });
      else if (step.kind === 'reach')
        caption = t('caption.through', 'Reached only through {via}: {cols}. Links from the key: {hops}', {
          via: list(step.lhs),
          cols: list(step.added),
          hops: step.hops,
        });
      else if (step.kind === 'cut')
        caption = t('caption.cut', 'Link cut: {via} → {cols}. Distinct {via} values: {d} / {n}', {
          via: list(step.via),
          cols: list(step.to),
          d: step.distinct,
          n: step.total,
        });
      else
        caption = t('caption.split', 'Split off: {name}, rows: {m}. Remaining: {table}, rows: {n}', {
          name: step.name,
          m: step.kept,
          table: s.table,
          n: step.total,
        });
      label(svg, MARGIN, CAPTION_Y, caption, {
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });

      // --- 선언 (A → B 표기)
      s.fds.forEach((fd, n) => {
        const live = step.kind === 'reach' && step.fd === n;
        label(
          svg,
          MARGIN,
          DECL_Y + n * DECL_LINE,
          t('label.decl', '{fd}: {lhs} → {rhs}', {
            fd: t('label.fd', 'FD{n}', { n: n + 1 }),
            lhs: list(fd.lhs),
            rhs: list(fd.rhs),
          }),
          {
            fill: live ? hopColor(step.hops) : colors.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': live ? 700 : 400,
          },
        );
      });

      const cx = (x: number): number => x + colW / 2;

      // --- 고리
      const arcLayer = mk(svg, 'g', {});
      const apexDone = new Set<number>();
      const drawArrow = (c: [Pt, Pt, Pt], color: string): void => {
        const [, b, d] = c;
        const dx = d.x - b.x;
        const dy = d.y - b.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        const tip = { x: d.x - ux * 1, y: d.y - uy * 1 };
        const back = { x: tip.x - ux * 7, y: tip.y - uy * 7 };
        mk(arcLayer, 'path', {
          d: `M ${r2(tip.x)} ${r2(tip.y)} L ${r2(back.x - uy * 4)} ${r2(back.y + ux * 4)} L ${r2(back.x + uy * 4)} ${r2(back.y - ux * 4)} Z`,
          fill: color,
        });
      };

      // 건넘 경로 — 건너는 걸음이면 점이 열쇠 쪽 앞선 고리부터 탄다
      const pre: [Pt, Pt, Pt][] = [];
      if (step.kind === 'reach' && m !== null && step.hops >= 2) {
        let cur = step.lhs[0];
        while (cur !== undefined) {
          const r = hopOf.get(cur);
          if (r === undefined || r.fd === null) break;
          const fd = s.fds[r.fd];
          if (fd === undefined) break;
          const from = fd.lhs[0];
          if (from === undefined) break;
          pre.unshift(arcCtrl(cx(leftX(from)), cx(leftX(cur)), colW));
          cur = from;
        }
      }
      const segs = pre.length + 1;

      // 이번 걸음에 건너는 경로 (점이 지날 곡선들)
      const travel: [Pt, Pt, Pt][][] = [];

      s.fds.forEach((fd, n) => {
        for (const a of fd.lhs) {
          for (const b of fd.rhs) {
            // 끊긴 고리는 오른쪽 무리가 그린다
            if (!leftCols.includes(a) || !leftCols.includes(b)) continue;
            const c = arcCtrl(cx(leftX(a)), cx(leftX(b)), colW);
            const target = hopOf.get(b);
            const walked = target !== undefined && target.fd === n;
            const liveHere = step.kind === 'reach' && step.fd === n && m !== null;
            if (liveHere && walked) {
              // 아직 못 온 만큼: 옅은 선언 위에 [0, p] 만 칠한다
              mk(arcLayer, 'path', {
                d: partPath(c, 1),
                fill: 'none',
                stroke: colors.border,
                'stroke-width': 1.5,
                'stroke-dasharray': '4 4',
              });
              const q = Math.max(0, p * segs - (segs - 1));
              if (q > 0)
                mk(arcLayer, 'path', {
                  d: partPath(c, q),
                  fill: 'none',
                  stroke: hopColor(target.hops),
                  'stroke-width': 2,
                });
              travel.push([...pre, c]);
            } else if (walked) {
              mk(arcLayer, 'path', { d: partPath(c, 1), fill: 'none', stroke: hopColor(target.hops), 'stroke-width': 2 });
              drawArrow(c, hopColor(target.hops));
            } else {
              mk(arcLayer, 'path', {
                d: partPath(c, 1),
                fill: 'none',
                stroke: colors.border,
                'stroke-width': 1.5,
                'stroke-dasharray': '4 4',
              });
            }
            if (!apexDone.has(n) && fd.rhs.indexOf(b) === fd.rhs.length - 1) {
              apexDone.add(n);
              const apex = bez(c, 0.5);
              label(arcLayer, apex.x, apex.y - 8, t('label.fd', 'FD{n}', { n: n + 1 }), {
                fill: colors.textMuted,
                'font-family': fonts.mono,
                'font-size': fontSizes.xs,
                'text-anchor': 'middle',
              });
            }
          }
        }
      });

      // 끊긴 끝 — 끊는 걸음에만 원래 자리에 남는다
      if (cut !== null && split === null) {
        for (const a of cut.via) {
          for (const b of cut.to) {
            const c = arcCtrl(cx(MARGIN + colIdx(a) * colW), cx(preX(b)), colW);
            mk(arcLayer, 'path', {
              d: partPath(c, STUB_T * p),
              fill: 'none',
              stroke: colors.danger,
              'stroke-width': 2,
              'stroke-linecap': 'butt',
            });
            const tip = bez(c, STUB_T * p);
            if (p > 0.05)
              mk(arcLayer, 'circle', { cx: tip.x, cy: tip.y, r: 3, fill: colors.bg, stroke: colors.danger, 'stroke-width': 1.5 });
          }
        }
      }

      // 오른쪽 무리의 고리 — 사본을 따라 끌려 나간다
      if (cut !== null) {
        for (const a of cut.via) {
          for (const b of cut.to) {
            const c = arcCtrl(cx(rightX(a)), cx(rightX(b)), colW);
            const color = split === null ? colors.textMuted : colors.primary;
            mk(arcLayer, 'path', { d: partPath(c, 1), fill: 'none', stroke: color, 'stroke-width': 2 });
            drawArrow(c, color);
            const apex = bez(c, 0.5);
            label(arcLayer, apex.x, apex.y - 8, t('label.fd', 'FD{n}', { n: cut.fd + 1 }), {
              fill: colors.textMuted,
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              'text-anchor': 'middle',
            });
          }
        }
      }

      // --- 매듭과 머리
      const knot = (x: number, hops: number | null, reached: boolean): void => {
        if (!reached || hops === null) {
          mk(svg, 'circle', { cx: cx(x), cy: KNOT_Y, r: KNOT_R, fill: colors.bg, stroke: colors.border, 'stroke-width': 1.5 });
          return;
        }
        mk(svg, 'circle', { cx: cx(x), cy: KNOT_Y, r: KNOT_R, fill: hopColor(hops) });
        label(svg, cx(x), KNOT_Y + 0.5, String(hops), {
          fill: colors.textInverse,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          'text-anchor': 'middle',
        });
      };
      const head = (x: number, name: string, isKey: boolean): void => {
        mk(svg, 'rect', {
          x: x + 2,
          y: HEAD_TOP,
          width: colW - 4,
          height: HEAD_H,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: colors.border,
        });
        label(svg, cx(x), HEAD_TOP + HEAD_H / 2, name, {
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          'text-anchor': 'middle',
        });
        if (isKey) {
          const half = (name.length * monoCharW) / 2;
          mk(svg, 'line', {
            x1: cx(x) - half,
            x2: cx(x) + half,
            y1: HEAD_TOP + HEAD_H / 2 + smPx / 2 + 2,
            y2: HEAD_TOP + HEAD_H / 2 + smPx / 2 + 2,
            stroke: colors.text,
            'stroke-width': 1.2,
          });
        }
      };
      const tintOf = (row: number, col: string): string | null => {
        const g = s.groups;
        if (g === null || !g.cols.includes(col)) return null;
        const id = g.ids[row];
        if (id === undefined) throw new Error(`[transitive-dependency stage] 줄 ${row + 1} 에 무리 번호가 없다`);
        const color = categorical(Math.max(...g.ids) + 1, 'vivid')[id];
        if (color === undefined) throw new Error(`[transitive-dependency stage] 무리 ${id} 에 색이 없다`);
        return color;
      };
      const tintAlpha = step.kind === 'reach' && step.hops >= 2 && m !== null ? 0.22 * p : 0.22;
      const cell = (x: number, y: number, row: number, col: string, value: string, opacity: number): void => {
        const g = mk(svg, 'g', opacity < 1 ? { opacity } : {});
        const tint = tintOf(row, col);
        mk(g, 'rect', {
          x: x + 2,
          y: y + 1.5,
          width: colW - 4,
          height: rh - 3,
          rx: 2,
          fill: tint ?? colors.bg,
          'fill-opacity': tint === null ? 1 : tintAlpha,
          stroke: tint ?? colors.border,
          'stroke-opacity': tint === null ? 1 : 0.6,
        });
        label(g, cx(x), y + rh / 2, value, {
          fill: colors.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
        });
      };

      // 왼쪽 표
      for (const c of leftCols) {
        const x = leftX(c);
        const r = hopOf.get(c);
        const arriving = step.kind === 'reach' && m !== null && step.added.includes(c) && m.p < 1;
        knot(x, r === undefined ? null : r.hops, r !== undefined && !arriving);
        head(x, c, s.key.includes(c));
        s.rows.forEach((row, i) => {
          const v = row[colIdx(c)];
          if (v === undefined) throw new Error(`[transitive-dependency stage] 줄 ${i + 1} 에 ${c} 칸이 없다`);
          cell(x, ROWS_TOP + i * rh, i, c, v, 1);
        });
      }
      label(svg, MARGIN + 2, NAME_Y, s.table, {
        fill: colors.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });

      // 오른쪽 무리
      if (cut !== null) {
        const keySet = split === null ? [] : split.keyCols;
        const slotOf = (i: number): number => {
          if (split === null) return i;
          const k = split.slots[i];
          if (k === undefined) throw new Error(`[transitive-dependency stage] 줄 ${i + 1} 의 포개지는 자리가 없다`);
          return k;
        };
        const hopIn = (c: string): number | null => {
          if (split === null) return null;
          const h = split.hops[split.cols.indexOf(c)];
          if (h === undefined) throw new Error(`[transitive-dependency stage] 떼어 낸 표의 열 ${c} 에 고리 수가 없다`);
          return h;
        };
        const folding = step.kind === 'split' && m !== null;
        for (const c of rightCols) {
          const x = rightX(c);
          const hops = hopIn(c);
          knot(x, hops, hops !== null && !folding);
          head(x, c, keySet.includes(c) && !folding);
          s.rows.forEach((row, i) => {
            const v = row[colIdx(c)];
            if (v === undefined) throw new Error(`[transitive-dependency stage] 줄 ${i + 1} 에 ${c} 칸이 없다`);
            const kept = split === null || split.keep.includes(i);
            if (!kept && !folding) return;
            const y = folding ? lerp(ROWS_TOP + i * rh, ROWS_TOP + slotOf(i) * rh, p) : ROWS_TOP + slotOf(i) * rh;
            const fade = !kept && folding ? 1 - Math.max(0, (m.p - 0.6) / 0.4) : 1;
            cell(x, y, i, c, v, fade);
          });
        }
        if (split !== null && !folding) {
          const first = rightCols[0];
          if (first !== undefined)
            label(svg, rightX(first) + 2, NAME_Y, split.name, {
              fill: colors.textMuted,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
            });
        }
      }

      // 건너는 점
      if (step.kind === 'reach' && m !== null) {
        for (const path of travel) {
          const segs = path.length;
          const pos = Math.min(p * segs, segs - 1e-9);
          const k = Math.floor(pos);
          const seg = path[k];
          if (seg === undefined) continue;
          const at = bez(seg, pos - k);
          mk(svg, 'circle', { cx: at.x, cy: at.y, r: 5, fill: hopColor(step.hops), stroke: colors.bg, 'stroke-width': 1.5 });
        }
      }
    }

    async function animate(mine: number, next: TransitiveDependencyScene): Promise<void> {
      const start = performance.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (performance.now() - start) / MOTION_MS);
        draw(next, { p });
        if (p >= 1) break;
        await tick();
      }
      if (mine !== gen || destroyed) return;
      draw(next, null);
    }

    return {
      render(next: TransitiveDependencyScene, prev: TransitiveDependencyScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || prev === null || next.step.kind === 'start') {
          draw(next, null);
          return;
        }
        return animate(mine, next);
      },
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
