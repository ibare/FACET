/**
 * weighted-fair-share stage — 프로세스마다 가상 시간 줄기(꺾은선)와 받은 틱 막대.
 *
 * 주인공은 가로 틱 · 세로 가상 시간의 줄기 셋이다. 뽑힌 줄기만 한 계단 오르고 나머지는 눕는다.
 * 무거운 것의 계단이 낮아 줄기가 눕고, 늦게 온 줄기는 제 출발점(바닥 또는 무리의 높이)에서 나타난다.
 * 판이 바뀌면 앞 판의 줄기가 점선으로 남고 C 의 출발 표지가 앞 판의 자리에서 새 자리로 옮겨 간다.
 * CPU 차례는 줄기 아래 작은 띠로만 둔다.
 *
 * 세로 눈금은 판마다 흔들지 않는다 — algorithm 이 사다리 전 조합의 가장 큰 값(vTop)을 준다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 380;
const PLOT_L = 56;
const PLOT_R = 536;
const PLOT_T = 72;
const PLOT_B = 300;
const STRIP_Y = 310;
const STRIP_H = 10;
const PANEL_X = 596;
const PANEL_W = 114;

export type RoundSpec = {
  procs: string[];
  weights: number[];
  ticks: number;
  arriveAt: number;
  late: number;
  unit: number;
  vTop: number;
};

export type TickSpec = { tick: number; proc: number; vrs: number[]; present: number[]; ran: number[] };
export type ArriveSpec = { tick: number; proc: number; start: number };
export type ShareSpec = { first: number; firstB: number; pct: number };

/** projector 가 부르는 표면 — projector 는 이 타입으로 좁혀 쓴다. */
export type WeightedFairShareStage = {
  startRound(spec: RoundSpec, ms: number): Promise<void>;
  runTick(spec: TickSpec, ms: number): Promise<void>;
  arrive(spec: ArriveSpec, ms: number): Promise<void>;
  showShare(spec: ShareSpec, ms: number): Promise<void>;
  setCaption(main: string, sub: string): void;
  /** 되감기 — 앞 판의 흔적(점선 줄기 · C 의 출발 표지)까지 지운다. */
  reset(): void;
};

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

