/**
 * array-stage View — 배열 자료구조 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 셀 띠 / 인덱스 라벨 / 점프 화살표 / 산술 라벨 / 누적 막대 /
 * resize 임시 새 띠 / 캡션 영역을 모두 담는다. 기획서 §6: "모든 사건은 단 하나의
 * 띠 위에서 일어난다."
 *
 * 메서드 (projector → view):
 *   - reset()                                         — 빈 상태 복귀.
 *   - init(values, capacity)                          — 초기 셀 띠 구성.
 *   - setBaseCaption(text), setCaption(text, opts?)
 *   - read(index, opts?)                              — 호 곡선 점프 + 산술 라벨 + 강조 깜빡.
 *   - write(index, oldVal, newVal, opts?)             — 점프 + 칸 색 한 박자 깊어짐 + 텍스트 갱신.
 *   - insert(index, value, shifted, size, capacity, opts?)  — 새 칸 솟음 + 도미노 시프트.
 *   - remove(index, value, shifted, size, opts?)            — 칸 페이드아웃 + 도미노 좌측 시프트.
 *   - append(index, value, size, capacity, opts?)
 *   - resize(oldCap, newCap, values, opts?)           — 두 배 길이 새 띠 fade-in → 이사 → 헌 띠 fade-out.
 *   - searchStep(index, isMatch, isFinal, opts?)      — 화살표 한 칸씩 진행.
 *   - searchResult(found, index?, value, opts?)
 *   - signalOutOfRange(opts?)                         — 빨간 점선 깜빡.
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import { getColors, fonts, fontSizes } from '@facet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 680;
const H = 240;
const CAPTION_H = 56;
const STRIP_TOP = CAPTION_H + 32; // 띠 윗변 y (위쪽엔 누적 막대가 차지)
const ARROW_DROP = 36;            // 띠 바닥 + 인덱스 라벨 아래로 화살표가 떨어진 거리

const STRIP_LEFT_PADDING = 130;   // 좌측 size/cap 라벨 영역
const RIGHT_MARGIN = 16;
/** 띠가 차지할 수 있는 가용 폭 — 누적 막대를 위로 분리했으므로 띠는 가로 끝까지 쓸 수 있다. */
const STRIP_AVAILABLE = W - STRIP_LEFT_PADDING - RIGHT_MARGIN;

// === 누적 막대 (가로 progress bar) — 캡션 ↔ 띠 사이 상단 행 ===
const TALLY_BAR_Y = 64;             // 막대 상단 y (캡션 아래 8px)
const TALLY_BAR_HEIGHT = 12;
const TALLY_BAR_LEFT = 180;         // 막대 좌측 x (좌측 헤더 자리 130~170 확보)
const TALLY_BAR_RIGHT = W - 80;     // 막대 우측 x (우측 ∑N 라벨 자리 60px 확보)
const TALLY_BAR_WIDTH = TALLY_BAR_RIGHT - TALLY_BAR_LEFT;
/** 한 사건 누적당 막대 한 칸 폭 (px). 학습 한도 (size 15) 안에서 발생할 수 있는
 *  최대 누적 (≈ 200) 까지 거치며, 일반 시나리오 (10~50건) 가 막대 절반 이내에 들어오도록 6px. */
const TALLY_UNIT = 6;

const INDEX_LABEL_GAP = 16;
const ARITH_LABEL_GAP = 60; // 화살표(36) 아래로 — 인덱스 라벨/화살표와 겹치지 않게

/** capacity 가 어떻든 띠 + 누적 막대가 viewBox 안에 들어가도록 cellW 를 동적 산출. */
function cellWidth(capacity: number): number {
  const fit = Math.floor(STRIP_AVAILABLE / Math.max(1, capacity));
  return Math.max(24, Math.min(56, fit));
}
function cellHeight(capacity: number): number {
  // 정사각 — 기획서 56×56. 좁아질 때만 가로에 맞춰 살짝 줄인다.
  return cellWidth(capacity);
}

