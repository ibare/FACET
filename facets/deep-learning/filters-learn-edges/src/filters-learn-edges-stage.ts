/**
 * filters-learn-edges stage — 창은 위에 제자리로 서 있고, 아래 받침에 놓인 무늬가 하나씩
 * 올라와 창 왼쪽에 맞대어진다. 맞댈 때마다 응답 한 수가 나오고 받침의 그 자리에 응답
 * 막대가 선다. 끝에 무늬들이 응답 큰 것부터 받침 위를 옮겨 늘어선다.
 *
 * 무늬의 밝기(0 어두움 · 1 밝음)와 창의 무게(음수 어두움 · 양수 밝음)를 같은 회색 사다리로
 * 칠한다 — 창이 어느 무늬를 닮았는지 눈으로 견줄 수 있게. 이 회색은 그림의 내용이라
 * 테마에 따라 뒤집히지 않는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  lightColors,
  makeTranslator,
  PIECE_CANVAS_W,
  shiftLightness,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { responseReach } from './algorithm.js';
import type { FiltersLearnEdgesScene } from './scene.js';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 운동 길이 */
const PRESS_MS = 400;
const RANK_MS = 450;
const FRAME_MS = 16;

/** 세로 자리 (캔버스 높이 H 에 맞춘 띠) */
const CAPTION_Y = 22;
const TOP_LABEL_Y = 52;
const TOP_GRID_Y = 62;
const TOP_CELL_MAX = 44;
const TRAY_Y = 226;
const TRAY_CELL_MAX = 22;
const BAR_HALF = 40;

type Pos = { x: number; y: number; s: number };

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

/** 소수 한 자리 — 절반은 0 에서 먼 쪽, 음수는 앞에 빼기표 */
function fmt1(x: number): string {
  const r = (Math.sign(x) * Math.round(Math.abs(x) * 10)) / 10;
  return (r === 0 ? 0 : r).toFixed(1).replace('-', '−');
}

/** 밝기 0..1 → 테마와 무관한 회색 (그림의 내용) */
function gray(v: number): string {
  const clamped = Math.max(0, Math.min(1, v));
  return shiftLightness(lightColors.text, round(clamped * 0.8));
}

function inkOn(v: number): string {
  return v >= 0.5 ? lightColors.text : lightColors.textInverse;
}

