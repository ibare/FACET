/**
 * 행 우선과 열 우선 — 두 순회를 나란히 세운다.
 *
 * 왼쪽이 행 순회, 오른쪽이 열 순회. 판마다 위에 배열(행 하나가 캐시 줄 하나), 아래에
 * 캐시 자리가 있다. 커서는 배열 위를 걷는다 — 같은 행 안에서는 옆으로 미끄러지고, 행을
 * 건너면 호를 그리며 뛴다. 실패하면 그 행의 복제본이 캐시 자리로 내려가고, 그 자리에
 * 있던 줄은 옆으로 밀려 나간다. 읽은 칸은 적중·실패로 물든 채 남는다.
 *
 * 화면은 장면의 자취에서 전부 파생된다 — 캐시 안의 줄은 자취를 다시 밟아 얻는다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { Walk, WalkRead } from './algorithm.js';
import type { RowVsColumnWalkScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 412;

const PAD = 16;
const TAG_W = 56;
const CELL_MAX = 40;
const TITLE_Y = 22;
const GRID_Y = 38;
const SLOT_GAP = 6;
const CAPTION_Y = H - 16;

/** 운동 길이 (ms) */
const SLIDE_MS = 220;
const HOP_MS = 240;
const LOAD_MS = 300;
const FRAME_MS = 16;

type Data = { values: number[][]; rows: number; cols: number; cacheLines: number };

function narrow(raw: Record<string, unknown> | undefined): Data {
  const values = raw?.values;
  const lineElems = raw?.lineElems;
  const cacheLines = raw?.cacheLines;
  if (!Array.isArray(values) || values.length === 0) throw new Error('row-vs-column-walk: values 가 없다');
  const cols = Array.isArray(values[0]) ? values[0].length : 0;
  const ok = values.every(
    (row) => Array.isArray(row) && row.length === cols && row.every((v) => typeof v === 'number'),
  );
  if (!ok || cols === 0) throw new Error('row-vs-column-walk: values 는 수로 찬 직사각형이어야 한다');
  // 이 그림은 행 하나를 캐시 줄 하나로 그린다.
  if (lineElems !== cols) throw new Error('row-vs-column-walk: lineElems 는 열 수와 같아야 한다');
  if (typeof cacheLines !== 'number' || !Number.isInteger(cacheLines) || cacheLines < 1) {
    throw new Error('row-vs-column-walk: cacheLines 는 1 이상의 정수여야 한다');
  }
  return { values: values.map((row: number[]) => [...row]), rows: values.length, cols, cacheLines };
}

function rd(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(rd(v)) : v);
  if (parent) parent.appendChild(node);
  return node;
}

/** 자취 한 토막에서 읽어 낸 판의 상태. */
type Derived = {
  marks: Map<string, boolean>;
  slots: (number | null)[];
  misses: number;
  hits: number;
  sum: number;
  last: WalkRead | null;
};

function derive(trail: readonly WalkRead[], cacheLines: number): Derived {
  const marks = new Map<string, boolean>();
  const slots: (number | null)[] = Array.from({ length: cacheLines }, () => null);
  let misses = 0;
  let hits = 0;
  for (const x of trail) {
    marks.set(`${x.r},${x.c}`, x.hit);
    if (x.hit) hits += 1;
    else {
      misses += 1;
      slots[x.slot] = x.line;
    }
  }
  const last = trail[trail.length - 1] ?? null;
  return { marks, slots, misses, hits, sum: last ? last.acc : 0, last };
}

type Geo = {
  cs: number;
  panelX: (p: number) => number;
  panelW: number;
  gridX: (p: number) => number;
  cellX: (p: number, c: number) => number;
  rowY: (r: number) => number;
  cacheLabelY: number;
  slotY: (s: number) => number;
  tallyY: number;
  sumY: number;
};

