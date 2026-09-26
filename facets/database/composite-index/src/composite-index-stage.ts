/**
 * 복합 인덱스 무대 — 왼쪽에 표(넣은 차례), 오른쪽에 인덱스 항목 열두 자리.
 *
 * 항목(칩)은 제 줄 자리(`r5`)를 달고 판을 건너 살아남는다. 열 차례가 바뀌면 칩이 **제자리에서 미끄러져**
 * 새 차례로 다시 늘어서고, WHERE 에 맞는 칩(노란 바탕)이 한 덩어리로 모이거나 흩어진다. 훑기 괄호는
 * 앞 판의 범위에서 새 범위로 늘거나 준다. 운동은 CSS transition 이고 길이는 projector 가 재생 속도에서
 * 셈해 넘긴다 (속성을 덮어쓰면 마지막 값이 이기므로 되짚기에도 엉키지 않는다).
 *
 * 무대는 셈하지 않는다 — 정렬 차례 · 짚은 자리 · 훑은 범위 · 멈춘 항목 · 맞은 항목은 알고리즘이 싣는다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG = 'http://www.w3.org/2000/svg';

const W = 780;
const H = 476;
const TOP = 96;
const PITCH = 26;
const BOX_H = 22;
const TABLE_X = 16;
const TABLE_W = 200;
const CHIP_X = 330;
const CHIP_W = 200;
const POS_X = 322;
const CURSOR_X = 282;
const BRACKET_X = 544;
const STOP_X = 556;
const LEGEND_X = 624;
const MAX_ROWS = 12;

export type StageRow = { row: number; cells: (string | number)[] };
export type StageEntry = { pos: number; row: number; values: (string | number)[] };

export type CompositeIndexStage = ViewInstance & {
  showRound(p: {
    order: string[];
    indexName: string;
    sql: string;
    table: string;
    columns: string[];
    rows: StageRow[];
    targets: number[];
  }): void;
  showSort(p: { order: string[]; entries: StageEntry[] }, ms: number): void;
  showSeek(p: { mode: 'seek' | 'scan-all'; pos: number }, ms: number): void;
  showScan(p: { from: number; to: number; scanned: number; stoppedAt: number | null }, ms: number): void;
  showFetch(p: { matches: { pos: number; row: number }[]; count: number }, ms: number): void;
  reset(): void;
};

const slotY = (pos: number): number => TOP + (pos - 1) * PITCH;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

type Chip = {
  g: SVGGElement;
  box: SVGRectElement;
  first: SVGTextElement;
  second: SVGTextElement;
  rowText: SVGTextElement;
  row: number;
  pos: number;
};

type TableRow = { box: SVGRectElement; texts: SVGTextElement[] };

export const compositeIndexStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    const root = el('g', {}, svg);
    const linkLayer = el('g', {}, root);
    const tableLayer = el('g', {}, root);
    const indexLayer = el('g', {}, root);
    const overlay = el('g', {}, root);

    const text = (
      parent: Element,
      x: number,
      y: number,
      str: string,
      opts: { size?: string; mono?: boolean; fill?: string; anchor?: string; weight?: string } = {},
    ): SVGTextElement => {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = str;
      return node;
    };

    // ── 머리: SQL · 표 이름 · 인덱스 이름
    const sqlText = text(root, 16, 24, '', { mono: true, size: fontSizes.md, weight: '600' });
    text(root, TABLE_X, 58, t('label.table', 'Table'), { fill: c.textMuted });
    const tableName = text(root, TABLE_X + 64, 58, '', { mono: true, weight: '600' });
    text(root, CURSOR_X, 58, t('label.index', 'Index'), { fill: c.textMuted });
    const indexName = text(root, CURSOR_X + 64, 58, '', { mono: true, weight: '600' });

    // 열 머리
    text(root, TABLE_X + 8, 80, t('label.row', 'Row'), { fill: c.textMuted, size: fontSizes.xs });
    const tableHeads: SVGTextElement[] = [
      text(root, TABLE_X + 60, 80, '', { fill: c.textMuted, size: fontSizes.xs, mono: true }),
      text(root, TABLE_X + 140, 80, '', { fill: c.textMuted, size: fontSizes.xs, mono: true }),
    ];
    text(root, POS_X, 80, t('label.position', 'Pos.'), { fill: c.textMuted, size: fontSizes.xs, anchor: 'end' });
    const orderHead = text(root, CHIP_X + 10, 80, '', { fill: c.textMuted, size: fontSizes.xs, mono: true });

    // 자리 번호 1..12 — 늘 그 자리에 있다
    for (let p = 1; p <= MAX_ROWS; p++) {
      text(indexLayer, POS_X, slotY(p) + BOX_H / 2, String(p), {
        fill: c.textMuted,
        size: fontSizes.xs,
        anchor: 'end',
        mono: true,
      });
    }

    // 짚는 표지
    const cursor = el('g', { opacity: 0 }, overlay);
    el('polygon', { points: '0,-6 11,0 0,6', fill: c.primary }, cursor);
    cursor.style.transform = `translate(${CURSOR_X}px, ${slotY(1) + BOX_H / 2}px)`;

    // 훑기 괄호 — 줄기(세로 막대, 높이 1 을 늘인다)와 위 · 아래 턱
    const bracket = el('g', { opacity: 0 }, overlay);
    const stem = el('rect', { x: 0, y: 0, width: 3, height: 1, fill: c.itemComparing }, bracket);
    const capTop = el('rect', { x: -8, y: 0, width: 11, height: 3, fill: c.itemComparing }, bracket);
    const capBottom = el('rect', { x: -8, y: -3, width: 11, height: 3, fill: c.itemComparing }, bracket);
    for (const node of [stem, capTop, capBottom]) node.style.transformOrigin = '0 0';
    let bracketTop = slotY(1);
    let bracketBottom = slotY(1);
    const placeBracket = (top: number, bottom: number): void => {
      bracketTop = top;
      bracketBottom = bottom;
      stem.style.transform = `translate(${BRACKET_X}px, ${top}px) scale(1, ${Math.max(1, bottom - top)})`;
      capTop.style.transform = `translate(${BRACKET_X}px, ${top}px)`;
      capBottom.style.transform = `translate(${BRACKET_X}px, ${bottom}px)`;
    };
    placeBracket(bracketTop, bracketBottom);
    const stopLabel = text(overlay, STOP_X, 0, t('label.stop', 'stop'), { fill: c.danger, size: fontSizes.xs });
    stopLabel.setAttribute('opacity', '0');

    // 보기
    const legend = el('g', {}, root);
    const legendItem = (y: number, fill: string, stroke: string, label: string): void => {
      el('rect', { x: LEGEND_X, y: y - 7, width: 14, height: 14, rx: 3, fill, stroke, 'stroke-width': 2 }, legend);
      text(legend, LEGEND_X + 22, y, label, { size: fontSizes.xs, fill: c.textMuted });
    };
    legendItem(TOP + 11, c.accent, c.border, t('label.target', 'Meets WHERE'));
    legendItem(TOP + 37, c.bg, c.itemComparing, t('label.scanned', 'Scanned'));
    legendItem(TOP + 63, c.itemSorted, c.itemSorted, t('label.fetched', 'Row read'));

    // 캡션
    const caption = text(root, 16, H - 38, '', { size: fontSizes.md });
    const detail = text(root, 16, H - 14, '', { mono: true, fill: c.textMuted });

    let tableRows = new Map<number, TableRow>();
    let chips = new Map<number, Chip>();
    let targets = new Set<number>();
    let order: string[] = [];

    const transition = (node: SVGElement, ms: number, props: string): void => {
      node.style.transition = props
        .split(',')
        .map((p) => `${p.trim()} ${ms}ms ease-in-out`)
        .join(', ');
    };

    const chipBase = (chip: Chip, ms: number): void => {
      transition(chip.box, ms, 'fill, stroke');
      chip.box.style.fill = targets.has(chip.row) ? c.accent : c.bg;
      chip.box.style.stroke = c.border;
      chip.box.style.strokeWidth = '1';
      chip.box.style.strokeDasharray = 'none';
      chip.first.style.fill = c.text;
      chip.second.style.fill = c.text;
      chip.rowText.style.fill = c.textMuted;
    };

    const tableBase = (row: number, tr: TableRow): void => {
      tr.box.style.fill = targets.has(row) ? c.accent : c.bg;
      for (const tx of tr.texts) tx.style.fill = c.text;
    };

    const buildTable = (rows: StageRow[], columns: string[]): void => {
      tableLayer.replaceChildren();
      tableRows = new Map();
      columns.forEach((col, k) => {
        const head = tableHeads[k];
        if (head === undefined) throw new Error('composite-index-stage: 열이 셋 이상이면 그릴 자리가 없다');
        head.textContent = col;
      });
      for (const r of rows) {
        const y = slotY(r.row);
        const box = el('rect', { x: TABLE_X, y, width: TABLE_W, height: BOX_H, rx: 4, stroke: c.border }, tableLayer);
        const texts = [text(tableLayer, TABLE_X + 8, y + BOX_H / 2, `r${r.row}`, { mono: true })];
        r.cells.forEach((cell, k) => {
          texts.push(text(tableLayer, TABLE_X + 60 + k * 80, y + BOX_H / 2, String(cell), { mono: true }));
        });
        tableRows.set(r.row, { box, texts });
      }
    };

    const buildChips = (rows: StageRow[], columns: string[], firstOrder: string[]): void => {
      indexLayer.querySelectorAll('g[data-row]').forEach((n) => n.remove());
      chips = new Map();
      for (const r of rows) {
        const g = el('g', {}, indexLayer);
        g.dataset.row = String(r.row);
        g.style.transform = `translate(${CHIP_X}px, ${slotY(r.row)}px)`;
        const box = el('rect', { x: 0, y: 0, width: CHIP_W, height: BOX_H, rx: 4 }, g);
        const cellOf = (col: string): string => {
          const k = columns.indexOf(col);
          const v = r.cells[k];
          if (v === undefined) throw new Error(`composite-index-stage: 줄 r${r.row} 에 열 ${col} 이 없다`);
          return String(v);
        };
        const [c0, c1] = firstOrder;
        if (c0 === undefined || c1 === undefined) throw new Error('composite-index-stage: 열 차례가 비었다');
        const first = text(g, 10, BOX_H / 2, cellOf(c0), { mono: true });
        const second = text(g, 100, BOX_H / 2, cellOf(c1), { mono: true });
        const rowText = text(g, CHIP_W - 8, BOX_H / 2, `r${r.row}`, { mono: true, anchor: 'end' });
        chips.set(r.row, { g, box, first, second, rowText, row: r.row, pos: r.row });
      }
    };

    const chipOf = (row: number): Chip => {
      const chip = chips.get(row);
      if (chip === undefined) throw new Error(`composite-index-stage: 줄 r${row} 의 항목이 없다`);
      return chip;
    };
    const rowOf = (row: number): TableRow => {
      const tr = tableRows.get(row);
      if (tr === undefined) throw new Error(`composite-index-stage: 표에 줄 r${row} 이 없다`);
      return tr;
    };

    const instance: CompositeIndexStage = {
      showRound(p) {
        if (p.rows.length > MAX_ROWS) throw new Error('composite-index-stage: 줄이 열둘을 넘으면 그릴 자리가 없다');
        sqlText.textContent = p.sql;
        tableName.textContent = p.table;
        indexName.textContent = p.indexName;
        targets = new Set(p.targets);
        if (chips.size === 0) {
          buildTable(p.rows, p.columns);
          buildChips(p.rows, p.columns, p.order);
          order = p.order;
        }
        // 열 차례 머리는 걸음 1 에 항목이 늘어설 때 채운다 — 걸음 0 에 앞 판의 차례를 새 인덱스 이름 옆에 두지 않는다
        orderHead.textContent = '';
        for (const [row, tr] of tableRows) tableBase(row, tr);
        for (const chip of chips.values()) chipBase(chip, 0);
        linkLayer.replaceChildren();
        // 앞 판의 짚은 자리와 괄호는 흐리게 남긴다 — 새 판에서 거기서부터 옮겨 간다
        cursor.setAttribute('opacity', cursor.getAttribute('opacity') === '0' ? '0' : '0.25');
        bracket.setAttribute('opacity', bracket.getAttribute('opacity') === '0' ? '0' : '0.25');
        stopLabel.setAttribute('opacity', '0');
        caption.textContent = t('caption.start', 'Query and index are set');
        detail.textContent = '';
      },

      showSort(p, ms) {
        order = p.order;
        orderHead.textContent = `(${order.join(', ')})`;
        for (const e of p.entries) {
          const chip = chipOf(e.row);
          const [v0, v1] = e.values;
          if (v0 === undefined || v1 === undefined) throw new Error(`composite-index-stage: 항목 r${e.row} 의 값이 비었다`);
          chip.first.textContent = String(v0);
          chip.second.textContent = String(v1);
          transition(chip.g, ms, 'transform');
          chip.g.style.transform = `translate(${CHIP_X}px, ${slotY(e.pos)}px)`;
          chip.pos = e.pos;
        }
        caption.textContent = t('caption.sort', 'Entries lined up in {order} order', {
          order: `(${order.join(', ')})`,
        });
      },

      showSeek(p, ms) {
        transition(cursor, ms, 'transform');
        cursor.setAttribute('opacity', '1');
        cursor.style.transform = `translate(${CURSOR_X}px, ${slotY(p.pos) + BOX_H / 2}px)`;
        if (bracket.getAttribute('opacity') === '0') {
          // 첫 판 — 괄호는 짚은 자리의 한 점에서 자란다
          placeBracket(slotY(p.pos), slotY(p.pos));
        }
        caption.textContent =
          p.mode === 'seek'
            ? t('caption.seek', 'Seek: position {pos}', { pos: p.pos })
            : t('caption.scanAll', 'Leading column not in WHERE: start at position {pos}', { pos: p.pos });
      },

      showScan(p, ms) {
        for (const node of [stem, capTop, capBottom]) transition(node, ms, 'transform');
        bracket.setAttribute('opacity', '1');
        placeBracket(slotY(p.from), slotY(p.to) + BOX_H);
        const span = Math.max(1, p.to - p.from + 1);
        for (const chip of chips.values()) {
          if (chip.pos < p.from || chip.pos > p.to) continue;
          // 괄호가 자라는 대로 위에서 아래로 훑인다
          const delay = Math.round(((chip.pos - p.from) / span) * ms * 0.8);
          chip.box.style.transition = `stroke 200ms ease-in-out ${delay}ms, fill 200ms ease-in-out ${delay}ms`;
          chip.box.style.stroke = chip.pos === p.stoppedAt ? c.danger : c.itemComparing;
          chip.box.style.strokeWidth = '2';
          if (chip.pos === p.stoppedAt) chip.box.style.strokeDasharray = '4 3';
        }
        if (p.stoppedAt !== null) {
          stopLabel.setAttribute('y', String(slotY(p.stoppedAt) + BOX_H / 2));
          stopLabel.setAttribute('opacity', '1');
        }
        caption.textContent = t('caption.scan', 'Entries scanned: {n} (positions {from}–{to})', {
          n: p.scanned,
          from: p.from,
          to: p.to,
        });
      },

      showFetch(p, ms) {
        linkLayer.replaceChildren();
        for (const m of p.matches) {
          const chip = chipOf(m.row);
          if (chip.pos !== m.pos) throw new Error(`composite-index-stage: 항목 r${m.row} 이 자리 ${m.pos} 에 없다`);
          transition(chip.box, ms, 'fill');
          chip.box.style.fill = c.itemSorted;
          for (const tx of [chip.first, chip.second, chip.rowText]) tx.style.fill = c.textInverse;
          const tr = rowOf(m.row);
          tr.box.style.transition = `fill ${ms}ms ease-in-out`;
          tr.box.style.fill = c.itemSorted;
          for (const tx of tr.texts) tx.style.fill = c.textInverse;
          const y0 = slotY(m.pos) + BOX_H / 2;
          const y1 = slotY(m.row) + BOX_H / 2;
          const x0 = CHIP_X;
          const x1 = TABLE_X + TABLE_W;
          const path = el(
            'path',
            {
              d: `M ${x0} ${y0} C ${x0 - 50} ${y0}, ${x1 + 50} ${y1}, ${x1} ${y1}`,
              fill: 'none',
              stroke: c.itemSorted,
              'stroke-width': 1.5,
              pathLength: 1,
            },
            linkLayer,
          );
          // 항목에서 표의 줄로 선이 그어진다
          path.style.strokeDasharray = '1';
          path.style.strokeDashoffset = '1';
          path.getBoundingClientRect();
          path.style.transition = `stroke-dashoffset ${ms}ms ease-in-out`;
          path.style.strokeDashoffset = '0';
        }
        caption.textContent = t('caption.fetch', 'Rows matched: {n}', { n: p.count });
        detail.textContent = p.matches.map((m) => `${m.pos}→r${m.row}`).join('  ');
      },

      reset() {
        tableLayer.replaceChildren();
        linkLayer.replaceChildren();
        indexLayer.querySelectorAll('g[data-row]').forEach((n) => n.remove());
        chips = new Map();
        tableRows = new Map();
        targets = new Set();
        cursor.setAttribute('opacity', '0');
        bracket.setAttribute('opacity', '0');
        stopLabel.setAttribute('opacity', '0');
        sqlText.textContent = '';
        tableName.textContent = '';
        indexName.textContent = '';
        orderHead.textContent = '';
        for (const h of tableHeads) h.textContent = '';
        caption.textContent = '';
        detail.textContent = '';
      },

      destroy() {
        root.remove();
      },
    };
    return instance;
  },
};
