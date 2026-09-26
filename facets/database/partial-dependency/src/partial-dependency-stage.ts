/**
 * partial-dependency stage — 열쇠 두 열이 한 쇠(clasp)로 묶이고, 열쇠 아닌 열이 줄로 매달린다.
 * 한쪽 끝에만 매달린 열은 그 쪽 열을 데리고 오른쪽 아래로 떨어져 나가 제 표가 되고,
 * 같은 줄이 겹쳐 줄어든다.
 *
 * 정적 그리기가 정본이다. 운동은 draw(scene, { kind, p }) 로 "아직 못 온 만큼" 을 그린다.
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
} from '@ffacet/core/runtime';
import type { PartialDependencyScene, PdDep } from './scene.js';

const H = 400;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
/** 두 표 사이 틈 */
const TABLE_GAP = 28;
/** 떨어져 나간 표가 내려앉는 깊이 */
const DROP = 20;
const NAME_Y = 18;
/** 줄(종속) 가로대의 가장 낮은 높이. 뒤의 종속일수록 위로 */
const LEVEL_BASE = 46;
const LEVEL_STEP = 16;
const CLASP_Y = 62;
const CLASP_H = 14;
const HEAD_Y = 80;
const HEAD_H = 26;
const ROW_Y0 = HEAD_Y + HEAD_H;
/** 줄 높이 상한 — 줄이 많으면 줄인다 */
const ROW_H_MAX = 28;
const ROWS_BOTTOM = 296;
const NOTE_Y0 = 318;
const NOTE_STEP = 19;
const CAPTION_Y = H - 18;
const MOTION_MS = 700;
const FRAME_MS = 16;
const TINT_OPACITY = 0.25;

type Motion = { kind: 'key' | 'depends' | 'detach' | 'shrink'; p: number };

type ColPlace = { name: string; src: number; x: number };

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** 0..1 을 [a, b] 구간의 진행으로 */
function phase(p: number, a: number, b: number): number {
  if (p <= a) return 0;
  if (p >= b) return 1;
  return (p - a) / (b - a);
}

/** 종속 i 의 다리가 열 가운데서 비켜서는 폭 — 같은 열에서 둘이 겹치지 않게 */
function legOffset(i: number): number {
  const side = i % 2 === 0 ? -1 : 1;
  return side * (7 + 14 * Math.floor(i / 2));
}