function geometry(d: Data): Geo {
  const panelW = (PIECE_CANVAS_W - PAD * 3) / 2;
  // 세로에 담길 크기: 배열 행 + 캐시 자리 + 글자 줄들
  const fixed = GRID_Y + 34 + 44 + 40 + SLOT_GAP * (d.cacheLines - 1);
  const csV = (H - fixed) / (d.rows + d.cacheLines);
  const csW = (panelW - TAG_W * 2) / d.cols;
  const cs = Math.floor(Math.min(CELL_MAX, csV, csW));
  const gridW = cs * d.cols;
  const panelX = (p: number): number => PAD + p * (panelW + PAD);
  const gridX = (p: number): number => panelX(p) + (panelW - gridW) / 2;
  const gridBottom = GRID_Y + d.rows * cs;
  const cacheY = gridBottom + 34;
  const cacheBottom = cacheY + d.cacheLines * (cs + SLOT_GAP) - SLOT_GAP;
  return {
    cs,
    panelX,
    panelW,
    gridX,
    cellX: (p, c) => gridX(p) + c * cs,
    rowY: (r) => GRID_Y + r * cs,
    cacheLabelY: gridBottom + 24,
    slotY: (s) => cacheY + s * (cs + SLOT_GAP),
    tallyY: cacheBottom + 26,
    sumY: cacheBottom + 44,
  };
}

const WALK_PANEL: Record<Walk, number> = { row: 0, col: 1 };

type PanelHandles = {
  layer: SVGGElement;
  cursor: SVGRectElement | null;
  slotLines: (SVGGElement | null)[];
};

