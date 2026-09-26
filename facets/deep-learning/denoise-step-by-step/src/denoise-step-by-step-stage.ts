/**
 * denoise-step-by-step stage — 걷어낸다.
 *
 * 위: 계단. x_T 부터 x_0 까지 한 칸씩 내려서며, 걷어낼 때마다 새 그림이 한 계단 아래로 내려앉는다.
 * 가운데: 칸마다 수직선 하나. x_t(점)가 예측이 가리킨 평균 쪽으로 끌려가고(덜어 냄) 새 잡음만큼 튄다.
 *        x̂₀(마름모)는 예측마다 자료 P · Q 사이에서 한쪽으로 옮겨 선다.
 * 아래: 무게 띠 — 예측기가 자료 각각에 준 몫. 옆에 x̂₀ 의 그림과 자료의 그림.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { DenoisePrediction, DenoiseScene, DenoiseSampleView } from './scene.js';

const H = 440;
const W = PIECE_CANVAS_W;
const PAD = 20;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 수직선의 값 범위의 바닥 — 장면 값이 이보다 크면 장면에서 넓힌다 */
const MIN_SPAN = 1.6;
const AX0 = 56;
const AX1 = 392;

const PREDICT_MS = 380;
const DENOISE_MS = 400;
/** 걷어냄 운동에서 평균까지 끌려가는 몫 — 나머지가 새 잡음의 튐 */
const PULL_SHARE = 0.55;

const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

function subscript(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUB[Number(c)] ?? c)
    .join('');
}

function r2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function fmt(v: number, digits = 2): string {
  const s = v.toFixed(digits);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 장면에 놓일 모든 값을 담는 대칭 범위 ±span */
function sceneSpan(scene: DenoiseScene): number {
  const values: number[] = [];
  for (const x of scene.trail) values.push(...x);
  for (const smp of scene.samples) values.push(...smp.cells);
  if (scene.pred !== null) values.push(...scene.pred.x0Hat);
  const step = scene.step;
  if (step.kind === 'denoise') values.push(...step.from, ...step.mean);
  if (step.kind === 'predict' && step.was !== null) values.push(...step.was.x0Hat);
  let top = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) throw new Error('denoise-step-by-step stage: 수가 아닌 값');
    top = Math.max(top, Math.abs(v));
  }
  return Math.max(MIN_SPAN, Math.ceil((top + 0.2) * 10) / 10);
}

