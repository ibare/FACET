/**
 * fewer-gates 무대 — 두 모형이 한 자(0 부터 2 까지)를 나눠 쓴다.
 *
 * 몫 막대: 왼쪽 끝에서 남길(지킬) 몫, 이어서 들일 몫. 막대 끝에 달린 손잡이가 문이다.
 *   LSTM 은 손잡이 둘(f · i)이 따로 미끄러져 막대 끝이 1 을 넘나든다.
 *   GRU 는 손잡이 하나(z)가 칸막이를 옮기고, 막대 끝은 1 에 박혀 있다.
 * 상태 줄: 앞 걸음이 넘긴 상태가 오른쪽에서 왼쪽 자리로 건너오고, 오른쪽에 새 상태가 선다.
 *   LSTM 은 줄 둘(c · h), GRU 는 줄 하나(h).
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
import type { FewerGatesScene, StepRec } from './scene.js';

const H = 384;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOTION_MS = 400;
const FRAME_MS = 16;

/** 자의 오른쪽 끝 — σ 둘의 합은 2 를 넘지 않는다 */
const SCALE_MAX = 2;

const PX_XS = parseFloat(fontSizes.xs);
const PX_SM = parseFloat(fontSizes.sm);

const PAD = 16;
const BAR_X0 = 44;
const SUM_ROOM = 84;
const BAR_H = 16;
const CHIP_W = 64;
const CHIP_H = 22;
const ROW_GAP = 30;
const LANE_LSTM_Y = 44;
const LANE_GRU_Y = 212;

type Motion = { p: number; from: { f: number; i: number; z: number } | null };

