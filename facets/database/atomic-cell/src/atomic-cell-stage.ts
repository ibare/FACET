/**
 * atomic-cell stage — 한 칸에 뭉친 값이 풀려 나와 아래 표의 제 줄로 내려앉는다.
 *
 * 위: 원래 표. 값 열의 칸 하나에 값이 여럿 들어 있다. 조건이 그 칸 전체와 견준다.
 * 아래: 편 표. 줄 하나를 펼 때마다 칸의 값들이 칸 속 제자리에서 떨어져 나와
 *       아래 표의 새 줄로 내려앉고, 이름 칸은 사본이 함께 내려온다. 표 틀이 그만큼 늘어난다.
 * 조건 걸음: 조건 글자의 값이 줄을 따라 내려가며 칸마다 = / ≠ 를 남긴다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';

import type { AtomicCellScene } from './scene.js';

const H = 440;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD_X = 24;
const MARK_W = 40;
const TABLE_W = W - PAD_X * 2 - MARK_W;
/** 이름 열이 표 폭에서 차지하는 몫. */
const NAME_SHARE = 0.34;
const CELL_PAD = 12;

const HEAD_H = 24;
const ROW_MAX = 28;
/** 위 표 — 제목 줄 · 머리 · 몸의 자리. */
const SRC_TITLE_Y = 26;
const SRC_HEAD_Y = 36;
const SRC_BODY_H = 96;
/** 아래 표. */
const TGT_TITLE_Y = 186;
const TGT_HEAD_Y = 196;
const TGT_BODY_H = 180;
const CAPTION_Y = H - 14;

/** SQL 낱말은 코드라 옮기지 않는다 (@notation native). */
const SQL_WHERE = 'WHERE';

const FRAME_MS = 16;
/** 조건 걸음 — 줄 하나에 머무는 시간의 상한과 전체 상한. */
const PROBE_DWELL_MAX = 240;
const PROBE_TOTAL_MAX = 840;
/** 조건 값이 다음 줄로 옮겨 가는 몫. 나머지는 머문다. */
const PROBE_MOVE = 0.4;
/** 펴기 걸음 — 값 하나가 날아 내려앉는 시간과 값 사이 틈. */
const FLY_MS = 480;
const FLY_GAP = 90;

const VALUE_SIZE = fontSizes.md;
const CODE_SIZE = fontSizes.sm;
/** 고정폭 글자의 너비 비율 — 칸 속 값의 제자리를 셈한다. */
const MONO_RATIO = 0.6;
/** 맞은 줄의 바탕 짙기 — 맞음은 accent (팔레트의 "매칭 = 노랑"). */
const TINT = 0.35;

type Handles = {
  srcCells: SVGRectElement[];
  srcMarks: SVGTextElement[];
  srcTints: SVGRectElement[];
  srcCount: SVGTextElement | null;
  tgtCells: SVGRectElement[];
  tgtMarks: SVGTextElement[];
  tgtTints: SVGRectElement[];
  tgtCount: SVGTextElement | null;
  tgtRows: { name: SVGTextElement; value: SVGTextElement; line: SVGLineElement | null }[];
  tgtFrame: SVGRectElement | null;
};

type Geometry = {
  nameX: number;
  valueX: number;
  valueW: number;
  markX: number;
  srcRowH: number;
  tgtRowH: number;
};

