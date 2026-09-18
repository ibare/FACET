/**
 * 지난 몇 번이 다음을 가리킨다 — stage.
 *
 * 동사는 "찾아 들어간다". 결과 열 위를 이력 창(지난 두 결과)이 미끄러지고, 걸음마다
 * 그 창의 복제본이 아래 표로 내려가 같은 이름의 칸에 내려앉는다. 짐작은 그 칸에서
 * 올라와 결과 열 위에 놓이고, 드러난 결과는 다시 그 칸으로 내려가 적힌다. 끝으로
 * 창이 한 칸 옆으로 간다.
 *
 * 화면 전체는 장면에서 매번 새로 세운다 (drawStatic). 운동은 그 위에 얹은 복제본과
 * "아직 못 온 만큼" 의 어긋남으로만 그리고, 끝나면 drawStatic 을 한 번 더 부른다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { Bit } from './algorithm.js';
import type { PatternFromHistoryScene } from './scene.js';

const H = 346;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 14;
/** 왼쪽 줄 이름(짐작 · 실제) 자리 */
const LABEL_W = 58;
/** 결과 열 칸 간격과 크기의 상한 — 실제 값은 캔버스 폭에서 역산한다 */
const PITCH_MAX = 46;
const CELL_MAX = 30;

const LEGEND_Y = 16;
const GLYPH_Y = 29;
const GUESS_TOP = 38;
const GUESS_H = 22;
const TAPE_TOP = 70;
const TABLE_HEAD_Y = 146;
const TABLE_TOP = 156;
const TABLE_BOTTOM = 296;
const CAPTION_Y1 = 318;
const CAPTION_Y2 = 336;
/** 표의 이력 칸과 짐작 칸 사이 화살표 길이 */
const ARROW = 46;
const KEY_GAP = 4;

/** 걸음 하나의 운동 — 찾아 들어가기 · 짐작 올라오기 · 결과 적기가 한 시계에 흐른다 */
const STEP_MS = 720;
const PHASE_LOOKUP = 0.36;
const PHASE_GUESS = 0.64;

type Base = NonNullable<PatternFromHistoryScene['base']>;

