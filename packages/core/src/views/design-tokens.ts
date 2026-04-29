/**
 * 디자인 시스템 토큰 — 모든 View 가 공유. 색·폰트·간격의 단일출처.
 *
 * ── 통일안 (v3, 2026-04) ───────────────────────────────────────────────
 * - 흑백 정체성 폐기. 알고리즘 상태는 의미별 색 분화가 우선.
 * - facet 영역 (`facets/**`) 색 hex/rgba 리터럴 0건. Projector 는 view
 *   메서드 호출만 하고 색은 view 가 여기서 받는다.
 * - 새 토큰은 이 파일에 추가 → `runtime/index.ts` 에서 re-export → 외부는
 *   `@facet/core/runtime` 으로만 import.
 *
 * ── 카테고리 어휘 (Palette + 함수형 + 별도 const) ───────────────────────
 *   structural   bg / bgSubtle / border / text / textMuted / textInverse
 *   emphasis     accent (노랑 단일 강조), primary / primaryHover
 *   state        itemDefault / Comparing(주황) / Swapping(빨강) /
 *                Sorted(회·흰) / Pivot(노랑=accent) / Active(주황)
 *   severity     danger(빨강) / success
 *   region       sortedTailBg/Border, subtreeShadeLeft/Right
 *   special      risingMarker / auxCursor / ghostOutline
 *   iso-body     isoBodyMain / isoBodySide  ← 막대 본체 (상태 무관)
 *   함수형        categorical(n, tone) / depthVeil(depth, theme) /
 *                shiftLightness(hex, ±deltaL)
 *   ledTokens    LED 메타포 const (테마 무관). 전광판 / 캡 라벨 /
 *                stamp / 파이프 stroke 등 LED·라벨로 읽혀야 하는 자리.
 *
 * ── 색 선택 결정 순서 (위에서 아래로 가장 먼저 매치) ─────────────────────
 *   1. 알고리즘 상태?           → state (어휘 추가는 PR 분리)
 *   2. 오류/긍정 신호?          → severity
 *   3. n 개 카테고리 식별?      → categorical(n, tone) + 인덱스 named export
 *                                 (큐형은 CATEGORICAL_QUEUE_BLOCK/IN/OUT)
 *   4. 깊이 인지?               → depthVeil(depth, theme)
 *   5. 한 main 색의 밝기 단계?  → shiftLightness(main, ±deltaL)
 *   6. isometric 본체?          → iso-body
 *   7. LED·라벨 메타포?         → ledTokens
 *   8. 영역 tint / 단일 의미?    → region / special
 *   9. 그 외                    → structural
 *
 * ── 테마 정책 ──────────────────────────────────────────────────────────
 * Palette 는 light/dark 양쪽 정의. View 는 mount 시점에
 * `getColors(params.theme)` 로 캡쳐해 사용. 비-색상 토큰
 * (radii/space/fonts/fontSizes) 과 ledTokens 는 테마 무관 단일 정의.
 *
 * 자세한 규칙은 `rules/specifics/S-view.md` "색 토큰 결정 트리" 절.
 */

import { oklchToHex } from './oklch.js';

export { shiftLightness } from './oklch.js';

export type Theme = 'light' | 'dark';

export type Palette = {
  bg: string;
  bgSubtle: string;
  border: string;
  text: string;
  textMuted: string;
  textInverse: string;

  primary: string;
  primaryHover: string;
  accent: string;
  danger: string;
  success: string;

  itemDefault: string;
  itemComparing: string;
  itemSwapping: string;
  itemSorted: string;
  itemPivot: string;
  itemActive: string;

  /** rising-marker: 패스 동안 "떠오르는 값"을 표시하는 강조색 */
  risingMarker: string;
  /** sorted-tail: 정렬된 꼬리 영역 배경 tint */
  sortedTailBg: string;
  /** sorted-tail: 정렬 영역 경계선 색 */
  sortedTailBorder: string;

  /**
   * 정렬형 이진 트리 (BST 등) 에서 좌 서브트리 영역 배경 tint.
   * 기획상 "좌소우대 색지" 의 좌측 반 — 옅은 중성 tint 로 영역만 분리한다.
   */
  subtreeShadeLeft: string;
  /** 좌소우대 색지의 우측 반 — 옅은 강조(accent) tint */
  subtreeShadeRight: string;
  /** 보조 커서 (후계자 서브루틴 등) 외곽 링 색 — 주 커서 accent 와 대비 */
  auxCursor: string;
  /** 유령 probe (miss 시 빈 자식 자리) 의 점선 외곽 색 */
  ghostOutline: string;

  /**
   * isometric 막대 본체의 주면(top/left) 색. 상태 무관 고정 — 상태는 cap 으로
   * 표현하므로 본체는 정보 hierarchy 를 깨지 않게 옅은 중성 (light=흰, dark=bg) 유지.
   */
  isoBodyMain: string;
  /**
   * isometric 막대 본체의 측면(right) 색. accent 의 옅은 tint (light=#fff9e5)
   * 또는 알파 흰 (dark) 으로 입체감만 부여한다.
   */
  isoBodySide: string;
};

