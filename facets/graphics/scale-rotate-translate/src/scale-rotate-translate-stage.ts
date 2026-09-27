/**
 * 변환의 합성 무대 — 좌표 평면(창) 하나와 옆 패널(인수 칩 셋 · 합성 행렬 표 하나).
 *
 * 무대는 셈하지 않는다. 합성 행렬 · 꼭짓점 자리 · 이동 열 · 같은 꼭짓점 수는 모두 payload 로
 * 받는다. 무대가 하는 일은 받은 자리 사이를 **시간에 걸쳐** 옮기는 것뿐이다.
 *
 * 운동:
 *   begin   도형이 앞 판의 끝 자리에서 처음 L 자리로 미끄러져 돌아오고, 회전 중심 표지가 새 중심으로
 *           옮겨 간다. 앞 판의 도착 틀(점선)은 자리로만 남는다. 행렬 · 칩 강조 · 캡션(결론)은 걷는다.
 *   compose 도형이 그 인수로 옮겨 간다 — 회전이면 중심 둘레의 호, 아니면 곧게.
 *   apply   도착 틀이 앞 판의 도착(첫 판은 처음 L 자리)에서 이 판의 도착으로 옮겨 가 도형에 포개진다.
 *
 * 좌표: 자료는 y 가 위다. 화면으로 뒤집는 것은 여기 `sy` 한 곳이다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type SrtPoint = { id: string; x: number; y: number };
export type SrtWindow = { xMin: number; xMax: number; yMin: number; yMax: number };
export type SrtFactorView =
  | { id: 'scale'; sx: number; sy: number }
  | { id: 'rotate'; degrees: number; px: number; py: number }
  | { id: 'shift'; dx: number; dy: number };
export type SrtFactorId = SrtFactorView['id'];

export type SrtRoundView = {
  window: SrtWindow;
  shape: SrtPoint[];
  pivot: SrtPoint;
  factors: SrtFactorView[];
  matrix: number[];
  durationMs: number;
};
export type SrtComposeView = {
  step: number;
  factorIndex: number;
  factor: SrtFactorId;
  matrix: number[];
  points: SrtPoint[];
  arc: { px: number; py: number; degrees: number } | null;
  shiftX: number;
  shiftY: number;
  durationMs: number;
};
export type SrtApplyView = {
  step: number;
  matrix: number[];
  points: SrtPoint[];
  same: number;
  unitW: number;
  total: number;
  durationMs: number;
};

export type ScaleRotateTranslateStage = {
  begin(v: SrtRoundView): void;
  compose(v: SrtComposeView): void;
  apply(v: SrtApplyView): void;
  reset(): void;
  destroy(): void;
};

// 화면 배치 (viewBox 단위)
const W = 820;
const H = 480;
const PLANE = { x: 20, y: 20, w: 540, h: 390 };
const PANEL_X = 590;
const PANEL_W = 210;
const CHIP_H = 46;
const CHIP_GAP = 10;
const CHIP_TOP = 40;
const CELL_W = 58;
const CELL_H = 30;
const MATRIX_TOP = 252;
const CAPTION_Y1 = 442;
const CAPTION_Y2 = 464;

/** 인수 식별자 → 표식 글자 (수식의 기호라 번역하지 않는다) */
const LETTER: Record<SrtFactorId, string> = { scale: 'S', rotate: 'R', shift: 'T' };
/** 인수 식별자 → 색 자리 (categorical 셋 중) */
const TONE_INDEX: Record<SrtFactorId, number> = { scale: 0, rotate: 1, shift: 2 };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function fmtPair(a: number, b: number): string {
  return `(${a}, ${b})`;
}

