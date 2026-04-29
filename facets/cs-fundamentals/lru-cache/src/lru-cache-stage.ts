/**
 * lru-cache-stage View — LRU 캐시 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 캡션 / hash 슬롯 격자 / capacity 게이지 / doubly linked list /
 * head·tail dummy / LRU↔MRU 가로축 라벨 / 두 영역을 잇는 항시 연결선 /
 * 우측 호출 트레이스 스트립 / 시각화 안 텍스트를 모두 담는다.
 *
 * 메서드 (projector → view):
 *   - reset()
 *   - init({ capacity })
 *   - setBaseCaption(text)
 *   - setCaption(text, opts?)
 *   - emitGetHit(payload, opts?)       — promotion 호 + 트레이스
 *   - emitGetMiss(payload, opts?)
 *   - emitPutUpdate(payload, opts?)    — 기존 키 promotion + 값 갱신
 *   - emitPutInsert(payload, opts?)    — 새 키, 여유 있음
 *   - emitPutEvict(payload, opts?)     — 새 키, LRU 축출
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

const W = 640;
const H = 540;

// ── 영역 분할 ──
const CAPTION_BASE_Y = 22;
const CAPTION_EVENT_Y = 44;

// 메인 비주얼 영역 (좌측). 우측은 트레이스 스트립.
const MAIN_LEFT = 12;
const MAIN_RIGHT = 458;
const MAIN_W = MAIN_RIGHT - MAIN_LEFT;

// 트레이스 스트립.
const TRACE_LEFT = 470;
const TRACE_RIGHT = 628;
const TRACE_TOP = 70;
const TRACE_BOTTOM = 480;
const TRACE_LINE_H = 22;

// hash 슬롯 격자.
const HASH_TOP = 84;
const HASH_H = 44;
const HASH_LABEL_Y_OFFSET = 14;

// capacity 게이지.
const GAUGE_TOP = 168;
const GAUGE_H = 14;

// doubly linked list 영역.
const DLL_TOP = 240;
const DLL_NODE_H = 50;
const DLL_AXIS_Y = 320;

// head/tail dummy.
const DUMMY_W = 28;

// 시각화 안 텍스트 박스.
const NARRATIVE_TOP = 360;
const NARRATIVE_H = 116;

// ── 시간 (ms) ──
const PROMOTE_ARC_MS = 520;
const PROMOTE_SETTLE_MS = 220;
const EVICT_DROP_MS = 520;
const EVICT_PAUSE_MS = 320;
const INSERT_DROP_MS = 380;

// ── 키 토큰 색 — 6색 순환 ──
const KEY_PALETTE_TONE = 'pastel' as const;
const KEY_PALETTE_SIZE = 6;

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

type CardRec = {
  /** SVG 그룹. */
  el: SVGGElement;
  rect: SVGRectElement;
  keyText: SVGTextElement;
  valueText: SVGTextElement;
  /** 위쪽 hash 슬롯과 잇는 연결선. */
  link: SVGPathElement;
  /** 위쪽 hash 슬롯 그룹. */
  slotEl: SVGGElement;
  slotRect: SVGRectElement;
  slotKeyText: SVGTextElement;
  /** 색 인덱스. */
  colorIdx: number;
  key: string;
  value: string;
  /** 현재 hash 슬롯 인덱스 (0..capacity-1, 고정). */
  hashSlot: number;
};

type TraceEntry = {
  el: SVGGElement;
  text: SVGTextElement;
  bg: SVGRectElement;
};

