/**
 * batchnorm 무대 — 원래 값 줄과 맞춘 자리 줄.
 *
 * 위 줄: 값 열여섯이 수직선 위에 선다. 지켜보는 값은 늘 강조되고, 묶음 모음 걸음마다 그 값의 묶음 동료가 켜지며
 *        묶음 평균 μ 표지가 앞 섞음의 자리에서 새 자리로 미끄러진다. 폭 맞춤 걸음에는 σ 괄호가 μ 에서 양쪽으로 벌어진다.
 * 아래 줄: 지켜보는 값이 위 줄에서 **떨어져** 맞춘 자리에 점 하나를 남긴다. 점은 판 안에서 쌓이고, 전체로 맞춘 자리의
 *        점선은 늘 있다.
 * 맨 아래: 섞음 여덟 칸에 떨어진 자리 글자, 끝에 평균 차.
 *
 * 무대는 셈하지 않는다 — 자리 · μ · σ · 평균 차 글자는 projector 가 payload 에서 넘긴다. 무대가 하는 일은 좌표 배치와
 * 겹친 점을 위로 쌓는 것(그림 배치)뿐이다.
 *
 * 운동은 rAF 로 그리며 길이는 projector 가 넘긴 ms(재생 속도를 그때그때 반영한 값)를 따른다. 판 머리 · reset ·
 * 되짚기 시작에서 도는 프레임을 끊는다. 되짚는 중(isInstant)에는 끝 모습으로 바로 건너뛴다.
 */