// 구조(structural) 는 중성(흑/백/회) 으로 정보 hierarchy 를 잡고, 알고리즘
// 상태(state) 는 의미별로 색을 분화한다: 비교=주황, 교환=빨강, 정렬됨=회색/흰,
// 매칭/pivot=노랑(accent), 활성=주황. severity: danger=빨강, success=텍스트색.
// categorical 식별 색은 `categorical()` 함수형 토큰으로 OKLCH 등간격 hue 자동 생성.
export const lightColors: Palette = {
  bg: '#ffffff',
  bgSubtle: '#fafafa',
  border: '#e5e5e5',
  text: '#171717',
  textMuted: '#737373',
  textInverse: '#ffffff',

  primary: '#171717',
  primaryHover: '#000000',
  accent: '#facc15',
  danger: '#dc2626',
  success: '#171717',

  itemDefault: '#ffffff',
  itemComparing: '#ed7055',
  itemSwapping: '#e63946',
  itemSorted: '#444444',
  itemPivot: '#facc15',
  itemActive: '#ed7055',

  risingMarker: '#171717',
  sortedTailBg: 'rgba(23, 23, 23, 0.03)',
  sortedTailBorder: '#171717',

  subtreeShadeLeft: 'rgba(23, 23, 23, 0.04)',
  subtreeShadeRight: 'rgba(250, 204, 21, 0.10)',
  auxCursor: '#737373',
  ghostOutline: '#a3a3a3',

  isoBodyMain: '#ffffff',
  isoBodySide: '#fff9e5',
};

export const darkColors: Palette = {
  bg: '#0a0a0a',
  bgSubtle: '#171717',
  border: '#262626',
  text: '#fafafa',
  textMuted: '#a3a3a3',
  textInverse: '#0a0a0a',

  primary: '#fafafa',
  primaryHover: '#ffffff',
  accent: '#facc15',
  danger: '#dc2626',
  success: '#fafafa',

  itemDefault: '#0a0a0a',
  itemComparing: '#ed7055',
  itemSwapping: '#e63946',
  itemSorted: '#fafafa',
  itemPivot: '#facc15',
  itemActive: '#ed7055',

  risingMarker: '#fafafa',
  sortedTailBg: 'rgba(250, 250, 250, 0.04)',
  sortedTailBorder: '#fafafa',

  subtreeShadeLeft: 'rgba(250, 250, 250, 0.04)',
  subtreeShadeRight: 'rgba(250, 204, 21, 0.12)',
  auxCursor: '#a3a3a3',
  ghostOutline: '#737373',

  isoBodyMain: '#0a0a0a',
  isoBodySide: 'rgba(255, 255, 255, 0.10)',
};

export function getColors(theme: Theme | undefined): Palette {
  return theme === 'dark' ? darkColors : lightColors;
}

/**
 * @deprecated module-level 참조용 backward-compat alias. 신규 코드는
 * mount() 안에서 `getColors(params.theme)` 를 호출해 팔레트를 받아 사용할 것.
 */
export const colors = lightColors;

/**
 * LED 메타포 전용 색 토큰 (테마 무관 고정).
 *
 * 전광판/캡 라벨/블록 stamp/파이프 외곽선처럼 "LED·라벨 메타포" 로 읽혀야
 * 하는 시각 요소는 light/dark 양쪽 같은 색으로 고정해 메타포 일관성을 유지한다.
 * (Palette 에 두면 테마별 분기 의무가 생기므로 별도 const 로 분리.)
 *
 * 사용처: conveyor-queue (전광판 + 블록 라벨 + 파이프 stroke).
 * 다른 LED-스타일 view 가 생기면 같은 토큰을 공유한다.
 */
