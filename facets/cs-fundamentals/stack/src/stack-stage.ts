/**
 * stack-stage View — Stack(LIFO) 자료구조 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 입력 트랙 / 수직 박스 더미 / 출력 트랙 / 꼭대기 라벨 / 캡션 영역을
 * 모두 담는다. 곡선 운동이 트랙과 더미 경계를 가로지르므로 분리 불가.
 *
 * 메서드 (projector → view):
 *   - reset()                                       — 빈 상태로 복귀.
 *   - setBaseCaption(text)                          — 상단 개념 한 줄 (회색).
 *   - setCaption(text, opts?)                       — 사건 메시지 일시 표시.
 *   - feedInput(items)                              — 입력 트랙에 자동 시연 박스 일괄 배치.
 *   - pushFromInput(opts?)                          — 입력 트랙 우측 박스 → 더미 꼭대기 곡선 운동.
 *   - pushFresh(item, opts?)                        — 새 박스 입력 트랙 우측 spawn 후 즉시 pushFromInput.
 *   - pop(opts?)                                    — 더미 꼭대기 → 출력 트랙 좌측 곡선 운동.
 *   - pulseTop(opts?)                               — 꼭대기 박스 둘레 동심원 + 색 깜빡 (peek).
 *   - signalUnderflow(opts?)                        — 좌우 흔들림 + 꼭대기 라벨 빨간 깜빡.
 *   - signalOverflow(label, opts?)                  — 윗변 위 빨간 점선 + 입력 박스 튕김.
 *   - getStackSize()                                — 디버깅용.
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import {
  getColors,
  categorical,
  depthVeil,
  fonts,
  fontSizes,
} from '@facet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 680;
const H = 400;
const CAPTION_H = 56;
const FLOOR_Y = 360;

const BOX_W = 84;
const BOX_H = 36;
const TRACK_BOX_W = 30;
const TRACK_BOX_H = 26;

const STACK_CENTER_X = 340;
const STACK_LEFT = STACK_CENTER_X - BOX_W / 2;
const INPUT_TRACK_LEFT = 30;
const INPUT_TRACK_RIGHT = 210;
const OUTPUT_TRACK_LEFT = 470;
const OUTPUT_TRACK_RIGHT = 650;
const TRACK_BOX_GAP = 8;
const TRACK_BOX_Y_CENTER = FLOOR_Y - TRACK_BOX_H / 2;

const MAX_STACK_HEIGHT = 8;
const TRACK_VISIBLE = 5;

/**
 * 박스 정체성 (기획 §5.4) — 입력 시점 stamp%N 으로 6 색 순환.
 * 색은 코어 디자인 토큰 `categorical(6, 'vivid')` 에서 받아온다 (OKLCH
 * 등간격 hue, vivid 톤). facet 코드에 색 리터럴을 박지 않는다.
 */
const PALETTE_SIZE = 6;
const PALETTE: readonly string[] = categorical(PALETTE_SIZE, 'vivid');

function raf(cb: (t: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** 베지어 곡선 (시작 → 위로 부풂 → 끝). 운동 경로의 정체성 (기획 §5.3). */
function animateAlongArc(
  el: SVGGElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  duration: number,
  arcLift = 80,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const ctrl = {
      x: (from.x + to.x) / 2,
      y: Math.min(from.y, to.y) - arcLift,
    };
    function tick(now: number): void {
      const t = Math.min(1, (now - start) / Math.max(10, duration));
      const e = easeInOut(t);
      const x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * ctrl.x + e * e * to.x;
      const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * ctrl.y + e * e * to.y;
      el.setAttribute('transform', `translate(${x},${y})`);
      if (t < 1) raf(tick);
      else resolve();
    }
    raf(tick);
  });
}

