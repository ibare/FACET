/**
 * easy-one-way-hard-back 무대 — 같은 바닥 위에 두 방향의 수고를 쌓는다.
 *
 * 왼쪽(가는 길)은 p · q 를 쥐고 곱셈 한 번 — 바닥에 벽돌 하나가 놓이고 n 이
 * 건너편으로 건너간다. 오른쪽(돌아오는 길)은 n 만 쥐고 나눠 본다 — 나눗셈마다
 * 벽돌 하나가 n 아래에서 떨어져 더미 위에 쌓인다. 나머지 0 인 벽돌이 떨어지면
 * 그 벽돌에서 되찾은 두 소수가 n 옆으로 올라간다. 두 더미의 높이가 곧 수고다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { EasyOneWayHardBackScene } from './scene.js';

const H = 460;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 기호 이름은 번역하지 않는 자료다 — 자리 표시자로 문안에 넣는다. */
const SYMBOL = { p: 'p', q: 'q', n: 'n' } as const;

const MULTIPLY_MS = 600;
const FALL_MS = 300;
const RISE_MS = 300;

type Attrs = Record<string, string | number>;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

type Box = { x: number; y: number; w: number; h: number };

type Handles = {
  pChip: Box;
  qChip: Box;
  multBlock: { box: Box; node: SVGGElement } | null;
  nChip: { box: Box; node: SVGGElement } | null;
  lastBlock: { box: Box; node: SVGGElement } | null;
  recovered: { box: Box; node: SVGGElement } | null;
};

