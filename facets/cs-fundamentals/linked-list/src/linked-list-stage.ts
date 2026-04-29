/**
 * linked-list-stage View — 단일 연결 리스트 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 캡션 / 단계 인디케이터 / 새 카드 대기 자리 / 두 칸 노드 카드 사슬 /
 * head 라벨 / NULL 종료 표식 / 발자국 누적 / 강조 화살표를 모두 담는다. 기획 §6:
 * "노드는 자기 다음 한 명만 가리킨다 — 손가락의 발생점은 next 칸 우측 변 단 한 곳."
 *
 * 메서드 (projector → view):
 *   - reset()
 *   - init(values)
 *   - setBaseCaption(text)
 *   - setCaption(text, opts?)
 *   - setStage(n)                              — 1/2 인디케이터 점등 (0 = 끔)
 *   - insertAt(idx, value, opts?)              — 두 단계 재배선 운동 (mid)
 *   - insertHead(value, opts?)                 — 새 카드 → head 라벨 활주
 *   - removeAt(idx, opts?)                     — 단일 화살표 갈아 끼움 + 카드 페이드아웃
 *   - removeHead(opts?)                        — head 라벨 활주 + 옛 첫 카드 페이드아웃
 *   - searchPrepare()                          — 발자국·캡션 카운터 초기화
 *   - searchStep(idx, isMatch, isFinal, opts?) — head 손가락이 한 칸 진행
 *   - searchResult(found, idx, value, walked)
 *   - signalOutOfRange(opts?)                  — NULL X 빨간 깜빡
 *   - signalEmpty(opts?)                       — head 라벨 빨간 깜빡
 *
 * 모든 운동 메서드는 Promise<void> 반환 — projector 가 await 한다.
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import { getColors, fonts, fontSizes, categorical } from '@facet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 700;
const H = 360;

// ── 영역 분할 ──
const CAPTION_BASE_Y = 22;
const CAPTION_EVENT_Y = 44;
const STAGE_PIP_RIGHT = W - 18;

const WAITING_CARD_Y = 92;       // 대기 카드 중심 y

const CHAIN_LEFT = 130;
const CHAIN_TOP = 220;           // 카드 본체 윗변 y
const CARD_W = 88;
const CARD_H = 56;
const DATA_W = 52;
const NEXT_W = CARD_W - DATA_W;
const CARD_GAP = 28;
const CARD_PITCH = CARD_W + CARD_GAP;

const HEAD_LABEL_Y = 184;        // head 글자 y (카드 위 ~24px)
const HEAD_ARROW_TOP = 188;
const HEAD_ARROW_BOTTOM = CHAIN_TOP - 2;

// ── 시간 (ms, base — view 내부 / 외부 speed 보정은 projector 가 적용 후 opts.duration 으로 전달) ──
const STAGE1_MS = 350;
const STAGE_PAUSE_MS = 200;
const STAGE2_MS = 350;
const REMOVE_MS = 500;
const SEARCH_STEP_MS = 280;
const FOOTSTEP_FADE_MS = 1500;
const HIGHLIGHT_AFTERGLOW_MS = 600;

const ARROW_HEAD_PATH = 'M0,0 L-7,-4 L-5,0 L-7,4 Z';

// ── 카드 색 — 6색 순환 (기획 §9) ──
const CARD_PALETTE_TONE = 'pastel' as const;
const CARD_PALETTE_SIZE = 6;

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}

function raf(cb: (t: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, Math.max(0, ms)));
}

type NodeRec = {
  /** 카드 데이터 칸 라벨. */
  value: string;
  /** 입력 순서 — 색 인덱스 + 작은 번호 라벨용. */
  serial: number;
  /** 색 팔레트 인덱스 (serial % 6). */
  colorIdx: number;
  /** SVG 카드 그룹. */
  el: SVGGElement;
  bodyRect: SVGRectElement;
  divider: SVGLineElement;
  valueText: SVGTextElement;
  serialText: SVGTextElement;
  pointerDot: SVGCircleElement;
  /** 현재 슬롯 인덱스 (좌→우 0..n-1). 초기엔 자기 인덱스. */
  slot: number;
};

type ChainArrow = {
  el: SVGGElement;
  line: SVGLineElement;
  head: SVGPathElement;
};

