/**
 * gated-cells 무대 — 한 줄로 펼친 시각의 사슬과, 셀이 들고 가는 상태 위를 흐르는 **남은 몫 띠**.
 *
 * 운동:
 *   - 셀 손잡이: 넘기는 길의 가짓수가 바뀐다 — LSTM 이면 c 길이 h 길에서 갈라져 올라가고, 아니면 h 길 하나로 합친다.
 *     띠는 셀이 들고 가는 길(c 또는 h) 위로 옮겨 간다
 *   - 사이 손잡이: 사슬의 끝이 늘어나거나 줄어든다 (끝 표지가 함께 옮겨 간다)
 *   - 걸음: 띠의 머리가 다음 시각으로 뻗으며 그 굵기가 곱한 몫만큼 녹고, 그 시각의 문 눈금이 차오른다
 *
 * 셈은 하지 않는다 — 값 · 몫 · 범위는 모두 payload 로 받는다. 표시만 자른다 (toFixed, 0 이 되는 음수는 부호를 뗀다).
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { EndView, SetupView, StepView } from './projector.js';

const W = 880;
const H = 368;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 가로 — 시각 0(처음 상태) · 1..13 의 가운데
const CX0 = 150;
const SLOT = 50;
const cx = (k: number): number => CX0 + SLOT * k;
const END_DX = 56;
const SYMBOL_X = 10;
const ROLE_X = 26;

// 세로 — 사다리의 가장 긴 사슬(시각 열셋)과 LSTM 의 두 길이 처음부터 들어간다
const Y_TIME = 22;
const Y_X = 46;
const Y_GATE0 = 72;
const GATE_ROW = 24;
const Y_CAND = 146;
const Y_ONE_LANE = 214;
const Y_LANE_C = 188;
const Y_LANE_H = 244;
const Y_FACTOR = 290;
const Y_KEPT = 312;
const Y_CAPTION = 348;
const BAND = 28;
const NODE_W = 40;
const NODE_H = 20;
const GAUGE_H = 18;

/** 표시 — 자리수에서 자르고, 0 이 되는 음수는 부호를 떼고, 음수 부호는 U+2212. */
function fmt(v: number, digits: number): string {
  const s = v.toFixed(digits);
  const unsigned = Number(s) === 0 ? s.replace('-', '') : s;
  return unsigned.replace('-', '−');
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/** GRU 의 후보는 상태와 같은 글자 h 라 물결을 얹어 가른다 (기호 표기). */
const candidateMark = (id: string): string => (id === 'h' ? 'h̃' : id);

type Anim = {
  laneY: Record<string, number>;
  chainEnd: number;
  bandFront: number;
  endReach: number;
  newestFill: number;
};

export const gatedCellsStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const pal = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const fsXs = parseFloat(fontSizes.xs);
    const fsSm = parseFloat(fontSizes.sm);
    const fsMd = parseFloat(fontSizes.md);

    const root = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(root);

    let setup: SetupView | null = null;
    let steps: StepView[] = [];
    let end: EndView | null = null;
    let caption = '';

    let cur: Anim = { laneY: { h: Y_ONE_LANE }, chainEnd: 0, bandFront: 0, endReach: 0, newestFill: 1 };
    let from: Anim = cur;
    let target: Anim = cur;
    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const el = (name: string, attrs: Record<string, string | number>, text?: string): SVGElement => {
      const node = document.createElementNS(SVG_NS, name);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      if (text !== undefined) node.textContent = text;
      root.appendChild(node);
      return node;
    };
    const label = (x: number, y: number, s: string, opts: { size?: number; fill?: string; anchor?: string; mono?: boolean; bold?: boolean } = {}) =>
      el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fsXs,
          fill: opts.fill ?? pal.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
          'font-weight': opts.bold ? 700 : 400,
        },
        s,
      );

    const laneValue = (lanes: { id: string; value: number }[], id: string): number => {
      const found = lanes.find((l) => l.id === id);
      if (!found) throw new Error(`gated-cells stage: 길 ${id} 의 값이 없다`);
      return found.value;
    };

    const draw = (a: Anim): void => {
      while (root.firstChild) root.removeChild(root.firstChild);
      // 머리말 열
      label(SYMBOL_X, Y_TIME, t('label.time', 'time'), { fill: pal.textMuted });
      label(SYMBOL_X, Y_X, 'x', { mono: true, size: fsSm });
      label(ROLE_X, Y_X, t('label.input', 'input'), { fill: pal.textMuted });
      label(SYMBOL_X, Y_FACTOR, t('label.factor', 'multiplied share'), { fill: pal.textMuted });
      label(SYMBOL_X, Y_KEPT, t('label.kept', 'kept share'), { fill: pal.textMuted });
      if (!setup) return;
      const s = setup;
      const n = s.xs.length;
      const lastStep = steps.length;

      // 지금 시각의 세로 띠
      if (lastStep > 0 && !end) {
        el('rect', { x: cx(lastStep) - SLOT / 2, y: Y_TIME - 10, width: SLOT, height: Y_KEPT + 10 - (Y_TIME - 10), fill: pal.bgSubtle, rx: 4 });
      }

      // 문 줄 · 후보 줄의 이름
      s.gateIds.forEach((id, row) => {
        const y = Y_GATE0 + row * GATE_ROW;
        label(SYMBOL_X, y, id, { mono: true, size: fsSm });
        label(ROLE_X, y, t('label.gate', 'gate'), { fill: pal.textMuted });
      });
      if (s.gateIds.length === 0) {
        label(SYMBOL_X, Y_GATE0 + GATE_ROW, t('label.noGate', 'no gates'), { fill: pal.textMuted });
      }
      if (s.candidateId !== null) {
        label(SYMBOL_X, Y_CAND, candidateMark(s.candidateId), { mono: true, size: fsSm });
        label(ROLE_X, Y_CAND, t('label.candidate', 'candidate'), { fill: pal.textMuted });
      }

      // 길 — 선을 사슬 끝까지 (끝이 늘고 준다)
      const chainX = cx(a.chainEnd);
      for (const lane of s.lanes) {
        const y = a.laneY[lane.id];
        if (y === undefined) throw new Error(`gated-cells stage: 길 ${lane.id} 의 자리가 없다`);
        label(SYMBOL_X, y, lane.id, { mono: true, size: fsSm });
        label(ROLE_X, y, lane.id === 'c' ? t('label.cellState', 'cell') : t('label.hidden', 'hidden state'), { fill: pal.textMuted });
        el('line', { x1: cx(0), y1: y, x2: chainX, y2: y, stroke: pal.border, 'stroke-width': 2 });
      }

      // 남은 몫 띠 — 셀이 들고 가는 길 위
      const bandY = a.laneY[s.carried];
      if (bandY === undefined) throw new Error('gated-cells stage: 띠의 길이 없다');
      const kv = steps.map((st) => st.kept);
      if (a.bandFront > 0 && kv.length > 0) {
        const top: [number, number][] = [];
        const whole = Math.min(Math.floor(a.bandFront), kv.length);
        if (a.bandFront < 1) {
          const th = kv[0] * BAND * a.bandFront;
          top.push([cx(1) - SLOT * 0.3 * a.bandFront, th], [cx(1), th]);
        } else {
          for (let k = 1; k <= whole; k += 1) top.push([cx(k), kv[k - 1] * BAND]);
          const frac = a.bandFront - whole;
          if (frac > 0 && whole < kv.length) {
            top.push([lerp(cx(whole), cx(whole + 1), frac), lerp(kv[whole - 1], kv[whole], frac) * BAND]);
          }
          if (a.endReach > 0 && end) {
            const last = kv[kv.length - 1] * BAND;
            top.push([lerp(cx(kv.length), cx(n) + END_DX, a.endReach), last]);
          }
        }
        if (top.length === 1) top.unshift([top[0][0] - 1, top[0][1]]);
        const pts = [
          ...top.map(([x, th]) => `${x},${bandY - th / 2}`),
          ...[...top].reverse().map(([x, th]) => `${x},${bandY + th / 2}`),
        ].join(' ');
        // 굵기 1 의 틀 (처음 굵기) — 띠가 그 안에서 녹는다
        const x0 = top[0][0];
        const x1 = top[top.length - 1][0];
        for (const dy of [-BAND / 2, BAND / 2]) {
          el('line', { x1: x0, y1: bandY + dy, x2: x1, y2: bandY + dy, stroke: pal.textMuted, 'stroke-width': 1, 'stroke-dasharray': '3 3' });
        }
        el('polygon', { points: pts, fill: pal.accent, 'fill-opacity': 0.85, stroke: 'none' });
      }

      // 시각의 자리
      const drawn = Math.min(n, Math.floor(a.chainEnd + 1e-6));
      label(cx(0), Y_TIME, '0', { anchor: 'middle', fill: pal.textMuted, mono: true });
      for (const lane of s.lanes) {
        const y = a.laneY[lane.id];
        el('rect', { x: cx(0) - NODE_W / 2, y: y - NODE_H / 2, width: NODE_W, height: NODE_H, rx: 4, fill: pal.bg, stroke: pal.border });
        label(cx(0), y, fmt(lane.value, 2), { anchor: 'middle', mono: true });
      }
      for (let k = 1; k <= drawn; k += 1) {
        const x = cx(k);
        const st: StepView | undefined = steps[k - 1];
        const reached = st !== undefined;
        const newest = k === lastStep && !end;
        label(x, Y_TIME, String(k), { anchor: 'middle', fill: reached ? pal.text : pal.textMuted, mono: true });
        label(x, Y_X, fmt(s.xs[k - 1], 1), { anchor: 'middle', fill: reached ? pal.text : pal.textMuted, mono: true, bold: k === 1 });
        // 문 눈금
        s.gateIds.forEach((id, row) => {
          const y = Y_GATE0 + row * GATE_ROW;
          el('rect', { x: x - 20, y: y - GAUGE_H / 2, width: 7, height: GAUGE_H, fill: pal.bg, stroke: pal.border });
          if (!st) return;
          const g = st.gates.find((q) => q.id === id);
          if (!g) throw new Error(`gated-cells stage: 문 ${id} 의 값이 없다`);
          const fill = GAUGE_H * g.value * (newest ? a.newestFill : 1);
          el('rect', { x: x - 20, y: y + GAUGE_H / 2 - fill, width: 7, height: fill, fill: pal.primary });
          label(x - 9, y, fmt(g.value, 2), { mono: true });
        });
        if (st && s.candidateId !== null) {
          if (st.candidate === null) throw new Error('gated-cells stage: 후보 값이 없다');
          label(x, Y_CAND, fmt(st.candidate, 2), { anchor: 'middle', mono: true });
        }
        for (const lane of s.lanes) {
          const y = a.laneY[lane.id];
          el('rect', {
            x: x - NODE_W / 2,
            y: y - NODE_H / 2,
            width: NODE_W,
            height: NODE_H,
            rx: 4,
            // 들고 가는 길의 칸은 비워 띠가 비치게 한다
            fill: lane.id === s.carried && reached ? 'none' : pal.bg,
            stroke: newest ? pal.itemActive : pal.border,
            'stroke-width': newest ? 2 : 1,
            'stroke-dasharray': reached ? 'none' : '3 3',
          });
          if (st) label(x, y, fmt(laneValue(st.lanes, lane.id), 2), { anchor: 'middle', mono: true });
        }
        if (st && st.factor !== null) {
          label(x, Y_FACTOR, `×${fmt(st.factor, 2)}`, { anchor: 'middle', mono: true });
        }
        if (st) label(x, Y_KEPT, fmt(st.kept, 2), { anchor: 'middle', mono: true, bold: newest });
      }

      // 끝 표지 — 사슬 끝을 따라 옮겨 간다
      const endX = chainX + END_DX;
      el('rect', { x: endX - 7, y: bandY - BAND / 2, width: 14, height: BAND, fill: 'none', stroke: pal.textMuted, 'stroke-dasharray': '3 3' });
      if (end) {
        const th = end.kept * BAND * a.endReach;
        el('rect', { x: endX - 7, y: bandY - th / 2, width: 14, height: th, fill: pal.accent, stroke: pal.text, 'stroke-width': 1 });
        label(endX, bandY - BAND / 2 - 10, fmt(end.kept, 2), { anchor: 'middle', mono: true, bold: true, size: fsMd });
      }

      label(SYMBOL_X, Y_CAPTION, caption, { size: fsSm });
    };

    const stop = (): void => {
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
      frame = null;
      timer = null;
    };

    const mix = (p: number): Anim => {
      const laneY: Record<string, number> = {};
      for (const [id, to] of Object.entries(target.laneY)) {
        const start = id in from.laneY ? from.laneY[id] : from.laneY.h;
        if (start === undefined) throw new Error('gated-cells stage: 길의 처음 자리가 없다');
        laneY[id] = lerp(start, to, p);
      }
      return {
        laneY,
        chainEnd: lerp(from.chainEnd, target.chainEnd, p),
        bandFront: lerp(from.bandFront, target.bandFront, p),
        endReach: lerp(from.endReach, target.endReach, p),
        newestFill: lerp(from.newestFill, target.newestFill, p),
      };
    };

    /** 지금 보이는 자리에서 목표까지 ms 동안 옮긴다. */
    const animate = (next: Anim, ms: number): void => {
      stop();
      from = cur;
      target = next;
      if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
        cur = mix(1);
        draw(cur);
        return;
      }
      const t0 = performance.now();
      const tick = (): void => {
        const p = Math.min(1, (performance.now() - t0) / ms);
        cur = mix(ease(p));
        draw(cur);
        frame = p < 1 ? requestAnimationFrame(tick) : null;
      };
      draw(mix(0));
      frame = requestAnimationFrame(tick);
      // 탭이 가려져 rAF 가 멎어도 끝 자리에는 닿는다
      timer = setTimeout(() => {
        timer = null;
        if (frame === null) return;
        stop();
        cur = mix(1);
        draw(cur);
      }, ms + 50);
    };

    draw(cur);

    return {
      setup(view: SetupView, ms: number) {
        setup = view;
        steps = [];
        end = null;
        const carried = view.lanes.find((l) => l.id === view.carried);
        if (!carried) throw new Error(`gated-cells stage: 들고 가는 길 ${view.carried} 가 없다`);
        caption = t('caption.ready', '{cell} · a chain of {n} times · state starts at {state}', {
          cell: view.cell,
          n: view.xs.length,
          state: fmt(carried.value, 2),
        });
        const laneY: Record<string, number> =
          view.lanes.length === 2 ? { c: Y_LANE_C, h: Y_LANE_H } : { h: Y_ONE_LANE };
        for (const l of view.lanes) {
          if (laneY[l.id] === undefined) throw new Error(`gated-cells stage: 모르는 길 ${l.id}`);
        }
        // 앞 판의 띠는 걸음 0 에 걷는다 — 자리(길 · 사슬 끝)만 옮겨 간다
        cur = { ...cur, bandFront: 0, endReach: 0 };
        animate({ laneY, chainEnd: view.xs.length, bandFront: 0, endReach: 0, newestFill: 1 }, ms);
      },
      step(view: StepView, ms: number) {
        if (!setup) throw new Error('gated-cells stage: setup 전에 걸음이 왔다');
        if (view.step !== steps.length + 1) throw new Error(`gated-cells stage: 걸음 ${view.step} 가 차례에 맞지 않는다`);
        steps = [...steps, view];
        const sym = setup.carried;
        const state = fmt(laneValue(view.lanes, sym), 2);
        if (view.step === 1) {
          caption =
            view.gates.length > 0
              ? t('caption.writeGated', 'Time 1 · write input x {x} · gates {gates} · new state {sym} {state}', {
                  x: fmt(view.x, 1),
                  gates: view.gates.map((g) => `${g.id} ${fmt(g.value, 2)}`).join(' · '),
                  sym,
                  state,
                })
              : t('caption.writePlain', 'Time 1 · write input x {x} · no gates · new state {sym} {state}', {
                  x: fmt(view.x, 1),
                  sym,
                  state,
                });
        } else {
          if (view.factor === null) throw new Error('gated-cells stage: 곱한 몫이 없다');
          caption = t('caption.distract', 'Time {step} · distractor x {x} · multiplied share {factor} · kept share {kept}', {
            step: view.step,
            x: fmt(view.x, 1),
            factor: fmt(view.factor, 2),
            kept: fmt(view.kept, 2),
          });
        }
        cur = { ...cur, newestFill: 0 };
        animate({ ...target, bandFront: view.step, endReach: 0, newestFill: 1 }, ms);
      },
      finish(view: EndView, ms: number) {
        if (!setup) throw new Error('gated-cells stage: setup 전에 끝이 왔다');
        end = view;
        caption = t('caption.end', 'End · {count} multiplied shares, from {lo} to {hi} · kept share {kept}', {
          count: view.count,
          lo: fmt(view.lo, 2),
          hi: fmt(view.hi, 2),
          kept: fmt(view.kept, 2),
        });
        animate({ ...target, endReach: 1 }, ms);
      },
      destroy() {
        stop();
        root.remove();
      },
    };
  },
};
