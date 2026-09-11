/**
 * square-and-halve stage — 접히는 줄과 그 아래의 이진 자리표.
 *
 * ── 형태가 질문에서 나온 자리
 *
 * 칸 하나의 **가로 길이가 곧 그 칸이 덮는 지수 폭**이다. 처음 줄은 폭 1 짜리 칸
 * 열셋이고, 접을 때마다 칸 수는 반이 되며 칸 하나의 폭은 두 배가 된다. 그래서
 * 줄 전체의 길이는 남은 지수에 정확히 비례하고, 줄에서 떨어져 나간 칸의 폭을
 * 다 더하면 처음 길이가 된다.
 *
 * 아래 자리표는 그 폭을 이진 자릿값 순서(8·4·2·1)로 늘어놓은 것이다. 떨어져
 * 나온 칸은 제 폭과 꼭 맞는 자리에 내려앉고, 빈 자리 하나가 0 자리로 남는다.
 * 자리표 밑의 숫자를 왼쪽부터 읽으면 1101 — 지수 13 의 이진 표기이고, 1 이 선
 * 자리가 곧 답에 곱한 제곱이다.
 *
 * 접는 동작은 두 마디다. 오른쪽 절반이 왼쪽 절반 위로 넘어와 짝을 만나고(그
 * 만남이 제곱이다), 값이 두 배의 지수를 덮게 되었으므로 각 칸이 두 배 폭으로
 * 펴진다. 페이드가 아니라 실제로 자리를 옮긴다 (S-piece).
 *
 * 가로는 러너가 PIECE_CANVAS_W 로 주므로 어디에도 적지 않고 그 폭을 채운다.
 * 세로만 이 파일이 상수로 갖는다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;

/** 세로 배분. 내용이 정하는 값이라 그림 곁에 둔다 (S-piece). */
const ROWS_TOP = 14;
const ROW_H = 36;
const ROW_GAP = 12;
const STRIP_GAP = 24;
const STRIP_H = 38;
const DIGIT_H = 20;
const PRODUCT_H = 26;
const CAPTION_H = 38;
const BOTTOM = 10;

/** 칸 사이의 틈. 둘이 하나로 붙는 순간이 보이게 하는 최소 폭이다. */
const INSET = 2;
/** 좌우로 남길 최소 여백. 칸 크기는 이 폭에서 역산한다 (S-piece 그 폭을 채운다). */
const SIDE_MIN = 10;
/** 칸 하나가 커질 수 있는 상한. 지수가 작을 때 그림이 포스터가 되지 않게 한다. */
const UNIT_MAX = 46;

/** 넘어오는 절반이 그리는 호의 높이. 접히는 것으로 읽히게 하는 값이다. */
const FOLD_LIFT = 18;

/**
 * 걸음마다의 애니메이션 길이.
 *
 * 걸음 벽시계는 애니메이션 + stepMs 이고, 가장 얇은 걸음이 800ms 아래로
 * 떨어지면 캡션을 읽을 틈이 사라진다 (S-piece). stepMs 는 800 이므로 **모든
 * 걸음에 실제 운동이 하나씩 있어야** 바닥선에 붙지 않는다. 줄을 세우는 첫
 * 걸음이 정지 화면이면 정확히 800 이 되므로 거기에도 MS_BEGIN 을 둔다.
 *
 * 가장 얇은 걸음은 skip 으로 340 + 800 = 1140ms 다.
 */
const MS_BEGIN = 380;
const MS_TAKE = 420;
const MS_SKIP = 340;
const MS_FOLD_OVER = 300;
const MS_FOLD_SPREAD = 260;
const MS_DONE = 320;

/** 선언된 캔버스 높이가 기대는 줄 수. mount 에서 실제 값으로 다시 잰다. */
const DEFAULT_ROWS = 4;

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

export type SquareAndHalveStageInit = {
  base: number;
  exponent: number;
};

