/**
 * bayes-stage — 한 줄 몫 막대(왼쪽 병 · 오른쪽 병 아님, 전체 폭 = 1) 와 승산 글자, 그리고 이 판의 병일 몫 자취.
 *
 * 운동: 막대의 두 조각이 폭을 바꾼다 — 판 머리에서는 앞 판의 끝 몫에서 새 기저율로 나뉨 자리가 미끄러지고,
 * 곱하는 박자에는 두 조각이 줄어(오른쪽에 빈틈) 나누는 박자에 전체 폭으로 다시 늘어난다.
 * 길이는 projector 가 재생 속도에서 셈해 넘긴다. 몫 · 승산 · ‰ 는 모두 payload 값이다 — 여기서 다시 셈하지 않는다.
 *
 * 타이머: rAF 하나만 쓴다. reset · 되짚기 시작 · destroy 에서 끊는다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 620;
const H = 360;

// 몫 막대
const BAR_X = 60;
const BAR_W = 500;
const BAR_Y = 132;
const BAR_H = 40;

// 자취 도표
const TRAIL_X0 = 110;
const TRAIL_X1 = 540;
const TRAIL_TOP = 228;
const TRAIL_BOTTOM = 304;

/** 몫 ‰ 정수 → `8.3%` (실수 · toFixed 를 거치지 않는다). */
export function permilleText(x: number): string {
  if (!Number.isInteger(x) || x < 0 || x > 1000) throw new Error(`bayes-stage: ‰ 값 ${x} 가 0..1000 정수가 아니다`);
  return `${Math.floor(x / 10)}.${x % 10}%`;
}

function checkShare(x: number, what: string): void {
  if (!Number.isFinite(x) || x < 0 || x > 1) throw new Error(`bayes-stage: ${what} 몫 ${x} 가 0..1 이 아니다`);
}

function checkMax(maxPositives: number): void {
  if (!Number.isInteger(maxPositives) || maxPositives < 1) throw new Error('bayes-stage: maxPositives 가 1 이상 정수가 아니다');
}

export type BayesStartArgs = {
  population: number;
  sick: number;
  healthy: number;
  num: number;
  den: number;
  ppvPermille: number;
  healthyPermille: number;
  sickShare: number;
  healthyShare: number;
  maxPositives: number;
  durationMs: number;
};

export type BayesMultiplyArgs = {
  i: number;
  numBefore: number;
  num: number;
  den: number;
  ratio: number;
  sensitivityPct: number;
  falsePositivePct: number;
  sickShare: number;
  healthyShare: number;
  durationMs: number;
};

export type BayesNormalizeArgs = {
  i: number;
  num: number;
  den: number;
  ppvPermille: number;
  healthyPermille: number;
  sickShare: number;
  healthyShare: number;
  durationMs: number;
};

export type BayesCrossArgs = {
  trail: number[];
  firstOver: number;
  maxPositives: number;
};

/** projector 가 부르는 표면. */
export type BayesStage = ViewInstance & {
  reset(): void;
  showStart(a: BayesStartArgs): Promise<void>;
  showMultiply(a: BayesMultiplyArgs): Promise<void>;
  showNormalize(a: BayesNormalizeArgs): Promise<void>;
  showCross(a: BayesCrossArgs): void;
};

