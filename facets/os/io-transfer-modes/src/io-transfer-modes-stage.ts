/**
 * 입출력 방식 stage — 왼쪽은 세 방식의 "잃은 틱" 띠, 오른쪽은 낱말 수 × 장치 빠르기 평면.
 *
 * 운동
 * - 띠: 걸음마다 조각이 띠 끝에서 자라 나온다. 판 시작에는 점선 테(이번 판 끝에 이를 길이)가 앞 판의
 *   길이에서 새 판의 길이로 늘고 준다 — 폴링 테는 두 손잡이를, 인터럽트 테는 낱말 수만 따르고 DMA 테는 서 있다.
 * - 평면: 지금 칸 표시가 앞 판의 칸에서 새 칸으로 건너간다.
 * - 가장 적게 잃은 줄을 가리키는 표시가 판 끝에 앞 판의 줄에서 새 줄로 옮겨 간다.
 *
 * 색은 design-tokens — 세 방식은 categorical(3), 구조는 팔레트. 글꼴 · 크기는 fonts · fontSizes.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 350;

// 띠 자리
const BAR_X = 24;
const BAR_W = 440;
const ROW_Y0 = 64;
const ROW_H = 80;
const BAR_H = 24;

// 평면 자리
const PLANE_X = 588;
const PLANE_Y = 92;
const CELL = 38;

const CAPTION_Y = 316;

export type StageMode = 'polling' | 'interrupt' | 'dma';
export type StageLost = { polling: number; interrupt: number; dma: number };
export type StagePlaneCell = { words: number; deviceTicks: number; lost: StageLost; winners: StageMode[] };

export type StageRound = {
  words: number;
  deviceTicks: number;
  handlerTicks: number;
  setupTicks: number;
  wordLadder: number[];
  tickLadder: number[];
  plane: StagePlaneCell[];
  target: StageLost;
};

/** projector 가 부르는 표면 (C9 — projector 는 이 타입 하나로 좁힌다). */
export type IoTransferModesStage = {
  showRound(round: StageRound, ms: number): Promise<void>;
  addChunks(add: StageLost, lost: StageLost, ms: number): Promise<void>;
  showWinners(winners: StageMode[], ms: number): Promise<void>;
  setCaption(head: string, detail: string): void;
};

const MODES: readonly StageMode[] = ['polling', 'interrupt', 'dma'];

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

const ease = (k: number): number => 1 - (1 - k) * (1 - k);

