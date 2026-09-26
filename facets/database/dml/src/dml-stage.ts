/**
 * dml 무대 — 문 카드 셋 · 스키마 · plant 표.
 *
 * 운동: 손잡이를 돌리면 문 카드가 새 차례의 자리로 미끄러지고, 표는 앞 판의 끝 표에서 처음 네 줄로
 * 되돌아간다(지워졌던 줄이 되들어오고 오른 값이 굴러 내려간다). 판이 돌며 INSERT 의 줄은 INSERT 카드에서
 * 표 끝으로 날아 들어오고, UPDATE 에 걸린 칸의 값은 굴러 바뀌고, DELETE 에 걸린 줄은 빠지며 아래 줄이
 * 올라와 틈을 메운다.
 *
 * 무대는 셈하지 않는다 — 걸린 줄 · 바뀐 값 · 영향 수는 payload 에 실려 온다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 780;
const H = 372;

// 문 카드 띠
const CARD_W = 232;
const CARD_GAP = 24;
const CARD_Y = 20;
const CARD_H = 96;
const CARDS_X = (W - (CARD_W * 3 + CARD_GAP * 2)) / 2;

// 스키마 카드
const SCHEMA_X = 18;
const SCHEMA_Y = 150;
const SCHEMA_W = 270;

// 표
const TABLE_X = 330;
const COL_W = [80, 170, 130];
const TABLE_W = COL_W.reduce((a, b) => a + b, 0);
const TABLE_NAME_Y = 142;
const HEADER_Y = 150;
const HEADER_H = 26;
const ROW_H = 30;
const ROWS_Y = HEADER_Y + HEADER_H + 2;
const MAX_ROWS = 5;

const CAPTION_Y = H - 14;

export type DmlRowView = { slot: number; values: string[] };

export type DmlSetupView = {
  order: string;
  statements: { position: number; key: string; kind: string; sql: string[] }[];
  schemaSql: string[];
  table: string;
  columns: string[];
  rows: DmlRowView[];
};

export type DmlStatementView = {
  step: number;
  key: string;
  kind: string;
  /** WHERE 가 보는 열의 자리. INSERT 는 -1 */
  whereColumn: number;
  hits: number[];
  changes: { slot: number; column: number; from: string; to: string }[];
  inserted: DmlRowView | null;
  removed: number[];
  rows: DmlRowView[];
  affected: number;
};

type Card = {
  g: SVGGElement;
  frame: SVGRectElement;
  lines: SVGGElement;
  footer: SVGTextElement;
  position: number;
};