/** 직선 운동 — 트랙 내 시프트, 더미 압축 등. */
function animateLinear(
  el: SVGGElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  duration: number,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    function tick(now: number): void {
      const t = Math.min(1, (now - start) / Math.max(10, duration));
      const e = easeInOut(t);
      const x = from.x + (to.x - from.x) * e;
      const y = from.y + (to.y - from.y) * e;
      el.setAttribute('transform', `translate(${x},${y})`);
      if (t < 1) raf(tick);
      else resolve();
    }
    raf(tick);
  });
}

type Box = {
  stamp: number;
  label: string;
  el: SVGGElement;
  rect: SVGRectElement;
  text: SVGTextElement;
  veil: SVGRectElement;
};

function pickColor(stamp: number): string {
  const i = ((stamp - 1) % PALETTE_SIZE + PALETTE_SIZE) % PALETTE_SIZE;
  return PALETTE[i]!;
}

export const stackStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const colors = getColors(params.theme);

    const root = document.createElement('div');
    root.className = 'facet-stack-stage';
    root.style.fontFamily = fonts.body;
    root.style.color = colors.text;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = `${W}px`;
    svg.style.display = 'block';
    svg.style.background = colors.bgSubtle;

    // === 캡션 ===
    const baseCaptionEl = document.createElementNS(SVG_NS, 'text');
    baseCaptionEl.setAttribute('x', '20');
    baseCaptionEl.setAttribute('y', '22');
    baseCaptionEl.setAttribute('fill', colors.textMuted);
    baseCaptionEl.setAttribute('font-size', fontSizes.sm);
    baseCaptionEl.setAttribute('font-family', fonts.body);
    baseCaptionEl.textContent = '';

    const eventCaptionEl = document.createElementNS(SVG_NS, 'text');
    eventCaptionEl.setAttribute('x', '20');
    eventCaptionEl.setAttribute('y', '44');
    eventCaptionEl.setAttribute('fill', colors.text);
    eventCaptionEl.setAttribute('font-size', fontSizes.md);
    eventCaptionEl.setAttribute('font-family', fonts.body);
    eventCaptionEl.setAttribute('font-weight', '600');
    eventCaptionEl.textContent = '';

    svg.append(baseCaptionEl, eventCaptionEl);

    // === 본체 영역 그룹 (흔들림 transform 대상) ===
    const stageGroup = document.createElementNS(SVG_NS, 'g');
    stageGroup.setAttribute('transform', 'translate(0,0)');
    svg.appendChild(stageGroup);

    // 바닥선
    const floorLine = document.createElementNS(SVG_NS, 'line');
    floorLine.setAttribute('x1', '20');
    floorLine.setAttribute('x2', String(W - 20));
    floorLine.setAttribute('y1', String(FLOOR_Y));
    floorLine.setAttribute('y2', String(FLOOR_Y));
    floorLine.setAttribute('stroke', colors.border);
    floorLine.setAttribute('stroke-width', '1.5');
    stageGroup.appendChild(floorLine);

    // 트랙 점선 안내
    function makeTrackOutline(x1: number, x2: number): SVGRectElement {
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('x', String(x1));
      r.setAttribute('y', String(CAPTION_H + 16));
      r.setAttribute('width', String(x2 - x1));
      r.setAttribute('height', String(FLOOR_Y - (CAPTION_H + 16)));
      r.setAttribute('fill', 'none');
      r.setAttribute('stroke', colors.border);
      r.setAttribute('stroke-dasharray', '3 4');
      r.setAttribute('stroke-width', '1');
      r.setAttribute('rx', '4');
      return r;
    }
    stageGroup.appendChild(makeTrackOutline(INPUT_TRACK_LEFT, INPUT_TRACK_RIGHT));
    stageGroup.appendChild(makeTrackOutline(OUTPUT_TRACK_LEFT, OUTPUT_TRACK_RIGHT));

    // 트랙 라벨
    function makeTrackLabel(text: string, x: number): SVGTextElement {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(x));
      t.setAttribute('y', String(CAPTION_H + 8));
      t.setAttribute('fill', colors.textMuted);
      t.setAttribute('font-size', fontSizes.xs);
      t.setAttribute('font-family', fonts.body);
      t.setAttribute('text-anchor', 'middle');
      t.textContent = text;
      return t;
    }
    stageGroup.appendChild(makeTrackLabel('입력', (INPUT_TRACK_LEFT + INPUT_TRACK_RIGHT) / 2));
    stageGroup.appendChild(makeTrackLabel('출력', (OUTPUT_TRACK_LEFT + OUTPUT_TRACK_RIGHT) / 2));

    // 더미 영역 시각 안내 (가는 외곽선)
    const stackOutline = document.createElementNS(SVG_NS, 'rect');
    stackOutline.setAttribute('x', String(STACK_LEFT - 8));
    stackOutline.setAttribute('y', String(CAPTION_H + 16));
    stackOutline.setAttribute('width', String(BOX_W + 16));
    stackOutline.setAttribute('height', String(FLOOR_Y - (CAPTION_H + 16)));
    stackOutline.setAttribute('fill', 'none');
    stackOutline.setAttribute('stroke', colors.border);
    stackOutline.setAttribute('stroke-width', '1');
    stackOutline.setAttribute('rx', '4');
    stageGroup.appendChild(stackOutline);

    // 동적 박스를 담을 그룹 (z-order: 박스 → 꼭대기 라벨)
    const boxLayer = document.createElementNS(SVG_NS, 'g');
    stageGroup.appendChild(boxLayer);

    // 꼭대기 라벨 (화살표 + 텍스트). transform 으로 위치만 갱신.
    const topMarker = document.createElementNS(SVG_NS, 'g');
    topMarker.setAttribute('transform', `translate(${STACK_CENTER_X},${FLOOR_Y - 8})`);

    const topArrow = document.createElementNS(SVG_NS, 'path');
    // 아래를 가리키는 두꺼운 화살표 (꼭대기에서 박스 향함)
    topArrow.setAttribute('d', 'M-7,-22 L7,-22 L7,-10 L13,-10 L0,4 L-13,-10 L-7,-10 Z');
    topArrow.setAttribute('fill', colors.text);
    topMarker.appendChild(topArrow);

    const topLabel = document.createElementNS(SVG_NS, 'text');
    topLabel.setAttribute('x', '0');
    topLabel.setAttribute('y', '-32');
    topLabel.setAttribute('fill', colors.text);
    topLabel.setAttribute('font-size', fontSizes.sm);
    topLabel.setAttribute('font-family', fonts.body);
    topLabel.setAttribute('font-weight', '600');
    topLabel.setAttribute('text-anchor', 'middle');
    topLabel.textContent = '꼭대기';

    const topSubLabel = document.createElementNS(SVG_NS, 'text');
    topSubLabel.setAttribute('x', '0');
    topSubLabel.setAttribute('y', '-46');
    topSubLabel.setAttribute('fill', colors.textMuted);
    topSubLabel.setAttribute('font-size', fontSizes.xs);
    topSubLabel.setAttribute('font-family', fonts.body);
    topSubLabel.setAttribute('text-anchor', 'middle');
    topSubLabel.textContent = '비어 있음';

    topMarker.append(topLabel, topSubLabel);
    stageGroup.appendChild(topMarker);

    // 강조 ring (peek 동심원). 평소엔 숨김.
    const pulseRing = document.createElementNS(SVG_NS, 'circle');
    pulseRing.setAttribute('cx', String(STACK_CENTER_X));
    pulseRing.setAttribute('cy', '0');
    pulseRing.setAttribute('r', '0');
    pulseRing.setAttribute('fill', 'none');
    pulseRing.setAttribute('stroke', colors.accent);
    pulseRing.setAttribute('stroke-width', '2');
    pulseRing.setAttribute('opacity', '0');
    stageGroup.appendChild(pulseRing);

    // 오버플로 표시 — 윗변 위 빨간 점선 (평소 숨김)
    const overflowMark = document.createElementNS(SVG_NS, 'rect');
    overflowMark.setAttribute('x', String(STACK_LEFT));
    overflowMark.setAttribute('width', String(BOX_W));
    overflowMark.setAttribute('height', String(BOX_H));
    overflowMark.setAttribute('fill', 'none');
    overflowMark.setAttribute('stroke', colors.danger);
    overflowMark.setAttribute('stroke-width', '2');
    overflowMark.setAttribute('stroke-dasharray', '4 3');
    overflowMark.setAttribute('rx', '4');
    overflowMark.setAttribute('opacity', '0');
    stageGroup.appendChild(overflowMark);

    root.appendChild(svg);
    container.appendChild(root);

    // === 상태 ===
    const stackBoxes: Box[] = []; // bottom → top
    const inputBoxes: Box[] = []; // 좌(가장 오래됨) → 우(다음 차례)
    const outputBoxes: Box[] = []; // 좌(가장 먼저 떼어짐) → 우
    let captionTimer: ReturnType<typeof setTimeout> | null = null;

    function clearCaptionTimer(): void {
      if (captionTimer !== null) {
        clearTimeout(captionTimer);
        captionTimer = null;
      }
    }

    // === 박스 생성 ===
    function makeBox(stamp: number, label: string, kind: 'stack' | 'track'): Box {
      const el = document.createElementNS(SVG_NS, 'g');
      const w = kind === 'stack' ? BOX_W : TRACK_BOX_W;
      const h = kind === 'stack' ? BOX_H : TRACK_BOX_H;

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(-w / 2));
      rect.setAttribute('y', String(-h / 2));
      rect.setAttribute('width', String(w));
      rect.setAttribute('height', String(h));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', pickColor(stamp));
      rect.setAttribute('stroke', colors.text);
      rect.setAttribute('stroke-width', '1');
      el.appendChild(rect);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', '0');
      text.setAttribute('y', '0');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', fonts.mono);
      text.setAttribute('font-size', kind === 'stack' ? fontSizes.md : fontSizes.xs);
      text.setAttribute('font-weight', '600');
      text.setAttribute('fill', colors.text);
      text.textContent = label;
      el.appendChild(text);

      const veil = document.createElementNS(SVG_NS, 'rect');
      veil.setAttribute('x', String(-w / 2));
      veil.setAttribute('y', String(-h / 2));
      veil.setAttribute('width', String(w));
      veil.setAttribute('height', String(h));
      veil.setAttribute('rx', '4');
      veil.setAttribute('fill', depthVeil(0, params.theme).fill);
      veil.setAttribute('opacity', '0');
      veil.setAttribute('pointer-events', 'none');
      el.appendChild(veil);

      boxLayer.appendChild(el);
      return { stamp, label, el, rect, text, veil };
    }

    // === 좌표 계산 ===
    function stackBoxCenter(idxFromBottom: number): { x: number; y: number } {
      // 박스 중심 y: 바닥에서 위로 i 칸 쌓일 때
      const y = FLOOR_Y - 4 - BOX_H / 2 - idxFromBottom * BOX_H;
      return { x: STACK_CENTER_X, y };
    }

    function inputBoxCenter(visibleIdx: number, total: number): { x: number; y: number } {
      const totalShown = Math.min(total, TRACK_VISIBLE);
      const trackCenter = (INPUT_TRACK_LEFT + INPUT_TRACK_RIGHT) / 2;
      const rowWidth = totalShown * TRACK_BOX_W + (totalShown - 1) * TRACK_BOX_GAP;
      const startX = trackCenter - rowWidth / 2 + TRACK_BOX_W / 2;
      const x = startX + visibleIdx * (TRACK_BOX_W + TRACK_BOX_GAP);
      return { x, y: TRACK_BOX_Y_CENTER };
    }

    function outputBoxCenter(visibleIdx: number, total: number): { x: number; y: number } {
      const totalShown = Math.min(total, TRACK_VISIBLE);
      const trackCenter = (OUTPUT_TRACK_LEFT + OUTPUT_TRACK_RIGHT) / 2;
      const rowWidth = totalShown * TRACK_BOX_W + (totalShown - 1) * TRACK_BOX_GAP;
      const startX = trackCenter - rowWidth / 2 + TRACK_BOX_W / 2;
      const x = startX + visibleIdx * (TRACK_BOX_W + TRACK_BOX_GAP);
      return { x, y: TRACK_BOX_Y_CENTER };
    }

    // === 레이아웃 (즉시 배치) ===
    function layoutStack(): void {
      const n = stackBoxes.length;
      for (let i = 0; i < n; i++) {
        const box = stackBoxes[i];
        const c = stackBoxCenter(i);
        box.el.setAttribute('transform', `translate(${c.x},${c.y})`);
        // 깊이 (꼭대기 = depth 0)
        const depth = n - 1 - i;
        const { alpha } = depthVeil(depth, params.theme);
        box.veil.setAttribute('opacity', String(alpha));
      }
      updateTopMarker();
    }

    function layoutInputTrack(): void {
      const n = inputBoxes.length;
      for (let i = 0; i < n; i++) {
        const box = inputBoxes[i];
        const c = inputBoxCenter(i, n);
        box.el.setAttribute('transform', `translate(${c.x},${c.y})`);
      }
    }

    function layoutOutputTrack(): void {
      const n = outputBoxes.length;
      for (let i = 0; i < n; i++) {
        const box = outputBoxes[i];
        const c = outputBoxCenter(i, n);
        box.el.setAttribute('transform', `translate(${c.x},${c.y})`);
      }
    }

    function updateTopMarker(): void {
      const n = stackBoxes.length;
      if (n === 0) {
        topMarker.setAttribute('transform', `translate(${STACK_CENTER_X},${FLOOR_Y - 8})`);
        topLabel.setAttribute('fill', colors.textMuted);
        topSubLabel.setAttribute('opacity', '1');
        topArrow.setAttribute('fill', colors.textMuted);
      } else {
        const c = stackBoxCenter(n - 1);
        topMarker.setAttribute('transform', `translate(${STACK_CENTER_X},${c.y - BOX_H / 2})`);
        topLabel.setAttribute('fill', colors.text);
        topSubLabel.setAttribute('opacity', '0');
        topArrow.setAttribute('fill', colors.text);
      }
    }

    // === 메서드 구현 ===
    function reset(): void {
      clearCaptionTimer();
      // 박스 모두 제거
      for (const b of stackBoxes) b.el.remove();
      for (const b of inputBoxes) b.el.remove();
      for (const b of outputBoxes) b.el.remove();
      stackBoxes.length = 0;
      inputBoxes.length = 0;
      outputBoxes.length = 0;
      eventCaptionEl.textContent = '';
      eventCaptionEl.setAttribute('fill', colors.text);
      pulseRing.setAttribute('opacity', '0');
      overflowMark.setAttribute('opacity', '0');
      stageGroup.setAttribute('transform', 'translate(0,0)');
      updateTopMarker();
    }

    function setBaseCaption(text: string): void {
      baseCaptionEl.textContent = text;
    }

    function setCaption(text: string, opts?: { duration?: number }): void {
      clearCaptionTimer();
      eventCaptionEl.textContent = text;
      eventCaptionEl.setAttribute('fill', colors.text);
      const dur = opts?.duration ?? 1600;
      captionTimer = setTimeout(() => {
        eventCaptionEl.textContent = '';
        captionTimer = null;
      }, dur);
    }

    function feedInput(items: Array<{ stamp: number; label: string }>): void {
      for (const it of items) {
        const box = makeBox(it.stamp, it.label, 'track');
        inputBoxes.push(box);
      }
      layoutInputTrack();
    }

    async function pushFromInput(opts?: { duration?: number }): Promise<void> {
      if (inputBoxes.length === 0) return;
      const duration = opts?.duration ?? 400;
      const item = inputBoxes.pop();
      if (!item) return;
      // 시작점: 현재 위치
      const fromCenter = inputBoxCenter(inputBoxes.length, inputBoxes.length + 1);
      // 트랙 박스(작음) → 더미 박스(큼) 로 시각 변환: 새 박스를 더미 크기로 spawn,
      // 작은 박스는 그 자리에 잠시 두고 페이드아웃, 새 박스가 곡선 운동.
      item.el.remove();
      const stackBox = makeBox(item.stamp, item.label, 'stack');
      const targetIdx = stackBoxes.length;
      const target = stackBoxCenter(targetIdx);
      stackBox.el.setAttribute('transform', `translate(${fromCenter.x},${fromCenter.y})`);
      // 동시에 트랙 시프트 (남은 박스들 재배치)
      layoutInputTrack();
      await animateAlongArc(stackBox.el, fromCenter, target, duration);
      stackBoxes.push(stackBox);
      layoutStack();
    }

    async function pushFresh(
      item: { stamp: number; label: string },
      opts?: { duration?: number },
    ): Promise<void> {
      // 입력 트랙 우측에 작은 박스 spawn → 곧바로 pushFromInput.
      const trackBox = makeBox(item.stamp, item.label, 'track');
      inputBoxes.push(trackBox);
      layoutInputTrack();
      await pushFromInput(opts);
    }

    async function pop(opts?: { duration?: number }): Promise<void> {
      if (stackBoxes.length === 0) return;
      const duration = opts?.duration ?? 400;
      const top = stackBoxes.pop();
      if (!top) return;
      const from = stackBoxCenter(stackBoxes.length);
      // 출력 트랙 좌측에 새 자리 (남은 박스는 우측으로 시프트)
      // 새 박스는 출력 트랙 인덱스 0 (가장 좌측). 기존 박스들은 +1 자리로 이동.
      // 더미 박스(큼) → 트랙 박스(작음). 동일 박스 element 재사용 — 운동 끝에 trackBox 로 교체.
      const targetIdx = 0;
      const targetTotal = outputBoxes.length + 1;
      const target = outputBoxCenter(targetIdx, targetTotal);
      // 기존 출력 박스 시프트 (애니메이션)
      const shiftPromises: Promise<void>[] = [];
      for (let i = 0; i < outputBoxes.length; i++) {
        const ob = outputBoxes[i];
        const newC = outputBoxCenter(i + 1, targetTotal);
        const m = ob.el.getAttribute('transform') ?? '';
        const match = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(m);
        const cur = match ? { x: Number(match[1]), y: Number(match[2]) } : newC;
        shiftPromises.push(animateLinear(ob.el, cur, newC, duration));
      }
      // top 박스는 큰 형태 그대로 곡선 운동. 안착 후 작은 트랙 박스로 교체.
      // depth veil 즉시 0
      top.veil.setAttribute('opacity', '0');
      const arcPromise = animateAlongArc(top.el, from, target, duration);
      // 더미 잔여 박스의 깊이 명도 갱신 (꼭대기가 변하므로)
      layoutStack();
      await Promise.all([arcPromise, ...shiftPromises]);
      // 큰 박스 제거 후 작은 트랙 박스로 교체.
      top.el.remove();
      const trackBox = makeBox(top.stamp, top.label, 'track');
      trackBox.el.setAttribute('transform', `translate(${target.x},${target.y})`);
      outputBoxes.unshift(trackBox);
      // 가장자리 페이드: TRACK_VISIBLE 초과 시 가장 오른쪽 박스 페이드아웃 후 제거.
      while (outputBoxes.length > TRACK_VISIBLE) {
        const dropped = outputBoxes.pop();
        if (dropped) dropped.el.remove();
      }
      layoutOutputTrack();
    }

    async function pulseTop(opts?: { duration?: number }): Promise<void> {
      if (stackBoxes.length === 0) return;
      const duration = opts?.duration ?? 250;
      const top = stackBoxes[stackBoxes.length - 1];
      const c = stackBoxCenter(stackBoxes.length - 1);
      pulseRing.setAttribute('cx', String(c.x));
      pulseRing.setAttribute('cy', String(c.y));
      // ring 확장
      const start = performance.now();
      const r0 = BOX_W / 2 + 4;
      const r1 = BOX_W / 2 + 30;
      // 색 깜빡 — 노랑 강조
      const origStroke = top.rect.getAttribute('stroke');
      top.rect.setAttribute('stroke', colors.accent);
      top.rect.setAttribute('stroke-width', '2.5');
      await new Promise<void>((resolve) => {
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          const e = easeInOut(t);
          pulseRing.setAttribute('r', String(r0 + (r1 - r0) * e));
          pulseRing.setAttribute('opacity', String(1 - e));
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
      pulseRing.setAttribute('opacity', '0');
      top.rect.setAttribute('stroke', origStroke ?? colors.text);
      top.rect.setAttribute('stroke-width', '1');
    }

    async function signalUnderflow(opts?: { duration?: number }): Promise<void> {
      const duration = opts?.duration ?? 300;
      const start = performance.now();
      // 라벨 빨간 깜빡
      topLabel.setAttribute('fill', colors.danger);
      topArrow.setAttribute('fill', colors.danger);
      await new Promise<void>((resolve) => {
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          // sin 진동 두 번
          const dx = Math.sin(t * Math.PI * 4) * (1 - t) * 6;
          stageGroup.setAttribute('transform', `translate(${dx},0)`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
      stageGroup.setAttribute('transform', 'translate(0,0)');
      updateTopMarker();
    }

    async function signalOverflow(label: string, opts?: { duration?: number }): Promise<void> {
      const duration = opts?.duration ?? 300;
      // 더미 윗변 위 빨간 점선 한 칸
      const overflowY = stackBoxCenter(MAX_STACK_HEIGHT - 1).y - BOX_H / 2 - BOX_H;
      overflowMark.setAttribute('y', String(overflowY));
      overflowMark.setAttribute('opacity', '1');
      // 입력 박스 튕김 — 새 박스를 만들어 더미 근처까지 갔다가 돌아옴.
      const stamp = -1; // 임시
      const ghost = makeBox(stamp, label, 'track');
      const startC = inputBoxCenter(inputBoxes.length, inputBoxes.length + 1);
      const reachC = { x: STACK_CENTER_X - BOX_W / 2 - 14, y: overflowY + BOX_H / 2 };
      ghost.el.setAttribute('transform', `translate(${startC.x},${startC.y})`);
      await animateAlongArc(ghost.el, startC, reachC, duration, 50);
      await animateAlongArc(ghost.el, reachC, startC, duration, 50);
      ghost.el.remove();
      overflowMark.setAttribute('opacity', '0');
    }

    // 초기 라벨/캡션 상태
    updateTopMarker();

    return {
      destroy() {
        clearCaptionTimer();
        if (root.parentElement) root.remove();
      },
      reset,
      setBaseCaption,
      setCaption,
      feedInput,
      pushFromInput,
      pushFresh,
      pop,
      pulseTop,
      signalUnderflow,
      signalOverflow,
      getStackSize(): number {
        return stackBoxes.length;
      },
      getInputSize(): number {
        return inputBoxes.length;
      },
      getOutputSize(): number {
        return outputBoxes.length;
      },
    };
  },
};
