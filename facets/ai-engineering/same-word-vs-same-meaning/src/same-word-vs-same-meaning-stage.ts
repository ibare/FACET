/**
 * same-word-vs-same-meaning 무대 — 두 줄이 엇갈려 선다.
 *
 * 왼쪽 줄은 낱말 맞추기(BM25), 오른쪽 줄은 뜻 맞추기(코사인). 같은 문서 다섯이 두 줄에
 * 한 번씩 서고, 같은 문서의 두 자리를 끈이 잇는다. 처음에는 두 줄이 식별자 순이라 끈이
 * 나란하다. 한 줄씩 점수대로 다시 서면 문서 상자가 위아래로 옮겨 가고 끈이 기운다 —
 * 낱말이 겹치지 않는 문서는 왼쪽에서 가라앉고 오른쪽에서 떠올라 끈이 엇갈린다.
 *
 * 왼쪽 상자는 문서의 글을 그대로 보인다(겹친 낱말이 주장이다). 오른쪽 상자는 식별자와
 * 예로 정한 벡터만 보인다 — 뜻 쪽 잣대는 글을 읽지 않는다는 것이 그 자리의 말이다.
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
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { SameWordVsSameMeaningScene, SideState } from './scene.js';

const H = 344;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 12;
const QUERY_Y = 20;
const HEAD_Y = 50;
const ROWS_TOP = 76;
const CAPTION_1 = H - 30;
const CAPTION_2 = H - 12;
/** 상한만 둔다 — 문서가 많으면 줄 간격이 줄어든다 */
const ROW_H_MAX = 44;
const CHIP_H_MAX = 36;

const LEFT_X = 34;
const LEFT_W = Math.round(W * 0.58);
const RIGHT_W = Math.round(W * 0.17);
const RIGHT_X = W - PAD - RIGHT_W;
const TEXT_DX = 34;

const SCORE_MS = 600;
const RANK_MS = 820;
const VERDICT_MS = 420;

const LINK_W = 2;
const LINK_W_FOCUS = 3.5;
const LINK_OP = 0.75;
const LINK_OP_DIM = 0.2;

type Handles = {
  leftG: SVGGElement[];
  rightG: SVGGElement[];
  links: SVGPathElement[];
  leftBars: SVGRectElement[];
  rightBars: SVGRectElement[];
  leftScores: SVGTextElement[];
  rightScores: SVGTextElement[];
  barWidth: { words: number[]; meaning: number[] };
};

function r(v: number): number {
  return Math.round(v * 100) / 100 + 0;
}

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

