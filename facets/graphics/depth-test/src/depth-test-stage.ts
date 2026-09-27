/**
 * depth-test 무대 — 들어오는 행이 위의 칸줄에서 내려와 깊이 버퍼의 행에 닿는다.
 * 더 가까운 칸만 내려앉아 그 칸을 덮고, 멀거나 같은 판 뒤에 있는 칸은 칸줄로 되올라가 버려진 채 남는다.
 *
 * 격자의 칸 하나가 곧 색 버퍼 칸이자 깊이 버퍼 칸이다 — 칸의 색은 차지한 판, 칸의 수는 버퍼 깊이.
 */

import {
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { DepthTestScene, DepthTestStep, SceneCell } from './scene.js';

const H = 520;
const PAD = 16;
const LABEL_W = 30;
const CELL_MAX = 56;
const CAPTION_Y = 24;
const COUNTS_Y = 50;
const LANE_LABEL_Y = 74;
const LANE_TOP = 82;
const GRID_GAP = 28;
const BOTTOM = 40;
const DESCEND_MS = 380;
const RISE_MS = 320;
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Layout = { s: number; x0: number; laneY: number; gridY: number };

function layoutOf(scene: DepthTestScene): Layout {
  const byH = Math.floor((H - LANE_TOP - GRID_GAP - BOTTOM) / (scene.rows + 1));
  const byW = Math.floor((PIECE_CANVAS_W - 2 * PAD - LABEL_W) / scene.cols);
  const s = Math.min(CELL_MAX, byH, byW);
  if (s < 16) throw new Error(`depth-test-stage: 칸 ${s}px — 격자 ${scene.cols}×${scene.rows} 가 캔버스에 담기지 않는다`);
  const x0 = Math.round((PIECE_CANVAS_W - (LABEL_W + scene.cols * s)) / 2) + LABEL_W;
  return { s, x0, laneY: LANE_TOP, gridY: LANE_TOP + s + GRID_GAP };
}

function fmt(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function bytesOf(color: [number, number, number]): [number, number, number] {
  return [Math.round(color[0] * 255), Math.round(color[1] * 255), Math.round(color[2] * 255)];
}

/** 선형 0..1 색(자료)을 화면 색으로 — 감마 없이 그대로 바이트로 옮긴다. */
function cssOf(color: [number, number, number]): string {
  const [r, g, b] = bytesOf(color);
  return `rgb(${r}, ${g}, ${b})`;
}

function srgbLum(bytes: [number, number, number]): number {
  const lin = (v: number): number => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(bytes[0]) + 0.7152 * lin(bytes[1]) + 0.0722 * lin(bytes[2]);
}

function hexBytes(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m || !m[1]) throw new Error(`depth-test-stage: 토큰 ${hex} 가 #rrggbb 가 아니다`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 판 색 위의 글자 — 팔레트의 글자색과 바탕색 가운데 대비가 큰 쪽. */
function inkOn(color: [number, number, number], colors: Palette): string {
  const fill = srgbLum(bytesOf(color));
  const ratio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const onText = ratio(fill, srgbLum(hexBytes(colors.text)));
  const onBg = ratio(fill, srgbLum(hexBytes(colors.bg)));
  return onText >= onBg ? colors.text : colors.bg;
}

export const depthTestStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
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
      content: string,
      opts: { size: string; fill: string; anchor?: string; weight?: number; mono?: boolean },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      node.textContent = content;
      return node;
    }

    function plateColor(scene: DepthTestScene, id: string): [number, number, number] {
      const p = scene.plates.find((q) => q.id === id);
      if (!p) throw new Error(`depth-test-stage: 바탕에 없는 판 ${id}`);
      return p.color;
    }

    /** 칸 하나 — 판이 차지했으면 판 색, 아니면 빈 칸. 수는 그 칸의 깊이. */
    function cellTile(
      scene: DepthTestScene,
      parent: Element,
      x: number,
      y: number,
      s: number,
      owner: string | null,
      depth: number,
    ): SVGGElement {
      const g = el('g', { transform: `translate(${x}, ${y})` }, parent);
      if (owner === null) {
        el('rect', { x: 1, y: 1, width: s - 2, height: s - 2, rx: 3, fill: colors.bg, stroke: colors.border }, g);
        label(g, s / 2, s / 2, fmt(depth), { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle', mono: true });
      } else {
        const c = plateColor(scene, owner);
        el('rect', { x: 1, y: 1, width: s - 2, height: s - 2, rx: 3, fill: cssOf(c) }, g);
        label(g, s / 2, s / 2, fmt(depth), {
          size: fontSizes.xs,
          fill: inkOn(c, colors),
          anchor: 'middle',
          mono: true,
          weight: 600,
        });
      }
      return g;
    }

    /** 들어오는 칸 — 판 색에 새 깊이. `rejected` 면 흐리고 점선 테두리. */
    function incomingTile(
      scene: DepthTestScene,
      parent: Element,
      x: number,
      y: number,
      s: number,
      plate: string,
      depth: number,
      rejected: boolean,
    ): SVGGElement {
      const c = plateColor(scene, plate);
      const g = el('g', { transform: `translate(${x}, ${y})` }, parent);
      if (rejected) {
        el('rect', { x: 1, y: 1, width: s - 2, height: s - 2, rx: 3, fill: colors.bg }, g);
        el('rect', { x: 1, y: 1, width: s - 2, height: s - 2, rx: 3, fill: cssOf(c), 'fill-opacity': 0.35 }, g);
        el(
          'rect',
          { x: 1.5, y: 1.5, width: s - 3, height: s - 3, rx: 3, fill: 'none', stroke: colors.text, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' },
          g,
        );
        label(g, s / 2, s / 2, fmt(depth), { size: fontSizes.xs, fill: colors.text, anchor: 'middle', mono: true, weight: 600 });
      } else {
        el('rect', { x: 1, y: 1, width: s - 2, height: s - 2, rx: 3, fill: cssOf(c), stroke: colors.text, 'stroke-width': 1 }, g);
        label(g, s / 2, s / 2, fmt(depth), { size: fontSizes.xs, fill: inkOn(c, colors), anchor: 'middle', mono: true, weight: 600 });
      }
      return g;
    }

    function drawCaption(scene: DepthTestScene, step: DepthTestStep | null): void {
      const cx = PIECE_CANVAS_W / 2;
      if (!step) {
        label(svg, cx, CAPTION_Y, t('caption.start', 'Depth buffer, every cell: {z}', { z: fmt(scene.clear) }), {
          size: fontSizes.md,
          fill: colors.text,
          anchor: 'middle',
          weight: 600,
        });
        return;
      }
      label(svg, cx, CAPTION_Y, t('caption.row', 'Plate {plate} · row {row}', { plate: step.plate, row: step.row }), {
        size: fontSizes.md,
        fill: colors.text,
        anchor: 'middle',
        weight: 600,
      });
      // 셋의 수 — 표식과 함께, 폭을 셋으로 나눠 놓는다
      const third = (PIECE_CANVAS_W - 2 * PAD) / 3;
      const m = smPx;
      const c = plateColor(scene, step.plate);
      const slots: { key: 'wrote' | 'over' | 'rejected'; x: number }[] = [
        { key: 'wrote', x: PAD },
        { key: 'over', x: PAD + third },
        { key: 'rejected', x: PAD + 2 * third },
      ];
      for (const slot of slots) {
        const g = el('g', { transform: `translate(${slot.x + third / 2 - 60}, ${COUNTS_Y - m / 2})` }, svg);
        if (slot.key === 'wrote') {
          el('rect', { x: 0, y: 0, width: m, height: m, rx: 2, fill: cssOf(c) }, g);
          label(g, m + 6, m / 2, t('count.wrote', 'Written: {n}', { n: step.wrote }), { size: fontSizes.sm, fill: colors.text });
        } else if (slot.key === 'over') {
          el('rect', { x: 0, y: 0, width: m, height: m, rx: 2, fill: cssOf(c), stroke: colors.accent, 'stroke-width': 2.5 }, g);
          label(g, m + 6, m / 2, t('count.over', 'Overwritten: {n}', { n: step.over }), { size: fontSizes.sm, fill: colors.text });
        } else {
          el('rect', { x: 0, y: 0, width: m, height: m, rx: 2, fill: cssOf(c), 'fill-opacity': 0.35 }, g);
          el(
            'rect',
            { x: 0.5, y: 0.5, width: m - 1, height: m - 1, rx: 2, fill: 'none', stroke: colors.text, 'stroke-dasharray': '3 2' },
            g,
          );
          label(g, m + 6, m / 2, t('count.rejected', 'Discarded: {n}', { n: step.rejected }), { size: fontSizes.sm, fill: colors.text });
        }
      }
    }

    function drawStatic(scene: DepthTestScene): { lane: SVGGElement; L: Layout } {
      svg.textContent = '';
      const L = layoutOf(scene);
      const { s, x0, laneY, gridY } = L;
      const step = scene.step;
      drawCaption(scene, step);

      // 들어오는 칸줄
      label(svg, x0, LANE_LABEL_Y, t('label.incoming', 'Incoming row'), { size: fontSizes.xs, fill: colors.textMuted });
      el(
        'rect',
        { x: x0, y: laneY, width: scene.cols * s, height: s, rx: 4, fill: colors.bgSubtle, stroke: colors.border, 'stroke-dasharray': '4 4' },
        svg,
      );
      if (step) label(svg, x0 - LABEL_W / 2, laneY + s / 2, step.plate, { size: fontSizes.md, fill: colors.text, anchor: 'middle', weight: 700 });

      // 깊이 버퍼
      label(svg, x0, gridY - 10, t('label.buffer', 'Depth buffer'), { size: fontSizes.xs, fill: colors.textMuted });
      for (let r = 0; r < scene.rows; r += 1) {
        const y = gridY + r * s;
        const current = step !== null && step.row === r;
        label(svg, x0 - LABEL_W / 2, y + s / 2, String(r), {
          size: current ? fontSizes.sm : fontSizes.xs,
          fill: current ? colors.text : colors.textMuted,
          anchor: 'middle',
          weight: current ? 700 : 400,
          mono: true,
        });
        const depthRow = scene.depth[r];
        const ownerRow = scene.owner[r];
        if (!depthRow || !ownerRow) throw new Error(`depth-test-stage: 장면에 행 ${r} 이 없다`);
        for (let c = 0; c < scene.cols; c += 1) {
          const d = depthRow[c];
          const o = ownerRow[c];
          if (d === undefined || o === undefined) throw new Error(`depth-test-stage: 장면에 칸 (${c}, ${r}) 이 없다`);
          cellTile(scene, svg, x0 + c * s, y, s, o, d);
        }
      }

      const lane = el('g', {}, svg);
      if (step) {
        const y = gridY + step.row * s;
        // 이번 행 테두리
        el(
          'rect',
          { x: x0 - 3, y: y - 3, width: scene.cols * s + 6, height: s + 6, rx: 5, fill: 'none', stroke: colors.primary, 'stroke-width': 1.5 },
          svg,
        );
        // 덮어쓴 칸 — 강조 테두리
        for (const cell of step.cells) {
          if (cell.pass && cell.wasOwner !== null) {
            el(
              'rect',
              { x: x0 + cell.col * s + 2, y: y + 2, width: s - 4, height: s - 4, rx: 3, fill: 'none', stroke: colors.accent, 'stroke-width': 3 },
              svg,
            );
          }
        }
        // 버린 칸 — 칸줄에 남는다
        svg.appendChild(lane);
        for (const cell of step.cells) {
          if (!cell.pass) incomingTile(scene, lane, x0 + cell.col * s, laneY, s, step.plate, cell.depth, true);
        }
      }

      // 보이는 칸 수 — 판마다
      const legendY = H - BOTTOM / 2;
      const n = scene.plates.length;
      const slotW = (PIECE_CANVAS_W - 2 * PAD) / n;
      scene.plates.forEach((p, i) => {
        let visible = 0;
        for (const row of scene.owner) for (const o of row) if (o === p.id) visible += 1;
        const g = el('g', { transform: `translate(${PAD + i * slotW + slotW / 2 - 70}, ${legendY - smPx / 2})` }, svg);
        el('rect', { x: 0, y: 0, width: smPx, height: smPx, rx: 2, fill: cssOf(p.color) }, g);
        label(g, smPx + 6, smPx / 2, t('legend.visible', 'Plate {plate} · visible cells: {n}', { plate: p.id, n: visible }), {
          size: fontSizes.sm,
          fill: colors.text,
        });
      });
      return { lane, L };
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const id = setTimeout(() => {
          timers.delete(id);
          done();
        }, ms);
        timers.add(id);
      });
    }

    const ease = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

    /** 한 시계로 `ms` 동안 `frame(u)` 를 부른다. 세대가 바뀌면 false. */
    async function run(mine: number, ms: number, frame: (u: number) => void): Promise<boolean> {
      const start = Date.now();
      frame(0);
      for (;;) {
        if (mine !== gen || destroyed) return false;
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return false;
        const u = Math.min(1, (Date.now() - start) / ms);
        frame(ease(u));
        if (u >= 1) return true;
      }
    }

    async function animateRow(scene: DepthTestScene, step: DepthTestStep, mine: number): Promise<void> {
      const { lane, L } = drawStatic(scene);
      const { s, x0, laneY, gridY } = L;
      const rowY = gridY + step.row * s;
      // 정본의 버린 칸은 운동 동안 숨긴다 — 움직이는 칸이 그 자리를 대신한다
      lane.setAttribute('visibility', 'hidden');
      const layer = el('g', {}, svg);
      // 덮일 칸은 내려앉기 전까지 시험 앞 모습으로
      const covers: SVGGElement[] = [];
      for (const cell of step.cells) {
        if (cell.pass) covers.push(cellTile(scene, layer, x0 + cell.col * s, rowY, s, cell.wasOwner, cell.was));
      }
      const moving: { cell: SceneCell; g: SVGGElement }[] = step.cells.map((cell) => ({
        cell,
        g: incomingTile(scene, layer, x0 + cell.col * s, laneY, s, step.plate, cell.depth, false),
      }));
      const place = (g: SVGGElement, cell: SceneCell, y: number): void => {
        g.setAttribute('transform', `translate(${x0 + cell.col * s}, ${y})`);
      };

      const down = await run(mine, DESCEND_MS, (u) => {
        for (const m of moving) place(m.g, m.cell, laneY + (rowY - laneY) * u);
      });
      if (!down) return;
      // 통과한 칸은 내려앉았다 — 덮개와 함께 걷고 정본이 그 자리를 잇는다
      for (const g of covers) g.remove();
      for (const m of moving) if (m.cell.pass) m.g.remove();
      const losers = moving.filter((m) => !m.cell.pass);
      if (losers.length > 0) {
        const up = await run(mine, RISE_MS, (u) => {
          for (const m of losers) place(m.g, m.cell, rowY + (laneY - rowY) * u);
        });
        if (!up) return;
      }
      if (mine !== gen || destroyed) return;
      drawStatic(scene);
    }

    return {
      render(next: DepthTestScene, prev: DepthTestScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || prev === null || step === null || prev.step === step) {
          drawStatic(next);
          return;
        }
        return animateRow(next, step, mine);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
