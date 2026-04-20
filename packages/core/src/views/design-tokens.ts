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
};

export const lightColors: Palette = {
  bg: '#ffffff',
  bgSubtle: '#f7f8fb',
  border: '#e1e4ec',
  text: '#1f2330',
  textMuted: '#6b6f80',
  textInverse: '#ffffff',

  primary: '#3a5cc7',
  primaryHover: '#2e4ba5',
  accent: '#f1c232',
  danger: '#c84a3a',
  success: '#3aaa6a',

  itemDefault: '#8fa0c4',
  itemComparing: '#f1c232',
  itemSwapping: '#e06666',
  itemSorted: '#6aa84f',
  itemPivot: '#9b59b6',
  itemActive: '#3a5cc7',
};

export const darkColors: Palette = {
  bg: '#16181f',
  bgSubtle: '#1d1f27',
  border: 'rgba(255, 255, 255, 0.10)',
  text: '#e7e9f0',
  textMuted: '#9aa0b5',
  textInverse: '#0b0d12',

  primary: '#7c8ee6',
  primaryHover: '#94a3ee',
  accent: '#f5cf3f',
  danger: '#ec7464',
  success: '#66c486',

  itemDefault: '#5b6b8c',
  itemComparing: '#f5cf3f',
  itemSwapping: '#ec7464',
  itemSorted: '#66c486',
  itemPivot: '#b06fc7',
  itemActive: '#6b8be0',
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
