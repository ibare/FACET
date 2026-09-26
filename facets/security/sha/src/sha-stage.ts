/**
 * sha-stage — 접기 줄 다섯(Alice · Alice 바깥 · Mallory · Bob · Bob 바깥)과 오가는 글 한 장.
 *
 * 열은 줄 안의 덩어리 차례다 (0 열 = 출발 상태). 같은 열이면 같은 덩어리 자리라, Mallory 가 이어 접은
 * 칸은 Bob 의 줄 끝 칸 바로 위에 선다. 걸음 5 에서 그 칸이 Bob 의 줄로 **내려앉거나** 기울어 **끊긴다**.
 *
 * 칸은 줄과 식별자로 쥔다 — 열쇠 칸은 `key`, 나머지는 열쇠 뒤로 센 차례. 그래서 방식을 돌려 열쇠 칸이
 * 끼어들면 같은 이름의 글 칸이 한 열씩 밀려나고, 공격을 돌리면 Mallory 의 칸이 줄 끝에서 줄 처음으로 옮겨 간다.
 * 운동은 CSS transition 에 맡긴다 (되짚기 중엔 즉시). 타이머 · 프레임을 걸지 않는다.
 *
 * 무대는 셈하지 않는다. 값 · 열 · 겹침 여부는 모두 payload 로 받고, 비었으면 던진다.
 */

