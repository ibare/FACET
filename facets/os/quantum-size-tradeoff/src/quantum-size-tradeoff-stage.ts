/**
 * quantum-size-tradeoff 무대 — 같은 일감이 두 몫으로 나란히 같은 틱을 지난다.
 *
 * 쪽마다 CPU 띠가 하나 있다. 틱마다 일감의 조각 하나가 제 줄에서 띠의 그 칸으로 날아가 앉는다.
 * 주인이 바뀌는 칸에는 자름 자국이 서고, 그 수가 바뀜이다 — 몫이 작으면 띠가 잘게 쪼개진다.
 * 띠 아래 일감마다의 선은 도착에서 처음 오른 틱까지의 길이, 곧 첫 응답이다.
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
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { QuantumSizeTradeoffScene, SceneSlot } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 340;
const PAD = 16;
const AXIS_Y = 18;
const SIDE_TOP = 30;
const SIDE_H = 124;
const RIBBON_DY = 24;
const RIBBON_H = 28;
const ROWS_DY = 62;
const ROWS_SPAN = 54;
const RIBBON_X_MIN = 196;
const MOTION_MS = 280;
const FRAME_MS = 16;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function symbolOf(id: string | null): string {
  if (id === null) throw new Error('quantum-size-tradeoff-stage: 이름을 붙일 식별자가 없다');
  return id.toUpperCase();
}

function must<V>(v: V | null | undefined, what: string): V {
  if (v === null || v === undefined) throw new Error(`quantum-size-tradeoff-stage: ${what} 가 없다`);
  return v;
}

type Layout = {
  ribbonX: number;
  slotW: number;
  rowH: number;
  tileStep: number;
  tileSize: number;
};

function layoutOf(scene: QuantumSizeTradeoffScene): Layout {
  const ticks = Math.max(1, scene.ticks);
  const ribbonX = RIBBON_X_MIN;
  const slotW = (PIECE_CANVAS_W - PAD - ribbonX) / ticks;
  const n = Math.max(1, scene.procs.length);
  const rowH = Math.min(18, ROWS_SPAN / n);
  const maxBurst = Math.max(1, ...scene.procs.map((p) => p.burst));
  const tileArea = ribbonX - 14 - (PAD + 18);
  const tileStep = Math.min(15, tileArea / maxBurst);
  const tileSize = Math.max(3, Math.min(tileStep - 3, rowH - 5));
  return { ribbonX, slotW, rowH, tileStep, tileSize };
}

export const quantumSizeTradeoffStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const sm = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) return resolve();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    /** 쪽 i 의 틱 k 칸 가운데 */
    function slotCenter(L: Layout, side: number, k: number): { x: number; y: number } {
      const top = SIDE_TOP + side * SIDE_H;
      return { x: L.ribbonX + (k + 0.5) * L.slotW, y: top + RIBBON_DY + RIBBON_H / 2 };
    }

    /** 쪽 i 의 일감 row 의 j 번째 조각 가운데 */
    function tileCenter(L: Layout, side: number, row: number, j: number): { x: number; y: number } {
      const top = SIDE_TOP + side * SIDE_H;
      return {
        x: PAD + 18 + j * L.tileStep + L.tileSize / 2,
        y: top + ROWS_DY + row * L.rowH + L.rowH / 2,
      };
    }

    type Handles = {
      /** 쪽마다 이번 틱에 앉은 칸 */
      landed: Array<SVGGElement | null>;
      /** 쪽마다 이번 틱의 자름 자국 */
      cuts: Array<{ line: SVGLineElement; mid: number } | null>;
      /** 아직 첫 응답이 없는 일감의 기다리는 선 (끝이 커서에 붙어 있다) */
      waiting: SVGLineElement[];
      cursors: SVGLineElement[];
      cursorX: number;
    };

    function drawStatic(scene: QuantumSizeTradeoffScene): Handles {
      svg.textContent = '';
      const handles: Handles = { landed: [], cuts: [], waiting: [], cursors: [], cursorX: 0 };
      if (scene.procs.length === 0 || scene.quanta.length === 0) return handles;
      const L = layoutOf(scene);
      const palette = categorical(scene.procs.length);
      const colorOf = (id: string): string => {
        const i = scene.procs.findIndex((p) => p.id === id);
        if (i < 0) throw new Error(`quantum-size-tradeoff-stage: 모르는 식별자 ${id}`);
        return palette[i] as string;
      };
      const root = el(svg, 'g', {});
      const done = scene.sides.length > 0 ? (scene.sides[0] as SceneSlot[]).length : 0;
      const cursorX = L.ribbonX + done * L.slotW;
      handles.cursorX = cursorX;

      // 틱 눈금 — 두 쪽이 같은 틱을 지난다
      el(root, 'text', {
        x: PAD,
        y: AXIS_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }, t('label.ticks', 'tick'));
      for (let k = 0; k <= scene.ticks; k += 1) {
        el(root, 'text', {
          x: L.ribbonX + k * L.slotW,
          y: AXIS_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: k === done ? colors.text : colors.textMuted,
          'font-weight': k === done ? 'bold' : 'normal',
        }, String(k));
      }

      scene.quanta.forEach((q, side) => {
        const top = SIDE_TOP + side * SIDE_H;
        const slots = scene.sides[side] ?? [];
        const totals = scene.totals?.[side] ?? null;
        const switches = slots.filter((s) => s.switched).length;

        // 머리 줄 — 몫 · 바뀜 · (끝나면) 첫 응답 평균
        el(root, 'text', {
          x: PAD,
          y: top + 14,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 'bold',
          fill: colors.text,
        }, t('label.side', 'Quantum {q}', { q }));
        el(root, 'text', {
          x: L.ribbonX,
          y: top + 14,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 'bold',
          fill: colors.itemSwapping,
        }, t('label.switches', 'Switches: {n}', { n: switches }));
        if (totals !== null) {
          el(root, 'text', {
            x: PIECE_CANVAS_W - PAD,
            y: top + 14,
            'text-anchor': 'end',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            'font-weight': 'bold',
            fill: colors.text,
          }, t('label.avgResp', 'Avg first run: {v}', { v: (totals.respSum / totals.count).toFixed(2) }));
        }

        // CPU 띠
        const rTop = top + RIBBON_DY;
        el(root, 'text', {
          x: PAD,
          y: rTop + RIBBON_H / 2 + sm / 3,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        }, t('label.cpu', 'CPU'));
        el(root, 'rect', {
          x: L.ribbonX,
          y: rTop,
          width: L.slotW * scene.ticks,
          height: RIBBON_H,
          rx: 3,
          fill: colors.bgSubtle,
          stroke: colors.border,
        });
        slots.forEach((slot, k) => {
          if (slot.pid === null) return;
          const next = slots[k + 1];
          const gapL = slot.switched ? 2 : 0;
          const gapR = next !== undefined && next.switched ? 2 : 0;
          const g = el(root, 'g', {});
          el(g, 'rect', {
            x: L.ribbonX + k * L.slotW + gapL,
            y: rTop + 2,
            width: L.slotW - gapL - gapR,
            height: RIBBON_H - 4,
            fill: colorOf(slot.pid),
          });
          el(g, 'text', {
            x: L.ribbonX + (k + 0.5) * L.slotW,
            y: rTop + RIBBON_H / 2 + sm / 3,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 'bold',
            fill: colors.textInverse,
          }, symbolOf(slot.pid));
          if (k === done - 1) handles.landed[side] = g;
        });
        // 자름 자국 — 바뀜 하나에 하나
        slots.forEach((slot, k) => {
          if (!slot.switched) return;
          const line = el(root, 'line', {
            x1: L.ribbonX + k * L.slotW,
            x2: L.ribbonX + k * L.slotW,
            y1: rTop - 5,
            y2: rTop + RIBBON_H + 5,
            stroke: colors.itemSwapping,
            'stroke-width': 2,
          });
          if (k === done - 1) handles.cuts[side] = { line, mid: rTop + RIBBON_H / 2 };
        });

        // 일감 줄 — 남은 조각과 첫 응답의 길이
        scene.procs.forEach((p, row) => {
          const color = colorOf(p.id);
          const cy = top + ROWS_DY + row * L.rowH + L.rowH / 2;
          el(root, 'text', {
            x: PAD,
            y: cy + sm / 3,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': 'bold',
            fill: colors.text,
          }, symbolOf(p.id));
          const used = slots.filter((s) => s.pid === p.id).length;
          const left = p.burst - used;
          for (let j = 0; j < p.burst; j += 1) {
            const c = tileCenter(L, side, row, j);
            el(root, 'rect', {
              x: c.x - L.tileSize / 2,
              y: c.y - L.tileSize / 2,
              width: L.tileSize,
              height: L.tileSize,
              rx: 1.5,
              fill: j < left ? color : 'none',
              stroke: j < left ? color : colors.border,
            });
          }
          const ax = L.ribbonX + p.arrival * L.slotW;
          const firstK = slots.findIndex((s) => s.pid === p.id && s.response !== null);
          if (firstK >= 0) {
            const firstSlot = slots[firstK] as SceneSlot;
            const sx = L.ribbonX + firstK * L.slotW;
            if (sx - ax > 0.5) {
              el(root, 'line', { x1: ax, x2: sx, y1: cy, y2: cy, stroke: color, 'stroke-width': 3 });
            }
            el(root, 'line', { x1: sx, x2: sx, y1: cy - 5, y2: cy + 5, stroke: color, 'stroke-width': 2 });
            el(root, 'text', {
              x: sx + 6,
              y: cy + sm / 3,
              'font-family': fonts.body,
              'font-size': fontSizes.sm,
              fill: colors.text,
            }, t('label.firstRun', 'First run: {n}', { n: must(firstSlot.response, '첫 응답') }));
          } else if (p.arrival <= done && cursorX - ax > 0.5) {
            const line = el(root, 'line', {
              x1: ax,
              x2: cursorX,
              y1: cy,
              y2: cy,
              stroke: colors.textMuted,
              'stroke-width': 2,
              'stroke-dasharray': '4 3',
            });
            handles.waiting.push(line);
          }
        });
      });

      // 커서 — 두 쪽이 함께 지난 틱 (머리 줄은 비켜 간다)
      if (scene.ticks > 0) {
        scene.quanta.forEach((_q, side) => {
          const top = SIDE_TOP + side * SIDE_H;
          handles.cursors.push(
            el(root, 'line', {
              x1: cursorX,
              x2: cursorX,
              y1: top + RIBBON_DY - 6,
              y2: top + ROWS_DY + ROWS_SPAN,
              stroke: colors.primary,
              'stroke-width': 1.5,
              opacity: 0.6,
            }),
          );
        });
      }

      // 캡션 — 지금 일어나는 일
      const [line1, line2] = captionOf(scene);
      const capY = SIDE_TOP + scene.quanta.length * SIDE_H + 22;
      el(root, 'text', {
        x: PAD,
        y: capY,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      }, line1);
      if (line2 !== '') {
        el(root, 'text', {
          x: PAD,
          y: capY + 22,
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.textMuted,
        }, line2);
      }
      return handles;
    }

    function captionOf(scene: QuantumSizeTradeoffScene): [string, string] {
      const qa = must(scene.quanta[0], '첫째 몫');
      const qb = must(scene.quanta[1], '둘째 몫');
      const step = scene.step;
      if (step.kind === 'start') {
        const ready = scene.procs.filter((p) => p.arrival === 0).length;
        return [t('caption.start', 'Tick 0 — ready jobs: {n}', { n: ready }), ''];
      }
      if (step.kind === 'end') {
        const ta = scene.totals?.[0];
        const tb = scene.totals?.[1];
        if (ta === undefined || tb === undefined) throw new Error('quantum-size-tradeoff-stage: 끝 장면에 합계가 없다');
        return [
          t('caption.endSwitch', 'Switches — quantum {qa}: {sa} · quantum {qb}: {sb}', {
            qa,
            qb,
            sa: ta.switches,
            sb: tb.switches,
          }),
          t('caption.endResp', 'Average first run — quantum {qa}: {ra} · quantum {qb}: {rb}', {
            qa,
            qb,
            ra: (ta.respSum / ta.count).toFixed(2),
            rb: (tb.respSum / tb.count).toFixed(2),
          }),
        ];
      }
      const a = scene.sides[0]?.[step.tick];
      const b = scene.sides[1]?.[step.tick];
      if (a === undefined || b === undefined) throw new Error('quantum-size-tradeoff-stage: 이번 틱의 칸이 없다');
      const idle = t('label.idle', 'idle');
      const line1 = t('caption.tick', 'Tick {tick} — quantum {qa}: {pa} · quantum {qb}: {pb}', {
        tick: step.tick,
        qa,
        qb,
        pa: a.pid === null ? idle : symbolOf(a.pid),
        pb: b.pid === null ? idle : symbolOf(b.pid),
      });
      let line2: string;
      if (a.switched && b.switched) {
        line2 = t('caption.switchBoth', 'Both switch: {fa} → {ta} and {fb} → {tb}.', {
          fa: symbolOf(a.from),
          ta: symbolOf(a.pid),
          fb: symbolOf(b.from),
          tb: symbolOf(b.pid),
        });
      } else if (a.switched || b.switched) {
        const s = a.switched ? a : b;
        line2 = t('caption.switchOne', 'Switch only on quantum {q}: {from} → {to}.', {
          q: a.switched ? qa : qb,
          from: symbolOf(s.from),
          to: symbolOf(s.pid),
        });
      } else if (step.tick === 0) {
        line2 = t('caption.firstPick', 'The first pick is not a switch.');
      } else {
        line2 = t('caption.noSwitch', 'No switch on either side.');
      }
      return [line1, line2];
    }

    async function render(
      next: QuantumSizeTradeoffScene,
      _prev: QuantumSizeTradeoffScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const handles = drawStatic(next);
      if (!opts.animate || destroyed || next.step.kind !== 'tick') return;
      const step = next.step;
      const L = layoutOf(next);

      // 이번 틱에 앉을 조각이 제 줄에서 띠의 칸까지 아직 못 온 만큼
      const flights = next.quanta.map((_q, side) => {
        const g = handles.landed[side];
        const slot = next.sides[side]?.[step.tick];
        if (g === undefined || g === null || slot === undefined || slot.pid === null) return null;
        const row = next.procs.findIndex((p) => p.id === slot.pid);
        const proc = next.procs[row];
        if (proc === undefined) throw new Error(`quantum-size-tradeoff-stage: 모르는 식별자 ${slot.pid}`);
        const used = (next.sides[side] ?? []).filter((s) => s.pid === slot.pid).length;
        const from = tileCenter(L, side, row, proc.burst - used);
        const to = slotCenter(L, side, step.tick);
        return { g, from, to };
      });
      const cursorTo = handles.cursorX;

      const apply = (p: number): void => {
        const e = ease(p);
        for (const f of flights) {
          if (f === null) continue;
          const cx = f.from.x + (f.to.x - f.from.x) * e;
          const cy = f.from.y + (f.to.y - f.from.y) * e;
          const sx = (L.tileSize + (L.slotW - L.tileSize) * e) / L.slotW;
          const sy = (L.tileSize + (RIBBON_H - 4 - L.tileSize) * e) / (RIBBON_H - 4);
          f.g.setAttribute(
            'transform',
            `translate(${round(cx)},${round(cy)}) scale(${round(sx * 1000) / 1000},${round(sy * 1000) / 1000}) translate(${round(-f.to.x)},${round(-f.to.y)})`,
          );
        }
        const c = Math.max(0, (p - 0.55) / 0.45);
        for (const cut of handles.cuts) {
          if (cut === null || cut === undefined) continue;
          const { line, mid } = cut;
          line.setAttribute('transform', `translate(0,${round(mid * (1 - c))}) scale(1,${round(c * 1000) / 1000})`);
        }
        const x = cursorTo - L.slotW * (1 - e);
        for (const cursor of handles.cursors) {
          cursor.setAttribute('x1', String(round(x)));
          cursor.setAttribute('x2', String(round(x)));
        }
        for (const line of handles.waiting) line.setAttribute('x2', String(round(x)));
      };

      apply(0);
      const t0 = Date.now();
      for (;;) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - t0) / MOTION_MS);
        apply(p);
        if (p >= 1) break;
      }
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    const renderer: SceneRenderer<QuantumSizeTradeoffScene> = { render, destroy };
    return renderer as unknown as ViewInstance;
  },
};