export const linkedListStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const cardColors = categorical(CARD_PALETTE_SIZE, CARD_PALETTE_TONE);

    const root = document.createElement('div');
    root.className = 'facet-linked-list-stage';
    root.style.fontFamily = fonts.body;
    root.style.color = colors.text;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = `${W}px`;
    svg.style.display = 'block';
    svg.style.background = colors.bgSubtle;
    root.appendChild(svg);
    container.appendChild(root);

    // === 캡션 영역 ===
    const baseCaption = document.createElementNS(SVG_NS, 'text');
    setAttrs(baseCaption, {
      x: 16,
      y: CAPTION_BASE_Y,
      fill: colors.textMuted,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
    });
    svg.appendChild(baseCaption);

    const eventCaption = document.createElementNS(SVG_NS, 'text');
    setAttrs(eventCaption, {
      x: 16,
      y: CAPTION_EVENT_Y,
      fill: colors.text,
      'font-size': fontSizes.md,
      'font-family': fonts.body,
      'font-weight': '600',
    });
    svg.appendChild(eventCaption);

    // 단계 인디케이터: ●○ / ○●
    const stageGroup = document.createElementNS(SVG_NS, 'g');
    setAttrs(stageGroup, { transform: `translate(${STAGE_PIP_RIGHT - 60},${CAPTION_EVENT_Y - 6})` });
    const stageLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(stageLabel, {
      x: 0,
      y: 0,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
      'text-anchor': 'start',
    });
    stageLabel.textContent = '';
    stageGroup.appendChild(stageLabel);
    const pip1 = document.createElementNS(SVG_NS, 'circle');
    setAttrs(pip1, { cx: 36, cy: -4, r: 4, fill: colors.border, stroke: colors.textMuted });
    const pip2 = document.createElementNS(SVG_NS, 'circle');
    setAttrs(pip2, { cx: 50, cy: -4, r: 4, fill: colors.border, stroke: colors.textMuted });
    stageGroup.appendChild(pip1);
    stageGroup.appendChild(pip2);
    svg.appendChild(stageGroup);

    // === head 라벨 ===
    const headGroup = document.createElementNS(SVG_NS, 'g');
    headGroup.setAttribute('transform', 'translate(0,0)');
    const headLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(headLabel, {
      x: 0,
      y: HEAD_LABEL_Y,
      fill: colors.text,
      'font-size': fontSizes.md,
      'font-family': fonts.mono,
      'font-weight': '700',
      'text-anchor': 'middle',
    });
    headLabel.textContent = 'head';
    headGroup.appendChild(headLabel);
    const headArrowLine = document.createElementNS(SVG_NS, 'line');
    setAttrs(headArrowLine, {
      x1: 0,
      y1: HEAD_ARROW_TOP,
      x2: 0,
      y2: HEAD_ARROW_BOTTOM,
      stroke: colors.text,
      'stroke-width': '2.5',
    });
    headGroup.appendChild(headArrowLine);
    const headArrowTip = document.createElementNS(SVG_NS, 'path');
    setAttrs(headArrowTip, {
      d: 'M0,0 L-5,-7 L0,-4 L5,-7 Z',
      transform: `translate(0,${HEAD_ARROW_BOTTOM})`,
      fill: colors.text,
    });
    headGroup.appendChild(headArrowTip);
    // empty 신호용 X 마크 (평소 숨김)
    const headEmptyX = document.createElementNS(SVG_NS, 'text');
    setAttrs(headEmptyX, {
      x: 0,
      y: HEAD_ARROW_BOTTOM + 6,
      fill: colors.danger,
      'font-size': fontSizes.md,
      'font-family': fonts.mono,
      'font-weight': '700',
      'text-anchor': 'middle',
      opacity: '0',
    });
    headEmptyX.textContent = '✕';
    headGroup.appendChild(headEmptyX);
    svg.appendChild(headGroup);

    // === 사슬·화살표·NULL 종료 표식 그룹 ===
    const chainGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(chainGroup);
    const arrowGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(arrowGroup);
    const cardGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(cardGroup);

    // NULL 종료
    const nullGroup = document.createElementNS(SVG_NS, 'g');
    nullGroup.setAttribute('transform', `translate(0,${CHAIN_TOP + CARD_H / 2})`);
    const nullLine = document.createElementNS(SVG_NS, 'line');
    setAttrs(nullLine, {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: colors.textMuted,
      'stroke-width': '2',
    });
    nullGroup.appendChild(nullLine);
    const nullX = document.createElementNS(SVG_NS, 'text');
    setAttrs(nullX, {
      x: 0,
      y: 5,
      fill: colors.danger,
      'font-size': fontSizes.lg,
      'font-family': fonts.mono,
      'font-weight': '700',
      'text-anchor': 'middle',
    });
    nullX.textContent = '✕';
    nullGroup.appendChild(nullX);
    const nullText = document.createElementNS(SVG_NS, 'text');
    setAttrs(nullText, {
      x: 0,
      y: 22,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.mono,
      'text-anchor': 'middle',
    });
    nullText.textContent = 'NULL';
    nullGroup.appendChild(nullText);
    svg.appendChild(nullGroup);

    // === 발자국 잔상 ===
    const footstepGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(footstepGroup);

    // === 임시 강조 호 화살표 (재배선 1단계 / 2단계 용) — 대기 카드의 손가락이 다음 카드까지 호로 그어짐 ===
    // 동시에 여러 강조 화살표가 떠 있을 수 있어 group 으로 관리.
    const overlayGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(overlayGroup);

    // ─── 상태 ───
    let nodes: NodeRec[] = [];
    let arrows: ChainArrow[] = [];                  // arrows[i] = node[i] → node[i+1]
    let serialCounter = 0;
    let captionTimer: ReturnType<typeof setTimeout> | null = null;
    let walkedCount = 0;

    function clearCaptionTimer(): void {
      if (captionTimer !== null) clearTimeout(captionTimer);
      captionTimer = null;
    }

    function slotCenterX(slot: number): number {
      return CHAIN_LEFT + slot * CARD_PITCH + CARD_W / 2;
    }

    function cardCenterY(): number {
      return CHAIN_TOP + CARD_H / 2;
    }

    function nextCellRightX(slot: number): number {
      return CHAIN_LEFT + slot * CARD_PITCH + CARD_W;
    }

    /** 다음 슬롯 카드의 좌측 변 (= 화살표 도착 지점). */
    function dataLeftX(slot: number): number {
      return CHAIN_LEFT + slot * CARD_PITCH;
    }

    function makeCard(value: string, serial: number, slot: number): NodeRec {
      const colorIdx = serial % CARD_PALETTE_SIZE;
      const g = document.createElementNS(SVG_NS, 'g');
      const cx = slotCenterX(slot);
      const cy = cardCenterY();
      g.setAttribute('transform', `translate(${cx},${cy})`);

      const body = document.createElementNS(SVG_NS, 'rect');
      setAttrs(body, {
        x: -CARD_W / 2,
        y: -CARD_H / 2,
        width: CARD_W,
        height: CARD_H,
        fill: cardColors[colorIdx]!,
        stroke: colors.text,
        'stroke-width': '1.5',
        rx: '4',
      });
      g.appendChild(body);

      const divider = document.createElementNS(SVG_NS, 'line');
      setAttrs(divider, {
        x1: -CARD_W / 2 + DATA_W,
        y1: -CARD_H / 2,
        x2: -CARD_W / 2 + DATA_W,
        y2: CARD_H / 2,
        stroke: colors.text,
        'stroke-width': '1',
      });
      g.appendChild(divider);

      const valueText = document.createElementNS(SVG_NS, 'text');
      setAttrs(valueText, {
        x: -CARD_W / 2 + DATA_W / 2,
        y: 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': '700',
        fill: colors.text,
      });
      valueText.textContent = value;
      g.appendChild(valueText);

      const serialText = document.createElementNS(SVG_NS, 'text');
      setAttrs(serialText, {
        x: -CARD_W / 2 + 4,
        y: -CARD_H / 2 + 11,
        'text-anchor': 'start',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      serialText.textContent = `#${serial + 1}`;
      g.appendChild(serialText);

      // next 칸 손끝 표지 — 점
      const pointerDot = document.createElementNS(SVG_NS, 'circle');
      setAttrs(pointerDot, {
        cx: -CARD_W / 2 + DATA_W + NEXT_W / 2,
        cy: 0,
        r: 4,
        fill: colors.text,
      });
      g.appendChild(pointerDot);

      cardGroup.appendChild(g);
      return {
        value,
        serial,
        colorIdx,
        el: g,
        bodyRect: body,
        divider,
        valueText,
        serialText,
        pointerDot,
        slot,
      };
    }

    function refreshArrowsToSlots(): void {
      // arrows[i] = nodes[i].slot → nodes[i+1].slot. 카드 인덱스 (i) 대신 슬롯으로 그린다.
      // 모든 화살표 제거 후 재생성.
      for (const a of arrows) a.el.remove();
      arrows = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        const fromSlot = nodes[i]!.slot;
        const toSlot = nodes[i + 1]!.slot;
        // 인접 슬롯 (toSlot = fromSlot + 1) 가정. 빗나간 경우 호로 그릴 수도 있으나
        // 이 view 는 정렬 후 호출되므로 인접만 처리.
        const a = makeChainArrowFromTo(fromSlot, toSlot, colors.textMuted, '2');
        arrows.push(a);
      }
    }

    function makeChainArrowFromTo(
      fromSlot: number,
      toSlot: number,
      color: string,
      weight: string,
    ): ChainArrow {
      const g = document.createElementNS(SVG_NS, 'g');
      const x1 = nextCellRightX(fromSlot);
      const x2 = dataLeftX(toSlot) - 2;
      const y = cardCenterY();
      const line = document.createElementNS(SVG_NS, 'line');
      setAttrs(line, { x1, y1: y, x2, y2: y, stroke: color, 'stroke-width': weight });
      g.appendChild(line);
      const head = document.createElementNS(SVG_NS, 'path');
      setAttrs(head, { d: ARROW_HEAD_PATH, transform: `translate(${x2},${y})`, fill: color });
      g.appendChild(head);
      arrowGroup.appendChild(g);
      return { el: g, line, head };
    }

    function repositionHead(): void {
      const cx = nodes.length > 0 ? slotCenterX(nodes[0]!.slot) : -100;
      headGroup.setAttribute('transform', `translate(${cx},0)`);
      const dim = nodes.length === 0;
      headLabel.setAttribute('fill', dim ? colors.textMuted : colors.text);
      headArrowLine.setAttribute('stroke', dim ? colors.textMuted : colors.text);
      headArrowTip.setAttribute('fill', dim ? colors.textMuted : colors.text);
      headEmptyX.setAttribute('opacity', dim ? '1' : '0');
    }

    function slideGroupX(
      group: SVGGElement,
      fromX: number,
      toX: number,
      fixedY: number,
      duration: number,
    ): Promise<void> {
      return new Promise((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          const e = easeInOut(t);
          const x = fromX + (toX - fromX) * e;
          group.setAttribute('transform', `translate(${x},${fixedY})`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
    }

    /**
     * 가장 왼쪽 카드가 슬롯 0 자리에 오도록 사슬 전체 (카드·화살표·head·NULL) 를 우측 활주.
     * head insert 후 음수 슬롯이 좌측 캔버스를 벗어나는 걸 보정한다.
     */
    async function normalizeChainSlide(duration = 320): Promise<void> {
      if (nodes.length === 0) return;
      const shift = -nodes[0]!.slot;
      if (shift === 0) return;

      const dx = shift * CARD_PITCH;

      // 데이터 모델 갱신 (절대 좌표 기준).
      for (const n of nodes) n.slot = n.slot + shift;

      // 화살표는 새 절대 좌표로 다시 그리고, arrowGroup 에 임시 outer 오프셋 (-dx) 을 줘서
      // 옛 자리에서 시작해 0 으로 활주시킨다.
      refreshArrowsToSlots();
      arrowGroup.setAttribute('transform', `translate(${-dx},0)`);

      const promises: Promise<void>[] = [];

      // 카드: 옛 절대 좌표 (newX - dx) 에서 시작해 새 절대 좌표 (newX) 로 활주.
      for (const n of nodes) {
        const newX = slotCenterX(n.slot);
        promises.push(
          animateTransform(n.el, newX - dx, cardCenterY(), newX, cardCenterY(), duration),
        );
      }

      // arrowGroup outer transform: -dx → 0.
      promises.push(slideGroupX(arrowGroup, -dx, 0, 0, duration));

      // head 라벨: 옛 자리 (newHeadX - dx) → 새 자리 (newHeadX).
      const headNewX = slotCenterX(nodes[0]!.slot);
      promises.push(slideGroupX(headGroup, headNewX - dx, headNewX, 0, duration));

      // NULL 표식: 옛 자리 → 새 자리.
      const lastSlot = nodes[nodes.length - 1]!.slot;
      const nullNewX = nextCellRightX(lastSlot) + CARD_GAP - 6;
      const nullY = cardCenterY();
      promises.push(slideGroupX(nullGroup, nullNewX - dx, nullNewX, nullY, duration));

      await Promise.all(promises);

      // 정리: arrowGroup 외부 오프셋 리셋, 좌표 다시 한번 정렬 (방어적).
      arrowGroup.setAttribute('transform', '');
      refreshArrowsToSlots();
      repositionHead();
      repositionNull();
    }

    function repositionNull(): void {
      // 마지막 카드 next 칸 우측 변 + arrow 한 토막 + NULL 표식.
      if (nodes.length === 0) {
        nullGroup.setAttribute('opacity', '0');
        return;
      }
      nullGroup.setAttribute('opacity', '1');
      const lastSlot = nodes[nodes.length - 1]!.slot;
      const x = nextCellRightX(lastSlot) + CARD_GAP - 6;
      nullGroup.setAttribute('transform', `translate(${x},${cardCenterY()})`);
      // NULL 직전 짧은 화살표 (마지막 next 손가락이 닿는 NULL 까지의 회색 선) — 카드 next 우측 변에서
      // NULL 의 X 좌측 변까지 직선.
      setAttrs(nullLine, {
        x1: -(CARD_GAP - 6) + 2,
        y1: 0,
        x2: -8,
        y2: 0,
        stroke: colors.textMuted,
      });
    }

    function animateTransform(
      el: SVGGElement,
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
      duration: number,
    ): Promise<void> {
      return new Promise((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          const e = easeInOut(t);
          const x = fromX + (toX - fromX) * e;
          const y = fromY + (toY - fromY) * e;
          el.setAttribute('transform', `translate(${x},${y})`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
    }

    /** 호 곡선으로 점 (fx,fy) → (tx,ty) 까지 stroke 가 점진적으로 자라는 강조 화살표. */
    function drawHighlightArc(
      fx: number,
      fy: number,
      tx: number,
      ty: number,
      duration: number,
      color: string,
    ): { remove: () => void; promise: Promise<void> } {
      const cx = (fx + tx) / 2;
      const cy = Math.min(fy, ty) - 50; // 호는 위로 솟음
      const path = document.createElementNS(SVG_NS, 'path');
      const d = `M${fx},${fy} Q${cx},${cy} ${tx},${ty}`;
      setAttrs(path, {
        d,
        fill: 'none',
        stroke: color,
        'stroke-width': '3',
        'stroke-linecap': 'round',
      });
      overlayGroup.appendChild(path);
      const length = (path as SVGPathElement).getTotalLength();
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      const tip = document.createElementNS(SVG_NS, 'path');
      setAttrs(tip, {
        d: ARROW_HEAD_PATH,
        fill: color,
        opacity: '0',
      });
      overlayGroup.appendChild(tip);
      const promise = new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          const e = easeInOut(t);
          path.style.strokeDashoffset = String(length * (1 - e));
          tip.setAttribute('opacity', String(e));
          // 끝점 각도 계산: 호의 마지막 작은 구간 접선.
          const tEnd = Math.max(0.001, e);
          const pt = (path as SVGPathElement).getPointAtLength(length * tEnd);
          const ptPrev = (path as SVGPathElement).getPointAtLength(Math.max(0, length * tEnd - 2));
          const ang = (Math.atan2(pt.y - ptPrev.y, pt.x - ptPrev.x) * 180) / Math.PI;
          tip.setAttribute('transform', `translate(${pt.x},${pt.y}) rotate(${ang})`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
      return {
        remove: () => {
          path.remove();
          tip.remove();
        },
        promise,
      };
    }

    function fadeStrokeOpacity(
      el: SVGElement,
      from: number,
      to: number,
      duration: number,
    ): Promise<void> {
      return new Promise((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          const e = easeInOut(t);
          el.setAttribute('opacity', String(from + (to - from) * e));
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
    }

    function setStagePip(n: 0 | 1 | 2): void {
      if (n === 0) {
        stageLabel.textContent = '';
        pip1.setAttribute('fill', colors.border);
        pip2.setAttribute('fill', colors.border);
        return;
      }
      stageLabel.textContent = '단계';
      pip1.setAttribute('fill', n >= 1 ? colors.itemActive : colors.border);
      pip2.setAttribute('fill', n >= 2 ? colors.itemActive : colors.border);
    }

    // === 메서드 본체 ===
    function reset(): void {
      clearCaptionTimer();
      for (const n of nodes) n.el.remove();
      for (const a of arrows) a.el.remove();
      // overlay / footstep 정리
      while (overlayGroup.firstChild) overlayGroup.firstChild.remove();
      while (footstepGroup.firstChild) footstepGroup.firstChild.remove();
      nodes = [];
      arrows = [];
      serialCounter = 0;
      walkedCount = 0;
      eventCaption.textContent = '';
      setStagePip(0);
      repositionHead();
      repositionNull();
    }

    function init(values: string[]): void {
      reset();
      for (let i = 0; i < values.length; i++) {
        const node = makeCard(String(values[i] ?? ''), serialCounter++, i);
        nodes.push(node);
      }
      refreshArrowsToSlots();
      repositionHead();
      repositionNull();
    }

    function setBaseCaption(text: string): void {
      baseCaption.textContent = text;
    }

    function setCaption(text: string, opts?: { duration?: number }): void {
      clearCaptionTimer();
      eventCaption.textContent = text;
      eventCaption.setAttribute('fill', colors.text);
      const dur = opts?.duration ?? 1800;
      captionTimer = setTimeout(() => {
        eventCaption.textContent = '';
      }, dur);
    }

    function setStage(n: 0 | 1 | 2): void {
      setStagePip(n);
    }

    /**
     * mid-insert: cards 0..idx-1 그대로, cards idx..end 가 한 슬롯 우측으로 양보.
     * 새 카드는 대기 자리에 잠시 떠 있다가 1단계 → 휴지기 → 2단계 진행.
     */
    async function insertAt(
      idx: number,
      value: string,
      opts?: { duration?: number },
    ): Promise<void> {
      const baseDur = opts?.duration ?? STAGE1_MS + STAGE_PAUSE_MS + STAGE2_MS;
      const ratio = baseDur / (STAGE1_MS + STAGE_PAUSE_MS + STAGE2_MS);
      const stage1 = STAGE1_MS * ratio;
      const pause = STAGE_PAUSE_MS * ratio;
      const stage2 = STAGE2_MS * ratio;

      // 새 카드는 일단 우측 끝 다음 슬롯에 만들고 대기 자리로 이동시킨다.
      const newSerial = serialCounter++;
      const tempSlot = nodes.length; // 임시 슬롯 (사슬 우측 끝 너머)
      const newCard = makeCard(value, newSerial, tempSlot);

      // 대기 자리로 위치 이동: 슬롯 idx 의 x, 대기 카드 y.
      const waitX = nodes.length > idx ? slotCenterX(idx) : slotCenterX(tempSlot);
      newCard.el.setAttribute('transform', `translate(${waitX},${WAITING_CARD_Y})`);
      // 대기 카드의 손가락은 점선 — 손끝 점은 기본 점이지만 next 칸을 점선 동그라미로 바꿔 비어있음 표시.
      newCard.pointerDot.setAttribute('fill', 'none');
      newCard.pointerDot.setAttribute('stroke', colors.textMuted);
      newCard.pointerDot.setAttribute('stroke-dasharray', '2 2');

      setStagePip(1);
      setCaption('새 카드의 손가락을 다음 카드에 먼저 묶었다.', { duration: stage1 + 400 });

      const nextNode = nodes[idx]; // idx 자리에 있던 옛 다음 카드 (있을 수 있음)
      const newCardNextSrcX = waitX + CARD_W / 2 - 2; // 대기 카드 next 칸 우측 변
      const newCardNextSrcY = WAITING_CARD_Y;
      const targetX = nextNode ? slotCenterX(nextNode.slot) - CARD_W / 2 : nextCellRightX(idx) + CARD_GAP - 4;
      const targetY = cardCenterY();
      const arc1 = drawHighlightArc(
        newCardNextSrcX,
        newCardNextSrcY,
        targetX,
        targetY,
        stage1,
        colors.itemActive,
      );
      await arc1.promise;

      // 휴지기.
      setStagePip(2);
      setCaption('이전 카드의 손가락을 새 카드로 옮겨 끼웠다.', { duration: stage2 + 600 });
      await sleep(pause);

      // 2단계: 동시에
      //  (a) cards idx..end 를 한 슬롯 우측으로 양보.
      //  (b) 새 카드는 슬롯 idx 자리로 내려옴.
      //  (c) 이전 카드 (idx-1) 의 화살표가 옛 다음 카드 → 새 카드 로 옮겨감 (이전 화살표는 흐려짐).
      const moveDur = stage2;
      const promises: Promise<void>[] = [];

      // (a) 양보 운동 + 데이터 모델: nodes 의 nodeRec.slot 을 +1.
      for (let i = idx; i < nodes.length; i++) {
        const n = nodes[i]!;
        const fromX = slotCenterX(n.slot);
        const fromY = cardCenterY();
        n.slot = n.slot + 1;
        const toX = slotCenterX(n.slot);
        promises.push(animateTransform(n.el, fromX, fromY, toX, fromY, moveDur));
      }

      // (b) 새 카드 슬롯 idx 자리로 하강.
      newCard.slot = idx;
      const newToX = slotCenterX(newCard.slot);
      const newToY = cardCenterY();
      // 점선 손가락은 정상 손끝으로 복귀.
      newCard.pointerDot.setAttribute('fill', colors.text);
      newCard.pointerDot.setAttribute('stroke-dasharray', '');
      promises.push(animateTransform(newCard.el, waitX, WAITING_CARD_Y, newToX, newToY, moveDur));

      // 데이터 모델: nodes 배열에 idx 자리에 splice.
      nodes.splice(idx, 0, newCard);

      // (c) 이전 카드 (idx-1) 의 화살표가 새 카드로. idx === 0 이면 prev 없음 — head case 는 별도 메서드.
      let arc2: { remove: () => void; promise: Promise<void> } | null = null;
      const prev = idx > 0 ? nodes[idx - 1] : null; // 이미 splice 후 (idx-1) 은 옛 prev 그대로
      if (prev) {
        // 이전 카드의 next 칸 우측 변 → 새 카드 좌측 변 호.
        const fromXp = nextCellRightX(prev.slot) + 2;
        const fromYp = cardCenterY();
        const toXp = slotCenterX(newCard.slot) - CARD_W / 2 - 2;
        const toYp = cardCenterY();
        arc2 = drawHighlightArc(fromXp, fromYp, toXp, toYp, moveDur, colors.itemActive);
        promises.push(arc2.promise);
        // 옛 화살표 (prev → 옛 다음) 가 있다면 흐려지며 끊기게.
        // 현재 arrows 는 refreshArrowsToSlots 가 다시 그릴 거라 단순히 prev 의 옛 화살표를 페이드 처리.
        // arrows 배열은 idx-1 자리의 arrow 가 prev → 옛 next 였음.
        const oldArr = arrows[idx - 1];
        if (oldArr) {
          // dotted + 페이드아웃.
          oldArr.line.setAttribute('stroke-dasharray', '4 3');
          promises.push(fadeStrokeOpacity(oldArr.el, 1, 0, moveDur * 0.8));
        }
      }

      await Promise.all(promises);

      // 잔상 — 강조 화살표는 잠깐 더 머무른다.
      // 그 사이 정상 화살표를 새로 그려 자리잡고, 강조 호는 afterglow 후 제거.
      refreshArrowsToSlots();
      repositionHead();
      repositionNull();

      await sleep(HIGHLIGHT_AFTERGLOW_MS);
      arc1.remove();
      if (arc2) arc2.remove();
      setStagePip(0);
    }

    /** head 위치 삽입: 새 카드를 옛 첫 카드 좌측에 등장시키고 head 라벨이 좌측으로 한 칸 활주. */
    async function insertHead(value: string, opts?: { duration?: number }): Promise<void> {
      const baseDur = opts?.duration ?? STAGE1_MS + STAGE_PAUSE_MS + STAGE2_MS;
      const ratio = baseDur / (STAGE1_MS + STAGE_PAUSE_MS + STAGE2_MS);
      const stage1 = STAGE1_MS * ratio;
      const pause = STAGE_PAUSE_MS * ratio;
      const stage2 = STAGE2_MS * ratio;

      const oldHead = nodes[0];
      // 새 슬롯: 옛 첫 카드 좌측 한 칸. 빈 리스트면 슬롯 0.
      const newSlot = oldHead ? oldHead.slot - 1 : 0;

      const newSerial = serialCounter++;
      const newCard = makeCard(value, newSerial, newSlot);
      const waitX = slotCenterX(newSlot);
      newCard.el.setAttribute('transform', `translate(${waitX},${WAITING_CARD_Y})`);
      newCard.pointerDot.setAttribute('fill', 'none');
      newCard.pointerDot.setAttribute('stroke', colors.textMuted);
      newCard.pointerDot.setAttribute('stroke-dasharray', '2 2');

      setStagePip(1);
      setCaption('새 카드의 손가락을 옛 첫 카드로 묶었다.', { duration: stage1 + 400 });

      // 1단계: 새 카드 next → 옛 첫 카드 호.
      let arc1: { remove: () => void; promise: Promise<void> } | null = null;
      if (oldHead) {
        const fromX = waitX + CARD_W / 2 - 2;
        const fromY = WAITING_CARD_Y;
        const toX = slotCenterX(oldHead.slot) - CARD_W / 2 - 2;
        const toY = cardCenterY();
        arc1 = drawHighlightArc(fromX, fromY, toX, toY, stage1, colors.itemActive);
        await arc1.promise;
      } else {
        await sleep(stage1 / 2);
      }

      setStagePip(2);
      setCaption('head 라벨이 새 카드 위로 활주했다.', { duration: stage2 + 600 });
      await sleep(pause);

      // 2단계: 새 카드만 자기 슬롯 자리로 하강 + head 라벨이 옛 첫 카드 → 새 카드 활주.
      // 옛 카드들은 가만 (연결 리스트는 카드를 옮기지 않는다).
      const moveDur = stage2;
      const promises: Promise<void>[] = [];

      newCard.pointerDot.setAttribute('fill', colors.text);
      newCard.pointerDot.setAttribute('stroke-dasharray', '');
      const newToX = slotCenterX(newSlot);
      promises.push(
        animateTransform(newCard.el, waitX, WAITING_CARD_Y, newToX, cardCenterY(), moveDur),
      );
      nodes.unshift(newCard);

      const headFrom = oldHead ? slotCenterX(oldHead.slot) : slotCenterX(0);
      const headTo = slotCenterX(newSlot);
      promises.push(
        new Promise<void>((resolve) => {
          const start = performance.now();
          function tick(now: number): void {
            const t = Math.min(1, (now - start) / Math.max(10, moveDur));
            const e = easeInOut(t);
            const x = headFrom + (headTo - headFrom) * e;
            headGroup.setAttribute('transform', `translate(${x},0)`);
            if (t < 1) raf(tick);
            else resolve();
          }
          raf(tick);
        }),
      );

      await Promise.all(promises);

      refreshArrowsToSlots();
      repositionHead();
      repositionNull();

      await sleep(HIGHLIGHT_AFTERGLOW_MS);
      if (arc1) arc1.remove();
      setStagePip(0);

      // 좌측 캔버스 보정 — 가장 왼쪽 카드가 슬롯 0 자리에 오도록 사슬 전체를 우측 슬라이드.
      await normalizeChainSlide();
    }

    /** 인덱스 idx 카드 제거. 단일 화살표 갈아 끼움 + 카드 페이드아웃. */
    async function removeAt(idx: number, opts?: { duration?: number }): Promise<void> {
      const dur = opts?.duration ?? REMOVE_MS;
      const target = nodes[idx];
      if (!target) return;
      // head case 는 별도 메서드. idx === 0 이면 removeHead 로 위임.
      if (idx === 0) {
        await removeHead({ duration: dur });
        return;
      }

      setStagePip(0);
      setCaption('이전 카드의 손가락을 다음 카드로 곧장 옮겨 끼웠다.', { duration: dur + 600 });

      const prev = nodes[idx - 1]!;
      const next = nodes[idx + 1] ?? null;

      // 강조 호: prev.next 우측 → (다음 카드 좌측 또는 NULL 자리).
      const fromX = nextCellRightX(prev.slot) + 2;
      const fromY = cardCenterY();
      const toX = next
        ? slotCenterX(next.slot) - CARD_W / 2 - 2
        : nextCellRightX(target.slot) + CARD_GAP - 8;
      const toY = cardCenterY();
      const arc = drawHighlightArc(fromX, fromY, toX, toY, dur * 0.5, colors.itemActive);

      // 옛 prev → target 화살표 페이드아웃.
      const oldArr = arrows[idx - 1];
      const promises: Promise<void>[] = [arc.promise];
      if (oldArr) {
        oldArr.line.setAttribute('stroke-dasharray', '4 3');
        promises.push(fadeStrokeOpacity(oldArr.el, 1, 0, dur * 0.5));
      }
      // target 카드 페이드아웃 + 위로 떠오름.
      const fadePromise = new Promise<void>((resolve) => {
        const cur = target.el.getAttribute('transform') ?? '';
        const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(cur);
        const fx = m ? Number(m[1]) : 0;
        const fy = m ? Number(m[2]) : 0;
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, dur * 0.6));
          const e = easeInOut(t);
          const y = fy - 30 * e;
          target.el.setAttribute('opacity', String(1 - e));
          target.el.setAttribute('transform', `translate(${fx},${y})`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
      promises.push(fadePromise);

      await Promise.all(promises);

      // 데이터 모델 갱신: target 제거 + 우측 카드들 슬롯 -1.
      target.el.remove();
      nodes.splice(idx, 1);
      const slidePromises: Promise<void>[] = [];
      for (let i = idx; i < nodes.length; i++) {
        const n = nodes[i]!;
        const fromXi = slotCenterX(n.slot);
        n.slot = n.slot - 1;
        const toXi = slotCenterX(n.slot);
        slidePromises.push(
          animateTransform(n.el, fromXi, cardCenterY(), toXi, cardCenterY(), dur * 0.4),
        );
      }
      await Promise.all(slidePromises);

      refreshArrowsToSlots();
      repositionHead();
      repositionNull();

      await sleep(HIGHLIGHT_AFTERGLOW_MS);
      arc.remove();
    }

    async function removeHead(opts?: { duration?: number }): Promise<void> {
      const dur = opts?.duration ?? REMOVE_MS;
      const oldHead = nodes[0];
      if (!oldHead) return;

      setStagePip(0);
      setCaption('head 라벨이 두 번째 카드 위로 활주했다.', { duration: dur + 600 });

      const second = nodes[1] ?? null;

      // head 라벨 활주: 옛 첫 카드 자리 → 두 번째 카드 자리. 옛 카드들 슬롯은 그대로.
      const headFrom = slotCenterX(oldHead.slot);
      const headTo = second ? slotCenterX(second.slot) : slotCenterX(oldHead.slot);
      const headPromise = new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, dur * 0.6));
          const e = easeInOut(t);
          const x = headFrom + (headTo - headFrom) * e;
          headGroup.setAttribute('transform', `translate(${x},0)`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });

      // oldHead 제자리 페이드아웃 + 위로 떠오름.
      const fadePromise = new Promise<void>((resolve) => {
        const fx = slotCenterX(oldHead.slot);
        const fy = cardCenterY();
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, dur * 0.6));
          const e = easeInOut(t);
          const y = fy - 30 * e;
          oldHead.el.setAttribute('opacity', String(1 - e));
          oldHead.el.setAttribute('transform', `translate(${fx},${y})`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });

      await Promise.all([headPromise, fadePromise]);

      // 데이터 갱신: oldHead 제거. 다른 카드 슬롯은 그대로 (절대 좌표).
      oldHead.el.remove();
      nodes.shift();

      refreshArrowsToSlots();
      repositionHead();
      repositionNull();
    }

    function searchPrepare(): void {
      walkedCount = 0;
      // 발자국 정리.
      while (footstepGroup.firstChild) footstepGroup.firstChild.remove();
    }

    async function searchStep(
      idx: number,
      isMatch: boolean,
      isFinal: boolean,
      opts?: { duration?: number },
    ): Promise<void> {
      const dur = opts?.duration ?? SEARCH_STEP_MS;
      const node = nodes[idx];
      if (!node) return;
      walkedCount += 1;

      // 발자국 동심원 — 카드 위 (CHAIN_TOP - 12) 자리.
      const ringCx = slotCenterX(node.slot);
      const ringCy = CHAIN_TOP - 14;
      const ring = document.createElementNS(SVG_NS, 'circle');
      setAttrs(ring, {
        cx: ringCx,
        cy: ringCy,
        r: 4,
        fill: 'none',
        stroke: colors.itemActive,
        'stroke-width': '2',
        opacity: '1',
      });
      footstepGroup.appendChild(ring);
      // 동심원 펴짐 + 페이드아웃.
      const ringStart = performance.now();
      const ringDur = FOOTSTEP_FADE_MS;
      (function tickRing(): void {
        function step(now: number): void {
          const t = Math.min(1, (now - ringStart) / ringDur);
          const r = 4 + 8 * t;
          ring.setAttribute('r', String(r));
          ring.setAttribute('opacity', String(1 - t));
          if (t < 1) raf(step);
          else ring.remove();
        }
        raf(step);
      })();

      // 카드 본체 깜빡 + 캡션 카운터.
      const orig = node.bodyRect.getAttribute('fill');
      node.bodyRect.setAttribute('stroke', colors.itemActive);
      node.bodyRect.setAttribute('stroke-width', '2.5');
      if (isMatch) {
        node.bodyRect.setAttribute('fill', colors.itemActive);
      } else {
        node.bodyRect.setAttribute('fill', colors.itemComparing);
      }
      setCaption(`지금까지 ${walkedCount} 칸 걸었다.`, { duration: dur + 200 });

      await sleep(dur);

      if (!isMatch) {
        node.bodyRect.setAttribute('fill', orig ?? cardColors[node.colorIdx]!);
        node.bodyRect.setAttribute('stroke', colors.text);
        node.bodyRect.setAttribute('stroke-width', '1.5');
      } else {
        // 일치 — 강조 유지. afterglow 후 복귀.
        await sleep(HIGHLIGHT_AFTERGLOW_MS);
        node.bodyRect.setAttribute('fill', orig ?? cardColors[node.colorIdx]!);
        node.bodyRect.setAttribute('stroke', colors.text);
        node.bodyRect.setAttribute('stroke-width', '1.5');
      }

      if (isFinal && !isMatch) {
        // NULL X 빨갛게 깜빡.
        signalOutOfRange({ duration: 320 });
      }
    }

    function searchResult(
      found: boolean,
      idx: number | undefined,
      value: string,
      walked: number,
    ): void {
      if (found && typeof idx === 'number') {
        setCaption(`${walked} 칸 만에 찾았다 — 인덱스 ${idx} 의 ${value}`, { duration: 2000 });
      } else {
        setCaption('끝까지 갔지만 그 값은 없었다.', { duration: 2000 });
      }
    }

    function signalOutOfRange(opts?: { duration?: number }): void {
      const dur = opts?.duration ?? 320;
      // NULL 표식 빨간 깜빡.
      const orig = nullX.getAttribute('fill') ?? colors.danger;
      nullX.setAttribute('fill', colors.danger);
      const origSize = nullX.getAttribute('font-size') ?? fontSizes.lg;
      nullX.setAttribute('font-size', fontSizes.xl);
      setTimeout(() => {
        nullX.setAttribute('fill', orig);
        nullX.setAttribute('font-size', origSize);
      }, dur);
    }

    function signalEmpty(opts?: { duration?: number }): void {
      const dur = opts?.duration ?? 320;
      const orig = headLabel.getAttribute('fill') ?? colors.text;
      headLabel.setAttribute('fill', colors.danger);
      headEmptyX.setAttribute('opacity', '1');
      setTimeout(() => {
        headLabel.setAttribute('fill', orig);
        if (nodes.length > 0) headEmptyX.setAttribute('opacity', '0');
      }, dur);
    }

    return {
      destroy() {
        clearCaptionTimer();
        if (root.parentElement) root.remove();
      },
      reset,
      init,
      setBaseCaption,
      setCaption,
      setStage,
      insertAt,
      insertHead,
      removeAt,
      removeHead,
      searchPrepare,
      searchStep,
      searchResult,
      signalOutOfRange,
      signalEmpty,
    };
  },
};

