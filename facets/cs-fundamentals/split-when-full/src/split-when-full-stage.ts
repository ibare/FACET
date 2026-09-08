/**
 * split-when-full-stage — 노드 분할 조각(piece) 전용 시각화.
 *
 * 빌트인 tree-layout 은 "노드 = 원 하나" 를 전제해 한 노드 안의 여러 키가
 * 넘치고 갈라지는 장면을 표현하지 못한다. 이 stage 는 부모 행 / 자식 행
 * 두 줄에 노드를 상자로, 키를 상자 안 칩으로 그려 "쪼개져 올라간다" 는
 * 동사가 실제 이동으로 일어나게 한다.
 *
 * 노출 메서드 (projector 가 호출):
 *   setTree(parentKeys, childrenKeys)   초기/되짚기 — 정적으로 다시 그린다.
 *   showDescend(payload)   비교 하이라이트 + 넣을 키가 대상 자식 위로 내려간다.
 *   showOverflow(payload)  자식이 꽉 찬 자리에 키가 끼어들어 넘친다.
 *   showPromote(payload)   가운데 키가 부모 자리로 실제로 솟아오른다.
 *   showDivide(payload)    남은 키들이 좌/우 두 자식으로 갈라지고, 형제는
 *                          한 칸 밀려난다 — 나무가 옆으로 넓어진다.
 *   setCaption(text)       현재 걸음의 캡션 한 줄(또는 두 줄)을 그린다.
 *
 * 색은 design-tokens 결정 트리를 따른다 — 비교 하이라이트(itemComparing),
 * 새로 들어온/넘치는 키(itemActive), 넘친 상태 표시(danger), 올라가 갈림
 * 기준이 된 키(itemPivot). 상태 타일 위 글자는 stateInk (S-piece).
 */

import {
  getColors,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
/**
 * stage 가 받는 걸음의 모양. `algorithm.ts` 의 payload 타입과 동형이지만 여기서
 * 따로 선언한다 — View 는 Algorithm 을 참조하지 않는다 (원칙 1). 타입 전용
 * import 라 런타임에는 지워지지만, 금하는 것은 방향이지 실행 여부가 아니다.
 * 둘을 잇는 것은 projector 이고, projector 가 payload 를 좁혀 이 모양으로
 * 조립해 넘긴다 (C9).
 */
type DescendPayload = {
  childIndex: number;
  insertKey: number;
  parentKeyIndex: number;
  comparedKey: number;
};

type OverflowPayload = {
  childIndex: number;
  tempKeys: number[];
  insertedIndex: number;
};

type PromotePayload = {
  childIndex: number;
  middleKey: number;
  middleIndex: number;
  parentInsertIndex: number;
  parentKeysAfter: number[];
};

type DividePayload = {
  childIndex: number;
  leftKeys: number[];
  rightKeys: number[];
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const MOVE_MS = 420;
const NODE_H = 40;
const KEY_W = 42;
const KEY_GAP = 6;
const CHIP_H = 26;
const NODE_PAD = 8;
const PARENT_Y = 30;
const ROW_GAP = 92;
const CHILD_Y = PARENT_Y + NODE_H + ROW_GAP;
const CAPTION_Y = CHILD_Y + NODE_H + 46;
const HEIGHT = CAPTION_Y + 30;

type BoxEl = { g: SVGGElement; rect: SVGRectElement };
type ChipEl = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; value: number };

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

function raf(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => setTimeout(resolve, 16));
}

function colCenterX(index: number, total: number): number {
  const colW = PIECE_CANVAS_W / Math.max(1, total);
  return colW * index + colW / 2;
}

function boxWidthFor(keyCount: number): number {
  const n = Math.max(1, keyCount);
  return n * KEY_W + (n - 1) * KEY_GAP + NODE_PAD * 2;
}

function chipXs(centerX: number, keyCount: number): number[] {
  const totalW = keyCount * KEY_W + Math.max(0, keyCount - 1) * KEY_GAP;
  const left = centerX - totalW / 2;
  const xs: number[] = [];
  for (let i = 0; i < keyCount; i += 1) xs.push(left + i * (KEY_W + KEY_GAP));
  return xs;
}

function createBox(rowY: number, width: number, stroke: string): BoxEl {
  const g = svgEl('g');
  const rect = svgEl('rect');
  rect.setAttribute('x', String(-width / 2));
  rect.setAttribute('y', String(rowY));
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(NODE_H));
  rect.setAttribute('rx', '10');
  rect.setAttribute('fill', 'none');
  rect.setAttribute('stroke', stroke);
  rect.setAttribute('stroke-width', '1.5');
  g.appendChild(rect);
  return { g, rect };
}

