/**
 * interleaving stage — 두 스레드의 줄이 가운데 실행 줄로 한 줄씩 끼워 들어간다.
 *
 * 위 · 아래 두 줄에 스레드 프로그램이 있고, 가운데가 합친 실행 줄이다. 판마다 스레드 줄이
 * 제 자리(이번 판에서 차지할 칸) 위로 옆걸음한 뒤, 실행 차례대로 한 줄씩 가운데로 내려오고
 * 올라와 끼워 든다. 한 스레드의 줄은 옆걸음해도 서로 앞뒤를 바꾸지 않는다.
 * 아래 기록 띠에 지금까지의 판이 쌓인다.
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
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { InterleavingScene, SceneRound } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SIDE_PAD = 12;
const LABEL_W = 78;
const CARD_H = 32;
const CARD_W_MAX = 118;
const LANE_A_Y = 62;
const RUN_Y = 124;
const LANE_B_Y = 186;
const RECORD_LABEL_Y = 252;
const RECORD_Y = 266;
const CHIP_W_MAX = 20;
const CHIP_H = 22;
const RECORD_PITCH_MAX = 100;

const SLIDE_MS = 300;
const DROP_MS = 180;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

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

/** 판 안에서 스레드 th 의 줄 li 가 선 칸. 판이 없으면(걸음 0) 줄 번호 그대로. */
function columnOf(round: SceneRound | null, th: number, li: number): number {
  if (!round) return li;
  const k = round.slots.findIndex((s) => s.thread === th && s.line === li);
  if (k < 0) throw new Error(`interleaving-stage: 판 ${round.index} 에 스레드 ${th} 줄 ${li} 이 없다`);
  return k;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

type Drawn = {
  /** [스레드][줄] — 스레드 줄 카드 */
  lane: SVGGElement[][];
  /** 합친 실행 줄의 칸마다 끼워 든 카드 */
  run: SVGGElement[];
  /** 바뀜 표시 묶음 */
  marks: SVGGElement;
  /** 기록 띠의 마지막 판 */
  newest: SVGGElement | null;
};

export const interleavingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const codePx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function laneY(th: number): number {
      return th === 0 ? LANE_A_Y : LANE_B_Y;
    }

    function geometry(n: number): { x0: number; colW: number; cardW: number } {
      const x0 = SIDE_PAD + LABEL_W;
      const colW = (W - x0 - SIDE_PAD) / Math.max(1, n);
      const cardW = Math.min(CARD_W_MAX, colW - 12);
      return { x0, colW, cardW };
    }

    function colX(n: number, k: number): number {
      const g = geometry(n);
      return g.x0 + g.colW * k + (g.colW - g.cardW) / 2;
    }

    function card(parent: Element, text: string, fill: string, stroke: string, x: number, y: number, w: number): SVGGElement {
      const g = el('g', { transform: `translate(${r2(x)},${r2(y)})` }, parent);
      el('rect', { x: 0, y: 0, width: w, height: CARD_H, rx: 5, fill, stroke, 'stroke-width': 1.6 }, g);
      const tx = el(
        'text',
        {
          x: w / 2,
          y: CARD_H / 2 + codePx * 0.35,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        },
        g,
      );
      tx.textContent = text;
      return g;
    }

    function drawStatic(scene: InterleavingScene): Drawn {
      svg.textContent = '';
      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, svg);
      const lane: SVGGElement[][] = [];
      const run: SVGGElement[] = [];
      let newest: SVGGElement | null = null;
      const threads = scene.threads;
      const tone = categorical(Math.max(2, threads.length));
      const n = threads.reduce((s, th) => s + th.lines.length, 0);
      const g = geometry(n);
      const current = scene.rounds.length > 0 ? scene.rounds[scene.rounds.length - 1] ?? null : null;

      // 캡션 — 지금 일어나는 일만
      const cap = el(
        'text',
        { x: SIDE_PAD, y: 22, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text },
        svg,
      );
      cap.textContent = current
        ? t('caption.round', 'Order {k} · Switches: {n}', { k: current.index, n: current.switches })
        : t('caption.start', 'Two threads, each running its own lines in order.');
      if (scene.summary) {
        const sum = el(
          'text',
          { x: SIDE_PAD, y: 42, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted },
          svg,
        );
        sum.textContent = t('caption.summary', 'Merged orders: {m} · Arrangements of the outputs: {p}', {
          m: scene.summary.merges,
          p: scene.summary.arrangements,
        });
      }

      // 가운데 실행 줄 — 빈 칸 틀
      const runLabel = el(
        'text',
        {
          x: SIDE_PAD,
          y: RUN_Y + CARD_H / 2 + codePx * 0.35,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: colors.textMuted,
        },
        svg,
      );
      runLabel.textContent = t('label.run', 'Run');
      el(
        'line',
        { x1: g.x0 - 4, y1: RUN_Y + CARD_H / 2, x2: W - SIDE_PAD, y2: RUN_Y + CARD_H / 2, stroke: colors.border, 'stroke-width': 1 },
        svg,
      );
      for (let k = 0; k < n; k += 1) {
        el(
          'rect',
          {
            x: colX(n, k),
            y: RUN_Y,
            width: g.cardW,
            height: CARD_H,
            rx: 5,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-dasharray': '4 3',
          },
          svg,
        );
      }

      // 스레드 줄
      threads.forEach((th, ti) => {
        const color = tone[ti] ?? colors.primary;
        const y = laneY(ti);
        const idText = el(
          'text',
          {
            x: SIDE_PAD,
            y: y + CARD_H / 2 + codePx * 0.4,
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            'font-weight': 700,
            fill: color,
          },
          svg,
        );
        idText.textContent = th.id;
        const row: SVGGElement[] = [];
        th.lines.forEach((line, li) => {
          row.push(card(svg, line, colors.bg, color, colX(n, columnOf(current, ti, li)), y, g.cardW));
        });
        lane.push(row);
      });

      // 끼워 든 줄 · 바뀜 표시
      const marks = el('g', {}, svg);
      if (current) {
        current.slots.forEach((s, k) => {
          const th = threads[s.thread];
          if (!th) throw new Error(`interleaving-stage: 스레드 ${s.thread} 가 없다`);
          const line = th.lines[s.line];
          if (line === undefined) throw new Error(`interleaving-stage: 스레드 ${th.id} 줄 ${s.line} 이 없다`);
          run.push(card(svg, line, colors.bgSubtle, tone[s.thread] ?? colors.primary, colX(n, k), RUN_Y, g.cardW));
          const prevSlot = k > 0 ? current.slots[k - 1] : undefined;
          if (prevSlot && prevSlot.thread !== s.thread) {
            const x = g.x0 + g.colW * k;
            el(
              'line',
              {
                x1: x,
                y1: RUN_Y - 7,
                x2: x,
                y2: RUN_Y + CARD_H + 7,
                stroke: colors.accent,
                'stroke-width': 3,
                'stroke-linecap': 'round',
              },
              marks,
            );
          }
        });
      }

      // 기록 띠 — 지금까지의 판
      const recLabel = el(
        'text',
        { x: SIDE_PAD, y: RECORD_LABEL_Y, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted },
        svg,
      );
      recLabel.textContent = t('label.orders', 'Orders so far');
      const count = scene.rounds.length;
      const pitch = count > 0 ? Math.min(RECORD_PITCH_MAX, (W - 2 * SIDE_PAD) / count) : RECORD_PITCH_MAX;
      const chipW = Math.min(CHIP_W_MAX, (pitch - 12) / Math.max(1, n) - 2);
      scene.rounds.forEach((round, ri) => {
        const gx = SIDE_PAD + pitch * ri;
        const grp = el('g', { transform: `translate(${r2(gx)},${RECORD_Y})` }, svg);
        const isCurrent = ri === count - 1;
        if (isCurrent) {
          el(
            'rect',
            {
              x: -4,
              y: -4,
              width: n * (chipW + 2) + 6,
              height: CHIP_H + 30,
              rx: 5,
              fill: 'none',
              stroke: colors.accent,
              'stroke-width': 2,
            },
            grp,
          );
        }
        round.slots.forEach((s, k) => {
          const x = k * (chipW + 2);
          el('rect', { x, y: 0, width: chipW, height: CHIP_H, rx: 3, fill: tone[s.thread] ?? colors.primary }, grp);
          const ch = el(
            'text',
            {
              x: x + chipW / 2,
              y: CHIP_H / 2 + codePx * 0.35,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              'font-weight': 700,
              fill: colors.textInverse,
            },
            grp,
          );
          ch.textContent = s.output;
        });
        const sw = el(
          'text',
          { x: 0, y: CHIP_H + 17, 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted },
          grp,
        );
        sw.textContent = t('record.switches', 'Switches: {n}', { n: round.switches });
        if (isCurrent) newest = grp;
      });

      return { lane, run, marks, newest };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) return resolve();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
        waiters.add(done);
      });
    }

    /** ms 동안 onFrame(0..1) 을 부른다. 세대가 바뀌거나 거두면 false. */
    async function tween(ms: number, mine: number, onFrame: (p: number) => void): Promise<boolean> {
      const frames = Math.max(1, Math.round(ms / 16));
      for (let f = 1; f <= frames; f += 1) {
        await wait(ms / frames);
        if (destroyed || mine !== gen) return false;
        onFrame(easeInOut(f / frames));
      }
      return true;
    }

    function place(node: SVGGElement, x: number, y: number): void {
      node.setAttribute('transform', `translate(${r2(x)},${r2(y)})`);
    }

    async function render(next: InterleavingScene, _prev: InterleavingScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const drawn = drawStatic(next);
      const step = next.step;
      if (!opts.animate || !step) return;

      const n = next.threads.reduce((s, th) => s + th.lines.length, 0);
      const round = step.round;

      // 아직 못 온 만큼 — 스레드 줄은 앞 판 칸에, 끼워 든 줄 · 바뀜 표시 · 새 기록은 아직 없다
      const slides: { node: SVGGElement; from: number; to: number; y: number }[] = [];
      drawn.lane.forEach((row, ti) => {
        row.forEach((node, li) => {
          const from = colX(n, columnOf(step.from, ti, li));
          const to = colX(n, columnOf(round, ti, li));
          slides.push({ node, from, to, y: laneY(ti) });
          place(node, from, laneY(ti));
        });
      });
      for (const node of drawn.run) node.setAttribute('visibility', 'hidden');
      drawn.marks.setAttribute('visibility', 'hidden');
      if (drawn.newest) drawn.newest.setAttribute('visibility', 'hidden');

      // 옆걸음 — 이번 판에서 차지할 칸 위로
      const moved = slides.some((s) => s.from !== s.to);
      if (moved) {
        const ok = await tween(SLIDE_MS, mine, (p) => {
          for (const s of slides) place(s.node, s.from + (s.to - s.from) * p, s.y);
        });
        if (!ok) return;
      }

      // 끼워 들기 — 실행 차례대로 한 줄씩
      for (let k = 0; k < round.slots.length; k += 1) {
        if (destroyed || mine !== gen) return;
        const slot = round.slots[k];
        const node = drawn.run[k];
        if (!slot || !node) throw new Error(`interleaving-stage: 판 ${round.index} 칸 ${k} 가 없다`);
        const x = colX(n, k);
        const fromY = laneY(slot.thread);
        place(node, x, fromY);
        node.removeAttribute('visibility');
        const ok = await tween(DROP_MS, mine, (p) => place(node, x, fromY + (RUN_Y - fromY) * p));
        if (!ok) return;
      }

      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    } as ViewInstance;
  },
};
