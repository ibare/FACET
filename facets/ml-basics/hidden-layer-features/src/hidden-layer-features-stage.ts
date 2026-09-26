/**
 * hidden-layer-features 무대 — 네 점이 가운데 층 단위의 값을 새 자리로 삼아 옮겨 간다.
 *
 * 왼쪽 평면: 네 점과 짝끼리 잇는 선, 지나온 자리의 자취. 자리가 바뀌면 점이 실제로 미끄러진다.
 * 오른쪽: 짝마다 거리 막대(평면의 짝 선이 줄어드는 만큼 줄어든다)와 단위 둘의 식.
 */
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
} from '@ffacet/core/runtime';
import { pairOf } from './algorithm.js';
import type { HiddenLayerFeaturesScene, HlfPoint } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 한 자리를 바꾸는 운동의 길이 */
const MOVE_MS = 700;
const FRAME_MS = 16;
/** 평면 크기의 상한 — 폭과 높이에서 역산한 값이 이보다 크면 여기서 멈춘다 */
const PLANE_MAX = 300;
/** 오른쪽 식 한 줄이 드는 글자 수의 상한 — 고정폭 글자라 폭을 이것으로 잡는다 */
const FORMULA_CHARS = 32;
/** 고정폭 글자 한 칸의 폭 / 글자 크기 */
const MONO_ADVANCE = 0.6;
/** 평면과 오른쪽 사이 */
const GAP = 44;

/** 음수는 '−' 로, −0 은 0 으로 */
function fmt(v: number, digits: number): string {
  const s = v.toFixed(digits);
  const n = Number(s);
  if (n === 0) return (0).toFixed(digits);
  return n < 0 ? `−${s.slice(1)}` : s;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
  parent.appendChild(node);
  return node;
}

function word(
  parent: Element,
  x: number,
  y: number,
  s: string,
  fill: string,
  size: string,
  anchor: 'start' | 'middle' | 'end',
  weight = 'normal',
): SVGTextElement {
  const node = el(parent, 'text', {
    x,
    y,
    fill,
    'font-family': fonts.body,
    'font-size': size,
    'font-weight': weight,
    'text-anchor': anchor,
  });
  node.textContent = s;
  return node;
}

