/**
 * circular-buffer-wrap stage — 칸의 띠 하나와, 그 띠의 두 끝을 이어 붙인 지표 트랙.
 *
 * 형태는 질문의 동사에서 나왔다. **감긴다** — 그래서 화면의 주인공은 칸이 아니라
 * 칸을 가리키는 자리(index)가 도는 길이다.
 *
 *   ┌──┬──┬──┬──┬──┐        칸 다섯. 가로로 늘어선 저장 자리. 늘어나지 않는다.
 *   └──┴──┴──┴──┴──┘
 *   ╭───────────────╮       그 아래, 띠의 왼끝과 오른끝을 맞붙여 닫은 트랙.
 *   ╰───────────────╯       head 와 tail 은 이 위를 앞으로만 미끄러진다.
 *
 * 트랙의 윗줄은 칸의 띠와 **정확히 같은 구간**을 차지하고, 양끝만 반원으로 말려
 * 서로 이어져 있다. 그래서 4 번 칸에서 0 번 칸으로 가는 걸음은 예외 처리가 아니라
 * 트랙을 계속 미끄러지는 같은 운동이 된다 — 다만 길이가 길어 눈에 띌 뿐이다.
 * 페이드가 아니라 위치가 변하는 운동으로 답한다 (S-piece).
 *
 * 색은 전부 design-tokens 경유 (S-view 결정 트리):
 *   tail / head — 큐형 view 가 합의한 categorical 시드의 IN / OUT 인덱스.
 *                 넣는 쪽과 빼는 쪽을 다른 view 와 같은 색으로 부른다.
 *   값이 앉거나 떠나는 순간 — state 어휘의 itemActive.
 *   그 밖의 구조 — structural (bg / bgSubtle / border / text / textMuted).
 *
 * 화면의 글자 중 이 파일이 직접 쓰는 것은 표식뿐이다 — `head` / `tail` (그 분야에서
 * 원어로 통용) 과 `(i + 1) % n` 꼴의 수식. 문장인 캡션은 projector 가 번역해 넘긴다 (C10).
 */