export const easyOneWayHardBackStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);

    const W = PIECE_CANVAS_W;
    const M = 20;
    const LW = Math.round((W - 2 * M) * 0.3);
    const GAP = 28;
    const RX = M + LW + GAP;
    const RW = W - M - RX;
    const TITLE_Y = 22;
    const CHIP_Y = 38;
    const CHIP_H = 28;
    const FLOOR_Y = H - 72;
    const PILE_TOP = CHIP_Y + CHIP_H + 22;
    const COUNT_Y = FLOOR_Y + 24;
    const CAPTION_Y = H - 18;
    const PITCH_MAX = 30;

    const mdPx = parseFloat(fontSizes.md);
    const monoCharW = mdPx * 0.62;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let animLayer: SVGGElement | null = null;

    function chipWidth(label: string): number {
      return Math.ceil(label.length * monoCharW + 24);
    }

    function chip(parent: Element, box: Box, label: string, strong: boolean): SVGGElement {
      const g = svgEl('g', {}, parent);
      svgEl(
        'rect',
        {
          x: round(box.x),
          y: round(box.y),
          width: round(box.w),
          height: round(box.h),
          rx: 6,
          fill: strong ? colors.accent : colors.bg,
          stroke: strong ? colors.accent : colors.text,
          'stroke-width': 1.5,
        },
        g,
      );
      const label$ = svgEl(
        'text',
        {
          x: round(box.x + box.w / 2),
          y: round(box.y + box.h / 2),
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: strong ? colors.stateInk : colors.text,
        },
        g,
      );
      label$.textContent = label;
      return g;
    }

    /** 더미 벽돌. 왼쪽 글자와 (있으면) 오른쪽 글자. */
    function brick(parent: Element, box: Box, left: string, right: string | null, hit: boolean): SVGGElement {
      const g = svgEl('g', {}, parent);
      svgEl(
        'rect',
        {
          x: round(box.x),
          y: round(box.y),
          width: round(box.w),
          height: round(box.h),
          rx: 3,
          fill: hit ? colors.accent : colors.bgSubtle,
          stroke: hit ? colors.accent : colors.textMuted,
          'stroke-width': 1,
        },
        g,
      );
      const ink = hit ? colors.stateInk : colors.text;
      const l = svgEl(
        'text',
        {
          x: round(right === null ? box.x + box.w / 2 : box.x + 12),
          y: round(box.y + box.h / 2),
          'text-anchor': right === null ? 'middle' : 'start',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: ink,
        },
        g,
      );
      l.textContent = left;
      if (right !== null) {
        const r = svgEl(
          'text',
          {
            x: round(box.x + box.w - 12),
            y: round(box.y + box.h / 2),
            'text-anchor': 'end',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: hit ? colors.stateInk : colors.textMuted,
          },
          g,
        );
        r.textContent = right;
      }
      return g;
    }

    function label(x: number, y: number, s: string, size: string, fill: string, weight?: number): void {
      const node = svgEl(
        'text',
        {
          x: round(x),
          y: round(y),
          'font-family': fonts.body,
          'font-size': size,
          fill,
          ...(weight === undefined ? {} : { 'font-weight': weight }),
        },
        svg,
      );
      node.textContent = s;
    }

    function caption(scene: EasyOneWayHardBackScene): string {
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return t('caption.start', 'In hand: two primes, {p} and {q}.', { p: scene.p, q: scene.q });
        case 'multiply': {
          if (scene.n === null) throw new Error('easy-one-way-hard-back 무대: multiply 걸음에 n 이 없다');
          return t('caption.multiply', 'Going: {p} × {q} = {n}. Only {n} is handed across.', {
            p: scene.p,
            q: scene.q,
            n: scene.n,
          });
        }
        case 'divide': {
          if (scene.n === null) throw new Error('easy-one-way-hard-back 무대: divide 걸음에 n 이 없다');
          return t('caption.divide', 'Coming back: {n} ÷ {d} leaves remainder {r}. Not a factor.', {
            n: scene.n,
            d: step.d,
            r: step.r,
          });
        }
        case 'found': {
          if (scene.n === null) throw new Error('easy-one-way-hard-back 무대: found 걸음에 n 이 없다');
          return t('caption.found', 'Coming back: {n} ÷ {d} = {e}, remainder {r}. Recovered: {d} × {e}.', {
            n: scene.n,
            d: step.d,
            e: step.e,
            r: step.r,
          });
        }
      }
    }

    function pitchFor(scene: EasyOneWayHardBackScene): number {
      const count = scene.candidates === null ? 1 : Math.max(1, scene.candidates.length);
      return Math.min(PITCH_MAX, (FLOOR_Y - PILE_TOP) / count);
    }

    function drawStatic(scene: EasyOneWayHardBackScene): Handles {
      svg.textContent = '';
      animLayer = null;
      svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, svg);

      label(M, TITLE_Y, t('label.going', 'Going'), fontSizes.md, colors.text, 600);
      label(RX, TITLE_Y, t('label.back', 'Coming back'), fontSizes.md, colors.text, 600);

      // 가는 쪽이 쥔 두 소수.
      const pText = t('chip.symbol', '{name} = {value}', { name: SYMBOL.p, value: scene.p });
      const qText = t('chip.symbol', '{name} = {value}', { name: SYMBOL.q, value: scene.q });
      const half = LW / 2;
      const pW = Math.min(half - 6, chipWidth(pText));
      const qW = Math.min(half - 6, chipWidth(qText));
      const pChip: Box = { x: M + (half - pW) / 2, y: CHIP_Y, w: pW, h: CHIP_H };
      const qChip: Box = { x: M + half + (half - qW) / 2, y: CHIP_Y, w: qW, h: CHIP_H };
      chip(svg, pChip, pText, false);
      chip(svg, qChip, qText, false);

      // 같은 바닥.
      svgEl(
        'line',
        { x1: M, y1: FLOOR_Y, x2: W - M, y2: FLOOR_Y, stroke: colors.textMuted, 'stroke-width': 1.5 },
        svg,
      );

      const pitch = pitchFor(scene);
      const brickH = Math.max(12, pitch - 4);
      const handles: Handles = { pChip, qChip, multBlock: null, nChip: null, lastBlock: null, recovered: null };

      // 가는 길의 벽돌 — 곱셈 하나.
      if (scene.n !== null) {
        const box: Box = { x: M, y: FLOOR_Y - pitch + (pitch - brickH), w: LW, h: brickH };
        const node = brick(svg, box, t('brick.multiply', '{p} × {q} = {n}', { p: scene.p, q: scene.q, n: scene.n }), null, false);
        handles.multBlock = { box, node };

        const nText = t('chip.symbol', '{name} = {value}', { name: SYMBOL.n, value: scene.n });
        const nBox: Box = { x: RX, y: CHIP_Y, w: chipWidth(nText), h: CHIP_H };
        handles.nChip = { box: nBox, node: chip(svg, nBox, nText, false) };

        // 돌아오는 길의 벽돌 — 나눗셈 하나씩, 바닥부터.
        scene.trials.forEach((trial, i) => {
          const y = FLOOR_Y - (i + 1) * pitch + (pitch - brickH);
          const tb: Box = { x: RX, y, w: RW, h: brickH };
          const node2 = brick(
            svg,
            tb,
            t('brick.divide', '{n} ÷ {d}', { n: scene.n as number, d: trial.d }),
            t('brick.remainder', 'remainder {r}', { r: trial.r }),
            trial.r === 0,
          );
          if (i === scene.trials.length - 1) handles.lastBlock = { box: tb, node: node2 };
        });

        if (scene.recovered !== null) {
          const rText = t('chip.recovered', '{d} × {e}', { d: scene.recovered.d, e: scene.recovered.e });
          const rBox: Box = { x: nBox.x + nBox.w + 16, y: CHIP_Y, w: chipWidth(rText), h: CHIP_H };
          handles.recovered = { box: rBox, node: chip(svg, rBox, rText, true) };
        }
      } else if (scene.trials.length > 0) {
        throw new Error('easy-one-way-hard-back 무대: n 없이 나눗셈이 쌓였다');
      }

      // 두 방향의 계수기.
      if (scene.multiplications !== null && scene.divisions !== null) {
        label(M, COUNT_Y, t('count.multiply', 'Multiplications: {k}', { k: scene.multiplications }), fontSizes.md, colors.text);
        label(RX, COUNT_Y, t('count.divide', 'Divisions: {k}', { k: scene.divisions }), fontSizes.md, colors.text);
      }

      label(M, CAPTION_Y, caption(scene), fontSizes.md, colors.text);
      return handles;
    }

    function layer(): SVGGElement {
      if (animLayer === null) animLayer = svgEl('g', {}, svg);
      return animLayer;
    }

    function tween(mine: number, ms: number, apply: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const t0 = performance.now();
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const k = Math.min(1, (performance.now() - t0) / ms);
          apply(k);
          if (k >= 1) {
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

    function shift(node: SVGGElement, dx: number, dy: number): void {
      if (dx === 0 && dy === 0) node.removeAttribute('transform');
      else node.setAttribute('transform', `translate(${round(dx)} ${round(dy)})`);
    }

    function easeIn(k: number): number {
      return k * k;
    }

    function easeOut(k: number): number {
      return 1 - (1 - k) * (1 - k);
    }

    function centre(b: Box): { x: number; y: number } {
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }

    /** 두 소수가 바닥으로 내려와 벽돌 하나가 되고, n 이 건너편으로 건너간다. */
    async function playMultiply(mine: number, h: Handles, scene: EasyOneWayHardBackScene): Promise<void> {
      if (h.multBlock === null || h.nChip === null) {
        throw new Error('easy-one-way-hard-back 무대: 곱셈 벽돌이나 n 칩이 그려지지 않았다');
      }
      const block = h.multBlock;
      const nChip = h.nChip;
      const target = centre(block.box);
      const pText = t('chip.symbol', '{name} = {value}', { name: SYMBOL.p, value: scene.p });
      const qText = t('chip.symbol', '{name} = {value}', { name: SYMBOL.q, value: scene.q });
      const ghostP = chip(layer(), h.pChip, pText, false);
      const ghostQ = chip(layer(), h.qChip, qText, false);
      const pFrom = centre(h.pChip);
      const qFrom = centre(h.qChip);
      const nFrom = { x: target.x - (nChip.box.w / 2), y: target.y - (nChip.box.h / 2) };
      const nDx = nFrom.x - nChip.box.x;
      const nDy = nFrom.y - nChip.box.y;
      block.node.setAttribute('visibility', 'hidden');
      nChip.node.setAttribute('visibility', 'hidden');
      await tween(mine, MULTIPLY_MS, (k) => {
        if (k < 0.5) {
          const a = easeIn(k / 0.5);
          shift(ghostP, (target.x - pFrom.x) * a, (target.y - pFrom.y) * a);
          shift(ghostQ, (target.x - qFrom.x) * a, (target.y - qFrom.y) * a);
          return;
        }
        ghostP.setAttribute('visibility', 'hidden');
        ghostQ.setAttribute('visibility', 'hidden');
        block.node.removeAttribute('visibility');
        nChip.node.removeAttribute('visibility');
        const b = easeOut((k - 0.5) / 0.5);
        shift(nChip.node, nDx * (1 - b), nDy * (1 - b));
      });
    }

    /** 새 벽돌이 n 아래에서 더미 위로 떨어진다. */
    async function playFall(mine: number, h: Handles): Promise<void> {
      if (h.lastBlock === null || h.nChip === null) {
        throw new Error('easy-one-way-hard-back 무대: 떨어질 벽돌이 그려지지 않았다');
      }
      const block = h.lastBlock;
      const startY = h.nChip.box.y + h.nChip.box.h + 4;
      const dy = startY - block.box.y;
      await tween(mine, FALL_MS, (k) => {
        shift(block.node, 0, dy * (1 - easeIn(k)));
      });
    }

    /** 나머지 0 인 벽돌에서 되찾은 두 소수가 n 옆으로 올라간다. */
    async function playRise(mine: number, h: Handles): Promise<void> {
      if (h.lastBlock === null || h.recovered === null) {
        throw new Error('easy-one-way-hard-back 무대: 되찾은 칩이 그려지지 않았다');
      }
      const rec = h.recovered;
      const from = centre(h.lastBlock.box);
      const to = centre(rec.box);
      const dx = from.x - to.x;
      const dy = from.y - to.y;
      await tween(mine, RISE_MS, (k) => {
        const a = easeOut(k);
        shift(rec.node, dx * (1 - a), dy * (1 - a));
      });
    }

    return {
      async render(
        next: EasyOneWayHardBackScene,
        _prev: EasyOneWayHardBackScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        if (destroyed) return;
        const mine = (gen += 1);
        const h = drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step.kind === 'multiply') {
          await playMultiply(mine, h, next);
        } else if (step.kind === 'divide') {
          await playFall(mine, h);
        } else if (step.kind === 'found') {
          if (h.recovered !== null) h.recovered.node.setAttribute('visibility', 'hidden');
          await playFall(mine, h);
          if (mine !== gen || destroyed) return;
          if (h.recovered !== null) h.recovered.node.removeAttribute('visibility');
          await playRise(mine, h);
        } else {
          return;
        }
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
