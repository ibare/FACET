/**
 * bitmap-index 무대.
 *
 * 위에서부터 질의 SQL · 인덱스의 비트 줄 셋 · 결과 비트 줄 더미 · 표 `cars` (줄 하나가 세로 칸 하나).
 * 운동:
 *   - 비트 줄을 포갤 때 인덱스의 그 줄이 떨어져 나와 결과 자리로 **미끄러져 내려오고**, 더미가 한 겹 쌓인다
 *   - 결과 줄의 칸이 AND 면 **오그라들어 꺼지고**, OR 면 **가운데서 번져 켜진다**
 *   - 결과의 1 에서 표의 줄로 내려가는 선이 1 의 수만큼 **자라거나 줄어든다**
 *   - 새 판의 처음에는 더미가 인덱스 자리로 **거슬러 올라가고** 결과 칸과 선이 거두어진다
 * 무대는 셈하지 않는다 — 결과 비트 · 바뀐 자리 · 읽을 줄 · 수는 전부 payload 에서 온다.
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

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 440;
const PAD = 16;
/** 비트 칸 · 표 칸이 서는 가로 자리 */
const X0 = 196;
const CW = 42;
const CELL = 36;
const BIT_H = 22;
const SQL_Y = 28;
const SHELF_HEAD_Y = 62;
const SHELF_Y = 72;
const SHELF_GAP = 30;
/** 결과 줄의 윗변 */
const RES_Y = 200;
/** 더미 한 겹이 결과 줄 위로 드러나는 두께 */
const LAYER_STEP = 5;
const TABLE_Y = 282;
const CARD_H = 70;
const LINE_H = 15;
const CAPTION_Y = 386;
const COUNT_Y = 412;

export type RoundView = {
  table: string;
  columns: string[];
  rows: string[][];
  clauses: string[];
  bitRows: string[];
  conditionCount: number;
  combineWord: string;
  sql: string;
};

export type LoadView = { condition: number; result: string; bitsRead: number; ones: number };

export type CombineView = {
  condition: number;
  combineWord: string;
  result: string;
  changed: number[];
  bitsRead: number;
  ones: number;
};

export type FetchView = { rows: number[]; rowsRead: number; bitsRead: number };

/** projector 가 부르는 무대의 표면 */
export type BitmapIndexStage = {
  round(p: RoundView, ms: number): void;
  load(p: LoadView, ms: number): void;
  combine(p: CombineView, ms: number): void;
  fetch(p: FetchView, ms: number): void;
  destroy(): void;
};

type Tween = { apply(p: number): void };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

function textEl(
  parent: Element,
  x: number,
  y: number,
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', { x, y, ...attrs }, parent);
  node.textContent = content;
  return node;
}

const cellX = (r: number) => X0 + r * CW;
const shelfY = (c: number) => SHELF_Y + c * SHELF_GAP;
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

function bitsOf(s: string): number[] {
  return [...s].map((ch) => {
    if (ch === '1') return 1;
    if (ch === '0') return 0;
    throw new Error(`bitmap-index-stage: 비트 줄에 모르는 글자 ${ch}`);
  });
}