function raf(cb: (t: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}

type Cell = {
  el: SVGGElement;
  rect: SVGRectElement;
  text: SVGTextElement;
  /** size 안 채색 칸이면 true, 회색 예비 칸이면 false. */
  filled: boolean;
};

type Layout = {
  capacity: number;
  cellW: number;
  cellH: number;
  /** 띠 좌상단 x 좌표 (셀 0 의 좌측 변). */
  stripLeft: number;
  /** 띠 윗변 y. */
  stripTop: number;
};

export const arrayStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);

    const root = document.createElement('div');
    root.className = 'facet-array-stage';
    root.style.fontFamily = fonts.body;
    root.style.color = colors.text;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = `${W}px`;
    svg.style.display = 'block';
    svg.style.background = colors.bgSubtle;

    // 회색 예비 칸 격자 무늬 패턴.
    const defs = document.createElementNS(SVG_NS, 'defs');
    const pattern = document.createElementNS(SVG_NS, 'pattern');
    setAttrs(pattern, {
      id: 'array-empty-cell',
      patternUnits: 'userSpaceOnUse',
      width: 6,
      height: 6,
    });
    const patternBg = document.createElementNS(SVG_NS, 'rect');
    setAttrs(patternBg, { x: 0, y: 0, width: 6, height: 6, fill: colors.bgSubtle });
    const patternLine = document.createElementNS(SVG_NS, 'path');
    setAttrs(patternLine, {
      d: 'M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2',
      stroke: colors.border,
      'stroke-width': '1',
    });
    pattern.append(patternBg, patternLine);
    defs.appendChild(pattern);
    svg.appendChild(defs);

    // === 캡션 ===
    const baseCaptionEl = document.createElementNS(SVG_NS, 'text');
    setAttrs(baseCaptionEl, {
      x: 16,
      y: 22,
      fill: colors.textMuted,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
    });
    baseCaptionEl.textContent = '';

    const eventCaptionEl = document.createElementNS(SVG_NS, 'text');
    setAttrs(eventCaptionEl, {
      x: 16,
      y: 44,
      fill: colors.text,
      'font-size': fontSizes.md,
      'font-family': fonts.body,
      'font-weight': '600',
    });
    eventCaptionEl.textContent = '';

    svg.append(baseCaptionEl, eventCaptionEl);

    const stageGroup = document.createElementNS(SVG_NS, 'g');
    stageGroup.setAttribute('transform', 'translate(0,0)');
    svg.appendChild(stageGroup);

    // === size/cap 라벨 ===
    const sizeCapLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(sizeCapLabel, {
      x: 16,
      y: STRIP_TOP + 28,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.mono,
    });
    sizeCapLabel.textContent = '';
    stageGroup.appendChild(sizeCapLabel);

    // === 띠 (cell) 그룹 ===
    /** 현재 표시 중인 띠. resize 동안 두 띠가 공존할 수 있어 배열로 관리. */
    type Strip = {
      group: SVGGElement;
      cells: Cell[];
      layout: Layout;
    };
    const stripGroup = document.createElementNS(SVG_NS, 'g');
    stageGroup.appendChild(stripGroup);

    let primary: Strip | null = null;
    /** resize 중 임시 새 띠. 평소 null. */
    let secondary: Strip | null = null;

    // === 화살표 (점프/검색 공용) ===
    const arrowGroup = document.createElementNS(SVG_NS, 'g');
    arrowGroup.setAttribute('opacity', '0');
    const arrowPath = document.createElementNS(SVG_NS, 'path');
    setAttrs(arrowPath, {
      d: 'M-7,12 L7,12 L7,3 L13,3 L0,-9 L-13,3 L-7,3 Z',
      fill: colors.text,
    });
    arrowGroup.appendChild(arrowPath);
    stageGroup.appendChild(arrowGroup);

    // === 산술 라벨 ===
    const arithLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(arithLabel, {
      x: 0,
      y: 0,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.mono,
      'text-anchor': 'middle',
      opacity: '0',
    });
    arithLabel.textContent = '';
    stageGroup.appendChild(arithLabel);

    // === 누적 막대 (시프트 비용) — 캡션 ↔ 띠 사이 가로 progress bar. 띠와 독립된 행. ===
    const tallyGroup = document.createElementNS(SVG_NS, 'g');
    stageGroup.appendChild(tallyGroup);
    const tallyHeader = document.createElementNS(SVG_NS, 'text');
    setAttrs(tallyHeader, {
      x: STRIP_LEFT_PADDING,
      y: TALLY_BAR_Y + TALLY_BAR_HEIGHT - 2,
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
      'text-anchor': 'start',
    });
    tallyHeader.textContent = '시프트';
    tallyGroup.appendChild(tallyHeader);
    const tallyBg = document.createElementNS(SVG_NS, 'rect');
    setAttrs(tallyBg, {
      x: TALLY_BAR_LEFT,
      y: TALLY_BAR_Y,
      width: TALLY_BAR_WIDTH,
      height: TALLY_BAR_HEIGHT,
      fill: 'none',
      stroke: colors.border,
      'stroke-width': '1',
      'stroke-dasharray': '3 3',
      rx: '3',
    });
    tallyGroup.appendChild(tallyBg);
    const tallyFill = document.createElementNS(SVG_NS, 'rect');
    setAttrs(tallyFill, {
      x: TALLY_BAR_LEFT + 1,
      y: TALLY_BAR_Y + 1,
      width: 0,
      height: TALLY_BAR_HEIGHT - 2,
      fill: colors.itemSwapping,
      rx: '2',
    });
    tallyGroup.appendChild(tallyFill);
    const tallyLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(tallyLabel, {
      x: W - RIGHT_MARGIN,
      y: TALLY_BAR_Y + TALLY_BAR_HEIGHT - 2,
      fill: colors.text,
      'font-size': fontSizes.xs,
      'font-family': fonts.mono,
      'text-anchor': 'end',
    });
    tallyLabel.textContent = '∑ 0';
    tallyGroup.appendChild(tallyLabel);
    let tallyTotal = 0;

    // === 범위 밖 신호 (빨간 점선) ===
    const outOfRangeMark = document.createElementNS(SVG_NS, 'rect');
    setAttrs(outOfRangeMark, {
      fill: 'none',
      stroke: colors.danger,
      'stroke-width': '2',
      'stroke-dasharray': '4 3',
      rx: '4',
      opacity: '0',
    });
    stageGroup.appendChild(outOfRangeMark);

    root.appendChild(svg);
    container.appendChild(root);

    // === 헬퍼 ===
    let captionTimer: ReturnType<typeof setTimeout> | null = null;
    function clearCaptionTimer(): void {
      if (captionTimer !== null) {
        clearTimeout(captionTimer);
        captionTimer = null;
      }
    }

    function computeLayout(capacity: number, yOffset = 0): Layout {
      const cellW = cellWidth(capacity);
      const cellH = cellHeight(capacity);
      // 띠 길이 + 누적 막대 영역이 화면에 들어가도록 좌측 정렬 (띠 좌측은 STRIP_LEFT_PADDING 고정).
      const stripLeft = STRIP_LEFT_PADDING;
      const stripTop = STRIP_TOP + yOffset;
      return { capacity, cellW, cellH, stripLeft, stripTop };
    }

    function cellCenter(idx: number, layout: Layout): { x: number; y: number } {
      return {
        x: layout.stripLeft + idx * layout.cellW + layout.cellW / 2,
        y: layout.stripTop + layout.cellH / 2,
      };
    }

    function makeCell(label: string, idx: number, layout: Layout, filled: boolean): Cell {
      const g = document.createElementNS(SVG_NS, 'g');
      const c = cellCenter(idx, layout);
      g.setAttribute('transform', `translate(${c.x},${c.y})`);
      const rect = document.createElementNS(SVG_NS, 'rect');
      setAttrs(rect, {
        x: -layout.cellW / 2,
        y: -layout.cellH / 2,
        width: layout.cellW,
        height: layout.cellH,
        fill: filled ? colors.itemDefault : 'url(#array-empty-cell)',
        stroke: colors.text,
        'stroke-width': '1',
      });
      g.appendChild(rect);
      const text = document.createElementNS(SVG_NS, 'text');
      setAttrs(text, {
        x: 0,
        y: 0,
        'dominant-baseline': 'central',
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': layout.cellW >= 48 ? fontSizes.md : fontSizes.sm,
        'font-weight': '600',
        fill: colors.text,
      });
      text.textContent = filled ? label : '';
      g.appendChild(text);
      return { el: g, rect, text, filled };
    }

    function makeStrip(values: string[], capacity: number, yOffset = 0): Strip {
      const layout = computeLayout(capacity, yOffset);
      const group = document.createElementNS(SVG_NS, 'g');
      stripGroup.appendChild(group);
      const cells: Cell[] = [];
      for (let i = 0; i < capacity; i++) {
        const filled = i < values.length;
        const cell = makeCell(filled ? values[i]! : '', i, layout, filled);
        group.appendChild(cell.el);
        cells.push(cell);
      }
      return { group, cells, layout };
    }

    function destroyStrip(s: Strip | null): void {
      if (!s) return;
      s.group.remove();
    }

    function rebuildStrip(values: string[], capacity: number): void {
      destroyStrip(primary);
      primary = makeStrip(values, capacity);
      relayoutMisc();
    }

    function relayoutMisc(): void {
      if (!primary) return;
      ensureIndexLabels(primary);
      // 누적 막대는 캡션 ↔ 띠 사이 정적 위치 — 띠 layout 과 무관. 폭만 갱신한다.
      updateTallyFill();
    }

    /** 인덱스 라벨 별도 그룹. strip 마다 한 번 만들고 destroyStrip 시 같이 제거되도록 strip.group 에 붙인다. */
    function ensureIndexLabels(s: Strip): void {
      // 기존 인덱스 라벨 제거 후 재생성.
      const old = s.group.querySelectorAll('text[data-array-index-label]');
      old.forEach((el) => el.remove());
      const { capacity, cellW, cellH, stripLeft, stripTop } = s.layout;
      for (let i = 0; i < capacity; i++) {
        const t = document.createElementNS(SVG_NS, 'text');
        setAttrs(t, {
          x: stripLeft + i * cellW + cellW / 2,
          y: stripTop + cellH + INDEX_LABEL_GAP,
          fill: i < (s.cells.filter((c) => c.filled).length) ? colors.text : colors.textMuted,
          'font-size': fontSizes.xs,
          'font-family': fonts.mono,
          'text-anchor': 'middle',
        });
        t.setAttribute('data-array-index-label', '1');
        t.textContent = String(i);
        s.group.appendChild(t);
      }
    }

    /** 도미노 운동 후 cells[i].transform 을 자기 인덱스 자리 (cellCenter(i)) 로 정렬. */
    function snapCellsToLayout(): void {
      if (!primary) return;
      for (let i = 0; i < primary.cells.length; i++) {
        const c = cellCenter(i, primary.layout);
        primary.cells[i].el.setAttribute('transform', `translate(${c.x},${c.y})`);
      }
    }

    function refreshIndexLabelColors(): void {
      if (!primary) return;
      const filledCount = primary.cells.filter((c) => c.filled).length;
      const labels = primary.group.querySelectorAll('text[data-array-index-label]');
      labels.forEach((el, i) => {
        el.setAttribute('fill', i < filledCount ? colors.text : colors.textMuted);
      });
    }

    function updateSizeCapLabel(): void {
      if (!primary) {
        sizeCapLabel.textContent = '';
        return;
      }
      const filled = primary.cells.filter((c) => c.filled).length;
      sizeCapLabel.textContent = `size ${filled} / cap ${primary.layout.capacity}`;
    }

    function updateTallyFill(): void {
      // 좌→우 가로 progress bar. 한 사건당 TALLY_UNIT 만큼 채워진다.
      const maxW = TALLY_BAR_WIDTH - 2;
      const rawW = tallyTotal * TALLY_UNIT;
      const filledW = Math.min(maxW, rawW);
      const saturated = rawW >= maxW;
      setAttrs(tallyFill, {
        width: Math.max(0, filledW),
        fill: saturated ? colors.danger : colors.itemSwapping,
      });
      tallyLabel.textContent = `∑ ${tallyTotal}`;
    }

    function bumpTally(delta: number): void {
      if (delta <= 0) return;
      tallyTotal += delta;
      updateTallyFill();
    }

    // === 메서드 본체 ===
    function reset(): void {
      clearCaptionTimer();
      destroyStrip(primary);
      destroyStrip(secondary);
      primary = null;
      secondary = null;
      tallyTotal = 0;
      sizeCapLabel.textContent = '';
      arrowGroup.setAttribute('opacity', '0');
      arithLabel.setAttribute('opacity', '0');
      eventCaptionEl.textContent = '';
      outOfRangeMark.setAttribute('opacity', '0');
      // 누적 막대는 정적 영역. 폭만 0 으로 초기화.
      setAttrs(tallyFill, { width: 0 });
      tallyLabel.textContent = '∑ 0';
    }

    function init(values: string[], capacity: number): void {
      reset();
      rebuildStrip(values, capacity);
      updateSizeCapLabel();
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

    /** 화살표를 띠 아래 (인덱스 라벨 아래) 자리로 호 곡선 이동. duration ms. */
    function moveArrowArc(toX: number, duration: number): Promise<void> {
      if (!primary) return Promise.resolve();
      const { stripTop, cellH } = primary.layout;
      const targetY = stripTop + cellH + ARROW_DROP;
      const cur = arrowGroup.getAttribute('transform') ?? '';
      const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(cur);
      const fromX = m ? Number(m[1]) : toX;
      const fromY = m ? Number(m[2]) : targetY;
      arrowGroup.setAttribute('opacity', '1');
      const ctrlX = (fromX + toX) / 2;
      // 띠 아래에서 운동하므로 호는 아래로 솟는다.
      const ctrlY = Math.max(fromY, targetY) + 30;
      return new Promise((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          const e = easeInOut(t);
          const x = (1 - e) * (1 - e) * fromX + 2 * (1 - e) * e * ctrlX + e * e * toX;
          const y = (1 - e) * (1 - e) * fromY + 2 * (1 - e) * e * ctrlY + e * e * targetY;
          arrowGroup.setAttribute('transform', `translate(${x},${y})`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
    }

    /** 화살표 직선 이동 (검색 한 칸씩 진행용). */
    function moveArrowLinear(toX: number, duration: number): Promise<void> {
      if (!primary) return Promise.resolve();
      const { stripTop, cellH } = primary.layout;
      const targetY = stripTop + cellH + ARROW_DROP;
      const cur = arrowGroup.getAttribute('transform') ?? '';
      const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(cur);
      const fromX = m ? Number(m[1]) : toX;
      const fromY = m ? Number(m[2]) : targetY;
      arrowGroup.setAttribute('opacity', '1');
      return new Promise((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, duration));
          const e = easeInOut(t);
          const x = fromX + (toX - fromX) * e;
          const y = fromY + (targetY - fromY) * e;
          arrowGroup.setAttribute('transform', `translate(${x},${y})`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
    }

    function flashCell(cell: Cell, duration: number, color: string): Promise<void> {
      const orig = cell.rect.getAttribute('fill');
      cell.rect.setAttribute('fill', color);
      cell.rect.setAttribute('stroke', colors.accent);
      cell.rect.setAttribute('stroke-width', '2');
      return new Promise((resolve) => {
        setTimeout(() => {
          cell.rect.setAttribute('fill', orig ?? colors.itemDefault);
          cell.rect.setAttribute('stroke', colors.text);
          cell.rect.setAttribute('stroke-width', '1');
          resolve();
        }, duration);
      });
    }

    function showArithLabel(idx: number, duration: number): void {
      if (!primary) return;
      const c = cellCenter(idx, primary.layout);
      setAttrs(arithLabel, {
        x: c.x,
        y: primary.layout.stripTop + primary.layout.cellH + ARITH_LABEL_GAP,
        opacity: '1',
        fill: colors.textMuted,
      });
      arithLabel.textContent = `시작 + ${idx}`;
      setTimeout(() => arithLabel.setAttribute('opacity', '0'), duration);
    }

    async function read(index: number, opts?: { duration?: number }): Promise<void> {
      if (!primary) return;
      const duration = opts?.duration ?? 200;
      const cell = primary.cells[index];
      if (!cell) return;
      const c = cellCenter(index, primary.layout);
      await moveArrowArc(c.x, duration);
      showArithLabel(index, 600);
      await flashCell(cell, 320, colors.accent);
    }

    async function write(
      index: number,
      _oldValue: string,
      newValue: string,
      opts?: { duration?: number },
    ): Promise<void> {
      if (!primary) return;
      const duration = opts?.duration ?? 200;
      const cell = primary.cells[index];
      if (!cell) return;
      const c = cellCenter(index, primary.layout);
      await moveArrowArc(c.x, duration);
      // 색이 한 박자 깊어졌다 돌아옴 (itemActive = 주황) + 텍스트 갱신.
      const orig = cell.rect.getAttribute('fill');
      cell.rect.setAttribute('fill', colors.itemActive);
      cell.text.textContent = newValue;
      await new Promise<void>((resolve) => setTimeout(resolve, 280));
      cell.rect.setAttribute('fill', orig ?? colors.itemDefault);
    }

    /** 인덱스 i 의 칸을 dx 만큼 좌/우 이동시키며 (도미노), 한 프레임 시차 적용. */
    function shiftCellByDx(
      cell: Cell,
      dx: number,
      duration: number,
      delayMs: number,
    ): Promise<void> {
      const cur = cell.el.getAttribute('transform') ?? '';
      const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(cur);
      const fromX = m ? Number(m[1]) : 0;
      const fromY = m ? Number(m[2]) : 0;
      const toX = fromX + dx;
      return new Promise((resolve) => {
        setTimeout(() => {
          const start = performance.now();
          function tick(now: number): void {
            const t = Math.min(1, (now - start) / Math.max(10, duration));
            const e = easeInOut(t);
            const x = fromX + (toX - fromX) * e;
            cell.el.setAttribute('transform', `translate(${x},${fromY})`);
            if (t < 1) raf(tick);
            else resolve();
          }
          raf(tick);
        }, delayMs);
      });
    }

    async function insert(
      index: number,
      value: string,
      shifted: number,
      _size: number,
      _capacity: number,
      opts?: { duration?: number },
    ): Promise<void> {
      if (!primary) return;
      const duration = opts?.duration ?? 400;
      const layout = primary.layout;
      // size 직전 (filled 칸 수) 검사.
      const filledIdxBefore = primary.cells.findIndex((c) => !c.filled);
      const sizeBefore = filledIdxBefore < 0 ? primary.cells.length : filledIdxBefore;
      // 도미노: i+1..size-1 → +1 자리. 우측에서 좌측으로 진행 (마지막 칸이 가장 먼저 출발).
      // 시각적으로는 모든 칸이 거의 동시에 시작 + 한 프레임 시차.
      const cells = primary.cells;
      const promises: Promise<void>[] = [];
      // 새 칸을 넣을 자리: 기존 cells[index] 가 size-1 자리로 이동해야 하므로,
      // cells 배열에서 index 자리에 새 cell 삽입 후 index+1..size 칸이 한 칸씩 우측으로.
      // 하지만 capacity 가 가득 차 있으면 resize 후 호출되므로 sizeBefore < cells.length 가 보장.
      // 시프트는 화면상의 transform 만 이동하고, 데이터 모델 (cells 배열) 도 함께 갱신.
      // 1) i .. sizeBefore-1 자리의 채색 칸을 우측 dx=cellW 만큼 이동.
      for (let i = sizeBefore - 1; i >= index; i--) {
        const cell = cells[i];
        const delay = (sizeBefore - 1 - i) * 16; // 한 칸 16ms 시차 (도미노 파동)
        promises.push(shiftCellByDx(cell, layout.cellW, duration * 0.6, delay));
      }
      // 2) 새 칸 spawn — cells[index] 자리. 위에서 아래로 솟아 내려옴.
      const insertCenter = cellCenter(index, layout);
      const newCell = makeCell(value, index, layout, true);
      // 시작 위치: 위로 cellH 만큼 띄움 + opacity 0
      newCell.el.setAttribute(
        'transform',
        `translate(${insertCenter.x},${insertCenter.y - layout.cellH})`,
      );
      newCell.el.setAttribute('opacity', '0');
      primary.group.appendChild(newCell.el);
      const start = performance.now();
      const dropDur = duration * 0.7;
      const dropPromise = new Promise<void>((resolve) => {
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / dropDur);
          const e = easeInOut(t);
          const y = insertCenter.y - layout.cellH * (1 - e);
          newCell.el.setAttribute('opacity', String(e));
          newCell.el.setAttribute('transform', `translate(${insertCenter.x},${y})`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
      promises.push(dropPromise);
      // 3) 회색 예비 칸 하나가 사라져야 한다 — 가장 좌측의 비채색 칸 (index = sizeBefore) 을 제거.
      //    단, 그 자리에는 도미노로 밀려온 채색 칸이 들어가야 하므로, 시각적으로는 그 회색 칸 element 만 파괴.
      const grayCell = cells[sizeBefore];
      if (grayCell && !grayCell.filled) {
        grayCell.el.remove();
      }
      await Promise.all(promises);
      // 데이터 모델 갱신: cells 배열에 newCell 을 index 자리에 splice 삽입, sizeBefore 자리의 회색 제거.
      cells.splice(sizeBefore, 1); // 회색 칸 제거
      cells.splice(index, 0, newCell);
      // 결과적으로 cells.length 는 capacity 와 동일 유지. shifted 칸들은 이미 transform 이 +cellW 이동해 있고,
      // 새 cell 은 그 자리에 안착. 누적 오차 방지를 위해 모든 cell 을 자기 인덱스 자리로 정렬.
      snapCellsToLayout();
      refreshIndexLabelColors();
      updateSizeCapLabel();
      bumpTally(shifted);
    }

    async function remove(
      index: number,
      _value: string,
      shifted: number,
      _size: number,
      opts?: { duration?: number },
    ): Promise<void> {
      if (!primary) return;
      const duration = opts?.duration ?? 400;
      const layout = primary.layout;
      const cells = primary.cells;
      const filledIdxBefore = cells.findIndex((c) => !c.filled);
      const sizeBefore = filledIdxBefore < 0 ? cells.length : filledIdxBefore;
      // 1) 삭제할 칸 페이드아웃 위로 + 0.
      const removed = cells[index];
      const removedCenter = cellCenter(index, layout);
      const removeStart = performance.now();
      const fadeDur = duration * 0.4;
      const fadePromise = new Promise<void>((resolve) => {
        function tick(now: number): void {
          const t = Math.min(1, (now - removeStart) / fadeDur);
          const e = easeInOut(t);
          const y = removedCenter.y - layout.cellH * 0.5 * e;
          removed.el.setAttribute('opacity', String(1 - e));
          removed.el.setAttribute('transform', `translate(${removedCenter.x},${y})`);
          if (t < 1) raf(tick);
          else resolve();
        }
        raf(tick);
      });
      // 2) i+1..end 칸 좌측으로 dx=cellW. 회색 예비 칸까지 포함해야
      //    이후 splice 로 cells 인덱스가 한 칸 당겨질 때 transform 정합성이 유지된다.
      const promises: Promise<void>[] = [fadePromise];
      for (let i = index + 1; i < cells.length; i++) {
        const cell = cells[i];
        const delay = (i - index - 1) * 16;
        promises.push(shiftCellByDx(cell, -layout.cellW, duration * 0.6, delay + fadeDur * 0.5));
      }
      await Promise.all(promises);
      // 3) 데이터 모델: 제거된 element 파괴, cells 배열에서 splice.
      removed.el.remove();
      cells.splice(index, 1);
      // 회색 칸 한 개 추가 (cells.length 가 capacity 보다 작아졌으므로 우측에 붙임).
      const grayIdx = sizeBefore - 1; // 새 회색 자리 (마지막 채색 자리였던 곳)
      const grayCell = makeCell('', grayIdx, layout, false);
      primary.group.appendChild(grayCell.el);
      // 단, cells 배열 마지막에 추가 — 마지막 자리에 위치.
      const lastIdx = cells.length;
      const lastCenter = cellCenter(lastIdx, layout);
      grayCell.el.setAttribute('transform', `translate(${lastCenter.x},${lastCenter.y})`);
      cells.push(grayCell);
      // 누적 오차 방지를 위해 모든 cell 을 자기 인덱스 자리로 정렬.
      snapCellsToLayout();
      refreshIndexLabelColors();
      updateSizeCapLabel();
      bumpTally(shifted);
    }

    async function append(
      index: number,
      value: string,
      _size: number,
      _capacity: number,
      opts?: { duration?: number },
    ): Promise<void> {
      if (!primary) return;
      const duration = opts?.duration ?? 200;
      const layout = primary.layout;
      const cells = primary.cells;
      // index 자리의 회색 칸을 채색 칸으로 변환.
      const target = cells[index];
      if (!target) return;
      const c = cellCenter(index, layout);
      await moveArrowArc(c.x, duration);
      target.rect.setAttribute('fill', colors.itemActive);
      target.text.textContent = value;
      target.filled = true;
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      target.rect.setAttribute('fill', colors.itemDefault);
      refreshIndexLabelColors();
      updateSizeCapLabel();
    }

    async function resize(
      _oldCapacity: number,
      newCapacity: number,
      values: string[],
      opts?: { duration?: number },
    ): Promise<void> {
      if (!primary) return;
      const totalDur = opts?.duration ?? 800;
      const stage1 = totalDur * 0.25;
      const stage2 = totalDur * 0.5;
      const stage3 = totalDur * 0.25;
      // 1) 새 띠 fade-in (기존 띠 아래 yOffset = oldCellH + 24).
      // 새 capacity 에 맞춘 layout — 좁아질 수 있음.
      const newLayout = computeLayout(newCapacity, primary.layout.cellH + 24);
      const newStrip = makeStripWithLayout([], newLayout); // 빈 띠 (전부 회색)
      newStrip.group.setAttribute('opacity', '0');
      await fadeOpacity(newStrip.group, 0, 1, stage1);
      // 2) 기존 채색 칸이 한 묶음으로 새 띠 같은 자리로 이동.
      //    데이터: values[i] 가 newStrip 의 i 자리에 안착.
      const movePromises: Promise<void>[] = [];
      const oldFilled = primary.cells.filter((c) => c.filled);
      for (let i = 0; i < oldFilled.length; i++) {
        const fromCell = oldFilled[i];
        const toC = cellCenter(i, newLayout);
        const cur = fromCell.el.getAttribute('transform') ?? '';
        const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(cur);
        const from = { x: m ? Number(m[1]) : 0, y: m ? Number(m[2]) : 0 };
        movePromises.push(animateLinearG(fromCell.el, from, toC, stage2));
      }
      await Promise.all(movePromises);
      // 운동 끝 — 새 띠의 i 자리에 채색 셀 element 가 도착했으므로, newStrip.cells 의 i 회색 칸을
      // 우리가 들고 온 채색 셀로 교체한다 (DOM 이동 + 데이터 갱신).
      for (let i = 0; i < oldFilled.length; i++) {
        const filled = oldFilled[i];
        const grayCell = newStrip.cells[i];
        if (grayCell) {
          grayCell.el.remove();
        }
        // filled 의 rect 크기를 새 layout 기준으로 갱신 (capacity 가 변하면 cellW 도 변함).
        adjustCellToLayout(filled, newLayout);
        const c = cellCenter(i, newLayout);
        filled.el.setAttribute('transform', `translate(${c.x},${c.y})`);
        filled.text.textContent = values[i] ?? filled.text.textContent ?? '';
        // newStrip.group 으로 이동.
        newStrip.group.appendChild(filled.el);
        newStrip.cells[i] = filled;
      }
      // 3) 헌 띠 fade-out + 제거.
      await fadeOpacity(primary.group, 1, 0, stage3);
      primary.group.remove();
      // 새 띠를 primary 로 승격, yOffset 0 으로 재배치.
      newStrip.layout = computeLayout(newCapacity, 0);
      // 모든 cell 의 transform 을 새 layout 기준으로 옮김.
      for (let i = 0; i < newStrip.cells.length; i++) {
        const cell = newStrip.cells[i];
        adjustCellToLayout(cell, newStrip.layout);
        const c = cellCenter(i, newStrip.layout);
        cell.el.setAttribute('transform', `translate(${c.x},${c.y})`);
      }
      primary = newStrip;
      ensureIndexLabels(primary);
      refreshIndexLabelColors();
      updateSizeCapLabel();
      relayoutMisc();
    }

    function adjustCellToLayout(cell: Cell, layout: Layout): void {
      setAttrs(cell.rect, {
        x: -layout.cellW / 2,
        y: -layout.cellH / 2,
        width: layout.cellW,
        height: layout.cellH,
      });
      cell.text.setAttribute(
        'font-size',
        layout.cellW >= 48 ? fontSizes.md : fontSizes.sm,
      );
    }

    function makeStripWithLayout(values: string[], layout: Layout): Strip {
      const group = document.createElementNS(SVG_NS, 'g');
      stripGroup.appendChild(group);
      const cells: Cell[] = [];
      for (let i = 0; i < layout.capacity; i++) {
        const filled = i < values.length;
        const cell = makeCell(filled ? values[i]! : '', i, layout, filled);
        group.appendChild(cell.el);
        cells.push(cell);
      }
      return { group, cells, layout };
    }

    function fadeOpacity(
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

    function animateLinearG(
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

    async function searchStep(
      index: number,
      isMatch: boolean,
      isFinal: boolean,
      opts?: { duration?: number },
    ): Promise<void> {
      if (!primary) return;
      const duration = opts?.duration ?? 120;
      const cell = primary.cells[index];
      if (!cell) return;
      const c = cellCenter(index, primary.layout);
      await moveArrowLinear(c.x, duration);
      if (isMatch) {
        cell.rect.setAttribute('fill', colors.accent);
        cell.rect.setAttribute('stroke', colors.accent);
        cell.rect.setAttribute('stroke-width', '2.5');
      } else {
        // 잠깐 itemComparing 로 깜빡.
        const orig = cell.rect.getAttribute('fill');
        cell.rect.setAttribute('fill', colors.itemComparing);
        await new Promise<void>((resolve) => setTimeout(resolve, duration * 0.4));
        cell.rect.setAttribute('fill', orig ?? colors.itemDefault);
      }
      if (isFinal && !isMatch) {
        // 마지막까지 못 찾음 — 빨간 점선 깜빡.
        const layout = primary.layout;
        setAttrs(outOfRangeMark, {
          x: layout.stripLeft - 2,
          y: layout.stripTop - 2,
          width: layout.cellW * layout.capacity + 4,
          height: layout.cellH + 4,
          opacity: '1',
        });
        await new Promise<void>((resolve) => setTimeout(resolve, 240));
        outOfRangeMark.setAttribute('opacity', '0');
      }
    }

    function searchResult(found: boolean, index: number | undefined, value: string): void {
      if (found && typeof index === 'number') {
        setCaption(`찾았다 — 인덱스 ${index} 에 ${value}`, { duration: 1800 });
      } else {
        setCaption('찾지 못함 — 띠를 모두 살폈다', { duration: 1800 });
      }
    }

    function signalOutOfRange(opts?: { duration?: number }): void {
      if (!primary) return;
      const duration = opts?.duration ?? 240;
      const layout = primary.layout;
      setAttrs(outOfRangeMark, {
        x: layout.stripLeft - 2,
        y: layout.stripTop - 2,
        width: layout.cellW * layout.capacity + 4,
        height: layout.cellH + 4,
        opacity: '1',
      });
      setTimeout(() => outOfRangeMark.setAttribute('opacity', '0'), duration);
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
      read,
      write,
      insert,
      remove,
      append,
      resize,
      searchStep,
      searchResult,
      signalOutOfRange,
    };
  },
};
