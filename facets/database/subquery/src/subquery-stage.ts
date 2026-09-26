/**
 * subquery-stage — 괄호 자리의 값이 한 번 들어앉아 머무는가, 줄마다 갈아 끼워지는가.
 *
 * 왼쪽에 질의(SQL 그대로)와 괄호 자리 · 안쪽이 돈 차례 · 결과, 오른쪽에 표. 셈은 하지 않는다 —
 * 평균 · 견줌 · 고른 줄은 모두 projector 가 algorithm 의 payload 에서 옮겨 준다.
 *
 * 운동
 *   - 안쪽이 돌 때: 훑기 띠가 표를 위에서 아래로 지나가고, 고른 줄에 빛이 들고, 돈 차례 칸이 하나 생겨
 *     그 값이 괄호 자리로 날아가 들어앉는다 (앞 값은 밀려난다)
 *   - 견줄 때: 괄호 자리의 값이 그 줄의 견줌 칸으로 날아간다. 걸리면 이름이 결과로 옮겨 간다
 *   - 판이 바뀔 때: 질의의 줄이 생기거나 빠지고, 표에 줄이 들어오거나 빠진다
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 420;
/** 표가 담을 수 있는 줄 — 사다리의 끝값 8 이 들어갈 자리를 처음부터 잡는다 */
const MAX_ROWS = 8;
const MAX_SQL_LINES = 5;
const RESULT_PER_LINE = 5;

const SQL_X = 24;
const SQL_TOP = 36;
const SQL_LINE_H = 20;

const SLOT_X = 24;
const SLOT_Y = 166;
const SLOT_W = 84;
const SLOT_H = 34;

const RUN_X = 24;
const RUN_Y = 238;
const RUN_W = 40;
const RUN_H = 28;
const RUN_GAP = 44;

const RESULT_X = 24;
const RESULT_Y = 310;
const CHIP_W = 62;
const CHIP_H = 26;
const CHIP_GAP = 68;

const TABLE_X = 420;
const TABLE_W = 324;
const HEADER_Y = 46;
const ROW_TOP = 72;
const ROW_H = 30;
const COL_X = [436, 506, 576];
const CMP_X = 632;

const CAPTION_Y = 404;

export type SubqueryStageRow = { cells: string[]; group: number };

