/**
 * bayes-update 무대.
 *
 * 위: 두 주머니와 뽑은 공의 자리. 가운데: 합 1 인 막대 하나를 두 가설이 나눠 쥔다 —
 * 곱하면 두 토막이 저마다 가능도만큼 줄어 막대가 1 에 못 미치고, 나누면 다시 1 로
 * 늘어나며 두 토막 사이 경계가 옮겨간다. 아래: 그 경계가 고칠 때마다 지나온 자리.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import { fracText, percentText, type Frac } from './algorithm.js';
import type { BayesScene, Pair } from './scene.js';

const H = 470;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 걸음 하나의 운동 길이 — stepMs 1500 과 더해 걸음 벽시계가 된다 */
const MOTION_MS = 400;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function val(f: Frac): number {
  return f.n / f.d;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function mix(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

type Handles = {
  segA: SVGRectElement;
  segB: SVGRectElement;
  valueB: SVGTextElement[];
  sumMark: SVGElement[];
  newBall: SVGCircleElement | null;
  newDot: SVGCircleElement | null;
  newLink: SVGLineElement | null;
  newDotLabel: SVGTextElement | null;
  /** 새 점의 글자가 점에서 떨어진 가로 거리 — 운동 중에도 같다 */
  newDotLabelDx: number;
};

export const bayesUpdateStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    // 공은 물건이라 테마를 따라 뒤집히지 않는다 — 밝은 팔레트의 종이와 먹
    const paper: Palette = getColors('light');
    const hypColor = categorical(2, 'vivid');
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    // 막대 · 자취가 함께 쓰는 가로 축척
    const x0 = Math.round(W * 0.07);
    const L = W - 2 * x0;
    const barY = 196;
    const barH = 34;
    const traceTop = 318;
    const captionY1 = H - 34;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let handles: Handles | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      text: string,
      x: number,
      y: number,
      opts: { anchor?: string; size?: string; fill?: string; weight?: string; mono?: boolean } = {},
    ): SVGTextElement {
      const node = el('text', {
        x: r2(x),
        y: r2(y),
        'text-anchor': opts.anchor ?? 'middle',
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? colors.text,
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', opts.weight);
      node.textContent = text;
      return node;
    }

    function nameOf(id: string): string {
      if (id === 'whiteHeavy') return t('label.whiteHeavy', 'White-heavy bag');
      if (id === 'blackHeavy') return t('label.blackHeavy', 'Black-heavy bag');
      throw new Error(`bayes-update 무대: 가설 ${id} 의 이름 문안이 없다`);
    }

    function colorName(c: string): string {
      if (c === 'white') return t('label.white', 'white ball');
      if (c === 'black') return t('label.black', 'black ball');
      throw new Error(`bayes-update 무대: 공 색 ${c} 의 이름 문안이 없다`);
    }

    function hueOf(i: number): string {
      const c = hypColor[i];
      if (c === undefined) throw new Error(`bayes-update 무대: 가설 ${i} 의 색이 없다`);
      return c;
    }

    function ball(cx: number, cy: number, r: number, color: string): SVGCircleElement {
      return el('circle', {
        cx: r2(cx),
        cy: r2(cy),
        r: r2(r),
        fill: color === 'white' ? paper.bg : paper.text,
        stroke: colors.textMuted,
        'stroke-width': 1.6,
      });
    }

    // 뽑은 공 자리
    function slotX(scene: BayesScene, i: number): number {
      const n = scene.draws.length;
      const gap = Math.min(34, (W * 0.34) / n);
      return W / 2 + (i - (n - 1) / 2) * gap;
    }
    const slotY = 84;
    const ballR = Math.min(12, W * 0.02);

    function traceY(i: number, count: number): number {
      const room = captionY1 - 24 - traceTop;
      const gap = Math.min(26, room / Math.max(1, count - 1));
      return traceTop + i * gap;
    }

    function drawBags(scene: BayesScene): void {
      const bw = Math.min(150, W * 0.24);
      const bh = 76;
      const top = 40;
      const current = scene.weights !== null ? scene.draws[scene.drawn - 1] : undefined;
      scene.hyps.forEach((h, i) => {
        const cx = i === 0 ? W * 0.2 : W * 0.8;
        label(nameOf(h.id), cx, 26, { weight: '600' });
        el('rect', {
          x: r2(cx - bw / 2),
          y: top,
          width: r2(bw),
          height: bh,
          rx: 12,
          fill: colors.bgSubtle,
          stroke: hueOf(i),
          'stroke-width': 2.5,
        });
        const balls: string[] = [];
        for (let k = 0; k < h.white; k += 1) balls.push('white');
        for (let k = 0; k < h.black; k += 1) balls.push('black');
        const cols = Math.ceil(balls.length / 2);
        const gx = Math.min(30, (bw - 24) / Math.max(1, cols));
        balls.forEach((c, k) => {
          const col = k % cols;
          const row = Math.floor(k / cols);
          const bx = cx + (col - (cols - 1) / 2) * gx;
          const by = top + bh / 2 + (row - 0.5) * 28;
          if (current !== undefined && c === current) {
            el('circle', {
              cx: r2(bx),
              cy: r2(by),
              r: r2(ballR + 3.5),
              fill: 'none',
              stroke: colors.accent,
              'stroke-width': 3,
            });
          }
          ball(bx, by, ballR, c);
        });
        const lk = scene.likelihood?.[i];
        if (lk !== undefined) {
          label(t('label.likelihood', 'Likelihood {f}', { f: fracText(lk) }), cx, top + bh + 22, {
            weight: '600',
          });
        }
      });
    }

    function drawSlots(scene: BayesScene): SVGCircleElement | null {
      label(t('label.draws', 'Draws'), W / 2, 26, { fill: colors.textMuted });
      let fresh: SVGCircleElement | null = null;
      scene.draws.forEach((c, i) => {
        const sx = slotX(scene, i);
        if (i >= scene.drawn) {
          el('circle', {
            cx: r2(sx),
            cy: slotY,
            r: r2(ballR),
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1.2,
            'stroke-dasharray': '3 3',
          });
          return;
        }
        const isCurrent = scene.weights !== null && i === scene.drawn - 1;
        if (isCurrent) {
          el('circle', {
            cx: r2(sx),
            cy: slotY,
            r: r2(ballR + 3.5),
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 3,
          });
        }
        const b = ball(sx, slotY, ballR, c);
        if (isCurrent) fresh = b;
        label(String(i + 1), sx, slotY + ballR + 14, { fill: colors.textMuted, size: fontSizes.xs });
      });
      return fresh;
    }

    /** 막대의 두 토막 — 너비는 넘겨받은 두 값에서 */
    function drawBar(scene: BayesScene): Pick<Handles, 'segA' | 'segB' | 'valueB' | 'sumMark'> {
      const shown: Pair = scene.weights ?? scene.belief;
      const weighted = scene.weights !== null;
      const titleText = weighted
        ? t('label.weights', 'Belief × likelihood')
        : scene.trace.length === 1
          ? t('label.prior', 'Prior')
          : t('label.posterior', 'Posterior');
      label(titleText, x0, barY - 30, { anchor: 'start', weight: '600' });
      // 합 1 인 자리 — 늘 서 있는 틀
      el('rect', {
        x: x0,
        y: barY,
        width: L,
        height: barH,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1.5,
        'stroke-dasharray': weighted ? '5 4' : 'none',
      });
      label('1', x0 + L, barY - 8, { anchor: 'end', fill: colors.textMuted });
      const wA = val(shown[0]) * L;
      const wB = val(shown[1]) * L;
      const segA = el('rect', { x: x0, y: barY, width: r2(wA), height: barH, fill: hueOf(0) });
      const segB = el('rect', { x: r2(x0 + wA), y: barY, width: r2(wB), height: barH, fill: hueOf(1) });

      const valueB: SVGTextElement[] = [];
      const lineY = barY + barH + 20;
      const endB = x0 + wA + wB;
      if (weighted && scene.likelihood !== null) {
        const lk = scene.likelihood;
        label(`${fracText(scene.belief[0])} × ${fracText(lk[0])}`, x0, lineY, { anchor: 'start', mono: true });
        label(`= ${fracText(shown[0])}`, x0, lineY + 18, { anchor: 'start', mono: true, weight: '600' });
        valueB.push(
          label(`${fracText(scene.belief[1])} × ${fracText(lk[1])}`, endB, lineY, { anchor: 'end', mono: true }),
          label(`= ${fracText(shown[1])}`, endB, lineY + 18, { anchor: 'end', mono: true, weight: '600' }),
        );
      } else {
        label(`${fracText(shown[0])} · ${percentText(shown[0])}`, x0, lineY, { anchor: 'start', mono: true, weight: '600' });
        valueB.push(
          label(`${fracText(shown[1])} · ${percentText(shown[1])}`, endB, lineY, {
            anchor: 'end',
            mono: true,
            weight: '600',
          }),
        );
      }

      const sumMark: SVGElement[] = [];
      if (weighted) {
        if (scene.total === null) throw new Error('bayes-update 무대: 곱한 박자인데 합이 없다');
        sumMark.push(
          el('line', {
            x1: r2(endB),
            x2: r2(endB),
            y1: barY - 14,
            y2: barY + barH,
            stroke: colors.text,
            'stroke-width': 1.5,
          }),
          label(t('label.sum', 'Sum {s}', { s: fracText(scene.total) }), endB, barY - 18, { weight: '600' }),
        );
      }
      return { segA, segB, valueB, sumMark };
    }

    function traceX(f: Frac): number {
      return x0 + val(f) * L;
    }

    /**
     * 자취 점의 글자 자리 — 들어오는 선과 나가는 선이 지나지 않는 쪽.
     * 양옆이 다 막히면(왼쪽 위에서 와서 오른쪽 아래로 나가면) 비어 있는 위쪽 모서리로.
     */
    function traceLabelPlace(prevX: number | null, x: number, nextX: number | null): {
      dx: number;
      dy: number;
      anchor: string;
    } {
      const side = (o: number | null): number => (o === null || Math.abs(o - x) < 0.5 ? 0 : Math.sign(o - x));
      const inS = side(prevX);
      const outS = side(nextX);
      const mid = smPx * 0.35;
      if (inS !== 0 && outS !== 0 && inS !== outS) {
        // 선이 양옆을 막는다 — 들어오는 선의 반대편 위 모서리
        return inS < 0 ? { dx: 8, dy: -8, anchor: 'start' } : { dx: -8, dy: -8, anchor: 'end' };
      }
      const busy = inS !== 0 ? inS : outS;
      return busy > 0 ? { dx: -10, dy: mid, anchor: 'end' } : { dx: 10, dy: mid, anchor: 'start' };
    }

    function drawTrace(scene: BayesScene): Pick<Handles, 'newDot' | 'newLink' | 'newDotLabel' | 'newDotLabelDx'> {
      const first = scene.hyps[0];
      if (first === undefined) throw new Error('bayes-update 무대: 가설이 없다');
      label(t('label.trace', 'Where the split has stood'), x0, traceTop - 20, {
        anchor: 'start',
        fill: colors.textMuted,
      });
      const count = scene.draws.length + 1;
      const bottom = traceY(count - 1, count);
      el('line', {
        x1: r2(x0 + L / 2),
        x2: r2(x0 + L / 2),
        y1: traceTop - 8,
        y2: r2(bottom + 8),
        stroke: colors.border,
        'stroke-dasharray': '2 3',
      });
      let newDot: SVGCircleElement | null = null;
      let newLink: SVGLineElement | null = null;
      let newDotLabel: SVGTextElement | null = null;
      let newDotLabelDx = 0;
      const isNew = scene.step.kind === 'normalize';
      scene.trace.forEach((f, i) => {
        const x = traceX(f);
        const y = traceY(i, count);
        const prevF = i > 0 ? scene.trace[i - 1] : undefined;
        if (prevF !== undefined) {
          const link = el('line', {
            x1: r2(traceX(prevF)),
            y1: r2(traceY(i - 1, count)),
            x2: r2(x),
            y2: r2(y),
            stroke: hueOf(0),
            'stroke-width': 2,
          });
          if (isNew && i === scene.trace.length - 1) newLink = link;
        }
      });
      scene.trace.forEach((f, i) => {
        const x = traceX(f);
        const y = traceY(i, count);
        const last = i === scene.trace.length - 1;
        const dot = el('circle', {
          cx: r2(x),
          cy: r2(y),
          r: last ? 5 : 3.5,
          fill: last ? colors.accent : hueOf(0),
          stroke: last ? colors.text : 'none',
          'stroke-width': last ? 1.2 : 0,
        });
        const before = i > 0 ? scene.trace[i - 1] : undefined;
        const after = scene.trace[i + 1];
        const place = traceLabelPlace(
          before === undefined ? null : traceX(before),
          x,
          after === undefined ? null : traceX(after),
        );
        const lab = label(percentText(f), x + place.dx, y + place.dy, {
          anchor: place.anchor,
          mono: true,
          size: fontSizes.xs,
          fill: last ? colors.text : colors.textMuted,
        });
        if (isNew && last) {
          newDot = dot;
          newDotLabel = lab;
          newDotLabelDx = place.dx;
        }
      });
      return { newDot, newLink, newDotLabel, newDotLabelDx };
    }

    function drawCaption(scene: BayesScene): void {
      const s = scene.step;
      const [a, b] = scene.belief;
      const pair = (f: Frac): string => `${fracText(f)} (${percentText(f)})`;
      let l1: string;
      let l2: string | null = null;
      if (s.kind === 'prior') {
        l1 = t('caption.prior', 'Prior, before any draw: {a} · {b}', { a: pair(a), b: pair(b) });
      } else if (s.kind === 'multiply') {
        if (scene.total === null) throw new Error('bayes-update 무대: 곱한 박자인데 합이 없다');
        const c = scene.draws[s.draw];
        if (c === undefined) throw new Error(`bayes-update 무대: 뽑기 ${s.draw} 가 없다`);
        l1 = t('caption.multiply', 'Draw {k}: {color}', { k: s.draw + 1, color: colorName(c) });
        l2 = t('caption.multiplyHow', 'Multiply each belief by its likelihood — the weights sum to {sum}', {
          sum: fracText(scene.total),
        });
      } else {
        l1 = t('caption.normalize', 'Divide each weight by the sum {sum}', { sum: fracText(s.total) });
        l2 = t('caption.normalizeHow', 'The belief adds up to 1 again: {a} · {b}', { a: pair(a), b: pair(b) });
      }
      label(l1, W / 2, captionY1, { size: fontSizes.md, weight: '600' });
      if (l2 !== null) label(l2, W / 2, captionY1 + 20, { size: fontSizes.sm, fill: colors.textMuted });
    }

    function drawStatic(scene: BayesScene): void {
      svg.textContent = '';
      drawBags(scene);
      const newBall = drawSlots(scene);
      const bar = drawBar(scene);
      const tr = drawTrace(scene);
      drawCaption(scene);
      handles = { ...bar, ...tr, newBall };
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise((resolve) => {
        let start: number | null = null;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) return done();
          if (start === null) start = now;
          const p = Math.min(1, (now - start) / ms);
          frame(ease(p));
          if (p >= 1) return done();
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tick(n);
        });
        frames.add(id);
      });
    }

    function need<T>(x: T | null | undefined, what: string): T {
      if (x === null || x === undefined) throw new Error(`bayes-update 무대: 운동할 ${what} 이 없다`);
      return x;
    }

    /** 토막 둘을 from 너비에서 지금(정본) 너비로 — 경계와 B 쪽 글자가 함께 옮겨간다 */
    function moveBar(h: Handles, from: Pair, to: Pair, p: number): void {
      const wA = mix(val(from[0]), val(to[0]), p) * L;
      const wB = mix(val(from[1]), val(to[1]), p) * L;
      h.segA.setAttribute('width', String(r2(wA)));
      h.segB.setAttribute('x', String(r2(x0 + wA)));
      h.segB.setAttribute('width', String(r2(wB)));
      const endB = String(r2(x0 + wA + wB));
      for (const v of h.valueB) v.setAttribute('x', endB);
      for (const m of h.sumMark) {
        if (m.tagName === 'line') {
          m.setAttribute('x1', endB);
          m.setAttribute('x2', endB);
        } else {
          m.setAttribute('x', endB);
        }
      }
    }

    async function animateMultiply(scene: BayesScene, before: Pair, mine: number): Promise<void> {
      const h = need(handles, '무대');
      const weights = need(scene.weights, '무게');
      const fresh = need(h.newBall, '새 공');
      // 공이 위에서 제 자리로 떨어지고, 같은 시계로 두 토막이 가능도만큼 줄어든다
      const dropFrom = -ballR * 2;
      const apply = (p: number): void => {
        fresh.setAttribute('cy', String(r2(mix(dropFrom, slotY, p))));
        moveBar(h, before, weights, p);
      };
      apply(0);
      await tween(mine, MOTION_MS, apply);
    }

    async function animateNormalize(scene: BayesScene, before: Pair, mine: number): Promise<void> {
      const h = need(handles, '무대');
      const dot = need(h.newDot, '자취 점');
      const link = need(h.newLink, '자취 선');
      const dotLabel = need(h.newDotLabel, '자취 글자');
      const count = scene.draws.length + 1;
      const prevF = need(scene.trace[scene.trace.length - 2], '앞 믿음');
      const nowF = need(scene.trace[scene.trace.length - 1], '새 믿음');
      const fromX = traceX(prevF);
      const toX = traceX(nowF);
      const y = traceY(scene.trace.length - 1, count);
      // 토막 둘이 합 1 로 늘어나며 경계가 옮겨가고, 자취의 새 점이 앞 자리에서 따라 옮겨간다
      const apply = (p: number): void => {
        moveBar(h, before, scene.belief, p);
        const x = r2(mix(fromX, toX, p));
        dot.setAttribute('cx', String(x));
        link.setAttribute('x2', String(x));
        link.setAttribute('y2', String(r2(mix(traceY(scene.trace.length - 2, count), y, p))));
        dotLabel.setAttribute('x', String(r2(x + h.newDotLabelDx)));
      };
      apply(0);
      await tween(mine, MOTION_MS, apply);
    }

    return {
      async render(next: BayesScene, prev: BayesScene | null, opts: { animate: boolean }): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || prev === null) return;
        const s = next.step;
        if (s.kind === 'multiply') await animateMultiply(next, s.before, mine);
        else if (s.kind === 'normalize') await animateNormalize(next, s.before, mine);
        else return;
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        handles = null;
        svg.textContent = '';
      },
    };
  },
};
