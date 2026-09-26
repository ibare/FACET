/**
 * learned-filter 무대.
 *
 * 왼쪽 — 무늬 넷이 한 줄씩. 줄마다 깨끗한 무늬 · 잡음 섞인 조각 넷 · 응답 칸. 과제가 되는 줄을 `y = 1` 틀이
 * 감싼다. 손잡이를 돌리면 이 틀이 다른 줄로 **옮겨 간다** (과제가 바뀌는 운동).
 * 오른쪽 — 제자리에 선 3×3 창. 칸마다 |w| 에 따라 음영 네모가 **차오르고**, 부호에 따라 색이 갈린다.
 * 새 판의 걸음 0 에 네모가 0 으로 **가라앉았다가** 새 과제 쪽으로 다시 차오른다. 과제 무늬의 밝은 칸에는
 * 모서리 점이 있고, 부호가 맞는 칸은 테두리가 진하다. 아래에 b · 닮음 축 위를 옮겨 가는 표지 · 부호 맞는 칸 ·
 * 지난 판 막대.
 *
 * 값(조각 · 창 · b · 닮음 · 맞는 칸 · 응답 · 음영 축척 · 닮음 축 끝)은 모두 payload 로 받는다 — 무대는 셈하지 않는다.
 * 운동은 CSS transition 이고 길이는 projector 가 재생 속도를 읽어 건넨다.
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
const W = 760;
const H = 430;

// 왼쪽 — 무늬 줄
const ROW_TOP = 56;
const ROW_STEP = 76;
const PIX = 16; // 조각 칸 한 변
const PIECE = PIX * 3;
const NAME_X = 12;
const CLEAN_X = 100;
const PIECES_X = 170;
const PIECE_GAP = 56;
const RESP_X = 452; // 응답 칸 가운데
const FRAME_X = CLEAN_X - 8;
const FRAME_W = PIECES_X + PIECE_GAP * 3 + PIECE + 8 - FRAME_X;

// 오른쪽 — 창
const CELL = 64;
const WIN_X = 532;
const WIN_Y = 56;
const WIN_W = CELL * 3;
const BIAS_Y = WIN_Y + WIN_W + 24;
const SIM_LABEL_Y = BIAS_Y + 32;
const SIM_AXIS_Y = SIM_LABEL_Y + 18;
const MATCH_Y = SIM_AXIS_Y + 40;
const EPOCH_Y = MATCH_Y + 26;
const EPOCH_BAR_Y = EPOCH_Y + 8;
const CAPTION_Y = H - 14;

export type LearnedFilterStageSetup = {
  patterns: { id: string; cells: number[] }[];
  pieces: { pattern: number; cells: number[] }[];
  epochs: number;
  shadeScale: number;
  similarityRange: [number, number];
};
export type LearnedFilterStageRound = {
  target: number;
  pattern: number;
  ys: number[];
  weights: number[];
  bias: number;
};
export type LearnedFilterStageWindow = {
  epoch: number;
  weights: number[];
  bias: number;
  similarity: number;
  signMatch: number;
  matches: boolean[];
};
export type LearnedFilterStageResponses = { values: number[]; strongest: number };

/** projector 가 부르는 무대의 표면. */
export type LearnedFilterStage = ViewInstance & {
  setup(p: LearnedFilterStageSetup): void;
  /** 그린 것과 모아 둔 자리를 모두 걷는다 — 되돌리기 · 되짚기 앞에 projector 가 부른다. */
  reset(): void;
  round(p: LearnedFilterStageRound, ms: number): Promise<void>;
  showWindow(p: LearnedFilterStageWindow, ms: number): Promise<void>;
  showResponses(p: LearnedFilterStageResponses, ms: number): Promise<void>;
};

function fail(msg: string): never {
  throw new Error(`[learned-filter-stage] ${msg}`);
}

/** 둘째 자리 표시 — 음수는 U+2212 빼기 기호. */
export function fmt2(x: number): string {
  return x.toFixed(2).replace('-', '−');
}

