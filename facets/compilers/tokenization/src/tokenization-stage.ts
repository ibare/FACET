/**
 * tokenization-stage View — 토큰화 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 제목 + 개념 캡션 + 입력 띠 (응시·자라나는 구간·삼킴 흔적) +
 * 낙하 궤적 가이드 + 출력 토큰 카드 행 + 종류↔색 범례 + 참고 레퍼런스 칩 +
 * 결정적 순간 보조 캡션을 모두 담는다.
 *
 * 메서드 (projector → view):
 *   - reset()
 *   - init({ source, exampleIndex, exampleName, examples, kindPalette })
 *   - setBaseCaption / setCaption
 *   - applyExtend({ gaze, segment })
 *   - applyPending({ gaze, segment })  — 최장 일치 망설임 박자 (점선 테두리)
 *   - applySwallow({ gaze, swallowedRange, kind })
 *   - applyCommit({ tokenIndex, token, gaze })
 *   - applyPromote({ tokenIndex, fromKind, toKind })
 *   - applyError({ tokenIndex, token, gaze })
 *   - applyDone({ gaze, totalTokens })
 *   - signalExampleSet / signalInvalid
 *
 * 컨트롤바 버튼 (next-example / replay / reset) 은 control-bar 가 onAction 으로
 * 통과시키므로 view 는 dispatch 를 직접 쓰지 않는다 — 메서드 호출만 담당.
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import { getColors, fonts, fontSizes, categorical } from '@facet/core/runtime';
import type {
  KindPalette,
  SwallowKind,
  Token,
  TokenKind,
} from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 540;

// ── 영역 분할 ───────────────────────────────────────────────────────────
const TITLE_Y = 22;
const CONCEPT_Y0 = 42;
const CONCEPT_LINE_H = 15;

// 입력 띠.
const STRIP_X0 = 24;
const STRIP_X1 = W - 24;
const STRIP_Y0 = 110;
const STRIP_H = 56;
const STRIP_TEXT_Y = STRIP_Y0 + STRIP_H / 2 + 5;
const SEGMENT_TOP = STRIP_Y0 + 6;
const SEGMENT_BOTTOM = STRIP_Y0 + STRIP_H - 6;

// 진행 미니 인디케이터 좌하단.
const PROGRESS_Y = STRIP_Y0 + STRIP_H + 14;

// 낙하 궤적 가이드.
const FALL_Y0 = STRIP_Y0 + STRIP_H + 4;

// 출력 카드 행.
const OUT_Y0 = 240;
const OUT_ROW_H = 50;
const OUT_ROW_GAP = 8;
const OUT_X0 = 24;
const OUT_X1 = W - 24;
const CARD_H = 42;
const CARD_BAR_H = 6;
const CARD_PAD = 8;
const CARD_MIN_W = 28;
const CARD_GAP = 6;

// 범례.
const LEGEND_Y = 388;
const LEGEND_LINE_H = 18;

// 참고 레퍼런스 칩.
const CHIP_BAR_Y0 = 482;
const CHIP_BAR_Y1 = 524;

// ── 운동 시간 (ms) ──────────────────────────────────────────────────────
const COMMIT_FALL_MS = 220;
const PROMOTE_MS = 220;
const PENDING_MS = 180;
const ERROR_SHAKE_MS = 280;
const CAPTION_DURATION_MS = 1800;

// ── 글자 그리드 (모노스페이스 한 글자 폭) ──────────────────────────────
const CHAR_W = 11;
const STRIP_TEXT_FONT_SIZE = 16;

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}

function raf(cb: (t: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(Date.now()), 16) as unknown as number;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, Math.max(0, ms)));
}

function makeText(
  parent: SVGElement,
  attrs: Record<string, string | number>,
  text = '',
): SVGTextElement {
  const el = document.createElementNS(SVG_NS, 'text');
  setAttrs(el, attrs);
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function makeRect(
  parent: SVGElement,
  attrs: Record<string, string | number>,
): SVGRectElement {
  const el = document.createElementNS(SVG_NS, 'rect');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}

function makePath(
  parent: SVGElement,
  attrs: Record<string, string | number>,
): SVGPathElement {
  const el = document.createElementNS(SVG_NS, 'path');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}

function makeGroup(
  parent: SVGElement,
  attrs: Record<string, string | number> = {},
): SVGGElement {
  const el = document.createElementNS(SVG_NS, 'g');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}

function makeLine(
  parent: SVGElement,
  attrs: Record<string, string | number>,
): SVGLineElement {
  const el = document.createElementNS(SVG_NS, 'line');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}

const CONCEPT_LINES = [
  '토큰화는 컴파일러의 첫 단계 — 좌에서 우로 한 글자씩 읽어 의미 있는 최소',
  '단위 (토큰) 로 끊어 낸다. 더 길게 묶을 수 있으면 더 길게 묶고, 공백·주석',
  '은 토큰이 되지 못하고 회색으로 가라앉는다. 위 띠에서 글자가 어떻게 묶여',
  '아래 카드로 떨어지는지 보자.',
];

type Refs = { name: string; url: string };
const REFERENCES: Refs[] = [
  { name: 'Crafting Interpreters — Scanning', url: 'https://craftinginterpreters.com/scanning.html' },
  { name: 'Tokenizer Playground (Xenova)', url: 'https://huggingface.co/spaces/Xenova/the-tokenizer-playground' },
  {
    name: "Ruslan's Blog — LSBASI Part 1",
    url: 'https://ruslanspivak.com/lsbasi-part1/',
  },
  { name: 'regex101', url: 'https://regex101.com/' },
];

// 종류별 의미 색을 categorical 시드 + palette 에서 합성. design-tokens 위에 의미 매핑만 — hex 직접 박지 않음 (S-view).
type KindColors = Record<TokenKind | 'swallow', string>;

function buildKindColors(palette: ReturnType<typeof getColors>): KindColors {
  // categorical(8, 'vivid') 의 인덱스를 semantic 으로 매핑한다 — start hue 50 부근부터 등간격 8단계.
  const cat = categorical(8, 'vivid');
  return {
    number: cat[0]!, // 주황 — 숫자
    string: cat[2]!, // 초록 — 문자열
    identifier: cat[3]!, // 청록 — 식별자
    punct: cat[4]!, // 청 — 구분자
    keyword: cat[5]!, // 보라 — 키워드
    operator: palette.accent, // 노랑 — 연산자
    error: palette.danger, // 빨강 — 오류
    swallow: palette.textMuted, // 회색 — 삼킴
  };
}

function kindLabelKo(k: TokenKind | 'swallow'): string {
  switch (k) {
    case 'keyword':
      return '키워드';
    case 'identifier':
      return '식별자';
    case 'number':
      return '숫자';
    case 'operator':
      return '연산자';
    case 'punct':
      return '구분자';
    case 'string':
      return '문자열';
    case 'error':
      return '오류';
    case 'swallow':
      return '삼킴';
  }
}

function displayChar(c: string): string {
  if (c === '\n') return '↵';
  if (c === '\t') return '→';
  if (c === ' ') return '·';
  return c;
}

function displayValue(value: string): string {
  // 카드 중앙에 출력될 값 — 줄바꿈/탭/공백을 보이는 글리프로 치환.
  let out = '';
  for (const c of value) out += displayChar(c);
  return out;
}

// ── 카드 폭 자동 계산 (값 길이 기반) ────────────────────────────────────
function estimateCardWidth(value: string): number {
  const visible = displayValue(value);
  const textW = visible.length * 8.4 + CARD_PAD * 2;
  return Math.max(CARD_MIN_W, Math.min(180, Math.round(textW)));
}

type CardRec = {
  index: number;
  token: Token;
  /** 카드 좌표 (좌상단). */
  x: number;
  y: number;
  w: number;
  /** 그룹 (내부 요소들 transform). */
  groupEl: SVGGElement;
  /** 상단 색 띠. */
  barEl: SVGRectElement;
  /** 본체 사각. */
  bgEl: SVGRectElement;
  /** 값 텍스트. */
  valueEl: SVGTextElement;
  /** 종류 라벨 텍스트 (상단 색 띠 위 작은 글자). */
  kindLabelEl: SVGTextElement;
};

