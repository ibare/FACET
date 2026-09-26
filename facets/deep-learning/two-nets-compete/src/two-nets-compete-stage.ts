import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { discriminatorScore } from './algorithm';
import type { TwoNetsCompeteScene, TwoNetsCompeteSnap } from './scene';

const H = 372;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 한 걸음의 운동 — 곡선이 기울거나 가짜가 옮겨 가는 시간 */
const MOTION_MS = 450;
const FRAME_MS = 16;

const PX_SM = parseFloat(fontSizes.sm);
const PX_XS = parseFloat(fontSizes.xs);
const PX_MD = parseFloat(fontSizes.md);

// 세로 자리
const ROW_TOP = 6;
const ROW_H = 22;
const PLOT_TOP = 60;
const PLOT_BOT = 196;
const TICK_Y = PLOT_BOT + 16;
const FAKE_LABEL_Y = PLOT_BOT + 34;
const TRACE_TOP = 256;
const TRACE_BOT = 318;
const CAPTION_Y = 344;
const CAPTION2_Y = 364;

// 가로 자리 — 폭에서 역산한다
const MARGIN = 12;
const PLOT_X0 = 44;
const GAUGE_X = PIECE_CANVAS_W - 64;
const PLOT_X1 = GAUGE_X - 60;
const TRACE_X0 = 64;
const TRACE_X1 = PIECE_CANVAS_W - 28;

/** 두 쪽을 가르는 식별 색 — 0 만드는 쪽 · 1 가려내는 쪽 */
const ROLE_TONES = categorical(2, 'vivid');

function roleColor(index: number): string {
  const c = ROLE_TONES[index];
  if (c === undefined) throw new Error('two-nets-compete: 쪽 색이 없다');
  return c;
}

/** 글자 폭 어림 — 한중일 글자는 한 칸, 나머지는 0.6 칸 */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    w += code >= 0x2e80 ? px : px * 0.6;
  }
  return w;
}

function fmt(x: number): string {
  const s = x.toFixed(2);
  const clean = s === '-0.00' ? '0.00' : s;
  return clean.replace('-', '−');
}

function round1(x: number): number {
  const r = Math.round(x * 10) / 10;
  return r === 0 ? 0 : r;
}

function ease(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  if (values.length === 0) throw new Error('two-nets-compete: 빈 배열의 평균은 셀 수 없다');
  return sum / values.length;
}

type Live = {
  snap: TwoNetsCompeteSnap;
  prevV: number | null;
  w: number;
  c: number;
  fakes: number[];
  b: number;
  meanReal: number;
  meanFake: number;
  v: number;
};