export const bitmapIndexStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);

    const root = el('g', {}, svg);
    const sqlText = textEl(root, PAD, SQL_Y, '', {
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    const shelfLayer = el('g', {}, root);
    const linkLayer = el('g', {}, root);
    const pileLayer = el('g', {}, root);
    const resultLayer = el('g', {}, root);
    const tableLayer = el('g', {}, root);
    const captionText = textEl(root, PAD, CAPTION_Y, '', {
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    const countTexts = [0, 1, 2].map((i) =>
      textEl(root, PAD + i * 220, COUNT_Y, '', {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      }),
    );

    // ── 판의 상태 (그림을 위한 것만)
    let rowCount = 0;
    let bitRows: number[][] = [];
    let shelfGroups: SVGGElement[] = [];
    let result: number[] = [];
    let resultFills: SVGRectElement[] = [];
    let resultTexts: SVGTextElement[] = [];
    let links: SVGLineElement[] = [];
    let cards: SVGRectElement[] = [];
    /** 더미의 겹 — 조건 색인과 그 그림 */
    let pile: { condition: number; g: SVGGElement }[] = [];
    let opText: SVGTextElement | null = null;
    /** 지금 결과 줄의 1 의 수 — load · combine 의 payload 에서 받아 둔다 */
    let shownOnes: number | null = null;

    // ── 움직임 — 새 호출이 오면 앞의 움직임을 끝 모습으로 건너뛴다
    let tweens: Tween[] = [];
    let raf: number | null = null;
    let startAt = 0;
    let duration = 0;
    const finish = () => {
      if (raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      raf = null;
      for (const tw of tweens) tw.apply(1);
      tweens = [];
    };
    const frame = (now: number) => {
      const p = duration <= 0 ? 1 : Math.min(1, (now - startAt) / duration);
      const e = ease(p);
      for (const tw of tweens) tw.apply(e);
      if (p >= 1) {
        tweens = [];
        raf = null;
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    const run = (list: Tween[], ms: number) => {
      finish();
      tweens = list;
      duration = ms;
      if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
        finish();
        return;
      }
      for (const tw of tweens) tw.apply(0);
      startAt = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const setCounts = (bits: number, ones: number | null, rows: number) => {
      const [a, b, c] = countTexts;
      if (!a || !b || !c) throw new Error('bitmap-index-stage: 수 자리가 없다');
      a.textContent = t('count.bits', 'Bits read: {n}', { n: bits });
      b.textContent = ones === null ? '' : t('count.ones', 'Ones in result: {n}', { n: ones });
      c.textContent = t('count.rows', 'Rows read: {n}', { n: rows });
    };

    /** 결과 칸 하나의 채움 크기 — 0 이면 꺼짐, 1 이면 켜짐. 가운데를 축으로 자란다 */
    const scaleCell = (r: number, s: number) => {
      const fill = resultFills[r];
      if (!fill) throw new Error(`bitmap-index-stage: 결과 칸 ${r} 이 없다`);
      const cx = cellX(r) + CELL / 2;
      const cy = RES_Y + BIT_H / 2;
      fill.setAttribute('transform', `translate(${cx} ${cy}) scale(${s} ${s}) translate(${-cx} ${-cy})`);
    };
    /** 결과의 1 에서 표로 내려가는 선 — 0 이면 거두어짐, 1 이면 끝까지 */
    const growLink = (r: number, s: number) => {
      const line = links[r];
      if (!line) throw new Error(`bitmap-index-stage: 선 ${r} 이 없다`);
      const y1 = RES_Y + BIT_H;
      line.setAttribute('y2', String(y1 + (TABLE_Y - y1) * s));
      line.setAttribute('visibility', s <= 0 ? 'hidden' : 'visible');
    };

    /** 결과 칸들을 새 비트로 옮기는 움직임 */
    const moveResult = (next: number[]): Tween[] => {
      const prev = result;
      result = next;
      const list: Tween[] = [];
      next.forEach((b, r) => {
        const txt = resultTexts[r];
        if (!txt) throw new Error(`bitmap-index-stage: 결과 글자 ${r} 가 없다`);
        txt.textContent = b === 1 ? '1' : '0';
        txt.setAttribute('fill', b === 1 ? colors.textInverse : colors.textMuted);
        const from = prev[r] === 1 ? 1 : 0;
        const to = b;
        list.push({
          apply: (p) => {
            const s = from + (to - from) * p;
            scaleCell(r, s);
            growLink(r, s);
          },
        });
      });
      return list;
    };

    /** 인덱스의 비트 줄 c 의 복사본 — 더미의 한 겹이 된다 */
    const makeLayer = (c: number): SVGGElement => {
      const bits = bitRows[c];
      if (!bits) throw new Error(`bitmap-index-stage: 비트 줄 ${c} 가 없다`);
      const g = el('g', {}, pileLayer);
      bits.forEach((b, r) => {
        el(
          'rect',
          {
            x: cellX(r),
            y: 0,
            width: CELL,
            height: BIT_H,
            rx: 3,
            fill: b === 1 ? colors.primary : colors.bgSubtle,
            stroke: colors.border,
          },
          g,
        );
      });
      return g;
    };
    const place = (g: SVGGElement, y: number) => g.setAttribute('transform', `translate(0 ${y})`);
    /** 더미의 겹 i(0 이 가장 먼저) 가 겹 수 n 일 때 서는 윗변 */
    const pileY = (i: number, n: number) => RES_Y - LAYER_STEP * (n - i);

    /** 새 겹을 인덱스 자리에서 더미로 내려보내고, 앞 겹들은 한 칸씩 위로 민다 */
    const dropLayer = (c: number): Tween[] => {
      const g = makeLayer(c);
      const n = pile.length + 1;
      const list: Tween[] = pile.map((layer, i) => {
        const from = pileY(i, n - 1);
        const to = pileY(i, n);
        return { apply: (p) => place(layer.g, from + (to - from) * p) };
      });
      const from = shelfY(c);
      const to = pileY(n - 1, n);
      list.push({ apply: (p) => place(g, from + (to - from) * p) });
      pile.push({ condition: c, g });
      const src = shelfGroups[c];
      if (!src) throw new Error(`bitmap-index-stage: 인덱스 줄 ${c} 가 없다`);
      src.setAttribute('opacity', '0.55');
      return list;
    };

    const buildTable = (p: RoundView) => {
      tableLayer.textContent = '';
      cards = [];
      textEl(tableLayer, PAD, TABLE_Y + 14, `${t('label.table', 'Table')} ${p.table}`, {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      p.columns.forEach((col, ci) => {
        textEl(tableLayer, X0 - 10, TABLE_Y + 30 + ci * LINE_H, col, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
          'text-anchor': 'end',
        });
      });
      p.rows.forEach((row, r) => {
        const x = cellX(r);
        cards.push(
          el(
            'rect',
            { x: x - 2, y: TABLE_Y, width: CW - 2, height: CARD_H, rx: 4, fill: colors.bg, stroke: colors.border },
            tableLayer,
          ),
        );
        textEl(tableLayer, x + CELL / 2, TABLE_Y + 13, `r${r + 1}`, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
          'text-anchor': 'middle',
        });
        row.forEach((cell, ci) => {
          textEl(tableLayer, x + CELL / 2, TABLE_Y + 30 + ci * LINE_H, cell, {
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.text,
            'text-anchor': 'middle',
          });
        });
      });
    };

    const buildShelf = (p: RoundView) => {
      shelfLayer.textContent = '';
      shelfGroups = [];
      textEl(shelfLayer, PAD, SHELF_HEAD_Y, t('label.index', 'Bitmap index'), {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      for (let r = 0; r < rowCount; r += 1) {
        textEl(shelfLayer, cellX(r) + CELL / 2, SHELF_HEAD_Y, `r${r + 1}`, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
          'text-anchor': 'middle',
        });
      }
      bitRows.forEach((bits, c) => {
        const clause = p.clauses[c];
        if (clause === undefined) throw new Error(`bitmap-index-stage: 조건 ${c} 의 글자가 없다`);
        const used = c < p.conditionCount;
        const g = el('g', { opacity: used ? 1 : 0.3 }, shelfLayer);
        textEl(g, PAD, shelfY(c) + BIT_H / 2 + smPx / 3, clause, {
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: used ? colors.text : colors.textMuted,
        });
        bits.forEach((b, r) => {
          el(
            'rect',
            {
              x: cellX(r),
              y: shelfY(c),
              width: CELL,
              height: BIT_H,
              rx: 3,
              fill: b === 1 ? colors.primary : colors.bgSubtle,
              stroke: colors.border,
            },
            g,
          );
          textEl(g, cellX(r) + CELL / 2, shelfY(c) + BIT_H / 2 + smPx / 3, b === 1 ? '1' : '0', {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: b === 1 ? colors.textInverse : colors.textMuted,
            'text-anchor': 'middle',
          });
        });
        shelfGroups.push(g);
      });
    };

    const buildResult = (p: RoundView) => {
      resultLayer.textContent = '';
      linkLayer.textContent = '';
      resultFills = [];
      resultTexts = [];
      links = [];
      textEl(resultLayer, PAD, RES_Y + BIT_H / 2 + smPx / 3, t('label.result', 'Result bit row'), {
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      opText = textEl(resultLayer, PAD, RES_Y + BIT_H + 20, p.conditionCount > 1 ? p.combineWord : '', {
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.accent,
        'font-weight': 700,
      });
      for (let r = 0; r < rowCount; r += 1) {
        el(
          'rect',
          {
            x: cellX(r),
            y: RES_Y,
            width: CELL,
            height: BIT_H,
            rx: 3,
            fill: colors.bg,
            stroke: colors.textMuted,
            'stroke-dasharray': '3 2',
          },
          resultLayer,
        );
        resultFills.push(
          el('rect', { x: cellX(r), y: RES_Y, width: CELL, height: BIT_H, rx: 3, fill: colors.accent }, resultLayer),
        );
        resultTexts.push(
          textEl(resultLayer, cellX(r) + CELL / 2, RES_Y + BIT_H / 2 + smPx / 3, '', {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
          }),
        );
        const lx = cellX(r) + CELL / 2;
        links.push(
          el(
            'line',
            {
              x1: lx,
              y1: RES_Y + BIT_H,
              x2: lx,
              y2: RES_Y + BIT_H,
              stroke: colors.textMuted,
              'stroke-width': 1.5,
              'stroke-dasharray': '4 3',
            },
            linkLayer,
          ),
        );
      }
    };

    const instance: BitmapIndexStage = {
      round(p, ms) {
        finish();
        const nextRows = p.bitRows.map(bitsOf);
        const n = p.rows.length;
        for (const bits of nextRows) {
          if (bits.length !== n) throw new Error('bitmap-index-stage: 비트 줄 길이가 표의 줄 수와 다르다');
        }
        const firstBuild = rowCount !== n || bitRows.length !== nextRows.length;
        rowCount = n;
        bitRows = nextRows;
        sqlText.textContent = p.sql;
        buildShelf(p);
        if (firstBuild) buildTable(p);
        for (const card of cards) {
          card.setAttribute('stroke', colors.border);
          card.setAttribute('stroke-width', '1');
          card.setAttribute('fill', colors.bg);
        }

        // 앞 판의 더미 — 인덱스 자리로 거슬러 올려 보낸 뒤 걷는다
        const old = pile;
        const oldN = old.length;
        pile = [];
        const prevResult = firstBuild ? [] : result;
        buildResult(p);
        const list: Tween[] = old.map((layer, i) => {
          const from = pileY(i, oldN);
          const to = shelfY(layer.condition);
          return {
            apply: (q) => {
              place(layer.g, from + (to - from) * q);
              layer.g.setAttribute('opacity', String(1 - q));
              if (q >= 1) layer.g.remove();
            },
          };
        });
        // 앞 판의 결과 칸 · 선을 거두어들인다
        result = prevResult;
        for (let r = 0; r < rowCount; r += 1) {
          const txt = resultTexts[r];
          if (!txt) throw new Error(`bitmap-index-stage: 결과 글자 ${r} 가 없다`);
          txt.textContent = '';
          const from = prevResult[r] === 1 ? 1 : 0;
          list.push({
            apply: (q) => {
              const s = from * (1 - q);
              scaleCell(r, s);
              growLink(r, s);
            },
          });
        }
        result = new Array<number>(rowCount).fill(0);
        captionText.textContent = t('caption.start', 'Each condition reads one bit row from the index.');
        shownOnes = null;
        setCounts(0, null, 0);
        run(list, ms);
      },

      load(p, ms) {
        const next = bitsOf(p.result);
        if (next.length !== rowCount) throw new Error('bitmap-index-stage: 결과 길이가 다르다');
        const list = [...dropLayer(p.condition), ...moveResult(next)];
        captionText.textContent = t('caption.load', 'The first bit row is placed as the result row.');
        shownOnes = p.ones;
        setCounts(p.bitsRead, p.ones, 0);
        run(list, ms);
      },

      combine(p, ms) {
        const next = bitsOf(p.result);
        if (next.length !== rowCount) throw new Error('bitmap-index-stage: 결과 길이가 다르다');
        const list = [...dropLayer(p.condition), ...moveResult(next)];
        if (opText) opText.textContent = p.combineWord;
        captionText.textContent =
          p.combineWord === 'OR'
            ? t('caption.or', 'Stacked with OR: a 1 in either row turns the spot on.')
            : t('caption.and', 'Stacked with AND: a spot stays 1 only where both rows have 1.');
        shownOnes = p.ones;
        setCounts(p.bitsRead, p.ones, 0);
        run(list, ms);
      },

      fetch(p, ms) {
        finish();
        const list: Tween[] = [];
        for (const r of p.rows) {
          const line = links[r];
          const card = cards[r];
          if (!line || !card) throw new Error(`bitmap-index-stage: 줄 r${r + 1} 이 표에 없다`);
          line.setAttribute('stroke', colors.accent);
          line.setAttribute('stroke-dasharray', 'none');
          line.setAttribute('stroke-width', '2.5');
          card.setAttribute('stroke', colors.accent);
          card.setAttribute('stroke-width', '2.5');
          card.setAttribute('fill', colors.bgSubtle);
          list.push({ apply: (q) => growLink(r, q) });
        }
        captionText.textContent = t('caption.fetch', 'Only the rows at a 1 in the result are read from the table.');
        setCounts(p.bitsRead, shownOnes, p.rowsRead);
        run(list, ms);
      },

      destroy() {
        finish();
        root.remove();
      },
    };
    return instance as unknown as ViewInstance;
  },
};