function heightFor(rows: number): number {
  const rowsH = rows * ROW_H + Math.max(0, rows - 1) * ROW_GAP;
  return ROWS_TOP + rowsH + STRIP_GAP + STRIP_H + DIGIT_H + PRODUCT_H + CAPTION_H + BOTTOM;
}

function bitLength(n: number): number {
  let bits = 0;
  let v = Math.floor(n);
  while (v > 0) {
    bits += 1;
    v = Math.floor(v / 2);
  }
  return bits;
}

/** 3¹³ 처럼 어깨에 올린 수. 수식 표기이므로 표식이다 — 키를 만들지 않는다 (C10). */
function superscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT[Number(d)] ?? d)
    .join('');
}

/**
 * initialData 를 좁히는 자리는 mount 다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이고, 좁히는 규칙이 두 벌이 되지 않게 여기 하나만 둔다 (S-piece).
 */
function readScene(raw: Record<string, unknown> | undefined): SquareAndHalveStageInit {
  const base = typeof raw?.base === 'number' && Number.isFinite(raw.base) ? raw.base : 0;
  const rawExp = raw?.exponent;
  const exponent =
    typeof rawExp === 'number' && Number.isFinite(rawExp) ? Math.max(0, Math.floor(rawExp)) : 0;
  return { base, exponent };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node;
}

/** 글자 폭의 어림. 한글·한자·가나는 한 칸을 다 쓰고 나머지는 그 절반쯤 쓴다. */
function widthEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60);
    em += wide ? 1 : 0.55;
  }
  return em;
}

/** 캡션을 두 줄 안에 담는다. 열 언어 중 가장 긴 것이 넘치지 않게 하는 자다. */
function wrapTwo(text: string, maxEm: number): string[] {
  if (widthEm(text) <= maxEm) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line === '' ? word : `${line} ${word}`;
    if (widthEm(next) > maxEm && line !== '') {
      lines.push(line);
      line = word;
      if (lines.length === 2) break;
    } else {
      line = next;
    }
  }
  if (lines.length < 2 && line !== '') lines.push(line);
  // 띄어쓰기가 드문 글(중국어·일본어)은 낱말로 갈리지 않으므로 글자로 자른다.
  if (lines.length === 1 && widthEm(lines[0] ?? '') > maxEm) {
    const chars = [...text];
    let head = '';
    let idx = 0;
    while (idx < chars.length && widthEm(head + (chars[idx] ?? '')) <= maxEm) {
      head += chars[idx];
      idx += 1;
    }
    return [head, chars.slice(idx).join('')];
  }
  return lines;
}

type Cell = {
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
};

type Box = { x: number; y: number; w: number; h: number };

