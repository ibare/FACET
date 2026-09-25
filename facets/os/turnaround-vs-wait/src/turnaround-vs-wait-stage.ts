/**
 * turnaround-vs-wait 무대.
 *
 * 위: 시계 — 프로세스마다 도착에서 끝까지의 한 길이(반환)가 한 막대로 선다.
 * 아래: 갈라짐 — 그 막대가 내려와 도착을 한 자리(0)에 맞추고, 시작 틱에서 **대기 토막**과
 *       **실행 토막** 두 조각으로 벌어진다. 두 칸이 같은 축척이라 길이를 그대로 견줄 수 있다.
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
} from '@ffacet/core/runtime';
import type { SceneSplit, TurnaroundVsWaitScene } from './scene';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 상한만 둔다 — 실제 크기는 캔버스에서 역산한다. */
const ROW_T_MAX = 34;
const ROW_L_MAX = 72;
const GAP = 10;
const TRAVEL_MS = 600;
const CRACK_MS = 500;
const GROW_MS = 800;
const COMPARE_MS = 600;
const DIM = '0.3';

function r(v: number): string {
  const n = Math.round(v * 100) / 100;
  return String(n === 0 ? 0 : n);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function symbol(id: string): string {
  return id.toUpperCase();
}

type LedgerHandle = {
  group: SVGGElement;
  wait: SVGRectElement | null;
  run: SVGRectElement;
  reveal: SVGGElement;
  split: SceneSplit;
  arrival: number;
  barY: number;
  timelineBarY: number;
};

type Handles = {
  timelineBars: Map<string, SVGRectElement>;
  ledger: Map<string, LedgerHandle>;
  compareLine: SVGLineElement | null;
  compareSpan: { y1: number; y2: number } | null;
};

export const turnaroundVsWaitStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let handles: Handles = {
      timelineBars: new Map(),
      ledger: new Map(),
      compareLine: null,
      compareSpan: null,
    };

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string>,
      text?: string,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }

    /** 자리 셈 — 캔버스 폭과 세로에서 역산한다. */
    function layout(scene: TurnaroundVsWaitScene) {
      const n = scene.procs.length;
      const pad = 16;
      const nameX = pad;
      const x0 = pad + smPx * 3;
      const x1 = W - pad - 8;
      const span = scene.span ?? 0;
      const unit = span > 0 ? (x1 - x0) / span : 0;
      const clockHeaderY = 54;
      const tTop = 66;
      const rowT = Math.min(ROW_T_MAX, 110 / n);
      const axisY = tTop + n * rowT + 14;
      const ledgerHeaderY = axisY + 30;
      const lTop = ledgerHeaderY + 12;
      const rowL = Math.min(ROW_L_MAX, (H - 8 - lTop) / n);
      return { n, nameX, x0, x1, span, unit, clockHeaderY, tTop, rowT, axisY, ledgerHeaderY, lTop, rowL };
    }

    type Layout = ReturnType<typeof layout>;

    /** 대기 · 실행 토막의 가로 자리. g 는 두 토막 사이 틈. 전체 길이는 그대로다. */
    function pieces(L: Layout, split: SceneSplit, g: number) {
      const cut = L.x0 + split.wait * L.unit;
      const end = L.x0 + split.turnaround * L.unit;
      if (split.wait === 0) {
        return { wait: null, run: { x: L.x0, w: end - L.x0 } };
      }
      return {
        wait: { x: L.x0, w: cut - g / 2 - L.x0 },
        run: { x: cut + g / 2, w: end - cut - g / 2 },
      };
    }

    function caption(scene: TurnaroundVsWaitScene): string {
      const s = scene.step;
      if (s.kind === 'arrive') {
        return t('caption.arrive', 'Arrivals are on the clock. Nothing has run yet.');
      }
      if (s.kind === 'schedule') {
        const last = Math.max(...scene.runs.map((x) => x.end));
        return t('caption.schedule', 'Ran first come, first served. Last finish: tick {tick}.', {
          tick: last,
        });
      }
      if (s.kind === 'split') {
        const sp = scene.splits.find((x) => x.id === s.id);
        const p = scene.procs.find((x) => x.id === s.id);
        if (sp === undefined || p === undefined) {
          throw new Error(`turnaround-vs-wait 무대: 갈라진 ${s.id} 를 장면에서 못 찾는다`);
        }
        return t('caption.split', '{name} — turnaround {turnaround} = wait {wait} + run {run}.', {
          name: symbol(s.id),
          turnaround: sp.turnaround,
          wait: sp.wait,
          run: p.burst,
        });
      }
      const sx = scene.splits.find((x) => x.id === s.x);
      const sy = scene.splits.find((x) => x.id === s.y);
      if (sx === undefined || sy === undefined) {
        throw new Error('turnaround-vs-wait 무대: 견줄 짝이 아직 갈라지지 않았다');
      }
      return t('caption.compare', '{x} · {y} — turnaround {tx} · {ty}, wait {wx} · {wy}.', {
        x: symbol(s.x),
        y: symbol(s.y),
        tx: sx.turnaround,
        ty: sy.turnaround,
        wx: sx.wait,
        wy: sy.wait,
      });
    }

    function drawStatic(scene: TurnaroundVsWaitScene): void {
      svg.textContent = '';
      handles = { timelineBars: new Map(), ledger: new Map(), compareLine: null, compareSpan: null };
      const L = layout(scene);
      const pair = scene.pair;
      const inPair = (id: string) => pair === null || id === pair.x || id === pair.y;

      el(
        svg,
        'text',
        {
          x: r(L.nameX),
          y: '26',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        },
        caption(scene),
      );

      if (L.span === 0) return;

      // ── 시계
      el(
        svg,
        'text',
        {
          x: r(L.nameX),
          y: r(L.clockHeaderY),
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        },
        t('label.clock', 'Clock (ticks)'),
      );
      const grid = el(svg, 'g', {});
      for (let k = 0; k <= L.span; k += 1) {
        const x = L.x0 + k * L.unit;
        el(grid, 'line', {
          x1: r(x),
          x2: r(x),
          y1: r(L.tTop),
          y2: r(L.tTop + L.n * L.rowT),
          stroke: c.border,
          'stroke-width': '1',
        });
        el(
          grid,
          'text',
          {
            x: r(x),
            y: r(L.axisY),
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          String(k),
        );
      }

      const barHT = L.rowT * 0.5;
      scene.procs.forEach((p, i) => {
        const cy = L.tTop + (i + 0.5) * L.rowT;
        const row = el(svg, 'g', inPair(p.id) ? {} : { opacity: DIM });
        el(
          row,
          'text',
          {
            x: r(L.nameX),
            y: r(cy + smPx * 0.35),
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': '600',
            fill: c.text,
          },
          symbol(p.id),
        );
        const ax = L.x0 + p.arrival * L.unit;
        const barTop = cy - barHT / 2;
        // 도착 표 — 막대 위를 가리키는 세모
        el(row, 'path', {
          d: `M ${r(ax - 5)} ${r(barTop - 9)} L ${r(ax + 5)} ${r(barTop - 9)} L ${r(ax)} ${r(barTop - 2)} Z`,
          fill: c.text,
        });
        const run = scene.runs.find((x) => x.id === p.id);
        if (run === undefined) return;
        const bar = el(row, 'rect', {
          x: r(ax),
          y: r(barTop),
          width: r((run.end - p.arrival) * L.unit),
          height: r(barHT),
          rx: '3',
          fill: c.itemDefault,
          stroke: c.text,
          'stroke-width': '1.5',
        });
        handles.timelineBars.set(p.id, bar);
        const sx = L.x0 + run.start * L.unit;
        if (run.start > p.arrival) {
          el(row, 'line', {
            x1: r(sx),
            x2: r(sx),
            y1: r(barTop - 3),
            y2: r(barTop + barHT + 3),
            stroke: c.text,
            'stroke-width': '2',
          });
        }
      });

      // ── 갈라짐
      el(
        svg,
        'text',
        {
          x: r(L.nameX),
          y: r(L.ledgerHeaderY),
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        },
        t('label.split', 'Arrival to finish'),
      );
      const barH = Math.min(18, L.rowL * 0.3);
      scene.procs.forEach((p, i) => {
        const yTop = L.lTop + i * L.rowL;
        const barY = yTop + L.rowL * 0.38;
        const row = el(svg, 'g', inPair(p.id) ? {} : { opacity: DIM });
        const split = scene.splits.find((x) => x.id === p.id);
        el(
          row,
          'text',
          {
            x: r(L.nameX),
            y: r(barY + barH / 2 + smPx * 0.35),
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'font-weight': '600',
            fill: split === undefined ? c.textMuted : c.text,
          },
          symbol(p.id),
        );
        if (split === undefined) return;

        const group = el(row, 'g', {});
        const geo = pieces(L, split, GAP);
        const wait =
          geo.wait === null
            ? null
            : el(group, 'rect', {
                x: r(geo.wait.x),
                y: r(barY),
                width: r(geo.wait.w),
                height: r(barH),
                rx: '3',
                fill: c.itemComparing,
                stroke: c.itemComparing,
                'stroke-width': '1.5',
              });
        const runRect = el(group, 'rect', {
          x: r(geo.run.x),
          y: r(barY),
          width: r(geo.run.w),
          height: r(barH),
          rx: '3',
          fill: c.primary,
          stroke: c.primary,
          'stroke-width': '1.5',
        });

        // 전체(반환)를 묶는 꺾쇠와 두 토막의 이름표
        const reveal = el(group, 'g', {});
        const end = L.x0 + split.turnaround * L.unit;
        const braceY = barY - 6;
        el(reveal, 'path', {
          d: `M ${r(L.x0)} ${r(braceY)} L ${r(L.x0)} ${r(braceY - 5)} L ${r(end)} ${r(braceY - 5)} L ${r(end)} ${r(braceY)}`,
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': '1',
        });
        el(
          reveal,
          'text',
          {
            x: r((L.x0 + end) / 2),
            y: r(braceY - 9),
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          t('label.turnaround', 'Turnaround: {n}', { n: split.turnaround }),
        );
        const labelY = barY + barH + smPx + 2;
        el(
          reveal,
          'text',
          {
            x: r(geo.wait === null ? L.x0 : geo.wait.x + geo.wait.w / 2),
            y: r(labelY),
            'text-anchor': geo.wait === null ? 'start' : 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.text,
          },
          t('label.wait', 'Wait: {n}', { n: split.wait }),
        );
        el(
          reveal,
          'text',
          {
            x: r(geo.run.x + geo.run.w / 2),
            y: r(labelY),
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.text,
          },
          t('label.run', 'Run: {n}', { n: p.burst }),
        );

        handles.ledger.set(p.id, {
          group,
          wait,
          run: runRect,
          reveal,
          split,
          arrival: p.arrival,
          barY,
          timelineBarY: L.tTop + (i + 0.5) * L.rowT - barHT / 2,
        });
      });

      // 견줌 — 두 반환의 끝이 한 줄에 선다
      if (pair !== null) {
        const ix = scene.procs.findIndex((p) => p.id === pair.x);
        const iy = scene.procs.findIndex((p) => p.id === pair.y);
        const sx = scene.splits.find((x) => x.id === pair.x);
        if (ix < 0 || iy < 0 || sx === undefined) {
          throw new Error('turnaround-vs-wait 무대: 견줄 짝을 장면에서 못 찾는다');
        }
        const top = L.lTop + Math.min(ix, iy) * L.rowL + L.rowL * 0.38 - 12;
        const bottom = L.lTop + Math.max(ix, iy) * L.rowL + L.rowL * 0.38 + barH + 4;
        const x = L.x0 + sx.turnaround * L.unit;
        handles.compareSpan = { y1: top, y2: bottom };
        handles.compareLine = el(svg, 'line', {
          x1: r(x),
          x2: r(x),
          y1: r(top),
          y2: r(bottom),
          stroke: c.itemComparing,
          'stroke-width': '2',
          'stroke-dasharray': '5 4',
        });
      }
    }

    /** 한 시계로 흘린다. 끝나거나, 세대가 바뀌거나, 거두면 풀린다. */
    function tween(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const t0 = Date.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const step = () => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - t0) / ms);
          frame(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            step();
          }, 16);
          timers.add(id);
        };
        step();
      });
    }

    async function growBars(mine: number, scene: TurnaroundVsWaitScene): Promise<void> {
      const L = layout(scene);
      const targets = scene.procs.flatMap((p) => {
        const bar = handles.timelineBars.get(p.id);
        const run = scene.runs.find((x) => x.id === p.id);
        return bar === undefined || run === undefined
          ? []
          : [{ bar, w: (run.end - p.arrival) * L.unit }];
      });
      await tween(mine, GROW_MS, (p) => {
        for (const { bar, w } of targets) bar.setAttribute('width', r(w * p));
      });
    }

    async function splitMotion(mine: number, scene: TurnaroundVsWaitScene, id: string) {
      const h = handles.ledger.get(id);
      if (h === undefined) return;
      const L = layout(scene);
      const dx = h.arrival * L.unit;
      const dy = h.timelineBarY - h.barY;
      const place = (g: number) => {
        const geo = pieces(L, h.split, g);
        if (h.wait !== null && geo.wait !== null) {
          h.wait.setAttribute('x', r(geo.wait.x));
          h.wait.setAttribute('width', r(geo.wait.w));
        }
        h.run.setAttribute('x', r(geo.run.x));
        h.run.setAttribute('width', r(geo.run.w));
      };
      const paint = (fill: string, stroke: string, rect: SVGRectElement | null) => {
        if (rect === null) return;
        rect.setAttribute('fill', fill);
        rect.setAttribute('stroke', stroke);
      };
      // 1. 시계의 막대 자리에서 한 덩어리로 내려와 도착을 0 에 맞춘다
      place(0);
      paint(c.itemDefault, c.text, h.wait);
      paint(c.itemDefault, c.text, h.run);
      h.reveal.setAttribute('opacity', '0');
      await tween(mine, TRAVEL_MS, (p) => {
        h.group.setAttribute('transform', `translate(${r(dx * (1 - p))} ${r(dy * (1 - p))})`);
      });
      if (mine !== gen || destroyed) return;
      h.group.removeAttribute('transform');
      // 2. 시작 틱에서 두 토막으로 벌어진다
      paint(c.itemComparing, c.itemComparing, h.wait);
      paint(c.primary, c.primary, h.run);
      await tween(mine, CRACK_MS, (p) => {
        place(GAP * p);
        h.reveal.setAttribute('opacity', r(p));
      });
    }

    async function compareMotion(mine: number): Promise<void> {
      const line = handles.compareLine;
      const span = handles.compareSpan;
      if (line === null || span === null) return;
      await tween(mine, COMPARE_MS, (p) => {
        line.setAttribute('y2', r(span.y1 + (span.y2 - span.y1) * p));
      });
    }

    return {
      async render(
        next: TurnaroundVsWaitScene,
        _prev: TurnaroundVsWaitScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate) return;
        const s = next.step;
        if (s.kind === 'schedule') await growBars(mine, next);
        else if (s.kind === 'split') await splitMotion(mine, next, s.id);
        else if (s.kind === 'compare') await compareMotion(mine);
        else return;
        if (mine === gen && !destroyed) drawStatic(next);
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
