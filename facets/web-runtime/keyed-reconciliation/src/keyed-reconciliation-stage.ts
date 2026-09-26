/**
 * keyed-reconciliation-stage — 실제 목록 노드가 고침 · 만듦 · 지움 · 옮김으로 움직이는 화면.
 *
 * 그리는 것:
 *   1. 옛 목록 미리보기(작은 칩, 태그 표시) — 눌린 칸이 붙은 칩에 점 표식.
 *   2. 새 목록 미리보기(작은 칩, 태그 표시).
 *   3. 실제 목록(메인) — 노드마다 물리적 정체성(`slot`)을 지키며 자리를 옮기거나 · 새로 솟거나 ·
 *      사라지거나 · 글자가 그 자리에서 바뀐다. 정체성이 유지되는 노드에는 눌린 칸 표식이 따라간다.
 *   4. 판이 끝나면(`roundEnd`) 눌린 칸이 최종적으로 어느 글자 옆에 남았는지 캡션으로 보인다.
 *
 * 메서드: roundStart(payload) · applyStep(payload, durationMs) · roundEnd() · reset() · destroy()
 */
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator, type Translate } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD_X = 16;
const CHIP_W = 30;
const CHIP_H = 22;
const CHIP_GAP = 6;
const OLD_LABEL_Y = 14;
const OLD_CHIPS_Y = 22;
const NEW_LABEL_Y = 60;
const NEW_CHIPS_Y = 68;
const MAIN_LABEL_Y = 104;
const MAIN_TOP = 116;
const ROW_H = 40;
const ROW_GAP = 6;
const ITEM_W = 170;
const CHECK_SIZE = 14;
const MAX_ROWS = 6;
const CAPTION_Y = MAIN_TOP + MAX_ROWS * ROW_H + 22;
const HEIGHT = CAPTION_Y + 22;

// 화면 문안 키(리터럴로 호출부에 직접 쓴다 — 값은 facet.ts 의 messages 에 있다. Principle 2 · C10):
//   stage.oldList · stage.newList · stage.actualList ·
//   stage.checkResultCorrect · stage.checkResultWrong · stage.checkResultGone

export type RoundStartPayload = {
  oldItems: string[];
  newItems: string[];
  oldTag: string;
  newTag: string;
  checkedItem: string;
  checkedSlot: string;
  keyModeId: string;
  changeId: string;
};

export type StepPayload =
  | { kind: 'patch'; slot: string; atIndex: number; text: string }
  | { kind: 'create'; slot: string; atIndex: number; text: string; branch?: boolean }
  | { kind: 'delete'; slots: string[]; branch?: boolean }
  | { kind: 'move'; slot: string; fromIndex: number; toIndex: number; text: string };

type Slot = {
  id: string;
  text: string;
  row: number;
  finalRow: number;
  checked: boolean;
  group: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
  checkGroup: SVGGElement;
};

function tween(
  from: number,
  to: number,
  durationMs: number,
  onFrame: (v: number) => void,
  onDone?: () => void,
): void {
  if (durationMs <= 0) {
    onFrame(to);
    onDone?.();
    return;
  }
  const start = Date.now();
  const step = (): void => {
    const t = Math.min(1, (Date.now() - start) / durationMs);
    onFrame(from + (to - from) * t);
    if (t >= 1) {
      onDone?.();
      return;
    }
    setTimeout(step, 16);
  };
  step();
}

