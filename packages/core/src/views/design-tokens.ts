/**
 * 디자인 시스템 토큰 — 모든 View 가 공유.
 *
 * 색상은 두 테마(light/dark) 팔레트로 분리. 각 View 는 mount 시점에
 * `getColors(params.theme)` 로 현재 팔레트를 캡쳐해 사용한다.
 * 비-색상 토큰(radii/space/fonts/fontSizes) 은 테마 무관 단일 정의.
 */

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
};

// 흑백 + 노란 악센트 (호스트 서비스 Ceres 108 톤과 동기화).
// 기본 시각 언어는 near-black 채움과 light-gray 보더. 사용자의 시선이
// 향해야 할 순간(비교/교환/pivot) 에만 노란색(#facc15 = "108" 배지 톤) 을 쓴다.
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
  danger: '#171717',
  success: '#171717',

  itemDefault: '#ffffff',
  itemComparing: '#facc15',
  itemSwapping: '#facc15',
  itemSorted: '#171717',
  itemPivot: '#facc15',
  itemActive: '#171717',

  risingMarker: '#171717',
  sortedTailBg: 'rgba(23, 23, 23, 0.03)',
  sortedTailBorder: '#171717',
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
  danger: '#fafafa',
  success: '#fafafa',

  itemDefault: '#0a0a0a',
  itemComparing: '#facc15',
  itemSwapping: '#facc15',
  itemSorted: '#fafafa',
  itemPivot: '#facc15',
  itemActive: '#fafafa',

  risingMarker: '#fafafa',
  sortedTailBg: 'rgba(250, 250, 250, 0.04)',
  sortedTailBorder: '#fafafa',
};

export function getColors(theme: Theme | undefined): Palette {
  return theme === 'dark' ? darkColors : lightColors;
}

/**
 * @deprecated module-level 참조용 backward-compat alias. 신규 코드는
 * mount() 안에서 `getColors(params.theme)` 를 호출해 팔레트를 받아 사용할 것.
 */
export const colors = lightColors;

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
