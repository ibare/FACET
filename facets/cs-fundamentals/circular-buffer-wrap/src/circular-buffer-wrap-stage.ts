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
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 달라진 하나만
 * 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고 되짚기가 앞으로 가기와 같은 길로
 * 온다. 칸이 찼는지를 화면에서 되읽던 `calmSlot` 도 함께 사라졌다 — 이제 그것은
 * 장면이 말한다.
 *
 * 운동의 방향이 뒤집혀 있다. 정적 그리기가 정본이라 값은 이미 칸에 앉아 있고 표식은
 * 이미 닿을 자리에 서 있다. 흐르게 할 때만 **출발 그림으로 도로 물려 놓고** 시작하며,
 * 그 물림은 첫 프레임이 그려지기 전에 동기로 끝난다.
 *
 * 운동이 끝나면 장면을 통째로 다시 세운다. 흐르며 남은 활성 테두리·임시 조각·보간된
 * 좌표 문자열이 한꺼번에 사라져, 흐른 화면과 곧바로 세운 화면이 속성 하나만큼도
 * 갈리지 않는다 (S-scene).
 *
 * 색은 전부 design-tokens 경유 (S-view 결정 트리):
 *   tail / head — 큐형 view 가 합의한 categorical 시드의 IN / OUT 인덱스.
 *                 넣는 쪽과 빼는 쪽을 다른 view 와 같은 색으로 부른다.
 *   값이 앉거나 떠나는 순간 — state 어휘의 itemActive.
 *   그 밖의 구조 — structural (bg / bgSubtle / border / text / textMuted).
 *
 * 화면의 글자 중 이 파일이 직접 쓰는 것은 표식뿐이다 — `head` / `tail` (그 분야에서
 * 원어로 통용) 과 `(i + 1) % n` 꼴의 수식. 문장인 캡션은 `facet.ts` 의 `messages` 에
 * 있고 여기서는 키와 en 원본으로 `params.t` 를 부른다 (C10).
 */

import {
  CATEGORICAL_QUEUE_IN,
  CATEGORICAL_QUEUE_OUT,
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  BufferCaption,
  BufferPointer,
  BufferRule,
  BufferSlots,
  BufferStep,
  CircularBufferWrapScene,
} from './scene.js';

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

