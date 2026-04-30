/**
 * conditional-flowchart View — 조건문 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 캡션 / 인-스테이지 슬라이더(0..100) / 평가 마름모 사슬 /
 * 활성·비활성 가지 + 빗장 패턴 / 매달린 실행 블록 / 합류 노드 / 우측 사이드
 * 띠(개념 설명 + 학습자 안내) / 하단 참고 레퍼런스 칩을 모두 담는다.
 *
 * 메서드 (projector → view):
 *   - reset()
 *   - init({ mode, value, rules, sequence, activeBranchId, activeBlockId })
 *   - setBaseCaption(text)
 *   - setCaption(text, opts?)
 *   - applyEvaluation({ value, sequence, activeBranchId, activeBlockId })
 *       위 마름모부터 순차 점등 → 첫 참에서 응결 → 활성 가지 디졸브 전환.
 *   - applyModeSet({ mode, rules, value, sequence, activeBranchId, activeBlockId })
 *       2갈래 ↔ 3갈래 도식 재배치.
 *   - signalDemoStart() / signalDemoEnd()
 *   - signalInvalid(op, raw)
 *
 * 슬라이더 입력은 view 내부 SVG mousedown/mousemove 로 직접 잡아 dispatch
 * 채널로 `{ type: 'input', payload: { name: 'value', value: '0..100' } }` 송신.
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import { getColors, fonts, fontSizes, categorical } from '@facet/core/runtime';
import type {
  ConditionalMode,
  ConditionalRuleSet,
  EvaluationStep,
} from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 560;

// ── 영역 분할 ───────────────────────────────────────────────────────────
const TITLE_Y = 22;
const CAPTION_Y = 488;
const SLIDER_TRACK_Y = 26;
const SLIDER_TRACK_X0 = 360;
const SLIDER_TRACK_X1 = 690;
const SLIDER_HANDLE_R = 9;

// 도식 캔버스 (좌측 70%).
const DIAGRAM_CENTER_X = 250;

// 사이드 띠 (우측 30%).
const SIDE_X0 = 510;
const SIDE_TOP = 70;
const SIDE_BOTTOM = 470;

// 참고 레퍼런스 칩 영역.
const CHIP_BAR_Y0 = 510;
const CHIP_BAR_Y1 = 552;

// ── 운동 시간 (ms) ──────────────────────────────────────────────────────
const DISSOLVE_MS = 180;
const MERGE_PULSE_MS = 160;
const CAPTION_DURATION_MS = 2200;

// ── 아주 옅은 알파 (palette 위에 알파 합성) ─────────────────────────────
const HATCH_OPACITY = 0.55;
const INACTIVE_BLOCK_OPACITY = 0.45;
const INACTIVE_BRANCH_OPACITY = 0.4;

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}

function raf(cb: (t: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(Date.now()), 16) as unknown as number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, Math.max(0, ms)));
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

function makePath(parent: SVGElement, attrs: Record<string, string | number>): SVGPathElement {
  const el = document.createElementNS(SVG_NS, 'path');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}

function makeGroup(parent: SVGElement, attrs: Record<string, string | number> = {}): SVGGElement {
  const el = document.createElementNS(SVG_NS, 'g');
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

function diamondPath(cx: number, cy: number, w: number, h: number): string {
  const hw = w / 2;
  const hh = h / 2;
  return `M${cx},${cy - hh} L${cx + hw},${cy} L${cx},${cy + hh} L${cx - hw},${cy} Z`;
}

// ── 타입 ────────────────────────────────────────────────────────────────
type DiamondRec = {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  pathEl: SVGPathElement;
  exprEl: SVGTextElement;
  /** 결과 칩 그룹 (참/거짓 짧은 점등). */
  chipG: SVGGElement;
  chipBgEl: SVGRectElement;
  chipTextEl: SVGTextElement;
};

type BranchRec = {
  id: string;
  /** 가지선 path. */
  pathEl: SVGPathElement;
  /** 라벨 텍스트 (참/거짓). */
  labelEl: SVGTextElement;
  /** 빗장 무늬 path (비활성 시만 보임). */
  hatchEl: SVGPathElement;
  /** 흐름 점 (활성 시만 보임). */
  dotEl: SVGCircleElement;
};

type BlockRec = {
  id: string;
  /** 둥근 모서리 사각. */
  bgEl: SVGRectElement;
  /** 라벨 텍스트. */
  labelEl: SVGTextElement;
  cx: number;
  cy: number;
};

type MergeRec = {
  ringEl: SVGCircleElement;
  /** 봉합 펄스 외곽 ring. */
  pulseEl: SVGCircleElement;
};

type SliderRec = {
  trackEl: SVGRectElement;
  fillEl: SVGRectElement;
  handleEl: SVGCircleElement;
  labelEl: SVGTextElement;
  valueEl: SVGTextElement;
  hitEl: SVGRectElement;
};

type Layout = {
  mode: ConditionalMode;
  diamonds: Map<string, DiamondRec>;
  branches: Map<string, BranchRec>;
  blocks: Map<string, BlockRec>;
  /** 시작 흐름선 + 도식 마지막 흐름선 path. */
  flowStartEl: SVGPathElement;
  flowEndEl: SVGPathElement;
  flowEndArrowEl: SVGPathElement;
  flowEndLabelEl: SVGTextElement;
  merge: MergeRec;
};

type Refs = {
  name: string;
  url: string;
};

