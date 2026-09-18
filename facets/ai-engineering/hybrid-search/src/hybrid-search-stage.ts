/**
 * hybrid-search stage — 두 줄에서 떨어져 나와 한 줄로 선다.
 *
 * 왼쪽 가장자리에 낱말 등수 줄(BM25), 오른쪽 가장자리에 뜻 등수 줄이 선다. 문서마다 두
 * 줄의 자기 자리에서 띠가 하나씩 나와 가운데 합친 줄의 자기 칸에 닿는다. 띠의 굵기는 그
 * 쪽에서 받는 몫(w/(60+등수) 또는 (4−w)/(60+등수))이다.
 *
 * 손잡이를 돌리면 띠가 한쪽에서 굵어지고 다른 쪽에서 가늘어진다. 그리고 합친 줄의 칸들이
 * 한 걸음에 하나씩 새 자리로 옮겨 간다 — 옮겨 가는 문서는 아직 자리를 못 받은 문서들을
 * 지나치며 오르내리고, 위 3 의 경계선을 넘나든다.
 *
 * 색은 design-tokens 에서만 받는다. 낱말 쪽 · 뜻 쪽은 `categorical(2)` 두 색.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 620;
const H = 484;
/** 문서 수의 상한 — 칸을 처음부터 이만큼 잡는다. */
const MAX_DOCS = 8;
const ROW_TOP = 70;
const ROW_H = 36;

const LEFT_RANK_X = 14;
const LEFT_BUBBLE_X = 44;
const LEFT_SCORE_X = 62;
const LEFT_ANCHOR_X = 114;
const RIGHT_RANK_X = 606;
const RIGHT_BUBBLE_X = 576;
const RIGHT_SCORE_X = 558;
const RIGHT_ANCHOR_X = 512;
const CHIP_X = 246;
const CHIP_W = 128;
const CHIP_H = 28;
/** 띠의 가장 굵은 굵기 (한쪽 몫이 전부이고 등수가 1 일 때). */
const RIBBON_MAX = 12;

const QUERY_Y = 24;
const LEGEND_Y = 372;
const CAPTION_Y = 402;
const CAPTION_LINE = 20;
const CAPTION_CHARS = 80;
const DETAIL_LINE = 18;
const DETAIL_CHARS = 92;

export type HybridStageDoc = {
  id: string;
  text: string;
  lexScore: number;
  lexRank: number;
  similarity: number;
  vecRank: number;
  relevant: boolean;
  noShared: boolean;
};

/** projector 가 부르는 표면 — projector.ts 가 이 타입으로 좁힌다. */
export type HybridStage = ViewInstance & {
  setDocs(query: string, docs: HybridStageDoc[], top: number): void;
  /** 몫을 매긴다 — 문서마다 두 쪽에서 받는 몫(가장 큰 값 대비 0..1)과 섞은 점수. */
  weigh(lexShare: number[], vecShare: number[], scores: number[], ms: number): void;
  /** 합친 줄의 차례 — 앞 `seated` 개가 자리를 받았다. `focus` 는 방금 선 문서. */
  arrange(order: number[], seated: number, focus: number | null, ms: number): void;
  caption(main: string, detail: string): void;
  clear(): void;
};

/** 판정 3 — 수식 · 기호 표기. 질의와 겹치는 낱말이 없다는 표식 (공집합 기호). */
const NO_SHARED_MARK = '∅';

const rowY = (slot: number): number => ROW_TOP + slot * ROW_H + ROW_H / 2;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  if (parent) parent.appendChild(node);
  return node;
}

function text(
  parent: Element,
  x: number,
  y: number,
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', { x, y, 'dominant-baseline': 'middle', ...attrs }, parent);
  node.textContent = content;
  return node;
}