export const ioTransferModesStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const palette: Palette = getColors(params.theme);
    const modeColor = categorical(3, 'vivid');
    const colorOf = (m: StageMode): string => {
      const c = modeColor[MODES.indexOf(m)];
      if (c === undefined) throw new Error(`색이 없는 방식: ${m}`);
      return c;
    };
    const isInstant = params.isInstant ?? (() => false);
    const svg = params.canvas;
    const root = el('g', { 'font-family': fonts.body }, svg);
    let destroyed = false;

    const text = (x: number, y: number, size: string, fill: string, anchor: 'start' | 'middle' | 'end', parent: Element = root, weight = 'normal'): SVGTextElement =>
      el('text', { x, y, 'font-size': size, fill, 'text-anchor': anchor, 'font-weight': weight }, parent);

    /** 진행률을 스스로 그리는 tween. 창이 가려져 rAF 가 멎어도 시간이 되면 끝낸다. */
    const tween = (ms: number, draw: (k: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
          draw(1);
          resolve();
          return;
        }
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          draw(1);
          resolve();
        };
        const start = performance.now();
        const frame = (now: number): void => {
          if (done) return;
          if (destroyed || isInstant()) return finish();
          const k = Math.min(1, (now - start) / ms);
          if (k >= 1) return finish();
          draw(ease(k));
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        setTimeout(finish, ms + 80);
      });

    // ── 띠 머리
    text(BAR_X, 26, fontSizes.md, palette.text, 'start', root, '600').textContent = t('stage.bars.title', 'Ticks the CPU lost');
    text(BAR_X, 44, fontSizes.xs, palette.textMuted, 'start').textContent = t('stage.bars.target', 'Dashed outline: where this round ends');

    // 척도 — 판이 오기 전엔 1 틱. 판이 오면 평면 전체의 가장 큰 잃은 틱에 맞춘다 (판마다 바뀌지 않는다).
    let pxPerTick = 1;

    type Row = {
      mode: StageMode;
      y: number;
      name: SVGTextElement;
      badge: SVGTextElement;
      value: SVGTextElement;
      rule: SVGTextElement;
      chunks: SVGGElement;
      ghost: SVGRectElement;
      delta: SVGTextElement;
      ghostTicks: number;
      lostTicks: number;
    };
    const rows = new Map<StageMode, Row>();
    MODES.forEach((mode, i) => {
      const y = ROW_Y0 + i * ROW_H;
      const color = colorOf(mode);
      el('rect', { x: BAR_X, y: y + 5, width: 10, height: 10, rx: 2, fill: color }, root);
      const name = text(BAR_X + 16, y + 14, fontSizes.md, palette.text, 'start', root, '600');
      name.textContent =
        mode === 'polling' ? t('label.polling', 'Polling') : mode === 'interrupt' ? t('label.interrupt', 'Interrupt') : t('label.dma', 'DMA');
      const badge = text(BAR_X + 110, y + 14, fontSizes.sm, palette.success, 'start', root, '600');
      const value = text(BAR_X + BAR_W, y + 14, fontSizes.sm, palette.text, 'end');
      el('rect', { x: BAR_X, y: y + 22, width: BAR_W, height: BAR_H, rx: 3, fill: palette.bgSubtle, stroke: palette.border }, root);
      const chunks = el('g', {}, root);
      const ghost = el('rect', {
        x: BAR_X, y: y + 20, width: 0, height: BAR_H + 4, rx: 3,
        fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '4 3',
      }, root);
      const delta = text(BAR_X, y + 22 + BAR_H / 2 + 4, fontSizes.xs, palette.text, 'start', root, '600');
      const rule = text(BAR_X, y + 22 + BAR_H + 16, fontSizes.xs, palette.textMuted, 'start');
      rows.set(mode, { mode, y, name, badge, value, rule, chunks, ghost, delta, ghostTicks: 0, lostTicks: 0 });
    });
    const rowOf = (m: StageMode): Row => {
      const r = rows.get(m);
      if (!r) throw new Error(`줄이 없는 방식: ${m}`);
      return r;
    };
    const showValue = (r: Row, n: number): void => {
      r.value.textContent = t('stage.value.lost', 'Lost ticks: {n}', { n });
    };
    for (const r of rows.values()) showValue(r, 0);

    // 가장 적게 잃은 줄 표시 — 띠 오른쪽의 삼각형. 판 끝에 줄 사이를 옮겨 간다.
    const leastMark = el('path', { d: 'M0,0 L10,-7 L10,7 Z', fill: palette.success, visibility: 'hidden' }, root);
    let leastY: number | null = null;
    const markY = (m: StageMode): number => rowOf(m).y + 22 + BAR_H / 2;
    const placeLeast = (y: number): void => leastMark.setAttribute('transform', `translate(${BAR_X + BAR_W + 6},${y})`);

    // ── 평면
    text(PLANE_X - 50, 26, fontSizes.md, palette.text, 'start', root, '600').textContent = t('stage.plane.title', 'Least-losing mode');
    text(PLANE_X + (CELL * 4) / 2, 50, fontSizes.xs, palette.textMuted, 'middle').textContent = t('stage.plane.ticks', 'Ticks per word');
    text(PLANE_X - 8, 50, fontSizes.xs, palette.textMuted, 'end').textContent = t('stage.plane.words', 'Words');
    const planeLayer = el('g', {}, root);
    const cellMark = el('rect', {
      x: 0, y: 0, width: CELL, height: CELL, rx: 3,
      fill: 'none', stroke: palette.text, 'stroke-width': 3, visibility: 'hidden',
    }, root);
    let cellAt: { x: number; y: number } | null = null;
    let planeKey = '';

    const drawPlane = (round: StageRound): void => {
      const key = `${round.wordLadder.join(',')}|${round.tickLadder.join(',')}`;
      if (key === planeKey) return;
      planeKey = key;
      while (planeLayer.firstChild) planeLayer.removeChild(planeLayer.firstChild);
      round.tickLadder.forEach((d, c) => {
        text(PLANE_X + c * CELL + CELL / 2, PLANE_Y - 8, fontSizes.sm, palette.text, 'middle', planeLayer).textContent = String(d);
      });
      round.wordLadder.forEach((w, r) => {
        text(PLANE_X - 8, PLANE_Y + r * CELL + CELL / 2 + 4, fontSizes.sm, palette.text, 'end', planeLayer).textContent = String(w);
        round.tickLadder.forEach((d, c) => {
          const cell = round.plane.find((p) => p.words === w && p.deviceTicks === d);
          if (!cell || cell.winners.length === 0) throw new Error(`평면 칸이 없다: 낱말 ${w} · 틱 ${d}`);
          const x = PLANE_X + c * CELL;
          const y = PLANE_Y + r * CELL;
          const share = (CELL - 2) / cell.winners.length;
          cell.winners.forEach((m, k) => {
            el('rect', { x: x + 1 + k * share, y: y + 1, width: share, height: CELL - 2, fill: colorOf(m) }, planeLayer);
          });
        });
      });
    };

    const cellPos = (round: StageRound): { x: number; y: number } => {
      const r = round.wordLadder.indexOf(round.words);
      const c = round.tickLadder.indexOf(round.deviceTicks);
      if (r < 0 || c < 0) throw new Error('지금 칸이 평면 밖이다');
      return { x: PLANE_X + c * CELL, y: PLANE_Y + r * CELL };
    };

    // ── 캡션
    const captionHead = text(BAR_X, CAPTION_Y, fontSizes.md, palette.text, 'start', root, '600');
    const captionDetail = text(BAR_X, CAPTION_Y + 20, fontSizes.sm, palette.textMuted, 'start');

    const surface: IoTransferModesStage = {
      async showRound(round, ms) {
        drawPlane(round);
        let most = 0;
        for (const p of round.plane) most = Math.max(most, p.lost.polling, p.lost.interrupt, p.lost.dma);
        if (most <= 0) throw new Error('평면의 잃은 틱이 비었다');
        pxPerTick = BAR_W / most;

        // 앞 판의 조각을 걷고 값과 표시를 새 판의 처음으로
        for (const r of rows.values()) {
          while (r.chunks.firstChild) r.chunks.removeChild(r.chunks.firstChild);
          r.lostTicks = 0;
          r.delta.textContent = '';
          r.badge.textContent = '';
          showValue(r, 0);
        }
        leastMark.setAttribute('opacity', '0.3');
        rowOf('polling').rule.textContent = t('stage.rule.polling', 'Each word: asks for {d} ticks', { d: round.deviceTicks });
        rowOf('interrupt').rule.textContent = t('stage.rule.interrupt', 'Each word: handler {h} ticks', { h: round.handlerTicks });
        rowOf('dma').rule.textContent = t('stage.rule.dma', 'Setup {s} ticks · completion handler {h} ticks', { s: round.setupTicks, h: round.handlerTicks });

        // 점선 테와 평면의 지금 칸이 앞 판에서 새 판으로 옮겨 간다
        const from = new Map<StageMode, number>();
        for (const r of rows.values()) from.set(r.mode, r.ghostTicks);
        const to = round.target;
        const cellFrom = cellAt;
        const cellTo = cellPos(round);
        cellMark.setAttribute('visibility', 'visible');
        await tween(ms, (k) => {
          for (const r of rows.values()) {
            const a = from.get(r.mode) ?? 0;
            const ticks = a + (to[r.mode] - a) * k;
            r.ghost.setAttribute('width', String(Math.max(0, ticks * pxPerTick)));
          }
          const s = cellFrom ?? cellTo;
          cellMark.setAttribute('x', String(s.x + (cellTo.x - s.x) * k));
          cellMark.setAttribute('y', String(s.y + (cellTo.y - s.y) * k));
        });
        for (const r of rows.values()) r.ghostTicks = to[r.mode];
        cellAt = cellTo;
      },

      async addChunks(add, lost, ms) {
        const grow: { r: Row; rect: SVGRectElement; x0: number; w: number }[] = [];
        for (const r of rows.values()) {
          const n = add[r.mode];
          if (n === 0) {
            r.delta.textContent = '';
            continue;
          }
          if (r.lostTicks + n !== lost[r.mode]) throw new Error(`${r.mode} 의 잃은 틱이 맞지 않는다`);
          const x0 = BAR_X + r.lostTicks * pxPerTick;
          const rect = el('rect', {
            x: x0, y: r.y + 22, width: 0, height: BAR_H,
            fill: colorOf(r.mode), stroke: palette.bg, 'stroke-width': 1,
          }, r.chunks);
          r.delta.textContent = `+${n}`;
          grow.push({ r, rect, x0, w: n * pxPerTick });
          r.lostTicks = lost[r.mode];
          showValue(r, lost[r.mode]);
        }
        await tween(ms, (k) => {
          for (const g of grow) {
            g.rect.setAttribute('width', String(g.w * k));
            g.r.delta.setAttribute('x', String(g.x0 + g.w * k + 4));
          }
        });
      },

      async showWinners(winners, ms) {
        if (winners.length === 0) throw new Error('가장 적게 잃은 방식이 비었다');
        for (const r of rows.values()) {
          r.badge.textContent = winners.includes(r.mode) ? t('stage.badge.least', 'least lost') : '';
        }
        const first = winners[0];
        if (first === undefined) throw new Error('가장 적게 잃은 방식이 비었다');
        const yTo = markY(first);
        const yFrom = leastY ?? yTo;
        leastMark.setAttribute('visibility', 'visible');
        leastMark.setAttribute('opacity', '1');
        await tween(ms, (k) => placeLeast(yFrom + (yTo - yFrom) * k));
        leastY = yTo;
      },

      setCaption(head, detail) {
        captionHead.textContent = head;
        captionDetail.textContent = detail;
      },
    };

    return {
      ...surface,
      destroy() {
        destroyed = true;
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  },
};