import type { CanvasView, Palette, Translate, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { categorical, fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

export type StageRowId = 'alice' | 'aliceOuter' | 'mallory' | 'bob' | 'bobOuter';
export type StageSlot = { id: string; col: number; head: number | null };
export type StageRowShape = { row: StageRowId; startCol: number; head: number | null; slots: StageSlot[] };
export type StageCell = { id: string; col: number; block: number; state: number };
export type StageFoldRow = { row: StageRowId; start: number; startCol: number; cells: StageCell[] };
export type StageSentByte = { byte: number; kind: 'text' | 'pad' };
export type StageMatch = 'land' | 'half' | 'miss';
export type Holder = 'alice' | 'mallory' | 'bob';

/** projector 가 부르는 무대의 구조적 표면. */
export type ShaStage = {
  reset(): void;
  layout(rows: StageRowShape[], key: number, ms: number): void;
  fillRow(row: StageFoldRow, ms: number, delay: number): void;
  markEnd(row: StageRowId, col: number): void;
  letterText(text: string): void;
  letterBytes(sent: StageSentByte[], ms: number): void;
  letterTag(tag: number): void;
  moveLetter(holder: Holder, ms: number): void;
  flyState(fromRow: StageRowId, fromCol: number, toCol: number, value: number, ms: number): void;
  dropMallory(match: StageMatch[], ms: number, delay: number): void;
  stamp(accepted: boolean, bob: number, claim: number, ms: number): void;
  caption(text: string): void;
};

const W = 1000;
const H = 470;
const X0 = 128;
const COL_W = 66;
const CELL_W = 58;
const ROW_Y: Record<StageRowId, number> = { alice: 26, aliceOuter: 96, mallory: 186, bob: 276, bobOuter: 346 };
const ROWS: StageRowId[] = ['alice', 'aliceOuter', 'mallory', 'bob', 'bobOuter'];
const LETTER_X = 808;
const LETTER_W = 184;
const LETTER_H = 52;
const STAMP_Y = 410;
const CAPTION_Y = 456;
/** Mallory 의 칸이 끊길 때 멈추는 높이 — Bob 의 줄 위로 이만큼 떠서 기운다. */
const HOVER = 52;

const SVG_NS = 'http://www.w3.org/2000/svg';
const hex4 = (v: number): string => v.toString(16).padStart(4, '0');
const hex2 = (v: number): string => v.toString(16).padStart(2, '0');
const colX = (c: number): number => X0 + c * COL_W;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

type Cell = {
  g: SVGGElement;
  blockRect: SVGRectElement;
  blockText: SVGTextElement;
  stateRect: SVGRectElement;
  stateText: SVGTextElement;
  ink: string;
  col: number;
};

function roleOf(row: StageRowId): Holder {
  if (row === 'alice' || row === 'aliceOuter') return 'alice';
  if (row === 'bob' || row === 'bobOuter') return 'bob';
  return 'mallory';
}

export const shaStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const hues = categorical(3, 'vivid');
    const roleColor = (h: Holder): string => {
      const i = h === 'alice' ? 0 : h === 'mallory' ? 1 : 2;
      const col = hues[i];
      if (col === undefined) throw new Error('sha-stage: 역할 색이 없다');
      return col;
    };
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);
    const charW = smPx * 0.62;

    const root = el('g');
    svg.appendChild(root);
    const labelLayer = el('g');
    const cellLayer = el('g');
    const topLayer = el('g');
    root.append(labelLayer, cellLayer, topLayer);

    const motion = (node: SVGElement, ms: number, delay = 0): void => {
      const d = isInstant() ? 0 : ms;
      node.style.transition = d > 0 ? `transform ${d}ms ease ${isInstant() ? 0 : delay}ms, opacity ${d}ms ease ${isInstant() ? 0 : delay}ms` : 'none';
    };
    const place = (node: SVGElement, x: number, y: number, extra = ''): void => {
      node.style.transform = `translate(${x}px, ${y}px)${extra}`;
    };
    const settle = (node: SVGElement): void => {
      // 처음 값을 그린 것으로 만들어 두어야 다음 값으로 transition 이 걸린다
      void node.getBoundingClientRect();
    };

    // ── 줄 이름 (다섯 자리를 처음부터 잡는다 — 마운트 뒤 세로를 바꾸지 않는다)
    const labels = new Map<StageRowId, { g: SVGGElement; name: SVGTextElement; sub: SVGTextElement; sub2: SVGTextElement }>();
    for (const row of ROWS) {
      const g = el('g');
      place(g, 8, ROW_Y[row]);
      g.style.transformBox = 'fill-box';
      const name = el('text', { x: 0, y: 14, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600, fill: roleColor(roleOf(row)) });
      const sub = el('text', { x: 0, y: 31, 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted });
      const sub2 = el('text', { x: 0, y: 45, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted });
      g.append(name, sub, sub2);
      g.style.opacity = '0';
      labelLayer.appendChild(g);
      labels.set(row, { g, name, sub, sub2 });
    }

    const cells = new Map<string, Cell>();
    const starts = new Map<StageRowId, Cell>();
    const key = (row: StageRowId, id: string) => `${row}/${id}`;
    const activeRows = new Set<StageRowId>();

    const makeCell = (row: StageRowId, isStart: boolean): Cell => {
      const g = el('g');
      g.style.transformBox = 'fill-box';
      g.style.transformOrigin = 'center';
      const stroke = roleColor(roleOf(row));
      const blockRect = el('rect', { x: 0, y: 0, width: CELL_W, height: 16, rx: 3, fill: c.bgSubtle, stroke: c.border });
      const blockText = el('text', {
        x: CELL_W / 2,
        y: 12,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      const stateRect = el('rect', { x: 0, y: 20, width: CELL_W, height: 26, rx: 4, fill: c.bg, stroke, 'stroke-width': 1.5 });
      const stateText = el('text', {
        x: CELL_W / 2,
        y: 38,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      if (isStart) {
        blockRect.setAttribute('visibility', 'hidden');
      }
      g.append(blockRect, blockText, stateRect, stateText);
      cellLayer.appendChild(g);
      return { g, blockRect, blockText, stateRect, stateText, ink: stroke, col: -1 };
    };

    const blank = (cell: Cell): void => {
      cell.blockText.textContent = '';
      cell.stateText.textContent = '';
      cell.stateText.style.transition = 'none';
      cell.stateText.style.transform = '';
      cell.stateRect.setAttribute('stroke-dasharray', '3 3');
      cell.stateRect.setAttribute('stroke-width', '1.5');
      cell.stateRect.setAttribute('stroke', cell.ink);
      cell.stateRect.setAttribute('fill', c.bg);
      cell.g.style.opacity = '0.55';
    };

    const rowY = (row: StageRowId): number => ROW_Y[row];

    // ── 글 한 장
    const letter = el('g');
    const letterRect = el('rect', { x: 0, y: 0, width: LETTER_W, height: LETTER_H, rx: 6, fill: c.bg, stroke: c.border, 'stroke-width': 1.5 });
    const letterBody = el('g');
    const letterTagText = el('text', { x: 10, y: 43, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text, 'font-weight': 600 });
    letter.append(letterRect, letterBody, letterTagText);
    letter.style.opacity = '0';
    topLayer.appendChild(letter);
    let letterAt: Holder = 'alice';

    // ── 판정 도장
    const stampG = el('g');
    stampG.style.transformBox = 'fill-box';
    stampG.style.transformOrigin = 'center';
    const stampRect = el('rect', { x: 0, y: 0, width: LETTER_W, height: 30, rx: 4, fill: c.bg, 'stroke-width': 2 });
    const stampText = el('text', {
      x: LETTER_W / 2,
      y: 20,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      'font-weight': 700,
    });
    stampG.append(stampRect, stampText);
    topLayer.appendChild(stampG);

    // ── 날아가는 상태 (받은 표 T 가 Mallory 의 상태 칸으로 들어간다)
    const ghost = el('g');
    const ghostRect = el('rect', { x: 0, y: 20, width: CELL_W, height: 26, rx: 4, fill: c.accent, stroke: c.text });
    const ghostText = el('text', {
      x: CELL_W / 2,
      y: 38,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: c.text,
    });
    ghost.append(ghostRect, ghostText);
    topLayer.appendChild(ghost);

    const captionText = el('text', { x: 8, y: CAPTION_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text });
    root.appendChild(captionText);

    const clearConclusions = (): void => {
      letter.style.transition = 'none';
      letter.style.opacity = '0';
      while (letterBody.firstChild) letterBody.removeChild(letterBody.firstChild);
      letterTagText.textContent = '';
      stampG.style.transition = 'none';
      stampG.style.opacity = '0';
      stampText.textContent = '';
      ghost.style.transition = 'none';
      ghost.style.opacity = '0';
      ghostText.textContent = '';
      captionText.textContent = '';
    };

    const reset = (): void => {
      for (const cell of cells.values()) cell.g.remove();
      for (const cell of starts.values()) cell.g.remove();
      cells.clear();
      starts.clear();
      activeRows.clear();
      for (const l of labels.values()) {
        l.g.style.transition = 'none';
        l.g.style.opacity = '0';
      }
      clearConclusions();
    };

    const need = <T>(v: T | undefined, what: string): T => {
      if (v === undefined) throw new Error(`sha-stage: ${what} 이 없다`);
      return v;
    };

    const layout = (rows: StageRowShape[], k: number, ms: number): void => {
      clearConclusions();
      const next = new Set(rows.map((r) => r.row));
      // 사라지는 줄 — 칸을 걷는다
      for (const row of ROWS) {
        if (next.has(row)) continue;
        for (const [id, cell] of [...cells]) {
          if (id.startsWith(`${row}/`)) {
            cell.g.remove();
            cells.delete(id);
          }
        }
        const s = starts.get(row);
        if (s) {
          s.g.remove();
          starts.delete(row);
        }
        const l = need(labels.get(row), '줄 이름');
        l.g.style.transition = 'none';
        l.g.style.opacity = '0';
        activeRows.delete(row);
      }
      for (const shape of rows) {
        const y = rowY(shape.row);
        const l = need(labels.get(shape.row), '줄 이름');
        const role = roleOf(shape.row);
        l.name.textContent =
          role === 'alice' ? t('label.alice', 'Alice') : role === 'bob' ? t('label.bob', 'Bob') : t('label.mallory', 'Mallory');
        l.sub.textContent = role === 'mallory' ? t('label.noKey', 'no key') : t('label.key', 'key {k}', { k: hex4(k) });
        l.sub2.textContent =
          shape.row === 'aliceOuter' || shape.row === 'bobOuter'
            ? t('label.outer', 'outer fold')
            : shape.row !== 'mallory' && next.has(shape.row === 'alice' ? 'aliceOuter' : 'bobOuter')
              ? t('label.inner', 'inner fold')
              : '';
        l.g.style.opacity = '1';

        // 출발 칸
        let start = starts.get(shape.row);
        const fresh = !start;
        if (!start) {
          start = makeCell(shape.row, true);
          starts.set(shape.row, start);
        }
        blank(start);
        if (shape.head !== null) {
          start.stateText.textContent = hex4(shape.head);
          start.blockText.textContent = t('label.iv', 'IV');
          start.g.style.opacity = '1';
          start.stateRect.removeAttribute('stroke-dasharray');
        }
        start.col = shape.startCol;
        if (fresh) {
          place(start.g, colX(shape.startCol), y, ' scale(0.3, 0.3)');
          settle(start.g);
        }
        motion(start.g, ms);
        place(start.g, colX(shape.startCol), y);

        // 덩어리 칸
        const keep = new Set(shape.slots.map((s) => key(shape.row, s.id)));
        for (const [id, cell] of [...cells]) {
          if (id.startsWith(`${shape.row}/`) && !keep.has(id)) {
            cell.g.remove();
            cells.delete(id);
          }
        }
        for (const slot of shape.slots) {
          const id = key(shape.row, slot.id);
          let cell = cells.get(id);
          const born = !cell;
          if (!cell) {
            cell = makeCell(shape.row, false);
            cells.set(id, cell);
          }
          blank(cell);
          if (slot.head !== null) {
            cell.blockText.textContent = hex4(slot.head);
            cell.blockRect.setAttribute('stroke', roleColor(role));
            cell.g.style.opacity = '1';
          } else {
            cell.blockRect.setAttribute('stroke', c.border);
          }
          cell.col = slot.col;
          if (born) {
            // 새 칸은 제 자리에서 일어선다 — 열쇠 칸이 끼어들고 바깥 줄이 선다
            place(cell.g, colX(slot.col), y, ' scale(1, 0.1)');
            settle(cell.g);
          }
          motion(cell.g, ms);
          place(cell.g, colX(slot.col), y);
        }
        activeRows.add(shape.row);
      }
    };

    const fillRow = (row: StageFoldRow, ms: number, delay: number): void => {
      if (!activeRows.has(row.row)) throw new Error(`sha-stage: 깔지 않은 줄 ${row.row}`);
      const y = rowY(row.row);
      const start = need(starts.get(row.row), '출발 칸');
      start.stateText.textContent = hex4(row.start);
      start.stateRect.removeAttribute('stroke-dasharray');
      start.g.style.opacity = '1';
      if (start.col !== row.startCol) {
        start.col = row.startCol;
        motion(start.g, ms);
        place(start.g, colX(row.startCol), y);
      }
      const n = row.cells.length;
      const each = n > 0 ? ms / n : ms;
      row.cells.forEach((cellData, i) => {
        const cell = need(cells.get(key(row.row, cellData.id)), `칸 ${row.row}/${cellData.id}`);
        if (cell.col !== cellData.col) throw new Error(`sha-stage: 칸 ${cellData.id} 의 열이 깐 자리와 다르다`);
        cell.blockText.textContent = hex4(cellData.block);
        cell.stateText.textContent = hex4(cellData.state);
        cell.stateRect.removeAttribute('stroke-dasharray');
        cell.g.style.opacity = '1';
        // 상태가 앞 칸에서 흘러 들어온다 — 접기는 앞 상태를 품어 넘긴다
        cell.stateText.style.transition = 'none';
        cell.stateText.style.transform = `translate(${-COL_W}px, 0px)`;
        settle(cell.stateText);
        const d = isInstant() ? 0 : each;
        cell.stateText.style.transition = d > 0 ? `transform ${d}ms ease ${delay + i * each}ms` : 'none';
        cell.stateText.style.transform = 'translate(0px, 0px)';
      });
    };

    const markEnd = (row: StageRowId, col: number): void => {
      const cell = [...cells.entries()].find(([id, cc]) => id.startsWith(`${row}/`) && cc.col === col)?.[1];
      if (!cell) throw new Error(`sha-stage: ${row} 줄 ${col} 열에 칸이 없다`);
      cell.stateRect.setAttribute('stroke-width', '3');
      cell.stateRect.setAttribute('fill', c.accent);
    };

    const letterText = (text: string): void => {
      while (letterBody.firstChild) letterBody.removeChild(letterBody.firstChild);
      const node = el('text', { x: 10, y: 20, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text });
      node.textContent = text;
      letterBody.appendChild(node);
      letter.style.opacity = '1';
    };

    const letterBytes = (sent: StageSentByte[], ms: number): void => {
      while (letterBody.firstChild) letterBody.removeChild(letterBody.firstChild);
      const padW = 17;
      let x = 10;
      sent.forEach((b, i) => {
        const g = el('g');
        let at = x;
        if (b.kind === 'text') {
          const tx = el('text', { x: 0, y: 20, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text });
          tx.textContent = String.fromCharCode(b.byte);
          g.appendChild(tx);
          x += charW;
        } else {
          // 패딩 바이트는 글자가 아니다 — 16진 두 자리를 테두리 안에 둔다
          x += 3;
          at = x;
          const tx = el('text', {
            x: padW / 2,
            y: 20,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          });
          tx.textContent = hex2(b.byte);
          g.append(el('rect', { x: 0, y: 8, width: padW, height: 16, rx: 2, fill: c.bgSubtle, stroke: roleColor('mallory') }), tx);
          x += padW + 2;
        }
        letterBody.appendChild(g);
        // 바이트는 오른쪽에서 밀려 들어와 제 자리에 선다
        g.style.transition = 'none';
        place(g, at + 60, 0);
        settle(g);
        motion(g, ms * 0.7, (i / Math.max(1, sent.length)) * ms * 0.3);
        place(g, at, 0);
      });
      letter.style.opacity = '1';
    };

    const letterTag = (tag: number): void => {
      letterTagText.textContent = t('label.tag', 'tag {v}', { v: hex4(tag) });
    };

    const moveLetter = (holder: Holder, ms: number): void => {
      letterAt = holder;
      motion(letter, ms);
      place(letter, LETTER_X, ROW_Y[holder]);
      letterRect.setAttribute('stroke', roleColor(holder));
    };

    const flyState = (fromRow: StageRowId, fromCol: number, toCol: number, value: number, ms: number): void => {
      ghostText.textContent = hex4(value);
      ghost.style.transition = 'none';
      ghost.style.opacity = '1';
      place(ghost, colX(fromCol), rowY(fromRow));
      settle(ghost);
      motion(ghost, ms);
      place(ghost, colX(toCol), rowY('mallory'));
      ghost.style.opacity = isInstant() ? '0' : '0.85';
    };

    const malloryCells = (): Cell[] =>
      [...cells.entries()].filter(([id]) => id.startsWith('mallory/')).map(([, cell]) => cell).sort((a, b) => a.col - b.col);

    const dropMallory = (match: StageMatch[], ms: number, delay: number): void => {
      const list = malloryCells();
      if (list.length !== match.length) throw new Error('sha-stage: Mallory 의 칸 수와 겹침 수가 다르다');
      list.forEach((cell, i) => {
        const m = need(match[i], '겹침');
        motion(cell.g, ms, delay + i * (ms / 6));
        if (m === 'land') {
          place(cell.g, colX(cell.col), rowY('bob'));
          cell.stateRect.setAttribute('stroke-width', '3');
        } else {
          const tilt = i % 2 === 0 ? 7 : -7;
          place(cell.g, colX(cell.col), rowY('bob') - HOVER - (m === 'miss' ? 14 : 0), ` rotate(${tilt}deg)`);
          cell.stateRect.setAttribute('stroke', c.danger);
          cell.stateRect.setAttribute('stroke-dasharray', '5 3');
        }
      });
    };

    const stamp = (accepted: boolean, bob: number, claim: number, ms: number): void => {
      stampText.textContent = accepted
        ? t('label.accept', '{bob} = {claim} · accepted', { bob: hex4(bob), claim: hex4(claim) })
        : t('label.reject', '{bob} ≠ {claim} · rejected', { bob: hex4(bob), claim: hex4(claim) });
      const ink = accepted ? c.text : c.danger;
      stampRect.setAttribute('stroke', ink);
      stampRect.setAttribute('stroke-dasharray', accepted ? '' : '6 3');
      stampText.setAttribute('fill', ink);
      // 받아들임은 겹 테두리 없는 굵은 실선, 버림은 위험색 끊긴 선 — success 색은 본문 글자색과 같아 모양으로 가른다
      stampRect.setAttribute('stroke-width', accepted ? '2.5' : '2');
      stampG.style.transition = 'none';
      place(stampG, LETTER_X, STAMP_Y - 40, ' scale(1.5, 1.5)');
      stampG.style.opacity = '0';
      settle(stampG);
      motion(stampG, ms);
      place(stampG, LETTER_X, STAMP_Y - 40);
      stampG.style.opacity = '1';
    };

    const caption = (text: string): void => {
      captionText.textContent = text;
    };

    place(letter, LETTER_X, ROW_Y.alice);
    place(stampG, LETTER_X, STAMP_Y - 40);
    stampG.style.opacity = '0';
    ghost.style.opacity = '0';

    const api: ShaStage = {
      reset,
      layout,
      fillRow,
      markEnd,
      letterText,
      letterBytes,
      letterTag,
      moveLetter,
      flyState,
      dropMallory,
      stamp,
      caption,
    };
    return {
      ...api,
      /** 지금 글을 쥔 사람 — 검사용 */
      holder: (): Holder => letterAt,
      destroy(): void {
        root.remove();
      },
    };
  },
};
