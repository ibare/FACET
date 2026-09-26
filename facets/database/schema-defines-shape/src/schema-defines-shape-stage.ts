/**
 * schema-defines-shape stage — 들어오려는 줄을 열의 모양에 맞춰 보고, 어긋나면 튕겨 낸다.
 *
 * 표 쪽은 가만히 있다. 움직이는 것은 들어오려는 줄이다.
 *   - 칸마다 제 열 머리(모양)에 한 번씩 눌려 맞춰진다 — 맞으면 성공 빛, 어긋나면 위험 빛
 *   - 다 맞으면 줄이 표 안의 제자리로 내려앉는다 (글자는 SQL 값에서 저장된 값으로 바뀐다)
 *   - 한 칸이라도 어긋나면 줄이 표 머리에 부딪혀 되튀고 옆의 거절 더미로 날아간다.
 *     어긋난 칸과 그 칸이 어긴 CREATE TABLE 의 낱말이 함께 드러난다
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
import type { CellValue, ColumnShape, ShapeRule } from './algorithm.js';
import type { SchemaScene } from './scene.js';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 고정 글꼴의 글자 폭 / 글자 크기 */
const MONO_RATIO = 0.6;
/** 들어오려는 줄 칸의 높이 상한 */
const ROW_H_MAX = 28;
/** 거절 더미 한 칸의 높이 상한 */
const PILE_ITEM_MAX = 48;

const CHECK_MS = 140;
const DIP_PX = 7;
const LAND_MS = 320;
const HIT_MS = 150;
const FLY_MS = 380;

type Layout = {
  pad: number;
  codePx: number;
  codeLH: number;
  codeBase: number;
  /** 열 차례 → CREATE TABLE 의 몇째 줄 */
  colLine: number[];
  stmtY: number;
  stmtPx: number;
  leftW: number;
  colX: number[];
  colW: number[];
  inTop: number;
  inH: number;
  headTop: number;
  headH: number;
  bodyTop: number;
  rowH: number;
  pileX: number;
  pileW: number;
  pileColX: number[];
  pileColW: number[];
  pileTop: number;
  pileItemH: number;
  pileCellH: number;
  captionTop: number;
};

function rnd(n: number): number {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v;
}

function literal(v: CellValue): string {
  if (v === null) return 'NULL';
  if (typeof v === 'string') return `'${v}'`;
  return String(v);
}

function stored(v: CellValue): string {
  if (v === null) return 'NULL';
  return String(v);
}

/** 어긴 모양을 CREATE TABLE 의 낱말 그대로 */
function shapeToken(col: ColumnShape, rule: ShapeRule): string {
  if (rule === 'notNull') return 'NOT NULL';
  if (col.type === 'VARCHAR') {
    if (col.length === null) throw new Error(`열 ${col.name}: VARCHAR 인데 길이가 없다`);
    return `VARCHAR(${col.length})`;
  }
  return col.type;
}

function colAt(scene: SchemaScene, c: number): ColumnShape {
  const col = scene.columns[c];
  if (col === undefined) throw new Error(`열 ${c} 이 없다`);
  return col;
}

function valuesOf(scene: SchemaScene, index: number): CellValue[] {
  const ins = scene.inserts[index];
  if (ins === undefined) throw new Error(`INSERT ${index} 이 없다`);
  return ins.values;
}

