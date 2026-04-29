/**
 * hash-table-stage View — 분리 체이닝 해시 테이블 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 캡션 / 함수 박스 (h(k)→index) / 슬롯 배열 (M=11→23) / 사슬 /
 * 적재율 게이지 / 분포 요약 / 보조 비교 영역 (체이닝 vs 선형 탐사) 을 모두 담는다.
 * 기획 §6 § 7 의 "함수 박스에서 슬롯으로 떨어지는 곡선 운동" 흐름을 한 동선으로 운반.
 *
 * 메서드 (projector → view):
 *   - reset()
 *   - init({ M, hashLabel })
 *   - setBaseCaption(text)
 *   - setCaption(text, opts?)
 *   - emitInsert({ index, key, slot, isCollision, chainLength,
 *                  size, M, alpha, distribution }, opts?)
 *   - duplicateKey({ index, key, slot }, opts?)
 *   - searchPrepare(key)
 *   - searchJump({ index, key }, opts?)
 *   - searchChainStep({ index, slot, key, isMatch, isFinal }, opts?)
 *   - searchResult({ found, index, slot, key, walked })
 *   - removePrepare(key)
 *   - removeJump({ index, key }, opts?)
 *   - removeChainStep({ index, slot, key, isMatch, isFinal }, opts?)
 *   - removeResult({ found, index, slot, key, alpha, distribution })
 *   - updateAlpha({ alpha, level })
 *   - rehashBegin({ oldM, newM, hashLabel }, opts?)
 *   - rehashStep({ key, oldIndex, newIndex, slot }, opts?)
 *   - rehashEnd({ M, alpha, distribution, hashLabel })
 *   - signalEmpty(op, opts?)
 *   - signalInvalid(op, raw, opts?)
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

const W = 700;
const H = 540;

// ── 영역 분할 ──
const CAPTION_BASE_Y = 22;
const CAPTION_EVENT_Y = 44;

// 함수 박스
const FN_BOX_X = 220;
const FN_BOX_Y = 70;
const FN_BOX_W = 180;
const FN_BOX_H = 56;
const FN_INPUT_X = FN_BOX_X - 30;
const FN_OUTPUT_X = FN_BOX_X + FN_BOX_W + 30;
const FN_BOX_CY = FN_BOX_Y + FN_BOX_H / 2;

// 슬롯 배열
const SLOTS_TOP_Y = 200;
const SLOTS_H = 32;
const SLOTS_LEFT = 28;
const SLOTS_AREA_W = 480;

// 사슬
const CHAIN_NODE_H = 26;
const CHAIN_NODE_GAP = 4;
const CHAIN_GAP_FROM_SLOT = 8;
const MAX_VISIBLE_CHAIN = 4;

// 게이지
const GAUGE_Y = 384;
const GAUGE_H = 12;

// 분포 요약
const DIST_Y = 412;

// 보조 비교 영역
const AUX_X = 522;
const AUX_TITLE1_Y = 80;
const AUX_CHAIN_TOP = 100;
const AUX_TITLE2_Y = 240;
const AUX_LINEAR_TOP = 260;
const AUX_M = 11;
const AUX_CELL = 14;
const AUX_GAP = 1;

// ── 시간 ──
const HASH_DROP_MS = 600;
const COLLISION_FLASH_MS = 200;
const CHAIN_GROW_MS = 260;
const SEARCH_RING_MS = 320;
const REHASH_STEP_MS = 360;

// ── 키 토큰 색 — 6색 순환 ──
const KEY_PALETTE_TONE = 'pastel' as const;
const KEY_PALETTE_SIZE = 6;

const ARROW_HEAD_PATH = 'M0,0 L-7,-4 L-5,0 L-7,4 Z';

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

function hash(keyNum: number, M: number): number {
  const r = keyNum % M;
  return r < 0 ? r + M : r;
}

type AlphaLevel = 'safe' | 'caution' | 'warn';
type Distribution = { empty: number; len1: number; len2: number; len3plus: number };

type ChainNodeRec = {
  el: SVGGElement;
  rect: SVGRectElement;
  text: SVGTextElement;
  key: string;
};

type SlotRec = {
  cell: SVGRectElement;
  label: SVGTextElement;
  /** 사슬 노드 — slot 0 부터 끝까지. */
  nodes: ChainNodeRec[];
  /** 사슬 길이 ≥ MAX_VISIBLE_CHAIN 시 표시되는 +n 배지. */
  overflowBadge: SVGTextElement | null;
};

