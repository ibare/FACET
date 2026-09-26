/**
 * weighted-sum-threshold 무대.
 *
 * 왼쪽에 입력 줄들, 가운데에 세로 합 눈금, 오른쪽에 두 칸짜리 출력.
 * 싣는 걸음마다 곱한 값이 막대가 되어 줄에서 눈금으로 날아와 지금 합 끝에 붙는다 —
 * 양이면 위로, 음이면 아래로. 합 표시가 그 끝으로 옮겨 간다.
 * 견줌 걸음에서 문턱에서 합까지의 폭이 뻗고, 출력 덩이가 0 칸에서 1 칸으로 한 번에 건너뛴다.
 * 출력 칸의 경계는 문턱 높이에 둔다 — 문턱 위는 1, 아래는 0.
 */
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
import { formatValue } from './algorithm.js';
import type { WeightedSumThresholdScene } from './scene.js';

const H = 320;
const SVG_NS = 'http://www.w3.org/2000/svg';

const LOAD_MS = 560;
const LOAD_FLY_SHARE = 0.6;
const COMPARE_GROW_MS = 320;
const COMPARE_JUMP_AT_MS = 440;
const FRAME_MS = 16;

type Handles = {
  bars: Map<number, SVGGElement>;
  sumGroup: SVGGElement | null;
  sumLabel: SVGTextElement | null;
  bracket: SVGGElement | null;
  knob: { group: SVGGElement; rect: SVGRectElement; digit: SVGTextElement } | null;
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
  return out === 0 ? 0 : out;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const weightedSumThresholdStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const [riseColor, fallColor] = categorical(2, 'vivid');
    if (riseColor === undefined || fallColor === undefined) {
      throw new Error('weighted-sum-threshold-stage: categorical(2) 가 둘을 주지 않았다');
    }

    const W = PIECE_CANVAS_W;
    const mdPx = parseFloat(fontSizes.md);
    const charW = mdPx * 0.6;

    // 가로 자리 — 캔버스 폭에서 역산한다
    const padX = Math.round(W * 0.026);
    const rowX = padX;
    const axisX = Math.round(W * 0.565);
    const laneGap = Math.min(26, Math.round(W * 0.042));
    const barW = Math.round(laneGap * 0.55);
    const switchCellW = Math.min(44, Math.round(W * 0.07));
    const switchX = W - padX - switchCellW;
    const switchCellH = 30;

    // 세로 자리
    const plotTop = 34;
    const plotBottom = H - 64;
    const captionY = H - 20;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles: Handles = { bars: new Map(), sumGroup: null, sumLabel: null, bracket: null, knob: null };

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    /** 한 시계 — duration 동안 frame(경과 ms) 를 부르고, 끝나거나 거두어지면 푼다. */
    async function clock(mine: number, duration: number, frame: (ms: number) => void): Promise<boolean> {
      let elapsed = 0;
      while (elapsed < duration) {
        if (mine !== gen || destroyed) return false;
        frame(elapsed);
        await wait(FRAME_MS);
        elapsed += FRAME_MS;
      }
      if (mine !== gen || destroyed) return false;
      frame(duration);
      return true;
    }

    function yOf(scene: WeightedSumThresholdScene, v: number): number {
      const axis = scene.axis;
      if (axis === null) throw new Error('weighted-sum-threshold-stage: 눈금이 서기 전에 자리를 물었다');
      return r1(plotBottom - ((v - axis.lo) / (axis.hi - axis.lo)) * (plotBottom - plotTop));
    }

    function rowY(scene: WeightedSumThresholdScene, i: number): number {
      const n = scene.inputs.length;
      const gap = Math.min(64, (plotBottom - plotTop) / n);
      const mid = (plotTop + plotBottom) / 2;
      return r1(mid + (i - (n - 1) / 2) * gap);
    }

    function laneX(i: number): number {
      return axisX + 16 + i * laneGap;
    }

    const guideEnd = (n: number): number => laneX(n - 1) + barW + 12;

    /** 곱한 값 글자가 서는 자리 — 막대가 여기서 떠난다 */
    const productX = rowX + 24 * charW;

    function drawStatic(scene: WeightedSumThresholdScene): void {
      svg.textContent = '';
      handles = { bars: new Map(), sumGroup: null, sumLabel: null, bracket: null, knob: null };
      const n = scene.inputs.length;
      const step = scene.step;

      // 입력 줄
      scene.inputs.forEach((input, i) => {
        const y = rowY(scene, i);
        if (step.kind === 'load' && step.index === i) {
          el('rect', {
            x: rowX - 6,
            y: y - mdPx,
            width: r1(productX + 9 * charW - rowX + 6),
            height: mdPx * 2,
            rx: 4,
            fill: colors.bgSubtle,
            stroke: colors.border,
          }, svg);
        }
        const common = { 'font-family': fonts.mono, 'font-size': fontSizes.md, 'dominant-baseline': 'middle' };
        const xs = el('text', { ...common, x: rowX, y, fill: colors.text }, svg);
        xs.textContent = t('label.input', '{id} = {v}', { id: input.id, v: formatValue(input.value) });
        const times = el('text', { ...common, x: r1(rowX + 10 * charW), y, fill: colors.textMuted }, svg);
        times.textContent = '×';
        const ws = el('text', { ...common, x: r1(rowX + 12 * charW), y, fill: colors.text }, svg);
        ws.textContent = t('label.weight', '{id} = {v}', { id: input.weightId, v: formatValue(input.weight) });
        const load = scene.loads.find((l) => l.index === i);
        if (load !== undefined) {
          const ps = el('text', {
            ...common,
            x: r1(productX),
            y,
            fill: load.product >= 0 ? riseColor : fallColor,
            'font-weight': 600,
          }, svg);
          ps.textContent = t('label.product', '= {v}', { v: formatValue(load.product) });
        }
      });

      const axis = scene.axis;
      if (axis !== null) {
        // 눈금
        el('line', { x1: axisX, y1: plotTop, x2: axisX, y2: plotBottom, stroke: colors.border, 'stroke-width': 1.5 }, svg);
        for (const tick of axis.ticks) {
          const y = yOf(scene, tick.v);
          el('line', {
            x1: axisX - (tick.major ? 6 : 3), y1: y, x2: axisX, y2: y,
            stroke: colors.border,
          }, svg);
          if (tick.major) {
            const label = el('text', {
              x: axisX - 9, y, 'text-anchor': 'end', 'dominant-baseline': 'middle',
              'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: colors.textMuted,
            }, svg);
            label.textContent = formatValue(tick.v, 1);
          }
        }

        // 문턱 — 출력 칸의 경계까지 이어진다
        const yTheta = yOf(scene, scene.theta);
        el('line', {
          x1: axisX, y1: yTheta, x2: switchX + switchCellW, y2: yTheta,
          stroke: colors.text, 'stroke-width': 1.2, 'stroke-dasharray': '5 4',
        }, svg);
        const thetaLabel = el('text', {
          x: guideEnd(n) + 6, y: yTheta + 12, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.text,
        }, svg);
        thetaLabel.textContent = t('label.theta', 'θ = {v}', { v: formatValue(scene.theta) });

        // 실린 막대와 계단 이음
        scene.loads.forEach((load, k) => {
          const yFrom = yOf(scene, load.from);
          const yTo = yOf(scene, load.to);
          const color = load.product >= 0 ? riseColor : fallColor;
          const g = el('g', { transform: `translate(${laneX(load.index)},${yFrom})` }, svg);
          const dy = r1(yTo - yFrom);
          // 화살 끝이 곧 새 합이다 — 몸통은 머리 밑동까지
          const dir = dy < 0 ? -1 : 1;
          const head = r1(Math.min(8, Math.abs(dy) * 0.4));
          const base = r1(dy - dir * head);
          el('rect', { x: 0, y: Math.min(0, base), width: barW, height: Math.abs(base), fill: color, opacity: 0.85 }, g);
          el('path', {
            d: `M${-3},${base} L${barW + 3},${base} L${r1(barW / 2)},${dy} Z`,
            fill: color,
          }, g);
          handles.bars.set(load.index, g);
          const next = scene.loads[k + 1];
          if (next !== undefined) {
            el('line', {
              x1: laneX(load.index), y1: yTo, x2: laneX(next.index) + barW, y2: yTo,
              stroke: colors.textMuted, 'stroke-dasharray': '2 3',
            }, svg);
          }
        });

        // 합 표시
        if (scene.sum !== null) {
          const ySum = yOf(scene, scene.sum);
          const sg = el('g', { transform: `translate(0,${ySum})` }, svg);
          el('line', { x1: axisX, y1: 0, x2: guideEnd(n), y2: 0, stroke: colors.primary, 'stroke-width': 2 }, sg);
          const sl = el('text', {
            x: guideEnd(n) + 6, y: 0, 'dominant-baseline': 'middle',
            'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.primary, 'font-weight': 600,
          }, sg);
          sl.textContent = t('label.sum', 's = {v}', { v: formatValue(scene.sum) });
          handles.sumGroup = sg;
          handles.sumLabel = sl;
        }

        // 넘은 폭
        const verdict = scene.verdict;
        if (verdict !== null) {
          const ySum = yOf(scene, verdict.sum);
          const bx = switchX - 18;
          const bg = el('g', {}, svg);
          el('line', { x1: bx, y1: yTheta, x2: bx, y2: ySum, stroke: colors.primary, 'stroke-width': 2 }, bg);
          el('line', { x1: bx - 4, y1: ySum, x2: bx + 4, y2: ySum, stroke: colors.primary, 'stroke-width': 2 }, bg);
          const ml = el('text', {
            x: bx - 6, y: r1((ySum + yTheta) / 2), 'text-anchor': 'end', 'dominant-baseline': 'middle',
            'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: colors.primary,
          }, bg);
          ml.textContent = t('label.margin', '{sign}{v}', {
            sign: verdict.margin > 0 ? '+' : '',
            v: formatValue(verdict.margin),
          });
          handles.bracket = bg;
        }

        // 출력 두 칸 — 경계가 문턱 높이
        const outLabel = el('text', {
          x: switchX + switchCellW / 2, y: yTheta - switchCellH - 14, 'text-anchor': 'middle',
          'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted,
        }, svg);
        outLabel.textContent = t('label.output', 'output');
        const cellY = (v: number): number => (v === 1 ? yTheta - switchCellH - 3 : yTheta + 3);
        for (const v of [1, 0]) {
          el('rect', {
            x: switchX, y: cellY(v), width: switchCellW, height: switchCellH, rx: 4,
            fill: 'none', stroke: colors.border, 'stroke-width': 1.2,
          }, svg);
          const d = el('text', {
            x: switchX + switchCellW / 2, y: cellY(v) + switchCellH / 2, 'text-anchor': 'middle',
            'dominant-baseline': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md, fill: colors.textMuted,
          }, svg);
          d.textContent = String(v);
        }
        if (scene.output !== null) {
          const out = scene.output;
          if (out !== 0 && out !== 1) throw new Error(`weighted-sum-threshold-stage: 출력 ${out} 은 칸이 없다`);
          const kg = el('g', {}, svg);
          const kr = el('rect', {
            x: switchX, y: cellY(out), width: switchCellW, height: switchCellH, rx: 4,
            fill: out === 1 ? colors.accent : colors.bgSubtle, stroke: colors.text, 'stroke-width': 2,
          }, kg);
          const kt = el('text', {
            x: switchX + switchCellW / 2, y: cellY(out) + switchCellH / 2, 'text-anchor': 'middle',
            'dominant-baseline': 'middle', 'font-family': fonts.mono, 'font-size': fontSizes.md,
            'font-weight': 700, fill: out === 1 ? colors.stateInk : colors.text,
          }, kg);
          kt.textContent = String(out);
          handles.knob = { group: kg, rect: kr, digit: kt };
        }
      }

      // 캡션 — 지금 일어난 일
      const cap = el('text', {
        x: padX, y: captionY, 'dominant-baseline': 'middle',
        'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text,
      }, svg);
      if (step.kind === 'start') {
        if (scene.sum !== null && scene.output !== null) {
          cap.textContent = t('caption.start', 'Nothing loaded yet. s = {s} · output = {out}', {
            s: formatValue(scene.sum),
            out: scene.output,
          });
        }
      } else if (step.kind === 'load') {
        const load = scene.loads.find((l) => l.index === step.index);
        const input = scene.inputs[step.index];
        if (load === undefined || input === undefined) {
          throw new Error(`weighted-sum-threshold-stage: 걸음의 입력 ${step.index} 이 장면에 없다`);
        }
        const vars = {
          x: input.id,
          xv: formatValue(input.value),
          wv: formatValue(input.weight),
          p: formatValue(load.product),
          from: formatValue(load.from),
          to: formatValue(load.to),
        };
        cap.textContent = load.product >= 0
          ? t('caption.rise', 'Load {x}: {xv} × {wv} = {p}. s rises: {from} → {to}', vars)
          : t('caption.fall', 'Load {x}: {xv} × {wv} = {p}. s falls: {from} → {to}', vars);
      } else {
        const v = scene.verdict;
        if (v === null) throw new Error('weighted-sum-threshold-stage: 견줌 걸음에 판정이 없다');
        const vars = {
          s: formatValue(v.sum),
          theta: formatValue(v.theta),
          from: v.from,
          to: v.to,
        };
        cap.textContent = v.above
          ? t('caption.above', 'Compared once: s = {s} > θ = {theta}. Output: {from} → {to}', vars)
          : t('caption.below', 'Compared once: s = {s} ≤ θ = {theta}. Output: {from} → {to}', vars);
      }
    }

    async function animateLoad(mine: number, scene: WeightedSumThresholdScene, index: number): Promise<void> {
      const load = scene.loads.find((l) => l.index === index);
      const bar = handles.bars.get(index);
      const sumGroup = handles.sumGroup;
      const sumLabel = handles.sumLabel;
      if (load === undefined || bar === undefined || sumGroup === null || sumLabel === null) {
        throw new Error(`weighted-sum-threshold-stage: 싣기 ${index} 의 손잡이가 없다`);
      }
      const yFrom = yOf(scene, load.from);
      const yTo = yOf(scene, load.to);
      const startX = productX + 2 * charW;
      const startY = rowY(scene, index);
      const endX = laneX(index);
      const fly = LOAD_MS * LOAD_FLY_SHARE;
      const fromText = t('label.sum', 's = {v}', { v: formatValue(load.from) });
      const toText = t('label.sum', 's = {v}', { v: formatValue(load.to) });
      await clock(mine, LOAD_MS, (ms) => {
        const pf = ease(Math.min(1, ms / fly));
        const left = 1 - pf;
        const x = r1(endX + (startX - endX) * left);
        const y = r1(yFrom + (startY - yFrom) * left);
        const s = Math.round((0.2 + 0.8 * pf) * 1000) / 1000;
        bar.setAttribute('transform', `translate(${x},${y}) scale(1,${s})`);
        const ps = ms <= fly ? 0 : ease((ms - fly) / (LOAD_MS - fly));
        sumGroup.setAttribute('transform', `translate(0,${r1(yFrom + (yTo - yFrom) * ps)})`);
        sumLabel.textContent = ps < 1 ? fromText : toText;
      });
    }

    async function animateCompare(mine: number, scene: WeightedSumThresholdScene): Promise<void> {
      const bracket = handles.bracket;
      const knob = handles.knob;
      const v = scene.verdict;
      if (bracket === null || knob === null || v === null) {
        throw new Error('weighted-sum-threshold-stage: 견줌의 손잡이가 없다');
      }
      const yTheta = yOf(scene, scene.theta);
      // 출력 칸 사이 거리 — 1 칸은 0 칸보다 칸 높이와 틈만큼 위에 있다
      const hop = (switchCellH + 6) * (v.to - v.from);
      await clock(mine, COMPARE_JUMP_AT_MS + 60, (ms) => {
        const p = ease(Math.min(1, ms / COMPARE_GROW_MS));
        const s = Math.round(Math.max(0.001, p) * 1000) / 1000;
        bracket.setAttribute('transform', `translate(0,${r1(yTheta * (1 - s))}) scale(1,${s})`);
        // 건너뜀에는 중간이 없다 — 정한 때까지 옛 칸에 옛 모습으로 있다가 한 번에 옮긴다
        const before = ms < COMPARE_JUMP_AT_MS;
        const shown = before ? v.from : v.to;
        if (before) knob.group.setAttribute('transform', `translate(0,${hop})`);
        else knob.group.removeAttribute('transform');
        knob.rect.setAttribute('fill', shown === 1 ? colors.accent : colors.bgSubtle);
        knob.digit.setAttribute('fill', shown === 1 ? colors.stateInk : colors.text);
        knob.digit.textContent = String(shown);
      });
    }

    return {
      async render(
        next: WeightedSumThresholdScene,
        prev: WeightedSumThresholdScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        drawStatic(next);
        if (!opts.animate || prev === null) return;
        const step = next.step;
        if (step.kind === 'load' && prev.loads.length === next.loads.length - 1) {
          await animateLoad(mine, next, step.index);
        } else if (step.kind === 'compare' && prev.verdict === null) {
          await animateCompare(mine, next);
        } else {
          return;
        }
        if (mine === gen && !destroyed) drawStatic(next);
      },
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
