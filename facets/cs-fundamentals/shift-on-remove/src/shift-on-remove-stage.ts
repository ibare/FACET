/**
 * shift-on-remove-stage — 삭제 이동 조각(piece)의 전용 무대.
 *
 * 이 그림의 전제는 하나다: **칸은 고정된 자리이고 값만 움직인다.** 그래서 칸
 * (rect) 은 늘 같은 자리에 서고, 값(chip) 만 옮겨 다닌다. 값이 빠진 칸은 점선이
 * 되고, 그 점선 칸이 당김을 따라 오른쪽으로 한 칸씩 걸어간다 — 값은 왼쪽으로,
 * 빈 자리는 오른쪽으로 간다는 것이 이 알고리즘의 전부라서 두 방향이 한 화면에
 * 같이 보여야 한다.
 *
 * 마지막에 아래의 구간 표시가 한 칸만큼 줄어든다. 칸이 사라지는 것이 아니라
 * 쓰이는 범위가 줄어드는 것이므로, 칸은 그대로 두고 표시를 줄인다.
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 그 다음에 방금 달라진 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 없고, 되짚기가 앞으로 가기와 같은 길을 탄다.
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 값은 이미 끝 자리에 서 있고,
 * 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다.
 *
 * 화면 문자는 캡션·라벨뿐이고 전부 `params.t` 로 만든다 — 문안은 `facet.ts` 의
 * `messages` 에 있다 (C10). 칸 번호와 값은 숫자 표식이라 문안이 아니다.
 */