export const bayesStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const [sickColor, healthyColor] = categorical(2, 'vivid');
    if (sickColor === undefined || healthyColor === undefined) throw new Error('bayes-stage: categorical 색이 모자라다');
    const isInstant = params.isInstant ?? (() => false);

    svg.textContent = '';

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (x: number, y: number, size: string, fill: string, anchor: string, weight = 400): SVGTextElement =>
      el('text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': size,
        fill,
        'text-anchor': anchor,
        'font-weight': weight,
      });

    // ── 머리: 걸음 캡션 · 승산
    const caption = text(W / 2, 24, fontSizes.md, c.text, 'middle', 600);
    const oddsLabel = text(W / 2, 50, fontSizes.sm, c.textMuted, 'middle');
    oddsLabel.textContent = t('label.odds', 'Odds (sick : not sick)');
    const odds = text(W / 2, 80, fontSizes.xl, c.text, 'middle', 700);
    odds.setAttribute('font-family', fonts.mono);
    const oddsNote = text(W / 2, 100, fontSizes.sm, c.textMuted, 'middle');

    // ── 몫 막대: 전체 1 의 틀 · 병 · 병 아님 · 50% 선
    el('rect', {
      x: BAR_X,
      y: BAR_Y,
      width: BAR_W,
      height: BAR_H,
      fill: 'none',
      stroke: c.border,
      'stroke-dasharray': '4 3',
    });
    const sickRect = el('rect', { x: BAR_X, y: BAR_Y, width: 0, height: BAR_H, fill: sickColor });
    const healthyRect = el('rect', { x: BAR_X, y: BAR_Y, width: 0, height: BAR_H, fill: healthyColor });
    const halfX = BAR_X + BAR_W / 2;
    el('line', {
      x1: halfX,
      y1: BAR_Y - 6,
      x2: halfX,
      y2: BAR_Y + BAR_H + 6,
      stroke: c.text,
      'stroke-dasharray': '3 3',
    });
    const halfLabel = text(halfX, BAR_Y - 10, fontSizes.xs, c.textMuted, 'middle');
    halfLabel.textContent = t('label.half', '50%');
    // 병 쪽 표지 — 막대 위, 조각 가운데의 짧은 선
    const sickTick = el('line', { x1: BAR_X, y1: BAR_Y - 6, x2: BAR_X, y2: BAR_Y, stroke: c.text });
    const sickLabel = text(BAR_X, BAR_Y - 9, fontSizes.sm, c.text, 'start', 600);
    // 병 아님 표지 — 아래, 조각 오른쪽 끝을 따라간다
    const healthyLabel = text(BAR_X + BAR_W, BAR_Y + BAR_H + 18, fontSizes.sm, c.text, 'end', 600);

    // ── 자취 도표
    const trailTitle = text(BAR_X, TRAIL_TOP - 12, fontSizes.sm, c.textMuted, 'start');
    trailTitle.textContent = t('label.trail', 'Sick share after each positive');
    const yOf = (permille: number): number => TRAIL_BOTTOM - (permille / 1000) * (TRAIL_BOTTOM - TRAIL_TOP);
    el('line', { x1: TRAIL_X0, y1: TRAIL_BOTTOM, x2: TRAIL_X1, y2: TRAIL_BOTTOM, stroke: c.border });
    el('line', { x1: TRAIL_X0, y1: TRAIL_TOP, x2: TRAIL_X1, y2: TRAIL_TOP, stroke: c.border, 'stroke-dasharray': '1 3' });
    el('line', {
      x1: TRAIL_X0,
      y1: yOf(500),
      x2: TRAIL_X1,
      y2: yOf(500),
      stroke: c.text,
      'stroke-dasharray': '3 3',
    });
    for (const [pm, key] of [
      [0, '0%'],
      [500, '50%'],
      [1000, '100%'],
    ] as const) {
      const lab = text(TRAIL_X0 - 8, yOf(pm) + 4, fontSizes.xs, c.textMuted, 'end');
      lab.textContent = key;
    }
    const axisTitle = text(TRAIL_X0 - 8, TRAIL_BOTTOM + 18, fontSizes.xs, c.textMuted, 'end');
    axisTitle.textContent = t('label.positivesAxis', 'positives');
    const tickGroup = el('g', {});
    const trailLine = el('polyline', { points: '', fill: 'none', stroke: c.text, 'stroke-width': 1.5 });
    const dotGroup = el('g', {});
    const result = text(W / 2, H - 12, fontSizes.md, c.text, 'middle', 600);

    // ── 상태
    let maxPositives = 0;
    let trail: number[] = [];
    let shownSick: number | null = null; // 지금 그려진 몫 (운동의 출발점)
    let shownHealthy: number | null = null;
    let targetSick = 0;
    let targetHealthy = 0;
    let frame: number | null = null;
    let finish: (() => void) | null = null;
    let destroyed = false;

    const drawBars = (s: number, h: number): void => {
      const sw = s * BAR_W;
      const hw = h * BAR_W;
      sickRect.setAttribute('width', String(sw));
      healthyRect.setAttribute('x', String(BAR_X + sw));
      healthyRect.setAttribute('width', String(hw));
      // 병 표지는 조각 가운데의 짧은 선 위에 선다 — 가는 조각에도 곁에 있게, 50% 글자 쪽으로는 넘지 않게
      const mid = BAR_X + sw / 2;
      sickTick.setAttribute('x1', String(mid));
      sickTick.setAttribute('x2', String(mid));
      sickLabel.setAttribute('x', String(Math.min(Math.max(BAR_X, mid - 24), BAR_X + BAR_W / 2 - 90)));
      // 병 아님 표지는 조각 오른쪽 끝을 따라가되, 병 표지와 50% 글자 쪽으로 넘어가지 않게 붙든다
      const hx = Math.max(BAR_X + sw + hw, BAR_X + 150);
      healthyLabel.setAttribute('x', String(hx));
      shownSick = s;
      shownHealthy = h;
    };

    const stopMotion = (): void => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const f = finish;
      finish = null;
      f?.();
    };

    const moveBars = (s: number, h: number, durationMs: number): Promise<void> => {
      checkShare(s, '병');
      checkShare(h, '병 아님');
      if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error('bayes-stage: 운동 길이가 음이 아닌 수가 아니다');
      stopMotion();
      targetSick = s;
      targetHealthy = h;
      const fromS = shownSick;
      const fromH = shownHealthy;
      if (destroyed || isInstant() || durationMs === 0 || fromS === null || fromH === null) {
        drawBars(s, h);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const start = performance.now();
        finish = () => {
          drawBars(targetSick, targetHealthy);
          resolve();
        };
        const tick = (now: number): void => {
          if (destroyed || isInstant()) {
            stopMotion();
            return;
          }
          const u = Math.min(1, (now - start) / durationMs);
          const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
          drawBars(fromS + (s - fromS) * e, fromH + (h - fromH) * e);
          if (u >= 1) {
            frame = null;
            finish = null;
            resolve();
            return;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      });
    };

    const trailX = (j: number): number => TRAIL_X0 + 20 + (j * (TRAIL_X1 - TRAIL_X0 - 40)) / maxPositives;

    const drawTrail = (): void => {
      dotGroup.textContent = '';
      const pts: string[] = [];
      trail.forEach((pm, j) => {
        const x = trailX(j);
        const y = yOf(pm);
        pts.push(`${x},${y}`);
        el('circle', { cx: x, cy: y, r: 4, fill: sickColor, stroke: c.text, 'stroke-width': 1 }, dotGroup);
        const lab = text(x, y - 8, fontSizes.xs, c.text, 'middle', 600);
        dotGroup.appendChild(lab);
        lab.textContent = permilleText(pm);
      });
      trailLine.setAttribute('points', pts.join(' '));
    };

    const drawTicks = (): void => {
      tickGroup.textContent = '';
      for (let j = 0; j <= maxPositives; j += 1) {
        const lab = text(trailX(j), TRAIL_BOTTOM + 18, fontSizes.xs, c.textMuted, 'middle');
        tickGroup.appendChild(lab);
        lab.textContent = String(j);
      }
    };

    const setOdds = (num: number, den: number): void => {
      odds.textContent = `${num} : ${den}`;
    };

    const setShareLabels = (ppv: number, healthy: number): void => {
      sickLabel.textContent = t('label.sick', 'Sick {pct}', { pct: permilleText(ppv) });
      healthyLabel.textContent = t('label.healthy', 'Not sick {pct}', { pct: permilleText(healthy) });
    };

    const clearAll = (): void => {
      stopMotion();
      shownSick = null;
      shownHealthy = null;
      trail = [];
      maxPositives = 0;
      caption.textContent = '';
      odds.textContent = '';
      oddsNote.textContent = '';
      sickLabel.textContent = '';
      healthyLabel.textContent = '';
      result.textContent = '';
      dotGroup.textContent = '';
      tickGroup.textContent = '';
      trailLine.setAttribute('points', '');
      sickRect.setAttribute('width', '0');
      healthyRect.setAttribute('x', String(BAR_X));
      healthyRect.setAttribute('width', '0');
      sickTick.setAttribute('x1', String(BAR_X));
      sickTick.setAttribute('x2', String(BAR_X));
      sickLabel.setAttribute('x', String(BAR_X));
    };

    params.onScrubStart?.(() => stopMotion());

    const inst: BayesStage = {
      reset: clearAll,
      showStart(a) {
        checkMax(a.maxPositives);
        // 결론(글자 · 자취 · 첫 양성)은 걷고, 나뉨 자리는 운동의 출발점으로 남긴다
        stopMotion();
        maxPositives = a.maxPositives;
        trail = [a.ppvPermille];
        result.textContent = '';
        oddsNote.textContent = '';
        caption.textContent = t('caption.start', 'Of {population} people: sick {sick} · not sick {healthy}', {
          population: a.population,
          sick: a.sick,
          healthy: a.healthy,
        });
        setOdds(a.num, a.den);
        setShareLabels(a.ppvPermille, a.healthyPermille);
        drawTicks();
        drawTrail();
        return moveBars(a.sickShare, a.healthyShare, a.durationMs);
      },
      showMultiply(a) {
        if (maxPositives === 0) throw new Error('bayes-stage: 판 머리 없이 곱 걸음이 왔다');
        caption.textContent = t('caption.multiply', 'Positive #{i}: sick side × {sens}%, not-sick side × {fpr}%', {
          i: a.i,
          sens: a.sensitivityPct,
          fpr: a.falsePositivePct,
        });
        setOdds(a.num, a.den);
        oddsNote.textContent = t('note.multiply', 'from {before} : {den}, sick side × {ratio}', {
          before: a.numBefore,
          den: a.den,
          ratio: a.ratio,
        });
        sickLabel.textContent = t('label.sickTimes', 'Sick × {sens}%', { sens: a.sensitivityPct });
        healthyLabel.textContent = t('label.healthyTimes', 'Not sick × {fpr}%', { fpr: a.falsePositivePct });
        return moveBars(a.sickShare, a.healthyShare, a.durationMs);
      },
      showNormalize(a) {
        if (maxPositives === 0) throw new Error('bayes-stage: 판 머리 없이 나눔 걸음이 왔다');
        if (a.i !== trail.length) throw new Error(`bayes-stage: 자취 ${trail.length} 칸 뒤에 양성 ${a.i} 가 왔다`);
        caption.textContent = t('caption.normalize', 'Divide so the two add up to 1 — sick share: {pct}', {
          pct: permilleText(a.ppvPermille),
        });
        setOdds(a.num, a.den);
        oddsNote.textContent = '';
        setShareLabels(a.ppvPermille, a.healthyPermille);
        trail = [...trail, a.ppvPermille];
        drawTrail();
        return moveBars(a.sickShare, a.healthyShare, a.durationMs);
      },
      showCross(a) {
        checkMax(a.maxPositives);
        if (a.trail.length === 0) throw new Error('bayes-stage: 자취가 비었다');
        maxPositives = a.maxPositives;
        trail = [...a.trail];
        drawTicks();
        drawTrail();
        const last = a.trail[a.trail.length - 1];
        if (last === undefined) throw new Error('bayes-stage: 자취 끝이 없다');
        caption.textContent = t('caption.cross', 'After {k} positives — sick share: {pct}', {
          k: a.trail.length - 1,
          pct: permilleText(last),
        });
        oddsNote.textContent = '';
        if (a.firstOver === -1) {
          result.textContent = t('result.none', 'Within {max} positives it does not pass half', { max: a.maxPositives });
        } else {
          if (!Number.isInteger(a.firstOver) || a.firstOver < 0) throw new Error('bayes-stage: 첫 양성 수가 어긋났다');
          result.textContent = t('result.first', 'First positive that passes half: {c}', { c: a.firstOver });
        }
      },
      destroy() {
        destroyed = true;
        stopMotion();
        svg.textContent = '';
      },
    };
    return inst;
  },
};