export const tokenizationStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const palette = getColors(params.theme);
    const kindColors = buildKindColors(palette);

    container.innerHTML = '';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.maxWidth = '720px';
    svg.style.height = 'auto';
    svg.style.fontFamily = fonts.body;
    svg.style.userSelect = 'none';
    container.appendChild(svg);

    // ── 마커 / 패턴 ───────────────────────────────────────────────────
    const defs = document.createElementNS(SVG_NS, 'defs');
    // 삼킴 흔적용 사선 hatch — 매우 옅은 회색.
    const hatch = document.createElementNS(SVG_NS, 'pattern');
    setAttrs(hatch, {
      id: 'tk-swallow-hatch',
      width: 5,
      height: 5,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)',
    });
    const hatchLine = document.createElementNS(SVG_NS, 'line');
    setAttrs(hatchLine, {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 5,
      stroke: palette.textMuted,
      'stroke-width': 1,
      'stroke-opacity': 0.45,
    });
    hatch.appendChild(hatchLine);
    defs.appendChild(hatch);
    svg.appendChild(defs);

    // ── 레이어 (z 순) ─────────────────────────────────────────────────
    const headerLayer = makeGroup(svg);
    const stripBgLayer = makeGroup(svg);
    const stripSwallowLayer = makeGroup(svg);
    const stripSegmentLayer = makeGroup(svg);
    const stripCharsLayer = makeGroup(svg);
    const stripGazeLayer = makeGroup(svg);
    const fallLayer = makeGroup(svg);
    const cardsLayer = makeGroup(svg);
    const legendLayer = makeGroup(svg);
    const chipsLayer = makeGroup(svg);
    const captionLayer = makeGroup(svg);

    // ── 헤더: 제목 + 개념 캡션 ────────────────────────────────────────
    makeText(
      headerLayer,
      {
        x: 24,
        y: TITLE_Y,
        'font-size': fontSizes.md,
        'font-weight': 700,
        fill: palette.text,
      },
      '토큰화 — 한 박자의 응결',
    );
    CONCEPT_LINES.forEach((line, i) => {
      makeText(
        headerLayer,
        {
          x: 24,
          y: CONCEPT_Y0 + i * CONCEPT_LINE_H,
          'font-size': fontSizes.xs,
          fill: palette.textMuted,
        },
        line,
      );
    });

    // 예제 라벨 (오른쪽 상단).
    const exampleNameEl = makeText(
      headerLayer,
      {
        x: W - 24,
        y: TITLE_Y,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: palette.textMuted,
        'text-anchor': 'end',
        'letter-spacing': '0.04em',
      },
      '',
    );

    // ── 입력 띠 배경 ───────────────────────────────────────────────────
    makeRect(stripBgLayer, {
      x: STRIP_X0,
      y: STRIP_Y0,
      width: STRIP_X1 - STRIP_X0,
      height: STRIP_H,
      rx: 8,
      ry: 8,
      fill: palette.bgSubtle,
      stroke: palette.border,
      'stroke-width': 1,
    });
    makeText(
      stripBgLayer,
      {
        x: STRIP_X0 + 4,
        y: STRIP_Y0 - 6,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: palette.textMuted,
        'letter-spacing': '0.04em',
      },
      '입력',
    );

    // 진행 인디케이터.
    const progressTextEl = makeText(
      stripBgLayer,
      {
        x: STRIP_X0 + 4,
        y: PROGRESS_Y,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
      },
      '',
    );

    // ── 낙하 가이드 (배경 점선) ───────────────────────────────────────
    makeLine(fallLayer, {
      x1: STRIP_X0,
      y1: FALL_Y0 + 6,
      x2: STRIP_X1,
      y2: FALL_Y0 + 6,
      stroke: palette.border,
      'stroke-width': 1,
      'stroke-dasharray': '2 4',
      opacity: 0.6,
    });
    makeText(
      fallLayer,
      {
        x: STRIP_X1 - 4,
        y: FALL_Y0 + 18,
        'font-size': fontSizes.xs,
        fill: palette.textMuted,
        'text-anchor': 'end',
      },
      '↓ 닫힘',
    );

    // 출력 라벨.
    makeText(
      cardsLayer,
      {
        x: OUT_X0 + 4,
        y: OUT_Y0 - 6,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: palette.textMuted,
        'letter-spacing': '0.04em',
      },
      '출력 토큰',
    );

    // ── 범례 ───────────────────────────────────────────────────────────
    makeText(
      legendLayer,
      {
        x: OUT_X0 + 4,
        y: LEGEND_Y - 6,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: palette.textMuted,
        'letter-spacing': '0.04em',
      },
      '범례',
    );
    const legendKinds: (TokenKind | 'swallow')[] = [
      'keyword',
      'identifier',
      'number',
      'operator',
      'punct',
      'string',
      'error',
      'swallow',
    ];
    legendKinds.forEach((k, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const lx = OUT_X0 + 4 + col * 168;
      const ly = LEGEND_Y + 8 + row * LEGEND_LINE_H;
      makeRect(legendLayer, {
        x: lx,
        y: ly - 8,
        width: 14,
        height: 10,
        rx: 2,
        ry: 2,
        fill: kindColors[k],
        opacity: k === 'swallow' ? 0.45 : 1,
      });
      makeText(
        legendLayer,
        {
          x: lx + 20,
          y: ly,
          'font-size': fontSizes.xs,
          fill: palette.text,
        },
        kindLabelKo(k),
      );
    });

    // ── 참고 레퍼런스 칩 ─────────────────────────────────────────────
    makeText(
      chipsLayer,
      {
        x: OUT_X0 + 4,
        y: CHIP_BAR_Y0 - 6,
        'font-size': fontSizes.xs,
        'font-weight': 700,
        fill: palette.textMuted,
        'letter-spacing': '0.04em',
      },
      '참고',
    );
    const chipW = (W - 48 - (REFERENCES.length - 1) * 8) / REFERENCES.length;
    REFERENCES.forEach((ref, i) => {
      const x = OUT_X0 + i * (chipW + 8);
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

    // ── 결정적 순간 보조 캡션 ────────────────────────────────────────
    const baseCaptionEl = makeText(
      captionLayer,
      {
        x: W / 2,
        y: H - 8,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
        fill: palette.textMuted,
      },
      '',
    );
    void baseCaptionEl;
    const eventCaptionEl = makeText(
      captionLayer,
      {
        x: W / 2,
        y: STRIP_Y0 - 26,
        'font-size': fontSizes.sm,
        'text-anchor': 'middle',
        'font-weight': 700,
        fill: palette.text,
        opacity: 0,
      },
      '',
    );

    let captionTimer: ReturnType<typeof setTimeout> | null = null;
    function setBaseCaption(_text: string): void {
      // 본 도식에서는 개념 캡션을 좌상단에 고정 배치한다 — 하단 캡션은 비워둔다.
    }
    function setCaption(text: string, opts?: { duration?: number }): void {
      if (captionTimer !== null) {
        clearTimeout(captionTimer);
        captionTimer = null;
      }
      eventCaptionEl.textContent = text;
      eventCaptionEl.setAttribute('opacity', '1');
      const dur = opts?.duration ?? CAPTION_DURATION_MS;
      captionTimer = setTimeout(() => {
        eventCaptionEl.setAttribute('opacity', '0');
        eventCaptionEl.textContent = '';
        captionTimer = null;
      }, dur);
    }

    // ── 입력 띠 글자 + 응시 + 구간 (build per source) ─────────────────
    let source = '';
    let charXs: number[] = []; // 각 글자의 x 좌표 (왼쪽 정렬).
    let charEls: SVGTextElement[] = [];
    let charSwallowEls: SVGRectElement[] = [];

    let segmentEl: SVGRectElement = makeRect(stripSegmentLayer, {
      x: 0,
      y: SEGMENT_TOP,
      width: 0,
      height: SEGMENT_BOTTOM - SEGMENT_TOP,
      rx: 4,
      ry: 4,
      fill: palette.bgSubtle,
      'fill-opacity': 0,
      stroke: 'none',
      'stroke-width': 2,
    });

    let gazeEl: SVGRectElement = makeRect(stripGazeLayer, {
      x: STRIP_X0 + 4,
      y: SEGMENT_TOP - 2,
      width: 2.4,
      height: SEGMENT_BOTTOM - SEGMENT_TOP + 4,
      fill: palette.text,
      opacity: 0,
    });

    function rebuildStrip(src: string): void {
      source = src;
      stripCharsLayer.textContent = '';
      stripSwallowLayer.textContent = '';
      charEls = [];
      charSwallowEls = [];
      charXs = [];

      // 한 줄 폭 안에 모든 글자가 들어가도록 charW 를 동적 클램프.
      const innerW = STRIP_X1 - STRIP_X0 - 16;
      const fitW = src.length > 0 ? Math.min(CHAR_W, innerW / src.length) : CHAR_W;
      const cw = Math.max(7, fitW);
      const usedW = cw * src.length;
      const startX = STRIP_X0 + 8 + Math.max(0, (innerW - usedW) / 2);
      for (let i = 0; i < src.length; i += 1) {
        const cx = startX + i * cw;
        charXs.push(cx);
        const swEl = makeRect(stripSwallowLayer, {
          x: cx - 1,
          y: SEGMENT_TOP + 4,
          width: cw,
          height: SEGMENT_BOTTOM - SEGMENT_TOP - 8,
          rx: 2,
          ry: 2,
          fill: 'url(#tk-swallow-hatch)',
          opacity: 0,
        });
        charSwallowEls.push(swEl);
        const txt = makeText(
          stripCharsLayer,
          {
            x: cx + cw / 2,
            y: STRIP_TEXT_Y,
            'font-size': STRIP_TEXT_FONT_SIZE,
            'font-family': fonts.mono,
            'text-anchor': 'middle',
            fill: palette.text,
          },
          displayChar(src[i]!),
        );
        charEls.push(txt);
      }
      // 마지막 위치 (가독성용).
      charXs.push(startX + src.length * cw);

      // 응시·구간을 띠 좌측 끝에 초기화.
      const x0 = startX;
      gazeEl.setAttribute('x', String(x0 - 1));
      gazeEl.setAttribute('opacity', '0');
      segmentEl.setAttribute('x', String(x0));
      segmentEl.setAttribute('width', '0');
      segmentEl.setAttribute('fill-opacity', '0');
      segmentEl.setAttribute('stroke', 'none');
    }

    // ── 출력 카드 행 (자동 줄바꿈) ────────────────────────────────────
    const cards: CardRec[] = [];
    let cursorX = OUT_X0;
    let cursorRow = 0;

    function rowY(row: number): number {
      return OUT_Y0 + row * (OUT_ROW_H + OUT_ROW_GAP);
    }

    function placeCard(
      tokenIndex: number,
      token: Token,
    ): { x: number; y: number; w: number } {
      const w = estimateCardWidth(token.value);
      if (cursorX + w > OUT_X1) {
        cursorRow += 1;
        cursorX = OUT_X0;
      }
      const x = cursorX;
      const y = rowY(cursorRow);
      cursorX += w + CARD_GAP;
      void tokenIndex;
      return { x, y, w };
    }

    function buildCard(
      tokenIndex: number,
      token: Token,
      pos: { x: number; y: number; w: number },
      isError: boolean,
    ): CardRec {
      const groupEl = makeGroup(cardsLayer, {
        transform: `translate(${pos.x},${pos.y - 22}) scale(0.92)`,
        opacity: 0,
      });
      const color = isError ? kindColors.error : kindColors[token.kind];
      const bgEl = makeRect(groupEl, {
        x: 0,
        y: 0,
        width: pos.w,
        height: CARD_H,
        rx: 6,
        ry: 6,
        fill: palette.bg,
        stroke: isError ? color : palette.border,
        'stroke-width': isError ? 1.6 : 1,
      });
      const barEl = makeRect(groupEl, {
        x: 0,
        y: 0,
        width: pos.w,
        height: CARD_BAR_H,
        rx: 6,
        ry: 6,
        fill: color,
      });
      const kindLabelEl = makeText(
        groupEl,
        {
          x: pos.w / 2,
          y: CARD_BAR_H + 12,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
          fill: color,
          'font-weight': 700,
          'letter-spacing': '0.04em',
        },
        kindLabelKo(token.kind),
      );
      const valueEl = makeText(
        groupEl,
        {
          x: pos.w / 2,
          y: CARD_H - 10,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: palette.text,
          'font-family': fonts.mono,
          'font-weight': 600,
        },
        displayValue(token.value),
      );
      return {
        index: tokenIndex,
        token,
        x: pos.x,
        y: pos.y,
        w: pos.w,
        groupEl,
        barEl,
        bgEl,
        valueEl,
        kindLabelEl,
      };
    }

    // ── init / reset ──────────────────────────────────────────────────
    let exampleName: { en: string; ko: string } = { en: '', ko: '' };

    function applyExampleNameLabel(): void {
      const ko = exampleName.ko ?? '';
      const en = exampleName.en ?? '';
      exampleNameEl.textContent = ko || en;
    }

    function init(payload: {
      source: string;
      exampleIndex: number;
      exampleName: { en: string; ko: string };
      examples: { id: string; name: { en: string; ko: string } }[];
      kindPalette: KindPalette;
    }): void {
      void payload.kindPalette;
      void payload.examples;
      exampleName = payload.exampleName;
      applyExampleNameLabel();
      rebuildStrip(payload.source);
      // 카드 그룹 (구) 제거.
      for (const c of cards) c.groupEl.remove();
      cards.length = 0;
      cursorX = OUT_X0;
      cursorRow = 0;
      progressTextEl.textContent = `0 / ${payload.source.length}`;
      eventCaptionEl.setAttribute('opacity', '0');
      eventCaptionEl.textContent = '';
    }

    function reset(): void {
      // runner 가 init payload 를 다시 흘려준다 — 여기선 캡션·카드 정리만.
      for (const c of cards) c.groupEl.remove();
      cards.length = 0;
      cursorX = OUT_X0;
      cursorRow = 0;
      if (captionTimer !== null) {
        clearTimeout(captionTimer);
        captionTimer = null;
      }
      eventCaptionEl.textContent = '';
      eventCaptionEl.setAttribute('opacity', '0');
      gazeEl.setAttribute('opacity', '0');
      segmentEl.setAttribute('width', '0');
      segmentEl.setAttribute('fill-opacity', '0');
      segmentEl.setAttribute('stroke', 'none');
    }

    // ── helpers ──────────────────────────────────────────────────────
    function gazeXAt(idx: number): number {
      const safe = Math.max(0, Math.min(charXs.length - 1, idx));
      return charXs[safe] ?? STRIP_X0;
    }

    function setGaze(gaze: number): void {
      const x = gazeXAt(gaze) - 1;
      gazeEl.setAttribute('x', String(x));
      gazeEl.setAttribute('opacity', '1');
      progressTextEl.textContent = `${gaze} / ${source.length}`;
    }

    function setSegment(seg: { start: number; end: number; kind: TokenKind } | null, dashed = false): void {
      if (!seg || seg.start === seg.end) {
        segmentEl.setAttribute('width', '0');
        segmentEl.setAttribute('fill-opacity', '0');
        segmentEl.setAttribute('stroke', 'none');
        segmentEl.removeAttribute('stroke-dasharray');
        return;
      }
      const x0 = gazeXAt(seg.start);
      const x1 = gazeXAt(seg.end);
      const color = kindColors[seg.kind];
      segmentEl.setAttribute('x', String(x0 - 1));
      segmentEl.setAttribute('width', String(Math.max(2, x1 - x0)));
      segmentEl.setAttribute('fill', color);
      segmentEl.setAttribute('fill-opacity', '0.22');
      segmentEl.setAttribute('stroke', color);
      segmentEl.setAttribute('stroke-width', dashed ? '1.6' : '1.4');
      if (dashed) segmentEl.setAttribute('stroke-dasharray', '3 3');
      else segmentEl.removeAttribute('stroke-dasharray');
    }

    async function applyExtend(payload: {
      gaze: number;
      segment: { start: number; end: number; kind: TokenKind };
    }): Promise<void> {
      setGaze(payload.gaze);
      setSegment(payload.segment, false);
    }

    async function applyPending(payload: {
      gaze: number;
      segment: { start: number; end: number; kind: TokenKind };
    }): Promise<void> {
      setGaze(payload.gaze);
      setSegment(payload.segment, true);
      await sleep(PENDING_MS);
      setSegment(payload.segment, false);
    }

    async function applySwallow(payload: {
      gaze: number;
      swallowedRange: { start: number; end: number };
      kind: SwallowKind;
    }): Promise<void> {
      // 응시는 구간 끝으로 이동.
      setGaze(payload.gaze);
      setSegment(null);
      // 글자들을 회색·반투명으로 가라앉히고 hatch 를 띄운다.
      for (let i = payload.swallowedRange.start; i < payload.swallowedRange.end; i += 1) {
        const txt = charEls[i];
        const sw = charSwallowEls[i];
        if (txt) {
          txt.setAttribute('fill', palette.textMuted);
          txt.setAttribute('opacity', '0.55');
        }
        if (sw) sw.setAttribute('opacity', '1');
      }
      if (payload.kind === 'comment') {
        setCaption('주석은 토큰이 되지 못해 흔적으로만 남는다.', { duration: 1400 });
      }
    }

    function fadeInCard(card: CardRec): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - start) / COMMIT_FALL_MS);
          const e = easeOut(t);
          // 위에서 (y - 22) → y. scale 0.92 → 1.
          const dy = -22 + 22 * e;
          const sc = 0.92 + 0.08 * e;
          card.groupEl.setAttribute(
            'transform',
            `translate(${card.x},${card.y + dy}) scale(${sc})`,
          );
          card.groupEl.setAttribute('opacity', String(e));
          if (t < 1) raf(tick);
          else resolve();
        };
        raf(tick);
      });
    }

    function drawFallingTrail(fromX: number, toX: number): SVGPathElement {
      const x0 = fromX;
      const x1 = toX;
      const y0 = STRIP_Y0 + STRIP_H - 2;
      const y1 = OUT_Y0 - 2;
      const midY = (y0 + y1) / 2;
      const d = `M${x0},${y0} C${x0},${midY} ${x1},${midY} ${x1},${y1}`;
      const pEl = makePath(fallLayer, {
        d,
        stroke: palette.text,
        'stroke-width': 1.4,
        fill: 'none',
        opacity: 0.55,
        'stroke-dasharray': '3 4',
      });
      // 페이드아웃 후 제거.
      const start = Date.now();
      const tick = (): void => {
        const t = Math.min(1, (Date.now() - start) / 360);
        pEl.setAttribute('opacity', String(0.55 * (1 - t)));
        if (t < 1) raf(tick);
        else pEl.remove();
      };
      raf(tick);
      return pEl;
    }

    async function applyCommit(payload: {
      tokenIndex: number;
      token: Token;
      gaze: number;
    }): Promise<void> {
      // 구간 닫힘 박자 — 테두리 굳기 + 채도 진해짐 한 컷.
      setSegment(payload.token, false);
      segmentEl.setAttribute('fill-opacity', '0.4');
      segmentEl.setAttribute('stroke-width', '2');
      await sleep(80);

      // 카드 안착 위치 결정 + 빌드.
      const pos = placeCard(payload.tokenIndex, payload.token);
      const card = buildCard(payload.tokenIndex, payload.token, pos, false);
      card.groupEl.setAttribute('data-card', String(payload.tokenIndex));
      cards.push(card);

      // 낙하 궤적 + 카드 페이드인 동시에.
      const segMidX = (gazeXAt(payload.token.start) + gazeXAt(payload.token.end)) / 2;
      const cardMidX = pos.x + pos.w / 2;
      drawFallingTrail(segMidX, cardMidX);

      await fadeInCard(card);

      // 응시는 새 글자 위에 길이 0 짜리 새 구간으로.
      setGaze(payload.gaze);
      setSegment(null);
    }

    async function applyPromote(payload: {
      tokenIndex: number;
      fromKind: TokenKind;
      toKind: TokenKind;
    }): Promise<void> {
      const card = cards.find((c) => c.index === payload.tokenIndex);
      if (!card) return;
      const fromColor = kindColors[payload.fromKind];
      const toColor = kindColors[payload.toKind];
      void fromColor;
      // 페이드 전환 — bar fill + kindLabel.
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - start) / PROMOTE_MS);
          const e = easeOut(t);
          // 단순 색 교체 — easing 만 사용하고 t=1 시 toColor 로 고정.
          const cur = e < 1 ? mix(fromColor, toColor, e) : toColor;
          card.barEl.setAttribute('fill', cur);
          card.kindLabelEl.setAttribute('fill', cur);
          if (t >= 0.5) {
            card.kindLabelEl.textContent = kindLabelKo(payload.toKind);
            card.token = { ...card.token, kind: payload.toKind };
          }
          if (t < 1) raf(tick);
          else resolve();
        };
        raf(tick);
      });
    }

    async function applyError(payload: {
      tokenIndex: number;
      token: Token;
      gaze: number;
    }): Promise<void> {
      // 빨간 카드 + 외곽선 진동.
      const pos = placeCard(payload.tokenIndex, payload.token);
      const card = buildCard(payload.tokenIndex, payload.token, pos, true);
      card.groupEl.setAttribute('data-card', String(payload.tokenIndex));
      cards.push(card);
      const segMidX = (gazeXAt(payload.token.start) + gazeXAt(payload.token.end)) / 2;
      const cardMidX = pos.x + pos.w / 2;
      drawFallingTrail(segMidX, cardMidX);
      await fadeInCard(card);

      // 진동.
      const start = Date.now();
      await new Promise<void>((resolve) => {
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - start) / ERROR_SHAKE_MS);
          const dx = Math.sin(t * Math.PI * 8) * (1 - t) * 2.4;
          card.groupEl.setAttribute(
            'transform',
            `translate(${pos.x + dx},${pos.y}) scale(1)`,
          );
          if (t < 1) raf(tick);
          else {
            card.groupEl.setAttribute(
              'transform',
              `translate(${pos.x},${pos.y}) scale(1)`,
            );
            resolve();
          }
        };
        raf(tick);
      });

      setGaze(payload.gaze);
      setSegment(null);
      setCaption('인식 불가 글자 — 빨간 카드로 박힌다.', { duration: 1400 });
    }

    function applyDone(payload: { gaze: number; totalTokens: number }): void {
      setGaze(payload.gaze);
      setSegment(null);
      setCaption(`스캔 완료 — ${payload.totalTokens}장의 토큰.`, { duration: 1400 });
    }

    function signalExampleSet(payload: {
      exampleIndex: number;
      exampleName: { en: string; ko: string };
      source: string;
    }): void {
      void payload.source;
      setCaption(
        `예제 ${payload.exampleIndex + 1} — ${payload.exampleName.ko ?? payload.exampleName.en}`,
        { duration: 1400 },
      );
    }

    function signalInvalid(op: string, raw: string): void {
      setCaption(`입력 무시 — ${op}: ${raw}`, { duration: 1400 });
    }

    return {
      destroy() {
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
      applyExtend,
      applyPending,
      applySwallow,
      applyCommit,
      applyPromote,
      applyError,
      applyDone,
      signalExampleSet,
      signalInvalid,
    } as ViewInstance;
  },
};

// ── hex 보간 (promote 페이드 전환용) ────────────────────────────────────
function mix(a: string, b: string, t: number): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return b;
  const r = Math.round(ra.r + (rb.r - ra.r) * t);
  const g = Math.round(ra.g + (rb.g - ra.g) * t);
  const bl = Math.round(ra.b + (rb.b - ra.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function parseHex(s: string): { r: number; g: number; b: number } | null {
  if (s.startsWith('#')) {
    if (s.length === 7) {
      const r = parseInt(s.slice(1, 3), 16);
      const g = parseInt(s.slice(3, 5), 16);
      const b = parseInt(s.slice(5, 7), 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return { r, g, b };
    }
    return null;
  }
  // rgb(r,g,b)
  const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  return null;
}