const REFERENCES: Refs[] = [
  { name: 'Edraw — If-Else Flowchart Guide', url: 'https://www.edraw.ai/blog/if-else-flowchart.html' },
  { name: 'Scratch Wiki — If/Else', url: 'https://en.scratch-wiki.info/wiki/If_()_Then,_Else_(block)' },
  { name: 'Python Tutor — Visualize', url: 'https://pythontutor.com/visualize.html' },
  { name: 'ko.javascript.info — if/else', url: 'https://ko.javascript.info/ifelse' },
];

const SIDE_CONCEPT_TEXT = [
  '조건문은 흐르던 코드가 갈림길에 도착했을',
  '때, 지금의 값이 참인지 거짓인지를 보고 갈래',
  '중 단 한 길만 골라 통과하는 약속이에요. 고르',
  '지 않은 길은 이번 흐름에서는 닫혀 있어 단',
  '한 줄도 동작하지 않아요. 갈림길이 끝나면',
  '어느 길로 갔든 모두 다시 한 줄로 모여 다음',
  '코드로 이어집니다.',
];

const SIDE_GUIDE_TEXT = [
  '위쪽 슬라이더를 흔들어 보세요. 마름모에서',
  '결과가 다시 응결되고, 켜지는 길과 닫히는',
  '길이 바뀌는 모습을 보세요. 빗장이 그어진',
  '가지는 이번에 동작하지 않은 길이에요.',
];

