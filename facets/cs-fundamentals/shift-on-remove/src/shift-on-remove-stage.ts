/**
 * shift-on-remove-stage — 삭제 이동 조각(piece)의 전용 무대.
 *
 * 이 그림의 전제는 하나다: **칸은 고정된 자리이고 값만 움직인다.** 그래서 칸
 * (rect) 은 한 번 그린 뒤 끝까지 자리를 바꾸지 않고, 값(chip) 만 transform 으로
 * 옮긴다. 값이 빠진 칸은 점선이 되고, 그 점선 칸이 당김을 따라 오른쪽으로
 * 한 칸씩 걸어간다 — 값은 왼쪽으로, 빈 자리는 오른쪽으로 간다는 것이 이
 * 알고리즘의 전부라서 두 방향이 한 화면에 같이 보여야 한다.
 *
 * 마지막에 아래의 구간 표시가 한 칸만큼 줄어든다. 칸이 사라지는 것이 아니라
 * 쓰이는 범위가 줄어드는 것이므로, 칸은 그대로 두고 표시를 줄인다.
 *
 * 화면 문자는 이 파일에 하나도 없다. 캡션·각주·라벨은 전부 projector 가
 * 넘겨 준다 — 문안은 `facet.ts` 의 `messages` 에 있다 (C10). 칸 번호와 값은
 * 숫자 표식이라 문안이 아니다.
 */

