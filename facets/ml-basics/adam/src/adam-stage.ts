/**
 * adam 무대 — 두 축 막대 (a · b) 가 바닥까지 간 몫으로 찬다.
 *
 * 막대 하나 = 한 축이 처음 1 에서 바닥 0 까지 가야 할 길. 채움 = 간 몫.
 * 막대 왼쪽의 가파름 표지는 그 축의 기울기 계수(10 · 10/r)를 비탈의 기울기로 그린다 — r 을 돌리면
 * b 쪽 비탈이 납작해지며 옮겨 간다. 갱신마다 막대 위에 지난 자리 눈금이 남는다 (이 판의 것만).
 *
 * 무대는 셈하지 않는다 — 간 몫(전 정밀도 · 정수 %)과 계수 글자는 payload 로 받는다.
 * 비탈 각도 atan(계수) 는 받은 계수를 그림으로 옮기는 자리 셈이다.
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

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 320;

const ROW_Y = [118, 218] as const; // 두 막대의 세로 가운데
const BAR_X0 = 190;
const BAR_X1 = 560;
const BAR_H = 26;
const WEDGE_X = 34;
const WEDGE_LEN = 64;
const WEDGE_DROP = 26; // 비탈 밑변이 막대 가운데보다 내려간 만큼
const VALUE_X = 584;

export type AdamRoundView = {
  rule: 'gd' | 'adam';
  ratio: number;
  eta: number;
  coefA: number;
  coefB: number;
  coefBText: string;
  steps: number;
  a: number;
  b: number;
};

export type AdamUpdateView = {
  t: number;
  steps: number;
  a: number;
  b: number;
  aShare: number;
  bShare: number;
  aFrac: number;
  bFrac: number;
  last: boolean;
};

export type AdamStage = {
  reset(): void;
  showRound(p: AdamRoundView, ms: number): void;
  showUpdate(p: AdamUpdateView, ms: number): void;
  destroy(): void;
};

type Row = {
  track: SVGRectElement;
  fill: SVGRectElement;
  knob: SVGCircleElement;
  ticks: SVGGElement;
  slope: SVGLineElement;
  gradText: SVGTextElement;
  shareText: SVGTextElement;
  valueText: SVGTextElement;
};

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  parent.appendChild(node);
  return node;
}

function slopeAngle(coef: number): number {
  if (!(coef > 0)) throw new Error(`adam-stage: 기울기 계수가 양수가 아니다 (${coef})`);
  return Math.atan(coef);
}

export const adamStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const axisColor = categorical(2, 'vivid');
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    const root = el(svg, 'g', { 'data-role': 'adam-stage' });
    const frames = new Set<number>();

    // 머리 두 줄 — 규칙과 손실
    const ruleText = el(root, 'text', {
      x: 20,
      y: 30,
      'font-family': fonts.body,
      'font-size': fontSizes.lg,
      'font-weight': 600,
      fill: c.text,
    });
    const lossText = el(root, 'text', {
      x: W - 20,
      y: 30,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.textMuted,
    });
    el(root, 'text', {
      x: WEDGE_X,
      y: 64,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    }).textContent = t('stage.steepness', 'Steepness');
    el(root, 'text', {
      x: BAR_X0,
      y: 64,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    }).textContent = t('stage.start', 'Start 1');
    el(root, 'text', {
      x: BAR_X1,
      y: 64,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    }).textContent = t('stage.floor', 'Floor 0');

    const rows: Row[] = ROW_Y.map((cy, i) => {
      const color = axisColor[i];
      if (color === undefined) throw new Error('adam-stage: 축 색이 모자라다');
      const baseY = cy + WEDGE_DROP;
      el(root, 'line', {
        x1: WEDGE_X,
        y1: baseY,
        x2: WEDGE_X + WEDGE_LEN + 8,
        y2: baseY,
        stroke: c.border,
        'stroke-width': 1.5,
      });
      const slope = el(root, 'line', {
        x1: WEDGE_X,
        y1: baseY,
        x2: WEDGE_X + WEDGE_LEN,
        y2: baseY,
        stroke: color,
        'stroke-width': 4,
        'stroke-linecap': 'round',
        visibility: 'hidden',
      });
      const gradText = el(root, 'text', {
        x: WEDGE_X,
        y: baseY + smPx + 6,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      el(root, 'text', {
        x: BAR_X0 - 14,
        y: cy + 7,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.xl,
        'font-weight': 700,
        fill: color,
      }).textContent = i === 0 ? 'a' : 'b';
      const track = el(root, 'rect', {
        x: BAR_X0,
        y: cy - BAR_H / 2,
        width: BAR_X1 - BAR_X0,
        height: BAR_H,
        rx: 4,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });
      const fill = el(root, 'rect', {
        x: BAR_X0,
        y: cy - BAR_H / 2,
        width: 0,
        height: BAR_H,
        rx: 4,
        fill: color,
        'fill-opacity': 0.55,
      });
      const ticks = el(root, 'g', { 'data-role': 'ticks' });
      const knob = el(root, 'circle', {
        cx: BAR_X0,
        cy,
        r: 8,
        fill: c.bg,
        stroke: color,
        'stroke-width': 3,
        visibility: 'hidden',
      });
      const shareText = el(root, 'text', {
        x: VALUE_X,
        y: cy + 2,
        'font-family': fonts.body,
        'font-size': fontSizes.xl,
        'font-weight': 700,
        fill: c.text,
      });
      const valueText = el(root, 'text', {
        x: VALUE_X,
        y: cy + 2 + smPx + 8,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      return { track, fill, knob, ticks, slope, gradText, shareText, valueText };
    });

    const caption = el(root, 'text', {
      x: 20,
      y: H - 22,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });

    // 운동의 기억 — 지금 그려진 채움(0‥1)과 비탈 각
    const drawnFrac = [0, 0];
    const drawnAngle: (number | null)[] = [null, null];
    const tickCount = [0, 0];

    const barX = (frac: number) => BAR_X0 + (BAR_X1 - BAR_X0) * Math.max(0, Math.min(1, frac));

    const paintFrac = (i: number, frac: number) => {
      const row = rows[i];
      if (!row) throw new Error('adam-stage: 줄이 없다');
      const x = barX(frac);
      row.fill.setAttribute('width', String(x - BAR_X0));
      row.knob.setAttribute('cx', String(x));
      drawnFrac[i] = frac;
    };

    const paintAngle = (i: number, angle: number) => {
      const row = rows[i];
      const cy = ROW_Y[i];
      if (!row || cy === undefined) throw new Error('adam-stage: 줄이 없다');
      const baseY = cy + WEDGE_DROP;
      row.slope.setAttribute('x2', String(WEDGE_X + WEDGE_LEN * Math.cos(angle)));
      row.slope.setAttribute('y2', String(baseY - WEDGE_LEN * Math.sin(angle)));
      row.slope.setAttribute('visibility', 'visible');
      drawnAngle[i] = angle;
    };

    const stopFrames = () => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
    };

    /** 두 축의 채움과 비탈을 목표로 옮긴다 — ms 안에 끝난다 */
    const moveTo = (targetFrac: [number, number], targetAngle: [number, number], ms: number) => {
      stopFrames();
      const fromFrac = [drawnFrac[0] ?? 0, drawnFrac[1] ?? 0];
      const fromAngle = [drawnAngle[0] ?? targetAngle[0], drawnAngle[1] ?? targetAngle[1]];
      const finish = () => {
        paintFrac(0, targetFrac[0]);
        paintFrac(1, targetFrac[1]);
        paintAngle(0, targetAngle[0]);
        paintAngle(1, targetAngle[1]);
      };
      if (ms <= 0 || isInstant() || typeof requestAnimationFrame !== 'function') {
        finish();
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        if (isInstant()) {
          finish();
          frames.clear();
          return;
        }
        const k = Math.min(1, (now - start) / ms);
        const e = 1 - (1 - k) * (1 - k) * (1 - k);
        for (let i = 0; i < 2; i++) {
          const f0 = fromFrac[i] ?? 0;
          const f1 = targetFrac[i] ?? 0;
          const a0 = fromAngle[i] ?? 0;
          const a1 = targetAngle[i] ?? 0;
          paintFrac(i, f0 + (f1 - f0) * e);
          paintAngle(i, a0 + (a1 - a0) * e);
        }
        if (k < 1) {
          const id = requestAnimationFrame(tick);
          frames.add(id);
        } else {
          finish();
        }
      };
      const id = requestAnimationFrame(tick);
      frames.add(id);
    };

    const clearTicks = () => {
      for (const row of rows) {
        while (row.ticks.firstChild) row.ticks.removeChild(row.ticks.firstChild);
      }
      tickCount[0] = 0;
      tickCount[1] = 0;
    };

    const addTick = (i: number, frac: number) => {
      const row = rows[i];
      const cy = ROW_Y[i];
      if (!row || cy === undefined) throw new Error('adam-stage: 줄이 없다');
      const x = barX(frac);
      el(row.ticks, 'line', {
        x1: x,
        y1: cy - BAR_H / 2 - 5,
        x2: x,
        y2: cy - BAR_H / 2 + 5,
        stroke: c.text,
        'stroke-width': 1.5,
      });
      tickCount[i] = (tickCount[i] ?? 0) + 1;
    };

    let currentAngles: [number, number] | null = null;

    const reset = () => {
      stopFrames();
      clearTicks();
      paintFrac(0, 0);
      paintFrac(1, 0);
      drawnAngle[0] = null;
      drawnAngle[1] = null;
      currentAngles = null;
      for (const row of rows) {
        row.slope.setAttribute('visibility', 'hidden');
        row.knob.setAttribute('visibility', 'hidden');
        row.gradText.textContent = '';
        row.shareText.textContent = '';
        row.valueText.textContent = '';
      }
      ruleText.textContent = '';
      lossText.textContent = '';
      caption.textContent = '';
    };

    const showRound = (p: AdamRoundView, ms: number) => {
      // 앞 판의 결론(눈금 · 글자)을 걷고 막대를 처음으로 되돌린다 — 비탈은 새 r 로 옮겨 간다
      clearTicks();
      const ruleName = p.rule === 'adam' ? t('label.rule.adam', 'Adam') : t('label.rule.gd', 'Gradient descent');
      ruleText.textContent = t('stage.rule', 'Update rule: {rule} · η {eta}', {
        rule: ruleName,
        eta: p.eta.toFixed(2),
      });
      lossText.textContent = t('stage.loss', 'L = 5a² + (5/r)·b² · r = {r}', { r: p.ratio });
      const rowA = rows[0];
      const rowB = rows[1];
      if (!rowA || !rowB) throw new Error('adam-stage: 줄이 없다');
      rowA.gradText.textContent = t('stage.gradA', 'g = 10·a');
      rowB.gradText.textContent = t('stage.gradB', 'g = {c}·b', { c: p.coefBText });
      rowA.valueText.textContent = t('stage.valueA', 'a = {v}', { v: p.a.toFixed(2) });
      rowB.valueText.textContent = t('stage.valueB', 'b = {v}', { v: p.b.toFixed(2) });
      rowA.shareText.textContent = t('stage.share', '{p}%', { p: 0 });
      rowB.shareText.textContent = t('stage.share', '{p}%', { p: 0 });
      for (const row of rows) row.knob.setAttribute('visibility', 'visible');
      caption.textContent = t('caption.start', 'Start (a, b) = ({a}, {b}) · both axes still have the whole way to the floor', {
        a: p.a.toFixed(2),
        b: p.b.toFixed(2),
      });
      currentAngles = [slopeAngle(p.coefA), slopeAngle(p.coefB)];
      moveTo([0, 0], currentAngles, ms);
    };

    const showUpdate = (p: AdamUpdateView, ms: number) => {
      if (!currentAngles) throw new Error('adam-stage: 판 머리 없이 갱신이 왔다');
      const rowA = rows[0];
      const rowB = rows[1];
      if (!rowA || !rowB) throw new Error('adam-stage: 줄이 없다');
      addTick(0, p.aFrac);
      addTick(1, p.bFrac);
      rowA.valueText.textContent = t('stage.valueA', 'a = {v}', { v: p.a.toFixed(2) });
      rowB.valueText.textContent = t('stage.valueB', 'b = {v}', { v: p.b.toFixed(2) });
      rowA.shareText.textContent = t('stage.share', '{p}%', { p: p.aShare });
      rowB.shareText.textContent = t('stage.share', '{p}%', { p: p.bShare });
      caption.textContent = p.last
        ? t('caption.end', 'After {n} updates · covered a {sa}% · b {sb}%', {
            n: p.steps,
            sa: p.aShare,
            sb: p.bShare,
          })
        : t('caption.update', 'Update {t} / {n} · covered a {sa}% · b {sb}%', {
            t: p.t,
            n: p.steps,
            sa: p.aShare,
            sb: p.bShare,
          });
      moveTo([p.aFrac, p.bFrac], currentAngles, ms);
    };

    params.onScrubStart?.(() => stopFrames());

    const instance: AdamStage = {
      reset,
      showRound,
      showUpdate,
      destroy() {
        stopFrames();
        root.remove();
      },
    };
    return instance as unknown as ViewInstance;
  },
};
