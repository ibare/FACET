/**
 * pigeonhole-stage View — 비둘기집 충돌 단일 캔버스.
 *
 * 화면 구성 (위에서 아래로):
 *   - 캡션 (주장 한 줄 + 결과 한 줄)
 *   - 대기 중인 입력 칩들. 마지막 하나는 자리 수보다 하나 많은 그 입력이다
 *   - 자리 N칸. 입력이 들어가면 칸 안에 그 문자열이 앉는다
 *   - 각주 두 줄 — 자리를 줄여 보인다는 축척, 그리고 이 배치가 실제가 아니라
 *     가장 고르게 나눈 최선의 경우라는 사실. 둘 다 밝히지 않으면 학습자가
 *     "해시가 이렇게 골고루 퍼진다" 로 읽는다
 *
 * 자리를 실제로 다 채운 다음에 하나를 더 넣는 순서가 곧 논증이다. 채우기를
 * 건너뛰고 충돌만 보이면 "겹칠 수도 있다" 가 되지, "겹칠 수밖에 없다" 가 되지 않는다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 찬 자리 / 놓인 입력 — palette.textMuted
 *   - 빈 자리 — palette.bgSubtle
 *   - 넘치는 입력과 그 자리 — palette.accent (사건 강조)
 *   - 각주 — palette.textMuted
 */

