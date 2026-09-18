/**
 * KV 캐시 stage — 계단이 납작해지고, 캐시가 한 칸씩 쌓인다.
 *
 * 왼쪽은 걸음마다 새로 셈한 K·V 자리를 한 칸씩 쌓은 기둥이다. 점선 윤곽은 이 판의
 * 계획(걸음마다 셈할 자리 수)이고, 걸음이 지나며 칸이 차오른다. 캐시를 끄면 기둥이
 * 계단처럼 높아지고, 켜면 그 계단이 첫 걸음만 남기고 한 칸 높이로 주저앉는다 —
 * 손잡이를 돌리면 앞 판의 윤곽이 새 판의 윤곽으로 옮겨 간다.
 *
 * 오른쪽은 캐시 더미다. 켬에서는 걸음마다 셈한 칸이 더미로 옮겨 가 위에 쌓이고,
 * 칸에는 그 자리의 낱말이 적힌다. 더미의 윤곽은 이 판 끝의 캐시 크기라, 만들 토큰을
 * 늘리면 위로 자란다. 끔에서는 비어 있다.
 *
 * 칸 하나의 높이는 기둥과 더미가 같다 — 켬에서 기둥 칸을 다 모은 높이와 더미의 높이가
 * 같은 것이 "셈한 것을 버리지 않고 다 들고 있다" 는 뜻이다.
 *
 * 운동의 길이는 projector 가 재생 속도로 셈해 넘긴다.
 */