export const scaleRotateTranslateStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const tones = categorical(3, 'vivid');
    const isInstant = params.isInstant ?? ((): boolean => false);
    const smPx = parseFloat(fontSizes.sm);

    const toneOf = (id: SrtFactorId): string => {
      const tone = tones[TONE_INDEX[id]];
      if (tone === undefined) throw new Error(`scale-rotate-translate-stage: ${id} 의 색이 없다`);
      return tone;
    };
    const labelOf = (id: SrtFactorId): string => {
      switch (id) {
        case 'scale':
          return t('label.scale', 'Scale');
        case 'rotate':
          return t('label.rotate', 'Rotate');
        case 'shift':
          return t('label.shift', 'Shift');
      }
    };

    // ── 층 ───────────────────────────────────────────────────────────────
    const root = el('g', { 'data-role': 'srt-root' }, svg);
    el('rect', { x: PLANE.x, y: PLANE.y, width: PLANE.w, height: PLANE.h, fill: c.bgSubtle, stroke: c.border, rx: 4 }, root);
    const gridG = el('g', { 'data-role': 'grid' }, root);
    const shape = el(
      'polygon',
      { fill: c.primary, 'fill-opacity': 0.2, stroke: c.primary, 'stroke-width': 2, 'stroke-linejoin': 'round', 'data-role': 'shape', visibility: 'hidden' },
      root,
    );
    // 도착 틀은 도형 위에 둔다 — 포개졌을 때 점선이 보이게
    const frame = el(
      'polygon',
      { fill: 'none', stroke: c.accent, 'stroke-width': 3, 'stroke-dasharray': '7 5', 'data-role': 'arrival-frame', visibility: 'hidden' },
      root,
    );
    const vertexG = el('g', { 'data-role': 'vertices' }, root);
    const pivotG = el('g', { 'data-role': 'pivot', visibility: 'hidden' }, root);
    const pivotRing = el('circle', { r: 6, fill: 'none', stroke: c.itemActive, 'stroke-width': 2 }, pivotG);
    const pivotDot = el('circle', { r: 2, fill: c.itemActive }, pivotG);
    const pivotText = el(
      'text',
      { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.itemActive, 'text-anchor': 'start' },
      pivotG,
    );

    // 옆 패널
    const panel = el('g', { 'data-role': 'panel' }, root);
    const orderTitle = el(
      'text',
      { x: PANEL_X, y: CHIP_TOP - 12, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
      panel,
    );
    const chipsG = el('g', { 'data-role': 'chips' }, panel);
    const matrixTitle = el(
      'text',
      { x: PANEL_X, y: MATRIX_TOP - 14, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted },
      panel,
    );
    const formula = el(
      'text',
      { x: PANEL_X + PANEL_W, y: MATRIX_TOP - 14, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text, 'text-anchor': 'end' },
      panel,
    );
    const matrixBox = el(
      'rect',
      { x: PANEL_X + 8, y: MATRIX_TOP, width: CELL_W * 3, height: CELL_H * 3, fill: 'none', stroke: c.border, rx: 3 },
      panel,
    );
    const shiftColBox = el(
      'rect',
      { x: PANEL_X + 8 + CELL_W * 2 + 2, y: MATRIX_TOP + 2, width: CELL_W - 4, height: CELL_H * 2 - 4, fill: c.accent, 'fill-opacity': 0.25, rx: 3 },
      panel,
    );
    const cells: SVGTextElement[] = [];
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      cells.push(
        el(
          'text',
          {
            x: PANEL_X + 8 + CELL_W * col + CELL_W / 2,
            y: MATRIX_TOP + CELL_H * row + CELL_H / 2 + smPx * 0.35,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: row === 2 ? c.textMuted : c.text,
            'data-role': `cell-${row}-${col}`,
          },
          panel,
        ),
      );
    }
    const shiftColLabel = el(
      'text',
      {
        x: PANEL_X + 8 + CELL_W * 2 + CELL_W / 2,
        y: MATRIX_TOP + CELL_H * 3 + 16,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      },
      panel,
    );
    const legendY = MATRIX_TOP + CELL_H * 3 + 44;
    el('line', { x1: PANEL_X + 8, x2: PANEL_X + 36, y1: legendY, y2: legendY, stroke: c.accent, 'stroke-width': 3, 'stroke-dasharray': '7 5' }, panel);
    const legendText = el(
      'text',
      { x: PANEL_X + 44, y: legendY + smPx * 0.35, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted },
      panel,
    );

    const caption1 = el(
      'text',
      { x: PLANE.x, y: CAPTION_Y1, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text, 'data-role': 'caption' },
      root,
    );
    const caption2 = el(
      'text',
      { x: PLANE.x, y: CAPTION_Y2, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted, 'data-role': 'caption-detail' },
      root,
    );

    // ── 기억 (자리) ─────────────────────────────────────────────────────────
    let win: SrtWindow | null = null;
    let unit = 1;
    let shapePts: SrtPoint[] | null = null;
    let framePts: SrtPoint[] | null = null;
    let pivotPt: { x: number; y: number } | null = null;
    let firstShape: SrtPoint[] | null = null;
    let factorIds: SrtFactorId[] = [];
    const chipRects: SVGRectElement[] = [];
    const vertexLabels = new Map<string, SVGTextElement>();

    const sx = (x: number): number => {
      if (win === null) throw new Error('scale-rotate-translate-stage: 창을 받기 전에 그리려 한다');
      return PLANE.x + (x - win.xMin) * unit;
    };
    const sy = (y: number): number => {
      if (win === null) throw new Error('scale-rotate-translate-stage: 창을 받기 전에 그리려 한다');
      return PLANE.y + (win.yMax - y) * unit;
    };

    // ── 운동 (rAF 하나) ────────────────────────────────────────────────────
    let raf = 0;
    let finishing: (() => void) | null = null;
    const stopMotion = (finish: boolean): void => {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      const f = finishing;
      finishing = null;
      if (finish && f) f();
    };
    const tween = (ms: number, draw: (u: number) => void): void => {
      stopMotion(true);
      if (ms <= 0 || isInstant()) {
        draw(1);
        return;
      }
      const start = performance.now();
      finishing = (): void => draw(1);
      const tick = (now: number): void => {
        const raw = Math.min(1, (now - start) / ms);
        const u = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
        draw(u);
        if (raw < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          raf = 0;
          finishing = null;
        }
      };
      raf = requestAnimationFrame(tick);
    };
    params.onScrubStart?.(() => stopMotion(false));

    // ── 그리기 도우미 ─────────────────────────────────────────────────────
    const polyAttr = (pts: readonly { x: number; y: number }[]): string =>
      pts.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

    const drawShape = (pts: readonly SrtPoint[]): void => {
      shape.setAttribute('points', polyAttr(pts));
      shape.setAttribute('visibility', 'visible');
      for (const p of pts) {
        const label = vertexLabels.get(p.id);
        if (label === undefined) throw new Error(`scale-rotate-translate-stage: 꼭짓점 ${p.id} 의 이름표가 없다`);
        label.setAttribute('x', (sx(p.x) + 5).toFixed(1));
        label.setAttribute('y', (sy(p.y) - 5).toFixed(1));
      }
    };
    const drawFrame = (pts: readonly { x: number; y: number }[]): void => {
      frame.setAttribute('points', polyAttr(pts));
      frame.setAttribute('visibility', 'visible');
    };
    const drawPivot = (p: { x: number; y: number }): void => {
      const x = sx(p.x);
      const y = sy(p.y);
      for (const node of [pivotRing, pivotDot]) {
        node.setAttribute('cx', x.toFixed(1));
        node.setAttribute('cy', y.toFixed(1));
      }
      pivotText.setAttribute('x', (x + 9).toFixed(1));
      pivotText.setAttribute('y', (y - 9).toFixed(1));
      pivotG.setAttribute('visibility', 'visible');
    };
    const lerpPts = (from: readonly SrtPoint[], to: readonly SrtPoint[], u: number): SrtPoint[] =>
      to.map((q) => {
        const p = from.find((f) => f.id === q.id);
        if (p === undefined) throw new Error(`scale-rotate-translate-stage: 꼭짓점 ${q.id} 의 앞 자리가 없다`);
        return { id: q.id, x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u };
      });
    const setMatrix = (m: readonly number[]): void => {
      if (m.length !== 9) throw new Error(`scale-rotate-translate-stage: 행렬 칸이 ${m.length} 개다`);
      m.forEach((value, i) => {
        const cell = cells[i];
        if (cell === undefined) throw new Error(`scale-rotate-translate-stage: 칸 ${i} 이 없다`);
        cell.textContent = value === 0 ? '0' : String(value);
      });
    };
    const setChips = (current: number, done: number): void => {
      chipRects.forEach((rect, i) => {
        const id = factorIds[i];
        if (id === undefined) throw new Error(`scale-rotate-translate-stage: 칩 ${i} 의 인수가 없다`);
        const tone = toneOf(id);
        const isCurrent = i === current;
        const isDone = i < done;
        rect.setAttribute('stroke', isCurrent || isDone ? tone : c.border);
        rect.setAttribute('stroke-width', isCurrent ? '3' : '1.5');
        rect.setAttribute('stroke-dasharray', isCurrent || isDone ? '' : '4 3');
        rect.setAttribute('fill-opacity', isCurrent ? '0.22' : isDone ? '0.08' : '0');
      });
    };
    /** 지금까지 곱한 인수 — 뒤에 곱한 것이 왼쪽 */
    const setFormula = (done: number): void => {
      if (done === 0) {
        formula.textContent = 'M = I';
        return;
      }
      const letters = factorIds.slice(0, done).map((id) => LETTER[id]);
      formula.textContent = `M = ${letters.reverse().join('·')}`;
    };

    const buildGrid = (w: SrtWindow): void => {
      gridG.replaceChildren();
      for (let x = Math.ceil(w.xMin); x <= w.xMax; x++) {
        el('line', { x1: sx(x), x2: sx(x), y1: PLANE.y, y2: PLANE.y + PLANE.h, stroke: x === 0 ? c.textMuted : c.border, 'stroke-width': x === 0 ? 1.2 : 0.6 }, gridG);
      }
      for (let y = Math.ceil(w.yMin); y <= w.yMax; y++) {
        el('line', { x1: PLANE.x, x2: PLANE.x + PLANE.w, y1: sy(y), y2: sy(y), stroke: y === 0 ? c.textMuted : c.border, 'stroke-width': y === 0 ? 1.2 : 0.6 }, gridG);
      }
      for (let x = Math.ceil(w.xMin); x <= w.xMax; x++) {
        if (x === 0 || x % 2 !== 0) continue;
        el('text', { x: sx(x), y: sy(0) + 12, 'text-anchor': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, gridG).textContent = String(x);
      }
      for (let y = Math.ceil(w.yMin); y <= w.yMax; y++) {
        if (y === 0 || y % 2 !== 0) continue;
        el('text', { x: sx(0) - 4, y: sy(y) + 4, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, gridG).textContent = String(y);
      }
      el('text', { x: sx(0) - 4, y: sy(0) + 12, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, gridG).textContent = '0';
    };

    const chipValue = (f: SrtFactorView): string => {
      switch (f.id) {
        case 'scale':
          return fmtPair(f.sx, f.sy);
        case 'rotate':
          return `${f.degrees > 0 ? '+' : ''}${f.degrees}° · ${fmtPair(f.px, f.py)}`;
        case 'shift':
          return fmtPair(f.dx, f.dy);
      }
    };

    const buildChips = (factors: readonly SrtFactorView[]): void => {
      chipsG.replaceChildren();
      chipRects.length = 0;
      factors.forEach((f, i) => {
        const tone = toneOf(f.id);
        const y = CHIP_TOP + i * (CHIP_H + CHIP_GAP);
        const g = el('g', { 'data-role': `chip-${f.id}` }, chipsG);
        chipRects.push(el('rect', { x: PANEL_X, y, width: PANEL_W, height: CHIP_H, rx: 6, fill: tone, 'fill-opacity': 0, stroke: c.border }, g));
        el('text', { x: PANEL_X + 10, y: y + CHIP_H / 2 + 7, 'font-family': fonts.mono, 'font-size': fontSizes.xl, 'font-weight': 700, fill: tone }, g).textContent =
          LETTER[f.id];
        el('text', { x: PANEL_X + 36, y: y + 19, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text }, g).textContent = `${i + 1}. ${labelOf(f.id)}`;
        el('text', { x: PANEL_X + 36, y: y + 36, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted }, g).textContent = chipValue(f);
      });
    };

    const buildVertexLabels = (pts: readonly SrtPoint[]): void => {
      vertexG.replaceChildren();
      vertexLabels.clear();
      for (const p of pts) {
        const label = el('text', { 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.primary }, vertexG);
        label.textContent = p.id;
        vertexLabels.set(p.id, label);
      }
    };

    // 고정 문안
    orderTitle.textContent = t('label.order', 'Order of factors (first listed applies first)');
    matrixTitle.textContent = t('label.matrix', 'Composite matrix');
    shiftColLabel.textContent = t('label.shiftColumn', 'shift column');
    legendText.textContent = t('label.arrival', 'Arrival frame');
    pivotText.textContent = t('label.pivot', 'Pivot');
    matrixBox.setAttribute('data-role', 'matrix');
    shiftColBox.setAttribute('data-role', 'shift-column');

    const clearConclusions = (): void => {
      caption1.textContent = '';
      caption2.textContent = '';
      for (const cell of cells) cell.textContent = '';
      formula.textContent = '';
      matrixBox.setAttribute('stroke', c.border);
      matrixBox.setAttribute('stroke-width', '1');
    };

    const stage: ScaleRotateTranslateStage & ViewInstance = {
      begin(v) {
        stopMotion(true);
        clearConclusions();
        win = v.window;
        unit = Math.min(PLANE.w / (v.window.xMax - v.window.xMin), PLANE.h / (v.window.yMax - v.window.yMin));
        buildGrid(v.window);
        factorIds = v.factors.map((f) => f.id);
        buildChips(v.factors);
        buildVertexLabels(v.shape);
        setChips(-1, 0);
        setMatrix(v.matrix);
        setFormula(0);
        const order = factorIds.map((id) => LETTER[id]).join('→');
        caption1.textContent = t('caption.round', 'Start: the L shape at its first place, M is the identity');
        caption2.textContent = t('caption.roundOrder', 'Order {order}: the first listed applies first', { order });

        const fromShape = shapePts;
        const fromPivot = pivotPt;
        const toShape = v.shape.map((p) => ({ ...p }));
        const toPivot = { x: v.pivot.x, y: v.pivot.y };
        firstShape = toShape;
        shapePts = toShape;
        pivotPt = toPivot;
        if (framePts !== null) drawFrame(framePts);
        else frame.setAttribute('visibility', 'hidden');
        tween(v.durationMs, (u) => {
          drawShape(fromShape === null ? toShape : lerpPts(fromShape, toShape, u));
          drawPivot(
            fromPivot === null
              ? toPivot
              : { x: fromPivot.x + (toPivot.x - fromPivot.x) * u, y: fromPivot.y + (toPivot.y - fromPivot.y) * u },
          );
        });
      },

      compose(v) {
        const from = shapePts;
        if (from === null) throw new Error('scale-rotate-translate-stage: 판 머리 없이 걸음이 왔다');
        const to = v.points.map((p) => ({ ...p }));
        shapePts = to;
        setChips(v.factorIndex, v.factorIndex);
        setMatrix(v.matrix);
        setFormula(v.factorIndex + 1);
        const name = labelOf(v.factor);
        caption1.textContent = t('caption.compose', 'Step {step}: the {factor} matrix multiplies M from the left', {
          step: v.step,
          factor: name,
        });
        caption2.textContent = t('caption.composeShift', 'Shift column of M: {shift}', { shift: fmtPair(v.shiftX, v.shiftY) });
        const arc = v.arc;
        tween(v.durationMs, (u) => {
          if (arc === null) {
            drawShape(lerpPts(from, to, u));
            return;
          }
          if (u >= 1) {
            drawShape(to);
            return;
          }
          // 중심 둘레의 호 — 앞 자리를 중심에 대해 u·각만큼 돌린다 (끝은 받은 자리로 붙는다)
          const a = (arc.degrees * u * Math.PI) / 180;
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          drawShape(
            from.map((p) => {
              const dx = p.x - arc.px;
              const dy = p.y - arc.py;
              return { id: p.id, x: arc.px + cos * dx - sin * dy, y: arc.py + sin * dx + cos * dy };
            }),
          );
        });
      },

      apply(v) {
        const start = framePts ?? firstShape;
        if (start === null) throw new Error('scale-rotate-translate-stage: 판 머리 없이 걸음 4 가 왔다');
        const to = v.points.map((p) => ({ ...p }));
        framePts = to;
        setChips(-1, factorIds.length);
        setMatrix(v.matrix);
        setFormula(factorIds.length);
        matrixBox.setAttribute('stroke', c.accent);
        matrixBox.setAttribute('stroke-width', '2.5');
        caption1.textContent = t('caption.apply', 'Step {step}: one product M·p for each vertex of the first shape', { step: v.step });
        caption2.textContent = t(
          'caption.applyCheck',
          'Vertices on their step {prev} place: {same}/{total} · third coordinate 1: {unit}/{total}',
          { prev: v.step - 1, same: v.same, total: v.total, unit: v.unitW },
        );
        const from = start;
        tween(v.durationMs, (u) => drawFrame(lerpPts(from, to, u)));
      },

      reset() {
        stopMotion(false);
        clearConclusions();
        shapePts = null;
        framePts = null;
        pivotPt = null;
        firstShape = null;
        factorIds = [];
        chipRects.length = 0;
        chipsG.replaceChildren();
        gridG.replaceChildren();
        vertexG.replaceChildren();
        vertexLabels.clear();
        shape.setAttribute('visibility', 'hidden');
        frame.setAttribute('visibility', 'hidden');
        pivotG.setAttribute('visibility', 'hidden');
      },

      destroy() {
        stopMotion(false);
        root.remove();
      },
    };
    return stage;
  },
};
