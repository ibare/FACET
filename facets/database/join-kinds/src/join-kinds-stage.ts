/**
 * join-kinds 무대 — 왼쪽 표 · 결과 · 오른쪽 표를 세 기둥으로 두고, 결과 줄 하나를 두 조각(왼쪽 칸 · 오른쪽 칸)으로 그린다.
 *
 * 운동 — 결과 줄은 열쇠(왼쪽 번호:오른쪽 번호)로 이어진다. 새로 들어온 줄은 두 조각이 저마다 제 표의 칸에서 떠올라
 * 결과 칸에서 만나고, 빠지는 줄은 조각이 제 표의 칸으로 돌아가 그 칸에 겹친다. 결과 칸은 줄마다 고정이다(알고리즘이 싣는
 * `slot`) — INNER · LEFT · RIGHT · FULL 사이에서 짝 맞은 줄은 제 칸에 머물고 짝 없는 줄의 칸만 차거나 빈다. CROSS 로
 * 오가면 칸 배치가 바뀌어 남는 줄이 새 칸으로 미끄러진다.
 * NULL 칸은 짝 있는 칸 곁에서 자라나고, 떨어질 때 줄어든다. 결과 조각과 제 표의 줄은 선으로 잇는다 — CROSS 에서는 한
 * 줄에서 여러 선이 가지를 뻗는다. 질의는 종류 낱말이 갈아 끼워지고 ON 줄이 빠지거나 들어온다.
 *
 * 무대는 셈하지 않는다 — 어느 줄이 남는지 · 칸 번호 · 칸 글은 알고리즘이 payload 로 싣고, projector 가 넘긴다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 640;
const RH = 24;
const PAD = 20;

const SQL_Y = 30;
const SQL_LINE = 18;
const TITLE_Y = 122;
const HEAD_Y = 130;
const ROW_Y0 = HEAD_Y + RH;

const LEFT_X = PAD;
const RES_X = 300;
const CELL_W = 90;
/** 결과가 담을 수 있는 줄 — 세로를 마운트 뒤에 바꾸지 않도록 처음부터 이만큼 잡는다. */
const RESULT_SLOTS = 18;

export type StageTable = {
  title: string;
  cols: string[];
  rows: string[][];
  /** 결과로 옮겨 가는 칸의 열 번호 */
  source: number;
};

export type StageSpec = {
  sqlHead: string[];
  left: StageTable;
  right: StageTable;
  resultCols: [string, string];
};

export type StageQuery = { keyword: string; joinTail: string; onLine: string | null };

/** `slot` — 결과 칸 번호. 칸 배치는 알고리즘이 정한다 (무대는 그 칸에 그리기만 한다). */
export type StageRow = { l: number; r: number; slot: number; leftText: string; rightText: string; held: boolean };

export type JoinKindsStage = {
  init(spec: StageSpec): void;
  setQuery(q: StageQuery, ms: number): Promise<void>;
  setRows(rows: StageRow[], ms: number): Promise<void>;
  markUnmatched(side: 'left' | 'right', rows: number[]): void;
  clearMarks(): void;
  setCaption(text: string): void;
};

type Box = { x: number; y: number; w: number; op: number };

type Chip = Box & { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; isNull: boolean };

type RowView = {
  key: string;
  l: number;
  r: number;
  left: Chip;
  right: Chip;
  linkL: SVGPathElement;
  linkR: SVGPathElement;
  linkOp: number;
};

