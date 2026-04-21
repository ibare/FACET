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
 *     features?: ConveyorQueueFeature[],     // 기본 ['aging-gradient', 'tail-log']
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

export type ConveyorQueueFeature = 'bounded' | 'aging-gradient' | 'tail-log';

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

const VIEWBOX_LEFT = -90;
const VIEWBOX_RIGHT = 254;
// viewBox 여유 — 파이프 상하좌우에 시각적 숨 쉴 공간.
const VIEWBOX_PAD_X = 8;
const VIEWBOX_PAD_Y = 20;

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
 * 이 표현되지 않으므로 이 view 에만 한정된 상수로 둔다 (S-view 예외 범위
 * 내 — 섬광/shading 용도). keyframes 가 interpolate 해야 하는 rgba 는 CSS
 * 변수로 root 에 주입한다.
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
} as const;

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
  front: SVGRectElement;
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
      cfg.features ?? ['aging-gradient', 'tail-log'],
    );
    const hasAging = features.has('aging-gradient');
    const hasTailLog = features.has('tail-log');
    const hasBounded = features.has('bounded');
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

    const vbX = VIEWBOX_LEFT - VIEWBOX_PAD_X;
    const vbY = -VIEWBOX_PAD_Y;
    const vbW = VIEWBOX_RIGHT - VIEWBOX_LEFT + VIEWBOX_PAD_X * 2;
    const vbH = 51 + VIEWBOX_PAD_Y * 2;
    const stageSvg = svg('svg', {
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
      preserveAspectRatio: 'xMidYMid meet',
      width: '100%',
    });
    stageSvg.classList.add('facet-cq-svg');
    stageSvg.style.display = 'block';
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

    function buildBlockGroup(stamp: number, label: string, tint: string): {
      group: SVGGElement;
      front: SVGRectElement;
    } {
      const group = svg('g', { class: 'facet-cq-block' });
      const xL = 0;
      const yT = BLOCK_Y;
      const w = blockFrontW;
      const h = BLOCK_H;

      // 좌측 면 (3D 깊이)
      const leftFace = svg('path', {
        d: `M${xL} ${yT}L${xL + DEPTH_DX} ${yT + DEPTH_DY}V${yT + h + DEPTH_DY}L${xL} ${yT + h}Z`,
        fill: CQ_TOKENS.blockLeft,
      });
      // 상단 면 (3D 깊이)
      const topFace = svg('path', {
        d: `M${xL} ${yT}L${xL + DEPTH_DX} ${yT + DEPTH_DY}H${xL + w + DEPTH_DX}L${xL + w} ${yT}Z`,
        fill: CQ_TOKENS.blockTop,
      });
      // 정면
      const frontFace = svg('rect', {
        x: xL,
        y: yT,
        width: w,
        height: h,
        fill: tint,
      });
      // 스탬프 (#N) — 상단 작은 글씨
      const stampText = svg('text', {
        x: xL + w / 2,
        y: yT + h * 0.32,
        fill: CQ_TOKENS.blockStamp,
        'font-family': fonts.body,
        'font-size': '6',
        'font-weight': '600',
        'text-anchor': 'middle',
      });
      stampText.textContent = `#${stamp}`;
      // 라벨 — 하단 큰 글씨
      const labelText = svg('text', {
        x: xL + w / 2,
        y: yT + h * 0.78,
        fill: CQ_TOKENS.blockLabel,
        'font-family': fonts.body,
        'font-size': '11',
        'font-weight': '700',
        'text-anchor': 'middle',
      });
      labelText.textContent = label;

      group.appendChild(leftFace);
      group.appendChild(topFace);
      group.appendChild(frontFace);
      group.appendChild(stampText);
      group.appendChild(labelText);
      return { group, front: frontFace };
    }

    // ──────────────────────────────────────────────────────
    // 공개 메서드
    // ──────────────────────────────────────────────────────
    async function enqueue(
      item: ConveyorQueueItem,
      opts?: { duration?: number },
    ): Promise<void> {
      const duration = Math.max(40, opts?.duration ?? 220);
      const tint = item.tint ?? CQ_TOKENS.blockFront;
      totalEnqueued += 1;
      ageOthers();

      const { group, front } = buildBlockGroup(item.stamp, item.label, tint);
      const rearIndex = blocks.length; // push 후 위치
      group.setAttribute('transform', `translate(${ENQUEUE_START_X}, 0)`);
      group.style.opacity = '0';
      // 새 블록은 DOM 맨 앞에 삽입 → SVG 렌더 순서상 가장 아래 레이어.
      // 결과적으로 "먼저 들어간 블록이 위(앞)" 가 되어 카발리에 투영에서
      // front(오래된) 블록이 rear(최신) 블록 앞에 보이게 된다.
      track.insertBefore(group, track.firstChild);
      const block: Block = {
        group,
        front,
        stamp: item.stamp,
        label: item.label,
        tint,
        age: 0,
      };
      blocks.push(block);
      applyAge(block);
      syncEmpty();
      renderCounters();

      await new Promise<void>((res) => requestAnimationFrame(() => res()));
      group.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.7, 0.3, 1), opacity ${Math.round(
        duration * 0.6,
      )}ms ease-out`;
      group.setAttribute('transform', `translate(${slotX(rearIndex)}, 0)`);
      group.style.opacity = '1';
      flashElement(inFront, 'facet-cq-cap-flash-in', duration);
      await waitMs(duration);
      group.style.transition = '';
    }

    async function dequeue(opts?: { duration?: number }): Promise<void> {
      const duration = Math.max(40, opts?.duration ?? 260);
      if (blocks.length === 0) return;
      ageOthers();

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
    }

    async function signalOverflow(opts?: { duration?: number }): Promise<void> {
      const duration = Math.max(120, opts?.duration ?? 360);
      flashElement(inFront, 'facet-cq-cap-flash-error', duration);
      flashElement(inFront, 'facet-cq-cap-shake', duration);
      await waitMs(duration);
    }

    async function signalUnderflow(opts?: { duration?: number }): Promise<void> {
      const duration = Math.max(120, opts?.duration ?? 360);
      flashElement(outFront, 'facet-cq-cap-flash-error', duration);
      flashElement(outFront, 'facet-cq-cap-shake', duration);
      await waitMs(duration);
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
`;
  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-facet-cq', '1');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}