function moveBox(box: BoxEl, centerX: number, width: number, ms = MOVE_MS): Promise<void> {
  box.g.style.transition = `transform ${ms}ms ease`;
  box.g.setAttribute('transform', `translate(${centerX}, 0)`);
  box.rect.style.transition = `width ${ms}ms ease, x ${ms}ms ease`;
  box.rect.setAttribute('width', String(width));
  box.rect.setAttribute('x', String(-width / 2));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createChip(value: number, x: number, y: number, fill: string, textFill: string, fontFamily: string, fontSize: string): ChipEl {
  const g = svgEl('g');
  g.setAttribute('transform', `translate(${x}, ${y})`);
  const rect = svgEl('rect');
  rect.setAttribute('width', String(KEY_W));
  rect.setAttribute('height', String(CHIP_H));
  rect.setAttribute('rx', '6');
  rect.setAttribute('fill', fill);
  const text = svgEl('text');
  text.setAttribute('x', String(KEY_W / 2));
  text.setAttribute('y', String(CHIP_H / 2 + 4));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-family', fontFamily);
  text.setAttribute('font-size', fontSize);
  text.setAttribute('fill', textFill);
  text.textContent = String(value);
  g.appendChild(rect);
  g.appendChild(text);
  return { g, rect, text, value };
}

function moveChip(chip: ChipEl, x: number, y: number, ms = MOVE_MS): Promise<void> {
  chip.g.style.transition = `transform ${ms}ms ease`;
  chip.g.setAttribute('transform', `translate(${x}, ${y})`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enterChipAt(
  chip: ChipEl,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  ms = MOVE_MS,
): Promise<void> {
  chip.g.style.transition = 'none';
  chip.g.setAttribute('transform', `translate(${fromX}, ${fromY})`);
  chip.g.style.opacity = '0';
  await raf();
  chip.g.style.transition = `transform ${ms}ms ease, opacity ${Math.min(ms, 220)}ms ease`;
  chip.g.style.opacity = '1';
  chip.g.setAttribute('transform', `translate(${toX}, ${toY})`);
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function wrapCaption(text: string, maxChars = 46): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

export type SplitWhenFullStageInstance = ViewInstance & {
  setTree(parentKeys: number[], childrenKeys: number[][]): void;
  showDescend(payload: DescendPayload): Promise<void>;
  showOverflow(payload: OverflowPayload): Promise<void>;
  showPromote(payload: PromotePayload): Promise<void>;
  showDivide(payload: DividePayload): Promise<void>;
  setCaption(text: string): void;
};

export const splitWhenFullStageView: CanvasView = {
  canvas: { height: HEIGHT },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    // 컨테이너가 아니라 캔버스 안을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로, 컨테이너를 비우면 그 캔버스가 떨어져 나가 화면이 빈다.
    params.canvas.textContent = '';
    const svg = params.canvas;
    svg.textContent = '';

    const palette: Palette = getColors(params.theme);
    const rowFill = palette.itemDefault;
    const rowInk = palette.text;

    const boxesLayer = svgEl('g');
    const chipsLayer = svgEl('g');
    const captionLayer = svgEl('g');
    svg.appendChild(boxesLayer);
    svg.appendChild(chipsLayer);
    svg.appendChild(captionLayer);

    const captionText = svgEl('text');
    captionText.setAttribute('text-anchor', 'middle');
    captionText.setAttribute('font-family', fonts.body);
    captionText.setAttribute('font-size', fontSizes.md);
    captionText.setAttribute('fill', palette.textMuted);
    captionLayer.appendChild(captionText);

    let parentBox: BoxEl | null = null;
    let childBoxes: (BoxEl | null)[] = [];
    let slotKeys: number[][] = [];
    let childCount = 0;
    const chips = new Map<number, ChipEl>();

    function chip(value: number, x: number, y: number, fill: string, ink: string): ChipEl {
      return createChip(value, x, y, fill, ink, fonts.body, fontSizes.sm);
    }

    function setChipTone(el: ChipEl, fill: string, useStateInk: boolean): void {
      el.rect.setAttribute('fill', fill);
      el.text.setAttribute('fill', useStateInk ? palette.stateInk : rowInk);
    }

    function setCaption(text: string): void {
      while (captionText.firstChild) captionText.removeChild(captionText.firstChild);
      const lines = wrapCaption(text);
      lines.forEach((line, i) => {
        const tspan = svgEl('tspan');
        tspan.setAttribute('x', String(PIECE_CANVAS_W / 2));
        tspan.setAttribute('y', String(CAPTION_Y + i * 20));
        tspan.textContent = line;
        captionText.appendChild(tspan);
      });
    }

    function setTree(parentKeys: number[], childrenKeys: number[][]): void {
      boxesLayer.textContent = '';
      chipsLayer.textContent = '';
      chips.clear();

      const pCx = PIECE_CANVAS_W / 2;
      parentBox = createBox(PARENT_Y, boxWidthFor(parentKeys.length), palette.border);
      parentBox.g.setAttribute('transform', `translate(${pCx}, 0)`);
      boxesLayer.appendChild(parentBox.g);
      const pXs = chipXs(pCx, parentKeys.length);
      parentKeys.forEach((v, i) => {
        const c = chip(v, pXs[i]!, PARENT_Y + (NODE_H - CHIP_H) / 2, rowFill, rowInk);
        chipsLayer.appendChild(c.g);
        chips.set(v, c);
      });

      childCount = childrenKeys.length;
      childBoxes = childrenKeys.map((keys, slot) => {
        const cx = colCenterX(slot, childCount);
        const box = createBox(CHILD_Y, boxWidthFor(keys.length), palette.border);
        box.g.setAttribute('transform', `translate(${cx}, 0)`);
        boxesLayer.appendChild(box.g);
        const xs = chipXs(cx, keys.length);
        keys.forEach((v, i) => {
          const c = chip(v, xs[i]!, CHILD_Y + (NODE_H - CHIP_H) / 2, rowFill, rowInk);
          chipsLayer.appendChild(c.g);
          chips.set(v, c);
        });
        return box;
      });
      slotKeys = childrenKeys.map((k) => [...k]);
    }

    async function showDescend(payload: DescendPayload): Promise<void> {
      const { childIndex, insertKey, comparedKey } = payload;
      const comparedChip = chips.get(comparedKey);
      if (comparedChip) setChipTone(comparedChip, palette.itemComparing, true);

      const targetCx = colCenterX(childIndex, childCount);
      const fromX = PIECE_CANVAS_W / 2 - KEY_W / 2;
      const fromY = 2;
      const toX = targetCx - KEY_W / 2;
      const toY = CHILD_Y - CHIP_H - 8;
      const token = chip(insertKey, fromX, fromY, palette.itemActive, palette.stateInk);
      chipsLayer.appendChild(token.g);
      chips.set(insertKey, token);
      await enterChipAt(token, fromX, fromY, toX, toY);

      if (comparedChip) setChipTone(comparedChip, rowFill, false);
    }

    async function showOverflow(payload: OverflowPayload): Promise<void> {
      const { childIndex, tempKeys } = payload;
      slotKeys[childIndex] = tempKeys;
      const cx = colCenterX(childIndex, childCount);
      const width = boxWidthFor(tempKeys.length);
      const box = childBoxes[childIndex];
      const xs = chipXs(cx, tempKeys.length);
      const moves: Promise<void>[] = [];
      if (box) {
        moves.push(moveBox(box, cx, width));
        box.rect.setAttribute('stroke', palette.danger);
      }
      tempKeys.forEach((v, i) => {
        const c = chips.get(v);
        if (c) moves.push(moveChip(c, xs[i]!, CHILD_Y + (NODE_H - CHIP_H) / 2));
      });
      await Promise.all(moves);
    }

    async function showPromote(payload: PromotePayload): Promise<void> {
      const { childIndex, middleKey, middleIndex, parentInsertIndex, parentKeysAfter } = payload;
      const middleChip = chips.get(middleKey);
      const pCx = PIECE_CANVAS_W / 2;
      const pW = boxWidthFor(parentKeysAfter.length);
      const pXs = chipXs(pCx, parentKeysAfter.length);
      const moves: Promise<void>[] = [];
      if (parentBox) moves.push(moveBox(parentBox, pCx, pW));
      parentKeysAfter.forEach((v, i) => {
        if (v === middleKey) return;
        const c = chips.get(v);
        if (c) moves.push(moveChip(c, pXs[i]!, PARENT_Y + (NODE_H - CHIP_H) / 2));
      });

      const remaining = (slotKeys[childIndex] ?? []).filter((_, i) => i !== middleIndex);
      const childBox = childBoxes[childIndex];
      const childCx = colCenterX(childIndex, childCount);
      const remW = boxWidthFor(remaining.length);
      if (childBox) {
        moves.push(moveBox(childBox, childCx, remW));
        childBox.rect.setAttribute('stroke', palette.border);
      }
      const remXs = chipXs(childCx, remaining.length);
      remaining.forEach((v, i) => {
        const c = chips.get(v);
        if (c) moves.push(moveChip(c, remXs[i]!, CHILD_Y + (NODE_H - CHIP_H) / 2));
      });
      slotKeys[childIndex] = remaining;

      if (middleChip) {
        setChipTone(middleChip, palette.itemPivot, true);
        moves.push(moveChip(middleChip, pXs[parentInsertIndex]!, PARENT_Y + (NODE_H - CHIP_H) / 2, MOVE_MS + 160));
      }
      await Promise.all(moves);
    }

    async function showDivide(payload: DividePayload): Promise<void> {
      const { childIndex, leftKeys, rightKeys } = payload;
      const oldBoxes = childBoxes;
      const newCount = oldBoxes.length + 1;
      const moves: Promise<void>[] = [];
      const newBoxes: (BoxEl | null)[] = new Array(newCount).fill(null);

      for (let slot = 0; slot < childIndex; slot += 1) {
        const box = oldBoxes[slot] ?? null;
        newBoxes[slot] = box;
        if (!box) continue;
        const cx = colCenterX(slot, newCount);
        const keys = slotKeys[slot] ?? [];
        moves.push(moveBox(box, cx, boxWidthFor(keys.length)));
        const xs = chipXs(cx, keys.length);
        keys.forEach((v, i) => {
          const c = chips.get(v);
          if (c) moves.push(moveChip(c, xs[i]!, CHILD_Y + (NODE_H - CHIP_H) / 2));
        });
      }

      const leftBox = oldBoxes[childIndex] ?? null;
      const leftCx = colCenterX(childIndex, newCount);
      if (leftBox) {
        newBoxes[childIndex] = leftBox;
        moves.push(moveBox(leftBox, leftCx, boxWidthFor(leftKeys.length)));
        const xs = chipXs(leftCx, leftKeys.length);
        leftKeys.forEach((v, i) => {
          const c = chips.get(v);
          if (c) moves.push(moveChip(c, xs[i]!, CHILD_Y + (NODE_H - CHIP_H) / 2));
        });
      }

      const rightCx = colCenterX(childIndex + 1, newCount);
      const rightBox = createBox(CHILD_Y, boxWidthFor(rightKeys.length), palette.border);
      const spawnCx = leftBox ? leftCx : rightCx;
      rightBox.g.style.transition = 'none';
      rightBox.g.setAttribute('transform', `translate(${spawnCx}, 0)`);
      rightBox.g.style.opacity = '0';
      boxesLayer.appendChild(rightBox.g);
      newBoxes[childIndex + 1] = rightBox;

      const rightXsSpawn = chipXs(spawnCx, rightKeys.length);
      const rightXsFinal = chipXs(rightCx, rightKeys.length);
      rightKeys.forEach((v, i) => {
        const c = chips.get(v);
        if (!c) return;
        c.g.style.transition = 'none';
        c.g.setAttribute('transform', `translate(${rightXsSpawn[i]}, ${CHILD_Y + (NODE_H - CHIP_H) / 2})`);
      });
      await raf();
      rightBox.g.style.transition = `transform ${MOVE_MS}ms ease, opacity ${MOVE_MS}ms ease`;
      rightBox.g.style.opacity = '1';
      rightBox.g.setAttribute('transform', `translate(${rightCx}, 0)`);
      moves.push(new Promise<void>((resolve) => setTimeout(resolve, MOVE_MS)));
      rightKeys.forEach((v, i) => {
        const c = chips.get(v);
        if (c) moves.push(moveChip(c, rightXsFinal[i]!, CHILD_Y + (NODE_H - CHIP_H) / 2));
      });

      for (let slot = childIndex + 1; slot < oldBoxes.length; slot += 1) {
        const box = oldBoxes[slot] ?? null;
        const newSlot = slot + 1;
        newBoxes[newSlot] = box;
        if (!box) continue;
        const cx = colCenterX(newSlot, newCount);
        const keys = slotKeys[slot] ?? [];
        moves.push(moveBox(box, cx, boxWidthFor(keys.length)));
        const xs = chipXs(cx, keys.length);
        keys.forEach((v, i) => {
          const c = chips.get(v);
          if (c) moves.push(moveChip(c, xs[i]!, CHILD_Y + (NODE_H - CHIP_H) / 2));
        });
      }

      childBoxes = newBoxes;
      childCount = newCount;
      const nextSlotKeys = [...slotKeys];
      nextSlotKeys.splice(childIndex, 1, leftKeys, rightKeys);
      slotKeys = nextSlotKeys;

      await Promise.all(moves);
    }

    const instance: SplitWhenFullStageInstance = {
      setTree,
      showDescend,
      showOverflow,
      showPromote,
      showDivide,
      setCaption,
      destroy() {
        svg.textContent = '';
      },
    };
    return instance;
  },
};