type Tween = { from: number[]; to: number[]; apply(v: number[]): void };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export const joinKindsStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const pal = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const tones = categorical(2, 'vivid');
    const leftTone = tones[0];
    const rightTone = tones[1];
    if (leftTone === undefined || rightTone === undefined) throw new Error('join-kinds: 색 토큰이 비었다');
    const cellPx = parseFloat(fontSizes.sm);
    const monoCharW = cellPx * 0.6;
    const isInstant = params.isInstant ?? (() => false);

    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    const cancelMotion = () => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };
    params.onScrubStart?.(cancelMotion);

    /** tween 묶음을 ms 동안 돌린다. 즉시 모드 · 파괴 뒤 · rAF 없음이면 끝 값으로 곧장. */
    const animate = (tweens: Tween[], ms: number, done?: () => void): Promise<void> => {
      const finish = () => {
        for (const tw of tweens) tw.apply(tw.to);
        done?.();
      };
      if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function' || tweens.length === 0) {
        finish();
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const start = performance.now();
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          waiters.delete(settle);
          finish();
          resolve();
        };
        waiters.add(settle);
        const frame = (now: number) => {
          if (settled) return;
          if (destroyed || isInstant()) return settle();
          const p = Math.min(1, (now - start) / ms);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          for (const tw of tweens) tw.apply(tw.from.map((f, i) => f + ((tw.to[i] ?? f) - f) * e));
          if (p >= 1) return settle();
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            frame(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          frame(n);
        });
        frames.add(id);
      });
    };

    // ── 층 ─────────────────────────────────────────────────────────────
    const sqlLayer = el('g');
    const tableLayer = el('g');
    const linkLayer = el('g');
    const chipLayer = el('g');
    const markLayer = el('g');
    const caption = el('text', {
      x: W / 2,
      y: H - 18,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: pal.text,
    });
    svg.append(sqlLayer, tableLayer, linkLayer, chipLayer, markLayer, caption);

    // ── 상태 ───────────────────────────────────────────────────────────
    let spec: StageSpec | null = null;
    let rightX = W - PAD;
    let rows = new Map<string, RowView>();
    let keywordText: SVGTextElement | null = null;
    let tailText: SVGTextElement | null = null;
    let onText: SVGTextElement | null = null;
    let onShown = false;
    let tailX = 0;
    let leftW: number[] = [];
    let rightW: number[] = [];
    const widthsOf = (side: 'left' | 'right') => (side === 'left' ? leftW : rightW);
    /** 열 폭 — 머리 글과 칸 글 가운데 긴 쪽에 맞춘다 (글자 폭은 토큰 크기에서). */
    const measure = (table: StageTable): number[] =>
      table.cols.map((col, c) => {
        let chars = col.length;
        for (const row of table.rows) {
          const v = row[c];
          if (v === undefined) throw new Error(`join-kinds: ${table.title} 의 ${col} 칸이 빈 줄이 있다`);
          chars = Math.max(chars, v.length);
        }
        return Math.ceil(chars * cellPx * 0.62) + 16;
      });

    const need = (): StageSpec => {
      if (!spec) throw new Error('join-kinds: 무대가 아직 표를 받지 않았다');
      return spec;
    };

    const tableRowY = (row: number) => ROW_Y0 + row * RH;
    const sourceCell = (side: 'left' | 'right', row: number): Box => {
      const s = need();
      const table = side === 'left' ? s.left : s.right;
      const x0 = side === 'left' ? LEFT_X : rightX;
      const widths = widthsOf(side);
      const w = widths[table.source];
      if (w === undefined || row < 0 || row >= table.rows.length) throw new Error(`join-kinds: ${side} 표에 ${row + 1} 번째 줄이 없다`);
      return { x: x0 + sum(widths.slice(0, table.source)), y: tableRowY(row) + 1, w, op: 1 };
    };
    const leftEdge = () => LEFT_X + sum(leftW);

    const sqlText = (x: number, y: number, s: string, weight = 'normal') => {
      const node = el('text', {
        x,
        y,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': weight,
        fill: pal.text,
        style: 'white-space: pre',
      });
      node.textContent = s;
      return node;
    };

    const drawTable = (table: StageTable, widths: number[], x0: number, tone: string) => {
      const title = el('text', { x: x0, y: TITLE_Y, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 'bold', fill: pal.text });
      title.textContent = table.title;
      tableLayer.append(title);
      let x = x0;
      table.cols.forEach((col, c) => {
        const w = widths[c];
        if (w === undefined) throw new Error(`join-kinds: ${table.title} 의 ${c + 1} 번째 열 폭이 없다`);
        const head = el('rect', { x, y: HEAD_Y, width: w, height: RH, fill: pal.bgSubtle, stroke: pal.border });
        const ht = el('text', {
          x: x + 6,
          y: HEAD_Y + RH / 2 + cellPx / 2 - 2,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: pal.textMuted,
        });
        ht.textContent = col;
        tableLayer.append(head, ht);
        table.rows.forEach((row, r) => {
          const y = tableRowY(r);
          const cell = el('rect', {
            x,
            y,
            width: w,
            height: RH,
            fill: pal.bg,
            stroke: c === table.source ? tone : pal.border,
            'stroke-width': c === table.source ? 1.5 : 1,
          });
          const ct = el('text', {
            x: x + 6,
            y: y + RH / 2 + cellPx / 2 - 2,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: pal.text,
          });
          const v = row[c];
          if (v === undefined) throw new Error(`join-kinds: ${table.title} ${r + 1} 번째 줄의 ${col} 칸이 없다`);
          ct.textContent = v;
          tableLayer.append(cell, ct);
        });
        x += w;
      });
    };

    // ── 결과 조각 ─────────────────────────────────────────────────────
    const applyChip = (c: Chip) => {
      c.rect.setAttribute('x', String(c.x));
      c.rect.setAttribute('y', String(c.y));
      c.rect.setAttribute('width', String(Math.max(0, c.w)));
      c.text.setAttribute('x', String(c.x + 6));
      c.text.setAttribute('y', String(c.y + (RH - 2) / 2 + cellPx / 2 - 2));
      c.text.setAttribute('opacity', c.w > 24 ? '1' : '0');
      c.g.setAttribute('opacity', String(c.op));
    };

    const makeChip = (text: string, tone: string, isNull: boolean, box: Box): Chip => {
      const g = el('g');
      const rect = el('rect', {
        height: RH - 2,
        rx: 3,
        fill: isNull ? pal.bgSubtle : pal.bg,
        stroke: isNull ? pal.textMuted : tone,
        'stroke-width': isNull ? 1 : 1.5,
      });
      if (isNull) rect.setAttribute('stroke-dasharray', '3 2');
      const label = el('text', {
        'font-family': isNull ? fonts.mono : fonts.body,
        'font-size': fontSizes.sm,
        fill: isNull ? pal.textMuted : pal.text,
      });
      label.textContent = text;
      g.append(rect, label);
      chipLayer.append(g);
      const chip: Chip = { g, rect, text: label, isNull, ...box };
      applyChip(chip);
      return chip;
    };

    const linkPath = (x1: number, y1: number, x2: number, y2: number) => {
      const mx = (x1 + x2) / 2;
      return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    };

    const applyLinks = (rv: RowView) => {
      if (rv.l >= 0) {
        rv.linkL.setAttribute('d', linkPath(leftEdge(), tableRowY(rv.l) + RH / 2, rv.left.x, rv.left.y + (RH - 2) / 2));
      }
      if (rv.r >= 0) {
        rv.linkR.setAttribute('d', linkPath(rightX, tableRowY(rv.r) + RH / 2, rv.right.x + rv.right.w, rv.right.y + (RH - 2) / 2));
      }
      rv.linkL.setAttribute('opacity', String(rv.l >= 0 ? rv.linkOp : 0));
      rv.linkR.setAttribute('opacity', String(rv.r >= 0 ? rv.linkOp : 0));
    };

    const slotBox = (k: number, side: 'left' | 'right', held: boolean): Box => ({
      x: side === 'left' ? RES_X : RES_X + CELL_W,
      y: ROW_Y0 + k * RH + 1,
      w: CELL_W,
      op: held ? 0.4 : 1,
    });

    /** NULL 칸이 자라나기 시작하는 자리 — 짝 있는 칸 곁, 폭 0. */
    const nullSeed = (k: number): Box => ({ x: RES_X + CELL_W, y: ROW_Y0 + k * RH + 1, w: 0, op: 1 });

    const chipTween = (c: Chip, to: Box, after?: () => void): Tween => ({
      from: [c.x, c.y, c.w, c.op],
      to: [to.x, to.y, to.w, to.op],
      apply(v) {
        c.x = v[0] ?? c.x;
        c.y = v[1] ?? c.y;
        c.w = v[2] ?? c.w;
        c.op = v[3] ?? c.op;
        applyChip(c);
        after?.();
      },
    });

    const setRows = (next: StageRow[], ms: number): Promise<void> => {
      need();
      if (next.length > RESULT_SLOTS) throw new Error(`join-kinds: 결과 ${next.length} 줄은 무대가 담을 수 있는 ${RESULT_SLOTS} 줄을 넘는다`);
      const tweens: Tween[] = [];
      const leaving: RowView[] = [];
      const nextKeys = new Set(next.map((r) => `${r.l}:${r.r}`));
      const nextMap = new Map<string, RowView>();

      // 떨어지는 줄 — 조각이 제 표의 칸으로 돌아간다
      for (const rv of rows.values()) {
        if (nextKeys.has(rv.key)) continue;
        leaving.push(rv);
        const back = (side: 'left' | 'right'): Box => {
          const c = side === 'left' ? rv.left : rv.right;
          const row = side === 'left' ? rv.l : rv.r;
          if (c.isNull) return { x: RES_X + CELL_W, y: c.y, w: 0, op: 0 };
          return { ...sourceCell(side, row), op: 0 };
        };
        const linkFrom = rv.linkOp;
        tweens.push(chipTween(rv.left, back('left'), () => applyLinks(rv)));
        tweens.push(chipTween(rv.right, back('right'), () => applyLinks(rv)));
        tweens.push({
          from: [linkFrom],
          to: [0],
          apply(v) {
            rv.linkOp = v[0] ?? 0;
            applyLinks(rv);
          },
        });
      }

      next.forEach((row) => {
        const k = row.slot;
        if (k < 0 || k >= RESULT_SLOTS) throw new Error(`join-kinds: 결과 칸 ${k + 1} 은 무대가 담을 수 있는 ${RESULT_SLOTS} 칸 밖이다`);
        const key = `${row.l}:${row.r}`;
        let rv = rows.get(key);
        if (!rv) {
          // 들어오는 줄 — 조각이 제 표의 칸에서 떠오르고, NULL 칸은 곁에서 자란다
          const start = (side: 'left' | 'right'): Box => {
            const idx = side === 'left' ? row.l : row.r;
            return idx < 0 ? nullSeed(k) : sourceCell(side, idx);
          };
          const linkL = el('path', { fill: 'none', stroke: leftTone, 'stroke-width': 1.2, opacity: 0 });
          const linkR = el('path', { fill: 'none', stroke: rightTone, 'stroke-width': 1.2, opacity: 0 });
          linkLayer.append(linkL, linkR);
          rv = {
            key,
            l: row.l,
            r: row.r,
            left: makeChip(row.leftText, leftTone, row.l < 0, start('left')),
            right: makeChip(row.rightText, rightTone, row.r < 0, start('right')),
            linkL,
            linkR,
            linkOp: 0,
          };
          applyLinks(rv);
        }
        const view = rv;
        nextMap.set(key, view);
        const dash = row.held ? '4 3' : '';
        for (const c of [view.left, view.right]) {
          if (!c.isNull) {
            if (dash) c.rect.setAttribute('stroke-dasharray', dash);
            else c.rect.removeAttribute('stroke-dasharray');
          }
        }
        tweens.push(chipTween(view.left, slotBox(k, 'left', row.held), () => applyLinks(view)));
        tweens.push(chipTween(view.right, slotBox(k, 'right', row.held), () => applyLinks(view)));
        const linkTo = row.held ? 0 : 0.7;
        tweens.push({
          from: [view.linkOp],
          to: [linkTo],
          apply(v) {
            view.linkOp = v[0] ?? linkTo;
            applyLinks(view);
          },
        });
      });

      rows = nextMap;
      return animate(tweens, ms, () => {
        for (const rv of leaving) {
          rv.left.g.remove();
          rv.right.g.remove();
          rv.linkL.remove();
          rv.linkR.remove();
        }
      });
    };

    // ── 질의 ───────────────────────────────────────────────────────────
    const joinY = SQL_Y + 2 * SQL_LINE;
    const onY = SQL_Y + 3 * SQL_LINE;

    const setQuery = (q: StageQuery, ms: number): Promise<void> => {
      need();
      const tweens: Tween[] = [];
      const oldKeyword = keywordText;
      if (!oldKeyword || oldKeyword.textContent !== q.keyword) {
        // 종류 낱말이 갈아 끼워진다 — 옛것은 위로 빠지고 새것이 아래에서 올라온다
        const fresh = sqlText(PAD, joinY + 12, q.keyword, 'bold');
        fresh.setAttribute('fill', pal.primary);
        sqlLayer.append(fresh);
        keywordText = fresh;
        tweens.push({
          from: [joinY + 12, 0],
          to: [joinY, 1],
          apply(v) {
            fresh.setAttribute('y', String(v[0] ?? joinY));
            fresh.setAttribute('opacity', String(v[1] ?? 1));
          },
        });
        if (oldKeyword) {
          tweens.push({
            from: [joinY, 1],
            to: [joinY - 12, 0],
            apply(v) {
              oldKeyword.setAttribute('y', String(v[0] ?? joinY));
              oldKeyword.setAttribute('opacity', String(v[1] ?? 0));
            },
          });
        }
      }
      const tail = tailText;
      if (!tail) throw new Error('join-kinds: 질의 줄이 없다');
      tail.textContent = q.joinTail;
      const nextTailX = PAD + q.keyword.length * monoCharW;
      const fromTail = tailX;
      tweens.push({
        from: [fromTail],
        to: [nextTailX],
        apply(v) {
          tailX = v[0] ?? nextTailX;
          tail.setAttribute('x', String(tailX));
        },
      });
      // ON 줄 — 조건이 사라지면 옆으로 빠지고, 돌아오면 들어온다
      const on = onText;
      if (!on) throw new Error('join-kinds: ON 줄이 없다');
      const wantOn = q.onLine !== null;
      if (q.onLine !== null) on.textContent = q.onLine;
      if (wantOn !== onShown) {
        const fromX = wantOn ? PAD + 120 : PAD;
        const toX = wantOn ? PAD : PAD + 120;
        tweens.push({
          from: [fromX, wantOn ? 0 : 1],
          to: [toX, wantOn ? 1 : 0],
          apply(v) {
            on.setAttribute('x', String(v[0] ?? toX));
            on.setAttribute('opacity', String(v[1] ?? 0));
          },
        });
        onShown = wantOn;
      }
      return animate(tweens, ms, () => {
        if (oldKeyword && oldKeyword !== keywordText) oldKeyword.remove();
      });
    };

    // ── 표시 ───────────────────────────────────────────────────────────
    const marks: SVGElement[] = [];
    const clearMarks = () => {
      for (const m of marks) m.remove();
      marks.length = 0;
    };
    const markUnmatched = (side: 'left' | 'right', idx: number[]) => {
      const s = need();
      const table = side === 'left' ? s.left : s.right;
      const x0 = side === 'left' ? LEFT_X : rightX;
      const w = sum(widthsOf(side));
      for (const row of idx) {
        if (row < 0 || row >= table.rows.length) throw new Error(`join-kinds: ${table.title} 에 ${row + 1} 번째 줄이 없다`);
        const y = tableRowY(row);
        const box = el('rect', { x: x0, y, width: w, height: RH, fill: 'none', stroke: pal.danger, 'stroke-width': 2 });
        const tag = el('text', {
          x: side === 'left' ? x0 + w + 6 : x0 - 6,
          y: y + RH / 2 + cellPx / 2 - 2,
          'text-anchor': side === 'left' ? 'start' : 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: pal.danger,
        });
        tag.textContent = t('label.noMatch', 'no match');
        markLayer.append(box, tag);
        marks.push(box, tag);
      }
    };

    const init = (next: StageSpec) => {
      cancelMotion();
      spec = next;
      rows = new Map();
      for (const layer of [sqlLayer, tableLayer, linkLayer, chipLayer, markLayer]) {
        while (layer.firstChild) layer.firstChild.remove();
      }
      marks.length = 0;
      caption.textContent = '';
      leftW = measure(next.left);
      rightW = measure(next.right);
      rightX = W - PAD - sum(rightW);

      next.sqlHead.forEach((line, i) => {
        const tx = sqlText(PAD, SQL_Y + i * SQL_LINE, line);
        sqlLayer.append(tx);
      });
      keywordText = null;
      tailX = PAD;
      tailText = sqlText(PAD, joinY, '');
      onText = sqlText(PAD, onY, '');
      onText.setAttribute('opacity', '0');
      onShown = false;
      sqlLayer.append(tailText, onText);

      drawTable(next.left, leftW, LEFT_X, leftTone);
      drawTable(next.right, rightW, rightX, rightTone);

      const resTitle = el('text', { x: RES_X, y: TITLE_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 'bold', fill: pal.text });
      resTitle.textContent = t('label.result', 'Result');
      tableLayer.append(resTitle);
      next.resultCols.forEach((col, i) => {
        const x = RES_X + i * CELL_W;
        const head = el('rect', { x, y: HEAD_Y, width: CELL_W, height: RH, fill: pal.bgSubtle, stroke: pal.border });
        const ht = el('text', { x: x + 6, y: HEAD_Y + RH / 2 + cellPx / 2 - 2, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: pal.textMuted });
        ht.textContent = col;
        tableLayer.append(head, ht);
      });
      const slots = el('rect', {
        x: RES_X,
        y: ROW_Y0,
        width: 2 * CELL_W,
        height: RESULT_SLOTS * RH,
        fill: 'none',
        stroke: pal.border,
        'stroke-dasharray': '2 4',
      });
      tableLayer.append(slots);
    };

    const stage: JoinKindsStage & { destroy(): void } = {
      init,
      setQuery,
      setRows,
      markUnmatched,
      clearMarks,
      setCaption(text: string) {
        caption.textContent = text;
      },
      destroy() {
        destroyed = true;
        cancelMotion();
        sqlLayer.remove();
        tableLayer.remove();
        linkLayer.remove();
        chipLayer.remove();
        markLayer.remove();
        caption.remove();
      },
    };
    return stage;
  },
};
