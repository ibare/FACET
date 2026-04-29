/**
 * pubsub-stage View — Pub/Sub 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 캡션 / 박스 라인업 (좌:발행자 · 중:broker[events/alerts] · 우:구독자) /
 * 좌·우 분리 띠 / 두 줄의 broker 라이프라인 / 시간축 본체 (publish row 누적) /
 * subscribe·unsubscribe 매듭 / 우측 호출 트레이스 스트립 / 시각화 안 텍스트 / 참고 레퍼런스
 * 를 모두 담는다.
 *
 * 메서드 (projector → view):
 *   - reset()
 *   - init({ publishers, subscribers, topics, subscriptions })
 *   - setBaseCaption(text)
 *   - setCaption(text, opts?)
 *   - emitPublish(payload, opts?)        — 4 단계: pub→broker / 도착 펄스 / 사본 갈라짐 / 도착 부채꼴
 *   - emitSubscribe(payload, opts?)      — 매듭 안착 + 라이프라인 활성화
 *   - emitUnsubscribe(payload, opts?)    — 매듭 끊어짐 + 라이프라인 비활성화
 *   - emitSubscriberJoin(payload, opts?) — 새 구독자 박스 페이드인
 *   - signalInvalid(op, raw)
 *   - signalDemoEnd()
 *
 * 모든 운동 메서드는 Promise<void> 반환 — projector 가 await 한다.
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import {
  getColors,
  fonts,
  fontSizes,
  categorical,
} from '@facet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 560;

// ── 영역 분할 ──
const CAPTION_BASE_Y = 22;
const CAPTION_EVENT_Y = 44;

// 박스 라인업.
const BOX_TOP = 64;
const BOX_H = 28;
const BOX_W = 32;
const BOX_LABEL_Y = BOX_TOP + 18;

// 라이프라인.
const LIFELINE_TOP = BOX_TOP + BOX_H;
const LIFELINE_BOTTOM = 484;

// 시간축 본체 (publish row 누적).
const TIMELINE_TOP = LIFELINE_TOP + 16;
const TIMELINE_BOTTOM = LIFELINE_BOTTOM - 8;
const ROW_H = 38;
const SUB_DELIVER_GAP = 6;

// X 좌표 — 좌측 발행자 / 분리 띠 / broker 두 줄 / 분리 띠 / 우측 구독자.
const PUB_X: readonly number[] = [40, 78, 116];
const SEP_LEFT_X1 = 134;
const SEP_LEFT_X2 = 196;
const BROKER_EVENTS_X = 240;
const BROKER_ALERTS_X = 300;
const SEP_RIGHT_X1 = 338;
const SEP_RIGHT_X2 = 386;
const SUB_X_BASE = 412;
const SUB_GAP = 44;

// 트레이스 스트립.
const TRACE_LEFT = 580;
const TRACE_RIGHT = 712;
const TRACE_TOP = LIFELINE_TOP + 16;
const TRACE_BOTTOM = TIMELINE_BOTTOM;
const TRACE_LINE_H = 20;

// ── 시간 (ms) ──
const PUB_TO_BROKER_MS = 360;
const BROKER_HOLD_MS = 280;
const FANOUT_MS = 460;
const SUBSCRIBE_KNOT_MS = 320;

// ── 메시지 칩 ──
const CHIP_W = 18;
const CHIP_H = 14;

// ── 카테고리 색 — 발행자별 ──
const PUB_PALETTE_TONE = 'vivid' as const;
const PUB_PALETTE_SIZE = 6;

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

type SubscriberRec = {
  id: string;
  /** 라이프라인 X. */
  x: number;
  /** 박스 그룹. */
  boxEl: SVGGElement;
  /** 라이프라인 점선. */
  lifeline: SVGLineElement;
  /** events 토픽 구독 라이프라인 활성 구간 — 매듭이 찍힌 y 부터 끊어진 y 까지. */
  segments: Map<string, { startY: number; pathEl: SVGLineElement }>;
};

type TraceEntry = {
  el: SVGGElement;
  text: SVGTextElement;
  bg: SVGRectElement;
};

