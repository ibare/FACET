/**
 * 폴링과 인터럽트 stage — 두 CPU 의 틱이 각자 기둥으로 쌓인다.
 *
 * 왼쪽 기둥은 폴링 CPU, 오른쪽 기둥은 인터럽트 CPU, 가운데는 장치. 한 틱에 두 기둥에
 * 한 칸씩 올라간다. 폴링 쪽 칸은 장치에게 "준비됐나?" 를 보내고 돌아온 대답이 장치에서
 * 날아와 앉는다. 인터럽트 쪽 칸은 CPU 가 스스로 한 딴 일이라 위에서 떨어진다 — 장치가
 * 부르는 틱에만 부름이 장치에서 건너온다. 같은 높이의 칸은 같은 틱이다.
 *
 * 셈은 하지 않는다 — 장면의 자취에서 개수만 센다.
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
} from '@ffacet/core/runtime';
import type { IntrWork, PollWork } from './algorithm.js';
import type { PollingVsInterruptScene, TickRow } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const H = 400;
const HEAD_Y = 24;
const COUNT_Y = 48;
const PILE_TOP = 72;
const FLOOR = H - 50;
const CAPTION_Y = H - 18;
const PITCH_MAX = 30;
const GAP = 4;
const PILE_W_MAX = 170;
const DEVICE_W_MAX = 130;
const DEVICE_H = 76;
const CHIP_H = 20;
/** 한 틱의 운동. 대답이 오가는 칸은 앞 몫에 물음(또는 부름)이 건너가고 뒤 몫에 칸이 앉는다 */
const MOTION_MS = 640;
const SPLIT = 0.45;

const SM_PX = parseFloat(fontSizes.sm);

