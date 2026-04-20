/**
 * 디자인 시스템 토큰 — 모든 뷰가 공유.
 */

export const colors = {
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