import {
  CATEGORICAL_QUEUE_IN,
  CATEGORICAL_QUEUE_OUT,
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 세로는 내용이 정한다. 가로는 러너가 PIECE_CANVAS_W 로 준다 (S-view).
const W = PIECE_CANVAS_W;
const STAGE_H = 276;

/** 칸 폭의 **상한**. 실제 폭은 캔버스에서 역산한다 — 남는 폭을 여백으로 버리지 않는다. */
const SLOT_MAX_W = 108;
/** 트랙의 반원이 캔버스 밖으로 나가지 않게 남기는 좌우 최소 여백. */
const SIDE_MIN = 46;
const SLOT_H = 66;
const SLOT_Y = 62;

/** 칸 밖에서 값이 기다리는 높이 (들어오기 전 · 나간 뒤). */
const CHIP_Y = 24;
const CHIP_W = 44;
const CHIP_H = 32;

const TRACK_TOP = 150;
const TRACK_BOT = 200;
const TRACK_R = (TRACK_BOT - TRACK_TOP) / 2;
const TRACK_CY = (TRACK_TOP + TRACK_BOT) / 2;

/** 두 표시자가 같은 칸을 가리켜도 겹치지 않도록 트랙 위에서 어긋나 앉는다. */
const HEAD_OFFSET = -18;
const TAIL_OFFSET = 18;

const FORMULA_Y = 238;
const CAPTION_Y = 262;

const DROP_MS = 300;
const LIFT_MS = 320;
const GLIDE_BASE_MS = 240;
const GLIDE_PER_PX = 0.5;
const GLIDE_MAX_MS = 720;

/** 화면에 새겨지는 표식 — 번역 대상이 아니다 (C10 판정 2 · 3). */
const HEAD_MARK = 'head';
const TAIL_MARK = 'tail';
const NEXT_MARK = 'next';

type BufferState = { slots: (number | null)[]; head: number; tail: number };
type Move = { value: number; slot: number; from: number; to: number };
type Pointer = 'head' | 'tail';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export const circularBufferWrapStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const queueTones = categorical(6, 'vivid');
    const pointerColor: Record<Pointer, string> = {
      // 빼는 쪽 / 넣는 쪽 — 큐형 view 와 같은 자리에서 색을 뽑는다.
      head: queueTones[CATEGORICAL_QUEUE_OUT],
      tail: queueTones[CATEGORICAL_QUEUE_IN],
    };

    const root = el('g', {});
    svg.appendChild(root);

    // ── 진행 중인 운동. destroy 가 즉시 매듭지어 대기 중인 emit 이 매달리지 않게 한다.
    const finishers = new Set<() => void>();
    let destroyed = false;

    function tween(ms: number, apply: (t: number) => void): Promise<void> {
      apply(0);
      return new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function') {
          apply(1);
          resolve();
          return;
        }
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          finishers.delete(finish);
          apply(1);
          resolve();
        };
        finishers.add(finish);
        const frame = (): void => {
          if (done) return;
          const p = (Date.now() - start) / ms;
          if (p >= 1) {
            finish();
            return;
          }
          apply(easeInOut(p));
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    }

    // ── 기하. 칸 폭은 캔버스에서 역산하고 상수는 상한으로만 쓴다 (S-piece).
    let slotCount = 0;
    let slotW = SLOT_MAX_W;
    let originX = 0;
    let trackLen = 0;

    function layout(n: number): void {
      slotCount = n;
      slotW = Math.min(SLOT_MAX_W, Math.floor((W - SIDE_MIN * 2) / Math.max(1, n)));
      originX = Math.round((W - n * slotW) / 2);
      trackLen = 2 * n * slotW + 2 * Math.PI * TRACK_R;
    }

    const slotCx = (i: number): number => originX + i * slotW + slotW / 2;
    const slotCy = SLOT_Y + SLOT_H / 2;

    /** 트랙 시작점(띠의 왼끝)에서 s 만큼 앞으로 간 자리. 앞으로만 돈다. */
    function pointAt(s: number): { x: number; y: number } {
      const straight = slotCount * slotW;
      const arc = Math.PI * TRACK_R;
      let d = ((s % trackLen) + trackLen) % trackLen;
      if (d <= straight) return { x: originX + d, y: TRACK_TOP };
      d -= straight;
      if (d <= arc) {
        const a = (d / arc) * Math.PI;
        return {
          x: originX + straight + TRACK_R * Math.sin(a),
          y: TRACK_CY - TRACK_R * Math.cos(a),
        };
      }
      d -= arc;
      if (d <= straight) return { x: originX + straight - d, y: TRACK_BOT };
      d -= straight;
      const a = (d / arc) * Math.PI;
      return { x: originX - TRACK_R * Math.sin(a), y: TRACK_CY + TRACK_R * Math.cos(a) };
    }

    const anchorOf = (kind: Pointer, i: number): number =>
      i * slotW + slotW / 2 + (kind === 'head' ? HEAD_OFFSET : TAIL_OFFSET);

    // ── 고정 요소 ─────────────────────────────────────────────────────────
    const track = el('path', {
      d: '',
      fill: 'none',
      stroke: c.border,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    });
    root.appendChild(track);

    const seamLeft = el('line', {
      x1: 0, y1: 0, x2: 0, y2: 0,
      stroke: c.border,
      'stroke-width': 1,
      'stroke-dasharray': '3 3',
    });
    const seamRight = el('line', {
      x1: 0, y1: 0, x2: 0, y2: 0,
      stroke: c.border,
      'stroke-width': 1,
      'stroke-dasharray': '3 3',
    });
    root.appendChild(seamLeft);
    root.appendChild(seamRight);

    const slotLayer = el('g', {});
    root.appendChild(slotLayer);

    const markerLayer = el('g', {});
    root.appendChild(markerLayer);

    const chipLayer = el('g', {});
    root.appendChild(chipLayer);

    const formula = el('text', {
      x: W / 2,
      y: FORMULA_Y,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
    });
    const formulaHead = el('tspan', { fill: c.textMuted });
    const formulaBody = el('tspan', { fill: c.text, dx: 6 });
    formula.appendChild(formulaHead);
    formula.appendChild(formulaBody);
    root.appendChild(formula);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(caption);

    // ── 표시자 (head / tail) ──────────────────────────────────────────────
    function makeMarker(kind: Pointer): { group: SVGGElement } {
      const group = el('g', { transform: 'translate(0,0)' });
      group.appendChild(
        el('path', {
          d: 'M 0 -10 L 8 2 L -8 2 Z',
          fill: pointerColor[kind],
        }),
      );
      const label = el('text', {
        x: 0,
        y: 17,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: pointerColor[kind],
      });
      label.textContent = kind === 'head' ? HEAD_MARK : TAIL_MARK;
      group.appendChild(label);
      markerLayer.appendChild(group);
      return { group };
    }

    const markers: Record<Pointer, { group: SVGGElement }> = {
      head: makeMarker('head'),
      tail: makeMarker('tail'),
    };
    function park(kind: Pointer, i: number): void {
      const p = pointAt(anchorOf(kind, i));
      markers[kind].group.setAttribute('transform', `translate(${p.x},${p.y})`);
    }

    // ── 칸 ───────────────────────────────────────────────────────────────
    type SlotCell = { box: SVGRectElement; value: SVGTextElement };
    let cells: SlotCell[] = [];

    function dressSlot(cell: SlotCell, filled: boolean, active: boolean): void {
      cell.box.setAttribute('fill', filled ? c.bg : c.bgSubtle);
      cell.box.setAttribute('stroke', active ? c.itemActive : filled ? c.text : c.border);
      cell.box.setAttribute('stroke-width', active ? '2.5' : '1.5');
      cell.box.setAttribute('stroke-dasharray', filled ? 'none' : '5 4');
    }

    function buildSlots(n: number): void {
      layout(n);
      slotLayer.replaceChildren();
      cells = [];
      for (let i = 0; i < n; i += 1) {
        const x = originX + i * slotW;
        const box = el('rect', {
          x,
          y: SLOT_Y,
          width: slotW,
          height: SLOT_H,
          rx: 7,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1.5,
          'stroke-dasharray': '5 4',
        });
        const index = el('text', {
          x: x + 9,
          y: SLOT_Y + 18,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        index.textContent = String(i);
        const value = el('text', {
          x: slotCx(i),
          y: slotCy + 9,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          fill: c.text,
        });
        slotLayer.appendChild(box);
        slotLayer.appendChild(index);
        slotLayer.appendChild(value);
        cells.push({ box, value });
      }

      const right = originX + n * slotW;
      track.setAttribute(
        'd',
        `M ${originX} ${TRACK_TOP} H ${right}` +
          ` A ${TRACK_R} ${TRACK_R} 0 0 1 ${right} ${TRACK_BOT}` +
          ` H ${originX}` +
          ` A ${TRACK_R} ${TRACK_R} 0 0 1 ${originX} ${TRACK_TOP} Z`,
      );
      placeSeam(seamLeft, originX);
      placeSeam(seamRight, right);
    }

    /** 띠의 끝과 트랙의 끝이 같은 자리라는 것을 잇는 짧은 점선. */
    function placeSeam(seam: SVGLineElement, x: number): void {
      seam.setAttribute('x1', String(x));
      seam.setAttribute('y1', String(SLOT_Y + SLOT_H));
      seam.setAttribute('x2', String(x));
      seam.setAttribute('y2', String(TRACK_TOP));
    }

    function setSlot(i: number, value: number | null, active = false): void {
      const cell = cells[i];
      if (!cell) return;
      cell.value.textContent = value === null ? '' : String(value);
      dressSlot(cell, value !== null, active);
    }

    // ── 값 조각 (칸 밖을 오가는 동안만 존재한다) ────────────────────────────
    function makeChip(value: number): SVGGElement {
      const chip = el('g', { transform: `translate(0,${CHIP_Y})` });
      chip.appendChild(
        el('rect', {
          x: -CHIP_W / 2,
          y: -CHIP_H / 2,
          width: CHIP_W,
          height: CHIP_H,
          rx: 6,
          fill: c.bg,
          stroke: c.itemActive,
          'stroke-width': 2,
        }),
      );
      const text = el('text', {
        x: 0,
        y: 7,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: c.text,
      });
      text.textContent = String(value);
      chip.appendChild(text);
      chipLayer.appendChild(chip);
      return chip;
    }

    // ── 수식 표식. 걸음마다 같은 셈이 다시 쓰인다는 것을 보이는 자리다.
    function showRule(): void {
      formulaHead.setAttribute('fill', c.textMuted);
      formulaHead.textContent = NEXT_MARK;
      formulaBody.setAttribute('fill', c.textMuted);
      formulaBody.textContent = `(i + 1) % ${slotCount}`;
    }

    function showStep(kind: Pointer, from: number, to: number): void {
      formulaHead.setAttribute('fill', pointerColor[kind]);
      formulaHead.textContent = kind === 'head' ? HEAD_MARK : TAIL_MARK;
      formulaBody.setAttribute('fill', c.text);
      formulaBody.textContent = `(${from} + 1) % ${slotCount} = ${to}`;
    }

    // ── 운동 ─────────────────────────────────────────────────────────────
    async function glide(kind: Pointer, from: number, to: number): Promise<void> {
      const s0 = anchorOf(kind, from);
      const span = (((anchorOf(kind, to) - s0) % trackLen) + trackLen) % trackLen;
      const ms = Math.min(GLIDE_MAX_MS, GLIDE_BASE_MS + span * GLIDE_PER_PX);
      track.setAttribute('stroke', pointerColor[kind]);
      await tween(ms, (t) => {
        const p = pointAt(s0 + span * t);
        markers[kind].group.setAttribute('transform', `translate(${p.x},${p.y})`);
      });
      track.setAttribute('stroke', c.border);
      park(kind, to);
    }

    async function dropIn(value: number, slot: number): Promise<void> {
      const chip = makeChip(value);
      const x = slotCx(slot);
      await tween(DROP_MS, (t) => {
        chip.setAttribute('transform', `translate(${x},${CHIP_Y + (slotCy - CHIP_Y) * t})`);
      });
      chip.remove();
      setSlot(slot, value, true);
    }

    async function liftOut(value: number, slot: number): Promise<void> {
      setSlot(slot, null, true);
      const chip = makeChip(value);
      const x = slotCx(slot);
      await tween(LIFT_MS, (t) => {
        chip.setAttribute('transform', `translate(${x},${slotCy + (CHIP_Y - slotCy) * t})`);
        chip.setAttribute('opacity', String(t < 0.6 ? 1 : (1 - t) / 0.4));
      });
      chip.remove();
    }

    function calmSlot(slot: number): void {
      const cell = cells[slot];
      if (!cell) return;
      dressSlot(cell, cell.value.textContent !== '', false);
    }

    // ── projector 가 부르는 표면 ───────────────────────────────────────────
    return {
      /** 즉시 반영 — 처음 배치와 되감기. */
      showState(state: BufferState): void {
        if (state.slots.length !== slotCount || cells.length === 0) {
          buildSlots(state.slots.length);
        }
        state.slots.forEach((v, i) => setSlot(i, v));
        park('head', state.head);
        park('tail', state.tail);
        showRule();
      },

      /** tail 이 값을 앉히고 다음 자리로 미끄러진다. */
      async putValue(move: Move): Promise<void> {
        showStep('tail', move.from, move.to);
        await dropIn(move.value, move.slot);
        await glide('tail', move.from, move.to);
        calmSlot(move.slot);
      },

      /** head 가 값을 내보내고 다음 자리로 미끄러진다. 감기는 걸음도 같은 운동이다. */
      async takeValue(move: Move): Promise<void> {
        showStep('head', move.from, move.to);
        await liftOut(move.value, move.slot);
        await glide('head', move.from, move.to);
        calmSlot(move.slot);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      destroy(): void {
        destroyed = true;
        for (const finish of [...finishers]) finish();
        finishers.clear();
        root.remove();
      },
    };
  },
};