function round(n: number): number {
  const v = Math.round(n * 10) / 10;
  return v === 0 ? 0 : v;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

type Layout = {
  w: number;
  leftX: number;
  rightX: number;
  midX: number;
  pileW: number;
  pitch: number;
  blockH: number;
  labelPx: number;
  devW: number;
  devY: number;
};

function layoutFor(slots: number): Layout {
  const w = PIECE_CANVAS_W;
  const pitch = Math.min(PITCH_MAX, (FLOOR - PILE_TOP) / Math.max(slots, 1));
  const blockH = pitch - GAP;
  return {
    w,
    leftX: w * 0.2,
    rightX: w * 0.8,
    midX: w / 2,
    pileW: Math.min(PILE_W_MAX, w * 0.27),
    pitch,
    blockH,
    labelPx: Math.min(SM_PX, blockH * 0.62),
    devW: Math.min(DEVICE_W_MAX, w * 0.22),
    devY: (PILE_TOP + FLOOR) / 2,
  };
}

/** i 번째 칸 (0 이 바닥) 의 가운데 y */
function slotY(lay: Layout, i: number): number {
  return FLOOR - i * lay.pitch - lay.pitch / 2;
}

type Look = { fill: string; stroke: string; strokeW: number; ink: string; text: string };

function pollLook(c: Palette, tr: Translate, work: PollWork): Look {
  if (work === 'no') {
    return { fill: c.bgSubtle, stroke: c.ghostOutline, strokeW: 1, ink: c.textMuted, text: tr('block.no', 'No') };
  }
  if (work === 'yes') {
    return { fill: c.bg, stroke: c.text, strokeW: 1.5, ink: c.text, text: tr('block.yes', 'Yes') };
  }
  return { fill: c.accent, stroke: c.accent, strokeW: 1, ink: c.stateInk, text: tr('block.take', 'Take data') };
}

function intrLook(c: Palette, tr: Translate, work: IntrWork): Look {
  if (work === 'other') {
    return { fill: c.primary, stroke: c.primary, strokeW: 1, ink: c.textInverse, text: tr('block.other', 'Other work') };
  }
  if (work === 'enter') {
    return {
      fill: c.itemComparing,
      stroke: c.itemComparing,
      strokeW: 1,
      ink: c.stateInk,
      text: tr('block.enter', 'Enter handler'),
    };
  }
  return { fill: c.accent, stroke: c.accent, strokeW: 1, ink: c.stateInk, text: tr('block.take', 'Take data') };
}

export const pollingVsInterruptStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let pollBlocks: SVGGElement[] = [];
    let intrBlocks: SVGGElement[] = [];

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      str: string,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end' = 'middle',
      weight = 400,
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x: round(x),
        y: round(y),
        'text-anchor': anchor,
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': size,
        'font-weight': weight,
        fill,
      });
      node.textContent = str;
      return node;
    }

    function block(parent: Element, lay: Layout, x: number, y: number, look: Look): SVGGElement {
      const g = el(parent, 'g', { transform: `translate(${round(x)},${round(y)})` });
      el(g, 'rect', {
        x: round(-lay.pileW / 2),
        y: round(-lay.blockH / 2),
        width: round(lay.pileW),
        height: round(lay.blockH),
        rx: 4,
        fill: look.fill,
        stroke: look.stroke,
        'stroke-width': look.strokeW,
      });
      label(g, 0, 0, look.text, `${round(lay.labelPx)}px`, look.ink);
      return g;
    }

    function chip(parent: Element, str: string, stroke: string): SVGGElement {
      const g = el(parent, 'g', {});
      const wChip = str.length * SM_PX * 0.62 + 16;
      el(g, 'rect', {
        x: round(-wChip / 2),
        y: -CHIP_H / 2,
        width: round(wChip),
        height: CHIP_H,
        rx: CHIP_H / 2,
        fill: c.bg,
        stroke,
        'stroke-width': 1.5,
      });
      label(g, 0, 0, str, fontSizes.sm, stroke);
      return g;
    }

    function captionFor(scene: PollingVsInterruptScene): string {
      const step = scene.step;
      if (step === null) {
        return tr('caption.start', 'The device starts working. Neither CPU knows when it will be ready.');
      }
      if (step.poll === 'take' || step.intr === 'take') {
        if (scene.pollDone !== null && scene.intrDone !== null) {
          return tr('caption.done', 'Polling done: t = {p} · Interrupt done: t = {q}', {
            p: scene.pollDone,
            q: scene.intrDone,
          });
        }
        return tr('caption.take', 'Taking the data.');
      }
      if (step.ready) {
        return tr('caption.ready', 'Ready: polling hears yes, the interrupt CPU is called in.');
      }
      return tr('caption.wait', 'Not ready: polling hears no, the interrupt CPU does other work.');
    }

    function drawStatic(scene: PollingVsInterruptScene): Layout {
      svg.textContent = '';
      const lay = layoutFor(scene.slots);
      const rows: TickRow[] = scene.rows;

      // 머리 — 두 CPU 와 장치
      label(svg, lay.leftX, HEAD_Y, tr('label.polling', 'Polling CPU'), fontSizes.md, c.text, 'middle', 600);
      label(svg, lay.rightX, HEAD_Y, tr('label.interrupt', 'Interrupt CPU'), fontSizes.md, c.text, 'middle', 600);

      // 개수 — 자취에서 센다. 폴링은 묻기, 인터럽트는 딴 일
      const asks = rows.filter((r) => r.poll === 'no' || r.poll === 'yes').length;
      const other = rows.filter((r) => r.intr === 'other').length;
      label(svg, lay.leftX, COUNT_Y, tr('label.asks', 'Asks: {n}', { n: asks }), fontSizes.md, c.text);
      label(svg, lay.rightX, COUNT_Y, tr('label.other', 'Other work: {n}', { n: other }), fontSizes.md, c.text);

      // 바닥
      for (const x of [lay.leftX, lay.rightX]) {
        el(svg, 'line', {
          x1: round(x - lay.pileW / 2 - 6),
          x2: round(x + lay.pileW / 2 + 6),
          y1: FLOOR,
          y2: FLOOR,
          stroke: c.textMuted,
          'stroke-width': 1.5,
        });
      }

      // 틱 번호 — 같은 높이가 같은 틱
      rows.forEach((r, i) => {
        label(svg, lay.leftX - lay.pileW / 2 - 10, slotY(lay, i), String(r.tick), fontSizes.xs, c.textMuted, 'end');
      });

      // 두 쪽이 함께 받아 간 칸을 잇는다
      rows.forEach((r, i) => {
        if (r.poll === 'take' && r.intr === 'take') {
          el(svg, 'line', {
            x1: round(lay.leftX + lay.pileW / 2 + 4),
            x2: round(lay.rightX - lay.pileW / 2 - 4),
            y1: round(slotY(lay, i)),
            y2: round(slotY(lay, i)),
            stroke: c.accent,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 4',
          });
        }
      });

      // 장치
      const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
      const ready = last !== undefined && last.ready;
      const dev = el(svg, 'g', { transform: `translate(${round(lay.midX)},${round(lay.devY)})` });
      el(dev, 'rect', {
        x: round(-lay.devW / 2),
        y: -DEVICE_H / 2,
        width: round(lay.devW),
        height: DEVICE_H,
        rx: 6,
        fill: c.bgSubtle,
        stroke: ready ? c.text : c.ghostOutline,
        'stroke-width': ready ? 2 : 1,
      });
      label(dev, 0, -22, tr('label.device', 'Device'), fontSizes.md, c.text, 'middle', 600);
      label(
        dev,
        0,
        0,
        ready ? tr('label.ready', 'Ready') : tr('label.working', 'Working…'),
        fontSizes.sm,
        ready ? c.text : c.textMuted,
        'middle',
        ready ? 600 : 400,
      );
      if (last !== undefined) {
        label(dev, 0, 22, tr('label.tick', 'Tick: {k}', { k: last.tick }), fontSizes.xs, c.textMuted);
      }

      // 두 기둥
      pollBlocks = [];
      intrBlocks = [];
      rows.forEach((r, i) => {
        const y = slotY(lay, i);
        if (r.poll !== null) pollBlocks[i] = block(svg, lay, lay.leftX, y, pollLook(c, tr, r.poll));
        if (r.intr !== null) intrBlocks[i] = block(svg, lay, lay.rightX, y, intrLook(c, tr, r.intr));
      });

      label(svg, lay.midX, CAPTION_Y, captionFor(scene), fontSizes.sm, c.text);
      return lay;
    }

    function clock(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        if (destroyed) {
          wake();
          return;
        }
        frame(0);
        let start: number | null = null;
        const schedule = (): void => {
          const id = requestAnimationFrame((now) => {
            frames.delete(id);
            if (destroyed || mine !== gen) {
              wake();
              return;
            }
            if (start === null) start = now;
            const p = Math.min(1, (now - start) / ms);
            frame(p);
            if (p >= 1) wake();
            else schedule();
          });
          frames.add(id);
        };
        schedule();
      });
    }

    function place(g: SVGGElement, x: number, y: number): void {
      g.setAttribute('transform', `translate(${round(x)},${round(y)})`);
    }

    async function flow(scene: PollingVsInterruptScene, lay: Layout, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      const i = scene.rows.length - 1;
      const y = slotY(lay, i);
      const devL = lay.midX - lay.devW / 2;
      const devR = lay.midX + lay.devW / 2;
      const dropFrom = PILE_TOP - lay.pitch / 2;

      const pBlock = pollBlocks[i];
      const iBlock = intrBlocks[i];

      // 폴링 쪽 — 묻기는 물음이 건너가고 대답이 돌아와 앉는다. 받기는 스스로 한 일이라 떨어진다
      let pFrame: (p: number) => void = () => {};
      if (pBlock !== undefined && (step.poll === 'no' || step.poll === 'yes')) {
        const ask = chip(svg, tr('chip.ask', 'Ready?'), c.textMuted);
        const ax0 = lay.leftX + lay.pileW / 2 - 20;
        const ax1 = devL - 30;
        const bx0 = devL - lay.pileW / 2 + 20;
        pFrame = (p) => {
          if (p < SPLIT) {
            const q = ease(p / SPLIT);
            ask.removeAttribute('visibility');
            place(ask, lerp(ax0, ax1, q), lerp(y, lay.devY, q));
            pBlock.setAttribute('visibility', 'hidden');
          } else {
            const q = ease((p - SPLIT) / (1 - SPLIT));
            ask.setAttribute('visibility', 'hidden');
            pBlock.removeAttribute('visibility');
            place(pBlock, lerp(bx0, lay.leftX, q), lerp(lay.devY, y, q));
          }
        };
      } else if (pBlock !== undefined) {
        pFrame = (p) => place(pBlock, lay.leftX, lerp(dropFrom, y, ease(p)));
      }

      // 인터럽트 쪽 — 딴 일과 받기는 떨어진다. 들어가기는 부름이 장치에서 건너온 뒤 떨어진다
      let iFrame: (p: number) => void = () => {};
      if (iBlock !== undefined && step.intr === 'enter') {
        const call = chip(svg, tr('chip.call', 'Call'), c.itemComparing);
        const cx0 = devR + 24;
        const cx1 = lay.rightX - lay.pileW / 2 + 24;
        iFrame = (p) => {
          if (p < SPLIT) {
            const q = ease(p / SPLIT);
            call.removeAttribute('visibility');
            place(call, lerp(cx0, cx1, q), lerp(lay.devY, y, q));
            place(iBlock, lay.rightX, dropFrom);
            iBlock.setAttribute('visibility', 'hidden');
          } else {
            const q = ease((p - SPLIT) / (1 - SPLIT));
            call.setAttribute('visibility', 'hidden');
            iBlock.removeAttribute('visibility');
            place(iBlock, lay.rightX, lerp(dropFrom, y, q));
          }
        };
      } else if (iBlock !== undefined) {
        iFrame = (p) => place(iBlock, lay.rightX, lerp(dropFrom, y, ease(p)));
      }

      await clock(MOTION_MS, mine, (p) => {
        pFrame(p);
        iFrame(p);
      });
    }

    return {
      render(
        next: PollingVsInterruptScene,
        _prev: PollingVsInterruptScene | null,
        opts: { animate: boolean },
      ): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const lay = drawStatic(next);
        if (!opts.animate || next.step === null) return;
        return flow(next, lay, mine).then(() => {
          if (mine !== gen || destroyed) return;
          drawStatic(next);
        });
      },

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