import {
  getColors,
  fonts,
  fontSizes,
  radii,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 세로는 내용이 정한다. 캡션 한 줄 / 칸 한 줄 / 칸 번호 / 구간 표시 / 각주.
const CANVAS_H = 246;
const CAPTION_Y = 26;
const ROW_Y = 82;
const SLOT_H = 60;
const SLOT_GAP = 14;
const SLOT_MAX_W = 96;
const SIDE_MIN_PAD = 24;
const CHIP_INSET = 8;
const INDEX_Y = ROW_Y + SLOT_H + 20;
const BRACKET_Y = 186;
const BRACKET_LABEL_Y = BRACKET_Y + 18;
const NOTE_Y = 228;
const TICK_W = 2;
const TICK_H = 7;
const TICK_RISE = 5;

/** 값이 배열 밖으로 빠져나갈 때 떠오르는 높이. */
const LIFT_DY = 44;
/** 한 칸 옮김에 걸리는 시간. 걸음 사이 간격(stepMs) 은 저작 선언이 따로 정한다. */
const MOVE_MS = 420;
const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const DASH = '5 4';
/** 더 쓰이지 않는 칸이 뒤로 물러나는 정도. */
const RETIRED_OPACITY = '0.55';

type SlotState = 'filled' | 'empty' | 'retired';

/** projector 가 넘겨 주는 붙박이 문안. */
export type ShiftOnRemoveStageText = {
  /** 전제를 밝히는 각주. */
  /** 더 쓰이지 않는 꼬리 칸에 붙는 표시. */
  unused: string;
};

type Chip = { g: SVGGElement; rect: SVGRectElement };

/** 애니메이션 대기 하나. destroy 가 걷어 갈 수 있게 타이머와 해제기를 같이 든다. */
type Waiter = { id: ReturnType<typeof setTimeout> | null; done: () => void };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export const shiftOnRemoveStageView: CanvasView = {
  canvas: { height: CANVAS_H },
  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const c = getColors(params.theme);
    const rx = Number.parseInt(radii.md, 10);

    const svg = params.canvas;

    const slotsLayer = el('g', {});
    const bracketLayer = el('g', {});
    const chipsLayer = el('g', {});

    const caption = el('text', {
      x: 0,
      y: CAPTION_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    const note = el('text', {
      x: 0,
      y: NOTE_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });

    // 쓰이는 구간 표시. 줄어드는 것을 transform 만으로 그리려고 막대 / 양 끝
    // 눈금 / 라벨을 따로 둔다 (막대는 scaleX, 오른쪽 눈금과 라벨은 translate).
    const bar = el('rect', { x: 0, y: BRACKET_Y, width: 0, height: 2, fill: c.text });
    const tickL = el('rect', { x: 0, y: BRACKET_Y - TICK_RISE, width: TICK_W, height: TICK_H, fill: c.text });
    const tickR = el('rect', { x: 0, y: BRACKET_Y - TICK_RISE, width: TICK_W, height: TICK_H, fill: c.text });
    const usedLabel = el('text', {
      x: 0,
      y: BRACKET_LABEL_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    bar.style.setProperty('transform-box', 'view-box');
    bracketLayer.append(bar, tickL, tickR, usedLabel);

    svg.append(slotsLayer, bracketLayer, chipsLayer, caption, note);

    let slots: SVGRectElement[] = [];
    let indexLabels: SVGTextElement[] = [];
    let unusedTags: SVGTextElement[] = [];
    let chips: (Chip | null)[] = [];
    let slotW = SLOT_MAX_W;
    let originX = 0;
    let fullW = 0;
    let unusedText = '';

    const slotX = (i: number): number => originX + i * (slotW + SLOT_GAP);
    const chipY = ROW_Y + CHIP_INSET;
    const chipH = SLOT_H - CHIP_INSET * 2;
    const spanW = (n: number): number => (n <= 0 ? 0 : n * slotW + (n - 1) * SLOT_GAP);

    // 애니메이션 대기. destroy 로 끊겨도 반드시 풀린다 — 여기서 매달리면
    // projector 가 돌려준 약속이 영영 안 끝나 알고리즘이 멈춘다.
    let disposed = false;
    const waiters = new Set<Waiter>();
    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (disposed) {
          resolve();
          return;
        }
        const entry: Waiter = { id: null, done: resolve };
        entry.id = setTimeout(() => {
          waiters.delete(entry);
          resolve();
        }, ms);
        waiters.add(entry);
      });

    const paintSlot = (i: number, state: SlotState): void => {
      const rect = slots[i];
      const label = indexLabels[i];
      if (!rect || !label) return;
      rect.style.fill = state === 'filled' ? c.bg : c.bgSubtle;
      rect.style.stroke = state === 'filled' ? c.border : c.ghostOutline;
      rect.style.strokeDasharray = state === 'filled' ? 'none' : DASH;
      rect.style.opacity = state === 'retired' ? RETIRED_OPACITY : '1';
      label.style.fill = state === 'retired' ? c.ghostOutline : c.textMuted;
    };

    const place = (chip: Chip, x: number, y: number): void => {
      chip.g.style.transform = `translate(${x}px, ${y}px)`;
    };

    return {
      /** 처음 상태를 즉시 놓는다 (애니메이션 없음). rewind / reset 이 다시 부른다. */
      init(values: number[], usedText: string, text: ShiftOnRemoveStageText): void {
        slotsLayer.replaceChildren();
        chipsLayer.replaceChildren();
        slots = [];
        indexLabels = [];
        unusedTags = [];
        chips = [];
        unusedText = text.unused;
        caption.textContent = '';

        const n = values.length;
        if (n === 0) return;

        slotW = Math.min(
          SLOT_MAX_W,
          Math.floor((PIECE_CANVAS_W - SIDE_MIN_PAD * 2 - (n - 1) * SLOT_GAP) / n),
        );
        fullW = spanW(n);
        originX = Math.round((PIECE_CANVAS_W - fullW) / 2);
        const chipW = slotW - CHIP_INSET * 2;

        caption.setAttribute('x', String(originX));
        note.setAttribute('x', String(originX));

        for (let i = 0; i < n; i += 1) {
          const rect = el('rect', { x: slotX(i), y: ROW_Y, width: slotW, height: SLOT_H, rx });
          const label = el('text', {
            x: slotX(i) + slotW / 2,
            y: INDEX_Y,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          });
          label.textContent = String(i);
          const tag = el('text', {
            x: slotX(i) + slotW / 2,
            y: ROW_Y + SLOT_H / 2 + 4,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          });
          tag.style.opacity = '0';
          tag.style.transition = `opacity ${MOVE_MS}ms ease`;
          slotsLayer.append(rect, label, tag);
          slots.push(rect);
          indexLabels.push(label);
          unusedTags.push(tag);
          paintSlot(i, 'filled');

          const g = el('g', {});
          const chipRect = el('rect', { x: 0, y: 0, width: chipW, height: chipH, rx });
          chipRect.style.fill = c.itemDefault;
          chipRect.style.stroke = c.border;
          chipRect.style.transition = `fill ${MOVE_MS}ms ease`;
          const chipText = el('text', {
            x: chipW / 2,
            y: chipH / 2 + 6,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            fill: c.text,
          });
          chipText.textContent = String(values[i]);
          g.append(chipRect, chipText);
          g.style.transition = 'none';
          g.style.opacity = '1';
          chipsLayer.appendChild(g);
          const chip = { g, rect: chipRect };
          place(chip, slotX(i) + CHIP_INSET, chipY);
          chips.push(chip);
        }

        bar.setAttribute('x', String(originX));
        bar.setAttribute('width', String(fullW));
        bar.style.setProperty('transform-origin', `${originX}px ${BRACKET_Y}px`);
        bar.style.transition = 'none';
        bar.style.transform = 'scaleX(1)';
        tickL.setAttribute('x', String(originX));
        tickR.setAttribute('x', String(originX + fullW - TICK_W));
        tickR.style.transition = 'none';
        tickR.style.transform = 'translate(0px, 0px)';
        usedLabel.setAttribute('x', String(originX + fullW / 2));
        usedLabel.style.transition = 'none';
        usedLabel.style.transform = 'translate(0px, 0px)';
        usedLabel.textContent = usedText;

        // 다음 걸음의 애니메이션이 방금 놓은 자리에서 출발하도록 스타일을 확정한다.
        container.getBoundingClientRect();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 그 칸의 값이 배열 밖으로 빠져나간다. 자리는 그 순간부터 점선으로 빈다. */
      async lift(index: number): Promise<void> {
        const chip = chips[index];
        paintSlot(index, 'empty');
        if (!chip) return;
        chips[index] = null;
        chip.rect.style.fill = c.itemActive;
        chip.g.style.transition = `transform ${MOVE_MS}ms ${EASE}, opacity ${MOVE_MS}ms ease`;
        place(chip, slotX(index) + CHIP_INSET, chipY - LIFT_DY);
        chip.g.style.opacity = '0';
        await wait(MOVE_MS);
        chip.g.remove();
      },

      /**
       * 뒤의 값이 빈 자리로 한 칸 옮겨 온다.
       *
       * 떠나는 칸은 출발과 동시에 비고, 도착 칸은 값이 다 온 뒤에 닫힌다.
       * 그 사이 잠깐 빈 칸이 둘로 보이는데, 값이 실제로 공중에 있는 동안이라
       * 그것이 사실이다.
       */
      async pull(from: number, to: number): Promise<void> {
        const chip = chips[from];
        if (!chip) return;
        chips[from] = null;
        chips[to] = chip;
        paintSlot(from, 'empty');
        chip.rect.style.fill = c.itemSwapping;
        chip.g.style.transition = `transform ${MOVE_MS}ms ${EASE}`;
        place(chip, slotX(to) + CHIP_INSET, chipY);
        await wait(MOVE_MS);
        paintSlot(to, 'filled');
        chip.rect.style.fill = c.itemDefault;
      },

      /** 쓰이는 구간이 줄어든다. 칸은 그대로 남고 범위만 당겨진다. */
      async settle(usedLength: number, usedText: string): Promise<void> {
        const usedW = spanW(usedLength);
        const dx = usedW - fullW;
        const move = `transform ${MOVE_MS}ms ${EASE}`;
        bar.style.transition = move;
        bar.style.transform = `scaleX(${fullW === 0 ? 1 : usedW / fullW})`;
        tickR.style.transition = move;
        tickR.style.transform = `translate(${dx}px, 0px)`;
        usedLabel.style.transition = move;
        usedLabel.style.transform = `translate(${dx / 2}px, 0px)`;
        usedLabel.textContent = usedText;
        for (let i = usedLength; i < slots.length; i += 1) {
          paintSlot(i, 'retired');
          const tag = unusedTags[i];
          if (!tag) continue;
          tag.textContent = unusedText;
          tag.style.opacity = '1';
        }
        await wait(MOVE_MS);
      },

      destroy(): void {
        disposed = true;
        for (const entry of waiters) {
          if (entry.id !== null) clearTimeout(entry.id);
          entry.done();
        }
        waiters.clear();
        svg.remove();
      },
    };
  },
};