export const learnedFilterStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const [posColor, negColor] = categorical(2, 'vivid');
    const smPx = parseFloat(fontSizes.sm);
    const isInstant = params.isInstant ?? (() => false);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    const releaseAll = (): void => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };
    params.onScrubStart?.(releaseAll);
    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0) return resolve();
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

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (
      x: number,
      y: number,
      content: string,
      opts: { size?: string; anchor?: string; fill?: string; weight?: string; mono?: boolean } = {},
      parent: Element = svg,
    ): SVGTextElement => {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'start',
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'font-weight': opts.weight ?? 'normal',
          fill: opts.fill ?? c.text,
        },
        parent,
      );
      node.textContent = content;
      return node;
    };
    const glide = (node: SVGElement | HTMLElement, ms: number, props = 'transform, fill, stroke'): void => {
      const d = isInstant() ? 0 : Math.max(0, ms);
      node.style.transition = props
        .split(',')
        .map((p) => `${p.trim()} ${d}ms ease-in-out`)
        .join(', ');
    };

    const patternName = (id: string): string => {
      switch (id) {
        case 'vertical':
          return t('label.vertical', 'Vertical edge');
        case 'horizontal':
          return t('label.horizontal', 'Horizontal edge');
        case 'diagonal':
          return t('label.diagonal', 'Diagonal');
        case 'flat':
          return t('label.flat', 'Flat patch');
        default:
          return fail(`모르는 무늬 식별자 ${id}`);
      }
    };

    /** 3×3 밝기 조각 하나 — 잉크 농도가 밝기. */
    const drawPiece = (x: number, y: number, cells: number[], parent: Element): void => {
      el('rect', { x: x - 1, y: y - 1, width: PIECE + 2, height: PIECE + 2, fill: c.bg, stroke: c.border }, parent);
      cells.forEach((v, i) => {
        el(
          'rect',
          {
            x: x + (i % 3) * PIX,
            y: y + Math.floor(i / 3) * PIX,
            width: PIX,
            height: PIX,
            fill: c.text,
            'fill-opacity': v,
          },
          parent,
        );
      });
    };

    // 판마다 바뀌는 자리들 — setup 에서 만든다
    let setupData: LearnedFilterStageSetup | null = null;
    let targetFrame: SVGGElement | null = null;
    const respTexts: SVGTextElement[] = [];
    const respPills: SVGRectElement[] = [];
    const cellFills: SVGRectElement[] = [];
    const cellBoxes: SVGRectElement[] = [];
    const cellValues: SVGTextElement[] = [];
    const cellDots: SVGCircleElement[] = [];
    let biasText: SVGTextElement | null = null;
    let simText: SVGTextElement | null = null;
    let simMarker: SVGGElement | null = null;
    let matchText: SVGTextElement | null = null;
    let epochText: SVGTextElement | null = null;
    let epochFill: SVGRectElement | null = null;
    let caption: SVGTextElement | null = null;
    let currentPattern = -1;

    const need = <T>(v: T | null, name: string): T => (v === null ? fail(`${name} 가 아직 없다 — setup 이 먼저 와야 한다`) : v);

    const setWeights = (weights: number[], matches: boolean[] | null, ms: number): void => {
      const s = need(setupData, 'setup');
      if (weights.length !== 9) fail('창은 칸 아홉이어야 한다');
      weights.forEach((w, i) => {
        const ratio = Math.abs(w) / s.shadeScale;
        if (ratio > 1 + 1e-9) fail(`창 칸 ${i + 1} 의 |w| 가 음영 축척을 넘는다`);
        const fill = cellFills[i];
        glide(fill, ms);
        fill.style.transform = `scale(${Math.sqrt(ratio)})`;
        fill.style.fill = w >= 0 ? posColor : negColor;
        cellValues[i].textContent = fmt2(w);
        const box = cellBoxes[i];
        glide(box, ms, 'stroke');
        const matched = matches === null ? false : matches[i];
        box.style.stroke = matched ? c.text : c.border;
        box.setAttribute('stroke-width', matched ? '2' : '1');
      });
    };

    const moveTargetFrame = (pattern: number, ms: number): void => {
      const frame = need(targetFrame, 'targetFrame');
      glide(frame, ms, 'transform');
      frame.style.transform = `translate(0px, ${pattern * ROW_STEP}px)`;
      frame.style.visibility = 'visible';
      const s = need(setupData, 'setup');
      const cells = s.patterns[pattern].cells;
      cellDots.forEach((dot, i) => {
        glide(dot, ms, 'transform');
        dot.style.transform = `scale(${cells[i] === 1 ? 1 : 0})`;
      });
    };

    const simX = (v: number): number => {
      const [lo, hi] = need(setupData, 'setup').similarityRange;
      return WIN_X + ((v - lo) / (hi - lo)) * WIN_W;
    };

    const clearAll = (): void => {
      releaseAll();
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      setupData = null;
      targetFrame = null;
      respTexts.length = 0;
      respPills.length = 0;
      cellFills.length = 0;
      cellBoxes.length = 0;
      cellValues.length = 0;
      cellDots.length = 0;
      biasText = null;
      simText = null;
      simMarker = null;
      matchText = null;
      epochText = null;
      epochFill = null;
      caption = null;
      currentPattern = -1;
    };

    const instance: LearnedFilterStage = {
      reset() {
        clearAll();
      },

      setup(p) {
        // 멱등 — 다시 불려도 한 벌만 선다
        clearAll();
        setupData = p;
        // 머리글
        text(CLEAN_X + PIECE / 2, ROW_TOP - 28, t('head.pattern', 'Pattern'), { anchor: 'middle', fill: c.textMuted });
        text(PIECES_X + (PIECE_GAP * 3 + PIECE) / 2, ROW_TOP - 28, t('head.pieces', 'Noisy pieces'), {
          anchor: 'middle',
          fill: c.textMuted,
        });
        text(RESP_X, ROW_TOP - 28, t('head.response', 'Response'), { anchor: 'middle', fill: c.textMuted });
        text(WIN_X + WIN_W / 2, ROW_TOP - 28, t('head.window', 'Window'), { anchor: 'middle', fill: c.textMuted });

        // 무늬 줄 — 깨끗한 무늬 · 조각 · 응답 칸
        const rows = el('g', {});
        p.patterns.forEach((pat, j) => {
          const y = ROW_TOP + j * ROW_STEP;
          text(NAME_X, y + PIECE / 2 + 4, patternName(pat.id), { size: fontSizes.xs });
          drawPiece(CLEAN_X, y, pat.cells, rows);
          const mine = p.pieces.filter((pc) => pc.pattern === j);
          if (mine.length === 0) fail(`무늬 ${pat.id} 의 조각이 없다`);
          mine.forEach((pc, n) => drawPiece(PIECES_X + n * PIECE_GAP, y, pc.cells, rows));
          const pill = el('rect', { x: RESP_X - 30, y: y + PIECE / 2 - 12, width: 60, height: 24, rx: 12, fill: c.accent }, rows);
          pill.style.visibility = 'hidden';
          respPills.push(pill);
          respTexts.push(text(RESP_X, y + PIECE / 2 + 4, '', { anchor: 'middle', mono: true, size: fontSizes.md }, rows));
        });

        // 과제 틀 — 줄 사이를 옮겨 간다
        targetFrame = el('g', {});
        targetFrame.style.visibility = 'hidden';
        el(
          'rect',
          { x: FRAME_X, y: ROW_TOP - 8, width: FRAME_W, height: PIECE + 16, rx: 6, fill: 'none', stroke: c.primary, 'stroke-width': 2 },
          targetFrame,
        );
        el('rect', { x: FRAME_X, y: ROW_TOP - 24, width: 44, height: 16, rx: 3, fill: c.primary }, targetFrame);
        text(FRAME_X + 22, ROW_TOP - 12, t('tag.target', 'y = 1'), { anchor: 'middle', size: fontSizes.xs, fill: c.textInverse, mono: true }, targetFrame);

        // 창 — 제자리
        for (let i = 0; i < 9; i += 1) {
          const x = WIN_X + (i % 3) * CELL;
          const y = WIN_Y + Math.floor(i / 3) * CELL;
          const box = el('rect', { x, y, width: CELL, height: CELL, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1 });
          cellBoxes.push(box);
          const fill = el('rect', { x: x + 3, y: y + 3, width: CELL - 6, height: CELL - 6, rx: 3 });
          fill.style.transformBox = 'fill-box';
          fill.style.transformOrigin = 'center';
          fill.style.transform = 'scale(0)';
          fill.style.fill = posColor;
          cellFills.push(fill);
          const dot = el('circle', { cx: x + 8, cy: y + 8, r: 3, fill: c.text });
          dot.style.transformBox = 'fill-box';
          dot.style.transformOrigin = 'center';
          dot.style.transform = 'scale(0)';
          cellDots.push(dot);
          const val = text(x + CELL / 2, y + CELL / 2 + smPx / 3, '', { anchor: 'middle', mono: true });
          val.setAttribute('stroke', c.bg);
          val.setAttribute('stroke-width', '3');
          val.setAttribute('paint-order', 'stroke');
          cellValues.push(val);
        }
        biasText = text(WIN_X + WIN_W / 2, BIAS_Y, '', { anchor: 'middle', mono: true });

        // 닮음 축
        simText = text(WIN_X, SIM_LABEL_Y, '', {});
        const [lo, hi] = p.similarityRange;
        if (!(hi > lo)) fail('닮음 축의 끝이 거꾸로다');
        el('line', { x1: simX(lo), x2: simX(hi), y1: SIM_AXIS_Y, y2: SIM_AXIS_Y, stroke: c.border, 'stroke-width': 2 });
        for (const v of [lo, hi]) {
          el('line', { x1: simX(v), x2: simX(v), y1: SIM_AXIS_Y - 4, y2: SIM_AXIS_Y + 4, stroke: c.textMuted });
          text(simX(v), SIM_AXIS_Y + 16, fmt2(v), { anchor: 'middle', size: fontSizes.xs, fill: c.textMuted, mono: true });
        }
        el('line', { x1: simX(0), x2: simX(0), y1: SIM_AXIS_Y - 4, y2: SIM_AXIS_Y + 4, stroke: c.textMuted });
        simMarker = el('g', {});
        el('circle', { cx: 0, cy: SIM_AXIS_Y, r: 6, fill: c.text }, simMarker);
        simMarker.style.transform = `translate(${simX(0)}px, 0px)`;
        simMarker.style.visibility = 'hidden';

        matchText = text(WIN_X, MATCH_Y, '', {});
        epochText = text(WIN_X, EPOCH_Y, '', {});
        el('rect', { x: WIN_X, y: EPOCH_BAR_Y, width: WIN_W, height: 6, rx: 3, fill: c.bgSubtle, stroke: c.border });
        epochFill = el('rect', { x: WIN_X, y: EPOCH_BAR_Y, width: WIN_W, height: 6, rx: 3, fill: c.text });
        epochFill.style.transformBox = 'fill-box';
        epochFill.style.transformOrigin = 'left center';
        epochFill.style.transform = 'scaleX(0)';

        caption = text(W / 2, CAPTION_Y, '', { anchor: 'middle', size: fontSizes.md });
      },

      round(p, ms) {
        const s = need(setupData, 'setup');
        if (p.pattern < 0 || p.pattern >= s.patterns.length) fail(`무늬 번호 ${p.pattern} 가 범위 밖이다`);
        currentPattern = p.pattern;
        // 앞 판의 결론을 걷는다 — 응답 · 짚은 표지 · 닮음 · 맞는 칸
        respTexts.forEach((tx) => (tx.textContent = ''));
        respPills.forEach((pill) => (pill.style.visibility = 'hidden'));
        moveTargetFrame(p.pattern, ms);
        setWeights(p.weights, null, ms);
        need(biasText, 'biasText').textContent = t('value.bias', 'b = {b}', { b: fmt2(p.bias) });
        need(simText, 'simText').textContent = t('value.similarityNone', 'Similarity: not measured');
        const marker = need(simMarker, 'simMarker');
        glide(marker, ms, 'transform');
        marker.style.transform = `translate(${simX(0)}px, 0px)`;
        marker.style.visibility = 'hidden';
        need(matchText, 'matchText').textContent = '';
        need(epochText, 'epochText').textContent = t('value.epoch', 'Epoch {epoch} / {epochs}', {
          epoch: 0,
          epochs: s.epochs,
        });
        const bar = need(epochFill, 'epochFill');
        glide(bar, ms, 'transform');
        bar.style.transform = 'scaleX(0)';
        need(caption, 'caption').textContent = t('caption.start', 'Start: window {w}, b {b}. Target: {pattern}', {
          w: p.weights.map(fmt2).join(' '),
          b: fmt2(p.bias),
          pattern: patternName(s.patterns[p.pattern].id),
        });
        return wait(ms);
      },

      showWindow(p, ms) {
        const s = need(setupData, 'setup');
        if (currentPattern < 0) fail('round 가 먼저 와야 한다');
        setWeights(p.weights, p.matches, ms);
        need(biasText, 'biasText').textContent = t('value.bias', 'b = {b}', { b: fmt2(p.bias) });
        need(simText, 'simText').textContent = t('value.similarity', 'Similarity: {sim}', { sim: fmt2(p.similarity) });
        const marker = need(simMarker, 'simMarker');
        glide(marker, ms, 'transform');
        marker.style.visibility = 'visible';
        marker.style.transform = `translate(${simX(p.similarity)}px, 0px)`;
        need(matchText, 'matchText').textContent = t('value.signMatch', 'Cells with matching sign: {n} / 9', {
          n: p.signMatch,
        });
        need(epochText, 'epochText').textContent = t('value.epoch', 'Epoch {epoch} / {epochs}', {
          epoch: p.epoch,
          epochs: s.epochs,
        });
        const bar = need(epochFill, 'epochFill');
        glide(bar, ms, 'transform');
        bar.style.transform = `scaleX(${p.epoch / s.epochs})`;
        need(caption, 'caption').textContent = t(
          'caption.epoch',
          'After epoch {epoch}: similarity {sim}, cells with matching sign {n} / 9',
          { epoch: p.epoch, sim: fmt2(p.similarity), n: p.signMatch },
        );
        return wait(ms);
      },

      showResponses(p, ms) {
        const s = need(setupData, 'setup');
        if (p.values.length !== s.patterns.length) fail('응답 수가 무늬 수와 다르다');
        if (p.strongest < 0 || p.strongest >= s.patterns.length) fail('가장 큰 응답의 번호가 범위 밖이다');
        p.values.forEach((z, j) => {
          const tx = respTexts[j];
          tx.textContent = fmt2(z);
          tx.setAttribute('font-weight', j === p.strongest ? 'bold' : 'normal');
          tx.setAttribute('fill', j === p.strongest ? c.stateInk : c.textMuted);
        });
        respPills[p.strongest].style.visibility = 'visible';
        need(caption, 'caption').textContent = t(
          'caption.strongest',
          'Clean patterns against the window: largest response {z} for {pattern}',
          { z: fmt2(p.values[p.strongest]), pattern: patternName(s.patterns[p.strongest].id) },
        );
        return wait(ms);
      },

      destroy() {
        destroyed = true;
        clearAll();
      },
    };
    return instance;
  },
};
