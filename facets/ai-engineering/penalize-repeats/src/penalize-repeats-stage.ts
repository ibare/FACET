/**
 * 되풀이 벌점 stage — 로짓 사다리 하나.
 *
 * 후보 다섯이 한 세로축(로짓) 위에 제 값의 높이로 매달려 있다. 앞 문맥에 나온 후보만
 * 골라 그 값이 사다리를 따라 깎여 내려가고, 안 나온 후보는 그 자리에 서 있다.
 * 깎인 1등은 새 후보 아래로 내려앉고, 소프트맥스를 다시 셈하면 1등 표지가 옮겨 간다.
 * 음수 로짓은 곱해서 더 내려가고, 거꾸로 나눴다면 올라갔을 자리를 옆 줄에 대조로 둔다.
 *
 * 로짓은 모두 예로 정한 값이다 (실제 언어 모형의 출력이 아니다).
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import {
  currentLogits,
  currentProbs,
  type PenalizeRepeatsBase,
  type PenalizeRepeatsScene,
} from './scene.js';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

const CUT_MS = 1000;
const PICK_MS = 700;

const PAD = 20;
const CHIP_Y = 30;
const CHIP_H = 24;
const LADDER_TOP = 104;
const LADDER_BOT = H - 52;
const TAG_H = 18;
const CAPTION_Y = H - 18;

type Geometry = {
  w: number;
  ax: number;
  tagX: number;
  tagW: number;
  pX: number;
  laneX: number;
  laneW: number;
  markerX: number;
  lo: number;
  hi: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function r1(v: number): number {
  const out = Math.round(v * 10) / 10;
  return Object.is(out, -0) ? 0 : out;
}

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

/** 표시용 — 음수는 빼기표(−)로. */
function signed(text: string): string {
  return text.startsWith('-') ? `−${text.slice(1)}` : text;
}
/** 데이터 그대로의 로짓 — 첫째 자리. */
function fmtData(v: number): string {
  return signed(r1(v).toFixed(1));
}
/** 셈한 로짓 · 확률 — 둘째 자리. */
function fmtCalc(v: number): string {
  return signed(r2(v).toFixed(2));
}
function fmtTheta(v: number): string {
  return String(r2(v));
}

function geometry(base: PenalizeRepeatsBase, w: number): Geometry {
  const ax = Math.round(w * 0.22);
  const tagX = ax + 16;
  const tagW = Math.round(w * 0.3);
  const pX = tagX + tagW + 14;
  const laneW = Math.round(w * 0.22);
  const laneX = w - PAD - laneW;
  const markerX = PAD;
  const used = new Set(base.context);
  const vals: number[] = [0];
  base.logits.forEach((z, i) => {
    vals.push(z);
    if (used.has(base.tokens[i]!)) {
      vals.push(base.cutTo[i]!);
      if (z <= 0) vals.push(base.wrongTo[i]!);
    }
  });
  const span = Math.max(...vals) - Math.min(...vals);
  const pad = span * 0.06;
  return { w, ax, tagX, tagW, pX, laneX, laneW, markerX, lo: Math.min(...vals) - pad, hi: Math.max(...vals) + pad };
}

function yOf(g: Geometry, v: number): number {
  const t = (v - g.lo) / (g.hi - g.lo);
  return Math.round((LADDER_BOT - t * (LADDER_BOT - LADDER_TOP)) * 10) / 10;
}