type RowEl = {
  g: SVGGElement;
  bg: SVGRectElement;
  judge: SVGRectElement;
  cells: SVGGElement[];
  texts: SVGTextElement[];
  values: string[];
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

const cardX = (position: number): number => CARDS_X + (position - 1) * (CARD_W + CARD_GAP);
const rowY = (index: number): number => ROWS_Y + index * ROW_H;
const colX = (col: number): number => COL_W.slice(0, col).reduce((a, b) => a + b, 0);

export const dmlStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const monoPx = parseFloat(fontSizes.sm);
    const linePx = Math.round(monoPx * 1.45);

    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0) {
          resolve();
          return;
        }
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });

    const later = (ms: number, fn: () => void): void => {
      if (destroyed) return;
      if (isInstant() || ms <= 0) {
        fn();
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    };

    const flush = (): void => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };
    params.onScrubStart?.(flush);

    /** 곧바로 놓는다 (전환 없이) */
    const place = (node: SVGElement, x: number, y: number, opacity?: number): void => {
      node.style.transition = 'none';
      node.style.transform = `translate(${x}px, ${y}px)`;
      if (opacity !== undefined) node.style.opacity = String(opacity);
      node.getBoundingClientRect();
    };
    /** 시간에 걸쳐 옮긴다 */
    const move = (node: SVGElement, x: number, y: number, ms: number, opacity?: number): void => {
      const d = isInstant() ? 0 : Math.max(0, Math.round(ms));
      node.style.transition = d > 0 ? `transform ${d}ms ease-in-out, opacity ${d}ms ease-in-out` : 'none';
      node.style.transform = `translate(${x}px, ${y}px)`;
      if (opacity !== undefined) node.style.opacity = String(opacity);
    };

    // ── 층
    const bgLayer = el('g');
    const cardLayer = el('g');
    const badgeLayer = el('g');
    const schemaLayer = el('g');
    const tableLayer = el('g');
    const rowLayer = el('g');
    const flyLayer = el('g');
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    svg.append(bgLayer, cardLayer, badgeLayer, schemaLayer, tableLayer, rowLayer, flyLayer, caption);

    // 자리 번호와 화살표 — 자리는 그대로, 카드가 옮겨 다닌다
    for (let pos = 1; pos <= 3; pos++) {
      const x = cardX(pos);
      bgLayer.append(
        el('rect', {
          x,
          y: CARD_Y,
          width: CARD_W,
          height: CARD_H,
          rx: 8,
          fill: 'none',
          stroke: colors.border,
          'stroke-dasharray': '4 4',
        }),
      );
      const badge = el('g');
      badge.append(
        el('circle', { cx: x + 14, cy: CARD_Y, r: 10, fill: colors.text }),
        Object.assign(
          el('text', {
            x: x + 14,
            y: CARD_Y + 4,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 700,
            fill: colors.bg,
          }),
          { textContent: String(pos) },
        ),
      );
      badgeLayer.append(badge);
      if (pos < 3) {
        const ax = x + CARD_W + 4;
        const bx = x + CARD_W + CARD_GAP - 4;
        const my = CARD_Y + CARD_H / 2;
        bgLayer.append(
          el('path', {
            d: `M${ax} ${my} L${bx} ${my} M${bx - 5} ${my - 5} L${bx} ${my} L${bx - 5} ${my + 5}`,
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1.5,
          }),
        );
      }
    }

    // 스키마 카드
    const schemaFrame = el('rect', {
      x: SCHEMA_X,
      y: SCHEMA_Y,
      width: SCHEMA_W,
      height: 0,
      rx: 8,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
    });
    const schemaText = el('g');
    schemaLayer.append(schemaFrame, schemaText);

    const drawSchema = (lines: string[]): void => {
      schemaText.replaceChildren();
      lines.forEach((line, i) => {
        const tx = el('text', {
          x: SCHEMA_X + 12,
          y: SCHEMA_Y + 20 + i * linePx,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        tx.setAttribute('xml:space', 'preserve');
        tx.style.whiteSpace = 'pre';
        tx.textContent = line;
        schemaText.append(tx);
      });
      schemaFrame.setAttribute('height', String(lines.length * linePx + 14));
    };

    // 표 머리
    const tableName = el('text', {
      x: TABLE_X,
      y: TABLE_NAME_Y,
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      'font-weight': 700,
      fill: colors.text,
    });
    const header = el('g');
    tableLayer.append(tableName, header);

    const drawHeader = (table: string, columns: string[]): void => {
      if (columns.length !== COL_W.length) throw new Error(`dml-stage: 열 ${columns.length} 개는 그릴 수 없다`);
      tableName.textContent = table;
      header.replaceChildren(
        el('rect', { x: TABLE_X, y: HEADER_Y, width: TABLE_W, height: HEADER_H, fill: colors.bgSubtle }),
        el('line', {
          x1: TABLE_X,
          y1: HEADER_Y + HEADER_H,
          x2: TABLE_X + TABLE_W,
          y2: HEADER_Y + HEADER_H,
          stroke: colors.textMuted,
        }),
      );
      columns.forEach((name, c) => {
        header.append(
          Object.assign(
            el('text', {
              x: TABLE_X + colX(c) + 12,
              y: HEADER_Y + HEADER_H / 2 + 5,
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'font-weight': 700,
              fill: colors.textMuted,
            }),
            { textContent: name },
          ),
        );
      });
    };

    // ── 카드
    const cards = new Map<string, Card>();

    const makeCard = (key: string, kind: string, sql: string[], position: number): Card => {
      const g = el('g');
      const frame = el('rect', {
        x: 0,
        y: 0,
        width: CARD_W,
        height: CARD_H,
        rx: 8,
        fill: colors.bg,
        stroke: colors.border,
        'stroke-width': 1.5,
      });
      const lines = el('g');
      sql.forEach((line, i) => {
        const tx = el('text', {
          x: 14,
          y: 30 + i * linePx,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        tx.textContent = line;
        lines.append(tx);
      });
      const footer = el('text', {
        x: 14,
        y: CARD_H - 10,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      g.append(frame, lines, footer);
      g.dataset.kind = kind;
      cardLayer.append(g);
      place(g, cardX(position), CARD_Y);
      const card: Card = { g, frame, lines, footer, position };
      cards.set(key, card);
      return card;
    };

    const setCardState = (card: Card, state: 'idle' | 'active' | 'done'): void => {
      const stroke = state === 'active' ? colors.accent : state === 'done' ? colors.textMuted : colors.border;
      card.frame.setAttribute('stroke', stroke);
      card.frame.setAttribute('stroke-width', state === 'active' ? '3' : '1.5');
      card.frame.setAttribute('fill', state === 'done' ? colors.bgSubtle : colors.bg);
    };

    const cardOf = (key: string): Card => {
      const card = cards.get(key);
      if (!card) throw new Error(`dml-stage: 문 ${key} 의 카드가 없다`);
      return card;
    };

    // ── 줄
    const rows = new Map<number, RowEl>();
    let order: number[] = [];

    const makeText = (value: string): SVGTextElement =>
      Object.assign(
        el('text', {
          x: 12,
          y: ROW_H / 2 + 5,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.text,
        }),
        { textContent: value },
      );

    const makeRow = (row: DmlRowView): RowEl => {
      if (row.values.length !== COL_W.length) throw new Error(`dml-stage: 줄 ${row.slot} 의 칸 수가 맞지 않다`);
      const g = el('g');
      const bg = el('rect', { x: 0, y: 1, width: TABLE_W, height: ROW_H - 2, fill: colors.bg, stroke: colors.border });
      const judge = el('rect', {
        x: 2,
        y: 3,
        width: 0,
        height: ROW_H - 6,
        rx: 4,
        fill: 'none',
        stroke: 'none',
        'stroke-width': 2,
      });
      g.append(bg, judge);
      const cells: SVGGElement[] = [];
      const texts: SVGTextElement[] = [];
      row.values.forEach((value, c) => {
        const cell = el('g');
        cell.setAttribute('transform', `translate(${colX(c)} 0)`);
        const tx = makeText(value);
        cell.append(tx);
        g.append(cell);
        cells.push(cell);
        texts.push(tx);
      });
      rowLayer.append(g);
      const r: RowEl = { g, bg, judge, cells, texts, values: [...row.values] };
      rows.set(row.slot, r);
      return r;
    };

    const rowOf = (slot: number): RowEl => {
      const r = rows.get(slot);
      if (!r) throw new Error(`dml-stage: 줄 ${slot} 이 표에 없다`);
      return r;
    };

    /** 칸의 값을 굴려 바꾼다 — 옛 값은 위로 빠지고 새 값이 아래에서 올라온다 */
    const roll = (r: RowEl, c: number, value: string, ms: number): void => {
      if (r.values[c] === value) return;
      const cell = r.cells[c];
      const old = r.texts[c];
      if (!cell || !old) throw new Error(`dml-stage: 칸 ${c} 이 없다`);
      const fresh = makeText(value);
      cell.append(fresh);
      place(fresh, 0, ROW_H * 0.6, 0);
      move(fresh, 0, 0, ms, 1);
      move(old, 0, -ROW_H * 0.6, ms, 0);
      later(ms, () => old.remove());
      r.texts[c] = fresh;
      r.values[c] = value;
    };

    const clearMarks = (): void => {
      for (const r of rows.values()) {
        r.judge.setAttribute('stroke', 'none');
        r.judge.setAttribute('fill', 'none');
        r.bg.setAttribute('fill', colors.bg);
        for (const tx of r.texts) tx.setAttribute('fill', colors.text);
      }
    };

    /** 줄들을 목록 차례의 자리로 — 없는 줄은 오른쪽으로 빠지고, 새 줄은 오른쪽에서 들어온다 */
    const reconcile = (target: DmlRowView[], ms: number): void => {
      if (target.length > MAX_ROWS) throw new Error(`dml-stage: 줄 ${target.length} 개는 자리를 넘는다`);
      const keep = new Set(target.map((r) => r.slot));
      for (const [slot, r] of rows) {
        if (keep.has(slot)) continue;
        rows.delete(slot);
        const y = rowY(order.indexOf(slot));
        move(r.g, TABLE_X + 80, y, ms, 0);
        later(ms, () => r.g.remove());
      }
      target.forEach((row, i) => {
        const existing = rows.get(row.slot);
        if (existing) {
          move(existing.g, TABLE_X, rowY(i), ms, 1);
          row.values.forEach((value, c) => roll(existing, c, value, ms));
        } else {
          const r = makeRow(row);
          place(r.g, TABLE_X + 80, rowY(i), 0);
          move(r.g, TABLE_X, rowY(i), ms, 1);
        }
      });
      order = target.map((r) => r.slot);
    };

    /** 끝에 payload 의 표와 맞춘다 — 어긋나면 던진다 */
    const settle = (target: DmlRowView[]): void => {
      if (target.length !== rows.size) throw new Error('dml-stage: 표의 줄 수가 payload 와 다르다');
      target.forEach((row, i) => {
        const r = rowOf(row.slot);
        if (order[i] !== row.slot) throw new Error('dml-stage: 줄 차례가 payload 와 다르다');
        row.values.forEach((value, c) => {
          if (r.values[c] !== value) throw new Error(`dml-stage: 줄 ${row.slot} 칸 ${c} 이 payload 와 다르다`);
        });
      });
    };

    const setup = async (p: DmlSetupView, ms: number): Promise<void> => {
      drawSchema(p.schemaSql);
      drawHeader(p.table, p.columns);
      schemaFrame.setAttribute('stroke', colors.border);
      clearMarks();
      for (const s of p.statements) {
        const card = cards.get(s.key) ?? makeCard(s.key, s.kind, s.sql, s.position);
        card.position = s.position;
        card.footer.textContent = '';
        setCardState(card, 'idle');
        move(card.g, cardX(s.position), CARD_Y, ms);
      }
      reconcile(p.rows, ms);
      await wait(ms);
    };

    const runStatement = async (p: DmlStatementView, ms: number): Promise<void> => {
      clearMarks();
      schemaFrame.setAttribute('stroke', colors.border);
      const card = cardOf(p.key);
      setCardState(card, 'active');

      if (p.kind === 'INSERT') {
        if (!p.inserted) throw new Error('dml-stage: INSERT 에 넣을 줄이 없다');
        // 줄이 스키마의 열 모양에 맞춰 들어간다 — 스키마 카드를 짚는다
        schemaFrame.setAttribute('stroke', colors.accent);
        const r = makeRow(p.inserted);
        r.bg.setAttribute('fill', colors.bgSubtle);
        r.judge.setAttribute('width', String(TABLE_W - 4));
        r.judge.setAttribute('stroke', colors.success);
        place(r.g, cardX(card.position), CARD_Y + CARD_H / 2, 0.9);
        const index = order.length;
        order = [...order, p.inserted.slot];
        move(r.g, TABLE_X, rowY(index), ms, 1);
        await wait(ms);
        schemaFrame.setAttribute('stroke', colors.border);
      } else {
        // 판정 — 지금 표의 줄마다 WHERE 의 칸을 짚고, 걸린 줄을 칠한다
        const wc = p.whereColumn;
        const cw = COL_W[wc];
        if (cw === undefined) throw new Error(`dml-stage: WHERE 열 ${wc} 이 없다`);
        for (const slot of order) {
          const r = rowOf(slot);
          r.judge.setAttribute('x', String(colX(wc) + 2));
          r.judge.setAttribute('width', String(cw - 4));
          r.judge.setAttribute('stroke', colors.textMuted);
        }
        for (const slot of p.hits) {
          const r = rowOf(slot);
          r.judge.setAttribute('stroke', colors.itemComparing);
          r.bg.setAttribute('fill', colors.bgSubtle);
        }
        await wait(ms * 0.4);
        if (destroyed) return;

        if (p.kind === 'UPDATE') {
          for (const ch of p.changes) {
            const r = rowOf(ch.slot);
            if (r.values[ch.column] !== ch.from) throw new Error(`dml-stage: 줄 ${ch.slot} 의 옛 값이 다르다`);
            roll(r, ch.column, ch.to, ms * 0.6);
            const tx = r.texts[ch.column];
            if (tx) tx.setAttribute('fill', colors.itemComparing);
          }
          await wait(ms * 0.6);
        } else if (p.kind === 'DELETE') {
          for (const slot of p.removed) {
            const r = rowOf(slot);
            r.bg.setAttribute('fill', colors.bgSubtle);
            for (const tx of r.texts) tx.setAttribute('fill', colors.danger);
            move(r.g, TABLE_X + 80, rowY(order.indexOf(slot)), ms * 0.3, 0);
          }
          await wait(ms * 0.3);
          if (destroyed) return;
          for (const slot of p.removed) {
            const r = rowOf(slot);
            r.g.remove();
            rows.delete(slot);
          }
          order = order.filter((s) => !p.removed.includes(s));
          // 아래 줄이 올라와 틈을 메운다
          order.forEach((slot, i) => move(rowOf(slot).g, TABLE_X, rowY(i), ms * 0.5, 1));
          await wait(ms * 0.5);
        } else {
          throw new Error(`dml-stage: 모르는 문 ${p.kind}`);
        }
      }
      if (destroyed) return;
      for (const slot of order) rowOf(slot).judge.setAttribute('stroke', 'none');
      setCardState(card, 'done');
      card.footer.textContent = t('label.affected', 'Affected rows: {n}', { n: p.affected });
      settle(p.rows);
    };

    return {
      setup,
      runStatement,
      setCaption(text: string): void {
        caption.textContent = text;
      },
      destroy(): void {
        destroyed = true;
        flush();
        rows.clear();
        cards.clear();
      },
    };
  },
};