export const twoNetsCompeteStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const genColor = roleColor(0);
    const discColor = roleColor(1);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element = svg): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function text(
      content: string,
      x: number,
      y: number,
      opts: { px: number; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; mono?: boolean },
    ): SVGElement {
      const node = el('text', {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        fill: opts.fill,
        'font-size': opts.px,
        'font-family': opts.mono === true ? fonts.mono : fonts.body,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'middle',
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', String(opts.weight));
      node.textContent = content;
      return node;
    }

    /** 현재 장면에서 u(0~1) 만큼 흘러온 모습. u 가 null 이면 끝 모습 */
    function live(scene: TwoNetsCompeteScene, u: number | null): Live | null {
      const snap = scene.trail[scene.trail.length - 1];
      if (snap === undefined) return null;
      const before = scene.trail[scene.trail.length - 2];
      const prevV = before === undefined ? null : before.v;
      const step = scene.step;
      if (u === null || step === null || step.kind === 'start') {
        return {
          snap,
          prevV,
          w: snap.w,
          c: snap.c,
          b: snap.b,
          fakes: snap.fakes,
          meanReal: snap.meanReal,
          meanFake: snap.meanFake,
          v: snap.v,
        };
      }
      const k = ease(u);
      let w = snap.w;
      let c = snap.c;
      let b = snap.b;
      if (step.kind === 'discriminate') {
        w = step.fromW + (snap.w - step.fromW) * k;
        c = step.fromC + (snap.c - step.fromC) * k;
      } else {
        b = step.fromB + (snap.b - step.fromB) * k;
      }
      const shift = b - snap.b;
      const fakes = snap.fakes.map((x) => x + shift);
      const v = prevV === null ? snap.v : prevV + (snap.v - prevV) * k;
      return {
        snap,
        prevV,
        w,
        c,
        b,
        fakes,
        meanReal: mean(scene.real.map((x) => discriminatorScore(w, c, x))),
        meanFake: mean(fakes.map((x) => discriminatorScore(w, c, x))),
        v,
      };
    }

    function drawTopRow(scene: TwoNetsCompeteScene, now: Live): void {
      const frame = scene.frame;
      const step = scene.step;
      if (frame === null || step === null) return;
      const startLabel = t('label.start', 'Start');
      const lastRound = t('label.round', 'Round {r}', { r: frame.rounds });
      const labelW = Math.max(textWidth(startLabel, PX_MD), textWidth(lastRound, PX_MD));
      const roundText = step.kind === 'start' ? startLabel : t('label.round', 'Round {r}', { r: step.round });
      const cy = ROW_TOP + ROW_H / 2;
      text(roundText, MARGIN, cy, { px: PX_MD, fill: colors.text, weight: 600 });

      const chips: { label: string; pairs: [string, number][]; color: string; active: boolean }[] = [
        {
          label: t('label.discriminator', 'Discriminator'),
          pairs: [
            ['w', now.w],
            ['c', now.c],
          ],
          color: discColor,
          active: step.kind === 'discriminate',
        },
        {
          label: t('label.generator', 'Generator'),
          pairs: [['b', now.b]],
          color: genColor,
          active: step.kind === 'generate',
        },
      ];
      let x = MARGIN + labelW + 20;
      for (const chip of chips) {
        const pad = 10;
        const labelWidth = textWidth(chip.label, PX_SM);
        const pairW = textWidth('w −0.00', PX_SM);
        const width = pad + labelWidth + 12 + chip.pairs.length * (pairW + 8) + pad - 8;
        el('rect', {
          x: Math.round(x),
          y: ROW_TOP,
          width: Math.round(width),
          height: ROW_H,
          rx: ROW_H / 2,
          fill: chip.active ? chip.color : 'none',
          stroke: chip.active ? chip.color : colors.border,
          'stroke-width': 1.5,
        });
        const ink = chip.active ? colors.stateInk : colors.text;
        text(chip.label, x + pad, cy, { px: PX_SM, fill: ink, weight: 600 });
        let px = x + pad + labelWidth + 12;
        for (const [sym, val] of chip.pairs) {
          const node = el('text', {
            x: Math.round(px),
            y: cy,
            fill: ink,
            'font-size': PX_SM,
            'font-family': fonts.mono,
            'dominant-baseline': 'middle',
          });
          const s = el('tspan', { 'font-style': 'italic' }, node);
          s.textContent = sym;
          const v = el('tspan', { dx: 4 }, node);
          v.textContent = fmt(val);
          px += pairW + 8;
        }
        x += width + 10;
      }
    }

    function drawField(scene: TwoNetsCompeteScene, now: Live): void {
      const frame = scene.frame;
      if (frame === null) return;
      const lo = Math.floor(frame.xLow - 0.25);
      const hi = Math.ceil(frame.xHigh + 0.25);
      const sx = (x: number): number => PLOT_X0 + ((x - lo) / (hi - lo)) * (PLOT_X1 - PLOT_X0);
      const sy = (d: number): number => PLOT_BOT - d * (PLOT_BOT - PLOT_TOP);

      // 눈금 — 점수 0 · 0.5 · 1
      for (const d of [0, 0.5, 1]) {
        if (d > 0) {
          el('line', {
            x1: PLOT_X0,
            x2: PLOT_X1,
            y1: sy(d),
            y2: sy(d),
            stroke: colors.border,
            'stroke-dasharray': d === 1 ? '0' : '3 4',
          });
        }
        text(d === 0.5 ? '0.5' : String(d), PLOT_X0 - 8, sy(d), { px: PX_XS, fill: colors.textMuted, anchor: 'end' });
      }
      // 축
      el('line', { x1: PLOT_X0, x2: PLOT_X1, y1: PLOT_BOT, y2: PLOT_BOT, stroke: colors.textMuted, 'stroke-width': 1 });
      for (let k = lo; k <= hi; k += 1) {
        el('line', { x1: sx(k), x2: sx(k), y1: PLOT_BOT, y2: PLOT_BOT + 4, stroke: colors.textMuted });
        text(fmt(k).replace('.00', ''), sx(k), TICK_Y, { px: PX_XS, fill: colors.textMuted, anchor: 'middle' });
      }

      // 가려내는 쪽의 곡선 D(x)
      const n = 80;
      const pts: string[] = [];
      for (let i = 0; i <= n; i += 1) {
        const x = lo + ((hi - lo) * i) / n;
        pts.push(`${round1(sx(x))},${round1(sy(discriminatorScore(now.w, now.c, x)))}`);
      }
      el('polyline', { points: pts.join(' '), fill: 'none', stroke: discColor, 'stroke-width': 2.5 });
      text('D(x)', PLOT_X0 + 4, PLOT_TOP - 12, { px: PX_SM, fill: discColor, weight: 600, mono: true });

      // 점수 막대 — 진짜
      for (const x of scene.real) {
        const d = discriminatorScore(now.w, now.c, x);
        const px = sx(x) - 2;
        el('line', { x1: px, x2: px, y1: PLOT_BOT, y2: round1(sy(d)), stroke: colors.text, 'stroke-width': 2 });
        el('circle', { cx: px, cy: round1(sy(d)), r: 3.5, fill: colors.text });
        el('rect', { x: px - 5, y: PLOT_BOT - 5, width: 10, height: 10, fill: colors.text });
      }
      // 점수 막대 — 가짜
      for (const x of now.fakes) {
        const d = discriminatorScore(now.w, now.c, x);
        const px = round1(sx(x) + 2);
        el('line', { x1: px, x2: px, y1: PLOT_BOT, y2: round1(sy(d)), stroke: genColor, 'stroke-width': 2 });
        el('circle', { cx: px, cy: round1(sy(d)), r: 3.5, fill: genColor });
        el('circle', { cx: px, cy: PLOT_BOT, r: 5.5, fill: genColor, stroke: colors.bg, 'stroke-width': 1.5 });
        text(fmt(x), px, FAKE_LABEL_Y, { px: PX_XS, fill: colors.textMuted, anchor: 'middle', mono: true });
      }

      // 평균 점수의 자 — 진짜는 왼쪽, 가짜는 오른쪽
      el('line', { x1: GAUGE_X, x2: GAUGE_X, y1: sy(0), y2: sy(1), stroke: colors.border, 'stroke-width': 2 });
      text(t('label.real', 'Real'), GAUGE_X - 8, PLOT_TOP - 12, { px: PX_SM, fill: colors.text, anchor: 'end', weight: 600 });
      text(t('label.fake', 'Fake'), GAUGE_X + 8, PLOT_TOP - 12, { px: PX_SM, fill: colors.text, weight: 600 });
      const yr = round1(sy(now.meanReal));
      const yf = round1(sy(now.meanFake));
      el('line', { x1: GAUGE_X, x2: GAUGE_X, y1: yr, y2: yf, stroke: discColor, 'stroke-width': 4 });
      el('rect', { x: GAUGE_X - 11, y: yr - 5, width: 10, height: 10, fill: colors.text });
      el('circle', { cx: GAUGE_X + 6, cy: yf, r: 5.5, fill: genColor, stroke: colors.bg, 'stroke-width': 1.5 });
      text(fmt(now.meanReal), GAUGE_X - 16, yr, { px: PX_SM, fill: colors.text, anchor: 'end', mono: true });
      text(fmt(now.meanFake), GAUGE_X + 16, yf, { px: PX_SM, fill: colors.text, mono: true });
    }

    function drawTrace(scene: TwoNetsCompeteScene, now: Live): void {
      const frame = scene.frame;
      if (frame === null) return;
      const steps = frame.rounds * 2;
      const pad = Math.max((frame.vHigh - frame.vLow) * 0.15, 0.01);
      const vLo = frame.vLow - pad;
      const vHi = frame.vHigh + pad;
      const tx = (i: number): number => TRACE_X0 + (i / steps) * (TRACE_X1 - TRACE_X0);
      const ty = (v: number): number => TRACE_BOT - ((v - vLo) / (vHi - vLo)) * (TRACE_BOT - TRACE_TOP);

      text('V', MARGIN, (TRACE_TOP + TRACE_BOT) / 2, { px: PX_MD, fill: colors.text, weight: 600, mono: true });
      el('line', { x1: TRACE_X0, x2: TRACE_X1, y1: TRACE_BOT + 8, y2: TRACE_BOT + 8, stroke: colors.border });
      for (let i = 0; i <= steps; i += 1) {
        el('line', { x1: round1(tx(i)), x2: round1(tx(i)), y1: TRACE_BOT + 5, y2: TRACE_BOT + 11, stroke: colors.border });
      }

      const trail = scene.trail;
      const lastIndex = trail.length - 1;
      for (let i = 1; i <= lastIndex; i += 1) {
        const a = trail[i - 1];
        const b = trail[i];
        if (a === undefined || b === undefined) throw new Error('two-nets-compete: 자취에 빈 자리가 있다');
        const endV = i === lastIndex ? now.v : b.v;
        const frac = i === lastIndex && now.prevV !== null && b.v !== now.prevV ? (endV - now.prevV) / (b.v - now.prevV) : 1;
        const x2 = tx(i - 1) + (tx(i) - tx(i - 1)) * frac;
        const rising = (b.dv ?? 0) > 0;
        el('line', {
          x1: round1(tx(i - 1)),
          y1: round1(ty(a.v)),
          x2: round1(x2),
          y2: round1(ty(endV)),
          stroke: rising ? discColor : genColor,
          'stroke-width': 2.5,
          'stroke-linecap': 'round',
        });
      }
      for (let i = 0; i < lastIndex; i += 1) {
        const s = trail[i];
        if (s === undefined) throw new Error('two-nets-compete: 자취에 빈 자리가 있다');
        el('circle', { cx: round1(tx(i)), cy: round1(ty(s.v)), r: 2.5, fill: colors.textMuted });
      }
      const headX = lastIndex === 0 ? tx(0) : tx(lastIndex - 1) + (tx(lastIndex) - tx(lastIndex - 1)) * (now.prevV !== null && now.snap.v !== now.prevV ? (now.v - now.prevV) / (now.snap.v - now.prevV) : 1);
      const headY = ty(now.v);
      el('circle', { cx: round1(headX), cy: round1(headY), r: 4.5, fill: colors.text });
      const above = (now.snap.dv ?? 1) > 0;
      text(fmt(now.v), headX, headY + (above ? -12 : 13), {
        px: PX_SM,
        fill: colors.text,
        anchor: headX > TRACE_X1 - 20 ? 'end' : 'middle',
        mono: true,
        weight: 600,
      });
    }

    function drawCaption(scene: TwoNetsCompeteScene): void {
      const step = scene.step;
      const frame = scene.frame;
      const snap = scene.trail[scene.trail.length - 1];
      if (step === null || frame === null || snap === undefined) return;
      const opts = { px: PX_MD, fill: colors.text };
      if (step.kind === 'start') {
        text(t('caption.start', 'Before learning — score gap: {gap}', { gap: fmt(snap.gap) }), MARGIN, CAPTION_Y, opts);
      } else if (step.kind === 'discriminate') {
        text(t('caption.disc', 'The discriminator learns — score gap: {gap}', { gap: fmt(snap.gap) }), MARGIN, CAPTION_Y, opts);
      } else {
        text(t('caption.gen', 'The generator learns — fakes moved: {moved}', { moved: fmt(step.moved) }), MARGIN, CAPTION_Y, opts);
        if (step.final) {
          text(
            t('caption.end', 'Real center: {real} · fake center: {fake}', {
              real: fmt(frame.realCenter),
              fake: fmt(step.fakeCenter),
            }),
            MARGIN,
            CAPTION2_Y,
            { px: PX_MD, fill: colors.text, weight: 600 },
          );
        }
      }
    }

    function draw(scene: TwoNetsCompeteScene, u: number | null): void {
      svg.textContent = '';
      const now = live(scene, u);
      if (now === null) return;
      drawTopRow(scene, now);
      drawField(scene, now);
      drawTrace(scene, now);
      drawCaption(scene);
    }

    function sleepFrame(): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, FRAME_MS);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function render(
      next: TwoNetsCompeteScene,
      prev: TwoNetsCompeteScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const step = next.step;
      const moves = step !== null && step.kind !== 'start' && prev !== null && prev.trail.length < next.trail.length;
      if (!opts.animate || destroyed || !moves) {
        draw(next, null);
        return;
      }
      const start = Date.now();
      draw(next, 0);
      for (;;) {
        await sleepFrame();
        if (destroyed || mine !== gen) return;
        const u = Math.min(1, (Date.now() - start) / MOTION_MS);
        if (u >= 1) break;
        draw(next, u);
      }
      draw(next, null);
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