function round(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function geometry(scene: AtomicCellScene): Geometry {
  const nameW = Math.round(TABLE_W * NAME_SHARE);
  const srcRows = Math.max(scene.source.rows.length, 1);
  const tgtRows = Math.max(scene.values ?? scene.flat.length, scene.flat.length, 1);
  return {
    nameX: PAD_X,
    valueX: PAD_X + nameW,
    valueW: TABLE_W - nameW,
    markX: PAD_X + TABLE_W + MARK_W / 2,
    srcRowH: Math.min(ROW_MAX, Math.floor(SRC_BODY_H / srcRows)),
    tgtRowH: Math.min(ROW_MAX, Math.floor(TGT_BODY_H / tgtRows)),
  };
}

function srcRowTop(g: Geometry, i: number): number {
  return SRC_HEAD_Y + HEAD_H + i * g.srcRowH;
}

function tgtRowTop(g: Geometry, i: number): number {
  return TGT_HEAD_Y + HEAD_H + i * g.tgtRowH;
}

export const atomicCellStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const valueCharW = parseFloat(VALUE_SIZE) * MONO_RATIO;
    const codeCharW = parseFloat(CODE_SIZE) * MONO_RATIO;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    /** 표 머리 — 열 이름. 열쇠 열에는 밑줄. */
    function drawHead(parent: Element, g: Geometry, top: number, columns: string[], key: string[]): void {
      el('rect', { x: PAD_X, y: top, width: TABLE_W, height: HEAD_H, fill: c.bgSubtle }, parent);
      const xs = [g.nameX, g.valueX];
      columns.forEach((col, i) => {
        const attrs: Record<string, string | number> = {
          x: (xs[i] ?? g.valueX) + CELL_PAD,
          y: top + HEAD_H / 2,
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': CODE_SIZE,
          'font-weight': 600,
          fill: c.text,
        };
        if (key.includes(col)) attrs['text-decoration'] = 'underline';
        el('text', attrs, parent, col);
      });
    }

    /** 조건 줄 — `WHERE <열> = '<값>'`. */
    function drawCondition(parent: Element, g: Geometry, y: number, column: string, value: string): void {
      const text = el(
        'text',
        { x: g.valueX + CELL_PAD, y, 'font-family': fonts.mono, 'font-size': CODE_SIZE, fill: c.text },
        parent,
      );
      el('tspan', { fill: c.primary, 'font-weight': 600 }, text, SQL_WHERE);
      el('tspan', {}, text, ` ${column} = `);
      el('tspan', { fill: c.itemComparing, 'font-weight': 600 }, text, `'${value}'`);
    }

    function drawMatched(parent: Element, y: number, n: number): SVGTextElement {
      return el(
        'text',
        {
          x: PAD_X + TABLE_W + MARK_W,
          y,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        },
        parent,
        t('label.matched', 'Matching rows: {n}', { n }),
      );
    }

    function drawMark(parent: Element, g: Geometry, cy: number, hit: boolean): SVGTextElement {
      return el(
        'text',
        {
          x: g.markX,
          y: cy,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': 700,
          fill: hit ? c.text : c.danger,
        },
        parent,
        hit ? '=' : '≠',
      );
    }

    function caption(scene: AtomicCellScene): string {
      const step = scene.step;
      if (step.kind === 'filter' && step.where === 'source' && scene.sourceMatch) {
        return t('caption.filterSource', "Each whole {column} cell is compared with '{value}'. Matching rows: {n}.", {
          column: scene.before.column,
          value: scene.before.value,
          n: scene.sourceMatch.matched.length,
        });
      }
      if (step.kind === 'filter' && step.where === 'target' && scene.targetMatch) {
        return t('caption.filterTarget', "{column} = '{value}'. Matching rows: {n}.", {
          column: scene.after.column,
          value: scene.after.value,
          n: scene.targetMatch.matched.length,
        });
      }
      if (step.kind === 'unpack') {
        const row = scene.source.rows[step.row];
        return t('caption.unpack', '{name}: values released from one cell: {k}. Rows now: {n}.', {
          name: row?.[0] ?? '',
          k: step.count,
          n: scene.flat.length,
        });
      }
      if (scene.values === null) {
        return t('caption.rows', 'Rows: {n}.', { n: scene.source.rows.length });
      }
      return t('caption.table', 'Rows: {n}. Values packed into {column} cells: {m}.', {
        n: scene.source.rows.length,
        column: scene.before.column,
        m: scene.values,
      });
    }

    /** 그 장면의 화면 전체를 세운다. */
    function drawStatic(scene: AtomicCellScene): Handles {
      svg.textContent = '';
      const g = geometry(scene);
      const h: Handles = {
        srcCells: [],
        srcMarks: [],
        srcTints: [],
        srcCount: null,
        tgtCells: [],
        tgtMarks: [],
        tgtTints: [],
        tgtCount: null,
        tgtRows: [],
        tgtFrame: null,
      };
      const root = el('g', {}, svg);

      // ── 위 표
      const src = el('g', {}, root);
      el('text', { x: PAD_X, y: SRC_TITLE_Y, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: c.text }, src, scene.source.table);
      if (scene.sourceMatch) {
        drawCondition(src, g, SRC_TITLE_Y, scene.before.column, scene.before.value);
        h.srcCount = drawMatched(src, SRC_TITLE_Y, scene.sourceMatch.matched.length);
      }
      drawHead(src, g, SRC_HEAD_Y, scene.source.columns, scene.source.key);
      scene.source.rows.forEach((row, i) => {
        const top = srcRowTop(g, i);
        const cy = top + g.srcRowH / 2;
        const done = scene.unpacked.includes(i);
        const hit = scene.sourceMatch?.matched.includes(i) ?? false;
        const tint = el('rect', { x: PAD_X, y: top, width: TABLE_W, height: g.srcRowH, fill: c.accent, opacity: hit ? TINT : 0 }, src);
        h.srcTints.push(tint);
        h.srcCells.push(el('rect', { x: g.valueX + 2, y: top + 2, width: g.valueW - 4, height: g.srcRowH - 4, fill: 'none', stroke: 'none', rx: 3 }, src));
        el('line', { x1: PAD_X, y1: top, x2: PAD_X + TABLE_W, y2: top, stroke: c.border }, src);
        const ink = done ? c.textMuted : c.text;
        el('text', { x: g.nameX + CELL_PAD, y: cy, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': VALUE_SIZE, fill: ink }, src, row[0] ?? '');
        el('text', { x: g.valueX + CELL_PAD, y: cy, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': VALUE_SIZE, fill: ink }, src, row[1] ?? '');
        if (scene.sourceMatch && i < scene.sourceMatch.compared) h.srcMarks.push(drawMark(src, g, cy, hit));
      });
      const srcH = HEAD_H + scene.source.rows.length * g.srcRowH;
      el('line', { x1: g.valueX, y1: SRC_HEAD_Y, x2: g.valueX, y2: SRC_HEAD_Y + srcH, stroke: c.border }, src);
      el('rect', { x: PAD_X, y: SRC_HEAD_Y, width: TABLE_W, height: srcH, fill: 'none', stroke: c.border, 'stroke-width': 1.5 }, src);

      // ── 아래 표 — 첫 줄을 펴면서 선다
      if (scene.unpacked.length > 0) {
        const tgt = el('g', {}, root);
        el('text', { x: PAD_X, y: TGT_TITLE_Y, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700, fill: c.text }, tgt, scene.target.table);
        if (scene.targetMatch) {
          drawCondition(tgt, g, TGT_TITLE_Y, scene.after.column, scene.after.value);
          h.tgtCount = drawMatched(tgt, TGT_TITLE_Y, scene.targetMatch.matched.length);
        }
        drawHead(tgt, g, TGT_HEAD_Y, scene.target.columns, scene.target.key);
        scene.flat.forEach((row, i) => {
          const top = tgtRowTop(g, i);
          const cy = top + g.tgtRowH / 2;
          const hit = scene.targetMatch?.matched.includes(i) ?? false;
          h.tgtTints.push(el('rect', { x: PAD_X, y: top, width: TABLE_W, height: g.tgtRowH, fill: c.accent, opacity: hit ? TINT : 0 }, tgt));
          h.tgtCells.push(el('rect', { x: g.valueX + 2, y: top + 2, width: g.valueW - 4, height: g.tgtRowH - 4, fill: 'none', stroke: 'none', rx: 3 }, tgt));
          const line = i > 0 ? el('line', { x1: PAD_X, y1: top, x2: PAD_X + TABLE_W, y2: top, stroke: c.border }, tgt) : null;
          const name = el('text', { x: g.nameX + CELL_PAD, y: cy, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': VALUE_SIZE, fill: c.text }, tgt, row.name);
          const value = el('text', { x: g.valueX + CELL_PAD, y: cy, 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': VALUE_SIZE, fill: c.text }, tgt, row.value);
          h.tgtRows.push({ name, value, line });
          if (scene.targetMatch && i < scene.targetMatch.compared) h.tgtMarks.push(drawMark(tgt, g, cy, hit));
        });
        const tgtH = HEAD_H + scene.flat.length * g.tgtRowH;
        el('line', { x1: PAD_X, y1: TGT_HEAD_Y + HEAD_H, x2: PAD_X + TABLE_W, y2: TGT_HEAD_Y + HEAD_H, stroke: c.border }, tgt);
        el('line', { x1: g.valueX, y1: TGT_HEAD_Y, x2: g.valueX, y2: TGT_HEAD_Y + tgtH, stroke: c.border }, tgt);
        h.tgtFrame = el('rect', { x: PAD_X, y: TGT_HEAD_Y, width: TABLE_W, height: tgtH, fill: 'none', stroke: c.border, 'stroke-width': 1.5 }, tgt);
      }

      el('text', { x: PAD_X, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text }, root, caption(scene));
      return h;
    }

    /** 한 시계로 흘린다. 세대가 바뀌거나 거두면 곧바로 풀린다. */
    function tween(mine: number, ms: number, frame: (elapsed: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = performance.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const elapsed = Math.min(ms, performance.now() - start);
          frame(elapsed);
          if (elapsed >= ms) {
            finish();
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

    /** 조건 걸음 — 조건 값이 조건 줄에서 떨어져 줄마다 내려가며 = / ≠ 를 남긴다. */
    async function runFilter(mine: number, scene: AtomicCellScene, h: Handles, where: 'source' | 'target'): Promise<void> {
      const g = geometry(scene);
      const match = where === 'source' ? scene.sourceMatch : scene.targetMatch;
      if (!match || match.compared === 0) return;
      const cond = where === 'source' ? scene.before : scene.after;
      const marks = where === 'source' ? h.srcMarks : h.tgtMarks;
      const tints = where === 'source' ? h.srcTints : h.tgtTints;
      const cells = where === 'source' ? h.srcCells : h.tgtCells;
      const count = where === 'source' ? h.srcCount : h.tgtCount;
      const rowH = where === 'source' ? g.srcRowH : g.tgtRowH;
      const top = (i: number): number => (where === 'source' ? srcRowTop(g, i) : tgtRowTop(g, i));
      const titleY = where === 'source' ? SRC_TITLE_Y : TGT_TITLE_Y;
      const n = match.compared;
      const dwell = Math.min(PROBE_DWELL_MAX, PROBE_TOTAL_MAX / n);

      // 조건 값의 출발 자리 — 조건 줄 속 값 글자
      const label = `'${cond.value}'`;
      const chipW = codeCharW * label.length + 12;
      const chipH = parseFloat(CODE_SIZE) + 8;
      const startX = drawConditionAnchor(g, cond.column, cond.value);
      const startY = titleY - parseFloat(CODE_SIZE) * 0.35;
      const restX = g.valueX + g.valueW - chipW / 2 - 8;
      const rowCy = (i: number): number => top(i) + rowH / 2;

      const chip = el('g', {}, svg);
      el('rect', { x: -chipW / 2, y: -chipH / 2, width: chipW, height: chipH, rx: chipH / 2, fill: c.bg, stroke: c.itemComparing, 'stroke-width': 1.5 }, chip);
      el('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': fonts.mono, 'font-size': CODE_SIZE, 'font-weight': 600, fill: c.itemComparing }, chip, label);

      const show = (reached: number, current: number): void => {
        marks.forEach((m, j) => m.setAttribute('visibility', j < reached ? 'visible' : 'hidden'));
        tints.forEach((r, j) => r.setAttribute('opacity', j < reached && match.matched.includes(j) ? String(TINT) : '0'));
        cells.forEach((r, j) => {
          r.setAttribute('stroke', j === current ? c.itemComparing : 'none');
          r.setAttribute('stroke-width', j === current ? '1.5' : '0');
        });
      };
      if (count) count.setAttribute('visibility', 'hidden');

      await tween(mine, dwell * n, (elapsed) => {
        const i = Math.min(n - 1, Math.floor(elapsed / dwell));
        const local = Math.min(1, (elapsed - i * dwell) / (dwell * PROBE_MOVE));
        const p = ease(local);
        const fromX = i === 0 ? startX : restX;
        const fromY = i === 0 ? startY : rowCy(i - 1);
        const x = lerp(fromX, restX, p);
        const y = lerp(fromY, rowCy(i), p);
        chip.setAttribute('transform', `translate(${round(x)},${round(y)})`);
        const arrived = local >= 1 || elapsed >= dwell * n;
        show(arrived ? i + 1 : i, arrived ? i : -1);
      });
    }

    /** 조건 줄 속 값 글자의 가운데 x — drawCondition 이 놓는 자리와 같은 셈. */
    function drawConditionAnchor(g: Geometry, column: string, value: string): number {
      const lead = SQL_WHERE.length + column.length + 4;
      return g.valueX + CELL_PAD + codeCharW * (lead + (value.length + 2) / 2);
    }

    /** 펴기 걸음 — 칸 속 제자리의 값들이 떨어져 나와 아래 표의 새 줄로 내려앉는다. */
    async function runUnpack(
      mine: number,
      scene: AtomicCellScene,
      h: Handles,
      step: { row: number; start: number; count: number },
    ): Promise<void> {
      const g = geometry(scene);
      const row = scene.source.rows[step.row];
      if (!row || step.count === 0) return;
      const cell = row[1] ?? '';
      const srcCy = srcRowTop(g, step.row) + g.srcRowH / 2;

      // 값마다 칸 속 제자리 — 칸 글자에서 그 값이 시작하는 글자 자리
      let cursor = 0;
      const offsets: number[] = [];
      for (let k = 0; k < step.count; k += 1) {
        const value = scene.flat[step.start + k]?.value ?? '';
        const at = cell.indexOf(value, cursor);
        const pos = at < 0 ? cursor : at;
        offsets.push(pos * valueCharW);
        cursor = pos + value.length;
      }

      const moving = h.tgtRows.slice(step.start, step.start + step.count);
      const fromH = HEAD_H + step.start * g.tgtRowH;
      const toH = HEAD_H + (step.start + step.count) * g.tgtRowH;
      const total = FLY_MS + FLY_GAP * (step.count - 1);

      await tween(mine, total, (elapsed) => {
        if (h.tgtFrame) h.tgtFrame.setAttribute('height', String(round(lerp(fromH, toH, ease(Math.min(1, elapsed / FLY_MS))))));
        moving.forEach((r, k) => {
          const p = ease(Math.max(0, Math.min(1, (elapsed - k * FLY_GAP) / FLY_MS)));
          const cy = tgtRowTop(g, step.start + k) + g.tgtRowH / 2;
          const vdx = (1 - p) * (offsets[k] ?? 0);
          const dy = (1 - p) * (srcCy - cy);
          r.value.setAttribute('transform', `translate(${round(vdx)},${round(dy)})`);
          r.name.setAttribute('transform', `translate(0,${round(dy)})`);
          if (r.line) r.line.setAttribute('opacity', p >= 1 ? '1' : '0');
        });
      });
    }

    return {
      async render(next: AtomicCellScene, prev: AtomicCellScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || !prev || next.seq !== prev.seq + 1) return;
        const step = next.step;
        if (step.kind === 'filter') await runFilter(mine, next, h, step.where);
        else if (step.kind === 'unpack') await runUnpack(mine, next, h, step);
        else return;
        if (destroyed || mine !== gen) return;
        drawStatic(next);
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