export const keyedReconciliationStageView: CanvasView = {
  canvas: { height: HEIGHT, fit: 'stretch' },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    const svg = params.canvas;
    svg.style.overflow = 'visible';

    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', String(HEIGHT));
    bg.setAttribute('fill', colors.bg);
    svg.appendChild(bg);

    const oldLabel = document.createElementNS(SVG_NS, 'text');
    oldLabel.setAttribute('x', String(PAD_X));
    oldLabel.setAttribute('y', String(OLD_LABEL_Y));
    oldLabel.setAttribute('font-family', fonts.body);
    oldLabel.setAttribute('font-size', fontSizes.xs);
    oldLabel.setAttribute('fill', colors.textMuted);
    svg.appendChild(oldLabel);

    const newLabel = document.createElementNS(SVG_NS, 'text');
    newLabel.setAttribute('x', String(PAD_X));
    newLabel.setAttribute('y', String(NEW_LABEL_Y));
    newLabel.setAttribute('font-family', fonts.body);
    newLabel.setAttribute('font-size', fontSizes.xs);
    newLabel.setAttribute('fill', colors.textMuted);
    svg.appendChild(newLabel);

    const mainLabel = document.createElementNS(SVG_NS, 'text');
    mainLabel.setAttribute('x', String(PAD_X));
    mainLabel.setAttribute('y', String(MAIN_LABEL_Y));
    mainLabel.setAttribute('font-family', fonts.body);
    mainLabel.setAttribute('font-size', fontSizes.xs);
    mainLabel.setAttribute('fill', colors.textMuted);
    mainLabel.textContent = tr('stage.actualList', 'actual list');
    svg.appendChild(mainLabel);

    const oldChipsG = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(oldChipsG);
    const newChipsG = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(newChipsG);
    const mainG = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(mainG);

    const caption = document.createElementNS(SVG_NS, 'text');
    caption.setAttribute('x', String(PAD_X));
    caption.setAttribute('y', String(CAPTION_Y));
    caption.setAttribute('font-family', fonts.body);
    caption.setAttribute('font-size', fontSizes.sm);
    caption.setAttribute('fill', colors.text);
    svg.appendChild(caption);

    let slots: Slot[] = [];
    let keyed = false;
    let checkedItemText = '';
    let checkedSlotId = '';
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const scheduledSetTimeout = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    function clearChips(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function drawChipRow(g: SVGGElement, y: number, items: string[], markedIndex: number): void {
      clearChips(g);
      items.forEach((text, i) => {
        const x = PAD_X + i * (CHIP_W + CHIP_GAP);
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(CHIP_W));
        rect.setAttribute('height', String(CHIP_H));
        rect.setAttribute('rx', '3');
        rect.setAttribute('fill', colors.itemDefault);
        rect.setAttribute('stroke', colors.border);
        g.appendChild(rect);
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(x + CHIP_W / 2));
        label.setAttribute('y', String(y + CHIP_H / 2 + 4));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-family', fonts.mono);
        label.setAttribute('font-size', fontSizes.sm);
        label.setAttribute('fill', colors.text);
        label.textContent = text;
        g.appendChild(label);
        if (i === markedIndex) {
          const dot = document.createElementNS(SVG_NS, 'rect');
          dot.setAttribute('x', String(x + CHIP_W - 8));
          dot.setAttribute('y', String(y - 4));
          dot.setAttribute('width', '6');
          dot.setAttribute('height', '6');
          dot.setAttribute('rx', '1');
          dot.setAttribute('fill', colors.accent);
          g.appendChild(dot);
        }
      });
    }

    function rowY(row: number): number {
      return MAIN_TOP + row * ROW_H;
    }

    function setCheckVisible(slot: Slot, on: boolean): void {
      slot.checkGroup.setAttribute('opacity', on ? '1' : '0');
    }

    function makeSlot(id: string, text: string, row: number, finalRow: number, checked: boolean): Slot {
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('transform', `translate(0, ${rowY(row)})`);
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(PAD_X));
      rect.setAttribute('width', String(ITEM_W));
      rect.setAttribute('height', String(ROW_H - ROW_GAP));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', colors.itemDefault);
      rect.setAttribute('stroke', colors.border);
      group.appendChild(rect);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(PAD_X + 12));
      label.setAttribute('y', String((ROW_H - ROW_GAP) / 2 + 5));
      label.setAttribute('font-family', fonts.mono);
      label.setAttribute('font-size', fontSizes.md);
      label.setAttribute('fill', colors.text);
      label.textContent = text;
      group.appendChild(label);
      const checkGroup = document.createElementNS(SVG_NS, 'g');
      checkGroup.setAttribute('opacity', checked ? '1' : '0');
      const checkBox = document.createElementNS(SVG_NS, 'rect');
      checkBox.setAttribute('x', String(PAD_X + ITEM_W - CHECK_SIZE - 10));
      checkBox.setAttribute('y', String((ROW_H - ROW_GAP) / 2 - CHECK_SIZE / 2));
      checkBox.setAttribute('width', String(CHECK_SIZE));
      checkBox.setAttribute('height', String(CHECK_SIZE));
      checkBox.setAttribute('rx', '2');
      checkBox.setAttribute('fill', 'none');
      checkBox.setAttribute('stroke', colors.primary);
      checkGroup.appendChild(checkBox);
      const mark = document.createElementNS(SVG_NS, 'path');
      const cx = PAD_X + ITEM_W - CHECK_SIZE - 10;
      const cy = (ROW_H - ROW_GAP) / 2 - CHECK_SIZE / 2;
      mark.setAttribute(
        'd',
        `M ${cx + 3} ${cy + 7} L ${cx + 6} ${cy + 10} L ${cx + 11} ${cy + 3}`,
      );
      mark.setAttribute('fill', 'none');
      mark.setAttribute('stroke', colors.primary);
      mark.setAttribute('stroke-width', '2');
      checkGroup.appendChild(mark);
      group.appendChild(checkGroup);
      mainG.appendChild(group);
      return { id, text, row, finalRow, checked, group, rect, label, checkGroup };
    }

    function removeSlot(slot: Slot): void {
      slots = slots.filter((s) => s.id !== slot.id);
      if (slot.group.parentElement) slot.group.remove();
    }

    function findSlot(id: string): Slot | undefined {
      return slots.find((s) => s.id === id);
    }

    function finalRowOf(id: string, sameTag: boolean, newItems: string[]): number {
      if (!sameTag) return -1;
      if (keyed) {
        const text = id.slice(2);
        return newItems.indexOf(text);
      }
      const i = Number(id.slice(2));
      return i < newItems.length ? i : -1;
    }

    function moveSlotTo(slot: Slot, row: number, durationMs: number): void {
      if (slot.row === row) return;
      const fromY = rowY(slot.row);
      const toY = rowY(row);
      slot.row = row;
      tween(fromY, toY, durationMs, (y) => {
        slot.group.setAttribute('transform', `translate(0, ${y})`);
      });
    }

    /** 이번 걸음이 직접 건드리지 않은 살아있는 슬롯 중 finalRow 와 어긋난 것을 조용히 맞춘다. */
    function settleOthers(exceptIds: Set<string>, durationMs: number): void {
      for (const slot of slots) {
        if (exceptIds.has(slot.id)) continue;
        if (slot.finalRow >= 0 && slot.row !== slot.finalRow) moveSlotTo(slot, slot.finalRow, durationMs);
      }
    }

    function roundStart(payload: RoundStartPayload): void {
      clearChips(oldChipsG);
      clearChips(newChipsG);
      while (mainG.firstChild) mainG.removeChild(mainG.firstChild);
      slots = [];
      caption.textContent = '';

      oldLabel.textContent = `${tr('stage.oldList', 'old list')} <${payload.oldTag}>`;
      newLabel.textContent = `${tr('stage.newList', 'new list')} <${payload.newTag}>`;

      const sameTag = payload.oldTag === payload.newTag;
      keyed = sameTag && payload.keyModeId === 'id';
      checkedItemText = payload.checkedItem;
      checkedSlotId = payload.checkedSlot;

      const oldMarked = payload.oldItems.indexOf(payload.checkedItem);
      drawChipRow(oldChipsG, OLD_CHIPS_Y, payload.oldItems, oldMarked);
      drawChipRow(newChipsG, NEW_CHIPS_Y, payload.newItems, -1);

      payload.oldItems.forEach((text, i) => {
        const id = keyed ? `k:${text}` : `p:${i}`;
        const finalRow = finalRowOf(id, sameTag, payload.newItems);
        const checked = id === payload.checkedSlot;
        const slot = makeSlot(id, text, i, finalRow, checked);
        slots.push(slot);
      });
    }

    function applyStep(payload: StepPayload, durationMs: number): void {
      if (payload.kind === 'patch') {
        const slot = findSlot(payload.slot);
        if (!slot) throw new Error(`patch — 슬롯을 찾지 못했다: ${payload.slot}`);
        slot.text = payload.text;
        slot.label.textContent = payload.text;
        slot.rect.setAttribute('fill', colors.itemComparing);
        scheduledSetTimeout(() => slot.rect.setAttribute('fill', colors.itemDefault), durationMs);
        settleOthers(new Set([slot.id]), durationMs);
        return;
      }
      if (payload.kind === 'create') {
        const finalRow = payload.atIndex;
        const slot = makeSlot(payload.slot, payload.text, finalRow, finalRow, false);
        slot.rect.setAttribute('fill', colors.itemPivot);
        slots.push(slot);
        const startY = payload.branch ? rowY(finalRow) : rowY(finalRow) + ROW_H * 0.6;
        slot.group.setAttribute('transform', `translate(0, ${startY})`);
        slot.group.setAttribute('opacity', '0');
        tween(0, 1, durationMs, (v) => {
          const y = startY + (rowY(finalRow) - startY) * v;
          slot.group.setAttribute('transform', `translate(0, ${y})`);
          slot.group.setAttribute('opacity', String(v));
        }, () => slot.rect.setAttribute('fill', colors.itemDefault));
        settleOthers(new Set([slot.id]), durationMs);
        return;
      }
      if (payload.kind === 'delete') {
        const removed = payload.slots.map((id) => findSlot(id)).filter((s): s is Slot => s !== undefined);
        for (const slot of removed) {
          slot.rect.setAttribute('fill', colors.danger);
          tween(1, 0, durationMs, (v) => {
            slot.group.setAttribute('opacity', String(v));
            slot.group.setAttribute('transform', `translate(0, ${rowY(slot.row)}) scale(${0.6 + 0.4 * v})`);
          }, () => removeSlot(slot));
        }
        settleOthers(new Set(removed.map((s) => s.id)), durationMs);
        return;
      }
      // move
      const slot = findSlot(payload.slot);
      if (!slot) throw new Error(`move — 슬롯을 찾지 못했다: ${payload.slot}`);
      slot.rect.setAttribute('fill', colors.itemSwapping);
      moveSlotTo(slot, payload.toIndex, durationMs);
      scheduledSetTimeout(() => slot.rect.setAttribute('fill', colors.itemDefault), durationMs);
      settleOthers(new Set([slot.id]), durationMs);
    }

    function roundEnd(): void {
      const slot = findSlot(checkedSlotId);
      if (!slot) {
        caption.textContent = tr('stage.checkResultGone', 'checked mark disappeared with the removed node');
        return;
      }
      setCheckVisible(slot, true);
      const nextTo = slot.text;
      if (nextTo === checkedItemText) {
        caption.textContent = tr('stage.checkResultCorrect', 'checked mark stayed with "{item}"', { item: checkedItemText });
      } else {
        caption.textContent = tr('stage.checkResultWrong', 'checked mark ended up next to "{next}", not "{item}"', {
          next: nextTo,
          item: checkedItemText,
        });
      }
    }

    function reset(): void {
      clearChips(oldChipsG);
      clearChips(newChipsG);
      while (mainG.firstChild) mainG.removeChild(mainG.firstChild);
      slots = [];
      caption.textContent = '';
      oldLabel.textContent = '';
      newLabel.textContent = '';
    }

    return {
      destroy() {
        for (const id of timers) clearTimeout(id);
        timers.clear();
      },
      roundStart,
      applyStep,
      roundEnd,
      reset,
    };
  },
};
