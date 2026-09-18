/**
 * misprediction-penalty-stage — 틀린 짐작이 버린 박자를 더미로 쌓는다.
 *
 * 왼쪽: 결과 열(짐작 줄 · 결과 줄)과 두 파이프라인. 파이프라인은 판정 단계까지의
 *       칸만 그린다 — 얕은 것은 3 칸, 깊은 것은 10 칸. 길이가 곧 판정의 늦음이다.
 * 오른쪽: 파이프라인별 버린 박자 더미.
 *
 * 걸음(분기 하나)의 운동:
 *   가. 분기와 그 뒤로 가져온 것들이 한 줄로 왼쪽에서 밀려 들어와 분기가 판정 칸에 선다
 *   나. 틀렸으면 분기 뒤의 칸들이 칸에서 빠져나와 더미 위로 날아가 쌓인다
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
  type SceneRenderer,
} from '@ffacet/core/runtime';
import type { Outcome, PipeId } from './algorithm.js';
import type { MispredictionScene } from './scene.js';

const H = 370;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 16;
/** 왼쪽(결과 열 · 파이프라인)과 오른쪽(더미)의 경계 */
const LEFT_END = 420;
const PILE_START = 440;

const CAPTION_Y = [18, 36];
const STRIP_LABEL_W = 72;
const GUESS_Y = 50;
const ACTUAL_Y = 76;
const ROW_H = 22;
const PIPE_LABEL_Y = [134, 226];
const SLOT_TOP = [142, 234];
const SLOT_H = 36;
const SLOT_GAP = 4;
const SLOT_W_MAX = 44;
const PILE_TOP = 56;
const PILE_BASE = 310;
const PILE_COL_W = 58;
const CHUNK_GAP = 6;
const BLOCK_PITCH_MAX = 16;

const SLIDE_MS = 450;
const FLY_MS = 900;
const FLY_ONE_MS = 500;

type Rect = { x: number; y: number; w: number; h: number };

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

type PipeHandles = {
  /** 분기 칸 · (맞았으면) 뒤따른 칸 — 한 줄로 밀려 들어온다 */
  train: SVGElement[];
  /** 틀렸을 때 비워진 칸의 자리 (왼쪽부터) */
  trailSlots: Rect[];
  layer: SVGGElement;
  /** 이번에 버린 덩어리의 칸들 (아래부터)과 그 끝자리 */
  flying: { el: SVGRectElement; to: Rect }[];
  flyingLabel: SVGTextElement | null;
  shift: number;
  hit: boolean;
};

