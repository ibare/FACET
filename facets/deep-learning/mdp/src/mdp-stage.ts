/**
 * mdp 무대 — 3 × 5 격자의 값 표를 계획자가 바퀴마다 채우는 모습.
 *
 * 운동:
 *   - 칸마다 화살표가 **돌아선다** (rotate transition, 가까운 쪽으로)
 *   - 값 음영 막대가 칸 바닥에서 **자라** 목표 · 구덩이 둘레부터 번져 온다 (scaleY transition)
 *   - 끝 걸음에 출발에서의 길 선이 **그어진다** (stroke-dashoffset transition). 손잡이를 돌리면 다른 줄로 옮겨 그려진다
 *   - 새 판 걸음 0 — 화살표 · 값 글자 · 길 선을 걷고 음영 막대는 0 자리로 **줄어든다**
 *
 * 무대는 셈하지 않는다 — 값 · 화살표 · 길 · 축척(valueScale) · 닿는 칸 종류는 payload 로 받는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

export type MdpRunStartView = {
  gamma: number;
  slip: number;
  rows: number;
  cols: number;
  kinds: number[];
  rewards: number[];
  start: number;
  sweeps: number;
  valueScale: number;
  motionMs: number;
};

export type MdpSweepView = {
  sweep: number;
  values: number[];
  policy: number[];
  turned: number[];
  change: number;
  startValue: number;
  nonZero: number;
  motionMs: number;
};

export type MdpPathView = {
  moves: number;
  cells: number[];
  arrows: string;
  endKind: number;
  motionMs: number;
};

/** projector 가 부르는 구조적 표면 */
export type MdpStage = {
  startRun(p: MdpRunStartView): void;
  showSweep(p: MdpSweepView): void;
  showPath(p: MdpPathView): void;
  destroy(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 640;
const HEIGHT = 430;
const GRID_X = 70;
const GRID_Y = 48;
const GRID_W = 500;
const GRID_H = 300;
const CAPTION_Y1 = GRID_Y + GRID_H + 32;
const CAPTION_Y2 = CAPTION_Y1 + 26;

/** 소수 자리 표시 — 음수는 U+2212, 표시가 0 인 음수는 부호 없이 */
function fmt(x: number, digits: number): string {
  const s = Math.abs(x).toFixed(digits);
  if (x < 0 && Number(s) !== 0) return `−${s}`;
  return s;
}

function signed(x: number): string {
  if (x > 0) return `+${x}`;
  if (x < 0) return `−${Math.abs(x)}`;
  return '0';
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

type CellParts = {
  shade: SVGRectElement | null;
  arrowWrap: SVGGElement | null;
  arrow: SVGGElement | null;
  value: SVGTextElement | null;
  angle: number;
};

export const mdpStageView: CanvasView = {
  canvas: { width: WIDTH, height: HEIGHT },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const instant = (): boolean => params.isInstant?.() ?? false;
    let destroyed = false;

    const root = el('g', {}, svg);
    const header = el('text', {
      x: GRID_X, y: 28, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text,
    }, root);
    const sweepLabel = el('text', {
      x: GRID_X + GRID_W, y: 28, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: c.textMuted,
    }, root);
    const gridLayer = el('g', {}, root);
    const pathLayer = el('g', {}, root);
    const caption1 = el('text', {
      x: GRID_X, y: CAPTION_Y1, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text,
    }, root);
    const caption2 = el('text', {
      x: GRID_X, y: CAPTION_Y2, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.textMuted,
    }, root);

    let grid: { rows: number; cols: number; cell: number; ox: number; oy: number; parts: CellParts[]; kinds: number[] } | null = null;
    let scale = 0;
    let sweeps = 0;
    let lastStartValue: number | null = null;
    let lastSweep = 0;
    let pathLine: SVGPolylineElement | null = null;

    const transition = (node: SVGElement, prop: string, ms: number): void => {
      node.style.transition = instant() || ms <= 0 ? 'none' : `${prop} ${ms}ms ease-in-out`;
    };

    const center = (i: number): { x: number; y: number } => {
      if (!grid) throw new Error('[mdp-stage] 격자가 아직 없다');
      const r = Math.floor(i / grid.cols);
      const col = i % grid.cols;
      return { x: grid.ox + col * grid.cell + grid.cell / 2, y: grid.oy + r * grid.cell + grid.cell / 2 };
    };

    const kindName = (k: number): string => {
      if (k === 1) return t('label.kind.small', 'small goal');
      if (k === 2) return t('label.kind.big', 'big goal');
      if (k === 3) return t('label.kind.pit', 'pit');
      throw new Error(`[mdp-stage] 끝 칸이 아닌 종류 ${k}`);
    };

    const buildGrid = (p: MdpRunStartView): void => {
      while (gridLayer.firstChild) gridLayer.removeChild(gridLayer.firstChild);
      const cell = Math.min(GRID_W / p.cols, GRID_H / p.rows);
      const ox = GRID_X + (GRID_W - cell * p.cols) / 2;
      const oy = GRID_Y + (GRID_H - cell * p.rows) / 2;
      const parts: CellParts[] = [];
      const labelPx = parseFloat(fontSizes.sm);
      for (let i = 0; i < p.kinds.length; i++) {
        const kind = p.kinds[i];
        if (kind === undefined) throw new Error('[mdp-stage] 칸 종류가 비었다');
        const r = Math.floor(i / p.cols);
        const col = i % p.cols;
        const x = ox + col * cell;
        const y = oy + r * cell;
        const g = el('g', {}, gridLayer);
        if (kind === 0) {
          el('rect', { x: x + 2, y: y + 2, width: cell - 4, height: cell - 4, rx: 4, fill: c.bg, stroke: c.border, 'stroke-width': 1.5 }, g);
          const shade = el('rect', {
            x: x + 3, y: y + 3, width: cell - 6, height: cell - 6, rx: 3, fill: c.accent, 'fill-opacity': 0.55,
          }, g);
          shade.style.setProperty('transform-box', 'fill-box');
          shade.style.setProperty('transform-origin', 'center bottom');
          shade.style.transform = 'scaleY(0)';
          const arrowWrap = el('g', { transform: `translate(${x + cell / 2} ${y + cell / 2 - 10})` }, g);
          const arrow = el('g', {}, arrowWrap);
          el('path', {
            d: 'M0 16 L0 -16 M-8 -7 L0 -16 L8 -7', fill: 'none', stroke: c.text, 'stroke-width': 3,
            'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          }, arrow);
          arrow.style.setProperty('transform-box', 'fill-box');
          arrow.style.setProperty('transform-origin', 'center');
          arrow.style.transform = 'rotate(0deg) scale(0)';
          const value = el('text', {
            x: x + cell / 2, y: y + cell - 12, 'text-anchor': 'middle', 'font-family': fonts.mono,
            'font-size': fontSizes.md, fill: c.text,
          }, g);
          if (i === p.start) {
            el('text', { x: x + 8, y: y + 8 + labelPx, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, g)
              .textContent = t('label.start', 'start');
            el('rect', { x: x + 2, y: y + 2, width: cell - 4, height: cell - 4, rx: 4, fill: 'none', stroke: c.text, 'stroke-width': 2.5 }, g);
          }
          parts.push({ shade, arrowWrap, arrow, value, angle: 0 });
        } else {
          const tile = kind === 2 ? c.primary : kind === 1 ? c.itemSorted : c.danger;
          const ink = kind === 3 ? c.stateInk : c.textInverse;
          el('rect', { x: x + 2, y: y + 2, width: cell - 4, height: cell - 4, rx: 4, fill: tile }, g);
          const reward = p.rewards[kind];
          if (reward === undefined) throw new Error(`[mdp-stage] 종류 ${kind} 의 상이 없다`);
          el('text', {
            x: x + cell / 2, y: y + cell / 2 - 4, 'text-anchor': 'middle', 'font-family': fonts.body,
            'font-size': fontSizes.sm, fill: ink,
          }, g).textContent = kindName(kind);
          el('text', {
            x: x + cell / 2, y: y + cell / 2 + 18, 'text-anchor': 'middle', 'font-family': fonts.mono,
            'font-size': fontSizes.lg, 'font-weight': 700, fill: ink,
          }, g).textContent = signed(reward);
          parts.push({ shade: null, arrowWrap: null, arrow: null, value: null, angle: 0 });
        }
      }
      grid = { rows: p.rows, cols: p.cols, cell, ox, oy, parts, kinds: p.kinds.slice() };
    };

    const clearPath = (): void => {
      if (pathLine) {
        pathLine.remove();
        pathLine = null;
      }
      while (pathLayer.firstChild) pathLayer.removeChild(pathLayer.firstChild);
    };

    const setArrow = (part: CellParts, dir: number, emphasised: boolean, ms: number): void => {
      if (!part.arrow) throw new Error('[mdp-stage] 끝 칸에는 화살표가 없다');
      const stroke = part.arrow.firstChild as SVGPathElement | null;
      if (!stroke) throw new Error('[mdp-stage] 화살표 모양이 없다');
      stroke.setAttribute('stroke', emphasised ? c.itemComparing : c.text);
      transition(part.arrow, 'transform', ms);
      if (dir < 0) {
        part.arrow.style.transform = `rotate(${part.angle}deg) scale(0)`;
        return;
      }
      const target = dir * 90;
      let delta = (((target - part.angle) % 360) + 360) % 360;
      if (delta > 180) delta -= 360;
      part.angle += delta;
      part.arrow.style.transform = `rotate(${part.angle}deg) scale(1)`;
    };

    const inst: MdpStage & ViewInstance = {
      startRun(p) {
        if (destroyed) return;
        if (!grid || grid.rows !== p.rows || grid.cols !== p.cols || grid.kinds.join() !== p.kinds.join()) buildGrid(p);
        if (!grid) throw new Error('[mdp-stage] 격자를 세우지 못했다');
        scale = p.valueScale;
        if (!(scale > 0)) throw new Error('[mdp-stage] valueScale 은 양수여야 한다');
        sweeps = p.sweeps;
        lastStartValue = null;
        lastSweep = 0;
        clearPath();
        header.textContent = t('label.condition', 'γ {gamma} · slip {slip}', { gamma: String(p.gamma), slip: String(p.slip) });
        sweepLabel.textContent = t('label.sweepOf', 'sweep {n}/{total}', { n: 0, total: sweeps });
        for (const part of grid.parts) {
          if (!part.arrow || !part.shade || !part.value) continue;
          setArrow(part, -1, false, p.motionMs);
          transition(part.shade, 'transform', p.motionMs);
          part.shade.style.transform = 'scaleY(0)';
          part.value.textContent = '';
        }
        caption1.textContent = t('caption.start', 'Every value starts at 0 · no arrows yet');
        caption2.textContent = '';
      },
      showSweep(p) {
        if (destroyed) return;
        if (!grid) throw new Error('[mdp-stage] 판이 시작되지 않았다');
        if (p.values.length !== grid.parts.length || p.policy.length !== grid.parts.length) {
          throw new Error('[mdp-stage] 값 · 화살표 길이가 격자와 다르다');
        }
        const turned = new Set(p.turned);
        grid.parts.forEach((part, i) => {
          if (!part.arrow || !part.shade || !part.value) return;
          const val = p.values[i];
          const dir = p.policy[i];
          if (val === undefined || dir === undefined) throw new Error('[mdp-stage] 칸 값이 비었다');
          const frac = Math.min(1, Math.abs(val) / scale);
          part.shade.setAttribute('fill', val < 0 ? c.danger : c.accent);
          transition(part.shade, 'transform', p.motionMs);
          part.shade.style.transform = `scaleY(${frac})`;
          setArrow(part, dir, turned.has(i), p.motionMs);
          part.value.textContent = fmt(val, 2);
        });
        lastStartValue = p.startValue;
        lastSweep = p.sweep;
        sweepLabel.textContent = t('label.sweepOf', 'sweep {n}/{total}', { n: p.sweep, total: sweeps });
        caption1.textContent = t('caption.sweep', 'sweep {n} · nonzero cells {nonZero} · arrows turned {turned}', {
          n: p.sweep, nonZero: p.nonZero, turned: p.turned.length,
        });
        caption2.textContent = t('caption.sweepValue', 'V(S) after sweep {n}: {v} · largest change {d}', {
          n: p.sweep, v: fmt(p.startValue, 2), d: fmt(p.change, 3),
        });
      },
      showPath(p) {
        if (destroyed) return;
        if (!grid) throw new Error('[mdp-stage] 판이 시작되지 않았다');
        if (lastStartValue === null) throw new Error('[mdp-stage] 바퀴 없이 길이 왔다');
        if (p.cells.length !== p.moves + 1) throw new Error('[mdp-stage] 길의 칸 수가 이동 수와 맞지 않다');
        clearPath();
        const pts = p.cells.map((i) => center(i));
        let len = 0;
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1];
          const b = pts[k];
          if (!a || !b) throw new Error('[mdp-stage] 길 점이 비었다');
          len += Math.hypot(b.x - a.x, b.y - a.y);
        }
        const first = pts[0];
        if (!first) throw new Error('[mdp-stage] 길의 첫 칸이 없다');
        el('circle', { cx: first.x, cy: first.y, r: 7, fill: c.primary }, pathLayer);
        const line = el('polyline', {
          points: pts.map((q) => `${q.x},${q.y}`).join(' '),
          fill: 'none', stroke: c.primary, 'stroke-width': 5, 'stroke-opacity': 0.85,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        }, pathLayer);
        pathLine = line;
        line.style.strokeDasharray = `${len}`;
        if (instant() || p.motionMs <= 0) {
          line.style.strokeDashoffset = '0';
        } else {
          line.style.transition = 'none';
          line.style.strokeDashoffset = `${len}`;
          svg.getBoundingClientRect();
          line.style.transition = `stroke-dashoffset ${p.motionMs}ms ease-in-out`;
          line.style.strokeDashoffset = '0';
        }
        caption1.textContent = t('caption.path', 'Following the arrows as intended: {arrows}', { arrows: p.arrows });
        caption2.textContent = t('caption.pathEnd', 'reaches: {end} · moves {moves} · V(S) after sweep {n}: {v}', {
          end: kindName(p.endKind), moves: p.moves, n: lastSweep, v: fmt(lastStartValue, 2),
        });
      },
      destroy() {
        destroyed = true;
        root.remove();
      },
    };
    return inst;
  },
};
