/**
 * 컨텍스트 스위칭 facet 전용 stage view — 단일 SVG 캔버스에 무대 + 좌우 보관소 +
 * 천장 트리거 + 가로 시간 띠를 한꺼번에 그린다.
 *
 * 시각 구성 (기획 §6, §7):
 *   - 가운데 CPU 무대 (사각형 + 4×2 슬롯 격자) — 점유 흐름 색 또는 빈 회색.
 *   - 좌우 보관소 (PCB/TCB 박스) — 흐름 색 외곽 + 슬롯 격자, 잠긴/비어 있음 상태.
 *   - 천장 영역 — 트리거 표식이 위에서 무대 윗변까지 내려오는 운동 공간.
 *   - 시간 띠 — 가로 누적 띠. 흐름 색 / 회색 사선 패턴이 매 프레임 RAF 로 자란다.
 *   - 4 종 트리거 표식 — 타이머(별표) / 시스콜(점선 화살) / I/O(동그라미) / 인터럽트(번개).
 *   - 모드 토글 — 보관소 폭이 thread → process 시 외곽으로 부풀고 묶음 두께도 두꺼워짐.
 *
 * 색 결정 트리 (S-view, facet hex 0건):
 *   - 흐름 A — categorical(8, 'vivid')[1] (categorical 1 인덱스).
 *   - 흐름 B — categorical(8, 'vivid')[3] (categorical 다른 인덱스).
 *   - 무대 점유 흐려짐 — 같은 색의 'pastel' 톤.
 *   - 회색 빈 — colors.bgSubtle / textMuted.
 *   - 트리거 표식 — categorical 인덱스 별 색 + danger (인터럽트).
 *
 * 운동 어휘:
 *   - 저장 운동 — 무대 슬롯 묶음이 한 덩어리로 떠올라 보관소 위로 굵게 미끄러진다.
 *     도착 시 보관소 슬롯이 한 번에 색으로 채워진다. 무대는 회색.
 *   - 복원 운동 — 보관소 슬롯이 한 번에 떠올라 무대 위에서 정지하고, 슬롯 칸
 *     하나하나에 차례로 정렬되며 안착한다. 운동선 가늘고 단계적.
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import { getColors, fonts, fontSizes, categorical } from '@facet/core/runtime';
import type { Flow, TriggerKind, Mode } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스 ────────────────────────────────────────────────────────────────
const W = 720;
const H = 460;

// ── 영역 ────────────────────────────────────────────────────────────────
const TITLE_Y = 20;
const CONCEPT_Y0 = 38;
const CONCEPT_LINE_H = 14;

// 천장 영역 — 트리거 표식이 내려오는 자리.
const CEILING_Y0 = 80;
const CEILING_Y1 = 130; // 이 y 가 무대 윗변.

// 본체 — 보관소 + 무대.
const BODY_Y = CEILING_Y1;
const BODY_H = 160;

// 무대.
const STAGE_X = 220;
const STAGE_W = 280;
const STAGE_Y = BODY_Y;
const STAGE_H = BODY_H;
const STAGE_PAD_X = 16;
const STAGE_PAD_Y = 18;
const STAGE_GRID_X = STAGE_X + STAGE_PAD_X;
const STAGE_GRID_Y = STAGE_Y + STAGE_PAD_Y;
const STAGE_GRID_W = STAGE_W - STAGE_PAD_X * 2; // 248
const STAGE_GRID_H = STAGE_H - STAGE_PAD_Y * 2; // 124

// 슬롯 격자: 4 cols × 2 rows = 8.
const SLOT_COLS = 4;
const SLOT_ROWS = 2;
const SLOT_W = STAGE_GRID_W / SLOT_COLS; // 62
const SLOT_H = STAGE_GRID_H / SLOT_ROWS; // 62
const SLOT_INNER_PAD = 6;

// 보관소 — 무대 쪽 모서리는 고정, 모드에 따라 바깥쪽으로 부풀음.
const HOLDER_GAP = 25; // 무대와의 간격.
const HOLDER_RIGHT_A = STAGE_X - HOLDER_GAP; // 195 — A 보관소 오른쪽 모서리.
const HOLDER_LEFT_B = STAGE_X + STAGE_W + HOLDER_GAP; // 525 — B 보관소 왼쪽 모서리.
const HOLDER_W_THREAD = 130;
const HOLDER_W_PROCESS = 175;
const HOLDER_H = BODY_H;

// 보관소 슬롯 격자 — 4×2, 무대보다 슬롯 폭만 좁음.
const HOLDER_SLOT_PAD_X = 10;
const HOLDER_SLOT_PAD_Y = 24;
const HOLDER_SLOT_ROWS = 2;
const HOLDER_SLOT_COLS = 4;

// 시간 띠.
const STRIP_X = 30;
const STRIP_W = W - STRIP_X * 2; // 660
const STRIP_Y = BODY_Y + BODY_H + 20;
const STRIP_H = 28;

// 참고 칩.
const CHIP_Y0 = STRIP_Y + STRIP_H + 22;
const CHIP_GAP = 12;

// 운동 시간 (ms).
const PULSE_DUR = 220;
const CAPTION_DUR = 1800;

type Refs = { name: string; url: string };
const REFERENCES: Refs[] = [
  { name: 'OSTEP — Limited Direct Execution', url: 'https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-mechanisms.pdf' },
  { name: 'Silberschatz — CPU Switch (PCB)', url: 'https://www.cs.fsu.edu/~lacher/courses/COP4610/lectures_9e/ch06.pdf' },
  { name: 'Wikipedia — Context switch', url: 'https://en.wikipedia.org/wiki/Context_switch' },
  { name: 'Process Scheduling Visualizer', url: 'https://simulations4all.com/simulations/process-scheduling-visualizer' },
];

const CONCEPT_TEXT = [
  '컨텍스트 스위칭 — 단 하나의 CPU 무대 위에서 한 흐름의 상태 일습이 자기 보관소로 떠내지고,',
  '다른 흐름의 상태 일습이 그 자리에 되돌려 들어가, 두 흐름이 멈춘 지점에서 정확히 이어 실행된다.',
];

// ── SVG 헬퍼 ────────────────────────────────────────────────────────────

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}
function makeText(parent: SVGElement, attrs: Record<string, string | number>, text = ''): SVGTextElement {
  const el = document.createElementNS(SVG_NS, 'text');
  setAttrs(el, attrs);
  el.textContent = text;
  parent.appendChild(el);
  return el;
}
function makeRect(parent: SVGElement, attrs: Record<string, string | number>): SVGRectElement {
  const el = document.createElementNS(SVG_NS, 'rect');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}
function makeLine(parent: SVGElement, attrs: Record<string, string | number>): SVGLineElement {
  const el = document.createElementNS(SVG_NS, 'line');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}
function makeCircle(parent: SVGElement, attrs: Record<string, string | number>): SVGCircleElement {
  const el = document.createElementNS(SVG_NS, 'circle');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}
function makePath(parent: SVGElement, attrs: Record<string, string | number>): SVGPathElement {
  const el = document.createElementNS(SVG_NS, 'path');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}
function makeGroup(parent: SVGElement): SVGGElement {
  const el = document.createElementNS(SVG_NS, 'g');
  parent.appendChild(el);
  return el;
}
function clearChildren(el: SVGElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TaskQueue {
  private chain: Promise<unknown> = Promise.resolve();
  enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const next = this.chain.then(() => task());
    this.chain = next.catch(() => undefined);
    return next;
  }
}

// ── 모드별 보관소 폭 ────────────────────────────────────────────────────

function holderWidth(mode: Mode): number {
  return mode === 'process' ? HOLDER_W_PROCESS : HOLDER_W_THREAD;
}
function holderXA(mode: Mode): number {
  return HOLDER_RIGHT_A - holderWidth(mode);
}
function holderXB(_mode: Mode): number {
  return HOLDER_LEFT_B;
}

// 슬롯 위치 (보관소 안의 8칸).
function holderSlotRect(mode: Mode, side: Flow, col: number, row: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const hx = side === 'a' ? holderXA(mode) : holderXB(mode);
  const hw = holderWidth(mode);
  const innerW = hw - HOLDER_SLOT_PAD_X * 2;
  const innerH = HOLDER_H - HOLDER_SLOT_PAD_Y - 12;
  const cw = innerW / HOLDER_SLOT_COLS;
  const ch = innerH / HOLDER_SLOT_ROWS;
  return {
    x: hx + HOLDER_SLOT_PAD_X + col * cw + 2,
    y: BODY_Y + HOLDER_SLOT_PAD_Y + row * ch + 2,
    w: cw - 4,
    h: ch - 4,
  };
}

function stageSlotRect(col: number, row: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return {
    x: STAGE_GRID_X + col * SLOT_W + SLOT_INNER_PAD / 2,
    y: STAGE_GRID_Y + row * SLOT_H + SLOT_INNER_PAD / 2,
    w: SLOT_W - SLOT_INNER_PAD,
    h: SLOT_H - SLOT_INNER_PAD,
  };
}

// ── stage 본체 ──────────────────────────────────────────────────────────

export const contextSwitchingStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const colors = getColors(params.theme);
    const catVivid = categorical(8, 'vivid');
    const catPastel = categorical(8, 'pastel');

    // 흐름 색 — A / B 두 categorical 톤.
    const FLOW_A = catVivid[1]!; // 청록 톤
    const FLOW_B = catVivid[3]!; // 주황 톤
    const FLOW_A_FAINT = catPastel[1]!;
    const FLOW_B_FAINT = catPastel[3]!;
    // 트리거 표식 색 (4종 식별).
    const TRIGGER_TIMER = catVivid[0]!; // 노란 톤
    const TRIGGER_SYSCALL = catVivid[5]!; // 파란 톤
    const TRIGGER_IO = catVivid[2]!; // 초록 톤
    const TRIGGER_INTERRUPT = colors.danger; // 빨강 (severity)

    const flowColor = (f: Flow): string => (f === 'a' ? FLOW_A : FLOW_B);
    const flowFaint = (f: Flow): string => (f === 'a' ? FLOW_A_FAINT : FLOW_B_FAINT);
    const triggerColor = (k: TriggerKind): string => {
      switch (k) {
        case 'timer':
          return TRIGGER_TIMER;
        case 'syscall':
          return TRIGGER_SYSCALL;
        case 'io':
          return TRIGGER_IO;
        case 'interrupt':
          return TRIGGER_INTERRUPT;
      }
    };
    const triggerLabel = (k: TriggerKind): string => {
      switch (k) {
        case 'timer':
          return '타이머';
        case 'syscall':
          return '시스템 호출';
        case 'io':
          return 'I/O 완료';
        case 'interrupt':
          return '인터럽트';
      }
    };

    const svg = document.createElementNS(SVG_NS, 'svg');
    setAttrs(svg, {
      viewBox: `0 0 ${W} ${H}`,
      width: '100%',
      height: 'auto',
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': '컨텍스트 스위칭 시각화 — 단일 CPU 무대 + 좌우 보관소 + 천장 트리거 + 시간 띠',
    });
    svg.style.fontFamily = fonts.body;
    container.appendChild(svg);

    // <defs> — 회색 사선 패턴.
    const defs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defs);
    const pattern = document.createElementNS(SVG_NS, 'pattern');
    setAttrs(pattern, {
      id: 'cs-gray-stripes',
      width: 6,
      height: 6,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)',
    });
    defs.appendChild(pattern);
    makeRect(pattern, { x: 0, y: 0, width: 6, height: 6, fill: colors.bgSubtle });
    makeLine(pattern, {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 6,
      stroke: colors.textMuted,
      'stroke-width': 1.5,
      opacity: 0.6,
    });

    // 제목.
    makeText(
      svg,
      {
        x: W / 2,
        y: TITLE_Y,
        'text-anchor': 'middle',
        'font-size': fontSizes.lg,
        'font-weight': 600,
        fill: colors.text,
      },
      '컨텍스트 스위칭 — 무대 / 보관소 / 시간',
    );

    // 개념 캡션 (2줄).
    for (let i = 0; i < CONCEPT_TEXT.length; i++) {
      makeText(
        svg,
        {
          x: W / 2,
          y: CONCEPT_Y0 + i * CONCEPT_LINE_H,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        CONCEPT_TEXT[i]!,
      );
    }

    // 사건 캡션 (천장 영역 위 또는 시간 띠 위).
    const eventCaption = makeText(
      svg,
      {
        x: W / 2,
        y: CEILING_Y0 - 4,
        'text-anchor': 'middle',
        'font-size': fontSizes.sm,
        'font-weight': 500,
        fill: colors.text,
      },
      '',
    );

    // 천장 영역 — 점선 안내선 + 트리거 종류 라벨.
    const ceilingBorder = makeLine(svg, {
      x1: STAGE_X - 30,
      y1: CEILING_Y1,
      x2: STAGE_X + STAGE_W + 30,
      y2: CEILING_Y1,
      stroke: colors.border,
      'stroke-width': 1,
      'stroke-dasharray': '4 4',
    });
    void ceilingBorder;
    const ceilingHint = makeText(
      svg,
      {
        x: STAGE_X + STAGE_W / 2,
        y: CEILING_Y0 + 14,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        opacity: 0.85,
      },
      '— 천장: 트리거가 외부에서 내려오는 자리 —',
    );
    void ceilingHint;

    // 트리거 표식 layer (천장에 떨어지는 mark 가 동적으로 생성됨).
    const triggerLayer = makeGroup(svg);

    // ── 무대 (CPU 사각형 + 슬롯 격자) ──
    const stageGroup = makeGroup(svg);
    const stageBorder = makeRect(stageGroup, {
      x: STAGE_X,
      y: STAGE_Y,
      width: STAGE_W,
      height: STAGE_H,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1.5,
      rx: 8,
    });
    void stageBorder;
    makeText(stageGroup, {
      x: STAGE_X + STAGE_W / 2,
      y: STAGE_Y - 6,
      'text-anchor': 'middle',
      'font-size': fontSizes.xs,
      'font-weight': 600,
      fill: colors.textMuted,
    }, 'CPU 무대 (단일 점유)');

    const stageSlotEls: SVGRectElement[] = [];
    for (let r = 0; r < SLOT_ROWS; r++) {
      for (let c = 0; c < SLOT_COLS; c++) {
        const rect = stageSlotRect(c, r);
        const el = makeRect(stageGroup, {
          x: rect.x,
          y: rect.y,
          width: rect.w,
          height: rect.h,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
          rx: 3,
        });
        stageSlotEls.push(el);
      }
    }

    // ── 좌우 보관소 ──
    const holderAGroup = makeGroup(svg);
    const holderBGroup = makeGroup(svg);

    const holderABorder = makeRect(holderAGroup, {
      x: holderXA('thread'),
      y: BODY_Y,
      width: holderWidth('thread'),
      height: HOLDER_H,
      fill: 'none',
      stroke: FLOW_A,
      'stroke-width': 1.5,
      rx: 6,
      opacity: 0.9,
    });
    const holderALabel = makeText(
      holderAGroup,
      {
        x: holderXA('thread') + holderWidth('thread') / 2,
        y: BODY_Y + 16,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        'font-weight': 600,
        fill: FLOW_A,
      },
      '흐름 A 보관소',
    );

    const holderBBorder = makeRect(holderBGroup, {
      x: holderXB('thread'),
      y: BODY_Y,
      width: holderWidth('thread'),
      height: HOLDER_H,
      fill: 'none',
      stroke: FLOW_B,
      'stroke-width': 1.5,
      rx: 6,
      opacity: 0.9,
    });
    const holderBLabel = makeText(
      holderBGroup,
      {
        x: holderXB('thread') + holderWidth('thread') / 2,
        y: BODY_Y + 16,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        'font-weight': 600,
        fill: FLOW_B,
      },
      '흐름 B 보관소',
    );

    // 모드 표지 — process 일 때 보관소 위에 'addr space + page table' 작은 표지가 얹힘.
    const holderAExtra = makeRect(holderAGroup, {
      x: holderXA('thread') + 6,
      y: BODY_Y + HOLDER_H - 14,
      width: holderWidth('thread') - 12,
      height: 8,
      fill: FLOW_A_FAINT,
      stroke: FLOW_A,
      'stroke-width': 0.8,
      rx: 2,
      opacity: 0,
    });
    const holderBExtra = makeRect(holderBGroup, {
      x: holderXB('thread') + 6,
      y: BODY_Y + HOLDER_H - 14,
      width: holderWidth('thread') - 12,
      height: 8,
      fill: FLOW_B_FAINT,
      stroke: FLOW_B,
      'stroke-width': 0.8,
      rx: 2,
      opacity: 0,
    });

    // 보관소 슬롯들 (8칸 × 2박스).
    const holderASlotEls: SVGRectElement[] = [];
    const holderBSlotEls: SVGRectElement[] = [];
    for (let r = 0; r < HOLDER_SLOT_ROWS; r++) {
      for (let c = 0; c < HOLDER_SLOT_COLS; c++) {
        const rectA = holderSlotRect('thread', 'a', c, r);
        const elA = makeRect(holderAGroup, {
          x: rectA.x,
          y: rectA.y,
          width: rectA.w,
          height: rectA.h,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
          rx: 2,
        });
        holderASlotEls.push(elA);
        const rectB = holderSlotRect('thread', 'b', c, r);
        const elB = makeRect(holderBGroup, {
          x: rectB.x,
          y: rectB.y,
          width: rectB.w,
          height: rectB.h,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
          rx: 2,
        });
        holderBSlotEls.push(elB);
      }
    }

    // 운동 묶음 layer (저장/복원 운동 중에만 visible).
    const bundleLayer = makeGroup(svg);

    // ── 시간 띠 ──
    const stripGroup = makeGroup(svg);
    makeText(stripGroup, {
      x: STRIP_X,
      y: STRIP_Y - 6,
      'font-size': fontSizes.xs,
      'font-weight': 500,
      fill: colors.textMuted,
    }, '시간 띠 — 흐름 색 = 진행, 회색 사선 = 빈 시간 (오버헤드)');
    const stripBorder = makeRect(stripGroup, {
      x: STRIP_X,
      y: STRIP_Y,
      width: STRIP_W,
      height: STRIP_H,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
      rx: 4,
    });
    void stripBorder;
    const stripContent = makeGroup(stripGroup); // 매 프레임 누적.
    // 마스크로 STRIP 영역을 자른다 — 가장 오래된 픽셀이 자동 페이드 아웃되도록 SVG clipPath 사용.
    const clipId = `cs-strip-clip-${Math.random().toString(36).slice(2, 8)}`;
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    setAttrs(clip, { id: clipId });
    defs.appendChild(clip);
    makeRect(clip, { x: STRIP_X, y: STRIP_Y, width: STRIP_W, height: STRIP_H });
    stripContent.setAttribute('clip-path', `url(#${clipId})`);

    // ── 참고 칩 ──
    let chipX = STRIP_X;
    for (const ref of REFERENCES) {
      const tw = ref.name.length * 6 + 14;
      makeRect(svg, {
        x: chipX,
        y: CHIP_Y0,
        width: tw,
        height: 20,
        rx: 10,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 0.6,
      });
      const label = makeText(
        svg,
        {
          x: chipX + tw / 2,
          y: CHIP_Y0 + 14,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        ref.name,
      );
      label.style.cursor = 'pointer';
      label.addEventListener('click', () => {
        if (typeof window !== 'undefined') window.open(ref.url, '_blank', 'noopener');
      });
      chipX += tw + CHIP_GAP;
    }
    makeText(svg, {
      x: STRIP_X,
      y: CHIP_Y0 + 36,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
      opacity: 0.7,
    }, '참고 — OSTEP · Silberschatz · Wikipedia · Process Scheduling Visualizer');

    // ── 상태 ─────────────────────────────────────────────────────────────
    let currentMode: Mode = 'thread';
    let currentOccupant: Flow | 'empty' = 'a';
    let initialized = false;
    /** stage 무대 슬롯에 채워진 흐름 색 (점유 중 = flow, 빈 = null). */
    let stageFill: Flow | null = 'a';
    let holderAFilled: Flow | null = null;
    let holderBFilled: Flow | null = 'b';
    /** RAF 시간 띠 누적용 — 마지막 프레임 시각. */
    let lastFrameMs: number | null = null;
    let stripPxPerMs = 0.012; // init 에서 갱신.
    /** 시간 띠 칸 컬렉션 — 각 칸은 SVGRectElement. 가장 오래된 것부터 좌측 페이드. */
    const stripCells: Array<{ kind: 'a' | 'b' | 'gray'; el: SVGRectElement; widthPx: number }> =
      [];
    let stripHeadX = STRIP_X; // 다음 칸이 시작될 x.

    const queue = new TaskQueue();
    let captionTimer: ReturnType<typeof setTimeout> | null = null;
    let rafHandle: number | null = null;

    // ── 헬퍼: 슬롯 색 채우기/비우기 ────────────────────────────────────

    function paintStageSlots(flow: Flow | null): void {
      stageFill = flow;
      const fill = flow ? flowColor(flow) : colors.bgSubtle;
      const stroke = flow ? flowColor(flow) : colors.border;
      for (const el of stageSlotEls) {
        el.setAttribute('fill', fill);
        el.setAttribute('stroke', stroke);
        el.setAttribute('stroke-width', '1');
        el.setAttribute('opacity', flow ? '0.85' : '1');
      }
    }

    function paintStageSlotsFaint(flow: Flow): void {
      // 트리거 직후 점유 색이 한 단계 흐려진다.
      stageFill = flow;
      const fill = flowFaint(flow);
      const stroke = flowColor(flow);
      for (const el of stageSlotEls) {
        el.setAttribute('fill', fill);
        el.setAttribute('stroke', stroke);
        el.setAttribute('stroke-width', '1');
        el.setAttribute('opacity', '0.85');
      }
    }

    function paintHolderSlots(side: Flow, flow: Flow | null): void {
      const els = side === 'a' ? holderASlotEls : holderBSlotEls;
      const fill = flow ? flowColor(flow) : colors.bgSubtle;
      const stroke = flow ? flowColor(flow) : colors.border;
      for (const el of els) {
        el.setAttribute('fill', fill);
        el.setAttribute('stroke', stroke);
        el.setAttribute('opacity', flow ? '0.9' : '1');
      }
      if (side === 'a') holderAFilled = flow;
      else holderBFilled = flow;
    }

    /** 보관소 폭 / 슬롯 위치를 모드에 맞춰 갱신. */
    function applyMode(mode: Mode): void {
      currentMode = mode;
      const wA = holderWidth(mode);
      const wB = holderWidth(mode);
      const xA = holderXA(mode);
      const xB = holderXB(mode);
      setAttrs(holderABorder, { x: xA, width: wA });
      setAttrs(holderBBorder, { x: xB, width: wB });
      setAttrs(holderALabel, { x: xA + wA / 2 });
      setAttrs(holderBLabel, { x: xB + wB / 2 });

      // 슬롯 위치 갱신.
      let i = 0;
      for (let r = 0; r < HOLDER_SLOT_ROWS; r++) {
        for (let c = 0; c < HOLDER_SLOT_COLS; c++) {
          const rectA = holderSlotRect(mode, 'a', c, r);
          setAttrs(holderASlotEls[i]!, { x: rectA.x, y: rectA.y, width: rectA.w, height: rectA.h });
          const rectB = holderSlotRect(mode, 'b', c, r);
          setAttrs(holderBSlotEls[i]!, { x: rectB.x, y: rectB.y, width: rectB.w, height: rectB.h });
          i += 1;
        }
      }

      // 추가 표지 (process 모드에서만 visible).
      const extraOpacityA = mode === 'process' ? 1 : 0;
      const extraOpacityB = mode === 'process' ? 1 : 0;
      setAttrs(holderAExtra, {
        x: xA + 6,
        width: wA - 12,
        opacity: extraOpacityA,
      });
      setAttrs(holderBExtra, {
        x: xB + 6,
        width: wB - 12,
        opacity: extraOpacityB,
      });
    }

    function applyTriggerKind(kind: TriggerKind): void {
      // 천장 영역 hint 만 갱신 — 실제 표식은 trigger-arrived 때 만들어진다.
      ceilingHint.textContent = `다음 트리거: ${triggerLabel(kind)}`;
      ceilingHint.setAttribute('fill', triggerColor(kind));
    }

    // ── 트리거 표식 그리기 ───────────────────────────────────────────────

    function drawTriggerMark(kind: TriggerKind): SVGGElement {
      const g = makeGroup(triggerLayer);
      const cx = STAGE_X + STAGE_W / 2;
      const startY = CEILING_Y0 + 2;
      const tone = triggerColor(kind);
      switch (kind) {
        case 'timer': {
          // 노란 별표 (5각).
          const r = 8;
          let pts = '';
          for (let i = 0; i < 10; i++) {
            const ang = (Math.PI / 5) * i - Math.PI / 2;
            const rr = i % 2 === 0 ? r : r * 0.45;
            const x = cx + rr * Math.cos(ang);
            const y = startY + rr * Math.sin(ang);
            pts += `${x},${y} `;
          }
          const star = document.createElementNS(SVG_NS, 'polygon');
          setAttrs(star, {
            points: pts.trim(),
            fill: tone,
            stroke: tone,
            'stroke-width': 1,
            opacity: 0.95,
          });
          g.appendChild(star);
          break;
        }
        case 'syscall': {
          // 파란 점선 화살표 (아래쪽).
          makeLine(g, {
            x1: cx,
            y1: startY - 6,
            x2: cx,
            y2: startY + 8,
            stroke: tone,
            'stroke-width': 2,
            'stroke-dasharray': '3 3',
          });
          makePath(g, {
            d: `M ${cx - 5} ${startY + 4} L ${cx} ${startY + 12} L ${cx + 5} ${startY + 4} Z`,
            fill: tone,
            stroke: tone,
            'stroke-width': 0.5,
          });
          break;
        }
        case 'io': {
          // 초록 동그라미 (안에 작은 점).
          makeCircle(g, {
            cx,
            cy: startY,
            r: 7,
            fill: 'none',
            stroke: tone,
            'stroke-width': 2,
          });
          makeCircle(g, { cx, cy: startY, r: 2.4, fill: tone });
          break;
        }
        case 'interrupt': {
          // 빨간 번개 (지그재그 path).
          makePath(g, {
            d: `M ${cx - 3} ${startY - 8} L ${cx + 3} ${startY - 1} L ${cx - 1} ${startY - 1} L ${cx + 4} ${startY + 8} L ${cx - 2} ${startY + 1} L ${cx + 2} ${startY + 1} Z`,
            fill: tone,
            stroke: tone,
            'stroke-width': 1,
          });
          break;
        }
      }
      return g;
    }

    // 천장에서 무대 윗변까지 표식이 내려오는 운동.
    async function animateTriggerDescent(g: SVGGElement, durMs: number): Promise<void> {
      const start = performance.now();
      const dy = CEILING_Y1 - CEILING_Y0 - 4;
      await new Promise<void>((resolve) => {
        function frame(now: number) {
          const t = Math.min(1, (now - start) / durMs);
          const ease = 1 - Math.pow(1 - t, 2);
          g.setAttribute('transform', `translate(0, ${ease * dy})`);
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        }
        requestAnimationFrame(frame);
      });
      // 무대 윗변 닿는 순간 펄스.
      g.setAttribute('opacity', '1');
      await wait(80);
      g.setAttribute('opacity', '0');
      g.remove();
    }

    // ── 묶음 운동 — 저장 (무대 → 보관소) ────────────────────────────────

    function makeBundleSnapshot(): SVGGElement {
      // 현재 무대 슬롯 격자의 시각적 묶음을 한 g 로 복제.
      const g = makeGroup(bundleLayer);
      for (let r = 0; r < SLOT_ROWS; r++) {
        for (let c = 0; c < SLOT_COLS; c++) {
          const rect = stageSlotRect(c, r);
          const fill = stageFill ? flowColor(stageFill) : colors.bgSubtle;
          const stroke = stageFill ? flowColor(stageFill) : colors.border;
          makeRect(g, {
            x: rect.x,
            y: rect.y,
            width: rect.w,
            height: rect.h,
            fill,
            stroke,
            'stroke-width': 1.5,
            rx: 3,
            opacity: 0.95,
          });
        }
      }
      return g;
    }

    async function animateSave(from: Flow, durMs: number): Promise<void> {
      const bundle = makeBundleSnapshot();
      // 모드별 묶음 두께: process 모드일 때 추가 층이 같이 들려간다.
      if (currentMode === 'process') {
        // 추가 층 — 보관소 extra 표지의 미리보기.
        const stageMidX = STAGE_X + STAGE_W / 2;
        const layer = makeRect(bundle, {
          x: stageMidX - 36,
          y: STAGE_Y + STAGE_H - 14,
          width: 72,
          height: 6,
          fill: flowFaint(from),
          stroke: flowColor(from),
          'stroke-width': 0.8,
          rx: 2,
          opacity: 0.9,
        });
        void layer;
      }

      // 무대를 흐려놓고 (트리거 직후 한 단계) 출발.
      paintStageSlotsFaint(from);

      const targetX = from === 'a' ? holderXA(currentMode) + holderWidth(currentMode) / 2 : holderXB(currentMode) + holderWidth(currentMode) / 2;
      const targetY = BODY_Y + HOLDER_H / 2;
      const startMidX = STAGE_X + STAGE_W / 2;
      const startMidY = STAGE_Y + STAGE_H / 2;
      const dx = targetX - startMidX;
      const dy = targetY - startMidY;
      const liftPeak = -22; // 위로 살짝 떠오름.

      const start = performance.now();
      await new Promise<void>((resolve) => {
        function frame(now: number) {
          const t = Math.min(1, (now - start) / durMs);
          // 두 단계 운동: t < 0.4 위로, t >= 0.4 옆으로.
          let ox: number;
          let oy: number;
          if (t < 0.4) {
            const u = t / 0.4;
            ox = 0;
            oy = liftPeak * (1 - Math.pow(1 - u, 2));
          } else {
            const u = (t - 0.4) / 0.6;
            const ease = 1 - Math.pow(1 - u, 3);
            ox = dx * ease;
            oy = liftPeak + (dy - liftPeak) * ease;
          }
          // scale 으로 굵음 연출 (저장 = 굵고 빠름).
          const scale = 1 + (t < 0.5 ? t * 0.1 : (1 - t) * 0.1);
          bundle.setAttribute('transform', `translate(${ox}, ${oy}) scale(${scale})`);
          // 도착 직전 fade.
          if (t > 0.85) bundle.setAttribute('opacity', String(1 - (t - 0.85) / 0.15));
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        }
        requestAnimationFrame(frame);
      });

      bundle.remove();
      // 도착 — 보관소 슬롯이 한 번에 색으로 채워짐.
      paintHolderSlots(from, from);
      // 무대는 빈 회색.
      paintStageSlots(null);
    }

    // ── 묶음 운동 — 복원 (보관소 → 무대) ─────────────────────────────

    async function animateRestore(to: Flow, durMs: number): Promise<void> {
      // 보관소 슬롯에서 묶음이 떠올랐다가 무대 위에서 정지하고, 슬롯 칸 하나씩 차례로 안착.
      const bundle = makeGroup(bundleLayer);
      const startX = to === 'a' ? holderXA(currentMode) + holderWidth(currentMode) / 2 : holderXB(currentMode) + holderWidth(currentMode) / 2;
      const startY = BODY_Y + HOLDER_H / 2;
      const stageMidX = STAGE_X + STAGE_W / 2;
      const stageMidY = STAGE_Y + STAGE_H / 2;

      // 작은 아이콘 (얇은 운동 — 가는 라인).
      const iconRect = makeRect(bundle, {
        x: startX - 20,
        y: startY - 8,
        width: 40,
        height: 16,
        fill: flowFaint(to),
        stroke: flowColor(to),
        'stroke-width': 1.2,
        rx: 3,
        opacity: 0.9,
      });
      void iconRect;
      if (currentMode === 'process') {
        makeRect(bundle, {
          x: startX - 20,
          y: startY + 10,
          width: 40,
          height: 4,
          fill: flowFaint(to),
          stroke: flowColor(to),
          'stroke-width': 0.6,
          rx: 1,
        });
      }

      // 0~0.4: 위로 떠오르며 무대 위로 이동.
      // 0.4~1: 슬롯 칸 하나씩 차례로 안착 (8칸을 t = 0.4..1 사이에 8 step).
      // 보관소 슬롯은 첫 운동 시작 즉시 비워짐.
      paintHolderSlots(to, null);

      const start = performance.now();
      const dx = stageMidX - startX;
      const liftPeak = -28;

      let lastSlotIdx = -1;
      await new Promise<void>((resolve) => {
        function frame(now: number) {
          const t = Math.min(1, (now - start) / durMs);
          let ox: number;
          let oy: number;
          if (t < 0.4) {
            const u = t / 0.4;
            const ease = 1 - Math.pow(1 - u, 2);
            ox = dx * ease;
            oy = liftPeak * ease + (stageMidY - startY) * ease * 0.4;
          } else {
            // 무대 정지 (0.4 ~ 0.55) → 슬롯 단계적 안착 (0.55 ~ 1).
            ox = dx;
            oy = liftPeak + (stageMidY - startY - liftPeak) * Math.min(1, (t - 0.4) / 0.15);
          }
          bundle.setAttribute('transform', `translate(${ox}, ${oy})`);

          if (t >= 0.55) {
            const localT = (t - 0.55) / 0.45;
            const targetSlot = Math.min(SLOT_COLS * SLOT_ROWS - 1, Math.floor(localT * SLOT_COLS * SLOT_ROWS));
            if (targetSlot > lastSlotIdx) {
              for (let i = lastSlotIdx + 1; i <= targetSlot; i++) {
                const el = stageSlotEls[i]!;
                el.setAttribute('fill', flowColor(to));
                el.setAttribute('stroke', flowColor(to));
                el.setAttribute('opacity', '0.85');
              }
              lastSlotIdx = targetSlot;
            }
          }

          // 마지막 부분에서 운반 묶음 fade.
          if (t > 0.92) bundle.setAttribute('opacity', String(1 - (t - 0.92) / 0.08));

          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        }
        requestAnimationFrame(frame);
      });

      // 마지막 슬롯이 자리잡는 순간 무대가 색으로 켜진다 (이미 각 슬롯이 채워졌지만 stageFill 동기화).
      stageFill = to;
      bundle.remove();
    }

    // ── 시간 띠 RAF 누적 ────────────────────────────────────────────────

    function pushStripCell(kind: 'a' | 'b' | 'gray', widthPx: number): SVGRectElement {
      // strip 영역 끝에 닿으면 가장 오래된 칸을 삭제하고 모두 좌측으로 시프트.
      while (stripHeadX + widthPx > STRIP_X + STRIP_W && stripCells.length > 0) {
        const oldest = stripCells.shift()!;
        oldest.el.remove();
        stripHeadX -= oldest.widthPx;
        for (const cell of stripCells) {
          const x = parseFloat(cell.el.getAttribute('x') ?? String(STRIP_X));
          cell.el.setAttribute('x', String(x - oldest.widthPx));
        }
      }
      const fill =
        kind === 'gray' ? `url(#cs-gray-stripes)` : kind === 'a' ? FLOW_A : FLOW_B;
      const el = makeRect(stripContent, {
        x: stripHeadX,
        y: STRIP_Y,
        width: widthPx,
        height: STRIP_H,
        fill,
        opacity: 0.9,
      });
      stripCells.push({ kind, el, widthPx });
      stripHeadX += widthPx;
      return el;
    }

    function growLastStripCell(addPx: number): void {
      if (stripCells.length === 0) return;
      const last = stripCells[stripCells.length - 1]!;
      last.widthPx += addPx;
      last.el.setAttribute('width', String(last.widthPx));
      stripHeadX += addPx;
      // strip 영역 넘침 처리.
      if (stripHeadX > STRIP_X + STRIP_W) {
        // shift left.
        const overflow = stripHeadX - (STRIP_X + STRIP_W);
        stripHeadX -= overflow;
        // 각 칸 좌측 이동 + 가장 오래된 칸 폭 줄임.
        const oldest = stripCells[0]!;
        if (oldest.widthPx > overflow) {
          oldest.widthPx -= overflow;
          oldest.el.setAttribute('width', String(oldest.widthPx));
          // 나머지 좌측 이동.
          for (let i = 1; i < stripCells.length; i++) {
            const x = parseFloat(stripCells[i]!.el.getAttribute('x') ?? String(STRIP_X));
            stripCells[i]!.el.setAttribute('x', String(x - overflow));
          }
        } else {
          // 통째로 제거 후 재호출.
          oldest.el.remove();
          stripCells.shift();
          stripHeadX -= oldest.widthPx;
          // 남은 overflow 처리는 다음 프레임에서.
        }
      }
    }

    function tickFrame(now: number): void {
      if (!initialized) {
        rafHandle = requestAnimationFrame(tickFrame);
        return;
      }
      const last = lastFrameMs ?? now;
      const dt = Math.min(64, now - last); // 한 프레임 최대 64ms (저전력 환경 대비).
      lastFrameMs = now;

      const addPx = dt * stripPxPerMs;

      // 현재 무대 점유에 따라 시간 띠 1픽셀씩 자란다.
      const desired: 'a' | 'b' | 'gray' =
        currentOccupant === 'empty' ? 'gray' : currentOccupant;
      if (stripCells.length === 0 || stripCells[stripCells.length - 1]!.kind !== desired) {
        if (addPx >= 1) {
          pushStripCell(desired, addPx);
        } else {
          // 칸이 매우 짧다면 무시.
        }
      } else {
        growLastStripCell(addPx);
      }

      rafHandle = requestAnimationFrame(tickFrame);
    }

    function startStripRaf(): void {
      if (rafHandle !== null) return;
      lastFrameMs = null;
      rafHandle = requestAnimationFrame(tickFrame);
    }

    function stopStripRaf(): void {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }

    // ── 외부 API ─────────────────────────────────────────────────────────

    function reset(): void {
      stopStripRaf();
      clearChildren(stripContent);
      stripCells.length = 0;
      stripHeadX = STRIP_X;
      currentOccupant = 'a';
      stageFill = 'a';
      holderAFilled = null;
      holderBFilled = 'b';
      paintStageSlots('a');
      paintHolderSlots('a', null);
      paintHolderSlots('b', 'b');
      eventCaption.textContent = '';
      if (captionTimer !== null) {
        clearTimeout(captionTimer);
        captionTimer = null;
      }
      void holderAFilled;
      void holderBFilled;
    }

    function setBaseCaption(_text: string): void {
      // 개념 캡션은 상단 고정 — 여기서는 별도 처리 없음.
    }

    function setEventCaption(text: string, opts?: { duration?: number }): void {
      eventCaption.textContent = text;
      if (captionTimer !== null) clearTimeout(captionTimer);
      const dur = opts?.duration ?? CAPTION_DUR;
      captionTimer = setTimeout(() => {
        eventCaption.textContent = '';
        captionTimer = null;
      }, dur);
    }

    function init(payload: {
      occupant: Flow;
      mode: Mode;
      triggerKind: TriggerKind;
      timings: {
        triggerPulseMs: number;
        saveDurationMs: number;
        emptyDurationMs: number;
        restoreDurationMs: number;
      };
      modeMultipliers: { thread: number; process: number };
      strip: { capacity: number; tickMs: number };
      occupySegmentMs: number;
    }): void {
      currentOccupant = payload.occupant;
      stageFill = payload.occupant;
      // 시간 띠: stripPxPerMs = (STRIP_W / capacity) / tickMs — 한 칸이 stripTickMs ms 만에 채워지도록.
      const cellPx = STRIP_W / Math.max(1, payload.strip.capacity);
      stripPxPerMs = cellPx / Math.max(1, payload.strip.tickMs);
      applyMode(payload.mode);
      applyTriggerKind(payload.triggerKind);

      // 무대 + 보관소 색.
      paintStageSlots(payload.occupant);
      // 점유 흐름 보관소는 비어 있고, 반대편은 그 흐름 색으로 잠긴 채.
      if (payload.occupant === 'a') {
        paintHolderSlots('a', null);
        paintHolderSlots('b', 'b');
      } else {
        paintHolderSlots('a', 'a');
        paintHolderSlots('b', null);
      }

      initialized = true;
      startStripRaf();
    }

    function signalTriggerArrived(payload: { kind: TriggerKind; from: Flow }): Promise<void> {
      return queue.enqueue(async () => {
        applyTriggerKind(payload.kind);
        const g = drawTriggerMark(payload.kind);
        await animateTriggerDescent(g, PULSE_DUR);
        // 무대 점유 색 한 단계 흐려짐.
        paintStageSlotsFaint(payload.from);
        setEventCaption('트리거 도착 — 흐름이 멈춘다.');
      });
    }

    function signalSaveBegin(payload: { from: Flow; kind: TriggerKind; mode: Mode }): Promise<void> {
      return queue.enqueue(async () => {
        applyMode(payload.mode);
        setEventCaption('현재 상태를 보관소로 떠낸다.');
        // 저장 진입 — 무대 점유 색을 잠시 회색으로 안 칠하고 (아직 묶음 운동 중), animateSave 가
        // 운동 종료 후 paintStageSlots(null) 로 바꿈.
        const dur = payload.mode === 'process' ? 700 * 1.6 : 700;
        await animateSave(payload.from, dur);
        currentOccupant = 'empty';
      });
    }

    function signalSaveEnd(payload: { from: Flow; mode: Mode }): Promise<void> {
      return queue.enqueue(async () => {
        // animateSave 가 이미 마감 — 여기서 추가 처리 없음. 캡션만 갱신.
        void payload;
        setEventCaption('무대가 비어 있다 — 누구도 진전하지 않는다.');
      });
    }

    function signalRestoreBegin(payload: { to: Flow; mode: Mode }): Promise<void> {
      return queue.enqueue(async () => {
        applyMode(payload.mode);
        setEventCaption('다음 흐름의 상태를 무대로 되돌린다.');
        const dur = payload.mode === 'process' ? 800 * 1.6 : 800;
        await animateRestore(payload.to, dur);
      });
    }

    function signalRestoreEnd(payload: { to: Flow; mode: Mode }): Promise<void> {
      return queue.enqueue(async () => {
        currentOccupant = payload.to;
        stageFill = payload.to;
        // 마지막 슬롯 자리잡는 순간 무대 색 동기화 (이미 단계적으로 채워진 상태이지만 일관 보장).
        paintStageSlots(payload.to);
        setEventCaption('이어서 시작 — 멈춘 자리에서 정확히 재개된다.');
        void payload.mode;
      });
    }

    function applyModeChanged(mode: Mode, _segmentIndex: number): void {
      applyMode(mode);
      setEventCaption(
        mode === 'process'
          ? '보관소가 두꺼워졌다 — 옮길 묶음이 늘어난다.'
          : '보관소가 얇아졌다 — 같은 프로세스 안 두 스레드.',
      );
    }

    function applyTriggerKindChanged(kind: TriggerKind, _segmentIndex: number): void {
      applyTriggerKind(kind);
      setEventCaption('다음 트리거 종류가 바뀌었다.');
    }

    function signalReset(): void {
      reset();
    }

    const stage = {
      reset,
      init,
      setBaseCaption,
      setCaption: setEventCaption,
      signalTriggerArrived,
      signalSaveBegin,
      signalSaveEnd,
      signalRestoreBegin,
      signalRestoreEnd,
      applyModeChanged,
      applyTriggerKindChanged,
      signalReset,
    };

    void params;

    const instance: ViewInstance = {
      destroy() {
        stopStripRaf();
        if (captionTimer !== null) clearTimeout(captionTimer);
        if (svg.parentElement) svg.remove();
      },
    };
    Object.assign(instance, stage);

    return instance;
  },
};