export type SubqueryStage = {
  setRound(p: {
    correlated: boolean;
    n: number;
    table: string;
    columns: string[];
    sql: string[];
    rows: SubqueryStageRow[];
    caption: string;
    dur: number;
  }): void;
  innerRun(p: {
    run: number;
    outer: number;
    group: number;
    picked: number[];
    value: number;
    caption: string;
    dur: number;
  }): void;
  compare(p: {
    index: number;
    name: string;
    value: number;
    passed: boolean;
    kept: number;
    caption: string;
    dur: number;
  }): void;
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

function place(node: SVGElement, x: number, y: number, dur: number, opacity?: number): void {
  node.style.transition = dur > 0 ? `transform ${dur}ms ease, opacity ${dur}ms ease` : 'none';
  node.style.transform = `translate(${x}px, ${y}px)`;
  if (opacity !== undefined) node.style.opacity = String(opacity);
}

function rowY(i: number): number {
  return ROW_TOP + ROW_H * i;
}

function runX(k: number): number {
  return RUN_X + RUN_GAP * k;
}

function chipPos(k: number): { x: number; y: number } {
  return {
    x: RESULT_X + CHIP_GAP * (k % RESULT_PER_LINE),
    y: RESULT_Y + (CHIP_H + 8) * Math.floor(k / RESULT_PER_LINE),
  };
}

export const subqueryStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const groupColors = categorical(2, 'vivid');
    const isInstant = params.isInstant ?? (() => false);
    const root = svg('g', {}, params.canvas);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void): void => {
      if (ms <= 0 || isInstant()) {
        fn();
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    /** 새로 만든 요소를 한 자리에 두고 다음 틀에서 다른 자리로 옮긴다 */
    const flush = (node: SVGElement): void => {
      node.getBoundingClientRect();
    };
    const speed = (dur: number): number => (isInstant() ? 0 : Math.max(0, dur));
    params.onScrubStart?.(() => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    });

    const groupColor = (group: number): string => {
      if (group < 0) return c.itemPivot;
      const color = groupColors[group];
      if (color === undefined) throw new Error(`subquery-stage: 묶음 ${group} 의 색이 없다`);
      return color;
    };

    // ── 질의
    svg('rect', { x: 12, y: 14, width: 380, height: SQL_LINE_H * MAX_SQL_LINES + 12, rx: 6, fill: c.bgSubtle, stroke: c.border }, root);
    const sqlLines: SVGTextElement[] = [];
    for (let k = 0; k < MAX_SQL_LINES; k += 1) {
      const line = svg('text', {
        x: SQL_X,
        y: SQL_TOP + SQL_LINE_H * k,
        fill: c.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'xml:space': 'preserve',
      }, root);
      line.style.whiteSpace = 'pre';
      line.style.opacity = '0';
      sqlLines.push(line);
    }
    const sqlShown: boolean[] = new Array<boolean>(MAX_SQL_LINES).fill(false);

    // ── 괄호 자리
    const slotLabel = svg('text', { x: SLOT_X, y: SLOT_Y - 8, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, root);
    slotLabel.textContent = t('label.slot', 'Value in the parentheses');
    svg('rect', {
      x: SLOT_X,
      y: SLOT_Y,
      width: SLOT_W,
      height: SLOT_H,
      rx: 6,
      fill: 'none',
      stroke: c.itemPivot,
      'stroke-dasharray': '4 3',
      'stroke-width': 1.5,
    }, root);
    svg('text', {
      x: SLOT_X - 10,
      y: SLOT_Y + SLOT_H / 2 + 5,
      fill: c.textMuted,
      'font-family': fonts.mono,
      'font-size': fontSizes.lg,
      'text-anchor': 'end',
    }, root).textContent = '(';
    svg('text', {
      x: SLOT_X + SLOT_W + 10,
      y: SLOT_Y + SLOT_H / 2 + 5,
      fill: c.textMuted,
      'font-family': fonts.mono,
      'font-size': fontSizes.lg,
    }, root).textContent = ')';
    let slotChip: SVGGElement | null = null;

    // ── 안쪽이 돈 차례
    const runsLabel = svg('text', { x: RUN_X, y: RUN_Y - 8, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, root);
    runsLabel.textContent = t('label.runs', 'Each run of the inner query');
    const runsLayer = svg('g', {}, root);
    let runBoxes: SVGGElement[] = [];

    // ── 결과
    const resultLabel = svg('text', { x: RESULT_X, y: RESULT_Y - 8, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs }, root);
    resultLabel.textContent = t('label.result', 'Result');
    const resultLayer = svg('g', {}, root);
    let resultChips: SVGGElement[] = [];

    // ── 표
    const tableName = svg('text', { x: TABLE_X, y: HEADER_Y - 12, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.md, 'font-weight': 700 }, root);
    svg('rect', { x: TABLE_X, y: HEADER_Y, width: TABLE_W, height: ROW_TOP - HEADER_Y - 2, fill: c.bgSubtle }, root);
    const headers: SVGTextElement[] = COL_X.map((x) =>
      svg('text', { x, y: HEADER_Y + 17, fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.sm }, root),
    );
    const cmpHeader = svg('text', { x: CMP_X, y: HEADER_Y + 17, fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, root);
    cmpHeader.textContent = t('label.compare', 'Compared');

    type RowParts = {
      group: SVGGElement;
      tint: SVGRectElement;
      cells: SVGTextElement[];
      dot: SVGCircleElement;
      cmp: SVGGElement;
      cmpText: SVGTextElement;
    };
    const rows: RowParts[] = [];
    for (let i = 0; i < MAX_ROWS; i += 1) {
      const group = svg('g', {}, root);
      group.style.opacity = '0';
      svg('rect', { x: TABLE_X, y: rowY(i), width: TABLE_W, height: ROW_H - 2, fill: 'none', stroke: c.border }, group);
      const tint = svg('rect', { x: TABLE_X + 1, y: rowY(i) + 1, width: TABLE_W - 2, height: ROW_H - 4, fill: c.itemComparing }, group);
      tint.style.opacity = '0';
      tint.style.transition = 'opacity 200ms ease';
      const cells = COL_X.map((x) =>
        svg('text', { x, y: rowY(i) + 19, fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm }, group),
      );
      const dot = svg('circle', { cx: COL_X[1] - 8, cy: rowY(i) + 14, r: 4, fill: c.border }, group);
      const cmp = svg('g', {}, group);
      const cmpText = svg('text', { x: CMP_X, y: rowY(i) + 19, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text }, cmp);
      cmp.style.opacity = '0';
      rows.push({ group, tint, cells, dot, cmp, cmpText });
    }
    const scanBand = svg('rect', {
      x: TABLE_X - 2,
      y: ROW_TOP - 2,
      width: TABLE_W + 4,
      height: ROW_H + 2,
      rx: 4,
      fill: 'none',
      stroke: c.itemComparing,
      'stroke-width': 3,
    }, root);
    scanBand.style.opacity = '0';
    const cursor = svg('path', {
      d: `M ${TABLE_X - 16} ${ROW_TOP + 6} L ${TABLE_X - 6} ${ROW_TOP + 14} L ${TABLE_X - 16} ${ROW_TOP + 22} Z`,
      fill: c.itemActive,
    }, root);
    cursor.style.opacity = '0';

    // ── 캡션
    const caption = svg('text', { x: 16, y: CAPTION_Y, fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.sm }, root);

    let shownRows = 0;
    let correlatedNow = false;

    const fade = (node: SVGElement, dur: number): void => {
      node.style.transition = dur > 0 ? `opacity ${dur}ms ease, transform ${dur}ms ease` : 'none';
      node.style.opacity = '0';
      later(dur, () => node.remove());
    };

    const makeChip = (parent: SVGGElement, w: number, h: number, label: string, fill: string, stroke: string, bold: boolean): SVGGElement => {
      const g = svg('g', {}, parent);
      svg('rect', { x: 0, y: 0, width: w, height: h, rx: 5, fill, stroke, 'stroke-width': 1.5 }, g);
      const text = svg('text', {
        x: w / 2,
        y: h / 2 + 5,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.mono,
        'font-size': bold ? fontSizes.md : fontSizes.sm,
        'font-weight': bold ? 700 : 400,
      }, g);
      text.textContent = label;
      return g;
    };

    const stage: SubqueryStage = {
      setRound(p) {
        const dur = speed(p.dur);
        if (p.sql.length > MAX_SQL_LINES) throw new Error(`subquery-stage: 질의가 ${p.sql.length} 줄 — 자리는 ${MAX_SQL_LINES} 줄`);
        if (p.rows.length > MAX_ROWS) throw new Error(`subquery-stage: 표가 ${p.rows.length} 줄 — 자리는 ${MAX_ROWS} 줄`);
        if (p.columns.length !== COL_X.length) throw new Error(`subquery-stage: 열이 ${p.columns.length} 개 — 자리는 ${COL_X.length} 개`);
        correlatedNow = p.correlated;

        // 질의 — 줄이 생기거나 빠진다
        sqlLines.forEach((line, k) => {
          const text = p.sql[k];
          if (text !== undefined) {
            if (!sqlShown[k]) {
              place(line, -18, 0, 0, 0);
              flush(line);
            }
            line.textContent = text;
            place(line, 0, 0, dur, 1);
            sqlShown[k] = true;
          } else if (sqlShown[k]) {
            place(line, -18, 0, dur, 0);
            sqlShown[k] = false;
          }
        });

        // 표 — 줄이 들어오거나 빠진다
        tableName.textContent = p.table;
        headers.forEach((h, k) => {
          const name = p.columns[k];
          if (name === undefined) throw new Error('subquery-stage: 열 이름이 없다');
          h.textContent = name;
        });
        rows.forEach((row, i) => {
          const data = p.rows[i];
          row.tint.style.opacity = '0';
          row.cmp.style.transition = 'none';
          row.cmp.style.opacity = '0';
          if (data !== undefined) {
            if (data.cells.length !== COL_X.length) throw new Error(`subquery-stage: 줄 ${i + 1} 의 칸 수가 열과 다르다`);
            data.cells.forEach((cell, k) => {
              row.cells[k].textContent = cell;
            });
            row.dot.setAttribute('fill', data.group < 0 ? c.border : groupColor(data.group));
            row.dot.style.transition = dur > 0 ? `opacity ${dur}ms ease` : 'none';
            row.dot.style.opacity = data.group < 0 ? '0' : '1';
            if (i >= shownRows) {
              place(row.group, 36, 0, 0, 0);
              flush(row.group);
            }
            place(row.group, 0, 0, dur, 1);
          } else if (i < shownRows) {
            place(row.group, 36, 0, dur, 0);
          }
        });
        shownRows = p.rows.length;

        // 앞 판의 흔적을 거둔다
        for (const box of runBoxes) fade(box, dur);
        runBoxes = [];
        for (const chip of resultChips) fade(chip, dur);
        resultChips = [];
        if (slotChip !== null) fade(slotChip, dur);
        slotChip = null;
        scanBand.style.transition = 'none';
        scanBand.style.opacity = '0';
        cursor.style.transition = dur > 0 ? `opacity ${dur}ms ease` : 'none';
        cursor.style.opacity = '0';
        caption.textContent = p.caption;
      },

      innerRun(p) {
        const dur = speed(p.dur);
        if (shownRows === 0) throw new Error('subquery-stage: 표가 없는데 안쪽이 돈다');
        // 바깥 줄 가리킴 — 상관이면 안쪽이 그 줄을 보고 돈다
        if (p.outer >= 0) {
          cursor.style.transition = dur > 0 ? `transform ${dur}ms ease, opacity ${dur}ms ease` : 'none';
          cursor.style.transform = `translate(0px, ${rowY(p.outer) - ROW_TOP}px)`;
          cursor.style.opacity = '1';
        }
        // 훑기 띠 — 표를 위에서 아래로 지나간다
        scanBand.style.transition = 'none';
        scanBand.style.transform = 'translate(0px, 0px)';
        scanBand.style.opacity = '1';
        flush(scanBand);
        scanBand.style.transition = dur > 0 ? `transform ${dur}ms linear` : 'none';
        scanBand.style.transform = `translate(0px, ${rowY(shownRows - 1) - ROW_TOP}px)`;
        later(dur, () => {
          scanBand.style.transition = dur > 0 ? `opacity ${dur}ms ease` : 'none';
          scanBand.style.opacity = '0';
        });
        // 고른 줄
        const picked = new Set(p.picked);
        rows.forEach((row, i) => {
          if (i >= shownRows) return;
          row.tint.setAttribute('fill', p.group < 0 ? c.itemComparing : groupColor(p.group));
          row.tint.style.opacity = picked.has(i) ? '0.28' : '0';
        });
        // 돈 차례 칸이 생기고 그 값이 괄호 자리로 간다
        const k = runBoxes.length;
        const color = groupColor(p.group);
        const box = makeChip(runsLayer, RUN_W, RUN_H, String(p.value), c.bg, color, false);
        place(box, runX(k), RUN_Y + 12, 0, 0);
        flush(box);
        place(box, runX(k), RUN_Y, dur, 1);
        runBoxes.push(box);

        if (slotChip !== null) {
          const old = slotChip;
          place(old, SLOT_X, SLOT_Y + SLOT_H + 12, dur, 0);
          later(dur, () => old.remove());
        }
        const chip = makeChip(runsLayer, SLOT_W, SLOT_H, String(p.value), c.bg, color, true);
        place(chip, runX(k) + (RUN_W - SLOT_W) / 2, RUN_Y, 0, 0.4);
        flush(chip);
        place(chip, SLOT_X, SLOT_Y, dur, 1);
        slotChip = chip;
        caption.textContent = p.caption;
      },

      compare(p) {
        const dur = speed(p.dur);
        const row = rows[p.index];
        if (row === undefined || p.index >= shownRows) throw new Error(`subquery-stage: 줄 ${p.index + 1} 이 표에 없다`);
        if (!correlatedNow) {
          cursor.style.transition = dur > 0 ? `transform ${dur}ms ease, opacity ${dur}ms ease` : 'none';
          cursor.style.transform = `translate(0px, ${rowY(p.index) - ROW_TOP}px)`;
          cursor.style.opacity = '1';
        }
        // 괄호 자리의 값이 그 줄의 견줌 칸으로 날아간다
        row.cmpText.textContent = `> ${p.value}  ${p.passed ? '✓' : '✗'}`;
        row.cmpText.setAttribute('fill', p.passed ? c.success : c.danger);
        place(row.cmp, SLOT_X + 12 - CMP_X, SLOT_Y + SLOT_H / 2 + 5 - (rowY(p.index) + 19), 0, 0.5);
        flush(row.cmp);
        place(row.cmp, 0, 0, dur, 1);

        if (p.passed) {
          if (p.kept < 1) throw new Error('subquery-stage: 걸렸는데 결과 줄 수가 0 이다');
          const to = chipPos(p.kept - 1);
          const chip = makeChip(resultLayer, CHIP_W, CHIP_H, p.name, c.bg, c.success, false);
          place(chip, COL_X[0] - 8, rowY(p.index) + 1, 0, 0.6);
          flush(chip);
          place(chip, to.x, to.y, dur, 1);
          resultChips.push(chip);
        }
        caption.textContent = p.caption;
      },
    };

    return {
      ...stage,
      destroy() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        root.remove();
      },
    };
  },
};