export const pubsubStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const pubColors = categorical(PUB_PALETTE_SIZE, PUB_PALETTE_TONE);

    const root = document.createElement('div');
    root.className = 'facet-pubsub-stage';
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

    // === 캡션 ===
    const baseCaption = document.createElementNS(SVG_NS, 'text');
    setAttrs(baseCaption, {
      x: 12,
      y: CAPTION_BASE_Y,
      fill: colors.textMuted,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
    });
    svg.appendChild(baseCaption);

    const eventCaption = document.createElementNS(SVG_NS, 'text');
    setAttrs(eventCaption, {
      x: 12,
      y: CAPTION_EVENT_Y,
      fill: colors.text,
      'font-size': fontSizes.md,
      'font-family': fonts.body,
      'font-weight': '600',
    });
    svg.appendChild(eventCaption);

    // === 분리 띠 (배경 두 영역) ===
    const sepLeft = document.createElementNS(SVG_NS, 'rect');
    setAttrs(sepLeft, {
      x: SEP_LEFT_X1,
      y: LIFELINE_TOP,
      width: SEP_LEFT_X2 - SEP_LEFT_X1,
      height: LIFELINE_BOTTOM - LIFELINE_TOP,
      fill: colors.subtreeShadeLeft,
    });
    svg.appendChild(sepLeft);

    const sepRight = document.createElementNS(SVG_NS, 'rect');
    setAttrs(sepRight, {
      x: SEP_RIGHT_X1,
      y: LIFELINE_TOP,
      width: SEP_RIGHT_X2 - SEP_RIGHT_X1,
      height: LIFELINE_BOTTOM - LIFELINE_TOP,
      fill: colors.subtreeShadeRight,
    });
    svg.appendChild(sepRight);

    // 분리 띠 라벨 (좌·우 영역 구분).
    const leftLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(leftLabel, {
      x: (SEP_LEFT_X1 + SEP_LEFT_X2) / 2,
      y: LIFELINE_TOP + 12,
      'text-anchor': 'middle',
      fill: colors.textMuted,
      'font-size': '9px',
      'font-family': fonts.body,
    });
    leftLabel.textContent = '발행자 영역';
    svg.appendChild(leftLabel);

    const rightLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(rightLabel, {
      x: (SEP_RIGHT_X1 + SEP_RIGHT_X2) / 2,
      y: LIFELINE_TOP + 12,
      'text-anchor': 'middle',
      fill: colors.textMuted,
      'font-size': '9px',
      'font-family': fonts.body,
    });
    rightLabel.textContent = '구독자 영역';
    svg.appendChild(rightLabel);

    // === broker 박스 (가운데 1급) ===
    const brokerBox = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(brokerBox);

    const brokerRect = document.createElementNS(SVG_NS, 'rect');
    const brokerLeft = BROKER_EVENTS_X - 14;
    const brokerRight = BROKER_ALERTS_X + 14;
    setAttrs(brokerRect, {
      x: brokerLeft,
      y: BOX_TOP - 4,
      width: brokerRight - brokerLeft,
      height: BOX_H + 8,
      fill: colors.bg,
      stroke: colors.text,
      'stroke-width': '1.5',
      rx: '4',
    });
    brokerBox.appendChild(brokerRect);

    const brokerLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(brokerLabel, {
      x: (brokerLeft + brokerRight) / 2,
      y: BOX_TOP - 8,
      'text-anchor': 'middle',
      fill: colors.text,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
      'font-weight': '700',
    });
    brokerLabel.textContent = 'broker';
    svg.appendChild(brokerLabel);

    // 토픽 라벨 (events / alerts).
    const eventsLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(eventsLabel, {
      x: BROKER_EVENTS_X,
      y: BOX_LABEL_Y,
      'text-anchor': 'middle',
      fill: colors.text,
      'font-size': '10px',
      'font-family': fonts.mono,
      'font-weight': '700',
    });
    eventsLabel.textContent = 'events';
    brokerBox.appendChild(eventsLabel);

    const alertsLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(alertsLabel, {
      x: BROKER_ALERTS_X,
      y: BOX_LABEL_Y,
      'text-anchor': 'middle',
      fill: colors.textMuted,
      'font-size': '9px',
      'font-family': fonts.mono,
      'font-weight': '700',
    });
    alertsLabel.textContent = 'alerts';
    brokerBox.appendChild(alertsLabel);

    // === 라이프라인 그룹 ===
    const lifelineGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(lifelineGroup);

    function makeLifeline(x: number, opts?: { aux?: boolean }): SVGLineElement {
      const line = document.createElementNS(SVG_NS, 'line');
      setAttrs(line, {
        x1: x,
        y1: LIFELINE_TOP,
        x2: x,
        y2: LIFELINE_BOTTOM,
        stroke: colors.border,
        'stroke-width': opts?.aux ? '0.8' : '1',
        'stroke-dasharray': '3 3',
      });
      lifelineGroup.appendChild(line);
      return line;
    }

    // === 발행자 박스 + 라이프라인 ===
    const pubBoxes = new Map<string, { x: number; el: SVGGElement }>();
    const pubColorByIndex = new Map<string, number>();

    function createPublisherBox(id: string, x: number, colorIdx: number): SVGGElement {
      const g = document.createElementNS(SVG_NS, 'g');
      const rect = document.createElementNS(SVG_NS, 'rect');
      setAttrs(rect, {
        x: x - BOX_W / 2,
        y: BOX_TOP,
        width: BOX_W,
        height: BOX_H,
        fill: pubColors[colorIdx % PUB_PALETTE_SIZE]!,
        stroke: colors.text,
        'stroke-width': '1',
        rx: '3',
      });
      g.appendChild(rect);
      const t = document.createElementNS(SVG_NS, 'text');
      setAttrs(t, {
        x,
        y: BOX_LABEL_Y,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      t.textContent = id;
      g.appendChild(t);
      svg.appendChild(g);
      return g;
    }

    // === 구독자 박스 + 라이프라인 ===
    const subBoxes = new Map<string, SubscriberRec>();
    let knownSubCount = 0;

    function createSubscriberBox(id: string, x: number): SubscriberRec {
      const g = document.createElementNS(SVG_NS, 'g');
      const rect = document.createElementNS(SVG_NS, 'rect');
      setAttrs(rect, {
        x: x - BOX_W / 2,
        y: BOX_TOP,
        width: BOX_W,
        height: BOX_H,
        fill: colors.bg,
        stroke: colors.text,
        'stroke-width': '1',
        rx: '3',
      });
      g.appendChild(rect);
      const t = document.createElementNS(SVG_NS, 'text');
      setAttrs(t, {
        x,
        y: BOX_LABEL_Y,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      t.textContent = id;
      g.appendChild(t);
      svg.appendChild(g);
      const lifeline = makeLifeline(x);
      return { id, x, boxEl: g, lifeline, segments: new Map() };
    }

    // === 시간축 보조 가로선 ===
    const tGridGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(tGridGroup);

    function drawTickAt(y: number, label: string): void {
      const line = document.createElementNS(SVG_NS, 'line');
      setAttrs(line, {
        x1: 12,
        y1: y,
        x2: TRACE_LEFT - 8,
        y2: y,
        stroke: colors.border,
        'stroke-width': '0.6',
        'stroke-dasharray': '2 4',
        opacity: '0.5',
      });
      tGridGroup.appendChild(line);
      const txt = document.createElementNS(SVG_NS, 'text');
      setAttrs(txt, {
        x: 6,
        y: y + 3,
        fill: colors.textMuted,
        'font-size': '8px',
        'font-family': fonts.mono,
      });
      txt.textContent = label;
      tGridGroup.appendChild(txt);
    }

    // === 시간 화살표 (시간 축 좌측 가장자리) ===
    const timeArrow = document.createElementNS(SVG_NS, 'g');
    {
      const a = document.createElementNS(SVG_NS, 'text');
      setAttrs(a, {
        x: 6,
        y: TIMELINE_TOP - 4,
        fill: colors.textMuted,
        'font-size': '8px',
        'font-family': fonts.body,
      });
      a.textContent = '시간';
      timeArrow.appendChild(a);
      const b = document.createElementNS(SVG_NS, 'text');
      setAttrs(b, {
        x: 6,
        y: TIMELINE_BOTTOM,
        fill: colors.textMuted,
        'font-size': '10px',
        'font-family': fonts.body,
      });
      b.textContent = '↓';
      timeArrow.appendChild(b);
    }
    svg.appendChild(timeArrow);

    // === 운동 누적 영역 ===
    const motionGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(motionGroup);

    // === 트레이스 스트립 ===
    const traceBg = document.createElementNS(SVG_NS, 'rect');
    setAttrs(traceBg, {
      x: TRACE_LEFT,
      y: TRACE_TOP,
      width: TRACE_RIGHT - TRACE_LEFT,
      height: TRACE_BOTTOM - TRACE_TOP,
      fill: colors.bg,
      stroke: colors.border,
      'stroke-width': '1',
      rx: '4',
    });
    svg.appendChild(traceBg);

    const traceTitle = document.createElementNS(SVG_NS, 'text');
    setAttrs(traceTitle, {
      x: TRACE_LEFT + 6,
      y: TRACE_TOP - 6,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
      'font-weight': '700',
    });
    traceTitle.textContent = '호출 트레이스';
    svg.appendChild(traceTitle);

    const traceGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(traceGroup);

    // === 레퍼런스 라벨 ===
    const refText = document.createElementNS(SVG_NS, 'text');
    setAttrs(refText, {
      x: 12,
      y: H - 24,
      fill: colors.textMuted,
      'font-size': '9px',
      'font-family': fonts.body,
    });
    refText.textContent =
      '참고: Hohpe — Publish-Subscribe Channel · MS Azure Architecture Center · GoF Observer · Aiven Kafka Visualization';
    svg.appendChild(refText);

    // === 시각화 안 텍스트 (하단 한 줄 narration) ===
    const narrative = document.createElementNS(SVG_NS, 'text');
    setAttrs(narrative, {
      x: 12,
      y: H - 8,
      fill: colors.text,
      'font-size': '9px',
      'font-family': fonts.body,
    });
    narrative.textContent =
      '발행자는 토픽에만 던지고 구독자는 토픽만 신청한다 — broker 가 사이에서 사본을 뿌리며 모든 화살표는 broker 라이프라인에서 한 번 끊어지고 다시 시작한다.';
    svg.appendChild(narrative);

    // === broker 라이프라인 (이벤트, alerts) ===
    const brokerEventsLine = makeLifeline(BROKER_EVENTS_X);
    const brokerAlertsLine = makeLifeline(BROKER_ALERTS_X, { aux: true });
    brokerEventsLine.setAttribute('stroke', colors.text);
    brokerEventsLine.setAttribute('stroke-width', '1.2');
    brokerAlertsLine.setAttribute('stroke', colors.textMuted);

    // ── 모델 상태 ──
    let rowCounter = 0;
    let captionTimer: ReturnType<typeof setTimeout> | null = null;
    /** topics 순서 (events 본 시각, alerts 보조). */
    let topicsList: string[] = [];
    const traces: TraceEntry[] = [];

    function clearCaptionTimer(): void {
      if (captionTimer !== null) clearTimeout(captionTimer);
      captionTimer = null;
    }

    function colorIndexOfPub(pubId: string): number {
      const cached = pubColorByIndex.get(pubId);
      if (cached !== undefined) return cached;
      let h = 0;
      for (let i = 0; i < pubId.length; i++) h = (h * 31 + pubId.charCodeAt(i)) >>> 0;
      const idx = h % PUB_PALETTE_SIZE;
      pubColorByIndex.set(pubId, idx);
      return idx;
    }

    function topicX(topic: string): number {
      if (topic === topicsList[0]) return BROKER_EVENTS_X;
      return BROKER_ALERTS_X;
    }

    function nextRowY(): number {
      rowCounter += 1;
      const y = TIMELINE_TOP + (rowCounter - 0.5) * ROW_H;
      // 보조 가로선 + 라벨.
      drawTickAt(y - ROW_H / 2 + 2, `t${rowCounter}`);
      // row가 너무 많아 timeline 을 벗어나면 위쪽 운동을 위로 페이드아웃.
      autoTrim();
      return y;
    }

    function autoTrim(): void {
      const maxRows = Math.floor((TIMELINE_BOTTOM - TIMELINE_TOP) / ROW_H);
      if (rowCounter <= maxRows) return;
      // 가장 위쪽 ROW_H 만큼 운동 그룹을 위로 밀어내고 첫 row 페이드아웃.
      const shift = ROW_H;
      // 모든 motion / tick 자식들을 위로 transform.
      // 단순화: motionGroup, tGridGroup 자체를 transform — 다만 누적되면 절대 좌표 어긋남.
      // 여기서는 첫 row 의 자식만 페이드아웃 시키고 row 인덱스는 그대로 둔다.
      // (학습 도중 자동 시연 시퀀스가 8 사건이라 거의 발생 안 함.)
      const firstRowTopY = TIMELINE_TOP;
      const firstRowBotY = TIMELINE_TOP + shift;
      const candidates: SVGElement[] = [];
      for (const child of Array.from(motionGroup.children) as SVGElement[]) {
        const bb = (child as SVGGraphicsElement).getBBox?.();
        if (bb && bb.y >= firstRowTopY && bb.y + bb.height <= firstRowBotY + 4) {
          candidates.push(child);
        }
      }
      for (const c of candidates) {
        c.setAttribute('opacity', '0.15');
      }
    }

    // ── 운동 helper ──
    function makeChip(color: string, label: string): {
      el: SVGGElement;
      rect: SVGRectElement;
      text: SVGTextElement;
    } {
      const g = document.createElementNS(SVG_NS, 'g');
      const rect = document.createElementNS(SVG_NS, 'rect');
      setAttrs(rect, {
        x: -CHIP_W / 2,
        y: -CHIP_H / 2,
        width: CHIP_W,
        height: CHIP_H,
        fill: color,
        stroke: colors.text,
        'stroke-width': '0.8',
        rx: '3',
      });
      g.appendChild(rect);
      const t = document.createElementNS(SVG_NS, 'text');
      setAttrs(t, {
        x: 0,
        y: 3,
        'text-anchor': 'middle',
        fill: colors.textInverse,
        'font-size': '8px',
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      t.textContent = label;
      g.appendChild(t);
      return { el: g, rect, text: t };
    }

    function pulse(parent: SVGGElement, x: number, y: number, color: string, ms: number): void {
      const c = document.createElementNS(SVG_NS, 'circle');
      setAttrs(c, {
        cx: x,
        cy: y,
        r: 3,
        fill: 'none',
        stroke: color,
        'stroke-width': '1.5',
        opacity: '1',
      });
      parent.appendChild(c);
      const start = performance.now();
      function tick(now: number): void {
        const t = Math.min(1, (now - start) / Math.max(10, ms));
        const r = 3 + 10 * t;
        c.setAttribute('r', String(r));
        c.setAttribute('opacity', String(1 - t));
        if (t < 1) raf(tick);
        else c.remove();
      }
      raf(tick);
    }

    async function chipSlide(
      chip: SVGGElement,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      ms: number,
    ): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        chip.setAttribute('transform', `translate(${x1},${y1})`);
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, ms));
          const e = easeInOut(t);
          const x = x1 + (x2 - x1) * e;
          const y = y1 + (y2 - y1) * e;
          chip.setAttribute('transform', `translate(${x},${y})`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
    }

    async function fadeIn(el: SVGElement, ms: number): Promise<void> {
      el.setAttribute('opacity', '0');
      return new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, ms));
          el.setAttribute('opacity', String(t));
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
    }

    function pushTrace(label: string): void {
      while (traces.length >= 14) {
        const last = traces.pop();
        last?.el.remove();
      }
      for (const t of traces) {
        const cur = t.el.getAttribute('transform') ?? 'translate(0,0)';
        const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(cur);
        const ty = m ? Number(m[2]) : 0;
        t.el.setAttribute('transform', `translate(0,${ty + TRACE_LINE_H})`);
        t.bg.setAttribute('fill', 'transparent');
        t.text.setAttribute('font-weight', '400');
        t.text.setAttribute('fill', colors.textMuted);
      }
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', 'translate(0,0)');
      traceGroup.appendChild(g);

      const bg = document.createElementNS(SVG_NS, 'rect');
      setAttrs(bg, {
        x: TRACE_LEFT + 2,
        y: TRACE_TOP + 4,
        width: TRACE_RIGHT - TRACE_LEFT - 4,
        height: TRACE_LINE_H - 2,
        fill: colors.itemPivot,
        rx: '2',
        opacity: '0.35',
      });
      g.appendChild(bg);

      const text = document.createElementNS(SVG_NS, 'text');
      setAttrs(text, {
        x: TRACE_LEFT + 6,
        y: TRACE_TOP + 18,
        fill: colors.text,
        'font-size': '10px',
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      text.textContent = label;
      g.appendChild(text);

      traces.unshift({ el: g, text, bg });

      const maxLines = Math.floor((TRACE_BOTTOM - TRACE_TOP - 8) / TRACE_LINE_H);
      while (traces.length > maxLines) {
        const last = traces.pop();
        last?.el.remove();
      }
    }

    function clearTrace(): void {
      while (traceGroup.firstChild) traceGroup.firstChild.remove();
      traces.length = 0;
    }

    // ── 메서드 ──
    function reset(): void {
      clearCaptionTimer();
      while (motionGroup.firstChild) motionGroup.firstChild.remove();
      while (tGridGroup.firstChild) tGridGroup.firstChild.remove();
      // 발행자 박스, 구독자 박스, broker 라이프라인 등은 init 에서 다시 그리므로 제거.
      for (const v of pubBoxes.values()) v.el.remove();
      pubBoxes.clear();
      for (const v of subBoxes.values()) {
        v.boxEl.remove();
        v.lifeline.remove();
        for (const seg of v.segments.values()) seg.pathEl.remove();
      }
      subBoxes.clear();
      knownSubCount = 0;
      rowCounter = 0;
      topicsList = [];
      eventCaption.textContent = '';
      clearTrace();
    }

    function init(payload: {
      publishers: string[];
      subscribers: string[];
      topics: string[];
      subscriptions: Array<{ subscriberId: string; topic: string }>;
    }): void {
      reset();
      topicsList = [...payload.topics];
      // 발행자 박스.
      for (let i = 0; i < payload.publishers.length; i++) {
        const id = payload.publishers[i]!;
        const x = PUB_X[i] ?? PUB_X[PUB_X.length - 1]!;
        const colorIdx = colorIndexOfPub(id);
        const el = createPublisherBox(id, x, colorIdx);
        pubBoxes.set(id, { x, el });
        // 발행자 라이프라인.
        makeLifeline(x);
      }
      // 구독자 박스.
      for (const id of payload.subscribers) {
        const x = SUB_X_BASE + knownSubCount * SUB_GAP;
        const rec = createSubscriberBox(id, x);
        subBoxes.set(id, rec);
        knownSubCount += 1;
      }
      // 초기 구독 매듭 — 라이프라인 활성화 (LIFELINE_TOP 부터 시작).
      for (const sub of payload.subscriptions) {
        const rec = subBoxes.get(sub.subscriberId);
        if (!rec) continue;
        addSubscriptionSegment(rec, sub.topic, LIFELINE_TOP);
        // 박스에 토픽 작은 매듭 표시.
        const knot = document.createElementNS(SVG_NS, 'circle');
        setAttrs(knot, {
          cx: rec.x,
          cy: LIFELINE_TOP + 2,
          r: 2.5,
          fill: sub.topic === topicsList[0] ? colors.text : colors.textMuted,
          stroke: 'none',
        });
        svg.appendChild(knot);
      }
    }

    function addSubscriptionSegment(rec: SubscriberRec, topic: string, startY: number): void {
      const offset = topic === topicsList[0] ? 0 : 4;
      const path = document.createElementNS(SVG_NS, 'line');
      setAttrs(path, {
        x1: rec.x + offset,
        y1: startY,
        x2: rec.x + offset,
        y2: LIFELINE_BOTTOM,
        stroke: topic === topicsList[0] ? colors.text : colors.textMuted,
        'stroke-width': topic === topicsList[0] ? '2' : '1.2',
        opacity: topic === topicsList[0] ? '0.6' : '0.5',
      });
      lifelineGroup.appendChild(path);
      rec.segments.set(topic, { startY, pathEl: path });
    }

    function endSubscriptionSegment(rec: SubscriberRec, topic: string, endY: number): void {
      const seg = rec.segments.get(topic);
      if (!seg) return;
      seg.pathEl.setAttribute('y2', String(endY));
      rec.segments.delete(topic);
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

    async function emitPublish(
      payload: {
        traceIndex: number;
        publisherId: string;
        topic: string;
        messageNumber: number;
        deliverTo: string[];
      },
      _opts?: { duration?: number },
    ): Promise<void> {
      const pubRec = pubBoxes.get(payload.publisherId);
      if (!pubRec) return;
      const colorIdx = colorIndexOfPub(payload.publisherId);
      const color = pubColors[colorIdx % PUB_PALETTE_SIZE]!;
      const isMain = payload.topic === topicsList[0];
      const brokerX = topicX(payload.topic);
      const y = nextRowY();

      pushTrace(
        `t${rowCounter}  ${payload.publisherId} → ${payload.topic} #${payload.messageNumber}  ×${payload.deliverTo.length}`,
      );

      const labelTop = `→ ${payload.topic}`;
      const shortLabel =
        payload.topic === topicsList[0] ? `${payload.messageNumber}` : `A${payload.messageNumber}`;

      // 1. 발행자 → broker 칩 슬라이드.
      const chip1 = makeChip(color, shortLabel);
      motionGroup.appendChild(chip1.el);
      await chipSlide(chip1.el, pubRec.x, y, brokerX, y, PUB_TO_BROKER_MS);

      // 도착 라벨 + 펄스.
      const arriveLabel = document.createElementNS(SVG_NS, 'text');
      setAttrs(arriveLabel, {
        x: brokerX + 4,
        y: y - 6,
        fill: colors.textMuted,
        'font-size': '8px',
        'font-family': fonts.mono,
      });
      arriveLabel.textContent = labelTop;
      motionGroup.appendChild(arriveLabel);
      void fadeIn(arriveLabel, 200);
      pulse(motionGroup, brokerX, y, isMain ? colors.itemActive : colors.textMuted, 320);
      // 도착 칩은 broker 위에 정지.
      await sleep(BROKER_HOLD_MS);
      // broker 도착 칩 페이드아웃 (사본으로 갈라짐을 시각적으로 분리).
      chip1.el.setAttribute('opacity', '0.45');

      if (payload.deliverTo.length === 0) {
        // 사본 0 — 보낼 곳 없음.
        const noDeliver = document.createElementNS(SVG_NS, 'text');
        setAttrs(noDeliver, {
          x: brokerX + 8,
          y: y + 10,
          fill: colors.danger,
          'font-size': '9px',
          'font-family': fonts.mono,
        });
        noDeliver.textContent = '구독자 없음';
        motionGroup.appendChild(noDeliver);
        setCaption(
          `${payload.publisherId} → ${payload.topic} 발행 — 그 토픽을 듣는 구독자가 없다.`,
          { duration: 2000 },
        );
        return;
      }

      // 2. 사본 N 갈라짐 — broker 라이프라인 위 정지 구간 표시.
      const holdLine = document.createElementNS(SVG_NS, 'line');
      setAttrs(holdLine, {
        x1: brokerX,
        y1: y,
        x2: brokerX,
        y2: y + 10,
        stroke: colors.text,
        'stroke-width': '3',
        opacity: '0.8',
      });
      motionGroup.appendChild(holdLine);

      // 3. 부채꼴 — 도착 시점 약간씩 다름.
      const fanoutPromises: Promise<void>[] = [];
      const sortedDeliver = [...payload.deliverTo];
      // 좌→우 순서로 도착시점 약간씩 다르게.
      sortedDeliver.sort((a, b) => {
        const ax = subBoxes.get(a)?.x ?? 0;
        const bx = subBoxes.get(b)?.x ?? 0;
        return ax - bx;
      });
      for (let i = 0; i < sortedDeliver.length; i++) {
        const subId = sortedDeliver[i]!;
        const rec = subBoxes.get(subId);
        if (!rec) continue;
        const offset = i * SUB_DELIVER_GAP;
        const targetY = y + offset;
        // 출발 라벨.
        if (i === 0) {
          const departLabel = document.createElementNS(SVG_NS, 'text');
          setAttrs(departLabel, {
            x: brokerX + 4,
            y: y + 16,
            fill: colors.textMuted,
            'font-size': '8px',
            'font-family': fonts.mono,
          });
          departLabel.textContent = `${payload.topic} →`;
          motionGroup.appendChild(departLabel);
          void fadeIn(departLabel, 200);
        }
        const chip = makeChip(color, shortLabel);
        motionGroup.appendChild(chip.el);
        chip.el.setAttribute('transform', `translate(${brokerX},${y + 5})`);
        // 살짝 시간 어긋나게 출발.
        const startDelay = i * 70;
        const p = (async () => {
          await sleep(startDelay);
          await chipSlide(
            chip.el,
            brokerX,
            y + 5,
            rec.x,
            targetY,
            FANOUT_MS,
          );
          // 도착 펄스.
          pulse(motionGroup, rec.x, targetY, color, 320);
          // 잔상 칩 (작게).
          const ghost = makeChip(color, shortLabel);
          ghost.el.setAttribute('transform', `translate(${rec.x},${targetY})`);
          ghost.el.setAttribute('opacity', '0.85');
          motionGroup.appendChild(ghost.el);
          chip.el.remove();
        })();
        fanoutPromises.push(p);
      }
      await Promise.all(fanoutPromises);
      setCaption(
        `한 발행 → ${payload.deliverTo.length} 사본 → 다른 도착 시각 (${payload.topic}).`,
        { duration: 2200 },
      );
    }

    async function emitSubscriberJoin(
      payload: { traceIndex: number; subscriberId: string },
    ): Promise<void> {
      if (subBoxes.has(payload.subscriberId)) return;
      const x = SUB_X_BASE + knownSubCount * SUB_GAP;
      const rec = createSubscriberBox(payload.subscriberId, x);
      subBoxes.set(payload.subscriberId, rec);
      knownSubCount += 1;
      rec.boxEl.setAttribute('opacity', '0');
      rec.lifeline.setAttribute('opacity', '0');
      await fadeIn(rec.boxEl, 320);
      rec.lifeline.setAttribute('opacity', '1');
      pushTrace(`t${rowCounter}  + ${payload.subscriberId} 우측 영역 합류`);
    }

    async function emitSubscribe(
      payload: { traceIndex: number; subscriberId: string; topic: string },
    ): Promise<void> {
      let rec = subBoxes.get(payload.subscriberId);
      if (!rec) {
        // 자동 join 이 누락되어 있어도 안전하게 박스 생성.
        await emitSubscriberJoin({
          traceIndex: payload.traceIndex,
          subscriberId: payload.subscriberId,
        });
        rec = subBoxes.get(payload.subscriberId);
        if (!rec) return;
      }
      const y = nextRowY();
      pushTrace(`t${rowCounter}  ${payload.subscriberId} subscribe ${payload.topic}`);
      // broker 라이프라인 → 구독자 박스로 매듭선.
      const brokerX = topicX(payload.topic);
      const knotPath = document.createElementNS(SVG_NS, 'path');
      setAttrs(knotPath, {
        d: `M${brokerX},${y} L${rec.x},${y}`,
        stroke: payload.topic === topicsList[0] ? colors.text : colors.textMuted,
        'stroke-width': '1',
        'stroke-dasharray': '2 2',
        fill: 'none',
        opacity: '0',
      });
      motionGroup.appendChild(knotPath);
      await fadeIn(knotPath, SUBSCRIBE_KNOT_MS);
      // 매듭 (작은 원).
      const knot = document.createElementNS(SVG_NS, 'circle');
      setAttrs(knot, {
        cx: rec.x,
        cy: y,
        r: 3,
        fill: payload.topic === topicsList[0] ? colors.itemActive : colors.itemPivot,
        stroke: colors.text,
        'stroke-width': '1',
      });
      motionGroup.appendChild(knot);
      pulse(motionGroup, rec.x, y, colors.itemActive, 360);
      // 라이프라인 활성 구간 시작.
      addSubscriptionSegment(rec, payload.topic, y);
      // 라벨.
      const label = document.createElementNS(SVG_NS, 'text');
      setAttrs(label, {
        x: rec.x + 6,
        y: y + 3,
        fill: colors.text,
        'font-size': '8px',
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      label.textContent = `subscribe ${payload.topic}`;
      motionGroup.appendChild(label);
      void fadeIn(label, 200);
      setCaption(
        `${payload.subscriberId} 가 ${payload.topic} 에 합류 — 이전 발행은 받지 않는다.`,
        { duration: 2200 },
      );
    }

    async function emitUnsubscribe(
      payload: { traceIndex: number; subscriberId: string; topic: string },
    ): Promise<void> {
      const rec = subBoxes.get(payload.subscriberId);
      if (!rec) return;
      const y = nextRowY();
      pushTrace(`t${rowCounter}  ${payload.subscriberId} unsubscribe ${payload.topic}`);
      // 라이프라인 활성 구간 끝.
      endSubscriptionSegment(rec, payload.topic, y);
      // 끊어짐 표시.
      const cross = document.createElementNS(SVG_NS, 'g');
      const c1 = document.createElementNS(SVG_NS, 'line');
      setAttrs(c1, {
        x1: rec.x - 4,
        y1: y - 4,
        x2: rec.x + 4,
        y2: y + 4,
        stroke: colors.danger,
        'stroke-width': '1.5',
      });
      cross.appendChild(c1);
      const c2 = document.createElementNS(SVG_NS, 'line');
      setAttrs(c2, {
        x1: rec.x - 4,
        y1: y + 4,
        x2: rec.x + 4,
        y2: y - 4,
        stroke: colors.danger,
        'stroke-width': '1.5',
      });
      cross.appendChild(c2);
      motionGroup.appendChild(cross);
      pulse(motionGroup, rec.x, y, colors.danger, 360);
      const label = document.createElementNS(SVG_NS, 'text');
      setAttrs(label, {
        x: rec.x + 6,
        y: y + 3,
        fill: colors.danger,
        'font-size': '8px',
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      label.textContent = `unsubscribe ${payload.topic}`;
      motionGroup.appendChild(label);
      void fadeIn(label, 200);
      await sleep(SUBSCRIBE_KNOT_MS);
      setCaption(
        `${payload.subscriberId} 가 ${payload.topic} 에서 빠짐 — 이후 발행은 받지 않는다.`,
        { duration: 2200 },
      );
    }

    function signalInvalid(op: string, raw: string): void {
      setCaption(`${op}: 입력이 올바르지 않다 — "${raw}"`, { duration: 2000 });
    }

    function signalDemoEnd(): void {
      setCaption(
        '이제 직접 — 발행자·토픽·구독자를 입력하고 publish / subscribe / unsubscribe 를 눌러 보세요.',
        { duration: 2800 },
      );
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
      emitPublish,
      emitSubscribe,
      emitUnsubscribe,
      emitSubscriberJoin,
      signalInvalid,
      signalDemoEnd,
    };
  },
};