type SlotCell = { box: SVGRectElement; value: SVGTextElement };

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

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<CircularBufferWrapScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const queueTones = categorical(6, 'vivid');
    const pointerColor: Record<BufferPointer, string> = {
      // 빼는 쪽 / 넣는 쪽 — 큐형 view 와 같은 자리에서 색을 뽑는다.
      head: queueTones[CATEGORICAL_QUEUE_OUT],
      tail: queueTones[CATEGORICAL_QUEUE_IN],
    };

    const root = el('g', {});
    svg.appendChild(root);

    // 장면마다 통째로 다시 짓는 층들. 살아남은 옛 프레임이 쥔 것은 이미 떨어져 나간
    // 노드가 되므로 화면을 더럽히지 못한다.
    const trackLayer = el('g', {});
    const slotLayer = el('g', {});
    const markerLayer = el('g', {});
    const chipLayer = el('g', {});
    root.append(trackLayer, slotLayer, markerLayer, chipLayer);

    // 고정 자리의 글줄 둘. 다시 짓지 않고 내용만 갈아 낀다.
    const formula = el('text', {
      x: W / 2,
      y: FORMULA_Y,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
    });
    const formulaHead = el('tspan', { fill: c.textMuted });
    const formulaBody = el('tspan', { fill: c.text, dx: 6 });
    formula.append(formulaHead, formulaBody);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.append(formula, caption);

    // ── 걸어 둔 것과 세대. destroy 와 되짚기가 함께 쓴다.
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    /**
     * 세대 빗장 (S-scene).
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 아예 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 번호뿐이다.
     */
    let gen = 0;

    function animate(ms: number, draw: (p: number) => void, live: () => boolean): Promise<void> {
      draw(0);
      return new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function') {
          draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        let id = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          frames.delete(id);
          draw(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          frames.delete(id);
          // 내 세대가 아니면 화면에 손대지 않고 물러난다.
          if (destroyed || !live()) {
            done = true;
            waiters.delete(finish);
            resolve();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          if (raw >= 1) {
            finish();
            return;
          }
          draw(easeInOut(raw));
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
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

    /**
     * 트랙 시작점(띠의 왼끝)에서 s 만큼 앞으로 간 자리. 앞으로만 돈다.
     *
     * 둘레로 접어 셈하므로 **바퀴 수는 그림에 남지 않는다.** 그래서 장면도 바퀴 수를
     * 쥐지 않는다 — 몇 바퀴 어긋났는지는 칸의 내용이 말한다.
     */
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

    const anchorOf = (kind: BufferPointer, i: number): number =>
      i * slotW + slotW / 2 + (kind === 'head' ? HEAD_OFFSET : TAIL_OFFSET);

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let cells: SlotCell[] = [];
    let markers: Record<BufferPointer, SVGGElement> | null = null;
    let track: SVGPathElement | null = null;

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      trackLayer.replaceChildren();
      slotLayer.replaceChildren();
      markerLayer.replaceChildren();
      chipLayer.replaceChildren();
      cells = [];
      markers = null;
      track = null;
      formulaHead.textContent = '';
      formulaBody.textContent = '';
      caption.textContent = '';
    }

    /** 띠의 끝과 트랙의 끝이 같은 자리라는 것을 잇는 짧은 점선. */
    function makeSeam(x: number): SVGLineElement {
      return el('line', {
        x1: x,
        y1: SLOT_Y + SLOT_H,
        x2: x,
        y2: TRACK_TOP,
        stroke: c.border,
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      });
    }

    function drawTrack(n: number): void {
      const right = originX + n * slotW;
      const path = el('path', {
        d:
          `M ${originX} ${TRACK_TOP} H ${right}` +
          ` A ${TRACK_R} ${TRACK_R} 0 0 1 ${right} ${TRACK_BOT}` +
          ` H ${originX}` +
          ` A ${TRACK_R} ${TRACK_R} 0 0 1 ${originX} ${TRACK_TOP} Z`,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      trackLayer.append(path, makeSeam(originX), makeSeam(right));
      track = path;
    }

    function dressSlot(cell: SlotCell, filled: boolean, active: boolean): void {
      cell.box.setAttribute('fill', filled ? c.bg : c.bgSubtle);
      cell.box.setAttribute('stroke', active ? c.itemActive : filled ? c.text : c.border);
      cell.box.setAttribute('stroke-width', active ? '2.5' : '1.5');
      cell.box.setAttribute('stroke-dasharray', filled ? 'none' : '5 4');
    }

    function drawSlots(slots: BufferSlots): void {
      for (let i = 0; i < slots.length; i += 1) {
        const x = originX + i * slotW;
        const box = el('rect', {
          x,
          y: SLOT_Y,
          width: slotW,
          height: SLOT_H,
          rx: 7,
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
        slotLayer.append(box, index, value);
        const cell: SlotCell = { box, value };
        cells.push(cell);
        const v = slots[i];
        value.textContent = v === null || v === undefined ? '' : String(v);
        dressSlot(cell, v !== null && v !== undefined, false);
      }
    }

    /** 칸의 내용을 갈아 낀다. 흐르는 동안만 쓰이고 끝에서는 정적 그리기가 덮는다. */
    function setSlot(i: number, value: number | null, active: boolean): void {
      const cell = cells[i];
      if (!cell) return;
      cell.value.textContent = value === null ? '' : String(value);
      dressSlot(cell, value !== null, active);
    }

    // ── 표시자 (head / tail) ──────────────────────────────────────────────
    function makeMarker(kind: BufferPointer): SVGGElement {
      const group = el('g', { transform: 'translate(0,0)' });
      group.appendChild(el('path', { d: 'M 0 -10 L 8 2 L -8 2 Z', fill: pointerColor[kind] }));
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
      return group;
    }

    function drawMarkers(head: number, tail: number): void {
      markers = { head: makeMarker('head'), tail: makeMarker('tail') };
      park('head', head);
      park('tail', tail);
    }

    function park(kind: BufferPointer, i: number): void {
      const group = markers?.[kind];
      if (!group) return;
      const p = pointAt(anchorOf(kind, i));
      group.setAttribute('transform', `translate(${p.x},${p.y})`);
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

    /**
     * 수식 줄. 걸음마다 같은 셈이 다시 쓰인다는 것을 보이는 자리다.
     *
     * 걸음이 없으면 규칙 자체를 조용히 보이고, 있으면 그 걸음의 셈을 색으로 부른다.
     * 걸음이 끝나도 남으므로 장면이 `rule` 로 따로 쥔다.
     */
    function drawRule(rule: BufferRule | null): void {
      if (slotCount === 0) return;
      if (rule === null) {
        formulaHead.setAttribute('fill', c.textMuted);
        formulaHead.textContent = NEXT_MARK;
        formulaBody.setAttribute('fill', c.textMuted);
        formulaBody.textContent = `(i + 1) % ${slotCount}`;
        return;
      }
      formulaHead.setAttribute('fill', pointerColor[rule.pointer]);
      formulaHead.textContent = rule.pointer === 'head' ? HEAD_MARK : TAIL_MARK;
      formulaBody.setAttribute('fill', c.text);
      formulaBody.textContent = `(${rule.from} + 1) % ${slotCount} = ${rule.to}`;
    }

    /** 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece). */
    function drawStatic(s: CircularBufferWrapScene): void {
      const n = s.slots.length;
      layout(n);
      if (n === 0) return;
      drawTrack(n);
      drawSlots(s.slots);
      drawMarkers(s.head, s.tail);
      drawRule(s.rule);
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: BufferCaption | null): void {
      if (!cap) {
        caption.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'start':
          caption.textContent = t(
            'caption.start',
            '{count} slots. head reads at {head}, tail writes at {tail}.',
            { count: cap.count, head: cap.head, tail: cap.tail },
          );
          return;
        case 'put':
          caption.textContent = t(
            'caption.put',
            '{value} is written into slot {slot}; tail moves on to {to}.',
            { value: cap.value, slot: cap.slot, to: cap.to },
          );
          return;
        case 'take':
          caption.textContent = t(
            'caption.take',
            'Slot {slot} gives up {value}; head moves on to {to}.',
            { slot: cap.slot, value: cap.value, to: cap.to },
          );
          return;
        case 'takeWrap':
          caption.textContent = t(
            'caption.takeWrap',
            'Slot {slot} was the last one, so head comes back around to {to}.',
            { slot: cap.slot, to: cap.to },
          );
          return;
        case 'done':
          caption.textContent = t('caption.done', 'Still {count} slots — nothing grew.', {
            count: cap.count,
          });
          return;
      }
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 도로 물려 놓고 시작한다.

    /**
     * 표식이 트랙을 앞으로 미끄러진다.
     *
     * 끝 칸에서 첫 칸으로 가는 걸음도 예외가 아니다 — 둘레로 접어 재므로 저절로
     * 긴 길이 나온다. 출발 자리는 `step.from` 이 말해 준다. `prev` 를 들추지 않는다.
     */
    async function glide(
      kind: BufferPointer,
      from: number,
      to: number,
      live: () => boolean,
    ): Promise<void> {
      const group = markers?.[kind];
      if (!group) return;
      const s0 = anchorOf(kind, from);
      const span = (((anchorOf(kind, to) - s0) % trackLen) + trackLen) % trackLen;
      const ms = Math.min(GLIDE_MAX_MS, GLIDE_BASE_MS + span * GLIDE_PER_PX);
      track?.setAttribute('stroke', pointerColor[kind]);
      await animate(
        ms,
        (p) => {
          const at = pointAt(s0 + span * p);
          group.setAttribute('transform', `translate(${at.x},${at.y})`);
        },
        live,
      );
      if (!live()) return;
      track?.setAttribute('stroke', c.border);
      park(kind, to);
    }

    /** 값이 칸 밖에서 내려와 앉는다. */
    async function dropIn(value: number, slot: number, live: () => boolean): Promise<void> {
      const chip = makeChip(value);
      const x = slotCx(slot);
      await animate(
        DROP_MS,
        (p) => {
          chip.setAttribute('transform', `translate(${x},${CHIP_Y + (slotCy - CHIP_Y) * p})`);
        },
        live,
      );
      chip.remove();
    }

    /** 값이 칸을 떠나 위로 빠져나간다. */
    async function liftOut(value: number, slot: number, live: () => boolean): Promise<void> {
      const chip = makeChip(value);
      const x = slotCx(slot);
      await animate(
        LIFT_MS,
        (p) => {
          chip.setAttribute('transform', `translate(${x},${slotCy + (CHIP_Y - slotCy) * p})`);
          chip.setAttribute('opacity', String(p < 0.6 ? 1 : (1 - p) / 0.4));
        },
        live,
      );
      chip.remove();
    }

    /** tail 이 값을 앉히고 다음 자리로 미끄러진다. */
    async function flowPut(step: BufferStep, live: () => boolean): Promise<void> {
      // 정적 그림은 값이 이미 앉고 tail 이 이미 닿은 뒤다. 출발 그림으로 물린다.
      setSlot(step.slot, null, false);
      park('tail', step.from);
      await dropIn(step.value, step.slot, live);
      if (!live()) return;
      setSlot(step.slot, step.value, true);
      await glide('tail', step.from, step.to, live);
    }

    /** head 가 값을 내보내고 다음 자리로 미끄러진다. 감기는 걸음도 같은 운동이다. */
    async function flowTake(step: BufferStep, live: () => boolean): Promise<void> {
      // 정적 그림은 칸이 이미 비고 head 가 이미 닿은 뒤다. 떠나는 몸짓만 되살린다.
      setSlot(step.slot, null, true);
      park('head', step.from);
      await liftOut(step.value, step.slot, live);
      if (!live()) return;
      await glide('head', step.from, step.to, live);
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 출발 그림에 필요한 계기값을 `step` 이 싣고
     * 오므로 고를 것이 `step` 하나뿐이다 (S-scene).
     */
    async function render(
      next: CircularBufferWrapScene,
      _prev: CircularBufferWrapScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      rewind();
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      const step = next.step;
      if (step === null || next.slots.length === 0) return;

      if (step.kind === 'put') await flowPut(step, live);
      else await flowTake(step, live);
      if (!live()) return;

      // 흐르며 남은 활성 테두리·임시 조각·보간된 좌표 문자열이 통째로 사라진다.
      // 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다 (S-scene).
      rewind();
      drawStatic(next);
      drawCaption(next.caption);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