export const squareAndHalveStageView: CanvasView = {
  canvas: { height: heightFor(DEFAULT_ROWS) },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);

    const rows = Math.max(1, bitLength(scene.exponent));
    /** 자리표의 전체 폭. 8+4+2+1 처럼 자릿값을 다 더한 만큼이다. */
    const stripUnits = Math.pow(2, rows) - 1;
    const unit = Math.max(4, Math.min(UNIT_MAX, Math.floor((W - SIDE_MIN * 2) / stripUnits)));
    const originX = Math.round((W - stripUnits * unit) / 2);
    const H = heightFor(rows);
    // 세로는 여기서 한 번 정하고 그 뒤로 바꾸지 않는다 (S-view).
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const stripY = ROWS_TOP + rows * ROW_H + (rows - 1) * ROW_GAP + STRIP_GAP;
    const digitY = stripY + STRIP_H + 15;
    const productY = stripY + STRIP_H + DIGIT_H + 18;
    const captionY = H - BOTTOM - 20;

    const root = el('g');
    const slotLayer = el('g');
    const chipLayer = el('g');
    const rowLayer = el('g');
    const digitLayer = el('g');
    const textLayer = el('g');
    root.appendChild(slotLayer);
    root.appendChild(chipLayer);
    root.appendChild(rowLayer);
    root.appendChild(digitLayer);
    root.appendChild(textLayer);
    svg.appendChild(root);

    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    const productText = el('text', {
      x: W / 2,
      y: productY,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    textLayer.appendChild(productText);

    const captionLine1 = el('text', {
      x: W / 2,
      y: captionY,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    const captionLine2 = el('text', {
      x: W / 2,
      y: captionY + 15,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    textLayer.appendChild(captionLine1);
    textLayer.appendChild(captionLine2);

    let rowCells: Cell[] = [];
    let rowIndex = 0;
    /** 지금 줄의 칸 하나가 덮는 지수 폭. */
    let cellUnits = 1;
    let factors: number[] = [];
    let landed: SVGGElement[] = [];

    function rowY(index: number): number {
      return ROWS_TOP + index * (ROW_H + ROW_GAP);
    }

    function slotOf(place: number): { x: number; w: number } {
      return {
        x: originX + (stripUnits - (2 * place - 1)) * unit,
        w: place * unit,
      };
    }

    function cellBox(index: number, units: number, rowIdx: number): Box {
      return {
        x: originX + index * units * unit + INSET,
        y: rowY(rowIdx),
        w: Math.max(2, units * unit - INSET * 2),
        h: ROW_H,
      };
    }

    /** 칸 폭에서 역산한 글자 크기. 그림이 정하는 값이라 토큰의 대상이 아니다 (S-view). */
    function labelSize(text: string, boxW: number): number {
      const fit = Math.floor((boxW - 6) / Math.max(1, text.length * 0.62));
      return Math.max(9, Math.min(15, fit));
    }

    function placeLabel(label: SVGTextElement, text: string, box: Box): void {
      label.textContent = text;
      label.setAttribute('x', String(box.x + box.w / 2));
      label.setAttribute('y', String(box.y + box.h / 2 + 5));
      label.setAttribute('font-size', String(labelSize(text, box.w)));
    }

    function makeCell(index: number, units: number, rowIdx: number, value: number): Cell {
      const box = cellBox(index, units, rowIdx);
      const g = el('g');
      const rect = el('rect', {
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        rx: 3,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const label = el('text', {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        fill: colors.text,
      });
      placeLabel(label, String(value), box);
      g.appendChild(rect);
      g.appendChild(label);
      rowLayer.appendChild(g);
      return { g, rect, label };
    }

    function animate(ms: number, apply: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          apply(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            apply(1);
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          // 부드럽게 서고 부드럽게 멈춘다.
          const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
          apply(eased);
          if (raw >= 1) {
            apply(1);
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    function clearGroup(group: SVGGElement): void {
      while (group.firstChild) group.removeChild(group.firstChild);
    }

    function renderProduct(done: boolean, product: number): void {
      if (factors.length === 0) {
        productText.textContent = '';
        return;
      }
      const chain = factors.join(' × ');
      const head = done ? `${scene.base}${superscript(scene.exponent)} = ` : '';
      productText.textContent =
        factors.length === 1 && !done
          ? `${head}${chain}`
          : `${head}${chain} = ${product}`;
    }

    function buildSlots(): void {
      clearGroup(slotLayer);
      for (let i = 0; i < rows; i += 1) {
        const place = Math.pow(2, rows - 1 - i);
        const slot = slotOf(place);
        slotLayer.appendChild(
          el('rect', {
            x: slot.x + INSET,
            y: stripY,
            width: Math.max(2, slot.w - INSET * 2),
            height: STRIP_H,
            rx: 3,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '4 4',
          }),
        );
      }
    }

    function buildRow(count: number, value: number, rowIdx: number, units: number): void {
      clearGroup(rowLayer);
      rowCells = [];
      rowIndex = rowIdx;
      cellUnits = units;
      for (let i = 0; i < count; i += 1) rowCells.push(makeCell(i, units, rowIdx, value));
    }

    function rebuild(base: number, exponent: number): void {
      clearGroup(chipLayer);
      clearGroup(digitLayer);
      landed = [];
      factors = [];
      renderProduct(false, 0);
      buildSlots();
      buildRow(Math.max(0, Math.floor(exponent)), base, 0, 1);
    }

    /** 자리표 밑의 이진 숫자 하나. 수 표기이므로 표식이다 (C10). */
    function makeDigit(bit: number, x: number): SVGTextElement {
      return el('text', {
        x,
        y: digitY,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: bit === 1 ? colors.text : colors.textMuted,
      });
    }

    function setCaption(text: string): void {
      const lines = wrapTwo(text, (W - 28) / 12);
      const single = lines.length === 1;
      captionLine1.setAttribute('y', String(single ? captionY + 8 : captionY));
      captionLine1.textContent = lines[0] ?? '';
      captionLine2.textContent = single ? '' : (lines[1] ?? '');
    }

    /**
     * 줄이 왼쪽 위에서 차례로 미끄러져 들어와 선다.
     *
     * 정지 화면으로 세우면 이 걸음의 벽시계가 stepMs 그대로라 바닥선에 붙는다.
     * 칸이 실제로 자리를 잡고 들어오게 해 읽을 틈을 벌었다 (S-piece).
     */
    async function showBegin(a: { base: number; exponent: number }): Promise<void> {
      rebuild(a.base, a.exponent);
      const cells = [...rowCells];
      if (cells.length === 0) return;
      await animate(MS_BEGIN, (t) => {
        for (let i = 0; i < cells.length; i += 1) {
          const cell = cells[i];
          if (!cell) continue;
          // 앞 칸부터 차례로 — 줄이 한 번에 나타나지 않고 깔린다.
          const local = Math.min(1, Math.max(0, (t * (cells.length + 3) - i) / 3));
          cell.g.setAttribute('transform', `translate(${-20 * (1 - local)} ${-14 * (1 - local)})`);
          cell.g.setAttribute('opacity', String(0.25 + 0.75 * local));
        }
      });
      for (const cell of cells) {
        cell.g.removeAttribute('transform');
        cell.g.removeAttribute('opacity');
      }
    }

    function reset(): void {
      rebuild(scene.base, scene.exponent);
      setCaption('');
    }

    /** 짝 없이 남은 한 칸이 제 폭과 꼭 맞는 자리로 내려앉는다. */
    async function takeCell(a: { place: number; factor: number; product: number }): Promise<void> {
      const cell = rowCells.pop();
      if (!cell) return;
      cell.rect.setAttribute('fill', colors.itemPivot);
      cell.rect.setAttribute('stroke', colors.itemPivot);
      cell.label.setAttribute('fill', colors.stateInk);

      const from = cellBox(rowCells.length, cellUnits, rowIndex);
      const slot = slotOf(a.place);
      const dx = slot.x - (from.x - INSET);
      const dy = stripY - from.y;

      const digit = makeDigit(1, from.x + from.w / 2);
      digit.textContent = '1';
      digitLayer.appendChild(digit);
      const digitFrom = from.y + ROW_H / 2 + 5;
      const digitTo = digitY;

      await animate(MS_TAKE, (t) => {
        cell.g.setAttribute('transform', `translate(${dx * t} ${dy * t})`);
        digit.setAttribute('x', String(from.x + from.w / 2 + dx * t));
        digit.setAttribute('y', String(digitFrom + (digitTo - digitFrom) * t));
      });

      cell.rect.setAttribute('fill', colors.itemSorted);
      cell.rect.setAttribute('stroke', colors.itemSorted);
      cell.rect.setAttribute('height', String(STRIP_H));
      cell.label.setAttribute('fill', colors.textInverse);
      cell.label.setAttribute(
        'y',
        String(from.y + STRIP_H / 2 + 5),
      );
      chipLayer.appendChild(cell.g);
      landed.push(cell.g);

      factors.push(a.factor);
      renderProduct(false, a.product);
    }

    /** 짝수라 남는 칸이 없다. 0 하나가 제 자리로 떨어질 뿐이다. */
    async function markSkip(a: { place: number }): Promise<void> {
      const slot = slotOf(a.place);
      const rowRight = originX + rowCells.length * cellUnits * unit;
      const digit = makeDigit(0, rowRight);
      digit.textContent = '0';
      digitLayer.appendChild(digit);
      const fromX = rowRight;
      const toX = slot.x + slot.w / 2;
      const fromY = rowY(rowIndex) + ROW_H / 2 + 5;
      await animate(MS_SKIP, (t) => {
        digit.setAttribute('x', String(fromX + (toX - fromX) * t));
        digit.setAttribute('y', String(fromY + (digitY - fromY) * t));
      });
    }

    /**
     * 반으로 접는다.
     *
     * 오른쪽 절반이 왼쪽 절반 위로 넘어와 짝을 만나면 그 자리가 제곱이고,
     * 값이 두 배의 지수를 덮게 되었으므로 각 칸이 두 배 폭으로 펴진다.
     */
    async function foldRow(a: { row: number; count: number; value: number }): Promise<void> {
      const half = Math.min(a.count, Math.floor(rowCells.length / 2));
      if (half <= 0) return;
      const moving = rowCells.slice(half, half * 2);
      const staying = rowCells.slice(0, half);
      const shift = half * cellUnits * unit;
      const drop = rowY(a.row) - rowY(rowIndex);

      await animate(MS_FOLD_OVER, (t) => {
        for (const cell of staying) cell.g.setAttribute('transform', `translate(0 ${drop * t})`);
        for (const cell of moving) {
          const lift = -FOLD_LIFT * Math.sin(Math.PI * t);
          cell.g.setAttribute('transform', `translate(${-shift * t} ${drop * t + lift})`);
        }
      });

      for (const cell of moving) cell.g.remove();

      const nextUnits = cellUnits * 2;
      for (let i = 0; i < staying.length; i += 1) {
        const cell = staying[i];
        if (!cell) continue;
        cell.g.removeAttribute('transform');
        const held = cellBox(i, cellUnits, a.row);
        cell.rect.setAttribute('y', String(held.y));
        placeLabel(cell.label, String(a.value), held);
      }

      await animate(MS_FOLD_SPREAD, (t) => {
        for (let i = 0; i < staying.length; i += 1) {
          const cell = staying[i];
          if (!cell) continue;
          const from = cellBox(i, cellUnits, a.row);
          const to = cellBox(i, nextUnits, a.row);
          const box: Box = {
            x: from.x + (to.x - from.x) * t,
            y: to.y,
            w: from.w + (to.w - from.w) * t,
            h: ROW_H,
          };
          cell.rect.setAttribute('x', String(box.x));
          cell.rect.setAttribute('width', String(box.w));
          placeLabel(cell.label, String(a.value), box);
        }
      });

      rowCells = staying;
      rowIndex = a.row;
      cellUnits = nextUnits;
    }

    /** 내려앉은 칸들이 한 번 들썩인다 — 저것들을 다 곱한 것이 답이라는 뜻. */
    async function showDone(a: { product: number }): Promise<void> {
      renderProduct(true, a.product);
      const chips = [...landed];
      if (chips.length === 0) return;
      await animate(MS_DONE, (t) => {
        const lift = -6 * Math.sin(Math.PI * t);
        for (const chip of chips) chip.setAttribute('transform', `translate(0 ${lift})`);
      });
      for (const chip of chips) chip.removeAttribute('transform');
    }

    rebuild(scene.base, scene.exponent);

    return {
      showBegin,
      setCaption,
      takeCell,
      markSkip,
      foldRow,
      showDone,
      reset,
      destroy(): void {
        destroyed = true;
        // 걸어 둔 프레임을 먼저 거두고,
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 이것이 없으면 unmount 된 뒤에도 알고리즘이
        // await ctx.emit 에 매달린 채 붙들린다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