export const partialDependencyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      x: number,
      y: number,
      body: string,
      opts: { size: string; fill: string; family?: string; anchor?: string; weight?: string },
      parent: Element = svg,
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.family ?? fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = body;
      return node;
    }

    // ---- 자리 셈 (장면에서만) ----

    function slotW(scene: PartialDependencyScene): number {
      // 떨어져 나간 표가 열쇠의 일부(최대 열쇠 - 1 열)를 데려가도 폭 안에 들게
      const slots = scene.columns.length + Math.max(1, scene.key.length - 1);
      return (W - 2 * PAD - TABLE_GAP) / slots;
    }

    function rowH(scene: PartialDependencyScene): number {
      const n = Math.max(1, scene.rows.length);
      return Math.min(ROW_H_MAX, (ROWS_BOTTOM - DROP - ROW_Y0) / n);
    }

    /** 원래 표의 열 자리와 떨어져 나간 표의 열 자리. p = 떨어져 나감의 진행 (0 = 붙어 있음) */
    function places(scene: PartialDependencyScene, p: number): { main: ColPlace[]; split: ColPlace[]; splitX: number } {
      const sw = slotW(scene);
      const at = (slot: number) => PAD + slot * sw;
      const split = scene.split;
      if (split === null) {
        return { main: scene.columns.map((name, src) => ({ name, src, x: at(src) })), split: [], splitX: 0 };
      }
      const staying = scene.columns.filter((c) => c !== split.column);
      const main = staying.map((name, slot) => {
        const src = scene.columns.indexOf(name);
        return { name, src, x: lerp(at(src), at(slot), p) };
      });
      const splitX0 = at(staying.length) + TABLE_GAP;
      const splitCols = split.columns.map((name, i) => {
        const src = scene.columns.indexOf(name);
        if (src < 0) throw new Error(`partial-dependency stage: 없는 열 ${name}`);
        return { name, src, x: lerp(at(src), splitX0 + i * sw, p) };
      });
      const first = splitCols[0];
      return { main, split: splitCols, splitX: first === undefined ? splitX0 : first.x };
    }

    // ---- 그리기 ----

    function drawFrame(
      g: Element,
      cols: ColPlace[],
      rowsY: number[],
      top: number,
      sw: number,
    ): void {
      if (cols.length === 0) return;
      const left = Math.min(...cols.map((c) => c.x));
      const right = Math.max(...cols.map((c) => c.x)) + sw;
      const bottom = rowsY.length === 0 ? top + HEAD_H : Math.max(...rowsY);
      el('rect', { x: left, y: top, width: right - left, height: bottom - top, fill: colors.bg, stroke: colors.border, 'stroke-width': 1, rx: 4 }, g);
    }

    function drawHeader(g: Element, cols: ColPlace[], top: number, sw: number, keyCols: readonly string[]): void {
      for (const c of cols) {
        el('rect', { x: c.x, y: top, width: sw, height: HEAD_H, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1 }, g);
        label(c.x + sw / 2, top + HEAD_H / 2, c.name, {
          size: fontSizes.xs,
          fill: colors.text,
          family: fonts.mono,
          anchor: 'middle',
          weight: keyCols.includes(c.name) ? '700' : '400',
        }, g);
      }
    }

    function tintOf(scene: PartialDependencyScene, col: string, row: number): string | null {
      for (const dep of scene.deps) {
        if (!dep.partial || dep.groups === null) continue;
        if (dep.column !== col && !dep.lhs.includes(col)) continue;
        const gi = dep.groups[row];
        if (gi === undefined) throw new Error(`partial-dependency stage: 줄 ${row} 의 무리가 없다`);
        const n = Math.max(...dep.groups) + 1;
        const c = categorical(n, 'vivid')[gi];
        if (c === undefined) throw new Error('partial-dependency stage: 무리 색이 없다');
        return c;
      }
      return null;
    }

    function drawCell(
      g: Element,
      scene: PartialDependencyScene,
      c: ColPlace,
      row: number,
      y: number,
      h: number,
      sw: number,
      marked: boolean,
    ): void {
      const r = scene.rows[row];
      const v = r?.[c.src];
      if (v === undefined) throw new Error(`partial-dependency stage: 칸 ${row}·${c.name} 이 없다`);
      el('rect', { x: c.x, y, width: sw, height: h, fill: colors.bg, stroke: colors.border, 'stroke-width': 0.5 }, g);
      const tint = tintOf(scene, c.name, row);
      if (tint !== null) {
        el('rect', { x: c.x + 1, y: y + 1, width: sw - 2, height: h - 2, fill: tint, 'fill-opacity': TINT_OPACITY }, g);
      }
      if (marked) {
        el('rect', { x: c.x + 2, y: y + 2, width: sw - 4, height: h - 4, fill: 'none', stroke: colors.danger, 'stroke-width': 2, rx: 3 }, g);
      }
      label(c.x + sw / 2, y + h / 2, v, { size: fontSizes.sm, fill: colors.text, family: fonts.mono, anchor: 'middle' }, g);
    }

    function drawClasp(g: Element, cols: ColPlace[], names: readonly string[], sw: number, dy: number, p: number): void {
      const held = cols.filter((c) => names.includes(c.name));
      if (held.length === 0) return;
      const L = Math.min(...held.map((c) => c.x)) + 6;
      const R = Math.max(...held.map((c) => c.x)) + sw - 6;
      const y = CLASP_Y + dy;
      if (p >= 1) {
        el('rect', { x: L, y, width: R - L, height: CLASP_H, rx: CLASP_H / 2, fill: colors.primary }, g);
        label((L + R) / 2, y + CLASP_H / 2, t('label.key', 'key'), { size: fontSizes.xs, fill: colors.textInverse, anchor: 'middle', weight: '600' }, g);
        return;
      }
      // 두 끝에서 가운데로 다가와 붙는다
      const M = (L + R) / 2;
      el('rect', { x: L, y, width: Math.max(0, (M - L) * p), height: CLASP_H, rx: CLASP_H / 2, fill: colors.primary }, g);
      el('rect', { x: R - (R - M) * p, y, width: Math.max(0, (R - M) * p), height: CLASP_H, rx: CLASP_H / 2, fill: colors.primary }, g);
    }

    /** 종속 하나의 줄 — 왼쪽 열들에서 올라가 가로대를 지나 매달린 열로 내려온다. p 는 그려진 만큼 */
    function drawTether(
      g: Element,
      dep: PdDep,
      index: number,
      from: ColPlace[],
      to: ColPlace,
      sw: number,
      dy: number,
      color: string,
      p: number,
    ): void {
      const off = legOffset(index);
      const level = LEVEL_BASE - index * LEVEL_STEP + dy;
      const legXs = dep.lhs.map((name) => {
        const c = from.find((f) => f.name === name);
        if (c === undefined) throw new Error(`partial-dependency stage: 줄의 왼쪽 열 ${name} 이 없다`);
        return c.x + sw / 2 + off;
      });
      const endX = to.x + sw / 2;
      const legTop = CLASP_Y + dy;
      const endY = HEAD_Y + dy - 5;
      const pLeg = phase(p, 0, 0.35);
      const pBar = phase(p, 0.35, 0.7);
      const pDrop = phase(p, 0.7, 1);
      const parts: string[] = [];
      for (const x of legXs) parts.push(`M${r2(x)} ${r2(legTop)} V${r2(lerp(legTop, level, pLeg))}`);
      if (pBar > 0) {
        // 매달린 열에서 가장 먼 다리부터 매달린 열 쪽으로 뻗는다
        const startX = legXs.reduce((a, b) => (Math.abs(b - endX) > Math.abs(a - endX) ? b : a));
        parts.push(`M${r2(startX)} ${r2(level)} H${r2(lerp(startX, endX, pBar))}`);
      }
      if (pDrop > 0) parts.push(`M${r2(endX)} ${r2(level)} V${r2(lerp(level, endY, pDrop))}`);
      const d = parts.join(' ');
      el('path', { d, fill: 'none', stroke: colors.bg, 'stroke-width': 5, 'stroke-linecap': 'butt' }, g);
      el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'butt' }, g);
      if (p >= 1) {
        el('path', { d: `M${r2(endX - 5)} ${r2(endY - 1)} L${r2(endX + 5)} ${r2(endY - 1)} L${r2(endX)} ${r2(endY + 5)} Z`, fill: color }, g);
      }
    }

    function drawNotes(scene: PartialDependencyScene): void {
      const step = scene.step;
      if (step.kind !== 'depends') return;
      const dep = scene.deps.find((d) => d.column === step.column);
      if (dep === undefined) throw new Error(`partial-dependency stage: 종속 ${step.column} 이 없다`);
      const colIdx = (name: string) => {
        const i = scene.columns.indexOf(name);
        if (i < 0) throw new Error(`partial-dependency stage: 없는 열 ${name}`);
        return i;
      };
      const cell = (row: number, name: string) => {
        const v = scene.rows[row]?.[colIdx(name)];
        if (v === undefined) throw new Error(`partial-dependency stage: 칸 ${row}·${name} 이 없다`);
        return v;
      };
      const markX = PAD + 6;
      const textX = PAD + 20;
      let y = NOTE_Y0;
      for (const b of step.broken) {
        el('path', { d: `M${markX - 5} ${y - 5} L${markX + 5} ${y + 5} M${markX + 5} ${y - 5} L${markX - 5} ${y + 5}`, stroke: colors.danger, 'stroke-width': 2, fill: 'none' });
        label(textX, y, t('note.broken', '{cols} alone: {v} → {x} / {y}', {
          cols: b.col,
          v: cell(b.a, b.col),
          x: cell(b.a, dep.column),
          y: cell(b.b, dep.column),
        }), { size: fontSizes.sm, fill: colors.text });
        y += NOTE_STEP;
      }
      el('path', { d: `M${markX - 5} ${y} L${markX - 1} ${y + 4} L${markX + 6} ${y - 5}`, stroke: colors.success, 'stroke-width': 2, fill: 'none' });
      label(textX, y, t('note.holds', '{cols} → {column}: one value each', { cols: dep.lhs.join(' + '), column: dep.column }), {
        size: fontSizes.sm,
        fill: colors.text,
      });
    }

    function caption(scene: PartialDependencyScene): string {
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'Table {table} — rows: {n}', { table: scene.table, n: scene.rows.length });
        case 'key':
          return t('caption.key', 'Key: {cols} — distinct values: {d} / {n}', {
            cols: scene.key.join(' + '),
            d: step.distinct,
            n: step.rows,
          });
        case 'depends': {
          const dep = scene.deps.find((d) => d.column === step.column);
          if (dep === undefined) throw new Error(`partial-dependency stage: 종속 ${step.column} 이 없다`);
          return dep.partial
            ? t('caption.partial', '{column} is fixed by part of the key: {cols}', { column: dep.column, cols: dep.lhs.join(' + ') })
            : t('caption.full', '{column} is fixed by the whole key: {cols}', { column: dep.column, cols: dep.lhs.join(' + ') });
        }
        case 'detach': {
          const split = scene.split;
          if (split === null) throw new Error('partial-dependency stage: 떨어져 나간 표가 없다');
          return t('caption.detach', '{column} leaves with {cols} — new table {table}', {
            column: split.column,
            cols: split.lhs.join(' + '),
            table: split.table,
          });
        }
        case 'shrink': {
          const split = scene.split;
          if (split === null) throw new Error('partial-dependency stage: 떨어져 나간 표가 없다');
          return t('caption.shrink', 'Copies of {column}: {before} → {after}', {
            column: split.column,
            before: step.before,
            after: step.after,
          });
        }
      }
    }

    function draw(scene: PartialDependencyScene, motion: Motion | null): void {
      svg.textContent = '';
      if (scene.columns.length === 0) return;
      const sw = slotW(scene);
      const rh = rowH(scene);
      const m = (kind: Motion['kind']) => (motion !== null && motion.kind === kind ? motion.p : 1);
      const pDetach = m('detach');
      const pShrink = m('shrink');
      const pos = places(scene, pDetach);
      const split = scene.split;
      const dy = DROP * pDetach;

      // 이번 걸음의 반례 짝 — 왼쪽 칸과 매달린 칸
      const marks = new Set<string>();
      const step = scene.step;
      if (step.kind === 'depends') {
        for (const b of step.broken) {
          for (const row of [b.a, b.b]) {
            marks.add(`${row}:${b.col}`);
            marks.add(`${row}:${step.column}`);
          }
        }
      }

      // 원래 표
      const gMain = el('g', {});
      const rowsY = scene.rows.map((_, i) => ROW_Y0 + i * rh);
      drawFrame(gMain, pos.main, [...rowsY.map((y) => y + rh)], HEAD_Y, sw);
      label(PAD, NAME_Y, scene.table, { size: fontSizes.sm, fill: colors.textMuted, family: fonts.mono, weight: '600' }, gMain);
      drawHeader(gMain, pos.main, HEAD_Y, sw, scene.key);
      scene.rows.forEach((_, row) => {
        const y = rowsY[row];
        if (y === undefined) throw new Error(`partial-dependency stage: 줄 ${row} 의 높이가 없다`);
        for (const c of pos.main) drawCell(gMain, scene, c, row, y, rh, sw, marks.has(`${row}:${c.name}`));
      });

      // 떨어져 나간 표
      if (split !== null) {
        const gSplit = el('g', {});
        const mapTo = scene.mapTo;
        const kept = scene.kept;
        // 줄마다 지금 높이. 줄어들면 같은 줄은 처음 나온 줄의 자리로 겹쳐 올라간다
        const splitRows: { row: number; y: number; kept: boolean }[] = scene.rows.map((_, row) => {
          const from = ROW_Y0 + dy + row * rh;
          if (mapTo === null || kept === null) return { row, y: from, kept: true };
          const target = mapTo[row];
          if (target === undefined) throw new Error(`partial-dependency stage: 줄 ${row} 의 합칠 자리가 없다`);
          return { row, y: lerp(from, ROW_Y0 + dy + target * rh, pShrink), kept: kept.includes(row) };
        });
        const visible = splitRows.filter((r) => r.kept || pShrink < 1);
        const bottom = Math.max(...visible.map((r) => r.y + rh));
        drawFrame(gSplit, pos.split, [bottom], HEAD_Y + dy, sw);
        label(pos.splitX, NAME_Y + dy, split.table, { size: fontSizes.sm, fill: colors.textMuted, family: fonts.mono, weight: '600' }, gSplit);
        drawHeader(gSplit, pos.split, HEAD_Y + dy, sw, split.lhs);
        // 겹쳐 사라질 줄을 먼저, 남는 줄을 위에
        const order = [...visible.filter((r) => !r.kept), ...visible.filter((r) => r.kept)];
        for (const r of order) {
          for (const c of pos.split) drawCell(gSplit, scene, c, r.row, r.y, rh, sw, false);
        }
        drawClasp(gSplit, pos.split, split.lhs, sw, dy, 1);
      }

      // 열쇠의 쇠
      if (scene.keyShown) drawClasp(svg, pos.main, scene.key, sw, 0, m('key'));

      // 매달린 줄
      scene.deps.forEach((dep, i) => {
        const inSplit = split !== null && split.column === dep.column;
        const from = inSplit ? pos.split : pos.main;
        const to = from.find((c) => c.name === dep.column);
        if (to === undefined) throw new Error(`partial-dependency stage: 매달린 열 ${dep.column} 이 없다`);
        const color = dep.partial && !inSplit ? colors.itemComparing : colors.primary;
        const last = i === scene.deps.length - 1;
        const p = last && step.kind === 'depends' ? m('depends') : 1;
        drawTether(svg, dep, i, from, to, sw, inSplit ? dy : 0, color, p);
      });

      drawNotes(scene);

      label(W / 2, CAPTION_Y, caption(scene), { size: fontSizes.md, fill: colors.text, anchor: 'middle' });
    }

    function animate(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const total = Math.max(1, Math.ceil(MOTION_MS / FRAME_MS));
        let i = 0;
        const wake = () => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = () => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          frame(ease(i / total));
          if (i >= total) {
            wake();
            return;
          }
          i += 1;
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(next: PartialDependencyScene, prev: PartialDependencyScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        draw(next, null);
        if (!opts.animate || prev === null) return;
        const kind = next.step.kind;
        if (kind === 'start') return;
        await animate(mine, (p) => draw(next, { kind, p }));
        if (mine === gen && !destroyed) draw(next, null);
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
