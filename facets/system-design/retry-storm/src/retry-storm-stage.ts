/**
 * retry-storm stage — 왼쪽은 다음 틱에 다시 올 무더기, 오른쪽은 틱마다 서버에 몰린 요청의 칸.
 *
 * 걸음마다 두 운동이 한 시계로 흐른다.
 *   1. 무더기의 요청과 새 요청이 이번 틱의 칸으로 모여 받는 차례대로 쌓인다
 *   2. 감당을 넘거나 끊긴 틱에 실패한 요청이 칸을 떠나 무더기로 돌아간다 (칸에는 빈 고리가 남는다)
 * 끊긴 동안 무더기가 불어나고, 살아난 틱에 그것이 한꺼번에 칸으로 덮치는 것이 동사다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { RetryStormScene } from './scene';

const H = 410;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 12;
const LEGEND_Y = 18;
const CHART_TOP = 64;
const BASE_Y = 300;
const TICK_LABEL_Y = BASE_Y + 22;
const CAPTION_Y = [352, 374, 396] as const;
const PILE_RIGHT = 156;
const CHART_LEFT = 176;
const PILE_COLS = 4;
const MAX_PITCH = 18;
const GATHER_MS = 320;
const RETURN_MS = 300;
const FRAME_MS = 16;

type Layout = {
  pitch: number;
  r: number;
  colW: number;
  chartRight: number;
  pileCx: number;
};

function round(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function layoutOf(scene: RetryStormScene): Layout | null {
  if (scene.maxLoad === null) return null;
  const chartRight = PIECE_CANVAS_W - PAD;
  const pitch = Math.min(MAX_PITCH, (BASE_Y - CHART_TOP) / scene.maxLoad);
  return {
    pitch,
    r: pitch * 0.36,
    colW: (chartRight - CHART_LEFT) / scene.ticks,
    chartRight,
    pileCx: (PAD + PILE_RIGHT) / 2,
  };
}

function colX(L: Layout, tick: number): number {
  return CHART_LEFT + (tick + 0.5) * L.colW;
}

function slotY(L: Layout, k: number): number {
  return BASE_Y - L.pitch / 2 - k * L.pitch;
}

function pileXY(L: Layout, j: number): { x: number; y: number } {
  const col = j % PILE_COLS;
  const row = Math.floor(j / PILE_COLS);
  return { x: L.pileCx + (col - (PILE_COLS - 1) / 2) * L.pitch, y: BASE_Y - L.pitch / 2 - row * L.pitch };
}

/** 글자 폭 어림 — 토큰 크기에서 셈한다 */
function textWidth(s: string, px: number): number {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) > 0x2e80 ? px : px * 0.58;
  return w;
}