import { fontSizes, fonts, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 460;

// 위 줄 (원래 값)
const TOP_Y = 104;
const TOP_X0 = 60;
const TOP_X1 = 690;
const TOP_MIN = 0;
const TOP_MAX = 9;
// 아래 줄 (맞춘 자리)
const BOT_Y = 340;
const BOT_X0 = 60;
const BOT_X1 = 690;
const BOT_MIN = -2;
const BOT_MAX = 2;
const DOT_R = 6;
const STACK_GAP = 13;
// 섞음 칸 · 평균 차
const CELL_Y = 396;
const DIFF_Y = 444;

export type BatchnormStageInit = { xs: number[]; track: number; wholeSpot: number; wholeSpotText: string; shuffleCount: number };
export type BatchnormStageApi = {
  init(v: BatchnormStageInit): void;
  board(v: { caption: string }): void;
  gather(v: { shuffle: number; peers: number[]; mu: number; caption: string; ms: number }): void;
  scale(v: {
    shuffle: number;
    mu: number;
    sigma: number;
    spot: number;
    spotText: string;
    caption: string;
    meanDiffText: string | null;
    ms: number;
  }): void;
  reset(): void;
};

const topX = (v: number): number => TOP_X0 + ((v - TOP_MIN) / (TOP_MAX - TOP_MIN)) * (TOP_X1 - TOP_X0);
const botX = (z: number): number => BOT_X0 + ((z - BOT_MIN) / (BOT_MAX - BOT_MIN)) * (BOT_X1 - BOT_X0);
const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

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

export const batchnormStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const p = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);

    const frames = new Set<number>();
    let destroyed = false;
    const stopFrames = (): void => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
    };
    params.onScrubStart?.(() => stopFrames());

    /** ms 동안 draw(0‥1) 를 부른다. 되짚는 중이거나 길이가 없으면 끝 모습만. */
    const animate = (ms: number, draw: (u: number) => void): void => {
      if (destroyed || isInstant() || !(ms > 0) || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return;
      }
      draw(0);
      const t0 = performance.now();
      const tick = (now: number): void => {
        if (destroyed) return;
        const u = Math.min(1, (now - t0) / ms);
        draw(ease(u));
        if (u < 1) {
          const id = requestAnimationFrame(tick);
          frames.add(id);
        }
      };
      const id = requestAnimationFrame(tick);
      frames.add(id);
    };

    // ── 층
    let root = el('g', {}, svg);
    let caption = el('text', {}, root);
    let valueDots: SVGCircleElement[] = [];
    let muMark: SVGGElement | null = null;
    let sigmaBracket: SVGGElement | null = null;
    let dotLayer = el('g', {}, root);
    let cellTexts: SVGTextElement[] = [];
    let diffText = el('text', {}, root);
    let data: BatchnormStageInit | null = null;
    /** 판 안에 떨어진 점 — 겹치면 위로 쌓는 그림 배치용 */
    let placed: { x: number; level: number }[] = [];
    /** μ 표지의 지금 자리 (다음 섞음에서 여기서 미끄러진다) */
    let muNow: number | null = null;

    const textAttrs = (size: string, fill: string, anchor = 'middle'): Record<string, string | number> => ({
      'font-family': fonts.body,
      'font-size': size,
      fill,
      'text-anchor': anchor,
    });

    const setCaption = (s: string): void => {
      caption.textContent = s;
    };

    const clearBoard = (): void => {
      stopFrames();
      dotLayer.textContent = '';
      placed = [];
      muNow = null;
      muMark?.setAttribute('visibility', 'hidden');
      sigmaBracket?.setAttribute('visibility', 'hidden');
      for (const c of cellTexts) c.textContent = '';
      diffText.textContent = '';
      caption.textContent = '';
      if (data) paintValues(null);
    };

    const paintValues = (peers: readonly number[] | null): void => {
      if (!data) return;
      const peerSet = new Set(peers ?? []);
      valueDots.forEach((dot, i) => {
        const isTrack = i === data?.track;
        const isPeer = peerSet.has(i);
        dot.setAttribute('r', String(isTrack || isPeer ? 7 : 4.5));
        dot.setAttribute('fill', isTrack ? p.accent : isPeer ? p.itemComparing : p.itemDefault);
        dot.setAttribute('stroke', isTrack || isPeer ? p.text : p.border);
        dot.setAttribute('opacity', peers !== null && !isTrack && !isPeer ? '0.35' : '1');
      });
    };

    const build = (): void => {
      stopFrames();
      svg.textContent = '';
      root = el('g', {}, svg);
      caption = el('text', { x: 16, y: 24, ...textAttrs(fontSizes.md, p.text, 'start') }, root);
      valueDots = [];
      cellTexts = [];
      placed = [];
      muNow = null;

      // 위 줄
      el('text', { x: 16, y: 56, ...textAttrs(fontSizes.sm, p.textMuted, 'start') }, root).textContent = t(
        'label.values',
        'Original values',
      );
      el('line', { x1: TOP_X0, y1: TOP_Y, x2: TOP_X1, y2: TOP_Y, stroke: p.border, 'stroke-width': 1.5 }, root);
      // 아래 줄
      el('text', { x: 16, y: 200, ...textAttrs(fontSizes.sm, p.textMuted, 'start') }, root).textContent = t(
        'label.scaled',
        'Scaled positions',
      );
      el('line', { x1: BOT_X0, y1: BOT_Y, x2: BOT_X1, y2: BOT_Y, stroke: p.border, 'stroke-width': 1.5 }, root);
      for (let z = BOT_MIN; z <= BOT_MAX; z += 1) {
        el('line', { x1: botX(z), y1: BOT_Y, x2: botX(z), y2: BOT_Y + 5, stroke: p.border }, root);
        el('text', { x: botX(z), y: BOT_Y + 20, ...textAttrs(fontSizes.xs, p.textMuted) }, root).textContent =
          String(z);
      }

      // μ 표지 · σ 괄호 (처음엔 숨김)
      muMark = el('g', { visibility: 'hidden' }, root);
      // 값 글자 줄을 가르지 않게 두 토막으로 (축 곁 · 괄호 곁)
      el('line', { x1: 0, y1: TOP_Y - 12, x2: 0, y2: TOP_Y + 10, stroke: p.text, 'stroke-width': 2 }, muMark);
      el('line', { x1: 0, y1: TOP_Y + 28, x2: 0, y2: TOP_Y + 44, stroke: p.text, 'stroke-width': 2 }, muMark);
      el('text', { x: 0, y: TOP_Y + 58, ...textAttrs(fontSizes.sm, p.text) }, muMark).textContent = t('label.mu', 'μ');
      sigmaBracket = el('g', { visibility: 'hidden' }, root);
      el('path', { d: '', fill: 'none', stroke: p.itemComparing, 'stroke-width': 2 }, sigmaBracket);
      el('text', { x: 0, y: TOP_Y + 58, ...textAttrs(fontSizes.sm, p.itemComparing, 'start') }, sigmaBracket).textContent =
        t('label.sigma', 'σ');

      dotLayer = el('g', {}, root);
      diffText = el('text', { x: W / 2, y: DIFF_Y, ...textAttrs(fontSizes.md, p.text) }, root);

      if (!data) return;
      const d = data;
      // 전체로 맞춘 자리 점선
      const wx = botX(d.wholeSpot);
      el('line', { x1: wx, y1: 218, x2: wx, y2: BOT_Y + 4, stroke: p.textMuted, 'stroke-dasharray': '5 4', 'stroke-width': 1.5 }, root);
      el('text', { x: wx, y: 212, ...textAttrs(fontSizes.xs, p.textMuted) }, root).textContent = t(
        'label.whole',
        'Whole-set position {w}',
        { w: d.wholeSpotText },
      );

      // 값 열여섯 — 크기 차례로 위 · 아래 번갈아 글자를 둔다 (가까운 값끼리 겹치지 않게)
      const rank = d.xs.map((_, i) => i).sort((a, b) => (d.xs[a] as number) - (d.xs[b] as number));
      const labelRow = new Map<number, number>();
      rank.forEach((i, r) => labelRow.set(i, r % 2));
      d.xs.forEach((x, i) => {
        const cx = topX(x);
        const row = labelRow.get(i);
        el(
          'text',
          {
            x: cx,
            y: row === 0 ? TOP_Y - 12 : TOP_Y + 22,
            ...textAttrs(fontSizes.xs, i === d.track ? p.text : p.textMuted),
            'font-weight': i === d.track ? 700 : 400,
          },
          root,
        ).textContent = x.toFixed(1);
        valueDots.push(el('circle', { cx, cy: TOP_Y, r: 4.5 }, root));
      });
      // 지켜보는 값은 맨 위에
      const trackDot = valueDots[d.track];
      if (trackDot) root.appendChild(trackDot);
      paintValues(null);

      // 섞음 칸
      const cellW = (W - 32) / d.shuffleCount;
      for (let s = 0; s < d.shuffleCount; s += 1) {
        const cx = 16 + cellW * (s + 0.5);
        el('rect', { x: 16 + cellW * s + 2, y: CELL_Y - 16, width: cellW - 4, height: 40, rx: 4, fill: p.bgSubtle, stroke: p.border }, root);
        el('text', { x: cx, y: CELL_Y - 2, ...textAttrs(fontSizes.xs, p.textMuted) }, root).textContent = t(
          'label.shuffle',
          'Shuffle {s}',
          { s: s + 1 },
        );
        cellTexts.push(el('text', { x: cx, y: CELL_Y + 16, ...textAttrs(fontSizes.sm, p.text), 'font-family': fonts.mono }, root));
      }
      root.appendChild(dotLayer);
      root.appendChild(diffText);
    };

    const placeMu = (mu: number, ms: number): void => {
      if (!muMark) return;
      muMark.setAttribute('visibility', 'visible');
      const from = muNow ?? mu;
      muNow = mu;
      animate(ms, (u) => {
        muMark?.setAttribute('transform', `translate(${topX(from + (mu - from) * u)},0)`);
      });
    };

    const drawBracket = (mu: number, sigma: number, ms: number): void => {
      if (!sigmaBracket) return;
      const path = sigmaBracket.querySelector('path');
      const label = sigmaBracket.querySelector('text');
      if (!path || !label) return;
      sigmaBracket.setAttribute('visibility', 'visible');
      const y = TOP_Y + 34;
      const cx = topX(mu);
      const half = topX(mu + sigma) - cx;
      animate(ms, (u) => {
        const h = half * u;
        path.setAttribute('d', `M${cx - h},${y - 6} V${y} H${cx + h} V${y - 6}`);
        label.setAttribute('x', String(cx + h + 4));
      });
    };

    const dropDot = (spot: number, ms: number): void => {
      if (!data) throw new Error('batchnorm-stage: init 전에 점을 떨어뜨렸다');
      const x = botX(spot);
      let level = 0;
      while (placed.some((q) => q.level === level && Math.abs(q.x - x) < DOT_R * 2)) level += 1;
      const cy = BOT_Y - DOT_R - 2 - level * STACK_GAP;
      placed.push({ x, level });
      const sx = topX(data.xs[data.track] as number);
      const dot = el('circle', { cx: sx, cy: TOP_Y, r: DOT_R, fill: p.primary, stroke: p.bg, 'stroke-width': 1 }, dotLayer);
      animate(ms, (u) => {
        dot.setAttribute('cx', String(sx + (x - sx) * u));
        // 떨어지는 결: 세로는 가속
        dot.setAttribute('cy', String(TOP_Y + (cy - TOP_Y) * u * u));
      });
    };

    const api: BatchnormStageApi & ViewInstance = {
      init(v) {
        data = { ...v, xs: [...v.xs] };
        build();
      },
      board(v) {
        clearBoard();
        setCaption(v.caption);
      },
      gather(v) {
        if (!data) throw new Error('batchnorm-stage: init 전에 gather 가 왔다');
        setCaption(v.caption);
        paintValues(v.peers);
        sigmaBracket?.setAttribute('visibility', 'hidden');
        placeMu(v.mu, v.ms);
      },
      scale(v) {
        if (!data) throw new Error('batchnorm-stage: init 전에 scale 이 왔다');
        setCaption(v.caption);
        drawBracket(v.mu, v.sigma, v.ms);
        dropDot(v.spot, v.ms);
        const cell = cellTexts[v.shuffle - 1];
        if (!cell) throw new Error(`batchnorm-stage: 섞음 ${v.shuffle} 칸이 없다`);
        cell.textContent = v.spotText;
        if (v.meanDiffText !== null) {
          diffText.textContent = t('label.meanDiff', 'Mean gap from the whole-set position: {d}', { d: v.meanDiffText });
        }
      },
      reset() {
        clearBoard();
      },
      destroy() {
        destroyed = true;
        stopFrames();
        svg.textContent = '';
      },
    };
    build();
    return api;
  },
};
