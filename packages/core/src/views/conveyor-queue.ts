/**
 * conveyor-queue (v2) — FIFO 큐의 시그니처 행동 (양끝 비대칭 게이트 · 동기 시프트 ·
 * 입장 스탬프 · 나이 그라디언트 · 꼬리 로그) 를 납작한 3D 외관 파이프 위에서
 * 2D 수평 이동으로 시각화한다.
 *
 * 형상 (Queue-SVG.svg 에서 직접 추출):
 *   - viewBox  `-90 0 344 51`  (좌측 -90 영역은 꼬리 로그용 확장)
 *   - OUT 캡   x 15.96 ~ 33.28 (front),   x 0.5 ~ 15.96 상단 (top 3D 장식)
 *   - 본체     x 33.28 ~ 241.78   (투명, 블록 슬롯 영역 폭 208.5)
 *   - IN 캡    x 241.78 ~ 252.96 (front), x 224.45 ~ 252.96 상단 (top 3D 장식)
 *   - 파이프 앞면 y 10.5 ~ 50.5  (h=40)
 *   - 3D 깊이 벡터 Δ = (-15.46, -10)  ← 정적 도형에만 쓰이며 애니메이션 축이
 *     아니다. 모든 transition 은 순수 X 방향 수평 이동이다.
 *
 * 좌표 공식:
 *   slotPitch   = 208.5 / capacity
 *   slotX(i)    = 33.28 + i * slotPitch
 *   blockFrontW = min(26.17, slotPitch - 1)   ← 슬롯 간 1px 여유
 *
 * config:
 *   {
 *     type: 'conveyor-queue',
 *     label?: LocaleStr,
 *     capacity?: number | null,             // null/생략 = 무한 (폴백: 10)
 *     maxTailEntries?: number,               // 기본 3
 *     features?: ConveyorQueueFeature[],     // 기본 ['aging-gradient', 'tail-log', 'scoreboard']
 *   }
 *
 * 메서드:
 *   enqueue(item, opts?)    — IN 캡 오른쪽 바깥에서 수평 진입, 캡 펄스. 완료 Promise.
 *   dequeue(opts?)          — track 전체에 동기 translate(-slotPitch).
 *                              transitionend 에 front 를 꼬리 로그로 이동.
 *   pulseFront(opts?)       — front 블록 2 회 scale pulse (peek 용).
 *   signalOverflow(opts?)   — IN 캡 에러 섬광 + shake.
 *   signalUnderflow(opts?)  — OUT 캡 에러 섬광 + shake.
 *   setTotalEnqueued(n)     — 헤더 총 입장 카운터.
 *   setSize(n, capacity?)   — 헤더 크기 게이지 (bounded 모드에서 n/cap).
 *   reset()                 — 모든 상태 초기화.
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, fonts, fontSizes, radii, space } from './design-tokens.js';
import { resolveLocale, type LocaleStr } from '../types/locale.js';
import { createCubeBlock, type CubeBlockHandle } from './cube-block.js';

export type ConveyorQueueFeature = 'bounded' | 'aging-gradient' | 'tail-log' | 'scoreboard';

export type ConveyorQueueItem = {
  stamp: number;
  label: string;
  tint?: string;
};

type ConveyorQueueConfig = {
  label?: LocaleStr;
  capacity?: number | null;
  maxTailEntries?: number;
  features?: ConveyorQueueFeature[];
};

type Labels = {
  totalEnqueued: string;
  size: string;
  empty: string;
  in: string;
  out: string;
};

const LABELS_BY_LOCALE: Record<string, Labels> = {
  en: {
    totalEnqueued: 'Total in',
    size: 'Size',
    empty: '(empty)',
    in: 'IN',
    out: 'OUT',
  },
  ko: {
    totalEnqueued: '총 입장',
    size: '크기',
    empty: '(비어 있음)',
    in: 'IN',
    out: 'OUT',
  },
};

function pickLabels(locale: string | undefined): Labels {
  if (locale && LABELS_BY_LOCALE[locale]) return LABELS_BY_LOCALE[locale];
  return LABELS_BY_LOCALE.en;
}

// ──────────────────────────────────────────────────────
// 기하 상수 (Queue-SVG.svg 에서 직접 추출)
// ──────────────────────────────────────────────────────
const PIPE_BODY_LEFT = 33.28;
const PIPE_BODY_RIGHT = 241.78;
const PIPE_BODY_WIDTH = PIPE_BODY_RIGHT - PIPE_BODY_LEFT; // 208.5
const PIPE_FRONT_TOP = 10.5;
const PIPE_FRONT_BOTTOM = 50.5;
const DEPTH_DX = -15.46;
const DEPTH_DY = -10;

const BLOCK_MAX_W = 26.17;
const BLOCK_H = 35.07;
const BLOCK_Y = PIPE_FRONT_TOP + (PIPE_FRONT_BOTTOM - PIPE_FRONT_TOP - BLOCK_H) / 2; // ≈12.965

const OUT_CAP_FRONT_LEFT = 15.96;
const OUT_CAP_FRONT_RIGHT = 33.28;
const OUT_CAP_BACK_LEFT = 0.5;
const OUT_CAP_BACK_TOP = 0.5;
const IN_CAP_FRONT_LEFT = 241.78;
const IN_CAP_FRONT_RIGHT = 252.96;
const IN_CAP_BACK_LEFT = 224.45;
const IN_CAP_BACK_FAR = 236.45;

// viewBox extent / padding 은 활성 feature 로부터 mount() 에서 파생된다:
//   - tail-log  : 좌측을 -90 까지 확장 + 블록 3D depth 를 위한 PAD_X 12.
//   - scoreboard: 상단 PAD_TOP 을 전광판 + 연결선(2x) 을 위해 크게 잡음.
//   - 이 외에는 cap 의 3D top face (DEPTH_DY = -10) 와 stroke 여유만 확보.
// 결과적으로 features 가 빈 배열이면 파이프 본체만 담는 minimal viewBox 가
// 계산되어 소비측이 준 공간 안에서 파이프가 최대 크기로 그려진다.
const VIEWBOX_RIGHT = 254;
const VIEWBOX_TAIL_LEFT = -90;
const VIEWBOX_BASE_LEFT = 0;
const VIEWBOX_TAIL_PAD_X = 12;
const VIEWBOX_BASE_PAD_X = 4;
const VIEWBOX_SCOREBOARD_PAD_TOP = 60;
const VIEWBOX_BASE_PAD_TOP = 14; // cap 3D top face 깊이(DEPTH_DY=-10) + stroke 여유.
const VIEWBOX_PAD_BOTTOM = 4;

// ─── 전광판(scoreboard) 기하 ────────────────────────────
// OUT 캡 / IN 캡 위, viewBox 상단 padding 영역에 얹는 작은 LED 표기판.
// 평상시(idle) 에는 은유적 "전원만 켜짐" 상태 (middle-dot 을 어둡게),
// 명령이 들어오면 영어 연산명 (PUSH / POP / PEEK / OVERFLOW / UNDERFLOW) 을 밝게 표시.
//
// 배치 보정:
//   - X 방향: 캡 정면 중심에 전광판을 두면 전체가 시각적으로 우측으로 치우쳐
//     보이므로 -60 좌측으로 shift. OUT 전광판은 꼬리 로그 영역 상단으로,
//     IN 전광판은 파이프 본체 상단으로 내려앉는다.
//   - Y 방향: 연결선을 기존 대비 2배로 늘려 전광판이 캡과 분리된 별도 기구
//     처럼 읽히도록 한다.
const SCOREBOARD_W = 36;
const SCOREBOARD_H = 10;
const SCOREBOARD_X_OFFSET = -15;
const SCOREBOARD_CONNECTOR_LEN = 11; // 기존 5.5 × 2.
const SCOREBOARD_BOTTOM_Y = OUT_CAP_BACK_TOP - SCOREBOARD_CONNECTOR_LEN; // = -10.5
const SCOREBOARD_Y = SCOREBOARD_BOTTOM_Y - SCOREBOARD_H; // = -20.5
// 전광판 on/off 를 애니메이션 duration 에 맞춰 스케일한 pre/post 간격.
const SCOREBOARD_PRE_RATIO = 0.18;
const SCOREBOARD_POST_RATIO = 0.35;
const SCOREBOARD_PRE_MIN = 30;
const SCOREBOARD_POST_MIN = 60;

const FALLBACK_CAPACITY = 10;

// 꼬리 로그 슬롯 간격 — 블록 기본 폭 (26.17) 대비 살짝 좁게 배치해
// 좌측 공간 (~90px) 안에 3 슬롯이 여유 있게 들어가도록.
const TAIL_SLOT_PITCH = 28;

// 애니메이션 시작 위치 — IN 캡 오른쪽 바깥 (viewBox 외곽) 에서 진입.
const ENQUEUE_START_X = 260;

/**
 * View-local 색 토큰.
 *
 * 팔레트는 납작한 3D 외관을 위해 고유 큐 미학(시안 블록 / 빨강 OUT / 보라 IN)
 * 을 고정 사용한다. design-tokens 는 흑백 + 악센트 노랑 체계라 3 면 shading
 * 이 표현되지 않으므로 이 view 에만 한정된 상수로 둔다 (S-view 예외 범위 내).
 *
 * 예외 범위:
 *   - 블록/캡 shading (3D 입체 표현).
 *   - 섬광/에러 keyframe 용 rgba (CSS 변수로 root 에 주입).
 *   - 전광판(scoreboard) 패널 팔레트 — LED 메타포용 고정 흑/회/적 계열.
 */
