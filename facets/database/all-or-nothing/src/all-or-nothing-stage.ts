/**
 * all-or-nothing stage — 위에 트랜잭션 본문(SQL), 아래 왼쪽에 표, 오른쪽에 되돌림 기록.
 *
 * 동사는 "되감긴다". 쓰기 걸음에서는 문장의 새 값이 본문에서 줄로 내려앉고, 줄의 옛 값이
 * 되돌림 기록 칸으로 옮겨 간다. 실패한 문장의 새 값은 줄에 닿자마자 튕겨 나간다.
 * 되돌림 걸음에서는 기록 칸의 옛 값이 적힌 역순으로 한 칸씩 줄로 되돌아 날아간다 —
 * 쓰기 때 지나간 길을 거꾸로 밟는다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { AllOrNothingScene, AonStep } from './scene.js';

const H = 384;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = 16;
const GUTTER = 20;
const MARK_ROOM = 96;
const LINE_H = 20;
const SQL_TOP = 12;
const COL_GAP = 28;
const TITLE_H = 18;
const HEAD_H = 16;
const TABLE_GAP = 12;
const MAX_ROW_H = 30;
const MAX_CARD_H = 44;
const CARD_GAP = 8;
const MOTION_MS = 600;
const BOUNCE_RISE = 44;
const ARC_LIFT = 26;

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

type Layout = {
  codePx: number;
  lineY: (line: number) => number;
  lineEnd: (line: number) => number;
  codeX: number;
  colW: number;
  rightX: number;
  tableTitle: { name: string; y: number; check: string; keyColumn: string; column: string; headY: number }[];
  rows: Map<string, Rect>;
  valueX: number;
  undoTitleY: number;
  card: (index: number) => Rect;
  captionY: [number, number];
};

type Hide = { cell?: string; cardOld?: number };

const rowId = (table: string, key: string): string => `${table}\u0000${key}`;

function r1(v: number): number {
  const n = Math.round(v * 10) / 10;
  return Object.is(n, -0) ? 0 : n;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function layout(scene: AllOrNothingScene): Layout {
  const sm = parseFloat(fontSizes.sm);
  const longest = scene.body.reduce((m, s) => Math.max(m, s.length), 1);
  const codeRoom = W - 2 * MARGIN - GUTTER - MARK_ROOM;
  const codePx = Math.min(sm, codeRoom / (longest * 0.6));
  const charW = codePx * 0.6;
  const codeX = MARGIN + GUTTER;
  const lineY = (line: number): number => SQL_TOP + LINE_H * (line + 0.5);
  const lineEnd = (line: number): number => codeX + (scene.body[line]?.length ?? 0) * charW;

  const captionY: [number, number] = [H - 38, H - 16];
  const bottom = H - 58;
  const top = SQL_TOP + LINE_H * scene.body.length + 24;
  const colW = (W - 2 * MARGIN - COL_GAP) / 2;
  const rightX = MARGIN + colW + COL_GAP;

  const rowCount = scene.tables.reduce((n, tb) => n + tb.keys.length, 0);
  const fixed = scene.tables.length * (TITLE_H + HEAD_H) + Math.max(0, scene.tables.length - 1) * TABLE_GAP;
  const rowH = Math.min(MAX_ROW_H, (bottom - top - fixed) / Math.max(1, rowCount));

  const tableTitle: Layout['tableTitle'] = [];
  const rows = new Map<string, Rect>();
  let y = top;
  for (const tb of scene.tables) {
    tableTitle.push({
      name: tb.name,
      y: y + 13,
      check: checkText(scene, tb.name),
      keyColumn: tb.keyColumn,
      column: tb.column,
      headY: y + TITLE_H + 11,
    });
    y += TITLE_H + HEAD_H;
    for (const key of tb.keys) {
      rows.set(rowId(tb.name, key), { x: MARGIN, y, w: colW, h: rowH - 4 });
      y += rowH;
    }
    y += TABLE_GAP;
  }

  const slots = Math.max(scene.undo.length, scene.body.length - 2, 1);
  const cardTop = top + TITLE_H + 4;
  const cardH = Math.min(MAX_CARD_H, (bottom - cardTop) / slots - CARD_GAP);
  const card = (index: number): Rect => ({
    x: rightX,
    y: cardTop + index * (cardH + CARD_GAP),
    w: colW,
    h: cardH,
  });

  return {
    codePx,
    lineY,
    lineEnd,
    codeX,
    colW,
    rightX,
    tableTitle,
    rows,
    valueX: MARGIN + colW - 44,
    undoTitleY: top + 13,
    card,
    captionY,
  };
}

function checkText(scene: AllOrNothingScene, table: string): string {
  const tb = scene.tables.find((x) => x.name === table);
  if (!tb) throw new Error(`all-or-nothing stage: 없는 표 ${table}`);
  return `CHECK (${tb.column} ${tb.checkOp} ${tb.checkBound})`;
}

function cardOldPoint(rect: Rect): Point {
  return { x: rect.x + rect.w * 0.6, y: rect.y + rect.h - 10 };
}

function cardNewPoint(rect: Rect): Point {
  return { x: rect.x + rect.w * 0.85, y: rect.y + rect.h - 10 };
}

function cellPoint(lay: Layout, table: string, key: string): Point {
  const rect = lay.rows.get(rowId(table, key));
  if (!rect) throw new Error(`all-or-nothing stage: 없는 줄 ${table}.${key}`);
  return { x: lay.valueX, y: rect.y + rect.h / 2 + 5 };
}

export const allOrNothingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
      }
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function caption(scene: AllOrNothingScene): [string, string] {
      const step: AonStep = scene.step;
      switch (step.kind) {
        case 'start':
          return [t('caption.start', 'Transaction open. Undo log entries: {n}', { n: 0 }), ''];
        case 'write':
          return [
            t('caption.write', 'Statement {no}: {key} {before} → {after}. Undo log entries: {n}', {
              no: step.line,
              key: step.key,
              before: step.before,
              after: step.after,
              n: step.entries,
            }),
            '',
          ];
        case 'reject':
          return [
            t('caption.reject', 'Statement {no} rejected: {key} would become {value}. {check} fails.', {
              no: step.line,
              key: step.key,
              value: step.attempted,
              check: checkText(scene, step.table),
            }),
            t('caption.rollback', 'Rolling back. Entries to undo: {n}', { n: step.entries }),
          ];
        case 'commit':
          return [t('caption.commit', 'COMMIT. Rows written: {n}', { n: step.entries }), ''];
        case 'undo':
          return [
            t('caption.undo', 'Undo entry {slot}: {key} {from} → {to}. Entries left: {left}', {
              slot: step.slot,
              key: step.key,
              from: step.from,
              to: step.to,
              left: step.left,
            }),
            step.left === 0
              ? t('caption.restored', 'Rows at their starting value: {same} / {total}', {
                  same: step.restored,
                  total: step.total,
                })
              : '',
          ];
      }
    }

    /** 장면 전체를 세운다. hide 는 운동이 날라 올 자리를 비워 둔다. 돌려주는 것은 운동 층. */
    function drawStatic(scene: AllOrNothingScene, hide: Hide = {}): SVGGElement {
      svg.textContent = '';
      const base = el('g', {}, svg);
      const overlay = el('g', {}, svg);
      if (scene.body.length === 0) return overlay;
      const lay = layout(scene);
      const step = scene.step;
      const sm = parseFloat(fontSizes.sm);
      const xs = parseFloat(fontSizes.xs);

      // ── 본문
      if (scene.cursor !== null) {
        const cy = lay.lineY(scene.cursor);
        el('rect', { x: MARGIN, y: cy - LINE_H / 2, width: W - 2 * MARGIN, height: LINE_H, rx: 3, fill: c.bgSubtle }, base);
        el(
          'path',
          { d: `M${r1(MARGIN + 4)} ${r1(cy - 5)} L${r1(MARGIN + 12)} ${r1(cy)} L${r1(MARGIN + 4)} ${r1(cy + 5)} Z`, fill: c.primary },
          base,
        );
      }
      scene.body.forEach((line, i) => {
        const state = scene.lines[i];
        const y = lay.lineY(i);
        const fill = state === 'rejected' ? c.danger : state === 'skipped' ? c.textMuted : c.text;
        el(
          'text',
          { x: lay.codeX, y: y + lay.codePx * 0.35, fill, 'font-family': fonts.mono, 'font-size': lay.codePx, 'xml:space': 'preserve' },
          base,
          line,
        );
        if (state === 'skipped') {
          el('line', { x1: lay.codeX, y1: y, x2: lay.lineEnd(i), y2: y, stroke: c.textMuted, 'stroke-width': 1.2 }, base);
        }
        const markAttrs = { x: W - MARGIN, y: y + xs * 0.35, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.xs };
        if (state === 'done') el('text', { ...markAttrs, fill: c.success }, base, t('mark.done', 'done'));
        if (state === 'rejected') el('text', { ...markAttrs, fill: c.danger, 'font-weight': 600 }, base, t('mark.rejected', 'rejected'));
        if (state === 'skipped') el('text', { ...markAttrs, fill: c.textMuted }, base, t('mark.skipped', 'not run'));
      });

      // ── 표
      const live = new Set(scene.undo.filter((u) => !u.undone).map((u) => rowId(u.table, u.key)));
      const target =
        step.kind === 'write' || step.kind === 'undo' || step.kind === 'reject' ? rowId(step.table, step.key) : null;
      const rejected = scene.rejected ? rowId(scene.rejected.table, scene.rejected.key) : null;
      for (const title of lay.tableTitle) {
        el('text', { x: MARGIN, y: title.y, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 600 }, base, title.name);
        el(
          'text',
          { x: MARGIN + lay.colW, y: title.y, 'text-anchor': 'end', fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs },
          base,
          title.check,
        );
        el('text', { x: MARGIN + 12, y: title.headY, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, base, title.keyColumn);
        el(
          'text',
          { x: lay.valueX, y: title.headY, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs },
          base,
          title.column,
        );
      }
      for (const v of scene.values) {
        const id = rowId(v.table, v.key);
        const rect = lay.rows.get(id);
        if (!rect) throw new Error(`all-or-nothing stage: 없는 줄 ${v.table}.${v.key}`);
        const isTarget = id === target;
        const isRejected = id === rejected;
        el(
          'rect',
          {
            x: rect.x,
            y: rect.y,
            width: rect.w,
            height: rect.h,
            rx: 4,
            fill: c.bg,
            stroke: isRejected ? c.danger : isTarget ? c.primary : c.border,
            'stroke-width': isTarget || isRejected ? 2 : 1,
            ...(isRejected ? { 'stroke-dasharray': '5 3' } : {}),
          },
          base,
        );
        el('text', { x: rect.x + 12, y: rect.y + rect.h / 2 + sm * 0.35, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm }, base, `'${v.key}'`);
        if (hide.cell !== id) {
          const p = cellPoint(lay, v.table, v.key);
          el(
            'text',
            {
              x: p.x,
              y: p.y,
              'text-anchor': 'middle',
              fill: live.has(id) ? c.itemActive : c.text,
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              'font-weight': 700,
            },
            base,
            String(v.value),
          );
        }
      }

      // ── 되돌림 기록
      el('text', { x: lay.rightX, y: lay.undoTitleY, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600 }, base, t('label.undoLog', 'Undo log'));
      scene.undo.forEach((u, i) => {
        const rect = lay.card(i);
        const current = step.kind === 'undo' && step.slot === i + 1;
        const ink = u.undone ? c.textMuted : c.text;
        el(
          'rect',
          {
            x: rect.x,
            y: rect.y,
            width: rect.w,
            height: rect.h,
            rx: 5,
            fill: u.undone ? c.bg : c.bgSubtle,
            stroke: current ? c.primary : c.border,
            'stroke-width': current ? 2 : 1,
            ...(u.undone ? { 'stroke-dasharray': '4 3' } : {}),
          },
          base,
        );
        el('text', { x: rect.x + 12, y: rect.y + rect.h / 2 + sm * 0.35, fill: ink, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700 }, base, String(i + 1));
        el('text', { x: rect.x + 32, y: rect.y + 14, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, base, u.table);
        el('text', { x: rect.x + 32, y: rect.y + rect.h - 10, fill: ink, 'font-family': fonts.mono, 'font-size': fontSizes.sm }, base, `'${u.key}'`);
        const oldP = cardOldPoint(rect);
        const newP = cardNewPoint(rect);
        el('text', { x: oldP.x, y: rect.y + 14, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, base, t('label.old', 'old'));
        el('text', { x: newP.x, y: rect.y + 14, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, base, t('label.new', 'new'));
        if (hide.cardOld !== i) {
          el(
            'text',
            { x: oldP.x, y: oldP.y, 'text-anchor': 'middle', fill: ink, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700 },
            base,
            String(u.before),
          );
        }
        el(
          'text',
          { x: newP.x, y: newP.y, 'text-anchor': 'middle', fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.sm },
          base,
          String(u.after),
        );
      });

      // ── 캡션
      const [one, two] = caption(scene);
      el('text', { x: MARGIN, y: lay.captionY[0], fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md }, base, one);
      if (two !== '') {
        el('text', { x: MARGIN, y: lay.captionY[1], fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, base, two);
      }
      return overlay;
    }

    function token(parent: Element, text: string, fill: string): SVGTextElement {
      return el(
        'text',
        { x: 0, y: 0, 'text-anchor': 'middle', fill, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700 },
        parent,
        text,
      );
    }

    function place(node: SVGTextElement, p: Point): void {
      node.setAttribute('x', String(r1(p.x)));
      node.setAttribute('y', String(r1(p.y)));
    }

    /** 곧은 길에 위로 휘는 활을 얹는다. */
    function along(a: Point, b: Point, p: number, lift: number): Point {
      const e = ease(p);
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e - Math.sin(Math.PI * e) * lift };
    }

    function tween(mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        const start = Date.now();
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
          const p = Math.min(1, (Date.now() - start) / MOTION_MS);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: AllOrNothingScene,
      _prev: AllOrNothingScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      if (!opts.animate || next.body.length === 0 || step.kind === 'start' || step.kind === 'commit') {
        drawStatic(next);
        return;
      }
      const lay = layout(next);
      const cell = cellPoint(lay, step.table, step.key);

      if (step.kind === 'write') {
        const slot = next.undo.length - 1;
        const overlay = drawStatic(next, { cell: rowId(step.table, step.key), cardOld: slot });
        const from = { x: lay.lineEnd(step.line) - 12, y: lay.lineY(step.line) + 5 };
        const cardOld = cardOldPoint(lay.card(slot));
        const leaving = token(overlay, String(step.before), c.text);
        const landing = token(overlay, String(step.after), c.itemActive);
        await tween(mine, (p) => {
          place(leaving, along(cell, cardOld, p, ARC_LIFT));
          place(landing, along(from, cell, p, 0));
        });
      } else if (step.kind === 'reject') {
        const overlay = drawStatic(next);
        const rect = lay.rows.get(rowId(step.table, step.key));
        if (!rect) throw new Error(`all-or-nothing stage: 없는 줄 ${step.table}.${step.key}`);
        const from = { x: lay.lineEnd(step.line) - 12, y: lay.lineY(step.line) + 5 };
        const hit = { x: cell.x, y: rect.y - 2 };
        const back = { x: cell.x + (from.x - cell.x) * 0.25, y: rect.y - BOUNCE_RISE };
        const bouncing = token(overlay, String(step.attempted), c.danger);
        const IMPACT = 0.55;
        await tween(mine, (p) => {
          if (p <= IMPACT) {
            place(bouncing, along(from, hit, p / IMPACT, 0));
            return;
          }
          const q = (p - IMPACT) / (1 - IMPACT);
          place(bouncing, along(hit, back, q, 0));
          bouncing.setAttribute('opacity', String(r1(1 - q)));
        });
      } else {
        const index = step.slot - 1;
        const overlay = drawStatic(next, { cell: rowId(step.table, step.key) });
        const cardOld = cardOldPoint(lay.card(index));
        const outgoing = token(overlay, String(step.from), c.itemActive);
        const returning = token(overlay, String(step.to), c.text);
        await tween(mine, (p) => {
          place(returning, along(cardOld, cell, p, ARC_LIFT));
          place(outgoing, { x: cell.x + 30 * ease(p), y: cell.y + 14 * ease(p) });
          outgoing.setAttribute('opacity', String(r1(1 - ease(p))));
        });
      }
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
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