export const ledTokens = {
  /** 전광판 배경 — 가장 어두운 단계. */
  bg: '#171717',
  /** 전광판 외곽선 — bg 보다 약간 밝은 단계. */
  border: '#2a2a2a',
  /** idle (전원만 켜짐) 의 어두운 점 색. */
  idleText: '#2f2f2f',
  /** on (명령 점등) 의 밝은 LED 색. */
  onText: '#e5e5e5',
  /** 전광판 ↔ 캡 사이 연결선. */
  connector: '#525252',
  /** 캡/블록 라벨 글리프 (흰 글자). */
  glyph: '#ffffff',
  /** 블록 stamp (입장 순번) 의 회색 글자. */
  stamp: '#444444',
  /** 파이프 외곽 stroke (검정 윤곽). */
  stroke: '#000000',
} as const;

export const radii = {
  sm: '3px',
  md: '6px',
  lg: '10px',
} as const;

export const space = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
} as const;

export const fonts = {
  body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, monospace',
} as const;

export const fontSizes = {
  xs: '11px',
  sm: '12px',
  md: '14px',
  lg: '16px',
  xl: '20px',
} as const;

/**
 * Categorical 색 톤. n 개 카테고리를 식별하는 색을 OKLCH 등간격 hue 로 자동 생성.
 *  - vivid: 채도 높은 중간 명도 (가장 일반적, stack 박스 stamp 같은 정체성 색)
 *  - deep:  어두운 채도 (다크 배경 강조 카테고리)
 *  - pastel: 부드러운 고명도 (영역 tint, 배경성 카테고리)
 */
export type CategoricalTone = 'vivid' | 'deep' | 'pastel';

const TONE_PARAMS: Record<CategoricalTone, { l: number; c: number }> = {
  vivid: { l: 0.7, c: 0.18 },
  deep: { l: 0.5, c: 0.16 },
  pastel: { l: 0.88, c: 0.06 },
};

/** 첫 색의 hue. 따뜻한 오렌지 부근 — stack/queue 의 시작점과 정합. */
const CATEGORICAL_START_HUE = 50;

const categoricalCache = new Map<string, readonly string[]>();

/**
 * count 개의 categorical 식별 색을 반환.
 * hue 는 startHue 부터 360°/count 등간격으로 분할 — 같은 (count, tone) 이면
 * 항상 같은 시퀀스 (메모이즈). count <= 0 은 빈 배열. count <= 12 권장.
 */
export function categorical(
  count: number,
  tone: CategoricalTone = 'vivid',
): readonly string[] {
  if (count <= 0) return [];
  const key = `${tone}:${count}`;
  const cached = categoricalCache.get(key);
  if (cached !== undefined) return cached;

  const { l, c } = TONE_PARAMS[tone];
  const step = 360 / count;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const h = (CATEGORICAL_START_HUE + step * i) % 360;
    out.push(oklchToHex({ l, c, h }));
  }
  const frozen = Object.freeze(out) as readonly string[];
  categoricalCache.set(key, frozen);
  return frozen;
}

/**
 * `categorical(6, 'vivid')` 시드 안에서 큐형 view 가 합의한 의미별 인덱스.
 * conveyor-queue 가 block / IN cap / OUT cap 색을 같은 시드에서 뽑아 쓴다 —
 * 동일 hue 를 다른 큐형 view (예: priority-queue) 가 재현할 수 있도록 단일출처화.
 */
export const CATEGORICAL_QUEUE_BLOCK = 2;
export const CATEGORICAL_QUEUE_IN = 4;
export const CATEGORICAL_QUEUE_OUT = 5;

/**
 * 깊이 인지를 위한 명도 변조. depth 가 클수록 alpha 가 단조 증가.
 * fill 은 테마에 따라 어두운/밝은 overlay (light=검정, dark=흰).
 *
 * depth 가 시퀀스 길이를 넘으면 마지막 값을 클램프.
 */
const DEPTH_VEIL_ALPHA: readonly number[] = [
  0, 0.2, 0.4, 0.55, 0.65, 0.72, 0.78, 0.82,
];

export function depthVeil(
  depth: number,
  theme: Theme | undefined,
): { alpha: number; fill: string } {
  const idx = Math.max(
    0,
    Math.min(DEPTH_VEIL_ALPHA.length - 1, Math.floor(depth)),
  );
  const alpha = DEPTH_VEIL_ALPHA[idx]!;
  const fill = theme === 'dark' ? '#ffffff' : '#000000';
  return { alpha, fill };
}