const CQ_TOKENS = {
  blockFront: '#00BED7',
  blockLeft: '#16D6EF',
  blockTop: '#76EFFF',
  outFront: '#CC1010',
  outTop: '#FF6161',
  inFront: '#5302EB',
  inTop: '#A97BFF',
  capText: '#ffffff',
  blockLabel: '#ffffff',
  blockStamp: '#444444',
  pipeStroke: '#000000',
  errorCapFront: '#dc2626',
  errorGlow: 'rgba(220, 38, 38, 0.65)',
  errorGlow0: 'rgba(220, 38, 38, 0)',
  // 전광판 팔레트.
  scoreboardBg: '#171717',
  scoreboardBorder: '#2a2a2a',
  scoreboardIdleText: '#2f2f2f',
  scoreboardOnText: '#e5e5e5',
  scoreboardErrorText: '#f87171',
  scoreboardConnector: '#525252',
} as const;

/**
 * 전광판 연산 종류.
 *
 * push / pop / peek — 외부 명령 (enqueue / dequeue / peek 에서 점등).
 * overflow / underflow — 큐가 한계에 닿아 발생한 에러 반응.
 */
type ScoreboardOp = 'push' | 'pop' | 'peek' | 'overflow' | 'underflow';
type ScoreboardSide = 'in' | 'out';