export const retryStormStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const smPx = parseFloat(fontSizes.sm);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    // 운동이 손대는 손잡이 — drawStatic 이 매번 새로 짓는다
    let columnDots = new Map<string, SVGElement>();
    let pileDots = new Map<string, SVGElement>();
    let overlay: SVGGElement | null = null;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      s: string,
      x: number,
      y: number,
      opts: { size: string; fill: string; anchor?: string; weight?: string },
      parent: Element,
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': fonts.body,
          'font-size': opts.size,
          fill: opts.fill,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = s;
      return node;
    }

    function drawLegend(root: Element, scene: RetryStormScene): void {
      const items: { text: string; kind: 'fresh' | 'retry' | 'failed' }[] = [
        { text: t('label.fresh', 'New request'), kind: 'fresh' },
        { text: t('label.retry', 'Retried request'), kind: 'retry' },
        { text: t('label.failed', 'Failed'), kind: 'failed' },
      ];
      let x = PAD;
      for (const item of items) {
        if (item.kind === 'failed') {
          el('circle', { cx: x + 5, cy: LEGEND_Y - 4, r: 4.4, fill: 'none', stroke: colors.danger, 'stroke-width': 1.6 }, root);
        } else {
          el('circle', { cx: x + 5, cy: LEGEND_Y - 4, r: 5, fill: item.kind === 'retry' ? colors.itemComparing : colors.primary }, root);
        }
        label(item.text, x + 14, LEGEND_Y, { size: fontSizes.sm, fill: colors.text }, root);
        x += 14 + textWidth(item.text, smPx) + 18;
      }
      const last = scene.columns[scene.columns.length - 1];
      const down = last !== undefined && last.down;
      label(
        down ? t('label.down', 'Server: down') : t('label.up', 'Server: up'),
        PIECE_CANVAS_W - PAD,
        LEGEND_Y,
        { size: fontSizes.md, fill: down ? colors.danger : colors.text, anchor: 'end', weight: '600' },
        root,
      );
    }

    function drawCaption(root: Element, scene: RetryStormScene): void {
      const step = scene.step;
      const lines: string[] = [];
      if (step.kind === 'start') {
        lines.push(t('caption.start', 'Server up · capacity per tick: {cap}.', { cap: scene.capacity }));
        lines.push(t('caption.startNone', 'No requests have arrived yet.'));
      } else {
        const load = step.retry.length + step.fresh.length;
        if (step.down) {
          lines.push(t('caption.down', 'Tick {tick} · server down — everything that arrives fails.', { tick: step.tick }));
          lines.push(
            t('caption.loadDown', 'Load {load} = new {fresh} + retried {retry} → served {served} · failed {failed}', {
              load,
              fresh: step.fresh.length,
              retry: step.retry.length,
              served: step.served,
              failed: step.failed.length,
            }),
          );
        } else {
          if (step.recovered) {
            lines.push(t('caption.recovered', 'Tick {tick} · the server is back up — the pile rushes in all at once.', { tick: step.tick }));
          } else {
            lines.push(t('caption.up', 'Tick {tick} · server up.', { tick: step.tick }));
          }
          lines.push(
            t('caption.loadUp', 'Load {load} = new {fresh} + retried {retry} · capacity {cap} → served {served} · failed {failed}', {
              load,
              fresh: step.fresh.length,
              retry: step.retry.length,
              cap: scene.capacity,
              served: step.served,
              failed: step.failed.length,
            }),
          );
        }
        if (step.last !== null) {
          lines.push(
            t('caption.settled', 'Ticks still failing after recovery: {ticks} · their failures: {sum}', {
              ticks: step.last.afterTicks,
              sum: step.last.afterFailed,
            }),
          );
        }
      }
      lines.forEach((s, i) => {
        const y = CAPTION_Y[i];
        if (y === undefined) throw new Error(`retry-storm stage: 캡션 줄 ${i} 의 자리가 없다`);
        label(s, PAD, y, { size: i === 0 ? fontSizes.md : fontSizes.sm, fill: i === 0 ? colors.text : colors.textMuted, weight: i === 0 ? '600' : 'normal' }, root);
      });
    }

    function drawStatic(scene: RetryStormScene): void {
      svg.textContent = '';
      columnDots = new Map();
      pileDots = new Map();
      overlay = null;
      const root = el('g', {}, svg);
      drawLegend(root, scene);
      drawCaption(root, scene);

      const L = layoutOf(scene);
      const chartRight = PIECE_CANVAS_W - PAD;
      const colW = (chartRight - CHART_LEFT) / scene.ticks;
      const current = scene.step.kind === 'tick' ? scene.step.tick : null;

      // 무더기 쟁반
      el('rect', { x: PAD, y: CHART_TOP + 26, width: PILE_RIGHT - PAD, height: BASE_Y - CHART_TOP - 26, rx: 6, fill: colors.bgSubtle }, root);
      label(t('label.pile', 'Coming back next tick'), (PAD + PILE_RIGHT) / 2, CHART_TOP - 4, { size: fontSizes.xs, fill: colors.textMuted, anchor: 'middle' }, root);
      label(String(scene.pile.length), (PAD + PILE_RIGHT) / 2, CHART_TOP + 16, { size: fontSizes.lg, fill: colors.text, anchor: 'middle', weight: '600' }, root);

      // 틱 칸 — 지금 틱은 옅게 깔고, 끊긴 틱은 붉게 물들인다
      for (let tick = 0; tick < scene.ticks; tick += 1) {
        const x0 = CHART_LEFT + tick * colW;
        const col = scene.columns[tick];
        if (tick === current) {
          el('rect', { x: x0 + 2, y: CHART_TOP - 20, width: colW - 4, height: BASE_Y - CHART_TOP + 20, rx: 4, fill: colors.bgSubtle }, root);
        }
        if (col !== undefined && col.down) {
          el('rect', { x: x0 + 2, y: CHART_TOP - 20, width: colW - 4, height: BASE_Y - CHART_TOP + 20, rx: 4, fill: colors.danger, 'fill-opacity': 0.08 }, root);
          el('rect', { x: x0 + 2, y: BASE_Y + 3, width: colW - 4, height: 5, rx: 2, fill: colors.danger }, root);
        }
        label(String(tick), x0 + colW / 2, TICK_LABEL_Y, {
          size: fontSizes.xs,
          fill: tick === current ? colors.text : colors.textMuted,
          anchor: 'middle',
          weight: tick === current ? '600' : 'normal',
        }, root);
      }
      label(t('label.tick', 'Tick'), CHART_LEFT - 6, TICK_LABEL_Y, { size: fontSizes.xs, fill: colors.textMuted, anchor: 'end' }, root);
      el('line', { x1: PAD, y1: BASE_Y, x2: chartRight, y2: BASE_Y, stroke: colors.border, 'stroke-width': 1 }, root);

      if (L === null) return;

      // 감당 선
      const capY = BASE_Y - scene.capacity * L.pitch;
      el('line', { x1: CHART_LEFT, y1: capY, x2: chartRight, y2: capY, stroke: colors.text, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }, root);
      label(t('label.capacity', 'Capacity: {n}', { n: scene.capacity }), CHART_LEFT + 4, capY - 5, { size: fontSizes.xs, fill: colors.text }, root);

      // 칸마다 몰린 요청 — 받는 차례로 아래에서 위로
      for (const col of scene.columns) {
        const cx = colX(L, col.tick);
        col.arrivals.forEach((a, k) => {
          const cy = slotY(L, k);
          const dot = a.served
            ? el('circle', { cx, cy, r: L.r, fill: a.retry ? colors.itemComparing : colors.primary }, root)
            : el('circle', { cx, cy, r: L.r - 0.8, fill: 'none', stroke: colors.danger, 'stroke-width': 1.6 }, root);
          if (col.tick === current) columnDots.set(a.id, dot);
        });
        label(String(col.arrivals.length), cx, slotY(L, col.arrivals.length - 1) - L.pitch / 2 - 4, {
          size: fontSizes.xs,
          fill: col.tick === current ? colors.text : colors.textMuted,
          anchor: 'middle',
          weight: col.tick === current ? '600' : 'normal',
        }, root);
      }

      // 다음 틱에 다시 올 무더기
      scene.pile.forEach((id, j) => {
        const p = pileXY(L, j);
        pileDots.set(id, el('circle', { cx: p.x, cy: p.y, r: L.r, fill: colors.itemComparing }, root));
      });

      overlay = el('g', {}, svg);
    }

    function wait(ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const frames = Math.max(1, Math.ceil(ms / FRAME_MS));
        let i = 0;
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const next = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          i += 1;
          frame(ease(i / frames));
          if (i >= frames) {
            finish();
            return;
          }
          const h = setTimeout(() => {
            timers.delete(h);
            next();
          }, FRAME_MS);
          timers.add(h);
        };
        const h0 = setTimeout(() => {
          timers.delete(h0);
          next();
        }, FRAME_MS);
        timers.add(h0);
      });
    }

    type Mover = { node: SVGCircleElement; x0: number; y0: number; x1: number; y1: number };

    function move(movers: Mover[], p: number): void {
      for (const m of movers) {
        m.node.setAttribute('cx', String(round(m.x0 + (m.x1 - m.x0) * p)));
        m.node.setAttribute('cy', String(round(m.y0 + (m.y1 - m.y0) * p)));
      }
    }

    async function play(next: RetryStormScene, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind !== 'tick') return;
      const L = layoutOf(next);
      if (L === null) throw new Error('retry-storm stage: 축척 없이 tick 장면이 왔다');
      const col = next.columns[step.tick];
      if (col === undefined) throw new Error(`retry-storm stage: 틱 ${step.tick} 의 칸이 장면에 없다`);
      const layer = overlay;
      if (layer === null) throw new Error('retry-storm stage: 운동 층이 없다');
      const cx = colX(L, step.tick);
      const retryIndex = new Map(step.retry.map((id, i) => [id, i]));

      // 1. 모여든다 — 무더기에서, 그리고 위에서 새 요청이
      const gather: Mover[] = col.arrivals.map((a, k) => {
        const target = columnDots.get(a.id);
        if (!target) throw new Error(`retry-storm stage: 칸의 ${a.id} 손잡이가 없다`);
        target.setAttribute('visibility', 'hidden');
        let x0 = cx;
        let y0 = CHART_TOP - 30;
        if (a.retry) {
          const i = retryIndex.get(a.id);
          if (i === undefined) throw new Error(`retry-storm stage: 다시 온 ${a.id} 의 무더기 자리가 없다`);
          const p = pileXY(L, i);
          x0 = p.x;
          y0 = p.y;
        }
        const node = el('circle', { cx: x0, cy: y0, r: L.r, fill: a.retry ? colors.itemComparing : colors.primary }, layer);
        return { node, x0, y0, x1: cx, y1: slotY(L, k) };
      });
      for (const id of step.failed) {
        const dot = pileDots.get(id);
        if (!dot) throw new Error(`retry-storm stage: 무더기의 ${id} 손잡이가 없다`);
        dot.setAttribute('visibility', 'hidden');
      }
      await wait(GATHER_MS, (p) => {
        if (mine === gen && !destroyed) move(gather, p);
      });
      if (mine !== gen || destroyed) return;
      for (const m of gather) m.node.remove();
      for (const dot of columnDots.values()) dot.removeAttribute('visibility');

      // 2. 실패한 것이 무더기로 돌아간다 — 칸에는 빈 고리가 남는다
      if (step.failed.length === 0) return;
      const back: Mover[] = step.failed.map((_id, j) => {
        const k = step.served + j;
        const p = pileXY(L, j);
        const node = el('circle', { cx, cy: slotY(L, k), r: L.r, fill: colors.itemComparing }, layer);
        return { node, x0: cx, y0: slotY(L, k), x1: p.x, y1: p.y };
      });
      await wait(RETURN_MS, (p) => {
        if (mine === gen && !destroyed) move(back, p);
      });
    }

    return {
      async render(next: RetryStormScene, prev: RetryStormScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step.kind !== 'tick' || prev === null) return;
        await play(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const h of timers) clearTimeout(h);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