interface Geometry {
  hl: number;
  pitch: number;
  cell: number;
  /** 결과 열 k 번째 칸의 왼쪽 (k < hl 이면 처음 이력) */
  tapeX(k: number): number;
  rc: number;
  keyX(d: number): number;
  bitX: number;
  keyX0: number;
  keyW: number;
  rowY(r: number): number;
}

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function geometry(base: Base): Geometry {
  const hl = base.start.length;
  const total = hl + base.outcomes.length;
  const left = LABEL_W + PAD;
  const pitch = Math.min(PITCH_MAX, (W - left - PAD) / Math.max(1, total));
  const cell = Math.min(CELL_MAX, pitch * 0.8);
  const rows = Math.max(1, base.keys.length);
  const rowPitch = Math.min(cell + 8, (TABLE_BOTTOM - TABLE_TOP) / rows);
  const rc = Math.min(cell, rowPitch - 6);
  const keyW = hl * rc + Math.max(0, hl - 1) * KEY_GAP;
  const keyX0 = (W - (keyW + ARROW + rc)) / 2;
  return {
    hl,
    pitch,
    cell,
    tapeX: (k) => left + k * pitch + (pitch - cell) / 2,
    rc,
    keyX: (d) => keyX0 + d * (rc + KEY_GAP),
    bitX: keyX0 + keyW + ARROW,
    keyX0,
    keyW,
    rowY: (r) => TABLE_TOP + r * rowPitch + (rowPitch - rc) / 2,
  };
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function seg(t: number, a: number, b: number): number {
  if (t <= a) return 0;
  if (t >= b) return 1;
  return (t - a) / (b - a);
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function narrow(data: Record<string, unknown> | undefined): void {
  // stage 는 장면만 그린다. initialData 에서 쓰는 것은 없고, 모양만 확인한다.
  if (data !== undefined && data.type !== 'pattern-from-history') {
    throw new Error(`pattern-from-history-stage: 뜻밖의 자료 ${String(data.type)}`);
  }
}

interface Refs {
  window: SVGGElement | null;
  guess: Map<number, SVGGElement>;
  glyph: Map<number, SVGGElement>;
  tapeText: Map<number, SVGTextElement>;
  bitText: Map<string, SVGTextElement>;
}

export const patternFromHistoryStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    narrow(params.initialData);
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      value: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'dominant-baseline': 'central',
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'font-weight': opts.weight ?? 'normal',
          fill: opts.fill ?? colors.text,
        },
        parent,
      );
      node.textContent = value;
      return node;
    }

    function letter(b: Bit): string {
      return b === 'T' ? t('label.T', 'T') : t('label.N', 'N');
    }

    /** 칸 하나 — 결과 열 · 이력 창 복제본 · 표가 같은 모양을 쓴다 */
    function box(
      parent: Element,
      x: number,
      y: number,
      size: number,
      value: string,
      style: { stroke: string; fill: string; ink: string; dashed?: boolean; width?: number },
    ): SVGTextElement {
      el(
        'rect',
        {
          x,
          y,
          width: size,
          height: size,
          rx: 4,
          fill: style.fill,
          stroke: style.stroke,
          'stroke-width': style.width ?? 1,
          ...(style.dashed ? { 'stroke-dasharray': '3 3' } : {}),
        },
        parent,
      );
      return text(parent, x + size / 2, y + size / 2, value, { mono: true, size: fontSizes.md, fill: style.ink, weight: '600' });
    }

    function guessChip(parent: Element, x: number, w: number, value: string, hit: boolean | null): SVGGElement {
      const g = el('g', {}, parent);
      const fill = hit === null ? colors.bg : hit ? colors.success : colors.danger;
      const ink = hit === null ? colors.text : colors.textInverse;
      el('rect', { x, y: GUESS_TOP, width: w, height: GUESS_H, rx: 4, fill, stroke: hit === null ? colors.text : fill }, g);
      text(g, x + w / 2, GUESS_TOP + GUESS_H / 2, value, { mono: true, size: fontSizes.sm, fill: ink, weight: '600' });
      return g;
    }

    function glyph(parent: Element, cx: number, hit: boolean): SVGGElement {
      const g = el('g', {}, parent);
      if (hit) {
        el('circle', { cx, cy: GLYPH_Y, r: 4.5, fill: 'none', stroke: colors.success, 'stroke-width': 1.6 }, g);
      } else {
        const s = 4;
        const common = { stroke: colors.danger, 'stroke-width': 1.8, 'stroke-linecap': 'round' };
        el('line', { x1: cx - s, y1: GLYPH_Y - s, x2: cx + s, y2: GLYPH_Y + s, ...common }, g);
        el('line', { x1: cx - s, y1: GLYPH_Y + s, x2: cx + s, y2: GLYPH_Y - s, ...common }, g);
      }
      return g;
    }

    function captionLines(scene: PatternFromHistoryScene, hl: number): [string, string] {
      const step = scene.step;
      if (!step) return ['', ''];
      if (step.kind === 'start') {
        return [
          t('caption.start', 'One cell for each possible last {len}: {count} cells, all starting at {bit}.', {
            len: hl,
            count: scene.table.length,
            bit: letter(step.initialBit),
          }),
          '',
        ];
      }
      if (step.kind === 'branch') {
        const vars = { len: hl, guess: letter(step.guess), outcome: letter(step.outcome) };
        return [
          t('caption.lookup', 'The last {len} point to a cell: it says {guess}. The branch went {outcome}.', vars),
          step.hit
            ? t('caption.hit', 'Right — the cell keeps {outcome}.', vars)
            : t('caption.miss', 'Wrong — the cell now holds {outcome}.', vars),
        ];
      }
      return [
        t('caption.doneMiss', 'Wrong {miss} of {total}.', { miss: step.miss, total: step.total }),
        t('caption.doneStreak', 'The last {streak} in a row were right.', { streak: step.streak }),
      ];
    }

    let refs: Refs = { window: null, guess: new Map(), glyph: new Map(), tapeText: new Map(), bitText: new Map() };

    function drawStatic(scene: PatternFromHistoryScene): void {
      svg.textContent = '';
      refs = { window: null, guess: new Map(), glyph: new Map(), tapeText: new Map(), bitText: new Map() };
      const base = scene.base;
      if (!base) return;
      const g = geometry(base);
      const root = el('g', {}, svg);

      text(root, PAD, LEGEND_Y, t('label.legend', '{t} taken · {n} not taken', { t: letter('T'), n: letter('N') }), {
        anchor: 'start',
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      text(root, PAD, GUESS_TOP + GUESS_H / 2, t('label.guess', 'guess'), { anchor: 'start', size: fontSizes.xs, fill: colors.textMuted });
      text(root, PAD, TAPE_TOP + g.cell / 2, t('label.actual', 'actual'), { anchor: 'start', size: fontSizes.xs, fill: colors.textMuted });

      // 결과 열 — 처음 이력 hl 칸 + 분기 결과
      const revealed = scene.results.length;
      for (let k = 0; k < g.hl + base.outcomes.length; k += 1) {
        const x = g.tapeX(k);
        if (k < g.hl) {
          box(root, x, TAPE_TOP, g.cell, letter(base.start[k]), {
            stroke: colors.textMuted,
            fill: colors.bgSubtle,
            ink: colors.textMuted,
            dashed: true,
          });
          continue;
        }
        const j = k - g.hl;
        if (j < revealed) {
          const node = box(root, x, TAPE_TOP, g.cell, letter(base.outcomes[j]), {
            stroke: colors.border,
            fill: colors.bgSubtle,
            ink: colors.text,
          });
          refs.tapeText.set(j, node);
          const r = scene.results[j];
          refs.guess.set(j, guessChip(root, x, g.cell, letter(r.guess), r.hit));
          refs.glyph.set(j, glyph(root, x + g.cell / 2, r.hit));
        } else {
          box(root, x, TAPE_TOP, g.cell, '', { stroke: colors.border, fill: 'none', ink: colors.text, dashed: true });
        }
      }

      // 이력 창 — 결과 열의 마지막 hl 칸을 두른다
      const s = revealed;
      const win = el('g', {}, root);
      const wx = g.tapeX(s) - 5;
      const ww = g.tapeX(s + g.hl - 1) + g.cell + 5 - wx;
      el(
        'rect',
        { x: wx, y: TAPE_TOP - 6, width: ww, height: g.cell + 12, rx: 6, fill: 'none', stroke: colors.accent, 'stroke-width': 2.5 },
        win,
      );
      text(win, wx + ww / 2, TAPE_TOP + g.cell + 20, t('label.history', 'last {len}', { len: g.hl }), {
        size: fontSizes.xs,
        fill: colors.text,
      });
      refs.window = win;

      // 표 — 칸 이름(이력) → 1비트
      const step = scene.step;
      const current = step && step.kind === 'branch' ? step.key : null;
      text(root, g.keyX0 + g.keyW / 2, TABLE_HEAD_Y, t('label.history', 'last {len}', { len: g.hl }), {
        size: fontSizes.xs,
        fill: colors.textMuted,
      });
      text(root, g.bitX + g.rc / 2, TABLE_HEAD_Y, t('label.guess', 'guess'), { size: fontSizes.xs, fill: colors.textMuted });
      scene.table.forEach((c, r) => {
        const y = g.rowY(r);
        const on = c.key === current;
        const keyStroke = on ? colors.accent : c.visited ? colors.border : colors.textMuted;
        for (let d = 0; d < g.hl; d += 1) {
          const b = c.key[d] === 'T' ? 'T' : 'N';
          box(root, g.keyX(d), y, g.rc, letter(b), {
            stroke: keyStroke,
            fill: colors.bgSubtle,
            ink: c.visited ? colors.text : colors.textMuted,
            dashed: !c.visited && !on,
            width: on ? 2.5 : 1,
          });
        }
        const ay = y + g.rc / 2;
        const ax1 = g.keyX0 + g.keyW + 6;
        const ax2 = g.bitX - 6;
        const ink = on ? colors.accent : colors.textMuted;
        el('line', { x1: ax1, y1: ay, x2: ax2 - 5, y2: ay, stroke: ink, 'stroke-width': on ? 2 : 1 }, root);
        el('path', { d: `M${r2(ax2)},${r2(ay)} l-6,-4 l0,8 z`, fill: ink }, root);
        const bt = box(root, g.bitX, y, g.rc, letter(c.bit), {
          stroke: on ? colors.accent : c.visited ? colors.text : colors.textMuted,
          fill: colors.bg,
          ink: c.visited ? colors.text : colors.textMuted,
          dashed: !c.visited && !on,
          width: on || c.visited ? 2 : 1,
        });
        refs.bitText.set(c.key, bt);
      });

      const [l1, l2] = captionLines(scene, g.hl);
      text(root, W / 2, CAPTION_Y1, l1, { size: fontSizes.sm });
      if (l2) text(root, W / 2, CAPTION_Y2, l2, { size: fontSizes.sm, weight: '600' });
    }

    function stopMotion(): void {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    /** 한 시계 — 끝나거나, 세대가 바뀌거나, 거두면 풀린다 */
    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const t0 = performance.now();
        const tick = (): void => {
          if (settled) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - t0) / ms);
          frame(p);
          if (p >= 1) finish();
          else schedule();
        };
        const schedule = (): void => {
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        frame(0);
        schedule();
      });
    }

    async function playBranch(
      next: PatternFromHistoryScene,
      step: Extract<NonNullable<PatternFromHistoryScene['step']>, { kind: 'branch' }>,
      mine: number,
    ): Promise<void> {
      const base = next.base;
      if (!base) return;
      const g = geometry(base);
      const i = step.index;
      const row = next.table.findIndex((c) => c.key === step.key);
      if (row < 0) return;
      const rowY = g.rowY(row);
      const k = i + g.hl; // 이번 결과의 결과 열 자리

      const guessNode = refs.guess.get(i);
      const glyphNode = refs.glyph.get(i);
      const tapeNode = refs.tapeText.get(i);
      const bitNode = refs.bitText.get(step.key);
      const win = refs.window;

      // 복제본 — 창의 두 칸 · 칸에서 올라오는 짐작 · 내려가 적히는 결과
      const fly = el('g', {}, svg);
      const keyFly = step.key.split('').map((ch) => {
        const cg = el('g', {}, fly);
        const rect = el('rect', { rx: 4, fill: colors.bg, stroke: colors.accent, 'stroke-width': 2.5 }, cg);
        const tx = text(cg, 0, 0, letter(ch === 'T' ? 'T' : 'N'), { mono: true, size: fontSizes.md, weight: '600' });
        return { rect, tx };
      });
      const guessFly = el('g', { visibility: 'hidden' }, fly);
      const gRect = el('rect', { rx: 4, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, guessFly);
      const gText = text(guessFly, 0, 0, letter(step.guess), { mono: true, size: fontSizes.md, weight: '600' });
      const outFly = el('g', { visibility: 'hidden' }, fly);
      const oRect = el('rect', { rx: 4, fill: colors.bgSubtle, stroke: colors.text, 'stroke-width': 1.5 }, outFly);
      const oText = text(outFly, 0, 0, letter(step.outcome), { mono: true, size: fontSizes.md, weight: '600' });

      const place = (rect: SVGRectElement, tx: SVGTextElement, x: number, y: number, w: number, h: number): void => {
        rect.setAttribute('x', String(r2(x)));
        rect.setAttribute('y', String(r2(y)));
        rect.setAttribute('width', String(r2(w)));
        rect.setAttribute('height', String(r2(h)));
        tx.setAttribute('x', String(r2(x + w / 2)));
        tx.setAttribute('y', String(r2(y + h / 2)));
      };

      await tween(STEP_MS, mine, (p) => {
        const p1 = ease(seg(p, 0, PHASE_LOOKUP));
        const p2 = ease(seg(p, PHASE_LOOKUP, PHASE_GUESS));
        const p3 = ease(seg(p, PHASE_GUESS, 1));
        const writing = p > PHASE_GUESS;

        // 1. 찾아 들어간다 — 창의 복제본이 같은 이름의 칸에 내려앉는다
        keyFly.forEach((f, d) => {
          const size = lerp(g.cell, g.rc, p1);
          place(f.rect, f.tx, lerp(g.tapeX(i + d), g.keyX(d), p1), lerp(TAPE_TOP, rowY, p1), size, size);
        });

        // 2. 짐작이 칸에서 올라와 이번 결과 위에 놓인다
        if (p > PHASE_LOOKUP && !writing) {
          guessFly.removeAttribute('visibility');
          place(
            gRect,
            gText,
            lerp(g.bitX, g.tapeX(k), p2),
            lerp(rowY, GUESS_TOP, p2),
            lerp(g.rc, g.cell, p2),
            lerp(g.rc, GUESS_H, p2),
          );
        } else {
          guessFly.setAttribute('visibility', 'hidden');
        }

        // 3. 결과가 드러나 칸으로 내려가 적히고, 창이 한 칸 옆으로 간다
        const hide = (node: Element | undefined): void => {
          if (!node) return;
          if (writing) node.removeAttribute('visibility');
          else node.setAttribute('visibility', 'hidden');
        };
        hide(guessNode);
        hide(glyphNode);
        hide(tapeNode);
        if (writing) {
          outFly.removeAttribute('visibility');
          place(
            oRect,
            oText,
            lerp(g.tapeX(k), g.bitX, p3),
            lerp(TAPE_TOP, rowY, p3),
            lerp(g.cell, g.rc, p3),
            lerp(g.cell, g.rc, p3),
          );
        }
        if (bitNode) bitNode.textContent = p >= 1 ? letter(step.outcome) : letter(step.guess);
        if (win) {
          const dx = r2(-(1 - p3) * g.pitch);
          if (dx === 0) win.removeAttribute('transform');
          else win.setAttribute('transform', `translate(${dx},0)`);
        }
      });
    }

    async function render(
      next: PatternFromHistoryScene,
      prev: PatternFromHistoryScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      stopMotion();
      if (destroyed) return;
      drawStatic(next);
      const step = next.step;
      if (
        !opts.animate ||
        !prev ||
        !step ||
        step.kind !== 'branch' ||
        prev.results.length !== next.results.length - 1
      ) {
        return;
      }
      await playBranch(next, step, mine);
      if (mine === gen && !destroyed) drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        stopMotion();
        svg.textContent = '';
      },
    };
  },
};