import {
  PIECE_CANVAS_W,
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

const W = PIECE_CANVAS_W;
const H = 400;

/** 칸 영역의 위 · 아래 */
const TOP = 62;
const BASE = 360;
/** 칸 한 줄의 최대 높이와 칸 사이 틈 */
const MAX_PITCH = 13;
const GAP = 2;
/** 첫 판이 오기 전의 기둥 자리 수 (그리는 것은 없다) */
const DEFAULT_SLOTS = 16;

/** 기둥 영역 */
const PLOT_X0 = 16;
const PLOT_X1 = 452;
const MAX_SLOT_W = 56;
const CELL_RATIO = 0.72;

/** 더미 영역 */
const PILE_X = 484;
const PILE_W = 120;

export type KvBoardView = {
  cache: 0 | 1;
  steps: number;
  plan: number[];
  cacheFinal: number;
  /** 사다리의 가장 큰 판의 걸음 수 · 자리 수 — 알고리즘이 셈해 보낸다 */
  maxSteps: number;
  maxCells: number;
  /** 자리 순서의 낱말 */
  tokens: string[];
};

export type KvStepView = {
  t: number;
  cache: 0 | 1;
  computed: number;
  cachedBefore: number;
  read: number;
  length: number;
};

export type KvFinishView = {
  cache: 0 | 1;
  kv: number;
  cacheSize: number;
  kvWithout: number;
  savedPct: number;
};

/** projector 가 부르는 표면. */
export type KvCacheStage = ViewInstance & {
  startBoard(board: KvBoardView, ms: number): void;
  showStep(step: KvStepView, ms: number): void;
  showFinish(finish: KvFinishView): void;
  clear(): void;
};

type Geo = { x: number; w: number; h: number };

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const clamp01 = (p: number) => (p < 0 ? 0 : p > 1 ? 1 : p);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const r2 = (x: number) => {
  const v = Math.round(x * 100) / 100;
  return v === 0 ? 0 : v;
};

export const kvCacheStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    // 칸 높이 · 기둥 자리 수는 첫 판(`board`)이 알고리즘의 셈을 싣고 올 때 정한다.
    // 사다리의 가장 큰 판 기준이라 판이 바뀌어도 그대로다 — 세로는 캔버스 상수 그대로.
    let words: string[] = [];
    let maxSlots = DEFAULT_SLOTS;
    let pitch = MAX_PITCH;
    let cellH = pitch - GAP;

    // ── 상태 ─────────────────────────────────────────────────────────────
    let board: KvBoardView | null = null;
    /** 기둥 자리마다의 윤곽 (h 는 칸 수, 실수로 흐른다) */
    let ghost: Geo[] = Array.from({ length: maxSlots }, () => ({ x: PLOT_X1, w: 0, h: 0 }));
    /** 더미 윤곽의 칸 수 */
    let pileGhost = 0;
    /** 다 지난 걸음의 셈한 칸 수 (색인 t − 1) */
    let done: number[] = [];
    /** 지금 걸음 */
    let current: KvStepView | null = null;
    /** 지금 걸음의 칸이 차오른 정도 · 더미로 옮겨 간 정도 */
    let rise = 1;
    let fly = 1;
    /** 더미에 자리 잡은 칸 수 */
    let pileCount = 0;
    let caption = '';

    // ── 운동 ─────────────────────────────────────────────────────────────
    let destroyed = false;
    let frameId: number | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let anim: { start: number; dur: number; tick: (p: number) => void; end: () => void } | null = null;

    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    function cancelFrame() {
      if (frameId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
      frameId = null;
      if (timerId !== null) clearTimeout(timerId);
      timerId = null;
    }

    function schedule() {
      if (destroyed) return;
      if (typeof requestAnimationFrame === 'function') {
        frameId = requestAnimationFrame(() => {
          frameId = null;
          frame();
        });
      } else {
        timerId = setTimeout(() => {
          timerId = null;
          frame();
        }, 16);
      }
    }

    function frame() {
      if (!anim || destroyed) return;
      const p = clamp01((now() - anim.start) / anim.dur);
      anim.tick(p);
      if (p >= 1) {
        const a = anim;
        anim = null;
        a.end();
      } else {
        schedule();
      }
      draw();
    }

    /** 걸린 운동을 끝자리로 곧바로 보낸다. */
    function finishAnim() {
      cancelFrame();
      if (!anim) return;
      const a = anim;
      anim = null;
      a.tick(1);
      a.end();
    }

    function run(ms: number, tick: (p: number) => void, end: () => void) {
      finishAnim();
      if (destroyed) return;
      if (!(ms > 16)) {
        tick(1);
        end();
        draw();
        return;
      }
      anim = { start: now(), dur: ms, tick, end };
      tick(0);
      draw();
      schedule();
    }

    // ── 그리기 ───────────────────────────────────────────────────────────
    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function text(x: number, y: number, s: string, attrs: Record<string, string | number> = {}) {
      const node = el('text', {
        x: r2(x),
        y: r2(y),
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
        ...attrs,
      });
      node.textContent = s;
      return node;
    }

    function slotLayout(steps: number, i: number): Geo {
      if (i >= steps) return { x: PLOT_X1, w: 0, h: 0 };
      const slotW = Math.min(MAX_SLOT_W, (PLOT_X1 - PLOT_X0) / steps);
      const w = slotW * CELL_RATIO;
      return { x: PLOT_X0 + i * slotW + (slotW - w) / 2, w, h: 0 };
    }

    const cellY = (k: number) => BASE - (k + 1) * pitch + GAP / 2;

    function draw() {
      if (destroyed) return;
      svg.textContent = '';

      text(PLOT_X0, 24, caption, { 'font-size': fontSizes.md, 'font-weight': 600 });
      text(PLOT_X0, TOP - 12, t('label.perStep', 'K·V computed at each step'), {
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      text(PILE_X, TOP - 12, t('label.cache', 'KV cache'), {
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });

      // 바닥 줄
      el('line', { x1: PLOT_X0, y1: BASE + 1, x2: PLOT_X1, y2: BASE + 1, stroke: colors.border });
      el('line', { x1: PILE_X, y1: BASE + 1, x2: PILE_X + PILE_W, y2: BASE + 1, stroke: colors.border });

      // 기둥의 윤곽과 걸음 번호
      const steps = board ? board.steps : 0;
      for (let i = 0; i < ghost.length; i++) {
        const g = ghost[i];
        if (g.w < 0.5) continue;
        if (g.h > 0.01) {
          el('rect', {
            x: r2(g.x - 1),
            y: r2(BASE - g.h * pitch),
            width: r2(g.w + 2),
            height: r2(g.h * pitch),
            fill: 'none',
            stroke: colors.ghostOutline,
            'stroke-dasharray': '3 3',
            rx: 2,
          });
        }
        if (i < steps) {
          text(g.x + g.w / 2, BASE + 15, String(i + 1), {
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
            'text-anchor': 'middle',
          });
        }
      }
      if (steps > 0) {
        text(PLOT_X0, BASE + 32, t('label.step', 'step'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      }

      // 다 지난 걸음의 칸
      for (let i = 0; i < done.length && i < ghost.length; i++) {
        const g = ghost[i];
        for (let k = 0; k < done[i]; k++) {
          el('rect', {
            x: r2(g.x),
            y: r2(cellY(k)),
            width: r2(g.w),
            height: r2(cellH),
            fill: colors.itemSorted,
            rx: 1.5,
          });
        }
      }

      // 지금 걸음의 칸 — 바닥에서 차오른다
      if (current && current.t - 1 < ghost.length) {
        const g = ghost[current.t - 1];
        const filled = rise * current.computed;
        for (let k = 0; k < current.computed; k++) {
          const part = clamp01(filled - k);
          if (part <= 0) break;
          el('rect', {
            x: r2(g.x),
            y: r2(cellY(k) + cellH * (1 - part)),
            width: r2(g.w),
            height: r2(cellH * part),
            fill: colors.itemActive,
            rx: 1.5,
          });
        }
      }

      // 더미의 윤곽
      if (pileGhost > 0.01) {
        el('rect', {
          x: PILE_X - 1,
          y: r2(BASE - pileGhost * pitch),
          width: PILE_W + 2,
          height: r2(pileGhost * pitch),
          fill: 'none',
          stroke: colors.ghostOutline,
          'stroke-dasharray': '3 3',
          rx: 2,
        });
      }
      if (board && board.cache === 0) {
        text(PILE_X + PILE_W / 2, BASE - 8, t('label.noCache', 'nothing kept'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
          'text-anchor': 'middle',
        });
      }

      // 더미에 자리 잡은 칸 — 그 자리의 낱말을 적는다
      // 낱말은 칸 안에 들어가야 하므로 칸 높이에서 셈한다 — 토큰(fontSizes)에 칸 높이를 따라가는 단계가 없다. 7px 아래는 읽히지 않는다.
      const wordSize = Math.max(7, Math.min(10, cellH - 1));
      for (let k = 0; k < pileCount; k++) {
        el('rect', {
          x: PILE_X,
          y: r2(cellY(k)),
          width: PILE_W,
          height: r2(cellH),
          fill: colors.accent,
          rx: 1.5,
        });
        const word = words[k];
        if (word !== undefined) {
          text(PILE_X + PILE_W / 2, cellY(k) + cellH / 2 + wordSize * 0.36, word, {
            'font-family': fonts.mono,
            'font-size': `${wordSize}px`,
            fill: colors.stateInk,
            'text-anchor': 'middle',
          });
        }
      }
      if (board && board.cache === 1) {
        text(PILE_X + PILE_W, TOP - 12, String(pileCount), {
          'font-size': fontSizes.xs,
          'font-weight': 600,
          fill: colors.text,
          'text-anchor': 'end',
        });
      }

      // 기둥에서 더미로 옮겨 가는 칸
      if (current && current.cache === 1 && rise >= 1 && fly > 0 && fly < 1 && current.t - 1 < ghost.length) {
        const g = ghost[current.t - 1];
        const e = ease(fly);
        for (let k = 0; k < current.computed; k++) {
          el('rect', {
            x: r2(lerp(g.x, PILE_X, e)),
            y: r2(lerp(cellY(k), cellY(current.cachedBefore + k), e)),
            width: r2(lerp(g.w, PILE_W, e)),
            height: r2(cellH),
            fill: colors.accent,
            stroke: colors.itemActive,
            rx: 1.5,
          });
        }
      }
    }

    // ── projector 가 부르는 것 ───────────────────────────────────────────
    function startBoard(next: KvBoardView, ms: number) {
      finishAnim();
      words = next.tokens;
      if (next.maxCells > 0) {
        pitch = Math.min(MAX_PITCH, (BASE - TOP) / next.maxCells);
        cellH = Math.max(1, pitch - GAP);
      }
      if (next.maxSteps > 0 && next.maxSteps !== maxSlots) {
        maxSlots = next.maxSteps;
        ghost = Array.from({ length: maxSlots }, (_, i) => ghost[i] ?? { x: PLOT_X1, w: 0, h: 0 });
      }
      // 앞 판의 칸은 걷고, 윤곽은 새 판의 계획으로 옮겨 간다.
      if (current) done[current.t - 1] = current.computed;
      const fromGhost = ghost.map((g, i) => ({
        ...g,
        h: board ? Math.max(g.h, done[i] ?? 0) : 0,
      }));
      const toGhost = ghost.map((_, i) => {
        const geo = slotLayout(next.steps, i);
        return { ...geo, h: i < next.steps ? next.plan[i] ?? 0 : 0 };
      });
      // 처음 나타나는 자리는 제자리에서 바닥부터 자란다.
      for (let i = 0; i < fromGhost.length; i++) {
        if (fromGhost[i].w < 0.5) fromGhost[i] = { ...toGhost[i], h: 0 };
      }
      const pileFrom = board ? Math.max(pileGhost, pileCount) : 0;
      const pileTo = next.cache === 1 ? next.cacheFinal : 0;

      board = next;
      done = [];
      current = null;
      rise = 1;
      fly = 1;
      pileCount = 0;
      caption = next.cache === 1
        ? t('caption.boardOn', 'With cache · tokens to generate: {steps}', { steps: next.steps })
        : t('caption.boardOff', 'No cache · tokens to generate: {steps}', { steps: next.steps });

      run(
        ms,
        (p) => {
          const e = ease(p);
          ghost = fromGhost.map((f, i) => ({
            x: lerp(f.x, toGhost[i].x, e),
            w: lerp(f.w, toGhost[i].w, e),
            h: lerp(f.h, toGhost[i].h, e),
          }));
          pileGhost = lerp(pileFrom, pileTo, e);
        },
        () => {
          ghost = toGhost;
          pileGhost = pileTo;
        },
      );
    }

    function showStep(step: KvStepView, ms: number) {
      finishAnim();
      if (current) done[current.t - 1] = current.computed;
      current = step;
      pileCount = step.cachedBefore;
      if (step.cache === 1) {
        caption = step.t === 1
          ? t('caption.prefill', 'Step {t} — K·V computed for the whole prompt at once: {n}', {
            t: step.t,
            n: step.computed,
          })
          : t('caption.append', 'Step {t} — K·V computed: {n} · read from the cache: {r}', {
            t: step.t,
            n: step.computed,
            r: step.read,
          });
      } else {
        caption = t('caption.recompute', 'Step {t} — K·V recomputed for every position: {n}', {
          t: step.t,
          n: step.computed,
        });
      }
      const moves = step.cache === 1;
      run(
        ms,
        (p) => {
          if (moves) {
            rise = clamp01(p / 0.45);
            fly = clamp01((p - 0.5) / 0.5);
          } else {
            rise = p;
            fly = 1;
          }
        },
        () => {
          rise = 1;
          fly = 1;
          if (moves) pileCount = step.cachedBefore + step.computed;
        },
      );
    }

    function showFinish(finish: KvFinishView) {
      finishAnim();
      if (current) done[current.t - 1] = current.computed;
      current = null;
      pileCount = finish.cacheSize;
      caption = finish.cache === 1
        ? t('caption.finishOn', 'Done — K·V computed in total: {kv} · without the cache: {without} · saved: {pct}%', {
          kv: finish.kv,
          without: finish.kvWithout,
          pct: finish.savedPct,
        })
        : t('caption.finishOff', 'Done — K·V computed in total: {kv} · cache kept: {cache}', {
          kv: finish.kv,
          cache: finish.cacheSize,
        });
      draw();
    }

    function clear() {
      finishAnim();
      board = null;
      ghost = Array.from({ length: maxSlots }, () => ({ x: PLOT_X1, w: 0, h: 0 }));
      pileGhost = 0;
      done = [];
      current = null;
      rise = 1;
      fly = 1;
      pileCount = 0;
      caption = '';
      draw();
    }

    draw();

    const instance: KvCacheStage = {
      startBoard,
      showStep,
      showFinish,
      clear,
      destroy() {
        destroyed = true;
        anim = null;
        cancelFrame();
        svg.textContent = '';
      },
    };
    return instance;
  },
};
