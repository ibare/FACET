/**
 * 최장 접두 일치의 무대.
 *
 * 위에 목적지 주소의 32 비트, 아래에 표의 줄마다 망 주소의 비트(접두 길이까지만 견줄 비트,
 * 그 뒤는 점). 줄을 맞춰 볼 때마다 목적지 비트의 사본이 그 줄 위로 내려와 겹치고,
 * 맞은 비트만큼 막대가 왼쪽에서 자란다. 끝까지 맞으면 그 길이의 막대가 남고, 도중에
 * 어긋나면 막대가 그 자리에서 떨어져 나간다. 고르기에서는 남은 막대 가운데 가장 긴 것이
 * 목적지 바로 아래 자리로 올라선다. 막대는 모두 첫 비트에서 출발하므로 길이를 곧바로 견줄 수 있다.
 */
import {
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
} from '@ffacet/core/runtime';
import type { LongestPrefixMatchScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 372;

const PAD = 14;
const LABEL_W = 120;
const PORT_W = 54;
const CELL_MAX = 16;
const BITS = 32;

const CAPTION_Y = 24;
const DEST_Y = 50; // 목적지 비트 칸의 위
const SLOT_Y = 90; // 고른 줄이 올라설 자리 (막대의 위)
const HEAD_Y = 128;
const ROW0 = 140;
const ROW_H = 45;
const LANE_H = 14; // 목적지 사본이 내려앉는 줄
const CELL_H = 17;
const BAR_H = 6;

const DROP_MS = 320;
const BIT_MS = 22;
const SWEEP_MIN_MS = 160;
const FALL_MS = 320;
const RISE_MS = 520;

const XS = parseFloat(fontSizes.xs);

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

type Hold = { row?: number; pick?: boolean };

export const longestPrefixMatchStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    const W = PIECE_CANVAS_W;
    const x0 = PAD + LABEL_W;
    const stripW = W - PAD * 2 - LABEL_W - PORT_W;
    // 칸 32 개와 옥텟 사이 틈 셋(칸의 절반씩)이 폭을 채운다. 상수는 상한만.
    const cell = Math.min(CELL_MAX, stripW / (BITS + 1.5));
    const gap = cell / 2;
    const portX = W - PAD - PORT_W + 10;

    const bitX = (i: number): number => round(x0 + i * cell + Math.floor(i / 8) * gap);
    const barW = (n: number): number => (n <= 0 ? 0 : round(bitX(n - 1) + cell - x0));
    const rowY = (i: number): number => ROW0 + i * ROW_H;
    const laneY = (i: number): number => rowY(i);
    const netY = (i: number): number => rowY(i) + LANE_H + 2;
    const barY = (i: number): number => netY(i) + CELL_H + 4;

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size?: string; fill?: string; mono?: boolean; weight?: string; anchor?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          fill: opts.fill ?? colors.text,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'font-weight': opts.weight ?? 'normal',
          'text-anchor': opts.anchor ?? 'start',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    /** 비트 줄 하나. `upto` 까지는 수, 그 뒤는 점. */
    function bitRow(
      parent: Element,
      y: number,
      h: number,
      bits: string,
      upto: number,
      ink: string,
      boxed: boolean,
    ): void {
      for (let i = 0; i < BITS; i += 1) {
        const x = bitX(i);
        if (i < upto) {
          if (boxed) {
            el('rect', { x: x + 0.5, y, width: cell - 1, height: h, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1 }, parent);
          }
          label(parent, x + cell / 2, y + h / 2 + XS * 0.36, bits[i] ?? '', { size: fontSizes.xs, fill: ink, mono: true, anchor: 'middle' });
        } else {
          label(parent, x + cell / 2, y + h / 2 + XS * 0.36, '·', { size: fontSizes.xs, fill: colors.textMuted, mono: true, anchor: 'middle' });
        }
      }
    }

    function caption(scene: LongestPrefixMatchScene): string {
      const step = scene.step;
      if (step.kind === 'start') {
        return t('caption.start', 'Destination {addr}. Rows to check: {n}.', { addr: scene.dest.addr, n: scene.rows.length });
      }
      if (step.kind === 'probe') {
        const row = scene.rows[step.row];
        const res = scene.results[step.row];
        if (!row || !res) throw new Error(`맞춰 본 줄이 장면에 없다: ${step.row}`);
        const vars = { row: step.row + 1, prefix: row.prefix, len: row.len, same: res.same, bit: res.same + 1 };
        if (!res.matched) return t('caption.miss', 'Row {row} ({prefix}): equal through bit {same}, differs at bit {bit}. No match.', vars);
        if (row.len === 0) return t('caption.matchZero', 'Row {row} ({prefix}): no bits to compare. Match, length {len}.', vars);
        return t('caption.match', 'Row {row} ({prefix}): every bit up to /{len} agrees. Match, length {len}.', vars);
      }
      const row = scene.rows[step.row];
      if (!row) throw new Error(`고른 줄이 장면에 없다: ${step.row}`);
      const lens = scene.rows
        .filter((_, i) => scene.results[i]?.matched === true)
        .map((r) => r.len)
        .join(' · ');
      return t('caption.pick', 'Matched lengths: {lens}. Longest: /{best}, row {row}, out {port}.', {
        lens,
        best: row.len,
        row: step.row + 1,
        port: row.out,
      });
    }

    function drawStatic(scene: LongestPrefixMatchScene, hold: Hold = {}): void {
      svg.textContent = '';
      const step = scene.step;

      label(svg, PAD, CAPTION_Y, caption(scene), { size: fontSizes.md });

      // 목적지
      label(svg, PAD, DEST_Y + 6, t('label.dest', 'Destination'), { size: fontSizes.xs, fill: colors.textMuted });
      label(svg, PAD, DEST_Y + 20, scene.dest.addr, { mono: true, weight: 'bold' });
      bitRow(svg, DEST_Y, CELL_H + 2, scene.dest.bits, BITS, colors.text, true);

      // 고른 줄이 올라설 자리
      label(svg, PAD, SLOT_Y + BAR_H + 2, t('label.chosen', 'Chosen'), { size: fontSizes.xs, fill: colors.textMuted });
      el('line', { x1: x0, y1: SLOT_Y + BAR_H / 2, x2: bitX(BITS - 1) + cell, y2: SLOT_Y + BAR_H / 2, stroke: colors.border, 'stroke-dasharray': '3 4' }, svg);
      const chosen = hold.pick ? null : scene.chosen;
      if (chosen !== null) {
        const row = scene.rows[chosen];
        if (!row) throw new Error(`고른 줄이 장면에 없다: ${chosen}`);
        drawChosen(svg, row.len, row.out, SLOT_Y);
      }

      label(svg, PAD, HEAD_Y, t('label.prefix', 'Prefix'), { size: fontSizes.xs, fill: colors.textMuted });
      label(svg, portX, HEAD_Y, t('label.out', 'Out'), { size: fontSizes.xs, fill: colors.textMuted });

      scene.rows.forEach((row, i) => {
        const res = hold.row === i ? null : scene.results[i] ?? null;
        const missed = res !== null && !res.matched;
        const current = step.kind === 'probe' && step.row === i;
        const winner = chosen === i;
        const ink = missed ? colors.textMuted : colors.text;

        if (current) {
          el('rect', { x: PAD - 6, y: rowY(i) - 3, width: W - PAD * 2 + 12, height: ROW_H - 2, fill: 'none', stroke: colors.itemComparing, 'stroke-width': 1.5, rx: 4 }, svg);
        }
        label(svg, PAD, netY(i) + CELL_H - 4, String(i + 1), { size: fontSizes.xs, fill: colors.textMuted });
        label(svg, PAD + 16, netY(i) + CELL_H - 4, row.prefix, { mono: true, fill: ink, weight: winner ? 'bold' : 'normal' });
        label(svg, portX, netY(i) + CELL_H - 4, row.out, { mono: true, fill: ink, weight: winner ? 'bold' : 'normal' });

        bitRow(svg, netY(i), CELL_H, row.bits, row.len, ink, true);

        // 맞춰 보는 줄 위에 내려앉은 목적지 사본
        if (current && hold.row !== i) bitRow(svg, laneY(i), LANE_H, scene.dest.bits, row.len, colors.itemComparing, false);

        if (res !== null && res.matched) {
          drawBar(svg, barY(i), res.same, winner ? colors.accent : colors.success);
        }
        if (missed) {
          el('rect', { x: bitX(res.same) - 0.5, y: netY(i) - 1, width: cell + 1, height: CELL_H + 2, fill: 'none', stroke: colors.danger, 'stroke-width': 2 }, svg);
        }
      });
    }

    /** 길이 막대. 길이 0 도 맞았다는 표시로 첫 자리에 세운 눈금이 남는다. */
    function drawBar(parent: Element, y: number, n: number, fill: string): SVGGElement {
      const g = el('g', {}, parent);
      el('rect', { x: x0 - 3, y: y - 2, width: 2, height: BAR_H + 4, fill }, g);
      if (n > 0) el('rect', { x: x0, y, width: barW(n), height: BAR_H, fill, rx: 1 }, g);
      return g;
    }

    function drawChosen(parent: Element, len: number, out: string, y: number): SVGGElement {
      const g = drawBar(parent, y, len, colors.accent);
      label(g, x0 + barW(len) + 6, y + BAR_H + 2, `/${len}`, { size: fontSizes.xs, fill: colors.text, mono: true });
      label(g, portX, y + BAR_H + 2, out, { mono: true, weight: 'bold' });
      return g;
    }

    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<boolean> {
      return new Promise((resolve) => {
        if (destroyed || mine !== gen) return resolve(false);
        let start: number | null = null;
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const frame = (now: number): void => {
          frames.delete(id);
          if (done) return;
          if (destroyed || mine !== gen) return finish(false);
          if (start === null) start = now;
          const p = Math.min(1, (now - start) / ms);
          draw(ease(p));
          if (p >= 1) finish(true);
          else {
            id = requestAnimationFrame(frame);
            frames.add(id);
          }
        };
        let id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    async function animateProbe(scene: LongestPrefixMatchScene, i: number, mine: number): Promise<void> {
      const row = scene.rows[i];
      const res = scene.results[i];
      if (!row || !res) return;
      drawStatic(scene, { row: i });
      const layer = el('g', {}, svg);

      // 목적지 사본이 줄 위로 내려앉는다
      const ghost = el('g', {}, layer);
      bitRow(ghost, DEST_Y, LANE_H, scene.dest.bits, row.len, colors.itemComparing, false);
      const dy = laneY(i) - DEST_Y;
      if (!(await tween(DROP_MS, mine, (p) => ghost.setAttribute('transform', `translate(0 ${round(dy * p)})`)))) return;

      // 맞은 비트만큼 막대가 자란다
      const bar = el('g', {}, layer);
      const tick = el('rect', { x: x0 - 3, y: barY(i) - 2, width: 2, height: 0, fill: colors.success }, bar);
      const body = el('rect', { x: x0, y: barY(i), width: 0, height: BAR_H, fill: colors.success, rx: 1 }, bar);
      const sweepMs = Math.max(SWEEP_MIN_MS, res.same * BIT_MS);
      const grown = await tween(sweepMs, mine, (p) => {
        tick.setAttribute('height', String(round((BAR_H + 4) * Math.min(1, p * 3))));
        body.setAttribute('width', String(barW(Math.min(res.same, Math.floor(p * res.same + 1e-9)))));
      });
      if (!grown) return;
      body.setAttribute('width', String(barW(res.same)));

      if (!res.matched) {
        // 어긋난 자리를 짚고, 막대가 그 자리에서 떨어져 나간다
        el('rect', { x: bitX(res.same) - 0.5, y: netY(i) - 1, width: cell + 1, height: CELL_H + 2, fill: 'none', stroke: colors.danger, 'stroke-width': 2 }, layer);
        if (!(await tween(FALL_MS, mine, (p) => {
          bar.setAttribute('transform', `translate(0 ${round(18 * p)})`);
          bar.setAttribute('opacity', String(round(1 - p)));
        }))) return;
      }
    }

    async function animatePick(scene: LongestPrefixMatchScene, i: number, mine: number): Promise<void> {
      const row = scene.rows[i];
      if (!row) return;
      drawStatic(scene, { pick: true });
      const from = barY(i);
      const g = drawChosen(svg, row.len, row.out, from);
      const dy = SLOT_Y - from;
      await tween(RISE_MS, mine, (p) => g.setAttribute('transform', `translate(0 ${round(dy * p)})`));
    }

    const renderer: SceneRenderer<LongestPrefixMatchScene> = {
      async render(next, _prev, opts) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate) {
          drawStatic(next);
          return;
        }
        const step = next.step;
        if (step.kind === 'probe') await animateProbe(next, step.row, mine);
        else if (step.kind === 'pick') await animatePick(next, step.row, mine);
        if (mine === gen && !destroyed) drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };

    return renderer;
  },
};