export const rowVsColumnWalkStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<RowVsColumnWalkScene> {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const pal: Palette = getColors(params.theme);
    // 자료 없이 마운트되면(러너 밖 점검 등) 그릴 것이 없다 — 빈 캔버스로 둔다.
    if (params.initialData === undefined) {
      return {
        render(): void {},
        destroy(): void {
          svg.textContent = '';
        },
      };
    }
    const d = narrow(params.initialData);
    const g = geometry(d);
    const total = d.rows * d.cols;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let panels: Record<Walk, PanelHandles> | null = null;

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'middle',
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? pal.text,
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
      return node;
    }

    /** 한 행의 값을 줄 모양으로 — 배열 안의 줄과 캐시 안의 줄이 같은 모양이다. */
    function lineGroup(parent: Element, p: number, row: number, y: number): SVGGElement {
      const grp = el('g', {}, parent);
      for (let c = 0; c < d.cols; c += 1) {
        const x = g.cellX(p, c);
        el('rect', { x, y, width: g.cs, height: g.cs, fill: pal.bgSubtle, stroke: pal.primary, 'stroke-width': 1.5 }, grp);
        label(grp, x + g.cs / 2, y + g.cs / 2, String(d.values[row]![c]!), { mono: true });
      }
      return grp;
    }

    function cursorRect(parent: Element, x: number, y: number): SVGRectElement {
      return el(
        'rect',
        {
          x: x - 2,
          y: y - 2,
          width: g.cs + 4,
          height: g.cs + 4,
          rx: 5,
          fill: 'none',
          stroke: pal.itemActive,
          'stroke-width': 3,
        },
        parent,
      );
    }

    function drawPanel(root: Element, walk: Walk, trail: readonly WalkRead[]): PanelHandles {
      const p = WALK_PANEL[walk];
      const layer = el('g', {}, root);
      const cx = g.panelX(p) + g.panelW / 2;
      label(
        layer,
        cx,
        TITLE_Y,
        walk === 'row'
          ? t('label.rowWalk', 'Row walk: r outer, c inner')
          : t('label.colWalk', 'Column walk: c outer, r inner'),
        { weight: '600' },
      );

      const st = derive(trail, d.cacheLines);
      const resident = new Set(st.slots.filter((s): s is number => s !== null));

      // 배열 — 행 하나가 캐시 줄 하나
      for (let r = 0; r < d.rows; r += 1) {
        const y = g.rowY(r);
        label(layer, g.gridX(p) - 8, y + g.cs / 2, t('label.rowTag', 'row {r}', { r }), {
          anchor: 'end',
          size: fontSizes.xs,
          fill: pal.textMuted,
        });
        for (let c = 0; c < d.cols; c += 1) {
          const x = g.cellX(p, c);
          el('rect', { x, y, width: g.cs, height: g.cs, fill: pal.bg, stroke: pal.border, 'stroke-width': 1 }, layer);
          const mark = st.marks.get(`${r},${c}`);
          if (mark !== undefined) {
            el(
              'rect',
              {
                x: x + 1,
                y: y + 1,
                width: g.cs - 2,
                height: g.cs - 2,
                fill: mark ? pal.primary : pal.danger,
                'fill-opacity': mark ? 0.12 : 0.3,
              },
              layer,
            );
          }
          label(layer, x + g.cs / 2, y + g.cs / 2, String(d.values[r]![c]!), { mono: true });
        }
        if (resident.has(r)) {
          el(
            'rect',
            {
              x: g.gridX(p) - 1,
              y: y + 1,
              width: g.cs * d.cols + 2,
              height: g.cs - 2,
              rx: 3,
              fill: 'none',
              stroke: pal.primary,
              'stroke-width': 1.5,
            },
            layer,
          );
        }
      }

      // 캐시 자리
      label(layer, cx, g.cacheLabelY, t('label.cache', 'cache · {n} lines', { n: d.cacheLines }), {
        size: fontSizes.xs,
        fill: pal.textMuted,
      });
      const slotLines: (SVGGElement | null)[] = [];
      for (let s = 0; s < d.cacheLines; s += 1) {
        const y = g.slotY(s);
        el(
          'rect',
          {
            x: g.gridX(p),
            y,
            width: g.cs * d.cols,
            height: g.cs,
            rx: 3,
            fill: 'none',
            stroke: pal.border,
            'stroke-dasharray': '4 3',
          },
          layer,
        );
        const row = st.slots[s];
        if (row === null || row === undefined) {
          slotLines.push(null);
          continue;
        }
        const grp = lineGroup(layer, p, row, y);
        label(grp, g.gridX(p) - 8, y + g.cs / 2, t('label.rowTag', 'row {r}', { r: row }), {
          anchor: 'end',
          size: fontSizes.xs,
          fill: pal.textMuted,
        });
        slotLines.push(grp);
      }

      // 셈
      label(layer, cx - 8, g.tallyY, t('label.miss', 'miss {n}', { n: st.misses }), {
        anchor: 'end',
        fill: pal.danger,
        weight: '600',
      });
      label(layer, cx + 8, g.tallyY, t('label.hit', 'hit {n}', { n: st.hits }), { anchor: 'start', weight: '600' });
      label(layer, cx, g.sumY, t('label.sum', 'sum {n}', { n: st.sum }), { fill: pal.textMuted });

      const cursor = st.last ? cursorRect(layer, g.cellX(p, st.last.c), g.rowY(st.last.r)) : null;
      return { layer, cursor, slotLines };
    }

    function caption(scene: RowVsColumnWalkScene): string {
      const step = scene.step;
      if (!step) return t('caption.ready', 'Two walks add the same {n} values, each from an empty cache.', { n: total });
      if (step.walk === 'col' && scene.col.length >= total) {
        const a = derive(scene.row, d.cacheLines);
        const b = derive(scene.col, d.cacheLines);
        return t('caption.done', 'Sum: rows {rowSum}, columns {colSum}. Misses: rows {rowMiss}, columns {colMiss}.', {
          rowSum: a.sum,
          colSum: b.sum,
          rowMiss: a.misses,
          colMiss: b.misses,
        });
      }
      const trail = scene[step.walk];
      const now = trail.slice(trail.length - step.count);
      const miss = now.filter((x) => !x.hit).length;
      const hit = now.length - miss;
      const out = now.filter((x) => x.evicted !== null).length;
      return step.walk === 'row'
        ? t('caption.row', 'Row {r}: {miss} misses, {out} lines pushed out, {hit} hits.', { r: step.outer, miss, out, hit })
        : t('caption.col', 'Column {c}: {miss} misses, {out} lines pushed out, {hit} hits.', { c: step.outer, miss, out, hit });
    }

    /** 장면 전체를 세운다. `cut` 이 있으면 그 순회의 자취를 앞 `upto` 개까지만 그린다. */
    function drawStatic(scene: RowVsColumnWalkScene, cut?: { walk: Walk; upto: number }): void {
      svg.textContent = '';
      const root = el('g', {}, svg);
      el(
        'line',
        { x1: PIECE_CANVAS_W / 2, y1: 8, x2: PIECE_CANVAS_W / 2, y2: g.sumY + 10, stroke: pal.border },
        root,
      );
      const trailOf = (w: Walk): readonly WalkRead[] =>
        cut && cut.walk === w ? scene[w].slice(0, cut.upto) : scene[w];
      panels = { row: drawPanel(root, 'row', trailOf('row')), col: drawPanel(root, 'col', trailOf('col')) };
      label(root, PIECE_CANVAS_W / 2, CAPTION_Y, caption(scene));
    }

    function tween(ms: number, mine: number, frame: (u: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = Date.now();
        let settled = false;
        const finish = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const u = Math.min(1, (Date.now() - start) / ms);
          frame(u);
          if (u >= 1) {
            finish(true);
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

    /** 읽기 하나를 흘린다 — 커서가 가고, 실패면 줄이 내려오고 밀려난다. */
    async function flowRead(walk: Walk, read: WalkRead, before: WalkRead | null, mine: number): Promise<boolean> {
      const hp = panels?.[walk];
      if (!hp) return false;
      const p = WALK_PANEL[walk];
      const toX = g.cellX(p, read.c) - 2;
      const toY = g.rowY(read.r) - 2;
      const cursor = hp.cursor ?? cursorRect(hp.layer, g.cellX(p, read.c), g.rowY(read.r) - g.cs);
      const fromX = Number(cursor.getAttribute('x'));
      const fromY = Number(cursor.getAttribute('y'));
      const slide = before !== null && before.r === read.r;

      if (slide) {
        const ok = await tween(SLIDE_MS, mine, (u) => {
          const k = ease(u);
          cursor.setAttribute('x', String(rd(fromX + (toX - fromX) * k)));
        });
        if (!ok) return false;
      } else {
        // 행을 건너는 뜀 — 진행 방향의 옆으로 호를 그린다
        const dx = toX - fromX;
        const dy = toY - fromY;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const bulge = Math.min(len * 0.35, g.cs * 1.2);
        const ok = await tween(HOP_MS, mine, (u) => {
          const k = ease(u);
          const lift = Math.sin(Math.PI * u) * bulge;
          cursor.setAttribute('x', String(rd(fromX + dx * k + nx * lift)));
          cursor.setAttribute('y', String(rd(fromY + dy * k + ny * lift)));
        });
        if (!ok) return false;
      }

      if (read.hit) return true;

      // 실패 — 행의 복제본이 캐시 자리로 내려가고, 있던 줄은 옆으로 밀려 나간다
      const fromRowY = g.rowY(read.r);
      const drop = g.slotY(read.slot) - fromRowY;
      const copy = lineGroup(hp.layer, p, read.r, fromRowY);
      const out = read.evicted !== null ? hp.slotLines[read.slot] ?? null : null;
      const push = g.panelW / 2;
      return tween(LOAD_MS, mine, (u) => {
        const k = ease(u);
        copy.setAttribute('transform', `translate(0 ${rd(drop * k)})`);
        if (out) {
          out.setAttribute('transform', `translate(${rd(push * k)} 0)`);
          out.setAttribute('opacity', String(rd(1 - k)));
        }
      });
    }

    async function render(
      next: RowVsColumnWalkScene,
      _prev: RowVsColumnWalkScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      if (!opts.animate || !step) {
        drawStatic(next);
        return;
      }
      const trail = next[step.walk];
      const base = trail.length - step.count;
      for (let k = base; k < trail.length; k += 1) {
        if (destroyed || mine !== gen) return;
        drawStatic(next, { walk: step.walk, upto: k });
        const ok = await flowRead(step.walk, trail[k]!, k > 0 ? trail[k - 1]! : null, mine);
        if (!ok || destroyed || mine !== gen) return;
      }
      drawStatic(next);
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
        panels = null;
        svg.textContent = '';
      },
    };
  },
};