function fx(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

export const fewerGatesStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [keptColor, takenColor] = categorical(2);
    const W = PIECE_CANVAS_W;
    const unit = (W - BAR_X0 - PAD - SUM_ROOM) / SCALE_MAX;
    const xAt = (v: number): number => r2(BAR_X0 + v * unit);
    const afterX = W - PAD - CHIP_W;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
      if (text !== undefined) node.textContent = text;
      svg.appendChild(node);
      return node;
    }

    function label(x: number, y: number, text: string, opts: { size?: number; fill?: string; anchor?: string; weight?: string; mono?: boolean } = {}): void {
      el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size ?? PX_XS,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        text,
      );
    }

    function chip(x: number, cy: number, value: number, fresh: boolean): void {
      el('rect', {
        x,
        y: cy - CHIP_H / 2,
        width: CHIP_W,
        height: CHIP_H,
        rx: 4,
        fill: fresh ? colors.bg : colors.bgSubtle,
        stroke: fresh ? colors.primary : colors.border,
        'stroke-width': fresh ? 1.5 : 1,
      });
      label(x + CHIP_W / 2, cy + 4, fx(value), {
        size: PX_SM,
        anchor: 'middle',
        mono: true,
        weight: fresh ? 'bold' : 'normal',
        fill: fresh ? colors.text : colors.textMuted,
      });
    }

    function knob(x: number, cy: number): void {
      el('circle', { cx: x, cy, r: 6, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 });
    }

    function segment(x0: number, x1: number, top: number, fill: string): void {
      const w = Math.max(0, x1 - x0);
      if (w <= 0) return;
      el('rect', { x: x0, y: top, width: w, height: BAR_H, fill });
    }

    /** 한 상태 줄 — 앞 상태(왼쪽) → 새 상태(오른쪽) */
    function stateRow(
      cy: number,
      sym: string,
      prevValue: number,
      value: number,
      middle: string | null,
      p: number | null,
    ): void {
      label(PAD + 4, cy + 4, sym, { size: PX_SM, mono: true, weight: 'bold' });
      if (middle === null) {
        // 걸음 0 — 처음 상태 하나만 오른쪽 자리에 선다
        chip(afterX, cy, value, true);
        return;
      }
      if (p !== null && p < 1) {
        // 넘기기 — 앞 걸음의 상태가 오른쪽 자리에서 왼쪽 자리로 건너온다
        chip(lerp(afterX, BAR_X0, p), cy, prevValue, true);
        return;
      }
      chip(BAR_X0, cy, prevValue, false);
      const a = BAR_X0 + CHIP_W + 8;
      const b = afterX - 8;
      el('line', { x1: a, y1: cy + 6, x2: b, y2: cy + 6, stroke: colors.border, 'stroke-width': 1 });
      el('polyline', {
        points: `${r2(b - 6)},${r2(cy + 2)} ${r2(b)},${r2(cy + 6)} ${r2(b - 6)},${r2(cy + 10)}`,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1,
      });
      label((a + b) / 2, cy - 1, middle, { size: PX_XS, anchor: 'middle', mono: true, fill: colors.textMuted });
      chip(afterX, cy, value, true);
    }

    function counts(y0: number, gates: number, states: number, weights: number, evals: number): void {
      const x0 = 112;
      const span = (W - PAD - x0) / 4;
      const items = [
        t('label.gates', 'Gates: {n}', { n: gates }),
        t('label.states', 'States carried: {n}', { n: states }),
        t('label.weights', 'Weights: {n}', { n: weights }),
        t('label.evals', 'Gate evaluations: {n}', { n: evals }),
      ];
      items.forEach((s, n) => label(x0 + n * span, y0 + 14, s, { fill: colors.textMuted }));
    }

    function drawFrame(scene: FewerGatesScene, motion: Motion | null): void {
      svg.textContent = '';
      const base = scene.base;
      const sym = base.symbols;
      const last: StepRec | undefined = scene.steps[scene.steps.length - 1];
      const p = motion === null ? 1 : motion.p;
      const from = motion === null ? null : motion.from;

      // 입력 차례 — 두 모형이 같은 입력을 받는다
      label(PAD, 28, t('label.input', 'Input'), { size: PX_SM, fill: colors.textMuted });
      const tokW = 44;
      const tokGap = 12;
      const tokX0 = 112;
      base.inputs.forEach((x, n) => {
        const done = last !== undefined && n < last.k;
        const now = last !== undefined && n === last.k - 1;
        const tx = tokX0 + n * (tokW + tokGap);
        el('rect', {
          x: tx,
          y: 13,
          width: tokW,
          height: 22,
          rx: 4,
          fill: now ? colors.accent : done ? colors.bgSubtle : colors.bg,
          stroke: now ? colors.accent : colors.border,
          'stroke-width': 1,
        });
        label(tx + tokW / 2, 28, String(x), {
          size: PX_SM,
          anchor: 'middle',
          mono: true,
          fill: now ? colors.stateInk : done ? colors.textMuted : colors.text,
          weight: now ? 'bold' : 'normal',
        });
      });

      // 두 모형이 함께 쓰는 1 의 자리
      const oneX = xAt(1);
      label(oneX, LANE_LSTM_Y + 30, String(1), { anchor: 'middle', mono: true, fill: colors.textMuted });
      for (const y0 of [LANE_LSTM_Y, LANE_GRU_Y]) {
        el('line', {
          x1: oneX,
          y1: y0 + 34,
          x2: oneX,
          y2: y0 + 38 + BAR_H + 4,
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
      }

      // ── LSTM ──
      {
        const y0 = LANE_LSTM_Y;
        const shape = base.shape.lstm;
        label(PAD, y0 + 14, base.names.lstm, { size: PX_SM, weight: 'bold' });
        counts(y0, shape.gates, shape.states, shape.weights, last === undefined ? 0 : last.evals.lstm);
        const top = y0 + 38;
        const cy = top + BAR_H / 2;
        el('line', { x1: BAR_X0, y1: cy, x2: xAt(SCALE_MAX), y2: cy, stroke: colors.border, 'stroke-width': 1 });
        if (last !== undefined) {
          const L = last.lstm;
          const fNow = lerp(from === null ? 0 : from.f, L.f, p);
          const iNow = lerp(from === null ? 0 : from.i, L.i, p);
          const xf = xAt(fNow);
          const xe = xAt(fNow + iNow);
          segment(BAR_X0, xf, top, keptColor ?? colors.primary);
          segment(xf, xe, top, takenColor ?? colors.accent);
          knob(xf, cy);
          knob(xe, cy);
          label(BAR_X0, y0 + 32, t('label.seg', '{name} {sym} = {v}', { name: t('name.forget', 'forget gate'), sym: sym.f, v: fx(L.f) }));
          label(xf, y0 + 70, t('label.seg', '{name} {sym} = {v}', { name: t('name.inputGate', 'input gate'), sym: sym.i, v: fx(L.i) }));
          label(xe + 12, cy + 4, t('label.sum', 'Sum: {v}', { v: fx(L.sum) }), { size: PX_SM, weight: 'bold' });
          label(BAR_X0, y0 + 90, t('label.seg', '{name} {sym} = {v}', { name: t('name.candidate', 'candidate'), sym: sym.g, v: fx(L.g) }), { fill: colors.textMuted });
          label(BAR_X0 + 170, y0 + 90, t('label.seg', '{name} {sym} = {v}', { name: t('name.output', 'output gate'), sym: sym.o, v: fx(L.o) }), { fill: colors.textMuted });
        }
        const rowC = y0 + 100 + CHIP_H / 2;
        const rowH = rowC + ROW_GAP;
        if (last === undefined) {
          stateRow(rowC, sym.c, base.start.c, base.start.c, null, null);
          stateRow(rowH, sym.h, base.start.hl, base.start.hl, null, null);
        } else {
          const L = last.lstm;
          stateRow(rowC, sym.c, L.cPrev, L.c, t('label.cSplit', 'kept {a} + taken {b}', { a: fx(L.kept), b: fx(L.taken) }), motion === null ? null : p);
          stateRow(rowH, sym.h, L.hPrev, L.h, t('label.lstmH', '{o} × tanh({c})', { o: fx(L.o), c: fx(L.c) }), motion === null ? null : p);
        }
      }

      // ── GRU ──
      {
        const y0 = LANE_GRU_Y;
        const shape = base.shape.gru;
        label(PAD, y0 + 14, base.names.gru, { size: PX_SM, weight: 'bold' });
        counts(y0, shape.gates, shape.states, shape.weights, last === undefined ? 0 : last.evals.gru);
        const top = y0 + 38;
        const cy = top + BAR_H / 2;
        el('line', { x1: BAR_X0, y1: cy, x2: xAt(SCALE_MAX), y2: cy, stroke: colors.border, 'stroke-width': 1 });
        // 몫 둘이 나눠 갖는 칸 — 길이 1 에 박혀 있다
        el('rect', { x: BAR_X0, y: top, width: xAt(1) - BAR_X0, height: BAR_H, fill: 'none', stroke: colors.text, 'stroke-width': 1.5 });
        if (last !== undefined) {
          const G = last.gru;
          const zNow = lerp(from === null ? 0 : from.z, G.z, p);
          const xz = xAt(zNow);
          // 첫 걸음만 두 몫이 함께 자라고, 그 뒤로는 끝이 두 몫의 합에 박힌 채 칸막이만 옮겨 간다
          const xe = xAt(from === null ? G.sum * p : G.sum);
          segment(BAR_X0, xz, top, keptColor ?? colors.primary);
          segment(xz, xe, top, takenColor ?? colors.accent);
          knob(xz, cy);
          label(BAR_X0, y0 + 32, t('label.seg', '{name} {sym} = {v}', { name: t('name.update', 'update gate'), sym: sym.z, v: fx(G.z) }));
          label(xz, y0 + 70, t('label.seg', '{name} {sym} = {v}', { name: t('name.takeIn', 'take-in share'), sym: sym.rest, v: fx(G.rest) }));
          label(xAt(1) + 12, cy + 4, t('label.sum', 'Sum: {v}', { v: fx(G.sum) }), { size: PX_SM, weight: 'bold' });
          label(BAR_X0, y0 + 90, t('label.seg', '{name} {sym} = {v}', { name: t('name.candidate', 'candidate'), sym: sym.cand, v: fx(G.cand) }), { fill: colors.textMuted });
          label(BAR_X0 + 170, y0 + 90, t('label.seg', '{name} {sym} = {v}', { name: t('name.reset', 'reset gate'), sym: sym.r, v: fx(G.r) }), { fill: colors.textMuted });
        }
        const rowHg = y0 + 100 + CHIP_H / 2;
        if (last === undefined) {
          stateRow(rowHg, sym.h, base.start.hg, base.start.hg, null, null);
        } else {
          const G = last.gru;
          stateRow(rowHg, sym.h, G.hPrev, G.h, t('label.hSplit', 'kept {a} + taken {b}', { a: fx(G.kept), b: fx(G.taken) }), motion === null ? null : p);
        }
      }

      // 캡션 — 지금 일어나는 일
      let caption: string;
      if (last === undefined) {
        caption = t('caption.start', 'Same inputs for both models. States carried — {ln}: {l} · {gn}: {g}.', {
          ln: base.names.lstm,
          l: base.shape.lstm.states,
          gn: base.names.gru,
          g: base.shape.gru.states,
        });
      } else if (last.k === base.inputs.length) {
        const first = base.inputs[0];
        if (first === undefined) throw new Error('fewer-gates 무대: 입력 차례가 비어 첫 입력을 말할 수 없다');
        caption = t('caption.end', 'First input: {x}. Final {hs} — {ln}: {lh} · {gn}: {gh}.', {
          x: String(first),
          hs: sym.h,
          ln: base.names.lstm,
          lh: fx(last.lstm.h),
          gn: base.names.gru,
          gh: fx(last.gru.h),
        });
      } else {
        caption = t('caption.step', 'Input: {x}. Gates computed this step — {ln}: {nl} · {gn}: {ng}.', {
          x: String(last.x),
          ln: base.names.lstm,
          nl: base.shape.lstm.gates,
          gn: base.names.gru,
          ng: base.shape.gru.gates,
        });
      }
      label(PAD, H - 14, caption, { size: PX_SM });
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const began = Date.now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - began) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: FewerGatesScene, _prev: FewerGatesScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      if (!opts.animate || step.kind === 'start') {
        drawFrame(next, null);
        return;
      }
      await tween(MOTION_MS, mine, (p) => drawFrame(next, { p, from: step.from }));
      if (destroyed || mine !== gen) return;
      drawFrame(next, null);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