import type { View, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 230;

// ── 입력 칩 ─────────────────────────────────────────────────────────────
const CHIP_W = 28;
const CHIP_H = 18;
const CHIP_GAP = 3;
const CHIP_Y = 60;

// ── 자리 ────────────────────────────────────────────────────────────────
const SLOT_W = 32;
const SLOT_H = 30;
const SLOT_GAP = 3;
const SLOT_Y = 124;

const CAPTION_BASE_Y = 16;
const CAPTION_EVENT_Y = 34;
const ARROW_Y = 104;
const SLOT_LABEL_Y = SLOT_Y + SLOT_H + 12;
const NOTE_Y = 202;
const NOTE2_Y = 218;

/** 자리를 하나씩 채우는 간격 (ms). 채우는 동안 수가 세어지는 느낌을 준다. */
const FILL_STEP_MS = 55;

type Entry = { input: string; slot: number };
type InitPayload = { slotCount: number; fillers: Entry[]; overflow: Entry };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const pigeonholeStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const palette = getColors(params.theme);
    const FILLED = palette.textMuted;
    const EMPTY = palette.bgSubtle;
    const HOT = palette.accent;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img' });
    svg.style.maxWidth = `${W}px`;
    svg.style.display = 'block';
    svg.style.margin = '0 auto';
    container.appendChild(svg);

    function text(
      x: number,
      y: number,
      opts: { anchor?: string; fill?: string; size?: string; family?: string; weight?: string } = {},
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill ?? palette.text,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        ...(opts.weight ? { 'font-weight': opts.weight } : {}),
      });
    }

    const captionBase = text(W / 2, CAPTION_BASE_Y);
    const captionEvent = text(W / 2, CAPTION_EVENT_Y, { fill: HOT, weight: '600' });
    const arrow = text(W / 2, ARROW_Y, { fill: palette.textMuted, size: fontSizes.xs });
    const note = text(W / 2, NOTE_Y, { fill: palette.textMuted, size: fontSizes.xs });
    const note2 = text(W / 2, NOTE2_Y, { fill: palette.textMuted, size: fontSizes.xs });
    const chipsGroup = el('g');
    const slotsGroup = el('g');
    svg.append(captionBase, captionEvent, chipsGroup, arrow, slotsGroup, note, note2);

    type Chip = { group: SVGGElement; box: SVGRectElement; label: SVGTextElement };
    type Slot = { box: SVGRectElement; label: SVGTextElement; occupant: SVGTextElement };

    let chips: Chip[] = [];
    let slots: Slot[] = [];
    let snapshot: InitPayload | null = null;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    function later(fn: () => void, ms: number): void {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    }
    function clearTimers(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    }

    function buildChips(entries: Entry[], overflow: Entry): void {
      chipsGroup.textContent = '';
      chips = [];
      const all = [...entries, overflow];
      const pitch = CHIP_W + CHIP_GAP;
      const left = Math.round((W - (all.length * pitch - CHIP_GAP)) / 2);
      all.forEach((e, i) => {
        const g = el('g');
        const box = el('rect', {
          x: left + i * pitch,
          y: CHIP_Y,
          width: CHIP_W,
          height: CHIP_H,
          rx: 3,
          fill: EMPTY,
        });
        const label = text(left + i * pitch + CHIP_W / 2, CHIP_Y + 13, {
          family: fonts.mono,
          size: fontSizes.xs,
          fill: palette.text,
        });
        label.textContent = e.input;
        box.style.transition = 'fill 180ms ease-out';
        g.append(box, label);
        g.style.opacity = '0';
        g.style.transition = 'opacity 200ms ease-out';
        chipsGroup.appendChild(g);
        chips.push({ group: g, box, label });
      });
    }

    function buildSlots(count: number): void {
      slotsGroup.textContent = '';
      slots = [];
      const pitch = SLOT_W + SLOT_GAP;
      const left = Math.round((W - (count * pitch - SLOT_GAP)) / 2);
      for (let i = 0; i < count; i++) {
        const box = el('rect', {
          x: left + i * pitch,
          y: SLOT_Y,
          width: SLOT_W,
          height: SLOT_H,
          rx: 3,
          fill: EMPTY,
          stroke: 'none',
          'stroke-width': 1.5,
        });
        box.style.transition = 'fill 180ms ease-out, stroke 180ms ease-out';
        const occupant = text(left + i * pitch + SLOT_W / 2, SLOT_Y + 20, {
          family: fonts.mono,
          size: fontSizes.xs,
          fill: palette.textInverse,
        });
        const label = text(left + i * pitch + SLOT_W / 2, SLOT_LABEL_Y, {
          family: fonts.mono,
          size: fontSizes.xs,
          fill: palette.textMuted,
        });
        label.textContent = String(i);
        slotsGroup.append(box, occupant, label);
        slots.push({ box, label, occupant });
      }
      slotsGroup.style.opacity = '0';
      slotsGroup.style.transition = 'opacity 220ms ease-out';
    }

    function resetVisualState(): void {
      clearTimers();
      captionEvent.textContent = '';
      arrow.textContent = '';
      slotsGroup.style.opacity = '0';
      for (const c of chips) {
        c.group.style.opacity = '0';
        c.box.setAttribute('fill', EMPTY);
      }
      for (const s of slots) {
        s.box.setAttribute('fill', EMPTY);
        s.box.setAttribute('stroke', 'none');
        s.occupant.textContent = '';
      }
    }

    return {
      destroy() {
        clearTimers();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset: resetVisualState,

      init(p: InitPayload) {
        clearTimers();
        snapshot = p;
        buildChips(p.fillers, p.overflow);
        buildSlots(p.slotCount);
        captionEvent.textContent = '';
        arrow.textContent = '';
      },

      setBaseCaption(value: string) {
        captionBase.textContent = value;
      },

      setCaption(value: string) {
        captionEvent.textContent = value;
      },

      /** 두 줄 — 축척을 밝히는 줄과, 이 배치가 최선의 경우임을 밝히는 줄. */
      setNote(scaleLine: string, arrangementLine: string) {
        note.textContent = scaleLine;
        note2.textContent = arrangementLine;
      },

      /** 빈 자리를 먼저 보인다 — 몇 칸뿐인지가 논증의 전제다. */
      revealSlots(arrowLabel: string) {
        arrow.textContent = arrowLabel;
        slotsGroup.style.opacity = '1';
        // 넘치는 입력을 제외한 나머지만 대기열에 세운다.
        chips.forEach((c, i) => {
          if (i < chips.length - 1) c.group.style.opacity = '1';
        });
      },

      /** 자리를 하나씩 채운다. 다 차는 것을 봐야 다음 걸음이 논증이 된다. */
      fillSlots() {
        if (!snapshot) return;
        snapshot.fillers.forEach((e, i) => {
          later(() => {
            const slot = slots[e.slot];
            const chip = chips[i];
            if (!slot || !chip) return;
            slot.box.setAttribute('fill', FILLED);
            slot.occupant.textContent = e.input;
            chip.box.setAttribute('fill', FILLED);
            chip.label.setAttribute('fill', palette.textInverse);
          }, i * FILL_STEP_MS);
        });
      },

      /** 자리 수보다 하나 많은 입력. 아직 어디로 갈지 말하지 않는다. */
      revealOverflow() {
        const chip = chips[chips.length - 1];
        if (!chip) return;
        chip.group.style.opacity = '1';
        chip.box.setAttribute('fill', HOT);
        chip.label.setAttribute('fill', palette.textInverse);
      },

      /** 갈 곳이 없다 — 이미 누가 앉은 자리에 겹쳐 앉는다. */
      placeOverflow() {
        if (!snapshot) return;
        const slot = slots[snapshot.overflow.slot];
        if (!slot) return;
        slot.box.setAttribute('stroke', HOT);
        slot.occupant.textContent = `${slot.occupant.textContent} ${snapshot.overflow.input}`;
        slot.occupant.setAttribute('font-size', '9px');
      },
    };
  },
};