/** 낱말 경계에서 줄을 나눈다. */
function wrap(content: string, limit: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of content.split(' ')) {
    if (line.length > 0 && line.length + 1 + word.length > limit) {
      lines.push(line);
      line = word;
    } else {
      line = line.length > 0 ? `${line} ${word}` : word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

const r2 = (x: number): number => Math.round(x * 100) / 100 || 0;

function ribbonPath(x0: number, y0: number, x1: number, y1: number): string {
  const mx = (x0 + x1) / 2;
  return `M ${r2(x0)} ${r2(y0)} C ${r2(mx)} ${r2(y0)} ${r2(mx)} ${r2(y1)} ${r2(x1)} ${r2(y1)}`;
}

export const hybridSearchStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params): HybridStage {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const [lexColor, vecColor] = categorical(2, 'vivid');

    let destroyed = false;
    let frame: number | null = null;

    let docs: HybridStageDoc[] = [];
    /** 문서마다 합친 줄에서의 지금 세로 자리 · 띠 굵기 (그리는 도중의 값). */
    let curY: number[] = [];
    let curLex: number[] = [];
    let curVec: number[] = [];
    let goalY: number[] = [];
    let goalLex: number[] = [];
    let goalVec: number[] = [];
    let scores: (number | null)[] = [];
    let seatedSet = new Set<number>();
    let focusDoc: number | null = null;
    let mainCaption = '';
    let detailCaption = '';
    let queryText = '';
    /** 위 몇 개를 재는가 — 데이터가 정한다 (ladders 의 top). 받기 전에는 띠를 그리지 않는다. */
    let topN = 0;

    // 층 — 뒤에서 앞으로.
    const bgLayer = el('g', {}, svg);
    const ribbonLayer = el('g', {}, svg);
    const ladderLayer = el('g', {}, svg);
    const chipLayer = el('g', {}, svg);
    const captionLayer = el('g', {}, svg);

    let lexPaths: SVGPathElement[] = [];
    let vecPaths: SVGPathElement[] = [];
    let chips: SVGGElement[] = [];

    function drawBackground(): void {
      bgLayer.textContent = '';
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, bgLayer);
      // 위 top 띠.
      if (topN > 0) {
      el(
        'rect',
        { x: CHIP_X - 14, y: ROW_TOP, width: CHIP_W + 28, height: topN * ROW_H, rx: 6, fill: c.bgSubtle },
        bgLayer,
      );
      const edge = ROW_TOP + topN * ROW_H;
      el(
        'line',
        { x1: CHIP_X - 14, y1: edge, x2: CHIP_X + CHIP_W + 14, y2: edge, stroke: c.accent, 'stroke-width': 2, 'stroke-dasharray': '5 4' },
        bgLayer,
      );
      text(bgLayer, CHIP_X + CHIP_W + 18, edge, t('label.top', 'Top {top}', { top: topN }), {
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
      }
      // 머리.
      const headY = ROW_TOP - 14;
      text(bgLayer, LEFT_RANK_X, headY, t('label.lexical', 'By words (BM25)'), {
        fill: lexColor ?? c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
      });
      text(bgLayer, CHIP_X + CHIP_W / 2, headY, t('label.fused', 'Fused'), {
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        'text-anchor': 'middle',
      });
      text(bgLayer, RIGHT_RANK_X, headY, t('label.semantic', 'By meaning'), {
        fill: vecColor ?? c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 600,
        'text-anchor': 'end',
      });
      // 범례.
      el('circle', { cx: LEFT_RANK_X + 4, cy: LEGEND_Y, r: 4, fill: c.success }, bgLayer);
      text(bgLayer, LEFT_RANK_X + 14, LEGEND_Y, t('legend.relevant', 'marked relevant'), {
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
      // 판정 3 — 수식 · 기호 표기 (공집합 기호). 문안이 아니라 표식이라 키를 두지 않는다.
      text(bgLayer, 200, LEGEND_Y, NO_SHARED_MARK, {
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      text(bgLayer, 214, LEGEND_Y, t('legend.noShared', 'shares no word with the query'), {
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
    }

    function drawLadders(): void {
      ladderLayer.textContent = '';
      if (queryText.length > 0) {
        const label = text(ladderLayer, LEFT_RANK_X, QUERY_Y, t('label.query', 'Query'), {
          fill: c.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        });
        label.setAttribute('font-weight', '600');
        text(ladderLayer, LEFT_RANK_X + 72, QUERY_Y, queryText, {
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
        });
      }
      docs.forEach((d) => {
        // 낱말 쪽.
        const yl = rowY(d.lexRank - 1);
        text(ladderLayer, LEFT_RANK_X, yl, String(d.lexRank), {
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        el('circle', { cx: LEFT_BUBBLE_X, cy: yl, r: 13, fill: c.bg, stroke: lexColor ?? c.border, 'stroke-width': 2 }, ladderLayer);
        text(ladderLayer, LEFT_BUBBLE_X, yl, d.id, {
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
        });
        if (d.relevant) el('circle', { cx: LEFT_BUBBLE_X + 10, cy: yl - 10, r: 4, fill: c.success }, ladderLayer);
        text(ladderLayer, LEFT_SCORE_X, yl, d.lexScore.toFixed(4), {
          fill: d.noShared ? c.textMuted : c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        // 뜻 쪽.
        const yr = rowY(d.vecRank - 1);
        text(ladderLayer, RIGHT_RANK_X, yr, String(d.vecRank), {
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        });
        el('circle', { cx: RIGHT_BUBBLE_X, cy: yr, r: 13, fill: c.bg, stroke: vecColor ?? c.border, 'stroke-width': 2 }, ladderLayer);
        text(ladderLayer, RIGHT_BUBBLE_X, yr, d.id, {
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
        });
        if (d.relevant) el('circle', { cx: RIGHT_BUBBLE_X - 10, cy: yr - 10, r: 4, fill: c.success }, ladderLayer);
        text(ladderLayer, RIGHT_SCORE_X, yr, d.similarity.toFixed(2), {
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        });
      });
    }

    /** 띠와 칸을 짓는다 — 문서가 바뀔 때만. 자리 · 굵기는 drawMoving 이 덮어쓴다. */
    function buildMoving(): void {
      ribbonLayer.textContent = '';
      chipLayer.textContent = '';
      lexPaths = docs.map(() =>
        el('path', { fill: 'none', stroke: lexColor ?? c.border, 'stroke-opacity': 0.55, 'stroke-linecap': 'round' }, ribbonLayer),
      );
      vecPaths = docs.map(() =>
        el('path', { fill: 'none', stroke: vecColor ?? c.border, 'stroke-opacity': 0.55, 'stroke-linecap': 'round' }, ribbonLayer),
      );
      chips = docs.map(() => el('g', {}, chipLayer));
    }

    function drawChip(i: number): void {
      const g = chips[i];
      const d = docs[i];
      if (!g || !d) return;
      g.textContent = '';
      g.setAttribute('transform', `translate(${CHIP_X} ${r2((curY[i] ?? 0) - CHIP_H / 2)})`);
      const seated = seatedSet.has(i);
      const focused = focusDoc === i;
      el(
        'rect',
        {
          x: 0,
          y: 0,
          width: CHIP_W,
          height: CHIP_H,
          rx: 6,
          fill: seated ? c.bg : c.bgSubtle,
          stroke: focused ? c.accent : seated ? c.text : c.border,
          'stroke-width': focused ? 2.5 : 1.2,
          'stroke-dasharray': seated ? 'none' : '4 3',
        },
        g,
      );
      if (d.relevant) el('rect', { x: 0, y: 0, width: 5, height: CHIP_H, rx: 2, fill: c.success }, g);
      text(g, 14, CHIP_H / 2, d.id, {
        fill: seated ? c.text : c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': 600,
      });
      if (d.noShared) {
        // 판정 3 — 기호 표식 (범례와 같은 상수).
        text(g, 38, CHIP_H / 2, NO_SHARED_MARK, { fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm });
      }
      const s = scores[i];
      if (s !== null && s !== undefined) {
        text(g, CHIP_W - 10, CHIP_H / 2, s.toFixed(4), {
          fill: seated ? c.text : c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        });
      }
    }

    /** 지금 값(curY · curLex · curVec)으로 띠와 칸을 놓는다. */
    function drawMoving(): void {
      docs.forEach((d, i) => {
        const y = curY[i] ?? rowY(i);
        const lp = lexPaths[i];
        const vp = vecPaths[i];
        const lw = (curLex[i] ?? 0) * RIBBON_MAX;
        const vw = (curVec[i] ?? 0) * RIBBON_MAX;
        if (lp) {
          lp.setAttribute('d', ribbonPath(LEFT_ANCHOR_X, rowY(d.lexRank - 1), CHIP_X, y));
          lp.setAttribute('stroke-width', String(r2(lw)));
          lp.setAttribute('visibility', lw < 0.3 ? 'hidden' : 'visible');
        }
        if (vp) {
          vp.setAttribute('d', ribbonPath(RIGHT_ANCHOR_X, rowY(d.vecRank - 1), CHIP_X + CHIP_W, y));
          vp.setAttribute('stroke-width', String(r2(vw)));
          vp.setAttribute('visibility', vw < 0.3 ? 'hidden' : 'visible');
        }
        drawChip(i);
      });
      // 움직이는 칸을 맨 앞에 — 지나치는 동안 가리지 않게.
      if (focusDoc !== null) {
        const g = chips[focusDoc];
        if (g) chipLayer.appendChild(g);
      }
    }

    function drawCaption(): void {
      captionLayer.textContent = '';
      const mainLines = wrap(mainCaption, CAPTION_CHARS).slice(0, 2);
      mainLines.forEach((line, k) => {
        text(captionLayer, LEFT_RANK_X, CAPTION_Y + k * CAPTION_LINE, line, {
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
        });
      });
      const detailY = CAPTION_Y + Math.max(1, mainLines.length) * CAPTION_LINE + 4;
      wrap(detailCaption, DETAIL_CHARS)
        .slice(0, 2)
        .forEach((line, k) => {
          text(captionLayer, LEFT_RANK_X, detailY + k * DETAIL_LINE, line, {
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          });
        });
    }

    function stopMotion(): void {
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      frame = null;
    }

    /** 지금 값에서 목표로 흐른다. 새 흐름은 앞 흐름이 멈춘 자리에서 출발한다. */
    function flow(ms: number): void {
      stopMotion();
      if (destroyed) return;
      const fromY = curY.slice();
      const fromL = curLex.slice();
      const fromV = curVec.slice();
      const settle = (): void => {
        curY = goalY.slice();
        curLex = goalLex.slice();
        curVec = goalVec.slice();
        drawMoving();
      };
      if (ms <= 0 || typeof requestAnimationFrame !== 'function') {
        settle();
        return;
      }
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const tick = (now: number): void => {
        if (destroyed) return;
        const p = Math.min(1, (now - start) / ms);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        curY = fromY.map((y, i) => y + ((goalY[i] ?? y) - y) * e);
        curLex = fromL.map((x, i) => x + ((goalLex[i] ?? x) - x) * e);
        curVec = fromV.map((x, i) => x + ((goalVec[i] ?? x) - x) * e);
        drawMoving();
        if (p < 1) frame = requestAnimationFrame(tick);
        else {
          frame = null;
          settle();
        }
      };
      frame = requestAnimationFrame(tick);
    }

    function reset(): void {
      stopMotion();
      docs = [];
      curY = [];
      curLex = [];
      curVec = [];
      goalY = [];
      goalLex = [];
      goalVec = [];
      scores = [];
      seatedSet = new Set();
      focusDoc = null;
      mainCaption = '';
      detailCaption = '';
      queryText = '';
      topN = 0;
      drawBackground();
      ladderLayer.textContent = '';
      ribbonLayer.textContent = '';
      chipLayer.textContent = '';
      lexPaths = [];
      vecPaths = [];
      chips = [];
      drawCaption();
    }

    drawBackground();
    drawCaption();

    const stage: HybridStage = {
      setDocs(query: string, next: HybridStageDoc[], top: number): void {
        if (destroyed) return;
        stopMotion();
        queryText = query;
        topN = Math.max(0, Math.min(MAX_DOCS, Math.floor(top)));
        drawBackground();
        docs = next.slice(0, MAX_DOCS);
        // 처음에는 번호 차례로, 자리를 받지 못한 채 선다.
        curY = docs.map((_, i) => rowY(i));
        goalY = curY.slice();
        curLex = docs.map(() => 0);
        curVec = docs.map(() => 0);
        goalLex = curLex.slice();
        goalVec = curVec.slice();
        scores = docs.map(() => null);
        seatedSet = new Set();
        focusDoc = null;
        drawLadders();
        buildMoving();
        drawMoving();
      },
      weigh(lexShare: number[], vecShare: number[], nextScores: number[], ms: number): void {
        if (destroyed) return;
        goalLex = docs.map((_, i) => Math.max(0, Math.min(1, lexShare[i] ?? 0)));
        goalVec = docs.map((_, i) => Math.max(0, Math.min(1, vecShare[i] ?? 0)));
        scores = docs.map((_, i) => nextScores[i] ?? null);
        seatedSet = new Set();
        focusDoc = null;
        flow(ms);
      },
      arrange(order: number[], seated: number, focus: number | null, ms: number): void {
        if (destroyed) return;
        order.forEach((doc, slot) => {
          if (doc >= 0 && doc < docs.length) goalY[doc] = rowY(slot);
        });
        seatedSet = new Set(order.slice(0, seated));
        focusDoc = focus;
        flow(ms);
      },
      caption(main: string, detail: string): void {
        if (destroyed) return;
        mainCaption = main;
        detailCaption = detail;
        drawCaption();
      },
      clear(): void {
        if (destroyed) return;
        reset();
      },
      destroy(): void {
        destroyed = true;
        stopMotion();
        svg.textContent = '';
      },
    };
    return stage;
  },
};