export const lruCacheStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const keyColors = categorical(KEY_PALETTE_SIZE, KEY_PALETTE_TONE);

    const root = document.createElement('div');
    root.className = 'facet-lru-cache-stage';
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
      x: MAIN_LEFT,
      y: CAPTION_BASE_Y,
      fill: colors.textMuted,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
    });
    svg.appendChild(baseCaption);

    const eventCaption = document.createElementNS(SVG_NS, 'text');
    setAttrs(eventCaption, {
      x: MAIN_LEFT,
      y: CAPTION_EVENT_Y,
      fill: colors.text,
      'font-size': fontSizes.md,
      'font-family': fonts.body,
      'font-weight': '600',
    });
    svg.appendChild(eventCaption);

    // === hash 영역 라벨 ===
    const hashAreaLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(hashAreaLabel, {
      x: MAIN_LEFT,
      y: HASH_TOP - 8,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
      'font-weight': '600',
    });
    hashAreaLabel.textContent = 'hash map  (key → 노드 포인터)';
    svg.appendChild(hashAreaLabel);

    // === hash 슬롯 그룹 (동적으로 채워짐) ===
    const hashGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(hashGroup);

    // === 두 영역 잇는 연결선 그룹 ===
    const linkGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(linkGroup);

    // === capacity 게이지 ===
    const gaugeAreaLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(gaugeAreaLabel, {
      x: MAIN_LEFT,
      y: GAUGE_TOP - 6,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
      'font-weight': '600',
    });
    gaugeAreaLabel.textContent = 'capacity';
    svg.appendChild(gaugeAreaLabel);

    const gaugeGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(gaugeGroup);
    const gaugeCells: SVGRectElement[] = [];

    const gaugeCountLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(gaugeCountLabel, {
      x: MAIN_RIGHT,
      y: GAUGE_TOP - 6,
      'text-anchor': 'end',
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.mono,
    });
    gaugeCountLabel.textContent = '0/0';
    svg.appendChild(gaugeCountLabel);

    // === DLL 영역 ===
    const dllAreaLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(dllAreaLabel, {
      x: MAIN_LEFT,
      y: DLL_TOP - 8,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
      'font-weight': '600',
    });
    dllAreaLabel.textContent = 'doubly linked list  (사용 순서)';
    svg.appendChild(dllAreaLabel);

    const dllGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(dllGroup);

    // head/tail dummy.
    const headDummy = document.createElementNS(SVG_NS, 'g');
    {
      const r = document.createElementNS(SVG_NS, 'rect');
      setAttrs(r, {
        x: 0,
        y: 0,
        width: DUMMY_W,
        height: DLL_NODE_H,
        fill: 'transparent',
        stroke: colors.textMuted,
        'stroke-width': '1',
        'stroke-dasharray': '3 2',
        rx: '4',
      });
      headDummy.appendChild(r);
      const t = document.createElementNS(SVG_NS, 'text');
      setAttrs(t, {
        x: DUMMY_W / 2,
        y: DLL_NODE_H / 2 + 4,
        'text-anchor': 'middle',
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
      });
      t.textContent = 'head';
      headDummy.appendChild(t);
    }
    dllGroup.appendChild(headDummy);

    const tailDummy = document.createElementNS(SVG_NS, 'g');
    {
      const r = document.createElementNS(SVG_NS, 'rect');
      setAttrs(r, {
        x: 0,
        y: 0,
        width: DUMMY_W,
        height: DLL_NODE_H,
        fill: 'transparent',
        stroke: colors.textMuted,
        'stroke-width': '1',
        'stroke-dasharray': '3 2',
        rx: '4',
      });
      tailDummy.appendChild(r);
      const t = document.createElementNS(SVG_NS, 'text');
      setAttrs(t, {
        x: DUMMY_W / 2,
        y: DLL_NODE_H / 2 + 4,
        'text-anchor': 'middle',
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
      });
      t.textContent = 'tail';
      tailDummy.appendChild(t);
    }
    dllGroup.appendChild(tailDummy);

    // 노드 카드 그룹 (위에 그려야 dummy 위로 올라옴).
    const cardGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(cardGroup);

    // 가로축 (LRU ↔ MRU).
    const axisLine = document.createElementNS(SVG_NS, 'line');
    setAttrs(axisLine, {
      x1: MAIN_LEFT,
      y1: DLL_AXIS_Y,
      x2: MAIN_RIGHT,
      y2: DLL_AXIS_Y,
      stroke: colors.border,
      'stroke-width': '1',
    });
    svg.appendChild(axisLine);

    const lruLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(lruLabel, {
      x: MAIN_LEFT,
      y: DLL_AXIS_Y + 14,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
      'font-weight': '700',
    });
    lruLabel.textContent = '◀ LRU (가장 오래 안 본 것)';
    svg.appendChild(lruLabel);

    const mruLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(mruLabel, {
      x: MAIN_RIGHT,
      y: DLL_AXIS_Y + 14,
      'text-anchor': 'end',
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
      'font-weight': '700',
    });
    mruLabel.textContent = '(방금 본 것) MRU ▶';
    svg.appendChild(mruLabel);

    // === 시각화 안 텍스트 ===
    const narrativeBg = document.createElementNS(SVG_NS, 'rect');
    setAttrs(narrativeBg, {
      x: MAIN_LEFT,
      y: NARRATIVE_TOP,
      width: MAIN_W,
      height: NARRATIVE_H,
      fill: colors.bg,
      stroke: colors.border,
      'stroke-width': '1',
      rx: '4',
    });
    svg.appendChild(narrativeBg);

    const narrativeText = document.createElementNS(SVG_NS, 'text');
    setAttrs(narrativeText, {
      x: MAIN_LEFT + 10,
      y: NARRATIVE_TOP + 18,
      fill: colors.text,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
    });
    svg.appendChild(narrativeText);

    const narrativeLines = [
      'LRU 캐시는 키-값 저장소 위에 "최근 사용 순서" 라는 추상을 새긴다.',
      '위쪽 hash 슬롯은 키 → 노드 포인터의 빠른 조회를,',
      '아래쪽 doubly linked list 는 사용 순서를 담당한다.',
      '두 영역은 같은 노드를 공유하므로 모든 호출이 두 곳을 동시에 갱신한다.',
      'get 도 단순 조회가 아니라 노드를 MRU 끝으로 끌어올리는 쓰기성 행위다.',
      'capacity 가 꽉 찬 상태에서 새 키 put → LRU 끝의 노드가 두 영역에서 동기 소멸.',
    ];
    for (let i = 0; i < narrativeLines.length; i++) {
      const tspan = document.createElementNS(SVG_NS, 'tspan');
      tspan.setAttribute('x', String(MAIN_LEFT + 10));
      tspan.setAttribute('dy', i === 0 ? '0' : '15');
      tspan.textContent = narrativeLines[i] ?? '';
      narrativeText.appendChild(tspan);
    }

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
      x: TRACE_LEFT + 8,
      y: TRACE_TOP - 8,
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
      x: MAIN_LEFT,
      y: H - 12,
      fill: colors.textMuted,
      'font-size': '10px',
      'font-family': fonts.body,
    });
    refText.textContent = '참고: NeetCode 146 · dev.to LRU illustrated · GeeksforGeeks LRU';
    svg.appendChild(refText);

    // === 운동 overlay ===
    const overlayGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(overlayGroup);

    // ── 모델 상태 ──
    let capacity = 0;
    let listOrder: string[] = [];
    const cards = new Map<string, CardRec>();
    const traces: TraceEntry[] = [];
    let captionTimer: ReturnType<typeof setTimeout> | null = null;

    function clearCaptionTimer(): void {
      if (captionTimer !== null) clearTimeout(captionTimer);
      captionTimer = null;
    }

    function colorIndexOfKey(key: string): number {
      let h = 0;
      for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
      return h % KEY_PALETTE_SIZE;
    }

    // hash 슬롯 좌표 (격자: 한 줄에 capacity 칸).
    function hashSlotW(): number {
      const gap = 6;
      return Math.max(40, (MAIN_W - (capacity - 1) * gap) / Math.max(1, capacity));
    }
    function hashSlotX(slotIdx: number): number {
      const gap = 6;
      return MAIN_LEFT + slotIdx * (hashSlotW() + gap);
    }
    function hashSlotBottomCenter(slotIdx: number): { cx: number; cy: number } {
      return {
        cx: hashSlotX(slotIdx) + hashSlotW() / 2,
        cy: HASH_TOP + HASH_H,
      };
    }

    // DLL 위치 (좌→우, head + capacity nodes + tail).
    function dllNodeW(): number {
      const gap = 6;
      const totalSlots = capacity;
      const usable = MAIN_W - 2 * (DUMMY_W + gap);
      return Math.max(40, (usable - (totalSlots - 1) * gap) / Math.max(1, totalSlots));
    }
    function dllNodeX(listIdx: number): number {
      const gap = 6;
      return MAIN_LEFT + DUMMY_W + gap + listIdx * (dllNodeW() + gap);
    }
    function dllNodeTopCenter(listIdx: number): { cx: number; cy: number } {
      return {
        cx: dllNodeX(listIdx) + dllNodeW() / 2,
        cy: DLL_TOP,
      };
    }
    function dllNodeCenter(listIdx: number): { cx: number; cy: number } {
      return {
        cx: dllNodeX(listIdx) + dllNodeW() / 2,
        cy: DLL_TOP + DLL_NODE_H / 2,
      };
    }

    function placeDummies(): void {
      const tailX = MAIN_LEFT + DUMMY_W + 6 + capacity * (dllNodeW() + 6);
      headDummy.setAttribute('transform', `translate(${MAIN_LEFT},${DLL_TOP})`);
      tailDummy.setAttribute('transform', `translate(${tailX},${DLL_TOP})`);
    }

    function placeGaugeCells(): void {
      while (gaugeGroup.firstChild) gaugeGroup.firstChild.remove();
      gaugeCells.length = 0;
      const gap = 4;
      const cellW = (MAIN_W - (capacity - 1) * gap) / Math.max(1, capacity);
      for (let i = 0; i < capacity; i++) {
        const r = document.createElementNS(SVG_NS, 'rect');
        setAttrs(r, {
          x: MAIN_LEFT + i * (cellW + gap),
          y: GAUGE_TOP,
          width: cellW,
          height: GAUGE_H,
          fill: colors.bg,
          stroke: colors.border,
          'stroke-width': '1',
          rx: '2',
        });
        gaugeGroup.appendChild(r);
        gaugeCells.push(r);
      }
    }

    function refreshGauge(size: number, opts?: { overflowAttempt?: boolean }): void {
      for (let i = 0; i < gaugeCells.length; i++) {
        const cell = gaugeCells[i]!;
        if (i < size) {
          // 채워진 칸. size === capacity 면 경계 색.
          if (size >= capacity) {
            cell.setAttribute('fill', colors.itemComparing);
          } else {
            cell.setAttribute('fill', colors.itemSorted);
          }
          cell.setAttribute('stroke', colors.text);
        } else {
          cell.setAttribute('fill', colors.bg);
          cell.setAttribute('stroke', colors.border);
        }
      }
      // 초과 시도 강조 — 모든 칸이 잠시 강조 색.
      if (opts?.overflowAttempt) {
        for (const cell of gaugeCells) {
          cell.setAttribute('stroke', colors.danger);
          cell.setAttribute('stroke-width', '2');
        }
      } else {
        for (const cell of gaugeCells) {
          cell.setAttribute('stroke-width', '1');
        }
      }
      gaugeCountLabel.textContent = `${size}/${capacity}`;
    }

    function makeHashSlot(key: string, slotIdx: number, color: string): {
      el: SVGGElement;
      rect: SVGRectElement;
      keyText: SVGTextElement;
    } {
      const w = hashSlotW();
      const x = hashSlotX(slotIdx);
      const g = document.createElementNS(SVG_NS, 'g');
      hashGroup.appendChild(g);

      const rect = document.createElementNS(SVG_NS, 'rect');
      setAttrs(rect, {
        x,
        y: HASH_TOP,
        width: w,
        height: HASH_H,
        fill: color,
        stroke: colors.text,
        'stroke-width': '1',
        rx: '4',
      });
      g.appendChild(rect);

      const keyTextEl = document.createElementNS(SVG_NS, 'text');
      setAttrs(keyTextEl, {
        x: x + w / 2,
        y: HASH_TOP + HASH_H / 2 + 4,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      keyTextEl.textContent = key;
      g.appendChild(keyTextEl);

      const slotIdxLabel = document.createElementNS(SVG_NS, 'text');
      setAttrs(slotIdxLabel, {
        x: x + 4,
        y: HASH_TOP + HASH_LABEL_Y_OFFSET - 4,
        'text-anchor': 'start',
        fill: colors.textMuted,
        'font-size': '9px',
        'font-family': fonts.mono,
      });
      slotIdxLabel.textContent = `s${slotIdx}`;
      g.appendChild(slotIdxLabel);

      return { el: g, rect, keyText: keyTextEl };
    }

    function makeCard(
      key: string,
      value: string,
      listIdx: number,
      color: string,
    ): { el: SVGGElement; rect: SVGRectElement; keyText: SVGTextElement; valueText: SVGTextElement } {
      const w = dllNodeW();
      const { cx, cy } = dllNodeCenter(listIdx);
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', `translate(${cx},${cy})`);
      cardGroup.appendChild(g);

      const rect = document.createElementNS(SVG_NS, 'rect');
      setAttrs(rect, {
        x: -w / 2,
        y: -DLL_NODE_H / 2,
        width: w,
        height: DLL_NODE_H,
        fill: color,
        stroke: colors.text,
        'stroke-width': '1.5',
        rx: '4',
      });
      g.appendChild(rect);

      const keyTextEl = document.createElementNS(SVG_NS, 'text');
      setAttrs(keyTextEl, {
        x: 0,
        y: -4,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      keyTextEl.textContent = key;
      g.appendChild(keyTextEl);

      const valueTextEl = document.createElementNS(SVG_NS, 'text');
      setAttrs(valueTextEl, {
        x: 0,
        y: 14,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
      });
      valueTextEl.textContent = `=${value}`;
      g.appendChild(valueTextEl);

      return { el: g, rect, keyText: keyTextEl, valueText: valueTextEl };
    }

    function makeLink(slotIdx: number, listIdx: number, color: string): SVGPathElement {
      const path = document.createElementNS(SVG_NS, 'path');
      setAttrs(path, {
        fill: 'none',
        stroke: color,
        'stroke-width': '1.5',
        opacity: '0.6',
      });
      linkGroup.appendChild(path);
      path.setAttribute('d', linkPath(slotIdx, listIdx));
      return path;
    }

    function linkPath(slotIdx: number, listIdx: number): string {
      const top = hashSlotBottomCenter(slotIdx);
      const bot = dllNodeTopCenter(listIdx);
      const midY = (top.cy + bot.cy) / 2;
      // bezier curve: top → control1 (top.cy + dy) → control2 (bot.cy - dy) → bot.
      return `M${top.cx},${top.cy} C${top.cx},${midY} ${bot.cx},${midY} ${bot.cx},${bot.cy}`;
    }

    function refreshAllLinks(): void {
      for (const card of cards.values()) {
        const listIdx = listOrder.indexOf(card.key);
        if (listIdx < 0) continue;
        card.link.setAttribute('d', linkPath(card.hashSlot, listIdx));
      }
    }

    function placeCardAt(card: CardRec, listIdx: number, opacity = 1): void {
      const { cx, cy } = dllNodeCenter(listIdx);
      card.el.setAttribute('transform', `translate(${cx},${cy})`);
      card.el.setAttribute('opacity', String(opacity));
      card.link.setAttribute('d', linkPath(card.hashSlot, listIdx));
    }

    // 트레이스 스트립 — 위에서 아래로 누적, 가장 최근이 가장 위.
    function pushTrace(label: string, opts?: { highlight?: boolean }): void {
      // 과한 누적 방지.
      while (traces.length >= 16) {
        const last = traces.pop();
        last?.el.remove();
      }
      // 기존 항목들을 한 줄씩 아래로 밀어낸다.
      for (const t of traces) {
        const cur = t.el.getAttribute('transform') ?? 'translate(0,0)';
        const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(cur);
        const ty = m ? Number(m[2]) : 0;
        t.el.setAttribute('transform', `translate(0,${ty + TRACE_LINE_H})`);
        // 직전 강조는 해제.
        t.bg.setAttribute('fill', 'transparent');
        t.text.setAttribute('font-weight', '400');
        t.text.setAttribute('fill', colors.textMuted);
      }
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', `translate(0,0)`);
      traceGroup.appendChild(g);

      const bg = document.createElementNS(SVG_NS, 'rect');
      setAttrs(bg, {
        x: TRACE_LEFT + 2,
        y: TRACE_TOP + 6,
        width: TRACE_RIGHT - TRACE_LEFT - 4,
        height: TRACE_LINE_H - 2,
        fill: opts?.highlight === false ? 'transparent' : colors.itemPivot,
        rx: '2',
        opacity: '0.35',
      });
      g.appendChild(bg);

      const text = document.createElementNS(SVG_NS, 'text');
      setAttrs(text, {
        x: TRACE_LEFT + 8,
        y: TRACE_TOP + 22,
        fill: colors.text,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      text.textContent = label;
      g.appendChild(text);

      traces.unshift({ el: g, text, bg });

      // 트레이스 박스 밖으로 넘친 항목 제거.
      const maxLines = Math.floor((TRACE_BOTTOM - TRACE_TOP - 12) / TRACE_LINE_H);
      while (traces.length > maxLines) {
        const last = traces.pop();
        last?.el.remove();
      }
    }

    function clearTrace(): void {
      while (traceGroup.firstChild) traceGroup.firstChild.remove();
      traces.length = 0;
    }

    // ── 운동 helper ──
    async function arcMoveCard(
      card: CardRec,
      fromListIdx: number,
      toListIdx: number,
      duration: number,
    ): Promise<void> {
      const from = dllNodeCenter(fromListIdx);
      const to = dllNodeCenter(toListIdx);
      const peakY = Math.min(from.cy, to.cy) - 36;
      return new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          const e = easeInOut(t);
          const x = from.cx + (to.cx - from.cx) * e;
          // bezier-like: y = (1-t)^2*from + 2(1-t)*t*peak + t^2*to
          const u = 1 - e;
          const y = u * u * from.cy + 2 * u * e * peakY + e * e * to.cy;
          card.el.setAttribute('transform', `translate(${x},${y})`);
          // 연결선도 동적으로 끌어줌. control point 도 같이 움직이도록 직접 path 갱신.
          const top = hashSlotBottomCenter(card.hashSlot);
          const midY = (top.cy + y) / 2;
          card.link.setAttribute(
            'd',
            `M${top.cx},${top.cy} C${top.cx},${midY} ${x},${midY} ${x},${y - DLL_NODE_H / 2}`,
          );
          if (t < 1) raf(tick);
          else {
            placeCardAt(card, toListIdx, 1);
            resolve();
          }
        }
        raf(tick);
      });
    }

    async function fadeAndDrop(card: CardRec, duration: number): Promise<void> {
      const cur = card.el.getAttribute('transform') ?? '';
      const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(cur);
      const fx = m ? Number(m[1]) : 0;
      const fy = m ? Number(m[2]) : 0;
      return new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          const e = easeInOut(t);
          const y = fy + 40 * e;
          card.el.setAttribute('opacity', String(1 - e));
          card.el.setAttribute('transform', `translate(${fx},${y})`);
          card.link.setAttribute('opacity', String(0.6 * (1 - e)));
          // hash 슬롯도 같이 흐리게.
          card.slotEl.setAttribute('opacity', String(1 - 0.7 * e));
          if (t < 1) raf(tick);
          else {
            card.el.remove();
            card.link.remove();
            card.slotEl.remove();
            resolve();
          }
        }
        raf(tick);
      });
    }

    async function fadeIn(el: SVGElement, duration: number): Promise<void> {
      el.setAttribute('opacity', '0');
      return new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          el.setAttribute('opacity', String(t));
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
    }

    function pulseRect(rect: SVGRectElement, color: string, ms: number): void {
      const orig = rect.getAttribute('stroke') ?? colors.text;
      const origW = rect.getAttribute('stroke-width') ?? '1';
      rect.setAttribute('stroke', color);
      rect.setAttribute('stroke-width', '3');
      setTimeout(() => {
        rect.setAttribute('stroke', orig);
        rect.setAttribute('stroke-width', origW);
      }, ms);
    }

    function lookupArrow(slotIdx: number, listIdx: number, color: string, ms: number): void {
      const top = hashSlotBottomCenter(slotIdx);
      const bot = dllNodeTopCenter(listIdx);
      const path = document.createElementNS(SVG_NS, 'path');
      const midY = (top.cy + bot.cy) / 2;
      setAttrs(path, {
        d: `M${top.cx},${top.cy} C${top.cx},${midY} ${bot.cx},${midY} ${bot.cx},${bot.cy}`,
        fill: 'none',
        stroke: color,
        'stroke-width': '2.5',
        opacity: '0',
      });
      overlayGroup.appendChild(path);
      const start = performance.now();
      function tick(now: number): void {
        const t = Math.min(1, (now - start) / Math.max(10, ms));
        // 0..0.5 등장, 0.5..1 페이드.
        const op = t < 0.5 ? t * 2 : 1 - (t - 0.5) * 2;
        path.setAttribute('opacity', String(op));
        if (t < 1) raf(tick);
        else path.remove();
      }
      raf(tick);
    }

    // ── 메서드 ──
    function reset(): void {
      clearCaptionTimer();
      while (hashGroup.firstChild) hashGroup.firstChild.remove();
      while (linkGroup.firstChild) linkGroup.firstChild.remove();
      while (cardGroup.firstChild) cardGroup.firstChild.remove();
      while (overlayGroup.firstChild) overlayGroup.firstChild.remove();
      cards.clear();
      listOrder = [];
      capacity = 0;
      eventCaption.textContent = '';
      clearTrace();
      placeGaugeCells();
      refreshGauge(0);
    }

    function init(payload: { capacity: number }): void {
      reset();
      capacity = payload.capacity;
      placeDummies();
      placeGaugeCells();
      refreshGauge(0);
      gaugeCountLabel.textContent = `0/${capacity}`;
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

    function makeCardRec(
      key: string,
      value: string,
      listIdx: number,
      hashSlot: number,
    ): CardRec {
      const colorIdx = colorIndexOfKey(key);
      const color = keyColors[colorIdx]!;
      const slot = makeHashSlot(key, hashSlot, color);
      const card = makeCard(key, value, listIdx, color);
      const link = makeLink(hashSlot, listIdx, color);
      return {
        el: card.el,
        rect: card.rect,
        keyText: card.keyText,
        valueText: card.valueText,
        link,
        slotEl: slot.el,
        slotRect: slot.rect,
        slotKeyText: slot.keyText,
        colorIdx,
        key,
        value,
        hashSlot,
      };
    }

    function applyListOrder(order: string[]): void {
      listOrder = [...order];
      for (const card of cards.values()) {
        const listIdx = listOrder.indexOf(card.key);
        if (listIdx < 0) continue;
        placeCardAt(card, listIdx, 1);
      }
    }

    function ensureCard(
      key: string,
      value: string,
      hashSlot: number,
      listIdx: number,
    ): CardRec {
      let card = cards.get(key);
      if (!card) {
        card = makeCardRec(key, value, listIdx, hashSlot);
        cards.set(key, card);
      }
      return card;
    }

    async function emitGetHit(
      payload: {
        key: string;
        value: string;
        fromListIndex: number;
        listOrder: string[];
        traceIndex: number;
      },
      opts?: { duration?: number },
    ): Promise<void> {
      const card = cards.get(payload.key);
      if (!card) return;
      const dur = opts?.duration ?? PROMOTE_ARC_MS;

      // 트레이스 한 줄 추가.
      pushTrace(
        `i=${payload.traceIndex}  get(${payload.key}) → ${payload.value}`,
        { highlight: true },
      );

      // 1. hash 슬롯 점등 + lookup 화살표.
      pulseRect(card.slotRect, colors.itemActive, 360);
      lookupArrow(card.hashSlot, payload.fromListIndex, colors.itemActive, 380);
      await sleep(180);

      // 2. unlink + 살짝 떠오름.
      pulseRect(card.rect, colors.itemActive, 220);

      // 3. 호 그리며 MRU 끝으로.
      const targetListIdx = payload.listOrder.indexOf(payload.key);
      if (targetListIdx < 0) return;
      // 다른 노드들 자리 미리 갱신 (LRU 쪽 한 칸씩 좌측으로).
      const otherKeys = payload.listOrder.filter((k) => k !== payload.key);
      let pos = 0;
      for (const k of otherKeys) {
        const c = cards.get(k);
        if (c) placeCardAt(c, pos, 1);
        pos += 1;
      }
      await arcMoveCard(card, payload.fromListIndex, targetListIdx, dur);
      // 4. 모델 동기화.
      listOrder = [...payload.listOrder];
      refreshAllLinks();
      await sleep(PROMOTE_SETTLE_MS);
      setCaption(`${payload.key} 가 MRU 끝으로 끌려 올라갔다 — get 도 list 를 회전시킨다.`, {
        duration: 2000,
      });
    }

    async function emitGetMiss(payload: { key: string; traceIndex: number }): Promise<void> {
      pushTrace(`i=${payload.traceIndex}  get(${payload.key}) → null`, { highlight: true });
      // 모든 hash 슬롯 영역에서 슬롯 부재 표시 — 짧은 대각선 X.
      const cx = MAIN_LEFT + MAIN_W / 2;
      const cy = HASH_TOP + HASH_H / 2;
      const x = document.createElementNS(SVG_NS, 'text');
      setAttrs(x, {
        x: cx,
        y: cy + 4,
        'text-anchor': 'middle',
        fill: colors.danger,
        'font-size': fontSizes.lg,
        'font-family': fonts.mono,
        'font-weight': '700',
        opacity: '0',
      });
      x.textContent = `${payload.key} ?  미존재`;
      overlayGroup.appendChild(x);
      await fadeIn(x, 200);
      await sleep(900);
      await new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / 300);
          x.setAttribute('opacity', String(1 - t));
          if (t < 1) raf(tick);
          else {
            x.remove();
            resolve();
          }
        }
        raf(tick);
      });
      setCaption(`${payload.key} 는 캐시에 없다 — list 는 변하지 않는다.`, { duration: 1800 });
    }

    async function emitPutUpdate(
      payload: {
        key: string;
        oldValue: string;
        newValue: string;
        fromListIndex: number;
        listOrder: string[];
        traceIndex: number;
      },
      opts?: { duration?: number },
    ): Promise<void> {
      const card = cards.get(payload.key);
      if (!card) return;
      const dur = opts?.duration ?? PROMOTE_ARC_MS;

      pushTrace(
        `i=${payload.traceIndex}  put(${payload.key},${payload.newValue})`,
        { highlight: true },
      );

      // 값 갱신 텍스트 — promotion 시작 전 한 박자 노출.
      card.value = payload.newValue;
      card.valueText.textContent = `=${payload.newValue}`;
      pulseRect(card.slotRect, colors.itemActive, 360);
      lookupArrow(card.hashSlot, payload.fromListIndex, colors.itemActive, 360);
      await sleep(160);

      pulseRect(card.rect, colors.itemActive, 220);

      const targetListIdx = payload.listOrder.indexOf(payload.key);
      if (targetListIdx < 0) return;
      const otherKeys = payload.listOrder.filter((k) => k !== payload.key);
      let pos = 0;
      for (const k of otherKeys) {
        const c = cards.get(k);
        if (c) placeCardAt(c, pos, 1);
        pos += 1;
      }
      await arcMoveCard(card, payload.fromListIndex, targetListIdx, dur);
      listOrder = [...payload.listOrder];
      refreshAllLinks();
      setCaption(`${payload.key} 의 값이 갱신되며 MRU 끝으로 끌려 올라갔다.`, {
        duration: 2000,
      });
    }

    async function emitPutInsert(
      payload: {
        key: string;
        value: string;
        listOrder: string[];
        hashSlot: number;
        size: number;
        capacity: number;
        traceIndex: number;
      },
      opts?: { duration?: number },
    ): Promise<void> {
      const dur = opts?.duration ?? INSERT_DROP_MS;
      pushTrace(
        `i=${payload.traceIndex}  put(${payload.key},${payload.value})`,
        { highlight: true },
      );

      const targetListIdx = payload.listOrder.indexOf(payload.key);
      if (targetListIdx < 0) return;

      // 새 카드 생성 — 시작 시점은 MRU 자리 위쪽에서 페이드+드롭.
      const card = ensureCard(payload.key, payload.value, payload.hashSlot, targetListIdx);
      // 시작 위치를 위로 띄움.
      const target = dllNodeCenter(targetListIdx);
      card.el.setAttribute('transform', `translate(${target.cx},${target.cy - 50})`);
      card.el.setAttribute('opacity', '0');
      card.slotEl.setAttribute('opacity', '0');
      card.link.setAttribute('opacity', '0');

      // hash 슬롯 점등 페이드인.
      void fadeIn(card.slotEl, dur * 0.5);

      // 카드 강하 + 페이드인.
      await new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, dur));
          const e = easeInOut(t);
          const y = target.cy - 50 + 50 * e;
          card.el.setAttribute('transform', `translate(${target.cx},${y})`);
          card.el.setAttribute('opacity', String(e));
          card.link.setAttribute('opacity', String(0.6 * e));
          // 연결선도 갱신.
          const top = hashSlotBottomCenter(card.hashSlot);
          const midY = (top.cy + y) / 2;
          card.link.setAttribute(
            'd',
            `M${top.cx},${top.cy} C${top.cx},${midY} ${target.cx},${midY} ${target.cx},${y - DLL_NODE_H / 2}`,
          );
          if (t < 1) raf(tick);
          else {
            placeCardAt(card, targetListIdx, 1);
            resolve();
          }
        }
        raf(tick);
      });

      listOrder = [...payload.listOrder];
      // 다른 카드들이 자리 갱신되었을 수 있으므로 일괄 재배치.
      applyListOrder(listOrder);
      refreshGauge(payload.size);
      setCaption(`새 키 ${payload.key} 가 MRU 끝에 들어왔다 (여유 있음).`, {
        duration: 1800,
      });
    }

    async function emitPutEvict(
      payload: {
        newKey: string;
        newValue: string;
        evictedKey: string;
        evictedValue: string;
        evictedHashSlot: number;
        newHashSlot: number;
        listOrder: string[];
        size: number;
        capacity: number;
        traceIndex: number;
      },
    ): Promise<void> {
      pushTrace(
        `i=${payload.traceIndex}  put(${payload.newKey},${payload.newValue})  ⊘${payload.evictedKey}`,
        { highlight: true },
      );

      // 1. 게이지에 "초과 시도" 한 박자.
      refreshGauge(payload.capacity, { overflowAttempt: true });
      setCaption(
        `용량 초과 — LRU 끝의 ${payload.evictedKey} 가 두 영역에서 함께 사라진다.`,
        { duration: 2400 },
      );
      await sleep(EVICT_PAUSE_MS);

      // 2. LRU 끝 노드 떨어뜨리기 + hash 슬롯도 동기 소멸.
      const evictedCard = cards.get(payload.evictedKey);
      const dropP = evictedCard ? fadeAndDrop(evictedCard, EVICT_DROP_MS) : Promise.resolve();
      await dropP;
      cards.delete(payload.evictedKey);

      // 3. 남은 카드들 자리 메우기 (LRU 쪽으로 한 칸씩 좌측 이동).
      // payload.listOrder 끝이 새 키. 새 키 직전까지가 기존 키들이 한 칸씩 밀려 들어간 순서.
      const existingOrder = payload.listOrder.slice(0, -1);
      let pos = 0;
      for (const k of existingOrder) {
        const c = cards.get(k);
        if (c) placeCardAt(c, pos, 1);
        pos += 1;
      }

      // 4. 새 카드를 MRU 끝에 삽입 (페이드 + 강하).
      const targetListIdx = payload.listOrder.length - 1;
      const card = ensureCard(payload.newKey, payload.newValue, payload.newHashSlot, targetListIdx);
      const target = dllNodeCenter(targetListIdx);
      card.el.setAttribute('transform', `translate(${target.cx},${target.cy - 50})`);
      card.el.setAttribute('opacity', '0');
      card.slotEl.setAttribute('opacity', '0');
      card.link.setAttribute('opacity', '0');
      void fadeIn(card.slotEl, INSERT_DROP_MS * 0.5);
      await new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, INSERT_DROP_MS));
          const e = easeInOut(t);
          const y = target.cy - 50 + 50 * e;
          card.el.setAttribute('transform', `translate(${target.cx},${y})`);
          card.el.setAttribute('opacity', String(e));
          card.link.setAttribute('opacity', String(0.6 * e));
          const top = hashSlotBottomCenter(card.hashSlot);
          const midY = (top.cy + y) / 2;
          card.link.setAttribute(
            'd',
            `M${top.cx},${top.cy} C${top.cx},${midY} ${target.cx},${midY} ${target.cx},${y - DLL_NODE_H / 2}`,
          );
          if (t < 1) raf(tick);
          else {
            placeCardAt(card, targetListIdx, 1);
            resolve();
          }
        }
        raf(tick);
      });

      listOrder = [...payload.listOrder];
      applyListOrder(listOrder);
      refreshGauge(payload.size);
    }

    function signalInvalid(op: string, raw: string): void {
      setCaption(
        `${op}: 짧은 영숫자 키 (값) 만 받는다 — 입력: "${raw}"`,
        { duration: 1800 },
      );
    }

    function signalDemoEnd(): void {
      setCaption(
        '이제 직접 — 키와 값을 입력하고 get / put 를 눌러 보세요.',
        { duration: 2400 },
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
      emitGetHit,
      emitGetMiss,
      emitPutUpdate,
      emitPutInsert,
      emitPutEvict,
      signalInvalid,
      signalDemoEnd,
    };
  },
};