export const conditionalFlowchartView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const palette = getColors(params.theme);
    // categorical 시드 — 활성 가지 + 결과 참/거짓 칩.
    const cat = categorical(6, 'vivid');
    const ACTIVE_TONE = cat[0]!; // 따뜻한 주황 — 활성 가지·블록 강조.
    const TRUE_TONE = cat[2]!; // 초록 계열 — 결과 칩 (참).
    const FALSE_TONE = cat[5]!; // 회보라 계열 — 결과 칩 (거짓).

    container.innerHTML = '';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.maxWidth = '720px';
    svg.style.height = 'auto';
    svg.style.fontFamily = fonts.body;
    svg.style.userSelect = 'none';
    svg.style.touchAction = 'none';
    container.appendChild(svg);

    // ── 빗장 패턴 정의 ────────────────────────────────────────────────
    const defs = document.createElementNS(SVG_NS, 'defs');
    const hatch = document.createElementNS(SVG_NS, 'pattern');
    setAttrs(hatch, {
      id: 'cf-hatch',
      width: 6,
      height: 6,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)',
    });
    const hatchLine = document.createElementNS(SVG_NS, 'line');
    setAttrs(hatchLine, {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 6,
      stroke: palette.textMuted,
      'stroke-width': 1.4,
      'stroke-opacity': HATCH_OPACITY,
    });
    hatch.appendChild(hatchLine);
    defs.appendChild(hatch);

    // 화살표 마커 (흐름선 끝).
    const arrow = document.createElementNS(SVG_NS, 'marker');
    setAttrs(arrow, {
      id: 'cf-arrow',
      viewBox: '0 0 10 10',
      refX: 8,
      refY: 5,
      markerWidth: 8,
      markerHeight: 8,
      orient: 'auto-start-reverse',
    });
    const arrowPath = document.createElementNS(SVG_NS, 'path');
    setAttrs(arrowPath, {
      d: 'M0,1 L9,5 L0,9 Z',
      fill: palette.text,
    });
    arrow.appendChild(arrowPath);
    defs.appendChild(arrow);

    svg.appendChild(defs);

    // ── 레이어 ────────────────────────────────────────────────────────
    const sideLayer = makeGroup(svg);
    const branchInactiveLayer = makeGroup(svg);
    const branchActiveLayer = makeGroup(svg);
    const blockLayer = makeGroup(svg);
    const diamondLayer = makeGroup(svg);
    const flowEndLayer = makeGroup(svg);
    const mergeLayer = makeGroup(svg);
    const chipsLayer = makeGroup(svg);
    const sliderLayer = makeGroup(svg);
    const captionLayer = makeGroup(svg);

    // ── 상단: 제목 + 슬라이더 ────────────────────────────────────────
    const titleEl = makeText(
      captionLayer,
      {
        x: 12,
        y: TITLE_Y,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: palette.text,
      },
      '조건문 — 한 박자의 응결',
    );
    void titleEl;

    // 슬라이더 ─ 트랙 + 채움 + 핸들 + 라벨 + 값.
    const sliderLabel = makeText(
      sliderLayer,
      {
        x: SLIDER_TRACK_X0 - 36,
        y: SLIDER_TRACK_Y + 4,
        'font-size': fontSizes.sm,
        fill: palette.textMuted,
      },
      '값',
    );
    const trackEl = makeRect(sliderLayer, {
      x: SLIDER_TRACK_X0,
      y: SLIDER_TRACK_Y - 3,
      width: SLIDER_TRACK_X1 - SLIDER_TRACK_X0,
      height: 6,
      rx: 3,
      ry: 3,
      fill: palette.bgSubtle,
      stroke: palette.border,
      'stroke-width': 1,
    });
    const fillEl = makeRect(sliderLayer, {
      x: SLIDER_TRACK_X0,
      y: SLIDER_TRACK_Y - 3,
      width: 0,
      height: 6,
      rx: 3,
      ry: 3,
      fill: ACTIVE_TONE,
      'fill-opacity': 0.7,
    });
    const handleEl = makeCircle(sliderLayer, {
      cx: SLIDER_TRACK_X0,
      cy: SLIDER_TRACK_Y,
      r: SLIDER_HANDLE_R,
      fill: palette.bg,
      stroke: ACTIVE_TONE,
      'stroke-width': 2.4,
    });
    const valueEl = makeText(
      sliderLayer,
      {
        x: SLIDER_TRACK_X1 + 8,
        y: SLIDER_TRACK_Y + 4,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: palette.text,
      },
      '0',
    );
    const hitEl = makeRect(sliderLayer, {
      x: SLIDER_TRACK_X0 - 8,
      y: SLIDER_TRACK_Y - 14,
      width: SLIDER_TRACK_X1 - SLIDER_TRACK_X0 + 16,
      height: 28,
      fill: 'transparent',
      cursor: 'pointer',
    });

    const slider: SliderRec = { trackEl, fillEl, handleEl, labelEl: sliderLabel, valueEl, hitEl };

    // ── 사이드 띠 (개념 설명 + 학습자 안내) ─────────────────────────
    const sideDivider = makeRect(sideLayer, {
      x: SIDE_X0 - 8,
      y: SIDE_TOP - 4,
      width: 1,
      height: SIDE_BOTTOM - SIDE_TOP + 8,
      fill: palette.border,
    });
    void sideDivider;

    const sideTitle = makeText(
      sideLayer,
      {
        x: SIDE_X0,
        y: SIDE_TOP + 12,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: palette.textMuted,
        'letter-spacing': '0.04em',
      },
      '개념',
    );
    void sideTitle;

    const conceptLineH = 16;
    SIDE_CONCEPT_TEXT.forEach((line, i) => {
      makeText(
        sideLayer,
        {
          x: SIDE_X0,
          y: SIDE_TOP + 32 + i * conceptLineH,
          'font-size': fontSizes.sm,
          fill: palette.text,
        },
        line,
      );
    });

    const guideTitle = makeText(
      sideLayer,
      {
        x: SIDE_X0,
        y: SIDE_TOP + 32 + SIDE_CONCEPT_TEXT.length * conceptLineH + 22,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: palette.textMuted,
        'letter-spacing': '0.04em',
      },
      '학습자 안내',
    );
    void guideTitle;

    SIDE_GUIDE_TEXT.forEach((line, i) => {
      makeText(
        sideLayer,
        {
          x: SIDE_X0,
          y: SIDE_TOP + 32 + SIDE_CONCEPT_TEXT.length * conceptLineH + 42 + i * conceptLineH,
          'font-size': fontSizes.sm,
          fill: palette.textMuted,
        },
        line,
      );
    });

    // ── 캡션 ──────────────────────────────────────────────────────────
    const baseCaptionEl = makeText(
      captionLayer,
      {
        x: W / 2,
        y: CAPTION_Y,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
        fill: palette.textMuted,
      },
      '',
    );
    const eventCaptionEl = makeText(
      captionLayer,
      {
        x: W / 2,
        y: CAPTION_Y + 18,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
        'font-weight': 700,
        fill: palette.text,
      },
      '',
    );

    let captionTimer: ReturnType<typeof setTimeout> | null = null;
    function setBaseCaption(text: string): void {
      baseCaptionEl.textContent = text;
    }
    function setCaption(text: string, opts?: { duration?: number }): void {
      if (captionTimer !== null) {
        clearTimeout(captionTimer);
        captionTimer = null;
      }
      eventCaptionEl.textContent = text;
      const dur = opts?.duration ?? CAPTION_DURATION_MS;
      captionTimer = setTimeout(() => {
        eventCaptionEl.textContent = '';
        captionTimer = null;
      }, dur);
    }

    // ── 참고 레퍼런스 칩 ─────────────────────────────────────────────
    const chipsTitle = makeText(
      chipsLayer,
      {
        x: 12,
        y: CHIP_BAR_Y0 - 6,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: palette.textMuted,
        'letter-spacing': '0.04em',
      },
      '참고',
    );
    void chipsTitle;
    const chipW = (W - 24 - (REFERENCES.length - 1) * 8) / REFERENCES.length;
    REFERENCES.forEach((ref, i) => {
      const x = 12 + i * (chipW + 8);
      const y = CHIP_BAR_Y0;
      const link = document.createElementNS(SVG_NS, 'a');
      link.setAttribute('href', ref.url);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noreferrer');
      chipsLayer.appendChild(link);

      makeRect(link, {
        x,
        y,
        width: chipW,
        height: CHIP_BAR_Y1 - CHIP_BAR_Y0,
        rx: 6,
        ry: 6,
        fill: palette.bgSubtle,
        stroke: palette.border,
        'stroke-width': 1,
      });
      makeText(
        link,
        {
          x: x + 10,
          y: y + 18,
          'font-size': fontSizes.xs,
          fill: palette.text,
        },
        ref.name,
      );
      makeText(
        link,
        {
          x: x + chipW - 10,
          y: y + 18,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
          fill: palette.textMuted,
        },
        '↗',
      );
    });

    // ── 도식 (모드별 빌드) ───────────────────────────────────────────
    let layout: Layout | null = null;
    let value = 0;
    let activeBranchId = '';
    let activeBlockId = '';

    /** 도식을 빌드 (또는 모드 전환 시 재빌드). */
    function buildLayout(mode: ConditionalMode, rules: ConditionalRuleSet): Layout {
      // 기존 레이어 비우기.
      branchInactiveLayer.textContent = '';
      branchActiveLayer.textContent = '';
      blockLayer.textContent = '';
      diamondLayer.textContent = '';
      flowEndLayer.textContent = '';
      mergeLayer.textContent = '';

      const diamonds = new Map<string, DiamondRec>();
      const branches = new Map<string, BranchRec>();
      const blocks = new Map<string, BlockRec>();

      // ── 좌표 ─────────────────────────────────────────────────────
      // 두 모드 공통.
      const startY = 70;
      // 합류 노드 y 는 모드마다 다름.
      let mergeY: number;
      let endY: number;

      // 시작 흐름선 (start → 첫 마름모 위).
      const flowStartEl = makePath(flowEndLayer, {
        d: '',
        stroke: palette.text,
        'stroke-width': 2.6,
        fill: 'none',
        'marker-end': 'url(#cf-arrow)',
      });

      if (mode === 'two') {
        // 단일 마름모 + 좌(참) 우(거짓) 두 블록 + 합류.
        const dCx = DIAGRAM_CENTER_X;
        const dCy = 130;
        const dW = 170;
        const dH = 64;
        flowStartEl.setAttribute('d', `M${dCx},${startY} L${dCx},${dCy - dH / 2 - 4}`);

        // diamond: if
        const ifRule = rules.rules[0]!;
        const ifPathEl = makePath(diamondLayer, {
          d: diamondPath(dCx, dCy, dW, dH),
          fill: palette.bg,
          stroke: palette.text,
          'stroke-width': 2,
        });
        const ifExprEl = makeText(
          diamondLayer,
          {
            x: dCx,
            y: dCy + 4,
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
            fill: palette.textMuted,
            'font-weight': 600,
          },
          ifRule.expr,
        );
        const ifChipG = makeGroup(chipsLayer, { transform: `translate(${dCx + dW / 2 + 4},${dCy})`, opacity: 0 });
        const ifChipBg = makeRect(ifChipG, {
          x: 0,
          y: -10,
          width: 36,
          height: 20,
          rx: 4,
          ry: 4,
          fill: palette.bg,
          stroke: TRUE_TONE,
          'stroke-width': 1.6,
        });
        const ifChipText = makeText(
          ifChipG,
          {
            x: 18,
            y: 4,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            'font-weight': 700,
            fill: TRUE_TONE,
          },
          '참',
        );
        diamonds.set('if', {
          id: 'if',
          cx: dCx,
          cy: dCy,
          w: dW,
          h: dH,
          pathEl: ifPathEl,
          exprEl: ifExprEl,
          chipG: ifChipG,
          chipBgEl: ifChipBg,
          chipTextEl: ifChipText,
        });

        // 두 블록.
        const blockY = 230;
        const blockW = 120;
        const blockH = 40;
        const thenCx = 110;
        const elseCx = 390;

        // then 블록.
        const thenBg = makeRect(blockLayer, {
          x: thenCx - blockW / 2,
          y: blockY - blockH / 2,
          width: blockW,
          height: blockH,
          rx: 8,
          ry: 8,
          fill: palette.bg,
          stroke: palette.text,
          'stroke-width': 1.8,
        });
        const thenLabel = makeText(
          blockLayer,
          {
            x: thenCx,
            y: blockY + 4,
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
            'font-weight': 600,
            fill: palette.text,
          },
          ifRule.trueBlockLabel,
        );
        blocks.set('then', { id: 'then', bgEl: thenBg, labelEl: thenLabel, cx: thenCx, cy: blockY });

        // else 블록.
        const elseBg = makeRect(blockLayer, {
          x: elseCx - blockW / 2,
          y: blockY - blockH / 2,
          width: blockW,
          height: blockH,
          rx: 8,
          ry: 8,
          fill: palette.bg,
          stroke: palette.text,
          'stroke-width': 1.8,
        });
        const elseLabel = makeText(
          blockLayer,
          {
            x: elseCx,
            y: blockY + 4,
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
            'font-weight': 600,
            fill: palette.text,
          },
          rules.else.blockLabel,
        );
        blocks.set('else', { id: 'else', bgEl: elseBg, labelEl: elseLabel, cx: elseCx, cy: blockY });

        // 가지선 — 마름모 좌(참) 정점 → then-block 위 / 마름모 우(거짓) 정점 → else-block 위.
        // 그리고 then-block / else-block 아래 → merge 까지 곡선.
        mergeY = 340;
        endY = 440;

        // branch:then  (마름모 좌 정점 → then 블록 우측 진입 → 블록 통과 → 블록 아래 → merge)
        // 단순화: 한 path 로 마름모-좌정점 → 블록-블록위 위치 → 블록-아래중심 → merge.
        const thenLeftV = { x: dCx - dW / 2, y: dCy };
        const elseRightV = { x: dCx + dW / 2, y: dCy };

        const thenBranchD =
          `M${thenLeftV.x},${thenLeftV.y} ` +
          `C${thenLeftV.x - 60},${thenLeftV.y} ${thenCx + blockW / 2},${blockY - 30} ${thenCx + blockW / 2},${blockY} ` +
          `M${thenCx},${blockY + blockH / 2} ` +
          `C${thenCx},${blockY + blockH / 2 + 30} ${dCx - 80},${mergeY - 20} ${dCx},${mergeY}`;
        const elseBranchD =
          `M${elseRightV.x},${elseRightV.y} ` +
          `C${elseRightV.x + 60},${elseRightV.y} ${elseCx - blockW / 2},${blockY - 30} ${elseCx - blockW / 2},${blockY} ` +
          `M${elseCx},${blockY + blockH / 2} ` +
          `C${elseCx},${blockY + blockH / 2 + 30} ${dCx + 80},${mergeY - 20} ${dCx},${mergeY}`;

        // 비활성/활성 두 path 를 한 가지선마다 분리해 그린다 — 비활성은 hatch 와 함께 깔리고
        // 활성은 그 위에 짙은 선으로 덮인다. 토글 시 opacity 만 바꾼다.
        function buildBranch(id: string, d: string, labelText: string, labelX: number, labelY: number): BranchRec {
          const hatchEl = makePath(branchInactiveLayer, {
            d,
            stroke: 'url(#cf-hatch)',
            'stroke-width': 6,
            fill: 'none',
            opacity: 1,
          });
          const pathEl = makePath(branchActiveLayer, {
            d,
            stroke: ACTIVE_TONE,
            'stroke-width': 3,
            fill: 'none',
            opacity: 0,
          });
          const dotEl = makeCircle(branchActiveLayer, {
            cx: -1000,
            cy: -1000,
            r: 4,
            fill: ACTIVE_TONE,
            opacity: 0,
          });
          const labelEl = makeText(
            branchInactiveLayer,
            {
              x: labelX,
              y: labelY,
              'font-size': fontSizes.xs,
              'text-anchor': 'middle',
              'font-weight': 700,
              fill: palette.textMuted,
            },
            labelText,
          );
          return { id, pathEl, hatchEl, dotEl, labelEl };
        }

        branches.set(
          'then',
          buildBranch('then', thenBranchD, '참', dCx - dW / 2 - 24, dCy - 4),
        );
        branches.set(
          'else',
          buildBranch('else', elseBranchD, '거짓', dCx + dW / 2 + 24, dCy - 4),
        );
        // 라벨 위치 보정 — 좌측 라벨은 우측정렬, 우측 라벨은 좌측정렬.
        branches.get('then')!.labelEl.setAttribute('text-anchor', 'end');
        branches.get('else')!.labelEl.setAttribute('text-anchor', 'start');
      } else {
        // 3갈래 — 마름모 사슬.
        const if_dCx = DIAGRAM_CENTER_X;
        const if_dCy = 110;
        const elif_dCx = DIAGRAM_CENTER_X;
        const elif_dCy = 230;
        const dW = 160;
        const dH = 56;

        flowStartEl.setAttribute('d', `M${if_dCx},${startY} L${if_dCx},${if_dCy - dH / 2 - 4}`);

        // 두 마름모.
        function buildDiamond(
          id: string,
          rule: { expr: string },
          cx: number,
          cy: number,
        ): DiamondRec {
          const pathEl = makePath(diamondLayer, {
            d: diamondPath(cx, cy, dW, dH),
            fill: palette.bg,
            stroke: palette.text,
            'stroke-width': 2,
          });
          const exprEl = makeText(
            diamondLayer,
            {
              x: cx,
              y: cy + 4,
              'font-size': fontSizes.sm,
              'text-anchor': 'middle',
              fill: palette.textMuted,
              'font-weight': 600,
            },
            rule.expr,
          );
          const chipG = makeGroup(chipsLayer, { transform: `translate(${cx + dW / 2 + 4},${cy})`, opacity: 0 });
          const chipBg = makeRect(chipG, {
            x: 0,
            y: -10,
            width: 36,
            height: 20,
            rx: 4,
            ry: 4,
            fill: palette.bg,
            stroke: TRUE_TONE,
            'stroke-width': 1.6,
          });
          const chipText = makeText(
            chipG,
            {
              x: 18,
              y: 4,
              'font-size': fontSizes.xs,
              'text-anchor': 'middle',
              'font-weight': 700,
              fill: TRUE_TONE,
            },
            '참',
          );
          return { id, cx, cy, w: dW, h: dH, pathEl, exprEl, chipG, chipBgEl: chipBg, chipTextEl: chipText };
        }

        diamonds.set('if', buildDiamond('if', rules.rules[0]!, if_dCx, if_dCy));
        diamonds.set('elif', buildDiamond('elif', rules.rules[1]!, elif_dCx, elif_dCy));

        // 세 블록.
        const blockW = 120;
        const blockH = 40;
        const thenCx = 90;
        const thenCy = 110;
        const elifThenCx = 90;
        const elifThenCy = 230;
        const elseCx = 410;
        const elseCy = 230;

        function buildBlock(id: string, label: string, cx: number, cy: number): BlockRec {
          const bgEl = makeRect(blockLayer, {
            x: cx - blockW / 2,
            y: cy - blockH / 2,
            width: blockW,
            height: blockH,
            rx: 8,
            ry: 8,
            fill: palette.bg,
            stroke: palette.text,
            'stroke-width': 1.8,
          });
          const labelEl = makeText(
            blockLayer,
            {
              x: cx,
              y: cy + 4,
              'font-size': fontSizes.sm,
              'text-anchor': 'middle',
              'font-weight': 600,
              fill: palette.text,
            },
            label,
          );
          return { id, bgEl, labelEl, cx, cy };
        }

        blocks.set('then', buildBlock('then', rules.rules[0]!.trueBlockLabel, thenCx, thenCy));
        blocks.set('elif-then', buildBlock('elif-then', rules.rules[1]!.trueBlockLabel, elifThenCx, elifThenCy));
        blocks.set('else', buildBlock('else', rules.else.blockLabel, elseCx, elseCy));

        mergeY = 340;
        endY = 440;

        // 마름모 사이 가지선 (if false → elif top) — 흐름선 일부로 처리.
        // 가지선 정의:
        //  - branch:then       → if 좌정점 → then 블록 우측 → then 아래 → merge
        //  - branch:elif-then  → if 하정점 → elif 상정점 (식 자체는 false 시 이동) → elif 좌정점 → elif-then 블록 우측 → 아래 → merge
        //  - branch:else       → elif 우정점 → else 블록 좌측 → 아래 → merge
        // "if false" 의 수직 이동을 별도 path 로 그릴 수도 있으나 학습상 elif-then/else 모두
        // "if false" 가 전제이므로 가지선 path 에 그 수직 segment 를 포함시켜
        // 두 가지 모두 그 segment 를 공유하도록 한다.

        const ifLeftV = { x: if_dCx - dW / 2, y: if_dCy };
        const ifBottomV = { x: if_dCx, y: if_dCy + dH / 2 };
        const elifTopV = { x: elif_dCx, y: elif_dCy - dH / 2 };
        const elifLeftV = { x: elif_dCx - dW / 2, y: elif_dCy };
        const elifRightV = { x: elif_dCx + dW / 2, y: elif_dCy };

        const thenBranchD =
          `M${ifLeftV.x},${ifLeftV.y} ` +
          `C${ifLeftV.x - 50},${ifLeftV.y} ${thenCx + blockW / 2},${thenCy - 30} ${thenCx + blockW / 2},${thenCy} ` +
          `M${thenCx},${thenCy + blockH / 2} ` +
          `C${thenCx},${thenCy + blockH / 2 + 30} ${if_dCx - 100},${mergeY - 20} ${if_dCx},${mergeY}`;

        const elifThenBranchD =
          // if false (수직)
          `M${ifBottomV.x},${ifBottomV.y} L${elifTopV.x},${elifTopV.y} ` +
          // elif 좌 (참)
          `M${elifLeftV.x},${elifLeftV.y} ` +
          `C${elifLeftV.x - 50},${elifLeftV.y} ${elifThenCx + blockW / 2},${elifThenCy - 30} ${elifThenCx + blockW / 2},${elifThenCy} ` +
          `M${elifThenCx},${elifThenCy + blockH / 2} ` +
          `C${elifThenCx},${elifThenCy + blockH / 2 + 30} ${if_dCx - 100},${mergeY - 20} ${if_dCx},${mergeY}`;

        const elseBranchD =
          `M${ifBottomV.x},${ifBottomV.y} L${elifTopV.x},${elifTopV.y} ` +
          `M${elifRightV.x},${elifRightV.y} ` +
          `C${elifRightV.x + 50},${elifRightV.y} ${elseCx - blockW / 2},${elseCy - 30} ${elseCx - blockW / 2},${elseCy} ` +
          `M${elseCx},${elseCy + blockH / 2} ` +
          `C${elseCx},${elseCy + blockH / 2 + 30} ${if_dCx + 100},${mergeY - 20} ${if_dCx},${mergeY}`;

        function buildBranch3(id: string, d: string, labelText: string, labelX: number, labelY: number, anchor: 'start' | 'end'): BranchRec {
          const hatchEl = makePath(branchInactiveLayer, {
            d,
            stroke: 'url(#cf-hatch)',
            'stroke-width': 6,
            fill: 'none',
            opacity: 1,
          });
          const pathEl = makePath(branchActiveLayer, {
            d,
            stroke: ACTIVE_TONE,
            'stroke-width': 3,
            fill: 'none',
            opacity: 0,
          });
          const dotEl = makeCircle(branchActiveLayer, {
            cx: -1000,
            cy: -1000,
            r: 4,
            fill: ACTIVE_TONE,
            opacity: 0,
          });
          const labelEl = makeText(
            branchInactiveLayer,
            {
              x: labelX,
              y: labelY,
              'font-size': fontSizes.xs,
              'text-anchor': anchor,
              'font-weight': 700,
              fill: palette.textMuted,
            },
            labelText,
          );
          return { id, pathEl, hatchEl, dotEl, labelEl };
        }

        branches.set(
          'then',
          buildBranch3('then', thenBranchD, '참', if_dCx - dW / 2 - 6, if_dCy - 4, 'end'),
        );
        branches.set(
          'elif-then',
          buildBranch3(
            'elif-then',
            elifThenBranchD,
            '참',
            elif_dCx - dW / 2 - 6,
            elif_dCy - 4,
            'end',
          ),
        );
        branches.set(
          'else',
          buildBranch3('else', elseBranchD, '거짓', elif_dCx + dW / 2 + 6, elif_dCy - 4, 'start'),
        );
      }

      // 합류 노드 + 마무리 흐름선.
      const ringEl = makeCircle(mergeLayer, {
        cx: DIAGRAM_CENTER_X,
        cy: mergeY,
        r: 8,
        fill: palette.bg,
        stroke: palette.text,
        'stroke-width': 2,
      });
      const pulseEl = makeCircle(mergeLayer, {
        cx: DIAGRAM_CENTER_X,
        cy: mergeY,
        r: 8,
        fill: 'none',
        stroke: ACTIVE_TONE,
        'stroke-width': 2,
        opacity: 0,
      });

      const flowEndEl = makePath(flowEndLayer, {
        d: `M${DIAGRAM_CENTER_X},${mergeY + 8} L${DIAGRAM_CENTER_X},${endY - 16}`,
        stroke: palette.text,
        'stroke-width': 2.6,
        fill: 'none',
      });
      const flowEndArrowEl = makePath(flowEndLayer, {
        d: `M${DIAGRAM_CENTER_X - 6},${endY - 18} L${DIAGRAM_CENTER_X},${endY - 6} L${DIAGRAM_CENTER_X + 6},${endY - 18}`,
        stroke: palette.text,
        'stroke-width': 2,
        fill: 'none',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      const flowEndLabelEl = makeText(
        flowEndLayer,
        {
          x: DIAGRAM_CENTER_X,
          y: endY + 12,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: palette.textMuted,
          'font-style': 'italic',
        },
        '다음 코드',
      );

      return {
        mode,
        diamonds,
        branches,
        blocks,
        flowStartEl,
        flowEndEl,
        flowEndArrowEl,
        flowEndLabelEl,
        merge: { ringEl, pulseEl },
      };
    }

    // ── 가지·블록 활성/비활성 적용 ──────────────────────────────────
    function applyActiveVisual(activeId: string, activeBlockIdNew: string): void {
      if (!layout) return;
      for (const [id, br] of layout.branches) {
        const isActive = id === activeId;
        br.pathEl.setAttribute('opacity', isActive ? '1' : '0');
        br.hatchEl.setAttribute('opacity', isActive ? `${INACTIVE_BRANCH_OPACITY * 0.4}` : '1');
        br.labelEl.setAttribute(
          'fill',
          isActive ? (palette.text) : palette.textMuted,
        );
        br.labelEl.setAttribute('font-weight', isActive ? '700' : '600');
      }
      for (const [id, bl] of layout.blocks) {
        const isActive = id === activeBlockIdNew;
        bl.bgEl.setAttribute('stroke', isActive ? ACTIVE_TONE : palette.text);
        bl.bgEl.setAttribute('stroke-width', isActive ? '2.4' : '1.4');
        bl.bgEl.setAttribute('fill', isActive ? palette.bg : palette.bgSubtle);
        bl.bgEl.setAttribute('opacity', isActive ? '1' : `${INACTIVE_BLOCK_OPACITY}`);
        bl.labelEl.setAttribute('fill', isActive ? palette.text : palette.textMuted);
        bl.labelEl.setAttribute('font-weight', isActive ? '700' : '500');
        bl.labelEl.setAttribute('opacity', isActive ? '1' : `${INACTIVE_BLOCK_OPACITY + 0.3}`);
      }
    }

    function setSliderValue(v: number): void {
      const t = Math.max(0, Math.min(1, v / 100));
      const x = SLIDER_TRACK_X0 + (SLIDER_TRACK_X1 - SLIDER_TRACK_X0) * t;
      slider.handleEl.setAttribute('cx', String(x));
      slider.fillEl.setAttribute('width', String(x - SLIDER_TRACK_X0));
      slider.valueEl.textContent = String(v);
    }

    // ── 마름모 사슬 점등 + 결과 칩 + 합류 봉합 ──────────────────────
    async function pulseDiamond(d: DiamondRec, result: 'true' | 'false', pulseMs: number): Promise<void> {
      const tone = result === 'true' ? TRUE_TONE : FALSE_TONE;
      const label = result === 'true' ? '참' : '거짓';
      d.pathEl.setAttribute('stroke', tone);
      d.pathEl.setAttribute('stroke-width', '2.6');
      d.exprEl.setAttribute('fill', palette.text);
      d.chipBgEl.setAttribute('stroke', tone);
      d.chipTextEl.setAttribute('fill', tone);
      d.chipTextEl.textContent = label;
      d.chipG.setAttribute('opacity', '1');
      await sleep(pulseMs);
      d.chipG.setAttribute('opacity', '0');
      // 응결되지 않은 마름모는 흐릿한 처음 상태로.
      if (result === 'false') {
        d.pathEl.setAttribute('stroke', palette.textMuted);
        d.pathEl.setAttribute('stroke-width', '1.4');
        d.exprEl.setAttribute('fill', palette.textMuted);
      }
    }

    async function pulseMerge(): Promise<void> {
      if (!layout) return;
      const { pulseEl } = layout.merge;
      pulseEl.setAttribute('opacity', '0.9');
      pulseEl.setAttribute('r', '8');
      const start = Date.now();
      await new Promise<void>((res) => {
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - start) / MERGE_PULSE_MS);
          const e = easeInOut(t);
          const r = 8 + 8 * e;
          pulseEl.setAttribute('r', String(r));
          pulseEl.setAttribute('opacity', String(0.9 * (1 - e)));
          if (t < 1) raf(tick);
          else res();
        };
        raf(tick);
      });
      pulseEl.setAttribute('opacity', '0');
    }

    function dimAllDiamonds(): void {
      if (!layout) return;
      for (const d of layout.diamonds.values()) {
        d.pathEl.setAttribute('stroke', palette.textMuted);
        d.pathEl.setAttribute('stroke-width', '1.4');
        d.exprEl.setAttribute('fill', palette.textMuted);
        d.chipG.setAttribute('opacity', '0');
      }
    }

    // ── 공개 메서드 ──────────────────────────────────────────────────
    function init(payload: {
      mode: ConditionalMode;
      value: number;
      rules: ConditionalRuleSet;
      sequence: EvaluationStep[];
      activeBranchId: string;
      activeBlockId: string;
    }): void {
      layout = buildLayout(payload.mode, payload.rules);
      value = payload.value;
      activeBranchId = payload.activeBranchId;
      activeBlockId = payload.activeBlockId;
      setSliderValue(value);
      dimAllDiamonds();
      // 응결된 마름모(마지막 step) 만 짙게.
      const last = payload.sequence[payload.sequence.length - 1];
      if (last) {
        const d = layout.diamonds.get(last.diamondId);
        if (d) {
          const tone = last.result === 'true' ? TRUE_TONE : FALSE_TONE;
          d.pathEl.setAttribute('stroke', tone);
          d.pathEl.setAttribute('stroke-width', '2.4');
          d.exprEl.setAttribute('fill', palette.text);
        }
      }
      applyActiveVisual(activeBranchId, activeBlockId);
    }

    let evalToken = 0;
    async function applyEvaluation(payload: {
      value: number;
      sequence: EvaluationStep[];
      activeBranchId: string;
      activeBlockId: string;
    }): Promise<void> {
      if (!layout) return;
      const myToken = ++evalToken;
      value = payload.value;
      setSliderValue(value);

      // 사슬 점등: 위에서부터 한 박자씩 → 마지막은 짙게 응결.
      dimAllDiamonds();
      for (let i = 0; i < payload.sequence.length; i += 1) {
        if (myToken !== evalToken) return; // 새 입력으로 대체됨.
        const step = payload.sequence[i]!;
        const d = layout.diamonds.get(step.diamondId);
        if (!d) continue;
        await pulseDiamond(d, step.result, step.pulseMs);
        if (step.result === 'true') {
          // 응결된 마름모는 짙게 유지.
          d.pathEl.setAttribute('stroke', TRUE_TONE);
          d.pathEl.setAttribute('stroke-width', '2.4');
          d.exprEl.setAttribute('fill', palette.text);
          break;
        }
      }
      if (myToken !== evalToken) return;

      // else 로 응결된 경우 마지막 거짓 마름모는 차분하게 두고 활성 가지만 켠다.
      // (이미 dimAllDiamonds + pulseDiamond 안에서 false 처리)

      activeBranchId = payload.activeBranchId;
      activeBlockId = payload.activeBlockId;
      applyActiveVisual(activeBranchId, activeBlockId);

      await sleep(DISSOLVE_MS);
      if (myToken !== evalToken) return;
      await pulseMerge();
    }

    function applyModeSet(payload: {
      mode: ConditionalMode;
      rules: ConditionalRuleSet;
      value: number;
      sequence: EvaluationStep[];
      activeBranchId: string;
      activeBlockId: string;
    }): void {
      // 모드 전환은 즉시 — 도식 재빌드 후 init 과 동일한 정적 상태로.
      init({
        mode: payload.mode,
        value: payload.value,
        rules: payload.rules,
        sequence: payload.sequence,
        activeBranchId: payload.activeBranchId,
        activeBlockId: payload.activeBlockId,
      });
      setCaption(
        payload.mode === 'three'
          ? '3갈래 — if / else if / else 사슬로 펼쳐진다.'
          : '2갈래 — if / else 한 마름모로 합쳐진다.',
        { duration: 1600 },
      );
    }

    function reset(): void {
      // reset 은 runner 가 init payload 를 다시 흘려준다 — 여기선 캡션만 비움.
      if (captionTimer !== null) {
        clearTimeout(captionTimer);
        captionTimer = null;
      }
      eventCaptionEl.textContent = '';
    }

    function signalDemoStart(): void {
      setCaption('자동 시연 — 값에 따라 길이 바뀐다.', { duration: 1600 });
    }
    function signalDemoEnd(): void {
      setCaption('자동 시연 종료.', { duration: 1200 });
    }
    function signalInvalid(op: string, raw: string): void {
      setCaption(`입력 무시 — ${op}: ${raw}`, { duration: 1600 });
    }

    // ── 슬라이더 입력 wire-up ────────────────────────────────────────
    let dragging = false;
    function valueFromClientX(clientX: number): number {
      const rect = svg.getBoundingClientRect();
      const sx = ((clientX - rect.left) / rect.width) * W;
      const t = (sx - SLIDER_TRACK_X0) / (SLIDER_TRACK_X1 - SLIDER_TRACK_X0);
      const v = Math.max(0, Math.min(100, Math.round(t * 100)));
      return v;
    }
    function dispatchValue(v: number): void {
      if (params.dispatch) {
        params.dispatch({ type: 'input', payload: { name: 'value', value: String(v) } });
      }
    }
    function onPointerDown(e: PointerEvent): void {
      dragging = true;
      (e.target as Element)?.setPointerCapture?.(e.pointerId);
      const v = valueFromClientX(e.clientX);
      setSliderValue(v);
      dispatchValue(v);
      e.preventDefault();
    }
    function onPointerMove(e: PointerEvent): void {
      if (!dragging) return;
      const v = valueFromClientX(e.clientX);
      setSliderValue(v);
      dispatchValue(v);
    }
    function onPointerUp(e: PointerEvent): void {
      if (!dragging) return;
      dragging = false;
      (e.target as Element)?.releasePointerCapture?.(e.pointerId);
    }
    slider.hitEl.addEventListener('pointerdown', onPointerDown);
    slider.hitEl.addEventListener('pointermove', onPointerMove);
    slider.hitEl.addEventListener('pointerup', onPointerUp);
    slider.hitEl.addEventListener('pointercancel', onPointerUp);
    slider.handleEl.addEventListener('pointerdown', onPointerDown);
    slider.handleEl.addEventListener('pointermove', onPointerMove);
    slider.handleEl.addEventListener('pointerup', onPointerUp);
    slider.handleEl.addEventListener('pointercancel', onPointerUp);

    // ── ViewInstance 반환 ────────────────────────────────────────────
    return {
      destroy() {
        slider.hitEl.removeEventListener('pointerdown', onPointerDown);
        slider.hitEl.removeEventListener('pointermove', onPointerMove);
        slider.hitEl.removeEventListener('pointerup', onPointerUp);
        slider.hitEl.removeEventListener('pointercancel', onPointerUp);
        slider.handleEl.removeEventListener('pointerdown', onPointerDown);
        slider.handleEl.removeEventListener('pointermove', onPointerMove);
        slider.handleEl.removeEventListener('pointerup', onPointerUp);
        slider.handleEl.removeEventListener('pointercancel', onPointerUp);
        if (captionTimer !== null) {
          clearTimeout(captionTimer);
          captionTimer = null;
        }
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },
      reset,
      init,
      setBaseCaption,
      setCaption,
      applyEvaluation,
      applyModeSet,
      signalDemoStart,
      signalDemoEnd,
      signalInvalid,
    } as ViewInstance;
  },
};