/**
 * 연산별 텍스트 색 맵.
 *
 * 현재는 단색(일반 연산은 scoreboardOnText, 에러는 scoreboardErrorText) 이지만,
 * 추후 연산별로 분리된 색(예: push=초록, pop=주황) 을 지정할 수 있도록
 * 명시적 맵 구조로 둔다. 호출부 수정 없이 이 맵의 값만 바꾸면 된다.
 */
const SCOREBOARD_OP_COLORS: Record<ScoreboardOp, string> = {
  push: CQ_TOKENS.scoreboardOnText,
  pop: CQ_TOKENS.scoreboardOnText,
  peek: CQ_TOKENS.scoreboardOnText,
  overflow: CQ_TOKENS.scoreboardErrorText,
  underflow: CQ_TOKENS.scoreboardErrorText,
};

/**
 * 전광판 라벨은 **로캘 무관 고정 영문 글리프** 다. LED 메타포의 일관성을
 * 위해 ko/en 양 로캘에서 동일하게 PUSH/POP/PEEK/OVERFLOW/UNDERFLOW 를 쓴다
 * (code-view 의 phase 어휘와 동기화되어 학습 시너지를 준다).
 */
function formatScoreboardLabel(op: ScoreboardOp, arg: string | undefined): string {
  switch (op) {
    case 'push':
      return arg ? `PUSH ${arg}` : 'PUSH';
    case 'peek':
      return arg ? `PEEK ${arg}` : 'PEEK';
    case 'pop':
      return 'POP';
    case 'overflow':
      return 'OVERFLOW';
    case 'underflow':
      return 'UNDERFLOW';
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

type Block = {
  group: SVGGElement;
  stamp: number;
  label: string;
  tint: string;
  age: number;
};

function waitMs(ms: number): Promise<void> {
  return new Promise((res) => window.setTimeout(res, Math.max(0, ms)));
}

function flashElement(el: Element, className: string, durationMs: number): void {
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), durationMs);
}

