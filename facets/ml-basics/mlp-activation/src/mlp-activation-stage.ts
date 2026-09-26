/**
 * mlp-activation stage — 입력 평면 위의 경계 o = 0 이 스냅샷을 따라 휘어 간다.
 *
 * 운동: 앞 걸음의 격자 값에서 이 걸음의 격자 값으로 보간하며 매 프레임 경계선(o = 0 등고선)을 다시 긋는다 —
 * 경계의 모양이 옮겨 간다. 단위 선(z_j = 0)도 앞 자리에서 새 자리로 옮겨 가고, 활성화 곡선은 손잡이를 돌리면
 * 앞 종류의 모양에서 새 종류의 모양으로 바뀐다. 손실 선은 한 마디씩 자라고 에폭 표지는 눈금을 따라 미끄러진다.
 *
 * 무대는 셈하지 않는다 — 격자 · 맞힘 · 손실 · 단위 선의 두 끝 · 곡선 표본 · 눈금은 알고리즘이 싣는다.
 * 무대가 하는 것은 앞 값과 새 값을 잇는 보간과 격자 값에서 선을 긋는 일(등고선 그리기)뿐이다.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { MlpActivationFrame, MlpActivationLayout } from './algorithm.js';

const SVG = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 470;

// 입력 평면
const PX0 = 44;
const PY0 = 20;
const PS = 360;
// 오른쪽 판
const RX0 = 440;
const CB = { x0: 440, x1: 580, y0: 66, y1: 146 };
const LX0 = 474;
const LX1 = 700;
const LY0 = 272;
const LY1 = 362;

export type MlpActivationStage = {
  setup(layout: MlpActivationLayout): void;
  show(frame: MlpActivationFrame, ms: number): Promise<void>;
  reset(): void;
  destroy(): void;
};

type Shown = {
  grid: number[];
  units: (number[] | null)[];
  curve: number[];
  markerX: number;
  kind: number;
  width: number;
};

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export const mlpActivationStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const col = getColors(params.theme);
    const [c0, c1] = categorical(2, 'vivid');
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element = svg): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      parent.appendChild(e);
      return e;
    };
    const text = (x: number, y: number, s: string, size: string, fill: string, anchor = 'start', parent: Element = svg, weight = 'normal'): SVGTextElement => {
      const e = el('text', { x, y, 'font-size': size, 'font-family': fonts.body, fill, 'text-anchor': anchor, 'font-weight': weight }, parent);
      e.textContent = s;
      return e;
    };

    let layout: MlpActivationLayout | null = null;
    let shown: Shown | null = null;
    let root: SVGGElement | null = null;
    let destroyed = false;

    // 그리는 자리 — setup 이 짓는다
    let cells: SVGRectElement[] = [];
    let cellSign: number[] = [];
    let contour: SVGPathElement | null = null;
    let unitLines: SVGLineElement[] = [];
    let unitTags: SVGTextElement[] = [];
    let rings: SVGCircleElement[] = [];
    let curvePath: SVGPathElement | null = null;
    let lossPath: SVGPathElement | null = null;
    let lossDot: SVGCircleElement | null = null;
    let marker: SVGGElement | null = null;
    let tickLabels: SVGTextElement[] = [];
    const texts: Record<'activation' | 'width' | 'formula' | 'epoch' | 'correct' | 'loss' | 'caption', SVGTextElement | null> = {
      activation: null, width: null, formula: null, epoch: null, correct: null, loss: null, caption: null,
    };

    // 운동 — 하나만 돈다. 되짚기 · reset 이 오면 끝 상태로 건너뛴다
    let frameId = 0;
    let finishPending: (() => void) | null = null;
    const finishNow = (): void => {
      const f = finishPending;
      if (f) f();
    };
    params.onScrubStart?.(finishNow);

    const animate = (ms: number, draw: (k: number) => void): Promise<void> => {
      finishNow();
      if (ms <= 0 || isInstant() || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const finish = (): void => {
          if (frameId) cancelAnimationFrame(frameId);
          frameId = 0;
          finishPending = null;
          if (!destroyed) draw(1);
          resolve();
        };
        finishPending = finish;
        const tick = (now: number): void => {
          if (destroyed || isInstant()) return finish();
          const k = Math.min(1, (now - start) / ms);
          if (k >= 1) return finish();
          draw(ease(k));
          frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
      });
    };

    // 좌표
    const need = (): MlpActivationLayout => {
      if (!layout) throw new Error('[mlp-activation-stage] setup 전에 걸음이 왔다');
      return layout;
    };
    const sx = (x1: number): number => {
      const [lo, hi] = need().plane;
      return PX0 + ((x1 - lo) / (hi - lo)) * PS;
    };
    const sy = (x2: number): number => {
      const [lo, hi] = need().plane;
      return PY0 + PS - ((x2 - lo) / (hi - lo)) * PS;
    };
    const lossX = (k: number): number => LX0 + (k * (LX1 - LX0)) / (need().snapshots.length - 1);
    const lossY = (v: number): number => LY1 - (v / need().lossTop) * (LY1 - LY0);

    const clear = (): void => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      finishNow();
      if (root) root.remove();
      root = null;
      shown = null;
      cells = [];
      cellSign = [];
      contour = null;
      unitLines = [];
      unitTags = [];
      rings = [];
      curvePath = null;
      lossPath = null;
      lossDot = null;
      marker = null;
      tickLabels = [];
      for (const k of Object.keys(texts) as (keyof typeof texts)[]) texts[k] = null;
    };

    const setup = (lay: MlpActivationLayout): void => {
      clear();
      layout = lay;
      const g = el('g', {});
      root = g;
      const N = lay.gridSteps;
      const cell = PS / N;

      // 평면 — 격자 칸(켜짐 쪽 · 꺼짐 쪽의 옅은 칠)
      const cellLayer = el('g', {}, g);
      for (let gy = 0; gy < N; gy += 1) {
        for (let gx = 0; gx < N; gx += 1) {
          cells.push(el('rect', { x: PX0 + gx * cell, y: PY0 + PS - (gy + 1) * cell, width: cell + 0.3, height: cell + 0.3, fill: col.bg, 'fill-opacity': 0.16 }, cellLayer));
          cellSign.push(0);
        }
      }
      el('rect', { x: PX0, y: PY0, width: PS, height: PS, fill: 'none', stroke: col.border }, g);
      for (const v of lay.planeTicks) {
        el('line', { x1: sx(v), y1: PY0, x2: sx(v), y2: PY0 + PS, stroke: col.border, 'stroke-width': v === 0 ? 1 : 0.5 }, g);
        el('line', { x1: PX0, y1: sy(v), x2: PX0 + PS, y2: sy(v), stroke: col.border, 'stroke-width': v === 0 ? 1 : 0.5 }, g);
        text(sx(v), PY0 + PS + 14, String(v), fontSizes.xs, col.textMuted, 'middle', g);
        text(PX0 - 6, sy(v) + 4, String(v), fontSizes.xs, col.textMuted, 'end', g);
      }
      text(PX0 + PS, PY0 + PS + 28, t('label.x1', 'x₁'), fontSizes.sm, col.textMuted, 'end', g);
      text(PX0 - 30, PY0 + 10, t('label.x2', 'x₂'), fontSizes.sm, col.textMuted, 'start', g);

      // 단위 선 (z_j = 0) — 가장 큰 폭만큼 자리를 둔다
      const unitLayer = el('g', {}, g);
      for (let j = 0; j < lay.maxWidth; j += 1) {
        unitLines.push(el('line', { x1: 0, y1: 0, x2: 0, y2: 0, stroke: col.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '5 4', visibility: 'hidden' }, unitLayer));
        unitTags.push(text(0, 0, String(j + 1), fontSizes.xs, col.textMuted, 'middle', unitLayer, 'bold'));
        unitTags[j].setAttribute('visibility', 'hidden');
      }
      // 경계 o = 0
      contour = el('path', { d: '', fill: 'none', stroke: col.primary, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);

      // 점 열둘 — y 0 은 동그라미 · y 1 은 네모. 틀린 점은 빨간 고리
      const ptLayer = el('g', {}, g);
      for (const q of lay.points) {
        const x = sx(q.x1);
        const y = sy(q.x2);
        rings.push(el('circle', { cx: x, cy: y, r: 10, fill: 'none', stroke: col.danger, 'stroke-width': 2.2, visibility: 'hidden' }, ptLayer));
        if (q.y === 0) el('circle', { cx: x, cy: y, r: 5.5, fill: c0, stroke: col.bg, 'stroke-width': 1.2 }, ptLayer);
        else el('rect', { x: x - 5, y: y - 5, width: 10, height: 10, fill: c1, stroke: col.bg, 'stroke-width': 1.2 }, ptLayer);
      }

      // 범례
      const ly = PY0 + PS + 50;
      el('circle', { cx: PX0 + 6, cy: ly - 4, r: 5, fill: c0 }, g);
      text(PX0 + 16, ly, t('label.class0', 'y = 0'), fontSizes.xs, col.text, 'start', g);
      el('rect', { x: PX0 + 70, y: ly - 9, width: 10, height: 10, fill: c1 }, g);
      text(PX0 + 86, ly, t('label.class1', 'y = 1'), fontSizes.xs, col.text, 'start', g);
      el('circle', { cx: PX0 + 146, cy: ly - 4, r: 6, fill: 'none', stroke: col.danger, 'stroke-width': 2 }, g);
      text(PX0 + 158, ly, t('label.wrong', 'Misclassified'), fontSizes.xs, col.text, 'start', g);
      el('line', { x1: PX0 + 270, y1: ly - 4, x2: PX0 + 292, y2: ly - 4, stroke: col.primary, 'stroke-width': 3 }, g);
      text(PX0 + 298, ly, t('label.boundary', 'Boundary o = 0'), fontSizes.xs, col.text, 'start', g);
      el('line', { x1: PX0 + 420, y1: ly - 4, x2: PX0 + 442, y2: ly - 4, stroke: col.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }, g);
      text(PX0 + 448, ly, t('label.unitLines', 'Unit lines zⱼ = 0'), fontSizes.xs, col.text, 'start', g);

      // 오른쪽 — 손잡이 상태 · 활성화 곡선
      texts.activation = text(RX0, 24, '', fontSizes.md, col.text, 'start', g, 'bold');
      texts.width = text(RX0, 44, '', fontSizes.md, col.text, 'start', g);
      el('rect', { x: CB.x0, y: CB.y0, width: CB.x1 - CB.x0, height: CB.y1 - CB.y0, fill: col.bgSubtle, stroke: col.border }, g);
      const [clo, chi] = lay.curveRange;
      const cxz = CB.x0 + ((0 - clo) / (chi - clo)) * (CB.x1 - CB.x0);
      const cyz = CB.y1 - ((0 - clo) / (chi - clo)) * (CB.y1 - CB.y0);
      el('line', { x1: CB.x0, y1: cyz, x2: CB.x1, y2: cyz, stroke: col.border }, g);
      el('line', { x1: cxz, y1: CB.y0, x2: cxz, y2: CB.y1, stroke: col.border }, g);
      text(CB.x1 + 4, cyz + 4, t('label.z', 'z'), fontSizes.xs, col.textMuted, 'start', g);
      curvePath = el('path', { d: '', fill: 'none', stroke: col.itemActive, 'stroke-width': 2.2 }, g);
      texts.formula = text(CB.x0, CB.y1 + 18, '', fontSizes.sm, col.text, 'start', g);
      text(CB.x0, CB.y1 + 36, t('formula.net', 'o = c + Σ vⱼ·act(zⱼ)'), fontSizes.sm, col.textMuted, 'start', g);

      // 에폭 · 맞힌 수 · 손실
      texts.epoch = text(RX0, 212, '', fontSizes.md, col.text, 'start', g);
      texts.correct = text(RX0, 232, '', fontSizes.md, col.text, 'start', g, 'bold');
      texts.loss = text(RX0, 252, '', fontSizes.md, col.text, 'start', g);

      // 손실 선 — 눈금은 사다리 전체로 고정
      text(LX0, LY0 - 6, t('label.lossAxis', 'Mean cross-entropy'), fontSizes.xs, col.textMuted, 'start', g);
      for (const v of lay.lossTicks) {
        el('line', { x1: LX0, y1: lossY(v), x2: LX1, y2: lossY(v), stroke: col.border, 'stroke-width': 0.6 }, g);
        text(LX0 - 5, lossY(v) + smPx / 3, v.toFixed(1), fontSizes.xs, col.textMuted, 'end', g);
      }
      lay.snapshots.forEach((e, k) => {
        el('line', { x1: lossX(k), y1: LY1, x2: lossX(k), y2: LY1 + 4, stroke: col.textMuted }, g);
        tickLabels.push(text(lossX(k), LY1 + 16, String(e), fontSizes.xs, col.textMuted, 'middle', g));
      });
      text((LX0 + LX1) / 2, LY1 + 32, t('label.epochAxis', 'Epoch'), fontSizes.xs, col.textMuted, 'middle', g);
      marker = el('g', { visibility: 'hidden' }, g);
      el('line', { x1: 0, y1: LY0 - 2, x2: 0, y2: LY1, stroke: col.accent, 'stroke-width': 2 }, marker);
      el('path', { d: `M 0 ${LY1 + 1} l -5 -7 l 10 0 z`, fill: col.accent, stroke: col.text, 'stroke-width': 0.6 }, marker);
      lossPath = el('path', { d: '', fill: 'none', stroke: col.primary, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
      lossDot = el('circle', { cx: 0, cy: 0, r: 4, fill: col.primary, visibility: 'hidden' }, g);

      texts.caption = text(PX0 - 30, H - 12, '', fontSizes.md, col.text, 'start', g);
    };

    // ── 그리기 ──

    /** 격자 칸의 칠 — 네 귀 평균의 부호. 바뀐 칸만 고친다 */
    const paintCells = (grid: number[]): void => {
      const N = need().gridSteps;
      for (let gy = 0; gy < N; gy += 1) {
        for (let gx = 0; gx < N; gx += 1) {
          const a = grid[gy * (N + 1) + gx] + grid[gy * (N + 1) + gx + 1] + grid[(gy + 1) * (N + 1) + gx] + grid[(gy + 1) * (N + 1) + gx + 1];
          const s = a > 0 ? 1 : -1;
          const idx = gy * N + gx;
          if (cellSign[idx] !== s) {
            cellSign[idx] = s;
            cells[idx].setAttribute('fill', s > 0 ? c1 : c0);
          }
        }
      }
    };

    /** 등고선 o = 0 — 격자 값에서 선을 긋는다 (칸마다 부호가 갈리는 변을 잇는다) */
    const drawContour = (grid: number[]): void => {
      const N = need().gridSteps;
      const cell = PS / N;
      const parts: string[] = [];
      const val = (gx: number, gy: number): number => grid[gy * (N + 1) + gx];
      for (let gy = 0; gy < N; gy += 1) {
        for (let gx = 0; gx < N; gx += 1) {
          const v00 = val(gx, gy);
          const v10 = val(gx + 1, gy);
          const v11 = val(gx + 1, gy + 1);
          const v01 = val(gx, gy + 1);
          const px = (x: number): number => PX0 + x * cell;
          const py = (y: number): number => PY0 + PS - y * cell;
          const cut: number[][] = [];
          const edge = (va: number, vb: number, ax: number, ay: number, bx: number, by: number): void => {
            if (va > 0 === vb > 0) return;
            const k = va / (va - vb);
            cut.push([px(ax + (bx - ax) * k), py(ay + (by - ay) * k)]);
          };
          edge(v00, v10, gx, gy, gx + 1, gy);
          edge(v10, v11, gx + 1, gy, gx + 1, gy + 1);
          edge(v11, v01, gx + 1, gy + 1, gx, gy + 1);
          edge(v01, v00, gx, gy + 1, gx, gy);
          if (cut.length === 2) {
            parts.push(`M${cut[0][0].toFixed(1)} ${cut[0][1].toFixed(1)}L${cut[1][0].toFixed(1)} ${cut[1][1].toFixed(1)}`);
          } else if (cut.length === 4) {
            // 안장 칸 — 가운데 평균의 부호로 짝을 고른다
            const mid = (v00 + v10 + v11 + v01) / 4;
            const pairs = mid > 0 === v00 > 0 ? [[0, 3], [1, 2]] : [[0, 1], [2, 3]];
            for (const [a, b] of pairs) {
              parts.push(`M${cut[a][0].toFixed(1)} ${cut[a][1].toFixed(1)}L${cut[b][0].toFixed(1)} ${cut[b][1].toFixed(1)}`);
            }
          }
        }
      }
      contour?.setAttribute('d', parts.join(''));
    };

    const drawCurve = (curve: number[]): void => {
      const [clo, chi] = need().curveRange;
      const n = curve.length;
      const pts = curve.map((h, k) => {
        const x = CB.x0 + (k / (n - 1)) * (CB.x1 - CB.x0);
        const hv = Math.max(clo, Math.min(chi, h));
        const y = CB.y1 - ((hv - clo) / (chi - clo)) * (CB.y1 - CB.y0);
        return `${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      curvePath?.setAttribute('d', `M${pts.join('L')}`);
    };

    const placeUnit = (j: number, seg: number[] | null): void => {
      const line = unitLines[j];
      const tag = unitTags[j];
      if (!seg) {
        line.setAttribute('visibility', 'hidden');
        tag.setAttribute('visibility', 'hidden');
        return;
      }
      line.setAttribute('x1', sx(seg[0]).toFixed(1));
      line.setAttribute('y1', sy(seg[1]).toFixed(1));
      line.setAttribute('x2', sx(seg[2]).toFixed(1));
      line.setAttribute('y2', sy(seg[3]).toFixed(1));
      line.setAttribute('visibility', 'visible');
      // 번호는 선의 한 끝에서 조금 안쪽
      const tx = mix(sx(seg[2]), sx(seg[0]), 0.08);
      const ty = mix(sy(seg[3]), sy(seg[1]), 0.08);
      tag.setAttribute('x', tx.toFixed(1));
      tag.setAttribute('y', (ty - 4).toFixed(1));
      tag.setAttribute('visibility', 'visible');
    };

    /** 두 끝의 짝을 가까운 쪽으로 맞춘다 — 자른 끝의 차례가 바뀌어도 선이 뒤집히며 돌지 않게 */
    const align = (from: number[], to: number[]): number[] => {
      const d = (a: number, b: number, c: number, e: number): number => Math.hypot(a - c, b - e);
      const straight = d(from[0], from[1], to[0], to[1]) + d(from[2], from[3], to[2], to[3]);
      const crossed = d(from[0], from[1], to[2], to[3]) + d(from[2], from[3], to[0], to[1]);
      return crossed < straight ? [to[2], to[3], to[0], to[1]] : to;
    };

    const drawLoss = (losses: number[], grow: number): void => {
      const n = losses.length;
      const pts: number[][] = losses.map((v, k) => [lossX(k), lossY(v)]);
      if (n >= 2) {
        const a = pts[n - 2];
        const b = pts[n - 1];
        pts[n - 1] = [mix(a[0], b[0], grow), mix(a[1], b[1], grow)];
      }
      lossPath?.setAttribute('d', pts.length >= 2 ? `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}` : '');
      const last = pts[n - 1];
      lossDot?.setAttribute('cx', last[0].toFixed(1));
      lossDot?.setAttribute('cy', last[1].toFixed(1));
      lossDot?.setAttribute('visibility', 'visible');
    };

    const kindName = (kind: number): string => {
      if (kind === 0) return t('label.kind.none', 'None');
      if (kind === 1) return t('label.kind.relu', 'ReLU');
      if (kind === 2) return t('label.kind.sigmoid', 'Sigmoid');
      throw new Error(`[mlp-activation-stage] 모르는 활성화 종류: ${kind}`);
    };
    const formula = (kind: number): string => {
      if (kind === 0) return t('formula.none', 'act(z) = z');
      if (kind === 1) return t('formula.relu', 'ReLU(z) = max(0, z)');
      if (kind === 2) return t('formula.sigmoid', 'σ(z) = 1 / (1 + e^−z)');
      throw new Error(`[mlp-activation-stage] 모르는 활성화 종류: ${kind}`);
    };

    const setText = (k: keyof typeof texts, s: string): void => {
      const e = texts[k];
      if (e) e.textContent = s;
    };

    const show = (fr: MlpActivationFrame, ms: number): Promise<void> => {
      const lay = need();
      const N = lay.gridSteps;
      if (fr.grid.length !== (N + 1) * (N + 1)) throw new Error('[mlp-activation-stage] 격자 크기가 맞지 않는다');
      if (fr.correct.length !== lay.points.length) throw new Error('[mlp-activation-stage] 점 수가 맞지 않는다');
      if (fr.units.length > lay.maxWidth) throw new Error('[mlp-activation-stage] 단위가 자리보다 많다');
      const from = shown;
      const toMarker = lossX(fr.step);

      // 손잡이 상태는 곧바로 — 이 판의 조건이다
      setText('activation', t('label.activation', 'Activation: {name}', { name: kindName(fr.kind) }));
      setText('width', t('label.width', 'Hidden width: {n}', { n: fr.width }));
      setText('formula', formula(fr.kind));
      if (fr.step === 0) {
        // 새 판의 머리 — 앞 판의 결론(틀린 점 · 수 · 손실 선)을 걷는다
        for (const r of rings) r.setAttribute('visibility', 'hidden');
        setText('epoch', '');
        setText('correct', '');
        setText('loss', '');
        setText('caption', '');
        lossPath?.setAttribute('d', '');
        lossDot?.setAttribute('visibility', 'hidden');
      }
      // 폭이 줄면 남는 단위 선을 걷는다
      for (let j = fr.units.length; j < lay.maxWidth; j += 1) placeUnit(j, null);
      const unitTo = fr.units.map((seg, j) => {
        const prev = from && j < from.units.length ? from.units[j] : null;
        return seg && prev ? align(prev, seg) : seg;
      });
      marker?.setAttribute('visibility', 'visible');
      tickLabels.forEach((e, k) => {
        e.setAttribute('fill', k === fr.step ? col.text : col.textMuted);
        e.setAttribute('font-weight', k === fr.step ? 'bold' : 'normal');
      });

      const draw = (k: number): void => {
        const grid = from ? fr.grid.map((v, i) => mix(from.grid[i], v, k)) : fr.grid;
        paintCells(grid);
        drawContour(grid);
        unitTo.forEach((seg, j) => {
          const prev = from && j < from.units.length ? from.units[j] : null;
          if (seg && prev) placeUnit(j, seg.map((v, i) => mix(prev[i], v, k)));
          else placeUnit(j, seg);
        });
        const curve = from && from.curve.length === fr.curve.length ? fr.curve.map((v, i) => mix(from.curve[i], v, k)) : fr.curve;
        drawCurve(curve);
        const mx = from ? mix(from.markerX, toMarker, k) : toMarker;
        marker?.setAttribute('transform', `translate(${mx.toFixed(1)} 0)`);
        drawLoss(fr.losses, fr.step === 0 ? 1 : k);
        if (k >= 1) {
          // 운동이 끝난 자리 — 이 걸음의 판정 · 수
          fr.correct.forEach((ok, i) => rings[i].setAttribute('visibility', ok ? 'hidden' : 'visible'));
          setText('epoch', t('label.epoch', 'Epoch: {epoch}', { epoch: fr.epoch }));
          setText('correct', t('label.correct', 'Correct: {right} / {total}', { right: fr.right, total: fr.total }));
          setText('loss', t('label.loss', 'Loss: {loss}', { loss: fr.loss.toFixed(3) }));
          const last = fr.step === lay.snapshots.length - 1;
          if (fr.step === 0) setText('caption', t('caption.start', 'Same initial weights, before any training'));
          else if (last) setText('caption', t('caption.end', 'Training is over. Turn a knob to train again from the same initial weights'));
          else setText('caption', t('caption.train', 'Full-batch gradient descent keeps adjusting every weight'));
        }
      };
      shown = { grid: fr.grid, units: unitTo, curve: fr.curve, markerX: toMarker, kind: fr.kind, width: fr.width };
      return animate(from ? ms : 0, draw);
    };

    const inst: ViewInstance & MlpActivationStage = {
      setup,
      show,
      reset(): void {
        clear();
        layout = null;
      },
      destroy(): void {
        destroyed = true;
        clear();
      },
    };
    return inst;
  },
};