export const mispredictionPenaltyStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<MispredictionScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles: PipeHandles[] = [];

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        e.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      }
      parent.appendChild(e);
      return e;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      str: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: number; mono?: boolean } = {},
    ): SVGTextElement {
      const e = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      e.textContent = str;
      return e;
    }

    function outcomeName(o: Outcome): string {
      return o === 'T' ? t('label.T', 'T') : t('label.N', 'N');
    }

    function pipeTitle(id: PipeId, k: number): string {
      return id === 'deep'
        ? t('label.deep', 'Deep pipeline: verdict at stage {k}', { k })
        : t('label.shallow', 'Shallow pipeline: verdict at stage {k}', { k });
    }

    function pipeShort(id: PipeId): string {
      return id === 'deep' ? t('label.deepShort', 'Deep') : t('label.shallowShort', 'Shallow');
    }

    function slotGeom(maxK: number): { w: number; pitch: number } {
      const avail = LEFT_END - MARGIN;
      const w = Math.min(SLOT_W_MAX, (avail - SLOT_GAP * (maxK - 1)) / Math.max(1, maxK));
      return { w, pitch: w + SLOT_GAP };
    }

    function slotRect(row: number, j: number, geom: { w: number; pitch: number }): Rect {
      return { x: MARGIN + j * geom.pitch, y: SLOT_TOP[row] ?? SLOT_TOP[0], w: geom.w, h: SLOT_H };
    }

    function pileColX(i: number, n: number): number {
      const span = W - MARGIN - PILE_START;
      const step = span / Math.max(1, n);
      return PILE_START + step * i + (step - PILE_COL_W) / 2;
    }

    function blockPitch(s: MispredictionScene): number {
      const room = s.base?.room ?? { blocks: 0, chunks: 0 };
      const avail = PILE_BASE - PILE_TOP - CHUNK_GAP * Math.max(0, room.chunks - 1);
      if (room.blocks <= 0) return BLOCK_PITCH_MAX;
      return Math.min(BLOCK_PITCH_MAX, avail / room.blocks);
    }

    function captionLines(s: MispredictionScene): [string, string] {
      const base = s.base;
      if (!base) return ['', ''];
      const guess = outcomeName(base.guess);
      const step = s.step;
      if (step.kind === 'init') {
        return [
          t('caption.init', '{n} branches, one fetched per cycle.', { n: base.outcomes.length }),
          t('caption.rule', 'The guess is always {guess}.', { guess }),
        ];
      }
      if (step.kind === 'branch') {
        const head = t('caption.branch', 'Branch {n}: guessed {guess}, it was {actual}.', {
          n: step.index + 1,
          guess,
          actual: outcomeName(step.actual),
        });
        if (step.hit) return [head, t('caption.hit', 'Right: nothing is thrown away.')];
        const idx = (id: PipeId): number => base.pipes.findIndex((p) => p.id === id);
        return [
          head,
          t('caption.miss', 'Wrong: the shallow pipeline throws away {a} cycles, the deep one {b}.', {
            a: step.penalty[idx('shallow')] ?? 0,
            b: step.penalty[idx('deep')] ?? 0,
          }),
        ];
      }
      if (step.kind === 'done') {
        const idx = (id: PipeId): number => base.pipes.findIndex((p) => p.id === id);
        return [
          t('caption.done', 'All {n} branches through; {m} guesses were wrong.', {
            n: base.outcomes.length,
            m: step.misses,
          }),
          t('caption.total', 'Shallow took {a} cycles, deep took {b}.', {
            a: s.cycles[idx('shallow')] ?? 0,
            b: s.cycles[idx('deep')] ?? 0,
          }),
        ];
      }
      return ['', ''];
    }

    function drawStatic(s: MispredictionScene): void {
      svg.textContent = '';
      handles = [];
      el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
      const base = s.base;
      if (!base) return;

      const [line1, line2] = captionLines(s);
      label(svg, MARGIN, CAPTION_Y[0], line1, { size: fontSizes.sm });
      label(svg, MARGIN, CAPTION_Y[1], line2, {
        size: fontSizes.sm,
        weight: 600,
        fill: s.step.kind === 'branch' && !s.step.hit ? c.danger : c.text,
      });

      // ── 결과 열: 짐작 줄과 결과 줄
      const n = base.outcomes.length;
      const stripX = MARGIN + STRIP_LABEL_W;
      const pitch = (LEFT_END - stripX) / Math.max(1, n);
      const cw = Math.min(pitch - 3, 30);
      label(svg, MARGIN, GUESS_Y + 15, t('label.guess', 'guess'), {
        size: fontSizes.xs,
        fill: c.textMuted,
      });
      label(svg, MARGIN, ACTUAL_Y + 15, t('label.actual', 'actual'), {
        size: fontSizes.xs,
        fill: c.textMuted,
      });
      const current = s.step.kind === 'branch' ? s.step.index : -1;
      for (let i = 0; i < n; i += 1) {
        const x = stripX + i * pitch;
        const cx = x + cw / 2;
        const done = i < s.results.length;
        const miss = done && !s.results[i];
        el(
          'rect',
          { x, y: GUESS_Y, width: cw, height: ROW_H, rx: 3, fill: c.bgSubtle, stroke: 'none' },
          svg,
        );
        label(svg, cx, GUESS_Y + 15, outcomeName(base.guess), {
          anchor: 'middle',
          fill: c.textMuted,
          mono: true,
        });
        el(
          'rect',
          {
            x,
            y: ACTUAL_Y,
            width: cw,
            height: ROW_H,
            rx: 3,
            fill: done ? c.bg : 'none',
            stroke: miss ? c.danger : c.border,
            'stroke-width': miss ? 2 : 1,
            'stroke-dasharray': done ? 'none' : '3 3',
          },
          svg,
        );
        if (done) {
          label(svg, cx, ACTUAL_Y + 15, outcomeName(base.outcomes[i] ?? 'T'), {
            anchor: 'middle',
            fill: miss ? c.danger : c.text,
            weight: miss ? 700 : 400,
            mono: true,
          });
        }
        if (i === current) {
          el(
            'rect',
            {
              x: x - 2,
              y: GUESS_Y - 3,
              width: cw + 4,
              height: ACTUAL_Y + ROW_H - GUESS_Y + 6,
              rx: 4,
              fill: 'none',
              stroke: c.accent,
              'stroke-width': 2,
            },
            svg,
          );
        }
      }

      // ── 파이프라인
      const maxK = Math.max(1, ...base.pipes.map((p) => p.verdict));
      const geom = slotGeom(maxK);
      const last = s.results.length - 1;
      const pb = blockPitch(s);
      const flyingNow = s.step.kind === 'branch' && !s.step.hit;
      const pileLayer = el('g', {}, svg);

      base.pipes.forEach((pipe, row) => {
        const k = Math.max(1, pipe.verdict);
        const layer = el('g', {}, svg);
        label(layer, MARGIN, PIPE_LABEL_Y[row] ?? PIPE_LABEL_Y[0], pipeTitle(pipe.id, k), {
          size: fontSizes.sm,
          fill: c.text,
        });
        for (let j = 0; j < k; j += 1) {
          const r = slotRect(row, j, geom);
          const isVerdict = j === k - 1;
          el(
            'rect',
            {
              x: r.x,
              y: r.y,
              width: r.w,
              height: r.h,
              rx: 4,
              fill: c.bg,
              stroke: isVerdict ? c.primary : c.border,
              'stroke-width': isVerdict ? 2 : 1,
            },
            layer,
          );
          label(layer, r.x + r.w / 2, r.y + r.h + 13, String(j + 1), {
            size: fontSizes.xs,
            anchor: 'middle',
            fill: isVerdict ? c.primary : c.textMuted,
            weight: isVerdict ? 700 : 400,
            mono: true,
          });
        }

        const h: PipeHandles = {
          train: [],
          trailSlots: [],
          layer,
          flying: [],
          flyingLabel: null,
          shift: k * geom.pitch,
          hit: true,
        };

        if (last >= 0) {
          const hit = s.results[last] === true;
          h.hit = hit;
          for (let j = 0; j < k - 1; j += 1) {
            const r = slotRect(row, j, geom);
            if (hit) {
              h.train.push(
                el(
                  'rect',
                  {
                    x: r.x + 3,
                    y: r.y + 3,
                    width: r.w - 6,
                    height: r.h - 6,
                    rx: 3,
                    fill: c.itemDefault,
                  },
                  layer,
                ),
              );
            } else {
              h.trailSlots.push(r);
              el(
                'rect',
                {
                  x: r.x + 3,
                  y: r.y + 3,
                  width: r.w - 6,
                  height: r.h - 6,
                  rx: 3,
                  fill: 'none',
                  stroke: c.danger,
                  'stroke-dasharray': '3 3',
                },
                layer,
              );
            }
          }
          const vr = slotRect(row, k - 1, geom);
          const token = el('g', {}, layer);
          el(
            'rect',
            {
              x: vr.x + 2,
              y: vr.y + 2,
              width: vr.w - 4,
              height: vr.h - 4,
              rx: 3,
              fill: hit ? c.primary : c.danger,
            },
            token,
          );
          label(token, vr.x + vr.w / 2, vr.y + vr.h / 2 + 4, t('label.branch', '#{n}', { n: last + 1 }), {
            size: fontSizes.xs,
            anchor: 'middle',
            fill: c.textInverse,
            weight: 700,
            mono: true,
          });
          h.train.push(token);
        }

        // ── 더미
        const colX = pileColX(row, base.pipes.length);
        el(
          'line',
          {
            x1: colX - 6,
            y1: PILE_BASE,
            x2: colX + PILE_COL_W + 6,
            y2: PILE_BASE,
            stroke: c.border,
            'stroke-width': 2,
          },
          pileLayer,
        );
        const chunks = s.chunks[row] ?? [];
        let y = PILE_BASE;
        chunks.forEach((size, ci) => {
          if (size <= 0) return;
          const newest = flyingNow && ci === chunks.length - 1;
          const bottom = y;
          for (let b = 0; b < size; b += 1) {
            const to: Rect = { x: colX, y: y - pb + 1, w: PILE_COL_W, h: pb - 2 };
            const block = el(
              'rect',
              { x: to.x, y: to.y, width: to.w, height: to.h, rx: 2, fill: c.danger },
              pileLayer,
            );
            if (newest) h.flying.push({ el: block, to });
            y -= pb;
          }
          const chunkLabel = label(
            pileLayer,
            colX + PILE_COL_W / 2,
            r2((bottom + y) / 2 + 4),
            t('label.chunk', '+{n}', { n: size }),
            { size: fontSizes.xs, anchor: 'middle', fill: c.textInverse, weight: 700, mono: true },
          );
          if (newest) h.flyingLabel = chunkLabel;
          y -= CHUNK_GAP;
        });
        const cx = colX + PILE_COL_W / 2;
        const doneStep = s.step.kind === 'done';
        label(pileLayer, cx, PILE_BASE + 18, pipeShort(pipe.id), {
          size: fontSizes.sm,
          anchor: 'middle',
          weight: 600,
        });
        label(pileLayer, cx, PILE_BASE + 34, t('label.wasted', 'wasted {n}', { n: s.wasted[row] ?? 0 }), {
          size: fontSizes.xs,
          anchor: 'middle',
          fill: c.danger,
        });
        label(pileLayer, cx, PILE_BASE + 50, t('label.cycles', '{n} cycles', { n: s.cycles[row] ?? 0 }), {
          size: fontSizes.xs,
          anchor: 'middle',
          fill: doneStep ? c.text : c.textMuted,
          weight: doneStep ? 700 : 400,
        });
        handles.push(h);
      });
      // 날아가는 칸이 파이프라인 위를 지나도록 더미 층을 맨 위로
      svg.appendChild(pileLayer);
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = Date.now();
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const finish = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          if (timer !== null) {
            clearTimeout(timer);
            timers.delete(timer);
          }
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (timer !== null) timers.delete(timer);
          timer = null;
          if (destroyed || mine !== gen) return finish(false);
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return finish(true);
          timer = setTimeout(tick, 16);
          timers.add(timer);
        };
        timer = setTimeout(tick, 16);
        timers.add(timer);
      });
    }

    async function animateBranch(mine: number): Promise<void> {
      const hs = handles;
      // 날아올 칸과 그 덩어리 표시는 아직 더미에 없다
      for (const h of hs) {
        for (const f of h.flying) f.el.setAttribute('visibility', 'hidden');
        h.flyingLabel?.setAttribute('visibility', 'hidden');
      }
      // 틀린 쪽은 분기 뒤로 가져온 칸들이 아직 파이프라인 안에 있다
      const temps: SVGRectElement[][] = hs.map((h) =>
        h.trailSlots.map((r) =>
          el(
            'rect',
            { x: r.x + 3, y: r.y + 3, width: r.w - 6, height: r.h - 6, rx: 3, fill: c.itemDefault },
            h.layer,
          ),
        ),
      );
      const moving = hs.map((h, i) => [...h.train, ...(temps[i] ?? [])]);

      // 가. 한 줄로 밀려 들어와 분기가 판정 칸에 선다
      const slid = await tween(SLIDE_MS, mine, (p) => {
        hs.forEach((h, i) => {
          const dx = r2(-h.shift * (1 - ease(p)));
          for (const e of moving[i] ?? []) e.setAttribute('transform', `translate(${dx} 0)`);
        });
      });
      if (!slid || mine !== gen || destroyed) return;

      const flying = hs.some((h) => h.flying.length > 0);
      if (!flying) return;

      // 나. 버린 칸이 칸에서 빠져나와 더미 위로 날아가 쌓인다
      for (const list of temps) for (const e of list) e.remove();
      const plans = hs.map((h) => {
        const count = h.flying.length;
        const stagger = count > 1 ? (FLY_MS - FLY_ONE_MS) / (count - 1) : 0;
        return h.flying.map((f, b) => {
          // 아래 칸부터 판정 칸에 가까운 것이 먼저 떨어진다
          const from = h.trailSlots[h.trailSlots.length - 1 - b] ?? f.to;
          const src: Rect = { x: from.x + 3, y: from.y + 3, w: from.w - 6, h: from.h - 6 };
          return { f, src, delay: b * stagger };
        });
      });
      const place = (e: SVGRectElement, a: Rect, b: Rect, q: number): void => {
        e.setAttribute('x', String(r2(a.x + (b.x - a.x) * q)));
        e.setAttribute('y', String(r2(a.y + (b.y - a.y) * q)));
        e.setAttribute('width', String(r2(a.w + (b.w - a.w) * q)));
        e.setAttribute('height', String(r2(a.h + (b.h - a.h) * q)));
      };
      for (const plan of plans) {
        for (const { f, src } of plan) {
          place(f.el, src, f.to, 0);
          f.el.removeAttribute('visibility');
        }
      }
      await tween(FLY_MS, mine, (p) => {
        const ms = p * FLY_MS;
        for (const plan of plans) {
          for (const { f, src, delay } of plan) {
            const q = Math.max(0, Math.min(1, (ms - delay) / FLY_ONE_MS));
            place(f.el, src, f.to, ease(q));
          }
        }
      });
    }

    drawStatic({ base: null, results: [], chunks: [], wasted: [], cycles: [], step: { kind: 'none' } });

    return {
      async render(
        next: MispredictionScene,
        _prev: MispredictionScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        for (const wake of [...waiters]) wake();
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step.kind !== 'branch' || !next.base) return;
        await animateBranch(mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