function transformOf(p: Pos): string {
  return `translate(${round(p.x)} ${round(p.y)}) scale(${round(p.s * 1000) / 1000})`;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const filtersLearnEdgesStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const root = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    const names: Record<string, string> = {
      vertical: t('label.pattern.vertical', 'Vertical edge'),
      horizontal: t('label.pattern.horizontal', 'Horizontal edge'),
      flat: t('label.pattern.flat', 'Flat'),
      diagonal: t('label.pattern.diagonal', 'Diagonal'),
      reversed: t('label.pattern.reversed', 'Reversed edge'),
    };
    const nameOf = (id: string): string => {
      const name = names[id];
      if (name === undefined) throw new Error(`filters-learn-edges stage: 이름이 없는 무늬 ${id}`);
      return name;
    };

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /** 운동 손잡이 — drawStatic 이 매번 새로 짓는다 */
    let patternEls: SVGGElement[] = [];
    let slotEls: SVGGElement[] = [];
    let barEls: (SVGRectElement | null)[] = [];
    let readoutEl: SVGGElement | null = null;

    // ── 자리 셈 (캔버스에서 역산) ──
    function layout(scene: FiltersLearnEdgesScene) {
      const k = Math.max(1, scene.kernel.length);
      const n = Math.max(1, scene.patterns.length);
      const slotW = W / n;
      const cs = Math.min(TRAY_CELL_MAX, Math.floor((slotW - 24) / k));
      const readW = 150;
      const gap = 14;
      const ct = Math.min(TOP_CELL_MAX, Math.floor((W - readW - gap - 60) / (2 * k)));
      const pairW = 2 * k * ct + gap;
      const left = round((W - pairW - readW) / 2);
      const dock = { x: left, y: TOP_GRID_Y };
      const kernelX = left + k * ct + gap;
      const readX = kernelX + k * ct + 24;
      const nameY = TRAY_Y + k * cs + 16;
      const zeroY = nameY + 14 + BAR_HALF;
      const numY = zeroY + BAR_HALF + 18;
      return { k, n, slotW, cs, ct, dock, kernelX, readX, nameY, zeroY, numY };
    }
    type Layout = ReturnType<typeof layout>;

    function slotOf(scene: FiltersLearnEdgesScene, i: number): number {
      if (scene.order === null) return i;
      const at = scene.order.indexOf(i);
      return at < 0 ? i : at;
    }

    function trayPos(L: Layout, slot: number): Pos {
      return { x: round(slot * L.slotW + (L.slotW - L.k * L.cs) / 2), y: TRAY_Y, s: 1 };
    }

    function dockPos(L: Layout): Pos {
      return { x: L.dock.x, y: L.dock.y, s: L.ct / L.cs };
    }

    function drawPattern(cells: number[][], cs: number, parent: Element, framed: boolean): SVGGElement {
      const g = svg('g', {}, parent);
      cells.forEach((row, r) => {
        row.forEach((v, c) => {
          svg(
            'rect',
            {
              x: c * cs,
              y: r * cs,
              width: cs,
              height: cs,
              fill: gray(v),
              stroke: colors.textMuted,
              'stroke-width': 0.5,
              'vector-effect': 'non-scaling-stroke',
            },
            g,
          );
        });
      });
      const size = cells.length * cs;
      svg(
        'rect',
        {
          x: 0,
          y: 0,
          width: size,
          height: size,
          fill: 'none',
          stroke: framed ? colors.accent : colors.text,
          'stroke-width': framed ? 3 : 1,
          'vector-effect': 'non-scaling-stroke',
        },
        g,
      );
      return g;
    }

    function drawStatic(scene: FiltersLearnEdgesScene): void {
      root.textContent = '';
      patternEls = [];
      slotEls = [];
      barEls = [];
      readoutEl = null;
      if (scene.kernel.length === 0) return;
      const L = layout(scene);
      const reach = responseReach(scene.kernel);
      const maxAbsW = Math.max(...scene.kernel.flat().map((w) => Math.abs(w)));
      const topRank = scene.order !== null ? scene.order[0] : undefined;

      // 캡션 — 지금 일어나는 일만
      const caption = svg(
        'text',
        {
          x: W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        root,
      );
      const step = scene.step;
      if (step.kind === 'press') {
        caption.textContent = t('caption.press', 'Against the window: {name}. Response: {r}', {
          name: nameOf(scene.patterns[step.index]!.id),
          r: fmt1(scene.responses[step.index]!),
        });
      } else if (step.kind === 'rank' && scene.order !== null) {
        const first = scene.order[0]!;
        const last = scene.order[scene.order.length - 1]!;
        caption.textContent = t(
          'caption.rank',
          'Lined up by response. Largest: {top} ({hi}). Smallest: {bottom} ({lo}).',
          {
            top: nameOf(scene.patterns[first]!.id),
            hi: fmt1(scene.responses[first]!),
            bottom: nameOf(scene.patterns[last]!.id),
            lo: fmt1(scene.responses[last]!),
          },
        );
      } else {
        caption.textContent = t('caption.start', 'The window stays put. Patterns come to it one at a time.');
      }

      // 창 — 제자리
      const kLabel = svg(
        'text',
        {
          x: round(L.kernelX + (L.k * L.ct) / 2),
          y: TOP_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        root,
      );
      kLabel.textContent = t('label.window', 'Window');
      const kg = svg('g', { transform: `translate(${round(L.kernelX)} ${TOP_GRID_Y})` }, root);
      scene.kernel.forEach((row, r) => {
        row.forEach((w, c) => {
          const v = 0.5 + (0.5 * w) / maxAbsW;
          svg(
            'rect',
            {
              x: c * L.ct,
              y: r * L.ct,
              width: L.ct,
              height: L.ct,
              fill: gray(v),
              stroke: colors.textMuted,
              'stroke-width': 0.5,
            },
            kg,
          );
          const num = svg(
            'text',
            {
              x: round(c * L.ct + L.ct / 2),
              y: round(r * L.ct + L.ct / 2 + parseFloat(fontSizes.sm) * 0.35),
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: inkOn(v),
            },
            kg,
          );
          num.textContent = fmt1(w);
        });
      });
      svg(
        'rect',
        {
          x: 0,
          y: 0,
          width: L.k * L.ct,
          height: L.k * L.ct,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 1.5,
        },
        kg,
      );

      // 맞댄 자리 — 비어 있으면 자리만
      if (scene.docked === null) {
        svg(
          'rect',
          {
            x: L.dock.x,
            y: L.dock.y,
            width: L.k * L.ct,
            height: L.k * L.ct,
            fill: 'none',
            stroke: colors.ghostOutline,
            'stroke-dasharray': '4 4',
          },
          root,
        );
      } else {
        const dLabel = svg(
          'text',
          {
            x: round(L.dock.x + (L.k * L.ct) / 2),
            y: TOP_LABEL_Y,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          },
          root,
        );
        dLabel.textContent = nameOf(scene.patterns[scene.docked]!.id);

        // 응답 읽기
        const rg = svg('g', {}, root);
        const rl = svg(
          'text',
          {
            x: round(L.readX),
            y: round(TOP_GRID_Y + (L.k * L.ct) / 2 - 18),
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          },
          rg,
        );
        rl.textContent = t('label.response', 'Response');
        const rv = svg(
          'text',
          {
            x: round(L.readX),
            y: round(TOP_GRID_Y + (L.k * L.ct) / 2 + parseFloat(fontSizes.xl)),
            'font-family': fonts.mono,
            'font-size': `${parseFloat(fontSizes.xl) * 2}px`,
            'font-weight': 600,
            fill: colors.text,
          },
          rg,
        );
        rv.textContent = fmt1(scene.responses[scene.docked]!);
        readoutEl = rg;
      }

      // 받침 — 응답 막대의 0 선
      svg(
        'line',
        {
          x1: 12,
          x2: W - 12,
          y1: L.zeroY,
          y2: L.zeroY,
          stroke: colors.border,
          'stroke-width': 1,
        },
        root,
      );

      scene.patterns.forEach((p, i) => {
        const slot = slotOf(scene, i);
        const sx = round(slot * L.slotW);
        const cx = round(L.slotW / 2);
        const sg = svg('g', { transform: `translate(${sx} 0)` }, root);
        slotEls[i] = sg;

        if (scene.docked === i) {
          svg(
            'rect',
            {
              x: round((L.slotW - L.k * L.cs) / 2),
              y: TRAY_Y,
              width: L.k * L.cs,
              height: L.k * L.cs,
              fill: 'none',
              stroke: colors.ghostOutline,
              'stroke-dasharray': '3 3',
            },
            sg,
          );
        }

        const name = svg(
          'text',
          {
            x: cx,
            y: L.nameY,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          },
          sg,
        );
        name.textContent = nameOf(p.id);

        const r = scene.responses[i];
        if (r === null || r === undefined) {
          barEls[i] = null;
          return;
        }
        const hot = scene.docked === i || topRank === i;
        const h = round((Math.abs(r) / reach) * BAR_HALF);
        const bar = svg(
          'rect',
          {
            x: round(cx - 12),
            y: r >= 0 ? round(L.zeroY - h) : L.zeroY,
            width: 24,
            height: h,
            fill: hot ? colors.accent : colors.textMuted,
            stroke: colors.text,
            'stroke-width': 0.5,
          },
          sg,
        );
        barEls[i] = bar;
        const num = svg(
          'text',
          {
            x: cx,
            y: L.numY,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': hot ? 600 : 400,
            fill: colors.text,
          },
          sg,
        );
        num.textContent = fmt1(r);
      });

      // 무늬는 받침 위에, 맞댄 것은 창 곁에 — 슬롯 무리 위로 그려 움직일 때 가리지 않게
      scene.patterns.forEach((p, i) => {
        const docked = scene.docked === i;
        const g = drawPattern(p.cells, L.cs, root, docked || topRank === i);
        g.setAttribute('transform', transformOf(docked ? dockPos(L) : trayPos(L, slotOf(scene, i))));
        patternEls[i] = g;
      });
    }

    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let wake: (() => void) | null = null;
        const finish = () => {
          if (wake !== null) waiters.delete(wake);
          resolve();
        };
        wake = () => resolve();
        waiters.add(wake);
        const tick = () => {
          if (destroyed || mine !== gen) return finish();
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(ease(p));
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function place(el: SVGGElement | undefined, a: Pos, b: Pos, p: number): void {
      if (el === undefined) return;
      el.setAttribute(
        'transform',
        transformOf({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), s: lerp(a.s, b.s, p) }),
      );
    }

    async function animatePress(mine: number, next: FiltersLearnEdgesScene, index: number, was: number | null) {
      const L = layout(next);
      const toDock = dockPos(L);
      const fromTray = trayPos(L, slotOf(next, index));
      const bar = barEls[index] ?? null;
      const r = next.responses[index];
      const reach = responseReach(next.kernel);
      const fullH = r === null || r === undefined ? 0 : round((Math.abs(r) / reach) * BAR_HALF);
      const readout = readoutEl;
      const frame = (p: number) => {
        place(patternEls[index], fromTray, toDock, p);
        if (was !== null) place(patternEls[was], toDock, trayPos(L, slotOf(next, was)), p);
        if (bar !== null && r !== null && r !== undefined) {
          const h = round(fullH * p);
          bar.setAttribute('height', String(h));
          bar.setAttribute('y', String(r >= 0 ? round(L.zeroY - h) : L.zeroY));
        }
        if (readout !== null) readout.setAttribute('opacity', String(round(p)));
      };
      frame(0);
      await tween(mine, PRESS_MS, frame);
    }

    async function animateRank(mine: number, next: FiltersLearnEdgesScene, was: number | null) {
      const L = layout(next);
      const frame = (p: number) => {
        next.patterns.forEach((_, i) => {
          const to = trayPos(L, slotOf(next, i));
          const from = i === was ? dockPos(L) : trayPos(L, i);
          place(patternEls[i], from, to, p);
          const sg = slotEls[i];
          if (sg !== undefined) {
            sg.setAttribute('transform', `translate(${round(lerp(i * L.slotW, slotOf(next, i) * L.slotW, p))} 0)`);
          }
        });
      };
      frame(0);
      await tween(mine, RANK_MS, frame);
    }

    return {
      async render(next: FiltersLearnEdgesScene, _prev: FiltersLearnEdgesScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        const step = next.step;
        if (step.kind === 'press') await animatePress(mine, next, step.index, step.was);
        else if (step.kind === 'rank') await animateRank(mine, next, step.was);
        else return;
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of waiters) wake();
        waiters.clear();
        root.textContent = '';
      },
    };
  },
};