function mapX(v: number, span: number): number {
  if (Math.abs(v) > span) throw new Error(`denoise-step-by-step stage: 값 ${v} 가 범위 ±${span} 밖이다`);
  return r2(AX0 + ((v + span) / (2 * span)) * (AX1 - AX0));
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function shade(v: number): string {
  return String(Math.round(clamp((v + 1.25) / 2.5, 0.05, 1) * 1000) / 1000);
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el(parent, 'text', { x: r2(x), y: r2(y), ...attrs });
  node.textContent = content;
  return node;
}

type Handles = {
  dots: SVGCircleElement[];
  diamonds: SVGPolygonElement[];
  pulls: SVGLineElement[];
  heads: (SVGPolygonElement | null)[];
  kicks: SVGLineElement[];
  newThumb: SVGGElement | null;
  segments: SVGRectElement[];
  x0Cells: SVGRectElement[];
};

export const denoiseStepByStepStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // initialData 는 읽지 않는다 — 장면이 오면 그때 그린다 (없어도 던지지 않는다)

    function thumb(
      parent: Element,
      cx: number,
      top: number,
      size: number,
      cells: readonly number[],
      stroke: string,
      strokeW: number,
      collect?: SVGRectElement[],
    ): SVGGElement {
      const g = el(parent, 'g', {});
      const cols = Math.ceil(Math.sqrt(cells.length));
      const rows = Math.ceil(cells.length / cols);
      const cw = size / cols;
      const ch = size / rows;
      const x0 = cx - size / 2;
      el(g, 'rect', { x: r2(x0), y: r2(top), width: r2(size), height: r2(size), fill: colors.bg, stroke: 'none' });
      cells.forEach((v, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const cell = el(g, 'rect', {
          x: r2(x0 + c * cw),
          y: r2(top + r * ch),
          width: r2(cw),
          height: r2(ch),
          fill: colors.text,
          'fill-opacity': shade(v),
        });
        collect?.push(cell);
      });
      el(g, 'rect', {
        x: r2(x0),
        y: r2(top),
        width: r2(size),
        height: r2(size),
        fill: 'none',
        stroke,
        'stroke-width': strokeW,
      });
      return g;
    }

    function stairGeom(total: number): { colW: number; drop: number; size: number } {
      const n = total + 1;
      const colW = (W - 2 * PAD) / n;
      return { colW, drop: 50 / Math.max(1, n - 1), size: Math.min(46, colW * 0.5) };
    }

    function treadY(k: number, drop: number): number {
      return 66 + k * drop;
    }

    function drawStatic(scene: DenoiseScene): Handles {
      svg.textContent = '';
      const handles: Handles = {
        dots: [],
        diamonds: [],
        pulls: [],
        heads: [],
        kicks: [],
        newThumb: null,
        segments: [],
        x0Cells: [],
      };
      const samples: readonly DenoiseSampleView[] = scene.samples;
      const cat = categorical(samples.length);
      const catOf = (k: number): string => {
        const c = cat[k];
        if (c === undefined) throw new Error(`denoise-step-by-step stage: 자료 ${k} 의 색이 없다`);
        return c;
      };
      const current = scene.trail[scene.trail.length - 1];
      if (current === undefined) throw new Error('denoise-step-by-step stage: 선 x_t 가 없다');
      const span = sceneSpan(scene);
      const curK = scene.trail.length - 1;
      const tNow = scene.total - curK;
      const step = scene.step;

      // ── 계단 ────────────────────────────────────────────
      const { colW, drop, size } = stairGeom(scene.total);
      const stairLayer = el(svg, 'g', {});
      let path = '';
      for (let k = 0; k <= scene.total; k += 1) {
        const y = treadY(k, drop);
        const xa = PAD + k * colW;
        const xb = PAD + (k + 1) * colW;
        path += `${k === 0 ? 'M' : 'L'}${r2(xa)} ${r2(y)} L${r2(xb)} ${r2(y)} `;
      }
      el(stairLayer, 'path', { d: path.trim(), fill: 'none', stroke: colors.border, 'stroke-width': 1.5 });
      for (let k = 0; k <= scene.total; k += 1) {
        const cx = PAD + (k + 0.5) * colW;
        const y = treadY(k, drop);
        const top = y - size - 4;
        const x = scene.trail[k];
        if (x === undefined) {
          el(stairLayer, 'rect', {
            x: r2(cx - size / 2),
            y: r2(top),
            width: r2(size),
            height: r2(size),
            fill: 'none',
            stroke: colors.border,
            'stroke-dasharray': '3 3',
          });
        } else {
          const isCur = k === curK;
          const g = thumb(stairLayer, cx, top, size, x, isCur ? colors.accent : colors.border, isCur ? 2.5 : 1);
          if (isCur && step.kind === 'denoise') handles.newThumb = g;
        }
        label(stairLayer, cx, y + 15, `x${subscript(scene.total - k)}`, {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: k === curK ? colors.text : colors.textMuted,
          'font-weight': k === curK ? 700 : 400,
        });
      }

      // ── 칸마다 수직선 ───────────────────────────────────
      const dim = current.length;
      const laneTop = 170;
      const laneH = Math.min(40, 160 / dim);
      const colX = [424, 477, 530, 584];
      const headY = 158;
      const headAttrs = {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      };
      label(svg, colX[0]!, headY, `x${subscript(tNow)}`, headAttrs);
      label(svg, colX[1]!, headY, 'ε̂', headAttrs);
      label(svg, colX[2]!, headY, 'x̂₀', headAttrs);
      if (step.kind === 'denoise') label(svg, colX[3]!, headY, 'μ', headAttrs);

      const pred: DenoisePrediction | null = scene.pred;
      const predFresh = pred !== null && step.kind === 'predict';
      const laneLayer = el(svg, 'g', {});
      for (let i = 0; i < dim; i += 1) {
        const cy = laneTop + (i + 0.5) * laneH;
        label(laneLayer, PAD + 6, cy + smPx * 0.35, String(i + 1), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        el(laneLayer, 'line', { x1: AX0, y1: r2(cy), x2: AX1, y2: r2(cy), stroke: colors.border, 'stroke-width': 1 });
        for (const v of [-1, 0, 1]) {
          el(laneLayer, 'line', {
            x1: mapX(v, span),
            y1: r2(cy - 3),
            x2: mapX(v, span),
            y2: r2(cy + 3),
            stroke: colors.border,
            'stroke-width': 1,
          });
        }
        // 자료 P · Q 의 자리 — 같은 값이면 글자를 나란히
        const groups = new Map<number, number[]>();
        samples.forEach((s, k) => {
          const v = s.cells[i];
          if (v === undefined) throw new Error('denoise-step-by-step stage: 자료의 칸 수가 맞지 않는다');
          const list = groups.get(v) ?? [];
          list.push(k);
          groups.set(v, list);
        });
        for (const [v, ks] of groups) {
          const x = mapX(v, span);
          ks.forEach((k, j) => {
            const sample = samples[k]!;
            el(laneLayer, 'line', {
              x1: x,
              y1: r2(cy - 8),
              x2: x,
              y2: r2(cy + 8),
              stroke: catOf(k),
              'stroke-width': 2,
            });
            label(laneLayer, x + (j - (ks.length - 1) / 2) * 10, cy - 11, sample.id, {
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              'font-weight': 700,
              fill: catOf(k),
            });
          });
        }

        // 걷어냄: 출발 자리 · 덜어 낸 몫(출발 → 평균) · 새 잡음(평균 → 도착)
        if (step.kind === 'denoise') {
          const fromV = step.from[i];
          const meanV = step.mean[i];
          if (fromV === undefined || meanV === undefined) throw new Error('denoise-step-by-step stage: 벡터 길이가 맞지 않는다');
          const fx = mapX(fromV, span);
          const mx = mapX(meanV, span);
          el(laneLayer, 'circle', { cx: fx, cy: r2(cy), r: 5, fill: 'none', stroke: colors.ghostOutline, 'stroke-width': 1.5 });
          handles.pulls.push(
            el(laneLayer, 'line', {
              x1: fx,
              y1: r2(cy),
              x2: mx,
              y2: r2(cy),
              stroke: colors.itemComparing,
              'stroke-width': 3,
            }),
          );
          if (Math.abs(mx - fx) > 7) {
            const dir = mx > fx ? 1 : -1;
            handles.heads.push(
              el(laneLayer, 'polygon', {
                points: `0,0 ${-7 * dir},-4.5 ${-7 * dir},4.5`,
                fill: colors.itemComparing,
                transform: `translate(${mx} ${r2(cy)})`,
              }),
            );
          } else {
            handles.heads.push(null);
          }
          handles.kicks.push(
            el(laneLayer, 'line', {
              x1: mx,
              y1: r2(cy),
              x2: mapX(current[i]!, span),
              y2: r2(cy),
              stroke: colors.textMuted,
              'stroke-width': 1.5,
              'stroke-dasharray': '3 2',
            }),
          );
        }

        if (pred !== null) {
          const v = pred.x0Hat[i];
          if (v === undefined) throw new Error('denoise-step-by-step stage: x̂₀ 의 길이가 맞지 않는다');
          handles.diamonds.push(
            el(laneLayer, 'polygon', {
              points: '0,-7 7,0 0,7 -7,0',
              fill: colors.accent,
              stroke: colors.stateInk,
              'stroke-width': 1,
              transform: `translate(${mapX(v, span)} ${r2(cy)})`,
            }),
          );
        }
        handles.dots.push(el(laneLayer, 'circle', { cx: mapX(current[i]!, span), cy: r2(cy), r: 5.5, fill: colors.text }));

        // 값 기둥
        const valAttrs = (fresh: boolean): Record<string, string | number> => ({
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: fresh ? colors.text : colors.textMuted,
        });
        const baseY = cy + smPx * 0.35;
        label(laneLayer, colX[0]!, baseY, fmt(current[i]!), valAttrs(true));
        if (pred !== null) {
          label(laneLayer, colX[1]!, baseY, fmt(pred.epsHat[i]!), valAttrs(predFresh));
          label(laneLayer, colX[2]!, baseY, fmt(pred.x0Hat[i]!), valAttrs(predFresh));
        }
        if (step.kind === 'denoise') label(laneLayer, colX[3]!, baseY, fmt(step.mean[i]!), valAttrs(true));
      }
      // 눈금 글자는 마지막 수직선 아래에만
      const lastCy = laneTop + (dim - 0.5) * laneH;
      for (const v of [-1, 0, 1]) {
        label(laneLayer, mapX(v, span), lastCy + 8 + xsPx, fmt(v, 0), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      }

      // ── 무게 띠 ─────────────────────────────────────────
      const barY = 356;
      const barH = 16;
      label(svg, AX0, barY - 6, t('label.weight', 'Weight'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      const x0ThumbSize = 28;
      if (pred !== null) {
        thumb(svg, PAD + 16, barY - 6, x0ThumbSize, pred.x0Hat, colors.accent, 2, handles.x0Cells);
      } else {
        el(svg, 'rect', {
          x: PAD + 2,
          y: barY - 6,
          width: x0ThumbSize,
          height: x0ThumbSize,
          fill: 'none',
          stroke: colors.border,
          'stroke-dasharray': '3 3',
        });
      }
      label(svg, PAD + 16, barY + x0ThumbSize + 8, 'x̂₀', {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      if (pred !== null) {
        let acc = AX0;
        pred.weights.forEach((w, k) => {
          const width = w * (AX1 - AX0);
          handles.segments.push(
            el(svg, 'rect', { x: r2(acc), y: barY, width: r2(width), height: barH, fill: catOf(k) }),
          );
          acc += width;
        });
      }
      el(svg, 'rect', { x: AX0, y: barY, width: AX1 - AX0, height: barH, fill: 'none', stroke: colors.border });

      // 자료의 그림 · 무게
      const itemW = (W - PAD - 420) / samples.length;
      samples.forEach((s, k) => {
        const x = 420 + k * itemW;
        thumb(svg, x + 12, barY - 4, 24, s.cells, catOf(k), 2);
        label(svg, x + 30, barY + 6, s.id, {
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: catOf(k),
        });
        if (pred !== null) {
          const w = pred.weights[k];
          if (w === undefined) throw new Error('denoise-step-by-step stage: 무게 수가 자료 수와 다르다');
          label(svg, x + 30, barY + 20, fmt(w), {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: predFresh ? colors.text : colors.textMuted,
          });
        }
      });

      // ── 캡션 ────────────────────────────────────────────
      let caption: string;
      if (step.kind === 'start') {
        caption = t('caption.start', 'Start from pure noise · t {t}', { t: step.tIndex });
      } else if (step.kind === 'predict') {
        caption = t('caption.predict', 't {t}: guess the noise ε̂ and the clean picture x̂₀ it implies', {
          t: step.tIndex,
        });
      } else if (step.tIndex > 1) {
        caption = t('caption.denoise', 't {from} → {to}: remove part of the guessed noise, add fresh noise · σ {sigma}', {
          from: step.tIndex,
          to: step.tIndex - 1,
          sigma: fmt(step.sigma),
        });
      } else {
        let near = 0;
        let far = 0;
        step.distances.forEach((d, k) => {
          if (d < step.distances[near]!) near = k;
          if (d > step.distances[far]!) far = k;
        });
        const nearS = samples[near];
        const farS = samples[far];
        if (nearS === undefined || farS === undefined) throw new Error('denoise-step-by-step stage: 거리 수가 자료 수와 다르다');
        caption = t(
          'caption.last',
          't {from} → {to}: remove the guessed noise, no fresh noise · distance {near} {dNear} · {far} {dFar}',
          {
            from: step.tIndex,
            to: step.tIndex - 1,
            near: nearS.id,
            dNear: fmt(step.distances[near]!),
            far: farS.id,
            dFar: fmt(step.distances[far]!),
          },
        );
      }
      label(svg, PAD, H - 18, caption, {
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      return handles;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: DenoiseScene, _prev: DenoiseScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      if (!opts.animate) return;
      const step = next.step;
      const current = next.trail[next.trail.length - 1];
      if (current === undefined) throw new Error('denoise-step-by-step stage: 선 x_t 가 없다');
      const span = sceneSpan(next);
      const dim = current.length;
      const laneTop = 170;
      const laneH = Math.min(40, 160 / dim);

      if (step.kind === 'predict' && next.pred !== null) {
        const pred = next.pred;
        const was = step.was;
        const fromX0 = was !== null ? was.x0Hat : current;
        await tween(PREDICT_MS, mine, (p) => {
          for (let i = 0; i < dim; i += 1) {
            const cy = r2(laneTop + (i + 0.5) * laneH);
            const d = h.diamonds[i];
            if (d !== undefined) d.setAttribute('transform', `translate(${r2(lerp(mapX(fromX0[i]!, span), mapX(pred.x0Hat[i]!, span), p))} ${cy})`);
            const c = h.x0Cells[i];
            if (c !== undefined) c.setAttribute('fill-opacity', shade(lerp(fromX0[i]!, pred.x0Hat[i]!, p)));
          }
          let acc = AX0;
          h.segments.forEach((seg, k) => {
            const w = was !== null ? lerp(was.weights[k]!, pred.weights[k]!, p) : pred.weights[k]! * p;
            const width = w * (AX1 - AX0);
            seg.setAttribute('x', String(r2(acc)));
            seg.setAttribute('width', String(r2(width)));
            acc += width;
          });
        });
      } else if (step.kind === 'denoise') {
        const { colW, drop } = stairGeom(next.total);
        await tween(DENOISE_MS, mine, (p) => {
          const pull = Math.min(1, p / PULL_SHARE);
          const kick = Math.max(0, (p - PULL_SHARE) / (1 - PULL_SHARE));
          for (let i = 0; i < dim; i += 1) {
            const fx = mapX(step.from[i]!, span);
            const mx = mapX(step.mean[i]!, span);
            const nx = mapX(current[i]!, span);
            const cy = r2(laneTop + (i + 0.5) * laneH);
            const px = r2(lerp(fx, mx, pull));
            const kx = r2(lerp(mx, nx, kick));
            h.pulls[i]?.setAttribute('x2', String(px));
            const head = h.heads[i];
            if (head) head.setAttribute('transform', `translate(${px} ${cy})`);
            h.kicks[i]?.setAttribute('x2', String(kick > 0 ? kx : mx));
            h.dots[i]?.setAttribute('cx', String(kick > 0 ? kx : px));
          }
          if (h.newThumb) {
            h.newThumb.setAttribute('transform', `translate(${r2(-colW * (1 - p))} ${r2(-drop * (1 - p))})`);
          }
        });
      } else {
        return;
      }
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