export const hashTableStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const keyColors = categorical(KEY_PALETTE_SIZE, KEY_PALETTE_TONE);

    const root = document.createElement('div');
    root.className = 'facet-hash-table-stage';
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

    // === 함수 박스 ===
    const fnGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(fnGroup);

    const fnBox = document.createElementNS(SVG_NS, 'rect');
    setAttrs(fnBox, {
      x: FN_BOX_X,
      y: FN_BOX_Y,
      width: FN_BOX_W,
      height: FN_BOX_H,
      fill: colors.bg,
      stroke: colors.text,
      'stroke-width': '1.5',
      rx: '6',
    });
    fnGroup.appendChild(fnBox);

    const fnLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(fnLabel, {
      x: FN_BOX_X + FN_BOX_W / 2,
      y: FN_BOX_Y + 22,
      'text-anchor': 'middle',
      fill: colors.text,
      'font-size': fontSizes.md,
      'font-family': fonts.mono,
      'font-weight': '700',
    });
    fnLabel.textContent = 'h(k) = k mod ?';
    fnGroup.appendChild(fnLabel);

    const fnTransform = document.createElementNS(SVG_NS, 'text');
    setAttrs(fnTransform, {
      x: FN_BOX_X + FN_BOX_W / 2,
      y: FN_BOX_Y + 42,
      'text-anchor': 'middle',
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.mono,
    });
    fnGroup.appendChild(fnTransform);

    // 입구·출구 화살표 (정적 가이드)
    const fnInArrow = document.createElementNS(SVG_NS, 'line');
    setAttrs(fnInArrow, {
      x1: FN_INPUT_X,
      y1: FN_BOX_CY,
      x2: FN_BOX_X - 2,
      y2: FN_BOX_CY,
      stroke: colors.textMuted,
      'stroke-width': '1.5',
    });
    fnGroup.appendChild(fnInArrow);
    const fnInTip = document.createElementNS(SVG_NS, 'path');
    setAttrs(fnInTip, {
      d: ARROW_HEAD_PATH,
      transform: `translate(${FN_BOX_X - 2},${FN_BOX_CY})`,
      fill: colors.textMuted,
    });
    fnGroup.appendChild(fnInTip);

    const fnOutArrow = document.createElementNS(SVG_NS, 'line');
    setAttrs(fnOutArrow, {
      x1: FN_BOX_X + FN_BOX_W + 2,
      y1: FN_BOX_CY,
      x2: FN_OUTPUT_X,
      y2: FN_BOX_CY,
      stroke: colors.textMuted,
      'stroke-width': '1.5',
    });
    fnGroup.appendChild(fnOutArrow);
    const fnOutTip = document.createElementNS(SVG_NS, 'path');
    setAttrs(fnOutTip, {
      d: ARROW_HEAD_PATH,
      transform: `translate(${FN_OUTPUT_X},${FN_BOX_CY})`,
      fill: colors.textMuted,
    });
    fnGroup.appendChild(fnOutTip);

    // === 슬롯 배열 그룹 ===
    const slotsGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(slotsGroup);

    const chainGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(chainGroup);

    // === 적재율 게이지 ===
    const gaugeGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(gaugeGroup);

    const gaugeBg = document.createElementNS(SVG_NS, 'rect');
    setAttrs(gaugeBg, {
      x: SLOTS_LEFT,
      y: GAUGE_Y,
      width: SLOTS_AREA_W,
      height: GAUGE_H,
      fill: colors.bg,
      stroke: colors.border,
      'stroke-width': '1',
      rx: '2',
    });
    gaugeGroup.appendChild(gaugeBg);

    const gaugeFill = document.createElementNS(SVG_NS, 'rect');
    setAttrs(gaugeFill, {
      x: SLOTS_LEFT,
      y: GAUGE_Y,
      width: 0,
      height: GAUGE_H,
      fill: colors.success,
      rx: '2',
    });
    gaugeGroup.appendChild(gaugeFill);

    const gaugeLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(gaugeLabel, {
      x: SLOTS_LEFT + SLOTS_AREA_W,
      y: GAUGE_Y - 4,
      'text-anchor': 'end',
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.mono,
    });
    gaugeLabel.textContent = 'α = 0.00 (0/—)';
    gaugeGroup.appendChild(gaugeLabel);

    const gaugeTitle = document.createElementNS(SVG_NS, 'text');
    setAttrs(gaugeTitle, {
      x: SLOTS_LEFT,
      y: GAUGE_Y - 4,
      'text-anchor': 'start',
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
    });
    gaugeTitle.textContent = '적재율 (load factor)';
    gaugeGroup.appendChild(gaugeTitle);

    // === 분포 요약 ===
    const distLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(distLabel, {
      x: SLOTS_LEFT,
      y: DIST_Y,
      'text-anchor': 'start',
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
    });
    distLabel.textContent = '분포: —';
    svg.appendChild(distLabel);

    // === 보조 비교 영역 ===
    const auxGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(auxGroup);

    const auxTitle1 = document.createElementNS(SVG_NS, 'text');
    setAttrs(auxTitle1, {
      x: AUX_X,
      y: AUX_TITLE1_Y - 24,
      fill: colors.text,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
      'font-weight': '700',
    });
    auxTitle1.textContent = '보조 비교 — 분리 체이닝';
    auxGroup.appendChild(auxTitle1);

    const auxNote1 = document.createElementNS(SVG_NS, 'text');
    setAttrs(auxNote1, {
      x: AUX_X,
      y: AUX_TITLE1_Y - 8,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
    });
    auxNote1.textContent = '아래로 사슬이 늘어진다';
    auxGroup.appendChild(auxNote1);

    const auxTitle2 = document.createElementNS(SVG_NS, 'text');
    setAttrs(auxTitle2, {
      x: AUX_X,
      y: AUX_TITLE2_Y - 24,
      fill: colors.text,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
      'font-weight': '700',
    });
    auxTitle2.textContent = '대비 — 선형 탐사';
    auxGroup.appendChild(auxTitle2);

    const auxNote2 = document.createElementNS(SVG_NS, 'text');
    setAttrs(auxNote2, {
      x: AUX_X,
      y: AUX_TITLE2_Y - 8,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
    });
    auxNote2.textContent = '옆으로 비집고 전진한다';
    auxGroup.appendChild(auxNote2);

    // 보조 미니 슬롯 두 줄. AUX_M 칸 고정.
    const auxChainCells: SVGRectElement[] = [];
    const auxChainLengthLabels: SVGTextElement[] = [];
    const auxChainBelowGroups: SVGGElement[] = [];
    for (let i = 0; i < AUX_M; i++) {
      const cx = AUX_X + i * (AUX_CELL + AUX_GAP);
      const cell = document.createElementNS(SVG_NS, 'rect');
      setAttrs(cell, {
        x: cx,
        y: AUX_CHAIN_TOP,
        width: AUX_CELL,
        height: AUX_CELL,
        fill: colors.bg,
        stroke: colors.border,
        'stroke-width': '1',
        'stroke-dasharray': '2 2',
      });
      auxGroup.appendChild(cell);
      auxChainCells.push(cell);
      const grp = document.createElementNS(SVG_NS, 'g');
      auxGroup.appendChild(grp);
      auxChainBelowGroups.push(grp);
      const lbl = document.createElementNS(SVG_NS, 'text');
      setAttrs(lbl, {
        x: cx + AUX_CELL / 2,
        y: AUX_CHAIN_TOP + AUX_CELL + 12,
        'text-anchor': 'middle',
        fill: colors.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
      });
      lbl.textContent = '0';
      auxGroup.appendChild(lbl);
      auxChainLengthLabels.push(lbl);
    }

    const auxLinearCells: SVGRectElement[] = [];
    const auxLinearTexts: SVGTextElement[] = [];
    for (let i = 0; i < AUX_M; i++) {
      const cx = AUX_X + i * (AUX_CELL + AUX_GAP);
      const cell = document.createElementNS(SVG_NS, 'rect');
      setAttrs(cell, {
        x: cx,
        y: AUX_LINEAR_TOP,
        width: AUX_CELL,
        height: AUX_CELL,
        fill: colors.bg,
        stroke: colors.border,
        'stroke-width': '1',
        'stroke-dasharray': '2 2',
      });
      auxGroup.appendChild(cell);
      auxLinearCells.push(cell);
      const t = document.createElementNS(SVG_NS, 'text');
      setAttrs(t, {
        x: cx + AUX_CELL / 2,
        y: AUX_LINEAR_TOP + AUX_CELL / 2 + 3,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-size': '8px',
        'font-family': fonts.mono,
        opacity: '0',
      });
      auxGroup.appendChild(t);
      auxLinearTexts.push(t);
    }

    // 보조 영역 모델 (M=11 고정, 학습 비교용 정적).
    let auxChainData: string[][] = Array.from({ length: AUX_M }, () => []);
    let auxLinearData: (string | null)[] = Array.from({ length: AUX_M }, () => null);

    // === 운동용 임시 overlay (키 토큰 곡선 운동, 강조 동심원 등) ===
    const overlayGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(overlayGroup);

    // ── 슬롯·사슬 모델 ──
    let M = 0;
    let slots: SlotRec[] = [];
    let slotCellW = 0;
    let slotCellGap = 2;
    let slotsStartX = SLOTS_LEFT;
    let captionTimer: ReturnType<typeof setTimeout> | null = null;
    let serialCounter = 0;

    function clearCaptionTimer(): void {
      if (captionTimer !== null) clearTimeout(captionTimer);
      captionTimer = null;
    }

    function slotCellX(i: number): number {
      return slotsStartX + i * (slotCellW + slotCellGap);
    }

    function slotCellCenterX(i: number): number {
      return slotCellX(i) + slotCellW / 2;
    }

    function chainNodeY(slot: number): number {
      // slot 0..MAX-1 가시. MAX 이상은 +n 배지.
      const visibleSlot = Math.min(slot, MAX_VISIBLE_CHAIN - 1);
      return (
        SLOTS_TOP_Y +
        SLOTS_H +
        CHAIN_GAP_FROM_SLOT +
        visibleSlot * (CHAIN_NODE_H + CHAIN_NODE_GAP) +
        CHAIN_NODE_H / 2
      );
    }

    function buildSlots(newM: number): void {
      // 정리.
      while (slotsGroup.firstChild) slotsGroup.firstChild.remove();
      while (chainGroup.firstChild) chainGroup.firstChild.remove();

      M = newM;
      // 셀 폭 동적 산정 — SLOTS_AREA_W 안에서 등분.
      const totalGap = (M - 1) * slotCellGap;
      slotCellW = Math.max(8, (SLOTS_AREA_W - totalGap) / M);
      slotsStartX = SLOTS_LEFT;

      slots = [];
      for (let i = 0; i < M; i++) {
        const x = slotCellX(i);
        const cell = document.createElementNS(SVG_NS, 'rect');
        setAttrs(cell, {
          x,
          y: SLOTS_TOP_Y,
          width: slotCellW,
          height: SLOTS_H,
          fill: colors.bg,
          stroke: colors.textMuted,
          'stroke-width': '1',
          'stroke-dasharray': '2 2',
          rx: '2',
        });
        slotsGroup.appendChild(cell);

        const label = document.createElementNS(SVG_NS, 'text');
        setAttrs(label, {
          x: x + slotCellW / 2,
          y: SLOTS_TOP_Y + SLOTS_H + 12,
          'text-anchor': 'middle',
          fill: colors.textMuted,
          'font-size': fontSizes.xs,
          'font-family': fonts.mono,
        });
        label.textContent = String(i);
        slotsGroup.appendChild(label);

        slots.push({ cell, label, nodes: [], overflowBadge: null });
      }
    }

    function colorOfKey(key: string): string {
      const n = Number(key);
      const idx = (Number.isFinite(n) ? Math.abs(n) : key.length) % KEY_PALETTE_SIZE;
      return keyColors[idx]!;
    }

    function makeChainNode(key: string, slotIdx: number, nodeSlot: number): ChainNodeRec {
      const cx = slotCellCenterX(slotIdx);
      const cy = chainNodeY(nodeSlot);
      const nodeW = Math.max(slotCellW * 0.95, 26);
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', `translate(${cx},${cy})`);
      const rect = document.createElementNS(SVG_NS, 'rect');
      setAttrs(rect, {
        x: -nodeW / 2,
        y: -CHAIN_NODE_H / 2,
        width: nodeW,
        height: CHAIN_NODE_H,
        fill: colorOfKey(key),
        stroke: colors.text,
        'stroke-width': '1',
        rx: '3',
      });
      g.appendChild(rect);
      const text = document.createElementNS(SVG_NS, 'text');
      setAttrs(text, {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        fill: colors.text,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      text.textContent = key;
      g.appendChild(text);
      chainGroup.appendChild(g);
      return { el: g, rect, text, key };
    }

    function refreshOverflowBadge(slotIdx: number): void {
      const slot = slots[slotIdx];
      if (!slot) return;
      const overflow = slot.nodes.length - MAX_VISIBLE_CHAIN;
      if (overflow > 0) {
        const cx = slotCellCenterX(slotIdx);
        const cy = chainNodeY(MAX_VISIBLE_CHAIN - 1) + CHAIN_NODE_H + 4;
        if (!slot.overflowBadge) {
          const t = document.createElementNS(SVG_NS, 'text');
          setAttrs(t, {
            x: cx,
            y: cy,
            'text-anchor': 'middle',
            fill: colors.textMuted,
            'font-size': fontSizes.xs,
            'font-family': fonts.mono,
          });
          chainGroup.appendChild(t);
          slot.overflowBadge = t;
        }
        slot.overflowBadge.textContent = `+${overflow}`;
        slot.overflowBadge.setAttribute('x', String(cx));
        slot.overflowBadge.setAttribute('y', String(cy));
      } else if (slot.overflowBadge) {
        slot.overflowBadge.remove();
        slot.overflowBadge = null;
      }
    }

    function setSlotOccupied(slotIdx: number, occupied: boolean, hasCollided: boolean): void {
      const slot = slots[slotIdx];
      if (!slot) return;
      if (!occupied) {
        slot.cell.setAttribute('fill', colors.bg);
        slot.cell.setAttribute('stroke', colors.textMuted);
        slot.cell.setAttribute('stroke-dasharray', '2 2');
        slot.cell.setAttribute('stroke-width', '1');
      } else {
        slot.cell.setAttribute('fill', colors.bg);
        slot.cell.setAttribute('stroke', hasCollided ? colors.itemActive : colors.text);
        slot.cell.setAttribute('stroke-dasharray', '');
        slot.cell.setAttribute('stroke-width', hasCollided ? '2' : '1.5');
      }
    }

    // ── 운동 helper ──
    function flyToken(
      key: string,
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
      duration: number,
      arc = true,
    ): Promise<void> {
      const g = document.createElementNS(SVG_NS, 'g');
      const r = 12;
      const rect = document.createElementNS(SVG_NS, 'rect');
      setAttrs(rect, {
        x: -r,
        y: -r,
        width: r * 2,
        height: r * 2,
        fill: colorOfKey(key),
        stroke: colors.text,
        'stroke-width': '1',
        rx: '3',
      });
      g.appendChild(rect);
      const text = document.createElementNS(SVG_NS, 'text');
      setAttrs(text, {
        x: 0,
        y: 4,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
        'font-weight': '700',
        fill: colors.text,
      });
      text.textContent = key;
      g.appendChild(text);
      g.setAttribute('transform', `translate(${fromX},${fromY})`);
      overlayGroup.appendChild(g);
      return new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          const e = easeInOut(t);
          const x = fromX + (toX - fromX) * e;
          let y = fromY + (toY - fromY) * e;
          if (arc) {
            const peak = Math.min(fromY, toY) - 20;
            const arcOffset = Math.sin(e * Math.PI) * (fromY - peak);
            y -= arcOffset * 0.4;
          }
          g.setAttribute('transform', `translate(${x},${y})`);
          if (t < 1) raf(tick);
          else {
            g.remove();
            resolve();
          }
        }
        raf(tick);
      });
    }

    function pulseRing(cx: number, cy: number, color: string, duration: number): Promise<void> {
      const ring = document.createElementNS(SVG_NS, 'circle');
      setAttrs(ring, {
        cx,
        cy,
        r: 4,
        fill: 'none',
        stroke: color,
        'stroke-width': '2.5',
        opacity: '1',
      });
      overlayGroup.appendChild(ring);
      return new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          const r = 4 + 18 * t;
          ring.setAttribute('r', String(r));
          ring.setAttribute('opacity', String(1 - t));
          if (t < 1) raf(tick);
          else {
            ring.remove();
            resolve();
          }
        }
        raf(tick);
      });
    }

    function flashCellBorder(slotIdx: number, color: string, duration: number): Promise<void> {
      const slot = slots[slotIdx];
      if (!slot) return Promise.resolve();
      const origStroke = slot.cell.getAttribute('stroke') ?? colors.text;
      const origWidth = slot.cell.getAttribute('stroke-width') ?? '1';
      slot.cell.setAttribute('stroke', color);
      slot.cell.setAttribute('stroke-width', '3');
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          slot.cell.setAttribute('stroke', origStroke);
          slot.cell.setAttribute('stroke-width', origWidth);
          resolve();
        }, duration);
      });
    }

    function fadeIn(el: SVGElement, duration: number): Promise<void> {
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

    function setGaugeLevel(level: AlphaLevel): void {
      if (level === 'safe') gaugeFill.setAttribute('fill', colors.success);
      else if (level === 'caution') gaugeFill.setAttribute('fill', colors.itemComparing);
      else gaugeFill.setAttribute('fill', colors.danger);
    }

    function setGauge(alpha: number, size: number, m: number, level: AlphaLevel): void {
      const ratio = Math.max(0, Math.min(1, alpha));
      const w = SLOTS_AREA_W * Math.min(1, ratio);
      gaugeFill.setAttribute('width', String(w));
      gaugeLabel.textContent = `α = ${alpha.toFixed(2)} (${size}/${m})`;
      setGaugeLevel(level);
    }

    function setDistribution(d: Distribution): void {
      distLabel.textContent = `분포: 비어 ${d.empty} · 길이 1: ${d.len1} · 길이 2: ${d.len2} · 길이 3+: ${d.len3plus}`;
    }

    function setHashLabel(text: string): void {
      fnLabel.textContent = text;
    }

    function setTransformLine(text: string): void {
      fnTransform.textContent = text;
    }

    // ── 보조 비교 영역 ──
    function refreshAuxChain(): void {
      for (let i = 0; i < AUX_M; i++) {
        const len = auxChainData[i]!.length;
        auxChainLengthLabels[i]!.textContent = String(len);
        auxChainCells[i]!.setAttribute('stroke', len > 0 ? colors.text : colors.border);
        auxChainCells[i]!.setAttribute('stroke-dasharray', len > 0 ? '' : '2 2');
        // 셀 아래 짧은 막대 높이로 사슬 길이 표시.
        const grp = auxChainBelowGroups[i]!;
        while (grp.firstChild) grp.firstChild.remove();
        const visible = Math.min(len, 4);
        for (let s = 0; s < visible; s++) {
          const cx = AUX_X + i * (AUX_CELL + AUX_GAP);
          const r = document.createElementNS(SVG_NS, 'rect');
          setAttrs(r, {
            x: cx + 2,
            y: AUX_CHAIN_TOP + AUX_CELL + 1 + s * 4,
            width: AUX_CELL - 4,
            height: 3,
            fill: colors.itemActive,
            opacity: String(1 - s * 0.18),
          });
          grp.appendChild(r);
        }
      }
    }

    function refreshAuxLinear(): void {
      for (let i = 0; i < AUX_M; i++) {
        const v = auxLinearData[i];
        auxLinearCells[i]!.setAttribute('stroke', v != null ? colors.text : colors.border);
        auxLinearCells[i]!.setAttribute('stroke-dasharray', v != null ? '' : '2 2');
        auxLinearCells[i]!.setAttribute(
          'fill',
          v != null ? colorOfKey(v) : colors.bg,
        );
        if (v != null) {
          auxLinearTexts[i]!.textContent = v;
          auxLinearTexts[i]!.setAttribute('opacity', '1');
        } else {
          auxLinearTexts[i]!.setAttribute('opacity', '0');
        }
      }
    }

    function mirrorInsert(key: string): void {
      const n = Number(key);
      if (!Number.isFinite(n)) return;
      const i = hash(n, AUX_M);
      // 체이닝: 그 자리 사슬에 추가 (중복은 무시).
      if (!auxChainData[i]!.includes(key)) auxChainData[i]!.push(key);
      // 선형 탐사: i 부터 다음 빈 칸까지 전진.
      let p = i;
      let probes = 0;
      while (auxLinearData[p] != null && auxLinearData[p] !== key && probes < AUX_M) {
        p = (p + 1) % AUX_M;
        probes += 1;
      }
      if (probes < AUX_M) auxLinearData[p] = key;
      refreshAuxChain();
      refreshAuxLinear();
    }

    function mirrorReset(): void {
      auxChainData = Array.from({ length: AUX_M }, () => []);
      auxLinearData = Array.from({ length: AUX_M }, () => null);
      refreshAuxChain();
      refreshAuxLinear();
    }

    // ── 메서드 본체 ──
    function reset(): void {
      clearCaptionTimer();
      while (slotsGroup.firstChild) slotsGroup.firstChild.remove();
      while (chainGroup.firstChild) chainGroup.firstChild.remove();
      while (overlayGroup.firstChild) overlayGroup.firstChild.remove();
      slots = [];
      M = 0;
      serialCounter = 0;
      eventCaption.textContent = '';
      gaugeFill.setAttribute('width', '0');
      gaugeLabel.textContent = 'α = 0.00 (0/—)';
      setGaugeLevel('safe');
      distLabel.textContent = '분포: —';
      fnLabel.textContent = 'h(k) = k mod ?';
      fnTransform.textContent = '';
      mirrorReset();
    }

    function init(payload: { M: number; hashLabel: string }): void {
      reset();
      buildSlots(payload.M);
      setHashLabel(payload.hashLabel);
      setDistribution({ empty: payload.M, len1: 0, len2: 0, len3plus: 0 });
      gaugeLabel.textContent = `α = 0.00 (0/${payload.M})`;
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

    async function emitInsert(
      payload: {
        index: number;
        key: string;
        slot: number;
        isCollision: boolean;
        chainLength: number;
        size: number;
        M: number;
        alpha: number;
        distribution: Distribution;
      },
      opts?: { duration?: number },
    ): Promise<void> {
      const dur = opts?.duration ?? HASH_DROP_MS;
      // 1. 함수 박스 통과 운동: 좌측 입구 → 박스 출구.
      setTransformLine(
        `key=${payload.key} → ${payload.key} mod ${payload.M} = ${payload.index}`,
      );
      // 토큰 좌측 입구에서 출구까지 직선 활주.
      await flyToken(
        payload.key,
        FN_INPUT_X - 8,
        FN_BOX_CY,
        FN_OUTPUT_X + 8,
        FN_BOX_CY,
        dur * 0.4,
        false,
      );

      // 2. 함수 출구 → 슬롯 i 떨어지기 (곡선).
      const targetX = slotCellCenterX(payload.index);
      const targetY = SLOTS_TOP_Y + SLOTS_H / 2;
      // 충돌이면 동시에 셀 깜빡, 사슬 자라기.
      const flyP = flyToken(
        payload.key,
        FN_OUTPUT_X + 8,
        FN_BOX_CY,
        targetX,
        targetY,
        dur * 0.6,
        true,
      );
      if (payload.isCollision) {
        // 사이클 짧은 깜빡 — flash 가 토큰 도착 직전에 발생.
        setTimeout(
          () => {
            void flashCellBorder(payload.index, colors.itemActive, COLLISION_FLASH_MS);
          },
          Math.max(0, dur * 0.5),
        );
      }
      await flyP;

      // 3. 셀 점유 갱신 + 사슬 노드 추가.
      const slot = slots[payload.index];
      if (!slot) return;
      setSlotOccupied(payload.index, true, payload.isCollision);
      const newNode = makeChainNode(payload.key, payload.index, payload.slot);
      slot.nodes.push(newNode);
      newNode.el.setAttribute('opacity', '0');
      const fadeP = fadeIn(newNode.el, CHAIN_GROW_MS);
      if (payload.slot >= MAX_VISIBLE_CHAIN) {
        // 가시 범위 밖 — 즉시 숨김 처리, +n 배지 갱신.
        newNode.el.setAttribute('opacity', '0');
      }
      await fadeP;
      refreshOverflowBadge(payload.index);

      // 4. 게이지 / 분포 갱신.
      setDistribution(payload.distribution);
      const level: AlphaLevel =
        payload.alpha >= 0.75 ? 'warn' : payload.alpha >= 0.5 ? 'caution' : 'safe';
      setGauge(payload.alpha, payload.size, payload.M, level);

      // 5. 보조 비교 영역 갱신.
      mirrorInsert(payload.key);

      // 캡션.
      if (payload.isCollision) {
        setCaption('같은 자리에 둘이 떨어졌다 — 사슬이 한 칸 자란다.', { duration: 1800 });
      } else {
        setCaption('키를 정해진 자리로 던져 넣었다.', { duration: 1400 });
      }

      // 변환 라인은 잠시 남겨둠.
      setTimeout(() => setTransformLine(''), 1600);

      serialCounter += 1;
    }

    function duplicateKey(payload: { index: number; key: string; slot: number }): Promise<void> {
      // 같은 키 중복 — 사슬에서 그 자리만 잠깐 강조.
      const slot = slots[payload.index];
      if (!slot) return Promise.resolve();
      const node = slot.nodes[payload.slot];
      if (!node) return Promise.resolve();
      const orig = node.rect.getAttribute('stroke') ?? colors.text;
      node.rect.setAttribute('stroke', colors.itemPivot);
      node.rect.setAttribute('stroke-width', '2.5');
      setCaption(`key ${payload.key} 는 이미 그 자리 사슬에 있다.`, { duration: 1400 });
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          node.rect.setAttribute('stroke', orig);
          node.rect.setAttribute('stroke-width', '1');
          resolve();
        }, 600);
      });
    }

    function searchPrepare(key: string): void {
      setTransformLine(`찾을 key=${key}`);
      setCaption('함수 박스가 자리를 가리킨다 — 그 자리의 사슬을 짚어 본다.', {
        duration: 1800,
      });
    }

    async function searchJump(
      payload: { index: number; key: string },
      opts?: { duration?: number },
    ): Promise<void> {
      const dur = opts?.duration ?? SEARCH_RING_MS;
      setTransformLine(
        `key=${payload.key} → ${payload.key} mod ${M} = ${payload.index}`,
      );
      const cx = slotCellCenterX(payload.index);
      const cy = SLOTS_TOP_Y + SLOTS_H / 2;
      // 함수 박스 출구에서 슬롯으로 가는 시각적 점선 화살표(짧은 운동) + 동심원.
      await pulseRing(cx, cy, colors.itemActive, dur);
    }

    async function searchChainStep(
      payload: { index: number; slot: number; key: string; isMatch: boolean; isFinal: boolean },
      opts?: { duration?: number },
    ): Promise<void> {
      const dur = opts?.duration ?? 280;
      const slot = slots[payload.index];
      if (!slot) return;
      const node = slot.nodes[payload.slot];
      if (!node) return;
      const cx = Number((node.el.getAttribute('transform')?.match(/translate\(([-\d.]+),/) ?? [])[1] ?? 0);
      const cy = Number((node.el.getAttribute('transform')?.match(/,\s*([-\d.]+)\)/) ?? [])[1] ?? 0);
      // 펄스 + 카드 강조.
      const orig = node.rect.getAttribute('fill') ?? '';
      const origStroke = node.rect.getAttribute('stroke') ?? colors.text;
      node.rect.setAttribute(
        'fill',
        payload.isMatch ? colors.itemPivot : colors.itemComparing,
      );
      node.rect.setAttribute('stroke', colors.itemActive);
      node.rect.setAttribute('stroke-width', '2');
      void pulseRing(cx, cy, colors.itemActive, dur);
      await sleep(dur);
      if (!payload.isMatch) {
        node.rect.setAttribute('fill', orig);
        node.rect.setAttribute('stroke', origStroke);
        node.rect.setAttribute('stroke-width', '1');
      }
    }

    function searchResult(payload: {
      found: boolean;
      index?: number;
      slot?: number;
      key: string;
      walked: number;
    }): void {
      if (payload.found) {
        setCaption(
          `한 번의 점프 + ${payload.walked} 칸 비교 — 인덱스 ${payload.index ?? '?'} 의 ${payload.key} 도착.`,
          { duration: 2200 },
        );
      } else {
        setCaption('이 자리 사슬에 그 키는 없다.', { duration: 2000 });
      }
      setTimeout(() => setTransformLine(''), 1800);
    }

    function removePrepare(key: string): void {
      setTransformLine(`삭제할 key=${key}`);
      setCaption('함수 박스가 자리를 가리킨다 — 그 자리에서 떼어낸다.', { duration: 1800 });
    }

    async function removeJump(
      payload: { index: number; key: string },
      opts?: { duration?: number },
    ): Promise<void> {
      await searchJump(payload, opts);
    }

    async function removeChainStep(
      payload: { index: number; slot: number; key: string; isMatch: boolean; isFinal: boolean },
      opts?: { duration?: number },
    ): Promise<void> {
      await searchChainStep(payload, opts);
    }

    async function removeResult(payload: {
      found: boolean;
      index?: number;
      slot?: number;
      key: string;
      size: number;
      M: number;
      alpha: number;
      distribution: Distribution;
    }): Promise<void> {
      if (payload.found && typeof payload.index === 'number' && typeof payload.slot === 'number') {
        const slot = slots[payload.index];
        if (slot) {
          const removed = slot.nodes.splice(payload.slot, 1)[0];
          if (removed) {
            // 페이드아웃 + 위로 떠오름.
            await new Promise<void>((resolve) => {
              const cur = removed.el.getAttribute('transform') ?? '';
              const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(cur);
              const fx = m ? Number(m[1]) : 0;
              const fy = m ? Number(m[2]) : 0;
              const start = performance.now();
              function tick(now: number): void {
                const t = Math.min(1, (now - start) / 320);
                const e = easeInOut(t);
                const y = fy - 16 * e;
                removed.el.setAttribute('opacity', String(1 - e));
                removed.el.setAttribute('transform', `translate(${fx},${y})`);
                if (t < 1) raf(tick);
                else {
                  removed.el.remove();
                  resolve();
                }
              }
              raf(tick);
            });
            // 남은 노드 자리 메우기.
            for (let s = payload.slot; s < slot.nodes.length; s++) {
              const n = slot.nodes[s]!;
              const cx = slotCellCenterX(payload.index);
              const cy = chainNodeY(s);
              n.el.setAttribute('transform', `translate(${cx},${cy})`);
              n.el.setAttribute('opacity', s < MAX_VISIBLE_CHAIN ? '1' : '0');
            }
            // 셀 점유 상태 갱신.
            if (slot.nodes.length === 0) setSlotOccupied(payload.index, false, false);
            else setSlotOccupied(payload.index, true, slot.nodes.length > 1);
            refreshOverflowBadge(payload.index);
          }
        }
        setCaption(`사슬에서 ${payload.key} 만 떼어냈다.`, { duration: 1600 });
      } else {
        setCaption('이 자리 사슬에 그 키는 없다.', { duration: 1600 });
      }
      setDistribution(payload.distribution);
      const level: AlphaLevel =
        payload.alpha >= 0.75 ? 'warn' : payload.alpha >= 0.5 ? 'caution' : 'safe';
      setGauge(payload.alpha, payload.size, payload.M, level);
      setTimeout(() => setTransformLine(''), 1600);
    }

    function updateAlpha(payload: { alpha: number; level: AlphaLevel }): void {
      setGaugeLevel(payload.level);
      if (payload.level === 'warn') {
        setCaption('표가 답답해지고 있다 — 곧 표를 키워야 한다.', { duration: 1400 });
      }
    }

    async function rehashBegin(
      payload: { oldM: number; newM: number; hashLabel: string },
      opts?: { duration?: number },
    ): Promise<void> {
      const dur = opts?.duration ?? 600;
      setCaption('표가 답답해졌다 — 표를 키우고 모두 다시 던진다.', { duration: 2200 });
      setHashLabel(payload.hashLabel);
      // 옛 사슬 카드들을 모두 위로 떠올려 페이드 (노드만, 셀은 새 표로 교체).
      const fadePromises: Promise<void>[] = [];
      for (const slot of slots) {
        for (const node of slot.nodes) {
          fadePromises.push(
            new Promise<void>((resolve) => {
              const cur = node.el.getAttribute('transform') ?? '';
              const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(cur);
              const fx = m ? Number(m[1]) : 0;
              const fy = m ? Number(m[2]) : 0;
              const start = performance.now();
              function tick(now: number): void {
                const t = Math.min(1, (now - start) / Math.max(10, dur));
                const e = easeInOut(t);
                const y = fy - 30 * e;
                node.el.setAttribute('opacity', String(1 - e));
                node.el.setAttribute('transform', `translate(${fx},${y})`);
                if (t < 1) raf(tick);
                else {
                  node.el.remove();
                  resolve();
                }
              }
              raf(tick);
            }),
          );
        }
      }
      await Promise.all(fadePromises);
      // 새 표로 슬롯 재구성.
      buildSlots(payload.newM);
      // 보조 영역은 그대로 두되 안내 문구 회색 처리.
      auxNote1.textContent = '본 시각은 새 표로, 보조는 옛 표 비교용';
    }

    async function rehashStep(
      payload: { key: string; oldIndex: number; newIndex: number; slot: number },
      opts?: { duration?: number },
    ): Promise<void> {
      const dur = opts?.duration ?? REHASH_STEP_MS;
      // 함수 박스 위로 키 토큰을 등장시켜 새 자리로 떨어뜨린다.
      setTransformLine(
        `key=${payload.key} → ${payload.key} mod ${M} = ${payload.newIndex}`,
      );
      const targetX = slotCellCenterX(payload.newIndex);
      const targetY = SLOTS_TOP_Y + SLOTS_H / 2;
      await flyToken(
        payload.key,
        FN_INPUT_X - 8,
        FN_BOX_CY,
        FN_OUTPUT_X + 8,
        FN_BOX_CY,
        dur * 0.4,
        false,
      );
      await flyToken(
        payload.key,
        FN_OUTPUT_X + 8,
        FN_BOX_CY,
        targetX,
        targetY,
        dur * 0.6,
        true,
      );
      const slot = slots[payload.newIndex];
      if (!slot) return;
      const node = makeChainNode(payload.key, payload.newIndex, payload.slot);
      slot.nodes.push(node);
      setSlotOccupied(payload.newIndex, true, slot.nodes.length > 1);
      if (payload.slot >= MAX_VISIBLE_CHAIN) {
        node.el.setAttribute('opacity', '0');
      } else {
        await fadeIn(node.el, dur * 0.4);
      }
      refreshOverflowBadge(payload.newIndex);
    }

    function rehashEnd(payload: {
      M: number;
      alpha: number;
      distribution: Distribution;
      hashLabel: string;
    }): void {
      setHashLabel(payload.hashLabel);
      setDistribution(payload.distribution);
      const level: AlphaLevel =
        payload.alpha >= 0.75 ? 'warn' : payload.alpha >= 0.5 ? 'caution' : 'safe';
      // size 는 distribution 으로 환산: M - empty 자리에 nodes...실은 알파 * M.
      const size = Math.round(payload.alpha * payload.M);
      setGauge(payload.alpha, size, payload.M, level);
      setCaption('표를 키우고 모두 다시 던졌다 — α 가 다시 안전 구간이다.', {
        duration: 2400,
      });
      setTimeout(() => setTransformLine(''), 2000);
    }

    function signalEmpty(op: string): void {
      setCaption('표가 비어 있다.', { duration: 1400 });
      void op;
    }

    function signalInvalid(op: string, raw: string): void {
      setCaption(`정수 키만 받는다 (입력: "${raw}").`, { duration: 1600 });
      void op;
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
      emitInsert,
      duplicateKey,
      searchPrepare,
      searchJump,
      searchChainStep,
      searchResult,
      removePrepare,
      removeJump,
      removeChainStep,
      removeResult,
      updateAlpha,
      rehashBegin,
      rehashStep,
      rehashEnd,
      signalEmpty,
      signalInvalid,
    };
  },
};