export const conveyorQueueView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const cfg = (params.config ?? {}) as ConveyorQueueConfig;
    const labels = pickLabels(params.locale);
    const userLabel = resolveLocale(cfg.label, params.locale);

    const features = new Set<ConveyorQueueFeature>(
      cfg.features ?? ['aging-gradient', 'tail-log', 'scoreboard'],
    );
    const hasAging = features.has('aging-gradient');
    const hasTailLog = features.has('tail-log');
    const hasBounded = features.has('bounded');
    const hasScoreboard = features.has('scoreboard');
    const maxTailEntries = Math.max(0, cfg.maxTailEntries ?? 3);
    const initialCapacity: number | null = cfg.capacity ?? null;

    ensureStyleSheet();

    // 슬롯 피치는 capacity 가 bounded 일 때만 실제 값에 맞춘다. 무한 큐는
    // FALLBACK_CAPACITY 기준으로 렌더하고 overflow 는 발생하지 않으니 시각적
    // 용량 초과는 rear 슬롯 경계 밖 레이아웃으로 자연 처리된다.
    const layoutCapacity = Math.max(1, initialCapacity ?? FALLBACK_CAPACITY);
    const slotPitch = PIPE_BODY_WIDTH / layoutCapacity;
    const blockFrontW = Math.min(BLOCK_MAX_W, slotPitch - 1);
    const slotX = (i: number): number => PIPE_BODY_LEFT + i * slotPitch;

    // ──────────────────────────────────────────────────────
    // 루트 DOM
    // ──────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'facet-conveyor-queue';
    for (const [key, value] of Object.entries(CQ_TOKENS)) {
      root.style.setProperty(`--facet-cq-${key}`, value);
    }
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = space.sm;
    root.style.color = colors.text;

    // Header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = space.md;
    header.style.fontSize = fontSizes.xs;
    header.style.color = colors.textMuted;

    const labelEl = document.createElement('div');
    labelEl.textContent = userLabel || '';
    labelEl.style.fontWeight = '600';
    labelEl.style.fontSize = fontSizes.sm;
    labelEl.style.color = colors.text;
    header.appendChild(labelEl);

    const headerCounters = document.createElement('div');
    headerCounters.style.display = 'flex';
    headerCounters.style.gap = space.md;
    headerCounters.style.alignItems = 'baseline';

    const totalEl = document.createElement('span');
    const sizeEl = document.createElement('span');
    headerCounters.appendChild(totalEl);
    headerCounters.appendChild(sizeEl);
    header.appendChild(headerCounters);
    root.appendChild(header);

    // ──────────────────────────────────────────────────────
    // SVG 스테이지
    // ──────────────────────────────────────────────────────
    const stageWrap = document.createElement('div');
    stageWrap.style.position = 'relative';
    stageWrap.style.width = '100%';
    stageWrap.style.background = colors.bgSubtle;
    stageWrap.style.border = `1px solid ${colors.border}`;
    stageWrap.style.borderRadius = radii.sm;
    stageWrap.style.padding = `${space.sm} ${space.xs}`;
    stageWrap.style.overflow = 'hidden';
    // SVG 는 intrinsic 크기를 가지므로 컨테이너가 넓으면 좌측으로 치우친다.
    // 중앙 정렬로 "주어진 공간 안 중앙" 이라는 자연스러운 배치를 유지한다.
    stageWrap.style.display = 'flex';
    stageWrap.style.justifyContent = 'center';

    const viewLeft = hasTailLog ? VIEWBOX_TAIL_LEFT : VIEWBOX_BASE_LEFT;
    const viewPadX = hasTailLog ? VIEWBOX_TAIL_PAD_X : VIEWBOX_BASE_PAD_X;
    const viewPadTop = hasScoreboard ? VIEWBOX_SCOREBOARD_PAD_TOP : VIEWBOX_BASE_PAD_TOP;
    const vbX = viewLeft - viewPadX;
    const vbY = -viewPadTop;
    const vbW = VIEWBOX_RIGHT - viewLeft + viewPadX * 2;
    const vbH = 51 + viewPadTop + VIEWBOX_PAD_BOTTOM;
    // SVG 를 intrinsic 크기 (viewBox 의 user unit 을 px 로 해석) 로 선언하고
    // max-width:100% 로 컨테이너 초과 시에만 축소한다. 컨테이너가 넓어도 자동으로
    // 늘어나지 않으므로, BFS 등 조연 패널에서 파이프가 전체 행을 삼키지 않는다.
    // 넉넉한 공간을 주고 싶은 소비측은 wrapper 에 max-width 를 직접 관리한다.
    const stageSvg = svg('svg', {
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
      preserveAspectRatio: 'xMidYMid meet',
      width: vbW,
      height: vbH,
    });
    stageSvg.classList.add('facet-cq-svg');
    stageSvg.style.display = 'block';
    stageSvg.style.maxWidth = '100%';
    stageSvg.style.height = 'auto';
    stageWrap.appendChild(stageSvg);

    // 1. 캡 back (3D 상단 장식) — 블록 z-order 뒤에 둔다.
    const capBack = svg('g', { class: 'facet-cq-cap-back' });
    const outTop = svg('path', {
      d: `M${OUT_CAP_BACK_LEFT} ${OUT_CAP_BACK_TOP}L${OUT_CAP_FRONT_LEFT} ${PIPE_FRONT_TOP}H${OUT_CAP_FRONT_RIGHT}L${OUT_CAP_FRONT_LEFT} ${OUT_CAP_BACK_TOP}L${OUT_CAP_BACK_LEFT} ${OUT_CAP_BACK_TOP}Z`,
      fill: CQ_TOKENS.outTop,
    });
    const inTop = svg('path', {
      d: `M${IN_CAP_FRONT_RIGHT} ${PIPE_FRONT_TOP}L${IN_CAP_BACK_FAR} ${OUT_CAP_BACK_TOP}L${IN_CAP_BACK_LEFT} ${OUT_CAP_BACK_TOP}L${IN_CAP_FRONT_LEFT} ${PIPE_FRONT_TOP}H${IN_CAP_FRONT_RIGHT}Z`,
      fill: CQ_TOKENS.inTop,
    });
    capBack.appendChild(outTop);
    capBack.appendChild(inTop);
    stageSvg.appendChild(capBack);

    // 2. 꼬리 로그 (OUT 캡 왼쪽 바깥 영역)
    const tailGroup = svg('g', { class: 'facet-cq-tail' });
    stageSvg.appendChild(tailGroup);

    // 3. 트랙 (블록 컨테이너)
    const track = svg('g', { class: 'facet-cq-track' });
    track.setAttribute('transform', 'translate(0, 0)');
    stageSvg.appendChild(track);

    // 4. 캡 front (블록 위에 그려 수평 진입/이탈을 클리핑)
    const capFront = svg('g', { class: 'facet-cq-cap-front' });
    const outFront = svg('path', {
      d: `M${OUT_CAP_FRONT_LEFT} ${PIPE_FRONT_TOP}V${PIPE_FRONT_BOTTOM}H${OUT_CAP_FRONT_RIGHT}V${PIPE_FRONT_TOP}Z`,
      fill: CQ_TOKENS.outFront,
    });
    outFront.classList.add('facet-cq-cap-out');
    const inFront = svg('path', {
      d: `M${IN_CAP_FRONT_RIGHT} ${PIPE_FRONT_BOTTOM}V${PIPE_FRONT_TOP}H${IN_CAP_FRONT_LEFT}V${PIPE_FRONT_BOTTOM}Z`,
      fill: CQ_TOKENS.inFront,
    });
    inFront.classList.add('facet-cq-cap-in');
    capFront.appendChild(outFront);
    capFront.appendChild(inFront);
    stageSvg.appendChild(capFront);

    // 5. 파이프 외곽 stroke — 전체 위에 그려 경계 강조.
    // 안정적 렌더를 위해 여러 subpath 를 한 path 에 욱여넣지 않고 논리 단위로 분리.
    const outlineAttrs = {
      stroke: CQ_TOKENS.pipeStroke,
      'stroke-width': 0.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      fill: 'none',
    } as const;
    const backBottomY = PIPE_FRONT_BOTTOM - (PIPE_FRONT_TOP - OUT_CAP_BACK_TOP);

    // (a) 파이프 앞면 + 뒷면 상단 긴 라인.
    stageSvg.appendChild(
      svg('path', {
        ...outlineAttrs,
        d: `M${OUT_CAP_FRONT_RIGHT} ${PIPE_FRONT_TOP}H${IN_CAP_FRONT_LEFT}V${PIPE_FRONT_BOTTOM}H${OUT_CAP_FRONT_RIGHT}Z`,
      }),
    );
    stageSvg.appendChild(
      svg('path', {
        ...outlineAttrs,
        d: `M${OUT_CAP_FRONT_LEFT} ${OUT_CAP_BACK_TOP}H${IN_CAP_BACK_LEFT}`,
      }),
    );
    // (b) OUT 캡 외곽.
    stageSvg.appendChild(
      svg('path', {
        ...outlineAttrs,
        d: [
          `M${OUT_CAP_FRONT_LEFT} ${PIPE_FRONT_TOP}V${PIPE_FRONT_BOTTOM}H${OUT_CAP_FRONT_RIGHT}`,
          `M${OUT_CAP_FRONT_LEFT} ${PIPE_FRONT_TOP}H${OUT_CAP_FRONT_RIGHT}`,
          `M${OUT_CAP_FRONT_LEFT} ${PIPE_FRONT_TOP}L${OUT_CAP_BACK_LEFT} ${OUT_CAP_BACK_TOP}H${OUT_CAP_FRONT_LEFT}`,
          `M${OUT_CAP_FRONT_LEFT} ${OUT_CAP_BACK_TOP}L${OUT_CAP_FRONT_RIGHT} ${PIPE_FRONT_TOP}`,
          `M${OUT_CAP_FRONT_LEFT} ${PIPE_FRONT_BOTTOM}L${OUT_CAP_BACK_LEFT} ${backBottomY}V${OUT_CAP_BACK_TOP}`,
        ].join(' '),
      }),
    );
    // (c) IN 캡 외곽.
    stageSvg.appendChild(
      svg('path', {
        ...outlineAttrs,
        d: [
          `M${IN_CAP_FRONT_LEFT} ${PIPE_FRONT_TOP}V${PIPE_FRONT_BOTTOM}H${IN_CAP_FRONT_RIGHT}V${PIPE_FRONT_TOP}H${IN_CAP_FRONT_LEFT}`,
          `M${IN_CAP_FRONT_RIGHT} ${PIPE_FRONT_TOP}L${IN_CAP_BACK_FAR} ${OUT_CAP_BACK_TOP}H${IN_CAP_BACK_LEFT}L${IN_CAP_FRONT_LEFT} ${PIPE_FRONT_TOP}`,
        ].join(' '),
      }),
    );

    // 6. 캡 텍스트 (OUT / IN) — 세로 방향으로 회전 (왼쪽으로 90°).
    const outCx = (OUT_CAP_FRONT_LEFT + OUT_CAP_FRONT_RIGHT) / 2;
    const inCx = (IN_CAP_FRONT_LEFT + IN_CAP_FRONT_RIGHT) / 2;
    const capCy = PIPE_FRONT_TOP + (PIPE_FRONT_BOTTOM - PIPE_FRONT_TOP) / 2;
    const outText = svg('text', {
      x: outCx,
      y: capCy,
      fill: CQ_TOKENS.capText,
      'font-family': fonts.body,
      'font-size': '8',
      'font-weight': '700',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'letter-spacing': '0.5',
      transform: `rotate(-90 ${outCx} ${capCy})`,
    });
    outText.textContent = labels.out;
    const inText = svg('text', {
      x: inCx,
      y: capCy,
      fill: CQ_TOKENS.capText,
      'font-family': fonts.body,
      'font-size': '8',
      'font-weight': '700',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'letter-spacing': '0.5',
      transform: `rotate(-90 ${inCx} ${capCy})`,
    });
    inText.textContent = labels.in;
    stageSvg.appendChild(outText);
    stageSvg.appendChild(inText);

    // ──────────────────────────────────────────────────────
    // 전광판 (scoreboard) — OUT 캡 / IN 캡 위에 떠 있는 LED 표기판.
    // ──────────────────────────────────────────────────────
    function buildScoreboard(side: ScoreboardSide): {
      group: SVGGElement;
      text: SVGTextElement;
    } {
      // 캡 중앙 기준 + SCOREBOARD_X_OFFSET 만큼 우측으로 shift.
      const cx = (side === 'out' ? outCx : inCx) + SCOREBOARD_X_OFFSET;
      const x = cx - SCOREBOARD_W / 2;

      const group = svg('g', {
        class: `facet-cq-scoreboard facet-cq-scoreboard-${side}`,
      });

      // 전광판 ↓ 캡 상단 레벨로 수직 낙하하는 연결선 (2x 연장).
      const connector = svg('line', {
        x1: cx,
        y1: SCOREBOARD_BOTTOM_Y,
        x2: cx,
        y2: OUT_CAP_BACK_TOP,
        stroke: CQ_TOKENS.scoreboardConnector,
        'stroke-width': 0.6,
        'stroke-linecap': 'round',
      });

      // 배경 패널.
      const bg = svg('rect', {
        x,
        y: SCOREBOARD_Y,
        width: SCOREBOARD_W,
        height: SCOREBOARD_H,
        rx: 2,
        ry: 2,
        fill: CQ_TOKENS.scoreboardBg,
        stroke: CQ_TOKENS.scoreboardBorder,
        'stroke-width': 0.4,
      });

      // LED 텍스트 — idle 시 은유적 "·", on 시 연산명.
      const text = svg('text', {
        x: x + SCOREBOARD_W / 2,
        y: SCOREBOARD_Y + SCOREBOARD_H / 2,
        fill: CQ_TOKENS.scoreboardIdleText,
        'font-family': fonts.mono,
        'font-size': '5',
        'font-weight': '700',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'letter-spacing': '0.3',
      });
      text.textContent = '·';

      group.appendChild(connector);
      group.appendChild(bg);
      group.appendChild(text);
      return { group, text };
    }

    type ScoreboardHandle = { group: SVGGElement; text: SVGTextElement };
    let outScoreboard: ScoreboardHandle | null = null;
    let inScoreboard: ScoreboardHandle | null = null;
    if (hasScoreboard) {
      outScoreboard = buildScoreboard('out');
      inScoreboard = buildScoreboard('in');
      stageSvg.appendChild(outScoreboard.group);
      stageSvg.appendChild(inScoreboard.group);
    }

    function setScoreboard(
      side: ScoreboardSide,
      op: ScoreboardOp | null,
      arg?: string,
    ): void {
      const sb = side === 'out' ? outScoreboard : inScoreboard;
      if (!sb) return;
      if (op === null) {
        sb.text.textContent = '·';
        sb.text.setAttribute('fill', CQ_TOKENS.scoreboardIdleText);
        sb.group.classList.remove('facet-cq-scoreboard-on', 'facet-cq-scoreboard-error');
        return;
      }
      sb.text.textContent = formatScoreboardLabel(op, arg);
      sb.text.setAttribute('fill', SCOREBOARD_OP_COLORS[op]);
      sb.group.classList.add('facet-cq-scoreboard-on');
      if (op === 'overflow' || op === 'underflow') {
        sb.group.classList.add('facet-cq-scoreboard-error');
      } else {
        sb.group.classList.remove('facet-cq-scoreboard-error');
      }
    }

    function scoreboardTiming(duration: number): { pre: number; post: number } {
      return {
        pre: Math.max(SCOREBOARD_PRE_MIN, Math.round(duration * SCOREBOARD_PRE_RATIO)),
        post: Math.max(SCOREBOARD_POST_MIN, Math.round(duration * SCOREBOARD_POST_RATIO)),
      };
    }

    // 빈 상태 힌트 (파이프 중앙 오버레이)
    const emptyHint = svg('text', {
      x: (PIPE_BODY_LEFT + PIPE_BODY_RIGHT) / 2,
      y: PIPE_FRONT_TOP + (PIPE_FRONT_BOTTOM - PIPE_FRONT_TOP) / 2 + 3.5,
      fill: colors.textMuted,
      'font-family': fonts.body,
      'font-size': '10',
      'text-anchor': 'middle',
    });
    emptyHint.textContent = labels.empty;
    stageSvg.appendChild(emptyHint);

    root.appendChild(stageWrap);
    container.appendChild(root);

    // ──────────────────────────────────────────────────────
    // 상태
    // ──────────────────────────────────────────────────────
    const blocks: Block[] = [];
    const tailBlocks: SVGGElement[] = []; // index 0 = 가장 최근 (가장 오른쪽)
    let totalEnqueued = 0;
    let currentCapacity: number | null = initialCapacity;

    function syncEmpty(): void {
      emptyHint.style.display = blocks.length === 0 ? '' : 'none';
    }

    function renderCounters(): void {
      totalEl.textContent = `${labels.totalEnqueued}: ${totalEnqueued}`;
      if (hasBounded && currentCapacity !== null) {
        sizeEl.textContent = `${labels.size}: ${blocks.length} / ${currentCapacity}`;
      } else {
        sizeEl.textContent = `${labels.size}: ${blocks.length}`;
      }
    }

    function applyAge(block: Block): void {
      if (!hasAging) return;
      const sat = Math.max(0.35, 1 - block.age * 0.08);
      const bright = Math.max(0.75, 1 - block.age * 0.02);
      block.group.style.filter = `saturate(${sat}) brightness(${bright})`;
    }

    function ageOthers(): void {
      if (!hasAging) return;
      for (const b of blocks) {
        b.age += 1;
        applyAge(b);
      }
    }

    /**
     * 블록 SVG 그룹을 생성. 큐브 도형은 `cube-block` 프리미티브에 위임하고,
     * conveyor-queue 는 파이프 슬롯 안쪽 좌표계 (x=0 기준, y=BLOCK_Y) 로
     * 한 번만 update 해 넘긴다. 이후 transform translate 로만 움직인다.
     */
    function buildBlockGroup(stamp: number, label: string, tint: string): CubeBlockHandle {
      const cube = createCubeBlock({
        classPrefix: 'facet-cq-block',
        labelFontSize: 11,
        stampFontSize: 6,
        fontFamily: fonts.body,
      });
      cube.update(
        {
          x: 0,
          y: BLOCK_Y,
          w: blockFrontW,
          h: BLOCK_H,
          depth: { dx: DEPTH_DX, dy: DEPTH_DY },
        },
        { label, stamp },
        {
          front: tint,
          left: CQ_TOKENS.blockLeft,
          top: CQ_TOKENS.blockTop,
          label: CQ_TOKENS.blockLabel,
          stamp: CQ_TOKENS.blockStamp,
        },
      );
      return cube;
    }

    // ──────────────────────────────────────────────────────
    // 공개 메서드
    // ──────────────────────────────────────────────────────
    async function enqueue(
      item: ConveyorQueueItem,
      opts?: { duration?: number },
    ): Promise<void> {
      const duration = Math.max(40, opts?.duration ?? 220);
      const { pre, post } = scoreboardTiming(duration);
      const tint = item.tint ?? CQ_TOKENS.blockFront;
      totalEnqueued += 1;
      ageOthers();

      const cube = buildBlockGroup(item.stamp, item.label, tint);
      const group = cube.group;
      const rearIndex = blocks.length; // push 후 위치
      group.setAttribute('transform', `translate(${ENQUEUE_START_X}, 0)`);
      group.style.opacity = '0';
      // 새 블록은 DOM 맨 앞에 삽입 → SVG 렌더 순서상 가장 아래 레이어.
      // 결과적으로 "먼저 들어간 블록이 위(앞)" 가 되어 카발리에 투영에서
      // front(오래된) 블록이 rear(최신) 블록 앞에 보이게 된다.
      track.insertBefore(group, track.firstChild);
      const block: Block = {
        group,
        stamp: item.stamp,
        label: item.label,
        tint,
        age: 0,
      };
      blocks.push(block);
      applyAge(block);
      syncEmpty();
      renderCounters();

      // 전광판 사전 점등 (명령 예고) → 애니메이션 → 사후 소등.
      setScoreboard('in', 'push', item.label);
      await waitMs(pre);

      await new Promise<void>((res) => requestAnimationFrame(() => res()));
      group.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.7, 0.3, 1), opacity ${Math.round(
        duration * 0.6,
      )}ms ease-out`;
      group.setAttribute('transform', `translate(${slotX(rearIndex)}, 0)`);
      group.style.opacity = '1';
      flashElement(inFront, 'facet-cq-cap-flash-in', duration);
      await waitMs(duration);
      group.style.transition = '';

      await waitMs(post);
      setScoreboard('in', null);
    }

    async function dequeue(opts?: { duration?: number }): Promise<void> {
      const duration = Math.max(40, opts?.duration ?? 260);
      if (blocks.length === 0) return;
      const { pre, post } = scoreboardTiming(duration);
      ageOthers();

      setScoreboard('out', 'pop');
      await waitMs(pre);

      track.style.transition = `transform ${duration}ms cubic-bezier(0.3, 0.7, 0.3, 1)`;
      track.setAttribute('transform', `translate(${-slotPitch}, 0)`);
      flashElement(outFront, 'facet-cq-cap-flash-out', duration);
      await waitMs(duration);

      // front 분리 → 꼬리 로그로 이동 or 제거.
      const front = blocks.shift();
      track.style.transition = '';
      track.setAttribute('transform', 'translate(0, 0)');

      // 남은 블록을 새 인덱스 위치로 재배치 (track 리셋과 동일 프레임 → 시각 무변).
      for (let i = 0; i < blocks.length; i++) {
        blocks[i].group.style.transition = '';
        blocks[i].group.setAttribute('transform', `translate(${slotX(i)}, 0)`);
      }

      if (front) {
        if (hasTailLog && maxTailEntries > 0) {
          moveToTail(front.group);
        } else {
          front.group.remove();
        }
      }
      syncEmpty();
      renderCounters();

      await waitMs(post);
      setScoreboard('out', null);
    }

    function moveToTail(g: SVGGElement): void {
      // 기존 tail 블록을 한 칸씩 좌측으로 민다. 최대치 초과 시 가장 오래된 블록 제거.
      if (tailBlocks.length >= maxTailEntries) {
        const oldest = tailBlocks.pop();
        oldest?.remove();
      }
      g.style.transition = '';
      g.style.filter = 'grayscale(100%)';
      g.style.opacity = '0.45';
      tailBlocks.unshift(g);
      tailGroup.appendChild(g);
      applyTailLayout();
    }

    function applyTailLayout(): void {
      // slot[0] (가장 최근) 은 OUT 캡 바로 왼쪽에 붙는다.
      const ramp = [0.5, 0.3, 0.12, 0.06];
      tailBlocks.forEach((g, i) => {
        const x = OUT_CAP_BACK_LEFT - (i + 1) * TAIL_SLOT_PITCH;
        g.setAttribute('transform', `translate(${x}, 0)`);
        g.style.opacity = String(ramp[Math.min(i, ramp.length - 1)] ?? 0.06);
      });
    }

    async function pulseFront(opts?: { duration?: number }): Promise<void> {
      const duration = Math.max(60, opts?.duration ?? 220);
      const front = blocks[0];
      if (!front) return;
      const { pre, post } = scoreboardTiming(duration);
      setScoreboard('out', 'peek', front.label);
      await waitMs(pre);
      const half = Math.round(duration / 2);
      const cx = slotX(0) + blockFrontW / 2;
      const cy = BLOCK_Y + BLOCK_H / 2;
      front.group.style.transformOrigin = `${cx}px ${cy}px`;
      front.group.style.transition = `transform ${half}ms ease-out`;
      // pulse 는 scale 를 덧씌운 별도 inline 속성으로. 블록 좌표는 SVG transform 속성으로
      // 고정하고, CSS transform 으로 스케일만 얹어 경로 분리.
      front.group.style.transform = 'scale(1.15)';
      await waitMs(half);
      front.group.style.transform = 'scale(1)';
      await waitMs(half);
      front.group.style.transform = 'scale(1.12)';
      await waitMs(half);
      front.group.style.transform = 'scale(1)';
      await waitMs(half);
      front.group.style.transition = '';
      front.group.style.transform = '';
      await waitMs(post);
      setScoreboard('out', null);
    }

    async function signalOverflow(opts?: { duration?: number }): Promise<void> {
      const duration = Math.max(120, opts?.duration ?? 360);
      const { pre, post } = scoreboardTiming(duration);
      setScoreboard('in', 'overflow');
      await waitMs(pre);
      flashElement(inFront, 'facet-cq-cap-flash-error', duration);
      flashElement(inFront, 'facet-cq-cap-shake', duration);
      await waitMs(duration);
      await waitMs(post);
      setScoreboard('in', null);
    }

    async function signalUnderflow(opts?: { duration?: number }): Promise<void> {
      const duration = Math.max(120, opts?.duration ?? 360);
      const { pre, post } = scoreboardTiming(duration);
      setScoreboard('out', 'underflow');
      await waitMs(pre);
      flashElement(outFront, 'facet-cq-cap-flash-error', duration);
      flashElement(outFront, 'facet-cq-cap-shake', duration);
      await waitMs(duration);
      await waitMs(post);
      setScoreboard('out', null);
    }

    function setTotalEnqueued(n: number): void {
      totalEnqueued = n;
      renderCounters();
    }

    function setSize(n: number, capacity?: number | null): void {
      if (capacity !== undefined) currentCapacity = capacity;
      renderCounters();
      if (n !== blocks.length) {
        if (hasBounded && currentCapacity !== null) {
          sizeEl.textContent = `${labels.size}: ${n} / ${currentCapacity}`;
        } else {
          sizeEl.textContent = `${labels.size}: ${n}`;
        }
      }
    }

    function reset(): void {
      blocks.length = 0;
      tailBlocks.length = 0;
      totalEnqueued = 0;
      currentCapacity = initialCapacity;
      track.textContent = '';
      track.setAttribute('transform', 'translate(0, 0)');
      tailGroup.textContent = '';
      setScoreboard('in', null);
      setScoreboard('out', null);
      syncEmpty();
      renderCounters();
    }

    syncEmpty();
    renderCounters();

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      enqueue,
      dequeue,
      pulseFront,
      signalOverflow,
      signalUnderflow,
      setTotalEnqueued,
      setSize,
      reset,
      get size() {
        return blocks.length;
      },
    };
  },
};

// ──────────────────────────────────────────────────────
// 스타일 시트 — 캡 섬광 / shake keyframes
// ──────────────────────────────────────────────────────
let styleInjected = false;
function ensureStyleSheet(): void {
  if (styleInjected) return;
  if (typeof document === 'undefined') return;
  styleInjected = true;
  const css = `