export const hiddenLayerFeaturesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [pairColor0, pairColor1] = categorical(2, 'vivid');
    if (!pairColor0 || !pairColor1) throw new Error('hidden-layer-features-stage: 짝 색을 얻지 못했다');
    const pairColor = (y: 0 | 1): string => (y === 0 ? pairColor0 : pairColor1);

    const smPx = parseFloat(fontSizes.sm);
    const mdPx = parseFloat(fontSizes.md);

    // 자리 — 폭과 높이에서 역산한다
    const W = PIECE_CANVAS_W;
    const captionTop = H - 2 * (mdPx + 8) - 6;
    const planeTop = 20;
    const planeLeft = 64;
    const panelMin = FORMULA_CHARS * MONO_ADVANCE * smPx;
    const plane = Math.min(PLANE_MAX, captionTop - planeTop - 2 * smPx - 20, W - 16 - panelMin - GAP - planeLeft);
    const inset = plane * 0.08;
    const panelLeft = planeLeft + plane + GAP;
    const panelRight = W - 16;
    const panelW = panelRight - panelLeft;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function draw(scene: HiddenLayerFeaturesScene, k: number): void {
      svg.textContent = '';
      const range = scene.range;
      const dist = scene.dist;
      if (!range || !dist) return;
      const step = scene.step;
      const moving = step !== null && step.kind === 'replace' && k < 1;
      const e = ease(k);

      const span = range.hi - range.lo;
      const sx = (v: number): number => planeLeft + inset + ((v - range.lo) / span) * (plane - 2 * inset);
      const sy = (v: number): number => planeTop + plane - inset - ((v - range.lo) / span) * (plane - 2 * inset);

      const last = scene.trail[scene.trail.length - 1];
      if (!last) throw new Error('hidden-layer-features-stage: 지금 자리가 없다');
      let now: HlfPoint[] = last;
      if (moving && step.kind === 'replace') {
        const before = step.before;
        now = last.map((q, i) => {
          const b = before[i];
          if (!b) throw new Error(`hidden-layer-features-stage: step.before[${i}] 가 없다`);
          return { x: lerp(b.x, q.x, e), y: lerp(b.y, q.y, e) };
        });
      }

      // 평면 바탕
      el(svg, 'rect', {
        x: planeLeft,
        y: planeTop,
        width: plane,
        height: plane,
        fill: colors.bgSubtle,
        stroke: colors.border,
      });
      for (const v of [range.lo, range.hi]) {
        el(svg, 'line', { x1: sx(v), y1: planeTop, x2: sx(v), y2: planeTop + plane, stroke: colors.border, 'stroke-dasharray': '2 4' });
        el(svg, 'line', { x1: planeLeft, y1: sy(v), x2: planeLeft + plane, y2: sy(v), stroke: colors.border, 'stroke-dasharray': '2 4' });
        word(svg, sx(v), planeTop + plane + smPx + 4, fmt(v, 1), colors.textMuted, fontSizes.sm, 'middle');
        word(svg, planeLeft - 6, sy(v) + smPx / 3, fmt(v, 1), colors.textMuted, fontSizes.sm, 'end');
      }

      // 축 이름 — 지금 무엇의 값인가. 이번 걸음에 바뀐 축은 강조가 머문다
      const changed = step !== null && step.kind === 'replace' ? step.axis : null;
      const axisName = (src: number, i: number): string =>
        src === 0 ? t('label.input', 'x{i}', { i }) : t('label.unit', 'h{j}', { j: src });
      const axisY = planeTop + plane + 2 * smPx + 12;
      const xName = word(svg, planeLeft + plane / 2, axisY, axisName(scene.sources.x, 1), colors.text, fontSizes.md, 'middle', 'bold');
      const yName = word(svg, planeLeft - 36, planeTop + plane / 2, axisName(scene.sources.y, 2), colors.text, fontSizes.md, 'middle', 'bold');
      for (const [axis, node] of [['x', xName], ['y', yName]] as const) {
        if (changed !== axis) continue;
        const box = { w: mdPx * 2.2, h: mdPx + 6 };
        const cx = Number(node.getAttribute('x'));
        const cy = Number(node.getAttribute('y'));
        const mark = el(svg, 'rect', {
          x: cx - box.w / 2,
          y: cy - mdPx + 1,
          width: box.w,
          height: box.h,
          rx: 3,
          fill: colors.accent,
        });
        svg.insertBefore(mark, node);
        node.setAttribute('fill', colors.stateInk);
      }

      // 자취 — 지나온 자리들. 흐르는 중이면 바꾸기 전 자리까지만 굳은 자취다
      const settled = moving ? scene.trail.slice(0, -1) : scene.trail;
      scene.inputs.forEach((_p, i) => {
        const path = settled.map((ps) => {
          const q = ps[i];
          if (!q) throw new Error(`hidden-layer-features-stage: 자취의 점 ${i} 가 없다`);
          return q;
        });
        const cur = now[i];
        if (!cur) throw new Error(`hidden-layer-features-stage: 점 ${i} 의 자리가 없다`);
        const pts = moving ? [...path, cur] : path;
        if (pts.length > 1) {
          el(svg, 'polyline', {
            points: pts.map((q) => `${r2(sx(q.x))},${r2(sy(q.y))}`).join(' '),
            fill: 'none',
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          });
        }
        for (const q of path.slice(0, -1).concat(moving ? path.slice(-1) : [])) {
          el(svg, 'circle', { cx: sx(q.x), cy: sy(q.y), r: 3, fill: 'none', stroke: colors.textMuted });
        }
      });

      // 짝 선 — 같은 답의 두 점을 잇는다
      const pairs = [
        { y: 0 as const, idx: pairOf(scene.inputs, 0), d: dist.zero, was: step?.kind === 'replace' ? step.was.zero : dist.zero },
        { y: 1 as const, idx: pairOf(scene.inputs, 1), d: dist.one, was: step?.kind === 'replace' ? step.was.one : dist.one },
      ];
      for (const pr of pairs) {
        const a = now[pr.idx[0]];
        const b = now[pr.idx[1]];
        if (!a || !b) throw new Error('hidden-layer-features-stage: 짝의 자리가 없다');
        el(svg, 'line', {
          x1: sx(a.x),
          y1: sy(a.y),
          x2: sx(b.x),
          y2: sy(b.y),
          stroke: pairColor(pr.y),
          'stroke-width': 2,
          'stroke-linecap': 'butt',
          'stroke-dasharray': pr.y === 0 ? '' : '6 4',
        });
      }

      // 점 — 답 0 은 동그라미, 답 1 은 네모. 이름은 입력 자리 쪽으로 비켜 단다
      const mid = (range.lo + range.hi) / 2;
      const order = scene.inputs.map((p, i) => ({ p, i })).sort((a, b) => a.p.y - b.p.y);
      order.forEach(({ p, i }) => {
        const q = now[i];
        if (!q) throw new Error(`hidden-layer-features-stage: 점 ${i} 의 자리가 없다`);
        const cx = sx(q.x);
        const cy = sy(q.y);
        if (p.y === 0) {
          el(svg, 'circle', { cx, cy, r: 7, fill: pairColor(0), stroke: colors.bg, 'stroke-width': 1.5 });
        } else {
          el(svg, 'rect', { x: cx - 6, y: cy - 6, width: 12, height: 12, fill: pairColor(1), stroke: colors.bg, 'stroke-width': 1.5 });
        }
        const right = p.x1 > mid;
        const up = p.x2 > mid;
        word(
          svg,
          cx + (right ? 10 : -10),
          cy + (up ? -8 : 8 + smPx * 0.7),
          t('label.point', '({a},{b})', { a: fmt(p.x1, 0), b: fmt(p.x2, 0) }),
          colors.text,
          fontSizes.sm,
          right ? 'start' : 'end',
        );
      });

      // 오른쪽 — 짝마다 거리 막대. 막대의 끝은 대각 하나(범위의 대각)
      const diag = span * Math.SQRT2;
      let y = planeTop + mdPx;
      for (const pr of pairs) {
        const shown = moving ? lerp(pr.was, pr.d, e) : pr.d;
        const mx = panelLeft + 7;
        if (pr.y === 0) {
          el(svg, 'circle', { cx: mx, cy: y - mdPx / 3, r: 6, fill: pairColor(0) });
        } else {
          el(svg, 'rect', { x: mx - 5, y: y - mdPx / 3 - 5, width: 10, height: 10, fill: pairColor(1) });
        }
        word(svg, panelLeft + 20, y, t('label.pair', 'Answer {y} pair', { y: pr.y }), colors.text, fontSizes.md, 'start', 'bold');
        const [ia, ib] = pr.idx;
        const pa = scene.inputs[ia];
        const pb = scene.inputs[ib];
        if (!pa || !pb) throw new Error('hidden-layer-features-stage: 짝의 입력이 없다');
        word(
          svg,
          panelRight,
          y,
          t('label.members', '{a} · {b}', {
            a: t('label.point', '({a},{b})', { a: fmt(pa.x1, 0), b: fmt(pa.x2, 0) }),
            b: t('label.point', '({a},{b})', { a: fmt(pb.x1, 0), b: fmt(pb.x2, 0) }),
          }),
          colors.textMuted,
          fontSizes.sm,
          'end',
        );
        const barY = y + 10;
        el(svg, 'rect', { x: panelLeft, y: barY, width: panelW, height: 10, fill: 'none', stroke: colors.border });
        el(svg, 'rect', { x: panelLeft, y: barY, width: Math.max(0, (shown / diag) * panelW), height: 10, fill: pairColor(pr.y) });
        word(svg, panelLeft, barY + 10 + mdPx + 4, t('label.dist', 'Distance: {d}', { d: fmt(pr.d, 2) }), colors.text, fontSizes.md, 'start');
        y = barY + 10 + mdPx + 4 + mdPx * 2.4;
      }

      // 단위 둘의 식 — 이미 쓴 것 · 이번 것 · 아직인 것
      y += 4;
      word(svg, panelLeft, y, t('label.units', 'Middle layer (sigmoid)'), colors.textMuted, fontSizes.sm, 'start');
      y += mdPx + 10;
      scene.units.forEach((u, j) => {
        const used = scene.sources.x === j + 1 || scene.sources.y === j + 1;
        const now2 = step?.kind === 'replace' && step.unit === j + 1;
        const signed = (v: number): string => (v < 0 ? `− ${fmt(-v, 1)}` : `+ ${fmt(v, 1)}`);
        const line = t('label.formula', 'h{j} = σ({a}·x1 {b}·x2 {c})', {
          j: j + 1,
          a: fmt(u.w[0], 1),
          b: signed(u.w[1]),
          c: signed(u.b),
        });
        if (now2) {
          el(svg, 'rect', { x: panelLeft - 4, y: y - smPx - 2, width: panelW + 4, height: smPx + 8, rx: 3, fill: colors.accent });
        }
        const node = word(svg, panelLeft, y, line, now2 ? colors.stateInk : used ? colors.text : colors.textMuted, fontSizes.sm, 'start');
        node.setAttribute('font-family', fonts.mono);
        y += mdPx + 14;
      });

      // 캡션 — 지금 일어나는 일
      const c1 = captionTop + mdPx;
      const c2 = c1 + mdPx + 8;
      if (step === null || step.kind === 'start') {
        word(svg, 16, c1, t('caption.start', 'The four inputs sit at their own places (x1, x2).'), colors.text, fontSizes.md, 'start', 'bold');
        word(svg, 16, c2, t('caption.distStart', 'Answer-0 pair distance: {d}', { d: fmt(dist.zero, 2) }), colors.text, fontSizes.md, 'start');
      } else {
        if (step.axis === 'x') {
          word(svg, 16, c1, t('caption.across', 'The horizontal place becomes the value of unit {unit}.', { unit: step.unit }), colors.text, fontSizes.md, 'start', 'bold');
        } else {
          word(svg, 16, c1, t('caption.up', 'The vertical place becomes the value of unit {unit}.', { unit: step.unit }), colors.text, fontSizes.md, 'start', 'bold');
        }
        word(
          svg,
          16,
          c2,
          t('caption.dist', 'Answer-0 pair distance: {from} → {to}', { from: fmt(step.was.zero, 2), to: fmt(dist.zero, 2) }),
          colors.text,
          fontSizes.md,
          'start',
        );
      }
    }

    function motion(mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          const k = Math.min(1, (Date.now() - start) / MOVE_MS);
          frame(k);
          if (k >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    const renderer: SceneRenderer<HiddenLayerFeaturesScene> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        const step = next.step;
        // prev 는 흘릴지 고르는 데만 — 한 자리가 막 바뀐 걸음이면 흘린다
        const flows =
          opts.animate && !destroyed && step !== null && step.kind === 'replace' && prev !== null && prev.trail.length + 1 === next.trail.length;
        if (!flows) {
          draw(next, 1);
          return;
        }
        await motion(mine, (k) => draw(next, k));
        if (mine === gen && !destroyed) draw(next, 1);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
