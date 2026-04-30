/**
 * matrix-transform-stage — 2D 행렬 변환 facet 의 단일 SVG view.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 셀과 화살표의 1:1 색 동기 — 첫째 열 셀 a·c (i-hat 청록), 둘째 열 셀 b·d (j-hat 주황).
 *   2. 두 겹 격자 — 옅은 항등 점선 21줄 + 진한 변환 실선 21줄.
 *   3. 표준 4종 + 자유 프리셋 토글 — [회전][스케일][전단][반사][자유].
 *   4. |det| 게이지 — 양방향 막대, 부호 색 전환, 0 사건성.
 *   5. 보조 점의 동기 운동 — (u, v) 라벨 불변 + 위치 라벨 갱신.
 *
 * 입력은 params.dispatch 로 algorithm 에 송신:
 *   - cell { name, value }                — 행렬 셀 직접 입력
 *   - drag-tip { which, x, y }            — 화살표 끝 드래그
 *   - preset { mode }                     — 프리셋 모드 토글
 *   - preset-param { kind, value }        — 보조 슬라이더
 *   - point-drag { id, u, v }             — 보조 점 드래그
 *
 * 식별자 (C1) 명시: `cell:` `arrow:` `grid:` `parallelogram:` `gauge:` `point:` `preset:`.
 */

import type { View, ViewMountParams, ViewInstance } from '@facet/core';
import { getColors, categorical, fontSizes, type Palette } from '@facet/core/runtime';

// ── 좌표·치수 상수 ───────────────────────────────────────────────────────────
const W = 720;
const H = 480;

const PLANE_X = 20;
const PLANE_Y = 50;
const PLANE_SIZE = 360;
const PLANE_CX = PLANE_X + PLANE_SIZE / 2;
const PLANE_CY = PLANE_Y + PLANE_SIZE / 2;

const PANEL_X = 400;
const PANEL_Y = 50;
const PANEL_W = 300;
const PANEL_H = 380;

const NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

// ── 타입 ─────────────────────────────────────────────────────────────────────
type Matrix2x2 = { a: number; b: number; c: number; d: number };
type PresetMode = 'free' | 'rotate' | 'scale' | 'shear' | 'reflect';
type ReflectAxis = 'x' | 'y' | 'origin';
type PresetParams = { theta: number; s: number; t: number; k: number; axis: ReflectAxis };
type HelperPoint = { id: number; u: number; v: number };

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElementNS(HTML_NS, tag) as unknown as HTMLElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, v);
  }
  return node;
}

function det(m: Matrix2x2): number {
  return m.a * m.d - m.b * m.c;
}

function fmt(v: number, digits = 2): string {
  if (Math.abs(v) < 1e-9) return '0' + (digits > 0 ? '.' + '0'.repeat(digits) : '');
  return v.toFixed(digits);
}

/** 평면 좌표 (u, v) → SVG 좌표 (x, y). 1 단위 = 60px. */
function planeToSvg(u: number, v: number): { x: number; y: number } {
  return { x: PLANE_CX + u * 60, y: PLANE_CY - v * 60 };
}

/** SVG 좌표 → 평면 좌표 (u, v). */
function svgToPlane(x: number, y: number): { u: number; v: number } {
  return { u: (x - PLANE_CX) / 60, v: (PLANE_CY - y) / 60 };
}