function idOrder(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function orderOf(side: SideState, n: number): number[] {
  return side.order ?? idOrder(n);
}

function rowH(n: number): number {
  return Math.min(ROW_H_MAX, (CAPTION_1 - 22 - ROWS_TOP) / Math.max(n, 1));
}

function slotY(slot: number, n: number): number {
  return r(ROWS_TOP + slot * rowH(n));
}

function chipH(n: number): number {
  return Math.min(CHIP_H_MAX, rowH(n) - 6);
}

function linkPath(ly: number, ry: number, n: number): string {
  const x0 = LEFT_X + LEFT_W;
  const x1 = RIGHT_X - 20;
  const mid = r((x0 + x1) / 2);
  const a = r(ly + chipH(n) / 2);
  const b = r(ry + chipH(n) / 2);
  return `M ${x0} ${a} C ${mid} ${a} ${mid} ${b} ${x1} ${b}`;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function caption(scene: SameWordVsSameMeaningScene, t: Translate): [string, string] {
  const step = scene.step;
  const n = scene.docs.length;
  if (step === null) return ['', ''];
  if (step.kind === 'init') {
    return [t('caption.init', 'The same {n} documents stand in two lines, still in id order.', { n }), ''];
  }
  if (step.kind === 'score' && step.side === 'words') {
    const zero = (scene.words.scores ?? []).filter((s) => s === 0).length;
    return [
      t('caption.scoreWords', 'Word match (BM25) scores only query words found in the text.'),
      t('caption.noOverlap', 'Documents sharing no query word: {zero}.', { zero }),
    ];
  }
  if (step.kind === 'score') {
    return [t('caption.scoreMeaning', 'Meaning match (cosine): compares the example vectors, not the words.'), ''];
  }
  if (step.kind === 'rank' && step.side === 'words') {
    const order = orderOf(scene.words, n);
    const scores = scene.words.scores ?? [];
    const top = scene.docs[order[0] ?? 0]?.id ?? '';
    const zero = order.filter((i) => scores[i] === 0).map((i) => scene.docs[i]!.id);
    return [
      zero.length > 0
        ? t('caption.rankWordsZero', 'Lined up by word score. Top: {top}. Sunk with 0 points: {zero}.', { top, zero: zero.join(', ') })
        : t('caption.rankWords', 'Lined up by word score. Top: {top}.', { top }),
      '',
    ];
  }
  if (step.kind === 'rank') {
    const order = orderOf(scene.meaning, n);
    const top = scene.docs[order[0] ?? 0];
    return [
      t('caption.rankMeaning', 'Lined up by meaning score. Top: {top}.', { top: top?.id ?? '' }),
      t('caption.topOverlap', 'Query words in {top}: {k}.', { top: top?.id ?? '', k: top?.overlap ?? 0 }),
    ];
  }
  const v = scene.verdict;
  if (v === null) return ['', ''];
  const wOrder = orderOf(scene.words, n);
  const mOrder = orderOf(scene.meaning, n);
  const line = (i: number): string =>
    t('caption.move', '{id}: {k} shared words. Word line #{a} → meaning line #{b}.', {
      id: scene.docs[i]?.id ?? '',
      k: scene.docs[i]?.overlap ?? 0,
      a: wOrder.indexOf(i) + 1,
      b: mOrder.indexOf(i) + 1,
    });
  return [line(v.rise), line(v.sink)];
}

function drawStatic(
  svg: SVGSVGElement,
  scene: SameWordVsSameMeaningScene,
  c: Palette,
  t: Translate,
): Handles {
  svg.textContent = '';
  const n = scene.docs.length;
  const handles: Handles = {
    leftG: [],
    rightG: [],
    links: [],
    leftBars: [],
    rightBars: [],
    leftScores: [],
    rightScores: [],
    barWidth: { words: [], meaning: [] },
  };
  if (n === 0) return handles;

  const colors = categorical(n);
  const ch = chipH(n);
  const wOrder = orderOf(scene.words, n);
  const mOrder = orderOf(scene.meaning, n);
  const matched = scene.words.scores !== null;
  const verdict = scene.verdict;

  // 질의 줄 — 불용어는 지운 채 남긴다
  const qLabel = el('text', { x: PAD, y: QUERY_Y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.textMuted }, svg);
  qLabel.textContent = t('label.query', 'Query');
  const q = el('text', { x: LEFT_X + TEXT_DX, y: QUERY_Y, 'font-family': fonts.body, 'font-size': fontSizes.lg, 'font-weight': 600, fill: c.text }, svg);
  scene.query.forEach((w, i) => {
    if (i > 0) q.appendChild(document.createTextNode(' '));
    const span = el('tspan', {}, q);
    if (w.stop) {
      span.setAttribute('fill', c.textMuted);
      span.setAttribute('font-weight', '400');
      span.setAttribute('text-decoration', 'line-through');
    }
    span.textContent = w.text;
  });
  const qv = el('text', { x: W - PAD, y: QUERY_Y, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted }, svg);
  qv.textContent = t('label.queryVector', 'query vector ({v})', { v: scene.queryVector.join(', ') });

  // 두 줄의 머리
  const hw = el('text', { x: LEFT_X, y: HEAD_Y, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700, fill: c.text }, svg);
  hw.textContent = t('label.words', 'Word match · BM25');
  const hm = el('text', { x: W - PAD, y: HEAD_Y, 'text-anchor': 'end', 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700, fill: c.text }, svg);
  hm.textContent = t('label.meaning', 'Meaning match · cosine');

  // 등수 — 그 줄이 점수대로 선 뒤에만 뜻이 있다
  for (let s = 0; s < n; s += 1) {
    const y = slotY(s, n) + ch / 2 + 4;
    if (scene.words.order !== null) {
      const num = el('text', { x: LEFT_X - 8, y: r(y), 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted }, svg);
      num.textContent = String(s + 1);
    }
    if (scene.meaning.order !== null) {
      const num = el('text', { x: RIGHT_X - 6, y: r(y), 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.textMuted }, svg);
      num.textContent = String(s + 1);
    }
  }

  // 끈 — 같은 문서의 두 자리
  const linkLayer = el('g', {}, svg);
  scene.docs.forEach((_, i) => {
    const focus = verdict !== null && (verdict.rise === i || verdict.sink === i);
    const dim = verdict !== null && !focus;
    const path = el('path', {
      d: linkPath(slotY(wOrder.indexOf(i), n), slotY(mOrder.indexOf(i), n), n),
      fill: 'none',
      stroke: colors[i]!,
      'stroke-width': focus ? LINK_W_FOCUS : LINK_W,
      opacity: dim ? LINK_OP_DIM : LINK_OP,
    }, linkLayer);
    handles.links.push(path);
  });

  const maxOf = (s: number[] | null): number => (s === null ? 0 : Math.max(0, ...s));
  const wMax = maxOf(scene.words.scores);
  const mMax = maxOf(scene.meaning.scores);
  const leftBarMax = LEFT_W - TEXT_DX - 52;
  const rightBarMax = RIGHT_W - 8 - 40;

  scene.docs.forEach((doc, i) => {
    // 왼쪽 상자 — 글을 그대로
    const lg = el('g', { transform: `translate(${LEFT_X} ${slotY(wOrder.indexOf(i), n)})` }, svg);
    el('rect', { x: 0, y: 0, width: LEFT_W, height: ch, rx: 5, fill: c.bgSubtle, stroke: c.border }, lg);
    el('rect', { x: 0, y: 0, width: 4, height: ch, rx: 2, fill: colors[i]! }, lg);
    const lid = el('text', { x: 10, y: 15, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700, fill: c.text }, lg);
    lid.textContent = doc.id;
    const words = el('text', { x: TEXT_DX, y: 15, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted }, lg);
    doc.words.forEach((w, k) => {
      if (k > 0) words.appendChild(document.createTextNode(' '));
      const span = el('tspan', {}, words);
      if (matched && w.hit) {
        span.setAttribute('fill', c.primary);
        span.setAttribute('font-weight', '700');
        span.setAttribute('text-decoration', 'underline');
      }
      span.textContent = w.text;
    });
    const lw = scene.words.scores === null || wMax === 0 ? 0 : r(((scene.words.scores[i] ?? 0) / wMax) * leftBarMax);
    handles.barWidth.words.push(lw);
    const lbar = el('rect', { x: TEXT_DX, y: 23, width: lw, height: 6, rx: 2, fill: colors[i]! }, lg);
    handles.leftBars.push(lbar);
    const ls = el('text', { x: LEFT_W - 8, y: 30, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text }, lg);
    if (scene.words.scores !== null) ls.textContent = (scene.words.scores[i] ?? 0).toFixed(2);
    handles.leftScores.push(ls);
    handles.leftG.push(lg);

    // 오른쪽 상자 — 식별자와 벡터만
    const rg = el('g', { transform: `translate(${RIGHT_X} ${slotY(mOrder.indexOf(i), n)})` }, svg);
    el('rect', { x: 0, y: 0, width: RIGHT_W, height: ch, rx: 5, fill: c.bgSubtle, stroke: c.border }, rg);
    el('rect', { x: 0, y: 0, width: 4, height: ch, rx: 2, fill: colors[i]! }, rg);
    const rid = el('text', { x: 10, y: 15, 'font-family': fonts.mono, 'font-size': fontSizes.sm, 'font-weight': 700, fill: c.text }, rg);
    rid.textContent = doc.id;
    const vec = el('text', { x: RIGHT_W - 8, y: 15, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.xs, fill: c.textMuted }, rg);
    vec.textContent = t('label.vector', '({v})', { v: doc.vector.join(',') });
    const rw = scene.meaning.scores === null || mMax === 0 ? 0 : r(((scene.meaning.scores[i] ?? 0) / mMax) * rightBarMax);
    handles.barWidth.meaning.push(rw);
    const rbar = el('rect', { x: 10, y: 23, width: rw, height: 6, rx: 2, fill: colors[i]! }, rg);
    handles.rightBars.push(rbar);
    const rs = el('text', { x: RIGHT_W - 8, y: 30, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.text }, rg);
    if (scene.meaning.scores !== null) rs.textContent = (scene.meaning.scores[i] ?? 0).toFixed(2);
    handles.rightScores.push(rs);
    handles.rightG.push(rg);
  });

  // 캡션 — 지금 일어나는 일만
  const [c1, c2] = caption(scene, t);
  const t1 = el('text', { x: PAD, y: CAPTION_1, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text }, svg);
  t1.textContent = c1;
  const t2 = el('text', { x: PAD, y: CAPTION_2, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text }, svg);
  t2.textContent = c2;

  return handles;
}

export const sameWordVsSameMeaningStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SameWordVsSameMeaningScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** ms 동안 프레임을 흘린다. 세대가 바뀌거나 거두면 손대지 않고 곧 풀린다. */
    function tween(ms: number, mine: number, frame: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (mine !== gen || destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: SameWordVsSameMeaningScene,
      _prev: SameWordVsSameMeaningScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const h = drawStatic(svg, next, colors, t);
      const step = next.step;
      if (!opts.animate || step === null || next.docs.length === 0) return;
      const n = next.docs.length;

      if (step.kind === 'score') {
        // 막대가 점수만큼 자란다
        const bars = step.side === 'words' ? h.leftBars : h.rightBars;
        const widths = h.barWidth[step.side];
        const labels = step.side === 'words' ? h.leftScores : h.rightScores;
        const frame = (e: number): void => {
          bars.forEach((b, i) => b.setAttribute('width', String(r((widths[i] ?? 0) * e))));
          labels.forEach((l) => l.setAttribute('opacity', String(r(e))));
        };
        frame(0);
        await tween(SCORE_MS, mine, frame);
      } else if (step.kind === 'rank') {
        // 그 줄의 상자들이 앞 자리에서 새 자리로 옮겨 가고, 끈이 따라 기운다
        const side = step.side;
        const groups = side === 'words' ? h.leftG : h.rightG;
        const x = side === 'words' ? LEFT_X : RIGHT_X;
        const wOrder = orderOf(next.words, n);
        const mOrder = orderOf(next.meaning, n);
        const order = side === 'words' ? wOrder : mOrder;
        const frame = (e: number): void => {
          for (let i = 0; i < n; i += 1) {
            const to = slotY(order.indexOf(i), n);
            const from = slotY(step.from.indexOf(i), n);
            const y = r(to + (from - to) * (1 - e));
            groups[i]!.setAttribute('transform', `translate(${x} ${y})`);
            const ly = side === 'words' ? y : slotY(wOrder.indexOf(i), n);
            const ry = side === 'meaning' ? y : slotY(mOrder.indexOf(i), n);
            h.links[i]!.setAttribute('d', linkPath(ly, ry, n));
          }
        };
        frame(0);
        await tween(RANK_MS, mine, frame);
      } else if (step.kind === 'verdict' && next.verdict !== null) {
        // 엇갈린 두 끈만 남기고 나머지는 물러난다
        const v = next.verdict;
        const frame = (e: number): void => {
          h.links.forEach((l, i) => {
            const focus = i === v.rise || i === v.sink;
            if (focus) l.setAttribute('stroke-width', String(r(LINK_W + (LINK_W_FOCUS - LINK_W) * e)));
            else l.setAttribute('opacity', String(r(LINK_OP + (LINK_OP_DIM - LINK_OP) * e)));
          });
        };
        frame(0);
        await tween(VERDICT_MS, mine, frame);
      } else {
        return;
      }

      if (mine !== gen || destroyed) return;
      drawStatic(svg, next, colors, t);
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