type Handles = {
  tags: Map<number, SVGGElement>;
  marker: SVGGElement | null;
  wrong: Map<number, SVGGElement>;
};

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function mountStage(
  container: HTMLElement,
  params: ViewMountParams & { canvas: SVGSVGElement },
): ViewInstance & SceneRenderer<PenalizeRepeatsScene> {
  void container;
  const svg = params.canvas;
  const t: Translate = params.t ?? makeTranslator(params.locale);
  const c: Palette = getColors(params.theme);
  const W = PIECE_CANVAS_W;

  let destroyed = false;
  let gen = 0;
  const frames = new Set<number>();
  const waiters = new Set<() => void>();

  function tween(ms: number, f: (e: number) => void, mine: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = (): void => {
        waiters.delete(done);
        resolve();
      };
      waiters.add(done);
      const start = performance.now();
      const tick = (now: number): void => {
        if (destroyed || mine !== gen) return done();
        const k = Math.min(1, (now - start) / ms);
        f(ease(k));
        if (k >= 1) return done();
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

  function text(
    parent: Element,
    x: number,
    y: number,
    s: string,
    opts: { fill: string; size?: string; anchor?: string; weight?: string; mono?: boolean },
  ): SVGTextElement {
    const node = el(
      'text',
      {
        x,
        y,
        fill: opts.fill,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'central',
      },
      parent,
    );
    if (opts.weight) node.setAttribute('font-weight', opts.weight);
    node.textContent = s;
    return node;
  }

  function drawContext(base: PenalizeRepeatsBase, cutTokens: Set<string>, live: string | null): void {
    text(svg, PAD, 12, t('label.context', 'Already written'), { fill: c.textMuted, size: fontSizes.xs });
    const charW = 8;
    const gap = 6;
    const widths = base.context.map((w) => w.length * charW + 14);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
    const k = Math.min(1, (W - 2 * PAD) / total);
    let x = Math.round((W - total * k) / 2);
    base.context.forEach((word, idx) => {
      const cw = widths[idx]! * k;
      const hit = cutTokens.has(word);
      const now = live === word;
      el(
        'rect',
        {
          x: Math.round(x),
          y: CHIP_Y,
          width: Math.round(cw),
          height: CHIP_H,
          rx: 4,
          fill: hit ? c.itemComparing : c.bgSubtle,
          stroke: now ? c.text : c.border,
          'stroke-width': now ? 2 : 1,
        },
        svg,
      );
      text(svg, Math.round(x + cw / 2), CHIP_Y + CHIP_H / 2, word, {
        fill: hit ? c.textInverse : c.text,
        anchor: 'middle',
        mono: true,
        size: fontSizes.md,
      });
      x += cw + gap * k;
    });
  }

  function drawStatic(s: PenalizeRepeatsScene): Handles {
    svg.textContent = '';
    const handles: Handles = { tags: new Map(), marker: null, wrong: new Map() };
    const base = s.base;
    if (!base) return handles;
    const g = geometry(base, W);
    const now = currentLogits(s);
    const probs = currentProbs(s);
    const step = s.step;
    const liveI = step && step.kind === 'cut' ? step.i : null;

    const cutTokens = new Set<string>();
    base.tokens.forEach((tok, i) => {
      if (s.cut[i]) cutTokens.add(tok);
    });
    drawContext(base, cutTokens, liveI === null ? null : base.tokens[liveI]!);

    // 축과 0 선
    text(svg, g.ax, LADDER_TOP - 22, t('label.logit', 'logit'), {
      fill: c.textMuted,
      size: fontSizes.xs,
      anchor: 'middle',
    });
    text(svg, g.pX, LADDER_TOP - 22, t('label.p', 'p'), { fill: c.textMuted, size: fontSizes.xs });
    el('line', { x1: g.ax, y1: LADDER_TOP - 10, x2: g.ax, y2: LADDER_BOT, stroke: c.border, 'stroke-width': 2 }, svg);
    const y0 = yOf(g, 0);
    el(
      'line',
      { x1: g.ax - 6, y1: y0, x2: g.w - PAD, y2: y0, stroke: c.border, 'stroke-dasharray': '3 4' },
      svg,
    );
    text(svg, g.ax - 10, y0, '0', { fill: c.textMuted, size: fontSizes.xs, anchor: 'end', mono: true });

    // 떠난 자리 — 깎이기 전 값의 빈 틀과 벌점 식
    base.tokens.forEach((tok, i) => {
      if (!s.cut[i]) return;
      const yOld = yOf(g, base.logits[i]!);
      el(
        'rect',
        {
          x: g.tagX,
          y: yOld - TAG_H / 2,
          width: g.tagW,
          height: TAG_H,
          rx: 3,
          fill: 'none',
          stroke: c.textMuted,
          'stroke-dasharray': '4 3',
        },
        svg,
      );
      text(svg, g.tagX + 8, yOld, tok, { fill: c.textMuted, mono: true });
      text(svg, g.tagX + g.tagW - 8, yOld, fmtData(base.logits[i]!), {
        fill: c.textMuted,
        mono: true,
        anchor: 'end',
      });
      const op =
        base.logits[i]! > 0
          ? t('label.div', '÷ {theta}', { theta: fmtTheta(base.theta) })
          : t('label.mul', '× {theta}', { theta: fmtTheta(base.theta) });
      text(svg, g.pX, yOld, op, { fill: c.itemComparing, mono: true, weight: '600' });
      el(
        'line',
        {
          x1: g.tagX - 6,
          y1: yOld,
          x2: g.tagX - 6,
          y2: yOf(g, base.cutTo[i]!),
          stroke: c.itemComparing,
          'stroke-width': 2,
        },
        svg,
      );

      // 거꾸로 나눴다면 — 음수는 0 쪽으로 올라갔다
      if (base.logits[i]! <= 0) {
        const yW = yOf(g, base.wrongTo[i]!);
        const ax2 = g.laneX - 10;
        text(svg, g.laneX + g.laneW / 2, yW - TAG_H, t('label.wrong', 'if ÷ {theta} instead', { theta: fmtTheta(base.theta) }), {
          fill: c.danger,
          size: fontSizes.xs,
          anchor: 'middle',
        });
        el('line', { x1: ax2 - 12, y1: yOld, x2: ax2 + 6, y2: yOld, stroke: c.danger, 'stroke-dasharray': '2 3' }, svg);
        el('line', { x1: ax2, y1: yOld, x2: ax2, y2: yW + 4, stroke: c.danger, 'stroke-width': 1.5 }, svg);
        el('path', { d: `M ${ax2 - 4} ${yW + 5} L ${ax2} ${yW - 1} L ${ax2 + 4} ${yW + 5} Z`, fill: c.danger }, svg);
        const gw = el('g', {}, svg);
        el(
          'rect',
          {
            x: g.laneX,
            y: yW - TAG_H / 2,
            width: g.laneW,
            height: TAG_H,
            rx: 3,
            fill: 'none',
            stroke: c.danger,
            'stroke-dasharray': '4 3',
          },
          gw,
        );
        text(gw, g.laneX + 8, yW, tok, { fill: c.danger, mono: true });
        text(gw, g.laneX + g.laneW - 8, yW, fmtCalc(base.wrongTo[i]!), { fill: c.danger, mono: true, anchor: 'end' });
        handles.wrong.set(i, gw);
      }
    });

    // 후보 — 지금 값의 높이에
    base.tokens.forEach((tok, i) => {
      const y = yOf(g, now[i]!);
      const top = s.top === i;
      const gt = el('g', {}, svg);
      el('circle', { cx: g.ax, cy: y, r: 3.5, fill: s.cut[i] ? c.itemComparing : c.text }, gt);
      el('line', { x1: g.ax, y1: y, x2: g.tagX, y2: y, stroke: c.border }, gt);
      el(
        'rect',
        {
          x: g.tagX,
          y: y - TAG_H / 2,
          width: g.tagW,
          height: TAG_H,
          rx: 3,
          fill: c.bg,
          stroke: top ? c.accent : s.cut[i] ? c.itemComparing : c.border,
          'stroke-width': top ? 2.5 : 1.5,
        },
        gt,
      );
      text(gt, g.tagX + 8, y, tok, { fill: c.text, mono: true, weight: top ? '700' : '400' });
      text(gt, g.tagX + g.tagW - 8, y, s.cut[i] ? fmtCalc(now[i]!) : fmtData(now[i]!), {
        fill: s.cut[i] ? c.itemComparing : c.text,
        mono: true,
        anchor: 'end',
      });
      text(gt, g.pX, y, s.probs === 'fresh' ? fmtCalc(probs[i]!) : '—', {
        fill: s.probs === 'fresh' ? (top ? c.text : c.textMuted) : c.textMuted,
        mono: true,
        weight: top && s.probs === 'fresh' ? '700' : '400',
      });
      handles.tags.set(i, gt);
    });

    // 1등 표지
    const yTop = yOf(g, now[s.top]!);
    const gm = el('g', {}, svg);
    const mw = g.ax - 16 - g.markerX;
    el(
      'rect',
      { x: g.markerX, y: yTop - 11, width: mw, height: 22, rx: 11, fill: c.accent },
      gm,
    );
    el(
      'path',
      { d: `M ${g.markerX + mw} ${yTop - 5} L ${g.ax - 7} ${yTop} L ${g.markerX + mw} ${yTop + 5} Z`, fill: c.accent },
      gm,
    );
    text(gm, g.markerX + mw / 2, yTop, t('label.top', 'top'), {
      fill: c.stateInk,
      anchor: 'middle',
      weight: '700',
    });
    handles.marker = gm;

    // 캡션 — 지금 일어나는 일만
    drawCaption(s, base, now, probs);
    return handles;
  }

  function drawCaption(
    s: PenalizeRepeatsScene,
    base: PenalizeRepeatsBase,
    now: number[],
    probs: number[],
  ): void {
    const step = s.step;
    if (!step) return;
    let msg = '';
    if (step.kind === 'start') {
      msg = t('caption.start', 'Before any penalty: {token} is on top, p {p}.', {
        token: base.tokens[s.top]!,
        p: fmtCalc(probs[s.top]!),
      });
    } else if (step.kind === 'cut') {
      const i = step.i;
      const vars = {
        token: base.tokens[i]!,
        from: fmtData(base.logits[i]!),
        theta: fmtTheta(base.theta),
        to: fmtCalc(now[i]!),
      };
      msg =
        base.logits[i]! > 0
          ? t('caption.cutDiv', '"{token}" was already written: {from} ÷ {theta} = {to}.', vars)
          : t('caption.cutMul', '"{token}" was already written and is zero or below: {from} × {theta} = {to}.', vars);
    } else {
      msg = t('caption.pick', 'Softmax again on the cut logits: {token} is on top, p {p}.', {
        token: base.tokens[step.i]!,
        p: fmtCalc(probs[step.i]!),
      });
    }
    text(svg, W / 2, CAPTION_Y, msg, { fill: c.text, anchor: 'middle', size: fontSizes.md });
  }

  async function render(
    next: PenalizeRepeatsScene,
    prev: PenalizeRepeatsScene | null,
    opts: { animate: boolean },
  ): Promise<void> {
    const mine = (gen += 1);
    if (destroyed) return;
    const h = drawStatic(next);
    const step = next.step;
    const base = next.base;
    if (!opts.animate || !base || !step || !prev || !prev.base) return;
    const g = geometry(base, W);

    if (step.kind === 'cut') {
      const i = step.i;
      const tag = h.tags.get(i);
      const wrong = h.wrong.get(i);
      const marker = next.top === i ? h.marker : null;
      const yOld = yOf(g, base.logits[i]!);
      const dy = yOld - yOf(g, base.cutTo[i]!);
      const dyW = wrong ? yOld - yOf(g, base.wrongTo[i]!) : 0;
      const bump = g.tagW * 0.45;
      await tween(
        CUT_MS,
        (e) => {
          const off = r2(dy * (1 - e));
          const bx = r2(Math.sin(Math.PI * e) * bump);
          tag?.setAttribute('transform', `translate(${bx} ${off})`);
          marker?.setAttribute('transform', `translate(0 ${off})`);
          wrong?.setAttribute('transform', `translate(0 ${r2(dyW * (1 - e))})`);
        },
        mine,
      );
    } else if (step.kind === 'pick' && step.was !== step.i) {
      const now = currentLogits(next);
      const dy = yOf(g, now[step.was]!) - yOf(g, now[step.i]!);
      const marker = h.marker;
      await tween(
        PICK_MS,
        (e) => {
          marker?.setAttribute('transform', `translate(0 ${r2(dy * (1 - e))})`);
        },
        mine,
      );
    }
    if (mine !== gen || destroyed) return;
    drawStatic(next);
  }

  function destroy(): void {
    destroyed = true;
    gen += 1;
    for (const id of frames) cancelAnimationFrame(id);
    frames.clear();
    for (const wake of [...waiters]) wake();
    waiters.clear();
    svg.textContent = '';
  }

  svg.textContent = '';
  return { render, destroy };
}

export const penalizeRepeatsStageView: CanvasView = {
  canvas: { height: H },
  mount: mountStage,
};