// ── view ────────────────────────────────────────────────────────────────────
export const matrixTransformStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const colors: Palette = getColors(params.theme);
    const cat = categorical(8, 'vivid');
    const catPastel = categorical(8, 'pastel');

    // 색 토큰 매핑 (디자인 토큰 헤더 §3 결정 트리).
    const COLOR_I_HAT = cat[1];           // i-hat 청록
    const COLOR_J_HAT = cat[5];           // j-hat 주황
    const COLOR_I_HAT_BG = catPastel[1];
    const COLOR_J_HAT_BG = catPastel[5];
    const COLOR_PARALLEL_POS = cat[3];    // 양수 det — 보라
    const COLOR_PARALLEL_NEG = cat[1];    // 음수 det — 청록
    const COLOR_POINT = cat[3];           // 보조 점 보라
    const COLOR_GAUGE_POS = cat[1];
    const COLOR_GAUGE_NEG = cat[5];
    const COLOR_DANGER = colors.danger;   // 원점 표지

    // ── 루트 SVG ────────────────────────────────────────────────────────────
    const svg = el('svg', {
      viewBox: `0 0 ${W} ${H}`,
      width: '100%',
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': '2D 행렬 변환 시각화',
    });
    svg.style.maxWidth = `${W}px`;
    svg.style.display = 'block';
    container.appendChild(svg);

    // ── defs ────────────────────────────────────────────────────────────────
    const defs = el('defs');
    // 평면 클리퍼.
    const clipPlane = el('clipPath', { id: 'mt-plane-clip' });
    clipPlane.appendChild(
      el('rect', {
        x: PLANE_X,
        y: PLANE_Y,
        width: PLANE_SIZE,
        height: PLANE_SIZE,
      }),
    );
    defs.appendChild(clipPlane);
    // 음수 det 빗금 패턴.
    const stripeNeg = el('pattern', {
      id: 'mt-neg-stripes',
      patternUnits: 'userSpaceOnUse',
      width: 8,
      height: 8,
      patternTransform: 'rotate(-45)',
    });
    stripeNeg.appendChild(
      el('rect', { width: 8, height: 8, fill: COLOR_PARALLEL_NEG, 'fill-opacity': 0.2 }),
    );
    stripeNeg.appendChild(
      el('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: COLOR_PARALLEL_NEG, 'stroke-width': 2 }),
    );
    defs.appendChild(stripeNeg);
    svg.appendChild(defs);

    // ── 캡션 (상단) ─────────────────────────────────────────────────────────
    const captionText = el('text', {
      x: W / 2,
      y: 26,
      'text-anchor': 'middle',
      'font-size': fontSizes.md,
      'font-weight': '600',
      fill: colors.text,
    });
    captionText.textContent = '평면을 평면으로 보내는 선형 사상 — 두 기저의 도착지가 곧 두 열';
    svg.appendChild(captionText);

    const eventCaption = el('text', {
      x: W / 2,
      y: 44,
      'text-anchor': 'middle',
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    eventCaption.textContent = '';
    svg.appendChild(eventCaption);

    // ── 평면 영역 ───────────────────────────────────────────────────────────
    const planeBg = el('rect', {
      x: PLANE_X,
      y: PLANE_Y,
      width: PLANE_SIZE,
      height: PLANE_SIZE,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
      rx: 4,
    });
    svg.appendChild(planeBg);

    // 평면 좌상단 모드 표지.
    const modeLabel = el('text', {
      x: PLANE_X + 8,
      y: PLANE_Y + 14,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    modeLabel.textContent = '자유 모드';
    svg.appendChild(modeLabel);

    // 격자 그룹 (clip 적용).
    const planeGroup = el('g', {
      'clip-path': 'url(#mt-plane-clip)',
    });
    svg.appendChild(planeGroup);

    // 항등 격자 (옅은 점선 — 변환과 무관, mount 시 한 번만 그림).
    const identityGrid = el('g', { id: 'grid:identity' });
    for (let i = -3; i <= 3; i++) {
      const { x: x1 } = planeToSvg(i, -3);
      const { y: y1 } = planeToSvg(i, -3);
      const { x: x2 } = planeToSvg(i, 3);
      const { y: y2 } = planeToSvg(i, 3);
      identityGrid.appendChild(
        el('line', {
          x1,
          y1,
          x2,
          y2,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '2 3',
          'stroke-opacity': 0.6,
        }),
      );
      const { x: x3 } = planeToSvg(-3, i);
      const { y: y3 } = planeToSvg(-3, i);
      const { x: x4 } = planeToSvg(3, i);
      const { y: y4 } = planeToSvg(3, i);
      identityGrid.appendChild(
        el('line', {
          x1: x3,
          y1: y3,
          x2: x4,
          y2: y4,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '2 3',
          'stroke-opacity': 0.6,
        }),
      );
    }
    planeGroup.appendChild(identityGrid);

    // 변환 격자 (실선 — applyMatrix 마다 재배치).
    const transformedGrid = el('g', { id: 'grid:transformed' });
    const transformedLines: SVGLineElement[] = [];
    for (let i = 0; i < 14; i++) {
      const ln = el('line', {
        stroke: colors.text,
        'stroke-width': 1.2,
        'stroke-opacity': 0.7,
      });
      transformedLines.push(ln);
      transformedGrid.appendChild(ln);
    }
    planeGroup.appendChild(transformedGrid);

    // 단위 평행사변형.
    const parallelogram = el('polygon', {
      id: 'parallelogram:unit',
      fill: COLOR_PARALLEL_POS,
      'fill-opacity': 0.22,
      stroke: COLOR_PARALLEL_POS,
      'stroke-width': 1.5,
      'stroke-opacity': 0.75,
    });
    planeGroup.appendChild(parallelogram);

    const parallelogramLabel = el('text', {
      'font-size': fontSizes.xs,
      fill: colors.text,
      'text-anchor': 'middle',
    });
    parallelogramLabel.textContent = '면적 = 1.00';
    planeGroup.appendChild(parallelogramLabel);

    // i-hat / j-hat 화살표 — line + 끝 원 (드래그 핸들).
    const iLine = el('line', {
      stroke: COLOR_I_HAT,
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
    });
    planeGroup.appendChild(iLine);
    const jLine = el('line', {
      stroke: COLOR_J_HAT,
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
    });
    planeGroup.appendChild(jLine);

    // 화살촉 (작은 삼각형).
    const iHead = el('polygon', { fill: COLOR_I_HAT });
    planeGroup.appendChild(iHead);
    const jHead = el('polygon', { fill: COLOR_J_HAT });
    planeGroup.appendChild(jHead);

    // 끝점 드래그 핸들.
    const iTip = el('circle', {
      r: 6,
      fill: COLOR_I_HAT,
      stroke: colors.bg,
      'stroke-width': 2,
      cursor: 'grab',
    });
    iTip.setAttribute('data-tip', 'i');
    svg.appendChild(iTip);
    const jTip = el('circle', {
      r: 6,
      fill: COLOR_J_HAT,
      stroke: colors.bg,
      'stroke-width': 2,
      cursor: 'grab',
    });
    jTip.setAttribute('data-tip', 'j');
    svg.appendChild(jTip);

    // 원점 표지.
    const originDot = el('circle', {
      cx: PLANE_CX,
      cy: PLANE_CY,
      r: 3.5,
      fill: COLOR_DANGER,
    });
    svg.appendChild(originDot);

    // 보조 점 그룹.
    const pointsGroup = el('g');
    svg.appendChild(pointsGroup);

    // ── 우측 패널 (foreignObject + HTML) ────────────────────────────────────
    const panelFO = el('foreignObject', {
      x: PANEL_X,
      y: PANEL_Y,
      width: PANEL_W,
      height: PANEL_H,
    });
    svg.appendChild(panelFO);

    const panelDiv = html('div');
    panelDiv.style.fontFamily = 'system-ui, sans-serif';
    panelDiv.style.fontSize = `${fontSizes.sm}px`;
    panelDiv.style.color = colors.text;
    panelDiv.style.display = 'flex';
    panelDiv.style.flexDirection = 'column';
    panelDiv.style.gap = '12px';
    panelDiv.style.height = '100%';
    panelDiv.style.boxSizing = 'border-box';
    panelDiv.style.padding = '6px 4px';
    panelFO.appendChild(panelDiv);

    // — 셀 패널 —
    const cellPanelTitle = html('div');
    cellPanelTitle.style.fontSize = `${fontSizes.xs}px`;
    cellPanelTitle.style.color = colors.textMuted;
    cellPanelTitle.textContent = '행렬 셀 — 한 칸 = 한 좌표';
    panelDiv.appendChild(cellPanelTitle);

    const cellGrid = html('div');
    cellGrid.style.display = 'grid';
    cellGrid.style.gridTemplateColumns = '1fr 1fr';
    cellGrid.style.gap = '6px';
    panelDiv.appendChild(cellGrid);

    function makeCellInput(
      name: 'a' | 'b' | 'c' | 'd',
      sublabel: string,
      bg: string,
      border: string,
    ): HTMLInputElement {
      const wrap = html('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.gap = '2px';
      const lab = html('div');
      lab.style.fontSize = `${fontSizes.xs}px`;
      lab.style.color = colors.textMuted;
      lab.textContent = sublabel;
      wrap.appendChild(lab);
      const input = html('input');
      input.setAttribute('type', 'number');
      input.setAttribute('step', '0.05');
      input.setAttribute('data-cell', name);
      input.style.width = '100%';
      input.style.padding = '4px 6px';
      input.style.background = bg;
      input.style.border = `1.5px solid ${border}`;
      input.style.borderRadius = '4px';
      input.style.color = colors.text;
      input.style.fontFamily = 'ui-monospace, monospace';
      input.style.fontSize = `${fontSizes.sm}px`;
      input.style.boxSizing = 'border-box';
      wrap.appendChild(input);
      cellGrid.appendChild(wrap);
      return input;
    }

    const cellA = makeCellInput('a', 'a (i-hat.x)', COLOR_I_HAT_BG, COLOR_I_HAT);
    const cellB = makeCellInput('b', 'b (j-hat.x)', COLOR_J_HAT_BG, COLOR_J_HAT);
    const cellC = makeCellInput('c', 'c (i-hat.y)', COLOR_I_HAT_BG, COLOR_I_HAT);
    const cellD = makeCellInput('d', 'd (j-hat.y)', COLOR_J_HAT_BG, COLOR_J_HAT);

    function setCellValue(input: HTMLInputElement, v: number): void {
      if (document.activeElement === input) return;
      input.value = fmt(v, 2);
    }

    function attachCellInput(input: HTMLInputElement, name: 'a' | 'b' | 'c' | 'd'): void {
      input.addEventListener('input', () => {
        const v = Number(input.value);
        if (Number.isFinite(v)) {
          params.dispatch?.({ type: 'cell', payload: { name, value: v } });
        }
      });
    }
    attachCellInput(cellA, 'a');
    attachCellInput(cellB, 'b');
    attachCellInput(cellC, 'c');
    attachCellInput(cellD, 'd');

    // — 프리셋 토글 패널 —
    const presetTitle = html('div');
    presetTitle.style.fontSize = `${fontSizes.xs}px`;
    presetTitle.style.color = colors.textMuted;
    presetTitle.textContent = '프리셋 — 셀 패턴의 학습';
    panelDiv.appendChild(presetTitle);

    const presetRow = html('div');
    presetRow.style.display = 'grid';
    presetRow.style.gridTemplateColumns = 'repeat(5, 1fr)';
    presetRow.style.gap = '4px';
    panelDiv.appendChild(presetRow);

    const presetButtons: Record<PresetMode, HTMLButtonElement> = {} as Record<
      PresetMode,
      HTMLButtonElement
    >;
    const presetLabels: Record<PresetMode, string> = {
      rotate: '회전',
      scale: '스케일',
      shear: '전단',
      reflect: '반사',
      free: '자유',
    };
    (['rotate', 'scale', 'shear', 'reflect', 'free'] as PresetMode[]).forEach((mode) => {
      const btn = html('button');
      btn.textContent = presetLabels[mode];
      btn.style.padding = '4px 0';
      btn.style.fontSize = `${fontSizes.xs}px`;
      btn.style.border = `1px solid ${colors.border}`;
      btn.style.background = colors.bgSubtle;
      btn.style.color = colors.text;
      btn.style.borderRadius = '4px';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', () => {
        params.dispatch?.({ type: 'preset', payload: { mode } });
      });
      presetRow.appendChild(btn);
      presetButtons[mode] = btn;
    });

    // 보조 슬라이더 영역.
    const subSliderWrap = html('div');
    subSliderWrap.style.display = 'flex';
    subSliderWrap.style.flexDirection = 'column';
    subSliderWrap.style.gap = '6px';
    subSliderWrap.style.minHeight = '54px';
    panelDiv.appendChild(subSliderWrap);

    function makeRange(
      label: string,
      min: number,
      max: number,
      step: number,
      value: number,
      onInput: (v: number) => void,
    ): { wrap: HTMLDivElement; input: HTMLInputElement; valueLabel: HTMLSpanElement } {
      const wrap = html('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.gap = '2px';
      const top = html('div');
      top.style.display = 'flex';
      top.style.justifyContent = 'space-between';
      top.style.fontSize = `${fontSizes.xs}px`;
      top.style.color = colors.textMuted;
      const labEl = html('span');
      labEl.textContent = label;
      const valEl = html('span');
      valEl.textContent = fmt(value, 2);
      valEl.style.fontFamily = 'ui-monospace, monospace';
      top.appendChild(labEl);
      top.appendChild(valEl);
      wrap.appendChild(top);
      const range = html('input');
      range.setAttribute('type', 'range');
      range.setAttribute('min', String(min));
      range.setAttribute('max', String(max));
      range.setAttribute('step', String(step));
      range.setAttribute('value', String(value));
      range.style.width = '100%';
      range.addEventListener('input', () => {
        const v = Number(range.value);
        valEl.textContent = fmt(v, 2);
        onInput(v);
      });
      wrap.appendChild(range);
      return { wrap: wrap as HTMLDivElement, input: range, valueLabel: valEl };
    }

    function rebuildSubSlider(mode: PresetMode, p: PresetParams): void {
      while (subSliderWrap.firstChild) subSliderWrap.removeChild(subSliderWrap.firstChild);
      if (mode === 'rotate') {
        const { wrap } = makeRange('θ (rad)', -Math.PI, Math.PI, 0.05, p.theta, (v) =>
          params.dispatch?.({ type: 'preset-param', payload: { kind: 'theta', value: v } }),
        );
        subSliderWrap.appendChild(wrap);
      } else if (mode === 'scale') {
        const { wrap: w1 } = makeRange('s (가로)', -2, 2, 0.05, p.s, (v) =>
          params.dispatch?.({ type: 'preset-param', payload: { kind: 's', value: v } }),
        );
        const { wrap: w2 } = makeRange('t (세로)', -2, 2, 0.05, p.t, (v) =>
          params.dispatch?.({ type: 'preset-param', payload: { kind: 't', value: v } }),
        );
        subSliderWrap.appendChild(w1);
        subSliderWrap.appendChild(w2);
      } else if (mode === 'shear') {
        const { wrap } = makeRange('k (가로 전단)', -2, 2, 0.05, p.k, (v) =>
          params.dispatch?.({ type: 'preset-param', payload: { kind: 'k', value: v } }),
        );
        subSliderWrap.appendChild(wrap);
      } else if (mode === 'reflect') {
        const row = html('div');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = 'repeat(3, 1fr)';
        row.style.gap = '4px';
        (['x', 'y', 'origin'] as ReflectAxis[]).forEach((axis) => {
          const btn = html('button');
          btn.textContent = axis === 'x' ? 'x축' : axis === 'y' ? 'y축' : '원점';
          btn.style.padding = '4px 0';
          btn.style.fontSize = `${fontSizes.xs}px`;
          btn.style.border = `1px solid ${p.axis === axis ? colors.text : colors.border}`;
          btn.style.background = p.axis === axis ? colors.bgSubtle : colors.bg;
          btn.style.color = colors.text;
          btn.style.borderRadius = '4px';
          btn.style.cursor = 'pointer';
          btn.addEventListener('click', () => {
            params.dispatch?.({ type: 'preset-param', payload: { kind: 'axis', value: axis } });
          });
          row.appendChild(btn);
        });
        subSliderWrap.appendChild(row);
      } else {
        const hint = html('div');
        hint.style.fontSize = `${fontSizes.xs}px`;
        hint.style.color = colors.textMuted;
        hint.textContent = '자유 모드 — 셀을 직접 입력하거나 화살표 끝을 드래그하라.';
        subSliderWrap.appendChild(hint);
      }
    }

    function highlightPreset(active: PresetMode): void {
      (Object.keys(presetButtons) as PresetMode[]).forEach((m) => {
        const btn = presetButtons[m];
        const on = m === active;
        btn.style.background = on ? colors.text : colors.bgSubtle;
        btn.style.color = on ? colors.bg : colors.text;
        btn.style.borderColor = on ? colors.text : colors.border;
      });
    }

    // — |det| 게이지 —
    const gaugeTitle = html('div');
    gaugeTitle.style.fontSize = `${fontSizes.xs}px`;
    gaugeTitle.style.color = colors.textMuted;
    gaugeTitle.textContent = '|det| 게이지 — 면적과 부호';
    panelDiv.appendChild(gaugeTitle);

    const gaugeWrap = html('div');
    gaugeWrap.style.display = 'flex';
    gaugeWrap.style.flexDirection = 'column';
    gaugeWrap.style.gap = '4px';
    panelDiv.appendChild(gaugeWrap);

    const gaugeBar = html('div');
    gaugeBar.style.position = 'relative';
    gaugeBar.style.height = '12px';
    gaugeBar.style.background = colors.bgSubtle;
    gaugeBar.style.border = `1px solid ${colors.border}`;
    gaugeBar.style.borderRadius = '6px';
    gaugeBar.style.overflow = 'hidden';
    gaugeWrap.appendChild(gaugeBar);

    const gaugeFill = html('div');
    gaugeFill.style.position = 'absolute';
    gaugeFill.style.top = '0';
    gaugeFill.style.bottom = '0';
    gaugeFill.style.background = COLOR_GAUGE_POS;
    gaugeFill.style.transition = 'background 200ms ease, left 180ms ease, width 180ms ease';
    gaugeBar.appendChild(gaugeFill);

    const gaugeCenter = html('div');
    gaugeCenter.style.position = 'absolute';
    gaugeCenter.style.left = '50%';
    gaugeCenter.style.top = '0';
    gaugeCenter.style.bottom = '0';
    gaugeCenter.style.width = '1px';
    gaugeCenter.style.background = colors.text;
    gaugeCenter.style.opacity = '0.4';
    gaugeBar.appendChild(gaugeCenter);

    const gaugeLabel = html('div');
    gaugeLabel.style.fontFamily = 'ui-monospace, monospace';
    gaugeLabel.style.fontSize = `${fontSizes.xs}px`;
    gaugeLabel.style.textAlign = 'right';
    gaugeLabel.textContent = 'det = +1.00';
    gaugeWrap.appendChild(gaugeLabel);

    function paintGauge(d: number): void {
      const max = 4;
      const ratio = Math.max(-1, Math.min(1, d / max));
      const halfPct = 50; // 막대 중심 기준 ±50%.
      let leftPct: number;
      let widthPct: number;
      if (Math.abs(ratio) < 1e-6) {
        leftPct = 50;
        widthPct = 0;
      } else if (ratio > 0) {
        leftPct = 50;
        widthPct = halfPct * ratio;
      } else {
        widthPct = halfPct * -ratio;
        leftPct = 50 - widthPct;
      }
      gaugeFill.style.left = `${leftPct}%`;
      gaugeFill.style.width = `${widthPct}%`;
      const sgn = Math.abs(d) < 1e-6 ? 'zero' : d > 0 ? 'pos' : 'neg';
      gaugeFill.style.background =
        sgn === 'zero' ? colors.textMuted : sgn === 'pos' ? COLOR_GAUGE_POS : COLOR_GAUGE_NEG;
      gaugeLabel.textContent = `det = ${d >= 0 ? '+' : ''}${fmt(d, 2)}`;
    }

    // ── 상태 ────────────────────────────────────────────────────────────────
    let matrix: Matrix2x2 = { a: 1, b: 0, c: 0, d: 1 };
    let presetMode: PresetMode = 'free';
    const presetParams: PresetParams = { theta: 0, s: 1, t: 1, k: 0, axis: 'x' };
    let pointsState: HelperPoint[] = [];
    let initialized = false;

    // 보조 점 element 캐시.
    type PointGfx = {
      circle: SVGCircleElement;
      labelGroup: SVGGElement;
      labelUv: SVGTextElement;
      labelXy: SVGTextElement;
      removeBtn: SVGTextElement;
    };
    const pointGfx = new Map<number, PointGfx>();

    // ── 그리기 함수 ─────────────────────────────────────────────────────────

    function repaintTransformedGrid(m: Matrix2x2): void {
      // 14줄 = (i 축 7줄: u = -3..3) + (j 축 7줄: v = -3..3)
      const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
      for (let u = -3; u <= 3; u++) {
        const p1 = transform(m, u, -3);
        const p2 = transform(m, u, 3);
        lines.push({
          x1: PLANE_CX + p1.x * 60,
          y1: PLANE_CY - p1.y * 60,
          x2: PLANE_CX + p2.x * 60,
          y2: PLANE_CY - p2.y * 60,
        });
      }
      for (let v = -3; v <= 3; v++) {
        const p1 = transform(m, -3, v);
        const p2 = transform(m, 3, v);
        lines.push({
          x1: PLANE_CX + p1.x * 60,
          y1: PLANE_CY - p1.y * 60,
          x2: PLANE_CX + p2.x * 60,
          y2: PLANE_CY - p2.y * 60,
        });
      }
      for (let i = 0; i < transformedLines.length; i++) {
        const ln = transformedLines[i]!;
        const data = lines[i]!;
        ln.setAttribute('x1', String(data.x1));
        ln.setAttribute('y1', String(data.y1));
        ln.setAttribute('x2', String(data.x2));
        ln.setAttribute('y2', String(data.y2));
      }
    }

    function transform(m: Matrix2x2, u: number, v: number): { x: number; y: number } {
      return { x: m.a * u + m.b * v, y: m.c * u + m.d * v };
    }

    function paintArrows(m: Matrix2x2): void {
      const iEnd = transform(m, 1, 0);
      const jEnd = transform(m, 0, 1);
      const iSvg = planeToSvg(iEnd.x, iEnd.y);
      const jSvg = planeToSvg(jEnd.x, jEnd.y);
      iLine.setAttribute('x1', String(PLANE_CX));
      iLine.setAttribute('y1', String(PLANE_CY));
      iLine.setAttribute('x2', String(iSvg.x));
      iLine.setAttribute('y2', String(iSvg.y));
      jLine.setAttribute('x1', String(PLANE_CX));
      jLine.setAttribute('y1', String(PLANE_CY));
      jLine.setAttribute('x2', String(jSvg.x));
      jLine.setAttribute('y2', String(jSvg.y));
      paintArrowHead(iHead, PLANE_CX, PLANE_CY, iSvg.x, iSvg.y);
      paintArrowHead(jHead, PLANE_CX, PLANE_CY, jSvg.x, jSvg.y);
      iTip.setAttribute('cx', String(iSvg.x));
      iTip.setAttribute('cy', String(iSvg.y));
      jTip.setAttribute('cx', String(jSvg.x));
      jTip.setAttribute('cy', String(jSvg.y));
    }

    function paintArrowHead(
      poly: SVGPolygonElement,
      ox: number,
      oy: number,
      tx: number,
      ty: number,
    ): void {
      const dx = tx - ox;
      const dy = ty - oy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) {
        poly.setAttribute('points', '');
        return;
      }
      const ux = dx / len;
      const uy = dy / len;
      const headLen = 9;
      const headW = 6;
      const baseX = tx - ux * headLen;
      const baseY = ty - uy * headLen;
      const px = -uy;
      const py = ux;
      const p1x = baseX + px * headW * 0.5;
      const p1y = baseY + py * headW * 0.5;
      const p2x = baseX - px * headW * 0.5;
      const p2y = baseY - py * headW * 0.5;
      poly.setAttribute('points', `${tx},${ty} ${p1x},${p1y} ${p2x},${p2y}`);
    }

    function paintParallelogram(m: Matrix2x2): void {
      const o = planeToSvg(0, 0);
      const i = planeToSvg(m.a, m.c);
      const ij = planeToSvg(m.a + m.b, m.c + m.d);
      const j = planeToSvg(m.b, m.d);
      parallelogram.setAttribute(
        'points',
        `${o.x},${o.y} ${i.x},${i.y} ${ij.x},${ij.y} ${j.x},${j.y}`,
      );
      const d = det(m);
      const sgn = Math.abs(d) < 1e-6 ? 'zero' : d > 0 ? 'pos' : 'neg';
      if (sgn === 'pos') {
        parallelogram.setAttribute('fill', COLOR_PARALLEL_POS);
        parallelogram.setAttribute('fill-opacity', '0.22');
        parallelogram.setAttribute('stroke', COLOR_PARALLEL_POS);
      } else if (sgn === 'neg') {
        parallelogram.setAttribute('fill', 'url(#mt-neg-stripes)');
        parallelogram.setAttribute('fill-opacity', '1');
        parallelogram.setAttribute('stroke', COLOR_PARALLEL_NEG);
      } else {
        parallelogram.setAttribute('fill', colors.textMuted);
        parallelogram.setAttribute('fill-opacity', '0.18');
        parallelogram.setAttribute('stroke', colors.textMuted);
      }
      // 면적 라벨.
      const cx = (o.x + i.x + ij.x + j.x) / 4;
      const cy = (o.y + i.y + ij.y + j.y) / 4;
      parallelogramLabel.setAttribute('x', String(cx));
      parallelogramLabel.setAttribute('y', String(cy + 4));
      parallelogramLabel.textContent = `면적 = ${fmt(Math.abs(d), 2)}`;
      parallelogramLabel.setAttribute('fill', colors.text);
    }

    // ── 보조 점 ─────────────────────────────────────────────────────────────

    function ensurePointGfx(p: HelperPoint): PointGfx {
      const cached = pointGfx.get(p.id);
      if (cached) return cached;
      const circle = el('circle', {
        r: 6,
        fill: COLOR_POINT,
        stroke: colors.bg,
        'stroke-width': 2,
        cursor: 'grab',
      });
      circle.setAttribute('data-point', String(p.id));
      pointsGroup.appendChild(circle);
      const labelGroup = el('g');
      pointsGroup.appendChild(labelGroup);
      const labelUv = el('text', {
        'font-size': fontSizes.xs,
        fill: colors.text,
        'font-family': 'ui-monospace, monospace',
      });
      labelGroup.appendChild(labelUv);
      const labelXy = el('text', {
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        'font-family': 'ui-monospace, monospace',
      });
      labelGroup.appendChild(labelXy);
      const removeBtn = el('text', {
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        cursor: 'pointer',
        'text-anchor': 'middle',
      });
      removeBtn.textContent = '×';
      removeBtn.setAttribute('data-remove-point', String(p.id));
      labelGroup.appendChild(removeBtn);
      const gfx: PointGfx = { circle, labelGroup, labelUv, labelXy, removeBtn };
      pointGfx.set(p.id, gfx);
      return gfx;
    }

    function repaintPoints(m: Matrix2x2): void {
      // 사라진 점 제거.
      const liveIds = new Set(pointsState.map((p) => p.id));
      Array.from(pointGfx.entries()).forEach(([id, gfx]) => {
        if (!liveIds.has(id)) {
          gfx.circle.remove();
          gfx.labelGroup.remove();
          pointGfx.delete(id);
        }
      });
      for (const p of pointsState) {
        const gfx = ensurePointGfx(p);
        const pos = transform(m, p.u, p.v);
        const sv = planeToSvg(pos.x, pos.y);
        gfx.circle.setAttribute('cx', String(sv.x));
        gfx.circle.setAttribute('cy', String(sv.y));
        const labX = sv.x + 10;
        const labY = sv.y - 6;
        gfx.labelUv.setAttribute('x', String(labX));
        gfx.labelUv.setAttribute('y', String(labY));
        gfx.labelUv.textContent = `(u,v) = (${fmt(p.u, 2)}, ${fmt(p.v, 2)})`;
        gfx.labelXy.setAttribute('x', String(labX));
        gfx.labelXy.setAttribute('y', String(labY + 11));
        gfx.labelXy.textContent = `위치 = (${fmt(pos.x, 2)}, ${fmt(pos.y, 2)})`;
        gfx.removeBtn.setAttribute('x', String(labX + 88));
        gfx.removeBtn.setAttribute('y', String(labY));
      }
    }

    // ── 드래그 처리 ─────────────────────────────────────────────────────────

    let dragKind: 'i' | 'j' | { kind: 'point'; id: number } | null = null;

    function svgPointerCoord(ev: PointerEvent): { x: number; y: number } {
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      return { x: (ev.clientX - rect.left) * scaleX, y: (ev.clientY - rect.top) * scaleY };
    }

    iTip.addEventListener('pointerdown', (e) => {
      iTip.setPointerCapture(e.pointerId);
      dragKind = 'i';
      iTip.style.cursor = 'grabbing';
    });
    jTip.addEventListener('pointerdown', (e) => {
      jTip.setPointerCapture(e.pointerId);
      dragKind = 'j';
      jTip.style.cursor = 'grabbing';
    });
    pointsGroup.addEventListener('pointerdown', (e) => {
      const target = e.target as Element;
      const pid = target.getAttribute?.('data-point');
      const remove = target.getAttribute?.('data-remove-point');
      if (remove) {
        params.dispatch?.({ type: 'point-remove', payload: { id: Number(remove) } });
        return;
      }
      if (pid) {
        (target as SVGCircleElement).setPointerCapture(e.pointerId);
        dragKind = { kind: 'point', id: Number(pid) };
        (target as SVGCircleElement).style.cursor = 'grabbing';
      }
    });

    function inverseTransform(m: Matrix2x2, x: number, y: number): { u: number; v: number } {
      const D = det(m);
      if (Math.abs(D) < 1e-6) return { u: x, v: y };
      const u = (m.d * x - m.b * y) / D;
      const v = (-m.c * x + m.a * y) / D;
      return { u, v };
    }

    svg.addEventListener('pointermove', (e) => {
      if (!dragKind) return;
      const sp = svgPointerCoord(e);
      const plane = svgToPlane(sp.x, sp.y);
      if (dragKind === 'i') {
        params.dispatch?.({ type: 'drag-tip', payload: { which: 'i', x: plane.u, y: plane.v } });
      } else if (dragKind === 'j') {
        params.dispatch?.({ type: 'drag-tip', payload: { which: 'j', x: plane.u, y: plane.v } });
      } else {
        const inv = inverseTransform(matrix, plane.u, plane.v);
        params.dispatch?.({
          type: 'point-drag',
          payload: { id: dragKind.id, u: inv.u, v: inv.v },
        });
      }
    });

    function endDrag(): void {
      iTip.style.cursor = 'grab';
      jTip.style.cursor = 'grab';
      dragKind = null;
    }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('pointerleave', endDrag);

    // 평면 빈 공간 클릭 → 점 추가.
    planeBg.addEventListener('click', (e) => {
      const sp = svgPointerCoord(e as PointerEvent);
      const plane = svgToPlane(sp.x, sp.y);
      const inv = inverseTransform(matrix, plane.u, plane.v);
      params.dispatch?.({ type: 'point-add', payload: { u: inv.u, v: inv.v } });
    });

    // ── 캡션 헬퍼 ───────────────────────────────────────────────────────────

    let captionTimer: ReturnType<typeof setTimeout> | null = null;

    function setEventCaption(text: string, durationMs = 1400): void {
      eventCaption.textContent = text;
      if (captionTimer) clearTimeout(captionTimer);
      captionTimer = setTimeout(() => {
        eventCaption.textContent = '';
        captionTimer = null;
      }, durationMs);
    }

    function captionFor(dim: 'a' | 'b' | 'c' | 'd' | 'all', cause: string): string {
      if (cause === 'preset') return '';
      if (cause === 'identity') return '처음의 격자로 돌아갔다 — 두 기저가 (1, 0) 과 (0, 1).';
      if (cause === 'tip') return '두 기저의 도착지를 직접 잡았다.';
      if (dim === 'a' || dim === 'c') return 'i-hat 의 한 좌표만 변했다 — j-hat 은 그대로다.';
      if (dim === 'b' || dim === 'd') return 'j-hat 의 한 좌표만 변했다 — i-hat 은 그대로다.';
      return '';
    }

    function captionForPreset(mode: PresetMode): string {
      if (mode === 'rotate') return '회전 — 두 기저가 같이 돈다.';
      if (mode === 'scale') return '스케일 — 두 기저가 각자 늘거나 줄어든다.';
      if (mode === 'shear') return '전단 — 한 기저가 비스듬해진다.';
      if (mode === 'reflect') return '반사 — 평면이 거울에 비친다.';
      return '';
    }

    function modeLabelFor(mode: PresetMode, p: PresetParams): string {
      if (mode === 'rotate') return `회전 모드 — θ = ${fmt(p.theta, 2)} rad`;
      if (mode === 'scale') return `스케일 모드 — s = ${fmt(p.s, 2)}, t = ${fmt(p.t, 2)}`;
      if (mode === 'shear') return `전단 모드 — k = ${fmt(p.k, 2)}`;
      if (mode === 'reflect') return `반사 모드 — ${p.axis === 'x' ? 'x축' : p.axis === 'y' ? 'y축' : '원점'}`;
      return '자유 모드';
    }

    // ── 외부 메서드 (projector 가 호출) ─────────────────────────────────────

    function reset(): void {
      matrix = { a: 1, b: 0, c: 0, d: 1 };
      presetMode = 'free';
      presetParams.theta = 0;
      presetParams.s = 1;
      presetParams.t = 1;
      presetParams.k = 0;
      presetParams.axis = 'x';
      pointsState = [];
      pointGfx.forEach((gfx) => {
        gfx.circle.remove();
        gfx.labelGroup.remove();
      });
      pointGfx.clear();
      eventCaption.textContent = '';
      modeLabel.textContent = '자유 모드';
      setCellValue(cellA, 1);
      setCellValue(cellB, 0);
      setCellValue(cellC, 0);
      setCellValue(cellD, 1);
      paintArrows(matrix);
      repaintTransformedGrid(matrix);
      paintParallelogram(matrix);
      paintGauge(1);
      highlightPreset('free');
      rebuildSubSlider('free', presetParams);
    }

    function init(payload: {
      matrix: Matrix2x2;
      det: number;
      preset: PresetMode;
      presetParams: PresetParams;
      points: HelperPoint[];
      axisMax: number;
      maxPoints: number;
    }): void {
      matrix = { ...payload.matrix };
      presetMode = payload.preset;
      Object.assign(presetParams, payload.presetParams);
      pointsState = payload.points.map((p) => ({ ...p }));
      initialized = true;
      setCellValue(cellA, matrix.a);
      setCellValue(cellB, matrix.b);
      setCellValue(cellC, matrix.c);
      setCellValue(cellD, matrix.d);
      paintArrows(matrix);
      repaintTransformedGrid(matrix);
      paintParallelogram(matrix);
      paintGauge(payload.det);
      modeLabel.textContent = modeLabelFor(presetMode, presetParams);
      highlightPreset(presetMode);
      rebuildSubSlider(presetMode, presetParams);
      repaintPoints(matrix);
    }

    function applyMatrix(payload: {
      matrix: Matrix2x2;
      det: number;
      dim: 'a' | 'b' | 'c' | 'd' | 'all';
      cause: 'cell' | 'tip' | 'preset' | 'demo' | 'identity';
    }): void {
      if (!initialized) return;
      matrix = { ...payload.matrix };
      setCellValue(cellA, matrix.a);
      setCellValue(cellB, matrix.b);
      setCellValue(cellC, matrix.c);
      setCellValue(cellD, matrix.d);
      paintArrows(matrix);
      repaintTransformedGrid(matrix);
      paintParallelogram(matrix);
      paintGauge(payload.det);
      repaintPoints(matrix);
      modeLabel.textContent = modeLabelFor(presetMode, presetParams);
      const text = captionFor(payload.dim, payload.cause);
      if (text) setEventCaption(text);
    }

    function applyPreset(payload: { mode: PresetMode; params: PresetParams }): void {
      presetMode = payload.mode;
      Object.assign(presetParams, payload.params);
      highlightPreset(presetMode);
      rebuildSubSlider(presetMode, presetParams);
      modeLabel.textContent = modeLabelFor(presetMode, presetParams);
      const cap = captionForPreset(presetMode);
      if (cap) setEventCaption(cap);
    }

    function applyPresetParam(payload: {
      kind: 'theta' | 's' | 't' | 'k' | 'axis';
      value: number | ReflectAxis;
    }): void {
      if (payload.kind === 'theta' && typeof payload.value === 'number') {
        presetParams.theta = payload.value;
      } else if (payload.kind === 's' && typeof payload.value === 'number') {
        presetParams.s = payload.value;
      } else if (payload.kind === 't' && typeof payload.value === 'number') {
        presetParams.t = payload.value;
      } else if (payload.kind === 'k' && typeof payload.value === 'number') {
        presetParams.k = payload.value;
      } else if (
        payload.kind === 'axis' &&
        (payload.value === 'x' || payload.value === 'y' || payload.value === 'origin')
      ) {
        presetParams.axis = payload.value;
        // axis 변경은 즉시 보조 슬라이더 highlight 갱신.
        rebuildSubSlider(presetMode, presetParams);
      }
      modeLabel.textContent = modeLabelFor(presetMode, presetParams);
    }

    function applyPointAdded(payload: { id: number; u: number; v: number }): void {
      pointsState.push({ ...payload });
      repaintPoints(matrix);
      setEventCaption('한 점이 격자와 같은 법칙으로 따라간다.');
    }

    function applyPointRemoved(payload: { id: number }): void {
      pointsState = pointsState.filter((p) => p.id !== payload.id);
      repaintPoints(matrix);
    }

    function applyPointMoved(payload: { id: number; u: number; v: number }): void {
      const p = pointsState.find((q) => q.id === payload.id);
      if (!p) return;
      p.u = payload.u;
      p.v = payload.v;
      repaintPoints(matrix);
    }

    function signalDetZero(_payload: { matrix: Matrix2x2 }): void {
      setEventCaption('면적이 0 이다 — 평면이 직선으로 무너졌다.', 1800);
    }

    function signalDetFlipped(payload: { sign: 'pos' | 'neg'; det: number }): void {
      if (payload.sign === 'neg') {
        setEventCaption('방향이 뒤집혔다 — 평면이 거울에 비쳤다.', 1800);
      } else {
        setEventCaption('방향이 다시 보존된다.', 1200);
      }
    }

    function signalReset(): void {
      setEventCaption('처음의 격자로 돌아갔다.', 1200);
    }

    // 외부 노출.
    Object.assign(svg, {
      reset,
      init,
      applyMatrix,
      applyPreset,
      applyPresetParam,
      applyPointAdded,
      applyPointRemoved,
      applyPointMoved,
      signalDetZero,
      signalDetFlipped,
      signalReset,
    });

    // 첫 렌더 (init 전 폴백).
    reset();

    return {
      destroy(): void {
        if (captionTimer) clearTimeout(captionTimer);
        svg.remove();
      },
      handle: svg as unknown as Record<string, unknown>,
    };
  },
};