import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  radii,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { ShiftCaption, ShiftOnRemoveScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 세로는 내용이 정한다. 캡션 한 줄 / 칸 한 줄 / 칸 번호 / 구간 표시.
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
const TICK_W = 2;
const TICK_H = 7;
const TICK_RISE = 5;

/** 값이 배열 밖으로 빠져나갈 때 떠오르는 높이. */
const LIFT_DY = 44;
/** 한 칸 옮김에 걸리는 시간. 걸음 사이 간격(stepMs) 은 저작 선언이 따로 정한다. */
const MOVE_MS = 420;
const DASH = '5 4';
/** 더 쓰이지 않는 칸이 뒤로 물러나는 정도. */
const RETIRED_OPACITY = '0.55';

type SlotState = 'filled' | 'empty' | 'retired';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

const ease = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

export const shiftOnRemoveStageView: CanvasView = {
  canvas: { height: CANVAS_H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const c = getColors(params.theme);
    const rx = Number.parseInt(radii.md, 10);

    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

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

    // 쓰이는 구간 표시. 막대 / 양 끝 눈금 / 라벨을 따로 둔다 — 줄어드는 운동은
    // 막대의 폭과 오른쪽 눈금의 자리로 나타난다.
    const bar = el('rect', { x: 0, y: BRACKET_Y, width: 0, height: 2, fill: c.text });
    const tickL = el('rect', {
      x: 0,
      y: BRACKET_Y - TICK_RISE,
      width: TICK_W,
      height: TICK_H,
      fill: c.text,
    });
    const tickR = el('rect', {
      x: 0,
      y: BRACKET_Y - TICK_RISE,
      width: TICK_W,
      height: TICK_H,
      fill: c.text,
    });
    const usedLabel = el('text', {
      x: 0,
      y: BRACKET_LABEL_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    bracketLayer.append(bar, tickL, tickR, usedLabel);

    svg.append(slotsLayer, bracketLayer, chipsLayer, caption);

    // ── 그림의 기하. 칸 수에서 역산하므로 장면이 정하고 상수는 상한만 준다 (S-piece).
    let slotW = SLOT_MAX_W;
    let originX = 0;
    let chipW = 0;

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let slotRects: SVGRectElement[] = [];
    let indexLabels: SVGTextElement[] = [];
    let unusedTags: SVGTextElement[] = [];
    let chipNodes: (SVGGElement | null)[] = [];

    const chipY = ROW_Y + CHIP_INSET;
    const chipH = SLOT_H - CHIP_INSET * 2;
    const spanW = (n: number): number => (n <= 0 ? 0 : n * slotW + (n - 1) * SLOT_GAP);
    const slotX = (i: number): number => originX + i * (slotW + SLOT_GAP);
    const place = (g: SVGGElement, x: number, y: number): void => {
      g.style.transform = `translate(${x}px, ${y}px)`;
    };

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 되짚는 중인가. 러너가 `params` 로 흘린다 (`ViewMountParams.isInstant`).
     *
     * 이 무대의 운동은 값의 가로 좌표를 프레임마다 제자리에서 고쳐 쓴다. 되짚기가
     * 화면을 새로 세운 뒤에도 앞 걸음의 운동이 살아 있으면 새 값에 옛 좌표를
     * 덮어쓴다 — 되짚은 직후가 아니라 반 초쯤 뒤에 무너지므로 늦게야 잡힌다.
     */
    const isInstant = params.isInstant ?? ((): boolean => false);
    // 되짚기 직전에 걸어 둔 것을 거둔다 (destroy 와 같은 모양, 화면은 그대로).
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    /**
     * 한 걸음을 흐르게 한다.
     *
     * 끝에서 `draw(1)` 을 한 번 더 부른다 — 중간에 끊겨도 끝 자리에 서므로, 흐른
     * 화면과 곧바로 세운 화면이 갈리지 않는다.
     */
    function animate(ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || isInstant()) {
          draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          draw(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
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

    /** 칸 수에서 칸 폭과 왼쪽 시작점을 역산한다. 남는 폭을 버리지 않는다 (S-piece). */
    function layout(n: number): void {
      slotW =
        n <= 0
          ? SLOT_MAX_W
          : Math.min(
              SLOT_MAX_W,
              Math.floor((PIECE_CANVAS_W - SIDE_MIN_PAD * 2 - (n - 1) * SLOT_GAP) / n),
            );
      originX = Math.round((PIECE_CANVAS_W - spanW(n)) / 2);
      chipW = slotW - CHIP_INSET * 2;
    }

    /** 장면이 정하는 칸의 형편. 더 쓰지 않는 칸이 우선이고, 그 앞은 값의 유무다. */
    function stateOf(s: ShiftOnRemoveScene, i: number): SlotState {
      if (i >= s.usedLength) return 'retired';
      return s.slots[i] === null || s.slots[i] === undefined ? 'empty' : 'filled';
    }

    function paintSlot(i: number, state: SlotState): void {
      const rect = slotRects[i];
      const label = indexLabels[i];
      if (!rect || !label) return;
      rect.style.fill = state === 'filled' ? c.bg : c.bgSubtle;
      rect.style.stroke = state === 'filled' ? c.border : c.ghostOutline;
      rect.style.strokeDasharray = state === 'filled' ? 'none' : DASH;
      rect.style.opacity = state === 'retired' ? RETIRED_OPACITY : '1';
      label.style.fill = state === 'retired' ? c.ghostOutline : c.textMuted;
    }

    /** 값 하나를 담은 조각. 자리는 부르는 쪽이 정한다. */
    function makeChip(value: number, fill: string): SVGGElement {
      const g = el('g', {});
      const rect = el('rect', { x: 0, y: 0, width: chipW, height: chipH, rx });
      rect.style.fill = fill;
      rect.style.stroke = c.border;
      const text = el('text', {
        x: chipW / 2,
        y: chipH / 2 + 6,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: c.text,
      });
      text.textContent = String(value);
      g.append(rect, text);
      return g;
    }

    /** 조각의 바탕색만 갈아 준다. 옮기는 동안만 다른 색을 입힌다. */
    function tintChip(g: SVGGElement, fill: string): void {
      const rect = g.firstChild;
      if (rect instanceof SVGRectElement) rect.style.fill = fill;
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      slotsLayer.replaceChildren();
      chipsLayer.replaceChildren();
      slotRects = [];
      indexLabels = [];
      unusedTags = [];
      chipNodes = [];
      caption.textContent = '';
    }

    /** 쓰이는 구간 표시를 그 길이대로 세운다. */
    function drawBracket(usedLength: number): void {
      const w = spanW(usedLength);
      bar.setAttribute('x', String(originX));
      bar.setAttribute('width', String(Math.max(0, w)));
      tickL.setAttribute('x', String(originX));
      tickR.setAttribute('x', String(originX + w - TICK_W));
      usedLabel.setAttribute('x', String(originX + w / 2));
      usedLabel.textContent = t('label.used', 'in use: {n}', { n: usedLength });
    }

    /** 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece). */
    function drawStatic(s: ShiftOnRemoveScene): void {
      const n = s.slots.length;
      layout(n);
      caption.setAttribute('x', String(originX));
      drawBracket(s.usedLength);
      if (n === 0) return;

      const unusedText = t('label.unused', 'unused');
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
        // 더 쓰지 않는 칸에만 붙는 표시. 남는 강조라 정적으로도 그린다 (S-scene).
        tag.textContent = unusedText;
        tag.style.opacity = i >= s.usedLength ? '1' : '0';
        slotsLayer.append(rect, label, tag);
        slotRects.push(rect);
        indexLabels.push(label);
        unusedTags.push(tag);
        paintSlot(i, stateOf(s, i));

        const value = s.slots[i];
        if (value === null || value === undefined) {
          chipNodes.push(null);
          continue;
        }
        const chip = makeChip(value, c.itemDefault);
        chipsLayer.appendChild(chip);
        place(chip, slotX(i) + CHIP_INSET, chipY);
        chipNodes.push(chip);
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: ShiftCaption | null): void {
      if (!cap) {
        caption.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'intact':
          caption.textContent = t(
            'caption.intact',
            'An array holds its values in a row with no gaps.',
          );
          return;
        case 'remove':
          caption.textContent = t('caption.remove', 'Remove index {index}. That slot is now empty.', {
            index: cap.index,
          });
          return;
        case 'pull':
          caption.textContent = t(
            'caption.pull',
            'Pull from the front, or a value would be overwritten.',
          );
          return;
        case 'result':
          caption.textContent = t(
            'caption.result',
            '{moved} values shifted one slot left. The tail slot is no longer used.',
            { moved: cap.moved },
          );
          return;
      }
    }

    // ── 걸음 함수 셋. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 되돌려 놓고 시작한다.

    /**
     * 그 칸의 값이 배열 밖으로 빠져나간다.
     *
     * 정적 그림에는 이미 그 값이 없다. 떠나는 몸짓을 보이려 임시 조각 하나를 세웠다가
     * 끝에서 거둔다 — 끝난 뒤의 DOM 은 곧바로 세운 화면과 같다.
     */
    function liftOut(index: number, value: number, withAnim: boolean): Promise<void> {
      if (!withAnim) return Promise.resolve();
      const g = makeChip(value, c.itemActive);
      chipsLayer.appendChild(g);
      const x = slotX(index) + CHIP_INSET;
      return animate(MOVE_MS, (p) => {
        place(g, x, chipY - LIFT_DY * p);
        g.style.opacity = String(1 - p);
      }).then(() => {
        g.remove();
      });
    }

    /**
     * 뒤의 값이 빈 자리로 한 칸 옮겨 온다.
     *
     * 도착 칸은 값이 다 온 뒤에 닫힌다. 그 사이 잠깐 빈 칸이 둘로 보이는데, 값이
     * 실제로 공중에 있는 동안이라 그것이 사실이다.
     */
    function slideIn(
      s: ShiftOnRemoveScene,
      from: number,
      to: number,
      withAnim: boolean,
    ): Promise<void> {
      const g = chipNodes[to];
      if (!withAnim || !g) return Promise.resolve();
      const x0 = slotX(from) + CHIP_INSET;
      const x1 = slotX(to) + CHIP_INSET;
      paintSlot(to, 'empty');
      tintChip(g, c.itemSwapping);
      return animate(MOVE_MS, (p) => {
        place(g, x0 + (x1 - x0) * p, chipY);
      }).then(() => {
        paintSlot(to, stateOf(s, to));
        tintChip(g, c.itemDefault);
      });
    }

    /** 쓰이는 구간이 줄어든다. 칸은 그대로 남고 범위만 당겨진다. */
    function settleBracket(
      fromUsed: number,
      toUsed: number,
      total: number,
      withAnim: boolean,
    ): Promise<void> {
      if (!withAnim) return Promise.resolve();
      const w0 = spanW(fromUsed);
      const w1 = spanW(toUsed);
      const retiring: SVGRectElement[] = [];
      for (let i = toUsed; i < total; i += 1) {
        const rect = slotRects[i];
        if (rect) retiring.push(rect);
      }
      const tags = unusedTags.slice(toUsed, total);
      return animate(MOVE_MS, (p) => {
        const w = w0 + (w1 - w0) * p;
        bar.setAttribute('width', String(Math.max(0, w)));
        tickR.setAttribute('x', String(originX + w - TICK_W));
        usedLabel.setAttribute('x', String(originX + w / 2));
        for (const tag of tags) tag.style.opacity = String(p);
        for (const rect of retiring) {
          rect.style.opacity = String(1 - (1 - Number(RETIRED_OPACITY)) * p);
        }
      }).then(() => {
        // 끝 값은 정적 그리기와 **같은 문자열**로 놓는다. 흐른 화면과 곧바로 세운
        // 화면이 속성 하나만큼 갈리면 되짚기 판정이 어긋난다 (S-scene).
        drawBracket(toUsed);
        for (const tag of tags) tag.style.opacity = '1';
        for (const rect of retiring) rect.style.opacity = RETIRED_OPACITY;
      });
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 하나만 흐르게 한다.
     * `prev` 는 **무엇을 흐르게 할지 고르는 데만** 쓴다 (S-scene).
     */
    async function render(
      next: ShiftOnRemoveScene,
      prev: ShiftOnRemoveScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      rewind();
      drawStatic(next);
      drawCaption(next.caption);

      if (!opts.animate) return;

      const step = next.step;
      // 캡션만 바뀐 걸음이면 흐르게 할 것이 없다. 걸음을 건너뛰어 온 경우는 갈래마다
      // `prev` 를 견주어 (그 칸에 그 값이 있었나) 걸러 낸다 — `step` 은 걸음마다 새로
      // 짓는 객체라 그것끼리 견주는 것으로는 아무것도 가려지지 않는다.
      if (!step || !prev || prev === next) return;

      switch (step.kind) {
        case 'remove':
          if (prev.slots[step.index] === step.value) {
            await liftOut(step.index, step.value, true);
          }
          return;
        case 'pull':
          if (
            prev.slots[step.to] === null &&
            prev.slots[step.from] !== null &&
            prev.slots[step.from] === next.slots[step.to]
          ) {
            await slideIn(next, step.from, step.to, true);
          }
          return;
        case 'settle':
          if (step.from > next.usedLength) {
            await settleBracket(step.from, next.usedLength, next.slots.length, true);
          }
          return;
      }
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.remove();
      },
    };
  },
};