export const weightedFairShareStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const pal = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const smPx = parseFloat(fontSizes.sm);

    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    });

    const tween = (ms: number, draw: (p: number) => void): Promise<void> => {
      if (destroyed || ms <= 0 || isInstant()) {
        draw(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const t0 = Date.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          if (!destroyed) draw(1);
          resolve();
        };
        waiters.add(finish);
        const frame = () => {
          if (done || destroyed) return;
          const p = (Date.now() - t0) / ms;
          if (p >= 1) return finish();
          draw(ease(p));
          if (typeof requestAnimationFrame === 'function') frames.add(requestAnimationFrame(frame));
        };
        if (typeof requestAnimationFrame === 'function') frames.add(requestAnimationFrame(frame));
        const tm = setTimeout(() => {
          timers.delete(tm);
          finish();
        }, ms);
        timers.add(tm);
      });
    };

    const text = (x: number, y: number, attrs: Record<string, string | number> = {}): SVGTextElement =>
      el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: pal.text, ...attrs });

    // ── 층
    const captionMain = text(PLOT_L - 40, 22, { 'font-size': fontSizes.md, 'font-weight': 600 });
    const captionSub = text(PLOT_L - 40, 44, { fill: pal.textMuted });
    const axisLayer = el('g', {});
    const ghostLayer = el('g', {});
    const lineLayer = el('g', {});
    const stripLayer = el('g', {});
    const markLayer = el('g', {});
    const panelLayer = el('g', {});
    svg.append(captionMain, captionSub, axisLayer, stripLayer, ghostLayer, lineLayer, markLayer, panelLayer);

    // ── 판의 상태
    let spec: RoundSpec | null = null;
    let colors: readonly string[] = [];
    let top = 1;
    let cw = 1;
    let pts: [number, number][][] = [];
    let ran: number[] = [];
    let lines: SVGPolylineElement[] = [];
    let ghosts: SVGPolylineElement[] = [];
    let heads: SVGCircleElement[] = [];
    let headLabels: SVGTextElement[] = [];
    let bars: SVGRectElement[] = [];
    let counts: SVGTextElement[] = [];
    let weightTexts: SVGTextElement[] = [];
    let cells: SVGRectElement[] = [];
    let startMark: SVGCircleElement | null = null;
    let startMarkV: number | null = null;
    let ghostLegend: SVGTextElement | null = null;
    let bracket: SVGRectElement | null = null;
    let shareLabel: SVGTextElement | null = null;
    let sharePct: SVGTextElement | null = null;
    let layoutKey = '';

    const xOf = (tick: number) => PLOT_L + tick * cw;
    const yOf = (v: number) => PLOT_B - (v / top) * (PLOT_B - PLOT_T);
    const barW = (n: number) => (spec === null ? 0 : (n / spec.ticks) * PANEL_W);
    const nameOf = (id: string) => id.toUpperCase();

    function need<T>(value: T | null, what: string): T {
      if (value === null) throw new Error(`weighted-fair-share-stage: ${what} 가 아직 없다 — startRound 가 먼저다`);
      return value;
    }

    function build(s: RoundSpec): void {
      for (const layer of [axisLayer, ghostLayer, lineLayer, stripLayer, markLayer, panelLayer]) {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
      }
      const n = s.procs.length;
      colors = categorical(n, 'vivid');
      cw = (PLOT_R - PLOT_L) / s.ticks;
      const grid = 2 * s.unit;
      top = Math.max(grid, Math.ceil(s.vTop / grid) * grid);

      // 눈금
      for (let v = 0; v <= top; v += grid) {
        const label = text(PLOT_L - 6, yOf(v) + smPx / 3, { 'text-anchor': 'end', fill: pal.textMuted, 'font-size': fontSizes.xs });
        label.textContent = String(v);
        axisLayer.append(
          el('line', { x1: PLOT_L, x2: PLOT_R, y1: yOf(v), y2: yOf(v), stroke: pal.border, 'stroke-width': v === 0 ? 1.5 : 1 }),
          label,
        );
      }
      for (let k = 0; k <= s.ticks; k += 4) {
        const label = text(xOf(k), STRIP_Y + STRIP_H + 16, { 'text-anchor': 'middle', fill: pal.textMuted, 'font-size': fontSizes.xs });
        label.textContent = String(k);
        axisLayer.append(label);
      }
      const vLabel = text(PLOT_L, PLOT_T - 10, { fill: pal.textMuted, 'font-size': fontSizes.xs });
      vLabel.textContent = t('label.vtime', 'virtual time');
      const tLabel = text(PLOT_R, STRIP_Y + STRIP_H + 32, { fill: pal.textMuted, 'font-size': fontSizes.xs, 'text-anchor': 'end' });
      tLabel.textContent = t('label.tick', 'tick');
      const arriveLine = el('line', {
        x1: xOf(s.arriveAt), x2: xOf(s.arriveAt), y1: PLOT_T, y2: STRIP_Y + STRIP_H,
        stroke: colors[s.late], 'stroke-dasharray': '3 3', 'stroke-width': 1,
      });
      const arriveLabel = text(xOf(s.arriveAt), PLOT_T - 10, { 'text-anchor': 'middle', fill: colors[s.late], 'font-weight': 600 });
      arriveLabel.textContent = nameOf(s.procs[s.late]);
      axisLayer.append(vLabel, tLabel, arriveLine, arriveLabel);

      ghostLegend = text(PLOT_R, PLOT_T - 10, { 'text-anchor': 'end', fill: pal.textMuted, 'font-size': fontSizes.xs, visibility: 'hidden' });
      ghostLegend.textContent = t('label.ghost', 'dashed: previous run');
      axisLayer.append(ghostLegend);

      // 차례 띠
      cells = [];
      stripLayer.append(el('rect', { x: PLOT_L, y: STRIP_Y, width: PLOT_R - PLOT_L, height: STRIP_H, fill: pal.bgSubtle }));
      for (let k = 0; k < s.ticks; k += 1) {
        const cell = el('rect', { x: xOf(k), y: STRIP_Y, width: 0, height: STRIP_H, fill: pal.bgSubtle });
        cells.push(cell);
        stripLayer.append(cell);
      }
      bracket = el('rect', { x: PLOT_L, y: STRIP_Y - 3, width: 0, height: STRIP_H + 6, fill: 'none', stroke: pal.text, 'stroke-width': 1.5, rx: 2 });
      stripLayer.append(bracket);

      // 줄기
      ghosts = s.procs.map((_, i) => el('polyline', { points: '', fill: 'none', stroke: colors[i], 'stroke-width': 1.5, 'stroke-dasharray': '4 3', opacity: 0.4 }));
      lines = s.procs.map((_, i) => el('polyline', { points: '', fill: 'none', stroke: colors[i], 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
      heads = s.procs.map((_, i) => el('circle', { cx: PLOT_L, cy: PLOT_B, r: 0, fill: colors[i] }));
      headLabels = s.procs.map((_, i) => text(PLOT_R + 8, PLOT_B, { fill: colors[i], 'font-weight': 600, visibility: 'hidden' }));
      ghostLayer.append(...ghosts);
      lineLayer.append(...lines);
      startMark = el('circle', { cx: xOf(s.arriveAt), cy: PLOT_B, r: 6, fill: 'none', stroke: colors[s.late], 'stroke-width': 2, visibility: 'hidden' });
      startMarkV = null;
      markLayer.append(startMark, ...heads, ...headLabels);

      // 받은 틱 막대
      const title = text(PANEL_X, PLOT_T - 10, { fill: pal.textMuted, 'font-size': fontSizes.xs });
      title.textContent = t('label.received', 'Ticks received');
      panelLayer.append(title);
      bars = [];
      counts = [];
      weightTexts = [];
      s.procs.forEach((id, i) => {
        const y = PLOT_T + 6 + i * 44;
        const name = text(PANEL_X, y + 10, { fill: colors[i], 'font-weight': 600 });
        name.textContent = nameOf(id);
        const wText = text(PANEL_X + 16, y + 10, { fill: pal.textMuted, 'font-size': fontSizes.xs });
        const count = text(PANEL_X + PANEL_W, y + 10, { 'text-anchor': 'end', 'font-weight': 600 });
        count.textContent = '0';
        const track = el('rect', { x: PANEL_X, y: y + 16, width: PANEL_W, height: 10, fill: pal.bgSubtle, rx: 2 });
        const bar = el('rect', { x: PANEL_X, y: y + 16, width: 0, height: 10, fill: colors[i], rx: 2 });
        panelLayer.append(name, wText, count, track, bar);
        bars.push(bar);
        counts.push(count);
        weightTexts.push(wText);
      });
      shareLabel = text(PANEL_X, PLOT_T + 6 + s.procs.length * 44 + 14, { fill: pal.textMuted, 'font-size': fontSizes.xs, visibility: 'hidden' });
      sharePct = text(PANEL_X, PLOT_T + 6 + s.procs.length * 44 + 42, { 'font-size': fontSizes.xl, 'font-weight': 700, fill: colors[1] ?? pal.text, visibility: 'hidden' });
      panelLayer.append(shareLabel, sharePct);

      pts = s.procs.map(() => []);
      ran = s.procs.map(() => 0);
    }

    const pointsOf = (list: [number, number][]) => list.map(([k, v]) => `${xOf(k)},${yOf(v)}`).join(' ');

    /** 머리 글자를 줄기 끝 높이에 두되 서로 겹치지 않게 민다. */
    function placeLabels(headY: (number | null)[]): void {
      const order = headY
        .map((y, i) => ({ y, i }))
        .filter((e): e is { y: number; i: number } => e.y !== null)
        .sort((a, b) => a.y - b.y || a.i - b.i);
      let prev = -Infinity;
      for (const e of order) {
        const y = Math.max(e.y + smPx / 3, prev + smPx + 2);
        headLabels[e.i].setAttribute('y', String(y));
        prev = y;
      }
    }

    function drawHeads(pos: ([number, number] | null)[]): void {
      pos.forEach((p, i) => {
        if (p === null) {
          heads[i].setAttribute('r', '0');
          headLabels[i].setAttribute('visibility', 'hidden');
          return;
        }
        heads[i].setAttribute('cx', String(xOf(p[0])));
        heads[i].setAttribute('cy', String(yOf(p[1])));
        heads[i].setAttribute('r', '4');
        headLabels[i].setAttribute('visibility', 'visible');
        headLabels[i].textContent = `${nameOf(need(spec, 'spec').procs[i])} ${Math.round(p[1])}`;
      });
      placeLabels(pos.map((p) => (p === null ? null : yOf(p[1]))));
    }

    const lastOf = (i: number): [number, number] | null => {
      const list = pts[i];
      return list.length === 0 ? null : list[list.length - 1];
    };

    const api: WeightedFairShareStage = {
      async startRound(s, ms) {
        const key = `${s.procs.join(',')}|${s.ticks}|${s.arriveAt}|${s.unit}|${s.vTop}`;
        const hadRun = spec !== null && pts.some((list) => list.length > 1);
        if (key !== layoutKey) {
          build(s);
          layoutKey = key;
        } else if (hadRun) {
          // 앞 판의 줄기를 점선으로 남긴다.
          pts.forEach((list, i) => ghosts[i].setAttribute('points', pointsOf(list)));
          ghostLegend?.setAttribute('visibility', 'visible');
        }
        spec = s;
        s.weights.forEach((w, i) => {
          weightTexts[i].textContent = t('label.weightOf', 'weight {w}', { w });
        });
        const fromRan = [...ran];
        const oldCells = cells.map((c) => Number(c.getAttribute('width')));
        const oldBracket = Number(bracket?.getAttribute('width') ?? 0);
        shareLabel?.setAttribute('visibility', 'hidden');
        sharePct?.setAttribute('visibility', 'hidden');
        startMark?.setAttribute('opacity', '0.4');
        pts = s.procs.map((_, i): [number, number][] => (i === s.late ? [] : [[0, 0]]));
        ran = s.procs.map(() => 0);
        lines.forEach((line, i) => line.setAttribute('points', pointsOf(pts[i])));
        drawHeads(s.procs.map((_, i) => lastOf(i)));
        // 앞 판의 막대와 띠가 줄어 비워진다.
        await tween(ms, (p) => {
          fromRan.forEach((r, i) => {
            bars[i].setAttribute('width', String(barW(r * (1 - p))));
            counts[i].textContent = String(Math.round(r * (1 - p)));
          });
          cells.forEach((c, k) => c.setAttribute('width', String(oldCells[k] * (1 - p))));
          bracket?.setAttribute('width', String(oldBracket * (1 - p)));
        });
      },

      async runTick(s, ms) {
        const cur = need(spec, 'spec');
        if (s.vrs.length !== cur.procs.length || s.ran.length !== cur.procs.length) {
          throw new Error('weighted-fair-share-stage: 틱의 값 수가 프로세스 수와 다르다');
        }
        const from = cur.procs.map((_, i) => {
          if (s.present[i] !== 1) return null;
          const last = lastOf(i);
          if (last === null) throw new Error(`weighted-fair-share-stage: 와 있는 ${i} 의 줄기가 없다`);
          return last[1];
        });
        const fromRan = [...ran];
        const cell = cells[s.tick];
        if (cell === undefined) throw new Error(`weighted-fair-share-stage: 틱 ${s.tick} 이 판 밖이다`);
        cell.setAttribute('fill', colors[s.proc]);
        await tween(ms, (p) => {
          const pos = from.map((v, i) => (v === null ? null : ([s.tick + p, v + (s.vrs[i] - v) * p] as [number, number])));
          pos.forEach((head, i) => {
            if (head === null) return;
            lines[i].setAttribute('points', pointsOf([...pts[i], head]));
          });
          drawHeads(pos);
          s.ran.forEach((r, i) => {
            const now = fromRan[i] + (r - fromRan[i]) * p;
            bars[i].setAttribute('width', String(barW(now)));
          });
          cell.setAttribute('width', String(cw * p));
        });
        from.forEach((v, i) => {
          if (v !== null) pts[i].push([s.tick + 1, s.vrs[i]]);
        });
        ran = [...s.ran];
        ran.forEach((r, i) => {
          counts[i].textContent = String(r);
        });
      },

      async arrive(s, ms) {
        const cur = need(spec, 'spec');
        const mark = need(startMark, 'startMark');
        const fromV = startMarkV;
        mark.setAttribute('visibility', 'visible');
        mark.setAttribute('opacity', '1');
        mark.setAttribute('cx', String(xOf(s.tick)));
        pts[s.proc] = [[s.tick, s.start]];
        // 앞 판의 출발점에서 새 출발점으로 옮겨 간다. 처음이면 제자리에서 돋는다.
        await tween(ms, (p) => {
          const v = fromV === null ? s.start : fromV + (s.start - fromV) * p;
          mark.setAttribute('cy', String(yOf(v)));
          mark.setAttribute('r', String(fromV === null ? 6 * p : 6));
          const pos = cur.procs.map((_, i) => lastOf(i));
          pos[s.proc] = [s.tick, v];
          drawHeads(pos);
        });
        startMarkV = s.start;
        lines[s.proc].setAttribute('points', pointsOf(pts[s.proc]));
      },

      async showShare(s, ms) {
        const cur = need(spec, 'spec');
        const label = need(shareLabel, 'shareLabel');
        const pct = need(sharePct, 'sharePct');
        label.textContent = t('label.shareOf', '{name} · first {n} ticks', { name: nameOf(cur.procs[1]), n: s.first });
        label.setAttribute('visibility', 'visible');
        pct.setAttribute('visibility', 'visible');
        await tween(ms, (p) => {
          bracket?.setAttribute('width', String(cw * s.first * p));
          pct.textContent = `${Math.round(s.pct * p)}%`;
        });
        pct.textContent = `${s.pct}%`;
      },

      reset() {
        for (const layer of [axisLayer, ghostLayer, lineLayer, stripLayer, markLayer, panelLayer]) {
          while (layer.firstChild) layer.removeChild(layer.firstChild);
        }
        spec = null;
        layoutKey = '';
        pts = [];
        ran = [];
        captionMain.textContent = '';
        captionSub.textContent = '';
      },

      setCaption(main, sub) {
        captionMain.textContent = main;
        captionSub.textContent = sub;
      },
    };

    return {
      ...api,
      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        for (const id of timers) clearTimeout(id);
        for (const wake of [...waiters]) wake();
        frames.clear();
        timers.clear();
        waiters.clear();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
  },
};