@keyframes facet-cq-cap-flash-in {
  0%   { filter: brightness(1); }
  40%  { filter: brightness(1.35) drop-shadow(0 0 4px var(--facet-cq-inTop)); }
  100% { filter: brightness(1); }
}
@keyframes facet-cq-cap-flash-out {
  0%   { filter: brightness(1); }
  40%  { filter: brightness(1.35) drop-shadow(0 0 4px var(--facet-cq-outTop)); }
  100% { filter: brightness(1); }
}
@keyframes facet-cq-cap-flash-error {
  0%   { fill: var(--facet-cq-errorCapFront); filter: drop-shadow(0 0 0 var(--facet-cq-errorGlow0)); }
  40%  { fill: var(--facet-cq-errorCapFront); filter: drop-shadow(0 0 6px var(--facet-cq-errorGlow)); }
  100% { filter: drop-shadow(0 0 0 var(--facet-cq-errorGlow0)); }
}
@keyframes facet-cq-cap-shake {
  0%, 100% { transform: translateX(0); }
  20%  { transform: translateX(-1.2px); }
  40%  { transform: translateX(1.2px); }
  60%  { transform: translateX(-0.8px); }
  80%  { transform: translateX(0.8px); }
}
.facet-cq-cap-flash-in  { animation: facet-cq-cap-flash-in 240ms ease-out; }
.facet-cq-cap-flash-out { animation: facet-cq-cap-flash-out 240ms ease-out; }
.facet-cq-cap-flash-error { animation: facet-cq-cap-flash-error 360ms ease-out; }
.facet-cq-cap-shake { animation: facet-cq-cap-shake 360ms ease-in-out; transform-box: fill-box; transform-origin: center; }

/* 전광판 — idle 은 어두운 점(·), on 이 붙으면 본문 텍스트가 미세하게 숨쉬게. */
@keyframes facet-cq-scoreboard-pulse {
  0%, 100% { opacity: 0.88; }
  50%      { opacity: 1.0; }
}
@keyframes facet-cq-scoreboard-blink {
  0%, 100% { opacity: 1.0; }
  50%      { opacity: 0.45; }
}
.facet-cq-scoreboard text { transition: fill 80ms linear; }
.facet-cq-scoreboard-on text { animation: facet-cq-scoreboard-pulse 900ms ease-in-out infinite; }
.facet-cq-scoreboard-error text { animation: facet-cq-scoreboard-blink 280ms ease-in-out infinite; }
`;
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-facet-cq', '1');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}
