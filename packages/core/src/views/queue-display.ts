/**
 * queue-display — FIFO 큐 시각화.
 *
 * 내부적으로 cube-block SVG 프리미티브를 소비해 납작한 3D 큐브 미학을
 * 채택한다 (conveyor-queue 와 동일 프리미티브 · 다른 조립). BFS 류의 frontier
 * 패널이 공유하는 기본 큐 비주얼.
 *
 * 외부 API 는 이전 HTML 구현과 동일 — soft-drop-in:
 *   - enqueue(value) : value 가 { label, tint?, tag? } 면 label/tint/tag 사용.
 *                      문자열/숫자/그 외는 String(v) 를 label 로 사용.
 *   - dequeue()      : 맨 앞 제거 후 반환.
 *   - reset()
 *   - size           : getter
 *
 * config: { type: 'queue-display', label? }
 *
 * tint 옵션은 큐브 front 색을 덮어쓴다. left/top 은 tint 의 HSL 명도 +12 / +24
 * shift 로 자동 파생 — 어떤 tint 가 들어와도 3면 음영이 자연스럽게 유지된다.
 *
 * 색 정체성:
 *   - design-tokens 는 흑백 + 악센트 체계라 큐브 3면 shading 이 직접 표현되지
 *     않는다. conveyor-queue 와 동일하게 view-local palette 을 둔다 (S-view 예외
 *     범위: 3D 입체 shading).
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, fonts, fontSizes, radii, space } from './design-tokens.js';
import { resolveLocale, type LocaleStr } from '../types/locale.js';
import { createCubeBlock, type CubeBlockHandle } from './cube-block.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type QueueDisplayItem =
  | string
  | number
  | { label: string; tint?: string; tag?: string };

type StyledItem = { label: string; tint?: string; tag?: string };

function isStyledItem(v: unknown): v is StyledItem {
  return (
    typeof v === 'object' &&
    v !== null &&
    'label' in v &&
    typeof (v as { label: unknown }).label === 'string'
  );
}

function toStyled(v: unknown): StyledItem {
  if (isStyledItem(v)) return v;
  return { label: String(v) };
}

const QUEUE_LABELS_BY_LOCALE: Record<string, { empty: string; head: string; tail: string }> = {
  en: { empty: '(empty)', head: 'head →', tail: '← tail' },
  ko: { empty: '(비어 있음)', head: '맨앞 →', tail: '← 맨뒤' },
};

function pickQueueLabels(locale: string | undefined) {
  if (locale && QUEUE_LABELS_BY_LOCALE[locale]) return QUEUE_LABELS_BY_LOCALE[locale];
  return QUEUE_LABELS_BY_LOCALE.en;
}

// View-local 3D cube palette. S-view 예외 (3D shading).
const QD_TOKENS = {
  blockFront: '#00BED7',
  blockLeft: '#16D6EF',
  blockTop: '#76EFFF',
  blockLabel: '#ffffff',
  blockStamp: '#444444',
} as const;

const BLOCK_W = 38;
const BLOCK_H = 30;
const BLOCK_GAP = 6;
const DEPTH_DX = -8;
const DEPTH_DY = -6;
const PAD_X = 10;
const PAD_TOP = -DEPTH_DY + 4; // depth 가 위로 뻗으니 상단 패딩 확보
const PAD_BOTTOM = 4;

// hex → HSL shade. Lightness 를 delta (0~100) 만큼 가산해 새 hex 반환.
function shadeHex(hex: string, deltaL: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const { h, s, l } = rgbToHsl(r, g, b);
  const l2 = Math.max(0, Math.min(100, l + deltaL));
  const { r: r2, g: g2, b: b2 } = hslToRgb(h, s, l2);
  return (
    '#' +
    [r2, g2, b2]
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join('')
  );
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh >= 0 && hh < 1) { r = c; g = x; }
  else if (hh < 2) { r = x; g = c; }
  else if (hh < 3) { g = c; b = x; }
  else if (hh < 4) { g = x; b = c; }
  else if (hh < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = ln - c / 2;
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function cubeColorsFor(tint: string | undefined) {
  const front = tint ?? QD_TOKENS.blockFront;
  const left = tint ? shadeHex(tint, 12) : QD_TOKENS.blockLeft;
  const top = tint ? shadeHex(tint, 24) : QD_TOKENS.blockTop;
  return {
    front,
    left,
    top,
    label: QD_TOKENS.blockLabel,
    stamp: QD_TOKENS.blockStamp,
  };
}

export const queueDisplayView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const cfg = params.config as { label?: LocaleStr };
    const labels = pickQueueLabels(params.locale);
    const userLabel = resolveLocale(cfg.label, params.locale);

    const root = document.createElement('div');
    root.className = 'facet-queue-display';
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = space.xs;

    if (userLabel) {
      const lbl = document.createElement('div');
      lbl.style.fontSize = fontSizes.xs;
      lbl.style.color = colors.textMuted;
      lbl.textContent = userLabel;
      root.appendChild(lbl);
    }

    // head/tail 안내 + 빈 상태 텍스트를 담는 레이블 행 (SVG 바깥 유지 —
    // DOM textContent 테스트 계약 + 접근성 측면에서 HTML text 가 낫다).
    const guide = document.createElement('div');
    guide.style.display = 'flex';
    guide.style.alignItems = 'center';
    guide.style.justifyContent = 'space-between';
    guide.style.fontSize = fontSizes.xs;
    guide.style.color = colors.textMuted;
    guide.style.minHeight = space.lg;
    const headLbl = document.createElement('span');
    headLbl.textContent = labels.head;
    const tailLbl = document.createElement('span');
    tailLbl.textContent = labels.tail;
    const emptyLbl = document.createElement('span');
    emptyLbl.textContent = labels.empty;
    emptyLbl.style.fontSize = fontSizes.sm;
    emptyLbl.style.color = colors.textMuted;
    guide.appendChild(headLbl);
    guide.appendChild(emptyLbl);
    guide.appendChild(tailLbl);
    root.appendChild(guide);

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'facet-queue-display__track');
    // BFS 의 조연 패널로 쓰이려면 컨테이너 가로폭을 삼키지 않아야 한다.
    // viewBox 와 동일 치수를 width/height 에 intrinsic size 로 부여해 큐브
    // 절대 크기를 유지하고, 큐 길이에 따라 가로로만 늘어나게 한다.
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    root.appendChild(svg);

    container.appendChild(root);

    type Entry = { raw: unknown; item: StyledItem; cube: CubeBlockHandle };
    const entries: Entry[] = [];

    function updateViewBox() {
      const n = entries.length;
      const trackW = Math.max(1, n) * BLOCK_W + Math.max(0, n - 1) * BLOCK_GAP;
      const w = trackW + PAD_X * 2;
      const h = BLOCK_H + PAD_TOP + PAD_BOTTOM;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      // intrinsic size — CSS 로 stretch 시키지 않는다 (위 주석 참조).
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
    }

    function layout() {
      // 좌(head) → 우(tail). 인덱스 0 이 맨 앞.
      entries.forEach((e, i) => {
        const x = PAD_X + i * (BLOCK_W + BLOCK_GAP);
        const y = PAD_TOP;
        e.cube.update(
          { x, y, w: BLOCK_W, h: BLOCK_H, depth: { dx: DEPTH_DX, dy: DEPTH_DY } },
          { label: e.item.label },
          cubeColorsFor(e.item.tint),
        );
      });
      updateViewBox();
      emptyLbl.style.visibility = entries.length === 0 ? 'visible' : 'hidden';
    }

    function enqueue(value: QueueDisplayItem | unknown): void {
      const item = toStyled(value);
      const cube = createCubeBlock({
        classPrefix: 'facet-qd-block',
        labelFontSize: 11,
        stampFontSize: 6,
        fontFamily: fonts.body,
      });
      if (item.tag !== undefined) cube.group.dataset.tag = item.tag;
      svg.appendChild(cube.group);
      entries.push({ raw: value, item, cube });
      layout();
    }

    function dequeue(): unknown {
      const e = entries.shift();
      if (!e) {
        layout();
        return undefined;
      }
      e.cube.group.remove();
      layout();
      // 기존 계약: items.shift() 의미 — enqueue 에 넣은 원본 value 를 그대로 반환.
      return e.raw;
    }

    function reset(): void {
      for (const e of entries) e.cube.group.remove();
      entries.length = 0;
      layout();
    }

    layout();

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      enqueue,
      dequeue,
      reset,
      get size() {
        return entries.length;
      },
    };
  },
};