/** 칸 폭 — 열 이름과 그 열에 올 가장 긴 값 글자에 비례 */
function splitWidths(scene: SchemaScene, x0: number, total: number): { x: number[]; w: number[] } {
  const weights = scene.columns.map((col, c) => {
    let longest = col.name.length;
    for (const ins of scene.inserts) {
      const v = ins.values[c];
      if (v === undefined) throw new Error(`INSERT 에 열 ${c} 의 값이 없다`);
      longest = Math.max(longest, literal(v).length);
    }
    return Math.max(4, longest + 2);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const x: number[] = [];
  const w: number[] = [];
  let at = x0;
  for (const k of weights) {
    const width = (total * k) / sum;
    x.push(at);
    w.push(width);
    at += width;
  }
  return { x, w };
}

function layoutOf(scene: SchemaScene): Layout {
  const W = PIECE_CANVAS_W;
  const pad = 20;
  const gap = 24;
  const codePx = parseFloat(fontSizes.sm);
  const codeLH = Math.round(codePx * 1.5);
  const codeBase = 30;
  const pileW = Math.round(W * 0.32);
  const leftW = W - pad * 2 - gap - pileW;

  const colLine = scene.columns.map((col) => {
    const at = scene.schema.findIndex((line) => line.trimStart().startsWith(`${col.name} `));
    if (at < 0) throw new Error(`CREATE TABLE 에 열 ${col.name} 의 줄이 없다`);
    return at;
  });

  const longestStmt = scene.inserts.reduce((m, ins) => Math.max(m, ins.sql.length), 1);
  const stmtPx = Math.min(codePx, leftW / (longestStmt * MONO_RATIO));

  const codeBottom = codeBase + (scene.schema.length - 1) * codeLH + 6;
  const stmtY = codeBottom + 34;
  const inTop = stmtY + 12;
  const inH = ROW_H_MAX;
  const headTop = inTop + inH + 20;
  const headH = 24;
  const bodyTop = headTop + headH;
  const captionTop = H - 66;
  const bodyBottom = captionTop - 8;
  const slots = Math.max(1, scene.inserts.length);
  const rowH = Math.min(ROW_H_MAX, (bodyBottom - bodyTop) / slots);

  const left = splitWidths(scene, pad, leftW);
  const pileX = pad + leftW + gap;
  const pile = splitWidths(scene, pileX, pileW);
  const pileTop = inTop;
  const pileItemH = Math.min(PILE_ITEM_MAX, (bodyBottom - pileTop) / slots);
  const pileCellH = Math.min(24, pileItemH * 0.56);

  return {
    pad,
    codePx,
    codeLH,
    codeBase,
    colLine,
    stmtY,
    stmtPx,
    leftW,
    colX: left.x,
    colW: left.w,
    inTop,
    inH,
    headTop,
    headH,
    bodyTop,
    rowH,
    pileX,
    pileW,
    pileColX: pile.x,
    pileColW: pile.w,
    pileTop,
    pileItemH,
    pileCellH,
    captionTop,
  };
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function pick(arr: number[], i: number): number {
  const v = arr[i];
  if (v === undefined) throw new Error(`자리 ${i} 가 없다`);
  return v;
}

export const schemaDefinesShapeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const doc = svg.ownerDocument;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function node<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const e = doc.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        e.setAttribute(k, typeof v === 'number' ? String(rnd(v)) : v);
      }
      parent.appendChild(e);
      return e;
    }

    function label(
      parent: Element,
      s: string,
      x: number,
      y: number,
      px: number,
      fill: string,
      opts: { mono?: boolean; anchor?: 'start' | 'middle' | 'end'; weight?: string } = {},
    ): SVGTextElement {
      const e = node(
        'text',
        {
          x,
          y,
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': `${rnd(px)}px`,
          fill,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
          style: 'white-space: pre',
        },
        parent,
      );
      e.textContent = s;
      return e;
    }

    /** 칸 글자가 칸에 들어가도록 글자 크기를 줄인다 (상한은 토큰) */
    function fitPx(s: string, width: number, basePx: number): number {
      return Math.min(basePx, (width - 6) / (Math.max(1, s.length) * MONO_RATIO));
    }

    /** 칸 한 줄 — 들어오려는 줄 · 표의 줄 · 거절 더미가 함께 쓴다 */
    function cellRow(
      parent: Element,
      xs: number[],
      ws: number[],
      top: number,
      h: number,
      texts: string[],
      nulls: boolean[],
      px: number,
      stroke: (c: number) => string,
    ): SVGRectElement[] {
      const rects: SVGRectElement[] = [];
      texts.forEach((s, c) => {
        const x = pick(xs, c);
        const w = pick(ws, c);
        rects.push(
          node('rect', { x, y: top, width: w, height: h, fill: colors.bg, stroke: stroke(c), 'stroke-width': 1.2 }, parent),
        );
        label(parent, s, x + w / 2, top + h / 2 + px * 0.36, fitPx(s, w, px), nulls[c] === true ? colors.textMuted : colors.text, {
          mono: true,
          anchor: 'middle',
        });
      });
      return rects;
    }

    type Handles = {
      L: Layout;
      landing: SVGGElement | null;
      token: SVGGElement | null;
      caption: SVGGElement;
    };

    function drawStatic(scene: SchemaScene): Handles {
      svg.textContent = '';
      const L = layoutOf(scene);
      const root = node('g', {}, svg);
      const step = scene.step;

      // CREATE TABLE — 모양의 원본
      scene.schema.forEach((line, i) => {
        label(root, line, L.pad, L.codeBase + i * L.codeLH, L.codePx, colors.text, { mono: true });
      });

      // 어긴 낱말 — 이번 걸음이 거절일 때
      let token: SVGGElement | null = null;
      if (step !== null && step.kind === 'reject') {
        const col = colAt(scene, step.column);
        const word = shapeToken(col, step.rule);
        const li = pick(L.colLine, step.column);
        const line = scene.schema[li];
        if (line === undefined) throw new Error(`CREATE TABLE ${li} 째 줄이 없다`);
        const from = line.indexOf(col.name) + col.name.length;
        const at = line.indexOf(word, from);
        if (at < 0) throw new Error(`열 ${col.name} 의 줄에 ${word} 가 없다`);
        const cw = L.codePx * MONO_RATIO;
        const base = L.codeBase + li * L.codeLH;
        token = node('g', {}, root);
        node(
          'rect',
          {
            x: L.pad + at * cw - 3,
            y: base - L.codePx,
            width: word.length * cw + 6,
            height: L.codePx + 6,
            rx: 3,
            fill: colors.bg,
            stroke: colors.danger,
            'stroke-width': 1.5,
          },
          token,
        );
        label(token, word, L.pad + at * cw, base, L.codePx, colors.danger, { mono: true, weight: 'bold' });
      }

      // 지금 시도한 문
      if (step !== null) {
        const ins = scene.inserts[step.index];
        if (ins === undefined) throw new Error(`INSERT ${step.index} 이 없다`);
        label(root, ins.sql, L.pad, L.stmtY, L.stmtPx, colors.text, { mono: true });
      }

      // 표 — 이름 · 머리 · 줄
      const tableRight = pick(L.colX, scene.columns.length - 1) + pick(L.colW, scene.columns.length - 1);
      label(root, scene.table, tableRight, L.headTop - 6, parseFloat(fontSizes.xs), colors.textMuted, {
        mono: true,
        anchor: 'end',
      });
      scene.columns.forEach((col, c) => {
        const x = pick(L.colX, c);
        const w = pick(L.colW, c);
        node('rect', { x, y: L.headTop, width: w, height: L.headH, fill: colors.bgSubtle, stroke: colors.border }, root);
        label(root, col.name, x + w / 2, L.headTop + L.headH / 2 + L.codePx * 0.36, L.codePx, colors.text, {
          mono: true,
          anchor: 'middle',
          weight: 'bold',
        });
      });
      let landing: SVGGElement | null = null;
      scene.rows.forEach((index, r) => {
        const vals = valuesOf(scene, index);
        const newest = step !== null && step.kind === 'insert' && r === scene.rows.length - 1;
        const g = node('g', {}, root);
        cellRow(
          g,
          L.colX,
          L.colW,
          L.bodyTop + r * L.rowH,
          L.rowH,
          vals.map(stored),
          vals.map((v) => v === null),
          L.codePx,
          () => (newest ? colors.success : colors.border),
        );
        if (newest) landing = g;
      });

      // 거절 더미
      if (scene.rejected.length > 0) {
        label(root, t('label.rejected', 'Rejected'), L.pileX, L.stmtY, parseFloat(fontSizes.sm), colors.danger, {
          weight: 'bold',
        });
      }
      const xsPx = parseFloat(fontSizes.xs);
      scene.rejected.forEach((rj, k) => {
        const vals = valuesOf(scene, rj.index);
        const top = L.pileTop + k * L.pileItemH;
        const g = node('g', {}, root);
        cellRow(
          g,
          L.pileColX,
          L.pileColW,
          top,
          L.pileCellH,
          vals.map(literal),
          vals.map((v) => v === null),
          xsPx,
          (c) => (c === rj.column ? colors.danger : colors.border),
        );
        const cx = pick(L.pileColX, rj.column) + pick(L.pileColW, rj.column) / 2;
        const word = shapeToken(colAt(scene, rj.column), rj.rule);
        label(g, word, cx, top + L.pileCellH + xsPx + 1, xsPx, colors.danger, { mono: true, anchor: 'middle' });
        if (step !== null && step.kind === 'reject' && k === scene.rejected.length - 1) landing = g;
      });

      // 캡션 — 지금 일어난 일만
      const caption = node('g', {}, root);
      const lines: string[] = [];
      const finished = scene.rows.length + scene.rejected.length === scene.inserts.length;
      const countLine = finished
        ? t('caption.tally', 'Tried: {tried} · Inserted: {ok} · Rejected: {bad}', {
            tried: scene.inserts.length,
            ok: scene.rows.length,
            bad: scene.rejected.length,
          })
        : null;
      if (step === null) {
        lines.push(t('caption.start', 'The table is empty. Columns: {n}', { n: scene.columns.length }));
      } else if (step.kind === 'insert') {
        lines.push(t('caption.inserted', 'Every value fits its column, so the row goes in.'));
        lines.push(countLine ?? t('caption.rows', 'Rows in table: {n}', { n: step.rows }));
        if (step.nulls.length > 0) {
          lines.push(
            t('caption.nullFits', 'Columns without NOT NULL: {cols}. NULL fits there.', {
              cols: step.nulls.map((c) => colAt(scene, c).name).join(', '),
            }),
          );
        }
      } else {
        const col = colAt(scene, step.column);
        lines.push(
          t('caption.rejected', 'Column {col} breaks {shape}, so the whole row is turned away.', {
            col: col.name,
            shape: shapeToken(col, step.rule),
          }),
        );
        lines.push(countLine ?? t('caption.rows', 'Rows in table: {n}', { n: step.rows }));
        if (step.rule === 'length') {
          if (step.length === null || col.length === null) throw new Error('길이 어긋남인데 글자 수가 없다');
          lines.push(t('caption.length', 'Characters: {len} · Limit: {max}', { len: step.length, max: col.length }));
        }
      }
      lines.forEach((s, i) => {
        const first = i === 0;
        label(
          caption,
          s,
          L.pad,
          L.captionTop + 16 + i * 19,
          parseFloat(first ? fontSizes.md : fontSizes.sm),
          first ? colors.text : colors.textMuted,
        );
      });

      return { L, landing, token, caption };
    }

    function now(): number {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        if (destroyed || mine !== gen) {
          finish();
          return;
        }
        waiters.add(finish);
        const start = now();
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (now() - start) / ms);
          frame(p);
          if (p >= 1) {
            finish();
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

    function live(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    async function playStep(scene: SchemaScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      const hs = drawStatic(scene);
      const L = hs.L;
      if (hs.landing !== null) hs.landing.setAttribute('opacity', '0');
      if (hs.token !== null) hs.token.setAttribute('opacity', '0');
      hs.caption.setAttribute('opacity', '0');

      const vals = valuesOf(scene, step.index);
      const motion = node('g', {}, svg);
      const row = node('g', {}, motion);
      const cells: SVGGElement[] = [];
      const rects: SVGRectElement[] = [];
      vals.forEach((v, c) => {
        const g = node('g', {}, row);
        const [rect] = cellRow(
          g,
          [pick(L.colX, c)],
          [pick(L.colW, c)],
          L.inTop,
          L.inH,
          [literal(v)],
          [v === null],
          L.codePx,
          () => colors.border,
        );
        if (rect === undefined) throw new Error('칸을 못 그렸다');
        cells.push(g);
        rects.push(rect);
      });

      // 1) 칸마다 제 열의 모양에 눌려 맞춰진다
      const lastChecked = step.kind === 'reject' ? step.column : vals.length - 1;
      for (let c = 0; c <= lastChecked; c++) {
        if (!live(mine)) return;
        const cell = cells[c];
        const rect = rects[c];
        if (cell === undefined || rect === undefined) throw new Error(`칸 ${c} 이 없다`);
        const li = pick(L.colLine, c);
        const lineGlow = node(
          'rect',
          {
            x: L.pad - 4,
            y: L.codeBase + li * L.codeLH - L.codePx,
            width: L.leftW + 8,
            height: L.codePx + 6,
            fill: 'none',
            stroke: colors.itemComparing,
            'stroke-width': 1.5,
            rx: 3,
          },
          motion,
        );
        const headGlow = node(
          'rect',
          {
            x: pick(L.colX, c),
            y: L.headTop,
            width: pick(L.colW, c),
            height: L.headH,
            fill: 'none',
            stroke: colors.itemComparing,
            'stroke-width': 2,
          },
          motion,
        );
        const bad = step.kind === 'reject' && c === step.column;
        await tween(CHECK_MS, mine, (p) => {
          const dy = Math.sin(Math.PI * p) * DIP_PX;
          cell.setAttribute('transform', `translate(0 ${rnd(dy)})`);
        });
        if (!live(mine)) return;
        cell.removeAttribute('transform');
        rect.setAttribute('stroke', bad ? colors.danger : colors.success);
        rect.setAttribute('stroke-width', '2');
        lineGlow.remove();
        headGlow.remove();
      }
      if (!live(mine)) return;

      if (step.kind === 'insert') {
        // 2) 다 맞았다 — 표 안의 제자리로 내려앉는다
        const targetTop = L.bodyTop + (scene.rows.length - 1) * L.rowH;
        const dy = targetTop - L.inTop;
        const sy = L.rowH / L.inH;
        await tween(LAND_MS, mine, (p) => {
          const e = ease(p);
          const s = 1 + (sy - 1) * e;
          const ty = L.inTop + dy * e - L.inTop * s;
          row.setAttribute('transform', `translate(0 ${rnd(ty)}) scale(1 ${rnd(s)})`);
        });
        return;
      }

      // 2) 어긋났다 — 표 머리에 부딪혀 되튀고, 어긴 낱말이 드러난다
      const hit = L.headTop - (L.inTop + L.inH) - 1;
      await tween(HIT_MS, mine, (p) => {
        row.setAttribute('transform', `translate(0 ${rnd(hit * p * p)})`);
      });
      if (!live(mine)) return;
      if (hs.token !== null) hs.token.removeAttribute('opacity');

      // 3) 거절 더미로 날아간다 — 줄의 어느 칸도 표에 남지 않는다
      const k = scene.rejected.length - 1;
      const x0 = pick(L.colX, 0);
      const sx = L.pileW / L.leftW;
      const sy = L.pileCellH / L.inH;
      const targetTop = L.pileTop + k * L.pileItemH;
      await tween(FLY_MS, mine, (p) => {
        const e = ease(p);
        const s1 = 1 + (sx - 1) * e;
        const s2 = 1 + (sy - 1) * e;
        const lift = Math.sin(Math.PI * p) * 36;
        const top = L.inTop + hit * (1 - e) + (targetTop - L.inTop) * e - lift;
        const left = x0 + (L.pileX - x0) * e;
        const tx = left - x0 * s1;
        const ty = top - L.inTop * s2;
        row.setAttribute('transform', `translate(${rnd(tx)} ${rnd(ty)}) scale(${rnd(s1)} ${rnd(s2)})`);
      });
    }

    function wakeAll(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
    }

    return {
      async render(next: SchemaScene, prev: SchemaScene | null, opts: { animate: boolean }): Promise<void> {
        wakeAll();
        const mine = (gen += 1);
        if (destroyed) return;
        const advanced =
          prev !== null &&
          next.step !== null &&
          next.rows.length + next.rejected.length === prev.rows.length + prev.rejected.length + 1;
        if (!opts.animate || !advanced) {
          drawStatic(next);
          return;
        }
        await playStep(next, mine);
        if (!live(mine)) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        wakeAll();
        svg.textContent = '';
      },
    };
  },
};
